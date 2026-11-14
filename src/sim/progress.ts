// Progreso: logros escalonados infinitos (y secretos), misiones diarias y semanales,
// regalos de los animales y encargos de los vecinos. Puro, para probarlo con Vitest.
import type { FoodId } from './model.ts';
import { rng } from './model.ts';

export type Stats = Record<string, number>;

// ---------------------------------------------------------------- Recompensas
export type Reward =
  | { kind: 'food'; food: FoodId; n: number }
  | { kind: 'unlock'; id: string; name: string }
  | { kind: 'decor'; id: string; name: string };

export function rewardText(r: Reward): string {
  if (r.kind === 'food') return `${r.n} × ${FOOD_NAMES[r.food]}`;
  return r.name;
}

const FOOD_NAMES: Record<FoodId, string> = {
  pienso: 'pienso', atun: 'latas de atún', sardinas: 'sardinas', jamon: 'jamón york', galletas: 'galletas para perro', castanas: 'castañas', pollo: 'pollo cocido',
};

// ---------------------------------------------------------------- Logros
export interface AchievementDef {
  id: string;
  stat: string;
  name: string;
  /** descripción con {n} */
  desc: string;
  icon: string;
  secret?: boolean;
  /** umbrales fijos; después se generan doblando el último */
  tiers?: number[];
  /** recompensas por nivel (si falta, comida especial) */
  rewards?: Record<number, Reward>;
}

const STD = [1, 10, 50, 100, 250, 500, 1000];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'alimentar', stat: 'alimentar', name: 'Cuencos llenos', desc: 'Da de comer {n} {vez|veces}', icon: 'comida', rewards: { 1: { kind: 'unlock', id: 'logro-cuidador-10', name: 'Pelo lila' } } },
  { id: 'agua', stat: 'agua', name: 'Agua fresquita', desc: 'Da agua {n} {vez|veces}', icon: 'agua', tiers: [1, 5, 25, 100, 250, 500, 1000], rewards: { 2: { kind: 'unlock', id: 'logro-agua-25', name: 'Pelo azul' } } },
  { id: 'curar', stat: 'curar', name: 'Tiritas de colores', desc: 'Cura {n} {rasguño|rasguños}', icon: 'tirita', tiers: [1, 5, 20, 50, 100, 250] },
  { id: 'caricias', stat: 'caricias', name: 'Mano de santo', desc: 'Acaricia {n} {vez|veces}', icon: 'mano' },
  { id: 'conocidos', stat: 'conocidos', name: 'Vecindario', desc: 'Conoce a {n} {animal|animales}', icon: 'album', tiers: [1, 5, 10, 25, 50, 100] },
  { id: 'razas', stat: 'razas', name: 'Enciclopedia callejera', desc: 'Conoce {n} {raza distinta|razas distintas}', icon: 'album', tiers: [3, 8, 15, 20, 26], rewards: { 4: { kind: 'decor', id: 'manta-cuadros', name: 'Manta de cuadros' } } },
  { id: 'confianza', stat: 'confianzaMax', name: 'Amigos de verdad', desc: '{n} {animal|animales} con 5 corazones', icon: 'corazon', tiers: [1, 3, 5, 10, 20, 40] },
  { id: 'regalos', stat: 'regalos', name: 'El portal de los tesoros', desc: 'Recibe {n} {regalo|regalos}', icon: 'logros', tiers: [1, 5, 20, 50, 100], rewards: { 1: { kind: 'unlock', id: 'logro-regalos-5', name: 'Ropa lila' } } },
  { id: 'misiones', stat: 'misiones', name: 'Recados del día', desc: 'Completa {n} {misión|misiones}', icon: 'misiones', tiers: [1, 10, 30, 75, 150] },
  { id: 'raros', stat: 'raros', name: 'Rarezas del barrio', desc: 'Conoce {n} {animal raro|animales raros}', icon: 'luna', tiers: [1, 2, 3, 5, 10] },
  { id: 'eventos', stat: 'eventos', name: 'Fiestas del barrio', desc: 'Vive {n} {fiesta|fiestas}', icon: 'logros', tiers: [1, 3, 6, 12, 24] },
  { id: 'lluvia', stat: 'cuidadosLluvia', name: 'Que llueva, que llueva', desc: 'Cuida a {n} {animal|animales} bajo la lluvia', icon: 'lluvia', tiers: [1, 10, 50, 200], rewards: { 0: { kind: 'unlock', id: 'logro-lluvia', name: 'Chubasquero' } } },
  { id: 'sol', stat: 'cuidadosSol', name: 'Día de sol', desc: 'Cuida a {n} {animal|animales} con sol', icon: 'sol', tiers: [5, 50, 200], rewards: { 0: { kind: 'unlock', id: 'logro-sol', name: 'Gafas de sol' } } },
  { id: 'noche', stat: 'cuidadosNoche', name: 'Turno de noche', desc: 'Cuida a {n} {animal|animales} de noche', icon: 'luna', tiers: [1, 10, 50, 200] },
  { id: 'pesca', stat: 'pesca', name: 'Sardinas frescas', desc: 'Pesca {n} {sardina|sardinas}', icon: 'comida', tiers: [1, 10, 50, 200], rewards: { 0: { kind: 'unlock', id: 'logro-pesca-1', name: 'Gorro de pescador' } } },
  { id: 'laser', stat: 'laser', name: 'Punto rojo', desc: 'Juega {n} {vez|veces} con el láser', icon: 'mano', tiers: [1, 10, 50] },
  // secretos con humor
  { id: 'calcetin', stat: 'calcetines', name: 'Pies fríos', desc: 'Te han robado {n} {calcetín|calcetines}', icon: 'calcetin', secret: true, tiers: [1, 10, 50] },
  { id: 'nombres', stat: 'renombres', name: 'Registro civil', desc: 'Cambia el nombre a {n} {animal|animales}', icon: 'ficha', secret: true, tiers: [1, 5] },
  { id: 'hermenegildos', stat: 'hermenegildos', name: '¿Germenegildo o Hermenegildo?', desc: 'Conoce a los dos', icon: 'album', secret: true, tiers: [2] },
  { id: 'madrugada', stat: 'cuidadosMadrugada', name: 'Insomnio gatuno', desc: 'Da de comer a las tantas de la madrugada', icon: 'luna', secret: true, tiers: [1] },
  { id: 'albondigo', stat: 'albondigoJamon', name: 'Albóndigo come jamón', desc: 'Dale jamón york a Albóndigo', icon: 'comida', secret: true, tiers: [1] },
];

