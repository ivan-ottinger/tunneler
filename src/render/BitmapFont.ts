import { RenderContext } from '../types.js';

/**
 * 3x5 pixel bitmap font. Each character is encoded as 5 rows of 3 bits.
 * Renders crisp pixel text at native resolution.
 */
const GLYPHS: Record<string, number[]> = {
  A: [0b111, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b111, 0b100, 0b100, 0b100, 0b111],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b111, 0b100, 0b101, 0b101, 0b111],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b111],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b101, 0b101],
  O: [0b111, 0b101, 0b101, 0b101, 0b111],
  P: [0b111, 0b101, 0b111, 0b100, 0b100],
  Q: [0b111, 0b101, 0b101, 0b111, 0b001],
  R: [0b111, 0b101, 0b110, 0b101, 0b101],
  S: [0b111, 0b100, 0b111, 0b001, 0b111],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b001, 0b001],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
  '+': [0b000, 0b010, 0b111, 0b010, 0b000],
  '-': [0b000, 0b000, 0b111, 0b000, 0b000],
  '=': [0b000, 0b111, 0b000, 0b111, 0b000],
  ':': [0b000, 0b010, 0b000, 0b010, 0b000],
  '!': [0b010, 0b010, 0b010, 0b000, 0b010],
};

/** Draw a single character at (x, y) with optional scale */
function drawGlyph(
  ctx: RenderContext,
  char: string, x: number, y: number, scale: number,
): void {
  const glyph = GLYPHS[char];
  if (!glyph) return;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (glyph[row] & (1 << (2 - col))) {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
}

/** Draw text string. Returns total width drawn. */
export function drawBitmapText(
  ctx: RenderContext,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number = 1,
): number {
  ctx.fillStyle = color;
  const charW = 3 * scale + scale; // 3px glyph + 1px spacing
  for (let i = 0; i < text.length; i++) {
    drawGlyph(ctx, text[i].toUpperCase(), x + i * charW, y, scale);
  }
  return text.length * charW;
}

/** Draw text centered horizontally at the given y */
export function drawBitmapTextCentered(
  ctx: RenderContext,
  text: string,
  centerX: number,
  y: number,
  color: string,
  scale: number = 1,
): void {
  const charW = 3 * scale + scale;
  const totalW = text.length * charW - scale; // no trailing space
  drawBitmapText(ctx, text, centerX - Math.floor(totalW / 2), y, color, scale);
}
