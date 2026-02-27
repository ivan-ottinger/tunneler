import { TileType } from '../types.js';
import { createRng } from './sfc32.js';

/** Set a rectangular area to Empty. Returns number of dirt tiles converted. */
export function digRect(
  map: Uint8Array, mapWidth: number,
  x: number, y: number, w: number, h: number,
): number {
  let count = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const mx = x + dx;
      const my = y + dy;
      const idx = my * mapWidth + mx;
      const tile = map[idx];
      if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
        map[idx] = TileType.Empty;
        count++;
      }
    }
  }
  return count;
}

/** Dig a probabilistic circular crater. */
export function digCrater(
  map: Uint8Array, mapWidth: number, mapHeight: number,
  cx: number, cy: number, radius: number, seed: number,
  dirtyTiles?: Set<number>,
  probability: number = 0.75,
): void {
  const rng = createRng(seed);

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const mx = cx + dx;
      const my = cy + dy;
      if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      if (rng() > probability) continue;

      const idx = my * mapWidth + mx;
      const tile = map[idx];
      if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
        map[idx] = TileType.Empty;
        dirtyTiles?.add(idx);
      }
    }
  }
}

/** Dig a narrow line perpendicular to bullet direction. Width is in pixels on each side of center. */
export function digLine(
  map: Uint8Array, mapWidth: number, mapHeight: number,
  cx: number, cy: number,
  dx: number, dy: number,
  halfWidth: number,
  dirtyTiles?: Set<number>,
): void {
  // Perpendicular to travel direction
  const perpX = -dy;
  const perpY = dx;

  for (let w = -halfWidth; w <= halfWidth; w++) {
    const mx = cx + perpX * w;
    const my = cy + perpY * w;
    if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue;

    const idx = my * mapWidth + mx;
    const tile = map[idx];
    if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
      map[idx] = TileType.Empty;
      dirtyTiles?.add(idx);
    }
  }
}

/** Check if any tile in the rectangle is Rock */
export function containsRock(
  map: Uint8Array, mapWidth: number,
  x: number, y: number, w: number, h: number,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = (y + dy) * mapWidth + (x + dx);
      if (map[idx] === TileType.Rock) return true;
    }
  }
  return false;
}

/** Check if any tile in the rectangle blocks movement (Rock or BaseWall) */
export function containsBlocking(
  map: Uint8Array, mapWidth: number,
  x: number, y: number, w: number, h: number,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = (y + dy) * mapWidth + (x + dx);
      const tile = map[idx];
      if (tile === TileType.Rock || tile === TileType.BaseWall) return true;
    }
  }
  return false;
}

/** Mark tiles in a rectangular region as dirty */
export function markDirtyRect(
  dirtyTiles: Set<number>, mapWidth: number,
  x: number, y: number, w: number, h: number,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      dirtyTiles.add((y + dy) * mapWidth + (x + dx));
    }
  }
}
