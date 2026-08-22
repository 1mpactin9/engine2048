import { Container, Graphics, Text } from 'pixi.js'
import { Spring } from '../physics/spring'
import { clamp01, easeOutBack, mergePulse } from '../physics/easing'
import { FONT_FAMILY, TILE_RADIUS, TILE_SIZE, tileCenter, tileStyle } from '../theme/palette'
import { verticalGradient } from '../theme/gradient'

const HALF = TILE_SIZE / 2
const DROP_SHADOW_DISTANCE = 4
const DROP_SHADOW_ALPHA = 0.1
const HIGHLIGHT_ALPHA = 0.4

const SPAWN_DURATION_MS = 200
const MERGE_DURATION_MS = 200
const GHOST_FADE_MS = 100

export class TileSprite extends Container {
  readonly tileId: number
  readonly value: number

  private shadow = new Graphics()
  private glow = new Graphics()
  private block = new Graphics()
  private textLabel: Text

  private springX: Spring
  private springY: Spring

  private popMode: 'none' | 'spawn' | 'merge' = 'none'
  private popElapsed = 0

  ghost = false
  private ghostElapsed = 0

  constructor(id: number, value: number, x: number, y: number) {
    super()

    this.tileId = id
    this.value = value

    const center = tileCenter(x, y)
    this.springX = new Spring(center.x, center.x)
    this.springY = new Spring(center.y, center.y)
    this.pivot.set(HALF, HALF)

    this.addChild(this.shadow)
    this.addChild(this.glow)
    this.addChild(this.block)

    const style = tileStyle(value)
    this.textLabel = new Text({
      text: String(value),
      style: {
        fontFamily: FONT_FAMILY,
        fontWeight: '700',
        fontSize: style.fontSize,
        fill: style.text,
      },
    })
    this.textLabel.anchor.set(0.5)
    this.addChild(this.textLabel)

    this.draw(style)
    this.position.set(center.x, center.y)
  }

  private draw(style: ReturnType<typeof tileStyle>): void {
    // drop shadow offset downward
    this.shadow.clear()
    this.shadow
      .roundRect(-HALF, -HALF + DROP_SHADOW_DISTANCE, TILE_SIZE, TILE_SIZE, TILE_RADIUS)
      .fill({ color: 0x000000, alpha: DROP_SHADOW_ALPHA })

    // soft glow halo behind the block
    this.glow.clear()
    if (style.glow && style.glowOpacity > 0) {
      this.drawGlow(style.glow, style.glowOpacity, style.glowBlur)
    }

    // block body
    this.block.clear()
    if (style.fill[0] === style.fill[1]) {
      this.block
        .roundRect(-HALF, -HALF, TILE_SIZE, TILE_SIZE, TILE_RADIUS)
        .fill({ color: style.fill[0] })
    } else {
      this.block
        .roundRect(-HALF, -HALF, TILE_SIZE, TILE_SIZE, TILE_RADIUS)
        .fill({ fill: verticalGradient(style.fill[0], style.fill[1]) })
    }

    // top edge highlight bevel
    this.block
      .roundRect(-HALF + 4, -HALF + 2, TILE_SIZE - 8, 2.5, 1.25)
      .fill({ color: 0xffffff, alpha: HIGHLIGHT_ALPHA })
  }

  private drawGlow(glow: readonly [string, string], opacity: number, blur: number): void {
    const layers = 3
    const gradient = verticalGradient(glow[0], glow[1])
    for (let i = 1; i <= layers; i++) {
      const spread = (blur * i) / layers
      const alpha = Math.min((opacity / layers) * (i === layers ? 1.3 : 1), 1)
      this.glow
        .roundRect(-HALF - spread, -HALF - spread, TILE_SIZE + spread * 2, TILE_SIZE + spread * 2, TILE_RADIUS + spread)
        .fill({ fill: gradient, alpha })
    }
  }

  slideTo(x: number, y: number): void {
    const center = tileCenter(x, y)
    this.springX.retarget(center.x)
    this.springY.retarget(center.y)
  }

  snapTo(x: number, y: number): void {
    const center = tileCenter(x, y)
    this.springX.snap(center.x)
    this.springY.snap(center.y)
    this.position.set(center.x, center.y)
  }

  playSpawn(): void {
    this.popMode = 'spawn'
    this.popElapsed = 0
    this.scale.set(0)
  }

  playMerge(): void {
    this.popMode = 'merge'
    this.popElapsed = 0
    this.scale.set(1)
  }

  update(deltaFrames: number): boolean {
    const dtMs = deltaFrames * (1000 / 60)

    const x = this.springX.update(deltaFrames)
    const y = this.springY.update(deltaFrames)
    this.position.set(x, y)

    if (this.popMode === 'spawn') {
      this.popElapsed += dtMs
      const t = clamp01(this.popElapsed / SPAWN_DURATION_MS)
      this.scale.set(easeOutBack(t))
      if (t >= 1) this.popMode = 'none'
    } else if (this.popMode === 'merge') {
      this.popElapsed += dtMs
      const t = clamp01(this.popElapsed / MERGE_DURATION_MS)
      this.scale.set(mergePulse(t))
      if (t >= 1) this.popMode = 'none'
    }

    if (this.ghost && this.springX.settled && this.springY.settled) {
      this.ghostElapsed += dtMs
      this.alpha = clamp01(1 - this.ghostElapsed / GHOST_FADE_MS)
    }

    return (
      this.ghost &&
      this.springX.settled &&
      this.springY.settled &&
      this.ghostElapsed >= GHOST_FADE_MS
    )
  }
}
