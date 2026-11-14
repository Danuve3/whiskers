// Materiales del escenario: rampa + textura sugerida (desplazamientos de índice en la rampa).
import type { RampName } from '../../src/gfx/palette.ts';
import { hash3 } from './world.ts';

/** Cara por la que se ve el vóxel: 1 arriba, 2 izquierda (+Y), 3 derecha (+X). */
export type Face = 1 | 2 | 3;

/** Contexto de textura: vóxel, cara y coordenadas en el plano de la cara a resolución de píxel. */
export interface TexCtx {
  x: number; y: number; z: number;
  f: Face;
  tag: number;
  /** u: a lo largo de la cara (1 = 1 px de pantalla); v: arriba (caras verticales) o fondo (cara superior). */
  u: number; v: number;
  hx: number; hy: number; hz: number;
}

export interface Material {
  name: string;
  ramp: RampName;
  tex?: (c: TexCtx) => number;
  edge?: boolean;
  ao?: number;
  noShadow?: boolean;
  noCast?: boolean;
  glass?: boolean;
  flat?: number;
  bias?: number;
  min?: number;
  max?: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Sillería: bloques de w×h px con juntas finas y labio superior iluminado. */
function ashlar(w: number, h: number, seed: number) {
  return (c: TexCtx) => {
    if (c.f === 1) return 0;
    const row = Math.floor(c.v / h);
    const u = c.u + Math.floor(hash3(row, 1, 2, seed) * w);
    const lu = mod(u, w), lv = mod(c.v, h);
    const block = Math.floor(u / w);
    const r = hash3(block, row, 0, seed);
    if (lv === 0) return -1;
    if (lu === 0) return r < 0.85 ? -1 : 0;
    if (lv === h - 1 && lu > 1 && lu < w - 3 && r > 0.5) return 1;
    if (r < 0.14) return -1;
    return 0;
  };
}

/** Mampostería irregular (granito sin labrar), estilo voronoi en píxeles. */
function rubble(cell: number, seed: number) {
  return (c: TexCtx) => {
    const u = c.u, v = c.f === 1 ? c.v : c.v;
    const gu = Math.floor(u / cell), gv = Math.floor(v / (cell * 0.7));
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const cu = gu + a, cv = gv + b;
        const pu = (cu + 0.15 + hash3(cu, cv, c.f, seed) * 0.7) * cell;
        const pv = (cv + 0.15 + hash3(cu, cv, c.f + 7, seed) * 0.7) * cell * 0.7;
        const d = (u + 0.5 - pu) ** 2 + ((v + 0.5 - pv) * 1.3) ** 2;
        if (d < d1) { d2 = d1; d1 = d; id = cu * 9973 + cv; } else if (d < d2) d2 = d;
      }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    if (edge < 1.1) return -1;
    const r = hash3(id, 3, 1, seed);
    // brillo en el lado alto-izquierdo de cada piedra
    if (edge > 1.1 && edge < 2.2 && r > 0.4) {
      const pu = u - (gu * cell), pv = v;
      void pu; void pv;
    }
    if (r < 0.2) return -1;
    return 0;
  };
}

const M: Material[] = [];
function def(m: Material): number {
  M.push(m);
  return M.length; // 0 = vacío
}

