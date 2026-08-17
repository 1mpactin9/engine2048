use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEventKind},
    queue,
    style::Color,
    terminal::{self, ClearType, EnterAlternateScreen, LeaveAlternateScreen},
};
use engine2048::{Config, Direction, Engine, EvalMode};
use std::io::{self, Write};

const GRID_SIZE: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GameMode {
    Play,
    AI,
    Eval,
}

struct App {
    engine: Engine,
    mode: GameMode,
    running: bool,
    last_message: Option<String>,
    cursor: (usize, usize),
    game_state: GameState,
    swap_target: Option<(usize, usize)>,
    last_dir: Direction,
    ai_delay: u64,
    ai_paused: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GameState {
    Playing,
    Won,
    Over,
}

impl App {
    fn new() -> Result<Self, engine2048::EngineError> {
        let engine = Engine::new(Config {
            size: GRID_SIZE,
            swap_charges: 3,
            delete_charges: 3,
            ..Config::default()
        })?;
        Ok(App {
            engine,
            mode: GameMode::Play,
            running: true,
            last_message: None,
            cursor: (0, 0),
            game_state: GameState::Playing,
            swap_target: None,
            last_dir: Direction::Up,
            ai_delay: 100,
            ai_paused: false,
        })
    }

    fn render(&mut self, writer: &mut impl Write) -> io::Result<()> {
        queue!(writer, terminal::Clear(ClearType::All))?;
        self.draw_title(writer)?;
        self.draw_board(writer)?;
        self.draw_stats(writer)?;
        self.draw_help(writer)?;
        if let Some(ref msg) = self.last_message {
            queue!(writer, cursor::MoveTo(0, 10), crossterm::style::Print(format!("{}", msg)))?;
        }
        writer.flush()?;
        Ok(())
    }

    fn draw_title(&self, writer: &mut impl Write) -> io::Result<()> {
        let mode_label = match self.mode {
            GameMode::Play => "PLAY",
            GameMode::AI => "AI AUTO",
            GameMode::Eval => "EVAL",
        };
        queue!(
            writer,
            crossterm::style::Print(format!(
                " engine2048  [{:3}]  size={}x{}  move={}  \n",
                mode_label, GRID_SIZE, GRID_SIZE, self.engine.score()
            )),
            crossterm::style::Print("─".repeat(50))
        )
    }

    fn draw_board(&self, writer: &mut impl Write) -> io::Result<()> {
        let grid = self.engine.grid();
        for r in 0..GRID_SIZE {
            queue!(writer, crossterm::style::Print("  "))?;
            for c in 0..GRID_SIZE {
                let tile = grid[r][c];
                let is_cursor = (r, c) == self.cursor;
                let is_swap_target = self.swap_target == Some((r, c));
                self.draw_tile(writer, tile, is_cursor, is_swap_target)?;
                if c < GRID_SIZE - 1 {
                    queue!(writer, crossterm::style::Print("  "))?;
                }
            }
            queue!(writer, crossterm::style::Print("\n"))?;
        }
        Ok(())
    }

    fn draw_tile(&self, writer: &mut impl Write, tile: u32, cursor: bool, swap: bool) -> io::Result<()> {
        let (color, label) = tile_to_style(tile);
        let (color, label) = if cursor {
            (Color::White, format!("╔{}╗", &label[1..4]))
        } else if swap {
            (Color::Yellow, format!("[{}] ", label.trim_end()))
        } else {
            (color, label)
        };
        queue!(
            writer,
            crossterm::style::SetForegroundColor(color),
            crossterm::style::Print(label),
            crossterm::style::ResetColor
        )
    }

    fn draw_stats(&self, writer: &mut impl Write) -> io::Result<()> {
        let msg = format!(
            "\n score: {}  won: {}  over: {}  undo: {}  swaps: {}  deletes: {}",
            self.engine.score(),
            self.engine.has_won(),
            self.engine.is_game_over(),
            self.engine.undo_available(),
            self.engine.swaps_left(),
            self.engine.deletes_left(),
        );
        queue!(writer, crossterm::style::Print(msg), crossterm::style::Print("\n"))
    }

