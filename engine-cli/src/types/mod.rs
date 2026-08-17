use crossterm::style::Color;
use std::fmt;

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
}

impl Theme {
    pub fn next(self) -> Self {
        match self {
            Self::Default => Self::Dark,
            Self::Dark => Self::Ocean,
            Self::Ocean => Self::Default,
        }
    }

    pub fn accent(&self) -> Color {
        match self {
            Self::Default => Color::Cyan,
            Self::Dark => Color::Yellow,
            Self::Ocean => Color::Magenta,
        }
    }

    pub fn border(&self) -> Color {
        match self {
            Self::Default => Color::DarkGrey,
            Self::Dark => Color::Grey,
            Self::Ocean => Color::DarkCyan,
        }
    }
}

pub const HISTORY_LEN: usize = 20;
pub const MAX_HISTORY_DISPLAY: usize = 8;

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
}

impl GameStats {
    pub fn record_move(&mut self, gained: u64, max_tile: u32) {
        self.total_moves += 1;
        self.total_score += gained;
        if max_tile > self.max_tile {
            self.max_tile = max_tile;
        }
    }

    pub fn end_game(&mut self, won: bool) {
        if won {
            self.games_won += 1;
        } else {
            self.games_over += 1;
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameConfig {
    pub board_size: usize,
    pub theme: Theme,
    pub show_eval: bool,
    pub show_history: bool,
    pub show_stats: bool,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            board_size: 4,
            theme: Theme::Default,
            show_eval: false,
            show_history: true,
            show_stats: true,
        }
    }
}
