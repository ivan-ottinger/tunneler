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
function wouldBeBlocked(state: GameState, x: number, y: number, d: Direction): boolean {
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
  return false;
}

/** Result of direction finding, includes the wall-follow side preference */
interface DirResult {
  dir: Direction;
  wallSide: number; // 0 = no deflection, 1 = CW, -1 = CCW
}

/** Try the ideal direction, then rotations biased by wallSide preference for consistent wall-following. */
function findPassableDirection(state: GameState, x: number, y: number, ideal: Direction, wallSide: number): DirResult {
  if (ideal === Direction.None) return { dir: Direction.None, wallSide: 0 };
  // Try ideal first — if it works, obstacle is cleared
  if (!wouldBeBlocked(state, x, y, ideal)) return { dir: ideal, wallSide: 0 };

  const idx = dirIndex(ideal);
  if (idx < 0) return { dir: ideal, wallSide: 0 };

  // If we have a wall-follow preference, try that side first consistently
  if (wallSide !== 0) {
    for (let step = 1; step <= 4; step++) {
      const d = ALL_DIRS[(idx + wallSide * step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, d)) return { dir: d, wallSide };
    }
    // Preferred side fully blocked — try the other side
    const other = -wallSide;
    for (let step = 1; step <= 4; step++) {
      const d = ALL_DIRS[(idx + other * step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, d)) return { dir: d, wallSide: other };
    }
  } else {
    // No preference yet — try closest rotation on each side, pick the nearest passable
    for (let step = 1; step <= 4; step++) {
      const cw = ALL_DIRS[(idx + step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, cw)) return { dir: cw, wallSide: 1 };
      const ccw = ALL_DIRS[(idx - step + 8) % 8];
      if (!wouldBeBlocked(state, x, y, ccw)) return { dir: ccw, wallSide: -1 };
    }
  }

  // All 8 directions blocked
  return { dir: ideal, wallSide: 0 };
}

/** Get the four entrance center positions for a base at (baseX, baseY). */
function getBaseEntrances(baseX: number, baseY: number): { x: number; y: number }[] {
  const entrOff = Math.floor((BASE_SIZE - BASE_ENTRANCE_WIDTH) / 2);
  const entrMid = entrOff + Math.floor(BASE_ENTRANCE_WIDTH / 2);
  return [
    { x: baseX + entrMid, y: baseY - 1 },              // top
    { x: baseX + entrMid, y: baseY + BASE_SIZE },       // bottom
    { x: baseX - 1, y: baseY + entrMid },               // left
    { x: baseX + BASE_SIZE, y: baseY + entrMid },       // right
  ];
}

/** Navigate toward the entrance closest to the goal (for own base — pick the best exit). */
function getBaseExitTowardGoal(
  tankX: number, tankY: number,
  baseX: number, baseY: number,
  goalX: number, goalY: number,
): Direction {
  const half = Math.floor(TANK_SIZE / 2);
  const cx = tankX + half;
  const cy = tankY + half;
  const entrances = getBaseEntrances(baseX, baseY);

  let bestEntrance = entrances[0];
  let bestScore = Infinity;
  for (const e of entrances) {
    const dx = e.x - goalX;
    const dy = e.y - goalY;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      bestEntrance = e;
    }
  }

  return directionToward(bestEntrance.x - cx, bestEntrance.y - cy);
}

