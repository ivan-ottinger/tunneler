import {
  GameState, GamePhase, Direction, Player, TileType,
} from './types.js';
import {
  MAP_WIDTH, MAP_HEIGHT, MAX_ENERGY, MAX_SHIELD,
  BASE_SIZE, TANK_SIZE,
  CANVAS_WIDTH, CANVAS_HEIGHT,
  KILLS_TO_WIN, EXPLOSION_DIG_RADIUS,
} from './constants.js';
import { markDirtyRect } from './map/TerrainModifier.js';
import { GameLoop } from './engine/GameLoop.js';
import { InputManager } from './engine/InputManager.js';
import { generateMap } from './map/MapGenerator.js';
import { placeBase } from './entities/Base.js';
import { updateTank } from './entities/Tank.js';
import { handleFiring, updateBullets } from './entities/Bullet.js';
import { Renderer } from './render/Renderer.js';
import { SoundManager } from './engine/SoundManager.js';
import { drawTitleScreen } from './ui/TitleScreen.js';
import { drawGameOverScreen, GAME_OVER_TEXT_HEIGHT } from './ui/GameOverScreen.js';

export class Game {
  private state!: GameState;
  private loop: GameLoop;
  private input: InputManager;
  private renderer: Renderer;
  private sound: SoundManager;
  private matchOverDelay = 0;
  private showMap = false;
  private mapKeyWasDown = false;
  private uiCanvas: OffscreenCanvas;
  private uiCtx: OffscreenCanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new InputManager();
    this.renderer = new Renderer(canvas);
    this.sound = new SoundManager();
    this.loop = new GameLoop(
      () => this.update(),
      () => this.render(),
    );

    this.uiCanvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    this.uiCtx = this.uiCanvas.getContext('2d')!;

