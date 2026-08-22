import type { Position } from './types'

let nextTileId = 1

export class Tile {
  readonly id: number
  value: number
  x: number
  y: number
  previousX: number | null
  previousY: number | null
  mergedFrom: [Tile, Tile] | null
  isNew: boolean
  isMerged: boolean
  removed: boolean

  constructor(x: number, y: number, value: number) {
    this.id = nextTileId++
    this.x = x
    this.y = y
    this.value = value
    this.previousX = null
    this.previousY = null
    this.mergedFrom = null
    this.isNew = false
    this.isMerged = false
    this.removed = false
  }

  savePosition(): void {
    this.previousX = this.x
    this.previousY = this.y
  }

  updatePosition(position: Position): void {
    this.x = position.x
    this.y = position.y
  }
}
