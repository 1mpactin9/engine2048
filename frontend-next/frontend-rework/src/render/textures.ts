/**
 * SVG texture generation + rasterization (spec §6, §7, §8).
 *
 * Runs on the main thread only (needs Image for SVG decoding);
 * the resulting ImageBitmaps are transferred into the render
 * worker when one is active.
 */

import { BOARD_RX, BOARD_SIZE, CELL_INNER_SIZE, CELL_RX, TILE_SIZE, cellInnerRect } from './geometry'

export type BoardTheme = 'light' | 'plus' | 'midnight'

// ---------- Tile palettes (spec §7.2 / §7.3) ----------

interface TileSpec {
  base: [string, string]
  glow?: { stops: [string, string]; opacity: number; blur: number }
}

const LIGHT_TILES: Record<number, TileSpec> = {
  2: { base: ['#ECE4DB', '#ECE4DB'] },
  4: { base: ['#E8D8BA', '#E8D8BA'] },
  8: { base: ['#E9B582', '#E6AF79'] },
  16: { base: ['#E99A6D', '#E79362'] },
  32: { base: ['#E8886E', '#E57A5D'] },
  64: { base: ['#E67051', '#E26240'] },
  128: { base: ['#EBD47F', '#EDCF64'] },
  256: { base: ['#EBD47F', '#EDCF64'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.16, blur: 2.25 } },
  512: { base: ['#EBD47F', '#EDCF64'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.33, blur: 2.5 } },
  1024: { base: ['#EBD47F', '#EDCF64'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.5, blur: 2.75 } },
  2048: { base: ['#EFDB94', '#ECD069'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 1.0, blur: 3.0 } },
  4096: { base: ['#E8B562', '#E29A4F'], glow: { stops: ['#F0C468', '#E29A4F'], opacity: 1.0, blur: 3.0 } },
  8192: { base: ['#E08750', '#D9713C'], glow: { stops: ['#E89660', '#D9713C'], opacity: 1.0, blur: 3.0 } },
  16384: { base: ['#D9653F', '#C94A32'], glow: { stops: ['#DD7047', '#C94A32'], opacity: 1.0, blur: 3.0 } },
  32768: { base: ['#C43F32', '#A82E28'], glow: { stops: ['#CC4A3A', '#A82E28'], opacity: 1.0, blur: 3.0 } },
  65536: { base: ['#8F2A28', '#6E1F20'], glow: { stops: ['#9C332F', '#6E1F20'], opacity: 1.0, blur: 3.0 } },
  131072: { base: ['#2E1613', '#1C0E0C'], glow: { stops: ['#7A2620', '#4A1613'], opacity: 1.0, blur: 3.0 } },
}

const DARK_TILES: Record<number, TileSpec> = {
  2: { base: ['#3A3833', '#3A3833'] },
  4: { base: ['#4A4430', '#4A4430'] },
  8: { base: ['#C68A54', '#C08249'] },
  16: { base: ['#C77347', '#C46C3D'] },
  32: { base: ['#C66450', '#C25640'] },
  64: { base: ['#C44E33', '#C0431F'] },
  128: { base: ['#CBAF54', '#CDA93A'] },
  256: { base: ['#CBAF54', '#CDA93A'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.16, blur: 2.25 } },
  512: { base: ['#CBAF54', '#CDA93A'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.33, blur: 2.5 } },
  1024: { base: ['#CBAF54', '#CDA93A'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 0.5, blur: 2.75 } },
  2048: { base: ['#CFB964', '#CCAC3F'], glow: { stops: ['#FCDB69', '#EEC450'], opacity: 1.0, blur: 3.0 } },
  4096: { base: ['#C6913C', '#C0762F'], glow: { stops: ['#F0C468', '#E29A4F'], opacity: 1.0, blur: 3.0 } },
  8192: { base: ['#BE6330', '#B7511C'], glow: { stops: ['#E89660', '#D9713C'], opacity: 1.0, blur: 3.0 } },
  16384: { base: ['#B7411F', '#A72612'], glow: { stops: ['#DD7047', '#C94A32'], opacity: 1.0, blur: 3.0 } },
  32768: { base: ['#A21F12', '#862008'], glow: { stops: ['#CC4A3A', '#A82E28'], opacity: 1.0, blur: 3.0 } },
  65536: { base: ['#6D160E', '#4C0D08'], glow: { stops: ['#9C332F', '#6E1F20'], opacity: 1.0, blur: 3.0 } },
  131072: { base: ['#1A0A08', '#0E0605'], glow: { stops: ['#7A2620', '#4A1613'], opacity: 1.0, blur: 3.0 } },
}

