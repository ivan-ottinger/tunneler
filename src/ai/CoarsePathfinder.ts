import { TileType } from '../types.js';
import { AI_COARSE_TILE_SIZE, TANK_SIZE } from '../constants.js';

interface Node {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: Node | null;
}

/** Downsample map into coarse grid and run A* to find a path of pixel-coordinate waypoints */
export class CoarsePathfinder {
  private gridW = 0;
  private gridH = 0;
  private passable: boolean[] = [];
  /** Per-cell cost multiplier: higher near rocks to discourage close passes */
  private cost: number[] = [];

  /** Rebuild the coarse grid from the current map state */
  rebuild(map: Uint8Array, mapWidth: number, mapHeight: number): void {
    const ts = AI_COARSE_TILE_SIZE;
    this.gridW = Math.ceil(mapWidth / ts);
    this.gridH = Math.ceil(mapHeight / ts);
    const cellCount = this.gridW * this.gridH;
    this.passable = new Array(cellCount);
    this.cost = new Array(cellCount);

    // Inflate: check an expanded area (tank-sized margin) around each cell
    // so paths keep enough clearance for the 5x5 tank
    const margin = Math.floor(TANK_SIZE / 2);

    for (let gy = 0; gy < this.gridH; gy++) {
      for (let gx = 0; gx < this.gridW; gx++) {
        // Passability check uses inflated area (tank clearance)
        let blocking = 0;
        let inflatedTotal = 0;
        const ix0 = Math.max(0, gx * ts - margin);
        const iy0 = Math.max(0, gy * ts - margin);
        const ix1 = Math.min(gx * ts + ts + margin, mapWidth);
        const iy1 = Math.min(gy * ts + ts + margin, mapHeight);
        for (let y = iy0; y < iy1; y++) {
          for (let x = ix0; x < ix1; x++) {
            inflatedTotal++;
            const tile = map[y * mapWidth + x];
            if (tile === TileType.Rock || tile === TileType.BaseWall) {
              blocking++;
            }
          }
        }

        // Cost check uses core cell — count open tiles (tunnels only, not base interiors)
        // BaseInterior is excluded so the pathfinder doesn't route through bases as shortcuts
        let open = 0;
        let coreTotal = 0;
        const cx0 = gx * ts;
        const cy0 = gy * ts;
        const cx1 = Math.min(cx0 + ts, mapWidth);
        const cy1 = Math.min(cy0 + ts, mapHeight);
        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            coreTotal++;
            const tile = map[y * mapWidth + x];
            if (tile === TileType.Empty) {
              open++;
            }
          }
        }

        const blockRatio = blocking / inflatedTotal;
        const openRatio = coreTotal > 0 ? open / coreTotal : 0;
        const idx = gy * this.gridW + gx;
        // Impassable if >25% blocking in the inflated area
        this.passable[idx] = blockRatio < 0.25;
        // Cost: open tunnels are cheap (0.3 energy), dirt is expensive (1.0 energy)
        // Fully open cell costs ~1, fully dirt cell costs ~3, rocky cells even more
        this.cost[idx] = 1 + (1 - openRatio) * 2 + blockRatio * 4;
      }
    }
  }

  /** Find a path from pixel (sx,sy) to pixel (tx,ty). Returns waypoints in pixel coords. */
  findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    const ts = AI_COARSE_TILE_SIZE;
    const startGx = Math.floor(sx / ts);
    const startGy = Math.floor(sy / ts);
    const goalGx = Math.floor(tx / ts);
    const goalGy = Math.floor(ty / ts);

    if (startGx === goalGx && startGy === goalGy) {
      return [{ x: tx, y: ty }];
    }

    // A* with 8-directional movement
    const open: Node[] = [];
    const closed = new Set<number>();
    const key = (gx: number, gy: number) => gy * this.gridW + gx;

    const h = (gx: number, gy: number) =>
      Math.max(Math.abs(gx - goalGx), Math.abs(gy - goalGy)); // Chebyshev

    const startNode: Node = { gx: startGx, gy: startGy, g: 0, f: h(startGx, startGy), parent: null };
    open.push(startNode);
    const gScores = new Map<number, number>();
    gScores.set(key(startGx, startGy), 0);

    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1],
    ];

    let found: Node | null = null;

    while (open.length > 0) {
      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      if (current.gx === goalGx && current.gy === goalGy) {
        found = current;
        break;
      }

      const ck = key(current.gx, current.gy);
      if (closed.has(ck)) continue;
      closed.add(ck);

      for (const [ddx, ddy] of dirs) {
        const ngx = current.gx + ddx;
        const ngy = current.gy + ddy;
        if (ngx < 0 || ngx >= this.gridW || ngy < 0 || ngy >= this.gridH) continue;
        const nk = key(ngx, ngy);
        if (closed.has(nk)) continue;
        if (!this.passable[nk]) continue;

        const stepCost = (ddx !== 0 && ddy !== 0 ? 1.414 : 1) * this.cost[nk];
        const ng = current.g + stepCost;
        const prevG = gScores.get(nk);
        if (prevG !== undefined && ng >= prevG) continue;
        gScores.set(nk, ng);

        open.push({ gx: ngx, gy: ngy, g: ng, f: ng + h(ngx, ngy), parent: current });
      }

      // Safety limit
      if (closed.size > 2000) break;
    }

    if (!found) {
      // No path found — return direct target
      return [{ x: tx, y: ty }];
    }

    // Reconstruct path as pixel-coordinate waypoints (center of each coarse cell)
    const path: { x: number; y: number }[] = [];
    let node: Node | null = found;
    while (node) {
      path.push({
        x: node.gx * ts + Math.floor(ts / 2),
        y: node.gy * ts + Math.floor(ts / 2),
      });
      node = node.parent;
    }
    path.reverse();

    // Skip the first waypoint (it's where we already are)
    if (path.length > 1) path.shift();

    return path;
  }

  /** Like findPath, but returns the total g-cost of the path (lower = more tunnel reuse).
   *  Returns Infinity if no path found. */
  pathCost(sx: number, sy: number, tx: number, ty: number): number {
    const ts = AI_COARSE_TILE_SIZE;
    const startGx = Math.floor(sx / ts);
    const startGy = Math.floor(sy / ts);
    const goalGx = Math.floor(tx / ts);
    const goalGy = Math.floor(ty / ts);

    if (startGx === goalGx && startGy === goalGy) return 0;

    const open: Node[] = [];
    const closed = new Set<number>();
    const key = (gx: number, gy: number) => gy * this.gridW + gx;
    const h = (gx: number, gy: number) =>
      Math.max(Math.abs(gx - goalGx), Math.abs(gy - goalGy));

    open.push({ gx: startGx, gy: startGy, g: 0, f: h(startGx, startGy), parent: null });
    const gScores = new Map<number, number>();
    gScores.set(key(startGx, startGy), 0);

    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1],
    ];

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      if (current.gx === goalGx && current.gy === goalGy) return current.g;

      const ck = key(current.gx, current.gy);
      if (closed.has(ck)) continue;
      closed.add(ck);

      for (const [ddx, ddy] of dirs) {
        const ngx = current.gx + ddx;
        const ngy = current.gy + ddy;
        if (ngx < 0 || ngx >= this.gridW || ngy < 0 || ngy >= this.gridH) continue;
        const nk = key(ngx, ngy);
        if (closed.has(nk)) continue;
        if (!this.passable[nk]) continue;

        const stepCost = (ddx !== 0 && ddy !== 0 ? 1.414 : 1) * this.cost[nk];
        const ng = current.g + stepCost;
        const prevG = gScores.get(nk);
        if (prevG !== undefined && ng >= prevG) continue;
        gScores.set(nk, ng);
        open.push({ gx: ngx, gy: ngy, g: ng, f: ng + h(ngx, ngy), parent: current });
      }

      if (closed.size > 2000) break;
    }

    return Infinity;
  }
}
