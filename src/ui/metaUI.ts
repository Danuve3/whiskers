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
import { HAPPENINGS, CHALLENGES, PROJECTS, taskProgress } from '../sim/rhythm.ts';
import type { Chapter } from '../sim/neighbors.ts';

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
  // el barrio: suceso de hoy, reto de la estación y proyectos
  const S = h.stats as Record<string, number>;
  const row = (title: string, sub: string, p: number, n: number, done: boolean, icon = 'misiones') => {
    const bar = el('div', { class: 'bar food' }, el('i', {}));
    (bar.firstChild as HTMLElement).style.width = `${Math.round((Math.min(p, n) / n) * 100)}%`;
    sheet.body.append(el('div', { class: `item panel ${done ? 'done' : ''}` }, iconImg(done ? 'check' : icon, 'icon small'), el('div', { class: 'txt' }, el('div', {}, title), el('div', { class: 'small' }, sub), bar)));
  };
  const HS = h.meta.happening, H = HS && HAPPENINGS.find((x) => x.id === HS.id);
  if (HS && H) {
    sheet.body.append(el('div', { class: 'sub' }, `Hoy en el barrio · ${H.name}`));
    sheet.body.append(el('div', { class: 'small center happening' }, H.text));
    row(H.task.text, HS.done ? `¡Hecho! · ${rewardText(H.reward)}` : `${taskProgress(H.task, S, HS.start)}/${H.task.n} · Recompensa: ${rewardText(H.reward)}`, HS.done ? H.task.n : taskProgress(H.task, S, HS.start), H.task.n, HS.done);
  }
  if (ms) {
    section('Hoy', ms.daily);
    section('Esta semana', ms.weekly);
  }
  const CS = h.meta.challenge, C = CS && Object.values(CHALLENGES).find((c) => CS.key.endsWith(c.id));
  if (CS && C) {
    sheet.body.append(el('div', { class: 'sub' }, `Reto de la estación · ${C.name}`));
    const p = CS.done ? C.n : taskProgress(C, S, CS.start);
    row(C.text, CS.done ? `¡Conseguido! · ${rewardText(C.reward)}` : `${p}/${C.n} · Premio exclusivo: ${rewardText(C.reward)}`, p, C.n, CS.done);
  }
  const PS = h.meta.projects ?? {};
  const prs = PROJECTS.filter((pr) => PS[pr.id]);
  if (prs.length) {
    sheet.body.append(el('div', { class: 'sub' }, 'Proyectos del barrio'));
    for (const pr of prs) {
      const st = PS[pr.id], p = st.done ? pr.n : taskProgress(pr, S, st.start);
      row(pr.name, st.done ? pr.done : `${pr.text} · ${p}/${pr.n}`, p, pr.n, st.done, 'decoracion');
    }
  }
  sheet.body.append(el('div', { class: 'small center' }, 'Sin prisas: las misiones se renuevan cada día y cada semana.'));
  sheet.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Vecinos
export interface StoryView {
  chapters: Chapter[];
  unlocked: number;
  read: number;
  onRead: (k: number) => void;
}

export function openNeighbor(h: MetaHost, nb: Neighbor, outfit: Outfit, onReward: (errand: Neighbor['errands'][number]) => void, story?: StoryView): void {
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
  // su historia: el último capítulo desbloqueado, y los anteriores para releer
  if (story && story.unlocked > 0) {
    const box = el('div', { class: 'story panel' });
    // se abre en el primer capítulo sin leer (la historia se sigue en orden)
    let cur = Math.min(story.read, story.unlocked - 1);
    const render = () => {
      const c = story.chapters[cur];
      const nav = el('div', { class: 'chapters' }, ...story.chapters.map((ch, i) => {
        const b = button(i < story.unlocked ? String(i + 1) : '·', () => {
          if (i >= story.unlocked) return;
          cur = i;
          render();
        }, i === cur ? 'on' : i >= story.unlocked ? 'off' : '');
        b.title = i < story.unlocked ? ch.title : 'Capítulo por descubrir';
        return b;
      }));
      const next = story.unlocked < story.chapters.length ? el('div', { class: 'small' }, 'Su historia sigue… sé buen vecino y vuelve otro día.') : el('div', { class: 'small' }, 'Fin de su historia. ¡Gracias por escucharla!');
      box.replaceChildren(el('div', { class: 'sub' }, `Su historia · ${cur + 1}. ${c.title}`), ...c.lines.map((l) => el('p', { class: 'wl' }, l)), nav, next);
      if (cur >= story.read) {
        story.read = cur + 1;
        story.onRead(cur);
      }
    };
    render();
    sheet.body.append(box);
  }
  sheet.body.append(el('div', { class: 'footer' }, button('Adiós', () => void sheet.close())));
  sheet.open();
}

// ---------------------------------------------------------------- Decoración (lista)
export const DECOR_NAMES: Record<string, { name: string; desc: string }> = {
  comedero: { name: 'Comedero de madera', desc: '8 raciones de pienso: los animales comen solos. Tócalo para rellenarlo.' },
  bebedero: { name: 'Bebedero de barro', desc: 'Agua fresca para todo el día.' },
  'manta-cuadros': { name: 'Manta de cuadros', desc: 'Un sitio calentito para dormir.' },
  caseta: { name: 'Caseta', desc: 'Refugio para los días de lluvia.' },
  calabaza: { name: 'Calabaza de otoño', desc: 'Premio del reto de otoño. Pura decoración, y qué bonita.' },
  braserito: { name: 'Braserito', desc: 'Premio del reto de invierno. Los animales se acurrucan cerca.' },
  macetero: { name: 'Macetero de flores', desc: 'Premio del reto de primavera. Huele a jardín.' },
  sombrilla: { name: 'Sombrilla', desc: 'Premio del reto de verano. Da sombra y cobijo.' },
};

export function foodName(f: keyof typeof FOODS): string {
  return FOODS[f].name;
}
export { PERSONALITIES };
