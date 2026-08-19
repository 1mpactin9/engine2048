const ENDGAME_EMPTY_THRESHOLD: usize = 2;
const PROB_CUTOFF: f64 = 5e-6;
const PRUNE_MARGIN: f64 = 600.0;
const MAX_SAMPLED_CELLS_CAP: usize = 16;
const TIME_CHECK_NODE_INTERVAL: u64 = 512;
const HARD_TIME_MULTIPLIER: f64 = 2.0;
/// How many filled cells to require before declaring a board "dangerous"
/// (triggering power-up exploration in `suggest_action`).
const DANGER_FILLED_THRESHOLD: usize = 12;

/// How many extra search plies to add when the board is nearly full
/// (`<= ENDGAME_EMPTY_THRESHOLD` empties).  Going deeper in the endgame
/// is expensive but crucial — merges open cells and the position is
/// fragile enough that a shallow search blunders easily.
fn endgame_extra_depth(n: usize) -> usize {
    match n {
        0..=4 => 30,
        5..=6 => 7,
        _ => 5,
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn now_ms() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn now_ms() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

use crate::board as bitboard_mod;
use crate::history::HistoryTable;
use crate::stats::SearchStats;
use crate::transposition::{tt_get, tt_put, zobrist_hash};
use crate::{Action, Direction, Engine, EvalConfig, EvalMode, UsageMode};

use std::cell::Cell;

thread_local! {
    static SEARCH_DEADLINE_MS: Cell<f64> = Cell::new(f64::INFINITY);
    static SEARCH_NODE_TICK: Cell<u64> = Cell::new(0);
}

pub(crate) fn set_search_deadline(deadline_ms: f64) {
    SEARCH_DEADLINE_MS.with(|d| d.set(deadline_ms));
    SEARCH_NODE_TICK.with(|t| t.set(0));
}

pub(crate) fn clear_search_deadline() {
    SEARCH_DEADLINE_MS.with(|d| d.set(f64::INFINITY));
}

pub(crate) fn deadline_hit() -> bool {
    let should_check = SEARCH_NODE_TICK.with(|t| {
        let v = t.get().wrapping_add(1);
        t.set(v);
        v % TIME_CHECK_NODE_INTERVAL == 0
    });
    if !should_check {
        return false;
    }
    SEARCH_DEADLINE_MS.with(|d| now_ms() >= d.get())
}

fn prob_bucket_hash(hash: u64, prob: f64) -> u64 {
    let bucket = if prob >= 1.0 {
        0u64
    } else if prob <= 0.0 {
        63u64
    } else {
        (-prob.log2()).floor().clamp(0.0, 63.0) as u64
    };
    hash ^ bucket.wrapping_mul(0x9E3779B97F4A7C15)
}

impl Engine {
    pub(crate) fn endgame_depth(grid: &Vec<Vec<u32>>, depth: usize) -> usize {
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        if empties <= ENDGAME_EMPTY_THRESHOLD {
            depth.max(endgame_extra_depth(grid.len()))
        } else {
            depth
        }
    }

    pub fn suggest_move_for(grid: &Vec<Vec<u32>>, depth: Option<usize>) -> Option<Direction> {
        Self::suggest_move_with_usage(grid, depth, UsageMode::Balanced).0
    }

    pub fn suggest_move_with_usage(
        grid: &Vec<Vec<u32>>,
        depth: Option<usize>,
        usage: UsageMode,
    ) -> (Option<Direction>, SearchStats) {
        let search_depth =
            Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)));
        let (dir, val, stats) = Self::best_move_with_stats(grid, search_depth, usage, true);
        (dir, stats)
    }

    pub fn suggest_move_guarantee(grid: &Vec<Vec<u32>>, usage: UsageMode) -> Option<Direction> {
        Self::suggest_move_guarantee_with_stats(grid, usage).0
    }

    pub fn suggest_move_guarantee_with_stats(
        grid: &Vec<Vec<u32>>,
        usage: UsageMode,
    ) -> (Option<Direction>, SearchStats) {
        let board = Self::flatten(grid);
        let distinct = bitboard_mod::count_distinct_tiles(&board);
        let base_depth = 3usize.max(distinct.saturating_sub(2));
        let final_depth = Self::endgame_depth(grid, base_depth);
        Self::best_move_with_stats(grid, final_depth, usage, true)
    }

    pub(crate) fn ordered_directions(board: &[u32], n: usize) -> [(Direction, bool, f64); 4] {
        let mut new_board = [0u32; 256];
        let mut out = [(Direction::Up, false, f64::NEG_INFINITY); 4];
        for (i, &dir) in Direction::ALL.iter().enumerate() {
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            let moved = slice != board;
            let score = if moved {
                gained as f64 + Self::heuristic_flat(slice, n)
            } else {
                f64::NEG_INFINITY
            };
            out[i] = (dir, moved, score);
        }
        out.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());
        out
    }

    fn best_move_fixed(
        grid: &Vec<Vec<u32>>,
        depth: usize,
        budget: &mut u64,
        max_cells: usize,
    ) -> (Option<Direction>, f64) {
        let n = grid.len();
        let board = Self::flatten(grid);
        let ordered = Self::ordered_directions(&board, n);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut new_board = [0u32; 256];
        for &(dir, moved, quick_score) in ordered.iter() {
            if !moved {
                continue;
            }
            if best_dir.is_some() && quick_score < best_val - PRUNE_MARGIN {
                continue;
            }
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(&board, n, dir, slice);
            let value = gained as f64
                + Self::expectimax_chance_flat(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    1.0,
                    max_cells,
                );
            if value > best_val {
                best_val = value;
                best_dir = Some(dir);
            }
        }
        let val = if best_dir.is_none() {
            -200_000.0
        } else {
            best_val
        };
        (best_dir, val)
    }

    fn best_move(
        grid: &Vec<Vec<u32>>,
        max_depth: usize,
        usage: UsageMode,
    ) -> (Option<Direction>, f64) {
        let start = now_ms();
        let time_budget_ms = usage.time_budget_ms() as f64;
        let scale = usage.node_budget_scale();
        let max_cells = usage.max_sampled_cells().min(MAX_SAMPLED_CELLS_CAP);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut depth = 1;
        const GROWTH_SAFETY_FACTOR: f64 = 6.0;
        loop {
            let pass_start = now_ms();
            set_search_deadline(pass_start + time_budget_ms * HARD_TIME_MULTIPLIER);
            let mut budget = Self::scaled_budget_for_depth(depth, scale);
            let (dir, val) = Self::best_move_fixed(grid, depth, &mut budget, max_cells);
            clear_search_deadline();
            let pass_elapsed = now_ms() - pass_start;
            if dir.is_some() {
                best_dir = dir;
                best_val = val;
            }
            let elapsed = now_ms() - start;
            let remaining = time_budget_ms - elapsed;
            let projected_next = pass_elapsed * GROWTH_SAFETY_FACTOR;
            if depth >= max_depth || remaining <= 0.0 || projected_next > remaining {
                break;
            }
            depth += 1;
        }
        (best_dir, best_val)
    }

    pub fn suggest_move_with_eval_mode(grid: &Vec<Vec<u32>>, mode: EvalMode) -> Option<Direction> {
        Self::suggest_move_with_eval_for(grid, None, mode)
    }

    pub fn suggest_move_with_eval_config(
        grid: &Vec<Vec<u32>>,
        config: &EvalConfig,
    ) -> Option<Direction> {
        let n = grid.len();
        let board = Self::flatten(grid);

        let mut best_dir = None;
        let mut best_score = f64::NEG_INFINITY;

        for &dir in Direction::ALL.iter() {
            let (new_board, _) = Self::slide_flat(&board, n, dir);
            if new_board == board {
                continue;
            }

            let result = Self::compute_eval_result(&new_board, n, config);
            if result.score > best_score {
                best_score = result.score;
                best_dir = Some(dir);
            }
        }

        best_dir
    }

    pub fn compute_eval_result(
        board: &[u32],
        n: usize,
        config: &EvalConfig,
    ) -> crate::eval::EvalResult {
        crate::eval::compute_eval_result(board, n, config)
    }

    pub fn suggest_action_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
    ) -> Action {
        Self::suggest_action_with_usage(grid, swaps_left, deletes_left, depth, UsageMode::Balanced)
    }

    pub fn suggest_action_with_usage(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
        usage: UsageMode,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::auto_depth(grid));
        let max_cells = usage.max_sampled_cells().min(MAX_SAMPLED_CELLS_CAP);
        let mut budget = Self::scaled_budget_for_depth(d, usage.node_budget_scale());

        let (best_dir, move_val) = Self::best_move(grid, d, usage);

        let stuck = best_dir.is_none();
        if !stuck && !Self::is_dangerous(grid) {
            return best_dir.map(Action::Move).unwrap_or(Action::None);
        }
        const POWERUP_MARGIN: f64 = 90.0;
        let powerup_start = now_ms();
        set_search_deadline(powerup_start + usage.time_budget_ms() as f64 * HARD_TIME_MULTIPLIER);

        let mut best_delete: Option<(usize, usize)> = None;
        let mut best_delete_val = f64::NEG_INFINITY;
        if deletes_left > 0 {
            for r in 0..size {
                for c in 0..size {
                    if grid[r][c] == 0 {
                        continue;
                    }
                    let mut g = grid.clone();
                    g[r][c] = 0;
                    let v = Self::best_move_fixed(&g, d, &mut budget, max_cells).1;
                    if v > best_delete_val {
                        best_delete_val = v;
                        best_delete = Some((r, c));
                    }
                }
            }
        }

        let mut best_swap: Option<((usize, usize), (usize, usize))> = None;
        let mut best_swap_val = f64::NEG_INFINITY;
        if swaps_left > 0 {
            let occupied: Vec<(usize, usize)> = (0..size)
                .flat_map(|r| (0..size).map(move |c| (r, c)))
                .filter(|&(r, c)| grid[r][c] != 0)
                .collect();
            for (a, b) in sampled_pairs(&occupied, 48) {
                let mut g = grid.clone();
                let tmp = g[a.0][a.1];
                g[a.0][a.1] = g[b.0][b.1];
                g[b.0][b.1] = tmp;
                let v = Self::best_move_fixed(&g, d, &mut budget, max_cells).1;
                if v > best_swap_val {
                    best_swap_val = v;
                    best_swap = Some((a, b));
                }
            }
        }
        clear_search_deadline();

        let mut chosen = best_dir.map(Action::Move).unwrap_or(Action::None);
        let mut chosen_val = move_val;
        if best_delete_val >= move_val + POWERUP_MARGIN && best_delete_val > chosen_val {
            let (r, c) = best_delete.unwrap();
            chosen = Action::Delete(r, c);
            chosen_val = best_delete_val;
        }
        if best_swap_val >= move_val + POWERUP_MARGIN && best_swap_val > chosen_val {
            let (a, b) = best_swap.unwrap();
            chosen = Action::Swap(a, b);
        }
        chosen
    }

    pub(crate) fn is_dangerous(grid: &Vec<Vec<u32>>) -> bool {
        let n = grid.len();
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        let threshold = (n * n / 6).max(2);
        empties <= threshold
    }

    fn default_depth(size: usize) -> usize {
        match size {
            0..=3 => 6,
            4 => 6,
            5 => 3,
            6 => 2,
            _ => 1,
        }
    }

    pub(crate) fn auto_depth(grid: &Vec<Vec<u32>>) -> usize {
        let n = grid.len();
        let base = Self::default_depth(n);
        let empty = grid.iter().flatten().filter(|&&v| v == 0).count();
        let area = (n * n).max(1);
        let ratio = empty as f64 / area as f64;

        let depth = if ratio > 0.55 {
            base.saturating_sub(2)
        } else if ratio > 0.35 {
            base.saturating_sub(1)
        } else if ratio > 0.22 {
            base
        } else if ratio > 0.12 {
            base + 1
        } else if ratio > 0.07 {
            base + 3
        } else if ratio > 0.035 {
            base + 5
        } else {
            base + 8
        };
        let floor = if n <= 4 { 3 } else { 2 };
        let result = depth.max(floor);
        debug_assert!(result >= base.saturating_sub(3));
        result
    }

    pub(crate) fn budget_for_depth(depth: usize) -> u64 {
        match depth {
            0..=2 => 20_000,
            3 => 60_000,
            4 => 140_000,
            5..=6 => 260_000,
            7..=8 => 420_000,
            9..=12 => 650_000,
            _ => 1_000_000,
        }
    }

    pub(crate) fn scaled_budget_for_depth(depth: usize, scale: f64) -> u64 {
        let base = Self::budget_for_depth(depth) as f64;
        (base * scale).round().max(1000.0) as u64
    }

    fn expectimax_max_flat(
        board: &[u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        prob: f64,
        max_cells: usize,
    ) -> f64 {
        if deadline_hit() || depth == 0 || *budget == 0 || prob < PROB_CUTOFF {
            return Self::heuristic_flat(board, n);
        }
        let hash = prob_bucket_hash(zobrist_hash(board), prob);
        if let Some(cached) = tt_get(hash, depth) {
            return cached;
        }
        *budget -= 1;
        let ordered = Self::ordered_directions(board, n);
        let mut best = f64::NEG_INFINITY;
        let mut any_move = false;
        let mut new_board = [0u32; 256];
        for &(dir, moved, quick_score) in ordered.iter() {
            if !moved {
                continue;
            }
            any_move = true;
            if best > f64::NEG_INFINITY && quick_score < best - PRUNE_MARGIN {
                if quick_score > best {
                    best = quick_score;
                }
                continue;
            }
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            let v = gained as f64
                + Self::expectimax_chance_flat(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    prob,
                    max_cells,
                );
            if v > best {
                best = v;
            }
        }
        let result = if !any_move { -200000.0 } else { best };
        if prob >= PROB_CUTOFF {
            tt_put(hash, depth, result);
        }
        result
    }

    fn expectimax_chance_flat(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        prob: f64,
        max_cells: usize,
    ) -> f64 {
        if deadline_hit() || *budget == 0 || prob < PROB_CUTOFF {
            return Self::heuristic_flat(board, n);
        }
        let mut empties = [0usize; 256];
        let mut num_empties = 0;
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties[num_empties] = idx;
                num_empties += 1;
            }
        }
        if num_empties == 0 || depth == 0 {
            return Self::heuristic_flat(board, n);
        }
        let hash = prob_bucket_hash(zobrist_hash(board), prob);
        if let Some(cached) = tt_get(hash, depth) {
            return cached;
        }
        *budget -= 1;

        let cap = max_cells.clamp(1, MAX_SAMPLED_CELLS_CAP);
        let mut sampled = [0usize; MAX_SAMPLED_CELLS_CAP];
        let sampled_len = if num_empties <= cap {
            for i in 0..num_empties {
                sampled[i] = empties[i];
            }
            num_empties
        } else {
            let stride = num_empties as f64 / cap as f64;
            for i in 0..cap {
                sampled[i] = empties[(i as f64 * stride) as usize];
            }
            cap
        };

        let mut total = 0.0;
        let weight_each = 1.0 / sampled_len as f64;
        let next_depth = depth.saturating_sub(1);
        for i in 0..sampled_len {
            let idx = sampled[i];
            let p2 = prob * weight_each * 0.9;
            let p4 = prob * weight_each * 0.1;

            board[idx] = 2;
            let v2 = if p2 < PROB_CUTOFF {
                Self::heuristic_flat(board, n)
            } else {
                Self::expectimax_max_flat(board, n, next_depth, budget, p2, max_cells)
            };
            board[idx] = 4;
            let v4 = if p4 < PROB_CUTOFF {
                Self::heuristic_flat(board, n)
            } else {
                Self::expectimax_max_flat(board, n, next_depth, budget, p4, max_cells)
            };
            board[idx] = 0;

            total += weight_each * (0.9 * v2 + 0.1 * v4);
        }
        if prob >= PROB_CUTOFF {
            tt_put(hash, depth, total);
        }
        total
    }
}

pub(crate) fn sampled_pairs(
    occ: &[(usize, usize)],
    max: usize,
) -> Vec<((usize, usize), (usize, usize))> {
    let n = occ.len();
    if n < 2 || max == 0 {
        return Vec::new();
    }
    let total: usize = n * (n - 1) / 2;
    let step = if total <= max {
        1
    } else {
        (total + max - 1) / max
    };
    let mut out: Vec<((usize, usize), (usize, usize))> = Vec::with_capacity(total.min(max));
    let mut count = 0usize;
    for i in 0..n {
        for j in (i + 1)..n {
            if count % step == 0 {
                out.push((occ[i], occ[j]));
            }
            count += 1;
        }
    }
    out
}
