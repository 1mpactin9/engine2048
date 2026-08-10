$ErrorActionPreference = 'Stop'

Set-Location "$PSScriptRoot\.."

g++ -O3 -std=c++17 -I include src/main.cpp -o engine2048
Write-Host "Built ./engine2048"

g++ -O2 -std=c++17 -I include tests/test_correctness.cpp -o tests/test_correctness
Write-Host "Built ./tests/test_correctness"

.\tests\test_correctness
