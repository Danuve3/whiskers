// Bienvenida «Mientras no estabas…», decoración colocable y minijuego de pesca.
import { Sheet, el, button } from './kit.ts';
import { matrix } from '../fx/sprites.ts';
import { getFrames } from '../sprites/animals.ts';
import { makeLook } from '../sprites/breeds.ts';
import { PALETTE, type ColorName } from '../gfx/palette.ts';
import * as sfx from '../audio/sfx.ts';

// ---------------------------------------------------------------- Decoración
type Key = Record<string, ColorName | null>;
const DK: Key = { '.': null, k: 'ink2', b: 'wood3', B: 'wood2', f: 'wood1', F: 'wood3', w: 'cal4', s: 'sky', S: 'water2', T: 'tile2', t: 'tile1', r: 'coral', R: 'rose', o: 'tile3', O: 'tile2' };
export const DECOR_ART: Record<string, string[]> = {
  comedero: ['....kkkkkkkk....', '...kbbbbbbbbk...', '..kBfFfFfFfFBk..', '.kBbFfFfFfFfbBk.', 'kbbbbbbbbbbbbbbk', 'kBBBBBBBBBBBBBBk', '.kkkkkkkkkkkkkk.'],
  bebedero: ['...kkkkkkkk...', '..kwwssssswk..', '.kTsSssssSsTk.', 'kTTTTTTTTTTTTk', '.kTttttttttTk.', '..kkkkkkkkkk..'],
  'manta-cuadros': ['......kkkk......', '....kkrRrRkk....', '..kkrRwrRwrRkk..', 'kkrRwrRrRwrRrRkk', '..kkRrRwrRrRkk..', '....kkrRrRkk....', '......kkkk......'],
  caseta: ['.......kk.......', '.....kkooKk.....'.replace('K', 'k'), '...kkooOOookk...', '.kkoooOOOOooookk', 'kOOOOOOOOOOOOOOk', '.kbbbbkkkkbbbbk.', '.kbbbk....kbbbk.', '.kbbbk....kbbbk.', '.kBBBkkkkkkBBBk.', '..kkkkkkkkkkkk..'],
};
export function decorSprite(id: string): HTMLCanvasElement {
  return matrix('decor-' + id, DECOR_ART[id] ?? DECOR_ART.comedero, DK);
}

// ---------------------------------------------------------------- Bienvenida
export interface Welcome {
  hours: number;
  arrivals: string[];
  gifts: number;
  missed: string[];
  served?: number;
}

export function openWelcome(w: Welcome): void {
  const sheet = new Sheet('Mientras no estabas…', 'welcome');
  // viñeta: el felpudo del portal con un gato dormido y regalos
  const c = el('canvas', { width: 120, height: 64, class: 'vignette' });
  const x = c.getContext('2d')!;
  x.fillStyle = PALETTE.cal2;
  x.fillRect(0, 0, 120, 64);
  x.fillStyle = PALETTE.stone2;
  for (let i = 0; i < 120; i += 12) x.fillRect(i, 44, 1, 20);
  x.fillRect(0, 44, 120, 1);
  // puerta azul
  x.fillStyle = PALETTE.water1;
  x.fillRect(36, 2, 48, 42);
  x.fillStyle = PALETTE.water2;
  x.fillRect(38, 4, 20, 38);
  x.fillRect(62, 4, 20, 38);
  x.fillStyle = PALETTE.mustard;
  x.fillRect(57, 24, 2, 3);
  // felpudo
  x.fillStyle = PALETTE.tile1;
  x.fillRect(30, 50, 60, 10);
  x.fillStyle = PALETTE.tile2;
  for (let i = 32; i < 88; i += 4) x.fillRect(i, 52, 2, 6);
  const f = getFrames(makeLook('europeo', 0, 1), 'sleep', 0)[1];
  x.drawImage(f.canvas, 60 - f.ox, 58 - f.oy);
  if (w.gifts) {
    x.drawImage(matrix('gift-chapa', ['.kkk.', 'kryrk', 'kyryk', 'kryrk', '.kkk.'], { '.': null, k: 'stone1', r: 'coral', y: 'mustard' }), 92, 52);
    x.drawImage(matrix('gift-hoja', ['...gg', '..gGg', '.gGg.', 'gGg..', 'b....'], { '.': null, g: 'tile3', G: 'tile2', b: 'wood1' }), 22, 52);
  }
  const h = Math.round(w.hours);
  const lines: string[] = [h >= 1 ? `Han pasado ${h} ${h === 1 ? 'hora' : 'horas'}. El barrio te estaba esperando.` : 'Has vuelto enseguida. ¡Qué bien!'];
  if (w.arrivals.length) lines.push(`Han llegado caras nuevas: ${w.arrivals.join(', ')}.`);
  if (w.gifts) lines.push(`Hay ${w.gifts} ${w.gifts === 1 ? 'regalo' : 'regalos'} esperándote en el portal.`);
  if (w.missed.length) lines.push(`${w.missed.join(' y ')} ${w.missed.length === 1 ? 'te ha' : 'te han'} echado de menos.`);
  if (w.served) lines.push(`Tus comederos y bebederos han servido ${w.served} ${w.served === 1 ? 'ración' : 'raciones'}.`);
  lines.push(w.served ? 'Algunos tienen un poquito de hambre o de sed, nada grave.' : 'Tienen un poquito de hambre y de sed, nada grave.');
  sheet.body.append(c, ...lines.map((l) => el('p', { class: 'wl' }, l)), el('div', { class: 'footer' }, button('¡Vamos!', () => void sheet.close(), 'primary')));
  sheet.open();
}

