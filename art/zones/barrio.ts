// Resto del barrio: la calle de tu portal, el parque, el mercado, el descampado y el puerto.
// Todas son terrazas del casco antiguo sobre una calle baja, como la plaza.
import { hash3 } from '../voxel/world.ts';
import { MAT } from '../voxel/materials.ts';
import { GROUND_Z } from '../modules/house.ts';
import { lamp, bench, tree, planter } from '../modules/props.ts';
import { crate, cardboard, pallet, fence, stall, boat, bollard, nasa, nets, bandstand, hedge, flowerbed, tallGrass, shed } from '../modules/props2.ts';
import { DECALS } from '../decals.ts';
import { box } from '../voxel/shapes.ts';
import { ZoneCtx, T, SURF, smooth2 } from './kit.ts';
import type { ZoneBuild } from './plaza.ts';

const G = GROUND_Z;

/** Terraza con muro de contención, calle baja alrededor y pretiles con huecos. */
function terrace(c: ZoneCtx, plx: number, ply: number, surface: (x: number, y: number) => number, gaps: { x?: [number, number]; y?: [number, number] } = {}): void {
  const w = c.w;
  const PX = plx * T, PY = ply * T;
  // calle baja
  for (let y = 0; y < c.TH * T; y++)
    for (let x = 0; x < c.TW * T; x++) for (let z = 0; z < 4; z++) w.set(x, y, z, z === 3 ? MAT.cobble : MAT.rubble, 0);
  for (let y = 0; y < PY; y++)
    for (let x = 0; x < PX; x++) {
      const edge = x >= PX - 4 || y >= PY - 4;
      for (let z = 4; z < G; z++) {
        if (z < G - 4 && !edge) continue;
        if (z >= G - 4) w.set(x, y, z, z === G - 1 ? surface(x, y) : MAT.cobble, 0);
        else {
          const mossy = (z > G - 12 && hash3(x >> 1, y >> 1, z >> 2, 5) < 0.18) || (z < 10 && hash3(x, y, z >> 1, 6) < 0.25);
          w.set(x, y, z, mossy ? MAT.moss : MAT.rubble, 0);
        }
      }
    }
  // pretiles
  const idA = c.add('pretil', false);
  for (let y = 4 * T; y < PY; y++) {
    if (gaps.x && y >= gaps.x[0] * T && y < gaps.x[1] * T) continue;
    for (let x = PX - 3; x < PX; x++) for (let z = G; z < G + 12; z++) w.set(x, y, z, z >= G + 10 ? MAT.curb : MAT.ashlar, idA);
  }
  const idB = c.add('pretil', false);
  for (let x = 4 * T; x < PX - 3; x++) {
    if (gaps.y && x >= gaps.y[0] * T && x < gaps.y[1] * T) continue;
    for (let y = PY - 3; y < PY; y++) for (let z = G; z < G + 12; z++) w.set(x, y, z, z >= G + 10 ? MAT.curb : MAT.ashlar, idB);
  }
  // rejilla: calle baja a z = 4
  for (let ty = 0; ty < c.TH; ty++)
    for (let tx = 0; tx < c.TW; tx++) {
      const i = ty * c.TW + tx;
      if (tx >= plx || ty >= ply) c.height[i] = 4;
      if (tx < 3 || ty < 3) c.walk[i] = 0;
    }
}

