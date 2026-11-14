// Más mobiliario: cajas, palés, cartones, vallas, puestos de mercado, barcas, norays, nasas,
// redes, caseta de redes, templete de música, setos y parterres.
import type { VoxelWorld } from '../voxel/world.ts';
import { rng, hash3 } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { box, ellipsoid, cylinder } from '../voxel/shapes.ts';

/** Caja de fruta de madera con contenido opcional. */
export function crate(w: VoxelWorld, x: number, y: number, z: number, obj: number, fill: number | null, h = 7): void {
  box(w, x, y, z, x + 10, y + 8, z + h, (xx, yy, zz) => {
    const edge = xx === x || xx === x + 9 || yy === y || yy === y + 7;
    if (!edge && zz > z) return -1;
    return (zz - z) % 3 === 2 && edge ? -1 : MAT.wood;
  }, obj);
  if (fill) {
    const R = rng(x * 31 + y);
    for (let yy = y + 1; yy < y + 7; yy++)
      for (let xx = x + 1; xx < x + 9; xx++) if (R() < 0.85) w.set(xx, yy, z + h - 1 + (R() < 0.3 ? 1 : 0), fill, obj);
  }
}

/** Caja de cartón (refugio para gatos) con solapas. */
export function cardboard(w: VoxelWorld, x: number, y: number, z: number, obj: number, open: '+x' | '+y' = '+y'): void {
  box(w, x, y, z, x + 14, y + 12, z + 12, (xx, yy, zz) => {
    const inner = xx > x && xx < x + 13 && yy > y && yy < y + 11 && zz > z;
    if (inner) return -1;
    // boca abierta hacia el frente
    if (open === '+y' && yy === y + 11 && xx > x + 2 && xx < x + 11 && zz > z && zz < z + 9) return -1;
    if (open === '+x' && xx === x + 13 && yy > y + 2 && yy < y + 9 && zz > z && zz < z + 9) return -1;
    return MAT.cardboard;
  }, obj);
  // solapas abiertas
  box(w, x - 2, y, z + 12, x, y + 12, z + 13, MAT.cardboard, obj);
  box(w, x + 14, y, z + 12, x + 16, y + 12, z + 13, MAT.cardboard, obj);
}

export function pallet(w: VoxelWorld, x: number, y: number, z: number, obj: number, stack = 1): void {
  for (let k = 0; k < stack; k++) {
    const zz = z + k * 4;
    box(w, x, y, zz, x + 18, y + 14, zz + 2, (xx, yy) => (xx % 6 < 2 || yy === y || yy === y + 13 || yy === y + 6 ? MAT.wood : -1), obj);
    box(w, x, y, zz + 2, x + 18, y + 14, zz + 4, (xx) => (xx % 3 === 0 ? MAT.wood : -1), obj);
  }
}

/** Valla de madera a lo largo de x o y. */
export function fence(w: VoxelWorld, x: number, y: number, z: number, len: number, axis: 'x' | 'y', obj: number, mat = MAT.wood): void {
  for (let i = 0; i < len; i++) {
    const xx = axis === 'x' ? x + i : x, yy = axis === 'y' ? y + i : y;
    if (i % 6 === 0) for (let k = 0; k < 18; k++) w.set(xx, yy, z + k, mat, obj);
    w.set(xx, yy, z + 7, mat, obj);
    w.set(xx, yy, z + 14, mat, obj);
    if (i % 6 === 3 && hash3(xx, yy, 0, 2) < 0.6) for (let k = 4; k < 16; k++) w.set(xx, yy, z + k, mat, obj);
  }
}

/** Puesto de mercado: mostrador, toldo a rayas y género. */
export function stall(w: VoxelWorld, x: number, y: number, z: number, obj: number, kind: 'fruta' | 'pescado' | 'flores' | 'queso', stripe: number): void {
  const L = 28, D = 14;
  // mostrador
  box(w, x, y, z, x + L, y + D, z + 14, (xx, yy, zz) => (xx === x || xx === x + L - 1 || yy === y || yy === y + D - 1 || zz === z + 13 ? MAT.wood : -1), obj);
  // postes y toldo inclinado
  for (const [px, py] of [[x, y], [x + L - 1, y], [x, y + D - 1], [x + L - 1, y + D - 1]] as const) for (let k = 14; k < 34; k++) w.set(px, py, z + k, MAT.wood, obj);
  for (let yy = y - 2; yy < y + D + 3; yy++)
    for (let xx = x - 1; xx < x + L + 1; xx++) {
      const zz = z + 36 - Math.floor((yy - y) / 3);
      const m = Math.floor((xx - x) / 4) % 2 === 0 ? stripe : MAT.awningWhite;
      w.set(xx, yy, zz, m, obj);
    }
  // género
  const R = rng(x * 7 + y * 13);
  for (let yy = y + 2; yy < y + D - 2; yy++)
    for (let xx = x + 2; xx < x + L - 2; xx++) {
      if (R() < 0.15) continue;
      let m: number = MAT.wood;
      if (kind === 'fruta') m = [MAT.flowerRed, MAT.fruitOrange, MAT.leaf, MAT.bread][Math.floor((xx - x) / 6) % 4];
      if (kind === 'pescado') m = R() < 0.7 ? MAT.fish : MAT.ice;
      if (kind === 'flores') m = [MAT.flowerRed, MAT.flowerPink, MAT.flowerWhite, MAT.leaf][Math.floor(R() * 4)];
      if (kind === 'queso') m = (xx + yy) % 5 < 2 ? MAT.cheese : MAT.bread;
      w.set(xx, yy, z + 14, m, obj);
      if (R() < 0.4) w.set(xx, yy, z + 15, m, obj);
    }
}

