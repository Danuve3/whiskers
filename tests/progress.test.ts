import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, checkAchievements, tierThreshold, refreshMissions, updateMissions, missionProgress, dayKey, weekKey, NEIGHBORS, errandProgress } from '../src/sim/progress.ts';

describe('logros', () => {
  it('se desbloquean por niveles y no se repiten', () => {
    const levels: Record<string, number> = {};
    const stats = { alimentar: 12 };
    const a = checkAchievements(stats, levels);
    expect(a.filter((x) => x.id === 'alimentar').map((x) => x.tier)).toEqual([0, 1]);
    expect(checkAchievements(stats, levels).length).toBe(0);
    stats.alimentar = 60;
    expect(checkAchievements(stats, levels).map((x) => x.tier)).toEqual([2]);
  });
  it('son infinitos: después de la lista fija se doblan', () => {
    const d = ACHIEVEMENTS.find((x) => x.id === 'alimentar')!;
    expect(tierThreshold(d, 6)).toBe(1000);
    expect(tierThreshold(d, 7)).toBe(2000);
    expect(tierThreshold(d, 10)).toBe(16000);
    const levels: Record<string, number> = {};
    expect(checkAchievements({ alimentar: 5000 }, levels).length).toBe(9);
  });
  it('los secretos y las colecciones cerradas no son infinitos', () => {
    const d = ACHIEVEMENTS.find((x) => x.id === 'razas')!;
    expect(tierThreshold(d, 10)).toBe(Infinity);
  });
  it('cada nivel da una recompensa', () => {
    const r = checkAchievements({ cuidadosLluvia: 1 }, {});
    expect(r[0].reward).toEqual({ kind: 'unlock', id: 'logro-lluvia', name: 'Chubasquero' });
  });
});

describe('misiones', () => {
  it('3 diarias y 2 semanales, deterministas por fecha', () => {
    const now = new Date(2026, 10, 14, 10);
    const a = refreshMissions(undefined, now, {});
    const b = refreshMissions(undefined, new Date(2026, 10, 14, 22), {});
    expect(a.daily.length).toBe(3);
    expect(a.weekly.length).toBe(2);
    expect(a.daily.map((m) => m.id)).toEqual(b.daily.map((m) => m.id));
  });
  it('se renuevan al cambiar el día pero se conservan en el mismo día', () => {
    const st = { alimentar: 5 };
    const a = refreshMissions(undefined, new Date(2026, 10, 14), st);
    a.daily[0].claimed = true;
    const same = refreshMissions(a, new Date(2026, 10, 14, 23), st);
    expect(same.daily[0].claimed).toBe(true);
    const next = refreshMissions(a, new Date(2026, 10, 15), st);
    expect(next.dayKey).toBe(dayKey(new Date(2026, 10, 15)));
    expect(next.daily.every((m) => !m.claimed)).toBe(true);
  });
  it('cuentan desde que empiezan', () => {
    const st: Record<string, number> = { alimentar: 10, agua: 0, caricias: 0, visitasFuente: 0, curar: 0, favoritas: 0, conocidos: 0, fichas: 0 };
    const ms = refreshMissions(undefined, new Date(2026, 10, 14), st);
    const m = ms.daily[0];
    expect(missionProgress(m, st)).toBe(0);
    st[m.stat] += m.n;
    expect(updateMissions(ms, st).map((x) => x.id)).toContain(m.id);
  });
  it('semanas ISO', () => {
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-S1');
    expect(weekKey(new Date(2026, 10, 14))).toBe(weekKey(new Date(2026, 10, 10)));
  });
});

describe('vecinos', () => {
  it('los encargos avanzan desde que se aceptan', () => {
    const nb = NEIGHBORS[0];
    const es = { step: {}, start: { [nb.id]: 3 } };
    const p = errandProgress(es, nb, { agua: 5 });
    expect(p.errand?.stat).toBe('agua');
    expect(p.progress).toBe(2);
  });
});
