// Navegación entre zonas: carteles sobre cada salida (se pegan al borde si la salida no se ve)
// y mapa del barrio con viaje directo a las zonas abiertas.
import { el, iconImg, Sheet, button } from './kit.ts';
import { toast } from './animalUI.ts';
import { ZONES, zoneOpen, type ZoneId, type Exit } from '../world/zones.ts';
import type { Game } from '../game.ts';
import * as sfx from '../audio/sfx.ts';
import { needyByZone } from './assist.ts';

function uiUnit(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2;
}

function isOpen(game: Game, id: ZoneId): boolean {
  return zoneOpen(id, game.world.stats, game.world.animals);
}

interface Sign { ex: Exit; node: HTMLElement; arrow: HTMLImageElement; label: HTMLElement; lock: HTMLImageElement }

/** Carteles de salida que siguen a la cámara. */
export class ExitSigns {
  private root = el('div', { class: 'exit-signs' });
  private signs: Sign[] = [];
  private zone: ZoneId | null = null;
  /** último momento en que el personaje andaba: mientras pasea, los carteles se apartan */
  private lastMove = 0;
  /** se pueden quitar desde Ajustes */
  static enabled = true;

  constructor(private game: Game) {
    document.getElementById('ui')!.append(this.root);
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private build(): void {
    this.zone = this.game.zoneId;
    this.root.replaceChildren();
    this.signs = this.game.zoneDef.exits.map((ex) => {
      const arrow = iconImg('dcha', 'icon tiny arrow');
      const lock = iconImg('candado', 'icon tiny');
      const label = el('span', {}, ZONES[ex.to].title);
      const node = el('div', { class: 'exit-sign panel ui-text' }, arrow, label, lock);
      node.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        if (isOpen(this.game, ex.to)) {
          sfx.ui('tap');
          this.game.goToExit(ex);
        } else {
          sfx.ui('nope');
          toast(`${ZONES[ex.to].title} todavía no está abierta. ${ZONES[ex.to].unlockHint}`);
        }
      });
      this.root.append(node);
      return { ex, node, arrow, label, lock };
    });
  }

  private update(): void {
    const g = this.game;
    if (!g.grid) return;
    if (g.zoneId !== this.zone) this.build();
    this.root.style.display = ExitSigns.enabled ? '' : 'none';
    if (!ExitSigns.enabled) return;
    // mientras caminas (salvo hacia una salida) los carteles se quedan casi transparentes
    const pmv = g.player.m;
    if (pmv.moving && !g.headingToExit) this.lastMove = performance.now();
    this.root.classList.toggle('quiet', performance.now() - this.lastMove < 1200);
    const v = g.view;
    const camX = Math.round(g.cam.x - v.w / 2), camY = Math.round(g.cam.y - v.h / 2);
    const k = v.zoom / v.dpr;
    const u = uiUnit();
    const W = innerWidth, H = innerHeight;
    // márgenes: debajo de la etiqueta de la hora y encima de la barra inferior
    const top = 34 * u, bottom = H - 46 * u, side = 6 * u;
    const pm = g.player.m;
    const placed: { s: Sign; px: number; py: number; w: number; h: number }[] = [];
    for (const s of this.signs) {
      // la salida en la que estás (acabas de llegar por ella) no necesita cartel
      const inside = pm.tx >= s.ex.r[0] && pm.tx < s.ex.r[2] && pm.ty >= s.ex.r[1] && pm.ty < s.ex.r[3];
      s.node.style.display = inside ? 'none' : '';
      if (inside) continue;
      const open = isOpen(g, s.ex.to);
      s.node.classList.toggle('locked', !open);
      s.lock.style.display = open ? 'none' : '';
      // punto de la salida en pantalla (centro de la franja, a su altura)
      const cx = (s.ex.r[0] + s.ex.r[2]) / 2, cy = (s.ex.r[1] + s.ex.r[3]) / 2;
      const tx = Math.min(g.grid.w - 1, Math.floor(cx)), ty = Math.min(g.grid.h - 1, Math.floor(cy));
      const z = g.grid.height[ty * g.grid.w + tx] ?? 4;
      const wx = cx * 16, wy = cy * 16;
      const x = (2 * (wx - wy) - camX) * k, y = (wx + wy - z - camY) * k;
      // fuera de la vista: solo una flechita en el borde; las cerradas, ni eso (para eso está el mapa)
      const off = x < side || x > W - side || y - 6 * u < top || y - 6 * u > bottom;
      const near = Math.hypot(pm.x - cx * 16, pm.y - cy * 16) / 16 < 7;
      const hide = !open && (off || !near);
      s.node.style.display = hide ? 'none' : '';
      if (hide) continue;
      s.node.classList.toggle('edge', off);
      const w = s.node.offsetWidth, h = s.node.offsetHeight;
      const minX = side + w / 2, maxX = W - side - w / 2;
      const px = Math.max(minX, Math.min(maxX, x));
      const py = Math.max(top + h, Math.min(bottom, y - 6 * u));
      // flecha: hacia abajo si se ve la salida; si no, hacia el borde por el que queda
      let rot = 90;
      if (off) {
        const dx = x - px, dy = y - py;
        rot = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 180) : dy > 0 ? 90 : -90;
      }
      s.arrow.style.transform = `rotate(${rot}deg)`;
      placed.push({ s, px, py, w, h });
    }
    // que no se pisen: de arriba abajo, se baja el que solape con uno anterior
    placed.sort((a, b) => a.py - b.py);
    for (let i = 0; i < placed.length; i++)
      for (let j = 0; j < i; j++) {
        const a = placed[j], b = placed[i];
        if (Math.abs(a.px - b.px) < (a.w + b.w) / 2 && b.py - b.h < a.py && a.py - a.h < b.py) b.py = a.py + b.h + 2 * u;
      }
    // ni encima del personaje: el cartel sube por encima de su cabeza
    const [psx, psy] = [2 * (pm.x - pm.y), pm.x + pm.y - pm.z];
    const plx = (psx - camX) * k, ply = (psy - camY) * k, pw = 12 * k, ph = 52 * k;
    for (const p of placed) {
      if (Math.abs(p.px - plx) < p.w / 2 + pw / 2 && p.py > ply - ph && p.py - p.h < ply) p.py = Math.max(top + p.h, ply - ph - 2 * u);
      if (p.py > bottom) p.py = bottom;
      p.s.node.style.left = `${p.px}px`;
      p.s.node.style.top = `${p.py}px`;
    }
  }
}

