import { Direction, GameState, PlayerInput, TileType } from '../types.js';
import {
  AI_PLAYER_INDEX, AI_DETECT_RANGE, AI_FIRE_RANGE,
  AI_RETREAT_ENERGY, AI_RETREAT_SHIELD, AI_PATH_RECALC_TICKS,
  AI_FIRE_PROBABILITY, TANK_SIZE, DIR_DELTA,
  BASE_SIZE, BASE_ENTRANCE_WIDTH, MAX_ENERGY, MAX_SHIELD,
  BULLET_BASE_SPEED,
} from '../constants.js';
import { rectsOverlap } from '../engine/CollisionDetector.js';
import { CoarsePathfinder } from './CoarsePathfinder.js';

enum AIState {
  Patrol,
  Chase,
  Retreat,
}

/** All movement directions in enum order */
const ALL_DIRS: Direction[] = [
  Direction.Up, Direction.UpRight, Direction.Right, Direction.DownRight,
  Direction.Down, Direction.DownLeft, Direction.Left, Direction.UpLeft,
];

/** Pick the Direction enum value that best moves toward (dx, dy) */
function directionToward(dx: number, dy: number): Direction {
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  if (sx === 0 && sy === 0) return Direction.None;

  const lookup: Record<string, Direction> = {
    '-1,-1': Direction.UpLeft,
    '0,-1': Direction.Up,
    '1,-1': Direction.UpRight,
    '-1,0': Direction.Left,
    '1,0': Direction.Right,
    '-1,1': Direction.DownLeft,
    '0,1': Direction.Down,
    '1,1': Direction.DownRight,
  };
  return lookup[`${sx},${sy}`] ?? Direction.None;
}

/** Get the index of a direction in ALL_DIRS (for rotation) */
function dirIndex(d: Direction): number {
  return ALL_DIRS.indexOf(d);
}

/** Check if a tank at (x,y) moving in direction d would be blocked */
function wouldBeBlocked(state: GameState, x: number, y: number, d: Direction, playerIndex: number): boolean {
  const [ddx, ddy] = DIR_DELTA[d];
  const nx = x + ddx;
  const ny = y + ddy;
  if (nx < 0 || nx + TANK_SIZE > state.mapWidth || ny < 0 || ny + TANK_SIZE > state.mapHeight) return true;
  for (let ty = 0; ty < TANK_SIZE; ty++) {
    for (let tx = 0; tx < TANK_SIZE; tx++) {
      const tile = state.map[(ny + ty) * state.mapWidth + (nx + tx)];
      if (tile === TileType.Rock || tile === TileType.BaseWall) return true;
    }
  }
  // Tank-to-tank collision check
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const other = state.players[i];
    if (!other.alive) continue;
    if (rectsOverlap(nx, ny, TANK_SIZE, TANK_SIZE, other.x, other.y, TANK_SIZE, TANK_SIZE)) return true;
  }
  return false;
}

/** Result of direction finding, includes the wall-follow side preference */
interface DirResult {
  dir: Direction;
  wallSide: number; // 0 = no deflection, 1 = CW, -1 = CCW
}

/** Decompose a diagonal direction into its two cardinal components. */
const DIAGONAL_CARDINALS: Partial<Record<Direction, [Direction, Direction]>> = {
  [Direction.UpLeft]: [Direction.Up, Direction.Left],
  [Direction.UpRight]: [Direction.Up, Direction.Right],
  [Direction.DownLeft]: [Direction.Down, Direction.Left],
  [Direction.DownRight]: [Direction.Down, Direction.Right],
};

/** Try the ideal direction, then rotations biased by wallSide preference for consistent wall-following. */
function findPassableDirection(state: GameState, x: number, y: number, ideal: Direction, wallSide: number, playerIndex: number): DirResult {
  if (ideal === Direction.None) return { dir: Direction.None, wallSide: 0 };
  // Try ideal first — if it works, obstacle is cleared
  if (!wouldBeBlocked(state, x, y, ideal, playerIndex)) return { dir: ideal, wallSide: 0 };

  // If the ideal was diagonal and blocked, try each cardinal component first.
  // This naturally threads narrow passages (e.g., base entrances) where the
  // diagonal clips a wall but one cardinal axis is clear.
  const cardinals = DIAGONAL_CARDINALS[ideal];
  if (cardinals) {
    for (const c of cardinals) {
      if (!wouldBeBlocked(state, x, y, c, playerIndex)) return { dir: c, wallSide: 0 };
    }
  }

  const idx = dirIndex(ideal);
  if (idx < 0) return { dir: ideal, wallSide: 0 };

  // If we have a wall-follow preference, try that side first consistently
  if (wallSide !== 0) {
    for (let step = 1; step <= 4; step++) {
      const d = ALL_DIRS[(idx + wallSide * step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, d, playerIndex)) return { dir: d, wallSide };
    }
    // Preferred side fully blocked — try the other side
    const other = -wallSide;
    for (let step = 1; step <= 4; step++) {
      const d = ALL_DIRS[(idx + other * step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, d, playerIndex)) return { dir: d, wallSide: other };
    }
  } else {
    // No preference yet — try closest rotation on each side, pick the nearest passable
    for (let step = 1; step <= 4; step++) {
      const cw = ALL_DIRS[(idx + step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, cw, playerIndex)) return { dir: cw, wallSide: 1 };
      const ccw = ALL_DIRS[(idx - step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, ccw, playerIndex)) return { dir: ccw, wallSide: -1 };
    }
  }

  // All 8 directions blocked
  return { dir: ideal, wallSide: 0 };
}

/** Get exit points outside each entrance, far enough that a tank fully clears the base. */
export function getBaseEntrances(baseX: number, baseY: number): { x: number; y: number }[] {
  const entrOff = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);
  const entrMid = entrOff + Math.floor(BASE_ENTRANCE_WIDTH / 2);
  const clearance = TANK_SIZE + 2; // far enough outside so the tank fully exits
  return [
    { x: baseX + entrMid, y: baseY - clearance },              // top
    { x: baseX + entrMid, y: baseY + BASE_SIZE + clearance },  // bottom
    { x: baseX - clearance, y: baseY + entrMid },              // left
    { x: baseX + BASE_SIZE + clearance, y: baseY + entrMid },  // right
  ];
}

