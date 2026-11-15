// Vida propia de los animales: amistades, costumbres, peticiones, camadas, adopciones, trucos y
// momentos raros. Puro (sin DOM): las decisiones se prueban con Vitest y el mundo solo las ejecuta.
import { hearts, species, rng, pickName, type AnimalData, type Action } from './model.ts';
import type { Season } from './calendar.ts';

const DAY = 86_400_000;

// ---------------------------------------------------------------- Amistades
/** Afinidad inicial de una pareja: estable (depende de los dos) y con alguna pareja «predestinada». */
export function baseAffinity(a: AnimalData, b: AnimalData): number {
  const r = rng((a.seed ^ (b.seed * 2654435761)) >>> 0)();
  const same = species(a) === species(b) ? 0.12 : -0.05;
  const pers = a.personality === b.personality ? 0.06 : a.personality === 'timido' || b.personality === 'timido' ? -0.06 : 0;
  return Math.max(0, Math.min(0.45, r * 0.35 + same + pers));
}

export function affinity(a: AnimalData, b: AnimalData): number {
  return a.friends?.[b.id] ?? baseAffinity(a, b);
}

/** Pasar tiempo juntos (segundos) acerca a dos animales, más deprisa si ya se caían bien. */
export function bond(a: AnimalData, b: AnimalData, seconds: number): boolean {
  const before = affinity(a, b);
  const gain = (seconds / 600) * (0.4 + before);
  const v = Math.min(1, before + gain);
  (a.friends ??= {})[b.id] = v;
  (b.friends ??= {})[a.id] = v;
  return before < FRIENDS && v >= FRIENDS;
}

/** A partir de aquí son amigos (duermen juntos, se acicalan, juegan). */
export const FRIENDS = 0.55;

export function bestFriend(a: AnimalData, all: AnimalData[]): AnimalData | null {
  let best: AnimalData | null = null, bv = FRIENDS;
  for (const b of all) {
    if (b.id === a.id || b.adoptedBy) continue;
    const v = a.friends?.[b.id] ?? 0;
    if (v >= bv) {
      bv = v;
      best = b;
    }
  }
  return best;
}

// ---------------------------------------------------------------- Costumbres
export type RoutineKind = 'siesta' | 'mirador' | 'ronda' | 'portal' | 'sol';
export interface Routine {
  kind: RoutineKind;
  /** casilla favorita */
  tile: [number, number];
  from: number;
  to: number;
  text: string;
}

const ROUTINE_TEXT: Record<RoutineKind, (place: string, when: string) => string> = {
  siesta: (p, w) => `le encanta echarse la siesta ${p} ${w}`,
  mirador: (p, w) => `se sienta a vigilar el barrio ${p} ${w}`,
  ronda: (p, w) => `hace su ronda y siempre pasa ${p} ${w}`,
  portal: (p, w) => `espera ${p} ${w}, por si cae algo rico`,
  sol: (p, w) => `busca el sol ${p} ${w}`,
};
const WHEN: [number, number, string][] = [[8, 11, 'por la mañana'], [11, 14, 'a mediodía'], [14, 18, 'por la tarde'], [18, 21.5, 'al atardecer'], [21.5, 26, 'por la noche']];

