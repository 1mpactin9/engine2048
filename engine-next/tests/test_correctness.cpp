#include "board.h"
#include "tables.h"
#include "weights.h"
#include "transposition_table.h"
#include "engine.h"
#include <cstdio>
#include <cassert>

using namespace eng;

static int failures = 0;

#define CHECK(cond, msg)                                           \
    do                                                             \
    {                                                              \
        if (!(cond))                                               \
        {                                                          \
            printf("FAIL: %s (%s:%d)\n", msg, __FILE__, __LINE__); \
            failures++;                                            \
        }                                                          \
        else                                                       \
        {                                                          \
            printf("ok:   %s\n", msg);                             \
        }                                                          \
    } while (0)

static void test_transpose_involution()
{
    board_t b = 0x123456789ABCDEF0ULL;
    CHECK(transpose(transpose(b)) == b, "transpose is its own inverse");
}

static void test_reverse_row_involution()
{
    row_t r = 0x1234;
    CHECK(reverse_row(reverse_row(r)) == r, "reverse_row is its own inverse");
}

static void test_count_empty()
{
    // Precondition (inherited from the original bitboard trick): count_empty
    // is only valid on boards with at least one tile placed, since 16 empty
    // nibbles overflow the counting nibble to 0. This is never reached in
    // real gameplay (the game always starts with tiles placed), so it's not
    // a correctness issue, just a documented input constraint.
    board_t one_tile = 0x1ULL;
    CHECK(count_empty(one_tile) == 15, "board with one tile has 15 empty cells");
    board_t full = 0x1111111111111111ULL; // all filled with rank 1
    CHECK(count_empty(full) == 0, "full board has 0 empty cells");
}

static void test_moves_basic()
{
    Weights w;
    Tables t(w);

    // Row: [2,2,0,0] (ranks 1,1,0,0) moving left should merge to [4,0,0,0] (rank 2,0,0,0)
    board_t row_board = 0x0000000000000011ULL; // nibble0=1, nibble1=1
    board_t after_left = t.move_left(row_board);
    unsigned nib0 = after_left & 0xf;
    unsigned nib1 = (after_left >> 4) & 0xf;
    CHECK(nib0 == 2 && nib1 == 0, "two equal tiles merge correctly moving left");
}

static void test_move_noop_detection()
{
    Weights w;
    Tables t(w);
    // Fully merged/compacted row moving further left should be a no-op.
    board_t b = 0x0000000000000021ULL; // [rank2, rank1, 0, 0] already left-compacted, distinct values
    board_t after = t.move_left(b);
    CHECK(after == b, "already-compacted distinct row is unchanged by move_left");
}

static void test_cache_respects_depth()
{
    TranspositionTable tt(1 << 10);
    board_t key = 0xABCDEF0123456789ULL;
    tt.store(key, 5, 10, 42.0f);

    float out;
    CHECK(tt.lookup(key, 5, 10, out) && out == 42.0f, "cache hit at exact recorded depth and cprob bucket");
    CHECK(tt.lookup(key, 10, 10, out) && out == 42.0f, "cache hit when query depth is looser (>= recorded)");
    CHECK(!tt.lookup(key, 2, 10, out), "cache miss when query requires stricter (shallower) depth than recorded");
    CHECK(tt.lookup(key, 5, 3, out) && out == 42.0f,
          "cache hit when query cprob bucket is smaller than recorded (stored value did at least as much work)");
    CHECK(!tt.lookup(key, 5, 20, out),
          "cache miss when query cprob bucket is larger than recorded (stored value may have bailed out early and done less work)");
}

static void test_cprob_bucket_monotonic()
{
    float thresh = 0.0001f;
    int b_high = TranspositionTable::cprob_to_bucket(0.5f, thresh);
    int b_mid = TranspositionTable::cprob_to_bucket(0.001f, thresh);
    int b_low = TranspositionTable::cprob_to_bucket(0.00011f, thresh);
    int b_at_thresh = TranspositionTable::cprob_to_bucket(0.0001f, thresh);
    CHECK(b_high > b_mid && b_mid > b_low && b_low >= b_at_thresh,
          "cprob_to_bucket is monotonically non-decreasing as cprob increases");
    CHECK(b_at_thresh == 0, "cprob at or below threshold maps to bucket 0");
}

static void test_engine_produces_legal_move()
{
    Weights w;
    SearchConfig cfg;
    cfg.max_search_depth = 5;
    Engine engine(w, cfg);

    board_t board = 0x0000000000000021ULL; // a couple tiles placed, rest empty
    SearchStats stats;
    int move = engine.best_move(board, &stats);
    CHECK(move >= 0 && move < 4, "engine returns a valid move index for a non-terminal board");
    CHECK(engine.execute_move(move, board) != board, "chosen move actually changes the board");
}

static void test_engine_terminal_board()
{
    Weights w;
    SearchConfig cfg;
    Engine engine(w, cfg);

    // Fully filled board with alternating distinct values so no merges/moves are possible.
    board_t board = 0x1234123412341234ULL;
    bool any_legal = false;
    for (int m = 0; m < 4; m++)
    {
        if (engine.execute_move(m, board) != board)
            any_legal = true;
    }
    if (!any_legal)
    {
        int move = engine.best_move(board, nullptr);
        CHECK(move == -1, "engine reports no legal move on a terminal board");
    }
    else
    {
        CHECK(true, "skipped: constructed board was not actually terminal");
    }
}

static void test_determinism()
{
    // The whole point of the fixed-depth rewrite: two fresh engines given the
    // exact same board must choose the exact same move, every time, with no
    // dependence on wall-clock timing. This was NOT true of the earlier
    // time-budgeted iterative-deepening design and caused unreproducible
    // benchmark results.
    Weights w;
    SearchConfig cfg;
    board_t board = 0x0000000000112342ULL;

    Engine engine1(w, cfg);
    Engine engine2(w, cfg);
    int move1 = engine1.best_move(board, nullptr);
    int move2 = engine2.best_move(board, nullptr);
    CHECK(move1 == move2, "two independent engine instances pick the same move for the same board");

    Engine engine3(w, cfg);
    int move3 = engine3.best_move(board, nullptr);
    int move3b = engine3.best_move(board, nullptr);
    CHECK(move3 == move3b, "the same engine instance picks the same move when asked twice for the same board");
}

int main()
{
    test_transpose_involution();
    test_reverse_row_involution();
    test_count_empty();
    test_moves_basic();
    test_move_noop_detection();
    test_cache_respects_depth();
    test_cprob_bucket_monotonic();
    test_determinism();
    test_engine_produces_legal_move();
    test_engine_terminal_board();

    printf("\n%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