export class AIController {
  private state = AIState.Patrol;
  private pathfinder = new CoarsePathfinder();
  private path: { x: number; y: number }[] = [];
  private pathRecalcTimer = 0;
  private patrolTarget: { x: number; y: number } | null = null;
  private stuckTicks = 0;
  private stuckCycles = 0; // how many times anti-stuck has fired without real progress
  private progressX = 0;
  private progressY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastState = AIState.Patrol;
  private wasAlive = true;
  private waypointBestDist = Infinity; // closest distance reached to current waypoint
  private waypointStallTicks = 0; // ticks without getting closer to current waypoint
  private wallSide = 0; // wall-follow preference: 0=none, 1=CW, -1=CCW
  private wallFollowTicks = 0; // how long wall-following has been active
  private ambushTicks = 0; // ticks remaining to hold position near enemy base
  private kiteCooldown = 0; // ticks until next kite shot while retreating
  private zigzagTimer = 0;
  private zigzagDir = 1;    // +1 = CW offset, -1 = CCW offset
  private dodgeCooldown = 0;
  private activeDodgeDir = Direction.None; // committed dodge direction
  private discoveredBases = new Set<number>(); // player indices whose bases have been spotted
  private discoveredOutpost = false;
  private exitTarget: { x: number; y: number } | null = null; // locked entrance target when exiting a base
  private exitBlockedTicks = 0; // how long the chosen exit has been blocked
  /** Locked entrance center + axis when approaching a base from outside (last-mile threading) */
  private entranceTarget: { x: number; y: number; axis: 'v' | 'h' } | null = null;
  /** Last known positions of enemy tanks — updated whenever visible, revisited during patrol */
  private lastSeen = new Map<number, { x: number; y: number; tick: number }>();

  reset(mapWidth = 0, mapHeight = 0): void {
    this.state = AIState.Patrol;
    this.path = [];
    this.pathRecalcTimer = 0;
    // Pick an immediate patrol target so the AI starts moving right away
    if (mapWidth > 0 && mapHeight > 0) {
      this.patrolTarget = {
        x: 20 + Math.floor(Math.random() * (mapWidth - 40)),
        y: 20 + Math.floor(Math.random() * (mapHeight - 40)),
      };
    } else {
      this.patrolTarget = null;
    }
    this.stuckTicks = 0;
    this.stuckCycles = 0;
    this.progressX = 0;
    this.progressY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.lastState = AIState.Patrol;
    this.wasAlive = true;
    this.waypointBestDist = Infinity;
    this.waypointStallTicks = 0;
    this.wallSide = 0;
    this.wallFollowTicks = 0;
    this.ambushTicks = 0;
    this.kiteCooldown = 0;
    this.zigzagTimer = 0;
    this.zigzagDir = 1;
    this.dodgeCooldown = 0;
    this.activeDodgeDir = Direction.None;
    this.discoveredBases.clear();
    this.discoveredBases.add(AI_PLAYER_INDEX); // always know own base
    this.discoveredOutpost = false;
    this.exitTarget = null;
    this.exitBlockedTicks = 0;
    this.entranceTarget = null;
    this.lastSeen.clear();
  }

  getDebugState(): Record<string, unknown> {
    return {
      state: AIState[this.state],
      exitTarget: this.exitTarget,
      entranceTarget: this.entranceTarget,
      exitBlockedTicks: this.exitBlockedTicks,
      stuckTicks: this.stuckTicks,
      stuckCycles: this.stuckCycles,
      path: this.path,
      patrolTarget: this.patrolTarget,
      ambushTicks: this.ambushTicks,
      kiteCooldown: this.kiteCooldown,
      zigzagTimer: this.zigzagTimer,
      zigzagDir: this.zigzagDir,
      dodgeCooldown: this.dodgeCooldown,
      activeDodgeDir: this.activeDodgeDir,
      wallSide: this.wallSide,
      wallFollowTicks: this.wallFollowTicks,
      waypointStallTicks: this.waypointStallTicks,
      waypointBestDist: this.waypointBestDist,
      discoveredBases: [...this.discoveredBases],
      discoveredOutpost: this.discoveredOutpost,
      lastSeen: Object.fromEntries(this.lastSeen),
    };
  }

