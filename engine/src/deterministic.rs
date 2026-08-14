use crate::search::{
    clear_search_deadline, deadline_hit, now_ms, sampled_pairs, set_search_deadline,
};
use crate::transposition::{tt_get, tt_put, zobrist_hash};
use crate::{Action, Direction, Engine, UsageMode};

const DET_HARD_TIME_MULTIPLIER: f64 = 2.0;

const DET_PRUNE_MARGIN: f64 = 600.0;
const DET_DEPTH_BONUS: usize = 4;

fn mix_calls(hash: u64, calls: u64) -> u64 {
    let c = calls
        .wrapping_mul(0x9E3779B97F4A7C15)
        .rotate_left(17)
        .wrapping_add(0xBF58476D1CE4E5B9);
    hash ^ c
}

const WIDTH: usize = 256;
const MASK: u32 = 255;
const CHUNKS: u32 = 6;
const START_DENOM: u64 = 1u64 << 48;
const SIGNIFICANCE: u64 = 1u64 << 52;
const OVERFLOW: u64 = 1u64 << 53;

struct Arc4 {
    i: u32,
    j: u32,
    s: [u8; WIDTH],
}

impl Arc4 {
    fn new(key: &[u8]) -> Self {
        let mut s = [0u8; WIDTH];
        for i in 0..WIDTH {
            s[i] = i as u8;
        }
        let keylen = key.len().max(1);
        let mut i: u32 = 0;
        let mut j: u32 = 0;
        while i < WIDTH as u32 {
            let t = s[i as usize];
            j = (j + key[i as usize % keylen] as u32 + t as u32) & MASK;
            s[i as usize] = s[j as usize];
            s[j as usize] = t;
            i += 1;
        }
        let mut arc4 = Arc4 { i: 0, j: 0, s };
        arc4.g(WIDTH as u32);
        arc4
    }

    fn g(&mut self, count: u32) -> f64 {
        let mut r: f64 = 0.0;
        for _ in 0..count {
            self.i = (self.i + 1) & MASK;
            let t = self.s[self.i as usize];
            self.j = (self.j + t as u32) & MASK;
            let s_j = self.s[self.j as usize];
            self.s[self.i as usize] = s_j;
            self.s[self.j as usize] = t;
            let idx = ((s_j as u32) + (t as u32)) & MASK;
            r = r * (WIDTH as f64) + self.s[idx as usize] as f64;
        }
        r
    }

    fn next_double(&mut self) -> f64 {
        let mut n: f64 = self.g(CHUNKS);
        let mut d: f64 = START_DENOM as f64;
        let mut x: f64 = 0.0;
        while n < SIGNIFICANCE as f64 {
            n = (n + x) * (WIDTH as f64);
            d *= WIDTH as f64;
            x = self.g(1);
        }
        while n >= OVERFLOW as f64 {
            n *= 0.5;
            d *= 0.5;
            x *= 0.5;
        }
        (n + x) / d
    }
}

fn mixkey(stringseed: &str, key: &mut [u8; WIDTH]) -> usize {
    let mut smear: i32 = 0;
    for (j, ch) in stringseed.chars().enumerate() {
        let j_idx = (j as u32 & MASK) as usize;
        let cur = key[j_idx] as i32;
        let ch_code = ch as i32;
        let new_smear = smear ^ cur.wrapping_mul(19);
        key[j_idx] = (new_smear.wrapping_add(ch_code) & (MASK as i32)) as u8;
        smear = new_smear;
    }
    let n = stringseed.chars().count();
    n.min(WIDTH)
}

fn seed_to_string(seed: &[u32; 8]) -> String {
    let mut s = String::with_capacity(64);
    for v in seed {
        s.push_str(&format!("{:08x}", v));
    }
    s
}

pub struct SeedRng {
    arc4: Arc4,
    pub calls: u64,
}