/** Rellena {n} y elige singular/plural en {uno|varios}. */
export function fmt(desc: string, n: number): string {
  return desc.replace('{n}', String(n)).replace(/\{([^|}]*)\|([^}]*)\}/g, (_m, a, b) => (n === 1 ? a : b));
}

/** Umbral del nivel `k` (0, 1, 2…): infinitos, doblando después de la lista fija. */
export function tierThreshold(def: AchievementDef, k: number): number {
  const t = def.tiers ?? STD;
  if (k < t.length) return t[k];
  if (def.secret || def.id === 'razas' || def.id === 'hermenegildos') return Infinity;
  return t[t.length - 1] * 2 ** (k - t.length + 1);
}

export function tierReward(def: AchievementDef, k: number): Reward {
  const r = def.rewards?.[k];
  if (r) return r;
  const foods: FoodId[] = ['atun', 'jamon', 'galletas', 'pollo', 'sardinas'];
  return { kind: 'food', food: foods[(k + def.id.length) % foods.length], n: 1 + Math.min(4, k) };
}

export interface Unlocked {
  id: string;
  tier: number;
  name: string;
  desc: string;
  reward: Reward;
}

/** Comprueba logros: devuelve los niveles nuevos y actualiza `levels`. */
export function checkAchievements(stats: Stats, levels: Record<string, number>): Unlocked[] {
  const out: Unlocked[] = [];
  for (const d of ACHIEVEMENTS) {
    let k = levels[d.id] ?? 0;
    const v = stats[d.stat] ?? 0;
    while (v >= tierThreshold(d, k)) {
      const n = tierThreshold(d, k);
      out.push({ id: d.id, tier: k, name: d.name + (k > 0 ? ` ${roman(k + 1)}` : ''), desc: fmt(d.desc, n), reward: tierReward(d, k) });
      k++;
    }
    levels[d.id] = k;
  }
  return out;
}

function roman(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, c] of t) while (n >= v) {
    s += c;
    n -= v;
  }
  return s;
}

// ---------------------------------------------------------------- Misiones
export interface MissionDef {
  id: string;
  stat: string;
  n: number;
  text: string;
}

export interface Mission extends MissionDef {
  start: number; // valor de la estadística al empezar
  done: boolean;
  claimed: boolean;
  reward: Reward;
}

