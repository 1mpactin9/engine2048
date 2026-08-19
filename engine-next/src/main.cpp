#include "engine.h"
#include "simulate.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>

#ifdef _OPENMP
#include <omp.h>
#endif

using namespace eng;

struct Args
{
    int games = 10;
    uint64_t seed = 1;
    SearchConfig cfg;
    Weights w;
    bool reset_cache_each_game = false;
    bool verbose = false;
    bool replay = false;
    bool parallel_games = false;
};

static float argf(const char *v) { return float(atof(v)); }
static int argi(const char *v) { return atoi(v); }

static Args parse_args(int argc, char **argv)
{
    Args a;
    for (int i = 1; i < argc; ++i)
    {
        std::string k = argv[i];
        auto next = [&]() -> const char *
        { return (i + 1 < argc) ? argv[++i] : ""; };
        if (k == "--games")
            a.games = argi(next());
        else if (k == "--seed")
            a.seed = uint64_t(atoll(next()));
        else if (k == "--cprob")
            a.cfg.cprob_thresh = argf(next());
        else if (k == "--cache-depth-limit")
            a.cfg.cache_depth_limit = argi(next());
        else if (k == "--min-depth")
            a.cfg.min_search_depth = argi(next());
        else if (k == "--depth-bias")
            a.cfg.depth_bias = argi(next());
        else if (k == "--tt-bits")
            a.cfg.tt_size_pow2 = size_t(1) << argi(next());
        else if (k == "--no-cache")
            a.cfg.use_cache = false;
        else if (k == "--max-depth")
            a.cfg.max_search_depth = argi(next());
        else if (k == "--reset-cache-each-game")
            a.reset_cache_each_game = true;
        else if (k == "--lost-penalty")
            a.w.lost_penalty = argf(next());
        else if (k == "--mono-power")
            a.w.monotonicity_power = argf(next());
        else if (k == "--mono-weight")
            a.w.monotonicity_weight = argf(next());
        else if (k == "--sum-power")
            a.w.sum_power = argf(next());
        else if (k == "--sum-weight")
            a.w.sum_weight = argf(next());
        else if (k == "--merges-weight")
            a.w.merges_weight = argf(next());
        else if (k == "--empty-weight")
            a.w.empty_weight = argf(next());
        else if (k == "--corner-weight")
            a.w.corner_weight = argf(next());
        else if (k == "--verbose")
            a.verbose = true;
        else if (k == "--replay")
            a.replay = true;
        else if (k == "--parallel")
            a.parallel_games = true;
        else if (k == "--no-root-ordering")
            a.cfg.use_root_ordering = false;
        else if (k == "--help")
        {
            printf("Usage: engine2048 [options]\n"
                   "  --games N               number of games to simulate (default 10)\n"
                   "  --seed N                base RNG seed (default 1)\n"
                   "  --cprob F               cumulative-probability cutoff (default 0.0001)\n"
                   "  --cache-depth-limit N   max depth eligible for caching (default 15)\n"
                   "  --min-depth N           minimum search depth (default 3)\n"
                   "  --depth-bias N          depth_limit = distinct_tiles - depth_bias (default 2)\n"
                   "  --tt-bits N             transposition table size = 2^N entries (default 22)\n"
                   "  --no-cache              disable transposition table\n"
                   "  --max-depth N           hard ceiling on search depth (default 8; matches nneonneo's\n"
                   "                          proven design plus this cap for boards with many distinct tiles)\n"
                   "  --reset-cache-each-game clear cache between games (isolates per-game timing)\n"
                   "  --lost-penalty F, --mono-power F, --mono-weight F, --sum-power F,\n"
                   "  --sum-weight F, --merges-weight F, --empty-weight F, --corner-weight F  heuristic weights\n"
                   "  --verbose               print per-game results\n"
                   "  --replay                print board after every move (for debugging)\n"
                   "  --parallel              parallelize games across threads (requires OpenMP)\n"
                   "  --no-root-ordering      disable heuristic-based root move ordering\n");
            exit(0);
        }
    }
    return a;
}

