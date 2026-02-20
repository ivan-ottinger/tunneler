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

// Outpost (neutral base)
export const OUTPOST_ENERGY_REGEN = 5;
export const OUTPOST_SHIELD_REGEN = 0.2;
export const OUTPOST_COLOR = CGA_PALETTE[5]; // Magenta

// Power cannon bonus
export const POWER_CANNON_DAMAGE = 2;
export const POWER_CANNON_BULLET_SPEED = 1; // slower than normal (2), no acceleration
export const POWER_CANNON_CRATER_RADIUS = 5; // large crater when hitting dirt
export const POWER_CANNON_RELOAD_TICKS = 5; // slow reload (~500ms)
export const POWER_CANNON_MAX_BULLETS = 3; // fewer in flight at once

// Scatter shot bonus
export const SCATTER_SPREAD_ANGLE = Math.PI / 12; // ~15° half-angle

// Wide bore bonus
export const WIDE_BORE_DIG_SIZE = 9;

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
  CGA_PALETTE[13], // AI: Light Magenta (barrel)
] as const;

export const PLAYER_DARK_COLORS = [
  CGA_PALETTE[9],  // P1: Light Blue (body)
  CGA_PALETTE[2],  // P2: Green (body)
  CGA_PALETTE[5],  // AI: Magenta (body)
] as const;

// AI tank
export const AI_PLAYER_INDEX = 2;
export const AI_DETECT_RANGE = 120;
export const AI_FIRE_RANGE = 60;
export const AI_RETREAT_ENERGY = 500;
export const AI_RETREAT_SHIELD = 3;
export const AI_PATH_RECALC_TICKS = 30;
export const AI_FIRE_PROBABILITY = 0.4;
export const AI_COARSE_TILE_SIZE = 5;

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

// Rich dirt color palettes (indexed by noise value)
export const DIRT_PALETTE = [
  '#6B3D00', // Dark earth
  '#8B5000', // Medium brown
  '#AA5500', // CGA Brown
  '#8B5A18', // Golden brown
];
export const DIRT_VARIANT_PALETTE = [
  '#5B2500', // Deep clay
  '#7B3200', // Dark sienna
  '#993D00', // Burnt sienna
  '#6B3010', // Warm umber
];

// Darkened edge palettes (for dirt adjacent to tunnels — adds depth)
function darkenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' +
    Math.floor(r * factor).toString(16).padStart(2, '0') +
    Math.floor(g * factor).toString(16).padStart(2, '0') +
    Math.floor(b * factor).toString(16).padStart(2, '0');
}
export const DIRT_PALETTE_EDGE = DIRT_PALETTE.map(c => darkenHex(c, 0.6));
export const DIRT_VARIANT_PALETTE_EDGE = DIRT_VARIANT_PALETTE.map(c => darkenHex(c, 0.6));
