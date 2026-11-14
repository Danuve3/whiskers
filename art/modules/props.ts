// Mobiliario urbano y vegetación en vóxeles.
import type { VoxelWorld } from '../voxel/world.ts';
import { rng, hash3 } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { box, cylinder, ellipsoid, Frame } from '../voxel/shapes.ts';
import { pot } from './house.ts';
import { DECALS, textRows } from '../decals.ts';

export interface FountainInfo {
  spouts: [number, number, number, number, number][]; // x,y,z de salida y dx,dy
  basin: { cx: number; cy: number; r: number; z: number };
  bowl: { cx: number; cy: number; r: number; z: number };
}

function inSq(dx: number, dy: number, a: number): boolean {
  return Math.abs(dx) <= a && Math.abs(dy) <= a;
}

/** ¿Está (dx,dy) dentro de un octógono regular de apotema a? */
function inOct(dx: number, dy: number, a: number): boolean {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  return ax <= a && ay <= a && ax + ay <= a * 1.414;
}

function octNormal(dx: number, dy: number, a: number): [number, number, number] {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
  // faceta más cercana
  const dAx = a - ax, dAy = a - ay, dD = a * 1.414 - (ax + ay);
  if (dD < dAx && dD < dAy) return [sx, sy, 0];
  if (dAx < dAy) return [sx, 0, 0];
  return [0, sy, 0];
}

/** Prisma octogonal con normales por faceta. */
export function octPrism(w: VoxelWorld, cx: number, cy: number, a: number, z0: number, z1: number, mat: number, obj: number, normals = true): void {
  for (let y = Math.floor(cy - a - 1); y <= Math.ceil(cy + a + 1); y++)
    for (let x = Math.floor(cx - a - 1); x <= Math.ceil(cx + a + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (!inOct(dx, dy, a)) continue;
      const border = !inOct(dx, dy, a - 1.2);
      for (let z = z0; z < z1; z++) w.set(x, y, z, mat, obj, normals && border && z < z1 - 1 ? octNormal(dx, dy, a) : null);
    }
}

/** Fuente de granito octogonal con columna central, taza y cuatro caños. */
export function fountain(w: VoxelWorld, cx: number, cy: number, z0: number, obj: number): FountainInfo {
  const A = 25, Ai = 21, H = 12;
  for (let y = cy - A - 4; y <= cy + A + 4; y++)
    for (let x = cx - A - 4; x <= cx + A + 4; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      // escalón perimetral
      if (inSq(dx, dy, A + 3) && !inSq(dx, dy, A)) {
        for (let z = z0; z < z0 + 3; z++) w.set(x, y, z, z === z0 + 2 ? MAT.rim : MAT.stoneWarm, obj);
      }
      if (inSq(dx, dy, A) && !inSq(dx, dy, Ai)) {
        for (let z = z0; z < z0 + H; z++) {
          const top = z === z0 + H - 1;
          // sillares del pilón: junta vertical cada 12 vóxeles
          const joint = !top && (Math.round(dx + dy + 100) % 12 === 0 || Math.round(dx - dy + 100) % 12 === 0) && z > z0;
          w.set(x, y, z, top ? MAT.rim : joint ? MAT.granite : MAT.stoneWarm, obj);
        }
      }
      if (inSq(dx, dy, Ai)) {
        for (let z = z0; z < z0 + H - 3; z++) w.set(x, y, z, MAT.water, obj);
      }
    }
  // columna central octogonal con basa, fuste, capitel y taza
  octPrism(w, cx, cy, 6, z0 + H - 3, z0 + H + 1, MAT.stoneWarm, obj);
  octPrism(w, cx, cy, 5, z0 + H + 1, z0 + H + 3, MAT.rim, obj);
  octPrism(w, cx, cy, 3.5, z0 + H + 3, z0 + 42, MAT.stoneWarm, obj);
  octPrism(w, cx, cy, 5, z0 + 42, z0 + 45, MAT.stoneWarm, obj);
  for (let z = z0 + 45; z < z0 + 50; z++) octPrism(w, cx, cy, 6 + (z - z0 - 45) * 1.2, z, z + 1, MAT.stoneWarm, obj);
  octPrism(w, cx, cy, 11, z0 + 50, z0 + 52, MAT.rim, obj);
  octPrism(w, cx, cy, 9, z0 + 51, z0 + 52, MAT.water, obj, false);
  // remate: pináculo y bola
  octPrism(w, cx, cy, 2.5, z0 + 52, z0 + 60, MAT.stoneWarm, obj);
  octPrism(w, cx, cy, 3.5, z0 + 60, z0 + 62, MAT.rim, obj);
  ellipsoid(w, cx, cy, z0 + 65, 3.4, 3.4, 4, MAT.stoneWarm, obj);
  // caños de hierro
  const spouts: FountainInfo['spouts'] = [];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    for (let k = 3; k < 9; k++) w.set(cx + dx * k, cy + dy * k, z0 + 34, MAT.iron, obj);
    spouts.push([cx + dx * 9, cy + dy * 9, z0 + 34, dx, dy]);
  }
  return { spouts, basin: { cx, cy, r: Ai, z: z0 + H - 3 }, bowl: { cx, cy, r: 9, z: z0 + 52 } };
}

