# 2048 Position Evaluation System

## Overview

The evaluation system provides position assessment for the 2048 game AI, similar to how chess engines evaluate board positions. It analyzes board states using multiple heuristic components to determine the quality of a position.

## Components

The evaluation function consists of 8 components:

1. **Empty Cells** - Rewards open board space for future moves
2. **Monotony** - Measures tile value ordering along rows and columns
3. **Smoothness** - Penalizes large value differences between adjacent tiles
4. **Snake Order** - Evaluates how well tiles follow a snake-like pattern
5. **Consistency** - Measures agreement across different snake orientations
6. **Corner Preference** - Rewards placing high-value tiles in corners
7. **Max Tile** - Tracks the highest tile value on the board
8. **Tile Distribution** - Analyzes the variety of tile values present

## Usage

```rust
use engine2048::{EvalConfig, EvalMode, Engine};

// Basic evaluation
let engine = Engine::with_size(4)?;
let result = engine.evaluate_position(EvalMode::Balanced);
println!("Position score: {}", result.score);

// Custom configuration
let config = EvalConfig {
    weights: [270.0, 25.0, 11.0, 46.0, 18.0, 10.0, 5.0, 3.0],
    depth: 4,
    time_limit_ms: 1000,
};
let result = engine.evaluate_position_with_config(&config);
```

## Evaluation Modes

- **Fast** (depth: 3, time: 250ms) - Quick assessments
- **Balanced** (depth: 4, time: 1000ms) - Default performance
- **Deep** (depth: 6, time: 2000ms) - Thorough analysis

## Benchmarking

Run the evaluation benchmark:

```bash
cargo run --bin bench-eval
```

This provides:
- Speed benchmarks across different board sizes
- Weight sensitivity analysis
- Optimal weight search results

## Integration with Search

The evaluation system integrates with the search engine through:

```rust
// Use eval for move suggestion
let direction = Engine::suggest_move_with_eval_mode(&grid, EvalMode::Balanced);
```

## Weight Tuning

Weights can be tuned for different play styles:

```rust
let config = EvalConfig {
    weights: [
        300.0,  // Empty cells (more aggressive)
        30.0,   // Monotony
        15.0,   // Smoothness
        50.0,   // Snake order
        20.0,   // Consistency
        12.0,   // Corner preference
        6.0,    // Max tile
        4.0,    // Tile distribution
    ],
    ..EvalConfig::default()
};
```

## Performance

Typical evaluation times:
- 4x4 board: ~1-5 microseconds per position
- 8x8 board: ~5-20 microseconds per position

Benchmarks show linear scaling with board size and constant time per evaluation.

## Testing

Run evaluation tests:

```bash
cargo test --lib eval
cargo test --bin bench-eval
```
