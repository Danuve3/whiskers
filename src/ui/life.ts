// Interfaz de la vida propia de los animales: líneas de la ficha, adopciones, cartas, momentos y
// el minijuego de ritmo para enseñar trucos.
import { Sheet, el, button, haptic } from './kit.ts';
import { portrait } from './metaUI.ts';
import { getFrames, type Look } from '../sprites/animals.ts';
import { species, type AnimalData } from '../sim/model.ts';
import { bestFriend, stageName, MOMENTS, TRICKS, type Routine, type MomentId } from '../sim/life.ts';
import type { MetaState } from '../meta/controller.ts';
import { PALETTE } from '../gfx/palette.ts';
import * as sfx from '../audio/sfx.ts';

/** Lo que sabes de su vida (para la ficha). */
export function lifeLines(D: AnimalData, all: AnimalData[], routine: Routine | null, now: number, neighborName: (id: string) => string): string[] {
  const out: string[] = [];
  if (D.adoptedBy) out.push(`Vive con ${neighborName(D.adoptedBy)} desde el ${new Date(D.adoptedAt ?? now).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`);
  const st = stageName(D, now);
  if (st) out.push(`Es un ${st}: crece día a día.`);
  if (D.mother) {
    const m = all.find((a) => a.id === D.mother);
    if (m) out.push(`Su madre es ${m.name}.`);
  }
  const f = bestFriend(D, all);
  if (f) out.push(`Su mejor amigo: ${f.name}.`);
  if (routine) out.push(D.routineKnown ? `Costumbre: ${routine.text}.` : 'Tiene una costumbre que aún no has descubierto.');
  if (D.tricks?.length) out.push(`Trucos: ${D.tricks.map((t) => TRICKS.find((x) => x.id === t)?.name.toLowerCase()).join(', ')}.`);
  return out;
}

// ---------------------------------------------------------------- Adopción
export function openAdoption(D: AnimalData, adopter: string, onAnswer: (yes: boolean) => void): void {
  const sheet = new Sheet('Un hogar para ' + D.name, 'adopt');
  const p = portrait(D, false, 48, 48);
  p.classList.add('big');
  const quien = species(D) === 'cat' ? 'gato' : 'perro';
  sheet.body.append(
    el('div', { class: 'talk' }, p, el('div', { class: 'say' }, `${adopter} lleva días viendo lo bien que cuidas a ${D.name}. «¿Te importaría que se viniera a vivir conmigo? Le tengo preparado un rincón al sol. Te escribiré para contarte qué tal le va.»`)),
    el('div', { class: 'small center' }, `Si dices que sí, ${D.name} se muda con ${adopter} y te llegarán cartas. Si no, se queda en el barrio como hasta ahora: los dos caminos están bien.`),
  );
  let answered = false;
  const answer = (yes: boolean) => {
    if (answered) return;
    answered = true;
    onAnswer(yes);
    void sheet.close();
  };
  sheet.body.append(el('div', { class: 'footer' }, button(`Que se quede en el barrio`, () => answer(false)), button(`¡Claro! Será un ${quien} feliz`, () => answer(true), 'primary')));
  sheet.open();
}

// ---------------------------------------------------------------- Álbum: momentos y cartas
export function momentsGrid(grid: HTMLElement, meta: MetaState): string {
  const got = meta.moments ?? {};
  for (const [id, m] of Object.entries(MOMENTS) as [MomentId, (typeof MOMENTS)[MomentId]][]) {
    const v = got[id];
    grid.append(el('div', { class: `card-mini moment panel ${v ? '' : 'unknown'}` }, el('div', { class: 'star' }, v ? '✦' : '?'), el('div', { class: 'nm' }, v ? m.name : '???'), el('div', { class: 'small' }, v ? `${m.text} ×${v.n}` : 'Momento por descubrir')));
  }
  return `Momentos: ${Object.keys(got).length} de ${Object.keys(MOMENTS).length}`;
}

export function lettersList(box: HTMLElement, meta: MetaState, animals: AnimalData[]): string {
  const ls = [...(meta.letters ?? [])].sort((a, b) => b.at - a.at);
  for (const L of ls) {
    const a = animals.find((x) => x.id === L.animal);
    L.read = true;
    box.append(el('div', { class: 'letter panel' }, a ? portrait(a, false, 36, 36) : null, el('div', { class: 'txt' }, el('div', { class: 'small' }, `${L.from} · ${new Date(L.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`), el('div', {}, L.text))));
  }
  return ls.length ? `${ls.length} ${ls.length === 1 ? 'carta' : 'cartas'}` : 'Cuando un vecino adopte a alguien, sus cartas llegarán aquí.';
}

