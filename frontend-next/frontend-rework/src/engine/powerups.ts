import type { Mode, PowerupId, PowerupInventory } from './types'

/**
 * Powerup definitions and per-mode inventory (spec §29).
 * "Merge Any Two Adjacent Tiles" does not exist in any mode (spec §34).
 */

export interface PowerupDef {
  id: PowerupId
  /** Order in the powerup bar / inventory (§29.1). */
  order: number
  /** Thresholds that accrue this powerup on natural merge (§29.3). */
  accruesAt: number[]
}

export const POWERUP_DEFS: Record<PowerupId, PowerupDef> = {
  undo: { id: 'undo', order: 0, accruesAt: [128] },
  teleport: { id: 'teleport', order: 1, accruesAt: [256] },
  swap: { id: 'swap', order: 2, accruesAt: [256] },
  rotate: { id: 'rotate', order: 3, accruesAt: [256] },
  remove: { id: 'remove', order: 4, accruesAt: [512] },
  bomb: { id: 'bomb', order: 5, accruesAt: [512] },
}

/** Starting inventory per mode (§29.1). Classic has none. */
export function startingInventory(mode: Mode): PowerupInventory {
  if (mode === 'classic' || mode === 'tutorial') return {}
  if (mode === 'standard') {
    return {
      undo: { usesRemaining: 2, usesCount: 0 },
      swap: { usesRemaining: 1, usesCount: 0 },
      remove: { usesRemaining: 0, usesCount: 0 },
    }
  }
  return {
    undo: { usesRemaining: 2, usesCount: 0 },
    teleport: { usesRemaining: 1, usesCount: 0 },
    swap: { usesRemaining: 1, usesCount: 0 },
    rotate: { usesRemaining: 1, usesCount: 0 },
    remove: { usesRemaining: 0, usesCount: 0 },
    bomb: { usesRemaining: 0, usesCount: 0 },
  }
}

/** Hard capacity per powerup (§29.2). */
export const POWERUP_CAPACITY = 2

/** Rescue-capable powerups for the Game Over modal (§28). */
export const RESCUE_POWERUPS: PowerupId[] = ['undo', 'bomb']

/**
 * Accrual thresholds: strictly only the listed powerups for each tile value,
 * gated to slots the active mode's inventory actually has (§29.3).
 */
export function accrualFor(tileValue: number, inventory: PowerupInventory): Partial<Record<PowerupId, number>> {
  const granted: PowerupId[] =
    tileValue === 128
      ? ['undo']
      : tileValue === 256
        ? ['swap', 'teleport', 'rotate']
        : tileValue === 512
          ? ['remove', 'bomb']
          : []
  const result: Partial<Record<PowerupId, number>> = {}
  for (const id of granted) {
    if (inventory[id] !== undefined) result[id] = 1
  }
  return result
}
