// Minijuegos tranquilos en una hoja: cepillar (deshacer nudos) y bañar (enjabonar, aclarar, secar).
// Sin tiempo ni castigo: se termina cuando se termina.
import { Sheet, el, button, haptic } from './kit.ts';
import { getFrames, type Look } from '../sprites/animals.ts';
import type { AnimalData } from '../sim/model.ts';
import { PALETTE, type ColorName } from '../gfx/palette.ts';
import * as sfx from '../audio/sfx.ts';

const W = 120, H = 80;

/** Píxeles opacos del animal (para saber dónde está su pelo). */
function bodyMask(look: Look, X: number, Y: number): { pts: [number, number][]; draw: (x: CanvasRenderingContext2D, frame?: number) => void } {
  const frames = getFrames(look, 'sit', 1);
  const f = frames[0];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(f.canvas, X - f.ox, Y - f.oy);
  const d = cx.getImageData(0, 0, W, H).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) pts.push([x, y]);
  return { pts, draw: (x, k = 0) => {
    const g = frames[k % frames.length];
    x.drawImage(g.canvas, X - g.ox, Y - g.oy);
  } };
}

/** Coordenadas del dedo en el lienzo. */
function canvasPoint(c: HTMLCanvasElement, e: PointerEvent): [number, number] {
  const r = c.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

// ---------------------------------------------------------------- Cepillar
export function openBrush(D: AnimalData, look: Look, onDone: () => void): void {
  const sheet = new Sheet(`Cepillar a ${D.name}`, 'game');
  const c = el('canvas', { width: W, height: H, class: 'vignette play' });
  const x = c.getContext('2d')!;
  const msg = el('p', { class: 'wl center' }, 'Pasa el dedo por los nudos del pelo hasta que desaparezcan.');
  const body = bodyMask(look, 60, 70);
  // nudos sobre el pelo del cuerpo (ni en las orejas ni en la punta de la cola), lejos unos de otros
  const ys = body.pts.map((p) => p[1]), xs = body.pts.map((p) => p[0]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const inBody = (p: [number, number]) => p[1] > y0 + (y1 - y0) * 0.3 && p[1] < y1 - 4 && p[0] > x0 + (x1 - x0) * 0.15 && p[0] < x1 - (x1 - x0) * 0.2;
  const knots: { x: number; y: number; hp: number }[] = [];
  for (let k = 0; k < 200 && knots.length < 5; k++) {
    const p = body.pts[Math.floor(Math.random() * body.pts.length)];
    if (p && inBody(p) && knots.every((q) => Math.hypot(q.x - p[0], q.y - p[1]) > 7)) knots.push({ x: p[0], y: p[1], hp: 3 });
  }
  const hairs: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  let done = false, alive = true, purrT = 0, brush: [number, number] | null = null;
  const stroke = (px: number, py: number) => {
    brush = [px, py];
    for (const k of knots) {
      if (k.hp <= 0 || Math.hypot(k.x - px, k.y - py) > 9) continue;
      k.hp -= 0.22;
      if (Math.random() < 0.3) hairs.push({ x: k.x, y: k.y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 10, t: 0.8 });
      if (k.hp <= 0) {
        sfx.ui('tap');
        haptic(8);
      }
    }
    if (purrT <= 0) {
      purrT = 2.4;
      sfx.purr(2.2);
    }
    if (!done && knots.every((k) => k.hp <= 0)) {
      done = true;
      msg.textContent = `¡Qué suave ha quedado ${D.name}! Le ha encantado.`;
      sfx.gift();
      haptic([16, 60, 16]);
      onDone();
    }
  };
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture(e.pointerId);
    stroke(...canvasPoint(c, e));
  });
  c.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'touch') stroke(...canvasPoint(c, e));
  });
  c.addEventListener('pointerup', () => (brush = null));
  let last = performance.now();
  const loop = (ms: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ms - last) / 1000);
    last = ms;
    purrT -= dt;
    x.fillStyle = PALETTE.cal3;
    x.fillRect(0, 0, W, H);
    x.fillStyle = PALETTE.cal2;
    x.fillRect(0, 62, W, 18);
    body.draw(x, Math.floor(ms / 400));
    for (const k of knots) {
      if (k.hp <= 0) continue;
      // nudo: maraña de pelo en tonos del pelaje
      x.fillStyle = PALETTE.ink2;
      x.globalAlpha = 0.25 + 0.25 * (k.hp / 3);
      x.fillRect(k.x - 2, k.y - 1, 5, 3);
      x.fillRect(k.x - 1, k.y - 2, 3, 5);
      x.globalAlpha = 1;
      x.fillStyle = PALETTE.cal1;
      x.fillRect(k.x - 1, k.y, 1, 1);
      x.fillRect(k.x + 1, k.y - 1, 1, 1);
    }
    for (const h of hairs) {
      h.t -= dt;
      h.vy += 40 * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      x.fillStyle = PALETTE.cal1;
      x.fillRect(Math.round(h.x), Math.round(h.y), 1, 1);
    }
    for (let i = hairs.length - 1; i >= 0; i--) if (hairs[i].t <= 0) hairs.splice(i, 1);
    // el cepillo bajo el dedo
    if (brush) {
      const [bx, by] = brush;
      x.fillStyle = PALETTE.wood2;
      x.fillRect(Math.round(bx) - 4, Math.round(by) - 6, 9, 3);
      x.fillStyle = PALETTE.cal4;
      for (let i = -4; i <= 4; i += 2) x.fillRect(Math.round(bx) + i, Math.round(by) - 3, 1, 2);
    }
    if (done) {
      const t = (ms / 300) % 6;
      x.fillStyle = PALETTE.butter;
      x.fillRect(60 + Math.round(Math.cos(t) * 18), 30 + Math.round(Math.sin(t) * 10), 1, 1);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  sheet.body.append(c, msg, el('div', { class: 'footer' }, button('Volver', () => {
    alive = false;
    void sheet.close();
  })));
  sheet.open();
}

