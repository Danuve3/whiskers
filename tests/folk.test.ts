import { describe, it, expect } from 'vitest';
import { folkScene } from '../src/world/folk.ts';

describe('gente del barrio por horas', () => {
  it('cola en la panadería solo por la mañana y en la plaza', () => {
    expect(folkScene('plaza', 8)?.kind).toBe('cola');
    expect(folkScene('plaza', 12)).toBeNull();
    expect(folkScene('calle', 8)).toBeNull();
  });
  it('tertulia a la puerta del bar del puerto de noche', () => {
    expect(folkScene('puerto', 22)?.kind).toBe('bar');
    expect(folkScene('puerto', 0.5)?.kind).toBe('bar');
    expect(folkScene('puerto', 15)).toBeNull();
  });
  it('los sitios de espera son distintos', () => {
    for (const s of [folkScene('plaza', 9)!, folkScene('puerto', 21)!]) {
      expect(new Set(s.spots.map((p) => p.join(','))).size).toBe(s.spots.length);
      expect(s.max).toBeLessThanOrEqual(s.spots.length);
    }
  });
});