/** Off-scale overflow neutral (spec §7.2). */
const OVERFLOW_SPEC: TileSpec = { base: ['#403A31', '#312C26'] }

export function tileSpec(value: number, theme: BoardTheme): TileSpec {
  const table = theme === 'light' ? LIGHT_TILES : DARK_TILES
  return table[value] ?? OVERFLOW_SPEC
}

/** Tile text color (spec §9). */
export function tileTextColor(value: number): string {
  if (value <= 4) return '#756452'
  if (value <= 2048) return '#FFFFFF'
  return '#C4BDB7'
}

/** Bevel opacity: 0.1 at tile 2 -> 0.4 at 2048, capped above (spec §8). */
export function bevelOpacity(value: number): number {
  const values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]
  const idx = values.findIndex((v) => v === value)
  if (idx === -1) return 0.4
  return 0.1 + (0.3 * idx) / (values.length - 1)
}

// ---------- Board palettes (spec §6) ----------

const BOARD_PALETTES: Record<BoardTheme, { outer: [string, string]; cell: string }> = {
  light: { outer: ['#998C7E', '#988776'], cell: '#BAAC9A' },
  plus: { outer: ['#54514A', '#504C44'], cell: '#6B665B' },
  midnight: { outer: ['#232322', '#1A1A19'], cell: '#2A2A28' },
}

// ---------- SVG builders ----------

/** Padding around the tile so glow blur spills inside the raster. */
const TILE_PAD = 10
export const TILE_TEXTURE_SIZE = TILE_SIZE + TILE_PAD * 2 // 132

function tileSvg(value: number, theme: BoardTheme): string {
  const spec = tileSpec(value, theme)
  const size = TILE_SIZE
  const pad = TILE_PAD
  const total = size + pad * 2
  const bevel = bevelOpacity(value)
  let glow = ''
  if (spec.glow) {
    const g = spec.glow
    glow = `
  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${g.stops[0]}"/>
    <stop offset="1" stop-color="${g.stops[1]}"/>
  </linearGradient>
  <filter id="glowF" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="${g.blur}"/>
  </filter>
  <rect x="${pad - 6}" y="${pad - 6}" width="${size + 12}" height="${size + 12}" rx="18"
        fill="url(#gl)" filter="url(#glowF)" opacity="${g.opacity}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${spec.base[0]}"/>
      <stop offset="1" stop-color="${spec.base[1]}"/>
    </linearGradient>
    <filter id="bevelF" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="erode" radius="3" result="eroded"/>
      <feGaussianBlur in="eroded" stdDeviation="2" result="hardAlpha"/>
      <feComposite in="SourceAlpha" in2="hardAlpha" operator="arithmetic" k1="0" k2="-1" k3="1" k4="0" result="band"/>
      <feComposite in="band" in2="SourceAlpha" operator="in" result="bandIn"/>
      <feFlood flood-color="#FFFFFF" flood-opacity="${bevel}" result="flood"/>
      <feComposite in="flood" in2="bandIn" operator="in"/>
    </filter>
  </defs>${glow}
  <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="12" fill="url(#bg)"/>
  <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="12" fill="#FFFFFF" filter="url(#bevelF)"/>
</svg>`
}

function boardSvg(theme: BoardTheme): string {
  const p = BOARD_PALETTES[theme]
  const cells: string[] = []
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) {
      const { x, y } = cellInnerRect(col, row)
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL_INNER_SIZE}" height="${CELL_INNER_SIZE}" rx="${CELL_RX}" fill="${p.cell}"/>`,
      )
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_SIZE}" height="${BOARD_SIZE}" viewBox="0 0 ${BOARD_SIZE} ${BOARD_SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.outer[0]}"/>
      <stop offset="1" stop-color="${p.outer[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${BOARD_SIZE}" height="${BOARD_SIZE}" rx="${BOARD_RX}" fill="url(#bg)"/>
  ${cells.join('\n  ')}
</svg>`
}

/** Selection ring: 162x162 white ring with red-tinted drop shadow (spec §31). */
function ringSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="162" height="162" viewBox="0 0 162 162">
  <defs>
    <filter id="ds" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#D84F4D" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="81" cy="81" r="74" fill="none" stroke="#FFFFFF" stroke-width="9" filter="url(#ds)"/>
</svg>`
}

// ---------- Rasterization ----------

export function svgToImageBitmap(svg: string, width: number, height: number, resolution: number): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * resolution)
      canvas.height = Math.round(height * resolution)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.transferToImageBitmap())
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG rasterization failed'))
    }
    img.src = url
  })
}

