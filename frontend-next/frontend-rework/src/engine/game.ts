import { Alea } from './alea'
import { generateId } from './ids'
import {
  POWERUP_CAPACITY,
  accrualFor,
  startingInventory,
} from './powerups'
import type {
  Board,
  Direction,
  GameState,
  MergeEvent,
  Mode,
  PowerupId,
  SlideEvent,
  Tile,
} from './types'

export interface PowerupEvents {
  slides: SlideEvent[]
  removes: string[] // tile ids scaling 1 -> 0
  spawns: Tile[]
}

function emptyBoard(): Board {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null))
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState
}

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Perimeter ring cells in clockwise order, starting at (0,0) (spec §37). */
export const RING_CELLS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 1 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 2, y: 3 },
  { x: 1, y: 3 },
  { x: 0, y: 3 },
  { x: 0, y: 2 },
  { x: 0, y: 1 },
]

export class GameEngine {
  mode: Mode
  private rng: Alea
  state: GameState
  /** Snapshot of state after the previous completed natural move (§32). */
  previousGameplay: GameState | null
  /** Last natural move, for the reverse undo animation (§19.7). */
  lastMove: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null = null
  /** Powerup currently being targeted, when state === 'selecting'. */
  selectingPowerup: PowerupId | null = null
  private listeners = new Set<() => void>()
  private snapshotCache: GameState | null = null

  constructor(mode: Mode, seed?: string, restored?: GameState) {
    this.mode = mode
    if (restored) {
      this.state = restored
      this.rng = new Alea(restored._rng.seed, restored._rng.seedrandomState)
      this.previousGameplay = null
    } else {
      const initialSeed = seed ?? Math.random().toString()
      this.rng = new Alea(initialSeed)
      this.state = {
        state: 'fresh',
        board: emptyBoard(),
        id: generateId(),
        moveCount: 0,
        score: 0,
        powerups: startingInventory(mode),
        _rng: { seed: initialSeed, seedrandomState: this.rng.exportState() },
        highestReachedTile: 0,
        winTriggerDismissed: false,
        powerupsUsed: 0,
      }
      this.previousGameplay = null
      this.spawnInitialTiles()
    }
  }

