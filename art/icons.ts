// Icono de la app: cara de gato naranja atigrado, dibujada a mano (media cara, se refleja
// y se sombrea con luz desde arriba-izquierda).
import { PALETTE, hexToRgb, type ColorName } from '../src/gfx/palette.ts';

// Media cara izquierda (16 columnas). Claves:
// . fondo  o contorno  L pelaje  S raya  P rosa  K ojo  W blanco
const HALF = [
  '................',
  '................',
  '................',
  '................',
  '....oo..........',
  '....oLo.........',
  '....oLLo........',
  '....oLPLo.......',
  '....oLPPLo......',
  '...oLLPPLLoooooo',
  '...oLLLLLLLSLLLS',
  '..oLLLLLLLLSLLLS',
  '..oLLLLLLLLLLLLL',
  '.oLLLLLLLLLLLLLL',
  '.oLLLLLLLLLLLLLL',
  '.oLLLLLLKKLLLLLL',
  '.oLLLLLKWKKLLLLL',
  'oSSLLLLKKKKLLLLL',
  'oLLLLLLLKKLLLLLL',
  'oSSLLLLLLLLLWWWW',
  'oLPPLLLLLLLWWWWP',
  'oLPPLLLLLLLWoWWo',
  '.oLLLLLLLLLWWooW',
  '.oLLLLLLLLLLWWWW',
  '..oLLLLLLLLLLWWW',
  '...oLLLLLLLLLLLL',
  '....ooLLLLLLLLLL',
  '......oooooooooo',
  '................',
  '................',
  '................',
  '................',
];

export type Matrix = string[];

function face(): Matrix {
  return HALF.map((row) => {
    const right = row.split('').reverse().join('');
    // El ojo derecho conserva el brillo en su lado izquierdo (luz desde la izquierda).
    return row + right.replace('KWK', 'KKW').replace('KKKW', 'KWKK');
  });
}

/** Sombreado por posición: borde inferior/derecho más oscuro, brillo arriba-izquierda. */
function shade(m: Matrix): Matrix {
  const g = m.map((r) => r.split(''));
  const H = g.length, W = g[0].length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : g[y][x]);
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = g[y][x];
      if (c === 'L') {
        // Tono base por diagonal (luz arriba-izquierda), sin partir la cara en dos.
        const lit = x + 0.8 * y < 33;
        let tone = lit ? 'L' : 'O';
        const below = y >= 20 && (at(x, y + 1) === 'o' || at(x, y + 2) === 'o');
        const right = x >= 20 && (at(x + 1, y) === 'o' || at(x + 2, y) === 'o');
        if (below || right) tone = tone === 'L' ? 'O' : 'D';
        out[y][x] = tone;
        const above = at(x, y - 1) === 'o' && at(x - 1, y) === 'o';
        if (above) out[y][x] = 'H';
      }
      if (c === 'o') {
        // Sel-out: contorno más claro en el lado iluminado (arriba-izquierda).
        const inner = at(x + 1, y + 1);
        if ((inner === 'L' || inner === 'P') && y < 14 && x < 16) out[y][x] = 'd';
      }
    }
  return out.map((r) => r.join(''));
}

const KEY: Record<string, ColorName | null> = {
  '.': null, o: 'tile0', d: 'tile1', D: 'tile2', O: 'tile3', L: 'tile4', H: 'peach', S: 'tile2',
  P: 'pink', K: 'ink', W: 'cal4',
};

export interface Icon {
  size: number;
  data: Uint8ClampedArray;
}

/**
 * Dibuja el icono en una rejilla de `grid` celdas (32 de cara + margen) escalado a `size`.
 * maskable: fondo a sangre completa y cara dentro de la zona segura.
 */
export function renderIcon(size: number, maskable: boolean): Icon {
  const m = shade(face());
  const grid = maskable ? 48 : 32;
  const cell = Math.floor(size / grid);
  const off = Math.floor((size - cell * grid) / 2);
  const data = new Uint8ClampedArray(size * size * 4);
  const bg = hexToRgb(PALETTE.cal3);
  const bg2 = hexToRgb(PALETTE.cal2);
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * size + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };
  // Fondo: cuadrado redondeado en escalones de píxel (o sangre completa si es maskable).
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++) {
      let inside = true;
      if (!maskable) {
        const cx = Math.min(gx, grid - 1 - gx), cy = Math.min(gy, grid - 1 - gy);
        inside = !(cx + cy < 3 || (cx === 0 && cy < 5) || (cy === 0 && cx < 5));
      }
      if (maskable && (gx === 0 || gy === 0 || gx === grid - 1 || gy === grid - 1)) {
        // relleno de sangre hasta el borde real del lienzo
        for (let py = -off; py < cell + off; py++)
          for (let px = -off; px < cell + off; px++) {
            const X = off + gx * cell + px, Y = off + gy * cell + py;
            if (X >= 0 && Y >= 0 && X < size && Y < size) put(X, Y, gy >= grid * 0.66 ? bg2 : bg);
          }
      }
      if (!inside) continue;
      const dither = gy > grid * 0.62 && (gx + gy) % 2 === 0 && gy < grid * 0.66;
      const col = gy >= grid * 0.66 || dither ? bg2 : bg;
      for (let py = 0; py < cell; py++) for (let px = 0; px < cell; px++) put(off + gx * cell + px, off + gy * cell + py, col);
    }
  const ox = maskable ? 8 : 0, oy = maskable ? 8 + 1 : 1;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const name = KEY[m[y][x]];
      if (!name) continue;
      const rgb = hexToRgb(PALETTE[name]);
      for (let py = 0; py < cell; py++)
        for (let px = 0; px < cell; px++) put(off + (x + ox) * cell + px, off + (y + oy) * cell + py, rgb);
    }
  return { size, data };
}
