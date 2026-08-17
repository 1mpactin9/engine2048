use crossterm::{
    cursor,
    queue,
    style::{Color, Print, ResetColor, SetForegroundColor},
    terminal::{self, ClearType},
};
use engine2048::Engine;
use std::io::{self, Write};

use crate::types::{
    Direction, GameConfig, GameMode, GameState, GameStats, HistoryEntry, MergeEvent,
    Screen, TournamentConfig, HISTORY_LEN, MAX_HISTORY_DISPLAY,
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
    merges: Vec<MergeEvent>,
    move_count: usize,
    score_this_game: u64,
    screen: Screen,
    frame: u64,
    pub target_tile: u32,
    pub ai_paused: bool,
    pub ai_delay: u64,
    pub recording: bool,
    pub tournament_wins: usize,
    pub tournament_config: TournamentConfig,
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
            merges: Vec::new(),
            move_count: 0,
            score_this_game: 0,
            screen: Screen::Welcome,
            frame: 0,
            target_tile: 2048,
            ai_paused: false,
            ai_delay: 100,
            recording: false,
            tournament_wins: 0,
            tournament_config: TournamentConfig::default(),
        }
    }

    pub fn advance_frame(&mut self) {
        self.frame += 1;
    }

    pub fn set_move_count(&mut self, count: usize) {
        self.move_count = count;
    }

    pub fn set_game_score(&mut self, score: u64) {
        self.score_this_game = score;
    }

    pub fn record_merge(&mut self, tile: u32) {
        self.merges.push(MergeEvent::fresh(tile));
        if self.merges.len() > 5 {
            self.merges.drain(..self.merges.len() - 5);
        }
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
        self.last_message =
            Some(format!("theme: {:?}", self.config.theme));
    }

    pub fn next_difficulty(&mut self) {
        self.config.difficulty = self.config.difficulty.next();
        self.last_message =
            Some(format!("difficulty: {}", self.config.difficulty.label()));
    }

    pub fn toggle_eval(&mut self) {
        self.config.show_eval = !self.config.show_eval;
    }

    pub fn toggle_history(&mut self) {
        self.config.show_history = !self.config.show_history;
    }

    #[allow(dead_code)]
    pub fn toggle_stats(&mut self) {
        self.config.show_stats = !self.config.show_stats;
    }

    pub fn toggle_animations(&mut self) {
        self.config.show_animations = !self.config.show_animations;
    }

    pub fn show_game_over(&mut self) {
        self.screen = Screen::GameOver;
    }

    pub fn show_welcome(&mut self) {
        self.screen = Screen::Welcome;
    }

    #[allow(dead_code)]
    pub fn hide_overlay(&mut self) {
        self.screen = Screen::Main;
    }

    pub fn show_replay(&mut self, on: bool) {
        self.recording = on;
    }

    pub fn set_tournament_wins(&mut self, wins: usize) {
        self.tournament_wins = wins;
    }

    pub fn set_tournament_config(&mut self, cfg: TournamentConfig) {
        self.tournament_config = cfg;
    }

    pub fn render(
        &mut self,
        writer: &mut impl Write,
        engine: &Engine,
        cursor_pos: (usize, usize),
    ) -> io::Result<()> {
        let size = self.config.board_size;
        queue!(writer, terminal::Clear(ClearType::All))?;

        if self.screen == Screen::Welcome {
            self.draw_welcome(writer, size)?;
        } else if self.screen == Screen::GameOver {
            self.draw_game_over(writer, engine, size)?;
        } else {
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
            if self.config.show_animations && !self.merges.is_empty() {
                self.draw_merge_indicator(writer)?;
            }
            self.draw_footer(writer, size)?;
        }

        if let Some(ref msg) = self.last_message {
            let y = if self.screen == Screen::Welcome || self.screen == Screen::GameOver {
                20
            } else {
                (3 + size + if self.config.show_history { 5 } else { 0 }) as u16
            };
            queue!(
                writer,
                cursor::MoveTo(0, y),
                Print(format!("{}", msg))
            )?;
        }

        writer.flush()?;
        Ok(())
    }

    fn draw_welcome(&self, writer: &mut impl Write, _size: usize) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let border = theme.border();
        let w = 52;
        let h = 18;
        let cx = (80 - w) / 2;
        let cy = (24 - h) / 2;

        let box_chars = [
            ("TL", "╔"),
            ("TR", "╗"),
            ("BL", "╚"),
            ("BR", "╝"),
            ("H", "─"),
            ("V", "║"),
        ];
        let _ = box_chars;

        queue!(
            writer,
            cursor::MoveTo(cx as u16, cy as u16),
            SetForegroundColor(border),
            Print(format!("╔{}╗", "─".repeat(w))),
            Print("\n")
        )?;

        let title = " engine2048 ";
        queue!(
            writer,
            SetForegroundColor(accent),
            Print(format!(
                "║{}{:^w$}{}║\n",
                " ", title, " ",
            )),
            ResetColor
        )?;

        let subtitle = "Terminal 2048 AI Playground";
        queue!(
            writer,
            SetForegroundColor(Color::DarkGrey),
            Print(format!("║{}{:^w$}{}║\n", " ", subtitle, " ")),
            ResetColor
        )?;

        queue!(
            writer,
            SetForegroundColor(border),
            Print("║"),
            ResetColor,
            Print(format!("{}\n", "─".repeat(w))),
            SetForegroundColor(border),
            Print("║")
        )?;

        let controls = vec![
            ("↑↓←→ / WASD", "move tile"),
            ("S (shift)", "swap power-up"),
            ("x", "delete power-up"),
            ("u", "undo last move"),
            ("p", "toggle mode (play/AI/eval)"),
            ("t", "cycle color theme"),
            ("d", "cycle AI difficulty"),
            ("e/h/s", "toggle eval/history/stats panels"),
            ("a", "toggle animations"),
            ("z", "pause/resume AI"),
            ("+ / -", "adjust AI speed"),
            ("1/2/3", "board size: 3x3 / 4x4 / 5x5"),
            ("r", "restart game"),
            ("q / Esc", "quit"),
        ];

        for (key, desc) in controls {
            queue!(
                writer,
                SetForegroundColor(border),
                Print("║"),
                ResetColor,
                SetForegroundColor(accent),
                Print(format!("{:>14}", key)),
                ResetColor,
                SetForegroundColor(Color::White),
                Print("  "),
                ResetColor,
                SetForegroundColor(Color::DarkGrey),
                Print(desc),
                ResetColor,
                Print(" ║\n")
            )?;
        }

        queue!(
            writer,
            SetForegroundColor(border),
            Print(format!("╚{}╝", "─".repeat(w))),
            ResetColor
        )?;

        Ok(())
    }

    fn draw_game_over(
        &self,
        writer: &mut impl Write,
        engine: &Engine,
        _size: usize,
    ) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let border = theme.border();
        let w = 52;
        let _h = 14;
        let cx = (80 - w) / 2;
        let cy = 10;

        let title = if self.game_state == GameState::Won {
            " *** YOU WON! ***"
        } else {
            " *** GAME OVER ***"
        };

        queue!(
            writer,
            cursor::MoveTo(cx as u16, cy as u16),
            SetForegroundColor(border),
            Print(format!("╔{}╗", "─".repeat(w))),
            Print("\n")
        )?;

        queue!(
            writer,
            SetForegroundColor(if self.game_state == GameState::Won {
                theme.win()
            } else {
                theme.lose()
            }),
            Print(format!("║{:^w$}║\n", title)),
            ResetColor
        )?;

        queue!(
            writer,
            SetForegroundColor(border),
            Print("║"),
            ResetColor,
            Print(format!("{}\n", "─".repeat(w))),
            SetForegroundColor(border),
            Print("║")
        )?;

        let stats = vec![
            ("score", format!("{}", engine.score())),
            ("moves", format!("{}", self.move_count)),
            ("best", format!("{}", self.stats.best_score)),
            ("max tile", format!("{}", self.stats.max_tile)),
            ("merges", format!("{}", self.stats.merges_this_game)),
            ("best merge", format!(
                "{}",
                self.merges
                    .iter()
                    .map(|m| m.tile)
                    .max()
                    .unwrap_or(0)
            )),
            ("win rate", format!("{:.1}%", self.stats.win_rate())),
            ("avg score", format!("{:.0}", self.stats.avg_score())),
        ];

        for (label, value) in stats {
            queue!(
                writer,
                SetForegroundColor(border),
                Print("║"),
                ResetColor,
                SetForegroundColor(Color::DarkGrey),
                Print(format!("{:>14}", label)),
                ResetColor,
                SetForegroundColor(accent),
                Print(format!("  {:>12}", value)),
                ResetColor,
                Print(" ║\n")
            )?;
        }

        queue!(
            writer,
            SetForegroundColor(border),
            Print(format!("╚{}╝", "─".repeat(w))),
            ResetColor
        )?;

        Ok(())
    }

    fn draw_header(
        &self,
        writer: &mut impl Write,
        engine: &Engine,
        size: usize,
    ) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let diff = self.config.difficulty;
        let mode_label = match self.mode {
            GameMode::Play => "PLAY",
            GameMode::AI => "AI",
            GameMode::Eval => "EVAL",
        };
        let ai_state = if self.mode == GameMode::AI {
            if self.ai_paused {
                " [PAUSED]"
            } else {
                ""
            }
        } else {
            ""
        };
        let save_state = if self.recording { " [RECORD]" } else { "" };
        let tournament_state = if self.tournament_wins > 0 || self.tournament_config.games_per_run > 0 {
            format!(
                " [TOURNAMENT {}/{}]",
                self.tournament_wins, self.tournament_config.games_per_run
            )
        } else {
            String::new()
        };
        queue!(
            writer,
            SetForegroundColor(accent),
            Print(" engine2048"),
            ResetColor,
            Print(format!(
                "  [{}]  {}x{}  {}  mode:{}  difficulty:{}  speed:{}ms",
                mode_label, size, size, engine.score(), diff.label(), self.ai_delay, ai_state
            )),
            Print(&tournament_state),
            Print(save_state),
            Print("\n"),
            SetForegroundColor(theme.border()),
            Print("─".repeat(78))
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
        let w = size * 6 + 4;
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!("\n ┌{}─┐ history (last {})", "─".repeat(w), HISTORY_LEN)),
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
                Print("      empty      │\n")
            )?;
        }
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!(" └{}─┘", "─".repeat(w))),
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
        let w = size * 6 + 4;
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print(format!("\n ┌{}─┐ stats", "─".repeat(w))),
            ResetColor,
            Print("\n")
        )?;
        let s = &self.stats;
        let rows = vec![
            ("games", format!("{}/{} won", s.games_won, s.games_won + s.games_over)),
            ("win rate", format!("{:.1}%", s.win_rate())),
            ("best", format!("{}", s.best_score)),
            ("max tile", format!("{}", s.max_tile)),
            ("avg score", format!("{:.0}", s.avg_score())),
            ("merges", format!("{}", s.merges_this_game)),
            ("consec", format!("{}/{}", s.consecutive_merges, s.max_consecutive_merges)),
            ("powerups", format!("s{} d{}", s.swap_count, s.delete_count)),
            ("undos", format!("{}", s.undo_count)),
            ("milestones", format!(
                "{}/{}/{}",
                if s.milestone_1000 { "✓" } else { "✗" },
                if s.milestone_10000 { "✓" } else { "✗" },
                if s.milestone_50000 { "✓" } else { "✗" },
            )),
        ];
        for (label, value) in rows {
            queue!(
                writer,
                SetForegroundColor(border_color),
                Print(" │"),
                ResetColor,
                SetForegroundColor(Color::DarkGrey),
                Print(format!(" {:>10}", label)),
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
            Print(format!(" └{}─┘", "─".repeat(w))),
            ResetColor,
            Print("\n")
        )
    }

    fn draw_merge_indicator(&self, writer: &mut impl Write) -> io::Result<()> {
        let fresh: Vec<&MergeEvent> = self.merges.iter().filter(|m| m.is_fresh()).collect();
        if fresh.is_empty() {
            return Ok(());
        }
        let last = fresh.last().unwrap();
        queue!(
            writer,
            SetForegroundColor(Color::Yellow),
            Print(format!("\n ✦ merge! {} ", last.tile)),
            ResetColor,
            Print("\n")
        )
    }

    fn draw_footer(&self, writer: &mut impl Write, _size: usize) -> io::Result<()> {
        let theme = self.config.theme;
        let accent = theme.accent();
        let border_color = theme.border();
        queue!(
            writer,
            SetForegroundColor(border_color),
            Print("─".repeat(78)),
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
            ("d", "difficulty", accent),
            ("e", "eval panel", accent),
            ("h", "history panel", accent),
            ("s", "stats panel", accent),
            ("a", "animations", accent),
            ("z", "pause AI", accent),
            ("+/-", "AI speed", accent),
            ("1/2/3/0", "size 3-8", accent),
            ("g", "save game", accent),
            ("l", "load game", accent),
            ("R", "record replay", accent),
            ("T", "tournament", accent),
            ("o", "target tile", accent),
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
