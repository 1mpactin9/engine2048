use engine2048::{Config, Engine, UsageMode};
use std::env;
use std::time::Instant;

const MAX_MOVES_PER_GAME: u64 = 20_000;
const MAX_SECONDS_PER_GAME: f64 = 120.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HeuristicMode {
    Standard,
    Guarantee,
    Deterministic,
    DetGuarantee,
}

fn parse_usage(raw: &str) -> Option<UsageMode> {
    let lower = raw.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("custom=") {
        if let Ok(ms) = rest.parse() {
            return Some(UsageMode::Custom(ms));
        }
        return None;
    }
    match lower.as_str() {
        "max" => Some(UsageMode::Max),
        "balanced" => Some(UsageMode::Balanced),
        "limit" => Some(UsageMode::Limit),
        _ => None,
    }
}

fn parse_mode(raw: &str) -> Option<HeuristicMode> {
    match raw.to_ascii_lowercase().as_str() {
        "standard" | "std" => Some(HeuristicMode::Standard),
        "guarantee" | "g" => Some(HeuristicMode::Guarantee),
        "deterministic" | "det" | "d" => Some(HeuristicMode::Deterministic),
        "det_guarantee" | "detg" | "dg" => Some(HeuristicMode::DetGuarantee),
        _ => None,
    }
}

struct ConfigSpec {
    label: String,
    usage: UsageMode,
    mode: HeuristicMode,
    size: usize,
    games: usize,
}

fn parse_size(s: &str) -> Option<usize> {
    match s.to_ascii_lowercase().as_str() {
        "3" => Some(3),
        "4" => Some(4),
        "5" => Some(5),
        "6" => Some(6),
        "8" => Some(8),
        _ => s.parse().ok(),
    }
}

fn parse_sweep_token(tok: &str, default_size: usize, default_games: usize) -> Option<ConfigSpec> {
    let parts: Vec<&str> = tok.split(':').collect();
    let usage_str = parts.first().copied().unwrap_or("balanced");
    let mode_str = if parts.len() > 1 && !parts[1].is_empty() {
        parts[1]
    } else {
        "standard"
    };
    let usage = parse_usage(usage_str)?;
    let mode = parse_mode(mode_str).unwrap_or(HeuristicMode::Standard);
    let size = if parts.len() > 2 {
        parse_size(parts[2]).unwrap_or(default_size)
    } else {
        default_size
    };
    let games = if parts.len() > 3 {
        parts[3].parse().unwrap_or(default_games)
    } else {
        default_games
    };
    let label = format!("{}/{:?}/{}x{}/n={}", usage.label(), mode, size, size, games);
    Some(ConfigSpec {
        label,
        usage,
        mode,
        size,
        games,
    })
}

#[allow(dead_code)]
struct Args {
    sweep: Vec<ConfigSpec>,
    default_size: usize,
    default_games: usize,
    log_path: Option<String>,
}

fn parse_args() -> Args {
    let mut sweep: Vec<ConfigSpec> = Vec::new();
    let mut default_size = 4usize;
    let mut default_games = 10usize;
    let mut log_path: Option<String> = None;
    let mut positional_seen = false;

    for arg in env::args().skip(1) {
        if let Some(rest) = arg.strip_prefix("--sweep=") {
            for tok in rest.split(',') {
                let tok = tok.trim();
                if tok.is_empty() {
                    continue;
                }
                if let Some(spec) = parse_sweep_token(tok, default_size, default_games) {
                    sweep.push(spec);
                }
            }
        } else if let Some(rest) = arg.strip_prefix("--usage=") {
            if let Some(u) = parse_usage(rest) {
                sweep.push(ConfigSpec {
                    label: format!("{:?}/Standard/4x4/n={}", u, default_games),
                    usage: u,
                    mode: HeuristicMode::Standard,
                    size: 4,
                    games: default_games,
                });
                positional_seen = true;
            }
        } else if let Some(rest) = arg.strip_prefix("--size=") {
            if let Ok(s) = rest.parse() {
                default_size = s;
            }
        } else if let Some(rest) = arg.strip_prefix("--log=") {
            log_path = Some(rest.to_string());
        } else if !positional_seen {
            if let Ok(g) = arg.parse() {
                default_games = g;
                positional_seen = true;
            }
        }
    }

    if sweep.is_empty() {
        sweep.push(ConfigSpec {
            label: format!("Balanced/Standard/4x4/n={}", default_games),
            usage: UsageMode::Balanced,
            mode: HeuristicMode::Standard,
            size: default_size,
            games: default_games,
        });
    }

    Args {
        sweep,
        default_size,
        default_games,
        log_path,
    }
}