  getInput(gameState: GameState): PlayerInput {
    const ai = gameState.players[AI_PLAYER_INDEX];
    if (!ai || !ai.alive) {
      this.wasAlive = false;
      return { direction: Direction.None, fire: false };
    }

    // Detect respawn — clear stale state so AI starts fresh from base
    if (!this.wasAlive) {
      this.wasAlive = true;
      this.state = AIState.Patrol;
      this.path = [];
      this.pathRecalcTimer = 0;
      this.stuckTicks = 0;
      this.stuckCycles = 0;
      this.waypointBestDist = Infinity;
      this.waypointStallTicks = 0;
      this.wallSide = 0;
      this.wallFollowTicks = 0;
      this.exitTarget = null;
      this.entranceTarget = null;
      this.zigzagTimer = 0;
      this.zigzagDir = 1;
      this.dodgeCooldown = 0;
      this.activeDodgeDir = Direction.None;
      // Pick an immediate patrol target so the AI moves right away after respawn
      this.patrolTarget = {
        x: 20 + Math.floor(Math.random() * (gameState.mapWidth - 40)),
        y: 20 + Math.floor(Math.random() * (gameState.mapHeight - 40)),
      };
    }

    const cx = ai.x + Math.floor(TANK_SIZE / 2);
    const cy = ai.y + Math.floor(TANK_SIZE / 2);

    // Fog of war: discover enemy bases and outpost when within detect range
    const baseHalf = Math.floor(BASE_SIZE / 2);
    for (let i = 0; i < gameState.players.length; i++) {
      if (i === AI_PLAYER_INDEX) continue;
      if (this.discoveredBases.has(i)) continue;
      const b = gameState.players[i].base;
      const bx = b.x + baseHalf;
      const by = b.y + baseHalf;
      const dx = bx - cx;
      const dy = by - cy;
      if (dx * dx + dy * dy < AI_DETECT_RANGE * AI_DETECT_RANGE) {
        this.discoveredBases.add(i);
      }
    }
    if (!this.discoveredOutpost && gameState.outpost.owner === -1) {
      const ox = gameState.outpost.x + baseHalf;
      const oy = gameState.outpost.y + baseHalf;
      const dx = ox - cx;
      const dy = oy - cy;
      if (dx * dx + dy * dy < AI_DETECT_RANGE * AI_DETECT_RANGE) {
        this.discoveredOutpost = true;
      }
    }

    // Find best visible target — only consider players within detect range
    let nearestIdx = -1;
    let nearestDist = Infinity;
    let bestScore = Infinity;
    for (let i = 0; i < gameState.players.length; i++) {
      if (i === AI_PLAYER_INDEX) continue;
      const p = gameState.players[i];
      if (!p.alive) continue;
      const dx = (p.x + Math.floor(TANK_SIZE / 2)) - cx;
      const dy = (p.y + Math.floor(TANK_SIZE / 2)) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > AI_DETECT_RANGE) continue; // fog of war: can't see beyond detect range
      // Weakness: low shield is most important (0-10), then low energy (0-1000)
      const healthRatio = (p.shield / MAX_SHIELD) * 0.6 + (p.energy / MAX_ENERGY) * 0.4;
      // Score combines distance with weakness — weaker targets score lower (better)
      // At equal distance, a half-health target scores ~60% of a full-health one
      const score = dist * (0.4 + 0.6 * healthRatio);
      if (score < bestScore) {
        bestScore = score;
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    // Record last-known positions of all visible enemies
    for (let i = 0; i < gameState.players.length; i++) {
      if (i === AI_PLAYER_INDEX) continue;
      const p = gameState.players[i];
      if (!p.alive) continue;
      const dx = (p.x + Math.floor(TANK_SIZE / 2)) - cx;
      const dy = (p.y + Math.floor(TANK_SIZE / 2)) - cy;
      if (dx * dx + dy * dy < AI_DETECT_RANGE * AI_DETECT_RANGE) {
        this.lastSeen.set(i, {
          x: p.x + Math.floor(TANK_SIZE / 2),
          y: p.y + Math.floor(TANK_SIZE / 2),
          tick: gameState.tickCount,
        });
      }
    }

    // State transitions
    this.updateState(ai.energy, ai.shield, nearestDist);

    // Rebuild pathfinder periodically or on state change
    this.pathRecalcTimer--;
    const stateChanged = this.state !== this.lastState;
    this.lastState = this.state;

    if (this.pathRecalcTimer <= 0 || stateChanged) {
      this.pathRecalcTimer = AI_PATH_RECALC_TICKS;
      this.pathfinder.rebuild(gameState.map, gameState.mapWidth, gameState.mapHeight);
      this.recalcPath(gameState, cx, cy, nearestIdx);
      this.waypointBestDist = Infinity;
      this.waypointStallTicks = 0;
      if (stateChanged) this.wallSide = 0; // preserve wall-follow during periodic recalc
      this.entranceTarget = null; // allow fresh entrance selection for new path
      this.exitTarget = null;
    }

    // Anti-stuck: detect position not changing
    if (ai.x === this.lastX && ai.y === this.lastY) {
      this.stuckTicks++;
    } else {
      this.stuckTicks = 0;
    }
    this.lastX = ai.x;
    this.lastY = ai.y;

    // Track whether we've made real progress (moved >15px since last check)
    if (this.stuckTicks === 0) {
      const pdx = ai.x - this.progressX;
      const pdy = ai.y - this.progressY;
      if (pdx * pdx + pdy * pdy > 15 * 15) {
        this.stuckCycles = 0;
        this.progressX = ai.x;
        this.progressY = ai.y;
      }
    }

    if (this.stuckTicks >= 5) {
      this.stuckTicks = 0;
      this.stuckCycles++;

      // If trying to exit a base, count stuck cycles toward entrance switching
      if (this.exitTarget) {
        this.exitBlockedTicks += 5;
        // If threshold reached, clear exit target so next tick picks a new entrance
        if (this.exitBlockedTicks >= 4) {
          this.exitTarget = null;
          this.exitBlockedTicks = 0;
        }
      }

      // After 3 stuck cycles without real progress, abandon current goal
      if (this.stuckCycles >= 3) {
        this.stuckCycles = 0;
        this.patrolTarget = null;
        this.path = [];
        this.pathRecalcTimer = 0;
        this.wallSide = 0;
      } else {
        // Force path recalc on next tick
        this.pathRecalcTimer = 0;
      }

      // Pick a random passable direction to break free (prefer reversing)
      const shuffled = [...ALL_DIRS].sort(() => Math.random() - 0.5);
      for (const d of shuffled) {
        if (!wouldBeBlocked(gameState, ai.x, ai.y, d, AI_PLAYER_INDEX)) {
          return { direction: d, fire: false };
        }
      }
      // Everything blocked — fire to try to clear dirt (won't help with rock but might open a path)
      return { direction: ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)], fire: true };
    }

    // Check if AI is inside any base — if so, navigate toward an entrance to exit
    let insideBaseX = -1;
    let insideBaseY = -1;
    let inOwnBase = false;
    for (let i = 0; i < gameState.players.length; i++) {
      const b = gameState.players[i].base;
      if (rectsOverlap(
        ai.x, ai.y, TANK_SIZE, TANK_SIZE,
        b.x + 1, b.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
      )) {
        insideBaseX = b.x;
        insideBaseY = b.y;
        if (i === AI_PLAYER_INDEX) inOwnBase = true;
        break;
      }
    }
    // Also check outpost
    if (insideBaseX < 0) {
      const o = gameState.outpost;
      if (rectsOverlap(
        ai.x, ai.y, TANK_SIZE, TANK_SIZE,
        o.x + 1, o.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
      )) {
        insideBaseX = o.x;
        insideBaseY = o.y;
        if (o.owner === AI_PLAYER_INDEX) inOwnBase = true;
      }
    }
    const insideAnyBase = insideBaseX >= 0;

    let moveDir = Direction.None;