/** Barca de pesca de colores (casco, borda y banco). */
export function boat(w: VoxelWorld, x: number, y: number, z: number, obj: number, hull: number, trim: number, axis: 'x' | 'y'): void {
  const L = 44, B = 16;
  for (let i = 0; i < L; i++) {
    const t = i / (L - 1);
    const half = (B / 2) * Math.sin(Math.min(1, t * 1.25 + 0.05) * Math.PI * 0.92);
    for (let j = -B / 2; j < B / 2; j++) {
      if (Math.abs(j + 0.5) > half) continue;
      const rim = Math.abs(j + 0.5) > half - 1.4;
      for (let k = 0; k < 10; k++) {
        const deck = k < 3;
        if (!rim && !deck) continue;
        const m = k >= 8 ? trim : rim ? hull : MAT.wood;
        const xx = axis === 'x' ? x + i : x + j, yy = axis === 'x' ? y + j : y + i;
        w.set(xx, yy, z + k, m, obj);
      }
    }
    // bancos
    if (i === 16 || i === 30) for (let j = -5; j < 5; j++) w.set(axis === 'x' ? x + i : x + j, axis === 'x' ? y + j : y + i, z + 6, MAT.wood, obj);
  }
}

export function bollard(w: VoxelWorld, x: number, y: number, z: number, obj: number): void {
  cylinder(w, x, y, 2.6, z, z + 6, MAT.iron, obj);
  cylinder(w, x, y, 3.4, z + 6, z + 8, MAT.iron, obj);
}

/** Nasa de pesca (jaula de malla). */
export function nasa(w: VoxelWorld, x: number, y: number, z: number, obj: number): void {
  for (let k = 0; k < 9; k++)
    for (let a = 0; a < 24; a++) {
      const r = 5.5;
      const xx = Math.round(x + Math.cos((a / 24) * Math.PI * 2) * r), yy = Math.round(y + Math.sin((a / 24) * Math.PI * 2) * r);
      if (k % 3 === 0 || a % 4 === 0) w.set(xx, yy, z + k, k % 3 === 0 ? MAT.woodRed : MAT.iron, obj);
    }
  cylinder(w, x, y, 5.5, z + 9, z + 10, MAT.woodRed, obj);
}

export function nets(w: VoxelWorld, x: number, y: number, z: number, obj: number, color: number): void {
  ellipsoid(w, x, y, z + 2, 9, 7, 4, color, obj, (a, b, c) => (hash3(a, b, c, 9) - 0.5) * 0.5);
  for (let i = 0; i < 6; i++) w.set(x - 8 + i * 3, y + 7, z + 1, MAT.cork, obj);
}

