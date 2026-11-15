// Bucle principal: zona, cámara, entidades, orden por profundidad, luz, clima y vida ambiental.
import { View } from './engine/view.ts';
import { loadZone, type ZoneAssets, type SpriteRef } from './engine/assets.ts';
import { boxBehind, screenToWorld, TILE, type Box } from './engine/iso.ts';
import { attachInput } from './engine/input.ts';
import { findPath, nearestWalkable, walkable, type Grid } from './world/path.ts';
import { Player, Animal, dirFromDelta, type Drawable } from './world/entities.ts';
import { DEFAULT_OUTFIT } from './sprites/player.ts';
import { gradeAt, weatherGrade, type Grade } from './fx/daylight.ts';
import { Lighting, type LightSrc } from './fx/lighting.ts';
import { Ambient, type Weather } from './fx/ambient.ts';
import { pixelEllipse, rgb } from './fx/pixel.ts';
import { heart, alert, zzz, note, needBubble } from './fx/sprites.ts';
import { PALETTE } from './gfx/palette.ts';
import * as sfx from './audio/sfx.ts';
import { music, moodFor } from './audio/music.ts';
import { ambience } from './audio/ambience.ts';
import { season as seasonOf, activeEvents, canonicalHour, type Season, type EventId } from './sim/calendar.ts';
import { weatherAt, lerpW, skyAt, type Sky } from './sim/weather.ts';
import { Festivities } from './fx/events.ts';
import { decorSprite } from './ui/extras.ts';
import { ZONES, zoneOpen, type ZoneId, type ZoneDef, type Exit } from './world/zones.ts';
import { isFullMoon } from './sim/calendar.ts';
import { newMeta, type MetaState } from './meta/controller.ts';
import { NEIGHBORS, GIFTS, type Neighbor } from './sim/progress.ts';
import { matrix } from './fx/sprites.ts';
import type { Outfit } from './sprites/player.ts';
import { Population, bowlDistance, type Entry } from './world/population.ts';
import { isFeeder, SERVINGS } from './sim/feeders.ts';
import { generateAnimal, comfortDistance, species, type Action, type ActionResult, type AnimalData, type FoodId } from './sim/model.ts';

export interface WorldState {
  animals: AnimalData[];
  inventory: Partial<Record<FoodId, number>>;
  stats: Record<string, number>;
  nextSeed: number;
  meta: MetaState;
}

/** Portal de casa (donde aparecen los regalos), en vóxeles: en la calle. */
export const PORTAL: [number, number] = [58, 300];

const NPC_OUTFITS: Record<string, Outfit> = {
  maruxa: { skin: 'skinWarm', hair: 'mono', hairColor: 'white', top: 'rebeca', topColor: 'blue', bottom: 'falda', bottomColor: 'woodDark', shoes: 'black', hat: 'ninguno', hatColor: 'red', glasses: 'ninguna', acc: 'panuelo', accColor: 'red', bag: 'ninguna', bagColor: 'wood', umbrella: 'red' },
  lua: { skin: 'skinTan', hair: 'coleta', hairColor: 'black', top: 'chubasquero', topColor: 'white', bottom: 'pantalon', bottomColor: 'blue', shoes: 'white', hat: 'ninguno', hatColor: 'red', glasses: 'redondas', acc: 'ninguno', accColor: 'red', bag: 'bandolera', bagColor: 'red', umbrella: 'blue' },
  xan: { skin: 'skinTan', hair: 'corto', hairColor: 'grey', top: 'chubasquero', topColor: 'yellow', bottom: 'pantalon', bottomColor: 'blue', shoes: 'black', hat: 'pescador', hatColor: 'yellow', glasses: 'ninguna', acc: 'ninguno', accColor: 'red', bag: 'ninguna', bagColor: 'wood', umbrella: 'yellow' },
  ramon: { skin: 'skin', hair: 'rapado', hairColor: 'white', top: 'jersey', topColor: 'wood', bottom: 'pantalon', bottomColor: 'grey', shoes: 'black', hat: 'boina', hatColor: 'black', glasses: 'redondas', acc: 'ninguno', accColor: 'red', bag: 'ninguna', bagColor: 'wood', umbrella: 'blue' },
};
export function npcOutfit(id: string): Outfit {
  return NPC_OUTFITS[id];
}

/** Rincones acogedores de la plaza donde los animales se quedan a dormir. */
export const HOMES: [number, number][] = [[17, 9], [8, 18], [16, 17], [6, 9], [12, 5], [18, 13], [5, 13], [10, 18], [14, 5]];
export const ZONE_CAP = 7;

export function newWorld(seed: number): WorldState {
  return { animals: [], inventory: {}, stats: {}, nextSeed: seed, meta: newMeta() };
}