struct RunStats {
    label: String,
    usage: UsageMode,
    mode: HeuristicMode,
    size: usize,
    games: usize,
    scores: Vec<u64>,
    max_tiles: Vec<u32>,
    wall_secs: f64,
}

fn run_one(spec: &ConfigSpec) -> RunStats {
    let mut scores: Vec<u64> = Vec::with_capacity(spec.games);
    let mut max_tiles: Vec<u32> = Vec::with_capacity(spec.games);
    let start = Instant::now();

    let base_seed: [u32; 8] = [1, 2, 3, 4, 5, 6, 7, 8];

    for i in 0..spec.games {
        let mut engine = Engine::new(Config {
            size: spec.size,
            swap_charges: 0,
            delete_charges: 0,
            ..Config::default()
        })
        .expect("valid config");

        let mut game_seed = base_seed;
        game_seed[0] = game_seed[0].wrapping_add(i as u32);

        let game_start = Instant::now();
        let mut moves_made: u64 = 0;
        let mut capped = false;
        loop {
            if moves_made >= MAX_MOVES_PER_GAME
                || game_start.elapsed().as_secs_f64() >= MAX_SECONDS_PER_GAME
            {
                capped = true;
                break;
            }
            let outcome = match spec.mode {
                HeuristicMode::Standard => {
                    engine.auto_play_step_with_usage(None, spec.usage)
                }
                HeuristicMode::Guarantee => {
                    let dir = engine.suggest_move_for_guarantee(spec.usage);
                    dir.map(|d| engine.make_move(d))
                }
                HeuristicMode::Deterministic => {
                    let grid = engine.grid().clone();
                    let key = Engine::derive_key(&game_seed);
                    let dir = Engine::suggest_move_det_with_usage(
                        &grid, None, &key, 0, true, spec.usage,
                    );
                    dir.map(|d| engine.make_move(d))
                }
                HeuristicMode::DetGuarantee => {
                    let _grid = engine.grid().clone();
                    let key = Engine::derive_key(&game_seed);
                    let dir = engine.suggest_move_for_det_guarantee(
                        &key, 0, true, spec.usage,
                    );
                    dir.map(|d| engine.make_move(d))
                }
            };
            match outcome {
                Some(Ok(out)) => {
                    moves_made += 1;
                    if out.game_over {
                        break;
                    }
                }
                _ => break,
            }
        }

        let max_tile = engine.grid().iter().flatten().copied().max().unwrap_or(0);
        let cap_label = if capped { "  [CAPPED, not game-over]" } else { "" };
        println!(
            "  [{}] game {:>3}: score = {:>7}  max tile = {:>6}  moves = {:>7}  ({:.1}s){}",
            spec.label,
            i + 1,
            engine.score(),
            max_tile,
            moves_made,
            game_start.elapsed().as_secs_f64(),
            cap_label
        );
        scores.push(engine.score());
        max_tiles.push(max_tile);
    }

    RunStats {
        label: spec.label.clone(),
        usage: spec.usage,
        mode: spec.mode,
        size: spec.size,
        games: spec.games,
        scores,
        max_tiles,
        wall_secs: start.elapsed().as_secs_f64(),
    }
}

