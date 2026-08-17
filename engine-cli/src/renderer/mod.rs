use crossterm::{
    cursor,
    queue,
    style::{Color, Print, ResetColor, SetForegroundColor},
    terminal::{self, ClearType},
};
use engine2048::Engine;
use std::io::{self, Write};

use crate::types::{
    Direction, GameConfig, GameMode, GameState, GameStats, HistoryEntry,
    MAX_HISTORY_DISPLAY,
};

pub struct Renderer {
    last_message: Option<String>,
    mode: GameMode,
    game_state: GameState,
    swap_target: Option<(usize, usize)>,
    eval_scores: [Option<f64>; 4],
    history: Vec<HistoryEntry>,
    stats: GameStats,
    config: GameConfig,
    moves_this_game: usize,
    score_this_game: u64,
}

impl Renderer {
    pub fn new(config: GameConfig) -> Self {
        Self {
            last_message: None,
            mode: GameMode::Play,
            game_state: GameState::Playing,
            swap_target: None,
            eval_scores: [None; 4],
            history: Vec::new(),
            stats: GameStats::default(),
            config,
            moves_this_game: 0,
            score_this_game: 0,
        }
    }

    pub fn set_move_count(&mut self, count: usize) {
        self.moves_this_game = count;
    }

    pub fn set_game_score(&mut self, score: u64) {
        self.score_this_game = score;
    }

    pub fn record_powerup(&mut self, kind: &str) {
        match kind {
            "swap" => self.stats.swap_count += 1,
            "delete" => self.stats.delete_count += 1,
            _ => self.stats.powerups_used += 1,
        }
    }

    pub fn record_undo(&mut self) {
        self.stats.undo_count += 1;
    }

    pub fn set_eval_scores(&mut self, scores: [Option<f64>; 4]) {
        self.eval_scores = scores;
    }

    pub fn set_history(&mut self, history: Vec<HistoryEntry>) {
        self.history = history;
    }

    pub fn set_message(&mut self, msg: &str) {
        self.last_message = Some(msg.to_string());
    }

    pub fn set_mode(&mut self, mode: GameMode) {
        self.mode = mode;
    }

    pub fn set_game_state(&mut self, state: GameState) {
        self.game_state = state;
    }

    pub fn set_swap_target(&mut self, target: Option<(usize, usize)>) {
        self.swap_target = target;
    }

    pub fn set_config(&mut self, config: GameConfig) {
        self.config = config;
    }

    pub fn next_theme(&mut self) {
        self.config.theme = self.config.theme.next();
        self.last_message = Some(format!("theme: {:?}", self.config.theme));
    }

    pub fn toggle_eval(&mut self) {
        self.config.show_eval = !self.config.show_eval;
    }

    pub fn toggle_history(&mut self) {
        self.config.show_history = !self.config.show_history;
    }

    pub fn render(
        &mut self,
        writer: &mut impl Write,
        engine: &Engine,
        cursor_pos: (usize, usize),
    ) -> io::Result<()> {
        let size = self.config.board_size;
        queue!(writer, terminal::Clear(ClearType::All))?;
        self.draw_header(writer, engine, size)?;
        self.draw_board(writer, engine, cursor_pos, size)?;
        if self.config.show_eval {
            self.draw_eval_bar(writer)?;
        }
        let panel_y = 3 + size;
        if self.config.show_history && !self.history.is_empty() {
            self.draw_history_panel(writer, panel_y, size)?;
        }
        if self.config.show_stats {
            self.draw_stats_panel(writer, panel_y, size)?;
        }
        self.draw_footer(writer, size)?;
        if let Some(ref msg) = self.last_message {
            queue!(
                writer,
                cursor::MoveTo(0, (3 + size + if self.config.show_history { 5 } else { 0 }) as u16),
                Print(format!("{}", msg))
            )?;
        }
        writer.flush()?;
        Ok(())
    }

