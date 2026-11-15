// Menú radial sobre un animal, ficha con su información y avisos suaves.
import { el, button, iconImg, Sheet, onBack } from './kit.ts';
import { heartIcon } from './art.ts';
import { canDo, hearts, FOODS, PERSONALITIES, type Action, type FoodId, type AnimalData } from '../sim/model.ts';
import { BREED_BY_ID } from '../sprites/breeds.ts';
import { getFrames, type Look } from '../sprites/animals.ts';
import type { Entry } from '../world/population.ts';
import type { Game } from '../game.ts';
import { PALETTE } from '../gfx/palette.ts';
import * as sfx from '../audio/sfx.ts';
import { species } from '../sim/model.ts';
import { nextTrick } from '../sim/life.ts';

// ---------------------------------------------------------------- Avisos
let toastBox: HTMLDivElement | null = null;
export function toast(msg: string, ms = 2800): void {
  if (!toastBox) {
    toastBox = el('div', { class: 'toasts' });
    document.getElementById('ui')!.append(toastBox);
  }
  const t = el('div', { class: 'toast panel ui-text' }, msg);
  toastBox.append(t);
  while (toastBox.childElementCount > 3) toastBox.firstElementChild!.remove();
  // se va solo, o antes si lo tocas
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  };
  t.addEventListener('pointerup', close);
  setTimeout(close, ms);
}

export function heartsRow(n: number): HTMLElement {
  const row = el('div', { class: 'hearts' });
  for (let i = 0; i < 5; i++) row.append(el('img', { src: heartIcon(i < n), alt: '' }));
  return row;
}

/** Icono de comida según la especie: muslo de pollo para los perros, pescado para los gatos. */
export function foodIcon(D: Parameters<typeof species>[0]): string {
  return species(D) === 'cat' ? 'pez' : 'muslo';
}

// ---------------------------------------------------------------- Menú radial
let current: { root: HTMLElement; close: () => void } | null = null;

export function closeRadial(): void {
  current?.close();
  current = null;
}

/** Píxel de interfaz actual en px CSS. */
function uiUnit(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2;
}

