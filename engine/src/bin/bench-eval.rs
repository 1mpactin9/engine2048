use engine2048::{EvalConfig, EvalMode, Engine};
use std::time::Instant;

const GRID_SIZES: &[usize] = &[3, 4, 5, 6, 8];
const MODES: &[EvalMode] = &[EvalMode::Fast, EvalMode::Balanced, EvalMode::Deep];
const TEST_POSITIONS: usize = 1000;

fn generate_test_board(n: usize, seed: u64) -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; n]; n];
    let mut rng = seed;
    for r in 0..n {
        for c in 0..n {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            if rng % 3 == 0 {
                let val = 2u32 << ((rng >> 32) as u32 % 11);
                board[r][c] = val;
            }
        }
    }
    board
}

fn benchmark_eval() {
    println!("=== 2048 Position Evaluation Benchmark ===\n");

    for &n in GRID_SIZES {
        println!("Board size: {}x{}", n, n);
        println!("-------------------------------------------");

        for &mode in MODES {
            let config = mode.config();
            let mut total_time_ns = 0u128;

            for i in 0..TEST_POSITIONS {
                let board = generate_test_board(n, i as u64);
                let engine = Engine::with_size(n).unwrap();
                let start = Instant::now();
                let _result = engine.evaluate_position_with_config(&config);
                total_time_ns += start.elapsed().as_nanos();
            }

            let avg_us = total_time_ns as f64 / TEST_POSITIONS as f64 / 1000.0;
            println!("  {:12}: avg {:.2}μs per position", format!("{:?}", mode), avg_us);
        }
        println!();
    }
}

fn benchmark_weight_sensitivity() {
    println!("=== Weight Sensitivity Analysis ===\n");

    let base_config = EvalConfig::default();
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 2048;
    board[0][1] = 1024;
    board[1][0] = 512;
    board[1][1] = 256;

    let engine = Engine::with_size(4).unwrap();
    let base_result = engine.evaluate_position_with_config(&base_config);

    println!("Base score: {:.2}", base_result.score);
    println!("\nComponent breakdown:");
    for (i, &comp) in base_result.components.iter().enumerate() {
        println!("  [{:2}] {:30}: {:.2}", i, component_name(i), comp);
    }

    println!("\nWeight sensitivity (±10%):");
    for weight_idx in 0..8 {
        let mut positive_config = base_config.clone();
        let mut negative_config = base_config.clone();

        positive_config.weights[weight_idx] *= 1.1;
        negative_config.weights[weight_idx] *= 0.9;

        let positive = engine.evaluate_position_with_config(&positive_config);
        let negative = engine.evaluate_position_with_config(&negative_config);

        let sensitivity = (positive.score - negative.score).abs() / base_result.score * 100.0;
        println!(
            "  {:30}: base={:.2} +/-10% -> [{:.2}, {:.2}] sensitivity={:.1}%",
            component_name(weight_idx),
            base_result.components[weight_idx],
            positive.score,
            negative.score,
            sensitivity
        );
    }
}

fn component_name(idx: usize) -> &'static str {
    match idx {
        0 => "Empty Cells",
        1 => "Monotony",
        2 => "Smoothness",
        3 => "Snake Order",
        4 => "Consistency",
        5 => "Corner Preference",
        6 => "Max Tile",
        7 => "Tile Distribution",
        _ => "Unknown",
    }
}

fn find_optimal_weights() {
    println!("\n=== Weight Optimization Search ===\n");

    let test_boards: Vec<Vec<Vec<u32>>> = (0..100)
        .map(|i| generate_test_board(4, i as u64 * 12345))
        .collect();

    let base_weights = EvalConfig::default().weights;
    let mut best_weights = base_weights;
    let mut best_score = f64::NEG_INFINITY;

    println!("Searching for optimal weights...");
    println!("Testing {} weight configurations\n", 500);

    for trial in 0..500 {
        let mut trial_weights = base_weights;
        let mut rng = trial as u64;

        for w in trial_weights.iter_mut() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let perturbation = ((rng as f64) / u64::MAX as f64 - 0.5) * 20.0;
            *w *= 1.0 + perturbation / 100.0;
        }

        let config = EvalConfig {
            weights: trial_weights,
            ..EvalConfig::default()
        };

        let mut total_score = 0.0;
        for board in &test_boards {
            let mut engine = Engine::with_size(4).unwrap();
            engine.set_grid(board.clone());
            let result = engine.evaluate_position_with_config(&config);
            total_score += result.score;
        }

        if total_score > best_score {
            best_score = total_score;
            best_weights = trial_weights;
        }
    }

    println!("Optimal weights found:");
    for (i, &w) in best_weights.iter().enumerate() {
        let diff = w - base_weights[i];
        println!(
            "  {:30}: {:.2} (base: {:.2}, diff: {:.2})",
            component_name(i),
            w,
            base_weights[i],
            diff
        );
    }
}

fn main() {
    benchmark_eval();
    benchmark_weight_sensitivity();
    find_optimal_weights();

    println!("\n=== Benchmark Complete ===");
}
