import { describe, it, expect } from 'vitest';
import { happeningFor, taskProgress, taskStart, CHALLENGES, seasonKey, PROJECTS } from '../src/sim/rhythm.ts';

describe('ritmo del barrio', () => {
  it('un suceso por día, en zonas abiertas, y nunca el mismo dos días seguidos', () => {
    const open = ['calle', 'plaza', 'parque', 'mercado', 'puerto'];
    for (let d = 20000; d < 20060; d++) {
      const h = happeningFor(d, open);
      expect(open).toContain(h.zone);
      expect(happeningFor(d, open).id).toBe(h.id);
      expect(happeningFor(d + 1, open).id).not.toBe(h.id);
    }
  });
  it('el progreso de una tarea cuenta desde que empieza', () => {
    const task = { stats: ['banos'], n: 2 };
    const start = taskStart(task, { banos: 5 });
    expect(taskProgress(task, { banos: 6 }, start)).toBe(1);
    expect(taskProgress(task, { banos: 9 }, start)).toBe(2);
  });
  it('cada estación tiene su reto con premio exclusivo', () => {
    const ids = new Set(Object.values(CHALLENGES).map((c) => c.reward.kind === 'decor' ? c.reward.id : ''));
    expect(ids.size).toBe(4);
    expect(seasonKey(Date.UTC(2026, 11, 20), 'invierno')).toBe('2027-invierno');
    expect(seasonKey(Date.UTC(2027, 1, 2), 'invierno')).toBe('2027-invierno');
  });
  it('cada proyecto en su zona', () => {
    expect(new Set(PROJECTS.map((p) => p.zone)).size).toBe(PROJECTS.length);
  });
});
