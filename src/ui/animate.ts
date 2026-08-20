// Spring-physics-driven animation engine.
//
// Replaces the simple CSS `transition: transform 0.12s ease` with a
// frame-time-correct damped spring solver. Two config shapes are supported:
//   - { stiffness, damping, mass, velocity }    // Svelte-style (e.g. Yl popover)
//   - { duration, bounce, velocity }            // popmotion/Pixi style (e.g. Au tile)
//
// Plus thin DOM helpers (fade, popIn) that animate an HTMLElement's opacity
// or scale using the springs above.

export interface SpringPhysicsConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
  precision?: number;
  velocity?: number;
}

export interface SpringPresetConfig {
  duration?: number;
  bounce?: number;
  precision?: number;
  velocity?: number;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  precision: number;
}

const DEFAULT_PRECISION = 0.01;

/**
 * Normalize a config into a fully-specified physics config.
 * Accepts either explicit physics (stiffness/damping/mass) or the
 * popmotion-style { duration, bounce } preset and derives the latter.
 */
export function resolveSpring(
  cfg: SpringPhysicsConfig | SpringPresetConfig,
): SpringConfig {
  const precision = cfg.precision ?? DEFAULT_PRECISION;
  // Use a discriminator on `bounce` (only present in the preset variant)
  // since the preset's `duration` may collide with future physics fields.
  if ("bounce" in cfg && cfg.bounce !== undefined) {
    return deriveSpring(cfg.duration ?? 250, cfg.bounce, precision);
  }
  if ("stiffness" in cfg || "damping" in cfg || "mass" in cfg) {
    return {
      stiffness: cfg.stiffness ?? 0.15,
      damping: cfg.damping ?? 0.8,
      mass: cfg.mass ?? 1,
      precision,
    };
  }
  // Default to the Au tile preset when neither shape is supplied.
  return deriveSpring(250, 0.3, precision);
}

/**
 * Convert a { duration, bounce } preset to { stiffness, damping, mass }.
 *  - duration: time in ms until the spring settles (within precision)
 *  - bounce: 0 = no overshoot (critically damped), 1 = maximally bouncy
 *  - uses popmotion's mapping: zeta = -log(1 - bounce) / PI
 */
export function deriveSpring(
  durationMs: number,
  bounce: number,
  precision: number = DEFAULT_PRECISION,
): SpringConfig {
  const b = Math.max(0, Math.min(1, bounce));
  const zeta = b < 0.05 ? 1.0 : -Math.log(1 - b) / Math.PI;
  // For an underdamped system, the 2% settling time is ~ 4 / (zeta * omega).
  // Aim to settle at ~85% of duration for a "feels done" perceptual finish.
  const settleSec = Math.max(0.04, (durationMs * 0.85) / 1000);
  const omega = (4 / (zeta * settleSec)) * 1.05;
  return {
    stiffness: omega * omega,
    damping: 2 * zeta * omega,
    mass: 1,
    precision,
  };
}

/**
 * A single spring with a target. Semi-implicit Euler integration with the
 * actual frame delta — frame-rate independent.
 */
export class Spring {
  private value: number;
  private velocity: number;
  private target: number;
  readonly from: number;
  private readonly k: number;
  private readonly c: number;
  private readonly m: number;
  private readonly precision: number;
  private finished = false;
  private elapsedMs = 0;

  constructor(from: number, to: number, cfg: SpringConfig) {
    this.from = from;
    this.target = to;
    this.value = from;
    this.velocity = 0;
    this.k = cfg.stiffness;
    this.c = cfg.damping;
    this.m = cfg.mass;
    this.precision = cfg.precision;
  }

  get current(): number {
    return this.value;
  }

  get v(): number {
    return this.velocity;
  }

  get isDone(): boolean {
    return this.finished;
  }

  get currentElapsedMs(): number {
    return this.elapsedMs;
  }

  /** Advance the spring by `dt` seconds. Returns the new value. */
  step(dt: number): number {
    if (this.finished) return this.value;
    this.elapsedMs += dt * 1000;
    const force = this.k * (this.target - this.value);
    const accel = (force - this.c * this.velocity) / this.m;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    if (
      Math.abs(this.velocity) < this.precision &&
      Math.abs(this.target - this.value) < this.precision
    ) {
      this.value = this.target;
      this.velocity = 0;
      this.finished = true;
    }
    return this.value;
  }

  setTarget(target: number): void {
    if (target === this.target) return;
    this.target = target;
    this.finished = false;
  }

  jump(value: number): void {
    this.value = value;
    this.velocity = 0;
    this.finished = true;
  }

  /**
   * Fast-forward the spring by `dt` seconds (positive or negative) without
   * going through rAF. Used to "start" a spring 50ms into its life so a
   * merge-spawn tile can overlap the slide-in.
   */
  fastForward(dt: number): number {
    if (dt === 0) return this.value;
    const sub = 1 / 240;
    let advanced = 0;
    const sign = dt > 0 ? 1 : -1;
    const total = Math.abs(dt);
    while (advanced < total && !this.finished) {
      this.step(sign * sub);
      advanced += sub;
    }
    return this.value;
  }
}

