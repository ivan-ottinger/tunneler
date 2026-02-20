import { createNoise2D } from 'simplex-noise';
import { GameState, Effect, TileType } from '../types.js';
import {
  RENDER_SCALE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
  STATUS_PANEL_WIDTH, CANVAS_WIDTH, CANVAS_HEIGHT,
  TILE_COLORS, PLAYER_COLORS, PLAYER_DARK_COLORS, TANK_SIZE,
  CGA_PALETTE, BASE_SIZE, BASE_ENTRANCE_WIDTH, BASE_CAMP_TIMEOUT,
  RESPAWN_TICKS, OUTPOST_COLOR,
  DIRT_PALETTE, DIRT_VARIANT_PALETTE,
  DIRT_PALETTE_EDGE, DIRT_VARIANT_PALETTE_EDGE,
} from '../constants.js';
import { createRng } from '../map/sfc32.js';
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
  private dirtNoise: ((x: number, y: number) => number) | null = null;

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
    this.dirtNoise = createNoise2D(createRng(state.seed + 100));
    this.renderFullTerrain(state);
  }

  private renderFullTerrain(state: GameState): void {
    const { map, mapWidth, mapHeight } = state;
    const ctx = this.terrainCtx;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = map[y * mapWidth + x] as TileType;
        if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
          ctx.fillStyle = this.getDirtColor(x, y, tile, map, mapWidth, mapHeight);
        } else {
          ctx.fillStyle = TILE_COLORS[tile];
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Paint base walls in player colors
    this.paintBaseWalls(state, ctx);

    this.terrainDirty = false;
  }

  /** Compute a rich dirt color using multi-octave noise + edge darkening */
  private getDirtColor(
    x: number, y: number, tile: TileType,
    map: Uint8Array, mapWidth: number, mapHeight: number,
  ): string {
    if (!this.dirtNoise) return TILE_COLORS[tile];

    // 3 octaves of noise for natural geological variation
    const n =
      this.dirtNoise(x * 0.008, y * 0.008) * 0.5 +
      this.dirtNoise(x * 0.03,  y * 0.03)  * 0.3 +
      this.dirtNoise(x * 0.12,  y * 0.12)  * 0.2;

    const isVariant = tile === TileType.DirtVariant;
    const palette = isVariant ? DIRT_VARIANT_PALETTE : DIRT_PALETTE;
    const edgePalette = isVariant ? DIRT_VARIANT_PALETTE_EDGE : DIRT_PALETTE_EDGE;

    // Map noise [-1, 1] → palette index
    const normalized = Math.max(0, Math.min(1, (n + 1) / 2));
    const index = Math.min(Math.floor(normalized * palette.length), palette.length - 1);

    // Darken dirt adjacent to open space for tunnel depth
    const isEdge = this.isAdjacentToEmpty(x, y, map, mapWidth, mapHeight);
    return isEdge ? edgePalette[index] : palette[index];
  }

  /** Check if a tile has any empty/interior neighbor (8-connected) */
  private isAdjacentToEmpty(
    x: number, y: number,
    map: Uint8Array, mapWidth: number, mapHeight: number,
  ): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue;
        const t = map[ny * mapWidth + nx];
        if (t === TileType.Empty || t === TileType.BaseInterior) return true;
      }
    }
    return false;
  }

  /** Paint base wall tiles in the owning player's color */
  private paintBaseWalls(state: GameState, ctx: OffscreenCanvasRenderingContext2D): void {
    const entranceOffset = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);

    // Player bases + outpost
    const bases = [
      { base: state.players[0].base, color: PLAYER_DARK_COLORS[0] },
      { base: state.players[1].base, color: PLAYER_DARK_COLORS[1] },
      { base: state.outpost, color: OUTPOST_COLOR },
    ];

    for (const { base, color } of bases) {
      ctx.fillStyle = color;

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
    const { map, mapWidth, mapHeight, dirtyTiles } = state;
    const ctx = this.terrainCtx;

    // Expand dirty set: when a tile becomes empty, its dirt neighbors
    // may need edge darkening updated
    const toRender = new Set(dirtyTiles);
    for (const idx of dirtyTiles) {
      const tile = map[idx] as TileType;
      if (tile === TileType.Empty || tile === TileType.BaseInterior) {
        const x = idx % mapWidth;
        const y = Math.floor(idx / mapWidth);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue;
            const nIdx = ny * mapWidth + nx;
            const nTile = map[nIdx] as TileType;
            if (nTile === TileType.Dirt || nTile === TileType.DirtVariant) {
              toRender.add(nIdx);
            }
          }
        }
      }
    }

    for (const idx of toRender) {
      const x = idx % mapWidth;
      const y = Math.floor(idx / mapWidth);
      const tile = map[idx] as TileType;

      if (tile === TileType.BaseWall) {
        // Determine which player/outpost owns this base wall
        let color = TILE_COLORS[tile];
        for (let p = 0; p < 2; p++) {
          const base = state.players[p].base;
          if (x >= base.x && x < base.x + BASE_SIZE && y >= base.y && y < base.y + BASE_SIZE) {
            color = PLAYER_DARK_COLORS[p];
            break;
          }
        }
        const outpost = state.outpost;
        if (x >= outpost.x && x < outpost.x + BASE_SIZE && y >= outpost.y && y < outpost.y + BASE_SIZE) {
          color = OUTPOST_COLOR;
        }
        ctx.fillStyle = color;
      } else if (tile === TileType.Dirt || tile === TileType.DirtVariant) {
        ctx.fillStyle = this.getDirtColor(x, y, tile, map, mapWidth, mapHeight);
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

      // Dim base walls if player is camping (regen exhausted)
      for (let t = 0; t < 2; t++) {
        const owner = state.players[t];
        if (owner.baseCampTicks <= BASE_CAMP_TIMEOUT) continue;
        const base = owner.base;
        const entrOff = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);
        ctx.fillStyle = CGA_PALETTE[8]; // dim to dark gray
        for (let dy = 0; dy < BASE_SIZE; dy++) {
          for (let dx = 0; dx < BASE_SIZE; dx++) {
            const isEdge = dx === 0 || dx === BASE_SIZE - 1 || dy === 0 || dy === BASE_SIZE - 1;
            if (!isEdge) continue;
            const isTopBot = dy === 0 || dy === BASE_SIZE - 1;
            const isLR = dx === 0 || dx === BASE_SIZE - 1;
            let isEntr = false;
            if (isTopBot && dx >= entrOff && dx < entrOff + BASE_ENTRANCE_WIDTH) isEntr = true;
            if (isLR && dy >= entrOff && dy < entrOff + BASE_ENTRANCE_WIDTH) isEntr = true;
            if (isEntr) continue;
            const wx = (base.x + dx) - vp.scrollX + viewX;
            const wy = (base.y + dy) - vp.scrollY;
            if (wx >= viewX && wx < viewX + VIEWPORT_WIDTH && wy >= 0 && wy < VIEWPORT_HEIGHT) {
              ctx.fillRect(wx, wy, 1, 1);
            }
          }
        }
      }

      // Draw tanks (pulsate if invulnerable)
      for (let t = 0; t < 2; t++) {
        const tank = state.players[t];
        if (!tank.alive) continue;

        const sx = tank.x - vp.scrollX + viewX;
        const sy = tank.y - vp.scrollY;

        // Check if tank is visible in this viewport
        if (sx + TANK_SIZE < viewX || sx >= viewX + VIEWPORT_WIDTH) continue;
        if (sy + TANK_SIZE < 0 || sy >= VIEWPORT_HEIGHT) continue;

        // Invulnerability pulse: smoothly cycle opacity using a sine wave
        let invulnAlpha = 1;
        if (tank.invulnTicks > 0) {
          invulnAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(state.tickCount * 0.8));
        }

        const sprite = getTankSprite(tank.direction);
        for (let dy = 0; dy < 5; dy++) {
          for (let dx = 0; dx < 5; dx++) {
            const pixel = sprite[dy][dx];
            if (pixel === 0) continue;
            const px = sx + dx;
            const py = sy + dy;
            if (px < viewX || px >= viewX + VIEWPORT_WIDTH) continue;
            if (py < 0 || py >= VIEWPORT_HEIGHT) continue;
            ctx.globalAlpha = invulnAlpha;
            ctx.fillStyle = pixel === 2 ? PLAYER_COLORS[t] : PLAYER_DARK_COLORS[t];
            ctx.fillRect(px, py, 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Draw bullets
      for (let t = 0; t < 2; t++) {
        const bullets = state.players[t].bullets;
        ctx.fillStyle = CGA_PALETTE[15]; // white
        for (const bullet of bullets) {
          const bx = Math.floor(bullet.x) - vp.scrollX + viewX;
          const by = Math.floor(bullet.y) - vp.scrollY;
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

      // Static interference — ramps to full static when dead
      const player = state.players[p];
      const deadTicks = !player.alive ? (RESPAWN_TICKS - player.respawnTimer) : 0;
      drawStaticInterference(
        ctx, player.energy,
        viewX, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
        state.tickCount,
        deadTicks,
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
