// Casas modulares del casco antiguo: planta baja, plantas altas, ventanas, balcones, galerías,
// tejado de teja, chimenea, bajante y farolillo. Todo en espacio de fachada (u, d, z).
import type { VoxelWorld } from '../voxel/world.ts';
import { rng } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { Frame } from '../voxel/shapes.ts';
import { DECALS, windowDecals, wallDecals, textRows, AZULEJO, AZULEJO_KEY, BREAD, BREAD_KEY, FRUIT, FRUIT_KEY } from '../decals.ts';

export const GROUND_Z = 40; // cota del suelo de la plaza (la calle de abajo está en z = 4)
export const GF_H = 96; // planta baja
export const FL_H = 80; // plantas altas

export type GroundKind = 'door' | 'shop' | 'bakery' | 'arch' | 'windows';
export type UpperKind = 'windows' | 'balconies' | 'galeria' | 'mixed';

export interface HouseSpec {
  obj: number;
  frame: Frame;
  /** fondo en vóxeles (hacia dentro) */
  depth: number;
  floors: number; // incluye planta baja
  ground: GroundKind;
  upper: UpperKind[]; // una por planta alta
  wall: number; // material de las plantas altas
  base: number; // material de la planta baja
  quoins?: boolean; // esquinas de sillería
  shutter?: number; // material de contraventanas
  frameMat?: number; // material de carpintería
  seed: number;
  chimney?: boolean;
  sideWallVisible?: 'left' | 'right' | null;
}

export interface HouseInfo {
  /** emisores de humo (coordenadas de vóxel) */
  smoke: [number, number, number][];
  /** luces (farolillos de pared) */
  lights: [number, number, number][];
  /** vapor (panadería) */
  steam: [number, number, number][];
  /** anclas para ropa tendida: pares de puntos */
  lines: [[number, number, number], [number, number, number]][];
  /** caja núcleo para ordenar por profundidad */
  core: [number, number, number, number, number, number];
  /** zonas cubiertas (toldos) en tiles: [x0,y0,x1,y1] */
  shelters: [number, number, number, number][];
  /** puertas (tile delante de la puerta) */
  doors: [number, number][];
}

let windowCounter = 1;
export function nextWindowId(): number {
  windowCounter = (windowCounter % 250) + 1;
  return windowCounter;
}