export function openRadial(game: Game, e: Entry, onCard: (e: Entry) => void, onLaser?: (e: Entry) => void, onTrick?: (e: Entry) => void): void {
  closeRadial();
  const D = e.data;
  if (species(D) === 'cat') sfx.meow(e.ent.look.shape.legH);
  else sfx.bark(e.ent.look.shape.legH, e.ent.look.shape.legH < 8 ? 3 : 1);
  if (!D.known) {
    D.known = true;
    toast(`Has conocido a ${D.name}`);
  }
  const root = el('div', { class: 'radial ui-text' });
  const ring = el('div', { class: 'ring' });
  // estado de un vistazo: comida, agua y bienestar (se actualizan en directo)
  const needs: [HTMLElement, () => number][] = [];
  const need = (ico: string, cls: string, v: () => number) => {
    const fill = el('i', {});
    needs.push([fill, v]);
    return el('div', { class: 'need' }, iconImg(ico, 'icon tiny'), el('div', { class: `bar ${cls}` }, fill));
  };
  const needBox = el('div', { class: 'needs' },
    need(foodIcon(D), 'food', () => D.hunger), need('gota', 'thirst', () => D.thirst), need('corazon', 'well', () => D.wellbeing));
  const hurt = el('div', { class: 'hurt' }, iconImg('cruz', 'icon tiny'), 'Necesita una cura');
  // progreso hacia el siguiente corazón
  const trustFill = el('i', {});
  const trustBar = el('div', { class: 'trustbar' }, trustFill);
  const tag = el('div', { class: 'tag panel' }, el('span', {}, D.name), heartsRow(hearts(D)), trustBar, needBox, hurt);
  let lastHearts = hearts(D);
  const refreshNeeds = () => {
    const tr = Math.max(0, Math.min(5, D.trust));
    trustBar.style.display = tr >= 5 ? 'none' : '';
    trustFill.style.width = `${Math.round((tr - Math.floor(tr)) * 100)}%`;
    for (const [fill, v] of needs) fill.style.width = `${Math.round(Math.max(0, Math.min(1, v())) * 100)}%`;
    hurt.style.display = D.injured ? '' : 'none';
    const h = hearts(D);
    if (h !== lastHearts) {
      lastHearts = h;
      tag.children[1].replaceWith(heartsRow(h));
    }
  };
  refreshNeeds();
  const why = el('div', { class: 'why panel' });
  why.style.display = 'none';
  root.append(ring, tag, why);
  const inv = game.world.inventory;
  const specials = (Object.keys(FOODS) as FoodId[]).filter((f) => f !== 'pienso' && (inv[f] ?? 0) > 0);
  type B = { icon: string; act: Action | 'card' | 'laser' | 'trick'; label: string };
  const items: B[] = [
    { icon: foodIcon(D), act: 'feed', label: 'Dar de comer' },
    { icon: 'gota', act: 'water', label: 'Dar agua' },
    { icon: 'cruz', act: 'heal', label: 'Curar' },
    { icon: 'corazon', act: 'pet', label: 'Acariciar' },
    { icon: 'ficha', act: 'card', label: 'Ficha' },
  ];
  if (species(D) === 'cat') items.splice(4, 0, { icon: 'laser', act: 'laser', label: 'Jugar con el láser' });
  // perros que ya confían: enseñarles un truco nuevo
  if (onTrick && nextTrick(D)) items.splice(4, 0, { icon: 'hueso', act: 'trick', label: 'Enseñar un truco' });
  const R = items.length > 5 ? 38 : 34; // radio en unidades de UI
  let foodRow: HTMLElement | null = null;
  items.forEach((it, i) => {
    const a = Math.PI + (i / (items.length - 1)) * Math.PI; // arco por encima
    const avail = it.act === 'card' || it.act === 'trick' ? { ok: true } : it.act === 'laser' ? (hearts(D) >= 2 ? { ok: true } : { ok: false, reason: 'Aún le da miedo jugar contigo (2 corazones)' }) : canDo(D, it.act);
    const b = button(iconImg(it.icon), () => {
      if (it.act === 'card') {
        closeRadial();
        onCard(e);
        return;
      }
      if (it.act === 'trick') {
        closeRadial();
        onTrick?.(e);
        return;
      }
      if (it.act === 'laser') {
        if (!avail.ok) {
          sfx.ui('nope');
          why.textContent = avail.reason ?? '';
          why.style.display = '';
          return;
        }
        closeRadial();
        onLaser?.(e);
        return;
      }
      if (!avail.ok) {
        sfx.ui('nope');
        why.textContent = avail.reason ?? '';
        why.style.display = '';
        return;
      }
      if (it.act === 'feed' && specials.length) {
        // elegir comida
        foodRow?.remove();
        foodRow = el('div', { class: 'foodrow' });
        for (const f of ['pienso' as FoodId, ...specials]) {
          const label = f === 'pienso' ? 'Pienso' : `${FOODS[f].name} ×${inv[f]}`;
          foodRow.append(button(label, () => {
            game.request(e, 'feed', f);
            closeRadial();
          }));
        }
        foodRow.style.left = '0px';
        foodRow.style.top = `calc(var(--u) * 14)`;
        root.append(foodRow);
        return;
      }
      game.request(e, it.act as Action);
      closeRadial();
    }, avail.ok ? '' : 'off');
    b.title = it.label;
    b.style.left = `calc(var(--u) * ${Math.cos(a) * R})`;
    b.style.top = `calc(var(--u) * ${Math.sin(a) * R * 0.85})`;
    ring.append(b);
  });
  tag.style.left = '0px';
  tag.style.top = `calc(var(--u) * ${-R * 0.85 - 14})`;
  why.style.left = '0px';
  why.style.top = `calc(var(--u) * 8)`;
  document.getElementById('ui')!.append(root);
  // seguir al animal en pantalla
  let alive = true;
  const follow = () => {
    if (!alive) return;
    const [sx, sy] = e.ent.screenPos();
    const v = game.view;
    const camX = Math.round(game.cam.x - v.w / 2), camY = Math.round(game.cam.y - v.h / 2);
    const k = v.zoom / v.dpr;
    const x = (sx - camX) * k, y = (sy - camY - e.ent.look.shape.legH * 1.4) * k;
    // márgenes según el tamaño real del menú, para que nunca se corte
    refreshNeeds();
    const u = uiUnit();
    const mx = (R + 13) * u, top = (R * 0.85 + 34 + 26 + (D.injured ? 9 : 0)) * u, bottom = 40 * u;
    root.style.left = `${Math.max(mx, Math.min(innerWidth - mx, x))}px`;
    root.style.top = `${Math.max(top, Math.min(innerHeight - bottom, y))}px`;
    requestAnimationFrame(follow);
  };
  follow();
  game.focusOn(e);
  requestAnimationFrame(() => root.classList.add('open'));
  const offBack = onBack(() => closeRadial());
  current = {
    root,
    close: () => {
      offBack();
      alive = false;
      game.focusOn(null);
      root.classList.remove('open');
      setTimeout(() => root.remove(), 200);
    },
  };
}

