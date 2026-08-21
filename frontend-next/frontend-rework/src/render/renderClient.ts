/**
 * RenderClient: main-thread facade over the renderer (spec §1.1).
 * Tries OffscreenCanvas + WebWorker offloading first; falls back to
 * main-thread rendering where unsupported or on init failure.
 */

import { BoardStage } from './BoardStage'
import { MessageBroker } from './messageBroker'
import { resolveResolution } from './geometry'
import type { BoardTheme, TexturePack } from './textures'
import { buildTexturePack } from './textures'
import type { MergeEvent, SlideEvent, Tile } from '@/engine/types'
import { BOARD_SIZE, STRIDE, TILE_GROUP_OFFSET } from './geometry'

export interface RenderHandle {
  setBoard(tiles: Tile[]): Promise<void> | void
  animateMove(events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null }): Promise<void>
  animatePowerup(events: { slides: SlideEvent[]; removes: string[]; spawns: Tile[] }): Promise<void>
  animateUndo(events: { slides: SlideEvent[]; merges: MergeEvent[]; spawn: Tile | null } | null): Promise<void>
  setTheme(pack: TexturePack): Promise<void> | void
  resize(cssWidth: number, cssHeight: number, resolution: number): Promise<void> | void
  pointerMove(x: number, y: number, inside: boolean): Promise<void> | void
  showRing(): void
  hideRing(): void
  setRingState(s: 'idle' | 'valid' | 'invalid' | 'selected'): void
  showCrossField(): void
  hideCrossField(): void
  setBombHover(c: { x: number; y: number } | null): void
  onCellHover(fn: (cell: { x: number; y: number } | null) => void): void
  onCellClick(fn: (cell: { x: number; y: number } | null) => void): void
  destroy(): Promise<void> | void
  mode: 'worker' | 'local'
}

export function canUseWorker(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    'OffscreenCanvas' in window &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  )
}

async function buildPack(theme: BoardTheme): Promise<TexturePack> {
  return buildTexturePack(theme, 3)
}

interface MountOpts {
  theme: BoardTheme
  canvas: HTMLCanvasElement
  cssWidth: number
  cssHeight: number
}

export async function mountRenderer(opts: MountOpts): Promise<RenderHandle> {
  const resolution = resolveResolution(opts.cssWidth, window.devicePixelRatio || 1)

  if (canUseWorker()) {
    try {
      const handle = await mountWorker(opts, resolution)
      return handle
    } catch {
      // fall through to local
    }
  }
  return mountLocal(opts, resolution)
}

async function mountWorker(opts: MountOpts, resolution: number): Promise<RenderHandle> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const broker = new MessageBroker(worker)
  const pack = await buildPack(opts.theme)
  const offscreen = opts.canvas.transferControlToOffscreen()

  await broker.call('init', {
    canvas: offscreen,
    theme: opts.theme,
    cssWidth: opts.cssWidth,
    cssHeight: opts.cssHeight,
    resolution,
    ...pack,
  })

  let clickHandler: ((cell: { x: number; y: number } | null) => void) | null = null
  const pointer = attachCanvasPointer(opts.canvas, opts, {
    move: (x, y, inside) => broker.call('pointerMove', x, y, inside),
    click: (cell) => clickHandler?.(cell),
  })

  return {
    mode: 'worker',
    setBoard: (tiles) => broker.call('setBoard', tiles),
    animateMove: (events) => broker.call('animateMove', events),
    animatePowerup: (events) => broker.call('animatePowerup', events),
    animateUndo: (events) => broker.call('animateUndo', events),
    setTheme: (pack2) => broker.call('setTheme', pack2),
    resize: (w, h, r) => broker.call('resize', w, h, r),
    pointerMove: (x, y, inside) => broker.call('pointerMove', x, y, inside),
    showRing: () => broker.call('showRing'),
    hideRing: () => broker.call('hideRing'),
    setRingState: (s) => broker.call('setRingState', s),
    showCrossField: () => broker.call('showCrossField'),
    hideCrossField: () => broker.call('hideCrossField'),
    setBombHover: (c) => broker.call('setBombHover', c),
    onCellHover: (fn) => {
      broker.addListener('cellHover', (cell) => fn(cell as { x: number; y: number } | null))
    },
    onCellClick: (fn) => {
      clickHandler = fn
    },
    destroy: async () => {
      pointer.detach()
      await broker.call('destroy')
      worker.terminate()
    },
  }
}

async function mountLocal(opts: MountOpts, resolution: number): Promise<RenderHandle> {
  const pack = await buildPack(opts.theme)
  const stage = new BoardStage()
  await stage.init(opts.canvas, {
    pack,
    theme: opts.theme,
    cssWidth: opts.cssWidth,
    cssHeight: opts.cssHeight,
    resolution,
  })
  let clickHandler: ((cell: { x: number; y: number } | null) => void) | null = null

  const pointerHandlers = attachCanvasPointer(opts.canvas, opts, {
    move: (x, y, inside) => stage.pointerMove(x, y, inside),
    click: (cell) => clickHandler?.(cell),
  })

  return {
    mode: 'local',
    setBoard: (tiles) => stage.setBoard(tiles),
    animateMove: (events) => stage.animateMove(events),
    animatePowerup: (events) => stage.animatePowerup(events),
    animateUndo: (events) => stage.animateUndo(events),
    setTheme: (pack2) => stage.setTheme(pack2),
    resize: (w, h, r) => stage.resize(w, h, r),
    pointerMove: (x, y, inside) => stage.pointerMove(x, y, inside),
    showRing: () => stage.showRing(),
    hideRing: () => stage.hideRing(),
    setRingState: (s) => stage.setRingState(s),
    showCrossField: () => stage.showCrossField(),
    hideCrossField: () => stage.hideCrossField(),
    setBombHover: (c) => stage.setBombHover(c),
    onCellHover: (fn) => stage.setCellHoverHandler(fn),
    onCellClick: (fn) => {
      clickHandler = fn
    },
    destroy: () => {
      pointerHandlers.detach()
      stage.destroy()
    },
  }
}

function attachCanvasPointer(
  canvas: HTMLCanvasElement,
  opts: MountOpts,
  handlers: {
    move: (x: number, y: number, inside: boolean) => void
    click: (cell: { x: number; y: number } | null) => void
  },
) {
  const fit = Math.min(opts.cssWidth, opts.cssHeight) / BOARD_SIZE
  const toBoard = (e: MouseEvent | PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    return {
      x: (cssX - rect.width / 2) / fit,
      y: (cssY - rect.height / 2) / fit,
      inside: cssX >= 0 && cssX <= rect.width && cssY >= 0 && cssY <= rect.height,
    }
  }
  const cellFromBoard = (x: number, y: number, inside: boolean) => {
    if (!inside) return null
    const col = Math.floor((x - TILE_GROUP_OFFSET) / STRIDE)
    const row = Math.floor((y - TILE_GROUP_OFFSET) / STRIDE)
    if (col < 0 || col > 3 || row < 0 || row > 3) return null
    return { x: col, y: row }
  }
  const onMove = (e: PointerEvent) => {
    const b = toBoard(e)
    handlers.move(b.x, b.y, b.inside)
  }
  const onLeave = () => handlers.move(0, 0, false)
  const onClick = (e: MouseEvent) => {
    const b = toBoard(e)
    handlers.click(cellFromBoard(b.x, b.y, b.inside))
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onClick)
  return {
    detach: () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
    },
  }
}
