use crossterm::event::KeyCode;
use engine2048::{Config, Engine, EvalMode};
use std::io::{self, Write};

use crate::types::{Direction, GameConfig, GameMode, GameState, GameStats, HISTORY_LEN, HistoryEntry};

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
    pub config: GameConfig,
    pub stats: GameStats,
    pub move_count: usize,
    pub session_score: u64,
    pub session_max_tile: u32,
}

impl Game {
    pub fn new() -> io::Result<Self> {
        let config = GameConfig::default();
        let engine = Engine::new(Config {
            size: config.board_size,
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
            renderer: Renderer::new(config.clone()),
            eval_scores: [0.0; 4],
            history: Vec::new(),
            config,
            stats: GameStats::default(),
            move_count: 0,
            session_score: 0,
            session_max_tile: 0,
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
        self.renderer.set_config(self.config.clone());
        self.renderer
            .set_move_count(self.move_count + self.history.len());
        self.renderer
            .set_game_score(self.session_score + self.engine.score());
        self.renderer.render(writer, &self.engine, self.cursor)
    }

    pub fn handle_input(&mut self, key: KeyCode) -> io::Result<()> {
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
                self.renderer.set_message(&format!("mode: {:?}", self.mode));
            }
            KeyCode::Char('t') => {
                self.renderer.next_theme();
            }
            KeyCode::Char('e') => {
                self.renderer.toggle_eval();
            }
            KeyCode::Char('h') => {
                self.renderer.toggle_history();
            }
            KeyCode::Char('s') if self.swap_target.is_some() => {
                // shift+s is handled below; lowercase 's' when swap is active = move down
                self.last_dir = Direction::Down;
                self.move_cursor(1, 0);
                if self.game_state == GameState::Playing {
                    self.do_move(Direction::Down)?;
                }
            }
            KeyCode::Char('u') => {
                match self.engine.undo() {
                    Ok(()) => {
                        self.renderer.set_message("undone");
                        self.renderer.record_undo();
                    }
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
                if self.game_state == GameState::Playing && self.swap_target.is_none() {
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
                // uppercase S = swap power-up
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
                                self.renderer.record_powerup("swap");
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
                    Ok(()) => {
                        self.renderer.set_message("deleted");
                        self.renderer.record_powerup("delete");
                    }
                    Err(e) => self.renderer.set_message(&format!("{}", e)),
                }
            }
            KeyCode::Char('1') | KeyCode::Char('2') | KeyCode::Char('3') => {
                if let Some(size) = key_to_size(key) {
                    if let Ok(e) = Engine::new(Config {
                        size,
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
                        self.move_count = 0;
                        self.session_score = 0;
                        self.session_max_tile = 0;
                        self.config.board_size = size;
                        self.renderer.set_message(&format!("size: {}x{}", size, size));
                    }
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
                size: self.config.board_size,
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
            let max_tile = self
                .engine
                .grid()
                .iter()
                .flatten()
                .copied()
                .max()
                .unwrap_or(0);
            self.history.push(HistoryEntry {
                dir: self.last_dir,
                gained: outcome.gained_score,
            });
            let max = HISTORY_LEN;
            if self.history.len() > max {
                self.history.drain(..self.history.len() - max);
            }
            self.move_count += 1;
            self.session_score += outcome.gained_score;
            if max_tile > self.session_max_tile {
                self.session_max_tile = max_tile;
            }
            self.stats.record_move(outcome.gained_score, max_tile);
            if max_tile > self.stats.max_tile {
                self.stats.max_tile = max_tile;
            }
            if outcome.gained_score > self.stats.best_score {
                self.stats.best_score = outcome.gained_score;
            }
            self.renderer.set_message(&format!(
                "{} +{}",
                self.last_dir.label(),
                outcome.gained_score
            ));
            if outcome.won {
                self.game_state = GameState::Won;
                self.stats.end_game(true);
                self.renderer.set_message("*** YOU WON! ***");
            } else if outcome.game_over {
                self.game_state = GameState::Over;
                self.stats.end_game(false);
                self.renderer.set_message("*** GAME OVER ***");
            }
        } else {
            self.renderer.set_message("no move");
        }
    }

    fn move_cursor(&mut self, dr: isize, dc: isize) {
        let size = self.config.board_size;
        let r = (self.cursor.0 as isize + dr).clamp(0, size as isize - 1) as usize;
        let c = (self.cursor.1 as isize + dc).clamp(0, size as isize - 1) as usize;
        self.cursor = (r, c);
    }

    fn restart(&mut self) {
        let size = self.config.board_size;
        if let Ok(e) = Engine::new(Config {
            size,
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
            self.move_count = 0;
            self.session_score = 0;
            self.renderer.set_message("restarted");
        }
    }
}

fn key_to_size(key: KeyCode) -> Option<usize> {
    match key {
        KeyCode::Char('1') => Some(3),
        KeyCode::Char('2') => Some(4),
        KeyCode::Char('3') => Some(5),
        _ => None,
    }
}
