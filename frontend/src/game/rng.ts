import seedrandom from 'seedrandom'

export interface RngState {
  c: number
  s0: number
  s1: number
  s2: number
}

export class Rng {
  private prng: ReturnType<typeof seedrandom.alea>

  constructor(seed?: string) {
    this.prng = seedrandom.alea(seed ?? createSeed(), { state: true })
  }

  next(): number {
    return this.prng()
  }

  state(): RngState {
    return this.prng.state()
  }

  restore(state: RngState): void {
    this.prng = seedrandom.alea('', { state })
  }
}

function createSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
