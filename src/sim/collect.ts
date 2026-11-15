// Tesoros escondidos por el barrio y sus colecciones; visitantes de temporada.
// Puro (sin DOM): qué aparece dónde y cuándo, y qué premio da cada colección.
import type { ColorName } from '../gfx/palette.ts';
import type { Reward } from './progress.ts';
import type { Season, EventId } from './calendar.ts';
import { generateAnimal, type AnimalData, type Personality } from './model.ts';

export interface WorldNow {
  season: Season;
  rain: number;
  snow: number;
  hour: number;
  events: EventId[];
  /** zonas abiertas */
  open: string[];
}

// ---------------------------------------------------------------- Tesoros
export interface TreasureDef {
  id: string;
  name: string;
  set: string;
  rows: string[];
  key: Record<string, ColorName>;
  zones: string[];
  when?: (w: WorldNow) => boolean;
}
export interface SetDef {
  id: string;
  name: string;
  text: string;
  reward: Reward;
}

export const SETS: SetDef[] = [
  { id: 'conchas', name: 'Conchas del puerto', text: 'Aparecen en el muelle y el espigón.', reward: { kind: 'food', food: 'sardinas', n: 6 } },
  { id: 'otono', name: 'Tesoros de otoño', text: 'Solo en otoño, bajo los árboles.', reward: { kind: 'food', food: 'castanas', n: 6 } },
  { id: 'plumas', name: 'Plumas', text: 'Por todo el barrio, sobre todo por la mañana.', reward: { kind: 'decor', id: 'manta-cuadros', name: 'Manta de cuadros' } },
  { id: 'chapas', name: 'Chapas del barrio', text: 'En la calle, la plaza y el mercado.', reward: { kind: 'food', food: 'atun', n: 5 } },
  { id: 'cachivaches', name: 'Cachivaches del descampado', text: 'Entre los cartones y los palés.', reward: { kind: 'decor', id: 'caseta', name: 'Caseta' } },
  { id: 'flores', name: 'Flores', text: 'En la Alameda y la plaza, cada una en su estación.', reward: { kind: 'food', food: 'pollo', n: 5 } },
];

