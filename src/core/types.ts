import type { UsageMode } from "./usage";

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface Cell {
  id: number;
  value: number;
}

export type Grid = (Cell | null)[][];

export type GameMode = "standard" | "classic" | "plus";

export type PowerupType =
  | "undo"
  | "swap"
  | "delete"
  | "teleport"
  | "rotate"
  | "bomb";

export interface Powerups {
  undo: number;
  swap: number;
  delete: number;
  teleport: number;
  rotate: number;
  bomb: number;
}

export interface TileMove {
  id: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  mergedInto?: number;
  newValue?: number;
}

export interface SpawnedTile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface MoveTranscript {
  moved: boolean;
  moves: TileMove[];
  spawned?: SpawnedTile;
  gained: number;
}

export interface GameSnapshot {
  grid: Grid;
  score: number;
  powerups: Powerups;
  won: boolean;
  wonAcknowledged: boolean;
  over: boolean;
  moveCount: number;
}

export interface GameState {
  size: number;
  mode: GameMode;
  grid: Grid;
  score: number;
  best: number;
  powerups: Powerups;
  won: boolean;
  wonAcknowledged: boolean;
  over: boolean;
  history: GameSnapshot[];
  moveCount: number;
  undoLocked: boolean;
  rngSeed?: number[];
  rngCalls?: number;
  usageMode?: UsageMode;
}

export interface EngineContext {
  grid: Grid;
  size: number;
  score: number;
  powerups: Powerups;
  depth: number;
  usePowerups: boolean;
  manipulate?: boolean;
  deterministic?: boolean;
  rngSeed?: number[];
  rngCalls?: number;
  usageMode?: UsageMode;
}

export type AutoAction =
  | { kind: "move"; dir: Direction }
  | { kind: "swap"; r1: number; c1: number; r2: number; c2: number }
  | { kind: "delete"; row: number; col: number }
  | { kind: "stop" };

export interface Engine {
  name: string;
  chooseAction(ctx: EngineContext): AutoAction | Promise<AutoAction>;
}