export interface GameEvents {
  animalTap(e: Entry, cssX: number, cssY: number): void;
  groundTap(): void;
  toast(msg: string): void;
  care(e: Entry, act: Action, res: ActionResult): void;
  firstGesture?(): void;
  npcTap?(nb: Neighbor): void;
  giftTap?(i: number): void;
  fountain?(): void;
  zoneChanged?(z: ZoneId): void;
  laserDone?(e: Entry): void;
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
  npcs: { nb: Neighbor; ent: Player }[] = [];
  /** decoración colocada en esta zona (dibujable) */
  decor: (Drawable & { id: string; tx: number; ty: number; ref: { id: string; zone: string; fill?: number; tx: number; ty: number } })[] = [];
  /** comedero que se va a rellenar al llegar a su lado */
  private refill: { id: string; zone: string; fill?: number; tx: number; ty: number } | null = null;
  /** juego del puntero láser */
  laser: { e: Entry; x: number; y: number; t: number; think: number } | null = null;
  private fountainT = 0;
  get animals(): Animal[] {
    return this.pop.entries.map((e) => e.ent);
  }
  objects: StaticObj[] = [];
  lights: LightSrc[] = [];
  ambient!: Ambient;
  lighting = new Lighting();
  cam = { x: 0, y: 0, follow: true };
  /** «+♥» que sube sobre un animal al ganar confianza */
  private floaters: { x: number; y: number; z: number; t: number; big: boolean }[] = [];
  /** Animal en el que se centra la cámara mientras su menú está abierto. */
  private focus: { e: Entry; prevFollow: boolean } | null = null;
  bounds: [number, number, number, number] = [0, 0, 0, 0];
  /** Corazoncito que sube sobre el animal al ganar confianza (más grande si gana un corazón entero). */
  floatTrust(e: Entry, heartUp: boolean): void {
    const m = e.ent.m;
    this.floaters.push({ x: m.x, y: m.y, z: m.z + e.ent.look.shape.legH * 2.3 + 8, t: 0, big: heartUp });
  }

  /** Casilla de la salida a la que mejor se llega desde donde está el jugador (y su altura). */
  exitTarget(ex: Exit): [number, number, number] | null {
    const g = this.grid, pm = this.player.m;
    let best: [number, number, number] | null = null, bestLen = Infinity;
    for (let y = ex.r[1]; y < ex.r[3]; y++)
      for (let x = ex.r[0]; x < ex.r[2]; x++) {
        if (!walkable(g, x, y)) continue;
        const path = findPath(g, pm.tx, pm.ty, x, y);
        const len = path ? path.length : Infinity;
        if (len < bestLen || (!best && !path)) {
          bestLen = len;
          best = [x, y, g.height[y * g.w + x]];
        }
      }
    return best;
  }

  /** ¿Va el jugador hacia una salida elegida en un cartel? */
  get headingToExit(): boolean {
    return !!this.exitIntent;
  }

  /** Ir andando hasta una salida y cambiar de zona al llegar. */
  goToExit(ex: Exit): void {
    const pm = this.player.m;
    const inside = pm.tx >= ex.r[0] && pm.tx < ex.r[2] && pm.ty >= ex.r[1] && pm.ty < ex.r[3];
    if (inside) {
      void this.travel(ex.to, ex.spawn);
      return;
    }
    const t = this.exitTarget(ex);
    if (!t) return;
    this.pending = null;
    if (this.walkTo(t[0], t[1])) {
      this.cam.follow = true;
      this.marker = { x: t[0] * TILE + 8, y: t[1] * TILE + 8, t: 0.8 };
      this.exitIntent = ex;
    }
  }

  /** Viaje directo desde el mapa del barrio: se aparece donde se llega andando desde una zona vecina. */
  travelTo(to: ZoneId): void {
    if (to === this.zoneId) return;
    const direct = this.zoneDef.exits.find((e) => e.to === to);
    const via = direct ?? Object.values(ZONES).flatMap((z) => z.exits).find((e) => e.to === to);
    if (via) void this.travel(to, via.spawn);
  }

  focusOn(e: Entry | null): void {
    if (e) {
      this.focus = { e, prevFollow: this.focus?.prevFollow ?? this.cam.follow };
      this.cam.follow = false;
    } else if (this.focus) {
      this.cam.follow = this.focus.prevFollow;
      this.focus = null;
    }
  }
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

  zoneId: ZoneId = 'calle';
  zoneDef: ZoneDef = ZONES.calle;
  private zoneCache = new Map<string, ZoneAssets>();
  private fadeEl: HTMLDivElement | null = null;
  /** cámara paseando (pantalla de título) */
  titleDrift = false;
  private exitCooldown = 0;
  /** las salidas solo se activan después de haber andado (al llegar se aparece dentro de la de vuelta) */
  private exitsArmed = false;
  /** salida elegida en un cartel: se viaja al llegar a ella */
  private exitIntent: Exit | null = null;

