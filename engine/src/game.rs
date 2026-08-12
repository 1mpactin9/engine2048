use rand::Rng;
use std::collections::VecDeque;
use std::fmt;
use crate::board as bitboard_mod;
use crate::{EvalMode, EvalConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub const ALL: [Direction; 4] = [
        Direction::Up,
        Direction::Down,
        Direction::Left,
        Direction::Right,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Move(Direction),
    Delete(usize, usize),
    Swap((usize, usize), (usize, usize)),
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    OutOfBounds,
    CellEmpty,
    NoCharges(&'static str),
    NothingToUndo,
    GameOver,
    InvalidSize,
    SamePosition,
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::OutOfBounds => write!(f, "position is outside the board"),
            EngineError::CellEmpty => write!(f, "cell is empty"),
            EngineError::NoCharges(kind) => write!(f, "no {} charges left", kind),
            EngineError::NothingToUndo => write!(f, "no history to undo"),
            EngineError::GameOver => write!(f, "game is already over"),
            EngineError::InvalidSize => write!(f, "board size must be >= 2"),
            EngineError::SamePosition => write!(f, "positions must differ"),
        }
    }
}
impl std::error::Error for EngineError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveOutcome {
    pub moved: bool,
    pub gained_score: u64,
    pub spawned: Option<(usize, usize, u32)>,
    pub game_over: bool,
    pub won: bool,
}

#[derive(Clone)]
struct Snapshot {
    grid: Vec<Vec<u32>>,
    score: u64,
    swaps_left: u32,
    delete_left: u32,
    won: bool,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub size: usize,
    pub target_tile: u32,
    pub max_undo_history: usize,
    pub swap_charges: u32,
    pub delete_charges: u32,
    pub four_probability: f64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            size: 4,
            target_tile: 2048,
            max_undo_history: 20,
            swap_charges: 3,
            delete_charges: 3,
            four_probability: 0.1,
        }
    }
}

pub struct Engine {
    pub size: usize,
    grid: Vec<Vec<u32>>,
    score: u64,
    target_tile: u32,
    four_probability: f64,
    history: VecDeque<Snapshot>,
    max_undo_history: usize,
    swaps_left: u32,
    delete_left: u32,
    won: bool,
    rng: rand::rngs::ThreadRng,
}

impl Engine {
    pub fn new(config: Config) -> Result<Self, EngineError> {
        if config.size < 2 {
            return Err(EngineError::InvalidSize);
        }
        let mut engine = Engine {
            size: config.size,
            grid: vec![vec![0u32; config.size]; config.size],
            score: 0,
            target_tile: config.target_tile,
            four_probability: config.four_probability,
            history: VecDeque::new(),
            max_undo_history: config.max_undo_history,
            swaps_left: config.swap_charges,
            delete_left: config.delete_charges,
            won: false,
            rng: rand::thread_rng(),
        };
        engine.spawn_tile();
        engine.spawn_tile();
        Ok(engine)
    }

    pub fn with_size(size: usize) -> Result<Self, EngineError> {
        Engine::new(Config {
            size,
            ..Config::default()
        })
    }
    pub fn grid(&self) -> &Vec<Vec<u32>> {
        &self.grid
    }
    pub fn score(&self) -> u64 {
        self.score
    }
    pub fn swaps_left(&self) -> u32 {
        self.swaps_left
    }
    pub fn deletes_left(&self) -> u32 {
        self.delete_left
    }
    pub fn has_won(&self) -> bool {
        self.won
    }

    pub fn set_grid(&mut self, grid: Vec<Vec<u32>>) {
        self.grid = grid;
    }

    pub fn evaluate_position(&self, mode: EvalMode) -> crate::eval::EvalResult {
        let config = mode.config();
        self.evaluate_position_with_config(&config)
    }

    pub fn evaluate_position_with_config(&self, config: &EvalConfig) -> crate::eval::EvalResult {
        let board = Self::flatten(self.grid());
        let n = self.size;
        crate::eval::compute_eval_result(&board, n, config)
    }

    pub fn tile_at(&self, r: usize, c: usize) -> Result<u32, EngineError> {
        self.grid
            .get(r)
            .and_then(|row| row.get(c))
            .copied()
            .ok_or(EngineError::OutOfBounds)
    }

    pub fn is_game_over(&self) -> bool {
        !self.any_move_possible()
    }

    pub fn empty_cells(&self) -> Vec<(usize, usize)> {
        let mut v = Vec::new();
        for r in 0..self.size {
            for c in 0..self.size {
                if self.grid[r][c] == 0 {
                    v.push((r, c));
                }
            }
        }
        v
    }