    // Check if chase target is inside any base, and if inside the same base as the AI
    let targetInBase = false;
    let targetInSameBase = false;
    if (this.state === AIState.Chase && nearestIdx >= 0) {
      const target = gameState.players[nearestIdx];
      for (let i = 0; i < gameState.players.length; i++) {
        const b = gameState.players[i].base;
        if (rectsOverlap(target.x, target.y, TANK_SIZE, TANK_SIZE,
          b.x + 1, b.y + 1, BASE_SIZE - 2, BASE_SIZE - 2)) {
          targetInBase = true;
          if (insideAnyBase && !inOwnBase && b.x === insideBaseX && b.y === insideBaseY) {
            targetInSameBase = true;
          }
          break;
        }
      }
      if (!targetInBase) {
        const o = gameState.outpost;
        if (rectsOverlap(target.x, target.y, TANK_SIZE, TANK_SIZE,
          o.x + 1, o.y + 1, BASE_SIZE - 2, BASE_SIZE - 2)) {
          targetInBase = true;
          if (insideAnyBase && o.x === insideBaseX && o.y === insideBaseY) {
            targetInSameBase = true;
          }
        }
      }
    }

    // Clear exit target once we've reached it (fully exited the base)
    if (this.exitTarget && !insideAnyBase) {
      const half = Math.floor(TANK_SIZE / 2);
      const etDx = this.exitTarget.x - (ai.x + half);
      const etDy = this.exitTarget.y - (ai.y + half);
      if (etDx * etDx + etDy * etDy < 5 * 5) {
        this.exitTarget = null;
      }
    }