export function buildHouse(w: VoxelWorld, s: HouseSpec): HouseInfo {
  const F = s.frame;
  const W = F.width;
  const D = s.depth;
  const R = rng(s.seed);
  const obj = s.obj;
  const z0 = GROUND_Z;
  const topZ = z0 + GF_H + FL_H * (s.floors - 1);
  const frameMat = s.frameMat ?? MAT.white;
  const info: HouseInfo = { smoke: [], lights: [], steam: [], lines: [], core: [0, 0, 0, 0, 0, 0], shelters: [], doors: [] };

  // --- Muros (cáscara). e = −d hacia dentro.
  const wallMat = (u: number, d: number, z: number): number => {
    if (z < z0 + GF_H) return s.base;
    // cadenas de sillería en esquinas de fachadas encaladas
    if (s.quoins && (u < 5 || u >= W - 5)) {
      const row = Math.floor((z - z0) / 10);
      const long = row % 2 === 0;
      if (u < (long ? 5 : 3) || u >= W - (long ? 5 : 3)) return MAT.ashlar;
    }
    // zócalo manchado justo encima de la planta baja
    void d;
    return s.wall;
  };
  F.fill(w, 0, W, -D + 1, 1, 0, topZ, (u, d, z) => {
    const e = -d;
    const inner = u >= 4 && u < W - 4 && e >= 6 && e < D - 4 && z >= 4 && z < topZ - 2;
    if (inner) return -1;
    return wallMat(u, d, z);
  }, obj);
  // cornisa de granito bajo el alero
  F.fill(w, -1, W + 1, 0, 2, topZ - 4, topZ, MAT.granite, obj);
  // imposta entre planta baja y primera
  F.fill(w, 0, W, 0, 1, z0 + GF_H - 3, z0 + GF_H, MAT.granite, obj);
  F.fill(w, 0, W, 1, 2, z0 + GF_H - 2, z0 + GF_H, MAT.granite, obj);

  // --- Planta baja
  const bays = Math.max(1, Math.round(W / 16));
  const bayW = W / bays;
  const doorBay = Math.floor(R() * bays);
  for (let b = 0; b < bays; b++) {
    const cu = Math.round(bayW * (b + 0.5));
    if (s.ground === 'bakery' || s.ground === 'shop') {
      if (b === doorBay) door(w, F, cu, z0, obj, s.ground === 'bakery' ? MAT.wood : MAT.woodGreen, 12, 70, info);
      else shopWindow(w, F, cu, z0, obj, s.ground === 'bakery' ? MAT.wood : MAT.woodGreen, Math.min(bayW - 4, 22), s.ground === 'bakery' ? 'bakery' : 'shop');
    } else if (s.ground === 'arch' && b === doorBay) {
      archDoor(w, F, cu, z0, obj, info);
    } else if (b === doorBay) {
      door(w, F, cu, z0, obj, R() < 0.5 ? MAT.wood : MAT.woodGreen, 12, 66, info);
    } else {
      window(w, F, cu, z0 + 34, 10, 36, obj, frameMat, s.shutter, R() < 0.5, true);
    }
  }
  // toldo de la tienda/panadería
  if (s.ground === 'bakery' || s.ground === 'shop') {
    awning(w, F, 2, W - 2, z0 + 76, obj);
    signBoard(w, F, Math.round(W / 2), z0 + 82, Math.min(W - 10, 44), obj, s.ground === 'bakery' ? 'PANADERÍA' : 'FRUTAS');
    const [ax0, ay0] = F.at(2, 1);
    const [ax1, ay1] = F.at(W - 2, 12);
    info.shelters.push([Math.min(ax0, ax1) / 16, Math.min(ay0, ay1) / 16, Math.max(ax0, ax1) / 16, Math.max(ay0, ay1) / 16]);
    if (s.ground === 'bakery') {
      const [sx, sy] = F.at(Math.round(bayW * (doorBay + 0.5)), 2);
      info.steam.push([sx, sy, z0 + 72]);
    }
  }

  // --- Plantas altas
  for (let f = 1; f < s.floors; f++) {
    const fz = z0 + GF_H + FL_H * (f - 1);
    const kind = s.upper[f - 1] ?? 'windows';
    if (kind === 'galeria') {
      galeria(w, F, 3, W - 3, fz, obj);
      continue;
    }
    for (let b = 0; b < bays; b++) {
      const cu = Math.round(bayW * (b + 0.5));
      const balcony = kind === 'balconies' || (kind === 'mixed' && b % 2 === 0);
      if (balcony) {
        window(w, F, cu, fz + 6, 10, 52, obj, frameMat, s.shutter, true, false);
        balconySlab(w, F, cu, fz, 18, obj, R);
      } else {
        window(w, F, cu, fz + 18, 10, 38, obj, frameMat, s.shutter, R() < 0.7, true);
        if (R() < 0.45) flowerBox(w, F, cu, fz + 17, 12, obj, R);
      }
    }
    // cuerda de tender entre dos ventanas de la misma planta
    if (bays >= 2 && f === s.floors - 1 && R() < 0.6) {
      const a = F.at(Math.round(bayW * 0.5) + 6, 2);
      const b2 = F.at(Math.round(bayW * 1.5) - 6, 2);
      info.lines.push([[a[0], a[1], fz + 58], [b2[0], b2[1], fz + 58]]);
    }
  }

  // --- Tejado a dos aguas con caballete paralelo a la fachada
  const ov = 4; // alero
  const mid = (D - 1) / 2;
  const roofMat = F.facing === '+y' ? MAT.roofX : MAT.roofY;
  const rtag = Math.floor(R() * 6);
  for (let e = -ov; e < D + ov; e++) {
    const rise = Math.floor(mid - Math.abs(e - mid)) + ov;
    const zr = topZ + Math.max(0, rise);
    const front = e < mid;
    for (let u = -2; u < W + 2; u++) {
      const [x, y] = F.at(u, -e);
      // normal física: pendiente hacia la calle o hacia atrás
      const nOut = front ? 0.45 : -0.45;
      const n: [number, number, number] = F.facing === '+y' ? [0, nOut, 0.9] : [nOut, 0, 0.9];
      for (let z = zr - 3; z <= zr; z++) {
        const isRidge = Math.abs(e - mid) < 1.01;
        w.set(x, y, z, isRidge ? MAT.ridge : roofMat, obj, isRidge ? null : n, rtag);
      }
      // hastiales: rellenar el muro bajo el tejado en los extremos
      if ((u === 0 || u === W - 1 || u === 1 || u === W - 2) && e >= 0 && e < D) {
        for (let z = topZ; z < zr - 3; z++) w.set(x, y, z, s.wall, obj);
      }
    }
  }
  // chimenea
  if (s.chimney !== false) {
    const cu = Math.floor(W * (0.2 + R() * 0.6));
    const ce = Math.floor(mid + 4 + R() * 6);
    const rise = Math.floor(mid - Math.abs(ce - mid)) + ov;
    const zr = topZ + rise;
    F.fill(w, cu, cu + 7, -ce - 7, -ce + 1, topZ, zr + 22, MAT.rubble, obj);
    F.fill(w, cu - 1, cu + 8, -ce - 8, -ce + 2, zr + 22, zr + 25, MAT.granite, obj);
    const [sx, sy] = F.at(cu + 3, -ce - 3);
    info.smoke.push([sx, sy, zr + 26]);
  }
  // bajante de zinc
  if (R() < 0.8) {
    const pu = R() < 0.5 ? 1 : W - 2;
    F.fill(w, pu, pu + 1, 1, 2, z0, topZ - 1, MAT.zinc, obj);
  }
  wallDecals(obj, F, W, z0, topZ, s.seed, s.wall === MAT.cal || s.wall === MAT.ochre || s.wall === MAT.salmon || s.wall === MAT.plasterBlue);
  // núcleo: muros sin salientes
  const [ax, ay] = F.at(0, 0);
  const [bx, by] = F.at(W - 1, -D + 1);
  info.core = [Math.min(ax, bx), Math.min(ay, by), z0, Math.max(ax, bx) + 1, Math.max(ay, by) + 1, topZ + 40];
  return info;
}

