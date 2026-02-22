import { BonusType, GameState, RenderContext } from '../types.js';
import {
  CGA_PALETTE, MAX_ENERGY, MAX_SHIELD,
  VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CANVAS_WIDTH, HUD_HEIGHT,
  KILLS_TO_WIN, PLAYER_COLORS, BASE_CAMP_TIMEOUT, AI_PLAYER_INDEX,
} from '../constants.js';
import { drawBitmapText } from './BitmapFont.js';

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

/** Draw the horizontal HUD strip below the viewports */
export function drawStatusPanel(
  ctx: RenderContext,
  state: GameState,
): void {
  const hudY = VIEWPORT_HEIGHT;
  const playerCount = state.players.length;

  // Background
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(0, hudY, CANVAS_WIDTH, HUD_HEIGHT);

  // Top border
  ctx.fillStyle = CGA_PALETTE[8];
  ctx.fillRect(0, hudY, CANVAS_WIDTH, 1);

  // Display order: P1 (left), AI (center), P2 (right)
  const displayOrder: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (i !== AI_PLAYER_INDEX) displayOrder.push(i);
  }
  // Insert AI in the middle
  if (AI_PLAYER_INDEX < playerCount) {
    displayOrder.splice(1, 0, AI_PLAYER_INDEX);
  }

  const colW = Math.floor(CANVAS_WIDTH / playerCount);
  const barW = 20;
  const barH = 3;

  for (let col = 0; col < displayOrder.length; col++) {
    const p = displayOrder[col];
    const player = state.players[p];
    const playerColor = PLAYER_COLORS[p];
    const colX = col * colW;

    // Player label
    const label = player.isAI ? 'AI' : `P${p + 1}`;
    const labelX = colX + 2;
    const labelY = hudY + 2;
    drawBitmapText(ctx, label, labelX, labelY, playerColor, 1);

    // Score ticks right after label
    const labelW = label.length * 4;
    const scoreX = labelX + labelW + 1;
    const scoreY = labelY + 1;
    for (let s = 0; s < KILLS_TO_WIN; s++) {
      ctx.fillStyle = s < player.score ? playerColor : CGA_PALETTE[8];
      ctx.fillRect(scoreX + s * 3, scoreY, 2, 3);
    }

    // Energy bar
    const barX = colX + colW - barW - 1;
    const energyY = hudY + 2;
    const regenDead = player.baseCampTicks > BASE_CAMP_TIMEOUT;
    const flash = regenDead && (state.tickCount % 6 < 3);
    const eColor = flash ? CGA_PALETTE[12] : CGA_PALETTE[3];
    drawBar(ctx, barX, energyY, barW, barH, player.energy, MAX_ENERGY, eColor, CGA_PALETTE[7]);

    // Shield bar
    const shieldY = energyY + barH + 1;
    drawBar(ctx, barX, shieldY, barW, barH, player.shield, MAX_SHIELD, CGA_PALETTE[12], CGA_PALETTE[7]);

    // Bonus indicator below label (human players only)
    if (!player.isAI && player.bonus !== BonusType.None) {
      const bonusY = hudY + 9;
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
      drawBitmapText(ctx, bonusLabels[player.bonus] ?? '', labelX, bonusY, bonusColors[player.bonus] ?? CGA_PALETTE[15], 1);
    }

    // Column divider (except after last)
    if (col < displayOrder.length - 1) {
      ctx.fillStyle = CGA_PALETTE[8];
      ctx.fillRect(colX + colW, hudY + 1, 1, HUD_HEIGHT - 1);
    }
  }
}
