import { Direction, TileType } from './types.js';

// CGA 16-color palette
export const CGA_PALETTE = [
  '#000000', // 0  Black
  '#0000AA', // 1  Blue
  '#00AA00', // 2  Green
  '#00AAAA', // 3  Cyan
  '#AA0000', // 4  Red
  '#AA00AA', // 5  Magenta
  '#AA5500', // 6  Brown
  '#AAAAAA', // 7  Light Gray
  '#555555', // 8  Dark Gray
  '#5555FF', // 9  Light Blue
  '#55FF55', // 10 Light Green
  '#55FFFF', // 11 Light Cyan
  '#FF5555', // 12 Light Red
  '#FF55FF', // 13 Light Magenta
  '#FFFF55', // 14 Yellow
  '#FFFFFF', // 15 White
] as const;

// Map dimensions
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 600;
export const MAP_BORDER = 10;

// Tank
export const TANK_SIZE = 5;

// Base
export const BASE_SIZE = 40;
export const BASE_ENTRANCE_WIDTH = 8;

// Energy & Shield
export const MAX_ENERGY = 1000;
export const MAX_SHIELD = 10;
export const IDLE_ENERGY_COST = 0.2; // per tick when outside own base
export const MOVE_ENERGY_COST = 1;
export const MOVE_EMPTY_ENERGY_COST = 0.3; // cheaper to move through open space
export const FIRE_ENERGY_COST = 5;
export const BASE_ENERGY_REGEN = 5;
export const BASE_SHIELD_REGEN = 0.2;
export const ENEMY_BASE_ENERGY_REGEN = 3;
export const BASE_CAMP_TIMEOUT = 100; // ticks (~10 seconds) before regen stops

// Bullets
export const MAX_BULLETS = 10;
export const RELOAD_TICKS = 1; // 100ms at 100ms ticks
export const BULLET_BASE_SPEED = 2;
export const BULLET_ACCEL_INTERVAL = 10;
export const BULLET_DAMAGE = 1;
export const BULLET_DIG_SIZE = 3; // small rect when hitting dirt
export const TANK_HIT_CRATER_RADIUS = 3;
export const DEATH_CRATER_RADIUS = 8;

// Explosion particles (shrapnel)
export const EXPLOSION_PARTICLE_COUNT = 50;
export const EXPLOSION_PARTICLE_SPEED_MIN = 1.0;
export const EXPLOSION_PARTICLE_SPEED_MAX = 5.0;
export const EXPLOSION_PARTICLE_LIFE_MIN = 6;
export const EXPLOSION_PARTICLE_LIFE_MAX = 18;
export const EXPLOSION_DIG_RADIUS = 1; // each shrapnel digs a small area

// Digging
export const DIG_COOLDOWN_TICKS = 2; // ticks to wait before next dig move
export const DIG_COOLDOWN_FIRING = 0; // no cooldown while firing

// Game flow
export const KILLS_TO_WIN = 3;
export const RESPAWN_TICKS = 30; // 3 seconds
export const INVULN_TICKS = 15; // 1.5 seconds of invulnerability after respawn
export const TICK_DURATION_MS = 100;

// Rendering
export const RENDER_SCALE = 8;
export const VIEWPORT_WIDTH = 76;
export const VIEWPORT_HEIGHT = 72;
export const STATUS_PANEL_WIDTH = 24; // in native pixels (192px rendered)
export const CANVAS_WIDTH = VIEWPORT_WIDTH * 2 + STATUS_PANEL_WIDTH;
export const CANVAS_HEIGHT = VIEWPORT_HEIGHT;

// Tile colors
export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Empty]: CGA_PALETTE[0],     // Black
  [TileType.Dirt]: CGA_PALETTE[6],       // Brown
  [TileType.DirtVariant]: CGA_PALETTE[4],// Dark Red (variation)
  [TileType.Rock]: CGA_PALETTE[8],       // Dark Gray
  [TileType.BaseWall]: CGA_PALETTE[7],   // Light Gray
  [TileType.BaseInterior]: CGA_PALETTE[0],// Black (open space)
};

// Player colors
export const PLAYER_COLORS = [
  CGA_PALETTE[11], // P1: Light Cyan (barrel)
  CGA_PALETTE[10], // P2: Light Green (barrel)
] as const;

export const PLAYER_DARK_COLORS = [
  CGA_PALETTE[9],  // P1: Light Blue (body)
  CGA_PALETTE[2],  // P2: Green (body)
] as const;

// Direction deltas (x, y) — screen coords (y-down)
export const DIR_DELTA: Record<Direction, [number, number]> = {
  [Direction.None]: [0, 0],
  [Direction.UpLeft]: [-1, -1],
  [Direction.Up]: [0, -1],
  [Direction.UpRight]: [1, -1],
  [Direction.Left]: [-1, 0],
  [Direction.Stationary]: [0, 0],
  [Direction.Right]: [1, 0],
  [Direction.DownLeft]: [-1, 1],
  [Direction.Down]: [0, 1],
  [Direction.DownRight]: [1, 1],
};

// Key bindings
export const P1_KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  fire: 'Space',
  fireAlt: 'ShiftLeft',
} as const;

export const P2_KEYS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  fire: 'Enter',
} as const;

export const P2_ALT_KEYS = {
  up: 'KeyU',
  down: 'KeyJ',
  left: 'KeyH',
  right: 'KeyK',
} as const;

// Noise generation parameters
export const ROCK_FREQUENCY = 0.015;
export const ROCK_THRESHOLD = 0.55;
export const CAVE_FREQUENCY = 0.04;
export const CAVE_THRESHOLD = 0.6;
export const DIRT_VARIANT_FREQUENCY = 0.1;
export const DIRT_VARIANT_THRESHOLD = 0.3;
