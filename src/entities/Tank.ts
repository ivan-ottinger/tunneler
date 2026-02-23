import { BonusType, Direction, GameState, Player, PlayerInput, TileType } from '../types.js';
import {
  DIR_DELTA, TANK_SIZE, MOVE_ENERGY_COST, MOVE_EMPTY_ENERGY_COST, IDLE_ENERGY_COST,
  MAX_ENERGY, MAX_SHIELD,
  BASE_SIZE, BASE_ENERGY_REGEN, BASE_SHIELD_REGEN,
  ENEMY_BASE_ENERGY_REGEN, BASE_CAMP_TIMEOUT, INVULN_TICKS,
  OUTPOST_ENERGY_REGEN, OUTPOST_SHIELD_REGEN, SHIELD_REGEN_RATE,
  DIG_COOLDOWN_TICKS, DIG_COOLDOWN_FIRING, WIDE_BORE_DIG_SIZE,
  EXPLOSION_PARTICLE_COUNT,
  EXPLOSION_PARTICLE_SPEED_MIN, EXPLOSION_PARTICLE_SPEED_MAX,
  EXPLOSION_PARTICLE_LIFE_MIN, EXPLOSION_PARTICLE_LIFE_MAX,
} from '../constants.js';
import { digRect, containsBlocking, markDirtyRect } from '../map/TerrainModifier.js';
import { rectsOverlap } from '../engine/CollisionDetector.js';
import { SoundManager } from '../engine/SoundManager.js';

export function updateTank(
  state: GameState,
  playerIndex: number,
  input: PlayerInput,
  sound: SoundManager,
): void {
  const player = state.players[playerIndex];

  if (!player.alive) {
    handleRespawn(state, playerIndex);
    return;
  }

  if (player.invulnTicks > 0) player.invulnTicks--;

  handleMovement(state, player, input, playerIndex, sound);
  handleRefueling(state, player, playerIndex, sound);
  handleIdleDrain(state, player, playerIndex, sound);
}

