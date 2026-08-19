#pragma once
#include "board.h"
#include "weights.h"
#include <cmath>
#include <vector>

namespace eng {

class Tables {
public:
    std::vector<row_t>   row_left, row_right;
    std::vector<board_t> col_up, col_down;
    std::vector<float>   heur_score;
    std::vector<float>   raw_score;
    // Snake weight tables: snake_row_even applies to board rows 0 and 2,
    // snake_row_odd to rows 1 and 3, so the weights alternate direction and
    // together encode a continuous boustrophedon path across the whole board.
    std::vector<float>   snake_row_even;
    std::vector<float>   snake_row_odd;

    explicit Tables(const Weights& w) {
        row_left.resize(65536);
        row_right.resize(65536);
        col_up.resize(65536);
        col_down.resize(65536);
        heur_score.resize(65536);
        raw_score.resize(65536);
        snake_row_even.resize(65536);
        snake_row_odd.resize(65536);
        corner_weight_ = w.corner_weight;
        adjacent_empty_weight_ = w.adjacent_empty_weight;
        build(w);
        build_snake();
    }

    inline board_t move_up(board_t board) const {
        board_t ret = board;
        board_t t = transpose(board);
        ret ^= col_up[(t >> 0) & ROW_MASK] << 0;
        ret ^= col_up[(t >> 16) & ROW_MASK] << 4;
        ret ^= col_up[(t >> 32) & ROW_MASK] << 8;
        ret ^= col_up[(t >> 48) & ROW_MASK] << 12;
        return ret;
    }
    inline board_t move_down(board_t board) const {
        board_t ret = board;
        board_t t = transpose(board);
        ret ^= col_down[(t >> 0) & ROW_MASK] << 0;
        ret ^= col_down[(t >> 16) & ROW_MASK] << 4;
        ret ^= col_down[(t >> 32) & ROW_MASK] << 8;
        ret ^= col_down[(t >> 48) & ROW_MASK] << 12;
        return ret;
    }
    inline board_t move_left(board_t board) const {
        board_t ret = board;
        ret ^= board_t(row_left[(board >> 0) & ROW_MASK]) << 0;
        ret ^= board_t(row_left[(board >> 16) & ROW_MASK]) << 16;
        ret ^= board_t(row_left[(board >> 32) & ROW_MASK]) << 32;
        ret ^= board_t(row_left[(board >> 48) & ROW_MASK]) << 48;
        return ret;
    }
    inline board_t move_right(board_t board) const {
        board_t ret = board;
        ret ^= board_t(row_right[(board >> 0) & ROW_MASK]) << 0;
        ret ^= board_t(row_right[(board >> 16) & ROW_MASK]) << 16;
        ret ^= board_t(row_right[(board >> 32) & ROW_MASK]) << 32;
        ret ^= board_t(row_right[(board >> 48) & ROW_MASK]) << 48;
        return ret;
    }

    inline board_t execute_move(int move, board_t board) const {
        switch (move) {
            case UP:    return move_up(board);
            case DOWN:  return move_down(board);
            case LEFT:  return move_left(board);
            case RIGHT: return move_right(board);
            default:    return ~0ULL;
        }
    }

    inline float score_helper(board_t board, const std::vector<float>& t) const {
        return t[(board >> 0) & ROW_MASK] + t[(board >> 16) & ROW_MASK] +
               t[(board >> 32) & ROW_MASK] + t[(board >> 48) & ROW_MASK];
    }

    inline float score_heur(board_t board) const {
        board_t t = transpose(board);
        float base = score_helper(board, heur_score) + score_helper(t, heur_score);
        if (corner_weight_ != 0.0f) {
            base += std::max(snake_one_orientation(board), snake_one_orientation(t)) * corner_weight_;
        }
        if (adjacent_empty_weight_ != 0.0f) {
            base += score_adjacent_empty(board) * adjacent_empty_weight_;
        }
        return base;
    }

    inline float score_actual(board_t board) const {
        return score_helper(board, raw_score);
    }

private:
    float corner_weight_ = 0.0f;
    float adjacent_empty_weight_ = 0.0f;

    // Count orthogonal (horizontal + vertical) adjacent pairs of empty cells.
    // Useful because adjacent empties create merge opportunities; isolated
    // empties are less valuable even though the raw count is the same.
    inline float score_adjacent_empty(board_t board) const {
        float count = 0.0f;
        // Horizontal adjacency: (row, col) and (row, col+1)
        for (int row = 0; row < 4; ++row) {
            for (int col = 0; col < 3; ++col) {
                int idx = row * 4 + col;
                if (((board >> (idx * 4)) & 0xf) == 0 &&
                    ((board >> ((idx + 1) * 4)) & 0xf) == 0) {
                    ++count;
                }
            }
        }
        // Vertical adjacency: (row, col) and (row+1, col)
        for (int row = 0; row < 3; ++row) {
            for (int col = 0; col < 4; ++col) {
                int idx = row * 4 + col;
                if (((board >> (idx * 4)) & 0xf) == 0 &&
                    ((board >> ((idx + 4) * 4)) & 0xf) == 0) {
                    ++count;
                }
            }
        }
        return count;
    }

