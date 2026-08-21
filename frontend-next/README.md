# 2048 — frontend-rework

A from-scratch reimplementation of the game per [`spec.md`](../spec.md). PixiJS 8.11.0 renders the board/tiles on an `OffscreenCanvas` worker with a main-thread fallback; React + Tailwind v4 render all surrounding UI.

## Run it

```bash
cd frontend-rework
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck (tsc -b) + production bundle
pnpm preview    # serve the build
```

Node 24, pnpm. No Google Fonts CDN — Rubik is vendored in `public/fonts/` (variable woff2 + 14 static woff2 weights, feature-gated fallback per spec §2.2).

## Stack

- **Vite 8 + React 19 + TypeScript** (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`)
- **PixiJS 8.11.0** — board, tiles, springs, text, glow/bevel (spec §1.1)
- **Tailwind v4** (`@tailwindcss/vite`) — theme tokens in `src/index.css`, custom variants `short:`/`pwa:`, `xs: 360px` / `lg: 1100px` breakpoints (§11)
- **tiny-sdf** — runtime glyph atlas for tile numerals

## Structure

```
src/
  engine/         pure game logic (no DOM/Pixi)
    alea.ts       deterministic PRNG, importable/exportable state (§45)
    game.ts       GameEngine: state machine, moves, merges, spawns, powerups, undo (§23–38)
    powerups.ts   per-mode inventories, accrual thresholds, capacity cap (§29)
    types.ts      Tile/Board/GameState/events
    ids.ts        base36 UUIDs (§43)
  persistence/
    obfuscate.ts  XOR pipeline: JSON → TextEncoder → XOR → ASCII → btoa (§40)
    storage.ts    localStorage keys, validation/recovery, best score, midnight flag (§39/42/44)
  render/
    geometry.ts   576 board, stride 120, cell math, DPR clamp (§5, §1.2)
    textures.ts   Base64-SVG board/tiles/ring + SDF glyph atlas, rasterized to ImageBitmap (§6/7/8)
    springs.ts    stiffness/damping/mass solver with settle clamp (§19)
    BoardStage.ts the Pixi scene graph + animation manager (isomorphic: worker & main thread)
    worker.ts     render worker over OffscreenCanvas (§1.1)
    messageBroker.ts  call/response + emit/listen RPC, auto-transfers ImageBitmaps (§1.1)
    renderClient.ts   facade: worker-first, local fallback
  hooks/useGame.ts  the coordinator: engine ↔ renderer ↔ input ↔ persistence
  components/     Header, ScoreCards, PowerupBar, Modal, GamePage, StaticPage, TutorialPage, icons
  theme.ts        Midnight > Plus > Light resolution (§3.2) + theme-class helper
  router.ts       path-based SPA router, unknown → "/" (§1.4)
  App.tsx, main.tsx
```

## How the pieces fit

- **`GameEngine`** is a framework-agnostic class exposed to React via `useSyncExternalStore`. Every mutation emits; `getSnapshot` returns a deep copy. Moves/powerups return *events* (`slides`, `merges`, `spawn`, `removes`) that the renderer animates, so the authoritative state lives in the engine while the Pixi layer only mirrors it.
- **Renderer offload** (`renderClient.ts`): if `OffscreenCanvas` + `Worker` are available, `canvas.transferControlToOffscreen()` is handed to `worker.ts` along with the texture pack; the `MessageBroker` relays `init`/`setBoard`/`animateMove`/… calls and `cellHover` events back. On any init failure it falls back to `BoardStage` on the main thread. Renderer preference tries WebGPU then WebGL (§1.1).
- **Textures** are generated once per theme as inline SVGs (board gradients, per-value tile gradients + glow + arithmetic-composite bevel), rasterized at 3× on the main thread (workers can't decode SVG), then transferred as `ImageBitmap`s. Tile numerals use a 100px/4px-range SDF atlas tinted per value (§9).
- **Input** (`useGame.ts`): keyboard `Arrow/WASD/HJKL` with modifier + editable-element abort (§21), and swipe with >10px threshold and axis lock (§22). Input is locked during the 250ms animation window.
- **Persistence** re-saves on every engine emit; corrupt payloads are discarded into a fresh game (§42). State is isolated per mode: `gameState` / `classicGameState` / `plusGameState`.

## Deviations to be aware of

1. **SDF, not MSDF.** The spec (§1.3) asks for multi-channel signed-distance-field text. `tiny-sdf` produces a single-channel SDF, which is visually equivalent for solid-color numerals but is not literally MSDF. If the MSDF requirement is hard, this is the one place to swap in an `msdf-bmfont`-generated atlas (needs a `.ttf` + a build step).
2. **Static font fallbacks are `.woff2`, not `.ttf`.** The fonts you added are woff2; the spec names `.ttf` files. `@font-face` declarations point at the woff2 files you provided. Drop in `.ttf` files and update the paths if the spec's exact filenames matter.
3. **Plus-mode storage key** `plusGameState` / `bestScorePlus` is an inference — §1.4 names only `gameState` and `classicGameState`. Rename in `storage.ts` if a different convention is wanted.
4. **Board recenter spring (§5.5)** is implemented as flexbox centering rather than an explicit spring on the container offset — the visual result (centered board with powerup bar present/absent) is the same, but the animated settle isn't spring-driven yet.
5. **Rotate arrows (§37)** use a simple drawn curved-arrow SVG (no path was supplied for the 256×262 asset) at the specified offsets with the float animation.

## What's verified vs. not

- ✅ `tsc -b` clean, `pnpm build` succeeds (worker chunk emitted, ~448 KB main / 136 KB gzip).
- ⚠️ Not yet run in a browser — rendering (especially WebGPU→WebGL fallback and the worker path) and the interaction flows still need a manual pass. That's the testing you're doing now.
