# AGENT.md

Operating agreement for `engine2048`. Defines folder scope, code standards, and change protocols. Read before any task. If a task would violate scope or protocol, stop and ask the owner — don't work around it.

---

## 1. Folder Scope

### Top level
- `/` — workspace metadata, docs, licenses, this file. No application code.
- `backend/` — Server-side engine, game domain, HTTP/WS transport. No UI/frontend assets.
- `frontend/` — Browser UI, rendering, client state, routing. No server logic or engine strategy.
- `reference/` — read-only vendored third-party code (gitignored). Consult only — no project code, nothing modified or built.

### Root files
- `AGENT.md` — this file. Keep in sync with any layout/protocol change.
- `README.md` — public-facing description, build/verification instructions.
- `LICENSE` — GPL-3.0. Never change without owner's explicit approval.
- `NOTICE.md` — third-party notices. Never change without owner's explicit approval.
- `package.json` / `pnpm-lock.yaml` — root workspace metadata. Package manager: pnpm.

### `backend/` (Node.js + TypeScript strict, Express 5, `ws`)
- `src/engine/` — the AI: search/decision (expectimax, MCTS), heuristics, simulation, rollouts. Pure and deterministic; no I/O; only reads `game` state.
- `src/game/` — the game itself: board, moves, state, rules. Source of truth for game logic; no AI/strategy.
- `src/server/` — thin transport (routes, sockets, middleware) calling into `game`/`engine`.
- Dependency direction: `server → engine/game → (nothing external)`.

### `frontend/` (Preact + Vite + Tailwind + Pixi.js, zustand, wouter)
- `src/api/` — backend communication, no UI logic.
- `src/game/` — client-side game engine: board, moves, merging, scoring, seeded RNG. No rendering.
- `src/canvas/` — Pixi.js rendering, reads state only.
- `src/components/` / `src/pages/` — presentational components and route views.
- `src/stores/` — zustand state, no rendering.
- `src/assets/` vs `public/` — `assets/` for code-imported files, `public/` for as-is static files (never imported in code).

### `reference/` (vendored third-party code, read-only, gitignored, excluded from builds)

### Rules:
- Never modify, build, or commit anything under `reference/` — read/study only.
- If code from a reference is adapted into `backend/` or `frontend/`: preserve the source's license requirements, update `NOTICE.md` and README credits.
- GPL-3.0 sources must never be adapted into non-GPL components — consult-only is the safe default.

---

## 2. Standards — Code Writing

### Code Comments

#### Principles
* **Sparse:** Comment only when code cannot self-explain.
* **Lowercase:** Start text with lowercase letters.
* **No Punctuation:** Omit periods at sentence ends.

#### Formatting
* **Single Line:** Use `//` with one space.
* **Alignment:** Match the indent of the code block.
* **Spacing:** Leave one blank line before comments.

#### Examples
```javascript
// calculate total price
const total = price + tax;
```

### Commit Messages

#### Principles
* **Output Only:** Provide the text message. Never run git commands (non-actions are allowed).
* **Code Changes:** Describe the literal modifications to files.
* **No Intent:** Omit developer goals, reasons, or user stories.

#### Formatting
* **Prefix:** Use lowercased conventional types (e.g., `feat:`, `fix:`).
* **Imperative:** Use present tense for the structural action.
* **Length:** Keep the header under 50 characters.

#### Examples
```text
feat: add user authentication middleware
fix: resolve null pointer in database connector
```

---

## 3. Protocols

### 3.1 Change protocol
- Read the target file(s) and this document before modifying anything.
- Keep each change inside one folder's scope; if a change crosses scopes, split into separate commits.
- If a folder's purpose changes, update the Folder Scope section in the same change.
- Don't "improve" scaffolding outside task scope (e.g. don't rewrite `frontend/src/app.tsx` while adding a backend route).

### 3.2 Git protocol
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`, `build:`.
- One focused commit per logical change; keep `main` stable and working.
- Never commit secrets, keys, or local credentials.

### 3.3 Verification protocol
- Backend: `tsc --noEmit` in `backend/` + any tests; confirm server still starts.
- Frontend: `pnpm run build` (`tsc -b && vite build`) in `frontend/` must pass.
- Do not attempt to start or smoke-test a dev server (e.g. `pnpm run dev`, curling local ports). Let the user test.
- Don't commit changes that break a listed `package.json` script.

### 3.4 Dependency protocol
- Use pnpm for all dependency management; commit lockfile changes.
- Add a dependency only when necessary; prefer the smallest change that satisfies the requirement. (user prompt may overwrite this)
- New dependencies must be license-compatible with GPL-3.0; record in `NOTICE.md` and README credits.

### 3.5 Documentation protocol
- `AGENT.md` is the source of truth for scope/process; keep section numbers stable.
- `README.md` is public-facing; keep it consistent with actual build/verification commands.
