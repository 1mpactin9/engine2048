import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Direction, MergeEvent, SlideEvent, Tile } from '@/engine/types'
import { mountRenderer } from '@/render/renderClient'
import type { RenderHandle } from '@/render/renderClient'
import { useTheme, pickTheme } from '@/theme'
import { navigate } from '@/router'
import { Modal, PrimaryButton } from './Modal'
import { UndoIcon, SwapIcon } from './icons'

/**
 * Scripted tutorial (spec §46, §47). Bypasses PRNG - each step presents a
 * deterministic board and validates the exact instructional action.
 */

type NumBoard = (number | null)[][]

let idCounter = 0
const tid = () => `t${idCounter++}`

function tilesFromBoard(board: NumBoard): Tile[] {
  const out: Tile[] = []
  board.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v !== null) out.push({ id: tid(), value: v, position: { x, y } })
    }),
  )
  return out
}

function empty(): NumBoard {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null))
}

function place(rows: number[][]): NumBoard {
  const b = empty()
  rows.forEach((row, y) => row.forEach((v, x) => (b[y][x] = v)))
  return b
}

/** Slide + merge on a value board; returns events + resulting board (§25.2). */
function slideValues(
  board: NumBoard,
  dir: Direction,
): { board: NumBoard; slides: SlideEvent[]; merges: MergeEvent[]; changed: boolean } {
  const next = board.map((row) => [...row])
  const slides: SlideEvent[] = []
  const merges: MergeEvent[] = []
  let changed = false

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

  for (const line of lines) {
    const vals: { v: number; x: number; y: number }[] = []
    for (const c of line) {
      const v = next[c.y][c.x]
      if (v !== null) vals.push({ v, x: c.x, y: c.y })
    }
    let target = 0
    let placed: { v: number; merged: boolean } | null = null
    for (const entry of vals) {
      if (placed && placed.v === entry.v && !placed.merged) {
        const dest = line[target - 1]
        next[dest.y][dest.x] = placed.v * 2
        if (entry.x !== dest.x || entry.y !== dest.y) next[entry.y][entry.x] = null
        merges.push({
          consumedIds: [tid(), tid()],
          newTile: { id: tid(), value: placed.v * 2, position: { x: dest.x, y: dest.y } },
          from: [
            { x: dest.x, y: dest.y },
            { x: entry.x, y: entry.y },
          ],
          to: { x: dest.x, y: dest.y },
        })
        changed = true
        placed = { v: placed.v * 2, merged: true }
      } else {
        const dest = line[target]
        if (dest.x !== entry.x || dest.y !== entry.y) {
          next[entry.y][entry.x] = null
          next[dest.y][dest.x] = entry.v
          slides.push({ tileId: tid(), from: { x: entry.x, y: entry.y }, to: { x: dest.x, y: dest.y } })
          changed = true
        }
        placed = { v: entry.v, merged: false }
        target++
      }
    }
  }
  return { board: next, slides, merges, changed }
}

const STEPS = [
  { title: 'Move the tiles', target: null as number | null },
  { title: 'Make a match', target: 4 },
  { title: 'Boom!', target: 8 },
  { title: '4 + 4 = 8', target: 16 },
  { title: 'Need a do-over?', target: null },
  { title: 'Powerups!', target: null },
  { title: "You're Ready", target: null },
]

const STEP_BODIES = [
  null,
  'The tiles all moved in the same direction and a new one appeared. Try moving the 2 and 2 towards each other.',
  'Tiles with the same number join when they touch. Keep going. Can you merge two 4 tiles into an 8?',
  "You're getting the hang of it! Let's increase the difficulty. Merge two 8 tiles into a 16 tile.",
  'If you make mistakes, you can use undo. Try it out!',
  "Undo isn't the only powerup you can use. Try 'Swap Two Tiles'!",
  null,
]

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

