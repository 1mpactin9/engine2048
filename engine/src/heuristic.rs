const MAX_BOARD_SIZE: usize = 8;
const MAX_CELLS: usize = MAX_BOARD_SIZE * MAX_BOARD_SIZE;

/// Heuristic weights. These are the source of truth for both the search
/// (called via `heuristic_flat`) and the eval module (see `eval.rs`'s
/// `compute_eval_components`). Keep the two implementations in sync.
const W_EMPTY: f64 = 270.0;
const W_MONO: f64 = 25.0;
const W_SMOOTH: f64 = 11.0;
const W_SNAKE: f64 = 46.0;
const W_CONSISTENCY: f64 = 18.0;
const W_CORNER: f64 = 10.0;

const fn build_snake_weights_for_n(n: usize) -> [f64; MAX_CELLS] {
    let mut w = [0.0f64; MAX_CELLS];
    let mut val = 1.0f64;
    const RATIO: f64 = 0.5;
    let mut r = 0;
    while r < n {
        let start = if r % 2 == 0 { 0 } else { n - 1 };
        let mut k = 0;
        while k < n {
            let c = if r % 2 == 0 { start + k } else { start - k };
            w[r * n + c] = val;
            k += 1;
        }
        val *= RATIO;
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
        all[idx + 1] = rotate_90_const(&w0, n);
        all[idx + 2] = rotate_90_const(&all[idx + 1], n);
        all[idx + 3] = rotate_90_const(&all[idx + 2], n);
        n += 1;
    }
    all
}

const fn rotate_90_const(w: &[f64; MAX_CELLS], n: usize) -> [f64; MAX_CELLS] {
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

static SNAKE_WEIGHTS: [[f64; MAX_CELLS]; 4 * MAX_BOARD_SIZE] = build_all_snake_weights();

// ---------------------------------------------------------------------------
// Heuristic evaluation — shared by search (per-node) and eval (post-game).
// ---------------------------------------------------------------------------

/// Scalar heuristic score for a board.  This is what the expectimax search
/// uses at leaf nodes, and is kept in sync with
/// `crate::eval::compute_eval_result` so both paths agree on a given board.
pub fn heuristic_flat(board: &[u32], n: usize) -> f64 {
    let mut empty = 0.0;
    for &v in board.iter() {
        if v == 0 {
            empty += 1.0;
        }
    }

    let log = |v: u32| -> f64 {
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
            let v = log(v_raw);
            if c + 1 < n {
                let mut next_c = c + 1;
                while next_c < n && board[r * n + next_c] == 0 {
                    next_c += 1;
                }
                if next_c < n {
                    smoothness -= (v - log(board[r * n + next_c])).abs();
                }
            }
            if r + 1 < n {
                let mut next_r = r + 1;
                while next_r < n && board[next_r * n + c] == 0 {
                    next_r += 1;
                }
                if next_r < n {
                    smoothness -= (v - log(board[next_r * n + c])).abs();
                }
            }
        }
    }

    let mut mono = 0.0;
    for r in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for c in 0..n - 1 {
            let a = log(board[r * n + c]);
            let b = log(board[r * n + c + 1]);
            if a > b {
                dec += a - b;
            } else {
                inc += b - a;
            }
        }
        mono -= inc.min(dec);
    }
    for c in 0..n {
        let mut inc = 0.0;
        let mut dec = 0.0;
        for r in 0..n - 1 {
            let a = log(board[r * n + c]);
            let b = log(board[(r + 1) * n + c]);
            if a > b {
                dec += a - b;
            } else {
                inc += b - a;
            }
        }
        mono -= inc.min(dec);
    }

    W_EMPTY * (empty + 1.0f64).log2()
        + W_MONO * mono
        + W_SMOOTH * smoothness
        + W_SNAKE * snake_score_flat(board, n)
        + W_CONSISTENCY * snake_consistency_flat(board, n)
        + W_CORNER * corner_reward_flat(board, n)
}

/// Returns the best snake-score across all four board orientations (the value
/// the search uses directly).
pub fn snake_score_flat(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    snake_scores_flat(board, n)
        .iter()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max)
}

/// Returns a 4-element array of snake scores, one per board orientation.
pub(crate) fn snake_scores_flat(board: &[u32], n: usize) -> [f64; 4] {
    let mut scores = [0.0f64; 4];
    if n == 0 {
        return scores;
    }
    let base = (n - 1) * 4;
    let n2 = n * n;
    for i in 0..n2 {
        let v = board[i];
        let lv = if v == 0 { 0.0 } else { v.trailing_zeros() as f64 };
        scores[0] += lv * SNAKE_WEIGHTS[base][i];
        scores[1] += lv * SNAKE_WEIGHTS[base + 1][i];
        scores[2] += lv * SNAKE_WEIGHTS[base + 2][i];
        scores[3] += lv * SNAKE_WEIGHTS[base + 3][i];
    }
    scores
}

/// Count of orientations whose snake-score exceeds 50% of the best.  Used by
/// the search as a consistency signal (more orientations agreeing = more
/// stable snake structure).
pub(crate) fn snake_consistency_flat(board: &[u32], n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    let scores = snake_scores_flat(board, n);
    let max_score = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if max_score <= 0.0 {
        return 0.0;
    }
    let threshold = max_score * 0.5;
    scores.iter().filter(|&&s| s > threshold).count() as f64
}

/// Corner-preference reward: how well the board's tiles line up with a
/// corner anchor, scaled by tile rank.  Used by both the search heuristic
/// and the eval component (index 5 in `EvalResult`).
pub(crate) fn corner_reward_flat(board: &[u32], n: usize) -> f64 {
    if n < 2 {
        return 0.0;
    }
    let corners = [(0usize, 0usize), (0, n - 1), (n - 1, 0), (n - 1, n - 1)];
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

/// Thin wrapper methods on `Engine` for callers that prefer the method syntax.
/// The actual computation lives in the free functions above.
impl crate::Engine {
    pub(crate) fn heuristic_flat(board: &[u32], n: usize) -> f64 {
        heuristic_flat(board, n)
    }
    /// Re-export for tests that call `Engine::snake_score_flat`.
    #[allow(dead_code)]
    pub fn snake_score_flat(board: &[u32], n: usize) -> f64 {
        snake_score_flat(board, n)
    }
}
