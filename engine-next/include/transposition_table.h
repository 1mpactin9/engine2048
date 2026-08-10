#pragma once
#include "board.h"
#include <vector>
#include <cstdint>
#include <cmath>

namespace eng {

// Fixed-size direct-mapped cache keyed by board hash.
// Avoids unbounded memory growth of a std::unordered_map while still giving
// large speedups on repeated subtrees (transpositions across move branches,
// and across successive top-level searches within the same game).
class TranspositionTable {
public:
    struct Entry {
        board_t key = 0;
        float   heuristic = 0.0f;
        int8_t  cprob_bucket = -128; // coarse bucket of remaining "room" before cprob_thresh cutoff
        uint8_t depth = 0;
        bool    used = false;
    };

    explicit TranspositionTable(size_t size_pow2_entries = (1u << 22)) {
        size_ = size_pow2_entries;
        mask_ = size_ - 1;
        table_.resize(size_);
    }

    inline void clear() {
        std::fill(table_.begin(), table_.end(), Entry{});
        hits_ = 0;
        stores_ = 0;
    }

    inline bool lookup(board_t key, int max_depth, int cprob_bucket, float& out_heuristic) const {
        const Entry& e = table_[index(key)];
        // Reusable only if the stored value was computed with at least as
        // much "room" before the cprob_thresh cutoff as the current call
        // has (coarse bucket comparison — see cprob_to_bucket below). A
        // smaller bucket at storage time means that computation was closer
        // to bailing out to the cheap heuristic fallback, i.e. it may have
        // done less real recursive work than the current call would do.
        // Without this check, a value computed via an early cprob-driven
        // bailout (cheap, less accurate) could get reused by a call that
        // would otherwise have recursed further (expensive, more accurate),
        // silently downgrading the result. This was measured directly to
        // shift scores and occasionally flip move selection. Bucketed
        // (rather than exact float comparison) because cprob varies
        // continuously along nearly every path, so an exact match almost
        // never happens and the cache hit rate collapses to ~0 otherwise.
        if (e.used && e.key == key && e.depth <= max_depth && e.cprob_bucket >= cprob_bucket) {
            out_heuristic = e.heuristic;
            return true;
        }
        return false;
    }

    inline void store(board_t key, uint8_t depth, int cprob_bucket, float heuristic) {
        Entry& e = table_[index(key)];
        // Replacement policy: prefer entries with a shallower recorded depth
        // (deeper search = more expensive/valuable = keep); among equal
        // depth, prefer the one computed with a larger cprob bucket (more
        // complete computation), else overwrite.
        if (!e.used || e.depth > depth ||
            (e.depth == depth && e.cprob_bucket < cprob_bucket) || e.key == key) {
            e.key = key;
            e.depth = depth;
            e.cprob_bucket = int8_t(cprob_bucket);
            e.heuristic = heuristic;
            e.used = true;
        }
        stores_++;
    }

    // Maps a continuous cprob value to a small integer bucket representing
    // roughly how many more halvings of probability remain before
    // cprob_thresh (0.0001) is hit. log2(cprob / thresh), clamped and
    // floored, so nearby cprob values collapse to the same bucket (keeping
    // the cache hit rate high) while meaningfully different remaining
    // "search budget" still gets separated (preserving correctness).
    static inline int cprob_to_bucket(float cprob, float cprob_thresh) {
        if (cprob <= cprob_thresh) return 0;
        float ratio = cprob / cprob_thresh;
        int bucket = int(std::log2(double(ratio)));
        if (bucket < 0) bucket = 0;
        if (bucket > 40) bucket = 40;
        return bucket;
    }

    size_t capacity() const { return size_; }
    mutable uint64_t hits_ = 0;
    uint64_t stores_ = 0;

    inline void note_hit() const { hits_++; }

private:
    inline size_t index(board_t key) const {
        // 64-bit mix (splitmix64 finalizer) for good distribution across the table.
        uint64_t h = key;
        h ^= h >> 30; h *= 0xbf58476d1ce4e5b9ULL;
        h ^= h >> 27; h *= 0x94d049bb133111ebULL;
        h ^= h >> 31;
        return h & mask_;
    }

    size_t size_;
    size_t mask_;
    std::vector<Entry> table_;
};

} // namespace eng
