use super::bits4::Board4;
use std::sync::OnceLock;

#[allow(dead_code)]
const MONOTONICITY_POWER: f64 = 4.0;
#[allow(dead_code)]
const MONOTONICITY_WEIGHT: f64 = 47.0;
#[allow(dead_code)]
const SUM_POWER: f64 = 3.5;
#[allow(dead_code)]
const SUM_WEIGHT: f64 = 11.0;
#[allow(dead_code)]
const MERGES_WEIGHT: f64 = 700.0;
#[allow(dead_code)]
const EMPTY_WEIGHT: f64 = 270.0;

#[allow(dead_code)]
fn nibble(row: u16, col: usize) -> u16 {
    (row >> (col * 4)) & 0xF
}

#[allow(dead_code)]
fn compute_row_heur(row: u16) -> f32 {
    let line = [nibble(row, 0), nibble(row, 1), nibble(row, 2), nibble(row, 3)];

    let mut sum = 0.0f64;
    let mut empty = 0.0f64;
    let mut merges = 0i32;
    let mut prev: i32 = -1;
    let mut counter = 0i32;

    for &rank in line.iter() {
        sum += (rank as f64).powf(SUM_POWER);
        if rank == 0 {
            empty += 1.0;
        } else {
            if prev == rank as i32 {
                counter += 1;
            } else if counter > 0 {
                merges += 1 + counter;
                counter = 0;
            }
            prev = rank as i32;
        }
    }
    if counter > 0 {
        merges += 1 + counter;
    }

    let mut mono_left = 0.0f64;
    let mut mono_right = 0.0f64;
    for i in 1..4 {
        let a = line[i - 1] as f64;
        let b = line[i] as f64;
        if a > b {
            mono_left += a.powf(MONOTONICITY_POWER) - b.powf(MONOTONICITY_POWER);
        } else {
            mono_right += b.powf(MONOTONICITY_POWER) - a.powf(MONOTONICITY_POWER);
        }
    }

    let score = EMPTY_WEIGHT * empty + MERGES_WEIGHT * merges as f64
        - MONOTONICITY_WEIGHT * mono_left.min(mono_right)
        - SUM_WEIGHT * sum;

    score as f32
}

#[allow(dead_code)]
fn row_heur_table() -> &'static Vec<f32> {
    static TABLE: OnceLock<Vec<f32>> = OnceLock::new();
    TABLE.get_or_init(|| (0..=u16::MAX).map(compute_row_heur).collect())
}

#[allow(dead_code)]
fn get_row(board: Board4, row: usize) -> u16 {
    ((board >> (row * 16)) & 0xFFFF) as u16
}

#[allow(dead_code)]
fn transpose(board: Board4) -> Board4 {
    let mut out: Board4 = 0;
    for r in 0..4 {
        for c in 0..4 {
            let shift_in = 16 * r + 4 * c;
            let nib = (board >> shift_in) & 0xF;
            let shift_out = 16 * c + 4 * r;
            out |= nib << shift_out;
        }
    }
    out
}

#[allow(dead_code)]
fn score_rows(board: Board4, table: &[f32]) -> f64 {
    (0..4).map(|r| table[get_row(board, r) as usize] as f64).sum()
}

#[allow(dead_code)]
pub fn heur_score_board4(bits: Board4) -> f64 {
    let table = row_heur_table();
    score_rows(bits, table) + score_rows(transpose(bits), table)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_board_scores_highest_empty_component() {
        let empty = heur_score_board4(0);
        let one_tile = heur_score_board4(1);
        assert!(empty > one_tile);
    }

    #[test]
    fn table_is_deterministic_and_cached() {
        let a = heur_score_board4(0x1234);
        let b = heur_score_board4(0x1234);
        assert_eq!(a, b);
    }
}
