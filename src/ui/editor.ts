// Editor de personaje (al empezar y desde el armario): piel, pelo, ropa, gorros, gafas,
// accesorios, bolsa y paraguas, con vista previa animada que gira.
import { RAMPS, PALETTE, type RampName } from '../gfx/palette.ts';
import { getPlayerFrames, type Outfit, type PlayerClip } from '../sprites/player.ts';
import * as W from '../sprites/wardrobe.ts';
import { Sheet, el, button, iconImg } from './kit.ts';

type Tab = 'Piel' | 'Pelo' | 'Ropa' | 'Extras';

export function openEditor(start: Outfit, unlocked: readonly string[], title: string, onDone: (o: Outfit) => void): void {
  let o: Outfit = { ...start, rain: false };
  const sheet = new Sheet(title, 'editor');
  const canvas = el('canvas', { class: 'preview', width: 48, height: 84 });
  const ctx = canvas.getContext('2d')!;
  let dir = 0;
  let clip: PlayerClip = 'idle';
  const rot = (d: number) => () => {
    dir = (dir + d + 4) % 4;
  };
  const top = el('div', { class: 'top' },
    button(iconImg('izq', 'icon small'), rot(1)),
    canvas,
    button(iconImg('dcha', 'icon small'), rot(-1)),
  );
  const hint = el('div', { class: 'locked-hint' });
  const tabsEl = el('div', { class: 'tabs' });
  const opts = el('div', { class: 'opts' });
  const done = button('¡Listo!', () => {
    running = false;
    void sheet.close().then(() => onDone({ ...o, rain: false }));
  }, 'primary');
  sheet.body.append(top, hint, tabsEl, opts, el('div', { class: 'footer' }, done));
  let tab: Tab = 'Piel';

  const set = (patch: Partial<Outfit>) => {
    o = { ...o, ...patch };
    render();
  };

  function cycler<T extends string>(label: string, list: W.Choice<T>[], cur: T, apply: (v: T) => void): HTMLElement {
    const i = Math.max(0, list.findIndex((c) => c.id === cur));
    const val = el('span', { class: 'val' }, list[i].name);
    const step = (d: number) => () => {
      // salta a la siguiente opción; las bloqueadas se ven pero no se pueden poner
      let j = i;
      for (let k = 0; k < list.length; k++) {
        j = (j + d + list.length) % list.length;
        if (W.isUnlocked(list[j], unlocked)) break;
        hint.textContent = `Bloqueado · ${list[j].name}: ${list[j].hint ?? 'pronto'}`;
      }
      apply(list[j].id);
    };
    return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label),
      el('div', { class: 'cycler' }, button(iconImg('izq', 'icon small'), step(-1)), val, button(iconImg('dcha', 'icon small'), step(1))));
  }

  function swatches(label: string, list: W.Choice<RampName>[], cur: RampName, apply: (v: RampName) => void): HTMLElement {
    const box = el('div', { class: 'swatches' });
    for (const c of list) {
      const ramp = RAMPS[c.id];
      const ok = W.isUnlocked(c, unlocked);
      const chip = el('i', {});
      chip.style.background = `linear-gradient(${PALETTE[ramp[3]]} 0 50%, ${PALETTE[ramp[2]]} 50% 100%)`;
      const b = button(chip, () => {
        if (!ok) {
          hint.textContent = `Bloqueado · ${c.name}: ${c.hint ?? 'pronto'}`;
          return;
        }
        hint.textContent = c.name;
        apply(c.id);
      }, `swatch ${c.id === cur ? 'on' : ''}`);
      b.title = c.name;
      if (!ok) b.style.opacity = '0.4';
      box.append(b);
    }
    return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), box);
  }

  function render() {
    tabsEl.replaceChildren(...(['Piel', 'Pelo', 'Ropa', 'Extras'] as Tab[]).map((t) => button(t, () => {
      tab = t;
      hint.textContent = '';
      render();
    }, t === tab ? 'on' : '')));
    const rows: HTMLElement[] = [];
    if (tab === 'Piel') {
      rows.push(swatches('Piel', W.SKINS, o.skin, (v) => set({ skin: v })));
      rows.push(cycler('Gafas', W.GLASSES, o.glasses, (v) => set({ glasses: v })));
    } else if (tab === 'Pelo') {
      rows.push(cycler('Peinado', W.HAIR_STYLES, o.hair, (v) => set({ hair: v })));
      rows.push(swatches('Color', W.HAIR_COLORS, o.hairColor, (v) => set({ hairColor: v })));
      rows.push(cycler('Gorro', W.HATS, o.hat, (v) => set({ hat: v })));
      rows.push(swatches('Color', W.CLOTH_COLORS, o.hatColor, (v) => set({ hatColor: v })));
    } else if (tab === 'Ropa') {
      rows.push(cycler('Arriba', W.TOPS, o.top, (v) => set({ top: v })));
      rows.push(swatches('Color', W.CLOTH_COLORS, o.topColor, (v) => set({ topColor: v })));
      rows.push(cycler('Abajo', W.BOTTOMS, o.bottom, (v) => set({ bottom: v })));
      rows.push(swatches('Color', W.BOTTOM_COLORS, o.bottomColor, (v) => set({ bottomColor: v })));
      rows.push(swatches('Zapatos', W.SHOES, o.shoes, (v) => set({ shoes: v })));
    } else {
      rows.push(cycler('Cuello', W.ACCS, o.acc, (v) => set({ acc: v })));
      rows.push(swatches('Color', W.CLOTH_COLORS, o.accColor, (v) => set({ accColor: v })));
      rows.push(cycler('Bolsa', W.BAGS, o.bag, (v) => set({ bag: v })));
      rows.push(swatches('Color', W.CLOTH_COLORS, o.bagColor, (v) => set({ bagColor: v })));
      rows.push(swatches('Paraguas', W.UMBRELLAS, o.umbrella, (v) => {
        set({ umbrella: v });
        clip = 'umbrella';
      }));
    }
    opts.replaceChildren(...rows);
  }
  render();

  // vista previa: idle, de vez en cuando unos pasos, con el fondo de suelo de la plaza
  let running = true;
  let t0 = performance.now();
  const loop = (now: number) => {
    if (!running) return;
    const elapsed = now - t0;
    if (elapsed > 5200) {
      t0 = now;
      clip = clip === 'walk' ? 'idle' : 'walk';
    }
    const fr = getPlayerFrames(o, clip === 'umbrella' ? 'umbrella' : clip, dir);
    const total = fr.reduce((a, f) => a + f.dur, 0);
    let t = elapsed % total;
    let f = fr[0];
    for (const x of fr) {
      if (t < x.dur) {
        f = x;
        break;
      }
      t -= x.dur;
    }
    ctx.clearRect(0, 0, 48, 84);
    ctx.fillStyle = PALETTE.cal2;
    ctx.fillRect(10, 79, 28, 2);
    ctx.fillRect(14, 78, 20, 4);
    ctx.drawImage(f.canvas, 24 - f.ox, 80 - f.oy);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  sheet.open();
}
