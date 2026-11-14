// Bucle principal: zona, cámara, entidades, orden por profundidad, luz, clima y vida ambiental.
import { View } from './engine/view.ts';
import { loadZone, type ZoneAssets, type SpriteRef } from './engine/assets.ts';
import { boxBehind, screenToWorld, TILE, type Box } from './engine/iso.ts';
import { attachInput } from './engine/input.ts';
import { findPath, nearestWalkable, type Grid } from './world/path.ts';
import { Player, Animal, type Drawable } from './world/entities.ts';
import { makeLook } from './sprites/breeds.ts';
import { DEFAULT_OUTFIT } from './sprites/player.ts';
import { gradeAt, weatherGrade, type Grade } from './fx/daylight.ts';
import { Lighting, type LightSrc } from './fx/lighting.ts';
import { Ambient, type Weather } from './fx/ambient.ts';
import { pixelEllipse, rgb } from './fx/pixel.ts';
import { heart, alert, zzz, note } from './fx/sprites.ts';
import { PALETTE } from './gfx/palette.ts';

interface StaticObj extends Drawable {
  sprite: SpriteRef;
  night: SpriteRef | null;
  occluder: boolean;
  kind: string;
  fade: number;
  nightAt: number;
}

export interface GameOptions {
  hour?: number;
  weather?: Partial<Weather>;
  shot?: boolean;
}

export class Game {
  view: View;
  zone!: ZoneAssets;
  grid!: Grid;
  player!: Player;
  animals: Animal[] = [];
  objects: StaticObj[] = [];
  lights: LightSrc[] = [];
  ambient!: Ambient;
  lighting = new Lighting();
  cam = { x: 0, y: 0, follow: true };
  bounds: [number, number, number, number] = [0, 0, 0, 0];
  weather: Weather = { rain: 0, fog: 0, snow: 0, overcast: 0, wind: 0.2 };
  grade!: Grade;
  hourOverride: number | null = null;
  running = false;
  last = 0;
  private marker: { x: number; y: number; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement, private opts: GameOptions = {}) {
    this.view = new View(canvas);
    if (opts.hour !== undefined) this.hourOverride = opts.hour;
    Object.assign(this.weather, opts.weather ?? {});
  }