function handleMovement(
  state: GameState,
  player: Player,
  input: PlayerInput,
  playerIndex: number,
  sound: SoundManager,
): void {
  // Tick down dig cooldown
  if (player.digCooldown > 0) {
    player.digCooldown--;
  }

  if (input.direction === Direction.None) return;

  // If direction differs from current, turn first (no movement)
  if (player.direction !== input.direction) {
    player.direction = input.direction;
    return;
  }

  // Move in current direction
  const [dx, dy] = DIR_DELTA[player.direction];
  const newX = player.x + dx;
  const newY = player.y + dy;

  // Bounds check
  if (newX < 0 || newX + TANK_SIZE > state.mapWidth ||
      newY < 0 || newY + TANK_SIZE > state.mapHeight) {
    return;
  }

  // Rock/BaseWall collision check
  if (containsBlocking(state.map, state.mapWidth, newX, newY, TANK_SIZE, TANK_SIZE)) {
    return;
  }

  // Tank-to-tank collision check
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const other = state.players[i];
    if (!other.alive) continue;
    if (rectsOverlap(newX, newY, TANK_SIZE, TANK_SIZE, other.x, other.y, TANK_SIZE, TANK_SIZE)) {
      return;
    }
  }

  // Check for dirt — dig through it
  let hasDirt = false;
  for (let ty = 0; ty < TANK_SIZE; ty++) {
    for (let tx = 0; tx < TANK_SIZE; tx++) {
      const idx = (newY + ty) * state.mapWidth + (newX + tx);
      const tile = state.map[idx];
      if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
        hasDirt = true;
        break;
      }
    }
    if (hasDirt) break;
  }

  // Wide Bore digs a larger area around the tank
  const isWideBore = player.bonus === BonusType.WideBore;
  const digSize = isWideBore ? WIDE_BORE_DIG_SIZE : TANK_SIZE;
  const digOffset = isWideBore ? Math.floor((WIDE_BORE_DIG_SIZE - TANK_SIZE) / 2) : 0;

  if (hasDirt) {
    // Apply dig cooldown — slower digging, but faster while firing or with SpeedDig bonus
    if (player.digCooldown > 0) return;
    const cooldown = (input.fire || player.bonus === BonusType.SpeedDig) ? DIG_COOLDOWN_FIRING : DIG_COOLDOWN_TICKS;
    player.digCooldown = cooldown;

    // Mark old position dirty before digging
    markDirtyRect(state.dirtyTiles, state.mapWidth, player.x, player.y, TANK_SIZE, TANK_SIZE);
    digRect(state.map, state.mapWidth, newX - digOffset, newY - digOffset, digSize, digSize);
    markDirtyRect(state.dirtyTiles, state.mapWidth, newX - digOffset, newY - digOffset, digSize, digSize);
    sound.playDig();
  } else {
    // Mark old position dirty
    markDirtyRect(state.dirtyTiles, state.mapWidth, player.x, player.y, TANK_SIZE, TANK_SIZE);
    // Wide Bore also widens existing tunnels when moving through empty space
    if (isWideBore) {
      digRect(state.map, state.mapWidth, newX - digOffset, newY - digOffset, digSize, digSize);
      markDirtyRect(state.dirtyTiles, state.mapWidth, newX - digOffset, newY - digOffset, digSize, digSize);
    }
  }

  player.x = newX;
  player.y = newY;

  // No energy cost for moving inside own base
  const ownBase = state.players[playerIndex].base;
  const inOwnBase = rectsOverlap(
    player.x, player.y, TANK_SIZE, TANK_SIZE,
    ownBase.x + 1, ownBase.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
  );
  if (!inOwnBase) {
    player.energy -= hasDirt ? MOVE_ENERGY_COST : MOVE_EMPTY_ENERGY_COST;
  }

  // Self-destruct if energy depleted — player loses a point
  if (player.energy <= 0) {
    player.score = Math.max(0, player.score - 1);
    destroyTank(state, player, sound);
  }
}

function handleRefueling(
  state: GameState,
  player: Player,
  playerIndex: number,
  sound: SoundManager,
): void {
  const ownBase = state.players[playerIndex].base;
  const inOwnBase = rectsOverlap(
    player.x, player.y, TANK_SIZE, TANK_SIZE,
    ownBase.x + 1, ownBase.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
  );

  if (inOwnBase) {
    const fullyCharged = player.energy >= MAX_ENERGY && player.shield >= MAX_SHIELD;
    // Only start camp timer once fully recharged
    if (fullyCharged) {
      player.baseCampTicks++;
    }
    // Regen until camp timeout
    if (player.baseCampTicks <= BASE_CAMP_TIMEOUT) {
      player.energy = Math.min(MAX_ENERGY, player.energy + BASE_ENERGY_REGEN);
      player.shield = Math.min(MAX_SHIELD, player.shield + BASE_SHIELD_REGEN);
    }
  } else {
    player.baseCampTicks = 0;
  }

  // Enemy base always regens energy (no camp penalty)
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const enemyBase = state.players[i].base;
    if (rectsOverlap(
      player.x, player.y, TANK_SIZE, TANK_SIZE,
      enemyBase.x + 1, enemyBase.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
    )) {
      player.energy = Math.min(MAX_ENERGY, player.energy + ENEMY_BASE_ENERGY_REGEN);
      break;
    }
  }

  // Outpost: one-time power-up always available, regen only when neutral
  const outpost = state.outpost;
  const inOutpost = rectsOverlap(
    player.x, player.y, TANK_SIZE, TANK_SIZE,
    outpost.x + 1, outpost.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
  );
  if (inOutpost) {
    // Regen only when outpost is neutral; when AI owns it, it's just an enemy base
    if (outpost.owner === -1) {
      player.energy = Math.min(MAX_ENERGY, player.energy + OUTPOST_ENERGY_REGEN);
      player.shield = Math.min(MAX_SHIELD, player.shield + OUTPOST_SHIELD_REGEN);
    }

  }
}

