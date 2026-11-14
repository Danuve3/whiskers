import { describe, it, expect } from 'vitest';
import { generateAnimal, apply, decay, hearts, stage, canDo, pickName, NAMES, trustFloor, TRUST_GRACE_H, type AnimalData } from '../src/sim/model.ts';

const H = 3_600_000;
const base = (seed = 1): AnimalData => generateAnimal(seed, { zone: 'plaza', used: [], now: 0, home: [5, 5] });

describe('generación de animales', () => {
  it('es determinista con la misma semilla', () => {
    expect(base(42)).toEqual(base(42));
  });
  it('no repite nombres mientras haya disponibles', () => {
    const used: string[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      const a = generateAnimal(1000 + i, { zone: 'plaza', used, now: 0, home: [0, 0] });
      expect(used).not.toContain(a.name);
      used.push(a.name);
    }
    expect(new Set(used).size).toBe(NAMES.length);
    // agotados: se añade un ordinal
    const extra = pickName(used, () => 0);
    expect(extra).toMatch(/ II$/);
  });
  it('incluye los nombres obligatorios', () => {
    for (const n of ['Nemesio', 'Fernando', 'Germenegildo', 'Hermenegildo', 'Eustaquio', 'Jaime Alberto', 'Lucáreo', 'Albóndigo']) expect(NAMES).toContain(n);
  });
  it('los raros son muy poco frecuentes y el gato lunar solo sale con luna llena', () => {
    let rares = 0, lunar = 0;
    for (let i = 0; i < 4000; i++) {
      const a = generateAnimal(i, { zone: 'plaza', used: [], now: 0, home: [0, 0] });
      if (a.rare) rares++;
      if (a.rare === 'lunar') lunar++;
    }
    expect(lunar).toBe(0);
    expect(rares / 4000).toBeLessThan(0.02);
    let moon = 0;
    for (let i = 0; i < 4000; i++) if (generateAnimal(i, { zone: 'plaza', used: [], now: 0, home: [0, 0], fullMoon: true, night: true }).rare === 'lunar') moon++;
    expect(moon).toBeGreaterThan(0);
  });
  it('la comida favorita es apropiada para la especie', () => {
    for (let i = 0; i < 200; i++) {
      const a = generateAnimal(i, { zone: 'plaza', used: [], now: 0, home: [0, 0] });
      expect(a.favorite).not.toBe('pienso');
    }
  });
});

describe('confianza', () => {
  it('sube al alimentar y más con la comida favorita', () => {
    const a = base(), b = base();
    a.hunger = b.hunger = 0.2;
    const r1 = apply(a, 'feed', 1, 'pienso');
    const r2 = apply(b, 'feed', 1, b.favorite);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.trustGain).toBeGreaterThan(r1.trustGain);
    expect(r2.favorite).toBe(true);
  });
  it('los tímidos confían más despacio', () => {
    const a = base(), b = base();
    a.personality = 'timido';
    b.personality = 'gloton';
    a.hunger = b.hunger = 0.3;
    expect(apply(a, 'water', 1).trustGain).toBeLessThan(apply(b, 'water', 1).trustGain);
  });
  it('curar exige 3 corazones y una herida', () => {
    const a = base();
    a.injured = true;
    a.trust = 1.5;
    expect(canDo(a, 'heal').ok).toBe(false);
    a.trust = 3.2;
    expect(canDo(a, 'heal').ok).toBe(true);
    expect(apply(a, 'heal', 1).ok).toBe(true);
    expect(a.injured).toBe(false);
    expect(canDo(a, 'heal').ok).toBe(false);
  });
  it('nunca pasa de 5 corazones', () => {
    const a = base();
    for (let i = 0; i < 200; i++) apply(a, 'feed', i, a.favorite);
    expect(a.trust).toBeLessThanOrEqual(5);
    expect(hearts(a)).toBe(5);
    expect(stage(a)).toBe('te-sigue');
  });
  it('las etapas siguen a los corazones', () => {
    const a = base();
    a.trust = 0.2;
    expect(stage(a)).toBe('huye');
    a.trust = 1.1;
    expect(stage(a)).toBe('mira');
    a.trust = 2.5;
    expect(stage(a)).toBe('come-si-te-alejas');
    a.trust = 3;
    expect(stage(a)).toBe('tranquilo');
  });
});

describe('paso del tiempo', () => {
  it('las necesidades bajan muy despacio', () => {
    const a = base();
    a.hunger = 1;
    decay(a, 1, 1 * H);
    expect(a.hunger).toBeGreaterThan(0.9);
    decay(a, 100, 101 * H);
    expect(a.hunger).toBe(0);
  });
  it('la confianza no baja durante el periodo de gracia', () => {
    const a = base();
    a.trust = a.trustMax = 4;
    a.lastCare = 0;
    decay(a, 24, 24 * H);
    expect(a.trust).toBe(4);
  });
  it('baja muy lentamente después y nunca por debajo de la mitad del máximo', () => {
    const a = base();
    a.trust = a.trustMax = 4;
    a.lastCare = 0;
    decay(a, 24, (TRUST_GRACE_H + 24) * H);
    expect(a.trust).toBeLessThan(4);
    expect(a.trust).toBeGreaterThan(3.8);
    for (let d = 0; d < 400; d++) decay(a, 24, (TRUST_GRACE_H + 48 + d * 24) * H);
    expect(a.trust).toBe(trustFloor(a));
    expect(a.trust).toBe(2);
  });
});
