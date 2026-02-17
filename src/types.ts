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
  bullets: Bullet[];
  base: Base;
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
  players: [Player, Player];
  viewports: [Viewport, Viewport];
  tickCount: number;
  seed: number;
  winner: number; // -1 if no winner
  dirtyTiles: Set<number>; // indices of tiles changed since last frame
  particles: ExplosionParticle[];
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

/** Common rendering context type that works for both regular and offscreen canvas */
export type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
