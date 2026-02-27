export enum BonusType {
  None = 0,
  SpeedDig = 1,      // Dig cooldown always 0
  PowerCannon = 2,   // Double damage, faster bullets, evil sound
  ScatterShot = 3,   // Fire 3 bullets in a spread
  WideBore = 4,      // Dig 9x9 tunnels instead of 5x5
  ShieldRegen = 5,   // Slow passive shield regen outside base
}

/** Numpad-style direction encoding: 5 = stationary */
export enum Direction {
  None = 0,
  DownLeft = 1,
  Down = 2,
  DownRight = 3,
  Left = 4,
  Stationary = 5,
  Right = 6,
  UpLeft = 7,
  Up = 8,
  UpRight = 9,
}

export enum TileType {
  Empty = 0,
  Dirt = 1,
  DirtVariant = 2,
  Rock = 3,
  BaseWall = 4,
  BaseInterior = 5,
}

export enum GamePhase {
  Title = 'title',
  Playing = 'playing',
  MatchOver = 'matchOver',
}

export interface PlayerInput {
  direction: Direction;
  fire: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  direction: Direction;
  age: number;
  owner: number; // player index
  fdx?: number; // fractional delta x (overrides direction for scatter bullets)
  fdy?: number;
}

export interface Base {
  x: number; // top-left
  y: number;
  owner: number;
}

export interface Player {
  x: number;
  y: number;
  direction: Direction;
  energy: number;
  shield: number;
  score: number;
  alive: boolean;
  respawnTimer: number;
  reloadTimer: number;
  digCooldown: number;
  baseCampTicks: number; // continuous ticks spent inside own base
  invulnTicks: number; // ticks of invulnerability remaining after respawn
  bonus: BonusType;
  bullets: Bullet[];
  base: Base;
  isAI: boolean;
  tilesDug: number;
  shotsFired: number;
  shotsHit: number;
  bonusesCollected: number;
  deaths: number;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
}

export interface GameState {
  phase: GamePhase;
  map: Uint8Array;
  mapWidth: number;
  mapHeight: number;
  players: Player[];
  viewports: [Viewport, Viewport];
  tickCount: number;
  seed: number;
  winner: number; // -1 if no winner
  dirtyTiles: Set<number>; // indices of tiles changed since last frame
  particles: ExplosionParticle[];
  outpost: Base;
  bonusPickup: BonusPickup | null;
  bonusSpawnTimer: number;
}

export interface Effect {
  x: number;
  y: number;
  type: 'explosion' | 'muzzleFlash';
  framesLeft: number;
  owner?: number;
}

export interface ExplosionParticle {
  x: number;
  y: number;
  dx: number; // velocity (fractional)
  dy: number;
  life: number; // ticks remaining
  color: number; // CGA palette index
}

export interface BonusPickup {
  x: number;
  y: number;
  type: BonusType;
}

/** Common rendering context type that works for both regular and offscreen canvas */
export type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
