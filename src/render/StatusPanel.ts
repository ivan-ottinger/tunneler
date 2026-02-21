import { BonusType, GameState, RenderContext } from '../types.js';
import {
  CGA_PALETTE, MAX_ENERGY, MAX_SHIELD,
  VIEWPORT_WIDTH, STATUS_PANEL_WIDTH, VIEWPORT_HEIGHT,
  KILLS_TO_WIN, PLAYER_COLORS, BASE_CAMP_TIMEOUT,
} from '../constants.js';
import { drawBitmapText, drawBitmapTextCentered } from './BitmapFont.js';

function drawBar(
  ctx: RenderContext,
  x: number, y: number, w: number, h: number,
  fill: number, max: number,
  fillColor: string, borderColor: string,
): void {
  const innerW = w - 2;
  const innerH = h - 2;
  const fillW = Math.max(0, Math.floor((fill / max) * innerW));
  // Border
  ctx.fillStyle = borderColor;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  // Background
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(x + 1, y + 1, innerW, innerH);
  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 1, y + 1, fillW, innerH);
}

/** Draw the center status panel on the offscreen canvas */
export function drawStatusPanel(
  ctx: RenderContext,
  state: GameState,
): void {
  const panelX = VIEWPORT_WIDTH;
  const panelW = STATUS_PANEL_WIDTH;
  const panelCx = panelX + Math.floor(panelW / 2);
  const playerCount = state.players.length;

  // Background
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(panelX, 0, panelW, VIEWPORT_HEIGHT);

  // Border lines
  ctx.fillStyle = CGA_PALETTE[8];
  ctx.fillRect(panelX, 0, 1, VIEWPORT_HEIGHT);
  ctx.fillRect(panelX + panelW - 1, 0, 1, VIEWPORT_HEIGHT);

  const barX = panelX + 3;
  const barW = panelW - 6;

  // Use compact layout when 3+ players
  const compact = playerCount > 2;
  const sectionH = Math.floor(VIEWPORT_HEIGHT / playerCount);
  const barH = compact ? 3 : 5;

  for (let p = 0; p < playerCount; p++) {
    const player = state.players[p];
    const playerColor = PLAYER_COLORS[p];
    const yBase = p * sectionH + 1;

    // Player label
    const label = player.isAI ? 'AI' : `P${p + 1}`;
    drawBitmapTextCentered(ctx, label, panelCx, yBase, playerColor, 1);

    // Score ticks
    const scoreY = yBase + 6;
    for (let s = 0; s < KILLS_TO_WIN; s++) {
      ctx.fillStyle = s < player.score ? playerColor : CGA_PALETTE[8];
      const tickW = Math.floor(barW / KILLS_TO_WIN);
      ctx.fillRect(barX + s * (tickW + 1), scoreY, tickW, 2);
    }

    // Energy bar
    const energyY = scoreY + (compact ? 3 : 5);
    const regenDead = player.baseCampTicks > BASE_CAMP_TIMEOUT;
    const flash = regenDead && (state.tickCount % 6 < 3);
    const eColor = flash ? CGA_PALETTE[12] : CGA_PALETTE[3];
    if (!compact) {
      drawBitmapText(ctx, 'E', barX, energyY, eColor, 1);
      drawBar(ctx, barX + 5, energyY, barW - 5, barH, player.energy, MAX_ENERGY, eColor, CGA_PALETTE[7]);
    } else {
      drawBar(ctx, barX, energyY, barW, barH, player.energy, MAX_ENERGY, eColor, CGA_PALETTE[7]);
    }

    // Health bar
    const healthY = energyY + barH + 1;
    if (!compact) {
      drawBitmapText(ctx, 'H', barX, healthY, CGA_PALETTE[12], 1);
      drawBar(ctx, barX + 5, healthY, barW - 5, barH, player.shield, MAX_SHIELD, CGA_PALETTE[12], CGA_PALETTE[7]);
    } else {
      drawBar(ctx, barX, healthY, barW, barH, player.shield, MAX_SHIELD, CGA_PALETTE[12], CGA_PALETTE[7]);
    }

    // Bonus indicator (skip for AI)
    if (!player.isAI && player.bonus !== BonusType.None) {
      const bonusY = healthY + barH + 1;
      const bonusLabels: Record<number, string> = {
        [BonusType.SpeedDig]: 'DIG',
        [BonusType.PowerCannon]: 'PWR',
        [BonusType.ScatterShot]: 'SCT',
        [BonusType.WideBore]: 'WDE',
      };
      const bonusColors: Record<number, string> = {
        [BonusType.SpeedDig]: CGA_PALETTE[10],
        [BonusType.PowerCannon]: CGA_PALETTE[12],
        [BonusType.ScatterShot]: CGA_PALETTE[14],
        [BonusType.WideBore]: CGA_PALETTE[11],
      };
      drawBitmapTextCentered(ctx, bonusLabels[player.bonus] ?? '', panelCx, bonusY, bonusColors[player.bonus] ?? CGA_PALETTE[15], 1);
    }

    // Divider after each section except the last
    if (p < playerCount - 1) {
      ctx.fillStyle = CGA_PALETTE[8];
      const divY = (p + 1) * sectionH;
      ctx.fillRect(panelX + 2, divY, panelW - 4, 1);
    }
  }
}
