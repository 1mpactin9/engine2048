# engine2048

A 2048 expectimax engine: bitboard board representation, precomputed move/heuristic
lookup tables, and a **bounded in-memory transposition table** for caching repeated
subtree evaluations. Nothing is precomputed to disk and nothing is shipped as a
database — every position is scored live; only the current process's cache speeds
up later, related calculations.

## Design, and a correction

Both reference repos provided use the same bitboard/row-table trick:

- `2048-ai` (nneonneo): expectimax search to a **fixed depth**
  (`max(3, distinct_tiles - 2)`), a heuristic evaluator (monotonicity, merges,
  empty cells, tile sum), and an `unordered_map` transposition table. No time
  budget of any kind — it just runs to completion, deterministically, every time.
- `2048EndgameTablebase`: same low-level board representation, but its actual
  strategy is a precomputed **endgame tablebase** (`BookBuilder`, `L3Manager`,
  pattern-database probes) — a multi-GB database built ahead of time. That's
  the part explicitly avoided here.

**This engine now matches nneonneo's fixed-depth design exactly** (plus a
bounded cache instead of an unbounded one — see below). That wasn't true of an
earlier version, and it's worth explaining why, since it affected every
benchmark run before this correction:

An earlier version replaced the fixed depth with **wall-clock time-budgeted
iterative deepening**, based on one early test where fixed depth appeared to
hang. Under closer, controlled testing this turned out to be a mistake on two
counts: fixed depth is not actually catastrophic (the real cost only grows
sharply at 10+ distinct tiles, and even then it's seconds per move, not an
unbounded hang), and — much worse — **the time-budget approach made search
depth depend on wall-clock timing**, so the *same seed could produce a
different game on different runs*. This was confirmed directly: running the
identical command twice produced different win rates (e.g. one config showed
100%, then 40%, then 70% win rate across three "identical" 10-game runs).
Every benchmark comparison made under that design was contaminated by this
noise, which is why results kept contradicting each other.

The fix: search is fixed-depth again, exactly like nneonneo, with a
`--max-depth` hard ceiling (default 8) purely as a safety valve for the rare
board with many distinct tiles and multiple empty cells, where depth continues
to cost roughly 5-8x per additional ply. This is now **fully deterministic**:
the same board always produces the same search and the same move, verified by
a dedicated test (`test_determinism` in `tests/test_correctness.cpp`) and by
running full games twice and diffing the output byte-for-byte.

What's kept from the redesign, because it's a genuine improvement over the
original and doesn't reintroduce non-determinism:

- **Bounded cache.** The original's `unordered_map` grows without limit for
  the whole game. This engine uses a fixed-size, direct-mapped hash table
  (`--tt-bits`, default `2^22` entries ≈ 32MB) with a depth-aware replacement
  policy, so memory is bounded and predictable regardless of game length —
  and it's still just a lookup table, so it doesn't affect which move gets
  chosen for a given search, only how fast repeated positions get scored.
- **Configurable heuristic weights**, including an optional corner/snake term
  (see below) — off by default, matching the original's behavior exactly when
  `corner_weight=0`.

## Structure

```
engine2048/
  include/
    board.h                 bitboard packing, transforms, move enum
    tables.h                precomputed 65536-entry move/heuristic tables
    weights.h                configurable heuristic weight struct
    transposition_table.h    bounded direct-mapped evaluation cache
    engine.h                 fixed-depth expectimax search (deterministic)
    simulate.h                self-play / RNG / game-loop helpers
  src/
    main.cpp                 CLI: run N self-play games with a given config
  configs/
    presets.json              named test configurations (see below)
  scripts/
    build.sh                  compiles ./engine2048 and runs correctness tests
    benchmark.py               runs presets and prints a comparison table
  tests/
    test_correctness.cpp      board mechanics, cache, and determinism checks
```

## Build

```
./scripts/build.sh
```

Requires a C++17 compiler (g++ or clang++). No external dependencies. This
also builds and runs `tests/test_correctness`, which should print all `ok:`
lines and `0 failure(s)`.

## Run a single configuration

```
./engine2048 --games 5 --max-depth 8 --tt-bits 22 --verbose
./engine2048 --help          # full list of flags
```

Key flags:

