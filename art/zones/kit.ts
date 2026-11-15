// Kit común para modelar zonas: mundo, objetos, suelos, filas de casas y metadatos.
import { VoxelWorld, hash3 } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { Frame } from '../voxel/shapes.ts';
import { buildHouse, type HouseInfo, type HouseSpec } from '../modules/house.ts';
import { resetDecals } from '../decals.ts';
import type { ZoneBuild, ZoneObject } from './plaza.ts';
import type { FountainInfo } from '../modules/props.ts';
import { blockSolids } from './collide.ts';

export const T = 16;

export type HouseRow = { spec: Omit<HouseSpec, 'obj' | 'frame'>; facing: '+y' | '+x'; at: number; width: number; name: string }[];

export class ZoneCtx {
  w: VoxelWorld;
  objects: ZoneObject[] = [];
  lights: ZoneBuild['lights'] = [];
  smoke: ZoneBuild['smoke'] = [];
  steam: ZoneBuild['steam'] = [];
  lines: ZoneBuild['lines'] = [];
  shelters: ZoneBuild['shelters'] = [];
  fountains: FountainInfo[] = [];
  benches: [number, number][] = [];
  height: number[];
  walk: number[];
  private nextId = 1;

  constructor(public name: string, public TW: number, public TH: number, public G: number, sz = 380) {
    this.w = new VoxelWorld(TW * T, TH * T, sz);
    resetDecals();
    this.height = new Array(TW * TH).fill(G);
    this.walk = new Array(TW * TH).fill(1);
  }

  add(name: string, occluder: boolean): number {
    const id = this.nextId++;
    this.objects.push({ id, name, box: [0, 0, 0, 0, 0, 0], occluder });
    return id;
  }

  /** Capa de suelo (obj 0) en [x0,x1)×[y0,y1) vóxeles, con la superficie en z = G−1. */
  ground(x0: number, y0: number, x1: number, y1: number, surface: (x: number, y: number) => number, z0 = 0, top = this.G): void {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        for (let z = Math.max(z0, top - 4); z < top; z++) this.w.set(x, y, z, z === top - 1 ? surface(x, y) : MAT.rubble, 0);
  }

  houses(rows: HouseRow, plane: number): void {
    for (const h of rows) {
      const id = this.add(h.name, true);
      const frame = h.facing === '+y' ? new Frame('+y', h.at, plane, h.width) : new Frame('+x', plane, h.at, h.width);
      const info: HouseInfo = buildHouse(this.w, { ...h.spec, obj: id, frame });
      this.objects[id - 1].box = info.core;
      for (const l of info.lights) this.lights.push({ x: l[0], y: l[1], z: l[2], kind: 'wall' });
      this.smoke.push(...info.smoke);
      this.steam.push(...info.steam);
      this.lines.push(...info.lines);
      this.shelters.push(...info.shelters);
    }
  }

  block(tx0: number, ty0: number, tx1: number, ty1: number): void {
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (x >= 0 && y >= 0 && x < this.TW && y < this.TH) this.walk[y * this.TW + x] = 0;
  }

  /** Bloquea los tiles bajo los objetos sólidos (por su caja, algo encogida). */
  blockObjects(skip: (name: string) => boolean): void {
    for (const o of this.objects) {
      if (skip(o.name)) continue;
      const [x0, y0, , x1, y1] = o.box;
      const s = 0.25;
      for (let ty = Math.floor(y0 / T + s); ty < Math.ceil(y1 / T - s); ty++)
        for (let tx = Math.floor(x0 / T + s); tx < Math.ceil(x1 / T - s); tx++) if (tx >= 0 && ty >= 0 && tx < this.TW && ty < this.TH) this.walk[ty * this.TW + tx] = 0;
    }
  }

  finish(spawn: [number, number]): ZoneBuild {
    for (const o of this.objects) if (o.box[3] === 0) o.box = this.w.objectBounds(o.id)!;
    blockSolids(this.w, this.objects, this.TW, this.TH, this.height, this.walk);
    return {
      name: this.name, world: this.w, tilesW: this.TW, tilesH: this.TH, objects: this.objects, lights: this.lights, smoke: this.smoke,
      steam: this.steam, lines: this.lines, shelters: this.shelters, fountains: this.fountains, height: this.height, walk: this.walk, spawn, benches: this.benches,
    };
  }
}

/** Ruido de valor suave en 2D (manchas orgánicas). */
export function smooth2(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash3(x0, y0, 0, seed), b = hash3(x0 + 1, y0, 0, seed), c = hash3(x0, y0 + 1, 0, seed), d = hash3(x0 + 1, y0 + 1, 0, seed);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}

/** Losas, adoquín y musgo: superficies típicas. */
export const SURF = {
  slab: () => MAT.slab,
  cobble: () => MAT.cobble,
  grass: (x: number, y: number) => (hash3(x >> 2, y >> 2, 0, 41) < 0.04 ? MAT.flowerWhite : MAT.grass),
  earth: (x: number, y: number) => (smooth2(x, y, 22, 42) + (hash3(x, y, 0, 43) - 0.5) * 0.06 > 0.6 ? MAT.grass : MAT.earth),
};
