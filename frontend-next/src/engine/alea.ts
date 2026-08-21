/**
 * alea PRNG (Johannes Baagøe's implementation, seedrandom-compatible).
 * Deterministic across snapshots; engine state is importable/exportable
 * so a persisted game replays identically (spec §45).
 */

export interface AleaState {
  s0: number
  s1: number
  s2: number
  c: number
}

function mash(): (data: string) => number {
  let n = 0xefc8249d
  return function (data: string): number {
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i)
      let h = 0.02519603282416938 * n
      n = h >>> 0
      h -= n
      h *= n
      n = h >>> 0
      h -= n
      n += h * 0x100000000
    }
    return (n >>> 0) * 2.3283064365386963e-10
  }
}

export class Alea {
  private s0: number
  private s1: number
  private s2: number
  private c: number

  constructor(seed: string, state?: AleaState) {
    if (state) {
      this.s0 = state.s0
      this.s1 = state.s1
      this.s2 = state.s2
      this.c = state.c
      return
    }
    const m = mash()
    this.s0 = m(' ')
    this.s1 = m(' ')
    this.s2 = m(' ')
    this.c = 1
    this.s0 -= m(seed)
    if (this.s0 < 0) this.s0 += 1
    this.s1 -= m(seed)
    if (this.s1 < 0) this.s1 += 1
    this.s2 -= m(seed)
    if (this.s2 < 0) this.s2 += 1
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10
    this.s0 = this.s1
    this.s1 = this.s2
    this.c = t | 0
    this.s2 = t - this.c
    return this.s2
  }

  exportState(): AleaState {
    return { s0: this.s0, s1: this.s1, s2: this.s2, c: this.c }
  }
}
