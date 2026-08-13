pub const MAX_BOARD_SIZE: usize = 8;
pub const MAX_CELLS: usize = MAX_BOARD_SIZE * MAX_BOARD_SIZE;

#[derive(Debug, Clone)]
pub struct EvalConfig {
    pub weights: [f64; 8],
    pub depth: usize,
    pub time_limit_ms: u64,
}

impl Default for EvalConfig {
    fn default() -> Self {
        EvalConfig {
            weights: [
                270.0,
                25.0,
                11.0,
                46.0,
                18.0,
                10.0,
                5.0,
                3.0,
            ],
            depth: 4,
            time_limit_ms: 1000,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EvalResult {
    pub score: f64,
    pub components: [f64; 8],
    pub depth_reached: usize,
    pub nodes_evaluated: u64,
}

impl EvalResult {
    pub fn new(score: f64, components: [f64; 8], depth: usize, nodes: u64) -> Self {
        EvalResult {
            score,
            components,
            depth_reached: depth,
            nodes_evaluated: nodes,
        }
    }

    pub fn empty() -> Self {
        EvalResult {
            score: 0.0,
            components: [0.0; 8],
            depth_reached: 0,
            nodes_evaluated: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvalMode {
    Fast,
    Balanced,
    Deep,
}

impl EvalMode {
    pub fn config(self) -> EvalConfig {
        match self {
            EvalMode::Fast => EvalConfig {
                depth: 3,
                time_limit_ms: 250,
                ..EvalConfig::default()
            },
            EvalMode::Balanced => EvalConfig::default(),
            EvalMode::Deep => EvalConfig {
                depth: 6,
                time_limit_ms: 2000,
                ..EvalConfig::default()
            },
        }
    }
}

pub fn compute_eval_result(board: &[u32], n: usize, config: &EvalConfig) -> EvalResult {
    if n == 0 || board.is_empty() {
        return EvalResult::empty();
    }

    let hash = compute_board_hash(board, n);
    if let Some(cached) = EVAL_CACHE.with(|cache| cache.borrow().get(&hash).cloned()) {
        return cached;
    }

    let components = compute_eval_components(board, n);
    let score = compute_total_score(&components, config.weights);

    let result = EvalResult::new(
        score,
        components,
        config.depth,
        1,
    );

    EVAL_CACHE.with(|cache| {
        cache.borrow_mut().insert(hash, result.clone());
    });
    result
}

thread_local! {
    static EVAL_CACHE: std::cell::RefCell<std::collections::HashMap<u64, EvalResult>> =
        std::cell::RefCell::new(std::collections::HashMap::new());
}

pub fn clear_eval_cache() {
    EVAL_CACHE.with(|cache| {
        cache.borrow_mut().clear();
    });
}

pub fn eval_cache_size() -> usize {
    EVAL_CACHE.with(|cache| cache.borrow().len())
}

fn compute_board_hash(board: &[u32], n: usize) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    board[..n * n].hash(&mut hasher);
    n.hash(&mut hasher);
    hasher.finish()
}

pub fn compute_eval_components(board: &[u32], n: usize) -> [f64; 8] {
    let mut components = [0.0f64; 8];

    components[0] = eval_empty_cells(board, n);
    components[1] = eval_monotony(board, n);
    components[2] = eval_smoothness(board, n);
    components[3] = eval_snake_order(board, n);
    components[4] = eval_consistency(board, n);
    components[5] = eval_corner_preference(board, n);
    components[6] = eval_max_tile(board, n);
    components[7] = eval_tile_distribution(board, n);

    components
}

pub fn compute_total_score(components: &[f64; 8], weights: [f64; 8]) -> f64 {
    let mut total = 0.0;
    for i in 0..8 {
        total += components[i] * weights[i];
    }
    total
}

pub fn eval_empty_cells(board: &[u32], _n: usize) -> f64 {
    // Fast path: count empties using SIMD-friendly approach
    let mut empty_count = 0u32;
    for &v in board.iter() {
        empty_count += (v == 0) as u32;
    }
    (empty_count as f64 + 1.0).log2()
}

pub fn eval_monotony(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    let log_val = |v: u32| -> f64 {
        if v == 0 {
            0.0
        } else {
            v.trailing_zeros() as f64
        }
    };

    let mut monotony = 0.0;

    for r in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for c in 0..n - 1 {
            let a = log_val(board[r * n + c]);
            let b = log_val(board[r * n + c + 1]);
            if a > b {
                dec += a - b;
            } else {
                inc += b - a;
            }
        }
        monotony -= inc.min(dec);
    }

    for c in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for r in 0..n - 1 {
            let a = log_val(board[r * n + c]);
            let b = log_val(board[(r + 1) * n + c]);
            if a > b {
                dec += a - b;
            } else {
                inc += b - a;
            }
        }
        monotony -= inc.min(dec);
    }

    monotony
}

pub fn eval_smoothness(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    let log_val = |v: u32| -> f64 {
        if v == 0 {
            0.0
        } else {
            v.trailing_zeros() as f64
        }
    };

    let mut smoothness = 0.0;

    for r in 0..n {
        for c in 0..n {
            let v_raw = board[r * n + c];
            if v_raw == 0 {
                continue;
            }
            let v = log_val(v_raw);

            if c + 1 < n {
                let mut next_c = c + 1;
                while next_c < n && board[r * n + next_c] == 0 {
                    next_c += 1;
                }
                if next_c < n {
                    smoothness -= (v - log_val(board[r * n + next_c])).abs();
                }
            }

            if r + 1 < n {
                let mut next_r = r + 1;
                while next_r < n && board[next_r * n + c] == 0 {
                    next_r += 1;
                }
                if next_r < n {
                    smoothness -= (v - log_val(board[next_r * n + c])).abs();
                }
            }
        }
    }

    smoothness
}

pub fn eval_snake_order(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    let weights = build_snake_weights(n);
    let mut best_score = f64::NEG_INFINITY;

    for w in &weights {
        let mut score = 0.0;
        for i in 0..n * n {
            let v = board[i];
            let lv = if v == 0 { 0.0 } else { v.trailing_zeros() as f64 };
            score += lv * w[i];
        }
        best_score = best_score.max(score);
    }

    best_score
}

pub fn eval_consistency(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    let weights = build_snake_weights(n);
    let mut scores = vec![0.0f64; weights.len()];

    for (i, w) in weights.iter().enumerate() {
        for j in 0..n * n {
            let v = board[j];
            let lv = if v == 0 { 0.0 } else { v.trailing_zeros() as f64 };
            scores[i] += lv * w[j];
        }
    }

    let max_score = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if max_score <= 0.0 {
        return 0.0;
    }

    let threshold = max_score * 0.5;
    scores.iter().filter(|&&s| s > threshold).count() as f64
}

pub fn eval_corner_preference(board: &[u32], n: usize) -> f64 {
    if n < 2 {
        return 0.0;
    }

    let corners = [(0, 0), (0, n - 1), (n - 1, 0), (n - 1, n - 1)];
    let max_dist = 2.0 * (n as f64 - 1.0);

    let closeness = |r: usize, c: usize| -> f64 {
        let dist = corners
            .iter()
            .map(|&(cr, cc)| {
                let dr = (r as isize - cr as isize).unsigned_abs() as f64;
                let dc = (c as isize - cc as isize).unsigned_abs() as f64;
                dr + dc
            })
            .fold(f64::INFINITY, f64::min);
        1.0 - dist / max_dist
    };

    let mut reward = 0.0;
    let mut max_val = 0u32;
    let mut max_pos = (0usize, 0usize);

    for r in 0..n {
        for c in 0..n {
            let v = board[r * n + c];
            if v == 0 {
                continue;
            }
            let rank = v.trailing_zeros() as f64;
            reward += rank * closeness(r, c);

            if v > max_val {
                max_val = v;
                max_pos = (r, c);
            }
        }
    }

    if max_val > 0 {
        let max_rank = max_val.trailing_zeros() as f64;
        reward += max_rank * closeness(max_pos.0, max_pos.1) * 1.5;
    }

    reward
}

pub fn eval_max_tile(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    board.iter().copied().fold(0.0, |max, v| {
        if v as f64 > max {
            v as f64
        } else {
            max
        }
    })
}

pub fn eval_tile_distribution(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }

    let mut tile_counts = vec![0u32; 16];
    for &v in board.iter() {
        if v > 0 && v.is_power_of_two() {
            let idx = v.trailing_zeros() as usize;
            if idx < tile_counts.len() {
                tile_counts[idx] += 1;
            }
        }
    }

    let mut distribution = 0.0;
    for (i, &count) in tile_counts.iter().enumerate() {
        if count > 0 {
            distribution += (count as f64).log10() * (i as f64).sqrt();
        }
    }

    distribution
}

fn build_snake_weights(n: usize) -> Vec<[f64; MAX_CELLS]> {
    let mut weights = Vec::new();
    let base = (n - 1) * 4;

    for offset in 0..4 {
        if base + offset < 4 * MAX_BOARD_SIZE {
            weights.push(SNAKE_WEIGHTS[base + offset]);
        }
    }

    weights
}

static SNAKE_WEIGHTS: [[f64; MAX_CELLS]; 4 * MAX_BOARD_SIZE] = build_all_snake_weights();

const fn build_snake_weights_for_n(n: usize) -> [f64; MAX_CELLS] {
    let mut w = [0.0f64; MAX_CELLS];
    let mut val = 1.0f64;
    let mut r = 0;
    while r < n {
        let start = if r % 2 == 0 { 0 } else { n - 1 };
        let mut k = 0;
        while k < n {
            let c = if r % 2 == 0 { start + k } else { start - k };
            w[r * n + c] = val;
            k += 1;
        }
        val *= 0.5;
        r += 1;
    }
    w
}

const fn build_all_snake_weights() -> [[f64; MAX_CELLS]; 4 * MAX_BOARD_SIZE] {
    let mut all = [[0.0f64; MAX_CELLS]; 4 * MAX_BOARD_SIZE];
    let mut n = 1;
    while n <= MAX_BOARD_SIZE {
        let idx = (n - 1) * 4;
        let w0 = build_snake_weights_for_n(n);
        all[idx] = w0;
        all[idx + 1] = rotate_90(&all[idx], n);
        all[idx + 2] = rotate_90(&all[idx + 1], n);
        all[idx + 3] = rotate_90(&all[idx + 2], n);
        n += 1;
    }
    all
}

const fn rotate_90(w: &[f64; MAX_CELLS], n: usize) -> [f64; MAX_CELLS] {
    let mut out = [0.0f64; MAX_CELLS];
    let mut r = 0;
    while r < n {
        let mut c = 0;
        while c < n {
            out[c * n + (n - 1 - r)] = w[r * n + c];
            c += 1;
        }
        r += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_board_returns_nonzero_score() {
        let board = vec![0u32; 16];
        clear_eval_cache();
        let result = compute_eval_result(&board, 4, &EvalConfig::default());
        assert!((result.score - 1103.61).abs() < 0.01);
    }

    #[test]
    fn single_tile_positive_score() {
        let mut board = vec![0u32; 16];
        board[0] = 2048;
        let result = compute_eval_result(&board, 4, &EvalConfig::default());
        assert!(result.score > 0.0);
    }

    #[test]
    fn sorted_board_beats_scrambled() {
        let mut sorted = vec![0u32; 16];
        sorted[0] = 2048;
        sorted[1] = 1024;
        sorted[3] = 512;
        sorted[2] = 256;

        let mut scrambled = sorted.clone();
        scrambled[1] = 256;
        scrambled[2] = 1024;

        let sorted_eval = compute_eval_result(&sorted, 4, &EvalConfig::default());
        let scrambled_eval = compute_eval_result(&scrambled, 4, &EvalConfig::default());

        assert!(
            sorted_eval.score > scrambled_eval.score,
            "sorted board should score higher"
        );
    }

    #[test]
    fn eval_components_structure() {
        let board = vec![0u32; 16];
        let components = compute_eval_components(&board, 4);
        assert_eq!(components.len(), 8);
        assert!(components[0] > 0.0);
    }

    #[test]
    fn eval_components_nonzero_on_full_board() {
        let mut board = vec![0u32; 16];
        for i in 0..16 {
            board[i] = 2u32 << (i % 11);
        }
        let components = compute_eval_components(&board, 4);
        assert!(components.iter().any(|&c| c != 0.0));
    }

    #[test]
    fn different_modes_store_config_depth() {
        let board = vec![0u32; 16];
        clear_eval_cache();
        let fast = compute_eval_result(&board, 4, &EvalMode::Fast.config());
        clear_eval_cache();
        let deep = compute_eval_result(&board, 4, &EvalMode::Deep.config());

        assert_eq!(fast.depth_reached, 3);
        assert_eq!(deep.depth_reached, 6);
    }

    #[test]
    fn total_score_computation() {
        let components = [1.0; 8];
        let weights = [1.0; 8];
        let score = compute_total_score(&components, weights);
        assert_eq!(score, 8.0);
    }

    #[test]
    fn max_tile_evaluation() {
        let mut board = vec![0u32; 16];
        board[0] = 4096;
        let eval = eval_max_tile(&board, 4);
        assert_eq!(eval, 4096.0);
    }

    #[test]
    fn tile_distribution_counts_powers() {
        let mut board = vec![0u32; 16];
        board[0] = 2;
        board[1] = 2;
        board[2] = 4;
        board[3] = 4;
        board[4] = 8;
        let eval = eval_tile_distribution(&board, 4);
        assert!(eval > 0.0);
    }

    #[test]
    fn monotony_zero_on_empty_board() {
        let board = vec![0u32; 16];
        assert_eq!(eval_monotony(&board, 4), 0.0);
    }

    #[test]
    fn monotony_perfect_sort_score_zero() {
        // 2x2 board sorted: 4 2 / 1 0  (log values: 2 1 / 0 0)
        let board = vec![4u32, 2, 1, 0];
        // This isn't a perfect monotone chain, so check it returns non-negative
        let score = eval_monotony(&board, 2);
        assert!(score >= 0.0);
    }

    #[test]
    fn smoothness_zero_on_empty_board() {
        let board = vec![0u32; 9];
        assert_eq!(eval_smoothness(&board, 3), 0.0);
    }

    #[test]
    fn smoothness_zero_on_single_tile() {
        let board = vec![2u32, 0, 0, 0];
        assert_eq!(eval_smoothness(&board, 2), 0.0);
    }

    #[test]
    fn corner_preference_zero_on_small_board() {
        let board = vec![2u32, 0, 0, 4];
        // n < 2 returns 0
        assert_eq!(eval_corner_preference(&board, 1), 0.0);
    }

    #[test]
    fn corner_preference_positive_with_large_tile() {
        let mut board = vec![0u32; 16];
        board[0] = 4096; // largest tile in corner
        let score = eval_corner_preference(&board, 4);
        assert!(score > 0.0);
    }

    #[test]
    fn max_tile_zero_on_empty_board() {
        let board = vec![0u32; 16];
        assert_eq!(eval_max_tile(&board, 4), 0.0);
    }

    #[test]
    fn max_tile_returns_highest_value() {
        let mut board = vec![0u32; 16];
        board[0] = 2;
        board[5] = 64;
        board[10] = 512;
        assert_eq!(eval_max_tile(&board, 4), 512.0);
    }

    #[test]
    fn tile_distribution_zero_on_empty_board() {
        let board = vec![0u32; 16];
        assert_eq!(eval_tile_distribution(&board, 4), 0.0);
    }

    #[test]
    fn tile_distribution_ignores_non_power_of_two() {
        let mut board = vec![0u32; 16];
        board[0] = 3; // not a power of 2
        board[1] = 5; // not a power of 2
        assert_eq!(eval_tile_distribution(&board, 4), 0.0);
    }

    #[test]
    fn empty_cells_counts_all_empty() {
        let board = vec![0u32; 16];
        let score = eval_empty_cells(&board, 4);
        // log2(16 + 1) ≈ 4.087
        assert!((score - 4.0874).abs() < 0.01);
    }

    #[test]
    fn empty_cells_fewer_when_filled() {
        let mut full = vec![0u32; 16];
        for i in 0..16 {
            full[i] = 2;
        }
        let empty_score = eval_empty_cells(&vec![0u32; 16], 4);
        let full_score = eval_empty_cells(&full, 4);
        assert!(empty_score > full_score);
    }

    #[test]
    fn cache_stores_and_reuses_results() {
        let board = vec![0u32; 16];
        clear_eval_cache();
        assert_eq!(eval_cache_size(), 0);

        let _ = compute_eval_result(&board, 4, &EvalConfig::default());
        assert_eq!(eval_cache_size(), 1);

        // Second call should hit cache
        let _ = compute_eval_result(&board, 4, &EvalConfig::default());
        assert_eq!(eval_cache_size(), 1);
    }

    #[test]
    fn cache_clear_works() {
        let board = vec![0u32; 16];
        clear_eval_cache();
        let _ = compute_eval_result(&board, 4, &EvalConfig::default());
        assert_eq!(eval_cache_size(), 1);

        clear_eval_cache();
        assert_eq!(eval_cache_size(), 0);
    }

    #[test]
    fn different_boards_produce_different_hashes() {
        clear_eval_cache();
        let mut board1 = vec![0u32; 16];
        board1[0] = 2;
        let mut board2 = vec![0u32; 16];
        board2[1] = 2;

        let r1 = compute_eval_result(&board1, 4, &EvalConfig::default());
        let r2 = compute_eval_result(&board2, 4, &EvalConfig::default());

        // Different boards should have different scores (or at least not cached as same)
        assert_eq!(eval_cache_size(), 2);
        assert_ne!(r1.score, r2.score);
    }

    #[test]
    fn eval_with_different_board_sizes() {
        clear_eval_cache();
        // 3x3 board
        let board3 = vec![0u32; 9];
        let r3 = compute_eval_result(&board3, 3, &EvalConfig::default());
        assert!(r3.score > 0.0);

        // 5x5 board
        let board5 = vec![0u32; 25];
        let r5 = compute_eval_result(&board5, 5, &EvalConfig::default());
        assert!(r5.score > 0.0);
        assert!(r5.score > r3.score); // larger board has more empty cells
    }

    #[test]
    fn eval_components_are_all_non_negative() {
        let board = vec![0u32; 16];
        let components = compute_eval_components(&board, 4);
        for (i, &c) in components.iter().enumerate() {
            assert!(c >= 0.0, "component {} should be non-negative: {}", i, c);
        }
    }

    #[test]
    fn eval_with_zero_n_returns_empty() {
        let board = vec![0u32; 16];
        let result = compute_eval_result(&board, 0, &EvalConfig::default());
        assert_eq!(result, EvalResult::empty());
    }

    #[test]
    fn eval_with_empty_board_returns_empty() {
        let board: Vec<u32> = vec![];
        let result = compute_eval_result(&board, 0, &EvalConfig::default());
        assert_eq!(result, EvalResult::empty());
    }
}
