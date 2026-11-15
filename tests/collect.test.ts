import { describe, it, expect } from 'vitest';
import { pickTreasure, setProgress, TREASURES, SETS, VISITORS, visitorData, type WorldNow } from '../src/sim/collect.ts';

const W = (o: Partial<WorldNow> = {}): WorldNow => ({ season: 'otoño', rain: 0, snow: 0, hour: 12, events: [], open: ['calle', 'plaza', 'parque', 'mercado', 'descampado', 'puerto'], ...o });

describe('tesoros y visitantes', () => {
  it('cada colección tiene al menos 4 tesoros y todos tienen dibujo válido', () => {
    for (const S of SETS) expect(TREASURES.filter((t) => t.set === S.id).length).toBeGreaterThanOrEqual(4);
    for (const t of TREASURES) for (const row of t.rows) for (const ch of row) expect(ch === '.' || ch in t.key).toBe(true);
  });
  it('los tesoros salen en su zona y estación', () => {
    for (let i = 0; i < 50; i++) {
      const t = pickTreasure('puerto', W({ season: 'verano' }), {}, Math.random)!;
      expect(t.zones).toContain('puerto');
      expect(t.set).not.toBe('otono');
    }
    const r = pickTreasure('parque', W({ season: 'otoño' }), {}, () => 0)!;
    expect(r.zones).toContain('parque');
  });
  it('prefiere los que aún no tienes', () => {
    const have: Record<string, number> = {};
    for (const t of TREASURES.filter((x) => x.set === 'conchas')) have[t.id] = 1;
    delete have.vieira;
    expect(pickTreasure('puerto', W(), have, () => 0.1)?.id).toBe('vieira');
    expect(setProgress('conchas', have)).toEqual([3, 4]);
  });
  it('visitantes: vienen con su condición y son siempre el mismo animal', () => {
    const lluvia = VISITORS.find((v) => v.id === 'chubasquero')!;
    expect(lluvia.when(W({ rain: 0.8 }))).toBe(true);
    expect(lluvia.when(W({ rain: 0 }))).toBe(false);
    const a = visitorData(lluvia, 0), b = visitorData(lluvia, 999);
    expect(a.id).toBe(b.id);
    expect(a.name).toBe('Charquitos');
    expect(a.visitor).toBe('chubasquero');
  });
});