// ---------------------------------------------------------------- Pesca
/** Minijuego tranquilo: esperar a que pique y tirar. Sin castigo si se escapa. */
export function openFishing(onCatch: () => void): void {
  const sheet = new Sheet('Pesca en el espigón', 'fishing');
  const c = el('canvas', { width: 120, height: 72, class: 'vignette' });
  const x = c.getContext('2d')!;
  const msg = el('p', { class: 'wl center' }, 'Lanza el anzuelo y espera a que pique…');
  let state: 'idle' | 'wait' | 'bite' | 'caught' | 'miss' = 'idle';
  let t = 0, biteAt = 0;
  const act = button('Lanzar', () => {
    if (state === 'idle' || state === 'caught' || state === 'miss') {
      state = 'wait';
      t = 0;
      biteAt = 2 + Math.random() * 4;
      msg.textContent = 'Paciencia… (el mar no tiene prisa)';
      act.textContent = 'Tirar';
      sfx.pour();
    } else if (state === 'bite') {
      state = 'caught';
      msg.textContent = '¡Una sardina! Al cubo.';
      act.textContent = 'Otra vez';
      sfx.gift();
      onCatch();
    } else if (state === 'wait') {
      msg.textContent = 'Todavía no ha picado. Espera a ver el «!»';
    }
  }, 'primary');
  let alive = true;
  let last = performance.now();
  const loop = (now: number) => {
    if (!alive) return;
    const dt = (now - last) / 1000;
    last = now;
    t += dt;
    if (state === 'wait' && t > biteAt) {
      state = 'bite';
      t = 0;
      sfx.ui('open');
    }
    if (state === 'bite' && t > 1.1) {
      state = 'miss';
      msg.textContent = 'Se ha escapado… no pasa nada, inténtalo otra vez.';
      act.textContent = 'Lanzar';
    }
    // dibujo: mar con ondas, sedal y corcho
    x.fillStyle = PALETTE.water2;
    x.fillRect(0, 0, 120, 72);
    x.fillStyle = PALETTE.water3;
    for (let i = 0; i < 10; i++) {
      const yy = (i * 9 + Math.floor(now / 200)) % 72;
      x.fillRect((i * 37 + Math.floor(now / 90)) % 130 - 10, yy, 8, 1);
    }
    x.fillStyle = PALETTE.water1;
    for (let i = 0; i < 6; i++) x.fillRect((i * 23 + Math.floor(now / 140)) % 130 - 10, (i * 13 + 5) % 72, 5, 1);
    // espigón
    x.fillStyle = PALETTE.cal1;
    x.fillRect(0, 60, 120, 12);
    x.fillStyle = PALETTE.stone2;
    x.fillRect(0, 60, 120, 1);
    if (state !== 'idle') {
      const bx = 70, by = 30 + Math.round(Math.sin(now / 300) * 1) + (state === 'bite' ? 3 + Math.round(Math.sin(now / 50) * 2) : 0);
      x.fillStyle = PALETTE.ink2;
      for (let i = 0; i < 30; i++) x.fillRect(Math.round(110 - (110 - bx) * (i / 30)), Math.round(4 + (by - 4) * (i / 30) ** 1.6), 1, 1);
      x.fillStyle = PALETTE.coral;
      x.fillRect(bx - 1, by - 2, 3, 2);
      x.fillStyle = PALETTE.cal4;
      x.fillRect(bx - 1, by, 3, 1);
      if (state === 'bite') {
        x.fillStyle = PALETTE.mustard;
        x.fillRect(bx + 4, by - 10, 2, 5);
        x.fillRect(bx + 4, by - 4, 2, 2);
      }
      if (state === 'caught') {
        x.drawImage(matrix('sardina', ['..kkkkk.k', '.kSswwwkSk', 'kwSSSSSSSk', '.kkkkkkk.k'], { '.': null, k: 'water1', S: 'water3', s: 'ink', w: 'cal4' }), bx - 5, by - 14);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  sheet.body.append(c, msg, el('div', { class: 'footer' }, act, button('Volver', () => {
    alive = false;
    void sheet.close();
  })));
  sheet.open();
}
