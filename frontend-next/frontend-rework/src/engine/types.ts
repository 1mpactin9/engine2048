import type { AleaState } from './alea'

export type Mode = 'standard' | 'classic' | 'plus' | 'tutorial'

export type GameStatus =
  | 'fresh'
  | 'playing'
  | 'selecting'
  | 'gameover'
  | 'gamewon'

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Tile {
  id: string
  value: number
  position: { x: number; y: number }
}

/** 4x4 grid, row-major: board[y][x]. */
export type Board = (Tile | null)[][]

export type PowerupId = 'undo' | 'swap' | 'remove' | 'teleport' | 'rotate' | 'bomb'

export interface PowerupState {
  usesRemaining: number
  usesCount: number
}

export type PowerupInventory = Partial<Record<PowerupId, PowerupState>>

export interface GameState {
  state: GameStatus
  board: Board
  id: string
  moveCount: number
  score: number
  powerups: PowerupInventory
  _rng: {
    seed: string
    seedrandomState: AleaState
  }
  highestReachedTile: number
  /** True after "Keep Going" - the 2048 win trigger is permanently off (§26). */
  winTriggerDismissed: boolean
  powerupsUsed: number
}

/** A single tile's slide during a move, for the renderer. */
export interface SlideEvent {
  tileId: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/** Two tiles consumed into a new one, for the renderer. */
export interface MergeEvent {
  consumedIds: [string, string]
  newTile: Tile
  from: [{ x: number; y: number }, { x: number; y: number }]
  to: { x: number; y: number }
}

export interface SpawnEvent {
  tile: Tile
}

export interface MoveResult {
  changed: boolean
  slides: SlideEvent[]
  merges: MergeEvent[]
  spawn: SpawnEvent | null
  scoreGained: number
  accrued: Partial<Record<PowerupId, number>>
  won: boolean
  gameOver: boolean
}
