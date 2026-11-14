// Decoración de las fiestas del calendario: calabazas de Samaín, brasero del Magosto,
// guirnaldas de Navidad, hoguera de San Juan, banderines y confeti del Entroido.
import { PALETTE, type ColorName } from '../gfx/palette.ts';
import type { EventId } from '../sim/calendar.ts';
import type { ZoneMeta } from '../engine/assets.ts';
import type { Drawable } from '../world/entities.ts';
import type { LightSrc } from './lighting.ts';
import type { Box } from '../engine/iso.ts';
import { matrix } from './sprites.ts';
import { drawEllipse } from './pixel.ts';

const S = (x: number, y: number, z: number): [number, number] => [2 * (x - y), x + y - z];

const PUMPKIN = ['....gg....', '..kkgkkk..', '.koOooOok.', 'koOyoOyOok', 'kOoOooOoOk', 'koOyyyyOok', '.kOoOoOok.', '..kkkkkk..'];
const PUMPKIN_KEY = { '.': null, k: 'tile0', o: 'tile3', O: 'tile2', g: 'veg2', y: 'tile1' } as Record<string, ColorName | null>;
const PUMPKIN_LIT = { ...PUMPKIN_KEY, y: 'butter' } as Record<string, ColorName | null>;

const BRAZIER = ['...........', '..k.k.k.k..', '.kbcbcbcbk.', 'kiiiiiiiiik', '.kiiiiiiik.', '..k.....k..', '..k.....k..', '.kk.....kk.'];
const BRAZIER_KEY = { '.': null, k: 'ink', i: 'ink2', b: 'wood1', c: 'tile3' } as Record<string, ColorName | null>;

const FIRE = [
  ['....y.....', '...yy..y..', '..yoy.yy..', '..oro.yo..', '.orror.o..', '.orRRroro.', 'orRRRRrro.', '.kwkkwkwk.'],
  ['.....y....', '..y.yy....', '..yyoy..y.', '..oroo.yo.', '.orrrorro.', '.orRRrroo.', 'orRRRRrro.', '.kwkkwkwk.'],
  ['...y......', '...yy.y...', '..yoyyy...', '.yorooo...', '.orrRror..', 'oorRRRrro.', 'orRRRRrro.', '.kwkkwkwk.'],
];
const FIRE_KEY = { '.': null, y: 'butter', o: 'mustard', r: 'tile3', R: 'tile2', k: 'wood0', w: 'wood2' } as Record<string, ColorName | null>;

const HAT = ['....ww', '...rr.', '..rrr.', '.rrrr.', 'wwwwww'];
export function santaHat(): HTMLCanvasElement {
  return matrix('santa', HAT, { '.': null, w: 'cal4', r: 'coral' });
}

class Prop implements Drawable {
  box: Box;
  rect: [number, number, number, number];
  constructor(public x: number, public y: number, public z: number, public draw: Drawable['draw'], w = 12, h = 12) {
    this.box = [x - 4, y - 4, z, x + 4, y + 4, z + 10];
    const [sx, sy] = S(x, y, z);
    this.rect = [sx - w / 2, sy - h, w, h];
  }
}

export interface Garland {
  a: [number, number];
  b: [number, number];
  kind: 'luces' | 'banderines';
}

export class Festivities {
  props: Prop[] = [];
  lights: LightSrc[] = [];
  garlands: Garland[] = [];
  confetti = false;
  fireAt: [number, number] | null = null;
  braziers: [number, number][] = [];
  hats = false;
  private t = 0;

  constructor(public events: EventId[], meta: ZoneMeta) {
    const G = 40;
    const has = (e: EventId) => events.includes(e);
    if (has('samain')) {
      // calabazas en las puertas y en las esquinas de la fuente
      const spots: [number, number][] = [[3.4, 7.6], [3.4, 12.4], [9.3, 3.4], [15.2, 3.4], [9, 9], [14.4, 9], [9, 14.4], [14.4, 14.4], [12.6, 18.7]];
      spots.forEach(([tx, ty], i) => {
        const x = tx * 16, y = ty * 16;
        const lit = () => this.night > 0.3;
        this.props.push(new Prop(x, y, G, (ctx, cx, cy) => {
          const [sx, sy] = S(x, y, G);
          const img = matrix(lit() ? 'pumpkin-lit' : 'pumpkin', PUMPKIN, lit() ? PUMPKIN_LIT : PUMPKIN_KEY);
          ctx.drawImage(img, Math.round(sx - 5 - cx), Math.round(sy - 8 - cy));
        }, 10, 8));
        const [sx, sy] = S(x, y, G + 4);
        this.lights.push({ sx, sy, gx: sx, gy: sy + 4, r: 14, kind: 'window', phase: i * 1.7 });
      });
    }
    if (has('magosto')) {
      const x = 13.4 * 16, y = 17.6 * 16;
      this.braziers.push([x, y]);
      this.props.push(new Prop(x, y, G, (ctx, cx, cy) => {
        const [sx, sy] = S(x, y, G);
        ctx.drawImage(matrix('brazier', BRAZIER, BRAZIER_KEY), Math.round(sx - 5 - cx), Math.round(sy - 8 - cy));
        // castañas en la parrilla (brillan un poco)
        ctx.fillStyle = Math.floor(this.t * 3) % 2 ? PALETTE.tile3 : PALETTE.mustard;
        ctx.fillRect(Math.round(sx - 2 - cx), Math.round(sy - 7 - cy), 1, 1);
        ctx.fillRect(Math.round(sx + 2 - cx), Math.round(sy - 7 - cy), 1, 1);
      }, 11, 8));
      const [sx, sy] = S(x, y, G + 8);
      this.lights.push({ sx, sy, gx: sx, gy: sy + 8, r: 22, kind: 'kiosk', phase: 3 });
    }
    if (has('navidad')) {
      this.hats = true;
      // guirnaldas de fachada a fachada, cruzando la plaza
      for (const k of [120, 190, 260]) this.garlands.push({ a: [48, k], b: [k, 48], kind: 'luces' });
    }
    if (has('sanjuan')) {
      const x = 8.6 * 16, y = 13.6 * 16;
      this.fireAt = [x, y];
      this.props.push(new Prop(x, y, G, (ctx, cx, cy) => {
        const [sx, sy] = S(x, y, G);
        const fi = (Math.floor((this.t || 0) * 8) % 3 + 3) % 3;
        ctx.drawImage(matrix('fire' + fi, FIRE[fi], FIRE_KEY), Math.round(sx - 5 - cx), Math.round(sy - 8 - cy));
      }, 10, 8));
      const [sx, sy] = S(x, y, G + 6);
      this.lights.push({ sx, sy, gx: sx, gy: sy + 6, r: 60, kind: 'lamp', phase: 9 });
    }
    if (has('entroido') || has('animales')) {
      for (const k of [140, 230]) this.garlands.push({ a: [48, k], b: [k, 48], kind: 'banderines' });
      this.confetti = has('entroido');
    }
    void meta;
  }

