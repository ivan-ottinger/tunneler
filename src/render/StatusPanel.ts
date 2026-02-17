import { GameState, RenderContext } from '../types.js';
import {
  CGA_PALETTE, MAX_ENERGY, MAX_SHIELD,
  VIEWPORT_WIDTH, STATUS_PANEL_WIDTH, VIEWPORT_HEIGHT,
  KILLS_TO_WIN, PLAYER_COLORS,
} from '../constants.js';
import { drawBitmapText, drawBitmapTextCentered } from './BitmapFont.js';

function drawBar(
  ctx: RenderContext,
  x: number, y: number, w: number,
  fill: number, max: number,
  fillColor: string, borderColor: string,
): void {
  const innerW = w - 2;
  const fillW = Math.max(0, Math.floor((fill / max) * innerW));
  // Border
  ctx.fillStyle = borderColor;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + 4, w, 1);
  ctx.fillRect(x, y, 1, 5);
  ctx.fillRect(x + w - 1, y, 1, 5);
  // Background
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(x + 1, y + 1, innerW, 3);
  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 1, y + 1, fillW, 3);
}

/** Draw the center status panel on the offscreen canvas */
export function drawStatusPanel(
  ctx: RenderContext,
  state: GameState,
): void {
  const panelX = VIEWPORT_WIDTH;
  const panelW = STATUS_PANEL_WIDTH;
  const panelCx = panelX + Math.floor(panelW / 2);

  // Background
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(panelX, 0, panelW, VIEWPORT_HEIGHT);

  // Border lines
  ctx.fillStyle = CGA_PALETTE[8];
  ctx.fillRect(panelX, 0, 1, VIEWPORT_HEIGHT);
  ctx.fillRect(panelX + panelW - 1, 0, 1, VIEWPORT_HEIGHT);

  const barX = panelX + 3;
  const barW = panelW - 6;

  for (let p = 0; p < 2; p++) {
    const player = state.players[p];
    const playerColor = PLAYER_COLORS[p];
    const halfH = Math.floor(VIEWPORT_HEIGHT / 2);
    const yBase = p * halfH + 2;

    // Player label
    drawBitmapTextCentered(ctx, `P${p + 1}`, panelCx, yBase, playerColor, 1);

    // Score ticks
    const scoreY = yBase + 7;
    for (let s = 0; s < KILLS_TO_WIN; s++) {
      ctx.fillStyle = s < player.score ? playerColor : CGA_PALETTE[8];
      const tickW = Math.floor(barW / KILLS_TO_WIN);
      ctx.fillRect(barX + s * (tickW + 1), scoreY, tickW, 2);
    }

    // Energy label + bar
    const energyLabelY = scoreY + 5;
    drawBitmapText(ctx, 'E', barX, energyLabelY, CGA_PALETTE[3], 1);
    drawBar(ctx, barX + 5, energyLabelY, barW - 5,
      player.energy, MAX_ENERGY, CGA_PALETTE[3], CGA_PALETTE[7]);

    // Health label + bar (same style as energy)
    const healthLabelY = energyLabelY + 8;
    drawBitmapText(ctx, 'H', barX, healthLabelY, CGA_PALETTE[12], 1);
    drawBar(ctx, barX + 5, healthLabelY, barW - 5,
      player.shield, MAX_SHIELD, CGA_PALETTE[12], CGA_PALETTE[7]);
  }

  // Divider between players
  ctx.fillStyle = CGA_PALETTE[8];
  const midY = Math.floor(VIEWPORT_HEIGHT / 2);
  ctx.fillRect(panelX + 2, midY, panelW - 4, 1);
}
