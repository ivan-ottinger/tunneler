import { Direction, PlayerInput } from '../types.js';
import { P1_KEYS, P2_KEYS, P2_ALT_KEYS } from '../constants.js';

const GAME_KEYS = new Set([
  ...Object.values(P1_KEYS),
  ...Object.values(P2_KEYS),
  ...Object.values(P2_ALT_KEYS),
  'Escape',
]);

export class InputManager {
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (GAME_KEYS.has(code)) {
      e.preventDefault();
    }
    this.pressed.add(code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isAnyPressed(...codes: string[]): boolean {
    return codes.some(c => this.pressed.has(c));
  }

  getPlayerInput(playerIndex: number): PlayerInput {
    const keys = playerIndex === 0 ? P1_KEYS : P2_KEYS;

    const up = this.pressed.has(keys.up) || (playerIndex === 1 && this.pressed.has(P2_ALT_KEYS.up));
    const down = this.pressed.has(keys.down) || (playerIndex === 1 && this.pressed.has(P2_ALT_KEYS.down));
    const left = this.pressed.has(keys.left) || (playerIndex === 1 && this.pressed.has(P2_ALT_KEYS.left));
    const right = this.pressed.has(keys.right) || (playerIndex === 1 && this.pressed.has(P2_ALT_KEYS.right));
    const fire = this.pressed.has(keys.fire) || (playerIndex === 0 && this.pressed.has(P1_KEYS.fireAlt));

    let direction = Direction.None;

    if (up && left) direction = Direction.UpLeft;
    else if (up && right) direction = Direction.UpRight;
    else if (down && left) direction = Direction.DownLeft;
    else if (down && right) direction = Direction.DownRight;
    else if (up) direction = Direction.Up;
    else if (down) direction = Direction.Down;
    else if (left) direction = Direction.Left;
    else if (right) direction = Direction.Right;

    return { direction, fire };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