  // ---------- React glue ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): GameState => {
    if (!this.snapshotCache) this.snapshotCache = deepCopy(this.state)
    return this.snapshotCache
  }

  private emit() {
    this.snapshotCache = null
    this.state._rng.seedrandomState = this.rng.exportState()
    for (const l of this.listeners) l()
  }

  // ---------- Init (§24) ----------

  private spawnInitialTiles() {
    // PRNG order: cell1, value1, cell2, value2 (§24)
    const c1 = this.randomEmptyCell(this.state.board)
    if (c1) this.state.board[c1.y][c1.x] = this.makeTile(c1, this.randomTileValue())
    const c2 = this.randomEmptyCell(this.state.board)
    if (c2) this.state.board[c2.y][c2.x] = this.makeTile(c2, this.randomTileValue())
  }

  private makeTile(pos: { x: number; y: number }, value: number): Tile {
    return { id: generateId(), value, position: { x: pos.x, y: pos.y } }
  }

  private randomTileValue(): number {
    return this.rng.next() < 0.9 ? 2 : 4
  }

  private randomEmptyCell(board: Board): { x: number; y: number } | null {
    const empties: { x: number; y: number }[] = []
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) if (!board[y][x]) empties.push({ x, y })
    if (empties.length === 0) return null
    return empties[Math.floor(this.rng.next() * empties.length)]
  }

  // ---------- Natural move (§25) ----------

  move(dir: Direction): { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null {
    if (this.state.state === 'gameover' || this.state.state === 'selecting' || this.state.state === 'gamewon') {
      return null
    }

    this.previousGameplay = cloneState(this.state)
    if (this.state.state === 'fresh') this.state.state = 'playing'

    const slides: SlideEvent[] = []
    const merges: MergeEvent[] = []
    let changed = false
    let scoreGained = 0
    const accrued: Partial<Record<PowerupId, number>> = {}

    const lines = this.linesForDirection(dir)
    for (const line of lines) {
      // Tiles ordered from the destination edge inward (§25.1)
      const tiles: { tile: Tile; x: number; y: number }[] = []
      for (const { x, y } of line) {
        const t = this.state.board[y][x]
        if (t) tiles.push({ tile: t, x, y })
      }
      if (tiles.length === 0) continue

      let targetIdx = 0
      let placed: { tile: Tile; mergedThisTurn: boolean } | null = null

      for (const entry of tiles) {
        const prev = placed
        if (prev && prev.tile.value === entry.tile.value && !prev.mergedThisTurn) {
          // Merge (§25.2): at most once per tile per turn
          const dest = line[targetIdx - 1]
          const mergeFromA = { x: prev.tile.position.x, y: prev.tile.position.y }
          const mergeFromB = { x: entry.tile.position.x, y: entry.tile.position.y }
          const newTile = this.makeTile(dest, entry.tile.value * 2)
          this.state.board[dest.y][dest.x] = newTile
          // Clear both source cells if distinct from dest
          this.clearCell(mergeFromA, dest)
          this.clearCell(mergeFromB, dest)
          merges.push({
            consumedIds: [prev.tile.id, entry.tile.id],
            newTile,
            from: [mergeFromA, mergeFromB],
            to: { x: dest.x, y: dest.y },
          })
          scoreGained += newTile.value
          changed = true
          if (newTile.value > this.state.highestReachedTile) {
            this.state.highestReachedTile = newTile.value
          }
          const gained = accrualFor(newTile.value, this.state.powerups)
          for (const [id, n] of Object.entries(gained)) {
            accrued[id as PowerupId] = (accrued[id as PowerupId] ?? 0) + (n ?? 0)
          }
          placed = { tile: newTile, mergedThisTurn: true }
        } else {
          const dest = line[targetIdx]
          if (dest.x !== entry.x || dest.y !== entry.y) {
            this.state.board[entry.y][entry.x] = null
            this.state.board[dest.y][dest.x] = entry.tile
            entry.tile.position = { x: dest.x, y: dest.y }
            slides.push({
              tileId: entry.tile.id,
              from: { x: entry.x, y: entry.y },
              to: { x: dest.x, y: dest.y },
            })
            changed = true
          }
          placed = { tile: entry.tile, mergedThisTurn: false }
          targetIdx++
        }
      }
    }

    this.state.score += scoreGained

    // Accrual into inventory, hard cap 2 (§29.2, §29.3)
    for (const [id, n] of Object.entries(accrued)) {
      const slot = this.state.powerups[id as PowerupId]
      if (slot) {
        slot.usesRemaining = Math.min(POWERUP_CAPACITY, slot.usesRemaining + (n ?? 0))
      }
    }

    let spawn: Tile | null = null
    if (changed) {
      // Exactly 1 natural spawn; PRNG: cell first, value second (§25.4)
      this.state.moveCount++
      const cell = this.randomEmptyCell(this.state.board)
      if (cell) {
        const value = this.randomTileValue()
        spawn = this.makeTile(cell, value)
        this.state.board[cell.y][cell.x] = spawn
        if (value > this.state.highestReachedTile) this.state.highestReachedTile = value
      }
    }

    // Win intercept (§26)
    let won = false
    if (!this.state.winTriggerDismissed) {
      for (const m of merges) {
        if (m.newTile.value === 2048) {
          won = true
          break
        }
      }
    }

    // Game over (§27)
    let gameOver = false
    if (!won && this.isBoardStuck()) {
      gameOver = true
    }

    if (won) this.state.state = 'gamewon'
    else if (gameOver) this.state.state = 'gameover'

    this.lastMove = { slides, merges, spawn }
    this.emit()
    return { slides, merges, spawn }
  }

  private clearCell(cell: { x: number; y: number }, except: { x: number; y: number }) {
    if (cell.x === except.x && cell.y === except.y) return
    this.state.board[cell.y][cell.x] = null
  }

  /**
   * The four lines for a direction, each ordered from the destination edge
   * inward (§25.1).
   */
  private linesForDirection(dir: Direction): { x: number; y: number }[][] {
    const lines: { x: number; y: number }[][] = []
    for (let i = 0; i < 4; i++) {
      const line: { x: number; y: number }[] = []
      for (let j = 0; j < 4; j++) {
        if (dir === 'left') line.push({ x: j, y: i })
        else if (dir === 'right') line.push({ x: 3 - j, y: i })
        else if (dir === 'up') line.push({ x: i, y: j })
        else line.push({ x: i, y: 3 - j })
      }
      lines.push(line)
    }
    return lines
  }

  isBoardStuck(): boolean {
    const b = this.state.board
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const t = b[y][x]
        if (!t) return false
        if (x < 3 && b[y][x + 1]?.value === t.value) return false
        if (y < 3 && b[y + 1][x]?.value === t.value) return false
      }
    return true
  }

  // ---------- Win / Game Over UI transitions (§26, §28) ----------

  keepGoing() {
    if (this.state.state !== 'gamewon') return
    this.state.state = 'playing'
    this.state.winTriggerDismissed = true
    this.emit()
  }

  // ---------- Undo (§32) ----------

  undo(): { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null {
    const slot = this.state.powerups.undo
    if (!slot || slot.usesRemaining <= 0 || !this.previousGameplay) return null

    const restored = cloneState(this.previousGameplay)
    const reverse = this.lastMove
    // Consume 1 undo use against the restored snapshot (single debit).
    restored.powerups.undo!.usesRemaining = Math.max(0, restored.powerups.undo!.usesRemaining - 1)
    restored.powerups.undo!.usesCount = this.state.powerups.undo!.usesCount + 1
    restored.powerupsUsed = this.state.powerupsUsed + 1

    this.state = restored
    this.previousGameplay = cloneState(restored)
    this.lastMove = null
    this.state.state = 'playing'
    this.emit()
    return reverse
  }

  // ---------- Powerup selection (§30) ----------

  beginSelecting(id: PowerupId): boolean {
    const slot = this.state.powerups[id]
    if (!slot || slot.usesRemaining <= 0) return false
    if (this.state.state !== 'playing' && this.state.state !== 'gameover') return false
    this.selectingPowerup = id
    this.state.state = 'selecting'
    this.emit()
    return true
  }

  cancelSelection() {
    if (this.state.state !== 'selecting') return
    this.selectingPowerup = null
    this.state.state = this.isBoardStuck() ? 'gameover' : 'playing'
    this.emit()
  }

  private consumePowerup(id: PowerupId) {
    const slot = this.state.powerups[id]
    if (!slot) return
    slot.usesRemaining = Math.max(0, slot.usesRemaining - 1)
    slot.usesCount++
    this.state.powerupsUsed++
    this.selectingPowerup = null
    this.state.state = this.isBoardStuck() ? 'gameover' : 'playing'
  }

  // ---------- Swap (§33) ----------

  applySwap(a: { x: number; y: number }, b: { x: number; y: number }): PowerupEvents | null {
    if (this.state.state !== 'selecting' || this.selectingPowerup !== 'swap') return null
    const ta = this.state.board[a.y][a.x]
    const tb = this.state.board[b.y][b.x]
    if (!ta || !tb || ta.id === tb.id) return null
    this.state.board[a.y][a.x] = tb
    this.state.board[b.y][b.x] = ta
    ta.position = { x: b.x, y: b.y }
    tb.position = { x: a.x, y: a.y }
    this.consumePowerup('swap')
    this.previousGameplay = cloneState(this.state)
    this.lastMove = null
    this.emit()
    return {
      slides: [
        { tileId: ta.id, from: a, to: { x: b.x, y: b.y } },
        { tileId: tb.id, from: b, to: { x: a.x, y: a.y } },
      ],
      removes: [],
      spawns: [],
    }
  }

  // ---------- Remove by Value (§35) ----------

  applyRemoveValue(target: { x: number; y: number }): PowerupEvents | null {
    if (this.state.state !== 'selecting' || this.selectingPowerup !== 'remove') return null
    const t = this.state.board[target.y][target.x]
    if (!t) return null
    const victims: string[] = []
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cell = this.state.board[y][x]
        if (cell && cell.value === t.value) {
          victims.push(cell.id)
          this.state.board[y][x] = null
        }
      }
    this.consumePowerup('remove')
    this.previousGameplay = cloneState(this.state)
    this.lastMove = null
    this.emit()
    return { slides: [], removes: victims, spawns: [] }
  }

  // ---------- Teleport (§36) ----------

  applyTeleport(tile: { x: number; y: number }, cell: { x: number; y: number }): PowerupEvents | null {
    if (this.state.state !== 'selecting' || this.selectingPowerup !== 'teleport') return null
    const t = this.state.board[tile.y][tile.x]
    if (!t || this.state.board[cell.y][cell.x]) return null
    this.state.board[tile.y][tile.x] = null
    this.state.board[cell.y][cell.x] = t
    t.position = { x: cell.x, y: cell.y }
    this.consumePowerup('teleport')
    this.previousGameplay = cloneState(this.state)
    this.lastMove = null
    this.emit()
    return {
      slides: [{ tileId: t.id, from: tile, to: cell }],
      removes: [],
      spawns: [],
    }
  }

  // ---------- Rotate outer ring (§37) ----------

  applyRotate(clockwise: boolean): PowerupEvents | null {
    if (this.state.state !== 'selecting' || this.selectingPowerup !== 'rotate') return null
    const slides: SlideEvent[] = []
    const moves: { tile: Tile; from: number; to: number }[] = []
    for (let i = 0; i < 12; i++) {
      const { x, y } = RING_CELLS[i]
      const t = this.state.board[y][x]
      if (!t) continue
      // Shift by 3 positions = 90 degrees (§37)
      const to = (i + (clockwise ? 3 : 9)) % 12
      moves.push({ tile: t, from: i, to })
      slides.push({ tileId: t.id, from: { x, y }, to: RING_CELLS[to] })
    }
    for (const m of moves) {
      const from = RING_CELLS[m.from]
      this.state.board[from.y][from.x] = null
    }
    for (const m of moves) {
      const dest = RING_CELLS[m.to]
      this.state.board[dest.y][dest.x] = m.tile
      m.tile.position = { x: dest.x, y: dest.y }
    }
    this.consumePowerup('rotate')
    this.previousGameplay = cloneState(this.state)
    this.lastMove = null
    this.emit()
    return { slides, removes: [], spawns: [] }
  }

  // ---------- Bomb (§38) ----------

  applyBomb(center: { x: number; y: number }): PowerupEvents | null {
    if (this.state.state !== 'selecting' || this.selectingPowerup !== 'bomb') return null
    if (center.x < 0 || center.x > 3 || center.y < 0 || center.y > 3) return null

    const zone: { x: number; y: number }[] = []
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = center.x + dx
        const y = center.y + dy
        if (x >= 0 && x <= 3 && y >= 0 && y <= 3) zone.push({ x, y })
      }

    const removes: string[] = []
    for (const c of zone) {
      const t = this.state.board[c.y][c.x]
      if (t) {
        removes.push(t.id)
        this.state.board[c.y][c.x] = null
      }
    }

    this.consumePowerup('bomb')

    // Replenishment loop (§38): ensure at least 2 tiles survive overall.
    let remaining = 0
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) if (this.state.board[y][x]) remaining++
    const required = Math.max(2 - remaining, 0)
    const spawns: Tile[] = []
    for (let i = 0; i < required; i++) {
      const cell = this.randomEmptyCell(this.state.board)
      if (!cell) break
      const value = this.randomTileValue()
      const tile = this.makeTile(cell, value)
      this.state.board[cell.y][cell.x] = tile
      spawns.push(tile)
      if (value > this.state.highestReachedTile) this.state.highestReachedTile = value
    }

    this.previousGameplay = cloneState(this.state)
    this.lastMove = null
    this.emit()
    return { slides: [], removes, spawns }
  }

  // ---------- New game ----------

  reset() {
    const fresh = new GameEngine(this.mode)
    this.state = fresh.state
    this.rng = new Alea(this.state._rng.seed)
    this.previousGameplay = null
    this.lastMove = null
    this.selectingPowerup = null
    this.emit()
  }
}
