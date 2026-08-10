#pragma once
#include "board.h"
#include "tables.h"
#include "weights.h"
#include "transposition_table.h"
#include <algorithm>
#include <cstdint>
#include <chrono>

namespace eng {

struct SearchConfig {
    float  cprob_thresh   = 0.0001f;
    int    cache_depth_limit = 15;
    int    min_search_depth  = 3;
    int    depth_bias        = 2;   // depth_limit = max(min_search_depth, distinct_tiles - depth_bias)
    int    max_search_depth  = 8;   // hard ceiling; depth_limit is clamped to this regardless of tile count
    size_t tt_size_pow2       = (1u << 22);
    bool   use_cache          = true;
};

struct SearchStats {
    uint64_t moves_evaled = 0;
    uint64_t cache_hits = 0;
    int      max_depth_reached = 0;
};

class Engine {
public:
    Engine(const Weights& w, const SearchConfig& cfg)
        : weights_(w), cfg_(cfg), tables_(w), tt_(cfg.tt_size_pow2) {}

    inline board_t execute_move(int move, board_t board) const {
        return tables_.execute_move(move, board);
    }

    inline float score_heur(board_t board) const { return tables_.score_heur(board); }
    inline float score_actual(board_t board) const { return tables_.score_actual(board); }

    // Returns best move index (0..3), or -1 if no legal move.
    // Fixed-depth expectimax, matching nneonneo/2048-ai's design exactly:
    // depth_limit = max(min_search_depth, distinct_tiles - depth_bias), clamped
    // to max_search_depth. Deliberately no wall-clock time budget or iterative
    // deepening — those made search depth (and therefore the actual moves
    // played) depend on machine timing, so the same --seed could produce a
    // different game on different runs, which made every benchmark comparison
    // unreliable. Fixed depth is fully deterministic: same board, same
    // search, same move, every time, on any machine.
    int best_move(board_t board, SearchStats* stats_out = nullptr) {
        int depth_limit = std::max(cfg_.min_search_depth, count_distinct_tiles(board) - cfg_.depth_bias);
        depth_limit = std::min(depth_limit, cfg_.max_search_depth);

        Ctx ctx{depth_limit, 0, 0, 0, 0};
        int best_move_idx = search_at_depth(board, ctx);

        if (stats_out) {
            stats_out->moves_evaled = ctx.moves_evaled;
            stats_out->cache_hits = ctx.cache_hits;
            stats_out->max_depth_reached = ctx.maxdepth;
        }
        return best_move_idx;
    }

    void reset_cache() { tt_.clear(); }
    const TranspositionTable& transposition_table() const { return tt_; }

private:
    struct Ctx {
        int depth_limit;
        int curdepth = 0;
        uint64_t moves_evaled = 0;
        uint64_t cache_hits = 0;
        int maxdepth = 0;
    };

    int search_at_depth(board_t board, Ctx& ctx) {
        int best_move_idx = -1;
        float best_score = -1.0f;
        // Epsilon-tolerant comparison: cache hits and freshly-recomputed
        // subtrees can produce values that are equal in principle but differ
        // in the last few bits of float32 precision (summation order isn't
        // identical between the two code paths). Without this tolerance,
        // that noise can flip the outcome on a genuine tie between two moves,
        // which showed up as cache-dependent move selection on some boards
        // even though every individual cached value was verified correct.
        // Using ">" (not ">=") means the first move encountered wins ties,
        // so tie-breaking is deterministic by move order (UP, DOWN, LEFT,
        // RIGHT) rather than by incidental float noise.
        constexpr float TIE_EPSILON = 1e-3f;
        for (int m = 0; m < NUM_MOVES; ++m) {
            board_t nb = tables_.execute_move(m, board);
            if (nb == board) continue;
            float s = score_tilechoose(ctx, nb, 1.0f);
            if (s > best_score + TIE_EPSILON) { best_score = s; best_move_idx = m; }
        }
        return best_move_idx;
    }

    float score_tilechoose(Ctx& ctx, board_t board, float cprob) {
        if (cprob < cfg_.cprob_thresh || ctx.curdepth >= ctx.depth_limit) {
            ctx.maxdepth = std::max(ctx.curdepth, ctx.maxdepth);
            return tables_.score_heur(board);
        }

        if (cfg_.use_cache && ctx.curdepth < cfg_.cache_depth_limit) {
            float cached;
            int bucket = TranspositionTable::cprob_to_bucket(cprob, cfg_.cprob_thresh);
            if (tt_.lookup(board, ctx.curdepth, bucket, cached)) {
                ctx.cache_hits++;
                return cached;
            }
        }

        int num_open = count_empty(board);
        cprob /= num_open;

        float res = 0.0f;
        board_t tmp = board;
        board_t tile_2 = 1;
        while (tile_2) {
            if ((tmp & 0xf) == 0) {
                res += score_move(ctx, board | tile_2, cprob * 0.9f) * 0.9f;
                res += score_move(ctx, board | (tile_2 << 1), cprob * 0.1f) * 0.1f;
            }
            tmp >>= 4;
            tile_2 <<= 4;
        }
        res /= num_open;

        if (cfg_.use_cache && ctx.curdepth < cfg_.cache_depth_limit) {
            int bucket = TranspositionTable::cprob_to_bucket(cprob, cfg_.cprob_thresh);
            tt_.store(board, uint8_t(ctx.curdepth), bucket, res);
        }
        return res;
    }

    float score_move(Ctx& ctx, board_t board, float cprob) {
        float best = 0.0f;
        ctx.curdepth++;
        for (int m = 0; m < NUM_MOVES; ++m) {
            board_t nb = tables_.execute_move(m, board);
            ctx.moves_evaled++;
            if (nb != board) {
                best = std::max(best, score_tilechoose(ctx, nb, cprob));
            }
        }
        ctx.curdepth--;
        return best;
    }

    Weights weights_;
    SearchConfig cfg_;
    Tables tables_;
    TranspositionTable tt_;
};

} // namespace eng
