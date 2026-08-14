export interface FadeOptions {
  delay?: number;
  duration?: number;
  to?: number;
}

export function fade(el: HTMLElement, opts: FadeOptions = {}): void {
  const from = parseFloat(getComputedStyle(el).opacity);
  const to = opts.to ?? 0;
  const duration = opts.duration ?? 320;
  const delay = opts.delay ?? 0;
  const start = performance.now() + delay;
  const tick = (now: number) => {
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

export function popIn(el: HTMLElement, opts: PopOptions = {}): void {
  const duration = opts.duration ?? 220;
  const peak = opts.scale ?? 1.1;
  const fromOpacity = opts.fromOpacity ?? 0;
  const delay = opts.delay ?? 0;
  const start = performance.now() + delay;
  el.style.opacity = "0";
  el.style.transform = "scale(0.85)";
  const tick = (now: number) => {
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

export function spring(
  from: number,
  to: number,
  opts: SpringOptions = {},
): {
  value(): number;
  done(): boolean;
  step(): number;
} {
  const stiffness = opts.stiffness ?? 0.15;
  const damping = opts.damping ?? 0.8;
  const precision = opts.precision ?? 0.01;
  let value = from;
  let velocity = 0;
  let finished = false;
  return {
    value: () => value,
    done: () => finished,
    step: () => {
      const force = (to - value) * stiffness;
      velocity = (velocity + force) * damping;
      value += velocity;
      if (Math.abs(velocity) < precision && Math.abs(to - value) < precision) {
        value = to;
        velocity = 0;
        finished = true;
      }
      return value;
    },
  };
}
