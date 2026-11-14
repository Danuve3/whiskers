// Rasterizador de personajes por capas indexadas.
// Cada pieza (elipsoide orientado) se rasteriza píxel a píxel con un z-buffer ortográfico en
// la proyección del juego; la luz se cuantiza a índices de rampa (arriba-izquierda), y después
// se aplican limpieza de huérfanos y contorno selectivo. Las caras usan matrices hechas a mano.
import { COLOR_INDEX, INDEX_RGB, RAMPS, type ColorName, type RampName } from '../gfx/palette.ts';

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Rotación de un vector local por guiñada (z), cabeceo (y) y alabeo (x). */
export function rot(v: V3, yaw: number, pitch = 0, roll = 0): V3 {
  let [x, y, z] = v;
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (pitch) {
    // cabeceo positivo = morro hacia arriba
    const c = Math.cos(pitch), s = Math.sin(pitch);
    [x, z] = [x * c - z * s, x * s + z * c];
  }
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

/** Pieza: elipsoide con centro y ejes (vectores con la longitud del radio). */
export interface Prim {
  c: V3;
  a: V3;
  b: V3;
  e: V3;
  /** región de color (pelaje, vientre, nariz…) */
  reg: number;
  /** id de pieza (para líneas interiores y patrones) */
  part: number;
  /** desplazamiento de tono (p. ej. patas lejanas −1) */
  bias?: number;
  /** sin brillo especular */
  matte?: boolean;
  /** descarta los impactos por debajo de esta altura (cúpulas: paraguas) */
  clipBelow?: number;
  /** varillas: alterna tono por sectores alrededor del centro */
  ribs?: number;
}

export function ell(c: V3, rx: number, ry: number, rz: number, reg: number, part: number, yaw = 0, pitch = 0, roll = 0, bias = 0): Prim {
  return { c, a: rot([rx, 0, 0], yaw, pitch, roll), b: rot([0, ry, 0], yaw, pitch, roll), e: rot([0, 0, rz], yaw, pitch, roll), reg, part, bias };
}

export function sphere(c: V3, r: number, reg: number, part: number, bias = 0): Prim {
  return { c, a: [r, 0, 0], b: [0, r, 0], e: [0, 0, r], reg, part, bias };
}

/** Cadena de esferas entre dos puntos (cápsula con radio variable). */
export function capsule(out: Prim[], p0: V3, p1: V3, r0: number, r1: number, reg: number, part: number, bias = 0): void {
  const L = len(sub(p1, p0));
  const n = Math.max(2, Math.ceil(L / Math.max(0.6, Math.min(r0, r1) * 0.7)) + 1);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(sphere(lerp3(p0, p1, t), r0 + (r1 - r0) * t, reg, part, bias));
  }
}

/** Transforma todas las piezas por guiñada (orientación del personaje) y traslación. */
export function place(prims: Prim[], yaw: number, offset: V3 = [0, 0, 0]): Prim[] {
  return prims.map((p) => ({ ...p, c: add(rot(p.c, yaw), offset), a: rot(p.a, yaw), b: rot(p.b, yaw), e: rot(p.e, yaw) }));
}

// Luz desde arriba-izquierda (en el espacio físico del juego).
const L: V3 = [-0.408, 0.408, 0.816];

/** Proyección de personajes: 1 unidad = 1 px de altura. */
export function project(p: V3): [number, number] {
  return [p[0] - p[1], (p[0] + p[1]) / 2 - p[2]];
}

export interface Paint {
  /** rampa y desplazamiento según región/pieza/posición local */
  (reg: number, part: number, hit: V3, n: V3): { ramp: RampName; shift?: number; color?: ColorName } | null;
}

export interface Raster {
  w: number;
  h: number;
  /** origen (pies) dentro del lienzo */
  ox: number;
  oy: number;
  depth: Float32Array;
  part: Int16Array;
  reg: Uint8Array;
  ri: Int8Array;
  ramp: (RampName | null)[];
  fixed: (ColorName | null)[];
}

