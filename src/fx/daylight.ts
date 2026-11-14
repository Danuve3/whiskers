// Gradación de color por momento del día (tinte por canal + levantamiento de sombras).
// Nada de capas negras: cada momento tiene su color. Las luces se pintan después.
import { mix3 } from './pixel.ts';

export interface Grade {
  /** multiplicador por canal (0..1) */
  mul: [number, number, number];
  /** suma por canal (0..255) para levantar sombras hacia el azul */
  lift: [number, number, number];
  /** 0 = pleno día, 1 = noche cerrada (controla luces, ventanas, farolas) */
  night: number;
  /** color del fondo más allá del mapa */
  sky: [number, number, number];
  name: 'amanecer' | 'mañana' | 'mediodía' | 'tarde' | 'atardecer' | 'anochecer' | 'noche';
}

type Key = [number, Grade];
const NIGHT: Grade = { mul: [0.36, 0.39, 0.64], lift: [16, 15, 34], night: 1, sky: [27, 27, 58], name: 'noche' };
const KEYS: Key[] = [
  [0, NIGHT],
  [5.4, NIGHT],
  [6.4, { mul: [0.72, 0.58, 0.76], lift: [22, 8, 26], night: 0.65, sky: [96, 70, 110], name: 'amanecer' }],
  [7.4, { mul: [1.0, 0.84, 0.86], lift: [10, 2, 8], night: 0.12, sky: [210, 160, 170], name: 'amanecer' }],
  [9, { mul: [1, 0.96, 0.92], lift: [0, 0, 0], night: 0, sky: [200, 210, 220], name: 'mañana' }],
  [13, { mul: [1, 1, 1], lift: [0, 0, 0], night: 0, sky: [190, 215, 225], name: 'mediodía' }],
  [17, { mul: [1, 0.95, 0.86], lift: [0, 0, 0], night: 0, sky: [215, 200, 180], name: 'tarde' }],
  [19, { mul: [1, 0.79, 0.6], lift: [8, 0, 4], night: 0.15, sky: [230, 160, 110], name: 'atardecer' }],
  [20, { mul: [0.74, 0.56, 0.72], lift: [16, 6, 26], night: 0.55, sky: [120, 80, 120], name: 'anochecer' }],
  [21.2, { mul: [0.44, 0.42, 0.72], lift: [14, 12, 34], night: 0.88, sky: [44, 40, 78], name: 'noche' }],
  [22.2, NIGHT],
  [24, NIGHT],
];

export function gradeAt(hour: number): Grade {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0 || 1);
      return {
        mul: mix3(a.mul, b.mul, t),
        lift: mix3(a.lift, b.lift, t),
        night: a.night + (b.night - a.night) * t,
        sky: mix3(a.sky, b.sky, t),
        name: t < 0.5 ? a.name : b.name,
      };
    }
  }
  return NIGHT;
}

/** Ajuste por clima: lluvia y niebla apagan y enfrían; nublado desatura un poco. */
export function weatherGrade(g: Grade, rain: number, fog: number, overcast: number): Grade {
  const k = Math.max(rain, overcast * 0.6);
  const mul = mix3(g.mul, [g.mul[0] * 0.8, g.mul[1] * 0.84, g.mul[2] * 0.93], k);
  const lift = mix3(g.lift, [g.lift[0] + 10, g.lift[1] + 12, g.lift[2] + 18], fog * 0.7);
  return { ...g, mul, lift, night: Math.min(1, g.night + k * 0.12), sky: mix3(g.sky, [120, 125, 140], k) };
}
