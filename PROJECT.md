# PROJECT.md

Durable working notes for `engine2048`. Updated by agents; survives context resets.

## Current status

- The **frontend board** is built and playable (classic 2048): Preact + Pixi.js, spring slide, spawn/merge pops, seeded RNG, full tile color ramp through 131072.
- Backend is untouched (still empty scaffolding).
- The full UI layout (header, scoreboard, powerup bar, modals) is **not** built yet — only the board. See "Layout spec (later)" below.

## Sitemap (routes)

Frontend uses `wouter` (no base path; literal paths):

- `/engine2048` → Classic (ClassicPage)
- `/engine2048/standard` → Standard (StandardPage)
- `/engine2048/plus` → Plus (PlusPage)
- `/` and unknown paths → `<Redirect to="/engine2048" />`

All three pages render the same `<GameBoard />` for now. They will diverge when powerups/dark theme land. Docs pages are future; not routed yet.

## Files

### `frontend/src/game/` — client-side engine (no rendering)
- `types.ts` — `Direction`, `GameStatus` (const object: fresh/playing/gameWon/gameOver/selecting, mirrors source `wi` enum), `Position`, `SIZE = 4`.
- `tile.ts` — `Tile` class: unique `id`, `value`, `x/y`, `previousX/previousY`, `mergedFrom`, `isNew`, `isMerged`, `removed`.
- `rng.ts` — `Rng` wrapping `seedrandom.alea` (Alea algorithm) with `state()`/`restore()` for future undo.
- `engine.ts` — `Game2048`: grid (`cells[x][y]`, x=column y=row), `move(direction)`, `slideAndMerge` logic (legacy `game_manager.js` algorithm), `movesAvailable`, `serialize()`, `ghosts[]` (merged sources for the renderer), `boardTiles()`. Status machine: Fresh → Playing → GameWon/GameOver. Spawn: 90% 2 / 10% 4 via seeded RNG.

### `frontend/src/canvas/` — Pixi.js rendering (reads state only)
- `physics/spring.ts` — `Spring` class. Replicates play2048's solver exactly: `velocity = (cur - prev)/dt`, `next = cur + (velocity + (stiffness*(target-cur) - damping*velocity)) * dt`. Slide config `SLIDE_SPRING = { stiffness: 0.15, damping: 0.8, precision: 0.01, maxDurationMs: 250 }` (hard snap at 250ms). `dt` = Pixi `ticker.deltaTime` (frames).
- `physics/easing.ts` — `easeOutBack` (spawn pop 0→1 with overshoot), `mergePulse` (`1 + 0.15*sin(πt)`, merge pop 1→1.15→1), `clamp01`.
- `theme/palette.ts` — all dimensions (board 492, margin 28 → stage 548, cell 108/r10, tile 112/r12, board r22, step 120; cell = `12 + x*120`, tile = `10 + x*120`) + full tile color ramp (fill/glow/opacity/blur/font) for 2..131072 + overflow, light+dark board palettes.
- `theme/gradient.ts` — cached `verticalGradient(top,bottom)` using Pixi v8 `FillGradient` (options object, `textureSpace: 'local'`).
- `renderers/tile-sprite.ts` — `TileSprite` (Container): drop shadow (offset +4, alpha .1), glow halo (3 stacked rounded rects, gradient, per-tile opacity/blur), block (flat or gradient + 2px white top highlight bevel), Rubik `Text`. Spring x/y + pop modes. Ghost fades after slide settles.
- `renderers/board-renderer.ts` — `BoardRenderer`: Pixi `Application` (548×548, autoDensity, DPR≤2), board bg (gradient + 2 faked drop shadows), 16 recessed empty cells (darker −2px + lighter +1px), `reconcile(tiles, ghosts)` reconciling sprites by id, ticker advancing springs/removing ghosts. `ensureFontLoaded()` awaits `document.fonts.load('700 48px Rubik')`.

### `frontend/src/`
- `components/GameBoard.tsx` — Preact component: creates engine + renderer in `useEffect`, keyboard (arrows + WASD) and pointer swipe input, calls `engine.move` → `renderer.reconcile(engine.boardTiles(), engine.ghosts)`.
- `pages/ClassicPage.tsx`, `StandardPage.tsx`, `PlusPage.tsx` — wrappers around `<GameBoard />`.
- `router/router.tsx` — wouter `Switch`/`Route`/`Redirect`.
- `app.tsx` → `<AppRouter />`; `index.css` — Rubik `@font-face` + full-viewport centered `.board-host` (`width: min(450px, 100vw-32px, 100vh-32px)`, `aspect-ratio: 1`). `app.css` (old Vite demo) deleted.