    fn draw_help(&self, writer: &mut impl Write) -> io::Result<()> {
        let help = match self.game_state {
            GameState::Playing => " controls: ↑↓←→ move  s swap  x delete  u undo  p mode  z pause/step  +-/ speed  q quit",
            GameState::Won => " *** WON ***  r restart  s/x swap/delete  z pause/step  +-/ speed  p mode  q quit",
            GameState::Over => " *** GAME OVER ***  r restart  s/x swap/delete  z pause/step  +-/ speed  p mode  q quit",
        };
        queue!(writer, crossterm::style::Print(help), crossterm::style::Print("\n"))
    }

    fn handle_input(&mut self, key: KeyCode) -> io::Result<()> {
        match key {
            KeyCode::Char('q') | KeyCode::Esc => {
                self.running = false;
            }
            KeyCode::Char('p') => {
                self.mode = match self.mode {
                    GameMode::Play => GameMode::AI,
                    GameMode::AI => GameMode::Eval,
                    GameMode::Eval => GameMode::Play,
                };
                self.last_message = Some(format!("mode: {:?}", self.mode));
            }
            KeyCode::Char('u') => {
                match self.engine.undo() {
                    Ok(()) => self.last_message = Some("undone".to_string()),
                    Err(e) => self.last_message = Some(format!("{}", e)),
                }
            }
            KeyCode::Up | KeyCode::Char('w') => {
                self.last_dir = Direction::Up;
                self.move_cursor(-1, 0);
                if self.game_state == GameState::Playing && self.swap_target.is_none() {
                    self.do_move(Direction::Up)?;
                }
            }
            KeyCode::Down | KeyCode::Char('s') => {
                // 's' is used for swap; only move cursor/down when swap_target is active
                if self.swap_target.is_some() {
                    self.last_dir = Direction::Down;
                    self.move_cursor(1, 0);
                    if self.game_state == GameState::Playing {
                        self.do_move(Direction::Down)?;
                    }
                } else {
                    self.last_dir = Direction::Down;
                    self.move_cursor(1, 0);
                }
            }
            KeyCode::Left | KeyCode::Char('a') => {
                self.last_dir = Direction::Left;
                self.move_cursor(0, -1);
                if self.game_state == GameState::Playing && self.swap_target.is_none() {
                    self.do_move(Direction::Left)?;
                }
            }
            KeyCode::Right | KeyCode::Char('d') => {
                self.last_dir = Direction::Right;
                self.move_cursor(0, 1);
                if self.game_state == GameState::Playing && self.swap_target.is_none() {
                    self.do_move(Direction::Right)?;
                }
            }
            KeyCode::Char('r') => {
                if self.game_state != GameState::Playing {
                    self.restart();
                }
            }
            KeyCode::Char('z') => {
                if self.mode == GameMode::AI {
                    self.ai_paused = !self.ai_paused;
                    self.last_message = Some(if self.ai_paused { "paused" } else { "resumed" }.to_string());
                }
            }
            KeyCode::Char('+') | KeyCode::Char('=') => {
                self.ai_delay = self.ai_delay.saturating_sub(20).max(5);
                self.last_message = Some(format!("speed: {}ms", self.ai_delay));
            }
            KeyCode::Char('-') => {
                self.ai_delay = self.ai_delay.saturating_add(20);
                self.last_message = Some(format!("speed: {}ms", self.ai_delay));
            }
            KeyCode::Char('S') => {
                // Shift+s for swap — select/confirm swap target
                if self.game_state != GameState::Playing {
                    return Ok(());
                }
                let (sr, sc) = self.cursor;
                match self.swap_target {
                    Some((tr, tc)) if (tr, tc) != (sr, sc) => {
                        match self.engine.swap_tiles((tr, tc), (sr, sc)) {
                            Ok(()) => {
                                self.swap_target = None;
                                self.last_message = Some("swapped".to_string());
                            }
                            Err(e) => {
                                self.swap_target = None;
                                self.last_message = Some(format!("{}", e));
                            }
                        }
                    }
                    _ => {
                        self.swap_target = Some((sr, sc));
                        self.last_message = Some("swap target selected — move to other tile".to_string());
                    }
                }
            }
            KeyCode::Char('x') => {
                // Delete tile at cursor
                if self.game_state != GameState::Playing {
                    return Ok(());
                }
                let (r, c) = self.cursor;
                match self.engine.delete_tile((r, c)) {
                    Ok(()) => self.last_message = Some("deleted".to_string()),
                    Err(e) => self.last_message = Some(format!("{}", e)),
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn move_cursor(&mut self, dr: isize, dc: isize) {
        let r = (self.cursor.0 as isize + dr).clamp(0, GRID_SIZE as isize - 1) as usize;
        let c = (self.cursor.1 as isize + dc).clamp(0, GRID_SIZE as isize - 1) as usize;
        self.cursor = (r, c);
    }

    fn restart(&mut self) {
        if let Ok(e) = Engine::new(Config {
            size: GRID_SIZE,
            swap_charges: 3,
            delete_charges: 3,
            ..Config::default()
        }) {
            self.engine = e;
            self.cursor = (0, 0);
            self.swap_target = None;
            self.game_state = GameState::Playing;
            self.ai_paused = false;
            self.last_message = Some("restarted".to_string());
        }
    }

    fn do_move(&mut self, dir: Direction) -> io::Result<()> {
        match self.mode {
            GameMode::Play => {
                match self.engine.make_move(dir) {
                    Ok(outcome) => {
                        if outcome.moved {
                            self.last_message = Some(format!(
                                "move {:?} (+{} pts)",
                                dir, outcome.gained_score
                            ));
                            if outcome.won {
                                self.game_state = GameState::Won;
                                self.last_message =
                                    Some("*** YOU WON! ***".to_string());
                            } else if outcome.game_over {
                                self.game_state = GameState::Over;
                                self.last_message =
                                    Some("*** GAME OVER ***".to_string());
                            }
                        } else {
                            self.last_message = Some(format!("no move in {:?}", dir));
                        }
                    }
                    Err(e) => self.last_message = Some(format!("{}", e)),
                }
            }
            GameMode::AI => {
                let dir = self.engine.suggest_move(Some(6)).unwrap_or(dir);
                match self.engine.make_move(dir) {
                    Ok(outcome) => {
                        self.last_message = Some(format!(
                            "ai {:?} (+{} pts)",
                            dir, outcome.gained_score
                        ));
                        if outcome.game_over {
                            self.game_state = if outcome.won {
                                GameState::Won
                            } else {
                                GameState::Over
                            };
                            self.last_message =
                                Some(format!("ai game over (score={})", self.engine.score()));
                        }
                    }
                    Err(e) => self.last_message = Some(format!("{}", e)),
                }
            }
            GameMode::Eval => {
                let result = self.engine.evaluate_position(EvalMode::Balanced);
                self.last_message = Some(format!(
                    "eval: score={:.2} depth={} nodes={}",
                    result.score, result.depth_reached, result.nodes_evaluated
                ));
            }
        }
        Ok(())
    }

    fn do_ai_step(&mut self) -> io::Result<()> {
        if self.game_state != GameState::Playing {
            return Ok(());
        }
        let dir = self.engine.suggest_move(Some(6)).unwrap_or(self.last_dir);
        match self.engine.make_move(dir) {
            Ok(outcome) => {
                if outcome.moved {
                    self.last_message = Some(format!(
                        "ai {:?} (+{} pts)",
                        dir, outcome.gained_score
                    ));
                    if outcome.won {
                        self.game_state = GameState::Won;
                        self.last_message =
                            Some("*** YOU WON! ***".to_string());
                    } else if outcome.game_over {
                        self.game_state = GameState::Over;
                        self.last_message =
                            Some("*** GAME OVER ***".to_string());
                    }
                } else {
                    self.game_state = GameState::Over;
                    self.last_message = Some("*** GAME OVER ***".to_string());
                }
            }
            Err(e) => self.last_message = Some(format!("{}", e)),
        }
        Ok(())
    }
}

fn tile_to_style(tile: u32) -> (Color, String) {
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

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut stdout = io::stdout();
    terminal::enable_raw_mode()?;
    queue!(stdout, EnterAlternateScreen)?;

    let mut app = App::new()?;
    let mut ai_timer = std::time::Instant::now();

    while app.running {
        app.render(&mut stdout)?;

        let wait = if app.mode == GameMode::AI && app.game_state == GameState::Playing && !app.ai_paused {
            let delay = app.ai_delay;
            if ai_timer.elapsed().as_millis() < delay as u128 {
                Some(delay)
            } else {
                ai_timer = std::time::Instant::now();
                app.do_ai_step()?;
                None
            }
        } else {
            None
        };

        if event::poll(std::time::Duration::from_millis(wait.unwrap_or(50)))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    app.handle_input(key.code)?;
                }
            }
        }
    }

    queue!(stdout, LeaveAlternateScreen)?;
    terminal::disable_raw_mode()?;
    stdout.flush()?;
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}
