use std::cell::RefCell;
use std::sync::OnceLock;

/// Default transposition table size: 2^20 = 1 048 576 entries (~4 MB).
/// Matches nneonneo's proven `unordered_map`-style cache at a reasonable
/// memory footprint.  Override with [`set_tt_bits`] before any search
/// call; the change applies to the next thread-local instance.
pub const DEFAULT_TT_BITS: u32 = 20;
const TT_BITS: u32 = DEFAULT_TT_BITS;
const TT_SIZE: usize = 1 << TT_BITS;
const TT_MASK: u64 = (TT_SIZE as u64) - 1;
const ZOBRIST_CELLS: usize = 256;
const ZOBRIST_RANKS: usize = 32;

/// Rebuild the thread-local transposition table with a new size
/// (must be a power of two, 2^`bits` entries).  Call before the first
/// search; does nothing if the table has already been initialised on
/// this thread.
pub fn set_tt_bits(bits: u32) {
    TT.with(|c| {
        if c.borrow().len() != (1usize << bits) {
            *c.borrow_mut() =
                vec![TTEntry::default(); 1usize << bits].into_boxed_slice();
        }
    });
}

#[derive(Clone, Copy)]
struct TTEntry {
    key: u64,
    depth: u8,
    value: f32,
    occupied: bool,
}

impl Default for TTEntry {
    fn default() -> Self {
        TTEntry {
            key: 0,
            depth: 0,
            value: 0.0,
            occupied: false,
        }
    }
}

thread_local! {
    static TT: RefCell<Box<[TTEntry]>> =
        RefCell::new(vec![TTEntry::default(); TT_SIZE].into_boxed_slice());
}

fn zobrist_table() -> &'static [[u64; ZOBRIST_RANKS]; ZOBRIST_CELLS] {
    static TABLE: OnceLock<[[u64; ZOBRIST_RANKS]; ZOBRIST_CELLS]> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut state: u64 = 0x9e3779b97f4a7c15;
        let mut table = [[0u64; ZOBRIST_RANKS]; ZOBRIST_CELLS];
        for cell in table.iter_mut() {
            for slot in cell.iter_mut() {
                state = state.wrapping_add(0x9e3779b97f4a7c15);
                let mut z = state;
                z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
                z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
                z ^= z >> 31;
                *slot = z;
            }
        }
        table
    })
}

pub(crate) fn zobrist_hash(board: &[u32]) -> u64 {
    let table = zobrist_table();
    let mut h: u64 = 0;
    for (i, &v) in board.iter().enumerate() {
        if v != 0 && i < ZOBRIST_CELLS {
            let rank = (v.trailing_zeros() as usize).min(ZOBRIST_RANKS - 1);
            h ^= table[i][rank];
        }
    }
    h
}

pub(crate) fn tt_get(hash: u64, depth: usize) -> Option<f64> {
    TT.with(|c| {
        let table = c.borrow();
        let entry = table[(hash & TT_MASK) as usize];
        if entry.occupied && entry.key == hash && entry.depth as usize >= depth {
            Some(entry.value as f64)
        } else {
            None
        }
    })
}

pub(crate) fn tt_put(hash: u64, depth: usize, value: f64) {
    TT.with(|c| {
        let mut table = c.borrow_mut();
        let idx = (hash & TT_MASK) as usize;
        let entry = &mut table[idx];
        if !entry.occupied || entry.key != hash || depth as u8 >= entry.depth {
            *entry = TTEntry {
                key: hash,
                depth: depth.min(255) as u8,
                value: value as f32,
                occupied: true,
            };
        }
    });
}
