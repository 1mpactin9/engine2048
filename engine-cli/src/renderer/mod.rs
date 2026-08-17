use crossterm::{
    cursor,
    queue,
    style::{Color, Print, ResetColor, SetForegroundColor},
};
use engine2048::Engine;
use std::io::{self, Write};

use crate::types::{Direction, GameMode, GameState, GRID_SIZE};

pub struct Renderer {
    last_message: Option<String>,
    mode: GameMode,
    game_state: GameState,
    swap_target: Option<(usize, usize)>,
    eval_scores: [Option<f64>; 4],
}

impl Renderer {
    pub fn new() -> Self {
        Self {
            last_message: None,
            mode: GameMode::Play,
            game_state: GameState::Playing,
            swap_target: None,
            eval_scores: [None; 4],
        }
    }

    pub fn set_eval_scores(&mut self, scores: [Option<f64>; 4]) {
        self.eval_scores = scores;
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

    pub fn render(
        &mut self,
        writer: &mut impl Write,
        engine: &Engine,
        cursor_pos: (usize, usize),
    ) -> io::Result<()> {
        queue!(writer, crossterm::terminal::Clear(crossterm::terminal::ClearType::All))?;
        self.draw_title(writer, engine)?;
        self.draw_board(writer, engine, cursor_pos)?;
        if self.mode == GameMode::Eval {
            self.draw_eval_legend(writer)?;
        }
        self.draw_stats(writer, engine)?;
        self.draw_help(writer)?;
        if let Some(ref msg) = self.last_message {
            queue!(
                writer,
                cursor::MoveTo(0, 11),
                Print(format!("{}", msg))
            )?;
        }
        writer.flush()?;
        Ok(())
    }

    fn draw_title(&self, writer: &mut impl Write, engine: &Engine) -> io::Result<()> {
        let mode_label = match self.mode {
            GameMode::Play => "PLAY",
            GameMode::AI => "AI AUTO",
            GameMode::Eval => "EVAL",
        };
        queue!(
            writer,
            Print(format!(
                " engine2048  [{:3}]  size={}x{}  score={}  \n",
                mode_label, GRID_SIZE, GRID_SIZE, engine.score()
            )),
            Print("─".repeat(50))
        )
    }

    fn draw_board(
        &self,
        writer: &mut impl Write,
        engine: &Engine,
        cursor_pos: (usize, usize),
    ) -> io::Result<()> {
        let grid = engine.grid();
        for r in 0..GRID_SIZE {
            queue!(writer, Print("  "))?;
            for c in 0..GRID_SIZE {
                let tile = grid[r][c];
                let is_cursor = (r, c) == cursor_pos;
                let is_swap_target = self.swap_target == Some((r, c));
                self.draw_tile(writer, tile, is_cursor, is_swap_target)?;
                if c < GRID_SIZE - 1 {
                    queue!(writer, Print("  "))?;
                }
            }
            queue!(writer, Print("\n"))?;
        }
        Ok(())
    }

    fn draw_eval_legend(&self, writer: &mut impl Write) -> io::Result<()> {
        let dirs = [
            (Direction::Up, Color::Cyan),
            (Direction::Down, Color::Yellow),
            (Direction::Left, Color::Green),
            (Direction::Right, Color::Magenta),
        ];
        for (i, (dir, color)) in dirs.iter().enumerate() {
            let label = match self.eval_scores[i] {
                Some(s) if s.is_nan() => "---".to_string(),
                Some(s) => format!("{:7.1}", s),
                None => "  invalid".to_string(),
            };
            queue!(
                writer,
                SetForegroundColor(*color),
                Print(format!(" {}: ", dir.label())),
                ResetColor,
                Print(label),
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

    fn draw_stats(&self, writer: &mut impl Write, engine: &Engine) -> io::Result<()> {
        let msg = format!(
            "\n score: {}  won: {}  over: {}  undo: {}  swaps: {}  deletes: {}",
            engine.score(),
            engine.has_won(),
            engine.is_game_over(),
            engine.undo_available(),
            engine.swaps_left(),
            engine.deletes_left(),
        );
        queue!(writer, Print(msg), Print("\n"))
    }

    fn draw_help(&self, writer: &mut impl Write) -> io::Result<()> {
        let help = match self.game_state {
            GameState::Playing => {
                " controls: ↑↓←→ move  S swap  x delete  u undo  p mode  z pause/step  +-/ speed  q quit"
            }
            GameState::Won => {
                " *** WON ***  r restart  S/x swap/delete  z pause/step  +-/ speed  p mode  q quit"
            }
            GameState::Over => {
                " *** GAME OVER ***  r restart  S/x swap/delete  z pause/step  +-/ speed  p mode  q quit"
            }
        };
        queue!(writer, Print(help), Print("\n"))
    }
}