    this.initState();
  }

  start(): void {
    this.loop.start();
  }

  private initState(): void {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    this.state = {
      phase: GamePhase.Title,
      map: new Uint8Array(0),
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      players: [this.createPlayer(0), this.createPlayer(1)],
      viewports: [{ scrollX: 0, scrollY: 0 }, { scrollX: 0, scrollY: 0 }],
      tickCount: 0,
      seed,
      winner: -1,
      dirtyTiles: new Set(),
      particles: [],
    };
  }

  private createPlayer(index: number): Player {
    return {
      x: 0,
      y: 0,
      direction: Direction.Up,
      energy: MAX_ENERGY,
      shield: MAX_SHIELD,
      score: 0,
      alive: true,
      respawnTimer: 0,
      reloadTimer: 0,
      digCooldown: 0,
      bullets: [],
      base: { x: 0, y: 0, owner: index },
    };
  }

  private startMatch(): void {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const map = generateMap(MAP_WIDTH, MAP_HEIGHT, seed);

    // Place bases — P2 must be far enough from P1
    const base0 = placeBase(map, MAP_WIDTH, MAP_HEIGHT, 0, seed);
    const base1 = placeBase(map, MAP_WIDTH, MAP_HEIGHT, 1, seed, [base0]);

    // Create fresh players
    const p0 = this.createPlayer(0);
    p0.base = base0;
    p0.x = base0.x + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);
    p0.y = base0.y + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);

    const p1 = this.createPlayer(1);
    p1.base = base1;
    p1.x = base1.x + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);
    p1.y = base1.y + Math.floor(BASE_SIZE / 2) - Math.floor(TANK_SIZE / 2);

    this.state = {
      phase: GamePhase.Playing,
      map,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      players: [p0, p1],
      viewports: [{ scrollX: 0, scrollY: 0 }, { scrollX: 0, scrollY: 0 }],
      tickCount: 0,
      seed,
      winner: -1,
      dirtyTiles: new Set(),
      particles: [],
    };

    this.matchOverDelay = 0;
    this.renderer.initTerrain(this.state);
  }

  private update(): void {
    const { state } = this;

    switch (state.phase) {
      case GamePhase.Title:
        if (this.input.isAnyPressed('Space', 'Enter')) {
          this.startMatch();
        }
        break;

      case GamePhase.Playing: {
        state.tickCount++;

        // Toggle map with M key (edge-triggered)
        const mDown = this.input.isPressed('KeyM');
        if (mDown && !this.mapKeyWasDown) {
          this.showMap = !this.showMap;
        }
        this.mapKeyWasDown = mDown;

        // Get inputs
        const input0 = this.input.getPlayerInput(0);
        const input1 = this.input.getPlayerInput(1);

        // Update tanks
        updateTank(state, 0, input0, this.sound);
        updateTank(state, 1, input1, this.sound);

        // Handle firing
        handleFiring(state, 0, input0.fire, this.renderer, this.sound);
        handleFiring(state, 1, input1.fire, this.renderer, this.sound);

        // Update bullets
        updateBullets(state, this.renderer, this.sound);

        // Update explosion particles — move outward, dig dirt
        this.updateParticles();

        // Check win condition — start delay so explosion plays out
        if (this.matchOverDelay > 0) {
          this.matchOverDelay--;
          if (this.matchOverDelay <= 0) {
            state.phase = GamePhase.MatchOver;
          }
        } else {
          for (let p = 0; p < 2; p++) {
            if (state.players[p].score >= KILLS_TO_WIN) {
              state.winner = p;
              this.matchOverDelay = 20; // 2 seconds to watch the explosion
              break;
            }
          }
        }
        break;
      }

      case GamePhase.MatchOver:
        // Keep particles running for the final explosion
        this.updateParticles();

        if (this.input.isPressed('Space')) {
          this.startMatch();
        } else if (this.input.isPressed('Escape')) {
          this.initState();
        }
        break;
    }
  }

  private updateParticles(): void {
    const { state } = this;
    const surviving = [];
    const r = EXPLOSION_DIG_RADIUS;

    for (const p of state.particles) {
      // Add slight random drift for organic, chaotic trajectories
      p.dx += (Math.random() - 0.5) * 0.4;
      p.dy += (Math.random() - 0.5) * 0.4;

      // Step pixel-by-pixel for continuous lines
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.dx), Math.abs(p.dy))));
      const stepDx = p.dx / steps;
      const stepDy = p.dy / steps;
      let hitRock = false;
      let outOfBounds = false;

      for (let s = 0; s < steps; s++) {
        p.x += stepDx;
        p.y += stepDy;

        const mx = Math.floor(p.x);
        const my = Math.floor(p.y);

        if (mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight) {
          outOfBounds = true;
          break;
        }

        const centerIdx = my * state.mapWidth + mx;
        const centerTile = state.map[centerIdx];
        if (centerTile === TileType.Rock || centerTile === TileType.BaseWall) {
          hitRock = true;
          break;
        }

        // Dig a small rect around the particle position
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const tx = mx + dx;
            const ty = my + dy;
            if (tx < 0 || tx >= state.mapWidth || ty < 0 || ty >= state.mapHeight) continue;
            const idx = ty * state.mapWidth + tx;
            const tile = state.map[idx];
            if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
              state.map[idx] = TileType.Empty;
              state.dirtyTiles.add(idx);
            }
          }
        }
      }

      if (hitRock || outOfBounds) continue;

      p.life--;

      // Fade color as life decreases
      if (p.life <= 2) {
        p.color = 8; // dark gray embers
      } else if (p.life <= 4) {
        p.color = 12; // light red
      }

      if (p.life > 0) {
        surviving.push(p);
      }
    }

    state.particles = surviving;
  }

  private blitUI(): void {
    const displayCtx = this.canvas.getContext('2d')!;
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(
      this.uiCanvas,
      0, 0, CANVAS_WIDTH, CANVAS_HEIGHT,
      0, 0, this.canvas.width, this.canvas.height,
    );
  }

  private render(): void {
    const { state } = this;

    switch (state.phase) {
      case GamePhase.Title:
        drawTitleScreen(this.uiCtx);
        this.blitUI();
        break;

      case GamePhase.Playing:
        if (this.showMap) {
          this.renderer.renderFullMap(state);
        } else {
          this.renderer.render(state);
        }
        break;

      case GamePhase.MatchOver: {
        // Show full map overview with space reserved for text below
        const mapBottomY = this.renderer.renderFullMap(state, GAME_OVER_TEXT_HEIGHT);
        // Draw winner info directly on display canvas below the map
        const displayCtx = this.canvas.getContext('2d')!;
        drawGameOverScreen(displayCtx, state, mapBottomY, this.canvas.width);
        break;
      }
    }
  }
}
