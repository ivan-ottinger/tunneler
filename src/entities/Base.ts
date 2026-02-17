import { Base, TileType } from '../types.js';
import {
  BASE_SIZE, BASE_ENTRANCE_WIDTH, MAP_BORDER,
} from '../constants.js';
import { containsRock } from '../map/TerrainModifier.js';
import { createRng } from '../map/sfc32.js';

const MIN_BASE_DISTANCE = 200;

/** Place a base anywhere on the map, avoiding rocks and other bases */
export function placeBase(
  map: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  playerIndex: number,
  seed: number,
  existingBases: Base[] = [],
): Base {
  const rng = createRng(seed + playerIndex * 9973);
  const margin = MAP_BORDER + BASE_SIZE;

  const minX = margin;
  const maxX = mapWidth - margin;
  const minY = margin;
  const maxY = mapHeight - margin;

  let bestX = minX;
  let bestY = minY;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const x = Math.floor(minX + rng() * (maxX - minX));
    const y = Math.floor(minY + rng() * (maxY - minY));

    if (containsRock(map, mapWidth, x, y, BASE_SIZE, BASE_SIZE)) {
      bestX = x;
      bestY = y;
      continue;
    }

    // Check distance from existing bases
    let tooClose = false;
    for (const other of existingBases) {
      const dx = (x + BASE_SIZE / 2) - (other.x + BASE_SIZE / 2);
      const dy = (y + BASE_SIZE / 2) - (other.y + BASE_SIZE / 2);
      if (Math.sqrt(dx * dx + dy * dy) < MIN_BASE_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      bestX = x;
      bestY = y;
      continue;
    }

    bestX = x;
    bestY = y;
    break;
  }

  // Carve the base structure into the map
  carveBase(map, mapWidth, bestX, bestY);

  // Clear rocks from entrance paths so players can enter/exit
  clearEntrancePaths(map, mapWidth, mapHeight, bestX, bestY);

  return { x: bestX, y: bestY, owner: playerIndex };
}

/** Carve base walls and interior into the map */
function carveBase(
  map: Uint8Array,
  mapWidth: number,
  bx: number,
  by: number,
): void {
  const entranceOffset = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);

  for (let dy = 0; dy < BASE_SIZE; dy++) {
    for (let dx = 0; dx < BASE_SIZE; dx++) {
      const idx = (by + dy) * mapWidth + (bx + dx);
      const isEdge = dx === 0 || dx === BASE_SIZE - 1 || dy === 0 || dy === BASE_SIZE - 1;

      if (isEdge) {
        // Check if this is an entrance opening
        const isTopBottom = dy === 0 || dy === BASE_SIZE - 1;
        const isLeftRight = dx === 0 || dx === BASE_SIZE - 1;

        let isEntrance = false;
        if (isTopBottom && dx >= entranceOffset && dx < entranceOffset + BASE_ENTRANCE_WIDTH) {
          isEntrance = true;
        }
        if (isLeftRight && dy >= entranceOffset && dy < entranceOffset + BASE_ENTRANCE_WIDTH) {
          isEntrance = true;
        }

        map[idx] = isEntrance ? TileType.BaseInterior : TileType.BaseWall;
      } else {
        map[idx] = TileType.BaseInterior;
      }
    }
  }
}

/** Clear rocks around base entrances so tanks can get in/out */
function clearEntrancePaths(
  map: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  bx: number,
  by: number,
): void {
  const entranceOffset = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);
  const clearDepth = 10; // how far out from the entrance to clear

  // Four entrances: top, bottom, left, right
  const entrances = [
    // top entrance
    { x: bx + entranceOffset, y: by - clearDepth, w: BASE_ENTRANCE_WIDTH, h: clearDepth },
    // bottom entrance
    { x: bx + entranceOffset, y: by + BASE_SIZE, w: BASE_ENTRANCE_WIDTH, h: clearDepth },
    // left entrance
    { x: bx - clearDepth, y: by + entranceOffset, w: clearDepth, h: BASE_ENTRANCE_WIDTH },
    // right entrance
    { x: bx + BASE_SIZE, y: by + entranceOffset, w: clearDepth, h: BASE_ENTRANCE_WIDTH },
  ];

  for (const rect of entrances) {
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const tx = rect.x + dx;
        const ty = rect.y + dy;
        if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) continue;
        const idx = ty * mapWidth + tx;
        if (map[idx] === TileType.Rock) {
          map[idx] = TileType.Dirt;
        }
      }
    }
  }
}
