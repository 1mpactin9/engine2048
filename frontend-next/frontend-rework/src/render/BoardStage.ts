/**
 * BoardStage: the PixiJS scene graph for the game board (spec §5, §6, §7, §19, §31, §38).
 * Runs identically inside the render worker (OffscreenCanvas) or on the
 * main thread as fallback.
 */

import { Application, Container, Graphics, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js'
import type { MergeEvent, SlideEvent, Tile } from '@/engine/types'
import { BOARD_SIZE, STRIDE, TILE_GROUP_OFFSET, cellCenter } from './geometry'
import { Spring, STANDARD_SPRING } from './springs'
import type { BoardTheme, GlyphMetrics, TexturePack } from './textures'
import { tileTextColor } from './textures'

export type RingVisualState = 'idle' | 'valid' | 'invalid' | 'selected'

interface TileView {
  root: Container
  sprite: Sprite
  label: Container
  value: number
}

interface Animation {
  update(dt: number): boolean // false = finished
}

const MOVE_MS = 250
const SPAWN_EARLY_MS = 50 // §19.5

function bitmapTexture(bm: ImageBitmap, resolution: number): Texture {
  const source = new ImageSource({ resource: bm, resolution })
  return new Texture({ source, frame: new Rectangle(0, 0, source.width, source.height) })
}

/** Tile text: size by digit count (§9), 5+ digits abbreviated with k. */
function formatTileText(value: number): string {
  if (value >= 100000) return `${Math.round(value / 1000)}k`
  return String(value)
}

function tileSizePx(text: string): number {
  if (text.length <= 2) return 48
  if (text.length === 3) return 40
  return 33
}

export class BoardStage {
  app!: Application
  private stage!: Container
  private boardRoot!: Container
  private boardSprite!: Sprite
  private tilesLayer!: Container
  private overlayLayer!: Container
  private tiles = new Map<string, TileView>()

  private pack!: TexturePack
  private theme!: BoardTheme
  private tileTextures = new Map<number, Texture>()
  private glyphSource!: ImageSource

  // Selection ring (§31)
  private ring: Sprite | null = null
  private ringVisible = false
  private ringState: RingVisualState = 'idle'
  private ringPointer: { x: number; y: number } | null = null
  private ringSprings: { x: Spring; y: Spring } | null = null

  // Bomb cross field (§38)
  private crossField: Container | null = null
  private crossSprites: Graphics[] = []
  private bombHoverCell: { x: number; y: number } | null = null

  private animations: Animation[] = []
  private renderLoop: number | null = null
  private lastFrame = 0
  private destroyed = false
  private onCellHover: ((cell: { x: number; y: number } | null) => void) | null = null
  private currentHoverCell: { x: number; y: number } | null = null

  async init(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: { pack: TexturePack; theme: BoardTheme; cssWidth: number; cssHeight: number; resolution: number },
  ) {
    this.pack = opts.pack
    this.theme = opts.theme
    this.buildTextures()

    const preferences: ('webgpu' | 'webgl')[] = ['webgpu', 'webgl']
    let lastError: unknown = null
    for (const preference of preferences) {
      try {
        this.app = new Application()
        await this.app.init({
          canvas: canvas as HTMLCanvasElement,
          width: Math.round(opts.cssWidth * opts.resolution),
          height: Math.round(opts.cssHeight * opts.resolution),
          resolution: 1,
          preference,
          autoStart: false,
          backgroundAlpha: 0,
        })
        lastError = null
        break
      } catch (err) {
        lastError = err
        try {
          this.app.destroy()
        } catch {
          /* partially-initialized app */
        }
      }
    }
    if (lastError) throw lastError

    this.stage = this.app.stage
    // §5.4: stage centered on the canvas, inverse-scaled by DPR.
    this.stage.position.set(this.app.renderer.width / 2, this.app.renderer.height / 2)
    this.stage.scale.set(1 / opts.resolution)
    this.stage.eventMode = 'static'

    this.boardRoot = new Container()
    const fit = Math.min(opts.cssWidth, opts.cssHeight) / BOARD_SIZE
    this.boardRoot.scale.set(fit)
    this.stage.addChild(this.boardRoot)

    this.boardSprite = new Sprite(this.boardTexture)
    this.boardSprite.anchor.set(0.5)
    this.boardRoot.addChild(this.boardSprite)

    this.tilesLayer = new Container()
    this.boardRoot.addChild(this.tilesLayer)

    this.overlayLayer = new Container()
    this.boardRoot.addChild(this.overlayLayer)

    this.startLoop()
  }

  private get boardTexture(): Texture {
    return bitmapTexture(this.pack.board, 3)
  }

  private buildTextures() {
    this.tileTextures.clear()
    for (const [value, bm] of Object.entries(this.pack.tiles)) {
      this.tileTextures.set(Number(value), bitmapTexture(bm, 3))
    }
    this.glyphSource = new ImageSource({ resource: this.pack.glyphAtlas, resolution: 1 })
  }

  // ---------- Frame loop (rAF on main thread, interval in worker) ----------

  private startLoop() {
    this.lastFrame = performance.now()
    const tick = (now: number) => {
      if (this.destroyed) return
      const dt = Math.min(64, now - this.lastFrame)
      this.lastFrame = now
      this.updateAnimations(dt)
      this.app.render()
      if (typeof requestAnimationFrame === 'function') {
        this.renderLoop = requestAnimationFrame(tick)
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      this.renderLoop = requestAnimationFrame(tick)
    } else {
      // Worker: no rAF - drive with a timer.
      this.renderLoop = setInterval(() => tick(performance.now()), 16) as unknown as number
    }
  }

  private updateAnimations(dt: number) {
    if (this.animations.length) {
      this.animations = this.animations.filter((a) => a.update(dt))
    }
    this.updateRing(dt)
    this.updateCrossField()
  }

  // ---------- Board state ----------

  setBoard(tiles: Tile[]) {
    for (const view of this.tiles.values()) {
      view.root.destroy({ children: true })
    }
    this.tiles.clear()
    this.animations = []
    for (const t of tiles) {
      this.createTileView(t, 1)
    }
  }

  private createTileView(tile: Tile, scale = 1): TileView {
    const root = new Container()
    const pos = cellCenter(tile.position.x, tile.position.y)
    root.position.set(pos.x, pos.y)
    root.scale.set(scale)

    const tex = this.tileTextures.get(tile.value) ?? this.tileTextures.get(2)!
    const sprite = new Sprite(tex)
    sprite.anchor.set(0.5)
    root.addChild(sprite)

    const label = this.createLabel(tile.value)
    root.addChild(label)

    this.tilesLayer.addChild(root)
    const view: TileView = { root, sprite, label, value: tile.value }
    this.tiles.set(tile.id, view)
    return view
  }

  private createLabel(value: number): Container {
    const label = new Container()
    const text = formatTileText(value)
    const size = tileSizePx(text)
    const k = size / this.pack.glyphs.fontSize
    const metrics = this.pack.glyphs

    let totalAdvance = 0
    let maxAscent = 0
    let maxDescent = 0
    for (const ch of text) {
      const g = metrics.entries[ch]
      if (!g) continue
      totalAdvance += g.advance
      maxAscent = Math.max(maxAscent, g.ascent)
      maxDescent = Math.max(maxDescent, g.descent)
    }
    let penX = (-totalAdvance * k) / 2
    const baselineY = ((maxDescent - maxAscent) / 2) * k

    for (const ch of text) {
      const g = metrics.entries[ch]
      if (!g) continue
      const frame = new Rectangle(g.u, g.v, g.w, g.h)
      const tex = new Texture({ source: this.glyphSource, frame })
      const s = new Sprite(tex)
      s.anchor.set(0, 0)
      s.position.set(penX + g.left * k, baselineY - g.top * k)
      s.width = g.w * k
      s.height = g.h * k
      s.tint = tileTextColor(value)
      label.addChild(s)
      penX += g.advance * k
    }
    return label
  }

  // ---------- Move animations (§19) ----------

  /** Slide + merge + spawn; resolves when the 250ms window completes. */
  animateMove(events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null }): Promise<void> {
    const started = performance.now()

    for (const slide of events.slides) {
      const view = this.tiles.get(slide.tileId)
      if (!view) continue
      const from = cellCenter(slide.from.x, slide.from.y)
      const to = cellCenter(slide.to.x, slide.to.y)
      this.animateContainerPosition(view.root, from, to, MOVE_MS)
    }

    for (const merge of events.merges) {
      for (let i = 0; i < 2; i++) {
        const id = merge.consumedIds[i]
        const view = this.tiles.get(id)
        if (!view) continue
        const from = cellCenter(merge.from[i].x, merge.from[i].y)
        const to = cellCenter(merge.to.x, merge.to.y)
        this.animateContainerPosition(view.root, from, to, MOVE_MS)
        // Destroy consumed tiles when the slide lands.
        const consumedId = id
        setTimeout(() => {
          const v = this.tiles.get(consumedId)
          if (v) {
            v.root.destroy({ children: true })
            this.tiles.delete(consumedId)
          }
        }, MOVE_MS)
      }
      // Result tile pops in at 0.8 and springs to 1.0 when the merge lands (§19.6).
      setTimeout(() => {
        if (this.destroyed) return
        const view = this.createTileView(merge.newTile, 0.8)
        this.animateScale(view.root, 0.8, 1, MOVE_MS)
      }, MOVE_MS)
    }

    if (events.spawn) {
      // Spawn starts 50ms BEFORE the slide completes (§19.5).
      const delay = MOVE_MS - SPAWN_EARLY_MS
      setTimeout(() => {
        if (this.destroyed) return
        const view = this.createTileView(events.spawn!, 0)
        this.animateScale(view.root, 0, 1, MOVE_MS)
      }, delay)
    }

    return new Promise((resolve) => setTimeout(resolve, MOVE_MS))
  }

  /** Powerup animations (slides / removes / bomb spawns). */
  animatePowerup(events: { slides: SlideEvent[]; removes: string[]; spawns: Tile[] }): Promise<void> {
    for (const slide of events.slides) {
      const view = this.tiles.get(slide.tileId)
      if (!view) continue
      const from = cellCenter(slide.from.x, slide.from.y)
      const to = cellCenter(slide.to.x, slide.to.y)
      this.animateContainerPosition(view.root, from, to, MOVE_MS)
    }
    for (const id of events.removes) {
      const view = this.tiles.get(id)
      if (!view) continue
      this.animateScale(view.root, 1, 0, MOVE_MS)
      setTimeout(() => {
        const v = this.tiles.get(id)
        if (v) {
          v.root.destroy({ children: true })
          this.tiles.delete(id)
        }
      }, MOVE_MS)
    }
    for (const tile of events.spawns) {
      const view = this.createTileView(tile, 0)
      this.animateScale(view.root, 0, 1, MOVE_MS)
    }
    return new Promise((resolve) => setTimeout(resolve, MOVE_MS))
  }

  /** Undo: exact reverse of the previous move (§19.7). */
  animateUndo(events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null): Promise<void> {
    if (!events) return Promise.resolve()

    // Undo the natural spawn: shrink it away.
    if (events.spawn) {
      const view = this.tiles.get(events.spawn.id)
      if (view) {
        this.animateScale(view.root, 1, 0, MOVE_MS)
        const id = events.spawn.id
        setTimeout(() => {
          const v = this.tiles.get(id)
          if (v) {
            v.root.destroy({ children: true })
            this.tiles.delete(id)
          }
        }, MOVE_MS)
      }
    }

    for (const merge of events.merges) {
      // The merged result tile scales back down 1 -> 0.
      const view = this.tiles.get(merge.newTile.id)
      if (view) {
        this.animateScale(view.root, 1, 0, MOVE_MS)
        const id = merge.newTile.id
        setTimeout(() => {
          const v = this.tiles.get(id)
          if (v) {
            v.root.destroy({ children: true })
            this.tiles.delete(id)
          }
        }, MOVE_MS)
      }
      // The two originals pop in at the merge cell and slide back.
      for (let i = 0; i < 2; i++) {
        const orig: Tile = {
          id: merge.consumedIds[i],
          value: merge.newTile.value / 2,
          position: { x: merge.from[i].x, y: merge.from[i].y },
        }
        setTimeout(() => {
          if (this.destroyed) return
          const v = this.createTileView(orig, 1)
          const from = cellCenter(merge.to.x, merge.to.y)
          const to = cellCenter(orig.position.x, orig.position.y)
          this.animateContainerPosition(v.root, from, to, MOVE_MS)
        }, 0)
      }
    }

    // Reverse slides (excluding tiles consumed by merges).
    const mergedIds = new Set(events.merges.flatMap((m) => m.consumedIds))
    for (const slide of events.slides) {
      if (mergedIds.has(slide.tileId)) continue
      const view = this.tiles.get(slide.tileId)
      if (!view) continue
      const from = cellCenter(slide.to.x, slide.to.y)
      const to = cellCenter(slide.from.x, slide.from.y)
      this.animateContainerPosition(view.root, from, to, MOVE_MS)
    }

    return new Promise((resolve) => setTimeout(resolve, MOVE_MS))
  }

  private animateContainerPosition(c: Container, from: { x: number; y: number }, to: { x: number; y: number }, ms: number) {
    const sx = new Spring(from.x, to.x, STANDARD_SPRING)
    const sy = new Spring(from.y, to.y, STANDARD_SPRING)
    const start = performance.now()
    let last = start
    this.animations.push({
      update: () => {
        const now = performance.now()
        const dt = Math.min(32, now - last)
        last = now
        const x = sx.step(dt)
        const y = sy.step(dt)
        c.position.set(x, y)
        return now - start < ms
      },
    })
  }

  private animateScale(c: Container, from: number, to: number, ms: number) {
    const spring = new Spring(from, to, STANDARD_SPRING)
    const start = performance.now()
    let last = start
    this.animations.push({
      update: () => {
        const now = performance.now()
        const dt = Math.min(32, now - last)
        last = now
        c.scale.set(spring.step(dt))
        return now - start < ms
      },
    })
  }

  // ---------- Theme switch ----------

  setTheme(pack: TexturePack) {
    this.pack = pack
    this.buildTextures()
    this.boardSprite.texture = this.boardTexture
    for (const view of this.tiles.values()) {
      const tex = this.tileTextures.get(view.value)
      if (tex) view.sprite.texture = tex
    }
  }

  // ---------- Resize ----------

  resize(cssWidth: number, cssHeight: number, resolution: number) {
    this.app.renderer.resize(Math.round(cssWidth * resolution), Math.round(cssHeight * resolution))
    this.stage.position.set(this.app.renderer.width / 2, this.app.renderer.height / 2)
    this.stage.scale.set(1 / resolution)
    const fit = Math.min(cssWidth, cssHeight) / BOARD_SIZE
    this.boardRoot.scale.set(fit)
  }

  // ---------- Selection ring (§31) ----------

  setCellHoverHandler(fn: ((cell: { x: number; y: number } | null) => void) | null) {
    this.onCellHover = fn
  }

  /** Board-space pointer position, driven from the DOM canvas. */
  pointerMove(boardX: number, boardY: number, inside: boolean) {
    this.ringPointer = inside ? { x: boardX, y: boardY } : null
    const cell = inside ? this.cellAt(boardX, boardY) : null
    if ((cell?.x ?? null) !== (this.currentHoverCell?.x ?? null) || (cell?.y ?? null) !== (this.currentHoverCell?.y ?? null)) {
      this.currentHoverCell = cell
      this.onCellHover?.(cell)
    }
  }

  private cellAt(x: number, y: number): { x: number; y: number } | null {
    const col = Math.floor((x - TILE_GROUP_OFFSET) / STRIDE)
    const row = Math.floor((y - TILE_GROUP_OFFSET) / STRIDE)
    if (col < 0 || col > 3 || row < 0 || row > 3) return null
    return { x: col, y: row }
  }

  showRing() {
    this.ringVisible = true
    if (!this.ring) {
      this.ring = new Sprite(bitmapTexture(this.pack.ring, 3))
      this.ring.anchor.set(0.5)
      this.overlayLayer.addChild(this.ring)
    }
    this.ring.visible = true
  }

  hideRing() {
    this.ringVisible = false
    if (this.ring) this.ring.visible = false
  }

  setRingState(state: RingVisualState) {
    this.ringState = state
    if (this.ring && state === 'selected') {
      this.overlayLayer.addChild(this.ring) // moveToForeground (§31)
    }
  }

  private updateRing(dt: number) {
    if (!this.ring || !this.ringVisible) return
    const target = this.ringPointer ?? (this.ringSprings ? undefined : null)
    if (this.ringPointer) {
      if (!this.ringSprings) {
        this.ringSprings = {
          x: new Spring(this.ring.position.x, this.ringPointer.x, STANDARD_SPRING),
          y: new Spring(this.ring.position.y, this.ringPointer.y, STANDARD_SPRING),
        }
      } else {
        this.ringSprings.x.retarget(this.ringPointer.x)
        this.ringSprings.y.retarget(this.ringPointer.y)
      }
    }
    if (this.ringSprings) {
      this.ring.position.set(this.ringSprings.x.step(dt), this.ringSprings.y.step(dt))
    }
    void target

    // Visual states (§31)
    let scale = 0.975
    let alpha = 0.8
    if (this.ringState === 'valid') {
      scale = 1.07
      alpha = 1
    } else if (this.ringState === 'invalid') {
      scale = 0.975
      alpha = 0.15
    } else if (this.ringState === 'selected') {
      scale = 1.15
      alpha = 1
    }
    // Smooth toward target
    const s = this.ring.scale.x + (scale - this.ring.scale.x) * 0.35
    this.ring.scale.set(s)
    this.ring.alpha += (alpha - this.ring.alpha) * 0.35
  }

  // ---------- Bomb cross field (§38) ----------

  showCrossField() {
    if (this.crossField) return
    this.crossField = new Container()
    this.crossSprites = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const g = new Graphics()
        const p = cellCenter(col, row)
        const arm = 14
        const t = 4
        g.setStrokeStyle({ width: t, color: 0xffffff, alpha: 1 })
        g.moveTo(p.x - arm, p.y - arm)
        g.lineTo(p.x + arm, p.y + arm)
        g.moveTo(p.x + arm, p.y - arm)
        g.lineTo(p.x - arm, p.y + arm)
        g.stroke()
        g.alpha = 0.4
        g.scale.set(0.85)
        this.crossField.addChild(g)
        this.crossSprites.push(g)
      }
    }
    this.overlayLayer.addChild(this.crossField)
  }

  hideCrossField() {
    if (this.crossField) {
      this.crossField.destroy({ children: true })
      this.crossField = null
      this.crossSprites = []
    }
    this.bombHoverCell = null
  }

  setBombHover(cell: { x: number; y: number } | null) {
    this.bombHoverCell = cell
  }

  private updateCrossField() {
    if (!this.crossField) return
    const hover = this.bombHoverCell
    this.crossSprites.forEach((g, i) => {
      const col = i % 4
      const row = Math.floor(i / 4)
      const inZone =
        hover && Math.abs(col - hover.x) <= 1 && Math.abs(row - hover.y) <= 1
      const isCenter = hover && col === hover.x && row === hover.y
      const targetScale = inZone ? 1 : 0.85
      const targetAlpha = !hover ? 0.4 : isCenter ? 1 : inZone ? 0.2 : 0.4
      g.scale.set(g.scale.x + (targetScale - g.scale.x) * 0.35)
      g.alpha += (targetAlpha - g.alpha) * 0.35
    })
  }

  destroy() {
    this.destroyed = true
    if (typeof requestAnimationFrame === 'function') {
      if (this.renderLoop !== null) cancelAnimationFrame(this.renderLoop)
    } else if (this.renderLoop !== null) {
      clearInterval(this.renderLoop)
    }
    try {
      this.app.destroy()
    } catch {
      /* ignore */
    }
  }
}
