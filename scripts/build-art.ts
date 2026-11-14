// Pipeline de arte: genera iconos PWA, atlas de escenario (vóxeles → sprites) y metadatos.
// Salida en public/gen/ (no versionado; entra en el precache de la PWA).
import { writeFileSync, mkdirSync } from 'node:fs';
import { writePNG } from './lib/png.ts';
import { renderIcon } from '../art/icons.ts';
import { buildPlaza } from '../art/zones/plaza.ts';
import { buildCalle, buildParque, buildMercado, buildDescampado, buildPuerto } from '../art/zones/barrio.ts';
import { renderZone } from '../art/zoneRender.ts';
import { packAtlas, spriteRGBA } from '../art/output.ts';

const OUT = new URL('../public/gen/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const log = (m: string) => console.log(`[art] ${m}`);

function icons() {
  for (const [name, size, mask] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['favicon-64.png', 64, false],
  ] as const) {
    const ic = renderIcon(size, mask);
    writePNG(OUT + name, { width: size, height: size, data: ic.data });
  }
}

function zone(build: () => ReturnType<typeof buildPlaza>) {
  const t0 = Date.now();
  const z = build();
  log(`zona ${z.name} modelada en ${Date.now() - t0} ms`);
  const zs = renderZone(z, log);
  const items: Parameters<typeof packAtlas>[0] = [];
  for (const g of zs.ground) {
    items.push({ name: g.name, s: g.s, layer: 'px' });
    if (g.s.snow) items.push({ name: g.name + '@nieve', s: g.s, layer: 'snow' });
  }
  for (const o of zs.objects) {
    items.push({ name: o.name, s: o.s, layer: 'px' });
    if (o.s.night) items.push({ name: o.name + '@noche', s: o.s, layer: 'night' });
    if (o.s.snow) items.push({ name: o.name + '@nieve', s: o.s, layer: 'snow' });
  }
  const { pages, entries } = packAtlas(items, 2048);
  const files: string[] = [];
  pages.forEach((p, i) => {
    const f = `${z.name}-${i}.png`;
    writePNG(OUT + f, { width: p.w, height: p.h, data: spriteRGBA(p.px, p.w, p.h) });
    files.push(f);
  });
  const sprites: Record<string, number[]> = {};
  for (const e of entries) sprites[e.name] = [e.page, e.x, e.y, e.w, e.h, e.ox, e.oy];
  const json = {
    atlas: files,
    sprites,
    zone: {
      name: z.name, tilesW: z.tilesW, tilesH: z.tilesH,
      ground: zs.ground.map((g) => g.name),
      objects: zs.objects.filter((o) => !o.variant).map((o) => {
        const src = z.objects.find((x) => x.id === o.id)!;
        const seasons = zs.objects.filter((v) => v.id === o.id && v.variant).map((v) => v.variant!);
        return { sprite: o.name, night: o.s.night ? o.name + '@noche' : null, snow: o.s.snow ? o.name + '@nieve' : null, seasons, box: src.box, occluder: src.occluder, kind: src.name };
      }),
      lights: z.lights, smoke: z.smoke, steam: z.steam, lines: z.lines, shelters: z.shelters, fountains: z.fountains,
      height: z.height, walk: z.walk, spawn: z.spawn, benches: z.benches,
    },
  };
  writeFileSync(OUT + `${z.name}.json`, JSON.stringify(json));
  log(`zona ${z.name}: ${pages.length} página(s) de atlas, ${entries.length} sprites, ${Date.now() - t0} ms`);
}

const t0 = Date.now();
icons();
const only = process.argv[2];
for (const b of [buildPlaza, buildCalle, buildParque, buildMercado, buildDescampado, buildPuerto]) {
  if (only && !b.name.toLowerCase().includes(only)) continue;
  zone(b);
}
log(`listo en ${Date.now() - t0} ms`);
