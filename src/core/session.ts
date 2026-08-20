import type {
  Direction,
  GameMode,
  GameState,
  GameSnapshot,
  Grid,
  MoveTranscript,
  Powerups,
} from "./types";
import {
  DEFAULT_MODE,
  MAX_HISTORY,
  PLUS_CAP,
  PLUS_START,
  PLUS_UNLOCKS,
  STANDARD_CAP,
  STANDARD_START,
  STANDARD_UNLOCKS,
  WIN_VALUE,
} from "./constants";
import {
  cloneGrid,
  createGrid,
  emptyCells,
  hasMoves,
  hasTile,
  maxTile,
  setNextId,
  spawnTile,
} from "./grid";
import { move } from "./move";
import { SecureRng, createRngSeed } from "./rng";
import { DEFAULT_USAGE_MODE, type UsageMode } from "./usage";

function emptyPowerups(): Powerups {
  return { undo: 0, swap: 0, delete: 0, teleport: 0, rotate: 0, bomb: 0 };
}

function startingPowerups(mode: GameMode): Powerups {
  if (mode === "standard") return { ...STANDARD_START };
  if (mode === "plus") return { ...PLUS_START };
  return emptyPowerups();
}

function capsFor(mode: GameMode): Partial<Powerups> {
  if (mode === "standard") return STANDARD_CAP;
  if (mode === "plus") return PLUS_CAP;
  return {};
}

function unlocksFor(mode: GameMode): [number, keyof Powerups][] {
  if (mode === "standard") return STANDARD_UNLOCKS;
  if (mode === "plus") return PLUS_UNLOCKS;
  return [];
}

export class GameSession {
  state: GameState;
  private rng: () => number;
  private manipulate = false;
  private usageMode: UsageMode = DEFAULT_USAGE_MODE;
  /** Highest tile value already credited for a powerup unlock this game. */
  private unlockedUpTo = 0;

  constructor(state: GameState, rng?: () => number) {
    this.state = state;
    if (rng) {
      this.rng = rng;
    } else {
      if (!state.rngSeed || state.rngSeed.length !== 8)
        state.rngSeed = createRngSeed();
      if (typeof state.rngCalls !== "number") state.rngCalls = 0;
      const gen = new SecureRng(state.rngSeed, state.rngCalls);
      this.rng = () => {
        const v = gen.next();
        this.state.rngCalls = gen.calls;
        return v;
      };
    }
    this.unlockedUpTo = maxTile(state.grid);
    // A save from an older schema (or one whose powerups were lost to a
    // migration / corruption) may have `maxTile` >= a milestone but
    // `powerups[kind] === 0` for that milestone. Reconcile by granting
    // any missing unlocks once at load time.
    this.reconcileUnlocks();
  }

  /** Grant any milestones implied by the current `maxTile` that the
   * saved `powerups` state is missing. Idempotent; only ever increases
   * counts and only up to the per-mode cap. */
  private reconcileUnlocks(): void {
    const cap = capsFor(this.state.mode);
    const unlocks = unlocksFor(this.state.mode);
    if (unlocks.length === 0) return;
    const top = maxTile(this.state.grid);
    for (const [threshold, kind] of unlocks) {
      if (threshold <= top && this.state.powerups[kind] === 0) {
        const limit = cap[kind] ?? Infinity;
        if (limit > 0) {
          this.state.powerups[kind] = Math.min(
            limit,
            this.state.powerups[kind] + 1,
          );
        }
      }
    }
  }

  setRngManipulation(on: boolean): void {
    this.manipulate = on;
  }

  setUsageMode(mode: UsageMode): void {
    this.usageMode = mode;
  }

  getUsageMode(): UsageMode {
    return this.usageMode;
  }

  static newGame(
    size: number,
    mode: GameMode = DEFAULT_MODE,
    best = 0,
    rng?: () => number,
    manipulate = false,
  ): GameSession {
    const grid = createGrid(size);
    setNextId(1);
    const state: GameState = {
      size,
      mode,
      grid,
      score: 0,
      best,
      powerups: startingPowerups(mode),
      won: false,
      wonAcknowledged: false,
      over: false,
      history: [],
      moveCount: 0,
      undoLocked: false,
      rngSeed: rng ? undefined : createRngSeed(),
      rngCalls: 0,
    };
    const session = new GameSession(state, rng);
    session.manipulate = manipulate;
    spawnTile(grid, {
      rng: session.rng,
      manipulate: session.manipulate,
      usageMode: session.usageMode,
    });
    spawnTile(grid, {
      rng: session.rng,
      manipulate: session.manipulate,
      usageMode: session.usageMode,
    });
    return session;
  }