/** Ventana con hueco, marco, parteluz, cristal, alféizar y contraventanas opcionales. */
export function window(
  w: VoxelWorld, F: Frame, cu: number, z0: number, ww: number, hh: number, obj: number,
  frameMat: number, shutter: number | undefined, withShutters: boolean, sill: boolean,
): void {
  const u0 = cu - Math.floor(ww / 2), u1 = u0 + ww;
  const id = nextWindowId();
  // recerco de granito
  F.fill(w, u0 - 2, u1 + 2, 0, 1, z0 - 3, z0 + hh + 3, MAT.granite, obj);
  // hueco
  F.fill(w, u0, u1, -3, 1, z0, z0 + hh, 0, obj);
  // marco y cristal en d = −3
  for (let u = u0; u < u1; u++)
    for (let z = z0; z < z0 + hh; z++) {
      const edge = u === u0 || u === u1 - 1 || z === z0 || z === z0 + hh - 1;
      const mull = u === cu || z === z0 + Math.round(hh * 0.62);
      F.set(w, u, -3, z, edge || mull ? frameMat : MAT.glass, obj, edge || mull ? undefined : id);
    }
  if (sill) F.fill(w, u0 - 2, u1 + 2, 1, 3, z0 - 3, z0 - 1, MAT.granite, obj);
  windowDecals(obj, F, u0, z0, ww, hh, id + obj * 31);
  if (withShutters && shutter) {
    const sw = Math.ceil(ww / 2);
    F.fill(w, u0 - 2 - sw, u0 - 2, 1, 2, z0, z0 + hh, shutter, obj);
    F.fill(w, u1 + 2, u1 + 2 + sw, 1, 2, z0, z0 + hh, shutter, obj);
  }
}

