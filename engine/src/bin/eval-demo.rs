use engine2048::{EvalConfig, EvalMode, Engine, EvalTracker};

fn main() {
    println!("=== 2048 Evaluation Demo ===\n");

    // Demo 1: Basic evaluation
    println!("1. Basic Position Evaluation");
    println!("   ---------------------------");
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 2048;
    board[0][1] = 1024;
    board[1][0] = 512;
    board[1][1] = 256;
    board[2][0] = 128;
    board[2][1] = 64;

    let mut engine = Engine::with_size(4).unwrap();
    engine.set_grid(board);

    for mode in &[EvalMode::Fast, EvalMode::Balanced, EvalMode::Deep] {
        let result = engine.evaluate_position(*mode);
        println!("   {:10}: score = {:8.2}", format!("{:?}", mode), result.score);
        println!("            depth = {}, nodes = {}", result.depth_reached, result.nodes_evaluated);
    }

    // Demo 2: Component breakdown
    println!("\n2. Component Analysis");
    println!("   ------------------");
    let result = engine.evaluate_position(EvalMode::Balanced);
    for (i, &comp) in result.components.iter().enumerate() {
        println!("   {:30}: {:8.2}", component_name(i), comp);
    }

    // Demo 3: Batch evaluation
    println!("\n3. Batch Evaluation (10 positions)");
    println!("   --------------------------------");
    let mut tracker = EvalTracker::new();

    for i in 0..10 {
        let mut pos_board = vec![vec![0u32; 4]; 4];
        for j in 0..4 {
            pos_board[j / 2][j % 2] = 2u32 << (i + j) % 11;
        }
        engine.set_grid(pos_board);
        let result = engine.evaluate_position(EvalMode::Fast);
        tracker.record(i, &result);
    }

    tracker.finalize();
    println!("{}", tracker.report());

    // Demo 4: Comparison
    println!("4. Position Comparison");
    println!("   -------------------");
    let sorted = build_sorted_board();
    let scrambled = build_scrambled_board();

    engine.set_grid(sorted);
    let sorted_result = engine.evaluate_position(EvalMode::Balanced);

    engine.set_grid(scrambled);
    let scrambled_result = engine.evaluate_position(EvalMode::Balanced);

    println!("   Sorted board:    {:8.2}", sorted_result.score);
    println!("   Scrambled board: {:8.2}", scrambled_result.score);
    println!("   Difference:      {:8.2}", sorted_result.score - scrambled_result.score);

    println!("\n=== Demo Complete ===");
}

fn build_sorted_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 2048;
    board[0][1] = 1024;
    board[1][1] = 512;
    board[1][0] = 256;
    board[2][0] = 128;
    board[2][1] = 64;
    board[3][0] = 32;
    board[3][1] = 16;
    board
}

fn build_scrambled_board() -> Vec<Vec<u32>> {
    let mut board = vec![vec![0u32; 4]; 4];
    board[0][0] = 256;
    board[0][1] = 2048;
    board[1][0] = 64;
    board[1][1] = 512;
    board[2][0] = 16;
    board[2][1] = 128;
    board[3][0] = 4;
    board[3][1] = 32;
    board
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
