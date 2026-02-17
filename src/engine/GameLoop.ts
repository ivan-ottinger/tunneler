import { TICK_DURATION_MS } from '../constants.js';

export class GameLoop {
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private rafId = 0;

  constructor(
    private onTick: () => void,
    private onRender: () => void,
  ) {}

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return;

    const delta = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += delta;

    // Cap accumulator to prevent spiral of death
    if (this.accumulator > TICK_DURATION_MS * 10) {
      this.accumulator = TICK_DURATION_MS * 10;
    }

    while (this.accumulator >= TICK_DURATION_MS) {
      this.onTick();
      this.accumulator -= TICK_DURATION_MS;
    }

    this.onRender();
    this.rafId = requestAnimationFrame(this.loop);
  };
}