function door(w: VoxelWorld, F: Frame, cu: number, z0: number, obj: number, mat: number, ww: number, hh: number, info: HouseInfo): void {
  const u0 = cu - Math.floor(ww / 2), u1 = u0 + ww;
  F.fill(w, u0 - 3, u1 + 3, 0, 1, z0, z0 + hh + 4, MAT.ashlar, obj);
  F.fill(w, u0, u1, -4, 1, z0, z0 + hh, 0, obj);
  F.fill(w, u0, u1, -4, -3, z0, z0 + hh, (u, _d, z) => {
    // dos hojas con cuarterones y un montante acristalado
    if (z > z0 + hh - 12) return u === u0 || u === u1 - 1 || z === z0 + hh - 12 || u === cu ? mat : MAT.glass;
    if (u === cu - 1) return mat;
    return mat;
  }, obj, nextWindowId());
  // escalón
  F.fill(w, u0 - 2, u1 + 2, 1, 4, z0, z0 + 2, MAT.granite, obj);
  // farolillo de pared al lado
  const lu = u1 + 5;
  F.fill(w, lu, lu + 1, 1, 4, z0 + hh - 4, z0 + hh - 3, MAT.iron, obj);
  F.fill(w, lu - 1, lu + 2, 3, 6, z0 + hh - 12, z0 + hh - 4, MAT.glass, obj, 255);
  F.fill(w, lu - 1, lu + 2, 3, 6, z0 + hh - 4, z0 + hh - 2, MAT.iron, obj);
  const [lx, ly] = F.at(lu, 4);
  info.lights.push([lx, ly, z0 + hh - 8]);
  const num = String(2 + ((obj * 7 + cu) % 37));
  DECALS.push({ kind: 'face', obj, F, u: u0 - 6, d: 0, z: z0 + hh - 2, rows: AZULEJO(num), key: AZULEJO_KEY });
  const [dx, dy] = F.at(cu, 8);
  info.doors.push([Math.floor(dx / 16), Math.floor(dy / 16)]);
}

function archDoor(w: VoxelWorld, F: Frame, cu: number, z0: number, obj: number, info: HouseInfo): void {
  const ww = 16, hh = 64;
  const u0 = cu - ww / 2, u1 = u0 + ww;
  // dovelas de granito en arco de medio punto (aprox.)
  for (let u = u0 - 4; u < u1 + 4; u++)
    for (let z = z0; z < z0 + hh + 14; z++) {
      const du = (u + 0.5 - cu) / (ww / 2 + 4);
      const archTop = z0 + hh - 8 + Math.sqrt(Math.max(0, 1 - du * du)) * 12;
      if (z < archTop + 4) F.set(w, u, 0, z, MAT.ashlar, obj);
    }
  for (let u = u0; u < u1; u++)
    for (let z = z0; z < z0 + hh + 6; z++) {
      const du = (u + 0.5 - cu) / (ww / 2);
      const archTop = z0 + hh - 8 + Math.sqrt(Math.max(0, 1 - du * du)) * 10;
      if (z < archTop) {
        for (let d = -5; d <= 0; d++) F.set(w, u, d, z, 0, obj);
        F.set(w, u, -5, z, z > z0 + hh - 10 ? MAT.glass : MAT.wood, obj, 255);
      }
    }
  F.fill(w, u0 - 2, u1 + 2, 1, 5, z0, z0 + 2, MAT.granite, obj);
  const [dx, dy] = F.at(cu, 8);
  info.doors.push([Math.floor(dx / 16), Math.floor(dy / 16)]);
}

