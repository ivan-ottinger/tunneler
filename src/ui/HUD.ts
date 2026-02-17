import { Player, RenderContext } from '../types.js';
import { CGA_PALETTE, MAX_ENERGY, MAX_SHIELD, VIEWPORT_WIDTH } from '../constants.js';

/** Draw per-viewport HUD overlay (energy/shield mini-bars) */
export function drawHUD(
  ctx: RenderContext,
  player: Player,
  viewX: number,
): void {
  if (!player.alive) return;

  const barW = 20;
  const barH = 2;
  const x = viewX + VIEWPORT_WIDTH - barW - 2;

  // Energy bar
  const energyY = 2;
  const energyFill = Math.floor((player.energy / MAX_ENERGY) * barW);
  ctx.fillStyle = CGA_PALETTE[8];
  ctx.fillRect(x, energyY, barW, barH);
  ctx.fillStyle = CGA_PALETTE[3]; // cyan
  ctx.fillRect(x, energyY, energyFill, barH);

  // Shield bar
  const shieldY = energyY + barH + 1;
  const shieldFill = Math.floor((player.shield / MAX_SHIELD) * barW);
  ctx.fillStyle = CGA_PALETTE[8];
  ctx.fillRect(x, shieldY, barW, barH);
  ctx.fillStyle = CGA_PALETTE[4]; // red
  ctx.fillRect(x, shieldY, shieldFill, barH);
}
