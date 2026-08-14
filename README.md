<div align="center">
  <h1>2048 Engine</h1>

  <p>
    <a href="#prerequisites">Prerequisites</a> • 
    <a href="#build">Installation</a> • 
    <a href="#quick-access">Documentation</a>
  </p>

  <a href="LICENSE"><img src="https://img.shields.io/github/license/1mpactin9/engine2048" alt="License"></a>
  <a href="https://github.com/1mpactin9/engine2048/actions"><img src="https://img.shields.io/github/actions/workflow/status/1mpactin9/engine2048/ci.yml" alt="Actions"></a>
</div>

A 2048 game built with TypeScript, Vite, and a Rust/WASM game engine. Still in progress, but works!

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

## Build

```bash
npm install         # dependencies
npm run build       # run build
npm run dev         # start dev
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

## License

**Copyright (C) 2026 1mpactin9.**
This project is licensed under the GNU General Public License v3.0.

## Credits

This project interacts with the following external open-source tools:

- [game-difficulty/2048EndgameTablebase](https://github.com/game-difficulty/2048EndgameTablebase) - Licensed under GPL-3.0
- [nneonneo/2048-ai](https://github.com/nneonneo/2048-ai) - Licensed under MIT
- [ziap/2048-ai](https://github.com/ziap/2048-ai) - Licensed under MIT

&nbsp;

> _If you are a **rights holder** and believe that any content in this repository infringes upon your copyright, trademark, or intellectual property rights, please contact the repository maintainer directly._