  get hour(): number {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  async init(): Promise<void> {
    this.zone = await loadZone('plaza');
    const m = this.zone.meta;
    this.grid = { w: m.tilesW, h: m.tilesH, walk: m.walk, height: m.height };
    // objetos estáticos
    for (const o of m.objects) {
      const sprite = this.zone.sprites.get(o.sprite)!;
      const night = o.night ? this.zone.sprites.get(o.night) ?? null : null;
      const obj: StaticObj = {
        sprite, night, occluder: o.occluder, kind: o.kind, box: o.box, fade: 1,
        nightAt: 0.3 + (Math.abs(Math.sin(o.box[0] * 12.9898 + o.box[1] * 78.233)) % 1) * 0.45,
        draw: (ctx, camX, camY) => {
          ctx.globalAlpha = obj.fade;
          ctx.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h, sprite.ox - camX, sprite.oy - camY, sprite.w, sprite.h);
          ctx.globalAlpha = 1;
        },
        rect: [sprite.ox, sprite.oy, sprite.w, sprite.h],
      };
      this.objects.push(obj);
    }
    // límites de cámara
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of m.ground) {
      const s = this.zone.sprites.get(g)!;
      x0 = Math.min(x0, s.ox); y0 = Math.min(y0, s.oy); x1 = Math.max(x1, s.ox + s.w); y1 = Math.max(y1, s.oy + s.h);
    }
    for (const o of this.objects) y0 = Math.min(y0, o.sprite.oy);
    this.bounds = [x0, y0, x1, y1];
    // luces
    let ph = 0;
    for (const l of m.lights) {
      const groundZ = 40;
      this.lights.push({
        sx: 2 * (l.x - l.y), sy: l.x + l.y - l.z, gx: 2 * (l.x - l.y), gy: l.x + l.y - groundZ,
        r: l.kind === 'lamp' ? 46 : l.kind === 'kiosk' ? 30 : 26, kind: l.kind, phase: ph++,
      });
    }
    // personaje y animales
    this.player = new Player(m.spawn[0], m.spawn[1], this.grid, { ...DEFAULT_OUTFIT });
    this.animals.push(new Animal('Nemesio', makeLook('europeo', 0, 1), 13, 13, this.grid));
    this.animals.push(new Animal('Lucáreo', makeLook('galgo', 0, 2), 9, 14, this.grid));
    this.ambient = new Ambient(m, this.bounds);
    const [fx, fy] = this.player.feet();
    this.cam.x = fx;
    this.cam.y = fy - 30;
    if (this.opts.shot) this.setupShot();
    attachInput(this.view.canvas, {
      tap: (x, y) => this.onTap(x, y),
      drag: (dx, dy) => {
        const k = this.view.dpr / this.view.zoom;
        this.cam.x -= dx * k;
        this.cam.y -= dy * k;
        this.cam.follow = false;
      },
      dragEnd: () => {},
      zoom: (s) => this.view.setZoomBias(this.view.zoomBias + s),
      firstGesture: () => {},
    });
    addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.running = false;
      else this.start();
    });
  }

  /** Composición fija para las capturas de revisión. */
  private setupShot(): void {
    const [nem, gal] = this.animals;
    nem.m.x = 13 * TILE + 8; nem.m.y = 14 * TILE + 4; nem.m.dir = 1;
    nem.play('sit');
    gal.m.x = 9 * TILE + 8; gal.m.y = 13 * TILE + 2; gal.m.dir = 0;
    this.player.m.x = 11 * TILE + 8; this.player.m.y = 15 * TILE + 2; this.player.m.dir = 0;
    const [fx, fy] = this.player.feet();
    this.cam.x = fx + 30;
    this.cam.y = fy - 150;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private onTap(cssX: number, cssY: number): void {
    const [bx, by] = this.view.toBuf(cssX, cssY);
    const camX = Math.round(this.cam.x - this.view.w / 2), camY = Math.round(this.cam.y - this.view.h / 2);
    const wx = bx + camX, wy = by + camY;
    // ¿animal?
    for (const a of this.animals) {
      const [x, y, w, h] = a.rect;
      if (wx >= x + w * 0.2 && wx <= x + w * 0.8 && wy >= y + h * 0.3 && wy <= y + h) {
        a.react('heart', 1.8);
        if (a.look.shape.species === 'dog') a.play('wag');
        else a.play('meow');
        return;
      }
    }
    // suelo: probar alturas de mayor a menor
    const heights = [...new Set(Array.from(this.grid.height))].sort((a, b) => b - a);
    for (const h of heights) {
      const [x, y] = screenToWorld(wx, wy, h);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= this.grid.w || ty >= this.grid.h) continue;
      if (this.grid.height[ty * this.grid.w + tx] !== h) continue;
      const target = nearestWalkable(this.grid, tx, ty);
      if (!target) return;
      const path = findPath(this.grid, this.player.m.tx, this.player.m.ty, target[0], target[1]);
      if (path) {
        this.player.m.setPath(path);
        this.cam.follow = true;
        this.marker = { x: target[0] * TILE + 8, y: target[1] * TILE + 8, t: 0.8 };
      }
      return;
    }
  }

  private wanderT = 0;
  update(dt: number): void {
    const rain = this.weather.rain > 0.3;
    this.player.update(dt, this.grid, rain);
    // comportamiento mínimo de prueba (el de verdad llega en el hito 4)
    this.wanderT -= dt;
    if (this.wanderT <= 0 && !this.opts.shot) {
      this.wanderT = 3 + Math.random() * 3;
      const a = this.animals[Math.floor(Math.random() * this.animals.length)];
      const r = Math.random();
      if (r < 0.35) {
        const t = nearestWalkable(this.grid, 5 + Math.floor(Math.random() * 13), 5 + Math.floor(Math.random() * 13));
        if (t) {
          const p = findPath(this.grid, a.m.tx, a.m.ty, t[0], t[1]);
          if (p) {
            a.m.speed = Math.random() < 0.3 ? 38 : 26;
            a.m.setPath(p);
          }
        }
      } else if (!a.m.moving) {
        const opts = ['sit', 'lie', 'sleep', 'stretch', 'lick', 'scratch', 'idle', 'eat', 'drink'] as const;
        const c = opts[Math.floor(Math.random() * opts.length)];
        a.play(c);
        if (c === 'sleep') a.react('sleep', 4);
      }
    }
    for (const a of this.animals) a.update(dt, this.grid);
    const pf = this.player.feet();
    if (this.cam.follow) {
      const k = 1 - Math.exp(-dt * 4);
      this.cam.x += (pf[0] - this.cam.x) * k;
      this.cam.y += (pf[1] - 30 - this.cam.y) * k;
    }
    const [x0, y0, x1, y1] = this.bounds;
    const clampAxis = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    this.cam.x = clampAxis(this.cam.x, x0 + this.view.w / 2 + 24, x1 - this.view.w / 2 - 24);
    this.cam.y = clampAxis(this.cam.y, y0 + this.view.h / 2, y1 - this.view.h / 2 - 8);
    this.grade = weatherGrade(gradeAt(this.hour), this.weather.rain, this.weather.fog, this.weather.overcast);
    this.ambient.update(dt, this.hour, this.weather, [this.player.m.x, this.player.m.y], 'otoño');
    if (this.marker) {
      this.marker.t -= dt;
      if (this.marker.t <= 0) this.marker = null;
    }
  }

  render(dt: number): void {
    const v = this.view, b = v.b;
    const camX = Math.round(this.cam.x - v.w / 2), camY = Math.round(this.cam.y - v.h / 2);
    const g = this.grade;
    b.globalCompositeOperation = 'source-over';
    b.fillStyle = rgb([g.sky[0] * 0.35, g.sky[1] * 0.35, g.sky[2] * 0.45]);
    b.fillRect(0, 0, v.w, v.h);
    // suelo
    for (const name of this.zone.meta.ground) {
      const s = this.zone.sprites.get(name)!;
      const X = s.ox - camX, Y = s.oy - camY;
      if (X > v.w || Y > v.h || X + s.w < 0 || Y + s.h < 0) continue;
      b.drawImage(s.img, s.x, s.y, s.w, s.h, X, Y, s.w, s.h);
    }
    // suelo mojado: más oscuro y frío
    if (this.weather.rain > 0.05) {
      b.globalCompositeOperation = 'multiply';
      b.globalAlpha = Math.min(1, this.weather.rain);
      b.fillStyle = 'rgb(208,212,232)';
      b.fillRect(0, 0, v.w, v.h);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
    }
    // charcos, ondas, sombras de nubes
    this.ambient.drawGround(b, camX, camY, this.weather, g.sky, g.night);
    // marcador de destino
    if (this.marker) {
      const sx = 2 * (this.marker.x - this.marker.y) - camX, sy = this.marker.x + this.marker.y - 40 - camY;
      b.globalAlpha = Math.min(1, this.marker.t * 2);
      b.drawImage(pixelEllipse(6, 3, PALETTE.cal4), Math.round(sx - 6), Math.round(sy - 3));
      b.drawImage(pixelEllipse(4, 2, PALETTE.stone2), Math.round(sx - 4), Math.round(sy - 2));
      b.globalAlpha = 1;
    }
    // sombras de contacto (dos tonos, multiplicando)
    b.globalCompositeOperation = 'multiply';
    for (const e of [this.player, ...this.animals]) {
      const [sx, sy] = 'feet' in e ? e.feet() : e.screenPos();
      const big = e instanceof Animal ? (e.look.shape.legH > 15 ? 11 : 8) : 8;
      b.drawImage(pixelEllipse(big, Math.ceil(big / 2.5), '#b9b1cf'), Math.round(sx - camX - big), Math.round(sy - camY - Math.ceil(big / 2.5)));
      b.drawImage(pixelEllipse(big - 3, Math.max(1, Math.ceil(big / 2.5) - 1), '#9d93bb'), Math.round(sx - camX - big + 3), Math.round(sy - camY - Math.ceil(big / 2.5) + 1));
    }
    b.globalCompositeOperation = 'source-over';
    // objetos + entidades ordenados por profundidad (orden topológico de cajas)
    const list: Drawable[] = [];
    for (const o of this.objects) {
      const [x, y, w, h] = o.rect!;
      if (x - camX > v.w || y - camY > v.h || x + w - camX < 0 || y + h - camY < 0) continue;
      list.push(o);
    }
    list.push(this.player, ...this.animals, ...this.ambient.drawables);
    const sorted = topoSort(list);
    // oclusión: los objetos delante del jugador que lo tapan se vuelven semitransparentes
    const pr = this.player.rect;
    const pIdx = sorted.indexOf(this.player);
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i] as StaticObj;
      if (!('occluder' in o)) continue;
      let target = 1;
      if (o.occluder && i > pIdx) {
        const [x, y, w, h] = o.rect!;
        if (pr[0] < x + w && pr[0] + pr[2] > x && pr[1] + 10 < y + h && pr[1] + pr[3] > y && overlapsOpaque(o.sprite, pr)) target = 0.42;
      }
      o.fade += (target - o.fade) * Math.min(1, dt * 8);
    }
    for (const d of sorted) d.draw(b, camX, camY);
    // ropa tendida y aire (humo, hojas…)
    this.ambient.drawLaundry(b, camX, camY, this.weather.wind);
    this.ambient.drawAir(b, camX, camY);
    // --- luz
    const night = g.night;
    if (night > 0.05) this.lighting.capture(v.buf);
    this.lighting.grade(b, v.w, v.h, g);
    if (night > 0.05) {
      // ventanas encendidas (cada casa a su hora)
      for (const o of sorted) {
        const so = o as StaticObj;
        if (!('night' in so) || !so.night) continue;
        const a = Math.max(0, Math.min(1, (night - so.nightAt) * 4));
        if (a <= 0) continue;
        const s = so.night;
        b.globalAlpha = a * so.fade;
        b.drawImage(s.img, s.x, s.y, s.w, s.h, s.ox - camX, s.oy - camY, s.w, s.h);
      }
      b.globalAlpha = 1;
      this.lighting.pools(b, this.lights, camX, camY, night, dt);
    }
    this.ambient.drawOverlay(b, camX, camY, v.w, v.h, this.weather, night);
    // reacciones sobre los animales
    for (const a of this.animals) {
      if (!a.reaction) continue;
      const [sx, sy] = a.screenPos();
      const img = a.reaction === 'heart' ? heart() : a.reaction === 'alert' ? alert() : a.reaction === 'sleep' ? zzz() : note();
      const lift = a.reaction === 'heart' ? (1.8 - a.reactionT) * 6 : Math.sin(a.reactionT * 3) * 2;
      const top = a.look.shape.legH * 2.3 + 10;
      b.globalAlpha = Math.min(1, a.reactionT * 2);
      b.drawImage(img, Math.round(sx - camX - img.width / 2), Math.round(sy - camY - top - lift));
      b.globalAlpha = 1;
    }
    v.present();
  }
}

