// Utilidades de salida: sprite indexado → RGBA, atlas por estantes.
import { INDEX_RGB } from '../src/gfx/palette.ts';
import type { Sprite } from './voxel/render.ts';

export function spriteRGBA(px: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = px[i];
    if (!c) continue;
    const rgb = INDEX_RGB[c];
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export interface AtlasEntry {
  name: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export interface AtlasPage {
  w: number;
  h: number;
  px: Uint8Array;
}

/** Empaquetado por estantes en páginas de `size`×altura variable. */
export function packAtlas(items: { name: string; s: Sprite; layer: 'px' | 'night' | 'snow' }[], size = 2048): { pages: AtlasPage[]; entries: AtlasEntry[] } {
  const sorted = items.filter((i) => i.s.w > 0).sort((a, b) => b.s.h - a.s.h);
  const pages: { shelves: { y: number; h: number; x: number }[]; height: number; placed: { it: (typeof items)[0]; x: number; y: number }[] }[] = [];
  const entries: AtlasEntry[] = [];
  const MAXH = size;
  for (const it of sorted) {
    const w = it.s.w + 2, h = it.s.h + 2;
    let done = false;
    for (let p = 0; p < pages.length && !done; p++) {
      const pg = pages[p];
      for (const sh of pg.shelves)
        if (h <= sh.h && sh.x + w <= size) {
          pg.placed.push({ it, x: sh.x + 1, y: sh.y + 1 });
          entries.push({ name: it.name, page: p, x: sh.x + 1, y: sh.y + 1, w: it.s.w, h: it.s.h, ox: it.s.ox, oy: it.s.oy });
          sh.x += w;
          done = true;
          break;
        }
      if (!done && pg.height + h <= MAXH) {
        pg.shelves.push({ y: pg.height, h, x: w });
        pg.placed.push({ it, x: 1, y: pg.height + 1 });
        entries.push({ name: it.name, page: p, x: 1, y: pg.height + 1, w: it.s.w, h: it.s.h, ox: it.s.ox, oy: it.s.oy });
        pg.height += h;
        done = true;
      }
    }
    if (!done) {
      pages.push({ shelves: [{ y: 0, h, x: w }], height: h, placed: [{ it, x: 1, y: 1 }] });
      entries.push({ name: it.name, page: pages.length - 1, x: 1, y: 1, w: it.s.w, h: it.s.h, ox: it.s.ox, oy: it.s.oy });
    }
  }
  const outPages: AtlasPage[] = pages.map((pg) => {
    const H = Math.max(4, pg.height);
    const px = new Uint8Array(size * H);
    for (const pl of pg.placed) {
      const src = pl.it.layer === 'px' ? pl.it.s.px : pl.it.layer === 'night' ? pl.it.s.night! : pl.it.s.snow!;
      for (let y = 0; y < pl.it.s.h; y++)
        for (let x = 0; x < pl.it.s.w; x++) {
          const c = src[y * pl.it.s.w + x];
          if (c) px[(pl.y + y) * size + pl.x + x] = c;
        }
    }
    return { w: size, h: H, px };
  });
  return { pages: outPages, entries };
}
