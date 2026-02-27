import { GameState, RenderContext } from '../types.js';
import { CGA_PALETTE, PLAYER_COLORS, RENDER_SCALE } from '../constants.js';
import { drawBitmapText, drawBitmapTextCentered } from '../render/BitmapFont.js';

/** Height reserved below the map for game over text (in native pixels) */
export const GAME_OVER_TEXT_HEIGHT = 22;

/** Draw game over text at display resolution.
 *  mapBottomY is in display pixels (from renderFullMap). */
export function drawGameOverScreen(
  ctx: RenderContext,
  state: GameState,
  mapBottomY: number,
  displayWidth: number,
): void {
  const cx = Math.floor(displayWidth / 2);
  const bigScale = RENDER_SCALE; // 8
  const smallScale = RENDER_SCALE / 2; // 4

  // Winner + score below the map
  const winnerColor = PLAYER_COLORS[state.winner];
  const winnerLabel = state.players[state.winner].isAI ? 'AI WINS' : `P${state.winner + 1} WINS`;
  const score = state.players.map(p => p.score).join(' - ');
  drawBitmapTextCentered(ctx, `${winnerLabel}  ${score}`, cx, mapBottomY + 8, winnerColor, bigScale);

  // Stats table
  const headerY = mapBottomY + 52;
  const charW = 3 * smallScale + smallScale; // char width at half scale
  const colWidth = charW * 6; // 6 chars per column

  // Compute table start X — center the table
  // Columns: label(4) + DUG(6) + ACC(6) + BONUS(6) + DIED(6) = ~28 chars
  const tableChars = 28;
  const tableWidth = tableChars * charW;
  const tableX = Math.floor(cx - tableWidth / 2);

  // Column X positions (right-aligned values drawn from these offsets)
  const labelX = tableX;
  const dugX = tableX + charW * 5;
  const accX = dugX + colWidth;
  const bonusX = accX + colWidth;
  const diedX = bonusX + colWidth;

  // Compute stats for highlighting
  const players = state.players;
  let bestDug = -1, bestAcc = -1, lowestDied = Infinity;
  for (const p of players) {
    if (p.tilesDug > bestDug) bestDug = p.tilesDug;
    const acc = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
    if (acc > bestAcc) bestAcc = acc;
    if (p.deaths < lowestDied) lowestDied = p.deaths;
  }

  // Column headers
  const headerColor = CGA_PALETTE[7]; // light gray
  drawBitmapText(ctx, 'DUG', dugX, headerY, headerColor, smallScale);
  drawBitmapText(ctx, 'ACC', accX, headerY, headerColor, smallScale);
  drawBitmapText(ctx, 'BONUS', bonusX, headerY, headerColor, smallScale);
  drawBitmapText(ctx, 'DIED', diedX, headerY, headerColor, smallScale);

  // Player rows
  const yellow = CGA_PALETTE[14];
  const white = CGA_PALETTE[15];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const rowY = headerY + 24 + i * 24;
    const label = p.isAI ? 'AI' : `P${i + 1}`;
    const playerColor = PLAYER_COLORS[i];
    const acc = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;

    drawBitmapText(ctx, label, labelX, rowY, playerColor, smallScale);
    drawBitmapText(ctx, String(p.tilesDug), dugX, rowY, p.tilesDug === bestDug ? yellow : white, smallScale);
    drawBitmapText(ctx, String(acc), accX, rowY, acc === bestAcc ? yellow : white, smallScale);
    drawBitmapText(ctx, String(p.bonusesCollected), bonusX, rowY, white, smallScale);
    drawBitmapText(ctx, String(p.deaths), diedX, rowY, p.deaths === lowestDied ? yellow : white, smallScale);
  }

  // Prompts
  const promptY = headerY + 24 + players.length * 24 + 8;
  drawBitmapTextCentered(ctx, 'SPACE = REMATCH   ESC = TITLE', cx, promptY, CGA_PALETTE[8], smallScale);
}
