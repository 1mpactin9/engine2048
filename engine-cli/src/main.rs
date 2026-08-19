mod state;
mod renderer;
mod input;

use crossterm::{
    event::{self, Event, KeyEventKind},
    queue,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::io::{self, Write};

use crate::state::App;

pub fn run() -> io::Result<()> {
    let mut stdout = io::stdout();
    terminal::enable_raw_mode()?;
    queue!(stdout, EnterAlternateScreen)?;

    let mut app = App::new()?;

    while app.running {
        app.render(&mut stdout)?;

        if event::poll(std::time::Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    app.handle_key(key.code)?;
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
