import { describe, it, expect } from 'vitest';
import { PALETTE, COLOR_NAMES } from '../src/gfx/palette.ts';

describe('paleta', () => {
  it('no supera ~48 colores', () => {
    expect(COLOR_NAMES.length).toBeLessThanOrEqual(48);
    for (const c of Object.values(PALETTE)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
