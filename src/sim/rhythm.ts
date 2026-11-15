// Ritmo del barrio, centrado en los animales: un suceso cada día, un reto por estación y proyectos
// a largo plazo que cambian las zonas. Puro (sin DOM).
import { rng } from './model.ts';
import type { Reward } from './progress.ts';
import type { Season } from './calendar.ts';

type Stats = Record<string, number>;
const sum = (s: Stats, keys: string[]) => keys.reduce((a, k) => a + (s[k] ?? 0), 0);

// ---------------------------------------------------------------- Sucesos del día
export type HappeningId = 'banos' | 'cepillado' | 'pelota' | 'reparto' | 'veterinaria' | 'siestas' | 'sardinas' | 'mercadillo' | 'mimos';
export interface Happening {
  id: HappeningId;
  name: string;
  /** cómo se anuncia por la mañana */
  text: string;
  /** zona donde pasa (tiene que estar abierta) */
  zone: string;
  task: { stats: string[]; n: number; text: string };
  reward: Reward;
}
export const HAPPENINGS: Happening[] = [
  { id: 'banos', name: 'Día de baño', zone: 'plaza', text: 'Lúa ha sacado una tina a la plaza: hoy los perros se ponen guapos. Algunos ya vienen embarrados…', task: { stats: ['banos'], n: 2, text: 'Baña a 2 perros' }, reward: { kind: 'food', food: 'galletas', n: 4 } },
  { id: 'cepillado', name: 'Día de cepillado', zone: 'calle', text: 'Maruxa te presta su cepillo bueno. ¡Hoy toca peinar bigotes!', task: { stats: ['cepillados'], n: 3, text: 'Cepilla a 3 animales' }, reward: { kind: 'food', food: 'atun', n: 3 } },
  { id: 'pelota', name: 'Día de la pelota', zone: 'parque', text: 'Los niños juegan a la pelota en la Alameda y los perros están revolucionados.', task: { stats: ['pelota'], n: 2, text: 'Juega 2 veces a la pelota' }, reward: { kind: 'food', food: 'pollo', n: 3 } },
  { id: 'reparto', name: 'Camión de reparto', zone: 'mercado', text: 'Ha pasado el camión de reparto y el mercado está lleno de cajas. Ya sabes lo que significa…', task: { stats: ['momento-caja'], n: 1, text: 'Ve a un gato metido en una caja' }, reward: { kind: 'food', food: 'sardinas', n: 4 } },
  { id: 'veterinaria', name: 'Revisión de la veterinaria', zone: 'plaza', text: 'La veterinaria del barrio pasa revisión: hoy las curas dan el doble de confianza.', task: { stats: ['curar'], n: 2, text: 'Cura a 2 animales' }, reward: { kind: 'food', food: 'pollo', n: 3 } },
  { id: 'siestas', name: 'Día de siestas', zone: 'calle', text: 'Hace un día perezoso: medio barrio duerme la siesta. Busca a los que duermen juntos.', task: { stats: ['momento-siesta'], n: 1, text: 'Ve una siesta en compañía' }, reward: { kind: 'food', food: 'galletas', n: 3 } },
  { id: 'sardinas', name: 'Fiesta de la sardina', zone: 'puerto', text: '¡Fiesta en el puerto! Hoy cada sardina pescada vale doble y los gatos lo saben.', task: { stats: ['pesca'], n: 3, text: 'Pesca 3 veces' }, reward: { kind: 'food', food: 'atun', n: 4 } },
  { id: 'mercadillo', name: 'Mercadillo', zone: 'mercado', text: 'Hay mercadillo y mucho movimiento: hoy llegan caras nuevas al barrio.', task: { stats: ['conocidos'], n: 1, text: 'Conoce a un animal nuevo' }, reward: { kind: 'food', food: 'jamon', n: 3 } },
  { id: 'mimos', name: 'Día de los mimos', zone: 'calle', text: 'Hoy los animales están mimosos: te pedirán cosas a menudo. ¡Atiéndelos!', task: { stats: ['peticiones'], n: 3, text: 'Atiende 3 peticiones' }, reward: { kind: 'food', food: 'atun', n: 3 } },
];

export function dayIndex(now: number): number {
  const d = new Date(now);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
}

