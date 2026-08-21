/**
 * Spring solver (spec §19). Deterministic physics integration
 * (stiffness / damping / mass, semi-implicit Euler) with a hard
 * settle clamp so the ~250ms duration equivalents are respected.
 */

export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
  velocity?: number
  /** Hard settle time in ms. */
  duration?: number
}

/** Standard slide/move/recenter spring (§19.2). */
export const STANDARD_SPRING: SpringConfig = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  duration: 250,
}

/** Floating animation spring for rotation arrows (§19.3). */
export const FLOAT_SPRING: SpringConfig = {
  stiffness: 200,
  damping: 7,
  mass: 0.3,
  velocity: 50,
}

export class Spring {
  private value: number
  private velocity: number
  private elapsed: number
  private to: number
  private readonly config: SpringConfig

  constructor(
    from: number,
    to: number,
    config: SpringConfig,
    /** Negative offset starts the spring before "now" (§19.5). */
    elapsed = 0,
    initialVelocity?: number,
  ) {
    this.to = to
    this.config = config
    this.value = from
    this.velocity = initialVelocity ?? config.velocity ?? 0
    this.elapsed = elapsed
  }

  get done(): boolean {
    return this.elapsed >= (this.config.duration ?? Infinity)
  }

  get currentValue(): number {
    return this.value
  }

  /** Advance by dt ms; returns the updated value. */
  step(dt: number): number {
    if (dt <= 0) return this.value
    this.elapsed += dt
    if (this.done) {
      this.value = this.to
      this.velocity = 0
      return this.value
    }
    const { stiffness, damping, mass } = this.config
    // Sub-step for stability at high stiffness
    const steps = Math.max(1, Math.ceil(dt / 8))
    const h = (dt / 1000) / steps
    for (let i = 0; i < steps; i++) {
      const force = -stiffness * (this.value - this.to) - damping * this.velocity
      this.velocity += (force / mass) * h
      this.value += this.velocity * h
    }
    return this.value
  }

  retarget(to: number) {
    this.to = to
    this.elapsed = 0
  }
}
