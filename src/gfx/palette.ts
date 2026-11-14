// Paleta maestra de Whiskers. Compartida por el build de arte (Node) y el runtime.
// Cada material usa una rampa de 5 tonos (0 = sombra profunda … 4 = luz cálida).
// Las sombras viran a azul/violeta y las luces a amarillo cálido (ver docs/ART_BIBLE.md).

export const PALETTE = {
  // Piedra / adoquín
  stone0: '#3b3149', stone1: '#5a4e68', stone2: '#7d7289', stone3: '#a39aa8', stone4: '#cfc6c4',
  // Teja / ladrillo
  tile0: '#4a2430', tile1: '#7a3a3a', tile2: '#a8573f', tile3: '#d2804f', tile4: '#f0b27a',
  // Madera
  wood0: '#3d2a2e', wood1: '#5e3f36', wood2: '#85603f', wood3: '#b08a57', wood4: '#d9b77e',
  // Vegetación
  veg0: '#1f3a3d', veg1: '#2f5d4a', veg2: '#4c8a4f', veg3: '#7fb85a', veg4: '#c2de7a',
  // Agua
  water0: '#1c2f4f', water1: '#2a4f78', water2: '#3f7ea3', water3: '#6fb2c4', water4: '#b5e3e0',
  // Cal / crema
  cal0: '#6b5a6e', cal1: '#9c8a8f', cal2: '#c9b8a8', cal3: '#ead9c0', cal4: '#fff4dc',
  // Acentos
  coral: '#e86a5c', mustard: '#f2c14e', sky: '#7ec4cf', lilac: '#c98bd1',
  // Noche
  nightTint: '#2b2d5c', lampLight: '#ffd27a',
  // Extras (tinta, pelajes, piel, flores)
  ink: '#1d1828', ink2: '#2e2639',
  pink: '#f4a3a8', rose: '#c4626e', plum: '#8e5fa8',
  butter: '#fbe7a1', peach: '#f7d3b5', tan: '#e3a582',
} as const;

export type ColorName = keyof typeof PALETTE;

export const COLOR_NAMES = Object.keys(PALETTE) as ColorName[];

/** Índice numérico estable de cada color (para buffers indexados). 0 = transparente. */
export const COLOR_INDEX: Record<ColorName, number> = Object.fromEntries(
  COLOR_NAMES.map((n, i) => [n, i + 1]),
) as Record<ColorName, number>;

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** RGB por índice (índice 0 = transparente). */
export const INDEX_RGB: [number, number, number][] = [[0, 0, 0], ...COLOR_NAMES.map((n) => hexToRgb(PALETTE[n]))];

export type Ramp = readonly [ColorName, ColorName, ColorName, ColorName, ColorName];

export const RAMPS = {
  stone: ['stone0', 'stone1', 'stone2', 'stone3', 'stone4'],
  tile: ['tile0', 'tile1', 'tile2', 'tile3', 'tile4'],
  wood: ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'],
  veg: ['veg0', 'veg1', 'veg2', 'veg3', 'veg4'],
  water: ['water0', 'water1', 'water2', 'water3', 'water4'],
  cal: ['cal0', 'cal1', 'cal2', 'cal3', 'cal4'],
  // Rampas compuestas (reutilizan colores de la paleta)
  iron: ['ink', 'ink2', 'stone0', 'stone1', 'stone2'],
  granite: ['stone0', 'stone1', 'stone2', 'stone3', 'cal3'],
  paving: ['stone1', 'stone2', 'cal1', 'cal2', 'cal3'],
  cobble: ['stone1', 'stone2', 'cal1', 'stone3', 'stone4'],
  moss: ['veg0', 'veg1', 'veg2', 'veg3', 'veg4'],
  red: ['tile0', 'rose', 'coral', 'pink', 'peach'],
  yellow: ['wood2', 'wood3', 'mustard', 'butter', 'cal4'],
  blue: ['water0', 'water1', 'water2', 'sky', 'water4'],
  violet: ['stone0', 'plum', 'lilac', 'pink', 'cal4'],
  white: ['cal0', 'cal1', 'cal2', 'cal3', 'cal4'],
  glass: ['water0', 'water1', 'water2', 'water3', 'water4'],
  autumn: ['tile0', 'tile1', 'tile2', 'tile3', 'mustard'],
  // Pelajes y piel
  woodDark: ['ink', 'wood0', 'wood1', 'wood2', 'wood3'],
  fawn: ['wood1', 'wood2', 'wood3', 'wood4', 'butter'],
  earIn: ['rose', 'rose', 'pink', 'pink', 'peach'],
  black: ['ink', 'ink', 'ink2', 'stone0', 'stone1'],
  grey: ['ink2', 'stone0', 'stone1', 'stone2', 'stone3'],
  orange: ['tile0', 'tile1', 'tile2', 'tile3', 'tile4'],
  cream: ['wood1', 'wood3', 'wood4', 'cal3', 'cal4'],
  blueGrey: ['ink2', 'stone1', 'stone2', 'stone3', 'cal3'],
  tanFire: ['wood0', 'wood1', 'wood3', 'tan', 'peach'],
  orangeDark: ['tile0', 'tile0', 'tile1', 'tile2', 'tile3'],
  gold: ['wood0', 'wood2', 'wood3', 'tile4', 'butter'],
  sphynx: ['rose', 'tan', 'pink', 'peach', 'cal4'],
  apricot: ['tile1', 'tile2', 'tile3', 'tile4', 'peach'],
  chocolate: ['ink', 'wood0', 'wood1', 'wood2', 'wood3'],
  cinnamon: ['wood0', 'tile1', 'tile2', 'tile3', 'tile4'],
  silver: ['water1', 'stone2', 'stone3', 'water4', 'cal4'],
  skin: ['tile1', 'tan', 'tan', 'peach', 'cal4'],
  skinWarm: ['tile1', 'tile2', 'tan', 'tile4', 'peach'],
  skinTan: ['wood0', 'wood2', 'wood3', 'tan', 'peach'],
  skinDeep: ['ink2', 'wood0', 'wood1', 'wood2', 'wood3'],
  snow: ['stone2', 'stone3', 'stone4', 'cal4', 'cal4'],
} as const satisfies Record<string, Ramp>;

export type RampName = keyof typeof RAMPS;
