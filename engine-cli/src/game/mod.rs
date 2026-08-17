use engine2048::{Config, Engine, EvalMode};
use std::io::{self, Write};

use crate::types::{Direction, GameMode, GameState, GRID_SIZE, HistoryEntry};

use super::renderer::Renderer;

pub struct Game {
    pub engine: Engine,
    pub mode: GameMode,
    pub game_state: GameState,
    pub running: bool,
    pub cursor: (usize, usize),
    pub swap_target: Option<(usize, usize)>,
    pub last_dir: Direction,
    pub ai_delay: u64,
    pub ai_paused: bool,
    pub renderer: Renderer,
    pub eval_scores: [f64; 4],
    pub history: Vec<HistoryEntry>,
}

impl Game {
    pub fn new() -> io::Result<Self> {
        let engine = Engine::new(Config {
            size: GRID_SIZE,
            swap_charges: 3,
            delete_charges: 3,
            ..Config::default()
        })
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        Ok(Self {
            engine,
            mode: GameMode::Play,
            game_state: GameState::Playing,
            running: true,
            cursor: (0, 0),
            swap_target: None,
            last_dir: Direction::Up,
            ai_delay: 100,
            ai_paused: false,
            eval_scores: [0.0; 4],
            history: Vec::new(),
            renderer: Renderer::new(),
        })
    }

    pub fn render(&mut self, writer: &mut impl Write) -> io::Result<()> {
        if self.mode == GameMode::Eval {
            self.compute_eval_scores();
            let scores: [Option<f64>; 4] = self.eval_scores.map(|s| Some(s));
            self.renderer.set_eval_scores(scores);
        }
        self.renderer.set_history(self.history.clone());
        self.renderer.set_mode(self.mode);
        self.renderer.set_game_state(self.game_state);
        self.renderer.set_swap_target(self.swap_target);
        self.renderer.render(writer, &self.engine, self.cursor)
    }

    pub fn handle_input(&mut self, key: crossterm::event::KeyCode) -> io::Result<()> {
        use crossterm::event::KeyCode;
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
                self.renderer
                    .set_message(&format!("mode: {:?}", self.mode));
            }
            KeyCode::Char('u') => {
                match self.engine.undo() {
                    Ok(()) => self.renderer.set_message("undone"),
                    Err(e) => self.renderer.set_message(&format!("{}", e)),
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
                self.last_dir = Direction::Down;
                self.move_cursor(1, 0);
                if self.swap_target.is_some() && self.game_state == GameState::Playing {
                    self.do_move(Direction::Down)?;
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
                    self.renderer
                        .set_message(if self.ai_paused { "paused" } else { "resumed" });
                }
            }
            KeyCode::Char('+') | KeyCode::Char('=') => {
                self.ai_delay = self.ai_delay.saturating_sub(20).max(5);
                self.renderer.set_message(&format!("speed: {}ms", self.ai_delay));
            }
            KeyCode::Char('-') => {
                self.ai_delay = self.ai_delay.saturating_add(20);
                self.renderer.set_message(&format!("speed: {}ms", self.ai_delay));
            }
            KeyCode::Char('S') => {
                if self.game_state != GameState::Playing {
                    return Ok(());
                }
                let (sr, sc) = self.cursor;
                match self.swap_target {
                    Some((tr, tc)) if (tr, tc) != (sr, sc) => {
                        match self.engine.swap_tiles((tr, tc), (sr, sc)) {
                            Ok(()) => {
                                self.swap_target = None;
                                self.renderer.set_message("swapped");
                            }
                            Err(e) => {
                                self.swap_target = None;
                                self.renderer.set_message(&format!("{}", e));
                            }
                        }
                    }
                    _ => {
                        self.swap_target = Some((sr, sc));
                        self.renderer
                            .set_message("swap target selected — move to other tile");
                    }
                }
            }
            KeyCode::Char('x') => {
                if self.game_state != GameState::Playing {
                    return Ok(());
                }
                let (r, c) = self.cursor;
                match self.engine.delete_tile((r, c)) {
                    Ok(()) => self.renderer.set_message("deleted"),
                    Err(e) => self.renderer.set_message(&format!("{}", e)),
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn do_move(&mut self, dir: Direction) -> io::Result<()> {
        let engine_dir = dir.to_engine();
        match self.mode {
            GameMode::Play => match self.engine.make_move(engine_dir) {
                Ok(outcome) => self.handle_outcome(outcome),
                Err(e) => self.renderer.set_message(&format!("{}", e)),
            },
            GameMode::AI => {
                let dir = self
                    .engine
                    .suggest_move(Some(6))
                    .unwrap_or(engine_dir);
                match self.engine.make_move(dir) {
                    Ok(outcome) => self.handle_outcome(outcome),
                    Err(e) => self.renderer.set_message(&format!("{}", e)),
                }
            }
            GameMode::Eval => {
                let result = self.engine.evaluate_position(EvalMode::Balanced);
                self.renderer.set_message(&format!(
                    "eval: score={:.2} depth={} nodes={}",
                    result.score, result.depth_reached, result.nodes_evaluated
                ));
            }
        }
        Ok(())
    }

    pub fn do_ai_step(&mut self) -> io::Result<()> {
        if self.game_state != GameState::Playing {
            return Ok(());
        }
        let dir = self
            .engine
            .suggest_move(Some(6))
            .unwrap_or(self.last_dir.to_engine());
        match self.engine.make_move(dir) {
            Ok(outcome) => self.handle_outcome(outcome),
            Err(e) => self.renderer.set_message(&format!("{}", e)),
        }
        Ok(())
    }

    pub fn compute_eval_scores(&mut self) {
        let base_grid = self.engine.grid().clone();
        for (i, &dir) in Direction::ALL.iter().enumerate() {
            let mut sim = match Engine::new(Config {
                size: GRID_SIZE,
                swap_charges: 0,
                delete_charges: 0,
                ..Config::default()
            }) {
                Ok(e) => e,
                Err(_) => {
                    self.eval_scores[i] = f64::NEG_INFINITY;
                    continue;
                }
            };
            sim.set_grid(base_grid.clone());
            match sim.make_move(dir.to_engine()) {
                Ok(outcome) if outcome.moved => {
                    let result = sim.evaluate_position(EvalMode::Balanced);
                    self.eval_scores[i] = result.score;
                }
                _ => {
                    self.eval_scores[i] = f64::NEG_INFINITY;
                }
            }
        }
    }

    fn handle_outcome(&mut self, outcome: engine2048::MoveOutcome) {
        if outcome.moved {
            self.history.push(HistoryEntry {
                dir: self.last_dir,
                gained: outcome.gained_score,
            });
            let max = crate::types::HISTORY_LEN;
            if self.history.len() > max {
                self.history.drain(..self.history.len() - max);
            }
            self.renderer.set_message(&format!(
                "move {:?} (+{} pts)",
                self.last_dir, outcome.gained_score
            ));
            if outcome.won {
                self.game_state = GameState::Won;
                self.renderer.set_message("*** YOU WON! ***");
            } else if outcome.game_over {
                self.game_state = GameState::Over;
                self.renderer.set_message("*** GAME OVER ***");
            }
        } else {
            self.renderer.set_message("no move");
        }
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
            self.history.clear();
            self.renderer.set_message("restarted");
        }
    }
}
