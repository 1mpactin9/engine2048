use engine2048::{EvalConfig, EvalMode, Engine, EvalTracker};
use std::time::Instant;

fn main() {
    println!("=== 2048 Evaluation Engine ===\n");
    println!("Testing position evaluation with multiple strategies...\n");

    let test_cases = vec![
        ("Empty board", build_empty_board()),
        ("Corner heavy", build_corner_board()),
        ("Snake ordered", build_snake_board()),
        ("Random mixed", build_random_board()),
        ("High tiles", build_high_tile_board()),
    ];

    let mut tracker = EvalTracker::new();

    for (name, board) in test_cases {
        println!("Test: {}", name);
        println!("-------------------");

        let mut engine = Engine::with_size(4).unwrap();
        engine.set_grid(board);

        let modes = vec![EvalMode::Fast, EvalMode::Balanced, EvalMode::Deep];
        for mode in &modes {
            let start = Instant::now();
            let result = engine.evaluate_position(*mode);
            let elapsed = start.elapsed();

            println!(
                "  {:10}: score={:8.2} time={:>8}μs",
                format!("{:?}", mode),
                result.score,
                elapsed.as_micros()
            );

            tracker.record(0, &result);
        }
        println!();
    }

    tracker.finalize();
    println!("{}", tracker.report());

    println!("\nCache statistics:");
    println!("  Positions cached: {}", engine2048::eval_cache_size());
}

fn build_empty_board() -> Vec<Vec<u32>> {
    vec![vec![0u32; 4]; 4]
}

fn build_corner_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 2048;
    board[0][3] = 1024;
    board[3][0] = 512;
    board[3][3] = 256;
    board
}

fn build_snake_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 2048;
    board[0][1] = 1024;
    board[1][1] = 512;
    board[1][0] = 256;
    board[2][0] = 128;
    board[2][1] = 64;
    board[3][1] = 32;
    board[3][0] = 16;
    board
}

fn build_random_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    let values = [2, 4, 8, 16, 32, 64, 128, 256];
    for (i, val) in values.iter().enumerate() {
        board[i / 4][i % 4] = *val;
    }
    board
}

fn build_high_tile_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 4096;
    board[0][1] = 2048;
    board[1][0] = 1024;
    board
}
