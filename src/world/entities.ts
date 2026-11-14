// Entidades móviles: personaje y animales (movimiento por rejilla, animación, parpadeo).
import { TILE, type Box } from '../engine/iso.ts';
import { getFrames, type Clip, type Frame, type Look } from '../sprites/animals.ts';
import { getPlayerFrames, type Outfit, type PFrame, type PlayerClip } from '../sprites/player.ts';
import { PALETTE, type ColorName } from '../gfx/palette.ts';
import type { Grid } from './path.ts';

export function heightAt(g: Grid, x: number, y: number): number {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return 0;
  return g.height[ty * g.w + tx];
}

/** Dirección de sprite (0 +x, 1 +y, 2 −x, 3 −y) a partir del movimiento en el mundo. */
export function dirFromDelta(dx: number, dy: number, prev: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return prev;
  // movimientos diagonales puros (pantalla vertical/horizontal): conservar lado si se puede
  if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.2 * Math.max(Math.abs(dx), Math.abs(dy))) {
    if (dx > 0 && dy > 0) return prev === 1 ? 1 : 0;
    if (dx < 0 && dy < 0) return prev === 3 ? 3 : 2;
    if (dx > 0 && dy < 0) return prev === 0 ? 0 : 3;
    return prev === 2 ? 2 : 1;
  }
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy > 0 ? 1 : 3;
}

export class Mover {
  x: number;
  y: number;
  z: number;
  dir = 0;
  path: [number, number][] = [];
  speed = 40; // vóxeles/s
  moving = false;
  private zFrom = 0;
  private zTo = 0;

  constructor(tx: number, ty: number, g: Grid) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.z = heightAt(g, this.x, this.y);
  }

  get tx(): number {
    return Math.floor(this.x / TILE);
  }
  get ty(): number {
    return Math.floor(this.y / TILE);
  }

  setPath(p: [number, number][]): void {
    this.path = p.slice(p.length > 1 && p[0][0] === this.tx && p[0][1] === this.ty ? 1 : 0);
    this.moving = this.path.length > 0;
  }

  stop(): void {
    this.path = [];
    this.moving = false;
  }

  update(dt: number, g: Grid): boolean {
    if (!this.path.length) {
      this.moving = false;
      return false;
    }
    const [tx, ty] = this.path[0];
    const gx = tx * TILE + TILE / 2, gy = ty * TILE + TILE / 2;
    const dx = gx - this.x, dy = gy - this.y;
    const d = Math.hypot(dx, dy);
    this.dir = dirFromDelta(dx, dy, this.dir);
    const step = this.speed * dt;
    const fromH = heightAt(g, this.x, this.y);
    const toH = g.height[ty * g.w + tx];
    if (d <= step) {
      this.x = gx;
      this.y = gy;
      this.path.shift();
      this.zFrom = this.zTo = toH;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    // altura suave entre tiles (escaleras)
    const t = Math.max(0, Math.min(1, 1 - d / (TILE * 1.2)));
    this.zFrom = fromH;
    this.zTo = toH;
    this.z = this.zFrom + (this.zTo - this.zFrom) * t;
    this.moving = this.path.length > 0;
    return true;
  }
}

/** Reproductor de animaciones con tiempos por frame. */
export class AnimPlayer<F extends { dur: number }> {
  frames: F[] = [];
  key = '';
  i = 0;
  t = 0;
  done = false;
  loop = true;

  set(key: string, frames: F[], loop = true, restart = false): void {
    if (key === this.key && !restart) return;
    this.key = key;
    this.frames = frames;
    this.loop = loop;
    this.i = 0;
    this.t = 0;
    this.done = false;
  }

  update(dt: number, speed = 1): void {
    if (!this.frames.length) return;
    this.t += dt * 1000 * speed;
    while (this.t >= this.frames[this.i].dur) {
      this.t -= this.frames[this.i].dur;
      if (this.i + 1 >= this.frames.length) {
        if (this.loop) this.i = 0;
        else {
          this.done = true;
          this.t = 0;
          break;
        }
      } else this.i++;
    }
  }

