// Modelo de los animales: datos persistentes, necesidades, confianza y generación.
// Puro (sin DOM) para poder probarlo con Vitest.
import { BREEDS, BREED_BY_ID, type Rare } from '../sprites/breeds.ts';

export type Personality = 'dormilon' | 'gloton' | 'timido' | 'travieso' | 'carinoso';
export type Schedule = 'dia' | 'noche' | 'siempre';
export type FoodId = 'pienso' | 'atun' | 'sardinas' | 'jamon' | 'galletas' | 'castanas' | 'pollo';

export interface AnimalData {
  id: string;
  name: string;
  breed: string;
  variant: number;
  seed: number;
  rare: Rare;
  personality: Personality;
  favorite: FoodId;
  schedule: Schedule;
  zone: string;
  /** confianza 0..5 (corazones = parte entera) */
  trust: number;
  /** máxima confianza alcanzada (la caída nunca baja de la mitad) */
  trustMax: number;
  /** 0 = muerto de hambre … 1 = lleno */
  hunger: number;
  thirst: number;
  wellbeing: number;
  injured: boolean;
  metAt: number;
  lastCare: number;
  /** tile donde le gusta dormir */
  home: [number, number];
  fed: number;
  watered: number;
  healed: number;
  petted: number;
  /** vista por primera vez por el jugador */
  known: boolean;
}

export const PERSONALITIES: Record<Personality, { name: string; blurb: string }> = {
  dormilon: { name: 'Dormilón', blurb: 'Duerme mucho, y siempre en el mismo sitio.' },
  gloton: { name: 'Glotón', blurb: 'Llega corriendo en cuanto huele comida.' },
  timido: { name: 'Tímido', blurb: 'Le cuesta confiar, pero cuando lo hace es para siempre.' },
  travieso: { name: 'Travieso', blurb: 'De vez en cuando te roba un calcetín.' },
  carinoso: { name: 'Cariñoso', blurb: 'Se deja querer enseguida.' },
};

export const FOODS: Record<FoodId, { name: string; for: 'cat' | 'dog' | 'all'; season?: 'otoño' }> = {
  pienso: { name: 'Pienso', for: 'all' },
  atun: { name: 'Lata de atún', for: 'cat' },
  sardinas: { name: 'Sardinas del puerto', for: 'cat' },
  jamon: { name: 'Jamón york', for: 'all' },
  galletas: { name: 'Galletas para perro', for: 'dog' },
  castanas: { name: 'Castañas asadas', for: 'dog', season: 'otoño' },
  pollo: { name: 'Pollo cocido', for: 'all' },
};

/** Nombres: obligatorios, de persona con gracia y típicos de gato y perro. */
export const NAMES = [
  'Nemesio', 'Fernando', 'Germenegildo', 'Hermenegildo', 'Eustaquio', 'Jaime Alberto', 'Lucáreo', 'Albóndigo',
  'Anacleto', 'Fulgencio', 'Pancracio', 'Gumersindo', 'Telesforo', 'Wenceslao', 'Casimiro', 'Leocadio', 'Crisóstomo',
  'Petronila', 'Eduvigis', 'Remedios', 'Maripuri', 'Tomasa', 'Bonifacio', 'Prudencia', 'Ataúlfo', 'Filomena', 'Rigoberto',
  'Escolástica', 'Venancio', 'Gertrudis', 'Saturnino', 'Herminia', 'Ceferino', 'Brígida', 'Teodomiro', 'Encarna',
  'Michi', 'Misifú', 'Pelusa', 'Bigotes', 'Luna', 'Nube', 'Canela', 'Chispa', 'Manchas', 'Botas', 'Sombra', 'Calcetines',
  'Toby', 'Rufo', 'Coco', 'Bruno', 'Kira', 'Lolo', 'Garbanzo', 'Croqueta', 'Pipas', 'Torrija', 'Churro', 'Galleta',
  'Morriña', 'Orballo', 'Percebe', 'Filloa', 'Lentejas', 'Pimiento', 'Bombón', 'Trufa', 'Pistacho', 'Mantequilla',
];

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre aleatorio sin repetir mientras queden libres; después, con ordinal. */
export function pickName(used: readonly string[], r: () => number): string {
  const free = NAMES.filter((n) => !used.includes(n));
  if (free.length) return free[Math.floor(r() * free.length)];
  const base = NAMES[Math.floor(r() * NAMES.length)];
  let k = 2;
  while (used.includes(`${base} ${roman(k)}`)) k++;
  return `${base} ${roman(k)}`;
}

