export const BOARD_SIZE = 492
export const BOARD_MARGIN = 28
export const STAGE_SIZE = BOARD_SIZE + BOARD_MARGIN * 2
export const CELL_STEP = 120
export const CELL_SIZE = 108
export const TILE_SIZE = 112
export const CELL_RADIUS = 10
export const TILE_RADIUS = 12
export const BOARD_RADIUS = 22

export const FONT_FAMILY = 'Rubik, Arial, sans-serif'

export const LIGHT_BOARD_GRADIENT: readonly [string, string] = ['#998C7E', '#988776']
export const LIGHT_EMPTY_CELL = '#BAAC9A'
export const DARK_BOARD_GRADIENT: readonly [string, string] = ['#54514A', '#504C44']
export const DARK_EMPTY_CELL = '#6B665B'

export interface TileStyle {
  fill: readonly [string, string]
  glow: readonly [string, string] | null
  glowOpacity: number
  glowBlur: number
  text: string
  fontSize: number
}

interface StyleEntry {
  fill: [string, string]
  glow: [string, string] | null
  glowOpacity: number
  glowBlur: number
}

const OVERFLOW_FILL: [string, string] = ['#403A31', '#312C26']

const TILE_STYLES: Record<number, StyleEntry> = {
  2: { fill: ['#ECE4DB', '#ECE4DB'], glow: null, glowOpacity: 0, glowBlur: 0 },
  4: { fill: ['#E8D8BA', '#E8D8BA'], glow: null, glowOpacity: 0, glowBlur: 0 },
  8: { fill: ['#E9B582', '#E6AF79'], glow: null, glowOpacity: 0, glowBlur: 0 },
  16: { fill: ['#E99A6D', '#E79362'], glow: null, glowOpacity: 0, glowBlur: 0 },
  32: { fill: ['#E8886E', '#E57A5D'], glow: null, glowOpacity: 0, glowBlur: 0 },
  64: { fill: ['#E67051', '#E26240'], glow: null, glowOpacity: 0, glowBlur: 0 },
  128: { fill: ['#EBD47F', '#EDCF64'], glow: null, glowOpacity: 0, glowBlur: 0 },
  256: { fill: ['#EBD47F', '#EDCF64'], glow: ['#FCDB69', '#EEC450'], glowOpacity: 0.16, glowBlur: 4.5 },
  512: { fill: ['#EBD47F', '#EDCF64'], glow: ['#FCDB69', '#EEC450'], glowOpacity: 0.33, glowBlur: 5 },
  1024: { fill: ['#EBD47F', '#EDCF64'], glow: ['#FCDB69', '#EEC450'], glowOpacity: 0.5, glowBlur: 5.5 },
  2048: { fill: ['#EFDB94', '#ECD069'], glow: ['#FCDB69', '#EEC450'], glowOpacity: 1, glowBlur: 6 },
  4096: { fill: ['#E8B562', '#E29A4F'], glow: ['#F0C468', '#E29A4F'], glowOpacity: 1, glowBlur: 6 },
  8192: { fill: ['#E08750', '#D9713C'], glow: ['#E89660', '#D9713C'], glowOpacity: 1, glowBlur: 6 },
  16384: { fill: ['#D9653F', '#C94A32'], glow: ['#DD7047', '#C94A32'], glowOpacity: 1, glowBlur: 6 },
  32768: { fill: ['#C43F32', '#A82E28'], glow: ['#CC4A3A', '#A82E28'], glowOpacity: 1, glowBlur: 6 },
  65536: { fill: ['#8F2A28', '#6E1F20'], glow: ['#9C332F', '#6E1F20'], glowOpacity: 1, glowBlur: 6 },
  131072: { fill: ['#2E1613', '#1C0E0C'], glow: ['#7A2620', '#4A1613'], glowOpacity: 1, glowBlur: 6 },
}

export function tileStyle(value: number): TileStyle {
  const digits = String(value).length
  const fontSize =
    digits <= 2 ? 48 : digits === 3 ? 40 : digits === 4 ? 33 : digits === 5 ? 28 : digits === 6 ? 24 : 20
  const text = value <= 4 ? '#756452' : '#FFFFFF'
  const entry = TILE_STYLES[value] ?? {
    fill: OVERFLOW_FILL,
    glow: null,
    glowOpacity: 0,
    glowBlur: 6,
  }
  return {
    fill: entry.fill,
    glow: entry.glow,
    glowOpacity: entry.glowOpacity,
    glowBlur: entry.glowBlur,
    text,
    fontSize,
  }
}

export const cellPosition = (x: number, y: number): { x: number; y: number } => ({
  x: 12 + x * CELL_STEP,
  y: 12 + y * CELL_STEP,
})

export const tilePosition = (x: number, y: number): { x: number; y: number } => ({
  x: 10 + x * CELL_STEP,
  y: 10 + y * CELL_STEP,
})

export const tileCenter = (x: number, y: number): { x: number; y: number } => {
  const p = tilePosition(x, y)
  return { x: p.x + TILE_SIZE / 2, y: p.y + TILE_SIZE / 2 }
}