  get frame(): F {
    return this.frames[this.i];
  }
}

export interface Drawable {
  box: Box;
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void;
  /** rectángulo en pantalla-mundo para oclusión */
  rect?: [number, number, number, number];
}

// ---------------------------------------------------------------- Personaje
export class Player implements Drawable {
  m: Mover;
  anim = new AnimPlayer<PFrame>();
  outfit: Outfit;
  action: PlayerClip | null = null;
  actionT = 0;
  box: Box = [0, 0, 0, 0, 0, 0];
  rect: [number, number, number, number] = [0, 0, 0, 0];

  constructor(tx: number, ty: number, g: Grid, outfit: Outfit) {
    this.m = new Mover(tx, ty, g);
    this.m.speed = 46;
    this.outfit = outfit;
  }

  update(dt: number, g: Grid, rain: boolean): void {
    this.m.update(dt, g);
    if (this.outfit.rain !== rain) this.outfit = { ...this.outfit, rain };
    let clip: PlayerClip = this.m.moving ? 'walk' : rain ? 'umbrella' : 'idle';
    if (this.action && !this.m.moving) {
      clip = this.action;
      this.actionT -= dt;
      if (this.actionT <= 0) this.action = null;
    }
    this.anim.set(clip + this.m.dir + (rain ? 'r' : ''), getPlayerFrames(this.outfit, clip, this.m.dir), true);
    this.anim.update(dt);
    const { x, y, z } = this.m;
    this.box = [x - 4, y - 4, z, x + 4, y + 4, z + 50];
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const f = this.anim.frame;
    if (!f) return;
    const sx = Math.round(2 * (this.m.x - this.m.y) - camX), sy = Math.round(this.m.x + this.m.y - this.m.z - camY);
    ctx.drawImage(f.canvas, sx - f.ox, sy - f.oy);
    this.rect = [sx - f.ox + camX, sy - f.oy + camY, f.canvas.width, f.canvas.height];
  }

  feet(): [number, number] {
    return [2 * (this.m.x - this.m.y), this.m.x + this.m.y - this.m.z];
  }
}

// ---------------------------------------------------------------- Animal
export type Reaction = 'heart' | 'alert' | 'sleep' | 'note' | null;

export class Animal implements Drawable {
  m: Mover;
  anim = new AnimPlayer<Frame>();
  look: Look;
  name: string;
  state: Clip = 'idle';
  /** cola de clips a reproducir (transiciones) */
  queue: Clip[] = [];
  stateT = 0;
  blinkT = 2 + Math.random() * 3;
  blinking = 0;
  reaction: Reaction = null;
  reactionT = 0;
  box: Box = [0, 0, 0, 0, 0, 0];
  rect: [number, number, number, number] = [0, 0, 0, 0];
  size: number;

  constructor(name: string, look: Look, tx: number, ty: number, g: Grid) {
    this.name = name;
    this.look = look;
    this.m = new Mover(tx, ty, g);
    this.m.speed = look.shape.species === 'cat' ? 26 : 32;
    this.size = look.shape.legH;
  }

  play(clip: Clip): void {
    this.queue = [];
    const sitting = this.state === 'sit' || this.state === 'lick' || this.state === 'scratch';
    const lying = this.state === 'lie';
    if (sitting && clip !== 'sit' && clip !== 'lick' && clip !== 'scratch') this.queue.push('standUp');
    if (lying && clip !== 'lie') this.queue.push('getUp');
    if ((clip === 'sit' || clip === 'lick' || clip === 'scratch') && !sitting) this.queue.push('sitDown');
    if (clip === 'lie' && !lying) this.queue.push('lieDown');
    if (clip === 'sleep' && this.state !== 'sleep') this.queue.push('lieDown');
    this.queue.push(clip);
    this.next();
  }