fn print_summary(stats: &RunStats) {
    let mut s = stats.scores.clone();
    s.sort_unstable();
    let n = s.len();
    let sum: u64 = s.iter().sum();
    let avg = sum as f64 / n as f64;
    let min = s[0];
    let max = s[n - 1];
    let median = s[n / 2];
    let at_least_2048 = stats.max_tiles.iter().filter(|&&t| t >= 2048).count();
    let at_least_4096 = stats.max_tiles.iter().filter(|&&t| t >= 4096).count();
    let at_least_8192 = stats.max_tiles.iter().filter(|&&t| t >= 8192).count();
    let at_least_100k = stats.scores.iter().filter(|&&s| s >= 100_000).count();
    let at_least_200k = stats.scores.iter().filter(|&&s| s >= 200_000).count();

    println!(
        "\n--- {} ({}x{}, {:?}/{:?}, no power-ups) ---",
        stats.label, stats.size, stats.size, stats.usage, stats.mode
    );
    println!(
        "min={} median={} avg={:.0} max={}",
        min, median, avg, max
    );
    println!(
        ">=2048: {}/{}  >=4096: {}/{}  >=8192: {}/{}  >=100k: {}/{}  >=200k: {}/{}",
        at_least_2048, stats.games, at_least_4096, stats.games, at_least_8192, stats.games,
        at_least_100k, stats.games, at_least_200k, stats.games
    );
    println!(
        "total wall time: {:.1}s ({:.1}s/game)",
        stats.wall_secs,
        stats.wall_secs / stats.games as f64
    );
}

fn main() {
    let args = parse_args();
    let overall_start = Instant::now();

    let mut all_runs: Vec<RunStats> = Vec::new();
    for spec in &args.sweep {
        println!("\n=== running {} ===", spec.label);
        let stats = run_one(spec);
        print_summary(&stats);
        all_runs.push(stats);
    }

    println!("\n=== SWEEP COMPARISON ({} configs) ===", all_runs.len());
    println!(
        "{:<40} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9}",
        "config", "min", "median", "avg", "max", ">=2048", ">=4096", ">=8192", ">=100k", "wall(s)"
    );
    for stats in &all_runs {
        let mut s = stats.scores.clone();
        s.sort_unstable();
        let n = s.len();
        let avg = s.iter().sum::<u64>() as f64 / n as f64;
        let at_2048 = stats.max_tiles.iter().filter(|&&t| t >= 2048).count();
        let at_4096 = stats.max_tiles.iter().filter(|&&t| t >= 4096).count();
        let at_8192 = stats.max_tiles.iter().filter(|&&t| t >= 8192).count();
        let at_100k = stats.scores.iter().filter(|&&s| s >= 100_000).count();
        println!(
            "{:<40} {:>7} {:>7} {:>7.0} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9.1}",
            stats.label,
            s[0],
            s[n / 2],
            avg,
            s[n - 1],
            format!("{}/{}", at_2048, n),
            format!("{}/{}", at_4096, n),
            format!("{}/{}", at_8192, n),
            format!("{}/{}", at_100k, n),
            stats.wall_secs
        );
    }

    println!(
        "\nsweep total wall time: {:.1}s",
        overall_start.elapsed().as_secs_f64()
    );

    if let Some(path) = &args.log_path {
        use std::fs::OpenOptions;
        use std::io::Write;
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("open log file");
        writeln!(f, "\n## sweep run @ {}s wall total", overall_start.elapsed().as_secs_f64()).ok();
        writeln!(
            f,
            "{:<40} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9}",
            "config", "min", "median", "avg", "max", ">=2048", ">=4096", ">=8192", ">=100k", "wall(s)"
        )
        .ok();
        for stats in &all_runs {
            let mut s = stats.scores.clone();
            s.sort_unstable();
            let n = s.len();
            let avg = s.iter().sum::<u64>() as f64 / n as f64;
            let at_2048 = stats.max_tiles.iter().filter(|&&t| t >= 2048).count();
            let at_4096 = stats.max_tiles.iter().filter(|&&t| t >= 4096).count();
            let at_8192 = stats.max_tiles.iter().filter(|&&t| t >= 8192).count();
            let at_100k = stats.scores.iter().filter(|&&s| s >= 100_000).count();
            writeln!(
                f,
                "{:<40} {:>7} {:>7} {:>7.0} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9.1}",
                stats.label,
                s[0],
                s[n / 2],
                avg,
                s[n - 1],
                format!("{}/{}", at_2048, n),
                format!("{}/{}", at_4096, n),
                format!("{}/{}", at_8192, n),
                format!("{}/{}", at_100k, n),
                stats.wall_secs
            )
            .ok();
        }
        println!("log appended to {}", path);
    }
}
