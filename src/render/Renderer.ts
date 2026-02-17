import { GameState, Effect, TileType } from '../types.js';
import {
  RENDER_SCALE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
  STATUS_PANEL_WIDTH, CANVAS_WIDTH, CANVAS_HEIGHT,
  TILE_COLORS, PLAYER_COLORS, PLAYER_DARK_COLORS, TANK_SIZE,
  CGA_PALETTE, BASE_SIZE, BASE_ENTRANCE_WIDTH,
} from '../constants.js';
import { calculateViewport } from './ViewportCalculator.js';
import { drawStatusPanel } from './StatusPanel.js';
import { getTankSprite } from './TankSprites.js';
import { drawStaticInterference, drawEffects } from './EffectsRenderer.js';

export class Renderer {
  private offscreen: OffscreenCanvas;
  private offCtx: OffscreenCanvasRenderingContext2D;
  private terrainCanvas: OffscreenCanvas;
  private terrainCtx: OffscreenCanvasRenderingContext2D;
  private terrainDirty = true;
  private effects: Effect[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    // Set display size
    canvas.width = CANVAS_WIDTH * RENDER_SCALE;
    canvas.height = CANVAS_HEIGHT * RENDER_SCALE;

    // Offscreen canvas at native resolution
    this.offscreen = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    this.offCtx = this.offscreen.getContext('2d')!;

    // Full-map terrain canvas
    this.terrainCanvas = new OffscreenCanvas(1, 1);
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
  }

  addEffect(effect: Effect): void {
    this.effects.push(effect);
  }

  initTerrain(state: GameState): void {
    this.terrainCanvas = new OffscreenCanvas(state.mapWidth, state.mapHeight);
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.renderFullTerrain(state);
  }

  private renderFullTerrain(state: GameState): void {
    const { map, mapWidth, mapHeight } = state;
    const ctx = this.terrainCtx;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = map[y * mapWidth + x] as TileType;
        ctx.fillStyle = TILE_COLORS[tile];
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Paint base walls in player colors
    this.paintBaseWalls(state, ctx);

    this.terrainDirty = false;
  }

  /** Paint base wall tiles in the owning player's color */
  private paintBaseWalls(state: GameState, ctx: OffscreenCanvasRenderingContext2D): void {
    const entranceOffset = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);

