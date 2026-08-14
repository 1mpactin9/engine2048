use crate::Direction;
use std::sync::OnceLock;

pub const MAX_SIDE: usize = 12;
const BITS_PER_CELL: u32 = 5;
const CELL_MASK: u64 = (1u64 << BITS_PER_CELL) - 1;
const MAX_RANK: u32 = 31;
const TABLE_MAX_N: usize = 4;

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct WideBoard {
    pub n: usize,
    pub rows: [u64; MAX_SIDE],
}

fn get_cell(row: u64, col: usize) -> u64 {
    (row >> (col as u32 * BITS_PER_CELL)) & CELL_MASK
}

fn set_cell(row: u64, col: usize, val: u64) -> u64 {
    let shift = col as u32 * BITS_PER_CELL;
    (row & !(CELL_MASK << shift)) | ((val & CELL_MASK) << shift)
}

fn line_key(row: u64, n: usize) -> u64 {
    if n * BITS_PER_CELL as usize >= 64 {
        row
    } else {
        row & ((1u64 << (n as u32 * BITS_PER_CELL)) - 1)
    }
}

fn compute_line_left(row: u64, n: usize) -> (u64, u32) {
    let mut vals = [0u64; MAX_SIDE];
    let mut count = 0;
    for c in 0..n {
        let v = get_cell(row, c);
        if v != 0 {
            vals[count] = v;
            count += 1;
        }
    }
    let mut merged = [0u64; MAX_SIDE];
    let mut m = 0;
    let mut gained: u32 = 0;
    let mut i = 0;
    while i < count {
        if i + 1 < count && vals[i] == vals[i + 1] && vals[i] < MAX_RANK as u64 {
            let nv = vals[i] + 1;
            merged[m] = nv;
            gained = gained.saturating_add(1u32 << nv.min(31));
            m += 1;
            i += 2;
        } else {
            merged[m] = vals[i];
            m += 1;
            i += 1;
        }
    }
    let mut out: u64 = 0;
    for (c, &v) in merged.iter().enumerate().take(n) {
        out = set_cell(out, c, v);
    }
    (out, gained)
}

fn row_reverse(row: u64, n: usize) -> u64 {
    let mut out = 0u64;
    for c in 0..n {
        out = set_cell(out, n - 1 - c, get_cell(row, c));
    }
    out
}

struct LineTable {
    left: Vec<(u64, u32)>,
}

fn table_slot(n: usize) -> &'static OnceLock<LineTable> {
    static TABLES: OnceLock<[OnceLock<LineTable>; TABLE_MAX_N + 1]> = OnceLock::new();
    &TABLES.get_or_init(|| std::array::from_fn(|_| OnceLock::new()))[n]
}

fn line_table(n: usize) -> &'static LineTable {
    table_slot(n).get_or_init(|| {
        let key_bits = n as u32 * BITS_PER_CELL;
        let size = 1usize << key_bits;
        let mut left = Vec::with_capacity(size);
        for key in 0..size {
            left.push(compute_line_left(key as u64, n));
        }
        LineTable { left }
    })
}

fn slide_line_left(key: u64, n: usize) -> (u64, u32) {
    if n <= TABLE_MAX_N {
        line_table(n).left[key as usize]
    } else {
        compute_line_left(key, n)
    }
}

#[allow(dead_code)]
impl WideBoard {
    pub fn empty(n: usize) -> Self {
        WideBoard {
            n,
            rows: [0u64; MAX_SIDE],
        }
    }

    pub fn from_flat(board: &[u32], n: usize) -> Self {
        let mut b = WideBoard::empty(n);
        for r in 0..n {
            let mut row = 0u64;
            for c in 0..n {
                let val = board[r * n + c];
                let rank = if val == 0 {
                    0
                } else {
                    (val.trailing_zeros() as u64).min(MAX_RANK as u64)
                };
                row = set_cell(row, c, rank);
            }
            b.rows[r] = row;
        }
        b
    }

    pub fn to_flat(&self) -> Vec<u32> {
        let n = self.n;
        let mut out = vec![0u32; n * n];
        for r in 0..n {
            for c in 0..n {
                let rank = get_cell(self.rows[r], c);
                out[r * n + c] = if rank == 0 { 0 } else { 1u32 << rank };
            }
        }
        out
    }

    fn columns(&self) -> [u64; MAX_SIDE] {
        let n = self.n;
        let mut cols = [0u64; MAX_SIDE];
        for c in 0..n {
            let mut col = 0u64;
            for r in 0..n {
                col = set_cell(col, r, get_cell(self.rows[r], c));
            }
            cols[c] = col;
        }
        cols
    }

    pub fn slide(&self, dir: Direction) -> (WideBoard, u64) {
        let n = self.n;
        let mut out = WideBoard::empty(n);
        let mut gained: u64 = 0;

        match dir {
            Direction::Left | Direction::Right => {
                for r in 0..n {
                    let key = line_key(self.rows[r], n);
                    let (new_row, g) = if matches!(dir, Direction::Right) {
                        let rev = row_reverse(key, n);
                        let (nr, g) = slide_line_left(rev, n);
                        (row_reverse(nr, n), g)
                    } else {
                        slide_line_left(key, n)
                    };
                    out.rows[r] = new_row;
                    gained += g as u64;
                }
            }
            Direction::Up | Direction::Down => {
                let cols = self.columns();
                let mut new_cols = [0u64; MAX_SIDE];
                for c in 0..n {
                    let key = line_key(cols[c], n);
                    let (new_col, g) = if matches!(dir, Direction::Down) {
                        let rev = row_reverse(key, n);
                        let (nc, g) = slide_line_left(rev, n);
                        (row_reverse(nc, n), g)
                    } else {
                        slide_line_left(key, n)
                    };
                    new_cols[c] = new_col;
                    gained += g as u64;
                }
                for r in 0..n {
                    let mut row = 0u64;
                    for c in 0..n {
                        row = set_cell(row, c, get_cell(new_cols[c], r));
                    }
                    out.rows[r] = row;
                }
            }
        }
        (out, gained)
    }

    pub fn empties(&self) -> Vec<usize> {
        let n = self.n;
        let mut out = Vec::with_capacity(n * n);
        for r in 0..n {
            for c in 0..n {
                if get_cell(self.rows[r], c) == 0 {
                    out.push(r * n + c);
                }
            }
        }
        out
    }

    pub fn set_flat_index(&mut self, idx: usize, value: u32) {
        let n = self.n;
        let r = idx / n;
        let c = idx % n;
        let rank = if value == 0 {
            0
        } else {
            (value.trailing_zeros() as u64).min(MAX_RANK as u64)
        };
        self.rows[r] = set_cell(self.rows[r], c, rank);
    }

    pub fn get_flat_index(&self, idx: usize) -> u32 {
        let n = self.n;
        let r = idx / n;
        let c = idx % n;
        let rank = get_cell(self.rows[r], c);
        if rank == 0 {
            0
        } else {
            1u32 << rank
        }
    }

    pub fn eq_flat(&self, other: &WideBoard) -> bool {
        self.n == other.n && self.rows[..self.n] == other.rows[..self.n]
    }
}

pub fn fits_wide_board(n: usize) -> bool {
    n >= 2 && n <= MAX_SIDE
}
