// A* sobre la rejilla isométrica (8 vecinos, sin cortar esquinas, con desnivel máximo).
export interface Grid {
  w: number;
  h: number;
  walk: ArrayLike<number>;
  height: ArrayLike<number>;
}

export const MAX_STEP = 12;

export function walkable(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h && g.walk[y * g.w + x] === 1;
}

function canStep(g: Grid, ax: number, ay: number, bx: number, by: number): boolean {
  if (!walkable(g, bx, by)) return false;
  return Math.abs(g.height[ay * g.w + ax] - g.height[by * g.w + bx]) <= MAX_STEP;
}

export function findPath(g: Grid, sx: number, sy: number, tx: number, ty: number, blocked?: (x: number, y: number) => boolean): [number, number][] | null {
  if (!walkable(g, tx, ty)) return null;
  const N = g.w * g.h;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: number[] = [];
  const f = new Float32Array(N).fill(Infinity);
  const start = sy * g.w + sx, goal = ty * g.w + tx;
  const hfn = (i: number) => {
    const dx = Math.abs((i % g.w) - tx), dy = Math.abs(Math.floor(i / g.w) - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  gScore[start] = 0;
  f[start] = hfn(start);
  open.push(start);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: [number, number][] = [];
      for (let c = cur; c !== -1; c = came[c]) path.push([c % g.w, Math.floor(c / g.w)]);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w, cy = Math.floor(cur / g.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!canStep(g, cx, cy, nx, ny)) continue;
        if (blocked && blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        if (dx && dy && (!canStep(g, cx, cy, nx, cy) || !canStep(g, cx, cy, cx, ny))) continue;
        const ni = ny * g.w + nx;
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          f[ni] = ng + hfn(ni);
          open.push(ni);
        }
      }
    if (open.length > N * 4) break;
  }
  return null;
}

/** Tile transitable más cercano a (x, y). */
export function nearestWalkable(g: Grid, x: number, y: number): [number, number] | null {
  for (let r = 0; r < Math.max(g.w, g.h); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(g, x + dx, y + dy)) return [x + dx, y + dy];
      }
  return null;
}
