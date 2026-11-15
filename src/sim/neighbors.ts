// Vecinos: historias por capítulos (avanzan con la amistad) y rutinas por el barrio según la hora.
// Puro (sin DOM).
import type { Reward } from './progress.ts';

// ---------------------------------------------------------------- Historias
export interface Chapter {
  title: string;
  /** puntos de amistad necesarios */
  need: number;
  /** condición extra (p. ej. un proyecto terminado) */
  requires?: { project?: string };
  lines: string[];
  reward?: Reward;
}
export const STORIES: Record<string, Chapter[]> = {
  maruxa: [
    { title: 'La gata de la panadería', need: 0, lines: ['¿Sabes por qué siempre guardo un poco de masa? Cuando era una cría había una gata blanca que dormía encima del horno.', 'La llamábamos Pementa, porque era de genio picante. Se fue un invierno y nunca volvió.'] },
    { title: 'Huellas de harina', need: 3, lines: ['Esta mañana he visto huellas de harina en el escaparate. Pequeñas, de gata.', 'Ya sé que es imposible que sea ella… pero ¿y si es una de sus nietas?'], reward: { kind: 'food', food: 'jamon', n: 2 } },
    { title: 'Una sombra blanca', need: 7, lines: ['La vi. Te lo juro. Una gata blanca, viejita, mirándome desde el tejado de la plaza.', 'Si la ves tú, no la asustes. Déjale un poco de agua, que estará cansada.'], reward: { kind: 'food', food: 'pollo', n: 3 } },
    { title: 'Pementa ha vuelto', need: 12, lines: ['¡Está aquí! Es la nieta de Pementa, lo sé por esa mancha en la oreja. Se llama igual, ¿verdad que sí, bonita?', 'Gracias por cuidar de todos. Este barrio es más de ellos que nuestro.'], reward: { kind: 'decor', id: 'manta-cuadros', name: 'Manta de cuadros' } },
  ],
  ramon: [
    { title: 'El quiosquero callado', need: 0, lines: ['Yo aquí, vendiendo periódicos. Cuarenta años. Se ve pasar mucha vida desde un quiosco.'] },
    { title: 'La sección de pasatiempos', need: 3, lines: ['¿Te gustan los crucigramas? Los del sábado los hago yo. Bueno, no lo digas por ahí.'], reward: { kind: 'food', food: 'galletas', n: 3 } },
    { title: 'Poemas sin firma', need: 7, lines: ['Te voy a contar un secreto: los poemas sobre gatos de la última página… son míos. Firmo como «O Gato Pardo».', 'A Lucáreo le dediqué uno. No se enteró, claro: es un gato.'], reward: { kind: 'food', food: 'atun', n: 4 } },
    { title: 'Para ti', need: 12, lines: ['Te he escrito uno. Se llama «Quien da de comer a los gatos no está nunca solo». Guárdalo.', '(Ramón te da un papel doblado con una huella de café. Lo lees y sonríes.)'], reward: { kind: 'decor', id: 'caseta', name: 'Caseta' } },
  ],
  lua: [
    { title: 'La veterinaria del bocadillo', need: 0, lines: ['Cada día como en la Alameda con Chispa, mi galga. Así de paso reviso a los de aquí.'] },
    { title: 'Un sueño de madera', need: 3, lines: ['Mi sueño es un refugio de verdad, con mantas y un tejado, para los que no tienen dónde ir cuando llueve.'], reward: { kind: 'food', food: 'pollo', n: 3 } },
    { title: 'Manos a la obra', need: 7, lines: ['Si el barrio ayuda un poco, en el descampado cabe un refugio precioso. ¿Me echas una mano dándoles de comer?'], reward: { kind: 'food', food: 'galletas', n: 4 } },
    { title: 'El refugio', need: 10, requires: { project: 'refugio' }, lines: ['¡Lo hemos hecho! El refugio del descampado ya tiene inquilinos. Chispa se ha quedado a vivir en el umbral.', 'Gracias. De verdad.'], reward: { kind: 'decor', id: 'manta-cuadros', name: 'Manta de cuadros' } },
  ],
  xan: [
    { title: 'Mareas', need: 0, lines: ['Cuarenta años en la mar. Ahora salgo a correr por el muelle, que el médico dice que el corazón es un motor.'] },
    { title: 'Mariñeiro', need: 3, lines: ['Tuve un perro que se llamaba Mariñeiro. Venía conmigo en la barca y ladraba a las gaviotas.', 'Los gatos del muelle me recuerdan a él: todos quieren sardina y nadie quiere trabajar.'], reward: { kind: 'food', food: 'sardinas', n: 5 } },
    { title: 'La caseta de las redes', need: 7, lines: ['En la caseta guardo su collar. A veces lo saco y lo miro. Qué bobo, ¿no?', 'No, no es bobo. Es querer.'], reward: { kind: 'food', food: 'atun', n: 4 } },
    { title: 'Un perro en el muelle', need: 12, lines: ['¿Has visto a ese perro que corre conmigo por las mañanas? No es mío… pero ya no se separa.', 'Le voy a poner el collar de Mariñeiro. Creo que a él le habría gustado.'], reward: { kind: 'food', food: 'sardinas', n: 8 } },
  ],
};

export interface NeighborState {
  points: number;
  /** último día que habló contigo (la charla suma una vez al día) */
  talkDay: number;
  /** capítulos ya leídos */
  read: number;
}

/** Capítulos desbloqueados con estos puntos y proyectos terminados. */
export function unlockedChapters(id: string, st: NeighborState, projects: Record<string, { done: boolean }>): number {
  const ch = STORIES[id] ?? [];
  let n = 0;
  for (const c of ch) {
    if (st.points < c.need) break;
    if (c.requires?.project && !projects[c.requires.project]?.done) break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Rutinas por el barrio
export type Activity = 'stand' | 'stroll' | 'jog' | 'sit';
export interface ScheduleSlot {
  from: number;
  to: number;
  zone: string;
  at: [number, number];
  activity: Activity;
}
export const SCHEDULES: Record<string, ScheduleSlot[]> = {
  maruxa: [
    { from: 6.5, to: 14, zone: 'plaza', at: [8, 3], activity: 'stand' },
    { from: 16, to: 18, zone: 'calle', at: [6, 12], activity: 'stroll' },
    { from: 18, to: 21, zone: 'plaza', at: [8, 4], activity: 'stand' },
  ],
  ramon: [
    { from: 8, to: 14, zone: 'plaza', at: [16, 6], activity: 'stand' },
    { from: 17, to: 20.5, zone: 'parque', at: [10, 12], activity: 'sit' },
  ],
  lua: [
    { from: 10, to: 12, zone: 'mercado', at: [9, 9], activity: 'stroll' },
    { from: 13, to: 15.5, zone: 'parque', at: [11, 15], activity: 'stand' },
    { from: 17, to: 19.5, zone: 'plaza', at: [11, 16], activity: 'stroll' },
  ],
  xan: [
    { from: 6, to: 9, zone: 'puerto', at: [12, 6], activity: 'jog' },
    { from: 9, to: 13, zone: 'puerto', at: [13, 8], activity: 'stand' },
    { from: 13, to: 15, zone: 'mercado', at: [14, 13], activity: 'stand' },
    { from: 18, to: 21, zone: 'puerto', at: [13, 8], activity: 'stroll' },
  ],
};

/** Dónde está un vecino a esta hora (o null si está en casa). */
export function whereIs(id: string, hour: number): ScheduleSlot | null {
  return (SCHEDULES[id] ?? []).find((s) => hour >= s.from && hour < s.to) ?? null;
}
