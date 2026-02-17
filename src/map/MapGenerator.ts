import { createNoise2D } from 'simplex-noise';
import { TileType } from '../types.js';
import {
  MAP_BORDER,
  ROCK_FREQUENCY, ROCK_THRESHOLD,
  CAVE_FREQUENCY, CAVE_THRESHOLD,
  DIRT_VARIANT_FREQUENCY, DIRT_VARIANT_THRESHOLD,
} from '../constants.js';
import { sfc32 } from './sfc32.js';

/** Alea-style seeded PRNG compatible with simplex-noise's createNoise2D */
function createAlea(seed: number): () => number {
  const rng = sfc32(
    0x9e3779b9 + seed,
    0x243f6a88 + seed,
    0xb7e15162 + seed,
    seed,
  );
  // Warm up the generator
  for (let i = 0; i < 20; i++) rng();
  return rng;
}

export function generateMap(width: number, height: number, seed: number): Uint8Array {
  const map = new Uint8Array(width * height);

  const rockNoise = createNoise2D(createAlea(seed));
  const caveNoise = createNoise2D(createAlea(seed + 1));
  const dirtNoise = createNoise2D(createAlea(seed + 2));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Solid rock border
      if (x < MAP_BORDER || x >= width - MAP_BORDER ||
          y < MAP_BORDER || y >= height - MAP_BORDER) {
        map[idx] = TileType.Rock;
        continue;
      }

      // Rock formations (low frequency)
      const rockVal = rockNoise(x * ROCK_FREQUENCY, y * ROCK_FREQUENCY);
      if (rockVal > ROCK_THRESHOLD) {
        map[idx] = TileType.Rock;
        continue;
      }

      // Cave systems (medium frequency)
      const caveVal = caveNoise(x * CAVE_FREQUENCY, y * CAVE_FREQUENCY);
      if (caveVal > CAVE_THRESHOLD) {
        map[idx] = TileType.Empty;
        continue;
      }

      // Dirt with variation
      const dirtVal = dirtNoise(x * DIRT_VARIANT_FREQUENCY, y * DIRT_VARIANT_FREQUENCY);
      map[idx] = dirtVal > DIRT_VARIANT_THRESHOLD ? TileType.DirtVariant : TileType.Dirt;
    }
  }

  return map;
}