  private snapshot(): GameSnapshot {
    return {
      grid: cloneGrid(this.state.grid),
      score: this.state.score,
      powerups: { ...this.state.powerups },
      won: this.state.won,
      wonAcknowledged: this.state.wonAcknowledged,
      over: this.state.over,
      moveCount: this.state.moveCount,
    };
  }

  private pushHistory(): void {
    this.state.history.push(this.snapshot());
    if (this.state.history.length > MAX_HISTORY) this.state.history.shift();
  }

  private recomputeOver(): void {
    this.state.over = !hasMoves(this.state.grid);
  }

  /** Grant milestone powerup unlocks for any tile values newly reached. */
  private applyUnlocks(): void {
    const cap = capsFor(this.state.mode);
    const unlocks = unlocksFor(this.state.mode);
    if (unlocks.length === 0) return;
    const top = maxTile(this.state.grid);
    if (top < this.unlockedUpTo) {
      // The board shrank (e.g. via undo) — don't lose the high-water mark
      // so we don't re-grant already-granted milestones. The undo path
      // restores `unlockedUpTo` from the snapshot so the strict-`>`
      // check below stays correct.
      return;
    }
    if (top === this.unlockedUpTo) return;
    for (const [threshold, kind] of unlocks) {
      if (threshold > this.unlockedUpTo && threshold <= top) {
        const limit = cap[kind] ?? Infinity;
        this.state.powerups[kind] = Math.min(
          limit,
          this.state.powerups[kind] + 1,
        );
      }
    }
    this.unlockedUpTo = top;
  }

  applyMove(dir: Direction): MoveTranscript | null {
    if (this.state.over) return null;
    const { grid: next, transcript } = move(this.state.grid, dir);
    if (!transcript.moved) {
      this.recomputeOver();
      return null;
    }

    this.pushHistory();
    this.state.grid = next;
    this.state.score += transcript.gained;
    this.state.best = Math.max(this.state.best, this.state.score);
    transcript.spawned =
      spawnTile(next, {
        rng: this.rng,
        manipulate: this.manipulate,
        usageMode: this.usageMode,
      }) ?? undefined;
    this.state.moveCount++;
    // Moving resets the undo lock: undo can't be chained twice in a row.
    this.state.undoLocked = false;
    if (!this.state.won && hasTile(next, WIN_VALUE)) this.state.won = true;
    this.applyUnlocks();
    this.recomputeOver();
    return transcript;
  }

  undo(): boolean {
    if (this.state.mode === "classic") return false;
    if (this.state.undoLocked) return false;
    if (this.state.powerups.undo <= 0) return false;
    if (this.state.history.length === 0) return false;

    const snap = this.state.history.pop()!;
    // Restore the snapshot's grid, score, etc., but keep the *current*
    // undo count and decrement by 1. Using the snapshot's undo count and
    // subtracting 1 would double-debit when the undone move itself
    // granted an undo charge (e.g. reaching 128). The consumed charge is
    // the undo action itself, not whatever changed during the move.
    this.state.grid = snap.grid;
    this.state.score = snap.score;
    this.state.won = snap.won;
    this.state.wonAcknowledged = snap.wonAcknowledged;
    this.state.moveCount = snap.moveCount;
    this.state.powerups = { ...snap.powerups, undo: this.state.powerups.undo - 1 };
    this.state.undoLocked = true;
    this.unlockedUpTo = maxTile(this.state.grid);
    this.recomputeOver();
    return true;
  }

  swap(r1: number, c1: number, r2: number, c2: number): boolean {
    if (this.state.mode === "classic") return false;
    if (this.state.powerups.swap <= 0) return false;
    if (r1 === r2 && c1 === c2) return false;
    const a = this.state.grid[r1]?.[c1];
    const b = this.state.grid[r2]?.[c2];
    if (!a || !b) return false;

    this.pushHistory();
    this.state.grid[r1][c1] = b;
    this.state.grid[r2][c2] = a;
    this.state.powerups = {
      ...this.state.powerups,
      swap: this.state.powerups.swap - 1,
    };
    this.recomputeOver();
    return true;
  }

  deleteTile(row: number, col: number): boolean {
    if (this.state.mode === "classic") return false;
    if (this.state.powerups.delete <= 0) return false;
    if (!this.state.grid[row]?.[col]) return false;

    this.pushHistory();
    this.state.grid[row][col] = null;
    this.state.powerups = {
      ...this.state.powerups,
      delete: this.state.powerups.delete - 1,
    };
    this.recomputeOver();
    return true;
  }

  /** Move a tile into an empty cell. Only available in Plus mode. */
  teleport(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
    if (this.state.mode !== "plus") return false;
    if (this.state.powerups.teleport <= 0) return false;
    if (fromRow === toRow && fromCol === toCol) return false;
    const tile = this.state.grid[fromRow]?.[fromCol];
    if (!tile) return false;
    if (this.state.grid[toRow]?.[toCol]) return false;

    this.pushHistory();
    this.state.grid[fromRow][fromCol] = null;
    this.state.grid[toRow][toCol] = tile;
    this.state.powerups = {
      ...this.state.powerups,
      teleport: this.state.powerups.teleport - 1,
    };
    this.recomputeOver();
    return true;
  }

