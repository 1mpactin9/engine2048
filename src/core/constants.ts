import type { Powerups } from "./types";

export const SIZES = [3, 4, 5, 6, 8] as const;
export type Size = (typeof SIZES)[number];
export const DEFAULT_SIZE: Size = 4;

export const DEFAULT_MODE = "standard" as const;

export const WIN_VALUE = 2048;

export const SPAWN_PROB_4 = 0.1;

/** Starting powerup counts per mode. Classic gets none. */
export const STANDARD_START: Powerups = {
  undo: 2,
  swap: 1,
  delete: 0,
  teleport: 0,
  rotate: 0,
  bomb: 0,
};

export const PLUS_START: Powerups = {
  undo: 2,
  swap: 1,
  teleport: 1,
  rotate: 1,
  delete: 0,
  bomb: 0,
};

/** Per-powerup cap, keyed by mode. Only powerups a mode actually uses appear. */
export const STANDARD_CAP: Partial<Powerups> = {
  undo: 2,
  swap: 2,
  delete: 2,
};

export const PLUS_CAP: Partial<Powerups> = {
  undo: 2,
  swap: 2,
  teleport: 2,
  rotate: 2,
  delete: 2,
  bomb: 2,
};

/** Tile-value milestone -> powerup granted (+1, capped) for each mode. */
export const STANDARD_UNLOCKS: [number, keyof Powerups][] = [
  [128, "undo"],
  [256, "swap"],
  [512, "delete"],
];

export const PLUS_UNLOCKS: [number, keyof Powerups][] = [
  [128, "undo"],
  [256, "teleport"],
  [256, "swap"],
  [256, "rotate"],
  [512, "delete"],
  [512, "bomb"],
];

/** Undo keeps a short rolling window of prior board states. */
export const MAX_HISTORY = 5;

export const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2: { bg: "var(--tile-2-bg)", fg: "var(--tile-2-fg)" },
  4: { bg: "var(--tile-4-bg)", fg: "var(--tile-4-fg)" },
  8: { bg: "var(--tile-8-bg)", fg: "var(--tile-8-fg)" },
  16: { bg: "var(--tile-16-bg)", fg: "var(--tile-16-fg)" },
  32: { bg: "var(--tile-32-bg)", fg: "var(--tile-32-fg)" },
  64: { bg: "var(--tile-64-bg)", fg: "var(--tile-64-fg)" },
  128: { bg: "var(--tile-128-bg)", fg: "var(--tile-128-fg)" },
  256: { bg: "var(--tile-256-bg)", fg: "var(--tile-256-fg)" },
  512: { bg: "var(--tile-512-bg)", fg: "var(--tile-512-fg)" },
  1024: { bg: "var(--tile-1024-bg)", fg: "var(--tile-1024-fg)" },
  2048: { bg: "var(--tile-2048-bg)", fg: "var(--tile-2048-fg)" },
  4096: { bg: "var(--tile-4096-bg)", fg: "var(--tile-4096-fg)" },
  8192: { bg: "var(--tile-8192-bg)", fg: "var(--tile-8192-fg)" },
  16384: { bg: "var(--tile-16384-bg)", fg: "var(--tile-16384-fg)" },
  32768: { bg: "var(--tile-32768-bg)", fg: "var(--tile-32768-fg)" },
  65536: { bg: "var(--tile-65536-bg)", fg: "var(--tile-65536-fg)" },
  131072: { bg: "var(--tile-131072-bg)", fg: "var(--tile-131072-fg)" },
  262144: { bg: "var(--tile-262144-bg)", fg: "var(--tile-262144-fg)" },
  524288: { bg: "var(--tile-524288-bg)", fg: "var(--tile-524288-fg)" },
  1048576: { bg: "var(--tile-1048576-bg)", fg: "var(--tile-1048576-fg)" },
};

export const SUPER_TILE = {
  bg: "var(--tile-super-bg)",
  fg: "var(--tile-super-fg)",
};

export function tileColor(value: number): { bg: string; fg: string } {
  return TILE_COLORS[value] ?? SUPER_TILE;
}

export function gameKey(mode: string): string {
  return mode;
}
