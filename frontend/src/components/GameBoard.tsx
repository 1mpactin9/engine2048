import { useEffect, useRef } from 'preact/hooks'
import { Game2048 } from '../game/engine'
import type { Direction } from '../game/types'
import { BoardRenderer } from '../canvas/renderers/board-renderer'

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  w: 'up',
  d: 'right',
  s: 'down',
  a: 'left',
  W: 'up',
  D: 'right',
  S: 'down',
  A: 'left',
}

const SWIPE_THRESHOLD = 30

export function GameBoard() {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Game2048 | null>(null)
  const rendererRef = useRef<BoardRenderer | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false

    const engine = new Game2048()
    const renderer = new BoardRenderer()

    engineRef.current = engine
    rendererRef.current = renderer

    const move = (direction: Direction) => {
      const result = engine.move(direction)
      if (result.moved) {
        renderer.reconcile(engine.boardTiles(), engine.ghosts)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTIONS[event.key]
      if (!direction) return
      event.preventDefault()
      move(direction)
    }

    const onPointerDown = (event: PointerEvent) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      const start = pointerStartRef.current
      pointerStartRef.current = null
      if (!start) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return

      if (Math.abs(dx) > Math.abs(dy)) {
        move(dx > 0 ? 'right' : 'left')
      } else {
        move(dy > 0 ? 'down' : 'up')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    host.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)

    renderer.init(host).then(() => {
      if (disposed) {
        renderer.destroy()
        return
      }
      renderer.reconcile(engine.boardTiles(), [])
    })

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      renderer.destroy()
      engineRef.current = null
      rendererRef.current = null
    }
  }, [])

  return <div ref={hostRef} class="board-host" />
}
