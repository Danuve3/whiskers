// Mundo de vóxeles disperso por chunks de 16³.
// Coordenadas: x,y en planta (16 vóxeles por tile), z en altura (1 vóxel = 1 px).

export const CH = 16;
const CH3 = CH * CH * CH;

export interface Chunk {
  mat: Uint8Array;
  obj: Uint16Array;
  nrm: Int8Array | null; // normal opcional (x,y,z en -127..127); 0,0,0 = usar la cara
  tag: Uint8Array | null; // dato extra por vóxel (id de ventana, semilla de textura…)
  count: number;
}

export class VoxelWorld {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly chunks: (Chunk | null)[];
  /** Altura máxima ocupada por columna (−1 = vacía). */
  readonly hmax: Int16Array;
  maxZ = -1;

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.cx = Math.ceil(sx / CH);
    this.cy = Math.ceil(sy / CH);
    this.cz = Math.ceil(sz / CH);
    this.chunks = new Array(this.cx * this.cy * this.cz).fill(null);
    this.hmax = new Int16Array(sx * sy).fill(-1);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  private chunkAt(x: number, y: number, z: number, create: boolean): Chunk | null {
    const ci = ((z >> 4) * this.cy + (y >> 4)) * this.cx + (x >> 4);
    let c = this.chunks[ci];
    if (!c && create) {
      c = { mat: new Uint8Array(CH3), obj: new Uint16Array(CH3), nrm: null, tag: null, count: 0 };
      this.chunks[ci] = c;
    }
    return c;
  }

  mat(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const c = this.chunks[((z >> 4) * this.cy + (y >> 4)) * this.cx + (x >> 4)];
    if (!c) return 0;
    return c.mat[((z & 15) << 8) | ((y & 15) << 4) | (x & 15)];
  }

  obj(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    const c = this.chunkAt(x, y, z, false);
    if (!c) return 0;
    return c.obj[((z & 15) << 8) | ((y & 15) << 4) | (x & 15)];
  }

  /** Lee material y objeto de una vez: devuelve mat | (obj << 8), o 0 si vacío. */
  cell(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const c = this.chunks[((z >> 4) * this.cy + (y >> 4)) * this.cx + (x >> 4)];
    if (!c) return 0;
    const i = ((z & 15) << 8) | ((y & 15) << 4) | (x & 15);
    const m = c.mat[i];
    return m ? m | (c.obj[i] << 8) : 0;
  }

  normal(x: number, y: number, z: number): [number, number, number] | null {
    const c = this.chunkAt(x, y, z, false);
    if (!c || !c.nrm) return null;
    const i = (((z & 15) << 8) | ((y & 15) << 4) | (x & 15)) * 3;
    const nx = c.nrm[i], ny = c.nrm[i + 1], nz = c.nrm[i + 2];
    if (nx === 0 && ny === 0 && nz === 0) return null;
    return [nx / 127, ny / 127, nz / 127];
  }

  tag(x: number, y: number, z: number): number {
    const c = this.chunkAt(x, y, z, false);
    if (!c || !c.tag) return 0;
    return c.tag[((z & 15) << 8) | ((y & 15) << 4) | (x & 15)];
  }

  set(x: number, y: number, z: number, mat: number, obj: number, nrm?: readonly number[] | null, tag?: number): void {
    if (!this.inBounds(x, y, z)) return;
    const c = this.chunkAt(x, y, z, true)!;
    const i = ((z & 15) << 8) | ((y & 15) << 4) | (x & 15);
    if (mat === 0) {
      if (c.mat[i]) c.count--;
      c.mat[i] = 0;
      c.obj[i] = 0;
      if (c.nrm) c.nrm[i * 3] = c.nrm[i * 3 + 1] = c.nrm[i * 3 + 2] = 0;
      if (c.tag) c.tag[i] = 0;
      return;
    }
    if (!c.mat[i]) c.count++;
    c.mat[i] = mat;
    c.obj[i] = obj;
    if (nrm) {
      if (!c.nrm) c.nrm = new Int8Array(CH3 * 3);
      const l = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
      c.nrm[i * 3] = Math.round((nrm[0] / l) * 127);
      c.nrm[i * 3 + 1] = Math.round((nrm[1] / l) * 127);
      c.nrm[i * 3 + 2] = Math.round((nrm[2] / l) * 127);
    } else if (c.nrm) c.nrm[i * 3] = c.nrm[i * 3 + 1] = c.nrm[i * 3 + 2] = 0;
    if (tag !== undefined) {
      if (!c.tag) c.tag = new Uint8Array(CH3);
      c.tag[i] = tag;
    }
    const hi = y * this.sx + x;
    if (z > this.hmax[hi]) this.hmax[hi] = z;
    if (z > this.maxZ) this.maxZ = z;
  }

  /** Recalcula hmax tras borrar vóxeles (los set de material 0 no lo bajan). */
  rebuildHeights(): void {
    this.hmax.fill(-1);
    this.maxZ = -1;
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < this.sx; x++)
          if (this.mat(x, y, z)) {
            const hi = y * this.sx + x;
            if (z > this.hmax[hi]) this.hmax[hi] = z;
            if (z > this.maxZ) this.maxZ = z;
          }
  }

  /** Caja de vóxeles de un objeto: [x0,y0,z0,x1,y1,z1) exclusivo. */
  objectBounds(id: number): [number, number, number, number, number, number] | null {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let cz = 0; cz < this.cz; cz++)
      for (let cy = 0; cy < this.cy; cy++)
        for (let cx = 0; cx < this.cx; cx++) {
          const c = this.chunks[(cz * this.cy + cy) * this.cx + cx];
          if (!c || !c.count) continue;
          for (let i = 0; i < CH3; i++) {
            if (!c.mat[i] || c.obj[i] !== id) continue;
            const x = cx * CH + (i & 15), y = cy * CH + ((i >> 4) & 15), z = cz * CH + (i >> 8);
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (z < z0) z0 = z;
            if (x + 1 > x1) x1 = x + 1;
            if (y + 1 > y1) y1 = y + 1;
            if (z + 1 > z1) z1 = z + 1;
          }
        }
  return x0 === Infinity ? null : [x0, y0, z0, x1, y1, z1];
  }
}

/** Hash entero determinista para texturas. */
export function hash3(x: number, y: number, z: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** PRNG con semilla (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
