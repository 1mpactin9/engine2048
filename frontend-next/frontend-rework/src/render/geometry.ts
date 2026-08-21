/**
 * Board geometry constants (spec §5).
 */

export const BOARD_SIZE = 576
export const TILE_SIZE = 112
export const TILE_RX = 12
export const CELL_INNER_SIZE = 108
export const CELL_RX = 10
export const GRID_GAP = 8
export const SVG_GAP = 12
export const BOARD_PADDING = 16
export const BOARD_RX = 22

/** Stride between adjacent tile centers (§5.3). */
export const STRIDE = 120
/** (112*4 + 8*3) / 2 = 236 (§5.3). */
export const T = (TILE_SIZE * 4 + GRID_GAP * 3) / 2

/** Container offset for the tile group: board center (288) minus T. */
export const TILE_GROUP_OFFSET = BOARD_SIZE / 2 - T // 52

/** Absolute center position of cell {x, y} in board space (§5.3). */
export function cellCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: TILE_GROUP_OFFSET + TILE_SIZE / 2 + STRIDE * col,
    y: TILE_GROUP_OFFSET + TILE_SIZE / 2 + STRIDE * row,
  }
}

/** Top-left of a cell's inner background rect in board space. */
export function cellInnerRect(col: number, row: number): { x: number; y: number } {
  return {
    x: TILE_GROUP_OFFSET + (TILE_SIZE - CELL_INNER_SIZE) / 2 + STRIDE * col,
    y: TILE_GROUP_OFFSET + (TILE_SIZE - CELL_INNER_SIZE) / 2 + STRIDE * row,
  }
}

/**
 * DPR resolution clamp (§1.2): min 1.0, max 2.0 under 640px width,
 * max 3.0 at 640px+, stepped to 0.25 intervals.
 */
export function resolveResolution(width: number, dpr: number): number {
  const max = width < 640 ? 2.0 : 3.0
  const clamped = Math.min(Math.max(dpr, 1.0), max)
  return Math.round(clamped * 4) / 4
}
