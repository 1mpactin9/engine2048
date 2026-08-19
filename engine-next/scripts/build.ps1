$ErrorActionPreference = 'Stop'
Set-Location "$PSScriptRoot\.."

$CXXFLAGS = @('-O3', '-std=c++17', '-I', 'include')
$TEST_CXXFLAGS = @('-O2', '-std=c++17', '-I', 'include')

# Try OpenMP
try {
    $null = g++ $CXXFLAGS -fopenmp -x c++ -E - < $null 2>$null
    $CXXFLAGS += '-fopenmp'
    $TEST_CXXFLAGS += '-fopenmp'
    Write-Host "  [OpenMP enabled]"
} catch {
    Write-Host "  [OpenMP not available, --parallel disabled]"
}

g++ $CXXFLAGS src/main.cpp -o engine2048
Write-Host "Built ./engine2048"

g++ $TEST_CXXFLAGS tests/test_correctness.cpp -o tests/test_correctness
Write-Host "Built ./tests/test_correctness"

.\tests\test_correctness
