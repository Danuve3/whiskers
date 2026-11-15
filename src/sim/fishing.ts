// Pesca en el espigón: qué pica depende de la hora, la marea, el tiempo y la estación.
// Puro (sin DOM) para poder probarlo.
import type { ColorName } from '../gfx/palette.ts';
import type { Season } from './calendar.ts';
import type { FoodId } from './model.ts';

export type Tide = 'alta' | 'media' | 'baja';
/** Marea semidiurna (ciclo de 12 h 25 min), anclada a una pleamar conocida. */
export function tideAt(now: number): { tide: Tide; level: number } {
  const P = 12.4206 * 3_600_000;
  const ref = Date.UTC(2026, 0, 1, 3, 10); // pleamar de referencia
  const level = Math.cos(((now - ref) / P) * Math.PI * 2);
  return { tide: level > 0.35 ? 'alta' : level < -0.35 ? 'baja' : 'media', level };
}

export interface FishCtx {
  hour: number;
  rain: number;
  season: Season;
  tide: Tide;
}

export interface FishDef {
  id: string;
  name: string;
  text: string;
  /** peso relativo cuando se dan sus condiciones */
  weight: number;
  /** segundos que hay para tirar cuando pica */
  window: number;
  when?: (c: FishCtx) => boolean;
  /** comida que da (para los gatos) */
  food?: { id: FoodId; n: number };
  rows: string[];
  key: Record<string, ColorName>;
}

const night = (c: FishCtx) => c.hour >= 21 || c.hour < 6.5;
const dawnDusk = (c: FishCtx) => (c.hour >= 6 && c.hour < 9.5) || (c.hour >= 18.5 && c.hour < 22);
export const FISH: FishDef[] = [
  { id: 'sardina', name: 'Sardina', text: 'La de siempre, plateada y nerviosa.', weight: 10, window: 1.2, food: { id: 'sardinas', n: 1 },
    rows: ['..kkkkk.k', '.kSswwwkSk', 'kwSSSSSSSk', '.kkkkkkk.k'], key: { k: 'water1', S: 'water3', s: 'ink', w: 'cal4' } },
  { id: 'xurelo', name: 'Jurel (xurelo)', text: 'Pica de día, con ganas.', weight: 6, window: 1.1, food: { id: 'sardinas', n: 1 }, when: (c) => !night(c),
    rows: ['..kkkkkk.k', '.kmmmmmmkmk', 'kwmnnnnmmmk', '.kkkkkkk.k'], key: { k: 'stone0', m: 'stone3', n: 'mustard', w: 'cal4' } },
  { id: 'caballa', name: 'Caballa', text: 'Rayas de tigre y prisa: tira rápido.', weight: 5, window: 0.75, food: { id: 'sardinas', n: 2 }, when: (c) => c.season === 'primavera' || c.season === 'verano',
    rows: ['..kkkkkk.k', '.kGgGgGgkGk', 'kwwwwwwwwwk', '.kkkkkkk.k'], key: { k: 'veg0', G: 'veg1', g: 'water2', w: 'cal4' } },
  { id: 'lubina', name: 'Lubina', text: 'Al amanecer o al atardecer y con la marea alta. Una joya.', weight: 2, window: 0.6, food: { id: 'sardinas', n: 3 }, when: (c) => c.tide === 'alta' && dawnDusk(c),
    rows: ['...kkkkkk.k', '.kkmmmmmmkmk', 'kwnmmmmmmmmk', '.kkwwwwwwk.k', '...kkkkkk..'], key: { k: 'stone0', m: 'stone3', n: 'ink', w: 'cal4' } },
  { id: 'pulpo', name: 'Pulpo', text: 'Sale de noche. Lo devuelves al mar con cuidado.', weight: 2, window: 1.4, when: night,
    rows: ['.kkkk.', 'kRRRRk', 'kRwRwk', 'kRRRRk', 'R.R.R.', '.R.R.R'], key: { k: 'tile0', R: 'rose', w: 'cal4' } },
  { id: 'calamar', name: 'Calamar', text: 'Noches de otoño e invierno, bajo la farola del espigón.', weight: 2, window: 1, when: (c) => night(c) && (c.season === 'otoño' || c.season === 'invierno'),
    rows: ['..kk..', '.kppk.', '.kppk.', 'kpwpwk', '.p.p.p', 'p.p.p.'], key: { k: 'plum', p: 'pink', w: 'cal4' } },
  { id: 'cangrejo', name: 'Cangrejo', text: 'Con la marea baja se esconde entre las piedras.', weight: 4, window: 1.5, when: (c) => c.tide === 'baja',
    rows: ['k.....k', 'rk...kr', '.rrrrr.', 'rrwrwrr', '.r.r.r.'], key: { k: 'tile0', r: 'coral', w: 'cal4' } },
  { id: 'estrella', name: 'Estrella de mar', text: 'Rarísima. Marea baja y mucha suerte.', weight: 0.6, window: 1.5, when: (c) => c.tide === 'baja',
    rows: ['...o...', '..ooo..', 'ooooooo', '.ooOoo.', '.oo.oo.', 'o.....o'], key: { o: 'tile3', O: 'butter' } },
  { id: 'bota', name: 'Bota vieja', text: 'Con lluvia todo el mundo pesca una. Tiene su gracia.', weight: 3, window: 2, when: (c) => c.rain > 0.3,
    rows: ['.kkk..', '.kbbk.', '.kbbk.', '.kbbkk', 'kbbbbbk', 'kkkkkkk'], key: { k: 'wood0', b: 'wood1' } },
];

/** Qué pica ahora (aleatorio con pesos, entre los que se dan en estas condiciones). */
export function pickFish(c: FishCtx, r: () => number): FishDef {
  const pool = FISH.filter((f) => !f.when || f.when(c));
  const total = pool.reduce((a, f) => a + f.weight, 0);
  let x = r() * total;
  for (const f of pool) {
    x -= f.weight;
    if (x <= 0) return f;
  }
  return pool[0];
}
