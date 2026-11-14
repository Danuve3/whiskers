import { describe, it, expect } from 'vitest';
import { applyOffline, offlineHours, OFFLINE_CAP_H } from '../src/sim/offline.ts';
import { generateAnimal } from '../src/sim/model.ts';

const H = 3_600_000;
describe('progreso offline', () => {
  it('tiene tope de 48 horas', () => {
    expect(offlineHours(0, 100 * H)).toBe(OFFLINE_CAP_H);
    expect(offlineHours(0, 5 * H)).toBe(5);
    expect(offlineHours(10 * H, 5 * H)).toBe(0);
  });
  it('las necesidades bajan levemente y llegan animales nuevos', () => {
    const a = generateAnimal(3, { zone: 'calle', used: [], now: 0, home: [0, 0] });
    a.hunger = 1;
    const r = applyOffline([a], 0, 10 * H, 10);
    expect(a.hunger).toBeLessThan(1);
    expect(a.hunger).toBeGreaterThan(0.4);
    expect(r.arrivals).toBe(5);
  });
  it('no llegan más animales de los que caben', () => {
    expect(applyOffline([], 0, 48 * H, 2).arrivals).toBe(2);
  });
  it('recuerda a los amigos que te echaron de menos', () => {
    const a = generateAnimal(4, { zone: 'calle', used: [], now: 0, home: [0, 0] });
    a.trust = 4;
    a.hunger = 0.7;
    expect(applyOffline([a], 0, 20 * H, 0).missed).toContain(a.name);
  });
});
