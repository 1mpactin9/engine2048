use crossterm::style::Color;

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

pub const GRID_SIZE: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub fn to_engine(self) -> engine2048::Direction {
        match self {
            Self::Up => engine2048::Direction::Up,
            Self::Down => engine2048::Direction::Down,
            Self::Left => engine2048::Direction::Left,
            Self::Right => engine2048::Direction::Right,
        }
    }

    pub const ALL: [Direction; 4] = [Direction::Up, Direction::Down, Direction::Left, Direction::Right];

    pub fn label(&self) -> &str {
        match self {
            Self::Up => "↑",
            Self::Down => "↓",
            Self::Left => "←",
            Self::Right => "→",
        }
    }
}

pub fn tile_to_style(tile: u32) -> (Color, String) {
    match tile {
        0 => (Color::DarkGrey, "  .  ".to_string()),
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

pub const HISTORY_LEN: usize = 10;

#[derive(Debug, Clone)]
pub struct HistoryEntry {
    pub dir: Direction,
    pub gained: u64,
}

impl HistoryEntry {
    pub fn to_string(&self) -> String {
        format!("{} +{}", self.dir.label(), self.gained)
    }
}
