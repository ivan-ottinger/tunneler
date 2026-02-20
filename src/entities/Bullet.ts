import { BonusType, Bullet, Direction, GameState, TileType } from '../types.js';
import {
  DIR_DELTA, TANK_SIZE, FIRE_ENERGY_COST, MAX_BULLETS,
  RELOAD_TICKS, BULLET_BASE_SPEED, BULLET_ACCEL_INTERVAL,
  BULLET_DIG_SIZE, TANK_HIT_CRATER_RADIUS, BULLET_DAMAGE,
  POWER_CANNON_DAMAGE, POWER_CANNON_BULLET_SPEED, POWER_CANNON_CRATER_RADIUS,
  POWER_CANNON_RELOAD_TICKS, POWER_CANNON_MAX_BULLETS,
  SCATTER_SPREAD_ANGLE,
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
  const isPowerCannon = player.bonus === BonusType.PowerCannon;
  const maxBullets = isPowerCannon ? POWER_CANNON_MAX_BULLETS : MAX_BULLETS;
  if (player.bullets.length >= maxBullets) return;
  if (player.energy < FIRE_ENERGY_COST) return;
  if (player.direction === Direction.None || player.direction === Direction.Stationary) return;

  player.energy -= FIRE_ENERGY_COST;
  player.reloadTimer = isPowerCannon ? POWER_CANNON_RELOAD_TICKS : RELOAD_TICKS;

  const [tipX, tipY] = getBarrelTip(player.x, player.y, player.direction);

  // Scatter shot fires 3 bullets: center + two angled side shots
  if (player.bonus === BonusType.ScatterShot) {
    const [cdx, cdy] = DIR_DELTA[player.direction];
    const baseAngle = Math.atan2(cdy, cdx);

    // Center bullet — normal direction-based movement
    player.bullets.push({
      x: tipX - cdx, y: tipY - cdy,
      direction: player.direction, age: 0, owner: playerIndex,
    });

    // Two side bullets with fractional deltas
    for (const sign of [-1, 1]) {
      const angle = baseAngle + sign * SCATTER_SPREAD_ANGLE;
      player.bullets.push({
        x: tipX - cdx, y: tipY - cdy,
        direction: player.direction, age: 0, owner: playerIndex,
        fdx: Math.cos(angle), fdy: Math.sin(angle),
      });
    }
  } else {
    const [dx, dy] = DIR_DELTA[player.direction];
    player.bullets.push({
      x: tipX - dx,
      y: tipY - dy,
      direction: player.direction,
      age: 0,
      owner: playerIndex,
    });
  }

  renderer.addEffect({ x: tipX, y: tipY, type: 'muzzleFlash', framesLeft: 2, owner: playerIndex });
  if (player.bonus === BonusType.PowerCannon) {
    sound.playEvilShoot();
  } else {
    sound.playShoot();
  }
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

    const hasPowerCannon = player.bonus === BonusType.PowerCannon;
    const baseSpeed = hasPowerCannon ? POWER_CANNON_BULLET_SPEED : BULLET_BASE_SPEED;
    const damage = hasPowerCannon ? POWER_CANNON_DAMAGE : BULLET_DAMAGE;

    for (const bullet of player.bullets) {
      bullet.age++;
      const speed = baseSpeed * (1 + Math.floor(bullet.age / BULLET_ACCEL_INTERVAL));
      const useFractional = bullet.fdx !== undefined && bullet.fdy !== undefined;
      const [ddx, ddy] = DIR_DELTA[bullet.direction];
      const dx = useFractional ? bullet.fdx! : ddx;
      const dy = useFractional ? bullet.fdy! : ddy;

      let alive = true;

      for (let step = 0; step < speed && alive; step++) {
        bullet.x += dx;
        bullet.y += dy;

        const bx = Math.floor(bullet.x);
        const by = Math.floor(bullet.y);

        // Out of bounds
        if (bx < 0 || bx >= state.mapWidth ||
            by < 0 || by >= state.mapHeight) {
          alive = false;
          break;
        }

        const idx = by * state.mapWidth + bx;
        const tile = state.map[idx];

        // Hit rock or base wall — just remove
        if (tile === TileType.Rock || tile === TileType.BaseWall) {
          alive = false;
          break;
        }

        // Hit dirt — power cannon blasts a crater, normal bullets dig a small rect
        if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
          if (hasPowerCannon) {
            digCrater(
              state.map, state.mapWidth, state.mapHeight,
              bx, by, POWER_CANNON_CRATER_RADIUS,
              state.tickCount * 1000 + bx,
              state.dirtyTiles,
            );
          } else {
            digBulletImpact(state, bx, by);
          }
          alive = false;
          break;
        }

        // Hit opponent tank (skip if invulnerable)
        const opponent = state.players[1 - p];
        if (opponent.alive && opponent.invulnTicks <= 0 && rectsOverlap(
          bx, by, 1, 1,
          opponent.x, opponent.y, TANK_SIZE, TANK_SIZE,
        )) {
          opponent.shield -= damage;
          sound.playHit();
          renderer.addShake(1 - p, 2); // shake the hit player's viewport
          digCrater(
            state.map, state.mapWidth, state.mapHeight,
            bx, by, TANK_HIT_CRATER_RADIUS,
            state.tickCount * 1000 + bx,
            state.dirtyTiles,
          );
          alive = false;

          if (opponent.shield <= 0) {
            player.score++;
            renderer.addShake(0, 4); // big shake for both on kill
            renderer.addShake(1, 4);
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