/** Farola de hierro fundido con farol de cuatro caras. */
export function lamp(w: VoxelWorld, x: number, y: number, z0: number, obj: number): [number, number, number] {
  box(w, x - 2, y - 2, z0, x + 3, y + 3, z0 + 4, MAT.granite, obj);
  box(w, x - 1, y - 1, z0 + 4, x + 2, y + 2, z0 + 10, MAT.iron, obj);
  box(w, x, y, z0 + 10, x + 1, y + 1, z0 + 74, MAT.iron, obj);
  box(w, x - 1, y - 1, z0 + 40, x + 2, y + 2, z0 + 42, MAT.iron, obj);
  // farol
  box(w, x - 2, y - 2, z0 + 74, x + 3, y + 3, z0 + 76, MAT.iron, obj);
  for (let z = z0 + 76; z < z0 + 88; z++)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const corner = Math.abs(dx) === 2 && Math.abs(dy) === 2;
        w.set(x + dx, y + dy, z, corner ? MAT.iron : MAT.glass, obj, null, corner ? undefined : 254);
      }
  box(w, x - 3, y - 3, z0 + 88, x + 4, y + 4, z0 + 90, MAT.iron, obj);
  box(w, x - 2, y - 2, z0 + 90, x + 3, y + 3, z0 + 92, MAT.iron, obj);
  box(w, x - 1, y - 1, z0 + 92, x + 2, y + 2, z0 + 95, MAT.iron, obj);
  box(w, x, y, z0 + 95, x + 1, y + 1, z0 + 98, MAT.iron, obj);
  return [x + 0.5, y + 0.5, z0 + 82];
}

/** Banco de listones de madera con patas de hierro. axis: 'x' a lo largo de x. */
export function bench(w: VoxelWorld, x: number, y: number, z0: number, axis: 'x' | 'y', obj: number, backSide: 1 | -1): void {
  const L = 28, Dp = 7;
  const F = new Frame(axis === 'x' ? '+y' : '+x', x, y, L);
  // patas
  for (const u of [2, L - 3]) {
    F.fill(w, u, u + 1, -Dp + 1, 1, z0, z0 + 12, MAT.iron, obj);
  }
  // asiento (listones)
  F.fill(w, 0, L, -Dp + 1, 1, z0 + 12, z0 + 14, (_u, d) => (d % 2 === 0 ? MAT.wood : -1), obj);
  F.fill(w, 0, L, -Dp + 1, 1, z0 + 11, z0 + 12, (u) => (u === 2 || u === L - 3 ? MAT.iron : -1), obj);
  // respaldo
  const bd = backSide === -1 ? -Dp + 1 : 0;
  F.fill(w, 2, 3, bd, bd + 1, z0 + 14, z0 + 28, MAT.iron, obj);
  F.fill(w, L - 3, L - 2, bd, bd + 1, z0 + 14, z0 + 28, MAT.iron, obj);
  F.fill(w, 0, L, bd, bd + 1, z0 + 18, z0 + 28, (_u, _d, z) => ((z - z0) % 4 < 2 ? MAT.wood : -1), obj);
}

/** Árbol de copa redondeada (plátano de sombra) con alcorque. */
export function tree(w: VoxelWorld, x: number, y: number, z0: number, obj: number, seed: number, scale = 1): void {
  const R = rng(seed);
  // alcorque
  box(w, x - 9, y - 9, z0 - 1, x + 10, y + 10, z0 + 1, (xx, yy) => (Math.abs(xx - x) > 7 || Math.abs(yy - y) > 7 ? MAT.granite : MAT.earth), obj);
  // tronco con leve inclinación
  const th = Math.round(64 * scale);
  for (let z = z0; z < z0 + th; z++) {
    const t = (z - z0) / th;
    const ox = Math.round(t * 3), oy = Math.round(-t * 2);
    const r = z < z0 + 6 ? 4.2 : 3.2 - t * 0.8;
    cylinder(w, x + 0.5 + ox, y + 0.5 + oy, r, z, z + 1, MAT.bark, obj);
  }
  // ramas
  const tx = x + 3, ty = y - 2, tz = z0 + th;
  for (const [bx, by, bz] of [[-10, 4, 18], [10, -6, 14], [4, 10, 20], [-6, -10, 16]] as const) {
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      cylinder(w, tx + bx * t, ty + by * t, 1.6, Math.round(tz - 10 + bz * t), Math.round(tz - 8 + bz * t), MAT.bark, obj);
    }
  }
  // copa: racimo de elipsoides con borde irregular
  const cz = tz + 22 * scale;
  const blobs: [number, number, number, number][] = [[0, 0, 0, 22]];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const rr = 12 + R() * 8;
    blobs.push([Math.cos(a) * rr, Math.sin(a) * rr, (R() - 0.3) * 14, 11 + R() * 6]);
  }
  for (const [bx, by, bz, br] of blobs) {
    const r = br * scale;
    ellipsoid(w, tx + bx * scale, ty + by * scale, cz + bz * scale, r, r, r * 1.15, MAT.leaf, obj, (xx, yy, zz) => (hash3(xx >> 1, yy >> 1, zz >> 1, seed) - 0.5) * 0.35);
  }
}

