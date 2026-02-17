import { Effect, RenderContext } from '../types.js';
import { CGA_PALETTE, MAX_ENERGY } from '../constants.js';
import { createRng } from '../map/sfc32.js';

/** Draw TV static interference when energy is low — covers entire viewport */
export function drawStaticInterference(
  ctx: RenderContext,
  energy: number,
  viewX: number, viewY: number,
  viewW: number, viewH: number,
  tickCount: number,
): void {
  const threshold = MAX_ENERGY * 0.2;
  if (energy >= threshold) return;

  const intensity = 1 - (energy / threshold); // 0..1, higher = worse
  const rng = createRng(tickCount * 7919);

  // Horizontal scan line distortion — rolling bands of noise
  const bandHeight = 3 + Math.floor(rng() * 5);
  const bandOffset = (tickCount * 3) % viewH; // rolls down the screen

  for (let y = 0; y < viewH; y++) {
    // Distance from rolling band center determines local intensity
    const distFromBand = Math.abs(((y + bandOffset) % viewH) - viewH / 2);
    const bandFactor = distFromBand < bandHeight ? 1.0 : 0.0;
    const rowIntensity = intensity * 0.4 + bandFactor * intensity * 0.6;

    if (rng() > rowIntensity) continue;

    // Full-width scan line noise
    for (let x = 0; x < viewW; x++) {
      if (rng() > rowIntensity * 0.7) continue;

      const brightness = rng();
      if (brightness > 0.7) {
        ctx.fillStyle = CGA_PALETTE[15]; // white
      } else if (brightness > 0.4) {
        ctx.fillStyle = CGA_PALETTE[7];  // light gray
      } else {
        ctx.fillStyle = CGA_PALETTE[8];  // dark gray
      }
      ctx.fillRect(viewX + x, viewY + y, 1, 1);
    }
  }

  // At very low energy, add thick horizontal bars that roll across
  if (intensity > 0.5) {
    const barCount = Math.floor(intensity * 4);
    for (let b = 0; b < barCount; b++) {
      const barY = ((tickCount * (2 + b)) + b * 17) % viewH;
      const barH = 2 + Math.floor(rng() * 3);
      ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.15})`;
      ctx.fillRect(viewX, viewY + barY, viewW, barH);
    }
  }
}

/** Draw muzzle flash effects */
export function drawEffects(
  ctx: RenderContext,
  effects: Effect[],
  scrollX: number, scrollY: number,
  viewOffsetX: number,
): void {
  for (const effect of effects) {
    const sx = effect.x - scrollX + viewOffsetX;
    const sy = effect.y - scrollY;

    if (effect.type === 'muzzleFlash') {
      ctx.fillStyle = CGA_PALETTE[14]; // yellow
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}
