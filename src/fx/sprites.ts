// Mini-sprites dibujados a mano para la vida ambiental y las reacciones.
import { PALETTE, type ColorName } from '../gfx/palette.ts';

type Key = Record<string, ColorName | null>;

const cache = new Map<string, HTMLCanvasElement>();

export function matrix(name: string, rows: string[], key: Key, flip = false): HTMLCanvasElement {
  const k = name + (flip ? '|f' : '');
  let c = cache.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  const w = Math.max(...rows.map((r) => r.length));
  c.width = w;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const col = key[r[i]];
      if (!col) continue;
      x.fillStyle = PALETTE[col];
      x.fillRect(flip ? w - 1 - i : i, j, 1, 1);
    }
  });
  cache.set(k, c);
  return c;
}

const PIG: Key = { '.': null, k: 'ink2', g: 'stone3', s: 'stone2', d: 'stone1', e: 'ink', n: 'plum', v: 'veg2', b: 'cal3', f: 'coral', w: 'cal4' };

export const PIGEON = {
  idle: [
    '.....kk..',
    '....kgek.',
    '....knvkb',
    '.kkkknnk.',
    'kgsgsggk.',
    '.kddsgk..',
    '..kkkk...',
    '...f.f...',
  ],
  peck: [
    '.........',
    '.........',
    '.kkkk....',
    'kgsgskk..',
    '.kddsgnk.',
    '..kkkkvgk',
    '...f.fkekb',
    '.........',
  ],
  fly1: [
    '..kk.......',
    '.kssk......',
    '.ksgsk..kk.',
    '..kgsskkgek',
    '.kgggsgnnkb',
    'kddkkkkkk..',
    '.k.........',
  ],
  fly2: [
    '...........',
    '........kk.',
    '.kkkkkkkgek',
    'kgggsgsnnkb',
    '.kdssskkk..',
    '..kssk.....',
    '...kk......',
  ],
};

export function pigeon(frame: keyof typeof PIGEON, flip: boolean): HTMLCanvasElement {
  return matrix('pig-' + frame, PIGEON[frame], PIG, flip);
}

const LEAF: Key = { '.': null, a: 'tile3', b: 'mustard', c: 'tile2', d: 'tile1', g: 'veg3' };
export const LEAVES = [
  ['ab', 'bc'],
  ['.a', 'ab', 'c.'],
  ['abb', '.cd'],
  ['b.', 'ab'],
];
export function leaf(i: number, palette: 'autumn' | 'green'): HTMLCanvasElement {
  const key: Key = palette === 'green' ? { '.': null, a: 'veg3', b: 'veg4', c: 'veg2', d: 'veg1' } : LEAF;
  return matrix('leaf' + i + palette, LEAVES[i % LEAVES.length], key);
}

export function butterfly(open: boolean, color: ColorName): HTMLCanvasElement {
  return matrix('bf' + open + color, open ? ['c.c', 'cdc', '.k.'] : ['.c.', '.c.', '.k.'], { '.': null, c: color, d: 'ink2', k: 'ink2' });
}

// Reacciones (encima de los animales)
export const HEART = ['.rr.rr.', 'rpprrrr', 'rpwrrrr', 'rrrrrrd', '.rrrrd.', '..rrd..', '...d...'];
export const ALERT = ['.kkk.', 'kyyyk', 'kyyyk', '.kyk.', '.kyk.', '..k..', '.kyk.', '..k..'];
export const ZZZ = ['kkkk', '..k.', '.k..', 'kkkk'];
export const NOTE = ['..kk', '..kk', '..k.', '..k.', 'kkk.', 'kkk.'];

export function heart(): HTMLCanvasElement {
  return matrix('heart', HEART, { '.': null, r: 'coral', p: 'pink', w: 'cal4', d: 'rose' });
}
export function alert(): HTMLCanvasElement {
  return matrix('alert', ALERT, { '.': null, k: 'ink', y: 'mustard' });
}
export function zzz(): HTMLCanvasElement {
  return matrix('zzz', ZZZ, { '.': null, k: 'cal4' });
}
export function note(): HTMLCanvasElement {
  return matrix('note', NOTE, { '.': null, k: 'cal4' });
}

// Ropa tendida: camisetas, calcetines, toallas
export const CLOTHES: { rows: string[]; key: Key }[] = [
  { rows: ['aa.aa', 'aaaaa', '.aba.', '.aaa.', '.aaa.'], key: { '.': null, a: 'sky', b: 'cal4' } },
  { rows: ['bb', 'bb', 'bb', 'bbb', '.bb'], key: { '.': null, b: 'coral' } },
  { rows: ['cccc', 'cdcc', 'cccc', 'cdcc', 'cccc', 'cccc'], key: { '.': null, c: 'cal4', d: 'cal2' } },
  { rows: ['ee.ee', 'eeeee', '.eee.', '.efe.', '.eee.'], key: { '.': null, e: 'mustard', f: 'cal4' } },
  { rows: ['gggg', 'g..g', 'g..g', 'g..g'], key: { '.': null, g: 'water2' } },
  { rows: ['hh', 'hh', 'hh', 'hhh', '.hh'], key: { '.': null, h: 'lilac' } },
];
export function cloth(i: number): HTMLCanvasElement {
  const c = CLOTHES[i % CLOTHES.length];
  return matrix('cloth' + (i % CLOTHES.length), c.rows, c.key);
}

// Bocadillos de necesidad sobre los animales (comida, agua, tirita)
const BUBBLE = (inner: string[]) => [
  '.kkkkkkkkk.',
  'kwwwwwwwwwk',
  ...inner.map((r) => 'kw' + r.replace(/\./g, 'w') + 'wk'),
  'kwwwwwwwwwk',
  '.kkkkwkkkk.',
  '....kwk....',
  '.....k.....',
];
const NEED_ART: Record<'food' | 'water' | 'hurt', string[]> = {
  food: BUBBLE(['.b.b.b.', 'bybyby.', 'rrrrrrr', '.RrrrR.', '..RRR..']),
  water: BUBBLE(['...s...', '..sss..', '.sSsss.', '.sSSss.', '..sss..']),
  hurt: BUBBLE(['.....tt', '...tttt', '..tpwt.', 'tttt...', 'tt.....']),
};
const NEED_KEY: Key = { '.': null, k: 'ink2', w: 'cal4', b: 'wood3', y: 'mustard', r: 'coral', R: 'rose', s: 'sky', S: 'water2', t: 'tan', p: 'peach' };
export function needBubble(kind: 'food' | 'water' | 'hurt'): HTMLCanvasElement {
  return matrix('need-' + kind, NEED_ART[kind], NEED_KEY);
}
