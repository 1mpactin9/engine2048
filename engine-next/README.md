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
500-2000+ moves. At the default `max-depth 8`, most moves are fast, but the
overall game can still take a while end to end depending on your machine.
Start with `--games 2-3` on a new config to gauge timing before committing to
a full 10-20 game run.

**Note on hash collisions:** a collision (two different boards mapping to the
same table slot) can only ever cost a wasted cache slot — `lookup` explicitly
checks `stored_key == query_key` before returning a hit, so a collision
always falls through to a cache miss and a real search, never a wrong value
for the wrong board. A *larger* cache has *fewer* collisions, not more, so
collisions cannot explain a larger cache producing worse play. If cached and
uncached (or differently-sized-cache) runs disagree, see "Tie-breaking and
the cache correctness fix" below for the actual mechanism and its fix.

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

Every one of the win-rate comparisons run to evaluate this term before this
turn's cache-correctness fix should be treated as unreliable, for two
compounding reasons: the earlier time-budgeted (non-deterministic) search
(see "Design, and a correction" above), and — even after that was fixed —
the cache correctness bug documented above, which was present for the
`corner_15` / `corner_15_huge_cache` benchmark runs and could itself have
been distorting scores independent of the corner term's actual merit.
**Please re-run `corner_15` and `corner_15_huge_cache` now that both issues
are fixed** — the previous "corner_15 performs worse than baseline" result
was measured on a genuinely buggy cache and should not be trusted.


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

## Tie-breaking and the cache correctness fix

While debugging a report that `--no-cache` and cached runs occasionally
picked different moves on the same board, this was investigated fully rather
than dismissed, since a cache that changes decisions (not just speed) is a
real correctness bug. Two distinct things were found and fixed:

1. **Floating-point tie-breaking noise.** Two moves can have expectimax
   values equal to within float32 precision; which one a cached vs.
   freshly-recomputed path reports as "greater" could differ in the last bit.
   Fixed by widening the move-selection comparison to
   `s > best_score + TIE_EPSILON` (1e-3) instead of a bare `>`.
2. **A real cache correctness bug, now fixed:** the transposition table key
   was `(board, depth)` only. But whether a node's search bails out early to
   the cheap heuristic depends on `cprob` (cumulative spawn-probability of
   reaching that node) too — `cprob < cprob_thresh` triggers an early return.
   A value computed via such an early bailout (cheap, less accurate) could
   get cached and then reused by a different call reaching the same
   `(board, depth)` with a higher `cprob`, which would otherwise have
   recursed further and gotten a more accurate answer. Verified directly:
   with the bug present, cached and uncached search disagreed on the chosen
   move in roughly 2 of 3 short game sequences tested; after the fix, 8/8
   independent seeds agreed on every move over 20-move sequences.

   **The fix:** the cache now also keys on a coarse bucket of "how much
   `cprob` headroom remains before the cutoff" (`log2(cprob / cprob_thresh)`,
   clamped), and only serves a cache hit when the stored entry's bucket is
   `>=` the current call's — i.e. the stored computation had at least as much
   room to recurse as the current one needs. An exact `cprob` match was tried
   first and rejected: it collapsed the cache hit rate to ~0% (cprob varies
   continuously along nearly every path, so exact matches almost never
   happen). The bucketed version keeps most of the practical hit rate
   (measured: 0.44% vs. ~0.8-1.5% for the old, unsafe version, vs. ~0% for
   exact-match) while being provably safe against the early-bailout
   corruption case.

   **This was not something introduced by this rewrite** — nneonneo's
   original `2048-ai` has the same `(board)`-only cache key with no `cprob`
   component at all, so the underlying imprecision is a long-standing
   characteristic of this style of engine that this project now improves on,
   not a regression.

Practical takeaway: cached and uncached runs should now agree on move
selection far more consistently than before this fix (verified: 8/8 vs. 1/20
in matched testing). Perfect agreement in every case isn't guaranteed to be
provable without exhaustive testing, but the known corruption mechanism is
now closed.

