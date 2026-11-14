// Retoques a mano: matrices de píxeles que se proyectan sobre las caras renderizadas
// (con el cizallado 2:1 de la fachada) o sobre el suelo. Cortinas, rótulos, pan en el
// escaparate, azulejos con número, desconchones, musgo, rayuela de tiza…
import { COLOR_INDEX, type ColorName } from '../src/gfx/palette.ts';
import type { Raster } from './voxel/render.ts';
import type { Frame } from './voxel/shapes.ts';
import type { ZoneBuild } from './zones/plaza.ts';
import { MAT } from './voxel/materials.ts';
import { rng } from './voxel/world.ts';

export type Key = Record<string, ColorName | null>;

export interface FaceDecal {
  kind: 'face';
  obj: number;
  F: Frame;
  /** u del borde izquierdo (vóxeles), capa d del plano y z de la base */
  u: number;
  d: number;
  z: number;
  rows: string[];
  key: Key;
  /** colores para la capa nocturna (si la ventana está encendida) */
  night?: Key;
  /** solo sobre estos materiales */
  mats?: number[];
}

export interface TopDecal {
  kind: 'top';
  obj: number;
  x: number;
  y: number;
  z: number; // cota de la cara superior
  rows: string[];
  key: Key;
  mats?: number[];
}

export type Decal = FaceDecal | TopDecal;

export const DECALS: Decal[] = [];

export function resetDecals(): void {
  DECALS.length = 0;
}

// ---------------------------------------------------------------- fuente de 3×5 px
const FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  I: ['#', '#', '#', '#', '#'], Í: ['#', '.', '#', '#', '#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'], ' ': ['.', '.', '.', '.', '.'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], Q: ['.#.', '#.#', '#.#', '#.#', '.##'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  '1': ['.#', '##', '.#', '.#', '.#'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.#.', '#..', '##.', '#.#', '.#.'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['.#.', '#.#', '.#.', '#.#', '.#.'], '9': ['.#.', '#.#', '.##', '..#', '.#.'],
};

export function textRows(t: string, ch = '#'): string[] {
  const rows = ['', '', '', '', ''];
  for (const c of t) {
    const g = FONT[c] ?? FONT[' '];
    for (let i = 0; i < 5; i++) rows[i] += g[i].replaceAll('#', ch) + '.';
  }
  return rows.map((r) => r.slice(0, -1));
}

// ---------------------------------------------------------------- piezas dibujadas a mano
export const BREAD = {
  hogaza: ['.ddd.', 'dLLld', 'DlllD', '.DDD.'],
  barra: ['..dddddd.', '.dLlLlLld', 'DlllllllD', '.DDDDDDD.'],
  rosca: ['.ddd.', 'dL.ld', 'Dl.lD', '.DDD.'],
};
export const BREAD_KEY: Key = { '.': null, d: 'wood2', D: 'wood1', l: 'mustard', L: 'butter' };

export const FRUIT = ['.r.o.g.y.r.', 'rRoOgGyYrRo', 'RRoOGGYYRRO'];
export const FRUIT_KEY: Key = { '.': null, r: 'coral', R: 'rose', o: 'tile3', O: 'tile2', g: 'veg3', G: 'veg2', y: 'mustard', Y: 'wood3' };

/** Cortinas de una ventana: dos paños recogidos, cenefa y, a veces, una maceta o un gato. */
export function curtainRows(w: number, h: number, style: number): string[] {
  const rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let r = '';
    for (let i = 0; i < w; i++) {
      const fromTop = j, fromBot = h - 1 - j;
      let c = '.';
      if (style !== 3) {
        // cenefa
        if (fromTop < 3) c = fromTop === 2 && i % 2 === 0 ? 'C' : 'c';
        // paños que se estrechan hacia el centro de la ventana
        const tie = Math.floor(h * 0.62);
        const drape = j < tie ? 3 - Math.floor((j / tie) * 1.5) : 2 + Math.floor(((j - tie) / (h - tie)) * 2);
        if (i < drape || i >= w - drape) c = i === drape - 1 || i === w - drape ? 'C' : 'c';
        if (j === tie && (i === drape || i === w - drape - 1)) c = 'k';
      }
      if (style === 2 && fromBot < 5) {
        // maceta interior en el alféizar
        const m = ['..gg..', '.gGgg.', '..gG..', '.tttt.', '.TTTT.'][4 - fromBot];
        const k = i - Math.floor(w / 2) + 3;
        if (k >= 0 && k < 6 && m[k] !== '.') c = m[k];
      }
      if (style === 3 && fromBot < 7) {
        // gato sentado en la ventana (silueta)
        const m = ['.s...s.', '.ss.ss.', '.sssss.', '.seses.', '..sss..', '.sssss.', 'ssssss.'][6 - fromBot];
        const k = i - 2;
        if (k >= 0 && k < 7 && m[k] !== '.') c = m[k];
      }
      r += c;
    }
    rows.push(r);
  }
  return rows;
}

const CURTAIN_COLORS: [ColorName, ColorName][] = [['cal4', 'cal2'], ['pink', 'rose'], ['butter', 'wood3'], ['sky', 'water2'], ['lilac', 'plum']];

export function curtainKey(style: number, seed: number): { day: Key; night: Key } {
  const [c, C] = CURTAIN_COLORS[seed % CURTAIN_COLORS.length];
  return {
    day: { '.': null, c, C, k: 'wood1', g: 'veg3', G: 'veg2', t: 'tile3', T: 'tile1', s: 'ink2', e: 'veg4' },
    night: { '.': null, c: style === 3 ? 'butter' : 'mustard', C: 'tile3', k: 'tile2', g: 'tile2', G: 'tile1', t: 'tile2', T: 'tile1', s: 'tile0', e: 'veg4' },
  };
}