    pub fn make_move(&mut self, dir: Direction) -> Result<MoveOutcome, EngineError> {
        if self.is_game_over() {
            return Err(EngineError::GameOver);
        }
        let (new_grid, gained) = Self::slide_grid(&self.grid, dir);
        let moved = new_grid != self.grid;

        if !moved {
            return Ok(MoveOutcome {
                moved: false,
                gained_score: 0,
                spawned: None,
                game_over: self.is_game_over(),
                won: self.won,
            });
        }

        self.push_history();
        self.grid = new_grid;
        self.score += gained;

        if !self.won {
            for row in &self.grid {
                if row.iter().any(|&v| v >= self.target_tile) {
                    self.won = true;
                    break;
                }
            }
        }

        let spawned = self.spawn_tile();
        let game_over = self.is_game_over();

        Ok(MoveOutcome {
            moved: true,
            gained_score: gained,
            spawned,
            game_over,
            won: self.won,
        })
    }

    pub fn undo(&mut self) -> Result<(), EngineError> {
        match self.history.pop_back() {
            Some(snap) => {
                self.grid = snap.grid;
                self.score = snap.score;
                self.swaps_left = snap.swaps_left;
                self.delete_left = snap.delete_left;
                self.won = snap.won;
                Ok(())
            }
            None => Err(EngineError::NothingToUndo),
        }
    }

    pub fn undo_available(&self) -> usize {
        self.history.len()
    }

    pub fn swap_tiles(&mut self, a: (usize, usize), b: (usize, usize)) -> Result<(), EngineError> {
        if a == b {
            return Err(EngineError::SamePosition);
        }
        self.check_bounds(a)?;
        self.check_bounds(b)?;
        if self.swaps_left == 0 {
            return Err(EngineError::NoCharges("swap"));
        }
        if self.grid[a.0][a.1] == 0 || self.grid[b.0][b.1] == 0 {
            return Err(EngineError::CellEmpty);
        }
        self.push_history();
        let tmp = self.grid[a.0][a.1];
        self.grid[a.0][a.1] = self.grid[b.0][b.1];
        self.grid[b.0][b.1] = tmp;
        self.swaps_left -= 1;
        Ok(())
    }

    pub fn delete_tile(&mut self, pos: (usize, usize)) -> Result<(), EngineError> {
        self.check_bounds(pos)?;
        if self.delete_left == 0 {
            return Err(EngineError::NoCharges("delete"));
        }
        if self.grid[pos.0][pos.1] == 0 {
            return Err(EngineError::CellEmpty);
        }
        self.push_history();
        self.grid[pos.0][pos.1] = 0;
        self.delete_left -= 1;
        Ok(())
    }

    fn check_bounds(&self, pos: (usize, usize)) -> Result<(), EngineError> {
        if pos.0 >= self.size || pos.1 >= self.size {
            Err(EngineError::OutOfBounds)
        } else {
            Ok(())
        }
    }

    fn push_history(&mut self) {
        self.history.push_back(Snapshot {
            grid: self.grid.clone(),
            score: self.score,
            swaps_left: self.swaps_left,
            delete_left: self.delete_left,
            won: self.won,
        });
        if self.max_undo_history > 0 && self.history.len() > self.max_undo_history {
            self.history.pop_front();
        }
    }

    fn spawn_tile(&mut self) -> Option<(usize, usize, u32)> {
        let empties = self.empty_cells();
        if empties.is_empty() {
            return None;
        }
        let idx = self.rng.gen_range(0..empties.len());
        let (r, c) = empties[idx];
        let value = if self.rng.gen_bool(self.four_probability) {
            4
        } else {
            2
        };
        self.grid[r][c] = value;
        Some((r, c, value))
    }

    fn any_move_possible(&self) -> bool {
        if self.grid.iter().any(|row| row.iter().any(|&v| v == 0)) {
            return true;
        }
        let n = self.size;
        for r in 0..n {
            for c in 0..n {
                let v = self.grid[r][c];
                if c + 1 < n && self.grid[r][c + 1] == v {
                    return true;
                }
                if r + 1 < n && self.grid[r + 1][c] == v {
                    return true;
                }
            }
        }
        false
    }

    pub(crate) fn slide_grid(grid: &Vec<Vec<u32>>, dir: Direction) -> (Vec<Vec<u32>>, u64) {
        let n = grid.len();
        let mut result = vec![vec![0u32; n]; n];
        let mut gained: u64 = 0;

        let lines: Vec<Vec<(usize, usize)>> = match dir {
            Direction::Left => (0..n).map(|r| (0..n).map(|c| (r, c)).collect()).collect(),
            Direction::Right => (0..n)
                .map(|r| (0..n).rev().map(|c| (r, c)).collect())
                .collect(),
            Direction::Up => (0..n).map(|c| (0..n).map(|r| (r, c)).collect()).collect(),
            Direction::Down => (0..n)
                .map(|c| (0..n).rev().map(|r| (r, c)).collect())
                .collect(),
        };

        for line in lines {
            let values: Vec<u32> = line
                .iter()
                .map(|&(r, c)| grid[r][c])
                .filter(|&v| v != 0)
                .collect();

            let mut merged: Vec<u32> = Vec::with_capacity(values.len());
            let mut i = 0;
            while i < values.len() {
                if i + 1 < values.len() && values[i] == values[i + 1] {
                    let m = values[i] * 2;
                    merged.push(m);
                    gained += m as u64;
                    i += 2;
                } else {
                    merged.push(values[i]);
                    i += 1;
                }
            }
            while merged.len() < n {
                merged.push(0);
            }

            for (k, &(r, c)) in line.iter().enumerate() {
                result[r][c] = merged[k];
            }
        }

        (result, gained)
    }