export const MAT = {
  // --- Suelos ---
  cobble: def({
    // adoquín redondeado (morrillo): piedras pequeñas con hueco oscuro y brillo arriba-izquierda
    name: 'cobble', ramp: 'cobble', ao: 1, max: 4, min: 1,
    tex: (c) => {
      if (c.f !== 1) return -1;
      const RH = 5, len = 7;
      const row = Math.floor(c.v / RH);
      const u = c.u + (row & 1) * 3 + (row % 3);
      const lu = mod(u, len), lv = mod(c.v, RH);
      const r = hash3(Math.floor(u / len), row, 0, 11);
      // esquinas redondeadas: el hueco se come las esquinas
      const corner = (lu === 0 || lu === len - 1) && (lv === 0 || lv === RH - 1);
      if (lv === 0 || lu === 0 || corner) return -1;
      if (lv === 1 && (lu === 2 || lu === 3)) return 1;
      if (r < 0.2 && lv === RH - 1) return -1;
      return 0;
    },
  }),
  slab: def({
    // losas grandes de granito en hiladas, juntas finas y algún bisel iluminado
    name: 'slab', ramp: 'paving', ao: 1, max: 4, min: 1,
    tex: (c) => {
      if (c.f !== 1) return -1;
      const RH = 15;
      const row = Math.floor(c.v / RH);
      const lv = mod(c.v, RH);
      // longitudes variables por hilada
      let u = c.u + Math.floor(hash3(row, 0, 0, 51) * 40);
      let start = 0, len = 0, k = 0;
      // recorrer losas de la hilada hasta cubrir u (longitudes 18..30)
      const base = Math.floor(u / 96) * 96;
      start = base;
      for (k = 0; k < 8; k++) {
        len = 18 + Math.floor(hash3(row, Math.floor(u / 96), k, 52) * 13);
        if (start + len > u) break;
        start += len;
      }
      const lu = u - start;
      const r = hash3(row, start, 0, 53);
      if (lv === 0) return lu % 9 === 4 && r < 0.5 ? 0 : -1;
      if (lu === 0) return -1;
      if (lv === 1 && lu > 1 && lu < 7 && r > 0.35) return 1;
      if (r < 0.12 && lv > 3 && lv < 9 && lu > 4 && lu < 7) return -1;
      if (r > 0.9 && lv > 4 && lv < 7 && lu > 6 && lu < 11) return -1;
      void u; u = 0;
      return 0;
    },
  }),
  curb: def({ name: 'curb', ramp: 'granite', ao: 1, edge: true, min: 1 }),
  rim: def({ name: 'rim', ramp: 'paving', ao: 0, min: 1, bias: 1, max: 4 }),
  stoneWarm: def({ name: 'stoneWarm', ramp: 'paving', ao: 1, min: 0, tex: (c) => (c.f !== 1 && mod(c.v, 6) === 0 && hash3(c.u >> 3, c.v, 0, 61) < 0.5 ? -1 : 0) }),
  grass: def({
    name: 'grass', ramp: 'veg', ao: 1, max: 3, bias: -1,
    tex: (c) => {
      if (c.f !== 1) return -1;
      const r = hash3(c.u, c.v, c.z, 21);
      if (r < 0.08) return 1;
      if (r > 0.96) return -1;
      return 0;
    },
  }),
  earth: def({ name: 'earth', ramp: 'wood', bias: -1, tex: (c) => { const r = hash3(c.u >> 1, c.v >> 1, c.z, 3); return r < 0.03 ? -1 : r > 0.98 ? 1 : 0; } }),
  moss: def({ name: 'moss', ramp: 'moss', bias: -1, min: 1, tex: (c) => (hash3(c.u >> 1, c.v >> 1, c.z, 8) < 0.25 ? 1 : 0) }),
  water: def({
    name: 'water', ramp: 'water', flat: 2, noCast: true,
    tex: (c) => (mod(c.u + 2 * c.v, 17) === 0 && hash3(c.u >> 3, c.v >> 2, 0, 4) < 0.5 ? 1 : 0),
  }),
  // --- Muros ---
  ashlar: def({ name: 'ashlar', ramp: 'granite', ao: 1, edge: true, tex: ashlar(16, 12, 1) }),
  rubble: def({ name: 'rubble', ramp: 'stone', ao: 1, tex: rubble(9, 2) }),
  granite: def({ name: 'granite', ramp: 'granite', ao: 1, min: 1 }),
  zinc: def({ name: 'zinc', ramp: 'stone', min: 1, max: 3 }),
  shutterGreen: def({ name: 'shutterGreen', ramp: 'veg', bias: -1, min: 1, tex: (c) => (c.f !== 1 && mod(c.v, 3) === 0 ? -1 : 0) }),
  shutterBlue: def({ name: 'shutterBlue', ramp: 'blue', bias: -1, min: 1, tex: (c) => (c.f !== 1 && mod(c.v, 3) === 0 ? -1 : 0) }),
  cal: def({
    name: 'cal', ramp: 'cal', ao: 1, min: 1,
    tex: (c) => {
      if (c.f === 1) return 0;
      const r = hash3(c.u >> 2, c.v >> 1, 0, 9);
      if (c.tag === 1 && r < 0.3) return -1; // zona manchada (zócalo)
      return 0;
    },
  }),
  ochre: def({ name: 'ochre', ramp: 'yellow', ao: 1, bias: -1, max: 3, min: 1 }),
  salmon: def({ name: 'salmon', ramp: 'red', ao: 1, min: 1, bias: 0 }),
  plasterBlue: def({ name: 'plasterBlue', ramp: 'blue', ao: 1, min: 1, max: 3 }),
  // --- Tejados ---
  roofX: def({
    name: 'roofX', ramp: 'tile', min: 1,
    tex: (c) => {
      const col = mod(Math.floor(c.hx * 2) + c.tag, 6);
      const row = mod(Math.floor(c.hz), 7);
      if (row === 0) return -1;
      if (col === 0) return -1;
      if (col === 2 && row > 2) return 1;
      return 0;
    },
  }),
  roofY: def({
    name: 'roofY', ramp: 'tile', min: 1,
    tex: (c) => {
      const col = mod(Math.floor(-c.hy * 2) + c.tag, 6);
      const row = mod(Math.floor(c.hz), 7);
      if (row === 0) return -1;
      if (col === 0) return -1;
      if (col === 2 && row > 2) return 1;
      return 0;
    },
  }),
  ridge: def({ name: 'ridge', ramp: 'tile', bias: -1, edge: true, min: 1 }),
  // --- Madera y metal ---
  wood: def({
    name: 'wood', ramp: 'wood', ao: 1, edge: true,
    tex: (c) => {
      if (c.f !== 1 && mod(c.u, 7) === 0) return -1;
      return 0;
    },
  }),
  woodGreen: def({ name: 'woodGreen', ramp: 'veg', ao: 1, edge: true, bias: -1, min: 1, tex: (c) => (c.f !== 1 && mod(c.u, 6) === 0 ? -1 : 0) }),
  woodBlue: def({ name: 'woodBlue', ramp: 'blue', ao: 1, edge: true, bias: -1, min: 1, tex: (c) => (c.f !== 1 && mod(c.u, 6) === 0 ? -1 : 0) }),
  woodRed: def({ name: 'woodRed', ramp: 'red', ao: 1, edge: true, bias: -1, min: 1, tex: (c) => (c.f !== 1 && mod(c.u, 6) === 0 ? -1 : 0) }),
  white: def({ name: 'white', ramp: 'white', ao: 1, edge: true, min: 1 }),
  glass: def({
    name: 'glass', ramp: 'glass', glass: true, bias: -1, min: 0, max: 4,
    tex: (c) => {
      const d = mod(c.u + c.v, 15);
      if (d === 0 || d === 1) return 2;
      if (d === 3) return 1;
      return 0;
    },
  }),
  iron: def({ name: 'iron', ramp: 'iron', edge: true }),
  // --- Toldo, macetas, flores, follaje ---
  awningRed: def({ name: 'awningRed', ramp: 'red', min: 1 }),
  awningWhite: def({ name: 'awningWhite', ramp: 'white', min: 1 }),
  terracotta: def({ name: 'terracotta', ramp: 'tile', edge: true, min: 1 }),
  flowerRed: def({ name: 'flowerRed', ramp: 'red', min: 1, tex: (c) => (hash3(c.u, c.v, c.z, 13) < 0.3 ? 1 : 0) }),
  flowerPink: def({ name: 'flowerPink', ramp: 'violet', min: 2, tex: (c) => (hash3(c.u, c.v, c.z, 14) < 0.3 ? 1 : 0) }),
  flowerWhite: def({ name: 'flowerWhite', ramp: 'white', min: 2 }),
  leaf: def({
    name: 'leaf', ramp: 'veg', min: 0,
    tex: (c) => {
      const r = hash3(c.u >> 2, c.v >> 2, c.z >> 2, 15);
      return r < 0.15 ? -1 : r > 0.88 ? 1 : 0;
    },
  }),
  leafAutumn: def({
    name: 'leafAutumn', ramp: 'autumn', min: 0,
    tex: (c) => {
      const r = hash3(c.u >> 2, c.v >> 2, c.z >> 2, 15);
      return r < 0.15 ? -1 : r > 0.88 ? 1 : 0;
    },
  }),
  blossom: def({ name: 'blossom', ramp: 'violet', min: 2, tex: (c) => (hash3(c.u, c.v, c.z, 33) < 0.4 ? 1 : 0) }),
  cardboard: def({ name: 'cardboard', ramp: 'yellow', bias: -1, min: 0, max: 3, tex: (c) => (c.f !== 1 && mod(c.v, 9) === 0 ? -1 : 0) }),
  fruitOrange: def({ name: 'fruitOrange', ramp: 'tile', min: 2, tex: (c) => (hash3(c.u, c.v, c.z, 81) < 0.3 ? 1 : 0) }),
  fish: def({ name: 'fish', ramp: 'blue', min: 2, tex: (c) => (mod(c.u, 4) === 0 ? 1 : 0) }),
  ice: def({ name: 'ice', ramp: 'white', min: 3 }),
  cheese: def({ name: 'cheese', ramp: 'yellow', min: 2, max: 4 }),
  cork: def({ name: 'cork', ramp: 'tile', min: 3 }),
  gravel: def({
    name: 'gravel', ramp: 'paving', ao: 1, min: 1, max: 3,
    tex: (c) => {
      const r = hash3(c.u, c.v, 0, 91);
      return r < 0.12 ? -1 : r > 0.93 ? 1 : 0;
    },
  }),
  brick: def({ name: 'brick', ramp: 'tile', ao: 1, bias: -1, min: 0, tex: (c) => {
    if (c.f === 1) return 0;
    const row = Math.floor(c.v / 5);
    const u = c.u + (row % 2) * 5;
    return mod(c.v, 5) === 0 || mod(u, 10) === 0 ? -1 : 0;
  } }),
  rust: def({ name: 'rust', ramp: 'tile', bias: -1, min: 0, tex: (c) => (c.f !== 1 && mod(c.u, 5) === 0 ? -1 : hash3(c.u >> 2, c.v >> 2, 0, 92) < 0.2 ? -1 : 0) }),
  yellowBoat: def({ name: 'yellowBoat', ramp: 'yellow', ao: 1, edge: true, min: 1 }),
  netGreen: def({ name: 'netGreen', ramp: 'veg', min: 1, tex: (c) => ((c.u + c.v) % 3 === 0 ? -1 : 0) }),
  netRed: def({ name: 'netRed', ramp: 'red', min: 1, tex: (c) => ((c.u + c.v) % 3 === 0 ? -1 : 0) }),
  bark: def({ name: 'bark', ramp: 'wood', bias: -1, tex: (c) => (mod(c.u, 4) === 0 && hash3(c.u, c.v >> 3, 0, 17) < 0.6 ? -1 : 0) }),
  bread: def({ name: 'bread', ramp: 'yellow', min: 1 }),
  paper: def({ name: 'paper', ramp: 'white', min: 2 }),
} as const;

export type MatName = keyof typeof MAT;

export function material(id: number): Material {
  return M[id - 1];
}

export const MATERIALS = M;
