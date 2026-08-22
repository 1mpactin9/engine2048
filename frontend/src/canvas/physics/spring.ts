export interface SpringConfig {
  stiffness: number
  damping: number
  precision: number
  maxDurationMs: number
}

export const SLIDE_SPRING: SpringConfig = {
  stiffness: 0.15,
  damping: 0.8,
  precision: 0.01,
  maxDurationMs: 250,
}

export class Spring {
  private current: number
  private previous: number
  private target: number
  private config: SpringConfig
  private elapsedMs = 0
  settled = false

  constructor(value: number, target: number, config: SpringConfig = SLIDE_SPRING) {
    this.current = value
    this.previous = value
    this.target = target
    this.config = config
  }

  retarget(target: number): void {
    this.target = target
    this.previous = this.current
    this.elapsedMs = 0
    this.settled = false
  }

  snap(target: number): void {
    this.target = target
    this.current = target
    this.previous = target
    this.elapsedMs = 0
    this.settled = true
  }

  update(deltaFrames: number): number {
    if (this.settled) return this.target

    const { stiffness, damping, precision, maxDurationMs } = this.config
    const dt = deltaFrames > 0 ? deltaFrames : 0

    const displacement = this.target - this.current
    const velocity = dt > 0 ? (this.current - this.previous) / dt : 0
    const delta = (velocity + (stiffness * displacement - damping * velocity)) * dt
    const next = this.current + delta

    this.elapsedMs += dt * (1000 / 60)

    if (Math.abs(delta) < precision && Math.abs(displacement) < precision) {
      this.current = this.target
      this.previous = this.target
      this.settled = true
      return this.target
    }

    if (this.elapsedMs >= maxDurationMs) {
      this.current = this.target
      this.previous = this.target
      this.settled = true
      return this.target
    }

    this.previous = this.current
    this.current = next
    this.settled = false
    return next
  }
}
