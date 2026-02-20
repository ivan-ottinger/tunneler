import { RenderContext } from '../types.js';
import { CGA_PALETTE, RENDER_SCALE } from '../constants.js';
import { drawBitmapTextCentered } from '../render/BitmapFont.js';

export function drawPauseScreen(
  ctx: RenderContext,
  selection: number,
  displayWidth: number,
  displayHeight: number,
): void {
  // Semi-transparent overlay to dim the frozen game
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  const cx = Math.floor(displayWidth / 2);
  const cy = Math.floor(displayHeight / 2);
  const s = RENDER_SCALE;

  // "PAUSED" title
  drawBitmapTextCentered(ctx, 'PAUSED', cx, cy - s * 12, CGA_PALETTE[14], s);

  // Prompt
  drawBitmapTextCentered(ctx, 'RETURN TO MENU?', cx, cy - s * 3, CGA_PALETTE[15], s);

  // Options: NO and YES
  const optionY = cy + s * 5;
  const gap = s * 16;

  const noColor = selection === 0 ? CGA_PALETTE[14] : CGA_PALETTE[8];
  const yesColor = selection === 1 ? CGA_PALETTE[14] : CGA_PALETTE[8];

  drawBitmapTextCentered(ctx, 'NO', cx - gap, optionY, noColor, s);
  drawBitmapTextCentered(ctx, 'YES', cx + gap, optionY, yesColor, s);

  // Selection brackets around chosen option
  if (selection === 0) {
    drawBitmapTextCentered(ctx, '> NO <', cx - gap, optionY, CGA_PALETTE[15], s);
  } else {
    drawBitmapTextCentered(ctx, '> YES <', cx + gap, optionY, CGA_PALETTE[15], s);
  }

  // Navigation hint
  drawBitmapTextCentered(ctx, 'LEFT RIGHT TO CHOOSE  SPACE TO CONFIRM', cx, cy + s * 14, CGA_PALETTE[8], Math.floor(s / 2));
}
