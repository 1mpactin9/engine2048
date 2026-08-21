import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { GameEngine } from '@/engine/game'
import type { Direction, GameState, PowerupId, Tile } from '@/engine/types'
import { mountRenderer } from '@/render/renderClient'
import type { RenderHandle } from '@/render/renderClient'
import { buildTexturePack } from '@/render/textures'
import { resolveResolution } from '@/render/geometry'
import { loadBestScore, loadState, saveBestScore, saveState } from '@/persistence/storage'
import { useTheme } from '@/theme'

export type SelectPrompt = string | null

export interface SelectionState {
  powerup: PowerupId
  step: 0 | 1
  firstCell: { x: number; y: number } | null
}

function flatTiles(state: GameState): Tile[] {
  const out: Tile[] = []
  for (const row of state.board) for (const t of row) if (t) out.push(t)
  return out
}

export function useGame(mode: 'standard' | 'classic' | 'plus') {
  const engineRef = useRef<GameEngine | null>(null)
  if (!engineRef.current) {
    const restored = loadState(mode)
    engineRef.current = new GameEngine(mode, undefined, restored ?? undefined)
  }
  const engine = engineRef.current

  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const { boardTheme } = useTheme()

  const [bestScore, setBestScore] = useState(() => loadBestScore(mode))
  const [busy, setBusy] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [showNewGame, setShowNewGame] = useState(false)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [renderReady, setRenderReady] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RenderHandle | null>(null)
  const boardThemeRef = useRef(boardTheme)
  boardThemeRef.current = boardTheme

  // Persist engine state + best score.
  useEffect(() => {
    saveState(mode, engine.state)
  }, [state, mode, engine])

  useEffect(() => {
    if (state.score > bestScore) {
      setBestScore(state.score)
      saveBestScore(mode, state.score)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.score, mode])

  // Mount renderer.
  useEffect(() => {
    let disposed = false
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement!
    const rect = container.getBoundingClientRect()
    mountRenderer({ theme: boardThemeRef.current, canvas, cssWidth: rect.width || 576, cssHeight: rect.height || 576 })
      .then((handle) => {
        if (disposed) {
          void handle.destroy()
          return
        }
        rendererRef.current = handle
        handle.setBoard(flatTiles(engine.state))
        handle.onCellHover((cell) => setHoverCell(cell))
        handle.onCellClick((cell) => {
          if (!cell) return
          clickRef.current(cell)
        })
        setRenderReady(true)
      })
      .catch(() => setRenderReady(false))

    return () => {
      disposed = true
      void rendererRef.current?.destroy()
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Re-theme the renderer in place when the board theme changes.
  useEffect(() => {
    if (!renderReady) return
    let cancelled = false
    buildTexturePack(boardTheme, 3).then((pack) => {
      if (cancelled) return
      void rendererRef.current?.setTheme(pack)
    })
    return () => {
      cancelled = true
    }
  }, [boardTheme, renderReady])

  // Resize observation.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !renderReady) return
    const container = canvas.parentElement!
    const onResize = () => {
      const rect = container.getBoundingClientRect()
      void rendererRef.current?.resize(rect.width, rect.height, resolveResolution(rect.width, window.devicePixelRatio || 1))
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [renderReady, mode])

  // ---- Latest state for event handlers ----
  const clickRef = useRef<(cell: { x: number; y: number }) => void>(() => {})
  const stateRef = useRef(state)
  const selectionRef = useRef(selection)
  const busyRef = useRef(busy)
  stateRef.current = state
  selectionRef.current = selection
  busyRef.current = busy

  const cancelSelection = useCallback(() => {
    engine.cancelSelection()
    setSelection(null)
    rendererRef.current?.hideRing()
    rendererRef.current?.hideCrossField()
  }, [engine])

  // ---- Move ----
  const doMove = useCallback(
    async (dir: Direction) => {
      if (busyRef.current) return
      if (stateRef.current.state === 'gameover' || stateRef.current.state === 'gamewon') return
      if (selectionRef.current) return
      const events = engine.move(dir)
      if (!events) return
      setBusy(true)
      await rendererRef.current?.animateMove(events)
      setBusy(false)
      if (engine.state.state === 'gamewon') return
      if (engine.state.state === 'gameover') {
        // §27: rigid 500ms delay after the spring settles.
        setTimeout(() => setShowGameOver(true), 500)
      }
    },
    [engine],
  )

  // ---- Undo ----
  const undo = useCallback(async () => {
    if (busyRef.current) return
    const events = engine.undo()
    if (!events) return
    setBusy(true)
    setShowGameOver(false)
    await rendererRef.current?.animateUndo(events)
    rendererRef.current?.setBoard(flatTiles(engine.state))
    setBusy(false)
  }, [engine])

  // ---- Powerups ----
  const beginSelecting = useCallback(
    (id: PowerupId) => {
      if (busyRef.current) return
      if (!engine.beginSelecting(id)) return
      setSelection({ powerup: id, step: 0, firstCell: null })
      if (id === 'bomb') rendererRef.current?.showCrossField()
      if (id === 'rotate') {
        // Rotate uses floating arrows instead of a ring.
        rendererRef.current?.hideRing()
      } else {
        rendererRef.current?.showRing()
      }
    },
    [engine],
  )

  const rotate = useCallback(
    async (clockwise: boolean) => {
      if (!selectionRef.current || selectionRef.current.powerup !== 'rotate') return
      const events = engine.applyRotate(clockwise)
      if (!events) return
      setBusy(true)
      await rendererRef.current?.animatePowerup(events)
      rendererRef.current?.setBoard(flatTiles(engine.state))
      setSelection(null)
      setBusy(false)
    },
    [engine],
  )

  const clickCell = useCallback(
    async (cell: { x: number; y: number }) => {
      const sel = selectionRef.current
      if (!sel || busyRef.current) return
      const id = sel.powerup

      if (id === 'rotate') return

      if (id === 'swap') {
        if (sel.step === 0) {
          if (!engine.state.board[cell.y][cell.x]) return
          setSelection({ ...sel, step: 1, firstCell: cell })
        } else {
          const a = sel.firstCell!
          if (a.x === cell.x && a.y === cell.y) return
          const events = engine.applySwap(a, cell)
          if (!events) return
          setBusy(true)
          await rendererRef.current?.animatePowerup(events)
          rendererRef.current?.setBoard(flatTiles(engine.state))
          finishPowerup()
        }
        return
      }

      if (id === 'remove') {
        if (!engine.state.board[cell.y][cell.x]) return
        const events = engine.applyRemoveValue(cell)
        if (!events) return
        setBusy(true)
        await rendererRef.current?.animatePowerup(events)
        rendererRef.current?.setBoard(flatTiles(engine.state))
        finishPowerup()
        return
      }

      if (id === 'teleport') {
        if (sel.step === 0) {
          if (!engine.state.board[cell.y][cell.x]) return
          setSelection({ ...sel, step: 1, firstCell: cell })
        } else {
          const tileCell = sel.firstCell!
          const events = engine.applyTeleport(tileCell, cell)
          if (!events) return
          setBusy(true)
          await rendererRef.current?.animatePowerup(events)
          rendererRef.current?.setBoard(flatTiles(engine.state))
          finishPowerup()
        }
        return
      }

      if (id === 'bomb') {
        const events = engine.applyBomb(cell)
        if (!events) return
        setBusy(true)
        await rendererRef.current?.animatePowerup(events)
        rendererRef.current?.setBoard(flatTiles(engine.state))
        finishPowerup()
      }
    },
    [engine],
  )

  const finishPowerup = useCallback(() => {
    setSelection(null)
    rendererRef.current?.hideRing()
    rendererRef.current?.hideCrossField()
    setBusy(false)
    // Powerup usage may have resolved a game over (rescue).
    if (engine.state.state === 'gameover') setShowGameOver(true)
  }, [engine])

  clickRef.current = clickCell

  // Ring visual state from current selection + hover (§31).
  const ringState = useMemo(() => {
    if (!selection || !hoverCell) return 'idle' as const
    const sel = selection
    const occupied = !!state.board[hoverCell.y]?.[hoverCell.x]
    let valid = false
    switch (sel.powerup) {
      case 'swap':
        valid = occupied && (sel.step === 0 || (sel.firstCell!.x !== hoverCell.x || sel.firstCell!.y !== hoverCell.y))
        break
      case 'remove':
        valid = occupied
        break
      case 'teleport':
        valid = sel.step === 0 ? occupied : !occupied
        break
      case 'bomb':
        valid = true
        break
      default:
        valid = false
    }
    return valid ? 'valid' : 'invalid'
  }, [selection, hoverCell, state.board])

  useEffect(() => {
    if (selection?.powerup === 'bomb') {
      rendererRef.current?.setBombHover(hoverCell)
    }
  }, [hoverCell, selection])

  useEffect(() => {
    rendererRef.current?.setRingState(ringState)
  }, [ringState, renderReady])

  // ---- Keyboard input (§21) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = document.activeElement
      if (target) {
        const el = target as HTMLElement
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      const map: Record<string, Direction> = {
        ArrowUp: 'up', w: 'up', W: 'up', k: 'up', K: 'up',
        ArrowDown: 'down', s: 'down', S: 'down', j: 'down', J: 'down',
        ArrowLeft: 'left', a: 'left', A: 'left', h: 'left', H: 'left',
        ArrowRight: 'right', d: 'right', D: 'right', l: 'right', L: 'right',
      }

      if (e.key === 'Escape') {
        if (selectionRef.current) {
          e.preventDefault()
          cancelSelection()
        }
        return
      }

      if ((e.key === 'n' || e.key === 'N' || e.key === 'r' || e.key === 'R') && !selectionRef.current) {
        // New Game confirmation (§13.4)
        e.preventDefault()
        setShowNewGame(true)
        return
      }

      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        e.stopImmediatePropagation()
        void doMove(dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doMove, cancelSelection])

  // ---- Touch input (§22) ----
  useEffect(() => {
    let startX = 0
    let startY = 0
    let active = false
    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      active = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      if (e.changedTouches.length === 0) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= 10) return
      let dir: Direction
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
      else dir = dy > 0 ? 'down' : 'up'
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

  // ---- New game ----
  const newGame = useCallback(() => {
    engine.reset()
    setShowGameOver(false)
    setShowNewGame(false)
    setSelection(null)
    rendererRef.current?.setBoard(flatTiles(engine.state))
  }, [engine])

  const keepGoing = useCallback(() => {
    engine.keepGoing()
  }, [engine])

  const prompt: SelectPrompt = useMemo(() => {
    if (!selection) return null
    switch (selection.powerup) {
      case 'swap':
        return selection.step === 0 ? 'Choose the first tile' : 'Choose the second tile'
      case 'remove':
        return 'Choose a number'
      case 'teleport':
        return selection.step === 0 ? 'Choose a tile' : 'Pick an empty spot on the board'
      case 'rotate':
        return 'Choose a direction'
      case 'bomb':
        return 'Place the bomb'
      default:
        return null
    }
  }, [selection])

  const showWin = state.state === 'gamewon'
  const selectingPowerup = selection?.powerup ?? null

  return {
    engine,
    state,
    bestScore,
    busy,
    renderReady,
    canvasRef,
    selection,
    selectingPowerup,
    prompt,
    hoverCell,
    showGameOver,
    showWin,
    showNewGame,
    setShowNewGame,
    doMove,
    undo,
    newGame,
    keepGoing,
    beginSelecting,
    cancelSelection,
    clickCell,
    rotate,
  }
}

export type GameController = ReturnType<typeof useGame>
