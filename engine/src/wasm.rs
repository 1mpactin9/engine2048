use crate::{Action, Direction, Engine, SeedRng, UsageMode};
use wasm_bindgen::prelude::*;

fn direction_code(dir: Direction) -> u32 {
    match dir {
        Direction::Up => 0,
        Direction::Down => 1,
        Direction::Left => 2,
        Direction::Right => 3,
    }
}

const NO_MOVE: u32 = u32::MAX;

fn grid_from_flat(flat: &[u32], size: usize) -> Option<Vec<Vec<u32>>> {
    if size < 2 || flat.len() != size * size {
        return None;
    }
    Some(
        (0..size)
            .map(|r| flat[r * size..(r + 1) * size].to_vec())
            .collect(),
    )
}

#[wasm_bindgen]
pub fn suggest_move(flat: &[u32], size: usize, depth: u32, usage_code: u32) -> u32 {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return NO_MOVE,
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    let usage = UsageMode::from_code(usage_code);
    Engine::suggest_move_with_usage(&grid, depth_opt, usage).map_or(NO_MOVE, direction_code)
}

#[wasm_bindgen]
pub fn suggest_action(
    flat: &[u32],
    size: usize,
    swaps_left: u32,
    deletes_left: u32,
    depth: u32,
    usage_code: u32,
) -> Vec<u32> {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return vec![3],
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    let usage = UsageMode::from_code(usage_code);
    match Engine::suggest_action_with_usage(&grid, swaps_left, deletes_left, depth_opt, usage) {
        Action::Move(d) => vec![0, direction_code(d)],
        Action::Delete(r, c) => vec![1, r as u32, c as u32],
        Action::Swap(a, b) => vec![2, a.0 as u32, a.1 as u32, b.0 as u32, b.1 as u32],
        Action::None => vec![3],
    }
}

#[wasm_bindgen]
pub fn suggest_move_det(
    flat: &[u32],
    size: usize,
    depth: u32,
    seed: &[u32],
    calls: f64,
    manipulate: bool,
    usage_code: u32,
) -> u32 {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return NO_MOVE,
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    let key = Engine::derive_key(seed);
    let usage = UsageMode::from_code(usage_code);
    Engine::suggest_move_det_with_usage(&grid, depth_opt, &key, calls as u64, manipulate, usage)
        .map_or(NO_MOVE, direction_code)
}

#[wasm_bindgen]
pub fn suggest_action_det(
    flat: &[u32],
    size: usize,
    swaps_left: u32,
    deletes_left: u32,
    depth: u32,
    seed: &[u32],
    calls: f64,
    manipulate: bool,
    usage_code: u32,
) -> Vec<u32> {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return vec![3],
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    let key = Engine::derive_key(seed);
    let usage = UsageMode::from_code(usage_code);
    match Engine::suggest_action_det_with_usage(
        &grid,
        swaps_left,
        deletes_left,
        depth_opt,
        &key,
        calls as u64,
        manipulate,
        usage,
    ) {
        Action::Move(d) => vec![0, direction_code(d)],
        Action::Delete(r, c) => vec![1, r as u32, c as u32],
        Action::Swap(a, b) => vec![2, a.0 as u32, a.1 as u32, b.0 as u32, b.1 as u32],
        Action::None => vec![3],
    }
}

#[wasm_bindgen]
pub fn predict_spawn(
    flat: &[u32],
    size: usize,
    seed: &[u32],
    calls: f64,
    manipulate: bool,
    usage_code: u32,
) -> Vec<u32> {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return vec![u32::MAX],
    };
    let n = grid.len();
    let mut board = Engine::flatten(&grid);
    let key = Engine::derive_key(seed);
    let usage = UsageMode::from_code(usage_code);
    let mut budget: u64 = u64::MAX;
    match Engine::predict_spawn_flat_with_usage(
        &mut board,
        n,
        &mut SeedRng::init(&key, calls as u64),
        manipulate,
        usage,
        &mut budget,
    ) {
        Some((idx, value, draws)) => vec![idx as u32, value, draws as u32],
        None => vec![u32::MAX],
    }
}
