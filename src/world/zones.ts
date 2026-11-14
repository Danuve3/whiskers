// Zonas del barrio: conexiones por la calle baja, rincones para dormir, vecinos, razas,
// ambiente y condiciones para abrirse.
import type { Stats } from '../sim/progress.ts';
import { hearts, type AnimalData } from '../sim/model.ts';

export type ZoneId = 'calle' | 'plaza' | 'parque' | 'mercado' | 'descampado' | 'puerto';

export interface Exit {
  /** rectángulo de tiles [x0, y0, x1, y1) */
  r: [number, number, number, number];
  to: ZoneId;
  spawn: [number, number];
}

export interface ZoneDef {
  id: ZoneId;
  title: string;
  blurb: string;
  homes: [number, number][];
  /** por dónde llegan los animales nuevos */
  entry: [number, number];
  npcs: { id: string; at: [number, number, number] }[];
  /** portal de casa (vóxeles), donde aparecen los regalos */
  portal?: [number, number];
  exits: Exit[];
  breeds: string[];
  cap: number;
  /** animales iniciales al visitarla por primera vez */
  initial: number;
  ambient: { fountain?: boolean; port?: boolean; birds?: number };
  /** muelle para pescar (tile) */
  fishing?: [number, number];
  /** mar: rectángulo en tiles y cota del agua */
  sea?: { r: [number, number, number, number]; z: number };
  unlockHint: string;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  calle: {
    id: 'calle', title: 'Rúa do Portal', blurb: 'Tu calle. Aquí está tu portal, y Nemesio suele dormir en el felpudo.',
    homes: [[4, 19], [9, 5], [10, 12], [5, 8], [8, 16], [4, 14]], entry: [7, 21],
    npcs: [], portal: [58, 300],
    exits: [{ r: [0, 22, 14, 24], to: 'plaza', spawn: [21, 6] }],
    breeds: ['europeo', 'negro', 'naranja', 'bicolor', 'mestizo', 'chihuahua', 'carey'], cap: 5, initial: 1,
    ambient: { birds: 1 }, unlockHint: '',
  },
  plaza: {
    id: 'plaza', title: 'Praza da Fonte', blurb: 'La plaza de la fuente, con la panadería de Maruxa y el quiosco de Ramón.',
    homes: [[17, 9], [8, 18], [16, 17], [6, 9], [12, 5], [18, 13], [5, 13], [10, 18], [14, 5]], entry: [15, 19],
    npcs: [{ id: 'maruxa', at: [8, 3, 1] }, { id: 'ramon', at: [16, 6, 1] }],
    exits: [
      { r: [20, 2, 22, 9], to: 'calle', spawn: [7, 23] },
      { r: [20, 11, 22, 19], to: 'parque', spawn: [21, 12] },
      { r: [2, 20, 11, 22], to: 'mercado', spawn: [13, 19] },
    ],
    breeds: ['europeo', 'galgo', 'siames', 'bicolor', 'naranja', 'calico', 'carlino', 'salchicha', 'mestizo', 'beagle'], cap: 7, initial: 3,
    ambient: { fountain: true, birds: 1 }, unlockHint: 'Da de comer a Nemesio para que se abra la plaza.',
  },
  parque: {
    id: 'parque', title: 'Alameda', blurb: 'Árboles grandes, el templete de música y mucho sitio para correr.',
    homes: [[7, 8], [15, 8], [8, 15], [17, 15], [12, 6], [5, 12]], entry: [20, 12],
    npcs: [{ id: 'lua', at: [11, 15, 1] }],
    exits: [
      { r: [20, 9, 22, 14], to: 'plaza', spawn: [21, 15] },
      { r: [2, 20, 20, 22], to: 'descampado', spawn: [17, 8] },
    ],
    breeds: ['labrador', 'beagle', 'caniche', 'pastor', 'galgo', 'galgoit', 'mainecoon', 'europeo', 'podenco'], cap: 6, initial: 2,
    ambient: { birds: 3 }, unlockHint: 'Conoce a 3 animales para que se abra la Alameda.',
  },
  mercado: {
    id: 'mercado', title: 'Mercado de abastos', blurb: 'Huele a pescado fresco y a fruta. Los gatos lo saben.',
    homes: [[5, 6], [16, 5], [5, 11], [12, 15], [16, 13]], entry: [13, 17],
    npcs: [],
    exits: [
      { r: [8, 18, 18, 20], to: 'plaza', spawn: [5, 21] },
      { r: [18, 3, 20, 18], to: 'puerto', spawn: [20, 8] },
    ],
    breeds: ['bengali', 'siames', 'persa', 'carey', 'calico', 'carlino', 'bulldog', 'naranja', 'azulruso'], cap: 6, initial: 2,
    ambient: { birds: 1 }, unlockHint: 'Consigue que un animal te tenga 3 corazones para abrir el mercado.',
  },
  descampado: {
    id: 'descampado', title: 'O Descampado', blurb: 'Cajas, palés y hierba alta: el refugio de los más tímidos.',
    homes: [[5, 6], [10, 5], [5, 12], [12, 11], [13, 6]], entry: [16, 8],
    npcs: [],
    exits: [{ r: [16, 5, 18, 11], to: 'parque', spawn: [12, 21] }],
    breeds: ['podenco', 'mestizo', 'bodeguero', 'salchicha', 'esfinge', 'calico', 'negro', 'chihuahua'], cap: 6, initial: 2,
    ambient: { birds: 0.5 }, unlockHint: 'Haz 15 cuidados (comida, agua, curas o caricias) para descubrir el descampado.',
  },
  puerto: {
    id: 'puerto', title: 'O Porto', blurb: 'Barcas de colores, redes al sol y gaviotas. Aquí se pesca.',
    homes: [[6, 7], [10, 6], [17, 10], [14, 9], [5, 10]], entry: [20, 6],
    npcs: [{ id: 'xan', at: [13, 8, 1] }],
    exits: [{ r: [21, 3, 22, 12], to: 'mercado', spawn: [19, 10] }],
    breeds: ['mainecoon', 'europeo', 'negro', 'naranja', 'bicolor', 'mastin', 'labrador', 'carey'], cap: 6, initial: 2,
    ambient: { port: true, birds: 0.5 }, fishing: [15, 19], sea: { r: [0, 12, 22, 22], z: 20 },
    unlockHint: 'Haz muy buenas migas con alguien (4 corazones) y conoce a 6 animales para llegar al puerto.',
  },
};

/** ¿Se puede entrar ya? (la calle siempre) */
export function zoneOpen(id: ZoneId, stats: Stats, animals: AnimalData[]): boolean {
  const care = (stats.alimentar ?? 0) + (stats.agua ?? 0) + (stats.curar ?? 0) + (stats.caricias ?? 0);
  const known = animals.filter((a) => a.known).length;
  const best = Math.max(0, ...animals.map((a) => hearts(a)));
  switch (id) {
    case 'calle':
      return true;
    case 'plaza':
      return (stats.alimentar ?? 0) >= 1;
    case 'parque':
      return known >= 3;
    case 'mercado':
      return best >= 3;
    case 'descampado':
      return care >= 15;
    case 'puerto':
      return best >= 4 && known >= 6;
  }
}
