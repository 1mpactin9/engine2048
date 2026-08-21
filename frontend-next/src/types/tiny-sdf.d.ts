declare module 'tiny-sdf' {
  export default class TinySDF {
    constructor(
      fontSize?: number,
      buffer?: number,
      radius?: number,
      cutoff?: number,
      fontFamily?: string,
    )
    ctx: CanvasRenderingContext2D
    middle: number
    size: number
    draw(char: string): ImageData
  }
}
