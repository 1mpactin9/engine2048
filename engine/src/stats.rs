/// Diagnostic information returned by searches.
///
/// Provides visibility into how the search behaved — useful for
/// debugging, benchmarking, and UI hints.
#[derive(Debug, Clone, Default)]
pub struct SearchStats {
    /// Total nodes visited during the search (including TT hits).
    pub nodes_visited: u64,
    /// Depth reached before time/budget was exhausted.
    pub depth_reached: usize,
    /// Wall-clock time in milliseconds.
    pub elapsed_ms: f64,
    /// Number of distinct board positions hashed into the TT.
    pub tt_entries: usize,
    /// Direction of the best move found, if any.
    pub best_direction: Option<crate::Direction>,
    /// Score of the best move found.
    pub best_score: f64,
}

impl SearchStats {
    pub fn new() -> Self {
        SearchStats::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_empty() {
        let s = SearchStats::default();
        assert_eq!(s.nodes_visited, 0);
        assert_eq!(s.depth_reached, 0);
        assert!(s.best_direction.is_none());
        assert_eq!(s.best_score, f64::NEG_INFINITY);
    }
}