/** Mapa del barrio: dónde estás, qué está abierto y cómo abrir lo demás. */
export function openMap(game: Game): void {
  const sheet = new Sheet('El barrio', 'map');
  const order: ZoneId[] = ['calle', 'plaza', 'parque', 'mercado', 'descampado', 'puerto'];
  const list = el('div', { class: 'zones' });
  const needy = needyByZone(game.world.animals);
  for (const id of order) {
    const z = ZONES[id];
    const here = id === game.zoneId;
    const open = isOpen(game, id);
    const action = here
      ? el('div', { class: 'here' }, 'Estás aquí')
      : open
        ? button('Ir', () => {
          void sheet.close();
          game.travelTo(id);
        }, 'primary')
        : iconImg('candado', 'icon small');
    list.append(el('div', { class: `zone-row${here ? ' current' : ''}${open ? '' : ' locked'}` },
      el('div', { class: 'info' }, el('div', { class: 'name' }, z.title),
        open && needy[id] ? el('div', { class: 'needy' }, iconImg('comida', 'icon tiny'), `${needy[id]} ${needy[id] === 1 ? 'animal necesita' : 'animales necesitan'} algo`) : null,
        el('div', { class: 'small' }, open ? z.blurb : z.unlockHint)),
      action,
    ));
  }
  sheet.body.append(list, el('div', { class: 'footer' }, button(iconImg('cerrar', 'icon small'), () => void sheet.close())));
  sheet.open();
}

/** Botón para volver al personaje cuando has movido la cámara y lo has perdido de vista. */
export class RecenterButton {
  private node: HTMLElement;
  constructor(private game: Game) {
    this.node = el('div', { class: 'recenter' }, button(iconImg('centrar'), () => {
      game.cam.follow = true;
      game.lastDrag = 0;
    }));
    this.node.style.display = 'none';
    document.getElementById('ui')!.append(this.node);
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  private update(): void {
    const g = this.game;
    let show = false;
    if (g.grid && !g.cam.follow && !g.laser) {
      // solo si el personaje queda lejos del centro (o fuera de la pantalla)
      const [px, py] = g.player.feet();
      const dx = Math.abs(px - g.cam.x) / (g.view.w / 2), dy = Math.abs(py - 30 - g.cam.y) / (g.view.h / 2);
      show = Math.max(dx, dy) > 0.45;
    }
    const want = show ? '' : 'none';
    if (this.node.style.display !== want) this.node.style.display = want;
  }
}