impl SeedRng {
    pub fn init(seed: &[u32; 8], calls: u64) -> Self {
        let seed_str = seed_to_string(seed);
        let mut key = [0u8; WIDTH];
        let key_len = mixkey(&seed_str, &mut key);
        let mut arc4 = Arc4::new(&key[..key_len]);
        for _ in 0..calls {
            arc4.next_double();
        }
        SeedRng { arc4, calls }
    }

    pub fn new(seed: &[u32; 8], calls: u64) -> Self {
        Self::init(seed, calls)
    }

    pub fn next(&mut self) -> f64 {
        let v = self.arc4.next_double();
        self.calls += 1;
        v
    }
}

impl Engine {
    pub fn derive_key(seed: &[u32]) -> [u32; 8] {
        let mut out = [0u32; 8];
        for (i, v) in seed.iter().enumerate().take(8) {
            out[i] = *v;
        }
        out
    }

    pub fn predict_spawn_flat(
        board: &mut [u32],
        n: usize,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Option<(usize, u32, u64)> {
        let mut rng = SeedRng::init(key, calls);
        let mut budget = u64::MAX;
        Self::predict_spawn_flat_with_usage(
            board,
            n,
            &mut rng,
            manipulate,
            UsageMode::Balanced,
            &mut budget,
        )
    }

    pub fn predict_spawn_flat_with_usage(
        board: &mut [u32],
        n: usize,
        rng: &mut SeedRng,
        manipulate: bool,
        usage: UsageMode,
        budget: &mut u64,
    ) -> Option<(usize, u32, u64)> {
        let mut empties = [0usize; 256];
        let mut num_empties = 0;
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties[num_empties] = idx;
                num_empties += 1;
            }
        }
        if num_empties == 0 {
            return None;
        }
        let start_calls = rng.calls;
        const PROB_4: f64 = 0.1;
        let (spot, value) = if manipulate && num_empties > 1 {
            let raw_cap = usage.manipulation_rounds_cap();
            let cap = if raw_cap == usize::MAX {
                64
            } else {
                raw_cap.min(64).max(1)
            };
            let rounds = cap.min(num_empties);
            let mut best_spot = empties[0];
            let mut best_value: u32 = 2;
            let mut best_score = f64::NEG_INFINITY;
            for _ in 0..rounds {
                if *budget == 0 {
                    break;
                }
                *budget -= 1;
                let cand_spot = empties[(rng.next() * num_empties as f64) as usize];
                let cand_value: u32 = if rng.next() < PROB_4 { 4 } else { 2 };
                board[cand_spot] = cand_value;
                let score = score_spawn_candidate_flat(board, n);
                board[cand_spot] = 0;
                if score > best_score {
                    best_score = score;
                    best_spot = cand_spot;
                    best_value = cand_value;
                }
            }
            (best_spot, best_value)
        } else {
            let spot = empties[(rng.next() * num_empties as f64) as usize];
            let value: u32 = if rng.next() < PROB_4 { 4 } else { 2 };
            (spot, value)
        };
        let draws = rng.calls - start_calls;
        Some((spot, value, draws))
    }

    fn expectimax_max_flat_det(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        rng: &mut SeedRng,
        manipulate: bool,
        usage: UsageMode,
    ) -> f64 {
        if deadline_hit() || depth == 0 || *budget == 0 {
            return Self::heuristic_flat(board, n);
        }
        let hash = mix_calls(zobrist_hash(board), rng.calls);
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
            if best > f64::NEG_INFINITY && quick_score < best - DET_PRUNE_MARGIN {
                if quick_score > best {
                    best = quick_score;
                }
                continue;
            }
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            let v = gained as f64
                + Self::expectimax_chance_flat_det(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    rng,
                    manipulate,
                    usage,
                );
            if v > best {
                best = v;
            }
        }
        let result = if !any_move { -200000.0 } else { best };
        tt_put(hash, depth, result);
        result
    }

    fn expectimax_chance_flat_det(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        rng: &mut SeedRng,
        manipulate: bool,
        usage: UsageMode,
    ) -> f64 {
        if deadline_hit() || *budget == 0 {
            return Self::heuristic_flat(board, n);
        }
        let empties = board.iter().filter(|&&v| v == 0).count();
        if empties == 0 || depth == 0 {
            return Self::heuristic_flat(board, n);
        }
        let hash = mix_calls(zobrist_hash(board), rng.calls);
        if let Some(cached) = tt_get(hash, depth) {
            return cached;
        }
        *budget -= 1;
        let (idx, value, draws) =
            Self::predict_spawn_flat_with_usage(board, n, rng, manipulate, usage, budget)
                .expect("non-empty board has a spawn");
        board[idx] = value;
        let v = Self::expectimax_max_flat_det(
            board,
            n,
            depth.saturating_sub(1),
            budget,
            rng,
            manipulate,
            usage,
        );
        board[idx] = 0;
        let _ = draws;
        tt_put(hash, depth, v);
        v
    }

    fn best_move_det(
        grid: &Vec<Vec<u32>>,
        depth: usize,
        budget: &mut u64,
        rng: &mut SeedRng,
        manipulate: bool,
        usage: UsageMode,
    ) -> (Option<Direction>, f64) {
        let n = grid.len();
        let board = Self::flatten(grid);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut new_board = [0u32; 256];
        for &dir in Direction::ALL.iter() {
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(&board, n, dir, slice);
            if slice == board {
                continue;
            }
            let value = gained as f64
                + Self::expectimax_chance_flat_det(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    rng,
                    manipulate,
                    usage,
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

    pub fn suggest_move_det_for(
        grid: &Vec<Vec<u32>>,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Option<Direction> {
        Self::suggest_move_det_with_usage(grid, depth, key, calls, manipulate, UsageMode::Balanced)
    }

    fn best_move_det_adaptive(
        grid: &Vec<Vec<u32>>,
        max_depth: usize,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: UsageMode,
    ) -> Option<Direction> {
        Self::best_move_det_adaptive_val(grid, max_depth, key, calls, manipulate, usage).0
    }

    fn best_move_det_adaptive_val(
        grid: &Vec<Vec<u32>>,
        max_depth: usize,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: UsageMode,
    ) -> (Option<Direction>, f64) {
        let scale = usage.node_budget_scale();
        let total_budget_ms = usage.time_budget_ms() as f64 * DET_HARD_TIME_MULTIPLIER;
        let start = now_ms();
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut depth = 1;
        const GROWTH_SAFETY_FACTOR: f64 = 6.0;
        loop {
            let pass_start = now_ms();
            set_search_deadline(pass_start + total_budget_ms);
            let mut rng = SeedRng::init(key, calls);
            let mut budget = Self::scaled_budget_for_depth(depth, scale);
            let (dir, val) =
                Self::best_move_det(grid, depth, &mut budget, &mut rng, manipulate, usage);
            clear_search_deadline();
            let pass_elapsed = now_ms() - pass_start;
            if dir.is_some() {
                best_dir = dir;
                best_val = val;
            }
            let elapsed = now_ms() - start;
            let remaining = total_budget_ms - elapsed;
            let projected_next = pass_elapsed * GROWTH_SAFETY_FACTOR;
            if depth >= max_depth || remaining <= 0.0 || projected_next > remaining {
                break;
            }
            depth += 1;
        }
        (best_dir, best_val)
    }

    pub fn suggest_move_det_with_usage(
        grid: &Vec<Vec<u32>>,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: UsageMode,
    ) -> Option<Direction> {
        let search_depth =
            Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)))
                + DET_DEPTH_BONUS;
        Self::best_move_det_adaptive(grid, search_depth, key, calls, manipulate, usage)
    }

    pub fn suggest_move_det_guarantee(
        grid: &Vec<Vec<u32>>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: UsageMode,
    ) -> Option<Direction> {
        let board = Self::flatten(grid);
        let distinct = crate::board::count_distinct_tiles(&board);
        let base_depth = 3usize.max(distinct.saturating_sub(2));
        let target_depth = base_depth + DET_DEPTH_BONUS;
        let search_depth = Self::endgame_depth(grid, target_depth);
        Self::best_move_det_adaptive(grid, search_depth, key, calls, manipulate, usage)
    }

    pub fn suggest_action_det_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Action {
        Self::suggest_action_det_with_usage(
            grid,
            swaps_left,
            deletes_left,
            depth,
            key,
            calls,
            manipulate,
            UsageMode::Balanced,
        )
    }

    pub fn suggest_action_det_with_usage(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: UsageMode,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::auto_depth(grid)) + DET_DEPTH_BONUS;
        let scale = usage.node_budget_scale();
        let (best_dir, move_val) =
            Self::best_move_det_adaptive_val(grid, d, key, calls, manipulate, usage);
        let mut budget = Self::scaled_budget_for_depth(d, scale);

        let stuck = best_dir.is_none();
        if !stuck && !Self::is_dangerous(grid) {
            return best_dir.map(Action::Move).unwrap_or(Action::None);
        }

        const POWERUP_MARGIN: f64 = 90.0;
        let powerup_start = now_ms();
        set_search_deadline(
            powerup_start + usage.time_budget_ms() as f64 * DET_HARD_TIME_MULTIPLIER,
        );

        let mut best_delete: Option<(usize, usize)> = None;
        let mut best_delete_val = f64::NEG_INFINITY;
        if deletes_left > 0 {
            let mut delete_rng = SeedRng::init(key, calls);
            for r in 0..size {
                for c in 0..size {
                    if grid[r][c] == 0 {
                        continue;
                    }
                    let mut g = grid.clone();
                    g[r][c] = 0;
                    let v =
                        Self::best_move_det(&g, d, &mut budget, &mut delete_rng, manipulate, usage)
                            .1;
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
            let mut swap_rng = SeedRng::init(key, calls);
            let occupied: Vec<(usize, usize)> = (0..size)
                .flat_map(|r| (0..size).map(move |c| (r, c)))
                .filter(|&(r, c)| grid[r][c] != 0)
                .collect();
            for (a, b) in sampled_pairs(&occupied, 48) {
                let mut g = grid.clone();
                let tmp = g[a.0][a.1];
                g[a.0][a.1] = g[b.0][b.1];
                g[b.0][b.1] = tmp;
                let v = Self::best_move_det(&g, d, &mut budget, &mut swap_rng, manipulate, usage).1;
                if v > best_swap_val {
                    best_swap_val = v;
                    best_swap = Some((a, b));
                }
            }
        }

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
        clear_search_deadline();
        chosen
    }
}

pub(crate) fn score_spawn_candidate_flat(board: &[u32], n: usize) -> f64 {
    let log = |v: u32| -> f64 {
        if v == 0 {
            0.0
        } else {
            v.trailing_zeros() as f64
        }
    };
    let mut empty = 0.0;
    let mut smoothness = 0.0;
    let mut mono_penalty = 0.0;
    for r in 0..n {
        for c in 0..n {
            let v_raw = board[r * n + c];
            if v_raw == 0 {
                empty += 1.0;
                continue;
            }
            let v = log(v_raw);
            if c + 1 < n {
                let mut right_c = c + 1;
                while right_c < n && board[r * n + right_c] == 0 {
                    right_c += 1;
                }
                if right_c < n {
                    let rv = log(board[r * n + right_c]);
                    smoothness -= (v - rv).abs();
                    if rv > v {
                        mono_penalty += rv - v;
                    }
                }
            }
            if r + 1 < n {
                let mut down_r = r + 1;
                while down_r < n && board[down_r * n + c] == 0 {
                    down_r += 1;
                }
                if down_r < n {
                    let dv = log(board[down_r * n + c]);
                    smoothness -= (v - dv).abs();
                    if dv > v {
                        mono_penalty += dv - v;
                    }
                }
            }
        }
    }
    empty * 4.0 + smoothness - mono_penalty * 0.25
}
