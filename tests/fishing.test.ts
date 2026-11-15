import { describe, it, expect } from 'vitest';
import { pickFish, tideAt, FISH } from '../src/sim/fishing.ts';

describe('pesca', () => {
  it('la marea cambia cada ~6 horas', () => {
    const t0 = Date.UTC(2026, 5, 1, 0, 0);
    const kinds = new Set<string>();
    for (let h = 0; h < 13; h++) kinds.add(tideAt(t0 + h * 3_600_000).tide);
    expect(kinds.has('alta') && kinds.has('baja')).toBe(true);
  });
  it('de noche no pican jureles y sí pulpos o calamares; con marea baja, cangrejos', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickFish({ hour: 23, rain: 0, season: 'otoño', tide: 'baja' }, Math.random).id);
    expect(seen.has('xurelo')).toBe(false);
    expect(seen.has('pulpo') || seen.has('calamar')).toBe(true);
    expect(seen.has('cangrejo')).toBe(true);
  });
  it('todos los peces tienen dibujo válido', () => {
    for (const f of FISH) for (const row of f.rows) for (const ch of row) expect(ch === '.' || ch in f.key).toBe(true);
  });
});
