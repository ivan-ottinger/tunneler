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
  deadTicks = 0,
): void {
  const threshold = MAX_ENERGY * 0.2;
  if (deadTicks <= 0 && energy >= threshold) return;

  // Let explosion play for 12 ticks, then full static instantly
  const STATIC_DELAY = 12;
  const deadIntensity = deadTicks > STATIC_DELAY ? 1.0 : 0;
  const energyIntensity = energy < threshold ? 1 - (energy / threshold) : 0;
  const intensity = Math.max(deadIntensity, energyIntensity);
  const rng = createRng(tickCount * 7919);

  // When dead and past delay: fill every pixel with random noise
  if (deadIntensity > 0) {
    // Black out viewport first, then draw noise on top
    ctx.fillStyle = CGA_PALETTE[0];
    ctx.fillRect(viewX, viewY, viewW, viewH);

    for (let y = 0; y < viewH; y++) {
      for (let x = 0; x < viewW; x++) {
        // At low deadIntensity, skip some pixels to let explosion show through
        if (rng() > deadIntensity) continue;

        const brightness = rng();
        if (brightness > 0.7) {
          ctx.fillStyle = CGA_PALETTE[15]; // white
        } else if (brightness > 0.4) {
          ctx.fillStyle = CGA_PALETTE[7];  // light gray
        } else if (brightness > 0.15) {
          ctx.fillStyle = CGA_PALETTE[8];  // dark gray
        } else {
          ctx.fillStyle = CGA_PALETTE[0];  // black
        }
        ctx.fillRect(viewX + x, viewY + y, 1, 1);
      }
    }

    // Rolling horizontal bars for extra TV static feel
    const barCount = 6;
    for (let b = 0; b < barCount; b++) {
      const barY = ((tickCount * (2 + b)) + b * 17) % viewH;
      const barH = 2 + Math.floor(rng() * 3);
      ctx.fillStyle = `rgba(255, 255, 255, ${deadIntensity * 0.2})`;
      ctx.fillRect(viewX, viewY + barY, viewW, barH);
    }
    return;
  }

  // Low-energy static: sparse scan line noise
  const bandHeight = 3 + Math.floor(rng() * 5);
  const bandOffset = (tickCount * 3) % viewH;

  for (let y = 0; y < viewH; y++) {
    const distFromBand = Math.abs(((y + bandOffset) % viewH) - viewH / 2);
    const bandFactor = distFromBand < bandHeight ? 1.0 : 0.0;
    const rowIntensity = intensity * 0.4 + bandFactor * intensity * 0.6;

    if (rng() > rowIntensity) continue;

    for (let x = 0; x < viewW; x++) {
      if (rng() > rowIntensity * 0.7) continue;

      const brightness = rng();
      if (brightness > 0.7) {
        ctx.fillStyle = CGA_PALETTE[15];
      } else if (brightness > 0.4) {
        ctx.fillStyle = CGA_PALETTE[7];
      } else {
        ctx.fillStyle = CGA_PALETTE[8];
      }
      ctx.fillRect(viewX + x, viewY + y, 1, 1);
    }
  }

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
