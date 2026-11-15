// Todas las zonas se pueden recorrer: desde cada salida se llega a las demás salidas, al punto
// de aparición, a las casas de los animales y (en la calle) al portal. Así ningún escalón demasiado
// alto vuelve a dejar al jugador encerrado.
import { describe, it, expect } from 'vitest';
import { buildPlaza } from '../art/zones/plaza.ts';
import { buildCalle, buildParque, buildMercado, buildDescampado, buildPuerto } from '../art/zones/barrio.ts';
import { ZONES, type ZoneId } from '../src/world/zones.ts';
import { findPath, nearestWalkable, type Grid } from '../src/world/path.ts';

const BUILDERS: Record<ZoneId, () => ReturnType<typeof buildPlaza>> = {
  plaza: buildPlaza, calle: buildCalle, parque: buildParque, mercado: buildMercado, descampado: buildDescampado, puerto: buildPuerto,
};

describe('zonas transitables', () => {
  for (const id of Object.keys(BUILDERS) as ZoneId[]) {
    it(`${id}: todo conectado en ambos sentidos`, () => {
      const b = BUILDERS[id]();
      const g: Grid = { w: b.tilesW, h: b.tilesH, walk: b.walk, height: b.height, edges: b.edges };
      const def = ZONES[id];
      const pts: [string, number, number][] = [];
      const add = (name: string, x: number, y: number) => {
        const p = nearestWalkable(g, x, y);
        expect(p, `${name} sin casilla transitable cerca`).not.toBeNull();
        pts.push([name, p![0], p![1]]);
      };
      add('aparición', b.spawn[0], b.spawn[1]);
      add('entrada', def.entry[0], def.entry[1]);
      def.homes.forEach((h, i) => add(`casa ${i}`, h[0], h[1]));
      for (const ex of def.exits) {
        add(`salida a ${ex.to}`, Math.floor((ex.r[0] + ex.r[2]) / 2), Math.floor((ex.r[1] + ex.r[3]) / 2));
        const back = ZONES[ex.to].exits.find((e) => e.to === id)!;
        // al llegar desde ex.to se aparece en back.spawn
        add(`llegada desde ${ex.to}`, back.spawn[0], back.spawn[1]);
      }
      if (def.portal) add('portal', Math.floor(def.portal[0] / 16), Math.floor(def.portal[1] / 16));
      const [, sx, sy] = pts[0];
      for (const [name, x, y] of pts.slice(1)) {
        expect(findPath(g, sx, sy, x, y), `aparición → ${name}`).not.toBeNull();
        expect(findPath(g, x, y, sx, sy), `${name} → aparición`).not.toBeNull();
      }
    });
  }
});
