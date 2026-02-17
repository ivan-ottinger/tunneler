import { RenderContext } from '../types.js';
import { CGA_PALETTE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { drawBitmapTextCentered } from '../render/BitmapFont.js';

export function drawTitleScreen(ctx: RenderContext): void {
  ctx.fillStyle = CGA_PALETTE[0];
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cx = Math.floor(CANVAS_WIDTH / 2);

  // "TUNNELER" title at 3x scale
  drawBitmapTextCentered(ctx, 'TUNNELER', cx, 6, CGA_PALETTE[14], 3);

  // Player 1 controls
  drawBitmapTextCentered(ctx, 'PLAYER 1', cx, 28, CGA_PALETTE[9], 1);
  drawBitmapTextCentered(ctx, 'WASD + SPACE', cx, 35, CGA_PALETTE[7], 1);

  // Player 2 controls
  drawBitmapTextCentered(ctx, 'PLAYER 2', cx, 44, CGA_PALETTE[2], 1);
  drawBitmapTextCentered(ctx, 'UHJK OR ARROWS', cx, 51, CGA_PALETTE[7], 1);
  drawBitmapTextCentered(ctx, '+ ENTER', cx, 58, CGA_PALETTE[7], 1);

  // Start prompt
  drawBitmapTextCentered(ctx, 'PRESS SPACE', cx, 67, CGA_PALETTE[15], 1);
}
