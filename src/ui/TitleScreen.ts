import { RenderContext } from '../types.js';
import { CGA_PALETTE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { drawBitmapTextCentered } from '../render/BitmapFont.js';

export function drawTitleScreen(ctx: RenderContext, aiEnabled = true): void {
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cx = Math.floor(CANVAS_WIDTH / 2);

  // "TUNNELER" title at 3x scale (15px tall)
  drawBitmapTextCentered(ctx, 'TUNNELER', cx, 2, CGA_PALETTE[14], 3);

  // Player 1 controls
  drawBitmapTextCentered(ctx, 'PLAYER 1', cx, 19, CGA_PALETTE[9], 1);
  drawBitmapTextCentered(ctx, 'WASD + SPACE', cx, 25, CGA_PALETTE[7], 1);

  // Player 2 controls
  drawBitmapTextCentered(ctx, 'PLAYER 2', cx, 32, CGA_PALETTE[2], 1);
  drawBitmapTextCentered(ctx, 'UHJK OR ARROWS + ENTER', cx, 38, CGA_PALETTE[7], 1);

  // AI toggle
  const aiColor = aiEnabled ? CGA_PALETTE[13] : CGA_PALETTE[8];
  const aiLabel = aiEnabled ? 'AI TANK: ON' : 'AI TANK: OFF';
  drawBitmapTextCentered(ctx, aiLabel, cx, 47, aiColor, 1);
  drawBitmapTextCentered(ctx, 'T = TOGGLE AI', cx, 54, CGA_PALETTE[8], 1);

  // Start prompt
  drawBitmapTextCentered(ctx, 'PRESS SPACE', cx, 64, CGA_PALETTE[15], 1);
}
