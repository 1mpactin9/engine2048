pub struct EvalTracker {
    pub positions_evaluated: u64,
    pub total_score: f64,
    pub best_score: f64,
    pub worst_score: f64,
    pub avg_components: [f64; 8],
    pub eval_history: Vec<(usize, f64, [f64; 8])>,
}

impl EvalTracker {
    pub fn new() -> Self {
        EvalTracker {
            positions_evaluated: 0,
            total_score: 0.0,
            best_score: f64::NEG_INFINITY,
            worst_score: f64::INFINITY,
            avg_components: [0.0; 8],
            eval_history: Vec::new(),
        }
    }

    pub fn record(&mut self, position_id: usize, result: &crate::eval::EvalResult) {
        self.positions_evaluated += 1;
        self.total_score += result.score;

        if result.score > self.best_score {
            self.best_score = result.score;
        }
        if result.score < self.worst_score {
            self.worst_score = result.score;
        }

        for i in 0..8 {
            self.avg_components[i] += result.components[i];
        }

        self.eval_history.push((
            position_id,
            result.score,
            result.components,
        ));
    }

    pub fn finalize(&mut self) {
        let count = self.positions_evaluated as f64;
        for comp in self.avg_components.iter_mut() {
            *comp /= count.max(1.0);
        }
    }

    pub fn report(&self) -> String {
        let mut report = String::new();
        report.push_str("\n=== Evaluation Summary ===\n\n");
        report.push_str(&format!("Positions evaluated: {}\n", self.positions_evaluated));
        report.push_str(&format!("Score range: [{:.2}, {:.2}]\n", self.worst_score, self.best_score));
        report.push_str(&format!("Average score: {:.2}\n", self.total_score / self.positions_evaluated as f64));
        report.push_str("\nComponent averages:\n");
        for (i, &comp) in self.avg_components.iter().enumerate() {
            report.push_str(&format!("  {:30}: {:.2}\n", component_name(i), comp));
        }
        report
    }
}

fn component_name(idx: usize) -> &'static str {
    match idx {
        0 => "Empty Cells",
        1 => "Monotony",
        2 => "Smoothness",
        3 => "Snake Order",
        4 => "Consistency",
        5 => "Corner Preference",
        6 => "Max Tile",
        7 => "Tile Distribution",
        _ => "Unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eval::{EvalConfig, compute_eval_result};

    #[test]
    fn tracker_records_positions() {
        let mut tracker = EvalTracker::new();
        let board = vec![0u32; 16];
        let result = compute_eval_result(&board, 4, &EvalConfig::default());
        tracker.record(0, &result);
        assert_eq!(tracker.positions_evaluated, 1);
        assert_eq!(tracker.best_score, result.score);
        assert_eq!(tracker.worst_score, result.score);
    }

    #[test]
    fn tracker_tracks_best_worst() {
        let mut tracker = EvalTracker::new();
        let config = EvalConfig::default();

        let mut board1 = vec![0u32; 16];
        board1[0] = 2048;
        let result1 = compute_eval_result(&board1, 4, &config);

        let mut board2 = vec![0u32; 16];
        board2[3] = 4096;
        let result2 = compute_eval_result(&board2, 4, &config);

        tracker.record(0, &result1);
        tracker.record(1, &result2);

        assert_eq!(tracker.best_score, result2.score.max(result1.score));
        assert_eq!(tracker.worst_score, result2.score.min(result1.score));
    }

    #[test]
    fn tracker_finalizes_averages() {
        let mut tracker = EvalTracker::new();
        let config = EvalConfig::default();

        for i in 0..10 {
            let mut board = vec![0u32; 16];
            board[i % 16] = 2u32 << (i % 11);
            let result = compute_eval_result(&board, 4, &config);
            tracker.record(i, &result);
        }

        tracker.finalize();
        assert!((tracker.avg_components[0] - 4.0).abs() < 0.5);
    }

    #[test]
    fn tracker_report_format() {
        let mut tracker = EvalTracker::new();
        let board = vec![0u32; 16];
        let result = compute_eval_result(&board, 4, &EvalConfig::default());
        tracker.record(0, &result);
        tracker.finalize();

        let report = tracker.report();
        assert!(report.contains("Evaluation Summary"));
        assert!(report.contains("Positions evaluated: 1"));
    }
}