  night = 0;

  update(dt: number, night: number): void {
    if (Number.isFinite(dt)) this.t += dt;
    this.night = night;
  }

  /** Guirnaldas (encima de la escena; las bombillas brillan después del tinte). */
  drawGarlands(ctx: CanvasRenderingContext2D, camX: number, camY: number, emissive: boolean): void {
    const Z = 150;
    for (const [gi, g] of this.garlands.entries()) {
      const [ax, ay] = S(g.a[0], g.a[1], Z);
      const [bx, by] = S(g.b[0], g.b[1], Z);
      const steps = Math.max(8, Math.round(Math.hypot(bx - ax, by - ay)));
      const sag = 14 + Math.hypot(bx - ax, by - ay) * 0.06;
      if (!emissive) {
        ctx.fillStyle = PALETTE.ink2;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          ctx.fillRect(Math.round(ax + (bx - ax) * t - camX), Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * sag - camY), 1, 1);
        }
      }
      const n = Math.floor(steps / 7);
      const cols: ColorName[] = g.kind === 'luces' ? ['coral', 'mustard', 'sky', 'veg3', 'lilac'] : ['coral', 'mustard', 'sky', 'veg3', 'cal4'];
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const x = Math.round(ax + (bx - ax) * t - camX), y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * sag - camY);
        const c = cols[(k + gi) % cols.length];
        if (g.kind === 'banderines') {
          if (emissive) continue;
          ctx.fillStyle = PALETTE[c];
          ctx.fillRect(x - 1, y + 1, 3, 1);
          ctx.fillRect(x - 1, y + 2, 3, 1);
          ctx.fillRect(x, y + 3, 1, 1);
        } else {
          const on = Math.sin(this.t * 2 + k * 1.3 + gi) > -0.3;
          if (emissive && !on) continue;
          if (emissive) {
            ctx.globalAlpha = 0.35 * this.night;
            ctx.fillStyle = PALETTE[c];
            ctx.fillRect(x - 1, y, 3, 3);
            ctx.globalAlpha = Math.max(0.4, this.night);
          }
          ctx.fillStyle = PALETTE[c];
          ctx.fillRect(x, y + 1, 2, 2);
          if (emissive) {
            ctx.fillStyle = PALETTE.cal4;
            ctx.fillRect(x, y + 1, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** Humo del brasero, chispas de la hoguera y confeti. */
  drawAir(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const [x, y] of this.braziers) {
      const [sx, sy] = S(x, y, 52);
      for (let i = 0; i < 6; i++) {
        const k = ((this.t * 0.3 + i / 6) % 1);
        ctx.globalAlpha = 0.45 * (1 - k);
        drawEllipse(ctx, sx - camX + Math.sin(k * 6 + i) * 3 + k * 6, sy - camY - k * 34, 1 + k * 4, 1 + k * 3, PALETTE.stone3);
      }
      ctx.globalAlpha = 1;
    }
    if (this.fireAt) {
      const [sx, sy] = S(this.fireAt[0], this.fireAt[1], 50);
      for (let i = 0; i < 10; i++) {
        const k = ((this.t * 0.6 + i / 10) % 1);
        ctx.fillStyle = k < 0.5 ? PALETTE.butter : PALETTE.mustard;
        ctx.globalAlpha = 1 - k;
        ctx.fillRect(Math.round(sx - camX + Math.sin(k * 9 + i * 2) * 5), Math.round(sy - camY - k * 40), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawConfetti(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
    if (!this.confetti) return;
    const cols: ColorName[] = ['coral', 'mustard', 'sky', 'veg3', 'lilac', 'pink'];
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97.13 + this.t * (8 + (i % 5) * 3)) % (vw + 20)) - 10 + Math.sin(this.t * 2 + i) * 4;
      const y = ((i * 61.7 + this.t * (14 + (i % 7) * 2)) % (vh + 20)) - 10;
      ctx.fillStyle = PALETTE[cols[i % cols.length]];
      ctx.fillRect(Math.round(x), Math.round(y), (i + Math.floor(this.t * 6)) % 2 ? 2 : 1, 1);
    }
  }
}