export function rasterize(prims: Prim[], w: number, h: number, ox: number, oy: number, paint: Paint): Raster {
  const N = w * h;
  const r: Raster = {
    w, h, ox, oy,
    depth: new Float32Array(N).fill(-Infinity),
    part: new Int16Array(N).fill(-1),
    reg: new Uint8Array(N),
    ri: new Int8Array(N),
    ramp: new Array(N).fill(null),
    fixed: new Array(N).fill(null),
  };
  const hitN: (V3 | null)[] = new Array(N).fill(null);
  const hitP: (V3 | null)[] = new Array(N).fill(null);
  const primOf: Int16Array = new Int16Array(N).fill(-1);
  for (let pi = 0; pi < prims.length; pi++) {
    const p = prims[pi];
    const ra = len(p.a), rb = len(p.b), re = len(p.e);
    const R = Math.max(ra, rb, re);
    const [cu, cv] = project(p.c);
    const x0 = Math.max(0, Math.floor(cu + ox - R * 1.5 - 1)), x1 = Math.min(w - 1, Math.ceil(cu + ox + R * 1.5 + 1));
    const y0 = Math.max(0, Math.floor(cv + oy - R * 1.3 - 1)), y1 = Math.min(h - 1, Math.ceil(cv + oy + R * 1.3 + 1));
    const ia = mul(p.a, 1 / (ra * ra)), ib = mul(p.b, 1 / (rb * rb)), ie = mul(p.e, 1 / (re * re));
    const qd: V3 = [ia[0] + ia[1] + ia[2], ib[0] + ib[1] + ib[2], ie[0] + ie[1] + ie[2]];
    const A = dot(qd, qd);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const u = px + 0.5 - ox, v = py + 0.5 - oy;
        const P0: V3 = [(2 * v + u) / 2, (2 * v - u) / 2, 0];
        const d0 = sub(P0, p.c);
        const q0: V3 = [dot(d0, ia), dot(d0, ib), dot(d0, ie)];
        const B = 2 * dot(q0, qd), C = dot(q0, q0) - 1;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const s = (-B + Math.sqrt(disc)) / (2 * A);
        const i = py * w + px;
        if (s <= r.depth[i]) continue;
        if (p.clipBelow !== undefined && s < p.clipBelow) continue;
        r.depth[i] = s;
        const q: V3 = [q0[0] + s * qd[0], q0[1] + s * qd[1], q0[2] + s * qd[2]];
        const nrm: V3 = add(add(mul(ia, q[0]), mul(ib, q[1])), mul(ie, q[2]));
        const nl = len(nrm) || 1;
        hitN[i] = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
        hitP[i] = [P0[0] + s, P0[1] + s, P0[2] + s];
        primOf[i] = pi;
      }
  }
  for (let i = 0; i < N; i++) {
    const pi = primOf[i];
    if (pi < 0) continue;
    const p = prims[pi];
    const n = hitN[i]!;
    const d = dot(n, L);
    let idx = d >= 0.93 && !p.matte ? 4 : d >= 0.55 ? 3 : d >= 0.05 ? 2 : 1;
    if (idx === 4) idx = 3; // el brillo se reserva para retoques
    const pr = paint(p.reg, p.part, hitP[i]!, n);
    if (!pr) {
      r.depth[i] = -Infinity;
      continue;
    }
    idx += (pr.shift ?? 0) + (p.bias ?? 0);
    if (p.ribs) {
      const hp = hitP[i]!;
      const a = Math.atan2(hp[1] - p.c[1], hp[0] - p.c[0]);
      if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * p.ribs) % 2 === 1) idx -= 1;
      if (hp[2] < p.c[2] + 1.2) idx -= 1;
    }
    r.part[i] = p.part;
    r.reg[i] = p.reg;
    r.ri[i] = Math.max(1, Math.min(4, idx));
    r.ramp[i] = pr.ramp;
    r.fixed[i] = pr.color ?? null;
  }
  return r;
}

/** Quita píxeles huérfanos (mismo material y rampa, distinto tono que todos sus vecinos). */
export function clean(r: Raster): void {
  const { w, h } = r;
  const ri = r.ri.slice();
  const ramp = r.ramp.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (r.part[i] < 0 || r.fixed[i]) continue;
      const nb = [i - 1, i + 1, i - w, i + w];
      if (!nb.every((j) => r.part[j] >= 0)) continue;
      const rr = r.ramp[nb[0]], v = r.ri[nb[0]];
      if (nb.every((j) => r.ramp[j] === rr && r.ri[j] === v) && (r.ramp[i] !== rr || r.ri[i] !== v)) {
        ri[i] = v;
        ramp[i] = rr;
      }
    }
  r.ri.set(ri);
  r.ramp = ramp;
}

/** Contorno selectivo + líneas interiores donde una pieza tapa a otra con salto de profundidad. */
export function outline(r: Raster, interior = 3.5): void {
  const { w, h } = r;
  const ri = r.ri.slice();
  const empty = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || r.part[y * w + x] < 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (r.part[i] < 0) continue;
      const eR = empty(x + 1, y), eB = empty(x, y + 1), eL = empty(x - 1, y), eT = empty(x, y - 1);
      if (eR || eB) ri[i] = 0;
      else if (eL || eT) ri[i] = Math.max(0, Math.min(r.ri[i] - 1, 1));
      else if (interior > 0) {
        // este píxel está detrás de un vecino mucho más cercano de otra pieza
        for (const j of [i + 1, i - 1, i + w, i - w]) {
          if (r.part[j] !== r.part[i] && r.depth[j] - r.depth[i] > interior) {
            ri[i] = Math.max(0, r.ri[i] - 2);
            break;
          }
        }
      }
    }
  r.ri.set(ri);
}

export function toImageData(r: Raster): ImageData {
  const img = new ImageData(r.w, r.h);
  for (let i = 0; i < r.w * r.h; i++) {
    if (r.part[i] < 0) continue;
    let name: ColorName;
    if (r.fixed[i] && r.ri[i] > 0) name = r.fixed[i]!;
    else name = RAMPS[r.ramp[i]!][Math.max(0, Math.min(4, r.ri[i]))];
    const rgb = INDEX_RGB[COLOR_INDEX[name]];
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

/** ¿Es visible el punto 3D (no tapado)? Devuelve la posición en el lienzo o null. */
export function visibleAt(r: Raster, p: V3, tol = 1.2): [number, number] | null {
  const [u, v] = project(p);
  const x = Math.floor(u + r.ox), y = Math.floor(v + r.oy);
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return null;
  const i = y * r.w + x;
  if (r.part[i] < 0) return null;
  // en esta proyección la profundidad de un punto sobre su rayo es su z
  if (p[2] < r.depth[i] - tol) return null;
  return [x, y];
}

/** Pinta una matriz hecha a mano en el lienzo indexado (clave → color o null). */
export function stamp(img: ImageData, x: number, y: number, rows: string[], key: Record<string, ColorName | null>): void {
  for (let j = 0; j < rows.length; j++)
    for (let i = 0; i < rows[j].length; i++) {
      const k = rows[j][i];
      const c = key[k];
      if (!c) continue;
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
      const rgb = INDEX_RGB[COLOR_INDEX[c]];
      const o = (Y * img.width + X) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
    }
}
