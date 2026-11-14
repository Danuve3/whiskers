// Bucle principal: zona, cámara, entidades, orden por profundidad, luz, clima y vida ambiental.
import { View } from './engine/view.ts';
import { loadZone, type ZoneAssets, type SpriteRef } from './engine/assets.ts';
import { boxBehind, screenToWorld, TILE, type Box } from './engine/iso.ts';
import { attachInput } from './engine/input.ts';
import { findPath, nearestWalkable, type Grid } from './world/path.ts';
import { Player, Animal, dirFromDelta, type Drawable } from './world/entities.ts';
import { DEFAULT_OUTFIT } from './sprites/player.ts';
import { gradeAt, weatherGrade, type Grade } from './fx/daylight.ts';
import { Lighting, type LightSrc } from './fx/lighting.ts';
import { Ambient, type Weather } from './fx/ambient.ts';
import { pixelEllipse, rgb } from './fx/pixel.ts';
import { heart, alert, zzz, note } from './fx/sprites.ts';
import { PALETTE } from './gfx/palette.ts';
import * as sfx from './audio/sfx.ts';
import { music, moodFor } from './audio/music.ts';
import { ambience } from './audio/ambience.ts';
import { season as seasonOf, activeEvents, canonicalHour, type Season, type EventId } from './sim/calendar.ts';
import { weatherAt, lerpW, skyAt, type Sky } from './sim/weather.ts';
import { Festivities } from './fx/events.ts';
import { Population, type Entry } from './world/population.ts';
import { generateAnimal, hearts, comfortDistance, type Action, type ActionResult, type AnimalData, type FoodId } from './sim/model.ts';

export interface WorldState {
  animals: AnimalData[];
  inventory: Partial<Record<FoodId, number>>;
  stats: Record<string, number>;
  nextSeed: number;
}

/** Rincones acogedores de la plaza donde los animales se quedan a dormir. */
export const HOMES: [number, number][] = [[17, 9], [8, 18], [16, 17], [6, 9], [12, 5], [18, 13], [5, 13], [10, 18], [14, 5]];
export const ZONE_CAP = 7;

export function newWorld(seed: number): WorldState {
  return { animals: [], inventory: {}, stats: {}, nextSeed: seed };
}

export interface GameEvents {
  animalTap(e: Entry, cssX: number, cssY: number): void;
  groundTap(): void;
  toast(msg: string): void;
  care(e: Entry, act: Action, res: ActionResult): void;
  firstGesture?(): void;
}

interface StaticObj extends Drawable {
  sprite: SpriteRef;
  base: SpriteRef;
  variants: Partial<Record<string, SpriteRef>>;
  snow: SpriteRef | null;
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
  season?: Season;
  events?: EventId[];
}