    pub fn suggest_move(&self, depth: Option<usize>) -> Option<Direction> {
        Self::suggest_move_for(&self.grid, depth)
    }

    pub fn suggest_move_for_usage(
        &self,
        depth: Option<usize>,
        usage: crate::UsageMode,
    ) -> Option<Direction> {
        Self::suggest_move_with_usage(&self.grid, depth, usage)
    }

    pub fn suggest_move_for_guarantee(&self, usage: crate::UsageMode) -> Option<Direction> {
        Self::suggest_move_guarantee(&self.grid, usage)
    }

    pub fn suggest_move_for_det_guarantee(
        &self,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
        usage: crate::UsageMode,
    ) -> Option<Direction> {
        Self::suggest_move_det_guarantee(&self.grid, key, calls, manipulate, usage)
    }

    pub fn suggest_move_with_eval(
        &self,
        depth: Option<usize>,
        mode: EvalMode,
    ) -> Option<Direction> {
        Self::suggest_move_with_eval_for(&self.grid, depth, mode)
    }

    pub fn suggest_move_with_eval_for(
        grid: &Vec<Vec<u32>>,
        _depth: Option<usize>,
        mode: EvalMode,
    ) -> Option<Direction> {
        let config = mode.config();
        let board = Self::flatten(grid);
        let n = grid.len();

        let mut best_dir = None;
        let mut best_score = f64::NEG_INFINITY;

        for &dir in Direction::ALL.iter() {
            let (new_board, _) = Self::slide_flat(&board, n, dir);
            if new_board == board {
                continue;
            }

            let result = crate::eval::compute_eval_result(&new_board, n, &config);
            if result.score > best_score {
                best_score = result.score;
                best_dir = Some(dir);
            }
        }

        best_dir
    }
    pub(crate) fn flatten(grid: &Vec<Vec<u32>>) -> Vec<u32> {
        let n = grid.len();
        let mut out = Vec::with_capacity(n * n);
        for row in grid {
            out.extend_from_slice(row);
        }
        out
    }

    pub fn auto_play_step(
        &mut self,
        depth: Option<usize>,
    ) -> Option<Result<MoveOutcome, EngineError>> {
        self.suggest_move(depth).map(|dir| self.make_move(dir))
    }

    pub fn auto_play_step_with_usage(
        &mut self,
        depth: Option<usize>,
        usage: crate::UsageMode,
    ) -> Option<Result<MoveOutcome, EngineError>> {
        self.suggest_move_for_usage(depth, usage)
            .map(|dir| self.make_move(dir))
    }

    pub(crate) fn slide_flat(board: &[u32], n: usize, dir: Direction) -> (Vec<u32>, u64) {
        let mut result = vec![0u32; n * n];
        let gained = Self::slide_flat_into(board, n, dir, &mut result);
        (result, gained)
    }

    pub(crate) fn slide_flat_into(board: &[u32], n: usize, dir: Direction, result: &mut [u32]) -> u64 {
        if let Some(gained) = bitboard_mod::slide_bits_into(board, n, dir, result) {
            return gained;
        }
        const MAX_LINE: usize = 256;
        let cap = n.min(MAX_LINE);
        let mut gained: u64 = 0;
        for i in 0..n {
            let mut values = [0u32; MAX_LINE];
            let mut v_count = 0;
            for j in 0..n {
                let idx = match dir {
                    Direction::Left => i * n + j,
                    Direction::Right => i * n + (n - 1 - j),
                    Direction::Up => j * n + i,
                    Direction::Down => (n - 1 - j) * n + i,
                };
                if board[idx] != 0 && v_count < cap {
                    values[v_count] = board[idx];
                    v_count += 1;
                }
            }

            let mut merged = [0u32; MAX_LINE];
            let mut m_count = 0;
            let mut k = 0;
            while k < v_count {
                if k + 1 < v_count && values[k] == values[k + 1] {
                    let m = values[k] * 2;
                    merged[m_count] = m;
                    gained += m as u64;
                    m_count += 1;
                    k += 2;
                } else {
                    merged[m_count] = values[k];
                    m_count += 1;
                    k += 1;
                }
            }

            for j in 0..n {
                let idx = match dir {
                    Direction::Left => i * n + j,
                    Direction::Right => i * n + (n - 1 - j),
                    Direction::Up => j * n + i,
                    Direction::Down => (n - 1 - j) * n + i,
                };
                result[idx] = if j < m_count { merged[j] } else { 0 };
            }
        }
        gained
    }

}
