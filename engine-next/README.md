# engine-next — fast, deterministic 2048 AI

## Overview

A C++17 2048-playing engine using fixed-depth expectimax search with a
cprob-bucket-aware transposition table. It reproduces [nneonneo's
2048-ai](https://github.com/nneonneo/2048-ai) design faithfully while
adding deterministic move ordering, an optional adjacent-empty-cell
heuristic, replay debugging, and OpenMP parallel game execution.

## Key properties

- **Deterministic**: Same seed always produces the same game, regardless of
  hardware or clock speed. Fixed-depth search (no iterative deepening)
  avoids timing-dependent branching.
- **Fast**: Precomputed 65536-entry move/scoring tables make each search
  iteration a handful of bit-manipulation lookups.
- **Cache-aware**: The transposition table uses a coarse cprob bucket
  scheme so that values computed with more remaining search budget are
  preferred when reusing cached results.
- **Heuristic**: Combines empty-cell count, merge potential, monotonicity,
  sum-of-ranks penalisation, and an optional boustrophedon snake/corner
  term plus an adjacent-empty adjacency bonus.

## Build

### Prerequisites

- C++17 compiler (GCC ≥ 9, Clang ≥ 10, MSVC ≥ 19)
- CMake ≥ 3.16 (optional; scripts/build.sh/.ps1 also work)
- OpenMP (optional, for `--parallel`)

### CMake (cross-platform)

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
./test_correctness          # run tests
./engine2048 --games 10     # run engine
```

### Script builds

```bash
# Linux / macOS
bash scripts/build.sh

# Windows (PowerShell)
.\scripts\build.ps1
```

## Running

```bash
# 10 games, seed 1 (default)
./engine2048

# 100 games, seed 42, verbose output
./engine2048 --games 100 --seed 42 --verbose

# Single game with board replay (debugging)
./engine2048 --games 1 --seed 1 --replay

# Parallel execution (requires OpenMP)
./engine2048 --games 100 --parallel

# Override a heuristic weight
./engine2048 --corner-weight 15.0 --empty-weight 300.0
```

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--games N` | 10 | Number of simulated games |
| `--seed N` | 1 | Base RNG seed |
| `--cprob F` | 0.0001 | Cumulative-probability cutoff for search bailout |
| `--cache-depth-limit N` | 15 | Max search depth eligible for TT caching |
| `--min-depth N` | 3 | Minimum search depth |
| `--depth-bias N` | 2 | `depth_limit = max(min_depth, distinct_tiles - bias)` |
| `--max-depth N` | 8 | Hard ceiling on search depth |
| `--tt-bits N` | 22 | TT size = 2^N entries (2^22 ≈ 4M, ~32 MB) |
| `--no-cache` | off | Disable transposition table |
| `--no-root-ordering` | off | Disable heuristic-based root move ordering |
| `--reset-cache-each-game` | off | Clear TT between games (isolates per-game timing) |
| `--verbose` | off | Print per-game stats |
| `--replay` | off | Print board after every move for debugging |
| `--parallel` | off | Parallelize games with OpenMP |
| `--lost-penalty` … `--corner-weight` | see `include/weights.h` | Heuristic weights |
| `--help` | — | Show usage |

## Benchmarks

A Python harness runs every preset in `configs/presets.json`:

```bash
python3 scripts/benchmark.py            # 3 games per preset (quick sanity)
python3 scripts/benchmark.py --games 10 # 10 games per preset
python3 scripts/benchmark.py --out results.json
```

### Presets

| Preset | Description |
|--------|-------------|
| `baseline` | nneonneo's exact settings (depth=max(3,dist-2), 2^22 TT) |
| `no_cache` | Cache disabled, max_depth=6 — measures cache speed contribution |
| `huge_cache` | Same as baseline but 2^26-entry TT (~1 GB) — isolates cache-size effect |
| `deeper_search` | depth_bias=1, max_depth=9 — one ply deeper everywhere |
| `corner_15` | baseline + snake/corner heuristic (weight 15) |
| `corner_15_huge_cache` | corner_15 + huge cache — tests whether they stack |

## Tests

```bash
# Build and run correctness tests
bash scripts/build.sh
# or: cmake --build . && ctest
```

Tests cover:
- Bitboard operations (transpose, reverse_row, count_empty)
- Move table correctness (merge, no-op detection)
- Transposition table depth / cprob-bucket semantics
- Engine move legality and terminal-board detection
- Cross-instance determinism (two engines pick the same move)

## Architecture

```
include/
  board.h          — bitboard types, move/transpose helpers
  weights.h        — heuristic weight defaults
  tables.h         — precomputed move & scoring tables
  transposition_table.h — direct-mapped TT with cprob bucketing
  engine.h         — fixed-depth expectimax search
  simulate.h       — game simulation driver
src/
  main.cpp         — CLI entry point
tests/
  test_correctness.cpp — unit / property tests
configs/
  presets.json     — named benchmark configurations
scripts/
  build.sh / .ps1  — one-command build + test
  benchmark.py     — preset runner + comparison table
```

## Design notes

### Why fixed-depth instead of iterative deepening?

Iterative deepening with a wall-clock budget makes search depth depend on
machine timing, so the same `--seed` could produce a different game on
different hardware. Fixed depth is fully deterministic: same board → same
search → same move, every time, on any machine.

### Why cprob bucketing in the TT?

The cumulative probability (`cprob`) varies continuously along every
search path, so an exact-match key comparison would yield ~0% hit rate.
Bucketing by `log2(cprob / threshold)` collapses nearby probabilities into
the same bucket while keeping meaningfully different "remaining search
budget" states separated. The lookup only reuses a cached value if the
stored computation had *at least as much* budget as the current call,
preventing silent downgrade of search quality.

### Root move ordering

Before launching expectimax, the engine scores each legal move with the
heuristic and searches highest-scoring moves first. This improves TT hit
rates because strong branches are cached early, making later branches
more likely to resolve via cache lookup.

### Adjacent-empty heuristic

The `--empty-adjacent-weight W` flag (via `--empty-adjacent-weight`) adds
a bonus for orthogonally adjacent pairs of empty cells. Two isolated empty
cells are less valuable than two adjacent ones because adjacent empties
create merge opportunities. This is a cheap O(1) loop (at most 24 checks)
per leaf node.

## License

Same license as the parent project.
