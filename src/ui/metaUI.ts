// Interfaz de progreso: HUD, álbum (razas, animales, vitrina), logros, misiones,
// diálogos con los vecinos y aviso de logro con animación.
import { el, button, iconImg, Sheet, haptic } from './kit.ts';
import { heartsRow } from './animalUI.ts';
import { dataURL } from './art.ts';
import { getFrames } from '../sprites/animals.ts';
import { getPlayerFrames, type Outfit } from '../sprites/player.ts';
import { BREEDS, makeLook } from '../sprites/breeds.ts';
import { ACHIEVEMENTS, fmt, tierThreshold, missionProgress, rewardText, GIFTS, errandProgress, type Unlocked, type Neighbor } from '../sim/progress.ts';
import { hearts, PERSONALITIES, FOODS, type AnimalData } from '../sim/model.ts';
import { EVENTS, type EventId } from '../sim/calendar.ts';
import { SKY_NAMES, type Sky } from '../sim/weather.ts';
import { PALETTE, type ColorName } from '../gfx/palette.ts';
import type { MetaHost } from '../meta/controller.ts';
import * as sfx from '../audio/sfx.ts';
import { momentsGrid, lettersList, collectionsGrid } from './life.ts';

// ---------------------------------------------------------------- Retratos
export function portrait(a: { breed: string; variant: number; seed: number; rare: AnimalData['rare'] }, silhouette: boolean, w = 48, h = 48): HTMLCanvasElement {
  const c = el('canvas', { width: w, height: h, class: 'pt' });
  const x = c.getContext('2d')!;
  const look = makeLook(a.breed, a.variant, a.seed, a.rare);
  const f = getFrames(look, 'sit', 0)[0];
  const big = look.shape.legH > 15;
  x.drawImage(f.canvas, Math.round(w / 2 - f.ox), Math.round(h - 3 + (big ? 8 : 0) - f.oy));
  if (silhouette) {
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = PALETTE.cal1;
    x.fillRect(0, 0, w, h);
  }
  return c;
}

// ---------------------------------------------------------------- HUD
export interface HudActions {
  album(): void;
  logros(): void;
  misiones(): void;
  armario(): void;
  decoracion(): void;
  ajustes(): void;
}