/** Escalera hundida de la terraza a la calle baja, en el borde y (lado izquierdo en pantalla). */
function stairsY(c: ZoneCtx, tx0: number, ply: number): void {
  const w = c.w;
  const SX0 = tx0 * T, SX1 = (tx0 + 2) * T, PL = ply * T, SY0 = PL - 36;
  // muros laterales como objetos: el de delante tapa a quien baja la escalera
  const wallL = c.add('muro-escalera', false), wallR = c.add('muro-escalera', false);
  for (let y = SY0; y < PL; y++)
    for (let x = SX0 - 4; x < SX1 + 4; x++) {
      const side = x < SX0 || x >= SX1;
      const step = Math.floor((y - SY0) / 4);
      const top = G - 4 * step;
      for (let z = 4; z < G + 12; z++) {
        if (side) {
          if (z < G) w.set(x, y, z, hash3(x, y >> 1, z >> 1, 9) < 0.3 && z > top - 10 ? MAT.moss : MAT.rubble, x < SX0 ? wallL : wallR);
          else w.set(x, y, z, 0, 0);
        } else if (z >= top) w.set(x, y, z, 0, 0);
        else w.set(x, y, z, z === top - 1 ? ((y - SY0) % 4 === 0 ? MAT.curb : MAT.granite) : MAT.rubble, 0);
      }
    }
  for (const tx of [tx0, tx0 + 1]) {
    c.height[(ply - 2) * c.TW + tx] = G - 12;
    c.height[(ply - 1) * c.TW + tx] = G - 24;
  }
  for (const ty of [ply - 2, ply - 1]) {
    c.walk[ty * c.TW + tx0 - 1] = 0;
    c.walk[ty * c.TW + tx0 + 2] = 0;
  }
}

function stairsX(c: ZoneCtx, ty0: number, plx: number): void {
  const w = c.w;
  const SY0 = ty0 * T, SY1 = (ty0 + 2) * T, PL = plx * T, SX0 = PL - 36;
  const wallL = c.add('muro-escalera', false), wallR = c.add('muro-escalera', false);
  for (let x = SX0; x < PL; x++)
    for (let y = SY0 - 4; y < SY1 + 4; y++) {
      const side = y < SY0 || y >= SY1;
      const step = Math.floor((x - SX0) / 4);
      const top = G - 4 * step;
      for (let z = 4; z < G + 12; z++) {
        if (side) {
          if (z < G) w.set(x, y, z, hash3(x >> 1, y, z >> 1, 9) < 0.3 && z > top - 10 ? MAT.moss : MAT.rubble, y < SY0 ? wallL : wallR);
          else w.set(x, y, z, 0, 0);
        } else if (z >= top) w.set(x, y, z, 0, 0);
        else w.set(x, y, z, z === top - 1 ? ((x - SX0) % 4 === 0 ? MAT.curb : MAT.granite) : MAT.rubble, 0);
      }
    }
  for (const ty of [ty0, ty0 + 1]) {
    c.height[ty * c.TW + plx - 2] = G - 12;
    c.height[ty * c.TW + plx - 1] = G - 24;
  }
  for (const tx of [plx - 2, plx - 1]) {
    c.walk[(ty0 - 1) * c.TW + tx] = 0;
    c.walk[(ty0 + 2) * c.TW + tx] = 0;
  }
}

const sidewalk = (x: number, y: number) => (x >= 3 * T && x < 4 * T) || (y >= 3 * T && y < 4 * T);

