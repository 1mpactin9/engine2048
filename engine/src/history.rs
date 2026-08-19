/// History heuristic for improved move ordering.
///
/// Tracks which directions have historically produced good moves and
/// uses this to reorder candidate moves before search. This is a
/// lightweight replacement for a full killer/heavyweight history table
/// and works across search iterations.
///
/// The history table is cleared at the start of each top-level
/// `best_move` call so stale signals don't bleed across independent
/// searches.
pub struct HistoryTable {
    /// Per-direction scores. Higher is better.
    table: [i64; 4],
}

impl HistoryTable {
    pub fn new() -> Self {
        HistoryTable { table: [0; 4] }
    }

    #[inline]
    pub fn clear(&mut self) {
        self.table = [0; 4];
    }

    /// Update history after a move proves promising at the given depth.
    /// Deeper searches get a larger boost.
    #[inline]
    pub fn update(&mut self, dir_idx: usize, depth: usize, is_good: bool) {
        if dir_idx >= 4 {
            return;
        }
        if is_good {
            self.table[dir_idx] += depth as i64 * 2;
        } else {
            self.table[dir_idx] -= 1;
        }
    }

    /// Return the ordering score for a direction index.
    #[inline]
    pub fn score(&self, dir_idx: usize) -> i64 {
        if dir_idx >= 4 {
            return 0;
        }
        self.table[dir_idx]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_table_is_zero() {
        let h = HistoryTable::new();
        for i in 0..4 {
            assert_eq!(h.score(i), 0);
        }
    }

    #[test]
    fn update_increases_good_score() {
        let mut h = HistoryTable::new();
        h.update(0, 5, true);
        assert!(h.score(0) > 0);
        assert_eq!(h.score(1), 0);
    }

    #[test]
    fn update_decreases_bad_score() {
        let mut h = HistoryTable::new();
        h.update(0, 3, false);
        assert!(h.score(0) < 0);
    }

    #[test]
    fn clear_resets_all() {
        let mut h = HistoryTable::new();
        h.update(0, 5, true);
        h.update(1, 3, true);
        assert!(h.score(0) > 0);
        assert!(h.score(1) > 0);
        h.clear();
        for i in 0..4 {
            assert_eq!(h.score(i), 0);
        }
    }

    #[test]
    fn deep_search_gets_bigger_boost() {
        let mut h = HistoryTable::new();
        h.update(0, 3, true);
        let shallow = h.score(0);
        h.clear();
        h.update(0, 8, true);
        let deep = h.score(0);
        assert!(deep > shallow);
    }

    #[test]
    fn out_of_bounds_is_safe() {
        let mut h = HistoryTable::new();
        h.update(10, 5, true);
        assert_eq!(h.score(10), 0);
    }
}
