import type { GameState } from '@/engine/types'
import { decodeState, encodeState } from './obfuscate'

/**
 * localStorage persistence (spec §39, §42, §44).
 *
 * Keys:
 *  - gameState / classicGameState / plusGameState : XOR-obfuscated game state per mode (§1.4)
 *  - bestScore / bestScoreClassic / bestScorePlus  : XOR-obfuscated integer string per mode
 *  - midnightTheme                                  : plain boolean flag (§3.3)
 */

export function stateKey(mode: 'standard' | 'classic' | 'plus'): string {
  if (mode === 'classic') return 'classicGameState'
  if (mode === 'plus') return 'plusGameState'
  return 'gameState'
}

export function bestScoreKey(mode: 'standard' | 'classic' | 'plus'): string {
  if (mode === 'classic') return 'bestScoreClassic'
  if (mode === 'plus') return 'bestScorePlus'
  return 'bestScore'
}

function isValidState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (!Array.isArray(s.board) || s.board.length !== 4) return false
  for (const row of s.board) {
    if (!Array.isArray(row) || row.length !== 4) return false
    for (const cell of row) {
      if (cell === null) continue
      if (typeof cell !== 'object' || cell === null) return false
      const t = cell as Record<string, unknown>
      if (typeof t.id !== 'string' || typeof t.value !== 'number' || typeof t.position !== 'object') {
        return false
      }
    }
  }
  return (
    typeof s.id === 'string' &&
    typeof s.moveCount === 'number' &&
    typeof s.score === 'number' &&
    typeof s.powerups === 'object' &&
    typeof s._rng === 'object' &&
    typeof s.highestReachedTile === 'number'
  )
}

/** Read + validate; any taint -> discard, return null (fresh game, §42). */
export function loadState(mode: 'standard' | 'classic' | 'plus'): GameState | null {
  try {
    const raw = localStorage.getItem(stateKey(mode))
    if (!raw) return null
    const decoded = decodeState<GameState>(raw)
    if (!decoded || !isValidState(decoded)) return null
    return decoded
  } catch {
    return null
  }
}

export function saveState(mode: 'standard' | 'classic' | 'plus', state: GameState) {
  try {
    localStorage.setItem(stateKey(mode), encodeState(state))
  } catch {
    // storage full / disabled - game continues in memory
  }
}

export function loadBestScore(mode: 'standard' | 'classic' | 'plus'): number {
  try {
    const raw = localStorage.getItem(bestScoreKey(mode))
    if (!raw) return 0
    const decoded = decodeState<string>(raw)
    if (typeof decoded === 'string') {
      const n = parseInt(decoded, 10)
      if (Number.isFinite(n)) return n
    }
    return 0
  } catch {
    return 0
  }
}

export function saveBestScore(mode: 'standard' | 'classic' | 'plus', score: number) {
  try {
    // XOR-obfuscated integer string (§39)
    localStorage.setItem(bestScoreKey(mode), encodeState(String(score)))
  } catch {
    // ignore
  }
}

export function loadMidnightTheme(): boolean {
  try {
    return localStorage.getItem('midnightTheme') === 'true'
  } catch {
    return false
  }
}

export function saveMidnightTheme(on: boolean) {
  try {
    localStorage.setItem('midnightTheme', String(on))
  } catch {
    // ignore
  }
}
