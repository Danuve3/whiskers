// Controlador de progreso: estadísticas, logros, misiones, regalos y encargos de los vecinos.
import { checkAchievements, refreshMissions, updateMissions, rewardText, pickGift, GIFTS, type Reward, type Stats, type MissionState, type ErrandState, type Unlocked } from '../sim/progress.ts';
import { hearts, rng, type AnimalData, type FoodId } from '../sim/model.ts';
import { BREED_BY_ID } from '../sprites/breeds.ts';

export interface MetaState {
  levels: Record<string, number>;
  missions?: MissionState;
  errands: ErrandState;
  /** colección de regalos: id → { veces, primera fecha } */
  vitrina: Record<string, { n: number; first: number }>;
  /** regalos esperando en el portal */
  portal: { id: string; from: string; x: number; y: number }[];
  decor: string[];
  eventsSeen: string[];
  lastGiftCheck: number;
}

export function newMeta(): MetaState {
  return { levels: {}, errands: { step: {}, start: {} }, vitrina: {}, portal: [], decor: [], eventsSeen: [], lastGiftCheck: 0 };
}

export interface MetaHost {
  stats: Stats;
  inventory: Partial<Record<FoodId, number>>;
  unlocked: string[];
  animals: AnimalData[];
  meta: MetaState;
  notifyAchievement(a: Unlocked): void;
  notify(msg: string): void;
  season: string;
}

export function giveReward(h: MetaHost, r: Reward): void {
  if (r.kind === 'food') h.inventory[r.food] = (h.inventory[r.food] ?? 0) + r.n;
  else if (r.kind === 'unlock') {
    if (!h.unlocked.includes(r.id)) h.unlocked.push(r.id);
  } else if (!h.meta.decor.includes(r.id)) h.meta.decor.push(r.id);
}

/** Recalcula las estadísticas derivadas del estado de los animales. */
export function deriveStats(h: MetaHost): void {
  const known = h.animals.filter((a) => a.known);
  h.stats.conocidos = known.length;
  h.stats.razas = new Set(known.map((a) => a.breed)).size;
  h.stats.confianzaMax = h.animals.filter((a) => hearts(a) >= 5).length;
  h.stats.raros = known.filter((a) => a.rare).length;
  h.stats.hermenegildos = known.filter((a) => a.name === 'Germenegildo' || a.name === 'Hermenegildo').length;
}

export function bump(h: MetaHost, stat: string, n = 1): void {
  h.stats[stat] = (h.stats[stat] ?? 0) + n;
}

/** Comprueba logros y misiones; aplica recompensas y avisa. */
export function evaluate(h: MetaHost, now = new Date()): void {
  deriveStats(h);
  for (const a of checkAchievements(h.stats, h.meta.levels)) {
    giveReward(h, a.reward);
    h.notifyAchievement(a);
  }
  h.meta.missions = refreshMissions(h.meta.missions, now, h.stats);
  for (const m of updateMissions(h.meta.missions, h.stats)) {
    m.claimed = true;
    giveReward(h, m.reward);
    bump(h, 'misiones');
    h.notify(`Misión cumplida: ${m.text}. Recompensa: ${rewardText(m.reward)}.`);
  }
  // segunda pasada por si las misiones subieron un logro
  for (const a of checkAchievements(h.stats, h.meta.levels)) {
    giveReward(h, a.reward);
    h.notifyAchievement(a);
  }
}

/** Los animales con mucha confianza dejan regalos en el portal. */
export function giftTick(h: MetaHost, now: number, portal: [number, number], elapsedMin: number): number {
  const M = h.meta;
  const r = rng(Math.floor(now / 1000) ^ 0x5bd1e995);
  let added = 0;
  const friends = h.animals.filter((a) => hearts(a) >= 4);
  // probabilidad por amigo y por cada 10 minutos
  const rolls = Math.max(1, Math.floor(elapsedMin / 10));
  for (const a of friends)
    for (let k = 0; k < rolls && M.portal.length < 6; k++) {
      if (r() > 0.18 + (hearts(a) >= 5 ? 0.1 : 0)) continue;
      const g = pickGift(r, h.season);
      M.portal.push({ id: g.id, from: a.name, x: portal[0] + (r() - 0.5) * 18, y: portal[1] + (r() - 0.5) * 18 });
      added++;
    }
  return added;
}

export function collectGift(h: MetaHost, i: number): string {
  const g = h.meta.portal.splice(i, 1)[0];
  const def = GIFTS.find((x) => x.id === g.id)!;
  const v = (h.meta.vitrina[g.id] ??= { n: 0, first: Date.now() });
  v.n++;
  bump(h, 'regalos');
  return `${g.from} te ha dejado un regalo: ${def.name}.`;
}

export function breedName(id: string): string {
  return BREED_BY_ID[id]?.name ?? id;
}
