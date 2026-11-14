// Pantalla de título: el barrio al atardecer de fondo (el propio juego, con la cámara
// paseando) y un gato durmiendo sobre un cojín. Tocar para empezar.
import { el } from './kit.ts';
import { getFrames } from '../sprites/animals.ts';
import { makeLook } from '../sprites/breeds.ts';
import { PALETTE } from '../gfx/palette.ts';

export function showTitle(onStart: () => void): void {
  const root = el('div', { class: 'title-screen' });
  const logo = el('div', { class: 'logo' }, 'Whiskers');
  const sub = el('div', { class: 'tagline' }, 'Un barrio, muchos bigotes');
  // gato dormido sobre un cojín (sprite real del juego, a escala entera)
  const c = el('canvas', { width: 64, height: 40, class: 'sleeper' });
  const x = c.getContext('2d')!;
  const frames = getFrames(makeLook('naranja', 0, 5), 'lie', 0);
  let fi = 0, acc = 0, last = performance.now(), alive = true;
  const zs = el('div', { class: 'zz' }, 'z');
  const draw = (now: number) => {
    if (!alive) return;
    acc += now - last;
    last = now;
    while (acc > frames[fi].dur) {
      acc -= frames[fi].dur;
      fi = (fi + 1) % frames.length;
    }
    x.clearRect(0, 0, 64, 40);
    // cojín de cuadros
    x.fillStyle = PALETTE.tile1;
    x.fillRect(8, 30, 48, 8);
    x.fillStyle = PALETTE.coral;
    x.fillRect(10, 29, 44, 7);
    x.fillStyle = PALETTE.pink;
    for (let i = 12; i < 52; i += 6) x.fillRect(i, 30, 2, 5);
    x.fillStyle = PALETTE.tile0;
    x.fillRect(8, 37, 48, 1);
    const f = frames[fi];
    x.drawImage(f.canvas, 32 - f.ox, 34 - f.oy);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  const tap = el('div', { class: 'tap' }, 'Toca para empezar');
  root.append(el('div', { class: 'head' }, logo, sub), el('div', { class: 'foot' }, el('div', { class: 'sleepwrap panel' }, c, zs), tap));
  document.getElementById('ui')!.append(root);
  const go = () => {
    root.removeEventListener('pointerup', go);
    root.classList.add('out');
    setTimeout(() => {
      alive = false;
      root.remove();
    }, 700);
    onStart();
  };
  root.addEventListener('pointerup', go);
}