function shopWindow(w: VoxelWorld, F: Frame, cu: number, z0: number, obj: number, mat: number, ww: number, kind: 'bakery' | 'shop' = 'shop'): void {
  const u0 = cu - Math.floor(ww / 2), u1 = u0 + ww;
  const hh = 46, zb = z0 + 18;
  const id = nextWindowId();
  F.fill(w, u0 - 2, u1 + 2, 0, 2, z0, zb + hh + 4, mat, obj);
  F.fill(w, u0, u1, -3, 2, zb, zb + hh, 0, obj);
  for (let u = u0; u < u1; u++)
    for (let z = zb; z < zb + hh; z++) {
      const edge = u === u0 || u === u1 - 1 || z === zb || z === zb + hh - 1 || z === zb + hh - 10;
      F.set(w, u, -3, z, edge ? mat : MAT.glass, obj, edge ? undefined : id);
    }
  // repisa del escaparate
  F.fill(w, u0, u1, -2, 0, zb, zb + 2, MAT.wood, obj);
  // género en el escaparate (retoque a mano sobre el cristal)
  if (kind === 'bakery') {
    const shelf = [BREAD.hogaza, BREAD.barra, BREAD.rosca, BREAD.hogaza];
    let pu = u0 + 1.5;
    for (const b of shelf) {
      if (pu + b[0].length / 2 > u1 - 1) break;
      DECALS.push({ kind: 'face', obj, F, u: pu, d: -3, z: zb + 1, rows: b, key: BREAD_KEY, mats: [MAT.glass, MAT.wood] });
      DECALS.push({ kind: 'face', obj, F, u: pu + 1, d: -3, z: zb + 16, rows: BREAD.hogaza, key: BREAD_KEY, mats: [MAT.glass] });
      pu += b[0].length / 2 + 1.5;
    }
  } else {
    DECALS.push({ kind: 'face', obj, F, u: u0 + 1.5, d: -3, z: zb + 1, rows: FRUIT, key: FRUIT_KEY, mats: [MAT.glass, MAT.wood] });
    DECALS.push({ kind: 'face', obj, F, u: u0 + 1.5 + 6, d: -3, z: zb + 1, rows: FRUIT, key: FRUIT_KEY, mats: [MAT.glass, MAT.wood] });
  }
}

function awning(w: VoxelWorld, F: Frame, u0: number, u1: number, z: number, obj: number): void {
  const depth = 14;
  for (let d = 1; d <= depth; d++) {
    const zz = z - Math.floor(d * 0.6);
    for (let u = u0; u < u1; u++) {
      const stripe = Math.floor((u - u0) / 4) % 2 === 0;
      const m = stripe ? MAT.awningRed : MAT.awningWhite;
      F.set(w, u, d, zz, m, obj);
      F.set(w, u, d, zz + 1, m, obj);
    }
  }
  // faldón con ondas
  for (let u = u0; u < u1; u++) {
    const zz = z - Math.floor(depth * 0.6);
    const scallop = (u - u0) % 4 < 2 ? 6 : 4;
    const stripe = Math.floor((u - u0) / 4) % 2 === 0;
    for (let k = 0; k < scallop; k++) F.set(w, u, depth, zz - k, stripe ? MAT.awningRed : MAT.awningWhite, obj);
  }
}

function signBoard(w: VoxelWorld, F: Frame, cu: number, z: number, ww: number, obj: number, text: string): void {
  const u0 = cu - Math.floor(ww / 2);
  F.fill(w, u0, u0 + ww, 1, 2, z, z + 10, MAT.wood, obj);
  F.fill(w, u0 + 1, u0 + ww - 1, 2, 3, z + 1, z + 9, MAT.paper, obj);
  const rows = textRows(text);
  const tw = rows[0].length / 2;
  DECALS.push({ kind: 'face', obj, F, u: cu - tw / 2, d: 2, z: z + 2, rows, key: { '#': 'wood1', '.': null }, mats: [MAT.paper] });
}