    fn draw_header(&self, writer: &mut impl Write, engine: &Engine, size: usize) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let mode_label = match self.mode {
            GameMode::Play => "PLAY",
            GameMode::AI => "AI AUTO",
            GameMode::Eval => "EVAL",
        };
        queue!(
            writer,
            SetForegroundColor(accent),
            Print(" engine2048  "),
            ResetColor,
            SetForegroundColor(Color::White),
            Print(format!("[{}] size={}x{}  ", mode_label, size, size)),
            ResetColor,
            Print(format!("score={}  ", engine.score())),
            Print(format!("moves={}  ", self.moves_this_game)),
            Print(format!("best={}", self.stats.best_score)),
            ResetColor,
            Print("\n")
        )
    }

    fn draw_board(
        &self,
        writer: &mut impl Write,
        engine: &Engine,
        cursor_pos: (usize, usize),
        size: usize,
    ) -> io::Result<()> {
        let grid = engine.grid();
        for r in 0..size {
            queue!(writer, Print("  "))?;
            for c in 0..size {
                let tile = if r < grid.len() && c < grid[r].len() {
                    grid[r][c]
                } else {
                    0
                };
                let is_cursor = (r, c) == cursor_pos;
                let is_swap_target = self.swap_target == Some((r, c));
                self.draw_tile(writer, tile, is_cursor, is_swap_target)?;
                if c < size - 1 {
                    queue!(writer, Print("  "))?;
                }
            }
            queue!(writer, Print("\n"))?;
        }
        Ok(())
    }

    fn draw_eval_bar(&self, writer: &mut impl Write) -> io::Result<()> {
        let dirs = [
            (Direction::Up, Color::Cyan),
            (Direction::Down, Color::Yellow),
            (Direction::Left, Color::Green),
            (Direction::Right, Color::Magenta),
        ];
        queue!(
            writer,
            SetForegroundColor(Color::DarkGrey),
            Print(" eval: "),
            ResetColor
        )?;
        for (i, (dir, color)) in dirs.iter().enumerate() {
            let label = match self.eval_scores[i] {
                Some(s) if s.is_nan() => "---".to_string(),
                Some(s) => format!("{:7.1}", s),
                None => "  invalid".to_string(),
            };
            queue!(
                writer,
                SetForegroundColor(*color),
                Print(dir.label()),
                ResetColor,
                Print(": "),
                SetForegroundColor(Color::White),
                Print(label),
                Print("  ")
            )?;
        }
        queue!(writer, Print("\n"))
    }

    fn draw_history_panel(
        &self,
        writer: &mut impl Write,
        _start_y: usize,
        size: usize,
    ) -> io::Result<()> {
        let theme = self.config.theme;
        let border_color = theme.border();
        let width = size * 6 + 4;
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!(
                "\n ┌{}─┐ history",
                "─".repeat(width)
            )),
            ResetColor,
            Print("\n")
        )?;
        for entry in self.history.iter().rev().take(MAX_HISTORY_DISPLAY) {
            let dir_color = entry.dir.color();
            queue!(
                writer,
                SetForegroundColor(border_color),
                Print(" │"),
                ResetColor,
                SetForegroundColor(dir_color),
                Print(format!(" {:4}", entry)),
                ResetColor,
                Print(" │\n")
            )?;
        }
        if self.history.is_empty() {
            queue!(
                writer,
                SetForegroundColor(border_color),
                Print(" │"),
                ResetColor,
                Print("     empty      │\n")
            )?;
        }
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!(" └{}─┘", "─".repeat(width))),
            ResetColor,
            Print("\n")
        )
    }

    fn draw_stats_panel(
        &self,
        writer: &mut impl Write,
        _start_y: usize,
        size: usize,
    ) -> io::Result<()> {
        let theme = self.config.theme;
        let border_color = theme.border();
        let accent = theme.accent();
        let width = size * 6 + 4;
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!(
                "\n ┌{}─┐ stats",
                "─".repeat(width)
            )),
            ResetColor,
            Print("\n")
        )?;
        let s = &self.stats;
        let rows = vec![
            (
                "games",
                format!(
                    "{}/{} won",
                    s.games_won,
                    s.games_won + s.games_over
                ),
            ),
            ("best", format!("{}", s.best_score)),
            ("max tile", format!("{}", s.max_tile)),
            ("avg score", if s.total_moves > 0 {
                format!("{:.0}", s.total_score as f64 / s.total_moves as f64)
            } else {
                "0".to_string()
            }),
            ("powerups", format!("{}/{}", s.swap_count, s.delete_count)),
            ("undos", format!("{}", s.undo_count)),
        ];
        for (label, value) in rows {
            queue!(
                writer,
                SetForegroundColor(border_color),
                Print(" │"),
                ResetColor,
                SetForegroundColor(Color::DarkGrey),
                Print(format!(" {:>8}", label)),
                ResetColor,
                SetForegroundColor(accent),
                Print(format!("  {:>10}", value)),
                ResetColor,
                Print(" │\n")
            )?;
        }
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!(" └{}─┘", "─".repeat(width))),
            ResetColor,
            Print("\n")
        )
    }

    fn draw_footer(&self, writer: &mut impl Write, size: usize) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let border_color = theme.border();
        let _width = size * 6 + 4;
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print("─".repeat(70)),
            ResetColor,
            Print("\n ")
        )?;
        let controls = vec![
            ("↑↓←→", "move", Color::Yellow),
            ("S", "swap", Color::Cyan),
            ("x", "delete", Color::Green),
            ("u", "undo", Color::Magenta),
            ("p", "mode", accent),
            ("t", "theme", accent),
            ("e/h/s", "panels", accent),
            ("z", "pause", accent),
            ("+/-", "speed", accent),
            ("r", "restart", accent),
            ("q", "quit", Color::Red),
        ];
        for (key, desc, color) in controls {
            queue!(
                writer,
                SetForegroundColor(color),
                Print(format!(" {} ", key)),
                ResetColor,
                SetForegroundColor(Color::DarkGrey),
                Print(desc),
                ResetColor,
                Print("  ")
            )?;
        }
        queue!(writer, Print("\n"))
    }

    fn draw_tile(
        &self,
        writer: &mut impl Write,
        tile: u32,
        cursor: bool,
        swap: bool,
    ) -> io::Result<()> {
        let (mut color, mut label) = crate::types::tile_to_style(tile);
        if cursor {
            color = Color::White;
            label = format!("╔{}╗", &label[1..4]);
        } else if swap {
            color = Color::Yellow;
            label = format!("[{}] ", label.trim_end());
        }
        queue!(
            writer,
            SetForegroundColor(color),
            Print(label),
            ResetColor
        )
    }
}