export class Game {
  view: View;
  zone!: ZoneAssets;
  grid!: Grid;
  player!: Player;
  pop!: Population;
  world: WorldState = newWorld(1);
  events: GameEvents = { animalTap: () => {}, groundTap: () => {}, toast: () => {}, care: () => {} };
  pending: { e: Entry; act: Action; food: FoodId; repath: number } | null = null;
  get animals(): Animal[] {
    return this.pop.entries.map((e) => e.ent);
  }
  objects: StaticObj[] = [];
  lights: LightSrc[] = [];
  ambient!: Ambient;
  lighting = new Lighting();
  cam = { x: 0, y: 0, follow: true };
  bounds: [number, number, number, number] = [0, 0, 0, 0];
  weather: Weather = { rain: 0, fog: 0, snow: 0, overcast: 0, wind: 0.2 };
  grade!: Grade;
  hourOverride: number | null = null;
  season: Season = 'otoño';
  fiestas: EventId[] = [];
  fest!: Festivities;
  snowCover = 0;
  sky: Sky = 'sol';
  private weatherT = 0;
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
    return canonicalHour(new Date());
  }

  async init(): Promise<void> {
    this.zone = await loadZone('plaza');
    const m = this.zone.meta;
    this.grid = { w: m.tilesW, h: m.tilesH, walk: m.walk, height: m.height };
    const now = new Date();
    this.season = this.opts.season ?? seasonOf(now);
    this.fiestas = this.opts.events ?? activeEvents(now);
    const seasonKey = this.season === 'otoño' ? 'otono' : this.season;
    if (!this.opts.weather) {
      Object.assign(this.weather, weatherAt(now));
      this.sky = skyAt(now);
    }
    if (this.weather.snow > 0.5) this.snowCover = 1;
    // objetos estáticos (con su variante de estación y su capa de nieve)
    for (const o of m.objects) {
      const base = this.zone.sprites.get(o.sprite)!;
      const variants: StaticObj['variants'] = {};
      for (const v of o.seasons ?? []) variants[v] = this.zone.sprites.get(`${o.sprite}~${v}`);
      const sprite = variants[seasonKey] ?? base;
      const vn = variants[seasonKey] ? `${o.sprite}~${seasonKey}` : o.sprite;
      const night = o.night ? this.zone.sprites.get(o.night) ?? null : null;
      const snow = this.zone.sprites.get(vn + '@nieve') ?? null;
      const obj: StaticObj = {
        sprite, base, variants, snow, night, occluder: o.occluder, kind: o.kind, box: o.box, fade: 1,
        nightAt: 0.3 + (Math.abs(Math.sin(o.box[0] * 12.9898 + o.box[1] * 78.233)) % 1) * 0.45,
        draw: (ctx, camX, camY) => {
          ctx.globalAlpha = obj.fade;
          ctx.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h, sprite.ox - camX, sprite.oy - camY, sprite.w, sprite.h);
          if (snow && this.snowCover > 0.01) {
            ctx.globalAlpha = obj.fade * Math.min(1, this.snowCover);
            ctx.drawImage(snow.img, snow.x, snow.y, snow.w, snow.h, snow.ox - camX, snow.oy - camY, snow.w, snow.h);
          }
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
    this.pop = new Population(this.grid, {
      care: (e, act, res) => this.events.care(e, act, res),
      toast: (m) => this.events.toast(m),
      sock: (e) => {
        this.world.stats.calcetines = (this.world.stats.calcetines ?? 0) + 1;
        this.events.toast(`¡${e.data.name} te ha robado un calcetín!`);
      },
    });
    this.populate();
    this.ambient = new Ambient(m, this.bounds);
    this.fest = new Festivities(this.fiestas, m);
    for (const l of this.fest.lights) this.lights.push(l);
    this.ambient.onFlap = () => sfx.flap();
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
      firstGesture: () => this.events.firstGesture?.(),
    });
    addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.running = false;
      else this.start();
    });
  }

  /** Primeros animales del barrio (Nemesio siempre está) y carga de los guardados. */
  private populate(): void {
    const W = this.world;
    if (!W.animals.length) {
      const now = Date.now();
      const nem = generateAnimal(1, { zone: 'plaza', used: [], now, home: [13, 13] });
      Object.assign(nem, { name: 'Nemesio', breed: 'europeo', variant: 0, personality: 'carinoso', favorite: 'atun', schedule: 'siempre', trust: 1.3, injured: false, rare: null, known: true });
      const luc = generateAnimal(2, { zone: 'plaza', used: ['Nemesio'], now, home: [5, 16] });
      Object.assign(luc, { name: 'Lucáreo', breed: 'galgo', variant: 0, personality: 'timido', favorite: 'galletas', schedule: 'dia', trust: 0.2, injured: true, rare: null });
      W.animals.push(nem, luc);
      for (let i = 0; i < 2; i++) this.spawnNew(HOMES[i], false);
    }
    for (const a of W.animals) if (a.zone === 'plaza') this.pop.add(a);
  }

  /** Llega un animal nuevo al barrio. */
  spawnNew(home: [number, number], addToScene = true): Entry | null {
    const W = this.world;
    const seed = (W.nextSeed = (W.nextSeed * 48271 + 11) % 2147483647);
    const h = this.hour;
    const a = generateAnimal(seed, { zone: 'plaza', used: W.animals.map((x) => x.name), now: Date.now(), home, night: h < 7 || h > 21, fullMoon: false });
    W.animals.push(a);
    return addToScene ? this.pop.add(a) : null;
  }

  /** Camina hasta un tile (utilidad para pruebas y el tutorial). */
  walkTo(tx: number, ty: number): boolean {
    const t = nearestWalkable(this.grid, tx, ty);
    if (!t) return false;
    const path = findPath(this.grid, this.player.m.tx, this.player.m.ty, t[0], t[1]);
    if (path) this.player.m.setPath(path);
    return !!path;
  }

  /** De vez en cuando aparece alguien nuevo (con tope por zona). */
  maybeArrival(now: number): Entry | null {
    const st = this.world.stats;
    const last = st.lastArrival ?? now;
    if (!st.lastArrival) st.lastArrival = now;
    const here = this.world.animals.filter((a) => a.zone === 'plaza').length;
    if (here >= ZONE_CAP || now - last < 12 * 60_000) return null;
    st.lastArrival = now;
    const used = new Set(this.world.animals.map((a) => a.home.join(',')));
    const home = HOMES.find((h) => !used.has(h.join(','))) ?? HOMES[Math.floor(Math.random() * HOMES.length)];
    const e = this.spawnNew(home);
    if (e) {
      // llega desde la escalera de la calle de abajo
      e.ent.m.x = 15 * TILE + 8;
      e.ent.m.y = 19 * TILE + 8;
    }
    return e;
  }

  /** El jugador pide una acción sobre un animal: camina hasta él y la hace. */
  request(e: Entry, act: Action, food: FoodId = 'pienso'): void {
    this.pending = { e, act, food, repath: 0 };
    this.cam.follow = true;
  }

  private handlePending(dt: number): void {
    const P = this.pending;
    if (!P) return;
    const pl = this.player.m, an = P.e.ent.m;
    const d = Math.hypot(pl.x - an.x, pl.y - an.y) / TILE;
    // con poca confianza, la comida se deja a cierta distancia
    const bowlAct = P.act === 'feed' || P.act === 'water';
    const h = hearts(P.e.data);
    const reach = bowlAct ? Math.max(1.3, comfortDistance(P.e.data) * 0.5 + 0.6) : 1.35;
    if (d <= reach + 0.45 && (!pl.moving || d <= reach)) {
      pl.stop();
      pl.dir = dirTo(pl.x, pl.y, an.x, an.y, pl.dir);
      if (bowlAct) {
        // el cuenco se deja delante del jugador, hacia el animal
        const k = Math.min(1, 0.9 / Math.max(d, 0.01));
        const bx = pl.x + (an.x - pl.x) * k, by = pl.y + (an.y - pl.y) * k;
        const z = this.grid.height[Math.floor(by / TILE) * this.grid.w + Math.floor(bx / TILE)] ?? pl.z;
        this.pop.placeBowl(bx, by, z, P.act === 'feed' ? 'food' : 'water', P.food, P.e.data.id);
        if (P.act === 'feed') sfx.kibble();
        else sfx.pour();
        if (P.food !== 'pienso') {
          const inv = this.world.inventory;
          inv[P.food] = Math.max(0, (inv[P.food] ?? 0) - 1);
        }
        this.player.action = 'give';
        this.player.actionT = 1.1;
        if (h <= 2) this.events.toast(h <= 1 ? `Deja el cuenco y aléjate un poco: ${P.e.data.name} es desconfiado.` : `Aléjate un pasito para que ${P.e.data.name} se anime.`);
      } else {
        this.player.action = 'crouch';
        this.player.actionT = 1.6;
        this.pop.directCare(P.e, P.act);
      }
      this.pending = null;
      return;
    }
    P.repath -= dt;
    if (P.repath <= 0) {
      P.repath = 0.8;
      // ir a un punto a "reach" tiles del animal, en la línea hacia el jugador
      const dx = pl.x - an.x, dy = pl.y - an.y, l = Math.hypot(dx, dy) || 1;
      const tx = Math.round((an.x + (dx / l) * reach * TILE) / TILE - 0.5), ty = Math.round((an.y + (dy / l) * reach * TILE) / TILE - 0.5);
      const t = nearestWalkable(this.grid, tx, ty);
      if (t) {
        const path = findPath(this.grid, pl.tx, pl.ty, t[0], t[1]);
        if (path && path.length > 1) pl.setPath(path);
        else if (!path) this.pending = null;
      }
    }
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
    // el más cercano a la cámara primero
    const hits = this.pop.entries.filter((e) => {
      const [x, y, w, h] = e.ent.rect;
      return wx >= x + w * 0.15 && wx <= x + w * 0.85 && wy >= y + h * 0.25 && wy <= y + h;
    }).sort((a, b) => b.ent.m.x + b.ent.m.y - (a.ent.m.x + a.ent.m.y));
    if (hits.length) {
      this.events.animalTap(hits[0], cssX, cssY);
      return;
    }
    this.events.groundTap();
    this.pending = null;
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

  private stepFrame = -1;
  private weatherTarget: Weather | null = null;
  update(dt: number): void {
    const rain = this.weather.rain > 0.3;
    this.player.update(dt, this.grid, rain);
    // pasos en los frames de contacto
    const fi = this.player.anim.i;
    if (this.player.m.moving && fi !== this.stepFrame && (fi === 0 || fi === 4)) sfx.step('piedra');
    this.stepFrame = fi;
    // clima del día (con transición suave) y nieve que cuaja poco a poco
    if (!this.opts.weather) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) {
        this.weatherT = 20;
        const target = weatherAt(new Date());
        this.sky = skyAt(new Date());
        this.weatherTarget = target;
      }
      if (this.weatherTarget) Object.assign(this.weather, lerpW(this.weather, this.weatherTarget, Math.min(1, dt * 0.05)));
    }
    if (this.weather.snow > 0.3) this.snowCover = Math.min(1, this.snowCover + dt / 480);
    else if (this.snowCover > 0) this.snowCover = Math.max(0, this.snowCover - dt / (this.hour > 10 && this.hour < 17 ? 900 : 2400));
    this.fest.update(dt, this.grade?.night ?? 0);
    // música y ambiente según la hora y el clima
    music.setTarget(moodFor(this.hour, this.weather.rain));
    const f = this.zone.meta.fountains[0];
    ambience.update(dt, {
      rain: this.weather.rain, wind: this.weather.wind, hour: this.hour, port: false,
      fountainDist: f ? Math.hypot(this.player.m.x - f.basin.cx, this.player.m.y - f.basin.cy) / TILE : 99,
    });
    this.handlePending(dt);
    if (!this.opts.shot) {
      this.pop.update(dt, {
        grid: this.grid, hour: this.hour, raining: rain, now: Date.now(),
        player: { x: this.player.m.x, y: this.player.m.y, moving: this.player.m.moving },
        shelters: this.zone.meta.shelters, approaching: this.pending?.e.data.id ?? null,
      });
    } else for (const e of this.pop.entries) e.ent.update(dt, this.grid);
    for (const e of this.pop.entries) e.ent.bandage = e.brain.bandage > 0;
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
    this.ambient.update(dt, this.hour, this.weather, [this.player.m.x, this.player.m.y], this.season);
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
      if (this.snowCover > 0.01) {
        const sn = this.zone.sprites.get(name + '@nieve');
        if (sn) {
          b.globalAlpha = Math.min(1, this.snowCover * 0.95);
          b.drawImage(sn.img, sn.x, sn.y, sn.w, sn.h, sn.ox - camX, sn.oy - camY, sn.w, sn.h);
          b.globalAlpha = 1;
        }
      }
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
    list.push(this.player, ...this.animals, ...this.pop.bowls, ...this.ambient.drawables, ...this.fest.props);
    for (const e of this.pop.entries) e.ent.hat = this.fest.hats;
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
    this.fest.drawAir(b, camX, camY);
    this.fest.drawGarlands(b, camX, camY, false);
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
    if (night > 0.2) this.fest.drawGarlands(b, camX, camY, true);
    this.ambient.drawOverlay(b, camX, camY, v.w, v.h, this.weather, night);
    this.fest.drawConfetti(b, v.w, v.h);
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

function dirTo(ax: number, ay: number, bx: number, by: number, prev: number): number {
  return dirFromDelta(bx - ax, by - ay, prev);
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
