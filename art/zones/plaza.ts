// La plaza de la fuente: una terraza empedrada sobre la calle de abajo, rodeada de casas
// con galerías, la panadería, el quiosco, la fuente octogonal, farolas, bancos y árboles.
import { VoxelWorld, hash3 } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { box, Frame } from '../voxel/shapes.ts';
import { buildHouse, GROUND_Z, type HouseInfo, type HouseSpec } from '../modules/house.ts';
import { fountain, lamp, bench, tree, kiosk, planter, type FountainInfo } from '../modules/props.ts';
import { DECALS, resetDecals } from '../decals.ts';
import { blockSolids } from './collide.ts';

export const T = 16;

export interface ZoneObject {
  id: number;
  name: string;
  /** caja para ordenar por profundidad (vóxeles) */
  box: [number, number, number, number, number, number];
  /** semitransparente si tapa al jugador */
  occluder: boolean;
}

export interface ZoneBuild {
  name: string;
  world: VoxelWorld;
  tilesW: number;
  tilesH: number;
  objects: ZoneObject[];
  lights: { x: number; y: number; z: number; kind: 'lamp' | 'wall' | 'kiosk' }[];
  smoke: [number, number, number][];
  steam: [number, number, number][];
  lines: [[number, number, number], [number, number, number]][];
  shelters: [number, number, number, number][];
  fountains: FountainInfo[];
  /** altura (px) y transitabilidad por tile */
  height: number[];
  walk: number[];
  spawn: [number, number];
  benches: [number, number][];
}