export function TutorialPage() {
  const { boardTheme, uiTheme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RenderHandle | null>(null)

  const [step, setStep] = useState(0)
  const boardRef = useRef<NumBoard>(place([[2, null, null, null]]))
  const stepRef = useRef(step)
  stepRef.current = step

  const renderBoard = useCallback((b: NumBoard) => {
    rendererRef.current?.setBoard(tilesFromBoard(b))
  }, [])

  // Mount renderer once.
  useEffect(() => {
    let disposed = false
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement!
    const rect = container.getBoundingClientRect()
    mountRenderer({ theme: boardTheme, canvas, cssWidth: rect.width || 576, cssHeight: rect.height || 576 }).then((h) => {
      if (disposed) {
        void h.destroy()
        return
      }
      rendererRef.current = h
      h.setBoard(tilesFromBoard(boardRef.current))
    })
    return () => {
      disposed = true
      void rendererRef.current?.destroy()
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gotoStep = useCallback(
    (next: number) => {
      setStep(next)
      if (next === 1) boardRef.current = place([[2, 2, null, null]])
      else if (next === 2) boardRef.current = place([[4, 4, null, null]])
      else if (next === 3) boardRef.current = place([[8, 8, null, null]])
      renderBoard(boardRef.current)
    },
    [renderBoard],
  )

  const doMove = useCallback(
    async (dir: Direction) => {
      const s = stepRef.current
      if (s >= 4) return
      const res = slideValues(boardRef.current, dir)
      if (!res.changed) return
      await rendererRef.current?.animateMove(res)
      boardRef.current = res.board
      renderBoard(res.board)

      const target = STEPS[s].target
      if (target !== null) {
        const reached = res.board.some((row) => row.some((v) => v === target))
        if (reached) gotoStep(s + 1)
      } else if (s === 0) {
        gotoStep(1)
      }
    },
    [gotoStep, renderBoard],
  )

  // Keyboard + touch input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up', w: 'up', W: 'up', k: 'up', K: 'up',
        ArrowDown: 'down', s: 'down', S: 'down', j: 'down', J: 'down',
        ArrowLeft: 'left', a: 'left', A: 'left', h: 'left', H: 'left',
        ArrowRight: 'right', d: 'right', D: 'right', l: 'right', L: 'right',
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        void doMove(dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doMove])

  useEffect(() => {
    let sx = 0
    let sy = 0
    let active = false
    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) return
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
      active = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      if (e.changedTouches.length === 0) return
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= 10) return
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      e.stopImmediatePropagation()
      void doMove(dir)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [doMove])

  const useUndo = () => {
    if (stepRef.current === 4) setStep(5)
  }
  const useSwap = () => {
    if (stepRef.current === 5) setStep(6)
  }

  const instruction = useMemo(() => {
    if (step === 0) {
      return isTouch ? 'Swipe in any direction to move the tiles.' : 'Use the arrow keys to move the tiles.'
    }
    return STEP_BODIES[step] ?? ''
  }, [step])

  const completeTutorial = () => {
    localStorage.setItem('tutorialDone', 'true')
    navigate('/')
  }

  return (
    <div
      className={pickTheme(uiTheme, {
        light: 'bg-off-white text-brown flex min-h-[100svh] w-full flex-col items-center justify-center gap-6 px-4',
        plus: 'bg-near-black text-sand flex min-h-[100svh] w-full flex-col items-center justify-center gap-6 px-4',
        midnight: 'bg-midnight-void text-midnight-sand flex min-h-[100svh] w-full flex-col items-center justify-center gap-6 px-4',
      })}
    >
      <h1 className="text-2xl font-bold">{STEPS[step].title}</h1>
      <p className="max-w-md text-center text-sm opacity-80">
        {instruction}
        {step === 0 && !isTouch && (
          <>
            {' '}
            <span className="font-mono">←</span> <span className="font-mono">↑</span>{' '}
            <span className="font-mono">↓</span> <span className="font-mono">→</span>
          </>
        )}
      </p>

      <div className="relative aspect-square w-full max-w-[min(90vw,50vh)]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      </div>

      {(step === 4 || step === 5) && (
        <div className="flex gap-4">
          <button
            onClick={useUndo}
            className="flex items-center gap-2 rounded-lg border border-current/30 px-4 py-2 text-sm font-bold"
          >
            <UndoIcon className="size-5" /> Undo
          </button>
          {step === 5 && (
            <button
              onClick={useSwap}
              className="flex items-center gap-2 rounded-lg border border-current/30 px-4 py-2 text-sm font-bold"
            >
              <SwapIcon className="size-5" /> Swap Two Tiles
            </button>
          )}
        </div>
      )}

      {step === 6 && (
        <Modal title="You're Ready">
          <p>You know how to slide, merge, and use powerups. Go make a 2048!</p>
          <PrimaryButton onClick={completeTutorial}>Start Playing</PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
