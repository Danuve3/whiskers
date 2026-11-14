// Render de vóxeles a sprite isométrico 2:1 con reglas de pixel art.
// Proyección: pantalla = (2(x−y), x+y−z). Vista: dirección (−1,−1,−2).
import { RAMPS, COLOR_INDEX } from '../../src/gfx/palette.ts';
import type { VoxelWorld } from './world.ts';
import { material, type Face } from './materials.ts';

/** Vector hacia la luz (espacio físico: arriba-izquierda). */
const LX = -0.408, LY = 0.408, LZ = 0.816;
/** Dirección del rayo de sombra en espacio de vóxeles (1 vóxel de altura = medio vóxel horizontal). */
const SDX = -1, SDY = 1, SDZ = 4;

export interface Sprite {
  w: number;
  h: number;
  /** Coordenadas de pantalla-mundo del píxel (0,0). */
  ox: number;
  oy: number;
  /** Índice de paleta por píxel (0 = transparente). */
  px: Uint8Array;
  /** Capa nocturna (ventanas encendidas), mismo tamaño. */
  night: Uint8Array | null;
  /** Capa de nieve (caras superiores), mismo tamaño. */
  snow?: Uint8Array | null;
}

export interface Raster {
  w: number;
  h: number;
  ox: number;
  oy: number;
  mat: Uint8Array;
  ri: Uint8Array; // índice dentro de la rampa
  face: Uint8Array;
  depth: Float32Array;
  vx: Int16Array;
  vy: Int16Array;
  vz: Int16Array;
  win: Uint8Array;
  /** retoques a mano: color de paleta forzado (día y capa nocturna) */
  ov: Uint8Array;
  ovN: Uint8Array;
}

export type Box = [number, number, number, number, number, number];

export function screenBounds(b: Box): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of [b[0], b[3]])
    for (const y of [b[1], b[4]])
      for (const z of [b[2], b[5]]) {
        const sx = 2 * (x - y), sy = x + y - z;
        if (sx < x0) x0 = sx;
        if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy;
        if (sy > y1) y1 = sy;
      }
  return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
}

/** ¿Está el punto en sombra? Marcha por columnas usando el mapa de alturas. */
export function inShadow(w: VoxelWorld, px: number, py: number, pz: number): boolean {
  // x decrece: la celda que se recorre es ceil(px)−1; y crece: floor(py)
  let X = Math.ceil(px) - 1, Y = Math.floor(py);
  let tMaxX = (px - X) / -SDX;
  let tMaxY = (Y + 1 - py) / SDY;
  let t = 0;
  const top = w.maxZ;
  for (let guard = 0; guard < 4000; guard++) {
    const zIn = pz + SDZ * t;
    if (zIn > top + 1) return false;
    if (X < 0 || Y < 0 || X >= w.sx || Y >= w.sy) return false;
    const tExit = Math.min(tMaxX, tMaxY);
    const h = w.hmax[Y * w.sx + X];
    const za = Math.floor(zIn);
    if (h >= za) {
      const zb = Math.min(Math.floor(pz + SDZ * tExit), h);
      for (let z = Math.max(za, 0); z <= zb; z++) {
        const m = w.mat(X, Y, z);
        if (m && !material(m).noCast) return true;
      }
    }
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += 1;
      X--;
    } else {
      t = tMaxY;
      tMaxY += 1;
      Y++;
    }
  }
  return false;
}

function aoAt(w: VoxelWorld, x: number, y: number, z: number, f: Face): number {
  // Celda exterior adyacente a la cara
  const cx = f === 3 ? x + 1 : x, cy = f === 2 ? y + 1 : y, cz = f === 1 ? z + 1 : z;
  let occ = 0, tot = 0;
  for (let dz = -2; dz <= 3; dz++)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        // solo semiespacio exterior
        if (f === 1 && dz < 0) continue;
        if (f === 2 && dy < 0) continue;
        if (f === 3 && dx < 0) continue;
        const wgt = 1 / (1 + Math.abs(dx) + Math.abs(dy) + Math.abs(dz) * 0.5);
        tot += wgt;
        if (w.mat(cx + dx, cy + dy, cz + dz)) occ += wgt;
      }
  return occ / tot;
}

export interface RenderOpts {
  /** Qué objetos son visibles en este render. */
  filter: (obj: number) => boolean;
  box: Box;
  /** Sin contorno (suelo). */
  noOutline?: boolean;
  /** Ventanas encendidas por id. */
  litWindow?: (id: number) => boolean;
  /** Cambia materiales al vuelo (variantes de estación); 0 = vacío. */
  remap?: (mat: number, x: number, y: number, z: number) => number;
}

