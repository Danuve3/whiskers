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
const NEED_ART: Record<'fish' | 'meat' | 'water' | 'hurt' | 'heart' | 'yarn' | 'ball', string[]> = {
  // pescado (gatos) y muslo de pollo (perros), gota y cruz de farmacia
  fish: BUBBLE(['.......', '.SSSS.S', 'SKmmmSS', '.cccc.m', '.......']),
  meat: BUBBLE(['.oo....', 'oYoo...', 'oooO...', '.OOOc..', '....cc.']),
  water: BUBBLE(['...s...', '..sss..', '.sSsss.', '.sSSss.', '..sss..']),
  hurt: BUBBLE(['...g...', '...g...', '.ggggG.', '...g...', '...G...']),
  // peticiones: que le acaricies (corazón) o jugar (ovillo para gatos, pelota para perros)
  heart: BUBBLE(['.rr.rr.', 'rpRrrrr', 'rRrrrrr', '.rrrrr.', '...r...']),
  yarn: BUBBLE(['..LLL..', '.LlLlL.', '.lLlLl.', '..LLL.L', '......L']),
  ball: BUBBLE(['..rrr..', '.rwrrr.', '.rrrrR.', '.rrrRR.', '..RRR..']),
};
const NEED_KEY: Key = { '.': null, k: 'ink2', K: 'ink', w: 'cal4', c: 'cal2', s: 'sky', S: 'water2', m: 'stone3', o: 'tile3', O: 'tile2', Y: 'butter', g: 'veg3', G: 'veg2', r: 'coral', R: 'rose', p: 'pink', l: 'lilac', L: 'plum' };
export function needBubble(kind: 'food' | 'water' | 'hurt' | 'heart' | 'play', cat = false): HTMLCanvasElement {
  const k = kind === 'food' ? (cat ? 'fish' : 'meat') : kind === 'play' ? (cat ? 'yarn' : 'ball') : kind;
  return matrix('need-' + k, NEED_ART[k], NEED_KEY);
}

// Caja de cartón (momento raro «un gato en una caja»): parte de atrás (paredes de dentro y
// solapas) y de delante, para que el gato quede dentro. Ancla: centro de la base en (15, 7).
const boxCache: Partial<Record<'back' | 'front', HTMLCanvasElement>> = {};
export function cardboardBox(part: 'back' | 'front'): HTMLCanvasElement {
  const hit = boxCache[part];
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 31;
  c.height = 26;
  const x = c.getContext('2d')!;
  const px = (col: ColorName, X: number, Y: number) => {
    x.fillStyle = PALETTE[col];
    x.fillRect(X, Y + 4, 1, 1); // +4: sitio para las solapas por arriba
  };
  const H = 9; // alto de las caras
  if (part === 'front') {
    for (let X = 1; X <= 29; X++) {
      const top = X <= 15 ? 7 + Math.floor((X - 1) / 2) : 14 - Math.floor((X - 15) / 2);
      for (let Y = top; Y <= top + H; Y++) px(X <= 15 ? 'wood3' : 'wood2', X, Y);
      px('wood4', X, top); // canto de arriba
      px('wood0', X, top + H + 1); // contorno de abajo
      if (X === 15) for (let Y = top; Y <= top + H; Y++) px('wood1', X, Y); // arista delantera
    }
    for (let Y = 7; Y <= 7 + H + 1; Y++) {
      px('wood0', 0, Y);
      px('wood0', 30, Y);
    }
    // cinta de embalar y un garabato de rotulador
    for (let X = 5; X <= 9; X++) px('butter', X, 11 + Math.floor((X - 1) / 2));
    px('wood1', 21, 15);
    px('wood1', 22, 14);
    px('wood1', 23, 15);
  } else {
    for (let X = 1; X <= 29; X++) {
      const rim = X <= 15 ? 7 - Math.floor((X - 1) / 2) : Math.floor((X - 15) / 2);
      for (let Y = rim; Y <= rim + 7; Y++) px('wood1', X, Y); // pared de dentro, en sombra
      px('wood4', X, rim);
      // solapas abiertas: suben 4 px y se abren un poco hacia fuera
      for (let k = 1; k <= 4; k++) px(X % 6 === 0 ? 'wood2' : 'wood3', X + (X <= 15 ? -Math.floor(k / 3) : Math.floor(k / 3)), rim - k);
      px('wood0', X + (X <= 15 ? -1 : 1), rim - 5);
    }
  }
  boxCache[part] = c;
  return c;
}

// Gorritos de los visitantes de temporada (se colocan sobre la coronilla del animal)
const HATS: Record<string, { rows: string[]; key: Key }> = {
  lluvia: { rows: ['....kkkkk....', '...kyyyyyk...', '..kyYyyyyyk..', '.kyyyyyyyyyk.', 'kyyyyyyyyyyyk', '.kkkkkkkkkkk.'], key: { '.': null, k: 'wood1', y: 'mustard', Y: 'butter' } },
  marinero: { rows: ['...kkkkk...', '..kwwwwwk..', '.kwwwswwwk.', '.kwwwwwwwk.', 'kSSSSSSSSSk', '.kkkkkkkkk.'], key: { '.': null, k: 'ink2', w: 'cal4', s: 'coral', S: 'water1' } },
  lana: { rows: ['....ww....', '...kwwk...', '..krrrrk..', '.krRrRrrk.', 'krrRrrRrrk', 'kwwwwwwwwk', '.kkkkkkkk.'], key: { '.': null, k: 'tile0', r: 'coral', R: 'tile1', w: 'cal4' } },
  flores: { rows: ['.p.y.l.p.y.', 'pPgYgLgPgYp', '.ggggggggg.'], key: { '.': null, p: 'pink', P: 'rose', y: 'butter', Y: 'mustard', l: 'lilac', L: 'plum', g: 'veg2' } },
  boina: { rows: ['.....k.....', '..kkkkkkk..', '.kbBbbbbbbk', 'kbBbbbbbbbk', '.kkkkkkkkk.'], key: { '.': null, k: 'ink2', b: 'tile1', B: 'tile2' } },
};
export function hatSprite(id: string): HTMLCanvasElement | null {
  const h = HATS[id];
  return h ? matrix('hat-' + id, h.rows, h.key) : null;
}
