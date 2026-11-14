// Render de una zona: capa de suelo troceada y un sprite por objeto (con capa nocturna).
import { rasterize, cleanOrphans, selOut, toSprite, trim, type Sprite, type Box } from './voxel/render.ts';
import { hash3 } from './voxel/world.ts';
import type { ZoneBuild } from './zones/plaza.ts';
import { applyDecals } from './decals.ts';

export interface ZoneSprites {
  ground: { name: string; s: Sprite }[];
  objects: { id: number; name: string; s: Sprite }[];
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
      if (any) ground.push({ name: `${z.name}/suelo-${cx / CHUNK}-${cy / CHUNK}`, s: { w: W, h: H, ox: gs.ox + cx, oy: gs.oy + cy, px, night: null } });
    }
  const objects: ZoneSprites['objects'] = [];
  for (const o of z.objects) {
    const t1 = Date.now();
    const b = w.objectBounds(o.id);
    if (!b) continue;
    const r = rasterize(w, { filter: (id) => id === o.id, box: b });
    cleanOrphans(r);
    selOut(r, o.name.startsWith('casa') || o.name === 'panaderia' ? 8 : 0);
    applyDecals(z, o.id, r);
    const s = trim(toSprite(r, litWindow));
    objects.push({ id: o.id, name: `${z.name}/${o.id}-${o.name}`, s });
    if (Date.now() - t1 > 500) log(`${o.name} ${s.w}×${s.h} en ${Date.now() - t1} ms`);
  }
  log(`zona ${z.name} renderizada en ${Date.now() - t0} ms`);
  return { ground, objects };
}
