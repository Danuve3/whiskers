import { describe, it, expect } from 'vitest';
import { generateAnimal } from '../src/sim/model.ts';
import { feedFromFeeders, serve, SERVINGS, type PlacedFeeder } from '../src/sim/feeders.ts';
import { applyOffline } from '../src/sim/offline.ts';

const H = 3_600_000;
const mk = (zone: string, hunger: number, thirst = 1) => {
  const a = generateAnimal(7, { zone, used: [], now: 0, home: [5, 5] });
  a.hunger = hunger;
  a.thirst = thirst;
  return a;
};

describe('comederos', () => {
  it('cada ración gasta 1/8 de la reserva y alimenta', () => {
    const f: PlacedFeeder = { id: 'comedero', zone: 'calle' };
    const a = mk('calle', 0.1);
    expect(serve(f, a)).toBe(true);
    expect(a.hunger).toBeCloseTo(0.5);
    expect(f.fill).toBeCloseTo(1 - 1 / SERVINGS);
  });
  it('vacío no sirve nada', () => {
    const f: PlacedFeeder = { id: 'comedero', zone: 'calle', fill: 0 };
    const a = mk('calle', 0.1);
    expect(serve(f, a)).toBe(false);
    expect(a.hunger).toBeCloseTo(0.1);
  });
  it('solo alimenta a los de su zona y se agota', () => {
    const f: PlacedFeeder = { id: 'comedero', zone: 'calle' };
    const here = Array.from({ length: 6 }, () => mk('calle', 0.05));
    const there = mk('plaza', 0.05);
    const used = feedFromFeeders([...here, there], [f]);
    expect(used).toBe(SERVINGS);
    expect(f.fill).toBeCloseTo(0);
    expect(there.hunger).toBeCloseTo(0.05);
  });
  it('el bebedero quita la sed, no el hambre', () => {
    const f: PlacedFeeder = { id: 'bebedero', zone: 'calle' };
    const a = mk('calle', 0.1, 0.1);
    feedFromFeeders([a], [f]);
    expect(a.thirst).toBeGreaterThanOrEqual(0.5);
    expect(a.hunger).toBeCloseTo(0.1);
  });
  it('mientras no estás, los comederos sirven raciones', () => {
    const a = mk('calle', 0.9);
    const r = applyOffline([a], 0, 30 * H, 0, [{ id: 'comedero', zone: 'calle' }]);
    expect(r.served).toBeGreaterThan(0);
    expect(a.hunger).toBeGreaterThanOrEqual(0.5);
  });
});