// ---------------------------------------------------------------- Ficha
export function openCard(D: AnimalData, look: Look, onRename: (name: string) => void, extras: string[] = []): void {
  const b = BREED_BY_ID[D.breed];
  const sheet = new Sheet(D.name, 'card');
  const canvas = el('canvas', { class: 'portrait', width: 64, height: 56 });
  const ctx = canvas.getContext('2d')!;
  const fr = getFrames(look, 'sit', 0);
  const big = look.shape.legH > 15;
  const f = fr[0];
  ctx.fillStyle = PALETTE.cal3;
  ctx.fillRect(14, 49, 36, 3);
  ctx.drawImage(f.canvas, 32 - f.ox, (big ? 62 : 52) - f.oy);
  const name = el('div', { class: 'name' }, D.name);
  const fav = D.fed > 0 && D.favorite ? FOODS[D.favorite].name : '???';
  const met = new Date(D.metAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const rare = D.rare === 'lunar' ? ' · gato lunar' : D.rare === 'heterocromia' ? ' · ojos de dos colores' : D.rare === 'calicoMacho' ? ' · calicó macho' : '';
  const info = el('div', {},
    name,
    el('div', { class: 'meta' }, `${b.name} · ${b.coatNames[D.variant % b.coatNames.length]}${rare}`),
    el('div', { class: 'meta' }, `${PERSONALITIES[D.personality].name} · le encanta: ${fav}`),
    heartsRow(hearts(D)),
  );
  const bar = (cls: string, v: number) => {
    const i = el('i', {});
    i.style.width = `${Math.round(v * 100)}%`;
    return el('div', { class: `bar ${cls}` }, i);
  };
  const bars = el('div', { class: 'bars meta' },
    'Comida', bar('food', D.hunger), 'Agua', bar('thirst', D.thirst), 'Bienestar', bar('well', D.wellbeing),
  );
  const blurb = el('div', { class: 'blurb' }, `${PERSONALITIES[D.personality].blurb} ${D.injured ? 'Tiene un rasguño que necesita una cura.' : ''} Os conocisteis el ${met}.`);
  // su vida: amigos, costumbre, trucos, edad…
  const life = el('div', { class: 'life' }, ...extras.map((t) => el('div', { class: 'small' }, '· ' + t)));
  const actions = el('div', { class: 'actions' });
  const rename = button('Cambiar nombre', () => {
    const input = el('input', { value: D.name, maxlength: '18' });
    const ok = button('Guardar', () => {
      const n = input.value.trim().slice(0, 18);
      if (n) {
        onRename(n);
        name.textContent = n;
        sheet.root.querySelector('.title')!.textContent = n;
      }
      actions.replaceChildren(rename, close);
    });
    actions.replaceChildren(input, ok);
    input.focus();
  });
  const close = button(iconImg('cerrar', 'icon small'), () => void sheet.close());
  actions.append(rename, close);
  sheet.body.append(el('div', { class: 'head' }, canvas, info), bars, blurb, life, actions);
  sheet.open();
}