// ======================================================================= CALLE
export function buildCalle(): ZoneBuild {
  const c = new ZoneCtx('calle', 14, 24, G);
  const PX = 12, PY = 22;
  terrace(c, PX, PY, (x, y) => (sidewalk(x, y) ? (x === 4 * T - 1 || y === 4 * T - 1 ? MAT.curb : MAT.slab) : MAT.cobble), { y: [6, 9] });
  stairsY(c, 6, PY);
  c.houses([
    { name: 'casa-calle-1', facing: '+y', at: 0, width: 64, spec: { depth: 48, floors: 3, ground: 'windows', upper: ['galeria', 'windows'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, seed: 101 } },
    { name: 'casa-calle-2', facing: '+y', at: 64, width: 64, spec: { depth: 48, floors: 3, ground: 'shop', upper: ['balconies', 'windows'], wall: MAT.plasterBlue, base: MAT.rubble, shutter: MAT.shutterGreen, frameMat: MAT.white, sign: 'ULTRAMARINOS', doorMat: MAT.woodRed, seed: 102 } },
    { name: 'casa-calle-3', facing: '+y', at: 128, width: 64, spec: { depth: 48, floors: 2, ground: 'door', upper: ['balconies'], wall: MAT.ochre, base: MAT.rubble, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 103 } },
  ], 3 * T - 1);
  c.houses([
    { name: 'tu-casa', facing: '+x', at: 288, width: 64, spec: { depth: 48, floors: 3, ground: 'door', upper: ['mixed', 'galeria'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, doorMat: MAT.woodBlue, seed: 110 } },
    { name: 'casa-calle-5', facing: '+x', at: 240, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['windows', 'balconies'], wall: MAT.salmon, base: MAT.rubble, shutter: MAT.shutterGreen, seed: 105 } },
    { name: 'casa-calle-6', facing: '+x', at: 176, width: 64, spec: { depth: 48, floors: 3, ground: 'windows', upper: ['balconies', 'windows'], wall: MAT.rubble, base: MAT.rubble, shutter: MAT.shutterBlue, frameMat: MAT.white, seed: 106 } },
    { name: 'casa-calle-7', facing: '+x', at: 112, width: 64, spec: { depth: 48, floors: 3, ground: 'arch', upper: ['galeria', 'windows'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, seed: 107 } },
    { name: 'casa-calle-8', facing: '+x', at: 48, width: 64, spec: { depth: 48, floors: 2, ground: 'door', upper: ['mixed'], wall: MAT.ochre, base: MAT.rubble, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 108 } },
  ], 3 * T - 1);
  // felpudo del portal y macetas a la puerta de casa
  DECALS.push({ kind: 'top', obj: 0, x: 50, y: 316, z: G, rows: ['kkkkkkkkkk', 'krrrrrrrrk', 'krcrcrcrck', 'krrrrrrrrk', 'kkkkkkkkkk'].map((r) => r.replace(/./g, (ch) => ch + ch)), key: { k: 'wood1', r: 'tile2', c: 'wood3' } });
  for (const [x, y, k] of [[52, 296, 'geranium'], [52, 340, 'geranium'], [150, 300, 'shrub'], [150, 120, 'geranium']] as const) planter(c.w, x, y, G, c.add('jardinera', false), x + y, k);
  for (const [x, y] of [[150, 200]] as const) {
    const id = c.add('farola', true);
    const l = lamp(c.w, x, y, G, id);
    c.lights.push({ x: l[0], y: l[1], z: l[2], kind: 'lamp' });
  }
  bench(c.w, 120, 250, G, 'y', c.add('banco', false), -1);
  c.benches.push([8, 15]);
  tree(c.w, 160, 60 + 16 * 3, G, c.add('arbol', true), 77, 0.8);
  c.blockObjects((n) => n.startsWith('casa') || n === 'tu-casa' || n === 'pretil' || n === 'arbol');
  c.block(10, 6, 11, 7);
  return c.finish([5, 19]);
}

// ======================================================================= PARQUE
export function buildParque(): ZoneBuild {
  const c = new ZoneCtx('parque', 22, 22, G);
  const PX = 20, PY = 20;
  const path = (x: number, y: number) => {
    const tx = x / T, ty = y / T;
    return Math.abs(tx - 11.5) < 1 || Math.abs(ty - 11.5) < 1 || Math.abs(tx - ty) < 0.8;
  };
  terrace(c, PX, PY, (x, y) => (sidewalk(x, y) ? MAT.gravel : path(x, y) ? MAT.gravel : SURF.grass(x, y)), { x: [10, 13] });
  stairsX(c, 10, PX);
  // muro de piedra con hiedra en los bordes del fondo
  const wall = c.add('muro', true);
  for (let i = 3 * T - 6; i < 20 * T; i++)
    for (let z = G; z < G + 72; z++)
      for (let d = 0; d < 6; d++) {
        const ivy = (k: number) => hash3(i >> 1, z >> 2, d, k) < (z < G + 50 ? 0.35 : 0.15);
        w2(c, 3 * T - 1 - d, i, z, ivy(33) ? MAT.moss : MAT.rubble, wall);
        w2(c, i, 3 * T - 1 - d, z, ivy(34) ? MAT.moss : MAT.rubble, wall);
      }
  for (let i = 3 * T - 7; i < 20 * T; i++) for (let z = G + 72; z < G + 75; z++) for (let d = -1; d < 7; d++) {
    w2(c, 3 * T - 1 - d, i, z, MAT.curb, wall);
    w2(c, i, 3 * T - 1 - d, z, MAT.curb, wall);
  }
  c.objects[wall - 1].box = [0, 0, G, 3 * T, 20 * T, G + 75];
  // árboles grandes (castaños de Indias)
  let s = 300;
  for (const [tx, ty] of [[6, 6], [16.5, 6], [6, 16.5], [16.5, 16.5], [9, 18.5], [18.5, 9]] as const) tree(c.w, tx * T, ty * T, G, c.add('arbol', true), s++, 1.05);
  // templete de música en el centro
  bandstand(c.w, 9.8 * T, 9.8 * T, G, c.add('templete', true));
  for (const [x, y, sx, sy] of [[4.2, 9.2, 3, 2], [9.2, 4.2, 2, 3], [14, 4.2, 2, 2], [4.2, 14, 2, 2]] as const) flowerbed(c.w, x * T, y * T, G, sx * T, sy * T, c.add('parterre', false), x * 100 + y);
  hedge(c.w, 4 * T, 19 * T - 8, G, 6 * T, 'x', c.add('seto', false));
  bench(c.w, 8 * T, 13.2 * T, G, 'x', c.add('banco', false), -1);
  bench(c.w, 13.2 * T, 8 * T, G, 'y', c.add('banco', false), -1);
  bench(c.w, 15 * T, 13.2 * T, G, 'x', c.add('banco', false), -1);
  c.benches.push([9, 13], [13, 9], [16, 13]);
  for (const [x, y] of [[8.5, 8.5], [14.5, 14.5], [4.5, 18]] as const) {
    const id = c.add('farola', true);
    const l = lamp(c.w, x * T, y * T, G, id);
    c.lights.push({ x: l[0], y: l[1], z: l[2], kind: 'lamp' });
  }
  c.blockObjects((n) => n === 'pretil' || n === 'arbol' || n === 'muro');
  for (const [tx, ty] of [[6, 6], [16, 6], [6, 16], [16, 16], [9, 18], [18, 9]] as const) c.block(tx, ty, tx + 1, ty + 1);
  return c.finish([12, 18]);
}

function w2(c: ZoneCtx, x: number, y: number, z: number, m: number, obj: number): void {
  c.w.set(x, y, z, m, obj);
}

// ======================================================================= MERCADO
export function buildMercado(): ZoneBuild {
  const c = new ZoneCtx('mercado', 20, 20, G);
  const PX = 18, PY = 18;
  terrace(c, PX, PY, (x, y) => (sidewalk(x, y) ? (x === 4 * T - 1 || y === 4 * T - 1 ? MAT.curb : MAT.slab) : MAT.slab), { y: [12, 15] });
  stairsY(c, 12, PY);
  c.houses([
    { name: 'pescaderia', facing: '+y', at: 0, width: 64, spec: { depth: 48, floors: 2, ground: 'shop', upper: ['galeria'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, sign: 'PESCADO', goods: 'fish', doorMat: MAT.woodBlue, seed: 201 } },
    { name: 'mercado-abastos', facing: '+y', at: 64, width: 96, spec: { depth: 48, floors: 2, ground: 'shop', upper: ['windows'], wall: MAT.ochre, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, frameMat: MAT.white, sign: 'MERCADO', doorMat: MAT.woodGreen, seed: 202 } },
    { name: 'casa-merc-3', facing: '+y', at: 160, width: 64, spec: { depth: 48, floors: 3, ground: 'shop', upper: ['balconies', 'windows'], wall: MAT.salmon, base: MAT.rubble, shutter: MAT.shutterGreen, sign: 'FLORES', doorMat: MAT.woodRed, seed: 203 } },
    { name: 'casa-merc-4', facing: '+y', at: 224, width: 64, spec: { depth: 48, floors: 3, ground: 'door', upper: ['windows', 'galeria'], wall: MAT.rubble, base: MAT.rubble, shutter: MAT.shutterBlue, frameMat: MAT.white, seed: 204 } },
  ], 3 * T - 1);
  c.houses([
    { name: 'casa-merc-5', facing: '+x', at: 224, width: 64, spec: { depth: 48, floors: 3, ground: 'bakery', upper: ['mixed', 'windows'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, sign: 'BOLLOS', seed: 205 } },
    { name: 'casa-merc-6', facing: '+x', at: 160, width: 64, spec: { depth: 48, floors: 2, ground: 'door', upper: ['balconies'], wall: MAT.plasterBlue, base: MAT.rubble, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 206 } },
    { name: 'casa-merc-7', facing: '+x', at: 48, width: 112, spec: { depth: 48, floors: 3, ground: 'windows', upper: ['galeria', 'windows'], wall: MAT.ochre, base: MAT.ashlar, shutter: MAT.shutterBlue, frameMat: MAT.white, seed: 207 } },
  ], 3 * T - 1);
  const kinds = ['fruta', 'pescado', 'flores', 'queso', 'fruta', 'pescado'] as const;
  const stripes = [MAT.awningRed, MAT.woodBlue, MAT.woodGreen, MAT.awningRed, MAT.woodGreen, MAT.woodBlue];
  [[6, 6], [10, 6], [14, 6], [6, 10.5], [10, 10.5], [14, 10.5]].forEach(([tx, ty], i) => {
    const id = c.add('puesto', true);
    stall(c.w, tx * T, ty * T, G, id, kinds[i], stripes[i]);
    c.shelters.push([tx, ty - 0.2, tx + 1.8, ty + 1.2]);
  });
  let s = 1;
  for (const [x, y, f] of [[5, 15, MAT.fruitOrange], [5.7, 15, MAT.flowerRed], [5, 15.6, null], [16, 9, MAT.leaf], [16, 9.6, MAT.fruitOrange], [8.5, 15.2, MAT.fish]] as const) {
    const id = c.add('cajas', false);
    crate(c.w, x * T, y * T, G, id, f, 7);
    if (s++ % 2) crate(c.w, x * T + 1, y * T, G + 7, id, null, 7);
  }
  for (const [x, y] of [[4.5, 12.5], [16.5, 15.5]] as const) {
    const id = c.add('farola', true);
    const l = lamp(c.w, x * T, y * T, G, id);
    c.lights.push({ x: l[0], y: l[1], z: l[2], kind: 'lamp' });
  }
  c.blockObjects((n) => n.startsWith('casa') || n === 'pescaderia' || n === 'mercado-abastos' || n === 'pretil');
  return c.finish([13, 16]);
}

// ======================================================================= DESCAMPADO
export function buildDescampado(): ZoneBuild {
  const c = new ZoneCtx('descampado', 18, 18, G);
  const PX = 16, PY = 16;
  terrace(c, PX, PY, (x, y) => SURF.earth(x, y), { x: [7, 10] });
  stairsX(c, 7, PX);
  // nave vieja de ladrillo al fondo, con portón oxidado
  const nave = c.add('nave', true);
  for (let i = 0; i < 16 * T; i++)
    for (let z = G; z < G + 110; z++)
      for (let d = 0; d < 5; d++) {
        const door = i > 6 * T && i < 9 * T && z < G + 70;
        const m = z > G + 104 ? MAT.curb : door ? MAT.rust : z < G + 10 ? MAT.rubble : MAT.brick;
        c.w.set(i, 3 * T - 1 - d, z, door && d > 0 ? 0 : m, nave);
      }
  c.objects[nave - 1].box = [0, 0, G, 16 * T, 3 * T, G + 110];
  // valla de madera vieja en el lado izquierdo
  const valla = c.add('valla', false);
  fence(c.w, 3 * T - 2, 3 * T, G, 13 * T, 'y', valla);
  // cartones (refugios), palés, cajas, árbol y hierba alta
  for (const [tx, ty, o] of [[5, 5, '+y'], [9.5, 4.6, '+y'], [4.6, 11, '+x'], [12, 10, '+y']] as const) {
    cardboard(c.w, tx * T, ty * T, G, c.add('carton', false), o);
    c.shelters.push([tx - 0.2, ty + 0.5, tx + 1.2, ty + 1.6]);
  }
  pallet(c.w, 7.5 * T, 8 * T, G, c.add('pales', false), 3);
  pallet(c.w, 13.5 * T, 5 * T, G, c.add('pales', false), 1);
  for (const [x, y] of [[11, 13], [11.6, 13]] as const) crate(c.w, x * T, y * T, G, c.add('cajas', false), null, 7);
  tree(c.w, 14 * T, 13 * T, G, c.add('arbol', true), 501, 0.95);
  let s = 600;
  for (const [x, y, r] of [[4, 7.5, 18], [10, 13.5, 14], [14, 7.5, 16], [8, 11, 10]] as const) tallGrass(c.w, x * T, y * T, G, r, c.add('hierba', false), s++);
  c.blockObjects((n) => n === 'pretil' || n === 'nave' || n === 'hierba' || n === 'arbol' || n === 'valla');
  c.block(14, 13, 15, 14);
  return c.finish([11, 9]);
}

// ======================================================================= PUERTO
export function buildPuerto(): ZoneBuild {
  const c = new ZoneCtx('puerto', 22, 22, G);
  const w = c.w;
  const QY = 12 * T; // borde del muelle
  // mar: agua a z = 20 delante del muelle
  for (let y = 0; y < c.TH * T; y++)
    for (let x = 0; x < c.TW * T; x++)
      for (let z = 0; z < 20; z++) w.set(x, y, z, z === 19 ? MAT.water : z < 12 ? MAT.rubble : MAT.water, 0);
  // muelle de granito y espigón
  const pierX0 = 14 * T, pierX1 = 16 * T, pierY1 = 20 * T;
  for (let y = 0; y < pierY1; y++)
    for (let x = 0; x < c.TW * T; x++) {
      const quay = y < QY;
      const pier = x >= pierX0 && x < pierX1 && y < pierY1;
      if (!quay && !pier) continue;
      const edge = (quay && y >= QY - 3 && !(x >= pierX0 && x < pierX1)) || (pier && !quay && (x < pierX0 + 3 || x >= pierX1 - 3 || y >= pierY1 - 3));
      for (let z = 12; z < G; z++) {
        if (z < G - 4 && !edge) continue;
        if (z === G - 1) w.set(x, y, z, edge ? MAT.curb : MAT.slab, 0);
        else if (z >= G - 4) w.set(x, y, z, MAT.cobble, 0);
        else w.set(x, y, z, z < 26 && hash3(x >> 1, y >> 1, z >> 1, 77) < 0.4 ? MAT.moss : MAT.ashlar, 0);
      }
    }
  // casas de pescadores y caseta de redes
  c.houses([
    { name: 'casa-puerto-1', facing: '+y', at: 0, width: 64, spec: { depth: 48, floors: 3, ground: 'door', upper: ['galeria', 'windows'], wall: MAT.plasterBlue, base: MAT.ashlar, shutter: MAT.shutterGreen, frameMat: MAT.white, seed: 301 } },
    { name: 'casa-puerto-2', facing: '+y', at: 64, width: 48, spec: { depth: 48, floors: 3, ground: 'door', upper: ['balconies', 'windows'], wall: MAT.salmon, base: MAT.rubble, shutter: MAT.shutterBlue, seed: 302 } },
    { name: 'casa-puerto-3', facing: '+y', at: 112, width: 48, spec: { depth: 48, floors: 2, ground: 'shop', upper: ['windows'], wall: MAT.ochre, base: MAT.rubble, shutter: MAT.shutterGreen, frameMat: MAT.white, sign: 'BAR', goods: 'fish', doorMat: MAT.woodBlue, seed: 303 } },
    { name: 'casa-puerto-4', facing: '+y', at: 160, width: 64, spec: { depth: 48, floors: 3, ground: 'door', upper: ['galeria', 'balconies'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterBlue, seed: 304 } },
  ], 3 * T - 1);
  c.houses([
    { name: 'casa-puerto-5', facing: '+x', at: 112, width: 80, spec: { depth: 48, floors: 3, ground: 'door', upper: ['windows', 'galeria'], wall: MAT.cal, base: MAT.ashlar, quoins: true, shutter: MAT.shutterGreen, seed: 305 } },
    { name: 'casa-puerto-6', facing: '+x', at: 48, width: 64, spec: { depth: 48, floors: 2, ground: 'door', upper: ['balconies'], wall: MAT.salmon, base: MAT.rubble, shutter: MAT.shutterBlue, seed: 306 } },
  ], 3 * T - 1);
  shed(w, 15 * T, 4 * T, G, c.add('caseta', true));
  // barcas en el agua (se mecen en el juego)
  const hulls: [number, number][] = [[MAT.woodBlue, MAT.white], [MAT.woodRed, MAT.white], [MAT.woodGreen, MAT.awningRed], [MAT.yellowBoat, MAT.woodBlue]];
  [[5, 14.2, 'x'], [10.5, 16, 'x'], [17, 13.5, 'y'], [11.5, 13, 'x']].forEach(([x, y, ax], i) => boat(w, (x as number) * T, (y as number) * T, 16, c.add('barca', false), hulls[i][0], hulls[i][1], ax as 'x' | 'y'));
  for (let x = 4; x < 14; x += 3) bollard(w, x * T + 8, QY - 6, G, c.add('noray', false));
  for (const [x, y] of [[6, 9], [6.7, 9.5], [12.5, 9]] as const) nasa(w, x * T, y * T, G, c.add('nasa', false));
  nets(w, 9.5 * T, 9.5 * T, G, c.add('redes', false), MAT.netGreen);
  nets(w, 18 * T, 10.5 * T, G, c.add('redes', false), MAT.netRed);
  crate(w, 4.5 * T, 6 * T, G, c.add('cajas', false), MAT.fish);
  crate(w, 5.2 * T, 6 * T, G, c.add('cajas', false), MAT.ice);
  for (const [x, y] of [[8.5, 6.5], [15, 18.5]] as const) {
    const id = c.add('farola', true);
    const l = lamp(w, x * T, y * T, G, id);
    c.lights.push({ x: l[0], y: l[1], z: l[2], kind: 'lamp' });
  }
  // rejilla: muelle y espigón transitables; el agua no
  for (let ty = 0; ty < c.TH; ty++)
    for (let tx = 0; tx < c.TW; tx++) {
      const i = ty * c.TW + tx;
      const quay = ty < 12, pier = tx >= 14 && tx < 16 && ty < 20;
      c.walk[i] = (quay || pier) && tx >= 3 && ty >= 3 ? 1 : 0;
      c.height[i] = quay || pier ? G : 20;
    }
  c.blockObjects((n) => n.startsWith('casa') || n === 'barca');
  return c.finish([8, 8]);
}

// ======================================================================= HORTA
/** Bancal elevado de madera con su cultivo. */
function bancal(c: ZoneCtx, x: number, y: number, sx: number, sy: number, crop: 'col' | 'tomate' | 'calabaza' | 'lechuga', seed: number): void {
  const w = c.w, obj = c.add('bancal', false), z = G;
  const R = (k: number) => hash3(x + k, y - k, seed, 77);
  box(w, x, y, z, x + sx, y + sy, z + 6, (xx, yy, zz) => (xx === x || yy === y || xx === x + sx - 1 || yy === y + sy - 1 ? MAT.wood : zz === z + 5 ? MAT.earth : MAT.rubble), obj);
  const top = z + 6;
  for (let yy = y + 2; yy < y + sy - 2; yy += crop === 'calabaza' ? 7 : 4)
    for (let xx = x + 2; xx < x + sx - 2; xx += crop === 'calabaza' ? 7 : 4) {
      const r = R(xx * 3 + yy);
      if (crop === 'col' || crop === 'lechuga') {
        // cogollos redondos
        const h = crop === 'col' ? 4 : 2;
        for (let dz = 0; dz < h; dz++)
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) + (dz === h - 1 ? 1 : 0) <= 2) w.set(xx + dx, yy + dy, top + dz, MAT.leaf, obj);
      } else if (crop === 'tomate') {
        // tomateras con su caña y tomates rojos
        for (let dz = 0; dz < 12; dz++) w.set(xx, yy, top + dz, dz > 10 ? MAT.wood : MAT.leaf, obj);
        for (const [dx, dy, dz] of [[1, 0, 4], [-1, 0, 7], [0, 1, 9], [1, 1, 5]] as const) w.set(xx + dx, yy + dy, top + dz, r < 0.5 ? MAT.flowerRed : MAT.leaf, obj);
      } else {
        // calabazas naranjas entre hojas
        for (let dz = 0; dz < 4; dz++)
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy + dz * dz * 1.5 <= 6) w.set(xx + dx, yy + dy, top + dz, MAT.fruitOrange, obj);
        w.set(xx, yy, top + 4, MAT.wood, obj);
        for (const [dx, dy] of [[3, 0], [-3, 1], [0, 3]] as const) w.set(xx + dx, yy + dy, top, MAT.leaf, obj);
      }
    }
}

/** Espantapájaros con camisa de cuadros y sombrero de paja. */
function scarecrow(c: ZoneCtx, x: number, y: number): void {
  const w = c.w, obj = c.add('espantapajaros', true), z = G;
  for (let dz = 0; dz < 44; dz++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.set(x + dx, y + dy, z + dz, MAT.bark, obj);
  // brazos
  for (let d = -9; d <= 10; d++) for (const dz of [32, 33]) w.set(x + d, y, z + dz, MAT.wood, obj);
  // camisa
  box(w, x - 4, y - 2, z + 22, x + 6, y + 4, z + 35, (xx, _yy, zz) => ((xx + zz) % 4 < 2 ? MAT.awningRed : MAT.awningWhite), obj);
  // cabeza de saco y sombrero
  box(w, x - 2, y - 2, z + 36, x + 4, y + 4, z + 42, MAT.bread, obj);
  box(w, x - 5, y - 5, z + 42, x + 7, y + 7, z + 43, MAT.cheese, obj);
  box(w, x - 2, y - 2, z + 43, x + 4, y + 4, z + 47, MAT.cheese, obj);
}

export function buildHorta(): ZoneBuild {
  const c = new ZoneCtx('horta', 18, 18, G);
  const PX = 16, PY = 16;
  terrace(c, PX, PY, (x, y) => (smooth2(x, y, 26, 91) > 0.55 ? MAT.earth : hash3(x >> 1, y >> 1, 0, 43) < 0.006 ? MAT.flowerWhite : MAT.grass), { y: [8, 10] });
  stairsY(c, 8, PY);
  // muro de piedra con musgo al fondo
  const muro = c.add('muro', true);
  for (let i = 0; i < 16 * T; i++)
    for (let z = G; z < G + 30; z++)
      for (let d = 0; d < 4; d++) {
        const mossy = hash3(i >> 1, z >> 1, d, 33) < (z > G + 18 ? 0.35 : 0.12);
        c.w.set(i, 3 * T - 1 - d, z, z >= G + 28 ? MAT.curb : mossy ? MAT.moss : MAT.rubble, muro);
      }
  c.objects[muro - 1].box = [0, 0, G, 16 * T, 3 * T, G + 30];
  // cobertizo de herramientas, valla, bancales y espantapájaros
  shed(c.w, 4 * T, 3 * T + 4, G, c.add('cobertizo', true));
  c.shelters.push([4, 5, 7, 6]);
  fence(c.w, 3 * T - 2, 6 * T, G, 9 * T, 'y', c.add('valla', false));
  bancal(c, 8 * T, 4 * T, 2 * T, T + 4, 'col', 1);
  bancal(c, 11 * T, 4 * T, 2 * T, T + 4, 'tomate', 2);
  bancal(c, 8 * T, 7 * T, 2 * T, T + 4, 'calabaza', 3);
  bancal(c, 11 * T, 7 * T, 2 * T, T + 4, 'lechuga', 4);
  scarecrow(c, 14 * T + 4, 6 * T);
  tree(c.w, 4 * T + 8, 12 * T, G, c.add('arbol', true), 811, 1);
  flowerbed(c.w, 9 * T, 11 * T, G, 2 * T, T, c.add('parterre', false), 812);
  let s = 820;
  for (const [x, y, r] of [[14, 12.5, 14], [6.5, 9.5, 10], [13, 10, 9]] as const) tallGrass(c.w, x * T, y * T, G, r, c.add('hierba', false), s++);
  bench(c.w, 11 * T + 4, 13 * T + 6, G, 'x', c.add('banco', false), -1);
  c.benches.push([11, 13]);
  const lp = lamp(c.w, 14 * T + 8, 9 * T + 8, G, c.add('farola', false));
  c.lights.push({ x: lp[0], y: lp[1], z: lp[2], kind: 'lamp' });
  return c.finish([11, 10]);
}