function roman(n: number): string {
  const t: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, c] of t) while (n >= v) {
    s += c;
    n -= v;
  }
  return s;
}

export interface GenOptions {
  zone: string;
  /** razas permitidas en la zona (si no, todas) */
  breeds?: string[];
  used: readonly string[];
  /** noche de luna llena: puede aparecer el gato lunar */
  fullMoon?: boolean;
  night?: boolean;
  now: number;
  home: [number, number];
}

export function generateAnimal(seed: number, o: GenOptions): AnimalData {
  const r = rng(seed);
  const pool = BREEDS.filter((b) => !o.breeds || o.breeds.includes(b.id));
  let total = pool.reduce((a, b) => a + b.weight, 0);
  let x = r() * total;
  let breed = pool[0];
  for (const b of pool) {
    x -= b.weight;
    if (x <= 0) {
      breed = b;
      break;
    }
  }
  // raros (probabilidad muy baja)
  let rare: Rare = null;
  if (breed.species === 'cat') {
    if (o.fullMoon && o.night && r() < 0.04) rare = 'lunar';
    else if (breed.id === 'calico' && r() < 0.01) rare = 'calicoMacho';
    else if (r() < 0.006) rare = 'heterocromia';
  }
  const pers: Personality[] = ['dormilon', 'gloton', 'timido', 'travieso', 'carinoso'];
  const personality = pers[Math.floor(r() * pers.length)];
  const foods = (Object.keys(FOODS) as FoodId[]).filter((f) => f !== 'pienso' && (FOODS[f].for === 'all' || FOODS[f].for === breed.species));
  const favorite = foods[Math.floor(r() * foods.length)];
  const schedule: Schedule = rare === 'lunar' ? 'noche' : r() < 0.2 ? 'noche' : r() < 0.35 ? 'siempre' : 'dia';
  total = 0;
  return {
    id: `a${seed.toString(36)}`,
    name: pickName(o.used, r),
    breed: breed.id,
    variant: Math.floor(r() * breed.coats.length),
    seed,
    rare,
    personality,
    favorite,
    schedule,
    zone: o.zone,
    trust: personality === 'carinoso' ? 0.6 : personality === 'timido' ? 0 : 0.25,
    trustMax: 0,
    hunger: 0.35 + r() * 0.3,
    thirst: 0.35 + r() * 0.3,
    wellbeing: 0.5 + r() * 0.2,
    injured: r() < 0.25,
    metAt: o.now,
    lastCare: o.now,
    home: o.home,
    fed: 0,
    watered: 0,
    healed: 0,
    petted: 0,
    known: false,
  };
}

export function species(a: AnimalData): 'cat' | 'dog' {
  return BREED_BY_ID[a.breed].species;
}

// ---------------------------------------------------------------- Necesidades y confianza
/** Ritmos de caída por hora (muy lentos). */
export const DECAY = { hunger: 0.05, thirst: 0.065, wellbeing: 0.03 };
/** Horas sin cuidados antes de que la confianza empiece a bajar, y velocidad (por día). */
export const TRUST_GRACE_H = 48;
export const TRUST_DECAY_PER_DAY = 0.08;

export function hearts(a: AnimalData): number {
  return Math.max(0, Math.min(5, Math.floor(a.trust + 1e-6)));
}

export function trustFloor(a: AnimalData): number {
  return Math.floor(a.trustMax) / 2;
}

