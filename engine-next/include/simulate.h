#pragma once
#include "board.h"
#include "engine.h"
#include <random>
#include <chrono>

namespace eng {

struct GameResult {
    uint64_t score = 0;
    int max_tile = 0;
    int moves = 0;
    double elapsed_sec = 0.0;
    uint64_t total_moves_evaled = 0;
    uint64_t total_cache_hits = 0;
};

class RNG {
public:
    explicit RNG(uint64_t seed) : gen_(seed) {}
    int uniform(int bound) { return std::uniform_int_distribution<int>(0, bound - 1)(gen_); }
    double uniform01() { return std::uniform_real_distribution<double>(0.0, 1.0)(gen_); }
private:
    std::mt19937_64 gen_;
};

inline board_t draw_tile(RNG& rng) { return rng.uniform01() < 0.9 ? 1 : 2; }

inline board_t insert_tile_rand(board_t board, board_t tile, RNG& rng) {
    int index = rng.uniform(count_empty(board));
    board_t tmp = board;
    while (true) {
        while ((tmp & 0xf) != 0) { tmp >>= 4; tile <<= 4; }
        if (index == 0) break;
        --index;
        tmp >>= 4;
        tile <<= 4;
    }
    return board | tile;
}

inline board_t initial_board(RNG& rng) {
    board_t board = draw_tile(rng) << (4 * rng.uniform(16));
    return insert_tile_rand(board, draw_tile(rng), rng);
}

inline GameResult play_one_game(Engine& engine, uint64_t seed, bool reset_cache_each_game = false) {
    RNG rng(seed);
    board_t board = initial_board(rng);
    GameResult result;
    auto t0 = std::chrono::steady_clock::now();

    if (reset_cache_each_game) engine.reset_cache();

    while (true) {
        bool any_move = false;
        for (int m = 0; m < NUM_MOVES; ++m) {
            if (engine.execute_move(m, board) != board) { any_move = true; break; }
        }
        if (!any_move) break;

        SearchStats stats;
        int move = engine.best_move(board, &stats);
        result.total_moves_evaled += stats.moves_evaled;
        result.total_cache_hits += stats.cache_hits;
        if (move < 0) break;

        board_t nb = engine.execute_move(move, board);
        if (nb == board) break;

        board_t tile = draw_tile(rng);
        board = insert_tile_rand(nb, tile, rng);
        result.moves++;
    }

    auto t1 = std::chrono::steady_clock::now();
    result.elapsed_sec = std::chrono::duration<double>(t1 - t0).count();
    // Use a saturating conversion to avoid silent wrapping when the float
    // score exceeds what uint64 can represent. A game that reaches very
    // high tiles (e.g. 65536+) can produce a raw score exceeding 2^64.
    float raw_score = engine.score_actual(board);
    result.score = raw_score > 0.0f
        ? (raw_score >= double(uint64_t(-1)) ? uint64_t(-1) : uint64_t(raw_score))
        : 0ULL;
    result.max_tile = get_max_rank(board) == 0 ? 0 : (1 << get_max_rank(board));
    return result;
}

} // namespace eng
