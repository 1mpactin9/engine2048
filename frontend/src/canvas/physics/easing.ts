export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// scale 0 -> 1 with a slight overshoot, for the spawn pop
export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

// scale 1 -> 1.15 -> 1, for the merge pop
export function mergePulse(t: number): number {
  return 1 + 0.15 * Math.sin(Math.PI * t)
}
