// A* sobre la rejilla isométrica (8 vecinos, sin cortar esquinas, con desnivel máximo).
export interface Grid {
  w: number;
  h: number;
  walk: ArrayLike<number>;
  height: ArrayLike<number>;
  /** paredes finas en el borde entre casillas: bit 1 = hacia +x, bit 2 = hacia +y */
  edges?: ArrayLike<number>;
}

/** ¿Hay una pared fina entre dos casillas vecinas (ortogonales)? */
function edgeOpen(g: Grid, ax: number, ay: number, bx: number, by: number): boolean {
  const E = g.edges;
  if (!E || !E.length) return true;
  if (by === ay) {
    if (bx === ax + 1) return !(E[ay * g.w + ax] & 1);
    if (bx === ax - 1) return !(E[by * g.w + bx] & 1);
  }
  if (bx === ax) {
    if (by === ay + 1) return !(E[ay * g.w + ax] & 2);
    if (by === ay - 1) return !(E[by * g.w + bx] & 2);
  }
  return true;
}

export const MAX_STEP = 12;

export function walkable(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h && g.walk[y * g.w + x] === 1;
}

function canStep(g: Grid, ax: number, ay: number, bx: number, by: number): boolean {
  if (!walkable(g, bx, by)) return false;
  if (!edgeOpen(g, ax, ay, bx, by)) return false;
  return Math.abs(g.height[ay * g.w + ax] - g.height[by * g.w + bx]) <= MAX_STEP;
}

export function findPath(g: Grid, sx: number, sy: number, tx: number, ty: number, blocked?: (x: number, y: number) => boolean, extraCost?: (x: number, y: number) => number): [number, number][] | null {
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
        // en diagonal, sin cortar esquinas: los dos caminos en L tienen que estar libres
        if (dx && dy && (!canStep(g, cx, cy, nx, cy) || !canStep(g, cx, cy, cx, ny) || !canStep(g, nx, cy, nx, ny) || !canStep(g, cx, ny, nx, ny))) continue;
        const ni = ny * g.w + nx;
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dx && dy ? Math.SQRT2 : 1) + (extraCost ? extraCost(nx, ny) : 0);
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

/**
 * Casillas del «borde delantero»: dan (hacia +x o +y, lo que queda delante en pantalla) a un desnivel
 * o a algo sólido. Un animal grande parado ahí sobresale por encima de la pared.
 */
export function frontEdges(g: Grid): Uint8Array {
  const out = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!g.walk[i]) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (!g.walk[j] || g.height[j] < g.height[i] - MAX_STEP) {
          out[i] = 1;
          break;
        }
      }
    }
  return out;
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
