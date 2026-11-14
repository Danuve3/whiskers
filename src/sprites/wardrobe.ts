// Catálogo del armario: opciones del personaje con nombre en español y requisito de desbloqueo.
import type { RampName } from '../gfx/palette.ts';
import type { Outfit } from './player.ts';

export interface Choice<T extends string> {
  id: T;
  name: string;
  /** id de desbloqueo (logro o evento); sin él, disponible desde el principio */
  unlock?: string;
  hint?: string;
}

export const SKINS: Choice<RampName>[] = [
  { id: 'skin', name: 'Clara' },
  { id: 'skinWarm', name: 'Melocotón' },
  { id: 'skinTan', name: 'Morena' },
  { id: 'skinDeep', name: 'Oscura' },
];

export const HAIR_STYLES: Choice<Outfit['hair']>[] = [
  { id: 'media', name: 'Media melena' },
  { id: 'corto', name: 'Corto' },
  { id: 'flequillo', name: 'Flequillo' },
  { id: 'largo', name: 'Largo' },
  { id: 'coleta', name: 'Coleta' },
  { id: 'mono', name: 'Moño' },
  { id: 'rizos', name: 'Rizos' },
  { id: 'rapado', name: 'Rapado' },
];

export const HAIR_COLORS: Choice<RampName>[] = [
  { id: 'woodDark', name: 'Castaño' },
  { id: 'black', name: 'Negro' },
  { id: 'fawn', name: 'Rubio' },
  { id: 'orange', name: 'Pelirrojo' },
  { id: 'white', name: 'Canoso' },
  { id: 'violet', name: 'Lila', unlock: 'logro-cuidador-10', hint: 'Cuida a 10 animales' },
  { id: 'blue', name: 'Azul', unlock: 'logro-agua-25', hint: 'Da agua 25 veces' },
];

export const TOPS: Choice<Outfit['top']>[] = [
  { id: 'jersey', name: 'Jersey' },
  { id: 'camiseta', name: 'Camiseta' },
  { id: 'rebeca', name: 'Rebeca' },
  { id: 'peto', name: 'Peto' },
  { id: 'chubasquero', name: 'Chubasquero', unlock: 'logro-lluvia', hint: 'Sal a cuidar animales bajo la lluvia' },
];

export const CLOTH_COLORS: Choice<RampName>[] = [
  { id: 'yellow', name: 'Mostaza' },
  { id: 'red', name: 'Coral' },
  { id: 'blue', name: 'Azul' },
  { id: 'veg', name: 'Verde' },
  { id: 'white', name: 'Crema' },
  { id: 'wood', name: 'Marrón' },
  { id: 'black', name: 'Negro' },
  { id: 'violet', name: 'Lila', unlock: 'logro-regalos-5', hint: 'Recibe 5 regalos' },
];

export const BOTTOMS: Choice<Outfit['bottom']>[] = [
  { id: 'pantalon', name: 'Pantalón' },
  { id: 'corto', name: 'Pantalón corto' },
  { id: 'falda', name: 'Falda' },
];

export const BOTTOM_COLORS: Choice<RampName>[] = [
  { id: 'blue', name: 'Vaquero' },
  { id: 'woodDark', name: 'Pana' },
  { id: 'black', name: 'Negro' },
  { id: 'grey', name: 'Gris' },
  { id: 'veg', name: 'Verde' },
  { id: 'red', name: 'Coral' },
];

export const SHOES: Choice<RampName>[] = [
  { id: 'woodDark', name: 'Marrón' },
  { id: 'black', name: 'Negro' },
  { id: 'red', name: 'Rojo' },
  { id: 'white', name: 'Blanco' },
];

export const HATS: Choice<Outfit['hat']>[] = [
  { id: 'ninguno', name: 'Sin gorro' },
  { id: 'gorro', name: 'Gorro de lana' },
  { id: 'gorra', name: 'Gorra' },
  { id: 'boina', name: 'Boina' },
  { id: 'sombrero', name: 'Sombrero', unlock: 'logro-verano', hint: 'Juega un día de verano' },
  { id: 'pescador', name: 'Gorro de pescador', unlock: 'logro-pesca-1', hint: 'Pesca tu primera sardina' },
  { id: 'navidad', name: 'Gorro de Navidad', unlock: 'evento-navidad', hint: 'Llega en Navidad' },
];

export const GLASSES: Choice<Outfit['glasses']>[] = [
  { id: 'ninguna', name: 'Sin gafas' },
  { id: 'redondas', name: 'Redondas' },
  { id: 'sol', name: 'De sol', unlock: 'logro-sol', hint: 'Disfruta de un día de sol' },
];

export const ACCS: Choice<Outfit['acc']>[] = [
  { id: 'ninguno', name: 'Nada' },
  { id: 'bufanda', name: 'Bufanda' },
  { id: 'panuelo', name: 'Pañuelo' },
];

export const BAGS: Choice<Outfit['bag']>[] = [
  { id: 'bandolera', name: 'Bolsa de comida' },
  { id: 'mochila', name: 'Mochila' },
];

export const UMBRELLAS: Choice<RampName>[] = [
  { id: 'red', name: 'Coral' },
  { id: 'yellow', name: 'Mostaza' },
  { id: 'blue', name: 'Azul' },
  { id: 'veg', name: 'Verde' },
  { id: 'violet', name: 'Lila' },
];

export function isUnlocked(c: Choice<string>, unlocked: readonly string[]): boolean {
  return !c.unlock || unlocked.includes(c.unlock);
}
