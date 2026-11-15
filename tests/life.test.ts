import { describe, it, expect } from 'vitest';
import { generateAnimal, type AnimalData } from '../src/sim/model.ts';
import { bond, affinity, bestFriend, FRIENDS, routineFor, inRoutine, pickRequest, pickMother, makeLitter, growth, stageName, adoptionCandidate, nextTrick, letterText, DAY_MS } from '../src/sim/life.ts';

const mk = (seed: number, over: Partial<AnimalData> = {}): AnimalData => ({ ...generateAnimal(seed, { zone: 'calle', used: [], now: 0, home: [5, 5] }), ...over });

describe('vida propia', () => {
  it('pasar tiempo juntos crea amistades (y se avisa una vez)', () => {
    const a = mk(1), b = mk(2);
    const before = affinity(a, b);
    let became = 0;
    for (let i = 0; i < 1200 && affinity(a, b) < 1; i++) if (bond(a, b, 1)) became++;
    expect(affinity(a, b)).toBeGreaterThan(before);
    expect(became).toBe(1);
    expect(bestFriend(a, [a, b])?.id).toBe(b.id);
    expect(affinity(b, a)).toBeGreaterThanOrEqual(FRIENDS);
  });
  it('la costumbre es siempre la misma para cada animal y respeta su horario', () => {
    const spots = [{ tile: [3, 4] as [number, number], place: 'junto al banco' }, { tile: [8, 9] as [number, number], place: 'en el portal' }];
    const a = mk(5, { schedule: 'noche' });
    const r1 = routineFor(a, spots)!, r2 = routineFor(a, spots)!;
    expect(r1).toEqual(r2);
    expect(r1.from).toBeGreaterThanOrEqual(18);
    expect(inRoutine(r1, r1.from + 0.1)).toBe(true);
    expect(inRoutine(r1, 12)).toBe(false);
  });
  it('solo piden cosas los que ya confían', () => {
    expect(pickRequest(mk(3, { trust: 0.5 }), 0, Math.random)).toBeNull();
    const r = pickRequest(mk(3, { trust: 2.5, hunger: 0.2 }), 0, () => 0.99);
    expect(r?.kind).toBeTruthy();
    expect(r!.until).toBeGreaterThan(0);
  });
  it('camadas: madre de confianza, crías que crecen en dos semanas', () => {
    const mom = mk(9, { trust: 3.5 });
    const now = 100 * DAY_MS;
    expect(pickMother([mom], now, 'primavera', 0, 0.99)).toBeNull(); // la tirada no sale
    const m = pickMother([mom], now, 'primavera', 0, 0.1);
    expect(m?.id).toBe(mom.id);
    expect(pickMother([mom], now, 'primavera', now - DAY_MS, 0.1)).toBeNull(); // camada reciente
    const kids = makeLitter(mom, now, 777, []);
    expect(kids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(kids.map((k) => k.name)).size).toBe(kids.length);
    expect(kids.every((k) => k.breed === mom.breed && k.mother === mom.id)).toBe(true);
    expect(growth(kids[0], now)).toBeCloseTo(0.55);
    expect(growth(kids[0], now + 14 * DAY_MS)).toBe(1);
    expect(stageName(kids[0], now + DAY_MS)).toMatch(/gatito|cachorro/);
    expect(pickMother([mom, ...kids], now + DAY_MS, 'primavera', 0, 0.1)).toBeNull(); // hay crías pequeñas
  });
  it('adopción: solo animales con 5 corazones que conoces desde hace días', () => {
    const now = 30 * DAY_MS;
    const a = mk(11, { trust: 5, metAt: 0 }), b = mk(12, { trust: 4, metAt: 0 });
    expect(adoptionCandidate([b], now, 0)).toBeNull();
    expect(adoptionCandidate([a, b], now, 0)?.id).toBe(a.id);
    expect(adoptionCandidate([a], now, now - DAY_MS)).toBeNull();
    expect(letterText('Nemesio', 'Lúa', 1)).toContain('Nemesio');
  });
  it('trucos: solo perros con 3 corazones, en orden', () => {
    const dog = mk(1, { breed: 'galgo', trust: 3.2 });
    const cat = mk(1, { breed: 'europeo', trust: 5 });
    expect(nextTrick(cat)).toBeNull();
    expect(nextTrick(dog)?.id).toBe('sentarse');
    dog.tricks = ['sentarse'];
    expect(nextTrick(dog)?.id).toBe('pata');
  });
});