    inline float snake_one_orientation(board_t b) const {
        return snake_row_even[(b >> 0) & ROW_MASK] + snake_row_odd[(b >> 16) & ROW_MASK] +
               snake_row_even[(b >> 32) & ROW_MASK] + snake_row_odd[(b >> 48) & ROW_MASK];
    }

    // Snake/corner heuristic, implemented as table lookups only (same cost
    // model as every other heuristic term below). snake_row_even/odd jointly
    // encode one fixed exponential weight path (a "boustrophedon" snake)
    // anchored at a corner. The value degrades smoothly as tiles drift out of
    // order instead of collapsing to zero the instant the max tile leaves a
    // corner, unlike a hard corner-occupancy check.
    //
    // score_heur checks 2 of the 4 possible corner anchors (this orientation
    // and its transpose, reusing the transpose already computed for the base
    // heuristic) rather than all 4: this runs on every leaf node of the
    // search (billions of times per game), and a full 4-way check requiring
    // reconstructed row-reversed boards measured ~3x more expensive for
    // marginal extra coverage — the two omitted corners are still indirectly
    // encouraged by the base monotonicity term, which already scores both
    // row and transpose directions symmetrically.
    void build(const Weights& w) {
        for (unsigned row = 0; row < 65536; ++row) {
            unsigned line[4] = {
                (row >> 0) & 0xf, (row >> 4) & 0xf,
                (row >> 8) & 0xf, (row >> 12) & 0xf
            };

            float score = 0.0f;
            for (int i = 0; i < 4; ++i) {
                int rank = line[i];
                if (rank >= 2) score += (rank - 1) * float(1 << rank);
            }
            raw_score[row] = score;

            float sum = 0;
            int empty = 0, merges = 0, prev = 0, counter = 0;
            for (int i = 0; i < 4; ++i) {
                int rank = line[i];
                sum += std::pow(float(rank), w.sum_power);
                if (rank == 0) {
                    empty++;
                } else {
                    if (prev == rank) counter++;
                    else if (counter > 0) { merges += 1 + counter; counter = 0; }
                    prev = rank;
                }
            }
            if (counter > 0) merges += 1 + counter;

            float mono_left = 0, mono_right = 0;
            for (int i = 1; i < 4; ++i) {
                if (line[i - 1] > line[i])
                    mono_left += std::pow(float(line[i - 1]), w.monotonicity_power) - std::pow(float(line[i]), w.monotonicity_power);
                else
                    mono_right += std::pow(float(line[i]), w.monotonicity_power) - std::pow(float(line[i - 1]), w.monotonicity_power);
            }

            heur_score[row] = w.lost_penalty +
                w.empty_weight * empty +
                w.merges_weight * merges -
                w.monotonicity_weight * std::min(mono_left, mono_right) -
                w.sum_weight * sum;

            for (int i = 0; i < 3; ++i) {
                int j;
                for (j = i + 1; j < 4; ++j) if (line[j] != 0) break;
                if (j == 4) break;
                if (line[i] == 0) {
                    line[i] = line[j]; line[j] = 0; i--;
                } else if (line[i] == line[j]) {
                    if (line[i] != 0xf) line[i]++;
                    line[j] = 0;
                }
            }

            row_t result = row_t((line[0] << 0) | (line[1] << 4) | (line[2] << 8) | (line[3] << 12));
            row_t rev_result = reverse_row(result);
            unsigned rev_row = reverse_row(row_t(row));

            row_left[row]      = row_t(row) ^ result;
            row_right[rev_row] = row_t(rev_row) ^ rev_result;
            col_up[row]        = unpack_col(row_t(row)) ^ unpack_col(result);
            col_down[rev_row]  = unpack_col(row_t(rev_row)) ^ unpack_col(rev_result);
        }
    }

    // Weight magnitudes follow the widely-used 4^k progression for snake
    // heuristics (each step out from the anchor corner is worth 1/4 of the
    // previous one), keeping the top-left tile dominant in the score. Divided
    // by 2^18 so the resulting term is O(tile rank) rather than O(2^18 *
    // rank), keeping --corner-weight on a comparable scale to the other
    // heuristic weights (roughly 0-300 is a sane range, same as empty/merges).
    void build_snake() {
        static const float POS_WEIGHT[4] = {
            1.0f, 1.0f / 4.0f, 1.0f / 16.0f, 1.0f / 64.0f
        };
        for (unsigned row = 0; row < 65536; ++row) {
            unsigned line[4] = {
                (row >> 0) & 0xf, (row >> 4) & 0xf,
                (row >> 8) & 0xf, (row >> 12) & 0xf
            };
            float even = 0.0f, odd = 0.0f;
            for (int i = 0; i < 4; ++i) {
                float tile_value = line[i] == 0 ? 0.0f : float(1 << line[i]);
                even += tile_value * POS_WEIGHT[i];
                odd  += tile_value * POS_WEIGHT[3 - i];
            }
            snake_row_even[row] = even;
            snake_row_odd[row] = odd;
        }
    }
};

} // namespace eng