export class Hud {
  chip: HTMLDivElement;
  private time: HTMLSpanElement;
  private sky: HTMLImageElement;
  private fest: HTMLSpanElement;
  constructor(a: HudActions) {
    this.time = el('span', {});
    this.sky = iconImg('sol', 'icon small');
    this.fest = el('span', { class: 'fest' });
    this.chip = el('div', { class: 'chip panel ui-text' }, this.sky, this.time, this.fest);
    const bar = el('div', { class: 'hudbar' },
      button(iconImg('album'), a.album), button(iconImg('logros'), a.logros), button(iconImg('misiones'), a.misiones),
      button(iconImg('armario'), a.armario), button(iconImg('decoracion'), a.decoracion), button(iconImg('ajustes'), a.ajustes),
    );
    document.getElementById('ui')!.append(this.chip, bar);
  }
  update(realHour: number, sky: Sky, night: boolean, events: EventId[]): void {
    const h = Math.floor(realHour), m = Math.floor((realHour % 1) * 60);
    this.time.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${SKY_NAMES[sky]}`;
    const icon = sky === 'lluvia' || sky === 'orballo' ? 'lluvia' : sky === 'nublado' || sky === 'niebla' || sky === 'nieve' ? 'nube' : night ? 'luna' : 'sol';
    const src = iconImg(icon, 'icon small').src;
    if (this.sky.src !== src) this.sky.src = src;
    this.fest.textContent = events.length ? ` · ${EVENTS[events[0]].name}` : '';
  }
}

// ---------------------------------------------------------------- Aviso de logro
let bannerBox: HTMLDivElement | null = null;
const queue: Unlocked[] = [];
let showing = false;
/** Los logros se anuncian de uno en uno, con calma. */
export function achievementBanner(a: Unlocked): void {
  queue.push(a);
  if (!showing) next();
}
function next(): void {
  const a = queue.shift();
  if (!a) {
    showing = false;
    return;
  }
  showing = true;
  sfx.achievement();
  haptic([10, 40, 10, 40, 24]);
  if (!bannerBox) {
    bannerBox = el('div', { class: 'banners' });
    document.getElementById('ui')!.append(bannerBox);
  }
  const def = ACHIEVEMENTS.find((d) => d.id === a.id)!;
  const sparkles = el('div', { class: 'sparkles' });
  for (let i = 0; i < 8; i++) {
    const s = el('i', {});
    s.style.setProperty('--a', `${(i / 8) * 360}deg`);
    sparkles.append(s);
  }
  const b = el('div', { class: 'banner panel ui-text' },
    el('div', { class: 'medal' }, iconImg(def.icon), sparkles),
    el('div', {}, el('div', { class: 'small' }, def.secret ? '¡Logro secreto!' : '¡Logro conseguido!'), el('div', { class: 'big' }, a.name), el('div', { class: 'small' }, `${a.desc} · ${rewardText(a.reward)}`)),
  );
  bannerBox.append(b);
  // se va solo, o antes si lo tocas
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    b.classList.add('out');
    setTimeout(() => {
      b.remove();
      next();
    }, 500);
  };
  b.addEventListener('pointerup', close);
  setTimeout(close, 3200);
}

// ---------------------------------------------------------------- Álbum
type AlbumTab = 'Razas' | 'Animales' | 'Vitrina' | 'Colecciones' | 'Momentos' | 'Cartas';
export function openAlbum(h: MetaHost, onAnimal: (a: AnimalData) => void, tab: AlbumTab = 'Animales'): void {
  const sheet = new Sheet('Álbum', 'album');
  const tabs = el('div', { class: 'tabs' });
  const grid = el('div', { class: 'grid' });
  const count = el('div', { class: 'count' });
  sheet.body.append(tabs, count, grid);
  const render = () => {
    const unread = (h.meta.letters ?? []).filter((L) => !L.read).length;
    tabs.replaceChildren(...(['Animales', 'Razas', 'Vitrina', 'Colecciones', 'Momentos', 'Cartas'] as const).map((t) => button(t === 'Cartas' && unread ? `Cartas (${unread})` : t, () => {
      tab = t;
      render();
    }, t === tab ? 'on' : '')));
    grid.replaceChildren();
    if (tab === 'Razas') {
      const known = new Set(h.animals.filter((a) => a.known).map((a) => a.breed));
      count.textContent = `${known.size} de ${BREEDS.length} razas`;
      for (const b of BREEDS) {
        const k = known.has(b.id);
        grid.append(el('div', { class: `card-mini panel ${k ? '' : 'unknown'}` }, portrait({ breed: b.id, variant: 0, seed: 7, rare: null }, !k), el('div', { class: 'nm' }, k ? b.name : '???')));
      }
    } else if (tab === 'Animales') {
      const known = h.animals.filter((a) => a.known).sort((a, b) => a.metAt - b.metAt);
      count.textContent = known.length ? `${known.length} amigos del barrio` : 'Todavía no conoces a nadie. ¡Toca un animal!';
      for (const a of known) {
        const card = el('button', { class: `card-mini panel ${a.rare ? 'rare' : ''}`, onclick: () => {
          sfx.ui('tap');
          void sheet.close().then(() => onAnimal(a));
        } }, portrait(a, false), el('div', { class: 'nm' }, a.name), a.adoptedBy ? el('div', { class: 'small' }, 'adoptado') : heartsRow(hearts(a)));
        grid.append(card);
      }
    } else if (tab === 'Colecciones') {
      count.textContent = collectionsGrid(grid, h.meta);
    } else if (tab === 'Momentos') {
      count.textContent = momentsGrid(grid, h.meta);
    } else if (tab === 'Cartas') {
      count.textContent = lettersList(grid, h.meta, h.animals);
    } else {
      const total = GIFTS.length;
      const have = Object.keys(h.meta.vitrina).length;
      count.textContent = `Vitrina: ${have} de ${total} tesoros`;
      for (const g of GIFTS) {
        const v = h.meta.vitrina[g.id];
        const key: Record<string, ColorName | null> = { '.': null };
        for (const [k, c] of Object.entries(g.key)) key[k] = v ? (c as ColorName) : 'cal1';
        const img = el('img', { src: dataURL('gift-' + g.id + (v ? '' : '-x'), g.rows, key), class: 'gift' });
        grid.append(el('div', { class: `card-mini panel ${v ? '' : 'unknown'}` }, img, el('div', { class: 'nm' }, v ? g.name : '???'), el('div', { class: 'small' }, v ? `×${v.n}` : '')));
      }
    }
  };
  render();
  sheet.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Logros
export function openAchievements(h: MetaHost): void {
  const sheet = new Sheet('Logros', 'list');
  for (const d of ACHIEVEMENTS) {
    const k = h.meta.levels[d.id] ?? 0;
    const v = h.stats[d.stat] ?? 0;
    const next = tierThreshold(d, k);
    if (d.secret && k === 0) {
      sheet.body.append(el('div', { class: 'item panel' }, iconImg('candado', 'icon small'), el('div', { class: 'txt' }, el('div', {}, '???'), el('div', { class: 'small' }, 'Logro secreto'))));
      continue;
    }
    const pct = Number.isFinite(next) ? Math.min(1, v / next) : 1;
    const bar = el('div', { class: 'bar well' }, el('i', {}));
    (bar.firstChild as HTMLElement).style.width = `${Math.round(pct * 100)}%`;
    sheet.body.append(el('div', { class: 'item panel' }, iconImg(d.icon, 'icon small'),
      el('div', { class: 'txt' }, el('div', {}, `${d.name}${k > 0 ? ` · nivel ${k}` : ''}`), el('div', { class: 'small' }, Number.isFinite(next) ? `${fmt(d.desc, next)} (${Math.min(v, next)}/${next})` : '¡Completado!'), bar)));
  }
  sheet.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Misiones
export function openMissions(h: MetaHost): void {
  const sheet = new Sheet('Misiones', 'list');
  const ms = h.meta.missions;
  const section = (title: string, list: NonNullable<typeof ms>['daily']) => {
    sheet.body.append(el('div', { class: 'sub' }, title));
    for (const m of list) {
      const p = missionProgress(m, h.stats);
      const bar = el('div', { class: 'bar food' }, el('i', {}));
      (bar.firstChild as HTMLElement).style.width = `${Math.round((p / m.n) * 100)}%`;
      sheet.body.append(el('div', { class: `item panel ${m.done ? 'done' : ''}` }, iconImg(m.done ? 'check' : 'misiones', 'icon small'),
        el('div', { class: 'txt' }, el('div', {}, m.text), el('div', { class: 'small' }, m.done ? `¡Hecho! · ${rewardText(m.reward)}` : `${p}/${m.n} · Recompensa: ${rewardText(m.reward)}`), bar)));
    }
  };
  if (ms) {
    section('Hoy', ms.daily);
    section('Esta semana', ms.weekly);
  }
  sheet.body.append(el('div', { class: 'small center' }, 'Sin prisas: las misiones se renuevan cada día y cada semana.'));
  sheet.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Vecinos
export function openNeighbor(h: MetaHost, nb: Neighbor, outfit: Outfit, onReward: (errand: Neighbor['errands'][number]) => void): void {
  const sheet = new Sheet(`${nb.name}, ${nb.role}`, 'neighbor');
  const c = el('canvas', { width: 40, height: 40, class: 'face' });
  const f = getPlayerFrames(outfit, 'idle', 0)[0];
  c.getContext('2d')!.drawImage(f.canvas, 20 - f.ox, 60 - f.oy);
  const es = h.meta.errands;
  if (es.start[nb.id] === undefined) {
    const e0 = nb.errands[es.step[nb.id] ?? 0];
    if (e0) es.start[nb.id] = h.stats[e0.stat] ?? 0;
  }
  const say = el('div', { class: 'say' }, nb.greet[Math.floor(Math.random() * nb.greet.length)]);
  const body = el('div', { class: 'talk' }, c, say);
  sheet.body.append(body);
  const errandBox = el('div', {});
  sheet.body.append(errandBox);
  const showErrand = () => {
    const { errand, progress } = errandProgress(es, nb, h.stats);
    errandBox.replaceChildren();
    if (!errand) {
      errandBox.append(el('div', { class: 'small center' }, 'Ya no tiene más encargos. ¡Gracias por todo!'));
      return;
    }
    const done = progress >= errand.n;
    errandBox.append(el('div', { class: 'errand panel' }, el('div', {}, `«${errand.text}»`), el('div', { class: 'small' }, done ? '¡Listo! Ven a por tu recompensa.' : `${progress}/${errand.n} · Recompensa: ${rewardText(errand.reward)} · sin prisa`)));
    if (!done) return;
    // se entrega una sola vez: el botón desaparece en cuanto se pulsa
    let delivered = false;
    const give = button('Entregar', () => {
      if (delivered) return;
      delivered = true;
      give.disabled = true;
      say.textContent = errand.thanks;
      es.step[nb.id] = (es.step[nb.id] ?? 0) + 1;
      const next = nb.errands[es.step[nb.id]];
      if (next) es.start[nb.id] = h.stats[next.stat] ?? 0;
      onReward(errand);
      sfx.gift();
      showErrand(); // el siguiente encargo (aún sin hacer)
    }, 'primary');
    errandBox.append(el('div', { class: 'footer' }, give));
  };
  showErrand();
  sheet.body.append(el('div', { class: 'footer' }, button('Adiós', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Decoración (lista)
export const DECOR_NAMES: Record<string, { name: string; desc: string }> = {
  comedero: { name: 'Comedero de madera', desc: 'Se llena solo de pienso cada mañana. Atrae animales.' },
  bebedero: { name: 'Bebedero de barro', desc: 'Agua fresca para todo el día.' },
  'manta-cuadros': { name: 'Manta de cuadros', desc: 'Un sitio calentito para dormir.' },
  caseta: { name: 'Caseta', desc: 'Refugio para los días de lluvia.' },
};

export function foodName(f: keyof typeof FOODS): string {
  return FOODS[f].name;
}
export { PERSONALITIES };