function topoSort(list: Drawable[]): Drawable[] {
  const n = list.length;
  const out: Drawable[] = [];
  const state = new Uint8Array(n);
  const boxes: Box[] = list.map((d) => d.box);
  const visit = (i: number) => {
    if (state[i]) return;
    state[i] = 1;
    for (let j = 0; j < n; j++) if (j !== i && !state[j] && boxBehind(boxes[j], boxes[i]) && overlapScreen(list[i], list[j])) visit(j);
    state[i] = 2;
    out.push(list[i]);
  };
  // orden inicial por profundidad aproximada para estabilidad
  const idx = list.map((_, i) => i).sort((a, b) => boxes[a][0] + boxes[a][1] - boxes[b][0] - boxes[b][1]);
  for (const i of idx) visit(i);
  return out;
}

function overlapScreen(a: Drawable, b: Drawable): boolean {
  const ra = a.rect, rb = b.rect;
  if (!ra || !rb || !ra[2] || !rb[2]) return true;
  return ra[0] < rb[0] + rb[2] && rb[0] < ra[0] + ra[2] && ra[1] < rb[1] + rb[3] && rb[1] < ra[1] + ra[3];
}

const alphaCache = new WeakMap<SpriteRef, Uint8Array>();
/** ¿Hay píxeles opacos del sprite dentro del rectángulo del jugador? */
function overlapsOpaque(s: SpriteRef, r: [number, number, number, number]): boolean {
  let a = alphaCache.get(s);
  if (!a) {
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d')!;
    x.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    const d = x.getImageData(0, 0, s.w, s.h).data;
    a = new Uint8Array(s.w * s.h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    alphaCache.set(s, a);
  }
  const x0 = Math.max(0, Math.floor(r[0] + r[2] * 0.3 - s.ox)), x1 = Math.min(s.w, Math.ceil(r[0] + r[2] * 0.7 - s.ox));
  const y0 = Math.max(0, Math.floor(r[1] + r[3] * 0.25 - s.oy)), y1 = Math.min(s.h, Math.ceil(r[1] + r[3] * 0.95 - s.oy));
  let hits = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) if (a[y * s.w + x]) hits++;
  return hits > 6;
}