/** Aplica el paso del tiempo (horas) a las necesidades y, si procede, a la confianza. */
export function decay(a: AnimalData, hours: number, now: number): void {
  if (hours <= 0) return;
  a.hunger = clamp01(a.hunger - DECAY.hunger * hours);
  a.thirst = clamp01(a.thirst - DECAY.thirst * hours);
  const needsLow = (a.hunger < 0.3 ? 1 : 0) + (a.thirst < 0.3 ? 1 : 0) + (a.injured ? 1 : 0);
  a.wellbeing = clamp01(a.wellbeing - DECAY.wellbeing * hours * (1 + needsLow * 0.5));
  const sinceCareH = (now - a.lastCare) / 3_600_000;
  if (sinceCareH > TRUST_GRACE_H) {
    const over = Math.min(hours, sinceCareH - TRUST_GRACE_H);
    a.trust = Math.max(trustFloor(a), a.trust - (TRUST_DECAY_PER_DAY * over) / 24);
  }
}

export type Action = 'feed' | 'water' | 'heal' | 'pet';

export interface ActionResult {
  ok: boolean;
  /** mensaje si no se puede */
  reason?: string;
  trustGain: number;
  heartUp: boolean;
  favorite: boolean;
}

/** ¿Qué puede hacerse con este animal según su confianza? */
export function canDo(a: AnimalData, act: Action): { ok: boolean; reason?: string } {
  const h = hearts(a);
  switch (act) {
    case 'feed':
      return { ok: true };
    case 'water':
      return { ok: true };
    case 'pet':
      return h >= 2 ? { ok: true } : { ok: false, reason: 'Todavía no se deja tocar' };
    case 'heal':
      if (!a.injured) return { ok: false, reason: 'No tiene ninguna herida' };
      return h >= 3 ? { ok: true } : { ok: false, reason: 'Necesita confiar más en ti (3 corazones)' };
  }
}

export function apply(a: AnimalData, act: Action, now: number, food: FoodId = 'pienso'): ActionResult {
  const can = canDo(a, act);
  if (!can.ok) return { ok: false, reason: can.reason, trustGain: 0, heartUp: false, favorite: false };
  const before = hearts(a);
  let gain = 0;
  let favorite = false;
  const shy = a.personality === 'timido' ? 0.6 : a.personality === 'carinoso' ? 1.25 : 1;
  switch (act) {
    case 'feed': {
      const need = 1 - a.hunger;
      favorite = food === a.favorite;
      gain = (0.08 + need * 0.3) * (favorite ? 1.9 : food !== 'pienso' ? 1.3 : 1) * (a.personality === 'gloton' ? 1.2 : 1);
      a.hunger = clamp01(a.hunger + (food === 'pienso' ? 0.5 : 0.7));
      a.fed++;
      break;
    }
    case 'water': {
      const need = 1 - a.thirst;
      gain = 0.05 + need * 0.2;
      a.thirst = 1;
      a.watered++;
      break;
    }
    case 'heal':
      gain = 0.45;
      a.injured = false;
      a.healed++;
      a.wellbeing = clamp01(a.wellbeing + 0.3);
      break;
    case 'pet':
      gain = 0.06;
      a.wellbeing = clamp01(a.wellbeing + 0.12);
      a.petted++;
      break;
  }
  gain *= shy;
  a.trust = Math.min(5, a.trust + gain);
  a.trustMax = Math.max(a.trustMax, a.trust);
  a.wellbeing = clamp01(a.wellbeing + 0.05);
  a.lastCare = now;
  return { ok: true, trustGain: gain, heartUp: hearts(a) > before, favorite };
}

/** Etapas de comportamiento según la confianza. */
export type Stage = 'huye' | 'mira' | 'come-si-te-alejas' | 'tranquilo' | 'te-sigue';
export function stage(a: AnimalData): Stage {
  const h = hearts(a);
  if (h <= 0) return 'huye';
  if (h === 1) return 'mira';
  if (h === 2) return 'come-si-te-alejas';
  if (h === 3) return 'tranquilo';
  return 'te-sigue';
}

/** Distancia (en tiles) a la que el animal se siente cómodo con el jugador. */
export function comfortDistance(a: AnimalData): number {
  const base = [4.5, 3.5, 2.5, 1.2, 0][hearts(a) >= 4 ? 4 : hearts(a)];
  return base * (a.personality === 'timido' ? 1.3 : 1);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