    for (let p = 0; p < 2; p++) {
      const base = state.players[p].base;
      ctx.fillStyle = PLAYER_DARK_COLORS[p];

      for (let dy = 0; dy < BASE_SIZE; dy++) {
        for (let dx = 0; dx < BASE_SIZE; dx++) {
          const isEdge = dx === 0 || dx === BASE_SIZE - 1 || dy === 0 || dy === BASE_SIZE - 1;
          if (!isEdge) continue;

          const isTopBottom = dy === 0 || dy === BASE_SIZE - 1;
          const isLeftRight = dx === 0 || dx === BASE_SIZE - 1;
          let isEntrance = false;
          if (isTopBottom && dx >= entranceOffset && dx < entranceOffset + BASE_ENTRANCE_WIDTH) isEntrance = true;
          if (isLeftRight && dy >= entranceOffset && dy < entranceOffset + BASE_ENTRANCE_WIDTH) isEntrance = true;
          if (isEntrance) continue;

          ctx.fillRect(base.x + dx, base.y + dy, 1, 1);
        }
      }
    }
  }

  private updateDirtyTerrain(state: GameState): void {
    const { map, mapWidth, dirtyTiles } = state;
    const ctx = this.terrainCtx;

    for (const idx of dirtyTiles) {
      const x = idx % mapWidth;
      const y = Math.floor(idx / mapWidth);
      const tile = map[idx] as TileType;

      if (tile === TileType.BaseWall) {
        // Determine which player owns this base wall
        let color = TILE_COLORS[tile];
        for (let p = 0; p < 2; p++) {
          const base = state.players[p].base;
          if (x >= base.x && x < base.x + BASE_SIZE && y >= base.y && y < base.y + BASE_SIZE) {
            color = PLAYER_DARK_COLORS[p];
            break;
          }
        }
        ctx.fillStyle = color;
      } else {
        ctx.fillStyle = TILE_COLORS[tile];
      }
      ctx.fillRect(x, y, 1, 1);
    }
    dirtyTiles.clear();
  }

  /** Render the entire map scaled to fit the display canvas at full resolution.
   *  Returns the bottom Y of the map area in display pixels (for text placement). */
  renderFullMap(state: GameState, reserveBottom = 0): number {
    if (state.dirtyTiles.size > 0) {
      this.updateDirtyTerrain(state);
    }

    const displayCtx = this.canvas.getContext('2d')!;
    const dispW = this.canvas.width;
    const dispH = this.canvas.height;

    displayCtx.fillStyle = CGA_PALETTE[0];
    displayCtx.fillRect(0, 0, dispW, dispH);

    // Scale map to fit display canvas, reserving space at bottom
    const reservePx = reserveBottom * RENDER_SCALE;
    const availH = dispH - reservePx;
    const scaleX = dispW / state.mapWidth;
    const scaleY = availH / state.mapHeight;
    const scale = Math.min(scaleX, scaleY);
    const drawW = Math.floor(state.mapWidth * scale);
    const drawH = Math.floor(state.mapHeight * scale);
    const offsetX = Math.floor((dispW - drawW) / 2);
    const offsetY = Math.floor((availH - drawH) / 2);

    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(
      this.terrainCanvas,
      0, 0, state.mapWidth, state.mapHeight,
      offsetX, offsetY, drawW, drawH,
    );

    // Brighten tunnels so they stand out
    displayCtx.globalCompositeOperation = 'lighten';
    displayCtx.fillStyle = '#1a1a2a';
    displayCtx.fillRect(offsetX, offsetY, drawW, drawH);
    displayCtx.globalCompositeOperation = 'source-over';

    // Draw tanks on map overview
    for (let t = 0; t < 2; t++) {
      const tank = state.players[t];
      if (!tank.alive) continue;
      const tx = offsetX + tank.x * scale;
      const ty = offsetY + tank.y * scale;
      const ts = Math.max(3, Math.ceil(TANK_SIZE * scale));
      displayCtx.fillStyle = PLAYER_COLORS[t];
      displayCtx.fillRect(tx, ty, ts, ts);
    }

    // Draw particles on map overview
    const ps = Math.max(1, Math.ceil(scale));
    for (const particle of state.particles) {
      const px = offsetX + Math.floor(particle.x) * scale;
      const py = offsetY + Math.floor(particle.y) * scale;
      displayCtx.fillStyle = CGA_PALETTE[particle.color];
      displayCtx.fillRect(px, py, ps, ps);
    }

    return offsetY + drawH;
  }

  render(state: GameState): void {
    // Update terrain
    if (state.dirtyTiles.size > 0) {
      this.updateDirtyTerrain(state);
    }

    const ctx = this.offCtx;
    ctx.fillStyle = CGA_PALETTE[0];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Update viewports
    for (let p = 0; p < 2; p++) {
      const player = state.players[p];
      const vp = calculateViewport(player.x, player.y, state.mapWidth, state.mapHeight);
      state.viewports[p].scrollX = vp.scrollX;
      state.viewports[p].scrollY = vp.scrollY;
    }

    // Draw player viewports
    for (let p = 0; p < 2; p++) {
      const viewX = p === 0 ? 0 : VIEWPORT_WIDTH + STATUS_PANEL_WIDTH;
      const vp = state.viewports[p];

      // Draw terrain slice from terrain canvas
      ctx.drawImage(
        this.terrainCanvas,
        vp.scrollX, vp.scrollY, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
        viewX, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
      );

      // Draw tanks
      for (let t = 0; t < 2; t++) {
        const tank = state.players[t];
        if (!tank.alive) continue;

        const sx = tank.x - vp.scrollX + viewX;
        const sy = tank.y - vp.scrollY;

        // Check if tank is visible in this viewport
        if (sx + TANK_SIZE < viewX || sx >= viewX + VIEWPORT_WIDTH) continue;
        if (sy + TANK_SIZE < 0 || sy >= VIEWPORT_HEIGHT) continue;

        const sprite = getTankSprite(tank.direction);
        for (let dy = 0; dy < 5; dy++) {
          for (let dx = 0; dx < 5; dx++) {
            const pixel = sprite[dy][dx];
            if (pixel === 0) continue;
            const px = sx + dx;
            const py = sy + dy;
            if (px < viewX || px >= viewX + VIEWPORT_WIDTH) continue;
            if (py < 0 || py >= VIEWPORT_HEIGHT) continue;
            ctx.fillStyle = pixel === 2 ? PLAYER_COLORS[t] : PLAYER_DARK_COLORS[t];
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }

      // Draw bullets
      for (let t = 0; t < 2; t++) {
        const bullets = state.players[t].bullets;
        ctx.fillStyle = CGA_PALETTE[15]; // white
        for (const bullet of bullets) {
          const bx = bullet.x - vp.scrollX + viewX;
          const by = bullet.y - vp.scrollY;
          if (bx >= viewX && bx < viewX + VIEWPORT_WIDTH &&
              by >= 0 && by < VIEWPORT_HEIGHT) {
            ctx.fillRect(bx, by, 1, 1);
          }
        }
      }

      // Draw explosion particles
      for (const particle of state.particles) {
        const px = Math.floor(particle.x) - vp.scrollX + viewX;
        const py = Math.floor(particle.y) - vp.scrollY;
        if (px >= viewX && px < viewX + VIEWPORT_WIDTH &&
            py >= 0 && py < VIEWPORT_HEIGHT) {
          ctx.fillStyle = CGA_PALETTE[particle.color];
          ctx.fillRect(px, py, 1, 1);
        }
      }

      // Draw effects (muzzle flash)
      drawEffects(ctx, this.effects, vp.scrollX, vp.scrollY, viewX);

      // Static interference
      const player = state.players[p];
      drawStaticInterference(
        ctx, player.energy,
        viewX, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
        state.tickCount,
      );
    }

    // Draw status panel
    drawStatusPanel(ctx, state);

    // Tick effects
    this.effects = this.effects
      .map(e => ({ ...e, framesLeft: e.framesLeft - 1 }))
      .filter(e => e.framesLeft > 0);

    // Scale up to display canvas
    const displayCtx = this.canvas.getContext('2d')!;
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(
      this.offscreen,
      0, 0, CANVAS_WIDTH, CANVAS_HEIGHT,
      0, 0, this.canvas.width, this.canvas.height,
    );
  }
}
