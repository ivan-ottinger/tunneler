import { BonusType, GameState, TileType } from '../types.js';
import {
  BONUS_RESPAWN_DELAY_MIN, BONUS_RESPAWN_DELAY_MAX,
  BONUS_PICKUP_SIZE, BONUS_SPAWN_BASE_CLEARANCE,
  BASE_SIZE, TANK_SIZE,
} from '../constants.js';
import { rectsOverlap } from '../engine/CollisionDetector.js';
import { SoundManager } from '../engine/SoundManager.js';

const BONUS_TYPES = [BonusType.SpeedDig, BonusType.PowerCannon, BonusType.ScatterShot, BonusType.WideBore, BonusType.ShieldRegen];

/** Decrement spawn timer and place a new pickup when it reaches 0. */
export function updateBonusSpawner(state: GameState): void {
  if (state.bonusPickup) return; // pickup already on map

  state.bonusSpawnTimer--;
  if (state.bonusSpawnTimer > 0) return;

  // Collect base centers for clearance checks
  const baseCenters: { x: number; y: number }[] = [];
  for (const p of state.players) {
    baseCenters.push({
      x: p.base.x + Math.floor(BASE_SIZE / 2),
      y: p.base.y + Math.floor(BASE_SIZE / 2),
    });
  }
  // Include outpost
  baseCenters.push({
    x: state.outpost.x + Math.floor(BASE_SIZE / 2),
    y: state.outpost.y + Math.floor(BASE_SIZE / 2),
  });

  // Collect base bounding boxes for overlap checks
  const baseBounds: { x: number; y: number; w: number; h: number }[] = [];
  for (const p of state.players) {
    baseBounds.push({ x: p.base.x, y: p.base.y, w: BASE_SIZE, h: BASE_SIZE });
  }
  baseBounds.push({ x: state.outpost.x, y: state.outpost.y, w: BASE_SIZE, h: BASE_SIZE });

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(Math.random() * (state.mapWidth - BONUS_PICKUP_SIZE));
    const y = Math.floor(Math.random() * (state.mapHeight - BONUS_PICKUP_SIZE));

    // Must be all Empty tiles
    let allEmpty = true;
    for (let dy = 0; dy < BONUS_PICKUP_SIZE && allEmpty; dy++) {
      for (let dx = 0; dx < BONUS_PICKUP_SIZE && allEmpty; dx++) {
        if (state.map[(y + dy) * state.mapWidth + (x + dx)] !== TileType.Empty) {
          allEmpty = false;
        }
      }
    }
    if (!allEmpty) continue;

    // Reject if inside any base bounding box
    let insideBase = false;
    for (const b of baseBounds) {
      if (rectsOverlap(x, y, BONUS_PICKUP_SIZE, BONUS_PICKUP_SIZE, b.x, b.y, b.w, b.h)) {
        insideBase = true;
        break;
      }
    }
    if (insideBase) continue;

    // Reject if too close to any base center
    const cx = x + Math.floor(BONUS_PICKUP_SIZE / 2);
    const cy = y + Math.floor(BONUS_PICKUP_SIZE / 2);
    let tooClose = false;
    for (const bc of baseCenters) {
      const dx = bc.x - cx;
      const dy2 = bc.y - cy;
      if (dx * dx + dy2 * dy2 < BONUS_SPAWN_BASE_CLEARANCE * BONUS_SPAWN_BASE_CLEARANCE) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    state.bonusPickup = {
      x,
      y,
      type: BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)],
    };
    return;
  }

  // Failed to place — retry next tick
  state.bonusSpawnTimer = 1;
}

/** Check collision between alive tanks and the pickup. Grant bonus on contact. */
export function checkBonusPickup(state: GameState, sound: SoundManager): void {
  const pickup = state.bonusPickup;
  if (!pickup) return;

  for (const player of state.players) {
    if (!player.alive) continue;
    if (rectsOverlap(
      player.x, player.y, TANK_SIZE, TANK_SIZE,
      pickup.x, pickup.y, BONUS_PICKUP_SIZE, BONUS_PICKUP_SIZE,
    )) {
      player.bonus = pickup.type;
      player.bonusesCollected++;
      sound.playPowerUp();
      state.bonusPickup = null;
      state.bonusSpawnTimer = BONUS_RESPAWN_DELAY_MIN +
        Math.floor(Math.random() * (BONUS_RESPAWN_DELAY_MAX - BONUS_RESPAWN_DELAY_MIN));
      return;
    }
  }
}
