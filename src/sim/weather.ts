// Clima diario generado con semilla (la fecha): sol, nublado, lluvia, orballo, niebla y nieve
// en invierno. El día se divide en tramos y las transiciones son suaves.
import { season, type Season } from './calendar.ts';

export type Sky = 'sol' | 'nublado' | 'lluvia' | 'orballo' | 'niebla' | 'nieve';

export interface WeatherParams {
  rain: number;
  fog: number;
  snow: number;
  overcast: number;
  wind: number;
}

export const SKY_NAMES: Record<Sky, string> = {
  sol: 'Sol', nublado: 'Nublado', lluvia: 'Lluvia', orballo: 'Orballo', niebla: 'Niebla', nieve: 'Nieve',
};

const PARAMS: Record<Sky, WeatherParams> = {
  sol: { rain: 0, fog: 0, snow: 0, overcast: 0, wind: 0.15 },
  nublado: { rain: 0, fog: 0, snow: 0, overcast: 0.85, wind: 0.3 },
  lluvia: { rain: 1, fog: 0.05, snow: 0, overcast: 1, wind: 0.45 },
  orballo: { rain: 0.38, fog: 0.25, snow: 0, overcast: 0.9, wind: 0.1 },
  niebla: { rain: 0, fog: 1, snow: 0, overcast: 0.5, wind: 0.05 },
  nieve: { rain: 0, fog: 0.15, snow: 1, overcast: 0.9, wind: 0.2 },
};

/** Probabilidades por estación (clima atlántico: llueve a menudo, y está bien). */
const ODDS: Record<Season, [Sky, number][]> = {
  primavera: [['sol', 0.35], ['nublado', 0.25], ['lluvia', 0.15], ['orballo', 0.15], ['niebla', 0.1]],
  verano: [['sol', 0.62], ['nublado', 0.2], ['orballo', 0.06], ['lluvia', 0.05], ['niebla', 0.07]],
  otoño: [['sol', 0.25], ['nublado', 0.25], ['lluvia', 0.25], ['orballo', 0.15], ['niebla', 0.1]],
  invierno: [['sol', 0.22], ['nublado', 0.28], ['lluvia', 0.25], ['orballo', 0.1], ['niebla', 0.08], ['nieve', 0.07]],
};

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(r: () => number, odds: [Sky, number][]): Sky {
  let x = r();
  for (const [s, p] of odds) {
    x -= p;
    if (x <= 0) return s;
  }
  return odds[0][0];
}

/** Tramos del día: madrugada (0-7), mañana (7-13), tarde (13-20), noche (20-24). */
export const SEGMENTS = [0, 7, 13, 20, 24];

export function dailySkies(d: Date): Sky[] {
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const r = rnd(seed * 2654435761);
  const s = season(d);
  const out: Sky[] = [];
  let prev = pick(r, ODDS[s]);
  for (let i = 0; i < 4; i++) {
    // persistencia: el tiempo tiende a seguir como estaba
    const next = r() < 0.55 ? prev : pick(r, ODDS[s]);
    // la niebla es de madrugada y de mañana; la nieve, solo en invierno
    let sky = next;
    if (sky === 'niebla' && i >= 2) sky = 'nublado';
    out.push(sky);
    prev = sky;
  }
  return out;
}

export function skyAt(d: Date): Sky {
  const h = d.getHours() + d.getMinutes() / 60;
  const skies = dailySkies(d);
  for (let i = 0; i < 4; i++) if (h < SEGMENTS[i + 1]) return skies[i];
  return skies[3];
}

/** Parámetros con transición suave (40 min) entre tramos. */
export function weatherAt(d: Date): WeatherParams {
  const h = d.getHours() + d.getMinutes() / 60;
  const skies = dailySkies(d);
  let i = 0;
  while (i < 3 && h >= SEGMENTS[i + 1]) i++;
  const cur = PARAMS[skies[i]];
  const toNext = SEGMENTS[i + 1] - h;
  if (i < 3 && toNext < 0.66) {
    const t = 1 - toNext / 0.66;
    const nx = PARAMS[skies[i + 1]];
    return lerpW(cur, nx, t * t * (3 - 2 * t));
  }
  return { ...cur };
}

export function paramsFor(sky: Sky): WeatherParams {
  return { ...PARAMS[sky] };
}

export function lerpW(a: WeatherParams, b: WeatherParams, t: number): WeatherParams {
  return {
    rain: a.rain + (b.rain - a.rain) * t,
    fog: a.fog + (b.fog - a.fog) * t,
    snow: a.snow + (b.snow - a.snow) * t,
    overcast: a.overcast + (b.overcast - a.overcast) * t,
    wind: a.wind + (b.wind - a.wind) * t,
  };
}
