// Primitivas de modelado en vóxeles.
import type { VoxelWorld } from './world.ts';

export type V3 = [number, number, number];

/** Caja [x0,x1)×[y0,y1)×[z0,z1). mat 0 = vaciar. */
export function box(
  w: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  mat: number | ((x: number, y: number, z: number) => number), obj: number, tag?: number,
): void {
  for (let z = z0; z < z1; z++)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const m = typeof mat === 'number' ? mat : mat(x, y, z);
        if (m < 0) continue;
        w.set(x, y, z, m, obj, null, tag);
      }
}

/** Caja hueca: solo la cáscara de grosor t (el interior nunca se ve). */
export function shell(
  w: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  mat: number | ((x: number, y: number, z: number) => number), obj: number, t = 3,
): void {
  for (let z = z0; z < z1; z++)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (x >= x0 + t && x < x1 - t && y >= y0 + t && y < y1 - t && z >= z0 + t && z < z1 - t) continue;
        const m = typeof mat === 'number' ? mat : mat(x, y, z);
        if (m < 0) continue;
        w.set(x, y, z, m, obj);
      }
}

/** Cilindro vertical con normales radiales (para piedra redondeada). */
export function cylinder(
  w: VoxelWorld, cx: number, cy: number, r: number, z0: number, z1: number,
  mat: number | ((x: number, y: number, z: number) => number), obj: number, opts: { hollow?: number; normals?: boolean; topNormal?: boolean } = {},
): void {
  const ri = opts.hollow ?? -1;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      if (ri >= 0 && d < ri) continue;
      for (let z = z0; z < z1; z++) {
        const m = typeof mat === 'number' ? mat : mat(x, y, z);
        if (m < 0) continue;
        const isTop = z === z1 - 1;
        let n: V3 | null = null;
        if (opts.normals !== false && d > r - 1.6) n = isTop ? (opts.topNormal ? [dx / d, dy / d, 1.6] : null) : [dx / d, dy / d, 0];
        w.set(x, y, z, m, obj, n);
      }
    }
}

/** Elipsoide con normales (copas de árbol, piedras, arbustos). */
export function ellipsoid(
  w: VoxelWorld, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number,
  mat: number | ((x: number, y: number, z: number) => number), obj: number, jitter?: (x: number, y: number, z: number) => number,
): void {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
        const d = dx * dx + dy * dy + dz * dz;
        const lim = 1 + (jitter ? jitter(x, y, z) : 0);
        if (d > lim) continue;
        const m = typeof mat === 'number' ? mat : mat(x, y, z);
        if (m < 0) continue;
        w.set(x, y, z, m, obj, [dx / rx, dy / ry, dz / rz]);
      }
}

/**
 * Marco de fachada: u avanza de izquierda a derecha en pantalla, d hacia la calle, z hacia arriba.
 * facing '+y' → fachada visible como cara izquierda; '+x' → cara derecha.
 */
export class Frame {
  constructor(
    readonly facing: '+x' | '+y',
    /** origen: esquina izquierda (en pantalla) de la fachada, en el plano exterior */
    readonly x0: number,
    readonly y0: number,
    readonly width: number,
  ) {}
  /** Vóxel en (u, d, z). d = 0 es la capa exterior del muro; d > 0 sobresale. */
  at(u: number, d: number): [number, number] {
    if (this.facing === '+y') return [this.x0 + u, this.y0 + d];
    return [this.x0 + d, this.y0 + this.width - 1 - u];
  }
  set(w: VoxelWorld, u: number, d: number, z: number, mat: number, obj: number, tag?: number): void {
    const [x, y] = this.at(u, d);
    w.set(x, y, z, mat, obj, null, tag);
  }
  fill(
    w: VoxelWorld, u0: number, u1: number, d0: number, d1: number, z0: number, z1: number,
    mat: number | ((u: number, d: number, z: number) => number), obj: number, tag?: number,
  ): void {
    for (let z = z0; z < z1; z++)
      for (let d = d0; d < d1; d++)
        for (let u = u0; u < u1; u++) {
          const m = typeof mat === 'number' ? mat : mat(u, d, z);
          if (m < 0) continue;
          this.set(w, u, d, z, m, obj, tag);
        }
  }
}