    // When inside a base, use entrance-aware navigation to avoid getting stuck on walls
    // Exceptions: stay put when retreating to own base (recharging),
    //             or move toward target when chasing inside enemy base
    //             or transiting through an enemy base during chase/patrol (path leads out naturally)
    //             (own base still uses exit navigation to thread through entrances)
    // Also continue exit navigation during boundary flicker (briefly detected as outside)
    const shouldExitBase = insideAnyBase && !(inOwnBase && this.state === AIState.Retreat) && !targetInSameBase
      && this.state !== AIState.Chase
      && !(this.state === AIState.Patrol && this.path.length > 0 && !inOwnBase);
    if (shouldExitBase || (!insideAnyBase && this.exitTarget)) {
      // Invalidate stale exit target from a different base
      if (this.exitTarget && insideAnyBase) {
        const baseCx = insideBaseX + Math.floor(BASE_SIZE / 2);
        const baseCy = insideBaseY + Math.floor(BASE_SIZE / 2);
        const etDx = this.exitTarget.x - baseCx;
        const etDy = this.exitTarget.y - baseCy;
        if (etDx * etDx + etDy * etDy > BASE_SIZE * BASE_SIZE) {
          this.exitTarget = null;
        }
      }
      // Lock in an exit target to prevent flip-flopping between entrances
      if (!this.exitTarget && insideAnyBase) {
        if (inOwnBase) {
          // Own base: pick entrance closest to ultimate destination
          let goalX = gameState.mapWidth / 2;
          let goalY = gameState.mapHeight / 2;
          if (this.patrolTarget) {
            goalX = this.patrolTarget.x;
            goalY = this.patrolTarget.y;
          }
          if (this.state === AIState.Chase && nearestIdx >= 0) {
            const target = gameState.players[nearestIdx];
            goalX = target.x + Math.floor(TANK_SIZE / 2);
            goalY = target.y + Math.floor(TANK_SIZE / 2);
          }
          const entrances = getBaseEntrances(insideBaseX, insideBaseY);
          let best = entrances[0];
          let bestDist = Infinity;
          for (const e of entrances) {
            const dx = e.x - goalX;
            const dy = e.y - goalY;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = e; }
          }
          this.exitTarget = best;
        } else {
          // Enemy base: pick nearest entrance
          const half = Math.floor(TANK_SIZE / 2);
          const entrances = getBaseEntrances(insideBaseX, insideBaseY);
          let best = entrances[0];
          let bestDist = Infinity;
          for (const e of entrances) {
            const dx = e.x - (ai.x + half);
            const dy = e.y - (ai.y + half);
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = e; }
          }
          this.exitTarget = best;
        }
      }
      // Navigate toward exit using axis-aligned movement to thread narrow entrances.
      // First align with the entrance center on the perpendicular axis, then move through.
      if (!this.exitTarget) {
        // exitTarget was cleared (boundary flicker after entrance switch) — skip this tick
      } else {
      const half = Math.floor(TANK_SIZE / 2);
      const dx = this.exitTarget.x - (ai.x + half);
      const dy = this.exitTarget.y - (ai.y + half);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Determine if this is a horizontal or vertical entrance based on exit target
      // Top/bottom entrances: exitTarget has same X as entrance center, Y is far outside
      // Left/right entrances: exitTarget has same Y as entrance center, X is far outside
      const isVerticalExit = absDy > absDx; // top or bottom entrance

      if (isVerticalExit) {
        // First align X with entrance center, then move Y through
        if (absDx > 1) {
          moveDir = dx > 0 ? Direction.Right : Direction.Left;
        } else {
          moveDir = dy > 0 ? Direction.Down : Direction.Up;
        }
      } else {
        // First align Y with entrance center, then move X through
        if (absDy > 1) {
          moveDir = dy > 0 ? Direction.Down : Direction.Up;
        } else {
          moveDir = dx > 0 ? Direction.Right : Direction.Left;
        }
      }

      // If the chosen direction is blocked, try the other axis
      if (wouldBeBlocked(gameState, ai.x, ai.y, moveDir, AI_PLAYER_INDEX)) {
        const fallback = directionToward(dx, dy);
        if (!wouldBeBlocked(gameState, ai.x, ai.y, fallback, AI_PLAYER_INDEX)) {
          moveDir = fallback;
        }
      }

      // Detect persistently blocked exit — switch to a different entrance.
      // Only track when aligned and attempting through-movement (not during alignment),
      // to prevent the counter from resetting on alignment ticks.
      const isAligning = isVerticalExit ? absDx > 1 : absDy > 1;
      if (!isAligning && wouldBeBlocked(gameState, ai.x, ai.y, moveDir, AI_PLAYER_INDEX)) {
        this.exitBlockedTicks++;
      } else if (!isAligning) {
        this.exitBlockedTicks = 0;
      }

      if (this.exitBlockedTicks >= 4) {
        if (insideAnyBase) {
          const entrances = getBaseEntrances(insideBaseX, insideBaseY);
          const alternatives = entrances.filter(e =>
            Math.abs(e.x - this.exitTarget!.x) > 2 || Math.abs(e.y - this.exitTarget!.y) > 2
          );
          this.exitTarget = alternatives.length > 0
            ? alternatives[Math.floor(Math.random() * alternatives.length)]
            : entrances[Math.floor(Math.random() * entrances.length)];
        } else {
          this.exitTarget = null;
        }
        this.exitBlockedTicks = 0;
      }
      } // end if (this.exitTarget)
    } else {
      // Not exiting a base — clear locked targets
      this.exitTarget = null;
      if (this.state !== AIState.Chase) {
        this.entranceTarget = null;
      }

      // When chasing a target inside the same enemy base, move directly toward them.
      // DON'T wall-follow — hold position if blocked. Wall-following inside an enemy
      // base can deflect the AI back out through the entrance, causing oscillation.
      if (targetInSameBase && nearestIdx >= 0) {
        const target = gameState.players[nearestIdx];
        const tdx = (target.x + Math.floor(TANK_SIZE / 2)) - cx;
        const tdy = (target.y + Math.floor(TANK_SIZE / 2)) - cy;
        const idealDir = directionToward(tdx, tdy);
        if (idealDir !== Direction.None && !wouldBeBlocked(gameState, ai.x, ai.y, idealDir, AI_PLAYER_INDEX)) {
          moveDir = idealDir;
        } else {
          // Try cardinal components of a diagonal before giving up
          const cardinals = DIAGONAL_CARDINALS[idealDir];
          if (cardinals) {
            for (const c of cardinals) {
              if (!wouldBeBlocked(gameState, ai.x, ai.y, c, AI_PLAYER_INDEX)) {
                moveDir = c;
                break;
              }
            }
          }
          // If still blocked, hold position and fire (moveDir stays Direction.None)
        }
      } else if (this.path.length > 0) {
        const wp = this.path[0];
        const dx = wp.x - cx;
        const dy = wp.y - cy;
        const distToWp = Math.abs(dx) + Math.abs(dy);

        // Track whether we're making progress toward the current waypoint
        if (distToWp < this.waypointBestDist - 1) {
          this.waypointBestDist = distToWp;
          this.waypointStallTicks = 0;
        } else {
          this.waypointStallTicks++;
        }

        // If stalled for 8+ ticks (sliding along rock), skip waypoint or force recalc
        if (this.waypointStallTicks >= 8) {
          this.waypointStallTicks = 0;
          this.waypointBestDist = Infinity;
          this.wallSide = 0;
          if (this.path.length > 1) {
            // Skip this waypoint — it's likely behind an obstacle
            this.path.shift();
          } else {
            // Last waypoint unreachable — force full path recalc with new target
            this.path = [];
            this.patrolTarget = null;
            this.pathRecalcTimer = 0;
          }
        }

        // Navigate toward current waypoint
        if (this.path.length > 0) {
          const cur = this.path[0];
          const cdx = cur.x - cx;
          const cdy = cur.y - cy;
          if (Math.abs(cdx) < 4 && Math.abs(cdy) < 4) {
            this.path.shift();
            this.waypointBestDist = Infinity;
            this.waypointStallTicks = 0;
            if (this.path.length > 0) {
              const next = this.path[0];
              const idealDir = directionToward(next.x - cx, next.y - cy);
              const r = findPassableDirection(gameState, ai.x, ai.y, idealDir, this.wallSide, AI_PLAYER_INDEX);
              moveDir = r.dir;
              this.wallSide = r.wallSide;
            }
          } else {
            const idealDir = directionToward(cdx, cdy);
            const r = findPassableDirection(gameState, ai.x, ai.y, idealDir, this.wallSide, AI_PLAYER_INDEX);
            moveDir = r.dir;
            this.wallSide = r.wallSide;
          }
        }
      }
    }

    // Clear entrance target when leaving Chase mode.
    // Preserve it when inside a base during Chase to avoid re-selecting on boundary flicker.
    if (this.entranceTarget && this.state !== AIState.Chase) {
      this.entranceTarget = null;
    }

    // Last-mile entrance threading: path is consumed but target is inside a base.
    // Lock in an entrance and use axis-aligned movement to thread through it.
    if (this.state === AIState.Chase && moveDir === Direction.None && !insideAnyBase && nearestIdx >= 0) {
      // Lock in entrance on first activation — don't change it every tick
      if (!this.entranceTarget) {
        const target = gameState.players[nearestIdx];
        const allBases: { x: number; y: number }[] = [];
        for (let i = 0; i < gameState.players.length; i++) {
          allBases.push(gameState.players[i].base);
        }
        allBases.push(gameState.outpost);

        for (const b of allBases) {
          if (!rectsOverlap(
            target.x, target.y, TANK_SIZE, TANK_SIZE,
            b.x + 1, b.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
          )) continue;

          const entrOff = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);
          const entrMid = entrOff + Math.floor(BASE_ENTRANCE_WIDTH / 2);
          const entranceCenters = [
            { x: b.x + entrMid, y: b.y,              axis: 'v' as const },
            { x: b.x + entrMid, y: b.y + BASE_SIZE,  axis: 'v' as const },
            { x: b.x,              y: b.y + entrMid,  axis: 'h' as const },
            { x: b.x + BASE_SIZE,  y: b.y + entrMid,  axis: 'h' as const },
          ];

          let bestEntr = entranceCenters[0];
          let bestDist = Infinity;
          for (const e of entranceCenters) {
            const edx = e.x - cx;
            const edy = e.y - cy;
            const d = edx * edx + edy * edy;
            if (d < bestDist) { bestDist = d; bestEntr = e; }
          }
          this.entranceTarget = bestEntr;
          break;
        }
      }

      // Navigate toward the locked entrance target
      if (this.entranceTarget) {
        const edx = this.entranceTarget.x - cx;
        const edy = this.entranceTarget.y - cy;

        // When we've reached the entrance, move toward the chase target instead
        // of oscillating at the exact entrance position where edy/edx ≈ 0.
        const atEntrance = Math.abs(edx) <= 2 && Math.abs(edy) <= 2;
        if (atEntrance && nearestIdx >= 0) {
          const target = gameState.players[nearestIdx];
          const tdx = (target.x + Math.floor(TANK_SIZE / 2)) - cx;
          const tdy = (target.y + Math.floor(TANK_SIZE / 2)) - cy;
          const idealDir = directionToward(tdx, tdy);
          if (idealDir !== Direction.None && !wouldBeBlocked(gameState, ai.x, ai.y, idealDir, AI_PLAYER_INDEX)) {
            moveDir = idealDir;
          } else if (idealDir !== Direction.None) {
            const cardinals = DIAGONAL_CARDINALS[idealDir];
            if (cardinals) {
              for (const c of cardinals) {
                if (!wouldBeBlocked(gameState, ai.x, ai.y, c, AI_PLAYER_INDEX)) {
                  moveDir = c;
                  break;
                }
              }
            }
          }
        } else {
          if (this.entranceTarget.axis === 'v') {
            moveDir = Math.abs(edx) > 1
              ? (edx > 0 ? Direction.Right : Direction.Left)
              : (edy > 0 ? Direction.Down : Direction.Up);
          } else {
            moveDir = Math.abs(edy) > 1
              ? (edy > 0 ? Direction.Down : Direction.Up)
              : (edx > 0 ? Direction.Right : Direction.Left);
          }
          if (wouldBeBlocked(gameState, ai.x, ai.y, moveDir, AI_PLAYER_INDEX)) {
            const fallback = directionToward(edx, edy);
            if (!wouldBeBlocked(gameState, ai.x, ai.y, fallback, AI_PLAYER_INDEX)) {
              moveDir = fallback;
            }
          }
        }
      }
    }

    // Wall-follow timeout: detect U-shaped rock traps
    if (this.wallSide !== 0) {
      this.wallFollowTicks++;
      if (this.wallFollowTicks >= 15) {
        // Stuck in a wall-follow loop — skip waypoint and try a new approach
        this.wallSide = 0;
        this.wallFollowTicks = 0;
        if (this.path.length > 1) {
          this.path.shift();
          this.waypointBestDist = Infinity;
          this.waypointStallTicks = 0;
        } else {
          this.path = [];
          this.patrolTarget = null;
          this.pathRecalcTimer = 0;
        }
      }
    } else {
      this.wallFollowTicks = 0;
    }

    // Ambush: when patrolling near an enemy base, hold position and wait for targets
    if (this.state === AIState.Patrol && this.ambushTicks > 0) {
      this.ambushTicks--;
      moveDir = Direction.None; // hold position
    } else if (this.state === AIState.Patrol && this.path.length === 0 && !insideAnyBase) {
      // Just arrived at patrol target — check if near a discovered enemy base
      for (let i = 0; i < gameState.players.length; i++) {
        if (i === AI_PLAYER_INDEX) continue;
        if (!this.discoveredBases.has(i)) continue; // fog of war
        const eb = gameState.players[i].base;
        const ebCx = eb.x + Math.floor(BASE_SIZE / 2);
        const ebCy = eb.y + Math.floor(BASE_SIZE / 2);
        const dx = ebCx - cx;
        const dy = ebCy - cy;
        if (dx * dx + dy * dy < 60 * 60) {
          // Near enemy base — ambush for 15-25 ticks
          this.ambushTicks = 15 + Math.floor(Math.random() * 10);
          moveDir = Direction.None;
          break;
        }
      }
    }

    // --- Bullet dodge during retreat ---
    // Dodge commits to a direction for several ticks so the tank actually clears the bullet path
    let dodging = false;
    if (this.dodgeCooldown > 0) {
      this.dodgeCooldown--;
      // Continue committed dodge
      if (this.activeDodgeDir !== Direction.None
          && !wouldBeBlocked(gameState, ai.x, ai.y, this.activeDodgeDir, AI_PLAYER_INDEX)) {
        moveDir = this.activeDodgeDir;
        dodging = true;
      } else {
        // Blocked — abort dodge early
        this.dodgeCooldown = 0;
        this.activeDodgeDir = Direction.None;
      }
    } else if (this.state === AIState.Retreat && nearestIdx >= 0 && moveDir !== Direction.None) {
      const bulletSpeed = BULLET_BASE_SPEED;
      for (let i = 0; i < gameState.players.length; i++) {
        if (i === AI_PLAYER_INDEX) continue;
        for (const bullet of gameState.players[i].bullets) {
          const [bdx, bdy] = DIR_DELTA[bullet.direction];
          if (bdx === 0 && bdy === 0) continue;

          // Ignore bullets far away (>50px) — not an immediate threat
          const bvx = bullet.x - cx;
          const bvy = bullet.y - cy;
          if (bvx * bvx + bvy * bvy > 50 * 50) continue;

          // Speed-adjusted direction vector per tick
          const sdx = bdx * bulletSpeed;
          const sdy = bdy * bulletSpeed;

          // Vector from bullet to AI center
          const vx = cx - bullet.x;
          const vy = cy - bullet.y;

          // Time of closest approach (in ticks)
          const lenSq = sdx * sdx + sdy * sdy;
          const t = (vx * sdx + vy * sdy) / lenSq;
          if (t < 1 || t > 12) continue; // moving away, too close to react, or too far out

          // Distance at closest approach
          const closestX = bullet.x + sdx * t - cx;
          const closestY = bullet.y + sdy * t - cy;
          if (closestX * closestX + closestY * closestY >= 7 * 7) continue;

          // Threat detected — dodge perpendicular to bullet travel
          const perp1 = directionToward(-bdy, bdx);
          const perp2 = directionToward(bdy, -bdx);

          // Prefer the perpendicular closer to our retreat path
          let dodgeDir = perp1;
          if (perp1 !== Direction.None && perp2 !== Direction.None) {
            const [mx, my] = DIR_DELTA[moveDir];
            const [p1x, p1y] = DIR_DELTA[perp1];
            const [p2x, p2y] = DIR_DELTA[perp2];
            if (p2x * mx + p2y * my > p1x * mx + p1y * my) dodgeDir = perp2;
          }

          if (dodgeDir !== Direction.None && !wouldBeBlocked(gameState, ai.x, ai.y, dodgeDir, AI_PLAYER_INDEX)) {
            moveDir = dodgeDir;
            this.activeDodgeDir = dodgeDir;
            this.dodgeCooldown = 8; // commit to dodging for 8 ticks (~8px lateral)
            dodging = true;
          } else {
            const other = dodgeDir === perp1 ? perp2 : perp1;
            if (other !== Direction.None && !wouldBeBlocked(gameState, ai.x, ai.y, other, AI_PLAYER_INDEX)) {
              moveDir = other;
              this.activeDodgeDir = other;
              this.dodgeCooldown = 5;
              dodging = true;
            }
          }
          break;
        }
        if (dodging) break;
      }
    }

    // --- Zigzag evasion during retreat ---
    if (this.state === AIState.Retreat && nearestIdx >= 0) {
      this.zigzagTimer++;
      if (!dodging && moveDir !== Direction.None) {
        // Jink for 2 ticks every 8-tick cycle, alternate sides each cycle
        const phase = this.zigzagTimer % 8;
        if (phase === 0) this.zigzagDir *= -1;
        if (phase < 2) {
          const idx = dirIndex(moveDir);
          if (idx >= 0) {
            const offsetDir = ALL_DIRS[(idx + this.zigzagDir + 8) % 8];
            if (!wouldBeBlocked(gameState, ai.x, ai.y, offsetDir, AI_PLAYER_INDEX)) {
              moveDir = offsetDir;
            }
          }
        }
      }
    } else {
      this.zigzagTimer = 0;
    }

    // Kiting: when retreating with a pursuer nearby, periodically stop and fire
    this.kiteCooldown = Math.max(0, this.kiteCooldown - 1);
    let kiting = false;
    if (this.state === AIState.Retreat && nearestIdx >= 0 && nearestDist < AI_DETECT_RANGE && this.kiteCooldown === 0) {
      // Turn to face the enemy and fire — moves 1px toward them but ensures the shot lands
      kiting = true;
      const target = gameState.players[nearestIdx];
      const tdx = (target.x + Math.floor(TANK_SIZE / 2)) - cx;
      const tdy = (target.y + Math.floor(TANK_SIZE / 2)) - cy;
      const faceDir = directionToward(tdx, tdy);
      moveDir = faceDir !== Direction.None ? faceDir : Direction.None;
      this.kiteCooldown = 12; // ~1.2 seconds between kite shots
    }

    // Face target when in fire range to enable accurate shooting.
    // Navigation often points moveDir away from the target; override it for combat.
    // Skip when a base wall separates AI and target (one inside, other outside).
    if (!kiting && nearestIdx >= 0 && this.state !== AIState.Retreat
        && ((!insideAnyBase && !targetInBase) || targetInSameBase)) {
      const target = gameState.players[nearestIdx];
      const tx = target.x + Math.floor(TANK_SIZE / 2);
      const ty = target.y + Math.floor(TANK_SIZE / 2);
      const tdx = tx - cx;
      const tdy = ty - cy;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);
      const range = this.state === AIState.Chase ? AI_FIRE_RANGE : AI_FIRE_RANGE * 0.5;
      if (dist < range) {
        // Lead-target: face where the enemy will be when the bullet arrives
        const [tvx, tvy] = DIR_DELTA[target.direction];
        const travelTicks = dist / BULLET_BASE_SPEED;
        const faceDir = directionToward(
          tx + tvx * travelTicks - cx,
          ty + tvy * travelTicks - cy,
        );
        if (faceDir !== Direction.None) {
          moveDir = faceDir;
        }
      }
    }

    // Determine firing — lead-target where the enemy will be
    // Use the direction the tank WILL face (moveDir) rather than the old facing,
    // since the engine updates direction before firing the bullet.
    const effectiveFacing = moveDir !== Direction.None ? moveDir : ai.direction;
    let fire = false;
    if (nearestIdx >= 0) {
      const target = gameState.players[nearestIdx];
      const tx = target.x + Math.floor(TANK_SIZE / 2);
      const ty = target.y + Math.floor(TANK_SIZE / 2);
      const tdx = tx - cx;
      const tdy = ty - cy;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);

      // Lead targeting: predict where the target will be when the bullet arrives
      const [tvx, tvy] = DIR_DELTA[target.direction];
      const travelTicks = dist / BULLET_BASE_SPEED;
      const leadX = tx + tvx * travelTicks;
      const leadY = ty + tvy * travelTicks;
      const leadDx = leadX - cx;
      const leadDy = leadY - cy;

      if (kiting) {
        // Kiting: always fire toward the pursuer (use actual direction, not lead)
        fire = isAligned(effectiveFacing, tdx, tdy) && Math.random() < AI_FIRE_PROBABILITY;
      } else {
        const range = this.state === AIState.Chase ? AI_FIRE_RANGE : AI_FIRE_RANGE * 0.5;
        if (dist < range && isAligned(effectiveFacing, leadDx, leadDy)) {
          fire = Math.random() < AI_FIRE_PROBABILITY;
        }
      }
    }

    return { direction: moveDir, fire };
  }

  private updateState(energy: number, shield: number, nearestDist: number): void {
    switch (this.state) {
      case AIState.Patrol:
        if (energy < AI_RETREAT_ENERGY || shield < AI_RETREAT_SHIELD) {
          this.state = AIState.Retreat;
        } else if (nearestDist < AI_DETECT_RANGE) {
          this.state = AIState.Chase;
        }
        break;
      case AIState.Chase:
        if (energy < AI_RETREAT_ENERGY || shield < AI_RETREAT_SHIELD) {
          this.state = AIState.Retreat;
        } else if (nearestDist > AI_DETECT_RANGE * 1.5) {
          this.state = AIState.Patrol;
        }
        break;
      case AIState.Retreat:
        if (energy >= MAX_ENERGY * 0.8 && shield >= MAX_SHIELD * 0.8) {
          this.state = AIState.Patrol;
        }
        break;
    }
  }

  private recalcPath(
    gameState: GameState, cx: number, cy: number, nearestIdx: number,
  ): void {
    const ai = gameState.players[AI_PLAYER_INDEX];

    switch (this.state) {
      case AIState.Patrol: {
        if (!this.patrolTarget ||
            (Math.abs(this.patrolTarget.x - cx) < 10 && Math.abs(this.patrolTarget.y - cy) < 10)) {
          this.ambushTicks = 0;
          // Generate candidate patrol targets and pick the cheapest path (prefers tunnels)
          const half = Math.floor(BASE_SIZE / 2);
          const candidates: { x: number; y: number }[] = [];

          // Include nearest entrance of discovered enemy bases (creates pressure)
          // Skip if AI is already at the entrance (avoids re-ambushing the same spot)
          for (let i = 0; i < gameState.players.length; i++) {
            if (i === AI_PLAYER_INDEX) continue;
            if (!this.discoveredBases.has(i)) continue; // fog of war
            const entrances = getBaseEntrances(gameState.players[i].base.x, gameState.players[i].base.y);
            let nearest = entrances[0];
            let nearestDist = Infinity;
            for (const e of entrances) {
              const edx = e.x - cx;
              const edy = e.y - cy;
              const d = edx * edx + edy * edy;
              if (d < nearestDist) { nearestDist = d; nearest = e; }
            }
            if (nearestDist > 20 * 20) {
              candidates.push(nearest);
            }
          }

          // Include last-known enemy positions (fade after 300 ticks / ~30 seconds)
          for (const [idx, seen] of this.lastSeen) {
            if (idx === AI_PLAYER_INDEX) continue;
            if (gameState.tickCount - seen.tick > 300) continue; // stale — ignore
            candidates.push({ x: seen.x, y: seen.y });
          }

          // Include bonus pickup location if AI has no bonus
          if (ai.bonus === 0 && gameState.bonusPickup) {
            candidates.push({
              x: gameState.bonusPickup.x + 1,
              y: gameState.bonusPickup.y + 1,
            });
          }

          // Add random points — more when no bases discovered yet (pure exploration)
          const randomCount = candidates.length === 0 ? 4 : 2;
          for (let c = 0; c < randomCount; c++) {
            candidates.push({
              x: 20 + Math.floor(Math.random() * (gameState.mapWidth - 40)),
              y: 20 + Math.floor(Math.random() * (gameState.mapHeight - 40)),
            });
          }

          // Reject candidates inside any base (causes enter/exit oscillation)
          const validCandidates = candidates.filter(c => {
            for (let i = 0; i < gameState.players.length; i++) {
              const b = gameState.players[i].base;
              if (c.x >= b.x && c.x < b.x + BASE_SIZE && c.y >= b.y && c.y < b.y + BASE_SIZE) return false;
            }
            const o = gameState.outpost;
            if (c.x >= o.x && c.x < o.x + BASE_SIZE && c.y >= o.y && c.y < o.y + BASE_SIZE) return false;
            return true;
          });

          // Pick the candidate with the lowest path cost (most tunnel reuse)
          const pool = validCandidates.length > 0 ? validCandidates : candidates;
          let bestCost = Infinity;
          let bestCandidate = pool[0];
          for (const c of pool) {
            const cost = this.pathfinder.pathCost(cx, cy, c.x, c.y);
            if (cost < bestCost) {
              bestCost = cost;
              bestCandidate = c;
            }
          }
          this.patrolTarget = bestCandidate;
        }
        this.path = this.pathfinder.findPath(cx, cy, this.patrolTarget.x, this.patrolTarget.y);
        break;
      }
      case AIState.Chase: {
        if (nearestIdx >= 0) {
          const target = gameState.players[nearestIdx];
          const tx = target.x + Math.floor(TANK_SIZE / 2);
          const ty = target.y + Math.floor(TANK_SIZE / 2);

          // Check if target is inside a base — if so, path to nearest entrance instead
          let pathX = tx;
          let pathY = ty;
          const allBases: { x: number; y: number }[] = [];
          for (let i = 0; i < gameState.players.length; i++) {
            allBases.push(gameState.players[i].base);
          }
          allBases.push(gameState.outpost);

          for (const b of allBases) {
            if (rectsOverlap(
              target.x, target.y, TANK_SIZE, TANK_SIZE,
              b.x + 1, b.y + 1, BASE_SIZE - 2, BASE_SIZE - 2,
            )) {
              // Target is inside this base — find the entrance closest to the AI
              const entrances = getBaseEntrances(b.x, b.y);
              let bestDist = Infinity;
              for (const e of entrances) {
                const edx = e.x - cx;
                const edy = e.y - cy;
                const d = edx * edx + edy * edy;
                if (d < bestDist) {
                  bestDist = d;
                  pathX = e.x;
                  pathY = e.y;
                }
              }
              break;
            }
          }

          this.path = this.pathfinder.findPath(cx, cy, pathX, pathY);
        }
        break;
      }
      case AIState.Retreat: {
        // Always retreat to own base — enemy bases don't recharge
        const half = Math.floor(BASE_SIZE / 2);
        const bestX = ai.base.x + half;
        const bestY = ai.base.y + half;
        this.path = this.pathfinder.findPath(cx, cy, bestX, bestY);
        break;
      }
    }
  }
}

/** Check if facing direction is roughly aligned with the vector (dx, dy) */
function isAligned(facing: Direction, dx: number, dy: number): boolean {
  const targetDir = directionToward(dx, dy);
  if (targetDir === Direction.None) return false;
  if (facing === targetDir) return true;

  const adjacent: Record<number, number[]> = {
    [Direction.Up]: [Direction.UpLeft, Direction.UpRight],
    [Direction.Down]: [Direction.DownLeft, Direction.DownRight],
    [Direction.Left]: [Direction.UpLeft, Direction.DownLeft],
    [Direction.Right]: [Direction.UpRight, Direction.DownRight],
    [Direction.UpLeft]: [Direction.Up, Direction.Left],
    [Direction.UpRight]: [Direction.Up, Direction.Right],
    [Direction.DownLeft]: [Direction.Down, Direction.Left],
    [Direction.DownRight]: [Direction.Down, Direction.Right],
  };

  return adjacent[facing]?.includes(targetDir) ?? false;
}
