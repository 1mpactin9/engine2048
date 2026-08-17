use crossterm::style::Color;
use std::fmt;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameMode {
    Play,
    AI,
    Eval,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameState {
    Playing,
    Won,
    Over,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Theme {
    Default,
    Dark,
    Ocean,
    Mono,
}

impl Theme {
    pub fn next(self) -> Self {
        match self {
            Self::Default => Self::Dark,
            Self::Dark => Self::Ocean,
            Self::Ocean => Self::Mono,
            Self::Mono => Self::Default,
        }
    }
}

impl Theme {
    #[allow(dead_code)]
    pub fn title(&self) -> Color {
        match self {
            Self::Default => Color::Cyan,
            Self::Dark => Color::Yellow,
            Self::Ocean => Color::Magenta,
            Self::Mono => Color::White,
        }
    }

    pub fn accent(&self) -> Color {
        match self {
            Self::Default => Color::Cyan,
            Self::Dark => Color::Yellow,
            Self::Ocean => Color::Magenta,
            Self::Mono => Color::White,
        }
    }

    pub fn border(&self) -> Color {
        match self {
            Self::Default => Color::DarkGrey,
            Self::Dark => Color::Grey,
            Self::Ocean => Color::DarkCyan,
            Self::Mono => Color::Grey,
        }
    }

    #[allow(dead_code)]
    pub fn muted(&self) -> Color {
        match self {
            Self::Default => Color::DarkGrey,
            Self::Dark => Color::DarkGrey,
            Self::Ocean => Color::DarkGrey,
            Self::Mono => Color::DarkGrey,
        }
    }

    pub fn win(&self) -> Color {
        match self {
            Self::Default => Color::Yellow,
            Self::Dark => Color::Green,
            Self::Ocean => Color::Cyan,
            Self::Mono => Color::White,
        }
    }

    pub fn lose(&self) -> Color {
        match self {
            Self::Default => Color::Red,
            Self::Dark => Color::Red,
            Self::Ocean => Color::Red,
            Self::Mono => Color::White,
        }
    }
}

pub const HISTORY_LEN: usize = 20;
pub const MAX_HISTORY_DISPLAY: usize = 8;
pub const SAVE_PATH: &str = ".engine-cli-save.json";
pub const REPLAY_PATH: &str = ".engine-cli-replay.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

    pub fn to_engine(self) -> engine2048::Direction {
        match self {
            Self::Up => engine2048::Direction::Up,
            Self::Down => engine2048::Direction::Down,
            Self::Left => engine2048::Direction::Left,
            Self::Right => engine2048::Direction::Right,
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Up => "↑",
            Self::Down => "↓",
            Self::Left => "←",
            Self::Right => "→",
        }
    }

    pub fn color(&self) -> Color {
        match self {
            Self::Up => Color::Cyan,
            Self::Down => Color::Yellow,
            Self::Left => Color::Green,
            Self::Right => Color::Magenta,
        }
    }

    #[allow(dead_code)]
    pub fn opposite(self) -> Self {
        match self {
            Self::Up => Self::Down,
            Self::Down => Self::Up,
            Self::Left => Self::Right,
            Self::Right => Self::Left,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Difficulty {
    Casual,
    Balanced,
    Serious,
    Godlike,
}

impl Difficulty {
    #[allow(dead_code)]
    pub const ALL: [Difficulty; 4] = [
        Difficulty::Casual,
        Difficulty::Balanced,
        Difficulty::Serious,
        Difficulty::Godlike,
    ];

    pub fn next(self) -> Self {
        match self {
            Self::Casual => Self::Balanced,
            Self::Balanced => Self::Serious,
            Self::Serious => Self::Godlike,
            Self::Godlike => Self::Casual,
        }
    }

    #[allow(dead_code)]
    pub fn depth(&self) -> usize {
        match self {
            Self::Casual => 3,
            Self::Balanced => 5,
            Self::Serious => 7,
            Self::Godlike => 9,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Casual => "Casual",
            Self::Balanced => "Balanced",
            Self::Serious => "Serious",
            Self::Godlike => "Godlike",
        }
    }

    pub fn engine_depth(&self) -> Option<usize> {
        match self {
            Self::Casual => Some(2),
            Self::Balanced => Some(4),
            Self::Serious => Some(6),
            Self::Godlike => Some(8),
        }
    }
}

pub fn tile_to_style(tile: u32) -> (Color, String) {
    match tile {
        0 => (Color::DarkGrey, "  ·  ".to_string()),
        2 => (Color::White, "   2  ".to_string()),
        4 => (Color::Yellow, "   4  ".to_string()),
        8 => (Color::Red, "   8  ".to_string()),
        16 => (Color::Magenta, "  16  ".to_string()),
        32 => (Color::Blue, "  32  ".to_string()),
        64 => (Color::Cyan, "  64  ".to_string()),
        128 => (Color::Green, " 128  ".to_string()),
        256 => (Color::White, " 256  ".to_string()),
        512 => (Color::Yellow, " 512  ".to_string()),
        1024 => (Color::Red, "1024  ".to_string()),
        2048 => (Color::Magenta, "2048  ".to_string()),
        _ => (Color::White, format!("{:>4}", tile)),
    }
}

#[derive(Debug, Clone)]
pub struct HistoryEntry {
    pub dir: Direction,
    pub gained: u64,
}

impl fmt::Display for HistoryEntry {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}+{}", self.dir.label(), self.gained)
    }
}

#[derive(Debug, Clone)]
pub struct MergeEvent {
    pub tile: u32,
    pub at: Instant,
}

impl MergeEvent {
    pub fn fresh(tile: u32) -> Self {
        Self {
            tile,
            at: Instant::now(),
        }
    }

    pub fn is_fresh(&self) -> bool {
        self.at.elapsed().as_millis() < 300
    }
}

#[derive(Debug, Clone, Default)]
pub struct GameStats {
    pub total_moves: usize,
    pub total_score: u64,
    pub best_score: u64,
    pub games_won: usize,
    pub games_over: usize,
    pub max_tile: u32,
    pub powerups_used: usize,
    pub undo_count: usize,
    pub swap_count: usize,
    pub delete_count: usize,
    pub consecutive_merges: usize,
    pub max_consecutive_merges: usize,
    pub merges_this_game: usize,
    pub milestone_1000: bool,
    pub milestone_10000: bool,
    pub milestone_50000: bool,
    pub milestone_100000: bool,
}

impl GameStats {
    pub fn record_move(&mut self, gained: u64, max_tile: u32) {
        self.total_moves += 1;
        self.total_score += gained;
        if max_tile > self.max_tile {
            self.max_tile = max_tile;
        }
        if gained >= 1000 && !self.milestone_1000 {
            self.milestone_1000 = true;
        }
        if self.total_score >= 10000 && !self.milestone_10000 {
            self.milestone_10000 = true;
        }
        if self.total_score >= 50000 && !self.milestone_50000 {
            self.milestone_50000 = true;
        }
        if self.total_score >= 100000 && !self.milestone_100000 {
            self.milestone_100000 = true;
        }
    }

    pub fn record_merge(&mut self, _tile: u32) {
        self.merges_this_game += 1;
        self.consecutive_merges += 1;
        if self.consecutive_merges > self.max_consecutive_merges {
            self.max_consecutive_merges = self.consecutive_merges;
        }
    }

    pub fn reset_move_streak(&mut self) {
        self.consecutive_merges = 0;
    }

    pub fn end_game(&mut self, won: bool) {
        if won {
            self.games_won += 1;
        } else {
            self.games_over += 1;
        }
    }

    pub fn win_rate(&self) -> f64 {
        let total = self.games_won + self.games_over;
        if total == 0 {
            0.0
        } else {
            self.games_won as f64 / total as f64 * 100.0
        }
    }

    pub fn avg_score(&self) -> f64 {
        let total = self.games_won + self.games_over;
        if total == 0 {
            0.0
        } else {
            self.total_score as f64 / total as f64
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameConfig {
    pub board_size: usize,
    pub theme: Theme,
    pub difficulty: Difficulty,
    pub show_eval: bool,
    pub show_history: bool,
    pub show_stats: bool,
    pub show_animations: bool,
    pub target_tile: u32,
    pub powerup_charges: u32,
}

impl GameConfig {
    #[allow(dead_code)]
    pub fn persist(&self) {
        use std::fs::File;
        use std::io::Write;
        let json = format!(
            "{{\"size\":{},\"theme\":\"{:?}\",\"difficulty\":\"{:?}\",\"eval\":{},\"history\":{},\"stats\":{},\"animations\":{},\"target\":{},\"charges\":{}}}",
            self.board_size, self.theme, self.difficulty, self.show_eval, self.show_history, self.show_stats, self.show_animations, self.target_tile, self.powerup_charges,
        );
        if let Ok(mut f) = File::create(SAVE_PATH) {
            let _ = f.write_all(json.as_bytes());
        }
    }
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            board_size: 4,
            theme: Theme::Default,
            difficulty: Difficulty::Balanced,
            show_eval: false,
            show_history: true,
            show_stats: true,
            show_animations: true,
            target_tile: 2048,
            powerup_charges: 3,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    #[allow(dead_code)]
    Main,
    Welcome,
    GameOver,
}

#[derive(Debug, Clone)]
pub struct SavedGame {
    pub grid: Vec<Vec<u32>>,
    pub score: u64,
    pub won: bool,
    pub over: bool,
    pub swaps_left: u32,
    pub deletes_left: u32,
    pub move_count: usize,
}

#[derive(Debug, Clone)]
pub struct TournamentConfig {
    pub games_per_run: usize,
    #[allow(dead_code)]
    pub size: usize,
    #[allow(dead_code)]
    pub difficulty: Difficulty,
}

impl Default for TournamentConfig {
    fn default() -> Self {
        Self {
            games_per_run: 10,
            size: 4,
            difficulty: Difficulty::Balanced,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ReplayEntry {
    #[allow(dead_code)]
    pub grid: Vec<Vec<u32>>,
    #[allow(dead_code)]
    pub score: u64,
    #[allow(dead_code)]
    pub dir: Direction,
    #[allow(dead_code)]
    pub gained: u64,
}