export const DESCONCHON = [
  ['..oo...', '.osso..', 'ossssoo', '.ossso.', '..oo...'],
  ['.oo..', 'osso.', 'ossso', '.oo..'],
  ['...ooo..', '.oossso.', 'osssssso', '.oosso..', '...o....'],
];
export const DESC_KEY: Key = { '.': null, o: 'stone1', s: 'stone3' };

export const MOSS = [
  ['.g..g.', 'gGg.gG', 'GGGgGG'],
  ['..g.', '.gG.', 'gGGg'],
  ['g...gg..', 'Gg.gGGg.', 'GGgGGGGg'],
];
export const MOSS_KEY: Key = { '.': null, g: 'veg3', G: 'veg2' };

export const AZULEJO = (n: string): string[] => {
  const t = textRows(n, 'b');
  const w = t[0].length + 4;
  return ['k'.repeat(w), 'k' + 'w'.repeat(w - 2) + 'k', ...t.map((r) => 'kw' + r.replaceAll('.', 'w') + 'wk'), 'k' + 'w'.repeat(w - 2) + 'k', 'k'.repeat(w)];
};
export const AZULEJO_KEY: Key = { k: 'water1', w: 'cal4', b: 'water2', '.': null };

// ---------------------------------------------------------------- aplicación al raster
export function applyDecals(_z: ZoneBuild, obj: number, r: Raster): void {
  for (const d of DECALS) {
    if (d.obj !== obj) continue;
    if (d.kind === 'face') applyFace(d, r);
    else applyTop(d, r);
  }
}

function put(r: Raster, sx: number, sy: number, c: ColorName | null, n: ColorName | null | undefined, ok: (i: number) => boolean): void {
  const x = sx - r.ox, y = sy - r.oy;
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
  const i = y * r.w + x;
  if (!ok(i)) return;
  if (c) r.ov[i] = COLOR_INDEX[c];
  if (n) r.ovN[i] = COLOR_INDEX[n];
}

function applyFace(d: FaceDecal, r: Raster): void {
  const F = d.F;
  const plane = F.facing === '+y' ? F.y0 + d.d : F.x0 + d.d;
  const faceId = F.facing === '+y' ? 2 : 3;
  const H = d.rows.length;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < d.rows[j].length; i++) {
      const k = d.rows[j][i];
      const c = d.key[k];
      const n = d.night?.[k];
      if (!c && !n) continue;
      const uc = d.u + (i + 0.5) / 2;
      const zc = d.z + (H - 1 - j) + 0.5;
      let x: number, y: number;
      if (F.facing === '+y') {
        x = F.x0 + uc;
        y = plane + 1;
      } else {
        x = plane + 1;
        y = F.y0 + F.width - uc;
      }
      const sx = Math.floor(2 * (x - y)), sy = Math.floor(x + y - zc);
      put(r, sx, sy, c, n, (idx) => {
        if (!r.mat[idx] || r.face[idx] !== faceId) return false;
        if (F.facing === '+y' ? r.vy[idx] !== plane : r.vx[idx] !== plane) return false;
        return !d.mats || d.mats.includes(r.mat[idx]);
      });
    }
}

function applyTop(d: TopDecal, r: Raster): void {
  for (let j = 0; j < d.rows.length; j++)
    for (let i = 0; i < d.rows[j].length; i++) {
      const c = d.key[d.rows[j][i]];
      if (!c) continue;
      const x = d.x + (i + 0.5) / 2, y = d.y + (j + 0.5) / 2;
      const sx = Math.floor(2 * (x - y)), sy = Math.floor(x + y - d.z);
      put(r, sx, sy, c, null, (idx) => !!r.mat[idx] && r.face[idx] === 1 && r.vz[idx] === d.z - 1 && (!d.mats || d.mats.includes(r.mat[idx])));
    }
}

// ---------------------------------------------------------------- generadores de alto nivel
export function windowDecals(obj: number, F: Frame, u0: number, z0: number, ww: number, hh: number, seed: number): void {
  const R = rng(seed * 7919 + 3);
  const style = R() < 0.08 ? 3 : R() < 0.35 ? 2 : R() < 0.85 ? 1 : 0;
  if (style === 0) return;
  const { day, night } = curtainKey(style, Math.floor(R() * 5));
  // el cristal está en d = −3; la cuadrícula de píxeles mide 2 por vóxel
  DECALS.push({ kind: 'face', obj, F, u: u0 + 1, d: -3, z: z0 + 1, rows: curtainRows((ww - 2) * 2, hh - 2, style), key: day, night, mats: [MAT.glass] });
}

export function wallDecals(obj: number, F: Frame, W: number, zBase: number, zTop: number, seed: number, hasCal: boolean): void {
  const R = rng(seed * 104729);
  // musgo al pie del muro
  for (let u = 2; u < W - 4; u += 6 + Math.floor(R() * 10)) {
    if (R() < 0.45) continue;
    const m = MOSS[Math.floor(R() * MOSS.length)];
    DECALS.push({ kind: 'face', obj, F, u, d: 0, z: zBase, rows: m, key: MOSS_KEY, mats: [MAT.rubble, MAT.ashlar] });
  }
  // desconchones en la cal
  if (hasCal) {
    const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const m = DESCONCHON[Math.floor(R() * DESCONCHON.length)];
      DECALS.push({ kind: 'face', obj, F, u: 3 + R() * (W - 10), d: 0, z: zBase + 100 + R() * (zTop - zBase - 120), rows: m, key: DESC_KEY, mats: [MAT.cal, MAT.ochre, MAT.salmon, MAT.plasterBlue] });
    }
  }
}
