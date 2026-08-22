import { Tile } from './tile'
import { Rng } from './rng'
import { GameStatus, SIZE } from './types'
import type { Direction, Position } from './types'

const VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export interface MoveResult {
  moved: boolean
  score: number
  moveCount: number
  status: GameStatus
  won: boolean
}

export interface SerializedGame {
  cells: ({ id: number; value: number } | null)[][]
  score: number
  moveCount: number
  status: GameStatus
  won: boolean
  keepPlaying: boolean
  rngState: ReturnType<Rng['state']>
}

export class Game2048 {
  readonly size = SIZE
  readonly ghosts: Tile[] = []

  private cells: (Tile | null)[][]
  private rng: Rng
  private scoreValue = 0
  private moveCountValue = 0
  private statusValue: GameStatus = GameStatus.Fresh
  private wonValue = false
  private keepPlayingValue = false

  constructor(seed?: string) {
    this.rng = new Rng(seed)
    this.cells = Game2048.emptyCells()
    this.spawnTile()
    this.spawnTile()
  }

  get score(): number {
    return this.scoreValue
  }

  get moveCount(): number {
    return this.moveCountValue
  }

  get status(): GameStatus {
    return this.statusValue
  }

  get won(): boolean {
    return this.wonValue
  }

  boardTiles(): Tile[] {
    const tiles: Tile[] = []
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const tile = this.cells[x][y]
        if (tile) tiles.push(tile)
      }
    }
    return tiles
  }

  move(direction: Direction): MoveResult {
    const base = (): MoveResult => ({
      moved: false,
      score: this.scoreValue,
      moveCount: this.moveCountValue,
      status: this.statusValue,
      won: this.wonValue,
    })

    if (this.statusValue === GameStatus.GameOver) return base()
    if (this.statusValue === GameStatus.GameWon && !this.keepPlayingValue) return base()

    // reset per-move animation flags and clear previous ghosts
    this.ghosts.length = 0
    for (const tile of this.boardTiles()) {
      tile.mergedFrom = null
      tile.isMerged = false
      tile.isNew = false
      tile.removed = false
      tile.savePosition()
    }

    const vector = VECTORS[direction]
    const traversals = this.buildTraversals(vector)
    let moved = false

    for (const x of traversals.x) {
      for (const y of traversals.y) {
        const tile = this.cells[x][y]
        if (!tile) continue

        const positions = this.findFarthestPosition({ x, y }, vector)
        const nextTile = this.cellAt(positions.next.x, positions.next.y)

        if (nextTile && nextTile.value === tile.value && !nextTile.mergedFrom) {
          const merged = new Tile(positions.next.x, positions.next.y, tile.value * 2)
          merged.mergedFrom = [tile, nextTile]
          merged.isMerged = true

          this.cells[tile.x][tile.y] = null
          this.cells[nextTile.x][nextTile.y] = merged

          // both sources slide to the target then dissolve
          tile.removed = true
          nextTile.removed = true
          tile.updatePosition(positions.next)
          nextTile.updatePosition(positions.next)
          this.ghosts.push(tile, nextTile)

          this.scoreValue += merged.value
          if (merged.value === 2048) this.wonValue = true
          moved = true
        } else if (positions.farthest.x !== tile.x || positions.farthest.y !== tile.y) {
          this.cells[tile.x][tile.y] = null
          tile.updatePosition(positions.farthest)
          this.cells[positions.farthest.x][positions.farthest.y] = tile
          moved = true
        }
      }
    }

    if (!moved) return base()

    this.moveCountValue++
    this.spawnTile()

    if (this.wonValue && !this.keepPlayingValue) {
      this.statusValue = GameStatus.GameWon
    } else if (!this.movesAvailable()) {
      this.statusValue = GameStatus.GameOver
    } else {
      this.statusValue = GameStatus.Playing
    }

    return {
      moved: true,
      score: this.scoreValue,
      moveCount: this.moveCountValue,
      status: this.statusValue,
      won: this.wonValue,
    }
  }

  movesAvailable(): boolean {
    if (this.cellsAvailable()) return true
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const tile = this.cells[x][y]
        if (!tile) continue
        for (const vector of Object.values(VECTORS)) {
          const other = this.cellAt(x + vector.x, y + vector.y)
          if (other && other.value === tile.value) return true
        }
      }
    }
    return false
  }

  serialize(): SerializedGame {
    return {
      cells: this.cells.map((row) =>
        row.map((tile) => (tile ? { id: tile.id, value: tile.value } : null)),
      ),
      score: this.scoreValue,
      moveCount: this.moveCountValue,
      status: this.statusValue,
      won: this.wonValue,
      keepPlaying: this.keepPlayingValue,
      rngState: this.rng.state(),
    }
  }

  private static emptyCells(): (Tile | null)[][] {
    return Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null))
  }

  private spawnTile(): void {
    const available = this.availableCells()
    if (available.length === 0) return
    const position = available[Math.floor(this.rng.next() * available.length)]
    const value = this.rng.next() < 0.9 ? 2 : 4
    const tile = new Tile(position.x, position.y, value)
    tile.isNew = true
    this.cells[position.x][position.y] = tile
  }

  private cellsAvailable(): boolean {
    return this.availableCells().length > 0
  }

  private availableCells(): Position[] {
    const cells: Position[] = []
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        if (!this.cells[x][y]) cells.push({ x, y })
      }
    }
    return cells
  }

  private cellAt(x: number, y: number): Tile | null {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null
    return this.cells[x][y]
  }

  private buildTraversals(vector: Position): { x: number[]; y: number[] } {
    const xs = [0, 1, 2, 3]
    const ys = [0, 1, 2, 3]
    if (vector.x === 1) xs.reverse()
    if (vector.y === 1) ys.reverse()
    return { x: xs, y: ys }
  }

  private findFarthestPosition(cell: Position, vector: Position): { farthest: Position; next: Position } {
    let previous = cell
    let current = { x: cell.x + vector.x, y: cell.y + vector.y }
    while (this.withinBounds(current) && this.cells[current.x][current.y] === null) {
      previous = current
      current = { x: current.x + vector.x, y: current.y + vector.y }
    }
    return { farthest: previous, next: current }
  }

  private withinBounds(position: Position): boolean {
    return position.x >= 0 && position.x < SIZE && position.y >= 0 && position.y < SIZE
  }
}
