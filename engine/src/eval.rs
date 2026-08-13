pub use crate::heuristic::{snake_score_flat};

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

#[derive(Debug, Clone)]
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

/// Component indices for `EvalResult.components`.
/// Keep in sync with `EvalConfig::default()` weights:
///   [0] empty_cells, [1] monotony, [2] smoothness,
///   [3] snake_order, [4] consistency, [5] corner_preference,
///   [6] max_tile,   [7] tile_distribution
pub const COMPONENT_EMPTY_CELLS: usize = 0;
pub const COMPONENT_MONOTONY: usize = 1;
pub const COMPONENT_SMOOTHNESS: usize = 2;
pub const COMPONENT_SNAKE_ORDER: usize = 3;
pub const COMPONENT_CONSISTENCY: usize = 4;
pub const COMPONENT_CORNER_PREFERENCE: usize = 5;
pub const COMPONENT_MAX_TILE: usize = 6;
pub const COMPONENT_TILE_DISTRIBUTION: usize = 7;

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

    let result = EvalResult::new(score, components, config.depth, 1);

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

/// Compute the 8-component evaluation vector for a board.
///
/// The first 6 components (empty cells through corner preference) are
/// computed by delegating to the shared heuristic crate functions defined
/// in `crate::heuristic`, which are the single source of truth for both
/// search and eval. Components [6] and [7] (max_tile, tile_distribution)
/// have no counterpart in the search heuristic.
pub fn compute_eval_components(board: &[u32], n: usize) -> [f64; 8] {
    let mut components = [0.0f64; 8];

    components[COMPONENT_EMPTY_CELLS] = eval_empty_cells(board, n);
    components[COMPONENT_MONOTONY] = eval_monotony(board, n);
    components[COMPONENT_SMOOTHNESS] = eval_smoothness(board, n);
    components[COMPONENT_SNAKE_ORDER] = snake_score_flat(board, n);
    components[COMPONENT_CONSISTENCY] = crate::heuristic::snake_consistency_flat(board, n);
    components[COMPONENT_CORNER_PREFERENCE] = crate::heuristic::corner_reward_flat(board, n);
    components[COMPONENT_MAX_TILE] = eval_max_tile(board, n);
    components[COMPONENT_TILE_DISTRIBUTION] = eval_tile_distribution(board, n);

    components
}

/// Dot product of component values and weights.
pub fn compute_total_score(components: &[f64; 8], weights: [f64; 8]) -> f64 {
    let mut total = 0.0;
    for i in 0..8 {
        total += components[i] * weights[i];
    }
    total
}

/// Empty-cell count expressed as `log2(empty + 1)`, matching the search
/// weight constant `W_EMPTY = 270.0`.
pub fn eval_empty_cells(board: &[u32], _n: usize) -> f64 {
    let mut empty_count = 0u32;
    for &v in board.iter() {
        empty_count += (v == 0) as u32;
    }
    (empty_count as f64 + 1.0).log2()
}

/// Row+column monotony penalty: the sum, over all rows and columns, of
/// `min(ascending_delta, descending_delta)` where delta is measured on
/// tile ranks (`log2(tile_value)`).  Mirrors the search heuristic's
/// `mono` accumulator.
pub fn eval_monotony(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    let log_val = |v: u32| -> f64 {
        if v == 0 { 0.0 } else { v.trailing_zeros() as f64 }
    };
    let mut monotony = 0.0;
    for r in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for c in 0..n - 1 {
            let a = log_val(board[r * n + c]);
            let b = log_val(board[r * n + c + 1]);
            if a > b { dec += a - b; } else { inc += b - a; }
        }
        monotony -= inc.min(dec);
    }
    for c in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for r in 0..n - 1 {
            let a = log_val(board[r * n + c]);
            let b = log_val(board[(r + 1) * n + c]);
            if a > b { dec += a - b; } else { inc += b - a; }
        }
        monotony -= inc.min(dec);
    }
    monotony
}

/// Smoothness penalty: sum of absolute rank-differences between each
/// non-empty tile and the next non-empty tile in its row/column.
/// Mirrors the search heuristic's `smoothness` accumulator.
pub fn eval_smoothness(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    let log_val = |v: u32| -> f64 {
        if v == 0 { 0.0 } else { v.trailing_zeros() as f64 }
    };
    let mut smoothness = 0.0;
    for r in 0..n {
        for c in 0..n {
            let v_raw = board[r * n + c];
            if v_raw == 0 { continue; }
            let v = log_val(v_raw);
            if c + 1 < n {
                let mut next_c = c + 1;
                while next_c < n && board[r * n + next_c] == 0 { next_c += 1; }
                if next_c < n {
                    smoothness -= (v - log_val(board[r * n + next_c])).abs();
                }
            }
            if r + 1 < n {
                let mut next_r = r + 1;
                while next_r < n && board[next_r * n + c] == 0 { next_r += 1; }
                if next_r < n {
                    smoothness -= (v - log_val(board[next_r * n + c])).abs();
                }
            }
        }
    }
    smoothness
}

/// Max tile value on the board.  Not used by the search heuristic; used
/// only as a post-game eval component (index 6).
pub fn eval_max_tile(board: &[u32], _n: usize) -> f64 {
    board.iter().copied().fold(0.0, |max, v| {
        if v as f64 > max { v as f64 } else { max }
    })
}

/// Tile-distribution score: a measure of how well-represented different
/// tile powers are on the board.  Not used by the search heuristic;
/// used only as a post-game eval component (index 7).
pub fn eval_tile_distribution(board: &[u32], _n: usize) -> f64 {
    let mut tile_counts = [0u32; 16];
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
    fn eval_components_match_heuristic_for_shared_terms() {
        // Verify that the eval's shared components agree with the heuristic
        // module's functions on a handful of sample boards.
        use crate::heuristic::{snake_score_flat, snake_consistency_flat, corner_reward_flat};
        let board = vec![0u32; 16];
        board[0] = 2048;
        board[1] = 1024;
        board[2] = 512;

        let components = compute_eval_components(&board, 4);
        assert!((components[COMPONENT_SNAKE_ORDER] - snake_score_flat(&board, 4)).abs() < 1e-9);
        assert!((components[COMPONENT_CONSISTENCY] - snake_consistency_flat(&board, 4)).abs() < 1e-9);
        assert!((components[COMPONENT_CORNER_PREFERENCE] - corner_reward_flat(&board, 4)).abs() < 1e-9);
    }
}
