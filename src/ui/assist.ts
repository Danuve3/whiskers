// Ayudas de orientación: pestaña con los animales de la zona y pistas contextuales.
import { el, iconImg } from './kit.ts';
import { portrait } from './metaUI.ts';
import { showHint } from './tutorial.ts';
import { hearts, species } from '../sim/model.ts';
import type { ZoneId } from '../world/zones.ts';
import type { Game } from '../game.ts';
import type { Entry } from '../world/population.ts';
import type { MetaState } from '../meta/controller.ts';
import * as sfx from '../audio/sfx.ts';

/** ¿Necesita algo este animal? (mismo umbral que los bocadillos) */
export function needsCare(a: { hunger: number; thirst: number; injured: boolean }): boolean {
  return a.injured || a.hunger < 0.35 || a.thirst < 0.35;
}

/** Pestaña lateral con los animales de la zona: de un vistazo quién necesita qué; tocar lleva hasta él. */
export class AnimalStrip {
  private root: HTMLElement;
  private list: HTMLElement;
  private tab: HTMLElement;
  private count: HTMLElement;
  private open = false;
  private rows = new Map<string, { row: HTMLElement; fills: HTMLElement[]; e: Entry; need: HTMLImageElement; needKind: string }>();

  constructor(private game: Game, private onPick: (e: Entry) => void, private onUse: () => void) {
    this.count = el('span', { class: 'n' }, '0');
    this.tab = el('button', { class: 'strip-tab panel ui-text', 'aria-label': 'Animales de la zona' }, iconImg('corazon', 'icon tiny'), this.count);
    this.list = el('div', { class: 'strip-list' });
    this.root = el('div', { class: 'strip' }, this.tab, this.list);
    document.getElementById('ui')!.append(this.root);
    try {
      this.open = localStorage.getItem('whiskers-strip') === '1';
    } catch { /* sin almacenamiento */ }
    this.tab.addEventListener('pointerup', (ev) => {
      ev.stopPropagation();
      this.open = !this.open;
      sfx.ui(this.open ? 'open' : 'close');
      this.onUse();
      try {
        localStorage.setItem('whiskers-strip', this.open ? '1' : '0');
      } catch { /* sin almacenamiento */ }
      this.refresh();
    });
    this.refresh();
    setInterval(() => this.refresh(), 600);
  }

