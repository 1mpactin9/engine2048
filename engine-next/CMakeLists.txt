cmake_minimum_required(VERSION 3.16)
project(engine2048 VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ---------------------------------------------------------------------------
# Release binary (O3, fast math)
# ---------------------------------------------------------------------------
add_executable(engine2048 src/main.cpp)

target_compile_options(engine2048 PRIVATE
    $<$<OR:$<CXX_COMPILER_ID:GNU>,$<CXX_COMPILER_ID:Clang>>: -O3 -ffast-math>
    $<$<CXX_COMPILER_ID:MSVC>: /O2 /fp:fast>
)

# OpenMP (optional — auto-detected)
find_package(OpenMP)
if(OpenMP_CXX_FOUND)
    target_link_libraries(engine2048 PRIVATE OpenMP::OpenMP_CXX)
    target_compile_definitions(engine2048 PRIVATE _OPENMP)
endif()

# ---------------------------------------------------------------------------
# Correctness tests
# ---------------------------------------------------------------------------
add_executable(test_correctness tests/test_correctness.cpp)

target_compile_options(test_correctness PRIVATE
    $<$<OR:$<CXX_COMPILER_ID:GNU>,$<CXX_COMPILER_ID:Clang>>: -O2>
    $<$<CXX_COMPILER_ID:MSVC>: /O2>
)

if(OpenMP_CXX_FOUND)
    target_link_libraries(test_correctness PRIVATE OpenMP::OpenMP_CXX)
endif()

add_test(NAME correctness COMMAND test_correctness)

# ---------------------------------------------------------------------------
# Install target
# ---------------------------------------------------------------------------
install(TARGETS engine2048 DESTINATION bin)