// ---------- Glyph atlas (spec §1.3: base 100px, range 4px) ----------

export interface GlyphMetrics {
  chars: string
  /** Per-char placement info in atlas (100px base) units. */
  entries: Record<
    string,
    { u: number; v: number; w: number; h: number; left: number; top: number; advance: number; ascent: number; descent: number }
  >
  atlasWidth: number
  atlasHeight: number
  fontSize: number
}

export interface TexturePack {
  board: ImageBitmap
  ring: ImageBitmap
  tiles: Record<number, ImageBitmap>
  glyphAtlas: ImageBitmap
  glyphs: GlyphMetrics
}

export const TILE_VALUES = [
  2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072,
]

export async function buildTexturePack(theme: BoardTheme, resolution = 3): Promise<TexturePack> {
  const [board, ring, ...tiles] = await Promise.all([
    svgToImageBitmap(boardSvg(theme), BOARD_SIZE, BOARD_SIZE, resolution),
    svgToImageBitmap(ringSvg(), 162, 162, resolution),
    ...TILE_VALUES.map((v) => svgToImageBitmap(tileSvg(v, theme), TILE_TEXTURE_SIZE, TILE_TEXTURE_SIZE, resolution)),
  ])
  const tileMap: Record<number, ImageBitmap> = {}
  TILE_VALUES.forEach((v, i) => {
    tileMap[v] = tiles[i]
  })
  const { bitmap, metrics } = await buildGlyphAtlas()
  return { board, ring, tiles: tileMap, glyphAtlas: bitmap, glyphs: metrics }
}

async function buildGlyphAtlas(): Promise<{ bitmap: ImageBitmap; metrics: GlyphMetrics }> {
  // Wait for the font to be usable before rasterizing glyphs.
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.load('700 100px Rubik')
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    // proceed with whatever fallback face is available
  }
  const { default: TinySDF } = await import('tiny-sdf')
  const fontSize = 100 // spec §1.3: base atlas font size
  const radius = 4 // spec §1.3: distance-field range
  const buffer = 16
  const sdf = new TinySDF(fontSize, buffer, radius, 0.25, 'Rubik')
  // tiny-sdf v1 has no weight option - set the canvas font directly.
  sdf.ctx.font = '700 100px Rubik'
  sdf.ctx.fillStyle = '#000'

  // Metrics canvas (advance + ink bounds per glyph).
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = '700 100px Rubik'

  const chars = '0123456789k'
  const cell = fontSize + buffer * 2
  const entries: GlyphMetrics['entries'] = {}
  const cells: { char: string; img: ImageBitmap; left: number; top: number; advance: number; ascent: number; descent: number }[] = []

  for (const ch of chars) {
    const imgData = sdf.draw(ch) as ImageData
    const m = measure.measureText(ch)
    const advance = m.width
    const abbl = m.actualBoundingBoxLeft ?? 0
    const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.72
    const descent = m.actualBoundingBoxDescent ?? 0
    // Steep smoothstep on the distance field: alpha texture, white RGB for tinting.
    const { width, height, data } = imgData
    const out = new ImageData(width, height)
    for (let i = 0; i < width * height; i++) {
      const f = data[i * 4]
      const a = Math.max(0, Math.min(255, Math.round(((f - 88) / 80) * 255)))
      out.data[i * 4] = 255
      out.data[i * 4 + 1] = 255
      out.data[i * 4 + 2] = 255
      out.data[i * 4 + 3] = a
    }
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    c.getContext('2d')!.putImageData(out, 0, 0)
    // Placement: pen origin sits at (buffer, middle) inside the tiny-sdf canvas.
    cells.push({
      char: ch,
      img: c.transferToImageBitmap(),
      left: buffer - abbl,
      top: sdf.middle,
      advance,
      ascent,
      descent,
    })
  }

  const atlasWidth = cell * chars.length
  const atlasHeight = cell
  const canvas = document.createElement('canvas')
  canvas.width = atlasWidth
  canvas.height = atlasHeight
  const ctx = canvas.getContext('2d')!
  cells.forEach((c, i) => {
    ctx.drawImage(c.img, i * cell, 0)
    entries[c.char] = {
      u: i * cell,
      v: 0,
      w: cell,
      h: cell,
      left: c.left,
      top: c.top,
      advance: c.advance,
      ascent: c.ascent,
      descent: c.descent,
    }
  })
  return {
    bitmap: canvas.transferToImageBitmap(),
    metrics: { chars, entries, atlasWidth, atlasHeight, fontSize },
  }
}