function balconySlab(w: VoxelWorld, F: Frame, cu: number, fz: number, ww: number, obj: number, R: () => number): void {
  const u0 = cu - Math.floor(ww / 2), u1 = u0 + ww;
  const dep = 7;
  F.fill(w, u0, u1, 1, dep + 1, fz + 3, fz + 6, MAT.granite, obj);
  // barandilla de hierro: pasamanos y barrotes
  for (let u = u0; u < u1; u++) {
    F.set(w, u, dep, fz + 20, MAT.iron, obj);
    if ((u - u0) % 3 === 0) for (let z = fz + 6; z < fz + 20; z++) F.set(w, u, dep, z, MAT.iron, obj);
  }
  for (let d = 1; d < dep; d++) {
    for (const u of [u0, u1 - 1]) {
      F.set(w, u, d, fz + 20, MAT.iron, obj);
      if (d % 3 === 0) for (let z = fz + 6; z < fz + 20; z++) F.set(w, u, d, z, MAT.iron, obj);
    }
  }
  // macetas con geranios
  const n = 1 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const pu = u0 + 2 + Math.floor(R() * (ww - 6));
    pot(w, F, pu, dep - 3, fz + 6, obj, R);
  }
}

function flowerBox(w: VoxelWorld, F: Frame, cu: number, z: number, ww: number, obj: number, R: () => number): void {
  const u0 = cu - Math.floor(ww / 2);
  F.fill(w, u0, u0 + ww, 2, 5, z - 6, z, MAT.terracotta, obj);
  for (let u = u0; u < u0 + ww; u++)
    for (let d = 2; d < 6; d++) {
      const h = 2 + Math.floor(R() * 3);
      for (let k = 0; k < h; k++) {
        const flower = k === h - 1 && R() < 0.6;
        F.set(w, u, d, z + k, flower ? (R() < 0.7 ? MAT.flowerRed : MAT.flowerPink) : MAT.leaf, obj);
      }
      // geranios colgando por delante
      if (d === 5 && R() < 0.35) for (let k = 1; k < 4 + R() * 4; k++) F.set(w, u, 6, z - k, k > 3 && R() < 0.5 ? MAT.flowerRed : MAT.leaf, obj);
    }
}

export function pot(w: VoxelWorld, F: Frame, u: number, d: number, z: number, obj: number, R: () => number): void {
  F.fill(w, u, u + 3, d, d + 3, z, z + 4, MAT.terracotta, obj);
  for (let a = -1; a < 4; a++)
    for (let b = -1; b < 4; b++) {
      if ((a === -1 || a === 3) && (b === -1 || b === 3)) continue;
      const h = 2 + Math.floor(R() * 4);
      for (let k = 0; k < h; k++) {
        const top = k === h - 1;
        F.set(w, u + a, d + b, z + 4 + k, top && R() < 0.65 ? (R() < 0.75 ? MAT.flowerRed : MAT.flowerPink) : MAT.leaf, obj);
      }
    }
}

/** Galería acristalada blanca, típica del norte. */
function galeria(w: VoxelWorld, F: Frame, u0: number, u1: number, fz: number, obj: number): void {
  const dep = 8;
  const zb = fz + 2, zt = fz + FL_H - 6;
  const panel = 16; // antepecho
  const id = nextWindowId();
  // abrir la fachada detrás (se ve cristal → interior oscuro)
  F.fill(w, u0, u1, -2, 1, zb, zt, 0, obj);
  F.fill(w, u0, u1, -2, -1, zb, zt, MAT.glass, obj, id);
  for (let z = zb; z < zt + 4; z++)
    for (let d = 1; d <= dep; d++)
      for (let u = u0; u < u1; u++) {
        const front = d === dep;
        const side = u === u0 || u === u1 - 1;
        if (!front && !side && z < zt) continue;
        if (z >= zt) {
          // remate superior (cornisa de madera blanca)
          F.set(w, u, d, z, MAT.white, obj);
          continue;
        }
        if (z < zb + panel) {
          F.set(w, u, d, z, MAT.white, obj);
          continue;
        }
        const lu = front ? u - u0 : d;
        const mull = lu % 6 === 0 || z === zb + panel || z === zt - 1 || z === zb + panel + 18 || (side && (d === dep || d === 1)) || (front && (u === u0 || u === u1 - 1));
        F.set(w, u, d, z, mull ? MAT.white : MAT.glass, obj, mull ? undefined : id);
      }
  // remate saliente
  F.fill(w, u0 - 1, u1 + 1, 1, dep + 2, zt + 4, zt + 6, MAT.white, obj);
}
