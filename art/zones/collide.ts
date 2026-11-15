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
const PASSABLE = new Set(['hierba', 'pretil']);

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
