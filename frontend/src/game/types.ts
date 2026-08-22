export const SIZE = 4

export type Direction = 'up' | 'right' | 'down' | 'left'

export const GameStatus = {
  Fresh: 'fresh',
  Playing: 'playing',
  GameWon: 'gameWon',
  GameOver: 'gameOver',
  Selecting: 'selecting',
} as const

export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus]

export interface Position {
  x: number
  y: number
}