  /** Rotate the outer ring of tiles one step left or right. Plus mode only. */
  rotateRing(direction: "left" | "right"): boolean {
    if (this.state.mode !== "plus") return false;
    if (this.state.powerups.rotate <= 0) return false;
    if (this.state.moveCount === 0) return false;
    const n = this.state.size;
    if (n < 2) return false;

    const ring: { row: number; col: number }[] = [];
    for (let c = 0; c < n; c++) ring.push({ row: 0, col: c });
    for (let r = 1; r < n; r++) ring.push({ row: r, col: n - 1 });
    for (let c = n - 2; c >= 0; c--) ring.push({ row: n - 1, col: c });
    for (let r = n - 2; r >= 1; r--) ring.push({ row: r, col: 0 });
    if (ring.length < 2) return false;

    this.pushHistory();
    const grid = this.state.grid;
    const values = ring.map((p) => grid[p.row][p.col]);
    const shift = direction === "right" ? 1 : -1;
    const shifted = ring.map(
      (_, i) => values[(i - shift + values.length) % values.length],
    );
    ring.forEach((p, i) => {
      grid[p.row][p.col] = shifted[i];
    });
    this.state.powerups = {
      ...this.state.powerups,
      rotate: this.state.powerups.rotate - 1,
    };
    this.recomputeOver();
    return true;
  }

  /** Clear a 3x3 area centered on (row, col), clipped to the board edges. */
  bomb(row: number, col: number): boolean {
    if (this.state.mode !== "plus") return false;
    if (this.state.powerups.bomb <= 0) return false;
    const n = this.state.size;

    this.pushHistory();
    const grid = this.state.grid;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < n && c >= 0 && c < n) grid[r][c] = null;
      }
    }
    this.state.powerups = {
      ...this.state.powerups,
      bomb: this.state.powerups.bomb - 1,
    };
    this.recomputeOver();
    return true;
  }

  /**
   * Remove every tile matching `value`. Costs 1 use per tile cleared:
   * a single matching tile drains 1 use, two matching tiles drain both.
   * Requires enough charges to clear every match, or does nothing.
   */
  deleteByValue(value: number): number {
    if (this.state.mode === "classic") return 0;
    const grid = this.state.grid;
    const targets: { row: number; col: number }[] = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c]?.value === value) targets.push({ row: r, col: c });
      }
    }
    if (targets.length === 0) return 0;
    if (targets.length > this.state.powerups.delete) return 0;

    this.pushHistory();
    for (const { row, col } of targets) grid[row][col] = null;
    this.state.powerups = {
      ...this.state.powerups,
      delete: this.state.powerups.delete - targets.length,
    };
    this.recomputeOver();
    return targets.length;
  }

  acknowledgeWin(): void {
    this.state.wonAcknowledged = true;
  }

  get canUndo(): boolean {
    return (
      this.state.mode !== "classic" &&
      !this.state.undoLocked &&
      this.state.powerups.undo > 0 &&
      this.state.history.length > 0
    );
  }

  get canSwap(): boolean {
    return this.state.mode !== "classic" && this.state.powerups.swap > 0;
  }

  get canDelete(): boolean {
    return this.state.mode !== "classic" && this.state.powerups.delete > 0;
  }

  get canTeleport(): boolean {
    return (
      this.state.mode === "plus" &&
      this.state.powerups.teleport > 0 &&
      emptyCells(this.state.grid).length > 0
    );
  }

  get canRotate(): boolean {
    return (
      this.state.mode === "plus" &&
      this.state.powerups.rotate > 0 &&
      this.state.moveCount > 0
    );
  }

  get canBomb(): boolean {
    return this.state.mode === "plus" && this.state.powerups.bomb > 0;
  }

  toContext() {
    return {
      grid: this.state.grid,
      size: this.state.size,
      score: this.state.score,
      powerups: this.state.powerups,
      manipulate: this.manipulate,
      usageMode: this.usageMode,
      rngSeed: this.state.rngSeed,
      rngCalls: this.state.rngCalls,
    };
  }
}

export function restoreSession(
  state: GameState,
  rng?: () => number,
): GameSession {
  let maxId = 0;
  for (const row of state.grid) {
    for (const c of row) if (c && c.id > maxId) maxId = c.id;
  }
  for (const snap of state.history) {
    for (const row of snap.grid) {
      for (const c of row) if (c && c.id > maxId) maxId = c.id;
    }
  }
  setNextId(maxId + 1);
  return new GameSession(state, rng);
}

export type { Grid };