const T = (id: string, name: string, set: string, zones: string[], rows: string[], key: Record<string, ColorName>, when?: TreasureDef['when']): TreasureDef => ({ id, name, set, zones, rows, key, when });
const ALL = ['calle', 'plaza', 'parque', 'mercado', 'descampado', 'puerto', 'horta'];
const autumn = (w: WorldNow) => w.season === 'otoño';
export const TREASURES: TreasureDef[] = [
  T('vieira', 'Concha de vieira', 'conchas', ['puerto'], ['ooooo', 'oOoOo', '.ooo.', '..o..'], { o: 'tan', O: 'peach' }),
  T('berberecho', 'Berberecho', 'conchas', ['puerto'], ['.ccc.', 'cCcCc', 'cCcCc', '.ccc.'], { c: 'cal3', C: 'cal1' }),
  T('caracola', 'Caracola', 'conchas', ['puerto'], ['..pp.', '.pPpp', 'pPwPp', '.ppp.'], { p: 'pink', P: 'rose', w: 'cal4' }),
  T('cristal', 'Cristal de mar', 'conchas', ['puerto'], ['.gg.', 'gGwg', '.gg.'], { g: 'veg3', G: 'veg2', w: 'cal4' }),
  T('hoja-castano', 'Hoja de castaño', 'otono', ['parque', 'plaza', 'calle'], ['....o', '..ooO', '.oOo.', 'oOo..', 'd....'], { o: 'tile3', O: 'tile2', d: 'wood1' }, autumn),
  T('bellota', 'Bellota', 'otono', ['parque', 'horta'], ['.ddd.', 'dDdDd', '.bbb.', '.bBb.', '..b..'], { d: 'wood1', D: 'wood2', b: 'wood3', B: 'wood4' }, autumn),
  T('erizo', 'Erizo de castaña', 'otono', ['parque', 'mercado'], ['g.g.g', '.ggg.', 'gGbGg', '.ggg.', 'g.g.g'], { g: 'veg3', G: 'veg2', b: 'wood1' }, autumn),
  T('hoja-roja', 'Hoja roja', 'otono', ['parque', 'plaza', 'calle', 'puerto'], ['..rr.', '.rRr.', 'rRrr.', '.rr..', 'd....'], { r: 'coral', R: 'tile1', d: 'wood1' }, autumn),
  T('pluma-paloma', 'Pluma de paloma', 'plumas', ALL, ['....n', '...nm', '..nm.', '.nm..', 'k....'], { n: 'stone3', m: 'stone2', k: 'ink2' }),
  T('pluma-gaviota', 'Pluma de gaviota', 'plumas', ['puerto', 'mercado'], ['....w', '...wc', '..wc.', '.wc..', 'k....'], { w: 'cal4', c: 'stone3', k: 'ink2' }),
  T('pluma-mirlo', 'Pluma de mirlo', 'plumas', ['parque', 'calle', 'plaza'], ['....k', '...kK', '..kK.', '.kK..', 'y....'], { k: 'ink', K: 'ink2', y: 'mustard' }),
  T('pluma-petirrojo', 'Pluma de petirrojo', 'plumas', ['parque'], ['....o', '...or', '..or.', '.ow..', 'k....'], { o: 'tile3', r: 'coral', w: 'cal4', k: 'ink2' }, (w) => w.season === 'otoño' || w.season === 'invierno'),
  T('chapa-roja', 'Chapa roja', 'chapas', ['calle', 'plaza', 'mercado'], ['.kkk.', 'krwrk', 'kwrwk', 'krwrk', '.kkk.'], { k: 'stone1', r: 'coral', w: 'cal4' }),
  T('chapa-verde', 'Chapa verde', 'chapas', ['plaza', 'mercado', 'descampado'], ['.kkk.', 'kgGgk', 'kGwGk', 'kgGgk', '.kkk.'], { k: 'stone1', g: 'veg3', G: 'veg2', w: 'cal4' }),
  T('chapa-azul', 'Chapa azul', 'chapas', ['calle', 'puerto', 'mercado'], ['.kkk.', 'ksSsk', 'kSwSk', 'ksSsk', '.kkk.'], { k: 'stone1', s: 'sky', S: 'water2', w: 'cal4' }),
  T('chapa-dorada', 'Chapa dorada', 'chapas', ['calle', 'plaza', 'mercado'], ['.kkk.', 'kyYyk', 'kYyYk', 'kyYyk', '.kkk.'], { k: 'wood1', y: 'mustard', Y: 'butter' }, (w) => w.hour >= 19 || w.hour < 8),
  T('canica', 'Canica de colores', 'cachivaches', ['descampado'], ['.ss.', 'srSs', 'sSys', '.ss.'], { s: 'water2', S: 'water1', r: 'coral', y: 'mustard' }),
  T('dedal', 'Dedal', 'cachivaches', ['descampado'], ['.mm.', 'mnmn', 'nmnm', 'mmmm'], { m: 'stone3', n: 'stone2' }),
  T('moneda', 'Moneda antigua', 'cachivaches', ['descampado', 'mercado'], ['.yyy.', 'yYkYy', 'yYkYy', '.yyy.'], { y: 'mustard', Y: 'butter', k: 'wood2' }),
  T('llavecita', 'Llavecita', 'cachivaches', ['descampado'], ['.yy....', 'y..yyyy', '.yy..y.'], { y: 'mustard' }),
  T('margarita', 'Margarita', 'flores', ['parque', 'plaza', 'horta'], ['.w.w.', 'wwyww', '.w.w.', '..g..', '..g..'], { w: 'cal4', y: 'mustard', g: 'veg2' }, (w) => w.season === 'primavera' || w.season === 'verano'),
  T('amapola', 'Amapola', 'flores', ['parque', 'horta'], ['.rr.', 'rkRr', '.rr.', '.g..', '.g..'], { r: 'coral', R: 'rose', k: 'ink2', g: 'veg2' }, (w) => w.season === 'primavera' || w.season === 'verano'),
  T('violeta', 'Violeta', 'flores', ['parque', 'plaza'], ['.ll.', 'lLyl', '.ll.', '..g.'], { l: 'lilac', L: 'plum', y: 'mustard', g: 'veg2' }, (w) => w.season === 'primavera'),
  T('camelia', 'Camelia', 'flores', ['parque', 'plaza', 'calle'], ['.pp.', 'pPpP', 'pPPp', '.pp.', '.gg.'], { p: 'pink', P: 'rose', g: 'veg2' }, (w) => w.season === 'invierno' || w.season === 'otoño'),
];

