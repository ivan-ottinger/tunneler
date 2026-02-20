import { GameState, RenderContext } from '../types.js';
import { CGA_PALETTE, PLAYER_COLORS, RENDER_SCALE } from '../constants.js';
import { drawBitmapTextCentered } from '../render/BitmapFont.js';

/** Height reserved below the map for game over text (in native pixels) */
export const GAME_OVER_TEXT_HEIGHT = 14;

/** Draw game over text at display resolution.
 *  mapBottomY is in display pixels (from renderFullMap). */
export function drawGameOverScreen(
  ctx: RenderContext,
  state: GameState,
  mapBottomY: number,
  displayWidth: number,
): void {
  const cx = Math.floor(displayWidth / 2);
  const textScale = RENDER_SCALE; // match the display scale

  // Winner + score below the map
  const winnerColor = PLAYER_COLORS[state.winner];
  const winnerLabel = state.players[state.winner].isAI ? 'AI WINS' : `P${state.winner + 1} WINS`;
  const score = state.players.map(p => p.score).join(' - ');
  drawBitmapTextCentered(ctx, `${winnerLabel}  ${score}`, cx, mapBottomY + 8, winnerColor, textScale);

  // Prompts
  drawBitmapTextCentered(ctx, 'SPACE = REMATCH   ESC = TITLE', cx, mapBottomY + 8 + textScale * 7, CGA_PALETTE[8], textScale);
}
