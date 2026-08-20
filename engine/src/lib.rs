mod board;
mod game;
mod search;
mod heuristic;
mod transposition;
mod deterministic;
mod usage;
mod eval;
mod eval_tracker;
mod history;
mod stats;

#[cfg(target_arch = "wasm32")]
mod wasm;

pub use game::{Action, Config, Direction, Engine, EngineError, MoveOutcome};
pub use usage::UsageMode;
pub use deterministic::SeedRng;
pub use eval::{EvalConfig, EvalMode, EvalResult, eval_cache_size, clear_eval_cache};
pub use eval_tracker::EvalTracker;
pub use transposition::set_tt_bits;
pub use history::HistoryTable;
pub use stats::SearchStats;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deterministic::score_spawn_candidate_flat;
    use crate::search::sampled_pairs;

    #[test]
    fn slide_merges_correctly() {
        let grid = vec![
            vec![2, 2, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
        ];
        let (new_grid, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(new_grid[0], vec![4, 4, 0, 0]);
        assert_eq!(gained, 4);
    }

    #[test]
    fn works_on_all_sizes() {
        for size in [3, 4, 5, 6, 8] {
            let engine = Engine::with_size(size).unwrap();
            assert_eq!(engine.grid().len(), size);
            assert_eq!(engine.grid()[0].len(), size);
            let filled = engine.grid().iter().flatten().filter(|&&v| v != 0).count();
            assert_eq!(filled, 2);
        }
    }

    #[test]
    fn undo_restores_state() {
        let mut engine = Engine::with_size(4).unwrap();
        let before = engine.grid().clone();
        let before_score = engine.score();
        for &dir in Direction::ALL.iter() {
            if engine.make_move(dir).unwrap().moved {
                break;
            }
        }
        assert!(engine.undo_available() > 0);
        engine.undo().unwrap();
        assert_eq!(engine.grid(), &before);
        assert_eq!(engine.score(), before_score);
    }

    #[test]
    fn swap_and_delete_consume_charges() {
        let mut engine = Engine::new(Config {
            size: 4,
            swap_charges: 1,
            delete_charges: 1,
            ..Config::default()
        })
        .unwrap();
        let empties_before = engine.empty_cells().len();
        let mut occupied = vec![];
        for r in 0..4 {
            for c in 0..4 {
                if engine.tile_at(r, c).unwrap() != 0 {
                    occupied.push((r, c));
                }
            }
        }
        assert!(occupied.len() >= 2);
        engine.swap_tiles(occupied[0], occupied[1]).unwrap();
        assert_eq!(engine.swaps_left(), 0);
        assert_eq!(
            engine.swap_tiles(occupied[0], occupied[1]),
            Err(EngineError::NoCharges("swap"))
        );

        engine.delete_tile(occupied[0]).unwrap();
        assert_eq!(engine.deletes_left(), 0);
        assert_eq!(engine.empty_cells().len(), empties_before + 1);
    }

    #[test]
    fn slide_flat_matches_slide_grid() {
        let grids: Vec<Vec<Vec<u32>>> = vec![
            vec![
                vec![2, 2, 4, 0],
                vec![0, 4, 4, 0],
                vec![0, 0, 2, 2],
                vec![8, 0, 0, 8],
            ],
            vec![
                vec![2, 4, 2, 4],
                vec![4, 2, 4, 2],
                vec![2, 4, 2, 4],
                vec![4, 2, 4, 2],
            ],
            vec![
                vec![0, 0, 0, 0],
                vec![0, 2, 0, 0],
                vec![0, 0, 0, 0],
                vec![0, 0, 0, 4],
            ],
            vec![vec![2, 0, 2], vec![0, 4, 0], vec![4, 0, 4]],
        ];
        for grid in grids {
            let n = grid.len();
            let board = Engine::flatten(&grid);
            for &dir in Direction::ALL.iter() {
                let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                let (flat_result, flat_gain) = Engine::slide_flat(&board, n, dir);
                let expected_flat = Engine::flatten(&expected_grid);
                assert_eq!(
                    flat_result, expected_flat,
                    "slide_flat mismatch for dir {:?} on {:?}",
                    dir, grid
                );
                assert_eq!(
                    flat_gain, expected_gain,
                    "slide_flat gain mismatch for dir {:?} on {:?}",
                    dir, grid
                );
            }
        }
    }

    #[test]
    fn ai_suggests_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let dir = engine.suggest_move(Some(2));
        assert!(dir.is_some());
    }

    #[test]
    fn action_uses_delete_to_escape_stuck_board() {
        let grid = vec![
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
        ];
        let action = Engine::suggest_action_for(&grid, 0, 1, None);
        assert!(
            matches!(action, Action::Delete(_, _)),
            "expected a delete to escape, got {:?}",
            action
        );
        assert_eq!(Engine::suggest_action_for(&grid, 0, 0, None), Action::None);
    }

    #[test]
    fn action_moves_on_comfortable_board() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let action = Engine::suggest_action_for(&grid, 2, 2, None);
        assert!(
            matches!(action, Action::Move(_)),
            "expected a move, got {:?}",
            action
        );
    }

    #[test]
    fn score_spawn_candidate_matches_grid_ts() {
        assert_eq!(score_spawn_candidate_flat(&[2, 0, 0, 4], 2), 8.0);
        assert_eq!(score_spawn_candidate_flat(&[2, 2, 0, 4], 2), 2.75);
        assert_eq!(score_spawn_candidate_flat(&[2, 4, 0, 8], 2), 1.5);
    }

    #[test]
    fn predict_spawn_returns_valid_cell_value_and_draws() {
        let grid = vec![
            vec![2, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 4, 0],
            vec![0, 8, 0, 0],
        ];
        let n = grid.len();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        for manipulate in [false, true] {
            let mut board = Engine::flatten(&grid);
            let (idx, value, draws) =
                Engine::predict_spawn_flat(&mut board, n, &key, 0, manipulate).unwrap();
            assert_eq!(board[idx], 0, "predicted cell must be empty after probe");
            assert!(
                value == 2 || value == 4,
                "value must be 2 or 4, got {}",
                value
            );
            let empties = board.iter().filter(|&&v| v == 0).count();
            let expected = if manipulate && empties > 1 {
                2 * 64_usize.min(empties)
            } else {
                2
            };
            assert_eq!(
                draws, expected as u64,
                "draws for manipulate={}",
                manipulate
            );
        }
    }

    #[test]
    fn predict_spawn_none_on_full_board() {
        let grid = vec![vec![2, 4], vec![8, 16]];
        let key = Engine::derive_key(&[0; 8]);
        let mut board = Engine::flatten(&grid);
        assert!(Engine::predict_spawn_flat(&mut board, 2, &key, 0, false).is_none());
        assert!(Engine::predict_spawn_flat(&mut board, 2, &key, 0, true).is_none());
    }

    #[test]
    fn predict_spawn_is_deterministic() {
        let grid = vec![
            vec![2, 0, 0, 0],
            vec![0, 0, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 8, 0, 0],
        ];
        let key = Engine::derive_key(&[42; 8]);
        let mut a = Engine::flatten(&grid);
        let mut b = Engine::flatten(&grid);
        let r1 = Engine::predict_spawn_flat(&mut a, 4, &key, 7, true).unwrap();
        let r2 = Engine::predict_spawn_flat(&mut b, 4, &key, 7, true).unwrap();
        assert_eq!(r1, r2);
    }

    #[test]
    fn predict_spawn_plain_consumes_two_draws_regardless_of_position() {
        let grid = vec![vec![2, 0], vec![4, 8]];
        let key = Engine::derive_key(&[9; 8]);
        let mut board = Engine::flatten(&grid);
        let (_, _, draws) = Engine::predict_spawn_flat(&mut board, 2, &key, 3, false).unwrap();
        assert_eq!(draws, 2);
        let (_, _, draws_m) = Engine::predict_spawn_flat(&mut board, 2, &key, 3, true).unwrap();
        assert_eq!(draws_m, 2);
    }

    #[test]
    fn suggest_move_det_returns_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        let dir = Engine::suggest_move_det_for(&grid, Some(3), &key, 0, true);
        assert!(dir.is_some());
    }

    #[test]
    fn suggest_action_det_moves_on_comfortable_board() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        let action = Engine::suggest_action_det_for(&grid, 2, 2, None, &key, 0, true);
        assert!(
            matches!(action, Action::Move(_)),
            "expected a move, got {:?}",
            action
        );
    }

    #[test]
    fn suggest_action_det_uses_delete_to_escape_stuck_board() {
        let grid = vec![
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
        ];
        let key = Engine::derive_key(&[7; 8]);
        let action = Engine::suggest_action_det_for(&grid, 0, 1, None, &key, 0, true);
        assert!(
            matches!(action, Action::Delete(_, _)),
            "expected a delete to escape, got {:?}",
            action
        );
        assert_eq!(
            Engine::suggest_action_det_for(&grid, 0, 0, None, &key, 0, true),
            Action::None
        );
    }

    #[test]
    fn game_over_detected_on_locked_board() {
        let mut engine = Engine::with_size(3).unwrap();
        engine.set_grid(vec![vec![2, 4, 2], vec![4, 2, 4], vec![2, 4, 8]]);
        assert!(engine.is_game_over());
    }

    #[test]
    fn seedrandom_resume_from_offset() {
        use crate::deterministic::SeedRng;
        let seed = [1u32, 2, 3, 4, 5, 6, 7, 8];
        let key = Engine::derive_key(&seed);
        let mut a = SeedRng::new(&key, 0);
        for _ in 0..5 {
            a.next();
        }
        let mut b = SeedRng::new(&key, 5);
        for _ in 0..10 {
            let va = a.next();
            let vb = b.next();
            assert!((va - vb).abs() < 1e-12, "{} vs {}", va, vb);
        }
    }

    #[test]
    fn seedrandom_matches_js_reference() {
        use crate::deterministic::SeedRng;
        let seed = [1u32, 2, 3, 4, 5, 6, 7, 8];
        let key = Engine::derive_key(&seed);
        let mut rng = SeedRng::new(&key, 0);
        let expected = [
            0.812495365840605f64,
            0.147393390487252,
            0.187630772499566,
            0.992027953955305,
            0.676524052093521,
        ];
        for (i, &want) in expected.iter().enumerate() {
            let got = rng.next();
            assert!(
                (got - want).abs() < 1e-12,
                "mismatch at index {}: got {} want {}",
                i, got, want
            );
        }
    }

    #[test]
    fn undo_respects_max_history() {
        let mut engine = Engine::new(Config {
            size: 4,
            max_undo_history: 2,
            ..Config::default()
        })
        .unwrap();

        for _ in 0..5 {
            for &dir in Direction::ALL.iter() {
                if engine.make_move(dir).unwrap().moved {
                    break;
                }
            }
        }
        assert_eq!(engine.undo_available(), 2);

        engine.undo().unwrap();
        engine.undo().unwrap();

        assert_eq!(engine.undo(), Err(EngineError::NothingToUndo));
    }

    #[test]
    fn slide_grid_empty_grid() {
        let grid = vec![vec![0; 4]; 4];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(result, grid);
        assert_eq!(gained, 0);
    }

    #[test]
    fn slide_grid_reverse_direction_right() {
        let grid = vec![vec![2, 2, 4, 4], vec![0; 4], vec![0; 4], vec![0; 4]];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Right);
        assert_eq!(result[0], vec![0, 0, 4, 8]);
        assert_eq!(gained, 12);
    }

    #[test]
    fn slide_grid_up_direction() {
        let mut grid = vec![vec![0; 4]; 4];
        grid[1][0] = 2;
        grid[2][0] = 2;
        let (result, gained) = Engine::slide_grid(&grid, Direction::Up);
        assert_eq!(result[0][0], 4);
        assert_eq!(result[1][0], 0);
        assert_eq!(gained, 4);
    }

    #[test]
    fn slide_grid_down_direction() {
        let mut grid = vec![vec![0; 4]; 4];
        grid[1][0] = 2;
        grid[2][0] = 2;
        let (result, gained) = Engine::slide_grid(&grid, Direction::Down);
        assert_eq!(result[3][0], 4);
        assert_eq!(gained, 4);
    }

    #[test]
    fn slide_grid_empty_rows_pass_through() {
        let grid = vec![
            vec![2, 0, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
        ];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(result[0], vec![2, 4, 0, 0]);
        assert_eq!(gained, 0);
        assert_eq!(result[1], vec![0; 4]);
    }

    #[test]
    fn slide_flat_matches_slide_grid_all_sizes() {
        let sizes = [3u32, 4, 5, 6, 8];
        for size in sizes {
            let grid: Vec<Vec<u32>> = (0..size)
                .map(|r| (0..size).map(|c| ((r * size + c + 1) as u32) * 2).collect())
                .collect();
            let board = Engine::flatten(&grid);
            for &dir in Direction::ALL.iter() {
                let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                let (flat_result, flat_gain) = Engine::slide_flat(&board, size as usize, dir);
                let expected_flat = Engine::flatten(&expected_grid);
                assert_eq!(flat_result, expected_flat, "size {} dir {:?}", size, dir);
                assert_eq!(flat_gain, expected_gain, "size {} dir gain {:?}", size, dir);
            }
        }
    }

    #[test]
    fn auto_depth_floor_is_2() {
        let grid = vec![vec![0u32; 4]; 4];
        let depth = Engine::auto_depth(&grid);
        assert!(depth >= 2);
    }

    #[test]
    fn auto_depth_deeper_on_dangerous_board() {
        let mut grid = vec![vec![0u32; 4]; 4];
        for r in 0..4 {
            for c in 0..4 {
                if r != 0 || c != 0 {
                    grid[r][c] = 2;
                }
            }
        }
        let deep = Engine::auto_depth(&grid);
        let empty = Engine::auto_depth(&vec![vec![0u32; 4]; 4]);
        assert!(deep > empty);
    }

    #[test]
    fn auto_depth_different_bases_per_size() {
        let grid3 = vec![vec![0u32; 3]; 3];
        let grid8 = vec![vec![0u32; 8]; 8];
        assert!(Engine::auto_depth(&grid3) > Engine::auto_depth(&grid8));
    }

    #[test]
    fn budget_for_depth_values() {
        assert_eq!(Engine::budget_for_depth(0), 20_000);
        assert_eq!(Engine::budget_for_depth(2), 20_000);
        assert_eq!(Engine::budget_for_depth(3), 60_000);
        assert_eq!(Engine::budget_for_depth(4), 140_000);
        assert_eq!(Engine::budget_for_depth(5), 260_000);
        assert_eq!(Engine::budget_for_depth(6), 260_000);
        assert_eq!(Engine::budget_for_depth(7), 420_000);
        assert_eq!(Engine::budget_for_depth(8), 420_000);
        assert_eq!(Engine::budget_for_depth(10), 650_000);
    }

    #[test]
    fn snake_score_flat_empty_board() {
        let board: Vec<u32> = vec![0; 16];
        assert_eq!(Engine::snake_score_flat(&board, 4), 0.0);
    }

    #[test]
    fn snake_score_flat_single_corner_tile_positive() {
        let mut board = vec![0u32; 16];
        board[0] = 2048;
        let score = Engine::snake_score_flat(&board, 4);
        assert!(score > 0.0);
    }

    #[test]
    fn sampled_pairs_returns_all_when_few() {
        let occ: Vec<(usize, usize)> = vec![(0, 0), (0, 1), (1, 0)];
        let pairs = sampled_pairs(&occ, 100);
        assert_eq!(pairs.len(), 3);
    }

    #[test]
    fn sampled_pairs_caps_at_max() {
        let occ: Vec<(usize, usize)> = (0..20).map(|i| (i, 0)).collect();
        let pairs = sampled_pairs(&occ, 5);
        assert!(pairs.len() <= 5);
    }

    #[test]
    fn sampled_pairs_empty_input() {
        let occ: Vec<(usize, usize)> = vec![];
        assert!(sampled_pairs(&occ, 10).is_empty());
    }

    #[test]
    fn heuristic_flat_empty_board_only_empty_term() {
        let board: Vec<u32> = vec![0; 16];
        let h = Engine::heuristic_flat(&board, 4);
        assert!(h > 0.0);
    }

    #[test]
    fn heuristic_flat_sorted_board_high_score() {
        let mut board = vec![0u32; 16];
        board[0] = 2048;
        board[1] = 1024;
        board[3] = 512;
        board[2] = 256;
        let sorted = Engine::heuristic_flat(&board, 4);
        let mut scrambled = board.clone();
        scrambled[1] = 256;
        scrambled[2] = 1024;
        let unsorted = Engine::heuristic_flat(&scrambled, 4);
        assert!(
            sorted > unsorted,
            "snake-ordered board should beat scrambled: sorted={} unsorted={}",
            sorted, unsorted
        );
    }

    #[test]
    fn suggest_move_guarantee_returns_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let dir = Engine::suggest_move_guarantee(engine.grid(), UsageMode::Balanced);
        assert!(dir.is_some());
    }

    #[test]
    fn suggest_move_guarantee_depth_scales_with_distinct_tiles() {
        let mut board = vec![vec![0u32; 4]; 4];
        let tiles = [2u32, 4, 8, 16, 32, 64, 128];
        for (i, &t) in tiles.iter().enumerate() {
            board[i / 4][i % 4] = t;
        }
        let dir = Engine::suggest_move_guarantee(&board, UsageMode::Balanced);
        assert!(dir.is_some());
    }
}

#[cfg(test)]
mod endgame_checks {
    use super::*;

    #[test]
    fn endgame_boost_applies_when_few_empties() {
        let mut grid = vec![vec![0u32; 4]; 4];
        let mut v = 2u32;
        for r in 0..4 {
            for c in 0..4 {
                if !(r == 3 && c == 3) {
                    grid[r][c] = v;
                    v = if v == 2048 { 2 } else { v * 2 };
                }
            }
        }
        let depth = Engine::endgame_depth(&grid, 6);
        assert!(depth >= 30);
    }

    #[test]
    fn endgame_boost_not_applied_on_open_board() {
        let grid = vec![vec![0u32; 4]; 4];
        let depth = Engine::endgame_depth(&grid, 6);
        assert_eq!(depth, 6);
    }
}
