// Render de una zona: capa de suelo troceada y un sprite por objeto (con capa nocturna).
import { rasterize, cleanOrphans, selOut, toSprite, trim, type Sprite, type Box, type RenderOpts } from './voxel/render.ts';
import { MAT } from './voxel/materials.ts';
import type { VoxelWorld } from './voxel/world.ts';
import { hash3 } from './voxel/world.ts';
import type { ZoneBuild } from './zones/plaza.ts';
import { applyDecals } from './decals.ts';

export interface ZoneSprites {
  ground: { name: string; s: Sprite }[];
  objects: { id: number; name: string; s: Sprite; variant?: string }[];
}

const SEASON_REMAPS: [string, NonNullable<RenderOpts['remap']>][] = [
  ['otono', (m, x, y, z) => (m === MAT.leaf ? (hash3(x >> 1, y >> 1, z >> 1, 71) < 0.12 ? 0 : MAT.leafAutumn) : m)],
  ['invierno', (m, x, y, z) => (m === MAT.leaf ? (hash3(x >> 1, y >> 1, z >> 1, 72) < 0.05 ? MAT.leafAutumn : 0) : m)],
  ['primavera', (m, x, y, z) => (m === MAT.leaf && hash3(x >> 1, y >> 1, z >> 1, 73) < 0.14 ? MAT.blossom : m)],
];

function hasLeaves(w: VoxelWorld, b: Box, id: number): boolean {
  for (let z = b[2]; z < b[5]; z += 2)
    for (let y = b[1]; y < b[4]; y += 2)
      for (let x = b[0]; x < b[3]; x += 2) {
        const c = w.cell(x, y, z);
        if (c && c >> 8 === id && (c & 255) === MAT.leaf) return true;
      }
  return false;
}

const CHUNK = 256;

export function litWindow(id: number): boolean {
  if (id >= 250) return true; // farolas, quiosco, farolillos
  return hash3(id, 7, 3, 99) < 0.55;
}

export function renderZone(z: ZoneBuild, log: (m: string) => void): ZoneSprites {
  const w = z.world;
  const t0 = Date.now();
  const gBox: Box = [0, 0, 0, w.sx, w.sy, 64];
  const gr = rasterize(w, { filter: (o) => o === 0, box: gBox });
  cleanOrphans(gr);
  applyDecals(z, 0, gr);
  const gs = toSprite(gr, litWindow);
  log(`suelo ${gs.w}×${gs.h} en ${Date.now() - t0} ms`);
  const ground: ZoneSprites['ground'] = [];
  for (let cy = 0; cy < gs.h; cy += CHUNK)
    for (let cx = 0; cx < gs.w; cx += CHUNK) {
      const W = Math.min(CHUNK, gs.w - cx), H = Math.min(CHUNK, gs.h - cy);
      const px = new Uint8Array(W * H);
      let any = false;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = gs.px[(cy + y) * gs.w + cx + x];
          if (c) { px[y * W + x] = c; any = true; }
        }
      const snow = new Uint8Array(W * H);
      if (gs.snow) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) snow[y * W + x] = gs.snow[(cy + y) * gs.w + cx + x];
      if (any) ground.push({ name: `${z.name}/suelo-${cx / CHUNK}-${cy / CHUNK}`, s: { w: W, h: H, ox: gs.ox + cx, oy: gs.oy + cy, px, night: null, snow } });
    }
  const objects: ZoneSprites['objects'] = [];
  for (const o of z.objects) {
    const t1 = Date.now();
    const b = w.objectBounds(o.id);
    if (!b) continue;
    const one = (remap?: RenderOpts['remap']) => {
      const r = rasterize(w, { filter: (id) => id === o.id, box: b, remap });
      cleanOrphans(r);
      selOut(r, o.name.startsWith('casa') || o.name === 'panaderia' ? 8 : 0);
      applyDecals(z, o.id, r);
      return trim(toSprite(r, litWindow));
    };
    const s = one();
    objects.push({ id: o.id, name: `${z.name}/${o.id}-${o.name}`, s });
    // variantes de estación para lo que tiene hojas
    if (hasLeaves(w, b, o.id)) {
      for (const [season, remap] of SEASON_REMAPS) objects.push({ id: o.id, name: `${z.name}/${o.id}-${o.name}~${season}`, s: one(remap), variant: season });
    }
    if (Date.now() - t1 > 500) log(`${o.name} ${s.w}×${s.h} en ${Date.now() - t1} ms`);
  }
  log(`zona ${z.name} renderizada en ${Date.now() - t0} ms`);
  return { ground, objects };
}
