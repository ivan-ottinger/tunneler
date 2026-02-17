/** SFC32: a fast seedable 32-bit PRNG. Returns values in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Create a seeded PRNG from a single seed number */
export function createRng(seed: number): () => number {
  return sfc32(seed, seed ^ 0xdeadbeef, seed ^ 0xcafebabe, seed ^ 0x12345678);
}