// ---------------------------------------------------------------- Bañar
export function openBath(D: AnimalData, look: Look, onDone: () => void): void {
  const sheet = new Sheet(`Bañar a ${D.name}`, 'game');
  const c = el('canvas', { width: W, height: H, class: 'vignette play' });
  const x = c.getContext('2d')!;
  const steps = [
    { id: 'jabon', text: 'Enjabona frotando con el dedo.' },
    { id: 'agua', text: 'Aclara: pasa el dedo y cae agua limpia.' },
    { id: 'toalla', text: 'Sécalo con la toalla.' },
  ] as const;
  let step = 0, progress = 0, alive = true, shake = 0, done = false;
  const msg = el('p', { class: 'wl center' }, steps[0].text);
  const body = bodyMask(look, 60, 56);
  const bubbles: { x: number; y: number; r: number }[] = [];
  const drops: { x: number; y: number; vy: number }[] = [];
  const mud = Array.from({ length: 10 }, () => body.pts[Math.floor(Math.random() * body.pts.length)]).filter((p) => p && p[1] > 40);
  let finger: [number, number] | null = null;
  const rub = (px: number, py: number) => {
    finger = [px, py];
    if (done) return;
    const on = body.pts.some(([bx, by]) => Math.abs(bx - px) < 4 && Math.abs(by - py) < 4) || (px > 30 && px < 90 && py > 25 && py < 66);
    if (!on) return;
    progress += 0.012;
    const s = steps[step].id;
    if (s === 'jabon' && Math.random() < 0.5) bubbles.push({ x: px + (Math.random() - 0.5) * 8, y: py + (Math.random() - 0.5) * 6, r: 1 + Math.floor(Math.random() * 2) });
    if (s === 'agua') {
      drops.push({ x: px + (Math.random() - 0.5) * 6, y: py - 12, vy: 30 });
      if (bubbles.length && Math.random() < 0.4) bubbles.splice(Math.floor(Math.random() * bubbles.length), 1);
    }
    if (progress >= 1) {
      progress = 0;
      step++;
      sfx.ui('tap');
      haptic(10);
      if (step >= steps.length) {
        done = true;
        shake = 1.4;
        msg.textContent = `¡${D.name} se sacude y queda limpio y contento!`;
        sfx.gift();
        haptic([16, 60, 16]);
        onDone();
      } else {
        msg.textContent = steps[step].text;
        if (steps[step].id === 'toalla') bubbles.length = 0;
      }
    }
  };
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture(e.pointerId);
    rub(...canvasPoint(c, e));
  });
  c.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'touch') rub(...canvasPoint(c, e));
  });
  c.addEventListener('pointerup', () => (finger = null));
  let last = performance.now();
  const col = (n: ColorName) => PALETTE[n];
  const loop = (ms: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ms - last) / 1000);
    last = ms;
    shake = Math.max(0, shake - dt);
    x.fillStyle = col('water4');
    x.fillRect(0, 0, W, H);
    // azulejos del baño
    x.fillStyle = col('cal3');
    for (let i = 0; i < W; i += 12) x.fillRect(i, 0, 1, 52);
    for (let j = 0; j < 52; j += 12) x.fillRect(0, j, W, 1);
    const ox = shake > 0 ? Math.round(Math.sin(ms / 30) * 2) : 0;
    x.save();
    x.translate(ox, 0);
    body.draw(x, 0);
    // barro (se va al aclarar)
    if (step < 2 && !done) {
      x.fillStyle = col('wood1');
      for (const p of mud) x.fillRect(p[0], p[1], 2, 1);
    }
    for (const b of bubbles) {
      x.fillStyle = col('cal4');
      x.fillRect(b.x - b.r, b.y - b.r, b.r * 2 + 1, b.r * 2 + 1);
      x.fillStyle = col('sky');
      x.fillRect(b.x + b.r, b.y + b.r, 1, 1);
    }
    x.restore();
    // la tina por delante
    x.fillStyle = col('cal4');
    x.fillRect(22, 52, 76, 18);
    x.fillStyle = col('cal2');
    x.fillRect(22, 66, 76, 4);
    x.fillStyle = col('stone1');
    x.fillRect(22, 52, 76, 1);
    x.fillRect(26, 70, 4, 6);
    x.fillRect(90, 70, 4, 6);
    x.fillStyle = col('water3');
    x.fillRect(24, 53, 72, 2);
    // gotas
    for (const d of drops) {
      d.vy += 120 * dt;
      d.y += d.vy * dt;
      x.fillStyle = col('water2');
      x.fillRect(Math.round(d.x), Math.round(d.y), 1, 2);
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].y > 56) drops.splice(i, 1);
    if (shake > 0) for (let i = 0; i < 6; i++) {
      x.fillStyle = col('water3');
      x.fillRect(60 + Math.round(Math.cos(ms / 80 + i) * (22 + i * 3)), 40 + Math.round(Math.sin(ms / 70 + i * 2) * 14), 1, 1);
    }
    // herramienta bajo el dedo
    if (finger && !done) {
      const [fx, fy] = finger;
      const s = steps[step].id;
      x.fillStyle = s === 'jabon' ? col('pink') : s === 'agua' ? col('sky') : col('coral');
      if (s === 'toalla') x.fillRect(Math.round(fx) - 5, Math.round(fy) - 3, 11, 6);
      else x.fillRect(Math.round(fx) - 3, Math.round(fy) - 2, 7, 4);
    }
    // progreso del paso
    x.fillStyle = col('cal2');
    x.fillRect(4, 4, 30, 3);
    x.fillStyle = col('veg3');
    x.fillRect(4, 4, Math.round(30 * Math.min(1, (step + progress) / steps.length)), 3);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  sheet.body.append(c, msg, el('div', { class: 'footer' }, button('Volver', () => {
    alive = false;
    void sheet.close();
  })));
  sheet.open();
}
