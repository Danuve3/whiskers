import { describe, it, expect } from 'vitest';
import { unlockedChapters, whereIs, STORIES, SCHEDULES } from '../src/sim/neighbors.ts';
import { NEIGHBORS } from '../src/sim/progress.ts';

describe('vecinos', () => {
  it('cada vecino tiene historia y rutina', () => {
    for (const n of NEIGHBORS) {
      expect(STORIES[n.id]?.length).toBeGreaterThanOrEqual(3);
      expect(SCHEDULES[n.id]?.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('los capítulos se desbloquean con la amistad (y algunos con proyectos)', () => {
    expect(unlockedChapters('maruxa', { points: 0, talkDay: 0, read: 0 }, {})).toBe(1);
    expect(unlockedChapters('maruxa', { points: 7, talkDay: 0, read: 0 }, {})).toBe(3);
    expect(unlockedChapters('lua', { points: 20, talkDay: 0, read: 0 }, {})).toBe(3);
    expect(unlockedChapters('lua', { points: 20, talkDay: 0, read: 0 }, { refugio: { done: true } })).toBe(4);
  });
  it('a cada hora, como mucho en un sitio', () => {
    expect(whereIs('maruxa', 9)?.zone).toBe('plaza');
    expect(whereIs('maruxa', 15)).toBeNull();
    expect(whereIs('xan', 7)?.activity).toBe('jog');
  });
});