  async init(startZone: ZoneId = 'calle', spawn?: [number, number]): Promise<void> {
    const now = new Date();
    this.season = this.opts.season ?? seasonOf(now);
    this.fiestas = this.opts.events ?? activeEvents(now);
    if (!this.opts.weather) {
      Object.assign(this.weather, weatherAt(now));
      this.sky = skyAt(now);
    }
    if (this.weather.snow > 0.5) this.snowCover = 1;
    this.player = new Player(0, 0, { w: 1, h: 1, walk: [1], height: [40] }, { ...DEFAULT_OUTFIT });
    await this.enterZone(startZone, spawn);
    if (this.opts.shot) this.setupShot();
    attachInput(this.view.canvas, {
      tap: (x, y) => this.onTap(x, y),
      drag: (dx, dy) => {
        const k = this.view.dpr / this.view.zoom;
        if (this.laser) {
          // arrastrar mueve el punto rojo por el suelo
          const L = this.laser;
          const sdx = dx * k, sdy = dy * k;
          L.x += sdx / 4 + sdy / 2;
          L.y += -sdx / 4 + sdy / 2;
          return;
        }
        this.cam.x -= dx * k;
        this.cam.y -= dy * k;
        this.cam.follow = false;
        this.focus = null;
        this.watchBowl = null;
        this.lastDrag = performance.now();
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

  /** Carga una zona (con su arte, animales, vecinos y vida ambiental) y coloca al jugador. */
  async enterZone(id: ZoneId, spawn?: [number, number]): Promise<void> {
    let za = this.zoneCache.get(id);
    if (!za) {
      za = await loadZone(id);
      this.zoneCache.set(id, za);
    }
    this.zone = za;
    this.zoneId = id;
    this.zoneDef = ZONES[id];
    // precargar las zonas vecinas en segundo plano: el siguiente cambio de zona será inmediato
    setTimeout(() => {
      for (const ex of ZONES[id].exits) void loadZone(ex.to).catch(() => undefined);
    }, 1500);
    const m = this.zone.meta;
    this.grid = { w: m.tilesW, h: m.tilesH, walk: m.walk, height: m.height };
    const seasonKey = this.season === 'otoño' ? 'otono' : this.season;
    this.objects = [];
    this.lights = [];
    this.npcs = [];
    this.pending = null;
    // objetos estáticos (con su variante de estación y su capa de nieve)
    for (const o of m.objects) {
      const base = this.zone.sprites.get(o.sprite)!;
      const variants: StaticObj['variants'] = {};
      for (const v of o.seasons ?? []) variants[v] = this.zone.sprites.get(`${o.sprite}~${v}`);
      const sprite = variants[seasonKey] ?? base;
      const vn = variants[seasonKey] ? `${o.sprite}~${seasonKey}` : o.sprite;
      const night = o.night ? this.zone.sprites.get(o.night) ?? null : null;
      const snow = this.zone.sprites.get(vn + '@nieve') ?? null;
      const bob = o.kind === 'barca';
      const obj: StaticObj = {
        sprite, base, variants, snow, night, occluder: o.occluder, kind: o.kind, box: o.box, fade: 1,
        nightAt: 0.3 + (Math.abs(Math.sin(o.box[0] * 12.9898 + o.box[1] * 78.233)) % 1) * 0.45,
        draw: (ctx, camX, camY) => {
          // las barcas se mecen
          const dy = bob ? Math.round(Math.sin(performance.now() / 900 + o.box[0]) * 1.2) : 0;
          ctx.globalAlpha = obj.fade;
          ctx.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h, sprite.ox - camX, sprite.oy - camY + dy, sprite.w, sprite.h);
          if (snow && this.snowCover > 0.01) {
            ctx.globalAlpha = obj.fade * Math.min(1, this.snowCover);
            ctx.drawImage(snow.img, snow.x, snow.y, snow.w, snow.h, snow.ox - camX, snow.oy - camY + dy, snow.w, snow.h);
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
    // jugador
    const sp0 = spawn ?? m.spawn;
    const sp = nearestWalkable(this.grid, sp0[0], sp0[1]) ?? sp0;
    const outfit = this.player.outfit;
    this.player = new Player(sp[0], sp[1], this.grid, outfit);
    // animales de esta zona
    this.pop = new Population(this.grid, {
      care: (e, act, res) => this.events.care(e, act, res),
      toast: (msg) => this.events.toast(msg),
      sock: (e) => {
        this.world.stats.calcetines = (this.world.stats.calcetines ?? 0) + 1;
        this.events.toast(`¡${e.data.name} te ha robado un calcetín!`);
      },
    });
    this.populate();
    // vecinos
    for (const n of this.zoneDef.npcs) {
      const nb = NEIGHBORS.find((x) => x.id === n.id);
      if (!nb) continue;
      const ent = new Player(n.at[0], n.at[1], this.grid, npcOutfit(nb.id));
      ent.m.dir = n.at[2];
      this.npcs.push({ nb, ent });
    }
    this.refreshDecor();
    this.ambient = new Ambient(m, this.bounds);
    this.ambient.sea = this.zoneDef.sea ?? null;
    this.ambient.onFlap = () => sfx.flap();
    this.fest = new Festivities(this.zoneId === 'plaza' ? this.fiestas : this.fiestas.filter((f) => f === 'navidad' || f === 'entroido'), m);
    for (const l of this.fest.lights) this.lights.push(l);
    const [fx, fy] = this.player.feet();
    this.cam.x = fx;
    this.cam.y = fy - 30;
    this.cam.follow = true;
    this.exitCooldown = 1.2;
    this.exitsArmed = false;
    this.exitIntent = null;
  }

  /** Dibujables de la decoración colocada en esta zona (y efectos en los animales). */
  refreshDecor(): void {
    this.decor = [];
    const placed = (this.world.meta?.placed ?? []).filter((d) => d.zone === this.zoneId);
    for (const d of placed) {
      const x = d.tx * TILE + 8, y = d.ty * TILE + 8, z = this.grid.height[d.ty * this.grid.w + d.tx] ?? 40;
      const img = decorSprite(d.id);
      const sx = 2 * (x - y), sy = x + y - z;
      this.decor.push({
        id: d.id, tx: d.tx, ty: d.ty, box: [x - 6, y - 6, z, x + 6, y + 6, z + 10], rect: [sx - img.width / 2, sy - img.height, img.width, img.height],
        draw: (ctx, cx, cy) => {
          const X = Math.round(sx - img.width / 2 - cx), Y = Math.round(sy - img.height + 2 - cy);
          ctx.drawImage(img, X, Y);
          if (!isFeeder(d.id)) return;
          // reserva: 4 pastillas (2 raciones cada una); parpadea cuando está vacío
          const fill = d.fill ?? 1, n = Math.ceil(fill * 4 - 1e-6);
          const px = Math.round(sx - cx) - 6, py = Y - 5;
          if (fill <= 0 && Math.floor(performance.now() / 500) % 2) return;
          ctx.fillStyle = PALETTE.ink2;
          ctx.fillRect(px, py, 13, 4);
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = i < n ? (d.id === 'comedero' ? PALETTE.mustard : PALETTE.sky) : PALETTE.stone1;
            ctx.fillRect(px + 1 + i * 3, py + 1, 2, 2);
          }
        },
        ref: d,
      });
    }
    this.pop.feeders = placed.map((d) => ({ id: d.id, x: d.tx * TILE + 8, y: d.ty * TILE + 8, ref: d }));
  }

  /** Coloca decoración delante del jugador. */
  placeDecor(id: string): boolean {
    const pl = this.player.m;
    const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const [dx, dy] = dirs[pl.dir];
    const tx = pl.tx + dx, ty = pl.ty + dy;
    if (!walkable(this.grid, tx, ty)) return false;
    const meta = this.world.meta;
    meta.placed ??= [];
    meta.placed.push({ id, zone: this.zoneId, tx, ty, t: Date.now() });
    meta.decor.splice(meta.decor.indexOf(id), 1);
    if (id === 'manta-cuadros') {
      // el animal más dormilón de la zona adopta la manta como cama
      const sleepy = this.pop.entries.find((e) => e.data.personality === 'dormilon') ?? this.pop.entries[0];
      if (sleepy) sleepy.data.home = [tx, ty];
    }
    this.refreshDecor();
    return true;
  }

  /** Empieza a jugar con el láser con un gato. */
  startLaser(e: Entry): void {
    const [x, y] = [e.ent.m.x + 24, e.ent.m.y + 8];
    this.laser = { e, x, y, t: 18, think: 0 };
    e.brain.mode = 'care';
    e.brain.t = 999;
  }

  /** Fundido suave al cambiar de zona. */
  async travel(to: ZoneId, spawn: [number, number]): Promise<void> {
    if (!this.fadeEl) {
      this.fadeEl = document.createElement('div');
      this.fadeEl.className = 'fade';
      document.body.append(this.fadeEl);
    }
    this.fadeEl.classList.add('on');
    // con la zona ya precargada basta un fundido corto
    await Promise.all([new Promise((r) => setTimeout(r, 200)), loadZone(to)]);
    await this.enterZone(to, spawn);
    this.events.zoneChanged?.(to);
    this.fadeEl.classList.remove('on');
  }

  /** Animales de la zona: los iniciales (Nemesio en la calle) y los guardados. */
  private populate(): void {
    const W = this.world, Z = this.zoneDef;
    const here = W.animals.filter((a) => a.zone === this.zoneId);
    if (!here.length && !this.opts.shot) {
      if (this.zoneId === 'calle' && !W.animals.some((a) => a.name === 'Nemesio')) {
        const nem = generateAnimal(1, { zone: 'calle', used: [], now: Date.now(), home: [4, 19] });
        Object.assign(nem, { name: 'Nemesio', breed: 'europeo', variant: 0, personality: 'carinoso', favorite: 'atun', schedule: 'siempre', trust: 1.3, injured: false, rare: null, known: false });
        W.animals.push(nem);
      }
      if (this.zoneId === 'plaza' && !W.animals.some((a) => a.name === 'Lucáreo')) {
        const luc = generateAnimal(2, { zone: 'plaza', used: W.animals.map((a) => a.name), now: Date.now(), home: [5, 16] });
        Object.assign(luc, { name: 'Lucáreo', breed: 'galgo', variant: 0, personality: 'timido', favorite: 'galletas', schedule: 'dia', trust: 0.2, injured: true, rare: null });
        W.animals.push(luc);
      }
      const n0 = W.animals.filter((a) => a.zone === this.zoneId).length;
      for (let i = n0; i < Z.initial; i++) this.spawnNew(Z.homes[i % Z.homes.length], false);
    }
    if (this.opts.shot && this.zoneId === 'plaza' && !here.length) {
      const nem = generateAnimal(1, { zone: 'plaza', used: [], now: Date.now(), home: [13, 13] });
      Object.assign(nem, { name: 'Nemesio', breed: 'europeo', variant: 0 });
      const luc = generateAnimal(2, { zone: 'plaza', used: ['Nemesio'], now: Date.now(), home: [5, 16] });
      Object.assign(luc, { name: 'Lucáreo', breed: 'galgo', variant: 0 });
      W.animals.push(nem, luc);
    }
    for (const a of W.animals) if (a.zone === this.zoneId) this.pop.add(a);
  }

  /** Llega un animal nuevo al barrio (de las razas de la zona). */
  spawnNew(home: [number, number], addToScene = true, zone: ZoneId = this.zoneId): Entry | null {
    const W = this.world;
    const seed = (W.nextSeed = (W.nextSeed * 48271 + 11) % 2147483647);
    const h = this.hour;
    const a = generateAnimal(seed, { zone, breeds: ZONES[zone].breeds, used: W.animals.map((x) => x.name), now: Date.now(), home, night: h < 7 || h > 21, fullMoon: isFullMoon(new Date()) });
    W.animals.push(a);
    return addToScene && zone === this.zoneId ? this.pop.add(a) : null;
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
    const Z = this.zoneDef;
    const decor = (this.world.meta?.placed ?? []).filter((d) => d.zone === this.zoneId).length;
    const here = this.world.animals.filter((a) => a.zone === this.zoneId).length;
    if (here >= Z.cap + decor || now - last < Math.max(5, 12 - decor * 2) * 60_000) return null;
    st.lastArrival = now;
    const used = new Set(this.world.animals.map((a) => a.home.join(',')));
    const home = Z.homes.find((h) => !used.has(h.join(','))) ?? Z.homes[Math.floor(Math.random() * Z.homes.length)];
    const e = this.spawnNew(home);
    if (e) {
      e.ent.m.x = Z.entry[0] * TILE + 8;
      e.ent.m.y = Z.entry[1] * TILE + 8;
    }
    return e;
  }

  /** El jugador pide una acción sobre un animal: camina hasta él y la hace. */
  request(e: Entry, act: Action, food: FoodId = 'pienso'): void {
    this.pending = { e, act, food, repath: 0 };
    this.cam.follow = true;
  }

  /** retirada pendiente tras dejar un cuenco a un animal desconfiado */
  private stepBack: { x: number; y: number; need: number; t: number } | null = null;
  /** mientras se espera a que un animal se acerque al cuenco, la cámara encuadra cuenco y jugador */
  /** último arrastre de cámara: pasado un rato sin tocarla, vuelve sola al personaje */
  lastDrag = 0;
  private watchBowl: { x: number; y: number; z: number; id: string; t: number } | null = null;

  private updateStepBack(dt: number): void {
    const S = this.stepBack;
    if (!S) return;
    S.t -= dt;
    if (S.t > 0) return; // dejar terminar el gesto de dar
    this.stepBack = null;
    const pl = this.player.m;
    const dx = pl.x - S.x, dy = pl.y - S.y, l = Math.hypot(dx, dy) || 1;
    if (l / TILE >= S.need) return;
    // probar direcciones alrededor de «alejarse en línea recta» hasta encontrar sitio
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = Math.atan2(dy, dx) + turn;
      const r = (S.need + 0.7) * TILE;
      const t = nearestWalkable(this.grid, Math.floor((S.x + Math.cos(a) * r) / TILE), Math.floor((S.y + Math.sin(a) * r) / TILE));
      if (!t || Math.hypot(t[0] * TILE + 8 - S.x, t[1] * TILE + 8 - S.y) / TILE < S.need) continue;
      if (this.walkTo(t[0], t[1])) return;
    }
  }

  private handlePending(dt: number): void {
    const P = this.pending;
    if (!P) return;
    const pl = this.player.m, an = P.e.ent.m;
    const d = Math.hypot(pl.x - an.x, pl.y - an.y) / TILE;
    // con poca confianza, la comida se deja a cierta distancia
    const bowlAct = P.act === 'feed' || P.act === 'water';
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
        // con poca confianza, el personaje se aparta solo hasta donde el animal se atreve a acercarse
        const need = bowlDistance(P.e.data);
        if (need > 0) {
          this.stepBack = { x: bx, y: by, need, t: 1.1 };
          this.watchBowl = { x: bx, y: by, z, id: P.e.data.id, t: 12 };
        }
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
    if (this.zoneId !== 'plaza') {
      // en las demás zonas: unos cuantos animales de la zona y cámara centrada
      const Z = this.zoneDef;
      for (let i = 0; i < 3; i++) this.spawnNew(Z.homes[i % Z.homes.length], true);
      for (const e of this.pop.entries) e.ent.play(['sit', 'idle', 'lie'][Math.floor(Math.random() * 3)] as 'sit');
      const [fx, fy] = this.player.feet();
      this.cam.x = fx + 20;
      this.cam.y = fy - 120;
      return;
    }
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
    // regalos en el portal
    const portal = this.zoneDef.portal ? this.world.meta?.portal ?? [] : [];
    for (let i = 0; i < portal.length; i++) {
      const g = portal[i];
      const sx = 2 * (g.x - g.y), sy = g.x + g.y - 40;
      if (Math.abs(wx - sx) < 7 && Math.abs(wy - sy + 3) < 7) {
        this.events.giftTap?.(i);
        return;
      }
    }
    for (const n of this.npcs) {
      const [x, y, w, h] = n.ent.rect;
      if (wx >= x + w * 0.25 && wx <= x + w * 0.75 && wy >= y + h * 0.15 && wy <= y + h) {
        n.ent.m.dir = dirTo(n.ent.m.x, n.ent.m.y, this.player.m.x, this.player.m.y, n.ent.m.dir);
        this.events.npcTap?.(n.nb);
        return;
      }
    }
    // comederos y bebederos: ir a rellenarlos
    for (const d of this.decor) {
      if (!isFeeder(d.id)) continue;
      const [x, y, w, h] = d.rect ?? [0, 0, 0, 0];
      if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 8 && wy <= y + h + 3) {
        this.pending = null;
        this.refill = d.ref;
        const t = nearestWalkable(this.grid, d.tx, d.ty);
        if (t && this.walkTo(t[0], t[1])) {
          this.cam.follow = true;
          this.marker = { x: t[0] * TILE + 8, y: t[1] * TILE + 8, t: 0.8 };
        }
        return;
      }
    }
    // animales: zona de toque generosa (elipse alrededor del cuerpo, nunca menor que un dedo)
    // y, si hay varios, el más cercano al dedo y luego el más cercano a la cámara
    const finger = 10 * this.view.dpr / this.view.zoom; // ~10 px CSS de margen extra
    let best: Entry | null = null, bestD = Infinity;
    for (const e of this.pop.entries) {
      const S = e.ent.look.shape;
      const [sx, sy] = e.ent.screenPos();
      const cx = sx, cy = sy - S.legH * 1.3;
      const rx = Math.max(13, (S.bodyLen + S.legH) * 0.55) + finger, ry = Math.max(11, S.legH * 1.3 + 4) + finger;
      const d = ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2;
      if (d > 1) continue;
      const score = d - (e.ent.m.x + e.ent.m.y) * 0.0005;
      if (score < bestD) {
        bestD = score;
        best = e;
      }
    }
    if (best) {
      this.events.animalTap(best, cssX, cssY);
      return;
    }
    this.events.groundTap();
    this.pending = null;
    this.stepBack = null;
    this.watchBowl = null;
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
        this.exitIntent = null;
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
      rain: this.weather.rain, wind: this.weather.wind, hour: this.hour, port: !!this.zoneDef.ambient.port,
      fountainDist: f ? Math.hypot(this.player.m.x - f.basin.cx, this.player.m.y - f.basin.cy) / TILE : 99,
    });
    this.handlePending(dt);
    this.updateStepBack(dt);
    if (this.refill && !this.player.m.moving) {
      const R = this.refill, pm = this.player.m;
      this.refill = null;
      if (Math.hypot(pm.x - (R.tx * TILE + 8), pm.y - (R.ty * TILE + 8)) / TILE < 2) {
        pm.dir = dirTo(pm.x, pm.y, R.tx * TILE + 8, R.ty * TILE + 8, pm.dir);
        const what = R.id === 'comedero' ? 'comedero' : 'bebedero';
        if ((R.fill ?? 1) >= 0.999) this.events.toast(`El ${what} ya está lleno.`);
        else {
          R.fill = 1;
          this.player.action = 'give';
          this.player.actionT = 1.1;
          if (R.id === 'comedero') sfx.kibble();
          else sfx.pour();
          this.events.toast(`Rellenas el ${what}: ${SERVINGS} raciones para quien lo necesite.`);
        }
      }
    }
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.6);
    if (!this.opts.shot) {
      this.pop.update(dt, {
        grid: this.grid, hour: this.hour, raining: rain, now: Date.now(),
        player: { x: this.player.m.x, y: this.player.m.y, moving: this.player.m.moving },
        shelters: [...this.zone.meta.shelters, ...this.decor.filter((d) => d.id === 'caseta').map((d) => [d.tx - 0.5, d.ty - 0.5, d.tx + 1.5, d.ty + 1.5] as [number, number, number, number])], approaching: this.pending?.e.data.id ?? null,
      });
    } else for (const e of this.pop.entries) e.ent.update(dt, this.grid);
    for (const e of this.pop.entries) e.ent.bandage = e.brain.bandage > 0;
    // láser: el gato persigue el punto rojo
    if (this.laser) {
      const L = this.laser, e = L.e;
      L.t -= dt;
      L.think -= dt;
      const t = nearestWalkable(this.grid, Math.floor(L.x / TILE), Math.floor(L.y / TILE));
      if (t) {
        L.x = Math.max(t[0] * TILE + 1, Math.min(t[0] * TILE + 15, L.x));
        L.y = Math.max(t[1] * TILE + 1, Math.min(t[1] * TILE + 15, L.y));
      }
      const d = Math.hypot(e.ent.m.x - L.x, e.ent.m.y - L.y) / TILE;
      if (L.think <= 0) {
        L.think = 0.5;
        if (d > 0.9 && t) {
          const path = findPath(this.grid, e.ent.m.tx, e.ent.m.ty, t[0], t[1]);
          if (path && path.length > 1) {
            e.ent.m.speed = 44;
            e.ent.m.setPath(path);
          }
        } else if (!e.ent.m.moving) {
          e.ent.play(Math.random() < 0.5 ? 'stretch' : 'scratch');
          // el punto «escapa» solo si nadie lo mueve
          L.x += (Math.random() - 0.5) * 40;
          L.y += (Math.random() - 0.5) * 40;
        }
      }
      if (L.t <= 0) {
        e.brain.mode = 'idle';
        e.brain.t = 0;
        e.ent.react('heart', 2);
        e.data.wellbeing = Math.min(1, e.data.wellbeing + 0.25);
        e.data.trust = Math.min(5, e.data.trust + 0.08);
        this.events.laserDone?.(e);
        this.laser = null;
      }
    }
    // salida elegida en un cartel: viajar al llegar (o olvidarla si el camino se interrumpe)
    if (this.exitIntent && !this.player.m.moving) {
      const ex = this.exitIntent, pm = this.player.m;
      this.exitIntent = null;
      if (pm.tx >= ex.r[0] && pm.tx < ex.r[2] && pm.ty >= ex.r[1] && pm.ty < ex.r[3]) {
        this.exitCooldown = 3;
        this.exitsArmed = false;
        void this.travel(ex.to, ex.spawn);
      }
    }
    // salidas a otras zonas por la calle baja
    this.exitCooldown -= dt;
    if (this.exitCooldown <= 0 && !this.opts.shot) {
      const tx = this.player.m.tx, ty = this.player.m.ty;
      if (this.player.m.moving) this.exitsArmed = true;
      // se viaja al pararse en una salida a la que se ha ido a propósito; cruzarla de camino a
      // otro sitio (la calle baja conecta varias) no hace nada
      const ex = this.player.m.moving ? undefined : this.zoneDef.exits.find((e) => tx >= e.r[0] && tx < e.r[2] && ty >= e.r[1] && ty < e.r[3]);
      if (ex && this.exitsArmed) {
        this.exitCooldown = 3;
        this.exitsArmed = false;
        if (zoneOpen(ex.to, this.world.stats, this.world.animals)) void this.travel(ex.to, ex.spawn);
        else {
          this.player.m.stop();
          this.events.toast(`${ZONES[ex.to].title} todavía no está abierta. ${ZONES[ex.to].unlockHint}`);
        }
      }
    }
    for (const n of this.npcs) n.ent.update(dt, this.grid, this.weather.rain > 0.3);
    // paseo hasta la fuente (para las misiones)
    const fo = this.zone.meta.fountains[0];
    this.fountainT -= dt;
    if (fo && this.fountainT <= 0 && Math.hypot(this.player.m.x - fo.basin.cx, this.player.m.y - fo.basin.cy) < 48) {
      this.fountainT = 300;
      this.events.fountain?.();
    }
    const pf = this.player.feet();
    if (this.titleDrift) {
      this.cam.follow = false;
      this.cam.x += dt * 7;
      if (this.cam.x > this.bounds[2] - this.view.w / 2 - 30) this.cam.x = this.bounds[0] + this.view.w / 2 + 30;
    }
    // encuadre del cuenco: hasta que el animal coma (o se canse de esperar, o muevas la cámara)
    if (this.watchBowl) {
      const W = this.watchBowl;
      W.t -= dt;
      const en = this.pop.entries.find((x) => x.data.id === W.id);
      if (W.t <= 0 || !en || en.brain.mode === 'eat' && en.brain.t < 1) this.watchBowl = null;
    }
    if (!this.cam.follow && !this.focus && !this.watchBowl && !this.laser && !this.titleDrift && !this.opts.shot && performance.now() - this.lastDrag > 7000) this.cam.follow = true;
    if (this.watchBowl && !this.focus) {
      const W = this.watchBowl, [px, py] = this.player.feet();
      const k = 1 - Math.exp(-dt * 3);
      this.cam.x += ((2 * (W.x - W.y) + px) / 2 - this.cam.x) * k;
      this.cam.y += ((W.x + W.y - W.z + py) / 2 - 20 - this.cam.y) * k;
    } else if (this.focus) {
      // centrar con suavidad al animal tocado (su menú queda en medio de la pantalla)
      const [sx, sy] = this.focus.e.ent.screenPos();
      const k = 1 - Math.exp(-dt * 6);
      this.cam.x += (sx - this.cam.x) * k;
      this.cam.y += (sy - this.focus.e.ent.look.shape.legH * 1.4 - this.view.h * 0.06 - this.cam.y) * k;
    } else if (this.cam.follow) {
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
      // se queda mientras se camina hacia él y se desvanece al llegar
      const pm = this.player.m;
      if (!pm.moving || this.pending) this.marker.t -= dt;
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
    // ruta: puntitos desde el jugador hasta el destino (los que quedan atrás desaparecen)
    const pm = this.player.m;
    if (pm.moving && pm.path.length > 1 && !this.pending) {
      const G = this.grid;
      const pts: [number, number, number][] = [[pm.x, pm.y, pm.z]];
      for (const [tx, ty] of pm.path) pts.push([tx * TILE + 8, ty * TILE + 8, G.height[ty * G.w + tx]]);
      const phase = (performance.now() / 90) % 7;
      let acc = phase;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i];
        const ax2 = 2 * (ax - ay), ay2 = ax + ay - az, bx2 = 2 * (bx - by), by2 = bx + by - bz;
        const L = Math.hypot(bx2 - ax2, by2 - ay2);
        for (; acc < L; acc += 7) {
          const k = acc / L;
          const left = pts.length - i;
          const dx = Math.round(ax2 + (bx2 - ax2) * k - camX) - 1, dy = Math.round(ay2 + (by2 - ay2) * k - camY);
          b.globalAlpha = left < 3 ? 0.9 : 0.7;
          b.fillStyle = PALETTE.stone0;
          b.fillRect(dx, dy + 1, 2, 1);
          b.fillStyle = PALETTE.cal4;
          b.fillRect(dx, dy, 2, 1);
        }
        acc -= L;
      }
      b.globalAlpha = 1;
    }
    // marcador de destino (a la altura real del suelo)
    if (this.marker) {
      const G = this.grid, mt = Math.floor(this.marker.y / TILE) * G.w + Math.floor(this.marker.x / TILE);
      const mz = G.height[mt] ?? 40;
      const sx = 2 * (this.marker.x - this.marker.y) - camX, sy = this.marker.x + this.marker.y - mz - camY;
      const pulse = pm.moving ? Math.round(Math.sin(performance.now() / 180)) : 0;
      b.globalAlpha = Math.min(1, this.marker.t * 2);
      b.drawImage(pixelEllipse(6 + pulse, 3, PALETTE.cal4), Math.round(sx - 6 - pulse), Math.round(sy - 3));
      b.drawImage(pixelEllipse(4, 2, PALETTE.stone2), Math.round(sx - 4), Math.round(sy - 2));
      b.globalAlpha = 1;
    }
    // regalos esperando en el portal (solo en la calle de casa)
    for (const g of this.zoneDef.portal ? this.world.meta?.portal ?? [] : []) {
      const def = GIFTS.find((d) => d.id === g.id);
      if (!def) continue;
      const img = matrix('gift-' + def.id, def.rows, { '.': null, ...def.key } as Parameters<typeof matrix>[2]);
      const sx = Math.round(2 * (g.x - g.y) - camX), sy = Math.round(g.x + g.y - 40 - camY);
      const bob = Math.round(Math.sin(performance.now() / 400 + g.x) * 1);
      b.drawImage(pixelEllipse(4, 2, PALETTE.stone2), sx - 4, sy - 1);
      b.drawImage(img, sx - Math.floor(img.width / 2), sy - img.height - 1 + bob);
    }
    // sombras de contacto (dos tonos, multiplicando)
    b.globalCompositeOperation = 'multiply';
    for (const e of [this.player, ...this.npcs.map((n) => n.ent), ...this.animals]) {
      const [sx, sy] = 'feet' in e ? e.feet() : e.screenPos();
      const big = e instanceof Animal ? (e.look.shape.legH > 15 ? 11 : 8) : 8;
      b.drawImage(pixelEllipse(big, Math.ceil(big / 2.5), '#b9b1cf'), Math.round(sx - camX - big), Math.round(sy - camY - Math.ceil(big / 2.5)));
      b.drawImage(pixelEllipse(big - 3, Math.max(1, Math.ceil(big / 2.5) - 1), '#9d93bb'), Math.round(sx - camX - big + 3), Math.round(sy - camY - Math.ceil(big / 2.5) + 1));
    }
    b.globalCompositeOperation = 'source-over';
    // anillo de distancia cómoda alrededor del cuenco de un animal desconfiado que aún no se atreve
    for (const bowl of this.pop.bowls) {
      if (bowl.state !== 'full') continue;
      const en = this.pop.entries.find((x) => x.data.id === bowl.forId);
      if (!en || en.brain.mode === 'goBowl' || en.brain.mode === 'eat') continue;
      const need = bowlDistance(en.data);
      if (need <= 0) continue;
      const inside = Math.hypot(this.player.m.x - bowl.x, this.player.m.y - bowl.y) / TILE < need;
      const R = need * TILE, n = Math.max(24, Math.round(need * 14));
      const cx = 2 * (bowl.x - bowl.y) - camX, cy = bowl.x + bowl.y - bowl.z - camY;
      const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 300);
      b.globalAlpha = inside ? pulse : 0.35;
      b.fillStyle = inside ? PALETTE.coral : PALETTE.cal4;
      for (let i = 0; i < n; i++) {
        if (i % 2) continue; // trazo discontinuo
        const a = (i / n) * Math.PI * 2;
        const wx = Math.cos(a) * R, wy = Math.sin(a) * R;
        b.fillRect(Math.round(cx + 2 * (wx - wy)) - 1, Math.round(cy + (wx + wy)), 2, 1);
      }
      b.globalAlpha = 1;
    }
    // objetos + entidades ordenados por profundidad (orden topológico de cajas)
    const list: Drawable[] = [];
    for (const o of this.objects) {
      const [x, y, w, h] = o.rect!;
      if (x - camX > v.w || y - camY > v.h || x + w - camX < 0 || y + h - camY < 0) continue;
      list.push(o);
    }
    list.push(this.player, ...this.animals, ...this.pop.bowls, ...this.decor, ...this.ambient.drawables, ...this.fest.props, ...this.npcs.map((n) => n.ent));
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
    if (this.laser) {
      const L = this.laser;
      const z = this.grid.height[Math.floor(L.y / TILE) * this.grid.w + Math.floor(L.x / TILE)] ?? 40;
      const sx = Math.round(2 * (L.x - L.y) - camX), sy = Math.round(L.x + L.y - z - camY);
      b.globalAlpha = 0.45;
      b.fillStyle = PALETTE.coral;
      b.fillRect(sx - 2, sy - 1, 5, 3);
      b.globalAlpha = 1;
      b.fillStyle = PALETTE.pink;
      b.fillRect(sx - 1, sy, 3, 1);
      b.fillStyle = PALETTE.cal4;
      b.fillRect(sx, sy, 1, 1);
    }
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
    // bocadillos de necesidad: quién necesita algo, sin tener que tocar a nadie
    const now = performance.now() / 1000;
    for (const en of this.pop.entries) {
      const a = en.ent, D = en.data, mode = en.brain.mode;
      if (a.reaction || mode === 'eat' || mode === 'goBowl' || mode === 'care' || mode === 'feeder') continue;
      if (this.pop.bowls.some((bw) => bw.forId === D.id && bw.state === 'full')) continue;
      const kind = D.injured ? 'hurt' : Math.min(D.hunger, D.thirst) < 0.35 ? (D.hunger <= D.thirst ? 'food' : 'water') : null;
      if (!kind) continue;
      const img = needBubble(kind, species(D) === 'cat');
      const [sx, sy] = a.screenPos();
      const top = a.look.shape.legH * 2.3 + 12 + Math.round(Math.sin(now * 2 + D.seed) * 1.5);
      b.drawImage(img, Math.round(sx - camX - img.width / 2), Math.round(sy - camY - top));
    }
    // +♥ al ganar confianza
    for (const f of this.floaters) {
      const k = f.t / 1.6;
      const sx = 2 * (f.x - f.y) - camX, sy = f.x + f.y - f.z - camY - k * 16;
      b.globalAlpha = Math.min(1, (1 - k) * 2.2);
      const h = heart();
      b.fillStyle = PALETTE.mustard;
      const px = Math.round(sx - h.width / 2 - 4), py = Math.round(sy - h.height / 2);
      b.fillRect(px, py + 2, 3, 1);
      b.fillRect(px + 1, py + 1, 1, 3);
      b.drawImage(h, px + 4, py);
      if (f.big) {
        // corazón entero: dos más que se abren a los lados
        const o = Math.round(4 + k * 8);
        b.drawImage(h, px + 4 - o, py + 4);
        b.drawImage(h, px + 4 + o, py + 4);
      }
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
    // lienzo en memoria de CPU: leer sus píxeles no obliga a esperar a la GPU
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
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
