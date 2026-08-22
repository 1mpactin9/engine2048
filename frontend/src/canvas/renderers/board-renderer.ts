import { Application, Container, Graphics } from 'pixi.js'
import type { Ticker } from 'pixi.js'
import { TileSprite } from './tile-sprite'
import { SIZE } from '../../game/types'
import {
  BOARD_MARGIN,
  BOARD_RADIUS,
  BOARD_SIZE,
  CELL_RADIUS,
  CELL_SIZE,
  DARK_BOARD_GRADIENT,
  DARK_EMPTY_CELL,
  LIGHT_BOARD_GRADIENT,
  LIGHT_EMPTY_CELL,
  STAGE_SIZE,
  cellPosition,
} from '../theme/palette'
import { verticalGradient } from '../theme/gradient'

async function ensureFontLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.load('700 48px Rubik')
  } catch {
    // fall back to system fonts if loading fails
  }
}

export interface TileView {
  id: number
  value: number
  x: number
  y: number
  isNew: boolean
  isMerged: boolean
  removed: boolean
}

export class BoardRenderer {
  private app: Application | null = null
  private readonly board = new Container()
  private readonly boardBackground = new Graphics()
  private readonly cellsLayer = new Graphics()
  private readonly tileLayer = new Container()
  private readonly sprites = new Map<number, TileSprite>()

  private readonly dark: boolean

  constructor(options: { dark?: boolean } = {}) {
    this.dark = options.dark ?? false
  }

  async init(host: HTMLElement): Promise<void> {
    await ensureFontLoaded()

    const app = new Application()
    await app.init({
      width: STAGE_SIZE,
      height: STAGE_SIZE,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })

    this.app = app
    host.appendChild(app.canvas)
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    app.canvas.style.display = 'block'

    this.board.position.set(BOARD_MARGIN, BOARD_MARGIN)
    this.board.addChild(this.boardBackground, this.cellsLayer, this.tileLayer)
    app.stage.addChild(this.board)

    this.drawBoard()
    this.drawCells()

    app.ticker.add(this.onTick)
  }

  reconcile(tiles: TileView[], ghosts: TileView[]): void {
    const tileIds = new Set<number>()
    const ghostIds = new Set<number>()

    for (const tile of tiles) {
      tileIds.add(tile.id)
      let sprite = this.sprites.get(tile.id)
      if (!sprite) {
        sprite = new TileSprite(tile.id, tile.value, tile.x, tile.y)
        this.sprites.set(tile.id, sprite)
        this.tileLayer.addChild(sprite)
        if (tile.isNew) sprite.playSpawn()
        else if (tile.isMerged) sprite.playMerge()
      } else {
        sprite.ghost = false
        sprite.alpha = 1
        sprite.slideTo(tile.x, tile.y)
      }
    }

    for (const ghost of ghosts) {
      ghostIds.add(ghost.id)
      const sprite = this.sprites.get(ghost.id)
      if (sprite) {
        sprite.ghost = true
        sprite.slideTo(ghost.x, ghost.y)
      }
    }

    for (const [id, sprite] of this.sprites) {
      if (!tileIds.has(id) && !ghostIds.has(id)) {
        this.tileLayer.removeChild(sprite)
        sprite.destroy({ children: true })
        this.sprites.delete(id)
      }
    }
  }

  destroy(): void {
    if (this.app) {
      this.app.ticker.remove(this.onTick)
      this.app.destroy(true, true)
      this.app = null
    }
    this.sprites.clear()
  }

  private onTick = (ticker: Ticker): void => {
    const dt = ticker.deltaTime
    const toRemove: TileSprite[] = []

    for (const child of this.tileLayer.children) {
      const sprite = child as TileSprite
      if (sprite.update(dt)) toRemove.push(sprite)
    }

    for (const sprite of toRemove) {
      this.tileLayer.removeChild(sprite)
      this.sprites.delete(sprite.tileId)
      sprite.destroy({ children: true })
    }
  }

  private drawBoard(): void {
    this.boardBackground.clear()

    const [top, bottom] = this.dark ? DARK_BOARD_GRADIENT : LIGHT_BOARD_GRADIENT

    this.drawShadow(0x8a633c, 0.18, 10, 15)
    this.drawShadow(0x8a633c, 0.13, 4, 3)

    this.boardBackground
      .roundRect(0, 0, BOARD_SIZE, BOARD_SIZE, BOARD_RADIUS)
      .fill({ fill: verticalGradient(top, bottom) })
  }

  private drawShadow(color: number, alpha: number, distance: number, blur: number): void {
    const layers = 3
    for (let i = 1; i <= layers; i++) {
      const spread = (blur * i) / layers
      const a = Math.min((alpha / layers) * 1.1, 1)
      this.boardBackground
        .roundRect(
          0 - spread,
          distance - spread,
          BOARD_SIZE + spread * 2,
          BOARD_SIZE + spread * 2,
          BOARD_RADIUS + spread,
        )
        .fill({ color, alpha: a })
    }
  }

  private drawCells(): void {
    this.cellsLayer.clear()

    const base = this.dark ? DARK_EMPTY_CELL : LIGHT_EMPTY_CELL
    const recessed = this.dark ? '#5a554c' : '#a09282'
    const lip = this.dark ? '#7c766a' : '#c4b7a7'

    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const p = cellPosition(x, y)
        this.cellsLayer
          .roundRect(p.x, p.y - 2, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
          .fill({ color: recessed })
        this.cellsLayer
          .roundRect(p.x, p.y + 1, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
          .fill({ color: lip })
        this.cellsLayer
          .roundRect(p.x, p.y, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
          .fill({ color: base })
      }
    }
  }
}