/**
 * El suceso de hoy: determinista por fecha, en una zona abierta y nunca el mismo dos días seguidos.
 * Los días van en bloques; cada bloque es una permutación de los sucesos posibles (todos salen antes
 * de repetirse) y en el cambio de bloque se evita la repetición.
 */
export function happeningFor(day: number, open: string[]): Happening {
  const pool = HAPPENINGS.filter((h) => open.includes(h.zone));
  const n = pool.length;
  if (n <= 1) return pool[0] ?? HAPPENINGS[0];
  const perm = (b: number): Happening[] => {
    const r = rng(b * 7919 + 13), p = [...pool];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  };
  const block = Math.floor(day / n), i = day - block * n;
  const cur = perm(block);
  if (n > 2 && cur[0] === perm(block - 1)[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return cur[i];
}

export function taskProgress(task: { stats: string[]; n: number }, stats: Stats, start: number): number {
  return Math.max(0, Math.min(task.n, sum(stats, task.stats) - start));
}
export function taskStart(task: { stats: string[] }, stats: Stats): number {
  return sum(stats, task.stats);
}

// ---------------------------------------------------------------- Reto de la estación
export interface Challenge {
  id: Season;
  name: string;
  text: string;
  stats: string[];
  n: number;
  /** adorno exclusivo de la estación */
  reward: Reward;
}
export const CHALLENGES: Record<Season, Challenge> = {
  otoño: { id: 'otoño', name: 'Otoño de mimos', text: 'Cuida 40 veces a los animales este otoño', stats: ['alimentar', 'agua', 'curar', 'caricias'], n: 40, reward: { kind: 'decor', id: 'calabaza', name: 'Calabaza de otoño' } },
  invierno: { id: 'invierno', name: 'Calorcito de invierno', text: 'Pon agua o comida 30 veces este invierno', stats: ['alimentar', 'agua'], n: 30, reward: { kind: 'decor', id: 'braserito', name: 'Braserito (los animales se acurrucan cerca)' } },
  primavera: { id: 'primavera', name: 'Caras nuevas', text: 'Conoce a 6 animales y atiende 5 peticiones esta primavera', stats: ['conocidos', 'peticiones'], n: 11, reward: { kind: 'decor', id: 'macetero', name: 'Macetero de flores' } },
  verano: { id: 'verano', name: 'Verano de juegos', text: 'Juega 15 veces con los animales este verano', stats: ['juegos', 'laser'], n: 15, reward: { kind: 'decor', id: 'sombrilla', name: 'Sombrilla (da sombra y cobijo)' } },
};
export function seasonKey(now: number, season: Season): string {
  const d = new Date(now);
  // el invierno de diciembre cuenta con el año siguiente
  return `${d.getMonth() === 11 && season === 'invierno' ? d.getFullYear() + 1 : d.getFullYear()}-${season}`;
}

// ---------------------------------------------------------------- Proyectos del barrio
export type ProjectId = 'rascador' | 'casetas' | 'refugio' | 'bebedero';
export interface Project {
  id: ProjectId;
  name: string;
  zone: string;
  text: string;
  done: string;
  stats: string[];
  n: number;
}
export const PROJECTS: Project[] = [
  { id: 'rascador', name: 'Un rascador para tu calle', zone: 'calle', text: 'Juega 20 veces con los animales para montar un rascador junto a tu portal', done: 'Ya hay rascador en tu calle: a los gatos les chifla.', stats: ['juegos', 'laser'], n: 20 },
  { id: 'casetas', name: 'Casetas en la Alameda', zone: 'parque', text: 'Acaricia o cura 60 veces para construir casetas bajo los castaños', done: 'Las casetas de la Alameda ya están puestas: cobijo para días de lluvia.', stats: ['caricias', 'curar'], n: 60 },
  { id: 'refugio', name: 'Un refugio en el descampado', zone: 'descampado', text: 'Da de comer 100 veces para levantar un refugio de madera en el descampado', done: 'El refugio del descampado está terminado. ¡Qué orgullo de barrio!', stats: ['alimentar'], n: 100 },
  { id: 'bebedero', name: 'Bebedero de piedra en el puerto', zone: 'puerto', text: 'Pon agua 70 veces para instalar un bebedero que nunca se vacía', done: 'El bebedero de piedra del puerto ya mana agua fresca.', stats: ['agua'], n: 70 },
];
