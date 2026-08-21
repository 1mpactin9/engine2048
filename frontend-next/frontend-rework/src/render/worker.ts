/**
 * Render worker: owns the PixiJS BoardStage on an OffscreenCanvas (spec §1.1).
 * Receives the canvas + texture pack (transferred ImageBitmaps) on `init`,
 * then serves subsequent calls over the MessageBroker.
 */

import { BoardStage } from './BoardStage'
import { MessageBroker } from './messageBroker'
import type { BoardTheme, GlyphMetrics, TexturePack } from './textures'
import type { MergeEvent, SlideEvent, Tile } from '@/engine/types'

interface InitArgs {
  canvas: OffscreenCanvas
  theme: BoardTheme
  cssWidth: number
  cssHeight: number
  resolution: number
  board: ImageBitmap
  ring: ImageBitmap
  tiles: Record<number, ImageBitmap>
  glyphAtlas: ImageBitmap
  glyphs: GlyphMetrics
}

const broker = new MessageBroker(self as unknown as Worker)
let stage: BoardStage | null = null

broker.expose('init', async (args: InitArgs) => {
  const pack: TexturePack = {
    board: args.board,
    ring: args.ring,
    tiles: args.tiles,
    glyphAtlas: args.glyphAtlas,
    glyphs: args.glyphs,
  }
  stage = new BoardStage()
  await stage.init(args.canvas, {
    pack,
    theme: args.theme,
    cssWidth: args.cssWidth,
    cssHeight: args.cssHeight,
    resolution: args.resolution,
  })
  stage.setCellHoverHandler((cell) => broker.emit('cellHover', cell))
  return true
})

const requireStage = () => {
  if (!stage) throw new Error('stage not initialized')
  return stage
}

broker.expose('setBoard', (tiles: Tile[]) => requireStage().setBoard(tiles))
broker.expose('animateMove', (events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null }) =>
  requireStage().animateMove(events),
)
broker.expose('animatePowerup', (events: { slides: SlideEvent[]; removes: string[]; spawns: Tile[] }) =>
  requireStage().animatePowerup(events),
)
broker.expose('animateUndo', (events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null) =>
  requireStage().animateUndo(events),
)
broker.expose('setTheme', (pack: TexturePack) => {
  requireStage().setTheme(pack)
})
broker.expose('resize', (cssWidth: number, cssHeight: number, resolution: number) =>
  requireStage().resize(cssWidth, cssHeight, resolution),
)
broker.expose('pointerMove', (x: number, y: number, inside: boolean) => requireStage().pointerMove(x, y, inside))
broker.expose('showRing', () => requireStage().showRing())
broker.expose('hideRing', () => requireStage().hideRing())
broker.expose('setRingState', (s: string) => requireStage().setRingState(s as never))
broker.expose('showCrossField', () => requireStage().showCrossField())
broker.expose('hideCrossField', () => requireStage().hideCrossField())
broker.expose('setBombHover', (c: { x: number; y: number } | null) => requireStage().setBombHover(c))
broker.expose('destroy', () => {
  stage?.destroy()
  stage = null
})
