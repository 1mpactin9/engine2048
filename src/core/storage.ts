import type { GameMode, GameState, Powerups } from "./types";
import { DEFAULT_MODE, DEFAULT_SIZE, gameKey } from "./constants";
import { peekNextId, setNextId } from "./grid";
import { DEFAULT_USAGE_MODE, type UsageMode } from "./usage";

export type ThemePref = "light" | "dark" | "system";

export interface Settings {
  theme: ThemePref;
  lastSize: number;
  lastMode: GameMode;
  autoOn: boolean;
  usageMode: UsageMode;
  autoDepth: number;
  autoPowerups: boolean;
  rngManip: boolean;
  deterministic: boolean;
}

export interface StoredData {
  version: number;
  settings: Settings;
  games: Record<string, GameState>;
  nextId: number;
}

const KEY = "2048:v2";
const VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  lastSize: DEFAULT_SIZE,
  lastMode: DEFAULT_MODE,
  autoOn: false,
  usageMode: DEFAULT_USAGE_MODE,
  autoDepth: 0,
  autoPowerups: true,
  rngManip: false,
  deterministic: false,
};

const EMPTY_POWERUPS: Powerups = {
  undo: 0,
  swap: 0,
  delete: 0,
  teleport: 0,
  rotate: 0,
  bomb: 0,
};

/**
 * Defensively fill in any fields missing from an older or malformed save so
 * a single bad game slot can't crash the app or wipe out the others.
 */
function normalizeGame(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<GameState>;
  if (!Array.isArray(g.grid) || typeof g.mode !== "string") return null;
  return {
    size: typeof g.size === "number" ? g.size : DEFAULT_SIZE,
    mode: g.mode as GameMode,
    grid: g.grid,
    score: typeof g.score === "number" ? g.score : 0,
    best: typeof g.best === "number" ? g.best : 0,
    powerups: { ...EMPTY_POWERUPS, ...(g.powerups ?? {}) },
    won: Boolean(g.won),
    wonAcknowledged: Boolean(g.wonAcknowledged),
    over: Boolean(g.over),
    history: Array.isArray(g.history) ? g.history : [],
    moveCount: typeof g.moveCount === "number" ? g.moveCount : 0,
    undoLocked: Boolean(g.undoLocked),
    rngSeed: g.rngSeed,
    rngCalls: g.rngCalls,
    usageMode: g.usageMode,
  };
}

function freshData(): StoredData {
  return {
    version: VERSION,
    settings: { ...DEFAULT_SETTINGS },
    games: {},
    nextId: 0,
  };
}

/**
 * Loads saved data, tolerating older schema versions and partially-corrupt
 * entries rather than discarding everything. Only truly unparsable JSON
 * falls back to a fresh slate.
 */
export function load(): StoredData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshData();
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    const games: Record<string, GameState> = {};
    for (const [key, value] of Object.entries(parsed.games ?? {})) {
      const normalized = normalizeGame(value);
      if (normalized) games[key] = normalized;
    }
    setNextId((parsed.nextId ?? 1) + 1);
    return { version: VERSION, settings, games, nextId: parsed.nextId ?? 1 };
  } catch {
    return freshData();
  }
}

export function save(data: StoredData): void {
  try {
    const payload: StoredData = {
      version: VERSION,
      settings: data.settings,
      games: data.games,
      nextId: peekNextId(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}

/** Invoke `onChange` whenever this save is updated from another tab/window. */
export function onExternalChange(onChange: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function getGame(
  data: StoredData,
  mode: GameMode,
): GameState | undefined {
  return data.games[gameKey(mode)];
}

export function putGame(data: StoredData, state: GameState): void {
  data.games[gameKey(state.mode)] = state;
}

export function clearGames(data: StoredData): void {
  data.games = {};
  setNextId(1);
}

export { setNextId };
