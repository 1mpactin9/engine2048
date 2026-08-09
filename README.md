<div align="center">
    <h1>2048 Engine</h1>

> [Prerequisites](#prerequisites) • [Installation](#quick-start) • [Development](#build)

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Actions](https://img.shields.io/github/actions/workflow/status/1mpactin9/engine2048/ci.yml?branch=main)](https://github.com/1mpactin9/engine2048/actions)

</div>

A clean, responsive 2048 game built with TypeScript, Vite, and a Rust/WASM game engine. Still in progress, but it works! Currently has a guarantee high success rate for 4x4 boards to get to **8192**!

NOTE that the engine will include features such as RNG Manipulation and Deterministic Algorithms, to explore best case scenarios, in such way the game is NOT random and NOT fair. It is not applicable to real games. meanwhile there are also support for COMPLETELY LEGIT GAMEPLAY.

## Prerequisites

| Tool | Why | Minimum version |
|------|-----|-----------------|
| [Node.js](https://nodejs.org) | package manager | 18+ |
| [Rust + Cargo](https://rustup.rs) | game engine | Latest stable |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/) | rust and webAssembly | latest |

Install Rust + Cargo first, then:

```bash
cargo install wasm-pack
```

## Quick start

```bash
npm install          # install dependencies
npm run dev          # start the dev server
```

## Build

Run this sequence to start from a completely clean state:

```bash
# remove generated artifacts
rm -rf node_modules/ dist/ engine/pkg/ engine/target/

# reinstall dependencies
npm install

# clean full build
npm run build
```

## Verification

```bash
# run test suite
npm test

# build and preview
npm run build
npm run preview
```

## Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | start dev server |
| `npm run build` | WASM + type-check + build |
| `npm run build:wasm` | compile the Rust engine to WASM only |
| `npm run preview` | preview the production `dist/` bundle locally |
| `npm test` | run Vitest test suite (node environment) |
| `npm run test:watch` | run Vitest in watch mode |

## Quick Access

| Document | Description |
|--------|-------------|
| [Benchmark Result](docs/benchmark.md) | some example benchmark results |
| [Developer Documentation](docs/dev.md) | throuogh project overview |

If you are a rights holder and believe that any content in this repository infringes upon your copyright, trademark, or intellectual property rights, please contact the repository maintainer directly. 