// ---------------------------------------------------------------- Trucos: minijuego de ritmo
/**
 * Suenan notas que avanzan hacia el perro; hay que tocar cuando cada una llega a la marca.
 * Tranquilo: 8 notas, basta con acertar 6, y si no sale se puede repetir sin castigo.
 */
export function openTrickGame(D: AnimalData, look: Look, trick: string, onLearned: () => void): void {
  const sheet = new Sheet(`Enseñar a ${D.name}: ${trick.toLowerCase()}`, 'trick');
  const W = 120, H = 64;
  const PAW = ['..xx.xx..', '..xx.xx..', 'xx.....xx', 'xx.xxx.xx', '..xxxxx..', '.xxxxxxx.', '.xxxxxxx.', '..xxxxx..'];
  const c = el('canvas', { width: W, height: H, class: 'vignette' });
  const x = c.getContext('2d')!;
  const msg = el('p', { class: 'wl center' }, 'Toca «¡Ahora!» cuando cada huella llegue al círculo.');
  const N = 8, BEAT = 0.9, LEAD = 1.6;
  let t = -1, hits = 0, done = false, alive = true, last = performance.now();
  const notes = Array.from({ length: N }, (_, i) => ({ at: LEAD + i * BEAT * (i % 3 === 2 ? 1.5 : 1) + (i > 2 ? 0.45 : 0), hit: false, miss: false }));
  const end = notes[N - 1].at + 1;
  const frames = getFrames(look, 'sit', 1), wag = getFrames(look, 'wag', 1);
  let happy = 0;
  const now = () => t;
  const press = button('¡Ahora!', () => {
    if (done) {
      restart();
      return;
    }
    const n = notes.find((q) => !q.hit && !q.miss && Math.abs(q.at - now()) < 0.22);
    if (n) {
      n.hit = true;
      hits++;
      happy = 0.6;
      sfx.ui('tap');
      haptic(8);
    } else sfx.ui('nope');
  }, 'primary');
  const restart = () => {
    t = -1;
    hits = 0;
    done = false;
    for (const n of notes) n.hit = n.miss = false;
    press.textContent = '¡Ahora!';
    msg.textContent = 'Toca «¡Ahora!» cuando cada huella llegue al círculo.';
  };
  const loop = (ms: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ms - last) / 1000);
    last = ms;
    if (!done) t += dt;
    happy = Math.max(0, happy - dt);
    for (const n of notes) if (!n.hit && !n.miss && t > n.at + 0.25) n.miss = true;
    if (!done && t > end) {
      done = true;
      if (hits >= 6) {
        msg.textContent = `¡${D.name} ha aprendido a ${trick.toLowerCase()}! Te lo hará cuando vayas a saludarle.`;
        press.textContent = 'Otra vez';
        sfx.gift();
        haptic([16, 60, 16]);
        onLearned();
      } else {
        msg.textContent = `${hits} de ${N}. Casi: ${D.name} no tiene prisa, prueba otra vez.`;
        press.textContent = 'Otra vez';
      }
    }
    // dibujo: suelo, marca y huellas que avanzan
    x.fillStyle = PALETTE.cal3;
    x.fillRect(0, 0, W, H);
    x.fillStyle = PALETTE.cal2;
    x.fillRect(0, 46, W, 18);
    const mx = 62;
    x.fillStyle = PALETTE.wood2;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      x.fillRect(Math.round(mx + Math.cos(ang) * 8), Math.round(24 + Math.sin(ang) * 8), 1, 1);
    }
    for (const n of notes) {
      const px = Math.round(mx + (n.at - t) * 40);
      if (px < -6 || px > W + 6 || n.hit) continue;
      x.fillStyle = n.miss ? PALETTE.cal1 : PALETTE.wood1;
      // huella: cuatro dedos y la almohadilla
      PAW.forEach((row, j) => [...row].forEach((ch, i) => ch === 'x' && x.fillRect(px - 4 + i, 20 + j, 1, 1)));
    }
    const f = (happy > 0 ? wag : frames)[Math.floor(ms / 150) % (happy > 0 ? wag.length : frames.length)];
    x.drawImage(f.canvas, 26 - f.ox, 58 - f.oy);
    x.fillStyle = PALETTE.coral;
    for (let i = 0; i < hits; i++) x.fillRect(W - 6 - i * 5, 4, 3, 3);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  sheet.body.append(c, msg, el('div', { class: 'footer' }, press, button('Volver', () => {
    alive = false;
    void sheet.close();
  })));
  sheet.open();
}