/** Costumbre fija de cada animal en su zona (determinista: siempre la misma). */
export function routineFor(a: AnimalData, spots: { tile: [number, number]; place: string }[]): Routine | null {
  if (!spots.length) return null;
  const r = rng(a.seed * 31 + 7);
  const kinds: RoutineKind[] = species(a) === 'cat' ? ['siesta', 'mirador', 'sol', 'ronda'] : ['siesta', 'mirador', 'ronda', 'portal'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  let slots = WHEN;
  if (a.schedule === 'noche') slots = [WHEN[3], WHEN[4]];
  else if (a.schedule === 'dia') slots = WHEN.slice(0, 4);
  if (kind === 'sol') slots = slots.filter((w) => w[0] < 18);
  if (!slots.length) slots = [WHEN[2]];
  const w = slots[Math.floor(r() * slots.length)];
  const s = spots[Math.floor(r() * spots.length)];
  return { kind, tile: s.tile, from: w[0], to: w[1], text: ROUTINE_TEXT[kind](s.place, w[2]) };
}

export function inRoutine(rt: Routine, hour: number): boolean {
  const h = hour < 4 ? hour + 24 : hour;
  return h >= rt.from && h < rt.to;
}

// ---------------------------------------------------------------- Peticiones
export type RequestKind = 'caricias' | 'agua' | 'comida' | 'jugar';
export interface AnimalRequest {
  id: string;
  kind: RequestKind;
  until: number;
}
export const REQUEST_ACTION: Record<RequestKind, Action | 'jugar'> = { caricias: 'pet', agua: 'water', comida: 'feed', jugar: 'jugar' };
export const REQUEST_TEXT: Record<RequestKind, string> = {
  caricias: 'quiere que le rasques detrás de la oreja',
  agua: 'tiene sed y te mira con cara de cuenco vacío',
  comida: 'te sigue con la tripa rugiendo',
  jugar: 'quiere jugar contigo',
};

/** ¿Pide algo ahora? Solo los que ya confían (2+ corazones), sin agobiar: como mucho uno cada pocos minutos. */
export function pickRequest(a: AnimalData, now: number, r: () => number): AnimalRequest | null {
  if (hearts(a) < 2 || a.adoptedBy) return null;
  const opts: RequestKind[] = ['caricias', 'jugar'];
  if (a.thirst < 0.6) opts.push('agua', 'agua');
  if (a.hunger < 0.6) opts.push('comida', 'comida');
  return { id: a.id, kind: opts[Math.floor(r() * opts.length)], until: now + 90_000 };
}
export const REQUEST_BONUS = 0.3;

// ---------------------------------------------------------------- Camadas
/** Edad en días (de los nacidos en el barrio). */
export function ageDays(a: AnimalData, now: number): number {
  return a.born ? (now - a.born) / DAY : Infinity;
}
/** Tamaño según la edad: crecen en dos semanas de días reales. */
export function growth(a: AnimalData, now: number): number {
  const d = ageDays(a, now);
  if (d === Infinity) return 1;
  return Math.min(1, 0.55 + (d / 14) * 0.45);
}
export function stageName(a: AnimalData, now: number): string | null {
  const d = ageDays(a, now);
  if (d === Infinity) return null;
  const cat = species(a) === 'cat';
  if (d < 6) return cat ? 'gatito' : 'cachorro';
  if (d < 14) return cat ? 'gato joven' : 'perro joven';
  return null;
}

/**
 * ¿Hay camada? Una madre de confianza (3+ corazones), sin otra camada en curso. Más probable en
 * primavera. `dayRoll` es una tirada por día real, para que no dependa de cuántas veces se compruebe.
 */
export function pickMother(animals: AnimalData[], now: number, season: Season, lastLitter: number, dayRoll: number): AnimalData | null {
  if (now - lastLitter < 10 * DAY) return null;
  if (animals.some((a) => ageDays(a, now) < 14)) return null;
  const chance = season === 'primavera' ? 0.4 : 0.12;
  if (dayRoll > chance) return null;
  const moms = animals.filter((a) => !a.adoptedBy && !a.visitor && !a.born && hearts(a) >= 3 && ageDays(a, now) === Infinity);
  if (!moms.length) return null;
  return moms[Math.floor(dayRoll * 1000) % moms.length];
}

export function makeLitter(mother: AnimalData, now: number, seed: number, used: string[]): AnimalData[] {
  const r = rng(seed);
  const n = 2 + Math.floor(r() * 2);
  const out: AnimalData[] = [];
  for (let i = 0; i < n; i++) {
    const s = seed + i * 977;
    const name = pickName([...used, ...out.map((o) => o.name)], rng(s));
    out.push({
      ...mother, id: `a${s.toString(36)}`, name, seed: s, variant: Math.floor(r() * 8), rare: null,
      personality: (['carinoso', 'travieso', 'dormilon', 'gloton'] as const)[Math.floor(r() * 4)],
      trust: Math.min(3, mother.trust * 0.6), trustMax: 0, hunger: 0.8, thirst: 0.8, wellbeing: 0.9, injured: false,
      metAt: now, lastCare: now, fed: 0, watered: 0, healed: 0, petted: 0, known: false,
      friends: { [mother.id]: 0.9 }, routineKnown: false, born: now, mother: mother.id, tricks: [],
      adoptedBy: undefined, adoptedAt: undefined, visitor: undefined,
    });
  }
  mother.friends ??= {};
  for (const k of out) mother.friends[k.id] = 0.9;
  return out;
}

// ---------------------------------------------------------------- Adopciones
export const ADOPTERS = ['maruxa', 'ramon', 'lua', 'xan'] as const;

/** Un animal muy querido (5 corazones desde hace días) puede recibir una oferta de adopción. */
export function adoptionCandidate(animals: AnimalData[], now: number, lastOffer: number): AnimalData | null {
  if (now - lastOffer < 3 * DAY) return null;
  const c = animals.filter((a) => !a.adoptedBy && !a.visitor && hearts(a) >= 5 && now - a.metAt > 4 * DAY && ageDays(a, now) > 14);
  return c.length ? c[0] : null;
}

const LETTERS = [
  (n: string, w: string) => `${n} ya tiene su rincón junto a la ventana. ${w} dice que ronca un poco, pero que se le perdona todo.`,
  (n: string, w: string) => `Esta semana ${n} ha descubierto el sofá. ${w} te manda recuerdos y una foto (algo movida).`,
  (n: string, w: string) => `${n} te echa de menos cuando pasas por la calle: se asoma a la puerta. ${w} dice que vengas a merendar.`,
  (n: string, w: string) => `${w} le compró una camita, pero ${n} prefiere dormir en la caja de la camita. Cosas de ${n}.`,
  (n: string, w: string) => `${w} te cuenta que ${n} ya se sabe la hora de la cena mejor que el reloj de la iglesia.`,
];
export function letterText(name: string, adopterName: string, k: number): string {
  return LETTERS[k % LETTERS.length](name, adopterName);
}

// ---------------------------------------------------------------- Trucos (perros)
export const TRICKS = [
  { id: 'sentarse', name: 'Sentarse' },
  { id: 'pata', name: 'Dar la pata' },
  { id: 'tumbarse', name: 'Tumbarse' },
  { id: 'girar', name: 'Dar una vuelta' },
] as const;
export function nextTrick(a: AnimalData): (typeof TRICKS)[number] | null {
  if (species(a) !== 'dog' || hearts(a) < 3) return null;
  return TRICKS.find((t) => !(a.tricks ?? []).includes(t.id)) ?? null;
}

// ---------------------------------------------------------------- Momentos raros
export const MOMENTS = {
  caja: { name: 'Un gato en una caja', text: 'Si cabe, se mete.' },
  cola: { name: 'Persiguiendo la cola', text: 'Casi la pilla. Casi.' },
  sol: { name: 'Panza al sol', text: 'Tumbado boca arriba, derretido de gusto.' },
  siesta: { name: 'Siesta en compañía', text: 'Dos amigos durmiendo juntitos.' },
  mariposa: { name: 'La mariposa', text: 'Salto, zarpazo… y la mariposa sigue tan pancha.' },
  charco: { name: 'Chapoteo', text: 'Ningún charco se salva.' },
  hojas: { name: 'Caza de hojas', text: 'Con el viento, cada hoja es una presa.' },
  acicalar: { name: 'Acicalándose', text: 'Uno lame la oreja del otro. Amistad pura.' },
  nieve: { name: 'Primera nieve', text: 'Huellitas en la nieve y la nariz blanca.' },
} as const;
export type MomentId = keyof typeof MOMENTS;
export const DAY_MS = DAY;