/** Navigate toward the nearest entrance (for enemy bases — just get out fast). */
function getBaseExitNearest(
  tankX: number, tankY: number,
  baseX: number, baseY: number,
): Direction {
  const half = Math.floor(TANK_SIZE / 2);
  const cx = tankX + half;
  const cy = tankY + half;
  const entrances = getBaseEntrances(baseX, baseY);

  let bestEntrance = entrances[0];
  let bestDist = Infinity;
  for (const e of entrances) {
    const dx = e.x - cx;
    const dy = e.y - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestEntrance = e;
    }
  }

  return directionToward(bestEntrance.x - cx, bestEntrance.y - cy);
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
  private discoveredBases = new Set<number>(); // player indices whose bases have been spotted
  private discoveredOutpost = false;
  private exitTarget: { x: number; y: number } | null = null; // locked entrance target when exiting a base

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
    this.discoveredBases.clear();
    this.discoveredBases.add(AI_PLAYER_INDEX); // always know own base
    this.discoveredOutpost = false;
    this.exitTarget = null;
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
      this.wallSide = 0;
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
        if (!wouldBeBlocked(gameState, ai.x, ai.y, d)) {
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

    // When inside a base, use entrance-aware navigation to avoid getting stuck on walls
    // Exception: stay put when retreating to own base (recharging)
    if (insideAnyBase && !(inOwnBase && this.state === AIState.Retreat)) {
      // Lock in an exit target to prevent flip-flopping between entrances
      if (!this.exitTarget) {
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
      const exitDir = directionToward(
        this.exitTarget.x - (ai.x + Math.floor(TANK_SIZE / 2)),
        this.exitTarget.y - (ai.y + Math.floor(TANK_SIZE / 2)),
      );
      const result = findPassableDirection(gameState, ai.x, ai.y, exitDir, this.wallSide);
      moveDir = result.dir;
      this.wallSide = result.wallSide;
    } else {
      // No longer inside a base — clear locked exit target
      this.exitTarget = null;

      if (this.path.length > 0) {
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
              const r = findPassableDirection(gameState, ai.x, ai.y, idealDir, this.wallSide);
              moveDir = r.dir;
              this.wallSide = r.wallSide;
            }
          } else {
            const idealDir = directionToward(cdx, cdy);
            const r = findPassableDirection(gameState, ai.x, ai.y, idealDir, this.wallSide);
            moveDir = r.dir;
            this.wallSide = r.wallSide;
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

    // Kiting: when retreating with a pursuer nearby, periodically stop and fire
    this.kiteCooldown = Math.max(0, this.kiteCooldown - 1);
    let kiting = false;
    if (this.state === AIState.Retreat && nearestIdx >= 0 && nearestDist < AI_DETECT_RANGE && this.kiteCooldown === 0) {
      // Stop for 1 tick and take a shot
      kiting = true;
      moveDir = Direction.None;
      this.kiteCooldown = 12; // ~1.2 seconds between kite shots
    }

    // Determine firing — lead-target where the enemy will be
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
        fire = isAligned(ai.direction, tdx, tdy) && Math.random() < AI_FIRE_PROBABILITY;
      } else {
        const range = this.state === AIState.Chase ? AI_FIRE_RANGE : AI_FIRE_RANGE * 0.5;
        if (dist < range && isAligned(ai.direction, leadDx, leadDy)) {
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

          // Include discovered enemy bases as candidates (creates pressure)
          for (let i = 0; i < gameState.players.length; i++) {
            if (i === AI_PLAYER_INDEX) continue;
            if (!this.discoveredBases.has(i)) continue; // fog of war
            const p = gameState.players[i];
            candidates.push({
              x: p.base.x + half + Math.floor(Math.random() * 40 - 20),
              y: p.base.y + half + Math.floor(Math.random() * 40 - 20),
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

          // Pick the candidate with the lowest path cost (most tunnel reuse)
          let bestCost = Infinity;
          let bestCandidate = candidates[0];
          for (const c of candidates) {
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
          this.path = this.pathfinder.findPath(cx, cy, tx, ty);
        }
        break;
      }
      case AIState.Retreat: {
        // Find nearest discovered base — own base always known, others require discovery
        const half = Math.floor(BASE_SIZE / 2);
        let bestDist = Infinity;
        let bestX = ai.base.x + half;
        let bestY = ai.base.y + half;

        // Check discovered player bases only (fog of war)
        for (let i = 0; i < gameState.players.length; i++) {
          if (!this.discoveredBases.has(i)) continue;
          const p = gameState.players[i];
          const bx = p.base.x + half;
          const by = p.base.y + half;
          const dx = bx - cx;
          const dy = by - cy;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestX = bx;
            bestY = by;
          }
        }

        // Also check neutral outpost if discovered (fog of war)
        if (gameState.outpost.owner === -1 && this.discoveredOutpost) {
          const ox = gameState.outpost.x + half;
          const oy = gameState.outpost.y + half;
          const dx = ox - cx;
          const dy = oy - cy;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestX = ox;
            bestY = oy;
          }
        }

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
