import { Bullet, Direction, GameState, TileType } from '../types.js';
import {
  DIR_DELTA, TANK_SIZE, FIRE_ENERGY_COST, MAX_BULLETS,
  RELOAD_TICKS, BULLET_BASE_SPEED, BULLET_ACCEL_INTERVAL,
  BULLET_DIG_SIZE, TANK_HIT_CRATER_RADIUS, BULLET_DAMAGE,
} from '../constants.js';
import { digCrater, digRect, markDirtyRect } from '../map/TerrainModifier.js';
import { rectsOverlap } from '../engine/CollisionDetector.js';
import { destroyTank } from './Tank.js';
import { Renderer } from '../render/Renderer.js';
import { SoundManager } from '../engine/SoundManager.js';

/** Compute barrel tip position for bullet spawn */
function getBarrelTip(x: number, y: number, dir: Direction): [number, number] {
  const cx = x + 2; // center of 5x5 tank
  const cy = y + 2;
  const [dx, dy] = DIR_DELTA[dir];
  return [cx + dx * 3, cy + dy * 3];
}

export function handleFiring(
  state: GameState,
  playerIndex: number,
  fire: boolean,
  renderer: Renderer,
  sound: SoundManager,
): void {
  const player = state.players[playerIndex];

  if (player.reloadTimer > 0) {
    player.reloadTimer--;
  }

  if (!fire || !player.alive) return;
  if (player.reloadTimer > 0) return;
  if (player.bullets.length >= MAX_BULLETS) return;
  if (player.energy < FIRE_ENERGY_COST) return;
  if (player.direction === Direction.None || player.direction === Direction.Stationary) return;

  player.energy -= FIRE_ENERGY_COST;
  player.reloadTimer = RELOAD_TICKS;

  const [tipX, tipY] = getBarrelTip(player.x, player.y, player.direction);
  const [dx, dy] = DIR_DELTA[player.direction];

  // Spawn bullet 1 step behind the barrel tip so the first movement
  // step lands exactly on the tip and checks that tile for dirt
  player.bullets.push({
    x: tipX - dx,
    y: tipY - dy,
    direction: player.direction,
    age: 0,
    owner: playerIndex,
  });

  renderer.addEffect({ x: tipX, y: tipY, type: 'muzzleFlash', framesLeft: 2, owner: playerIndex });
  sound.playShoot();
}

/** Dig a small rect centered on bullet impact */
function digBulletImpact(
  state: GameState,
  cx: number, cy: number,
): void {
  const half = Math.floor(BULLET_DIG_SIZE / 2);
  const rx = cx - half;
  const ry = cy - half;
  digRect(state.map, state.mapWidth, rx, ry, BULLET_DIG_SIZE, BULLET_DIG_SIZE);
  markDirtyRect(state.dirtyTiles, state.mapWidth, rx, ry, BULLET_DIG_SIZE, BULLET_DIG_SIZE);
}

export function updateBullets(state: GameState, renderer: Renderer, sound: SoundManager): void {
  for (let p = 0; p < 2; p++) {
    const player = state.players[p];
    const surviving: Bullet[] = [];

    for (const bullet of player.bullets) {
      bullet.age++;
      const speed = BULLET_BASE_SPEED * (1 + Math.floor(bullet.age / BULLET_ACCEL_INTERVAL));
      const [dx, dy] = DIR_DELTA[bullet.direction];

      let alive = true;

      for (let step = 0; step < speed && alive; step++) {
        bullet.x += dx;
        bullet.y += dy;

        // Out of bounds
        if (bullet.x < 0 || bullet.x >= state.mapWidth ||
            bullet.y < 0 || bullet.y >= state.mapHeight) {
          alive = false;
          break;
        }

        const idx = bullet.y * state.mapWidth + bullet.x;
        const tile = state.map[idx];

        // Hit rock or base wall — just remove
        if (tile === TileType.Rock || tile === TileType.BaseWall) {
          alive = false;
          break;
        }

        // Hit dirt — dig small rect and remove
        if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
          digBulletImpact(state, bullet.x, bullet.y);
          alive = false;
          break;
        }

        // Hit opponent tank
        const opponent = state.players[1 - p];
        if (opponent.alive && rectsOverlap(
          bullet.x, bullet.y, 1, 1,
          opponent.x, opponent.y, TANK_SIZE, TANK_SIZE,
        )) {
          opponent.shield -= BULLET_DAMAGE;
          sound.playHit();
          digCrater(
            state.map, state.mapWidth, state.mapHeight,
            bullet.x, bullet.y, TANK_HIT_CRATER_RADIUS,
            state.tickCount * 1000 + bullet.x,
            state.dirtyTiles,
          );
          alive = false;

          if (opponent.shield <= 0) {
            player.score++;
            destroyTank(state, opponent, sound);
          }
          break;
        }
      }

      if (alive) {
        surviving.push(bullet);
      }
    }

    player.bullets = surviving;
  }
}