/** Templete de música (palco) cuadrado con balaustrada y tejado de zinc. */
export function bandstand(w: VoxelWorld, x: number, y: number, z: number, obj: number): void {
  const S = 52;
  box(w, x, y, z, x + S, y + S, z + 12, (_xx, _yy, zz) => (zz === z + 11 ? MAT.slab : MAT.ashlar), obj);
  // escalones
  box(w, x + 18, y + S, z, x + 34, y + S + 8, z + 4, MAT.granite, obj);
  box(w, x + 18, y + S, z, x + 34, y + S + 4, z + 8, MAT.granite, obj);
  // columnas de hierro y barandilla
  for (const [cx, cy] of [[x + 2, y + 2], [x + S - 3, y + 2], [x + 2, y + S - 3], [x + S - 3, y + S - 3], [x + S / 2, y + 2], [x + 2, y + S / 2]] as const)
    for (let k = 12; k < 56; k++) w.set(cx, cy, z + k, MAT.iron, obj);
  for (let i = 0; i < S; i++) {
    for (const [xx, yy] of [[x + i, y + S - 1], [x + S - 1, y + i]] as const) {
      if (xx > x + 17 && xx < x + 34 && yy === y + S - 1) continue;
      w.set(xx, yy, z + 20, MAT.iron, obj);
      if (i % 3 === 0) for (let k = 12; k < 20; k++) w.set(xx, yy, z + k, MAT.iron, obj);
    }
  }
  // tejado a cuatro aguas de zinc con remate
  for (let k = 0; k < 16; k++) {
    const o = -3 + k * 1.7;
    const x0 = Math.round(x + o), x1 = Math.round(x + S - o), y0 = Math.round(y + o), y1 = Math.round(y + S - o);
    if (x1 <= x0) break;
    box(w, x0, y0, z + 56 + k, x1, y1, z + 57 + k, (xx: number, yy: number) => (xx < x0 + 2 || yy < y0 + 2 || xx >= x1 - 2 || yy >= y1 - 2 ? MAT.zinc : -1), obj);
  }
  cylinder(w, x + S / 2, y + S / 2, 2, z + 70, z + 78, MAT.iron, obj);
}

export function hedge(w: VoxelWorld, x: number, y: number, z: number, len: number, axis: 'x' | 'y', obj: number): void {
  for (let i = 0; i < len; i += 5) {
    const cx = axis === 'x' ? x + i : x, cy = axis === 'y' ? y + i : y;
    ellipsoid(w, cx + 3, cy + 3, z + 7, 5, 5, 8, MAT.leaf, obj, (a, b, c) => (hash3(a, b, c, 4) - 0.5) * 0.25);
  }
}

export function flowerbed(w: VoxelWorld, x: number, y: number, z: number, sx: number, sy: number, obj: number, seed: number): void {
  const R = rng(seed);
  box(w, x, y, z, x + sx, y + sy, z + 3, (xx, yy) => (xx === x || yy === y || xx === x + sx - 1 || yy === y + sy - 1 ? MAT.curb : MAT.earth), obj);
  for (let yy = y + 1; yy < y + sy - 1; yy++)
    for (let xx = x + 1; xx < x + sx - 1; xx++) {
      if (R() < 0.35) continue;
      const h = 2 + Math.floor(R() * 4);
      for (let k = 0; k < h; k++) w.set(xx, yy, z + 3 + k, k === h - 1 && R() < 0.6 ? [MAT.flowerRed, MAT.flowerPink, MAT.flowerWhite][Math.floor(R() * 3)] : MAT.leaf, obj);
    }
}

/** Hierba alta en matas. */
export function tallGrass(w: VoxelWorld, x: number, y: number, z: number, r: number, obj: number, seed: number): void {
  const R = rng(seed);
  for (let i = 0; i < r * r * 0.8; i++) {
    const a = R() * Math.PI * 2, d = R() * r;
    const xx = Math.round(x + Math.cos(a) * d), yy = Math.round(y + Math.sin(a) * d);
    const h = 3 + Math.floor(R() * 6);
    for (let k = 0; k < h; k++) w.set(xx, yy, z + k, k > h - 2 && R() < 0.2 ? MAT.flowerWhite : MAT.leaf, obj);
  }
}

/** Caseta de redes del puerto: piedra, tejado de teja y puerta azul. */
export function shed(w: VoxelWorld, x: number, y: number, z: number, obj: number): void {
  const L = 48, D = 32, H = 40;
  box(w, x, y, z, x + L, y + D, z + H, (xx, yy, zz) => {
    const edge = xx < x + 3 || yy < y + 3 || xx >= x + L - 3 || yy >= y + D - 3;
    if (!edge) return -1;
    // puerta en la cara +y
    if (yy >= y + D - 3 && xx > x + 16 && xx < x + 30 && zz < z + 30) return yy === y + D - 3 ? MAT.woodBlue : -1;
    return zz < z + 8 ? MAT.ashlar : MAT.rubble;
  }, obj);
  for (let k = 0; k < 18; k++) {
    const yy0 = y - 3 + k, yy1 = y + D + 3 - k;
    if (yy1 <= yy0) break;
    for (const yy of [yy0, yy1 - 1]) for (let xx = x - 3; xx < x + L + 3; xx++) w.set(xx, yy, z + H + k, MAT.roofX, obj, [0, yy === yy0 ? -0.45 : 0.45, 0.9]);
    for (let yy = yy0; yy < yy1; yy++) for (const xx of [x, x + 1, x + L - 2, x + L - 1]) if (k < 16) w.set(xx, yy, z + H + k - 1, MAT.rubble, obj);
  }
}