/** Qué tesoro aparece aquí y ahora (con preferencia por los que aún no tienes). */
export function pickTreasure(zone: string, w: WorldNow, have: Record<string, number>, r: () => number): TreasureDef | null {
  const pool = TREASURES.filter((t) => t.zones.includes(zone) && (!t.when || t.when(w)));
  if (!pool.length) return null;
  const missing = pool.filter((t) => !have[t.id]);
  const from = missing.length && r() < 0.7 ? missing : pool;
  return from[Math.floor(r() * from.length)];
}

export function setProgress(set: string, have: Record<string, number>): [number, number] {
  const items = TREASURES.filter((t) => t.set === set);
  return [items.filter((t) => have[t.id]).length, items.length];
}

// ---------------------------------------------------------------- Visitantes de temporada
export type HatId = 'lluvia' | 'marinero' | 'lana' | 'flores' | 'boina';
export interface VisitorDef {
  id: string;
  name: string;
  breed: string;
  variant: number;
  hat: HatId;
  zone: string;
  personality: Personality;
  /** cuándo viene (texto para su ficha) */
  whenText: string;
  when: (w: WorldNow) => boolean;
}
export const VISITORS: VisitorDef[] = [
  { id: 'chubasquero', name: 'Charquitos', breed: 'beagle', variant: 0, hat: 'lluvia', zone: 'plaza', personality: 'travieso', whenText: 'solo viene cuando llueve', when: (w) => w.rain > 0.3 },
  { id: 'marinero', name: 'Capitán', breed: 'bicolor', variant: 1, hat: 'marinero', zone: 'puerto', personality: 'gloton', whenText: 'aparece por el puerto en verano y los días de sol', when: (w) => w.season === 'verano' || (w.rain < 0.1 && w.hour > 10 && w.hour < 19) },
  { id: 'lana', name: 'Copito', breed: 'mastin', variant: 0, hat: 'lana', zone: 'parque', personality: 'carinoso', whenText: 'baja a la Alameda cuando nieva o en pleno invierno', when: (w) => w.snow > 0.2 || w.season === 'invierno' },
  { id: 'flores', name: 'Primavera', breed: 'calico', variant: 0, hat: 'flores', zone: 'parque', personality: 'dormilon', whenText: 'florece con la primavera', when: (w) => w.season === 'primavera' },
  { id: 'boina', name: 'Don Castaño', breed: 'galgo', variant: 1, hat: 'boina', zone: 'mercado', personality: 'timido', whenText: 'se pasea por el mercado en otoño', when: (w) => w.season === 'otoño' && w.rain < 0.5 },
];

/** Datos fijos de un visitante (siempre el mismo animal, que recuerda tu confianza). */
export function visitorData(v: VisitorDef, now: number): AnimalData {
  const seed = 900_000 + VISITORS.indexOf(v) * 101;
  const a = generateAnimal(seed, { zone: v.zone, breeds: [v.breed], used: [], now, home: [10, 10] });
  return { ...a, id: `v-${v.id}`, name: v.name, breed: v.breed, variant: v.variant, personality: v.personality, rare: null, injured: false, visitor: v.id, trust: 1 };
}