  private refresh(): void {
    const entries = this.game.pop?.entries ?? [];
    const needy = entries.filter((e) => needsCare(e.data)).length;
    this.count.textContent = String(entries.length);
    this.tab.classList.toggle('alert', needy > 0);
    this.root.classList.toggle('open', this.open);
    if (!this.open) return;
    // los que necesitan algo primero, luego por confianza
    const sorted = [...entries].sort((a, b) => Number(needsCare(b.data)) - Number(needsCare(a.data)) || b.data.trust - a.data.trust);
    const keep = new Set(sorted.map((e) => e.data.id));
    for (const [id, r] of this.rows) if (!keep.has(id)) {
      r.row.remove();
      this.rows.delete(id);
    }
    for (const e of sorted) {
      let r = this.rows.get(e.data.id);
      if (!r || r.e !== e) {
        r?.row.remove();
        const fills = [el('i', {}), el('i', {}), el('i', {})];
        const bars = el('div', { class: 'mini-bars' },
          el('div', { class: 'bar food' }, fills[0]), el('div', { class: 'bar thirst' }, fills[1]), el('div', { class: 'bar well' }, fills[2]));
        const need = iconImg('comida', 'icon tiny need');
        const row = el('button', { class: 'strip-row panel ui-text' }, portrait(e.data, false, 36, 36), el('div', { class: 'who' }, el('div', { class: 'nm' }, e.data.name), bars), need);
        row.addEventListener('pointerup', (ev) => {
          ev.stopPropagation();
          sfx.ui('tap');
          this.onPick(e);
        });
        r = { row, fills, e, need, needKind: 'comida' };
        this.rows.set(e.data.id, r);
      }
      const D = e.data;
      [D.hunger, D.thirst, D.wellbeing].forEach((v, i) => (r!.fills[i].style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`));
      // icono de lo que más necesita (el mismo que el bocadillo)
      const kind = D.injured ? 'tirita' : Math.min(D.hunger, D.thirst) < 0.35 ? (D.hunger <= D.thirst ? 'comida' : 'agua') : '';
      r.need.style.visibility = kind ? 'visible' : 'hidden';
      if (kind && kind !== r.needKind) {
        r.needKind = kind;
        r.need.src = iconImg(kind).src;
      }
      this.list.append(r.row); // reordena
    }
  }
}

// ---------------------------------------------------------------- Pistas contextuales
interface HintDef {
  id: string;
  text: string;
  when: (c: HintCtx) => boolean;
}
interface HintCtx {
  game: Game;
  meta: MetaState;
  stats: Record<string, number>;
  minutes: number;
  used: (k: string) => boolean;
}

const HINTS: HintDef[] = [
  { id: 'burbujas', text: 'Los bocadillos sobre los animales te dicen qué necesitan: un cuenco es hambre, una gota es sed y una tirita, una cura.', when: (c) => c.game.pop.entries.some((e) => needsCare(e.data)) },
  { id: 'lista', text: 'La pestaña con el corazón, a la izquierda, enseña a todos los animales de esta zona. Toca uno para ir hasta él.', when: (c) => c.minutes > 3 && !c.used('lista') && c.game.pop.entries.length >= 2 },
  { id: 'mapa', text: 'Con el mapa (arriba a la derecha) puedes ir a cualquier zona abierta del barrio.', when: (c) => c.minutes > 4 && !c.used('mapa') && (c.meta.zonesOpen?.length ?? 0) >= 2 },
  { id: 'zona-nueva', text: 'Hay una zona abierta que aún no has visitado. ¡Mira el mapa!', when: (c) => (c.meta.zonesOpen ?? []).some((z) => !(c.meta.visited ?? []).includes(z)) && c.minutes > 2 },
  { id: 'laser', text: 'A los gatos que te tienen 2 corazones o más les encanta perseguir el puntero láser. Tócalo y elige el láser.', when: (c) => !c.stats.laser && c.game.pop.entries.some((e) => species(e.data) === 'cat' && hearts(e.data) >= 2) },
  { id: 'tirita', text: 'Si un animal lleva el bocadillo de la tirita, necesita una cura. Cuando confíe lo bastante en ti, podrás curarlo.', when: (c) => !c.stats.curar && c.game.pop.entries.some((e) => e.data.injured) },
  { id: 'armario', text: 'En el armario (la percha de abajo) puedes cambiar de ropa. Desbloquearás prendas nuevas jugando.', when: (c) => c.minutes > 12 && !c.used('armario') },
  { id: 'decor', text: 'Ya tienes algo de decoración: colócala en el barrio desde el botón de la casita. Los comederos ayudan a los animales.', when: (c) => c.meta.decor.length > 0 && !(c.meta.placed ?? []).length },
  { id: 'pesca', text: 'En el espigón del puerto puedes pescar sardinas: son un manjar para los gatos.', when: (c) => c.game.zoneId === 'puerto' && !c.stats.pesca },
];

/** Una pista cada cierto tiempo, cada una solo una vez, y nunca durante el tutorial ni con menús abiertos. */
export function startHints(game: Game, meta: MetaState, stats: Record<string, number>, tutorialActive: () => boolean): void {
  const t0 = Date.now();
  let lastShown = Date.now() - 60_000;
  setInterval(() => {
    if (tutorialActive() || document.querySelector('.sheet.open, .radial, .title-screen, .tuto')) return;
    if (Date.now() - lastShown < 4 * 60_000) return;
    meta.hints ??= [];
    const ctx: HintCtx = { game, meta, stats, minutes: (Date.now() - t0) / 60_000, used: (k) => (meta.used ?? []).includes(k) };
    const h = HINTS.find((d) => !meta.hints!.includes(d.id) && d.when(ctx));
    if (!h) return;
    meta.hints.push(h.id);
    lastShown = Date.now();
    showHint(h.text);
  }, 15_000);
}

/** Marca algo como usado (para no dar pistas de lo que ya conoces). */
export function markUsed(meta: MetaState, k: string): void {
  meta.used ??= [];
  if (!meta.used.includes(k)) meta.used.push(k);
}

/** Zonas con animales que necesitan algo (para el mapa). */
export function needyByZone(animals: { zone: string; hunger: number; thirst: number; injured: boolean }[]): Partial<Record<ZoneId, number>> {
  const out: Partial<Record<ZoneId, number>> = {};
  for (const a of animals) if (needsCare(a)) out[a.zone as ZoneId] = (out[a.zone as ZoneId] ?? 0) + 1;
  return out;
}