const DAILY: MissionDef[] = [
  { id: 'd-comer', stat: 'alimentar', n: 3, text: 'Da de comer 3 veces' },
  { id: 'd-agua', stat: 'agua', n: 2, text: 'Pon agua fresca 2 veces' },
  { id: 'd-caricia', stat: 'caricias', n: 1, text: 'Acaricia a un animal' },
  { id: 'd-fuente', stat: 'visitasFuente', n: 1, text: 'Date un paseo hasta la fuente' },
  { id: 'd-curar', stat: 'curar', n: 1, text: 'Pon una tirita a alguien' },
  { id: 'd-favorita', stat: 'favoritas', n: 1, text: 'Acierta con la comida favorita de alguien' },
  { id: 'd-conocer', stat: 'conocidos', n: 1, text: 'Conoce a un animal nuevo' },
  { id: 'd-ficha', stat: 'fichas', n: 2, text: 'Mira la ficha de 2 animales' },
];
const WEEKLY: MissionDef[] = [
  { id: 's-comer', stat: 'alimentar', n: 20, text: 'Da de comer 20 veces esta semana' },
  { id: 's-corazones', stat: 'corazonesGanados', n: 3, text: 'Gana 3 corazones de confianza' },
  { id: 's-regalos', stat: 'regalos', n: 2, text: 'Recoge 2 regalos en el portal' },
  { id: 's-agua', stat: 'agua', n: 12, text: 'Pon agua 12 veces esta semana' },
  { id: 's-curar', stat: 'curar', n: 3, text: 'Cura 3 rasguños' },
];

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekKey(d: Date): string {
  // semana ISO (lunes)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-S${w}`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function makeMissions(key: string, weekly: boolean, stats: Stats): Mission[] {
  const r = rng(hashStr(key));
  const pool = [...(weekly ? WEEKLY : DAILY)];
  const out: Mission[] = [];
  const n = weekly ? 2 : 3;
  for (let i = 0; i < n && pool.length; i++) {
    const def = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const foods: FoodId[] = ['atun', 'jamon', 'galletas', 'pollo'];
    out.push({ ...def, start: stats[def.stat] ?? 0, done: false, claimed: false, reward: { kind: 'food', food: foods[Math.floor(r() * foods.length)], n: weekly ? 3 : 1 } });
  }
  return out;
}

export interface MissionState {
  dayKey: string;
  weekKey: string;
  daily: Mission[];
  weekly: Mission[];
}

/** Renueva las misiones si cambió el día o la semana real. */
export function refreshMissions(ms: MissionState | undefined, now: Date, stats: Stats): MissionState {
  const dk = dayKey(now), wk = weekKey(now);
  const out: MissionState = ms ? { ...ms } : { dayKey: '', weekKey: '', daily: [], weekly: [] };
  if (out.dayKey !== dk) {
    out.dayKey = dk;
    out.daily = makeMissions('d' + dk, false, stats);
  }
  if (out.weekKey !== wk) {
    out.weekKey = wk;
    out.weekly = makeMissions('w' + wk, true, stats);
  }
  return out;
}

export function missionProgress(m: Mission, stats: Stats): number {
  return Math.min(m.n, (stats[m.stat] ?? 0) - m.start);
}