function handleIdleDrain(
  state: GameState,
  player: Player,
  playerIndex: number,
  sound: SoundManager,
): void {
  // Slowly drain energy when outside any friendly base
  const base = state.players[playerIndex].base;
  const inOwnBase = rectsOverlap(
    player.x, player.y, TANK_SIZE, TANK_SIZE,
    base.x + 1, base.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
  );
  // Outpost only exempts from drain when neutral (not owned by AI)
  const outpost = state.outpost;
  const inNeutralOutpost = outpost.owner === -1 && rectsOverlap(
    player.x, player.y, TANK_SIZE, TANK_SIZE,
    outpost.x + 1, outpost.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
  );
  // Enemy bases also exempt from drain (they regen at a lower rate instead)
  let inEnemyBase = false;
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const enemyBase = state.players[i].base;
    if (rectsOverlap(
      player.x, player.y, TANK_SIZE, TANK_SIZE,
      enemyBase.x + 1, enemyBase.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
    )) {
      inEnemyBase = true;
      break;
    }
  }
  if (!inOwnBase && !inNeutralOutpost && !inEnemyBase) {
    player.energy -= IDLE_ENERGY_COST;
    if (player.energy <= 0) {
      player.score = Math.max(0, player.score - 1);
      destroyTank(state, player, sound);
    }
  }

  // Shield regen bonus — slow passive regen anywhere
  if (player.bonus === BonusType.ShieldRegen) {
    player.shield = Math.min(MAX_SHIELD, player.shield + SHIELD_REGEN_RATE);
  }
}


function handleRespawn(state: GameState, playerIndex: number): void {
  const player = state.players[playerIndex];
  player.respawnTimer--;
  if (player.respawnTimer <= 0) {
    respawnTank(player);
  }
}

export function destroyTank(state: GameState, player: Player, sound?: SoundManager): void {
  player.alive = false;
  player.respawnTimer = 30;
  player.bullets = [];
  if (sound) sound.playExplosion();

  const cx = player.x + Math.floor(TANK_SIZE / 2);
  const cy = player.y + Math.floor(TANK_SIZE / 2);

  // Clear the immediate tank area
  digRect(state.map, state.mapWidth, player.x - 2, player.y - 2, TANK_SIZE + 4, TANK_SIZE + 4);
  markDirtyRect(state.dirtyTiles, state.mapWidth, player.x - 2, player.y - 2, TANK_SIZE + 4, TANK_SIZE + 4);

  // Tank shatters into shrapnel — random angles, random speeds
  const colors = [14, 14, 12, 12, 15, 6]; // yellow, red, white, brown
  const speedRange = EXPLOSION_PARTICLE_SPEED_MAX - EXPLOSION_PARTICLE_SPEED_MIN;
  const lifeRange = EXPLOSION_PARTICLE_LIFE_MAX - EXPLOSION_PARTICLE_LIFE_MIN;

  for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = EXPLOSION_PARTICLE_SPEED_MIN + Math.random() * speedRange;
    const life = EXPLOSION_PARTICLE_LIFE_MIN + Math.floor(Math.random() * lifeRange);

    // Spawn slightly offset from center for more organic look
    const spawnOffset = Math.random() * 2;
    const spawnAngle = Math.random() * Math.PI * 2;

    state.particles.push({
      x: cx + Math.cos(spawnAngle) * spawnOffset,
      y: cy + Math.sin(spawnAngle) * spawnOffset,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function respawnTank(player: Player): void {
  const base = player.base;
  player.x = base.x + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);
  player.y = base.y + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);
  player.energy = MAX_ENERGY;
  player.shield = MAX_SHIELD;
  player.alive = true;
  player.direction = Direction.Up;
  player.reloadTimer = 0;
  player.digCooldown = 0;
  player.baseCampTicks = 0;
  player.invulnTicks = INVULN_TICKS;
  player.bonus = BonusType.None;
  player.bullets = [];
}
