// Colisiones a partir del propio mundo de vóxeles: una casilla deja de ser transitable si hay
// volumen sólido de algún objeto (banco, tronco, farola, jardinera, puesto, cajas…) a la altura
// del cuerpo dentro de su zona central. Así cualquier objeto nuevo bloquea solo, sin listas a mano.
import type { VoxelWorld } from '../voxel/world.ts';
import type { ZoneObject } from './plaza.ts';

const T = 16;
/** margen de la casilla que no cuenta (el cuerpo pasa por el centro, ±4 vóxeles) */
const MARGIN = 3;
/** de 2 a 30 vóxeles sobre el suelo: ni felpudos ni toldos ni copas altas */
const Z0 = 2, Z1 = 30;
/** columnas ocupadas necesarias para bloquear (una farola ocupa 2×2) */
const MIN_COLS = 4;
/** se cruzan (hierba alta) o ya los separa el desnivel (pretil) */
const PASSABLE = new Set(['hierba', 'pretil', 'muro-escalera']);

export function blockSolids(w: VoxelWorld, objects: ZoneObject[], TW: number, TH: number, height: number[], walk: number[]): void {
  const skip = new Set<number>();
  for (const o of objects) if (PASSABLE.has(o.name)) skip.add(o.id);
  for (let ty = 0; ty < TH; ty++)
    for (let tx = 0; tx < TW; tx++) {
      const i = ty * TW + tx;
      if (!walk[i]) continue;
      const floor = height[i];
      let cols = 0;
      for (let vy = ty * T + MARGIN; vy < (ty + 1) * T - MARGIN && cols < MIN_COLS; vy++)
        for (let vx = tx * T + MARGIN; vx < (tx + 1) * T - MARGIN && cols < MIN_COLS; vx++)
          for (let z = floor + Z0; z < floor + Z1; z++) {
            if (!w.inBounds(vx, vy, z)) continue;
            const o = w.obj(vx, vy, z);
            if (o && !skip.has(o) && w.mat(vx, vy, z)) {
              cols++;
              break;
            }
          }
      if (cols >= MIN_COLS) walk[i] = 0;
    }
}

/**
 * Paredes finas entre casillas (vallas, muros, setos…): si caen justo en el borde, las dos casillas
 * quedan libres y se podría cruzar. Se marca el borde: bit 1 = hacia +x, bit 2 = hacia +y.
 */
export function blockEdges(w: VoxelWorld, objects: ZoneObject[], TW: number, TH: number, height: number[], walk: number[]): number[] {
  const skip = new Set<number>();
  for (const o of objects) if (PASSABLE.has(o.name)) skip.add(o.id);
  const solid = (x: number, y: number, z0: number, z1: number) => {
    for (let z = z0; z < z1; z++) {
      if (!w.inBounds(x, y, z)) continue;
      const o = w.obj(x, y, z);
      if (o && !skip.has(o) && w.mat(x, y, z)) return true;
    }
    return false;
  };
  const edges = new Array(TW * TH).fill(0);
  for (let ty = 0; ty < TH; ty++)
    for (let tx = 0; tx < TW; tx++) {
      const i = ty * TW + tx;
      if (!walk[i]) continue;
      for (const [bit, dx, dy] of [[1, 1, 0], [2, 0, 1]] as const) {
        const nx = tx + dx, ny = ty + dy;
        if (nx >= TW || ny >= TH || !walk[ny * TW + nx]) continue;
        const floor = Math.min(height[i], height[ny * TW + nx]);
        // franja del cuerpo (±3 vóxeles) a lo largo del paso entre los dos centros
        let hits = 0;
        for (let t = 0; t <= 16; t++) {
          const cx = tx * T + 8 + dx * t, cy = ty * T + 8 + dy * t;
          for (let s = -3; s <= 3; s++) {
            const sx = cx + dy * s, sy = cy + dx * s;
            if (solid(sx, sy, floor + Z0, floor + Z1)) {
              hits++;
              break;
            }
          }
        }
        if (hits >= 2) edges[i] |= bit;
      }
    }
  return edges;
}