/** Quiosco de prensa de madera verde con tejadillo y mostrador. */
export function kiosk(w: VoxelWorld, x: number, y: number, z0: number, obj: number): [number, number, number] {
  const S = 22, H = 52;
  box(w, x, y, z0, x + S, y + S, z0 + 3, MAT.granite, obj);
  for (let z = z0 + 3; z < z0 + H; z++)
    for (let yy = y + 1; yy < y + S - 1; yy++)
      for (let xx = x + 1; xx < x + S - 1; xx++) {
        const edge = xx === x + 1 || yy === y + 1 || xx === x + S - 2 || yy === y + S - 2;
        if (!edge) continue;
        // ventanilla en la cara +y (izquierda en pantalla) y en la +x
        const winY = yy === y + S - 2 && xx > x + 4 && xx < x + S - 5 && z > z0 + 22 && z < z0 + 44;
        const winX = xx === x + S - 2 && yy > y + 5 && yy < y + S - 6 && z > z0 + 24 && z < z0 + 44;
        if (winY || winX) {
          w.set(xx, yy, z, (xx + yy) % 5 === 0 ? MAT.woodGreen : MAT.glass, obj, null, 253);
          continue;
        }
        const post = (xx === x + 1 || xx === x + S - 2) && (yy === y + 1 || yy === y + S - 2);
        w.set(xx, yy, z, post ? MAT.woodGreen : z < z0 + 20 ? MAT.woodGreen : MAT.woodGreen, obj);
      }
  // mostrador
  box(w, x + 4, y + S - 1, z0 + 20, x + S - 4, y + S + 3, z0 + 23, MAT.wood, obj);
  // revistas en el mostrador
  for (let i = 0; i < 6; i++) box(w, x + 5 + i * 2, y + S, z0 + 23, x + 6 + i * 2, y + S + 2, z0 + 25, i % 2 ? MAT.paper : MAT.awningRed, obj);
  // tejadillo a cuatro aguas
  for (let k = 0; k < 10; k++) {
    const o = 4 - k;
    box(w, x + Math.min(o, 11), y + Math.min(o, 11), z0 + H + k, x + S - Math.min(o, 11), y + S - Math.min(o, 11), z0 + H + k + 1, (xx, yy) => {
      const ex = Math.min(xx - x - o, x + S - o - 1 - xx), ey = Math.min(yy - y - o, y + S - o - 1 - yy);
      return Math.min(ex, ey) <= 1 ? MAT.zinc : -1;
    }, obj);
  }
  box(w, x + 9, y + 9, z0 + H + 9, x + 13, y + 13, z0 + H + 13, MAT.zinc, obj);
  // cartel
  box(w, x + 3, y + S - 1, z0 + H - 8, x + S - 3, y + S, z0 + H - 1, MAT.paper, obj);
  DECALS.push({ kind: 'face', obj, F: new Frame('+y', x, y + S - 1, S), u: S / 2 - 5.5, d: 0, z: z0 + H - 7, rows: textRows('PRENSA'), key: { '#': 'veg1', '.': null }, mats: [MAT.paper] });
  return [x + S / 2, y + S + 4, z0 + 40];
}

/** Jardinera de granito con geranios o arbusto. */
export function planter(w: VoxelWorld, x: number, y: number, z0: number, obj: number, seed: number, kind: 'geranium' | 'shrub'): void {
  const S = 12;
  box(w, x, y, z0, x + S, y + S, z0 + 10, (xx, yy) => (xx === x || yy === y || xx === x + S - 1 || yy === y + S - 1 ? MAT.granite : MAT.earth), obj);
  const R = rng(seed);
  if (kind === 'shrub') {
    ellipsoid(w, x + S / 2, y + S / 2, z0 + 18, 7, 7, 10, MAT.leaf, obj, (a, b, c) => (hash3(a, b, c, seed) - 0.5) * 0.4);
  } else {
    const F = new Frame('+y', x, y + S - 1, S);
    for (let k = 0; k < 5; k++) pot(w, F, 1 + Math.floor(R() * 7), -1 - Math.floor(R() * 8), z0 + 6, obj, R);
  }
}