export function rasterize(w: VoxelWorld, o: RenderOpts): Raster {
  const [bx0, by0, bz0, bx1, by1, bz1] = o.box;
  const [sx0, sy0, sx1, sy1] = screenBounds(o.box);
  const W = sx1 - sx0, H = sy1 - sy0;
  const N = W * H;
  const r: Raster = {
    w: W, h: H, ox: sx0, oy: sy0,
    mat: new Uint8Array(N), ri: new Uint8Array(N), face: new Uint8Array(N), depth: new Float32Array(N).fill(Infinity),
    vx: new Int16Array(N), vy: new Int16Array(N), vz: new Int16Array(N), win: new Uint8Array(N), ov: new Uint8Array(N), ovN: new Uint8Array(N),
  };
  for (let py = 0; py < H; py++)
    for (let pxl = 0; pxl < W; pxl++) {
      const u = sx0 + pxl + 0.5, v = sy0 + py + 0.5;
      const a = u / 2; // x − y
      // origen con z = 0: x + y = v
      const x0 = (v + a) / 2, y0 = (v - a) / 2;
      // intervalos t (P = O + t·(−1,−1,−2))
      const txa = x0 - bx1, txb = x0 - bx0;
      const tya = y0 - by1, tyb = y0 - by0;
      const tza = -bz1 / 2, tzb = -bz0 / 2;
      let tEnter = txa, axis: Face = 3;
      if (tya > tEnter) { tEnter = tya; axis = 2; }
      if (tza > tEnter) { tEnter = tza; axis = 1; }
      const tExit = Math.min(txb, tyb, tzb);
      if (tEnter >= tExit) continue;
      const te = tEnter + 1e-6;
      let X = Math.floor(x0 - te), Y = Math.floor(y0 - te), Z = Math.floor(-2 * te);
      let tMaxX = x0 - X, tMaxY = y0 - Y, tMaxZ = -Z / 2;
      let tCur = tEnter;
      let hit = 0;
      for (let guard = 0; guard < 2000; guard++) {
        if (X >= bx0 && Y >= by0 && Z >= bz0 && X < bx1 && Y < by1 && Z < bz1) {
          const c = w.cell(X, Y, Z);
          if (c && o.filter(c >> 8)) {
            const m = o.remap ? o.remap(c & 255, X, Y, Z) : c & 255;
            if (m) {
              hit = m;
              break;
            }
          }
        }
        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
          tCur = tMaxX; tMaxX += 1; X--; axis = 3;
        } else if (tMaxY <= tMaxZ) {
          tCur = tMaxY; tMaxY += 1; Y--; axis = 2;
        } else {
          tCur = tMaxZ; tMaxZ += 0.5; Z--; axis = 1;
        }
        if (tCur > tExit) break;
      }
      if (!hit) continue;
      const i = py * W + pxl;
      const m = material(hit);
      // punto de impacto
      const hx = x0 - tCur, hy = y0 - tCur, hz = -2 * tCur;
      const n = w.normal(X, Y, Z);
      const nx = n ? n[0] : axis === 3 ? 1 : 0;
      const ny = n ? n[1] : axis === 2 ? 1 : 0;
      const nz = n ? n[2] : axis === 1 ? 1 : 0;
      const d = nx * LX + ny * LY + nz * LZ;
      let idx: number;
      if (m.flat !== undefined) idx = m.flat;
      else idx = d >= 0.95 ? 4 : d >= 0.7 ? 3 : d >= 0.2 ? 2 : d >= -0.6 ? 1 : 0;
      // cara efectiva para texturas
      let face: Face = axis;
      if (n) face = Math.abs(n[2]) > 0.75 ? 1 : n[1] > n[0] ? 2 : 3;
      if (m.bias) idx += m.bias;
      if (m.tex) {
        // coordenadas en el plano de la cara con resolución de píxel
        const pu = face === 1 ? Math.floor(hx * 2) : face === 2 ? Math.floor(hx * 2) : Math.floor(-hy * 2);
        const pv = face === 1 ? Math.floor(hy * 2) : Math.floor(hz - 1e-4);
        idx += m.tex({ x: X, y: Y, z: Z, f: face, tag: w.tag(X, Y, Z), u: pu, v: pv, hx, hy, hz });
      }
      if (!m.noShadow && d > 0.1) {
        const e = 0.02;
        if (inShadow(w, hx + nx * e - 0.001, hy + ny * e + 0.001, hz + nz * e + 0.002)) idx -= 1;
      }
      if (m.ao) {
        const ao = aoAt(w, X, Y, Z, face);
        if (ao > 0.2) idx -= m.ao;
      }
      if (m.edge && face === 1) {
        // arista iluminada: el vecino delante-izquierda (+y) o detrás-izquierda (−x) está vacío
        if (!w.mat(X, Y + 1, Z) || !w.mat(X - 1, Y, Z)) idx += 1;
      }
      const lo = m.min ?? 0, hi = m.max ?? 4;
      idx = Math.max(lo, Math.min(hi, idx));
      r.mat[i] = hit;
      r.ri[i] = idx;
      r.face[i] = face;
      r.depth[i] = tCur;
      r.vx[i] = X;
      r.vy[i] = Y;
      r.vz[i] = Z;
      if (m.glass) r.win[i] = w.tag(X, Y, Z);
    }
  return r;
}