int main(int argc, char **argv)
{
    Args a = parse_args(argc, argv);
    Engine engine(a.w, a.cfg);

    std::vector<GameResult> results;
    results.reserve(a.games);

    uint64_t sum_score = 0, sum_moves_evaled = 0, sum_cache_hits = 0;
    int sum_max_tile = 0;
    double sum_time = 0;
    int wins_2048 = 0;

    if (a.parallel_games) {
#ifdef _OPENMP
        #pragma omp parallel for schedule(dynamic, 4) reduction(+:sum_score,sum_moves_evaled,sum_cache_hits,sum_max_tile,sum_time,wins_2048)
        for (int g = 0; g < a.games; ++g)
        {
            // Each thread gets its own engine to avoid cache contention.
            Engine local_engine(a.w, a.cfg);
            GameResult r = play_one_game(local_engine, a.seed + g, a.reset_cache_each_game);
            results.push_back(r);
            sum_score += r.score;
            sum_max_tile += r.max_tile;
            sum_time += r.elapsed_sec;
            sum_moves_evaled += r.total_moves_evaled;
            sum_cache_hits += r.total_cache_hits;
            if (r.max_tile >= 2048)
                wins_2048++;

            if (a.verbose || a.replay) {
                #pragma omp critical
                {
                    printf("game %d: score=%llu max_tile=%d moves=%d time=%.2fs evaled=%llu hits=%llu\n",
                           g, (unsigned long long)r.score, r.max_tile, r.moves, r.elapsed_sec,
                           (unsigned long long)r.total_moves_evaled, (unsigned long long)r.total_cache_hits);
                    if (a.replay) {
                        // Replay requires re-running the game; print summary only for now.
                        printf("  [replay mode active but parallel — skipping per-move replay for game %d]\n", g);
                    }
                    fflush(stdout);
                }
            }
        }
#else
        fprintf(stderr, "ERROR: --parallel requires OpenMP support. Rebuild with -fopenmp.\n");
        return 1;
#endif
    } else {
        for (int g = 0; g < a.games; ++g)
        {
            GameResult r = play_one_game(engine, a.seed + g, a.reset_cache_each_game);
            results.push_back(r);
            sum_score += r.score;
            sum_max_tile += r.max_tile;
            sum_time += r.elapsed_sec;
            sum_moves_evaled += r.total_moves_evaled;
            sum_cache_hits += r.total_cache_hits;
            if (r.max_tile >= 2048)
                wins_2048++;

            if (a.verbose)
            {
                printf("game %d: score=%llu max_tile=%d moves=%d time=%.2fs evaled=%llu hits=%llu\n",
                       g, (unsigned long long)r.score, r.max_tile, r.moves, r.elapsed_sec,
                       (unsigned long long)r.total_moves_evaled, (unsigned long long)r.total_cache_hits);
                fflush(stdout);
            }
            if (a.replay)
            {
                // Replay: use a fresh engine (no TT pollution from benchmark)
                // and re-simulate this game printing each board state.
                Engine replay_engine(a.w, a.cfg);
                {
                    RNG rng(a.seed + g);
                    board_t board = initial_board(rng);
                    printf("\n--- Game %d replay ---\n", g);
                    print_board(board);
                    printf("(start: 2 tiles placed)\n");
                    int move_num = 0;
                    while (true) {
                        int m = replay_engine.best_move(board);
                        if (m < 0) break;
                        board_t nb = replay_engine.execute_move(m, board);
                        if (nb == board) break;
                        board_t tile = draw_tile(rng);
                        board = insert_tile_rand(nb, tile, rng);
                        ++move_num;
                        printf("move %3d: direction %d\n", move_num, m);
                        print_board(board);
                    }
                    printf("--- Game %d ended (moves=%d, score=%llu) ---\n\n",
                           g, move_num, (unsigned long long)r.score);
                }
            }
        }
    }

    printf("\n=== Summary over %d games ===\n", a.games);
    printf("avg_score=%.1f avg_max_tile=%.1f win_rate_2048=%.1f%%\n",
           double(sum_score) / a.games, double(sum_max_tile) / a.games,
           100.0 * wins_2048 / a.games);
    printf("total_time=%.2fs avg_time_per_game=%.3fs\n", sum_time, sum_time / a.games);
    printf("total_moves_evaled=%llu total_cache_hits=%llu cache_hit_rate=%.2f%%\n",
           (unsigned long long)sum_moves_evaled, (unsigned long long)sum_cache_hits,
           sum_moves_evaled ? 100.0 * sum_cache_hits / sum_moves_evaled : 0.0);
    printf("tt_capacity=%zu tt_stores=%llu\n",
           engine.transposition_table().capacity(),
           (unsigned long long)engine.transposition_table().stores_);

    return 0;
}