// ----- Multi-spring runner -------------------------------------------------

interface ScheduledSpring {
  spring: Spring;
  onUpdate: (v: number) => void;
}

/**
 * Runs one or more springs on a single rAF tick. All springs share the same
 * delta per frame so they stay in lock-step. The loop ends when every
 * spring reports done, or `stop()` is called.
 */
export class SpringRunner {
  private items: ScheduledSpring[] = [];
  private rafId: number | null = null;
  private lastT: number | null = null;
  private onComplete: (() => void) | null = null;

  add(spring: Spring, onUpdate: (v: number) => void): void {
    this.items.push({ spring, onUpdate });
  }

  /**
   * Start the rAF loop. If `elapsedOffsetMs` is negative, every spring
   * is fast-forwarded by that many ms (e.g. -50 → start 50ms in). This
   * mirrors the `elapsed: -50` behavior in the source's Au config.
   */
  start(elapsedOffsetMs = 0, onComplete?: () => void): void {
    if (this.rafId !== null) return;
    if (elapsedOffsetMs !== 0) {
      for (const { spring, onUpdate } of this.items) {
        spring.fastForward(elapsedOffsetMs / 1000);
        onUpdate(spring.current);
      }
    }
    this.onComplete = onComplete ?? null;
    this.lastT = null;
    const tick = (t: number): void => {
      if (this.lastT === null) this.lastT = t;
      const dt = Math.min(0.064, (t - this.lastT) / 1000);
      this.lastT = t;
      let allDone = true;
      for (const { spring, onUpdate } of this.items) {
        if (!spring.isDone) {
          spring.step(dt);
          onUpdate(spring.current);
        }
        if (!spring.isDone) allDone = false;
      }
      if (allDone) {
        this.rafId = null;
        this.onComplete?.();
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

// ----- DOM helpers (drop-in for the old fade/popIn/spring) -----------------

export interface FadeOptions {
  delay?: number;
  duration?: number;
  to?: number;
}

/** Fade an element to a target opacity using a CSS ease (kept for compat). */
export function fade(el: HTMLElement, opts: FadeOptions = {}): void {
  const from = parseFloat(getComputedStyle(el).opacity);
  const to = opts.to ?? 0;
  if (from === to) return;
  const duration = opts.duration ?? 320;
  const delay = opts.delay ?? 0;
  const start = performance.now() + delay;
  const tick = (now: number): void => {
    if (now < start) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.style.opacity = String(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface PopOptions {
  delay?: number;
  duration?: number;
  scale?: number;
  fromOpacity?: number;
}

/** Pop an element in (scale 0.85→1, opacity 0→1) with overshoot. */
export function popIn(el: HTMLElement, opts: PopOptions = {}): void {
  const duration = opts.duration ?? 220;
  const peak = opts.scale ?? 1.1;
  const fromOpacity = opts.fromOpacity ?? 0;
  const delay = opts.delay ?? 0;
  const start = performance.now() + delay;
  el.style.opacity = "0";
  el.style.transform = "scale(0.85)";
  const tick = (now: number): void => {
    if (now < start) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    const back = 1.70158;
    const eased =
      1 +
      ((peak - 1) * (t - 1) * (t - 1) * ((back + 1) * (t - 1) + back) +
        (t - 1) * (t - 1));
    const scale = 0.85 + (1 - 0.85) * eased;
    el.style.opacity = String(
      fromOpacity + (1 - fromOpacity) * Math.min(1, t * 1.3),
    );
    el.style.transform = `scale(${Math.max(0.001, scale)})`;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  precision?: number;
}

/** Legacy single-spring helper. Kept for API compatibility. */
export function spring(
  from: number,
  to: number,
  opts: SpringOptions = {},
): { value(): number; done(): boolean; step(): number } {
  const cfg = resolveSpring(opts);
  const s = new Spring(from, to, cfg);
  return {
    value: () => s.current,
    done: () => s.isDone,
    step: () => s.step(1 / 60),
  };
}

// ----- Yl / Kl / Au presets (named for parity with the source) ------------

/**
 * Yl — popover slide-in.
 *  - stiffness 200, damping 7, mass 0.3, velocity 50, duration 800ms
 *  - alters translateY by `range` (default -70px) → 0 with a spring bounce
 */
export const YL = {
  stiffness: 200,
  damping: 7,
  mass: 0.3,
  velocity: 50,
  durationMs: 800,
} as const;

/**
 * Kl — modal/dialog pop-in.
 *  - duration 350ms, bounce 0.3
 *  - fades in (opacity 0→1) while scaling 0→1 and translating on Y-axis
 */
export const KL = {
  duration: 350,
  bounce: 0.3,
} as const;

/**
 * Au — tile animation preset.
 *  - duration 250ms, bounce 0.3
 *  - used for tile slide, merge, spawn, unspawn
 */
export const AU = {
  duration: 250,
  bounce: 0.3,
} as const;

// ----- Reduced motion -----------------------------------------------------

/**
 * Returns true when the user has expressed a preference for reduced motion
 * via OS settings. Callers can use this to skip the spring and snap to the
 * end state for accessibility.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