/** Limpia píxeles huérfanos del mismo material (ruido de textura). */
export function cleanOrphans(r: Raster): void {
  const { w, h, mat, ri } = r;
  const out = ri.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mat[i]) continue;
      const n = [i - 1, i + 1, i - w, i + w];
      if (!n.every((j) => mat[j] === mat[i])) continue;
      const v = ri[n[0]];
      if (v !== ri[i] && n.every((j) => ri[j] === v)) out[i] = v;
    }
  ri.set(out);
}

/** Contorno selectivo: oscuro abajo-derecha, más claro arriba-izquierda; líneas interiores en saltos de profundidad. */
export function selOut(r: Raster, interiorDepth = 10): void {
  const { w, h, mat, ri, depth } = r;
  const out = ri.slice();
  const empty = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || !mat[y * w + x];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mat[i]) continue;
      const m = material(mat[i]);
      const lo = m.min !== undefined ? Math.max(0, m.min - 1) : 0;
      const eR = empty(x + 1, y), eB = empty(x, y + 1), eL = empty(x - 1, y), eT = empty(x, y - 1);
      if (eR || eB) out[i] = lo;
      else if (eL || eT) out[i] = Math.max(lo, ri[i] - 1);
      else if (interiorDepth > 0) {
        // línea interior: este píxel está detrás de un vecino mucho más cercano (a la derecha/abajo)
        const dR = depth[i + 1], dB = depth[i + w];
        if (depth[i] - Math.min(dR, dB) > interiorDepth) out[i] = Math.max(lo, ri[i] - 1);
      }
    }
  ri.set(out);
}

export function toSprite(r: Raster, litWindow?: (id: number) => boolean): Sprite {
  const N = r.w * r.h;
  const px = new Uint8Array(N);
  let night: Uint8Array | null = null;
  for (let i = 0; i < N; i++) {
    if (!r.mat[i]) continue;
    const m = material(r.mat[i]);
    px[i] = r.ov[i] || COLOR_INDEX[RAMPS[m.ramp][r.ri[i]]];
    if (m.glass && r.win[i] && litWindow?.(r.win[i])) {
      night ??= new Uint8Array(N);
      night[i] = r.ovN[i] || COLOR_INDEX[r.ri[i] >= 3 ? 'butter' : r.ri[i] >= 1 ? 'lampLight' : 'mustard'];
    }
  }
  // nieve sobre las caras superiores (tejados, losas, bancos, copas…)
  const snow = new Uint8Array(N);
  let anySnow = false;
  for (let i = 0; i < N; i++) {
    if (!r.mat[i] || r.face[i] !== 1) continue;
    const m = material(r.mat[i]);
    if (m.glass || m.name === 'water' || m.name === 'iron') continue;
    snow[i] = COLOR_INDEX[r.ri[i] >= 3 ? 'cal4' : r.ri[i] === 2 ? 'stone4' : 'stone3'];
    anySnow = true;
  }
  return { w: r.w, h: r.h, ox: r.ox, oy: r.oy, px, night, snow: anySnow ? snow : null };
}

/** Recorta bordes transparentes. */
export function trim(s: Sprite): Sprite {
  let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++)
      if (s.px[y * s.w + x] || (s.night && s.night[y * s.w + x]) || (s.snow && s.snow[y * s.w + x])) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { ...s, w: 0, h: 0, px: new Uint8Array(0), night: null };
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const px = new Uint8Array(W * H);
  const night = s.night ? new Uint8Array(W * H) : null;
  const snow = s.snow ? new Uint8Array(W * H) : null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      px[y * W + x] = s.px[(y + y0) * s.w + x + x0];
      if (night) night[y * W + x] = s.night![(y + y0) * s.w + x + x0];
      if (snow) snow[y * W + x] = s.snow![(y + y0) * s.w + x + x0];
    }
  return { w: W, h: H, ox: s.ox + x0, oy: s.oy + y0, px, night, snow };
}