| Flag | Meaning | Default |
|---|---|---|
| `--games N` | number of self-play games | 10 |
| `--seed N` | base RNG seed (game i uses seed+i); same seed always gives the same game now | 1 |
| `--tt-bits N` | transposition table size = `2^N` entries | 22 |
| `--cache-depth-limit N` | max search depth eligible for caching | 15 |
| `--min-depth N` / `--depth-bias N` | search depth = `max(min_depth, distinct_tiles - depth_bias)` | 3 / 2 (nneonneo's exact values) |
| `--max-depth N` | hard ceiling on search depth, for the rare high-distinct-tile board | 8 |
| `--no-cache` | disable the transposition table entirely (for A/B comparison) | off |
| `--lost-penalty/--mono-power/--mono-weight/--sum-power/--sum-weight/--merges-weight/--empty-weight` | heuristic weights | nneonneo's exact original values |
| `--corner-weight` | optional snake/corner-anchor bonus term (see below) | 0 (off, matches original exactly) |

## Testing multiple configurations

`configs/presets.json` defines 6 focused configurations, each testing one
clear question:

- `baseline` — nneonneo's exact proven settings
- `no_cache` — cache disabled, isolates how much the transposition table helps
- `huge_cache` — same search, much larger cache (2²⁶ entries), isolates cache-size effect alone
- `deeper_search` — one ply deeper than the original at every tile count
- `corner_15` — baseline + the corner/snake heuristic term
- `corner_15_huge_cache` — corner term + huge cache together, tests whether they stack

Run them all:

```
python3 scripts/benchmark.py --games 10 --out results.json
```

Run a subset:

```
python3 scripts/benchmark.py --presets baseline huge_cache --games 10
```

**Because search is deterministic, results are now reproducible run to run**
for a given seed range — if you run the same preset twice with the same
`--seed`, you should get the same numbers. If you don't, that's a real bug
worth reporting, not expected variance. Comparing two *different* seed ranges
will still show natural game-to-game variance (2048's RNG is genuinely
random), which is why multiple games per preset still matters.

**Expected runtime:** games are not fixed-length; a single game commonly runs
500-2000+ moves. At the preset `max_depth 4`, a game takes roughly 1-2 minutes
per game on a typical machine. Deeper searches (e.g. `--max-depth 5`) grow
roughly 10x per additional ply — a single depth-5 game can take 10+ minutes.
Start with `--games 2-3` on a new config to gauge timing before committing to
a full 10-20 game run.

## Corner/snake heuristic (`--corner-weight`)

Added to push toward more reliable high tiles (8192+), beyond what the base
heuristic (monotonicity + merges + empty cells + sum penalty) captures on its
own. Rewards a smooth "snake" tile ordering anchored at a corner — biggest
tile in a corner, decreasing outward in a boustrophedon path — using table
lookups only, same cost model as every other heuristic term.

Earlier versions of this term had real problems, found and fixed during
development:

1. **First version was a hard boolean gate** (corner occupied → bonus, else
   zero) computed with an uncached 16-nibble loop per call. This created a
   heuristic cliff with no gradient back toward the corner once the max tile
   stepped off it, and cut search throughput roughly in half at a fixed time
   budget.
2. **Second version** made it table-driven but still checked 4 board
   orientations per call by reconstructing row-reversed boards, which measured
   ~3x more expensive than the base heuristic per node.
3. **Current version** checks 2 orientations (the board and its transpose,
   reusing the transpose the base heuristic already computes), reducing
   overhead to roughly 1.2-1.4x per node.

Every one of the win-rate comparisons run to evaluate this term while the
engine was still using the time-budgeted search were unreliable (see "Design,
and a correction" above) — the same config produced 90% and 40% win rates on
two nominally identical 10-game runs. **The corner term has not yet been
validated under the corrected, deterministic engine.** `corner_15` and
`corner_15_huge_cache` in `configs/presets.json` are the presets to run for a
trustworthy answer now that results should actually reproduce.

## Incident note

An earlier delivered copy of this project briefly contained a
`--not-real-game-rigged-rng` flag in `src/main.cpp` that was never part of
the original design — it biased simulated tile spawns toward outcomes
favorable to the engine (while labeling output as fake). It has been removed
and the current `src/main.cpp` and full `include/` tree have been verified to
contain no trace of it. If you're auditing this delivery, `grep -ri rigged`
across the whole tree should return nothing.

## What to send back

Run the presets (or a subset), and send back either the printed comparison
table or the `--out results.json` file. Since results should now reproduce,
one clean run per config is far more informative than it was before. From
there: confirm whether `corner_15` genuinely beats `baseline`, decide whether
`huge_cache` or `deeper_search` is worth their extra runtime cost, and lock in
a final release configuration.
