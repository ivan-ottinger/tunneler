import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../constants.js';

/** Calculate camera scroll to center on player, clamped to map bounds */
export function calculateViewport(
  playerX: number,
  playerY: number,
  mapWidth: number,
  mapHeight: number,
): { scrollX: number; scrollY: number } {
  const halfW = Math.floor(VIEWPORT_WIDTH / 2);
  const halfH = Math.floor(VIEWPORT_HEIGHT / 2);

  let scrollX = playerX - halfW;
  let scrollY = playerY - halfH;

  // Clamp to map bounds
  scrollX = Math.max(0, Math.min(scrollX, mapWidth - VIEWPORT_WIDTH));
  scrollY = Math.max(0, Math.min(scrollY, mapHeight - VIEWPORT_HEIGHT));

  return { scrollX, scrollY };
}
