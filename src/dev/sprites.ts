// Galería de desarrollo: razas, animaciones, personaje y props sobre suelo real, ×1 y ×3, día y noche.
import '../styles.css';
import { getFrames, SHAPES, COATS, type Clip, type Look } from '../sprites/animals.ts';
import { loadZone, type ZoneAssets } from '../engine/assets.ts';
import { getPlayerFrames, DEFAULT_OUTFIT, type PlayerClip } from '../sprites/player.ts';

const root = document.getElementById('root')!;
document.body.style.overflow = 'auto';
document.body.style.touchAction = 'auto';
document.documentElement.style.overflow = 'auto';

const LOOKS: Look[] = [
  { key: 'tabby', shape: SHAPES.catShort, coat: COATS.tabbyBrown },
  { key: 'galgo', shape: SHAPES.galgo, coat: COATS.galgoFawn },
];
const CLIPS: Clip[] = ['idle', 'walk', 'trot', 'run', 'sneak', 'sitDown', 'sit', 'lieDown', 'lie', 'sleep', 'stretch', 'lick', 'scratch', 'eat', 'drink', 'wag', 'meow'];
const PCLIPS: PlayerClip[] = ['idle', 'walk', 'crouch', 'give', 'umbrella'];

interface Cell {
  ctx: CanvasRenderingContext2D;
  scale: number;
  night: boolean;
  frames: () => { canvas: HTMLCanvasElement; ox: number; oy: number; dur: number }[];
  w: number;
  h: number;
}
const cells: Cell[] = [];
let zone: ZoneAssets | null = null;

function bg(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean): void {
  const g = zone?.sprites.get('plaza/suelo-2-2');
  if (g) ctx.drawImage(g.img, g.x + 120, g.y + 150, w, h, 0, 0, w, h);
  else {
    ctx.fillStyle = '#c9b8a8';
    ctx.fillRect(0, 0, w, h);
  }
  if (night) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#5d66b8';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function addCell(row: HTMLElement, label: string, frames: Cell['frames'], w: number, h: number, scale: number, night: boolean): void {
  const wrap = document.createElement('div');
  wrap.className = 'cell';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.width = w * scale + 'px';
  c.style.height = h * scale + 'px';
  wrap.appendChild(c);
  const t = document.createElement('span');
  t.textContent = label;
  wrap.appendChild(t);
  row.appendChild(wrap);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  cells.push({ ctx, scale, night, frames, w, h });
}

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  root.appendChild(h);
  const row = document.createElement('div');
  row.className = 'row';
  root.appendChild(row);
  return row;
}

async function main() {
  try {
    zone = await loadZone('plaza');
  } catch {
    zone = null;
  }
  const params = new URLSearchParams(location.search);
  const only = params.get('only');
  for (const look of LOOKS) {
    if (only && only !== look.key) continue;
    for (const scale of [3, 1]) {
      const row = section(`${look.key} · ×${scale}`);
      for (const clip of CLIPS)
        for (let dir = 0; dir < 4; dir++) {
          if (scale === 1 && dir > 1) continue;
          addCell(row, `${clip} ${dir}`, () => getFrames(look, clip, dir), 72, 76, scale, false);
        }
    }
    const row = section(`${look.key} · noche ×3`);
    for (const clip of ['idle', 'walk', 'sit', 'sleep'] as Clip[]) addCell(row, clip, () => getFrames(look, clip, 0), 72, 76, 3, true);
  }
  if (!only || only === 'player') {
    for (const scale of [3, 1]) {
      const row = section(`personaje · ×${scale}`);
      for (const clip of PCLIPS)
        for (let dir = 0; dir < 4; dir++) addCell(row, `${clip} ${dir}`, () => getPlayerFrames(DEFAULT_OUTFIT, clip, dir), 48, 72, scale, false);
    }
  }
  if (zone && (!only || only === 'props')) {
    const row = section('props y edificios (×1 y ×2)');
    for (const o of zone.meta.objects) {
      if (row.childElementCount > 24) break;
      const s = zone.sprites.get(o.sprite)!;
      for (const scale of [1, 2]) {
        const wrap = document.createElement('div');
        wrap.className = 'cell';
        const c = document.createElement('canvas');
        c.width = s.w;
        c.height = s.h;
        c.style.width = s.w * scale + 'px';
        const cx = c.getContext('2d')!;
        cx.fillStyle = '#c9b8a8';
        cx.fillRect(0, 0, s.w, s.h);
        cx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        wrap.appendChild(c);
        const t = document.createElement('span');
        t.textContent = o.kind;
        wrap.appendChild(t);
        row.appendChild(wrap);
      }
    }
  }
  const t0 = performance.now();
  const loop = (now: number) => {
    for (const cell of cells) {
      const fr = cell.frames();
      const total = fr.reduce((a, f) => a + f.dur, 0);
      let t = (now - t0) % total;
      let f = fr[0];
      for (const x of fr) {
        if (t < x.dur) {
          f = x;
          break;
        }
        t -= x.dur;
      }
      bg(cell.ctx, cell.w, cell.h, cell.night);
      // sombra de contacto
      cell.ctx.fillStyle = 'rgba(59,49,73,0.35)';
      const fx = Math.floor(cell.w / 2), fy = cell.h - 8;
      cell.ctx.fillRect(fx - 8, fy - 1, 16, 3);
      cell.ctx.fillRect(fx - 10, fy, 20, 1);
      cell.ctx.drawImage(f.canvas, fx - f.ox, fy - f.oy);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __ready: boolean }).__ready = true;
}
void main();
