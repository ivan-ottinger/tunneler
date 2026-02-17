import { Direction } from '../types.js';

/**
 * 5x5 binary sprite grids for 8 tank directions.
 * 1 = body pixel, 2 = barrel pixel.
 * Barrel is drawn in a brighter shade.
 */
const SPRITES: Record<Direction, number[][]> = {
  [Direction.Up]: [
    [0, 0, 2, 0, 0],
    [0, 0, 2, 0, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
  ],
  [Direction.Down]: [
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 0, 2, 0, 0],
    [0, 0, 2, 0, 0],
  ],
  [Direction.Left]: [
    [0, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [2, 2, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 1],
  ],
  [Direction.Right]: [
    [1, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 2, 2],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 0],
  ],
  [Direction.UpLeft]: [
    [2, 0, 0, 1, 1],
    [0, 2, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
  ],
  [Direction.UpRight]: [
    [1, 1, 0, 0, 2],
    [0, 1, 1, 2, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
  ],
  [Direction.DownLeft]: [
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 2, 1, 1, 0],
    [2, 0, 0, 1, 1],
  ],
  [Direction.DownRight]: [
    [0, 0, 0, 0, 1],
    [0, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 2, 0],
    [1, 1, 0, 0, 2],
  ],
  [Direction.None]: [
    [0, 0, 2, 0, 0],
    [0, 0, 2, 0, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
  ],
  [Direction.Stationary]: [
    [0, 0, 2, 0, 0],
    [0, 0, 2, 0, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
  ],
};

export function getTankSprite(direction: Direction): number[][] {
  return SPRITES[direction] || SPRITES[Direction.Up];
}
