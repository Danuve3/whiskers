// Pipeline de arte: genera iconos PWA, atlas de escenario (vóxeles → sprites) y metadatos.
// Salida en public/gen/ (no versionado; entra en el precache de la PWA).
import { writePNG } from './lib/png.ts';
import { renderIcon } from '../art/icons.ts';

const OUT = new URL('../public/gen/', import.meta.url).pathname;

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

const t0 = Date.now();
icons();
console.log(`[art] iconos listos (${Date.now() - t0} ms)`);
