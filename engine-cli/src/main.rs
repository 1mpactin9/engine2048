mod game;
mod renderer;
mod types;

use crossterm::{
    event::{self, Event, KeyEventKind},
    queue,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::io::{self, Write};

use crate::game::Game;
use crate::types::{GameMode, GameState};

pub fn run() -> io::Result<()> {
    let mut stdout = io::stdout();
    terminal::enable_raw_mode()?;
    queue!(stdout, EnterAlternateScreen)?;

    let mut game = Game::new()?;
    let mut ai_timer = std::time::Instant::now();

    while game.running {
        game.render(&mut stdout)?;

        let wait = if game.mode == GameMode::AI
            && game.game_state == GameState::Playing
            && !game.ai_paused
        {
            let delay = game.ai_delay;
            if ai_timer.elapsed().as_millis() < delay as u128 {
                Some(delay)
            } else {
                ai_timer = std::time::Instant::now();
                game.do_ai_step()?;
                None
            }
        } else {
            None
        };

        if event::poll(std::time::Duration::from_millis(wait.unwrap_or(50)))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    game.handle_input(key.code)?;
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