  private next(): void {
    const c = this.queue.shift();
    if (!c) return;
    this.state = c;
    const once = c === 'sitDown' || c === 'standUp' || c === 'lieDown' || c === 'getUp' || c === 'stretch' || c === 'meow';
    this.anim.set(c + this.m.dir, getFrames(this.look, c, this.m.dir), !once, true);
  }

  react(r: Reaction, t = 1.6): void {
    this.reaction = r;
    this.reactionT = t;
  }

  update(dt: number, g: Grid): void {
    this.m.update(dt, g);
    const moving = this.m.moving;
    if (moving) {
      const gait: Clip = this.m.speed > 45 ? 'run' : this.m.speed > 34 ? 'trot' : this.m.speed < 20 ? 'sneak' : 'walk';
      if (this.state !== gait) {
        this.queue = [];
        this.state = gait;
      }
      this.anim.set(gait + this.m.dir, getFrames(this.look, gait, this.m.dir));
    } else if (this.state === 'walk' || this.state === 'trot' || this.state === 'run' || this.state === 'sneak') {
      this.state = 'idle';
      this.anim.set('idle' + this.m.dir, getFrames(this.look, 'idle', this.m.dir));
    } else if (!this.anim.frames.length) {
      this.anim.set(this.state + this.m.dir, getFrames(this.look, this.state, this.m.dir));
    }
    this.anim.update(dt);
    if (this.anim.done) {
      if (this.queue.length) this.next();
      else {
        const settle: Clip = this.state === 'sitDown' ? 'sit' : this.state === 'lieDown' ? 'lie' : 'idle';
        this.state = settle;
        this.anim.set(settle + this.m.dir, getFrames(this.look, settle, this.m.dir), true, true);
      }
    }
    // parpadeo aleatorio
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = 0.13;
      this.blinkT = 2 + Math.random() * 4.5;
      if (Math.random() < 0.2) this.blinkT = 0.25; // doble parpadeo
    }
    if (this.blinking > 0) this.blinking -= dt;
    if (this.reactionT > 0) {
      this.reactionT -= dt;
      if (this.reactionT <= 0) this.reaction = null;
    }
    const { x, y, z } = this.m;
    const r = this.look.shape.species === 'cat' ? 4 : 5;
    this.box = [x - r, y - r, z, x + r, y + r, z + this.look.shape.legH * 2.5];
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const f = this.anim.frame;
    if (!f) return;
    const sx = Math.round(2 * (this.m.x - this.m.y) - camX), sy = Math.round(this.m.x + this.m.y - this.m.z - camY);
    const X = sx - f.ox, Y = sy - f.oy;
    ctx.drawImage(f.canvas, X, Y);
    if (this.blinking > 0 && f.eyeState === 'open') {
      ctx.fillStyle = PALETTE[f.outline as ColorName];
      for (const e of f.eyes) {
        const big = this.look.shape.eyeSize >= 3;
        // párpado: rellena el ojo con el pelaje de alrededor y deja una línea
        const fur = sampleAbove(f.canvas, e.x, e.y - 2);
        if (fur) {
          ctx.fillStyle = fur;
          ctx.fillRect(X + e.x, Y + e.y - 1, e.near ? 2 : 1, big ? 3 : 2);
        }
        ctx.fillStyle = PALETTE[f.outline as ColorName];
        ctx.fillRect(X + e.x, Y + e.y + (big ? 1 : 0), e.near ? 2 : 1, 1);
      }
    }
    this.rect = [X + camX, Y + camY, f.canvas.width, f.canvas.height];
  }

  screenPos(): [number, number] {
    return [2 * (this.m.x - this.m.y), this.m.x + this.m.y - this.m.z];
  }
}

const sampleCache = new WeakMap<HTMLCanvasElement, ImageData>();
function sampleAbove(c: HTMLCanvasElement, x: number, y: number): string | null {
  let d = sampleCache.get(c);
  if (!d) {
    d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    sampleCache.set(c, d);
  }
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
  const i = (y * c.width + x) * 4;
  if (!d.data[i + 3]) return null;
  return `rgb(${d.data[i]},${d.data[i + 1]},${d.data[i + 2]})`;
}