/** Marca como hechas las misiones cumplidas; devuelve las recién completadas. */
export function updateMissions(ms: MissionState, stats: Stats): Mission[] {
  const out: Mission[] = [];
  for (const m of [...ms.daily, ...ms.weekly]) {
    if (!m.done && missionProgress(m, stats) >= m.n) {
      m.done = true;
      out.push(m);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Regalos
export interface GiftDef {
  id: string;
  name: string;
  rows: string[];
  key: Record<string, string>;
}

export const GIFTS: GiftDef[] = [
  { id: 'hoja', name: 'Hoja de plátano', rows: ['...gg', '..gGg', '.gGg.', 'gGg..', 'b....'], key: { g: 'tile3', G: 'tile2', b: 'wood1' } },
  { id: 'chapa', name: 'Chapa de refresco', rows: ['.kkk.', 'kryrk', 'kyryk', 'kryrk', '.kkk.'], key: { k: 'stone1', r: 'coral', y: 'mustard' } },
  { id: 'calcetin', name: 'Tu calcetín (con babas)', rows: ['.ww.', '.rr.', '.ww.', '.www', 'wwww'], key: { w: 'cal4', r: 'coral' } },
  { id: 'pluma', name: 'Pluma de gaviota', rows: ['....w', '...wc', '..wc.', '.wc..', 'k....'], key: { w: 'cal4', c: 'stone3', k: 'ink2' } },
  { id: 'boton', name: 'Botón de abrigo', rows: ['.bbb.', 'bBkBb', 'bkBkb', 'bBkBb', '.bbb.'], key: { b: 'wood2', B: 'wood3', k: 'wood0' } },
  { id: 'canica', name: 'Canica azul', rows: ['.ss.', 'swSs', 'sSSs', '.ss.'], key: { s: 'water2', S: 'water1', w: 'cal4' } },
  { id: 'flor', name: 'Flor de hortensia', rows: ['.ll.', 'lLpl', 'lpLl', '.gl.', '.g..'], key: { l: 'lilac', L: 'plum', p: 'pink', g: 'veg2' } },
  { id: 'piedra', name: 'Piedra con forma de corazón', rows: ['nn.nn', 'nmnnn', '.nnn.', '..n..'], key: { n: 'stone2', m: 'stone4' } },
  { id: 'castana', name: 'Castaña brillante', rows: ['..k..', '.bBb.', 'bBwBb', '.bbb.'], key: { k: 'wood1', b: 'wood1', B: 'wood2', w: 'wood4' } },
  { id: 'concha', name: 'Concha de vieira', rows: ['ooooo', 'oOoOo', '.ooo.', '..o..'], key: { o: 'tan', O: 'peach' } },
  { id: 'llave', name: 'Llave antigua', rows: ['.yy..', 'y..yyyy', '.yy..y.'], key: { y: 'mustard' } },
  { id: 'pelota', name: 'Pelota mordisqueada', rows: ['.vv.', 'vVVv', 'vVvv', '.vv.'], key: { v: 'veg3', V: 'veg4' } },
];

export function pickGift(r: () => number, season: string): GiftDef {
  const pool = GIFTS.filter((g) => (g.id !== 'castana' || season === 'otoño') && g.id !== 'concha');
  return pool[Math.floor(r() * pool.length)];
}

// ---------------------------------------------------------------- Vecinos
export interface Errand {
  stat: string;
  n: number;
  text: string;
  reward: Reward;
  thanks: string;
}

export interface Neighbor {
  id: string;
  name: string;
  role: string;
  greet: string[];
  errands: Errand[];
}

export const NEIGHBORS: Neighbor[] = [
  {
    id: 'maruxa', name: 'Maruxa', role: 'la panadera',
    greet: ['¡Buenos días, rapaz! ¿Un bollo? Ah, que tú vienes por los gatos.', 'Nemesio viene todas las mañanas a mirar la masa. Dice que la supervisa.', 'Si hueles a pan es que acaba de salir la hornada de las siete.'],
    errands: [
      { stat: 'agua', n: 5, text: 'Ponles agua fresca 5 veces. Con el horno, aquí se pasa calor.', reward: { kind: 'food', food: 'jamon', n: 3 }, thanks: '¡Ay, qué apañado! Toma, jamón york del bueno. Que no se entere mi marido.' },
      { stat: 'alimentar', n: 15, text: 'Dales de comer 15 veces y te guardo algo rico.', reward: { kind: 'food', food: 'pollo', n: 4 }, thanks: 'Pollo cocido del caldo de ayer. Ni se te ocurra comértelo tú.' },
      { stat: 'curar', n: 3, text: 'Algún gato vuelve arañado de sus peleas. Ponles 3 tiritas, ¿sí?', reward: { kind: 'decor', id: 'comedero', name: 'Comedero de madera' }, thanks: 'Mi abuelo hacía comederos con cajas de fruta. Toma, quédate este.' },
    ],
  },
  {
    id: 'ramon', name: 'Ramón', role: 'el del quiosco',
    greet: ['Hoy en el periódico: «Gato se sienta en un periódico». Exclusiva mundial.', 'Yo de joven era más de perros. Ahora soy más de siestas.', '¿Has visto a Lucáreo? Tímido como él solo. Igual que yo en mis tiempos.'],
    errands: [
      { stat: 'caricias', n: 5, text: 'Dicen que acariciar a un animal baja la tensión. Compruébalo 5 veces.', reward: { kind: 'food', food: 'galletas', n: 4 }, thanks: 'Galletas para perro. No preguntes por qué las tengo en el quiosco.' },
      { stat: 'conocidos', n: 6, text: 'Conoce a 6 animales del barrio, que luego me lo cuentas.', reward: { kind: 'decor', id: 'bebedero', name: 'Bebedero de barro' }, thanks: 'Un bebedero de barro de Buño. ¡Lo mejor para el agua fresca!' },
      { stat: 'fichas', n: 10, text: 'Lee 10 fichas del álbum. La cultura es lo primero.', reward: { kind: 'food', food: 'atun', n: 5 }, thanks: 'Latas de atún de las rías. Sí, me las regaló un cliente.' },
    ],
  },
];

export interface ErrandState {
  /** índice del encargo actual por vecino */
  step: Record<string, number>;
  /** valor de la estadística cuando se aceptó */
  start: Record<string, number>;
}

export function errandProgress(es: ErrandState, nb: Neighbor, stats: Stats): { errand: Errand | null; progress: number } {
  const i = es.step[nb.id] ?? 0;
  const errand = nb.errands[i] ?? null;
  if (!errand) return { errand: null, progress: 0 };
  const start = es.start[nb.id] ?? 0;
  return { errand, progress: Math.min(errand.n, (stats[errand.stat] ?? 0) - start) };
}