## Key decisions / gotchas

- **Spring** uses the exact play2048 finite-difference formula (not the classic accumulated-velocity spring). Eigenvalues 0.8/0.25 → overdamped; ~95% of the distance covered by 250ms, then snap.
- **RNG** is `seedrandom` **Alea** (explicit), not the ARC4 default. `Rng.state()`/`restore()` is the undo foundation.
- **Tiles never change value in place** — a merged tile is a new `Tile` (new id), sources become `ghosts` that slide then dissolve. Renderer keys sprites by id.
- **`FillGradient`** in Pixi v8.19 uses the options object (`start/end/colorStops/textureSpace`); the positional constructor is deprecated. Gradients are cached to avoid texture leaks.
- **Pixi `Container` already has a `label: string` property** — the tile Text field must not be named `label` (renamed to `textLabel`).

## Dependencies

- Added `seedrandom@3.0.5` (+ `@types/seedrandom@3.0.8`, MIT) to `frontend`. Explicitly requested by owner; needed for undo later. `popmotion`, `zustand`, `wouter`, `tailwindcss` already present (popmotion unused — hand-rolled spring; Tailwind not yet wired into `vite.config.ts`).

## Pending / owner flags

- **NOTICE.md** should gain a seedrandom entry (MIT) — NOTICE.md is approval-gated; do not edit without owner sign-off. README credits updated instead.
- **Undo** (later): needs full state snapshot incl. `Rng.state()`; `engine.serialize()` already captures board/score/status/rngState. Powerup accrual (128→Undo, 256→Swap/Teleport, 512→Bomb/Remove) and `Selecting` state pending.
- **Dark theme** (Plus): palette constants ready (`DARK_BOARD_GRADIENT`, `DARK_EMPTY_CELL`); renderer takes `dark` option (default false). No toggle UI yet.
- **Tailwind** not wired (`@tailwindcss/vite` plugin absent from `vite.config.ts`; no `@import 'tailwindcss'`). Wire it when building the full layout below.
- **Build note**: `tsc -b` passes; `vite build` needs `danger-full-access` in this environment (rolldown spawns a child process with piped stdio, blocked by the sandbox). Outside the sandbox it builds normally.

## Layout spec (later — section 10, not built)

Recreate this when the full UI is built (Tailwind or flex equivalents):

- `<body class="game-layout">` (min-h-screen, flex-col, overflow-hidden on mobile) → `<div class="mx-auto flex max-w-screen-2xl min-w-0 grow basis-0 flex-col items-stretch gap-y-4 sm:gap-y-6">`.
- **Header** (CSS grid `[left] 1fr [center] min-content [right] 1fr`): hamburger (dropdown, z-40, links: Standard/Classic/Tutorial/Privacy), "2048" `text-5xl font-bold` (+ "Classic" `#BAAC9A` pill in classic), restart button (circular icon; desktop adds "New Game").
- **Score board**: flex column centered; score `text-4xl md:text-5xl font-semibold` + "points scored in X moves"; high-score pill (classic) or "No powerups used!"/"X powerups used:" (standard).
- **Board**: `flex min-h-0 min-w-0 grow basis-0 flex-col items-center justify-center px-8`; canvas `aspect-square`, capped `max-width ~450px` (or `100vw - padding` mobile).
- **Powerup bar** (standard/plus only): `relative flex max-w-[calc(100vw-20px)] gap-2 rounded-xl p-2 sm:gap-3 bg-sand` (dark: `bg-dark-grey`); square buttons, `opacity-50` when 0 uses, usesRemaining pill bottom-right, cooldown segmented bar top.
- **Modals** (z-50): backdrop `fixed inset-0 bg-near-black/70`; box `bg-sand relative flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl shadow-xl`; primary `from-button-gradient-start to-button-gradient-end`, secondary `border-tan border-2 text-brown`.
- Game state names: Fresh / Playing / GameWon / GameOver / Selecting (mirrors source `wi`).