export function buildPlaza(): ZoneBuild {
  const TW = 22, TH = 22;
  const w = new VoxelWorld(TW * T, TH * T, 380);
  resetDecals();
  const G = GROUND_Z; // 40
  const PL = 20 * T; // borde de la plaza
  const objects: ZoneObject[] = [];
  const lights: ZoneBuild['lights'] = [];
  const smoke: ZoneBuild['smoke'] = [];
  const steam: ZoneBuild['steam'] = [];
  const lines: ZoneBuild['lines'] = [];
  const shelters: ZoneBuild['shelters'] = [];
  const fountains: FountainInfo[] = [];
  const benches: [number, number][] = [];
  let nextId = 1;
  const add = (name: string, occluder: boolean): number => {
    const id = nextId++;
    objects.push({ id, name, box: [0, 0, 0, 0, 0, 0], occluder });
    return id;
  };

  // ---------- Suelo (obj 0) ----------
  // calle de abajo
  box(w, 0, 0, 0, TW * T, TH * T, 4, MAT.cobble, 0);
  // plataforma de la plaza: muro de contención de mampostería y capa superior
  const FX = 184, FY = 184; // centro de la fuente
  const surface = (x: number, y: number): number => {
    // aceras de losa frente a las fachadas
    if ((x >= 3 * T && x < 4 * T && y >= 3 * T) || (y >= 3 * T && y < 4 * T && x >= 3 * T)) {
      if (x === 4 * T - 1 || y === 4 * T - 1) return MAT.curb;
      return MAT.slab;
    }
    const dx = Math.abs(x + 0.5 - FX), dy = Math.abs(y + 0.5 - FY);
    const ring = 46;
    const inO = (a: number) => dx <= a && dy <= a;
    if (inO(ring)) return inO(ring - 2) ? MAT.cobble : MAT.curb;
    // musgo entre losas junto al pretil
    if ((x > PL - 10 || y > PL - 10) && hash3(x >> 1, y >> 1, 0, 77) < 0.07) return MAT.moss;
    return MAT.slab;
  };
  for (let y = 0; y < PL; y++)
    for (let x = 0; x < PL; x++) {
      const edge = x >= PL - 4 || y >= PL - 4;
      for (let z = 4; z < G; z++) {
        if (z < G - 4 && !edge) continue;
        if (z >= G - 4) {
          w.set(x, y, z, z === G - 1 ? surface(x, y) : MAT.cobble, 0);
        } else {
          // muro de contención con musgo en la parte alta y verdín abajo
          const mossy = (z > G - 12 && hash3(x >> 1, y >> 1, z >> 2, 5) < 0.18) || (z < 10 && hash3(x, y, z >> 1, 6) < 0.25);
          w.set(x, y, z, mossy ? MAT.moss : MAT.rubble, 0);
        }
      }
    }

  // escalera hundida hacia la calle de abajo (con musgo en los muros laterales)
  const SX0 = 14 * T, SX1 = 16 * T, SY0 = PL - 36;
  for (let y = SY0; y < PL; y++)
    for (let x = SX0 - 4; x < SX1 + 4; x++) {
      const side = x < SX0 || x >= SX1;
      const step = Math.floor((y - SY0) / 4);
      const top = G - 4 * (step + 1) + 4; // cota del peldaño
      for (let z = 4; z < G; z++) {
        if (side) {
          const mossy = hash3(x, y >> 1, z >> 1, 9) < 0.3 && z > top - 10;
          w.set(x, y, z, mossy ? MAT.moss : MAT.rubble, 0);
        } else if (z >= top) w.set(x, y, z, 0, 0);
        else w.set(x, y, z, z === top - 1 ? ((y - SY0) % 4 === 0 ? MAT.curb : MAT.granite) : MAT.rubble, 0);
      }
    }

  // terraza elevada en la esquina del fondo
  const TX0 = 3 * T, TX1 = 7 * T, TY0 = 3 * T, TY1 = 6 * T, TZ = G + 16;
  for (let y = TY0; y < TY1; y++)
    for (let x = TX0; x < TX1; x++)
      for (let z = G; z < TZ; z++) {
        const edge = x >= TX1 - 3 || y >= TY1 - 3;
        if (z === TZ - 1) w.set(x, y, z, edge ? MAT.curb : MAT.slab, 0);
        else if (edge) w.set(x, y, z, z > TZ - 6 && hash3(x, y, z, 31) < 0.35 ? MAT.moss : MAT.rubble, 0);
      }
  // escalones de la terraza (bajan hacia +y)
  for (let y = TY1; y < TY1 + 16; y++)
    for (let x = 4 * T; x < 6 * T; x++) {
      const step = Math.floor((y - TY1) / 4);
      const top = TZ - 4 * (step + 1);
      for (let z = G; z < top; z++) w.set(x, y, z, z === top - 1 ? MAT.curb : MAT.granite, 0);
      if (x === 4 * T || x === 6 * T - 1) if (hash3(x, y, 0, 3) < 0.5) w.set(x, y, top, MAT.moss, 0);
    }

  // ---------- Casas ----------
  const houses: { spec: Omit<HouseSpec, 'obj' | 'frame'>; facing: '+y' | '+x'; at: number; width: number; name: string }[] = [
    // fila del fondo-derecha (fachadas iluminadas, cara izquierda)
    { name: 'casa-esquina', facing: '+y', at: 0, width: 64, spec: { depth: 48, floors: 3, ground: 'arch', upper: ['windows', 'galeria'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, seed: 11 } },
    { name: 'casa-ocre', facing: '+y', at: 64, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['balconies', 'windows'], wall: MAT.ochre, base: MAT.rubble, quoins: false, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 12 } },
    { name: 'panaderia', facing: '+y', at: 112, width: 64, spec: { depth: 48, floors: 3, ground: 'bakery', upper: ['mixed', 'windows'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, seed: 13 } },
    { name: 'casa-salmon', facing: '+y', at: 176, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['galeria', 'windows'], wall: MAT.salmon, base: MAT.rubble, quoins: false, shutter: MAT.shutterGreen, seed: 14 } },
    { name: 'casa-azul', facing: '+y', at: 224, width: 48, spec: { depth: 48, floors: 2, ground: 'shop', upper: ['balconies'], wall: MAT.plasterBlue, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 15 } },
    { name: 'casa-piedra', facing: '+y', at: 272, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['windows', 'balconies'], wall: MAT.rubble, base: MAT.rubble, quoins: false, shutter: MAT.shutterBlue, frameMat: MAT.white, seed: 16 } },
    // fila del fondo-izquierda (fachadas en sombra, cara derecha); u de izq. a der. = y decreciente
    { name: 'casa-izq-1', facing: '+x', at: 272, width: 48, spec: { depth: 48, floors: 2, ground: 'door', upper: ['balconies'], wall: MAT.cal, base: MAT.rubble, quoins: true, shutter: MAT.shutterGreen, seed: 21 } },
    { name: 'casa-izq-2', facing: '+x', at: 208, width: 64, spec: { depth: 48, floors: 3, ground: 'windows', upper: ['galeria', 'windows'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, seed: 22 } },
    { name: 'casa-izq-3', facing: '+x', at: 160, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['mixed', 'windows'], wall: MAT.ochre, base: MAT.rubble, quoins: false, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 23 } },
    { name: 'casa-izq-4', facing: '+x', at: 96, width: 64, spec: { depth: 48, floors: 3, ground: 'arch', upper: ['balconies', 'galeria'], wall: MAT.rubble, base: MAT.ashlar, quoins: false, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 24 } },
    { name: 'casa-izq-5', facing: '+x', at: 48, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['windows', 'balconies'], wall: MAT.salmon, base: MAT.rubble, quoins: true, shutter: MAT.shutterBlue, seed: 25 } },
  ];
  const doors: [number, number][] = [];
  for (const h of houses) {
    const id = add(h.name, true);
    const frame = h.facing === '+y' ? new Frame('+y', h.at, 3 * T - 1, h.width) : new Frame('+x', 3 * T - 1, h.at, h.width);
    const info: HouseInfo = buildHouse(w, { ...h.spec, obj: id, frame });
    objects[id - 1].box = info.core;
    for (const l of info.lights) lights.push({ x: l[0], y: l[1], z: l[2], kind: 'wall' });
    smoke.push(...info.smoke);
    steam.push(...info.steam);
    lines.push(...info.lines);
    shelters.push(...info.shelters);
    doors.push(...info.doors);
  }

  // ---------- Fuente ----------
  {
    const id = add('fuente', false);
    fountains.push(fountain(w, FX, FY, G, id));
  }
  // ---------- Farolas ----------
  for (const [x, y] of [[124, 244], [244, 124], [266, 272], [104, 126]] as const) {
    const id = add('farola', true);
    const l = lamp(w, x, y, G, id);
    lights.push({ x: l[0], y: l[1], z: l[2], kind: 'lamp' });
  }
  // ---------- Bancos ----------
  {
    let id = add('banco', false);
    bench(w, 168, 252, G, 'x', id, -1);
    benches.push([11, 15]);
    id = add('banco', false);
    bench(w, 252, 196, G, 'y', id, -1);
    benches.push([15, 11]);
    id = add('banco', false);
    bench(w, 74, 64, TZ, 'x', id, -1);
    benches.push([5, 4]);
  }
  // ---------- Árboles ----------
  {
    let id = add('arbol', true);
    tree(w, 296, 108, G, id, 41, 1);
    id = add('arbol', true);
    tree(w, 100, 290, G, id, 42, 1.05);
  }
  // ---------- Quiosco ----------
  {
    const id = add('quiosco', true);
    const l = kiosk(w, 262, 72, G, id);
    lights.push({ x: l[0], y: l[1], z: l[2], kind: 'kiosk' });
  }
  // ---------- Jardineras ----------
  {
    let s = 50;
    for (const [x, y, k] of [[302, 168, 'geranium'], [302, 214, 'shrub'], [150, 302, 'geranium'], [196, 302, 'shrub'], [98, 112, 'geranium'], [180, 66, 'shrub']] as const) {
      const id = add('jardinera', false);
      planter(w, x, y, G, id, s++, k);
    }
  }
  // ---------- Pretiles ----------
  {
    const idA = add('pretil', false);
    for (let y = 4 * T; y < PL; y++)
      for (let x = PL - 3; x < PL; x++)
        for (let z = G; z < G + 12; z++) w.set(x, y, z, z >= G + 10 ? MAT.curb : MAT.ashlar, idA);
    const idB = add('pretil', false);
    for (let x = 4 * T; x < PL - 3; x++) {
      if (x >= SX0 - 4 && x < SX1 + 4) continue;
      for (let y = PL - 3; y < PL; y++)
        for (let z = G; z < G + 12; z++) w.set(x, y, z, z >= G + 10 ? MAT.curb : MAT.ashlar, idB);
    }
  }

  // ---------- Retoques del suelo: rayuela de tiza, tapa de alcantarilla, rejilla
  {
    // rayuela: casillas de 8×8 vóxeles en columna a lo largo de −y, con pares laterales
    const cells = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
    const sq = ['wwwwwwwwwwwwwwww', ...Array(14).fill('w..............w'), 'wwwwwwwwwwwwwwww'];
    for (const [cx, cy] of cells) DECALS.push({ kind: 'top', obj: 0, x: 206 + cx * 8 - 4, y: 286 - (cy + 1) * 8, z: G, rows: sq, key: { w: 'cal4', '.': null } });
    const tapa = ['..kkkkkk..', '.kssssssk.', 'kssksskssk', 'ksksskskk.', 'kssksskssk', '.kssssssk.', '..kkkkkk..'];
    DECALS.push({ kind: 'top', obj: 0, x: 262, y: 168, z: G, rows: tapa.map((r) => r.replace(/./g, (c) => c + c)), key: { k: 'stone0', s: 'stone2', '.': null } });
    const rejilla = ['kkkkkkkkkk', 'kskskskskk', 'kskskskskk', 'kkkkkkkkkk'];
    DECALS.push({ kind: 'top', obj: 0, x: 66, y: 196, z: G, rows: rejilla.map((r) => r + r), key: { k: 'ink2', s: 'stone1', '.': null } });
  }

  // cajas de objetos que no son casas
  for (const o of objects) if (o.box[3] === 0) o.box = w.objectBounds(o.id)!;

  // ---------- Rejilla transitable ----------
  const height = new Array(TW * TH).fill(G);
  const walk = new Array(TW * TH).fill(1);
  for (let ty = 0; ty < TH; ty++)
    for (let tx = 0; tx < TW; tx++) {
      const i = ty * TW + tx;
      if (tx >= 20 || ty >= 20) height[i] = 4;
      if (tx < 3 || ty < 3) walk[i] = 0;
      if (tx >= 3 && tx < 7 && ty >= 3 && ty < 6) height[i] = TZ;
      if (tx >= 4 && tx < 6 && ty === 6) height[i] = G + 8;
      if ((tx === 3 || tx === 6) && ty === 6) walk[i] = 0; // laterales de la escalera
      if (tx >= 14 && tx < 16 && ty >= 18 && ty < 20) height[i] = ty === 18 ? G - 12 : G - 24;
      // pretil interior junto a la escalera hundida
      if ((tx === 13 || tx === 16) && (ty === 18 || ty === 19)) walk[i] = 0;
    }
  // bloquear tiles ocupados por objetos sólidos (por su huella en el suelo)
  for (const o of objects) {
    if (o.name.startsWith('casa') || o.name === 'panaderia' || o.name === 'pretil') continue;
    const [x0, y0, , x1, y1] = o.box;
    const shrink = o.name === 'arbol' ? 0.35 : o.name === 'fuente' ? 0.15 : 0.25;
    const fx0 = x0 / T, fy0 = y0 / T, fx1 = x1 / T, fy1 = y1 / T;
    if (o.name === 'arbol') {
      // solo el tronco
      continue;
    }
    for (let ty = Math.floor(fy0 + shrink); ty < Math.ceil(fy1 - shrink); ty++)
      for (let tx = Math.floor(fx0 + shrink); tx < Math.ceil(fx1 - shrink); tx++) walk[ty * TW + tx] = 0;
  }
  walk[6 * TW + 18] = 0; // tronco árbol 1 (296,108)
  walk[18 * TW + 6] = 0; // tronco árbol 2 (100,290)
  blockSolids(w, objects, TW, TH, height, walk);

  return {
    name: 'plaza', world: w, tilesW: TW, tilesH: TH, objects, lights, smoke, steam, lines, shelters, fountains,
    height, walk, spawn: [12, 15], benches,
  };
}
