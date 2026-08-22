import { FillGradient } from 'pixi.js'

const cache = new Map<string, FillGradient>()

export function verticalGradient(top: string, bottom: string): FillGradient {
  const key = `${top}\u0000${bottom}`
  const cached = cache.get(key)
  if (cached) return cached

  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'local',
  })

  cache.set(key, gradient)
  return gradient
}
