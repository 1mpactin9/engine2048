#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CXXFLAGS="-O3 -std=c++17 -I include"
TEST_CXXFLAGS="-O2 -std=c++17 -I include"

# OpenMP support (optional)
if g++ $CXXFLAGS -fopenmp -x c++ -E - > /dev/null 2>&1; then
    CXXFLAGS="$CXXFLAGS -fopenmp"
    TEST_CXXFLAGS="$TEST_CXXFLAGS -fopenmp"
    echo "  [OpenMP enabled]"
else
    echo "  [OpenMP not available, --parallel disabled]"
fi

g++ $CXXFLAGS src/main.cpp -o engine2048
echo "Built ./engine2048"

g++ $TEST_CXXFLAGS tests/test_correctness.cpp -o tests/test_correctness
echo "Built ./tests/test_correctness"

./tests/test_correctness
