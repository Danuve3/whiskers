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
import { heart, alert, zzz, note, needBubble, cardboardBox } from './fx/sprites.ts';
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
import type { MomentId } from './sim/life.ts';
import type { HappeningId } from './sim/rhythm.ts';
import { whereIs, type ScheduleSlot } from './sim/neighbors.ts';
import { Townsfolk, folkScene } from './world/folk.ts';
import { makeLook } from './sprites/breeds.ts';
import { pickTreasure, VISITORS, visitorData, type TreasureDef, type WorldNow } from './sim/collect.ts';
import { generateAnimal, comfortDistance, species, hearts, type Action, type ActionResult, type AnimalData, type FoodId } from './sim/model.ts';

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
  /** vida propia de los animales */
  friends?(a: Entry, b: Entry): void;
  moment?(id: MomentId, e: Entry): void;
  routine?(e: Entry, text: string): void;
  /** juegos en el barrio */
  playDone?(e: Entry, game: 'pelota' | 'escondite', extra: number): void;
  playHint?(text: string | null): void;
  treasure?(def: TreasureDef): void;
  visitor?(e: Entry, first: boolean): void;
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
  /** vecinos presentes: siguen su horario por el barrio (y Lúa pasea a su galga) */
  npcs: { nb: Neighbor; ent: Player; slot: ScheduleSlot | null; leaving: boolean; t: number; pet: number; dog?: Animal; dogT: number }[] = [];
  private npcT = 0;
  /** gente sin nombre según la hora (cola de la panadería, tertulia del bar) */
  folk = new Townsfolk();
  private bellHour = -1;
  private splashT = 0;
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
  // ---------------------------------------------------------------- Pelota y escondite
  /** pelota con un perro: lanzar tocando el suelo, él la trae */
  ball: { e: Entry; phase: 'aim' | 'fly' | 'fetch' | 'return'; x: number; y: number; z: number; from: [number, number, number]; to: [number, number, number]; t: number; throws: number } | null = null;
  /** escondite con un gato */
  hide: { e: Entry; tx: number; ty: number; t: number; hidden: boolean; meowT: number } | null = null;

  startBall(e: Entry): void {
    this.stopPlay();
    e.ent.m.stop();
    e.brain.mode = 'care';
    e.brain.t = 9999;
    const pm = this.player.m;
    this.ball = { e, phase: 'aim', x: pm.x, y: pm.y, z: pm.z, from: [pm.x, pm.y, pm.z], to: [pm.x, pm.y, pm.z], t: 0, throws: 0 };
    this.pop.goTo(e, pm.tx + 1, pm.ty + 1, 'trot');
    this.events.playHint?.(`Toca el suelo para lanzar la pelota a ${e.data.name} (5 lanzamientos)`);
  }

  startHide(e: Entry): boolean {
    this.stopPlay();
    const pm = this.player.m, G = this.grid;
    // detrás de algo: el lado de atrás (−x o −y) de un objeto del barrio, lejos de ti
    const spots: [number, number][] = [];
    for (const o of this.objects) {
      if (/casa|pretil|muro|panaderia|nave|mercado|pescaderia|tu-casa|escalera/.test(o.kind)) continue;
      const [x0, y0, , x1, y1] = o.box;
      for (const [tx, ty] of [[Math.floor(x0 / TILE) - 1, Math.floor((y0 + y1) / 2 / TILE)], [Math.floor((x0 + x1) / 2 / TILE), Math.floor(y0 / TILE) - 1]] as [number, number][])
        if (walkable(G, tx, ty) && Math.hypot(tx - pm.tx, ty - pm.ty) >= 5) spots.push([tx, ty]);
    }
    if (!spots.length) return false;
    const [tx, ty] = spots[Math.floor(Math.random() * spots.length)];
    e.brain.mode = 'care';
    e.brain.t = 9999;
    if (!this.pop.goTo(e, tx, ty, 'run')) {
      e.brain.mode = 'idle';
      return false;
    }
    this.hide = { e, tx, ty, t: 0, hidden: false, meowT: 4 };
    this.events.playHint?.(`${e.data.name} se ha escondido… ¡búscalo! Escucha sus maullidos.`);
    return true;
  }

  /** Termina el juego en curso (sin castigo). */
  stopPlay(): void {
    for (const P of [this.ball?.e, this.hide?.e]) if (P) {
      P.brain.mode = 'idle';
      P.brain.think = 1;
    }
    this.ball = null;
    this.hide = null;
    this.events.playHint?.(null);
  }

  private updatePlay(dt: number): void {
    const B = this.ball;
    if (B) {
      const e = B.e, A = e.ent.m;
      if (!this.pop.entries.includes(e)) return this.stopPlay();
      if (B.phase === 'fly') {
        B.t += dt;
        const k = Math.min(1, B.t / 0.75);
        B.x = B.from[0] + (B.to[0] - B.from[0]) * k;
        B.y = B.from[1] + (B.to[1] - B.from[1]) * k;
        B.z = B.from[2] + (B.to[2] - B.from[2]) * k + Math.sin(k * Math.PI) * 26;
        if (k >= 1) {
          B.phase = 'fetch';
          sfx.ui('tap');
          if (!this.pop.goTo(e, Math.floor(B.x / TILE), Math.floor(B.y / TILE), 'run')) {
            // no llega: la pelota vuelve rodando
            B.phase = 'aim';
            const pm = this.player.m;
            B.x = pm.x;
            B.y = pm.y;
            B.z = pm.z;
          }
        }
      } else if (B.phase === 'fetch') {
        if (Math.hypot(A.x - B.x, A.y - B.y) / TILE < 0.9 || (!A.moving && Math.hypot(A.x - B.x, A.y - B.y) / TILE < 1.6)) {
          B.phase = 'return';
          e.ent.react('note', 1);
          const pm = this.player.m;
          this.pop.goTo(e, pm.tx, pm.ty, 'trot');
        } else if (!A.moving) this.pop.goTo(e, Math.floor(B.x / TILE), Math.floor(B.y / TILE), 'run');
      } else if (B.phase === 'return') {
        const pm = this.player.m;
        const d = Math.hypot(A.x - pm.x, A.y - pm.y) / TILE;
        if (d < 1.5 && !A.moving || d < 1.0) {
          A.stop();
          B.throws++;
          B.phase = 'aim';
          B.x = A.x;
          B.y = A.y;
          B.z = A.z;
          e.ent.play('wag');
          e.ent.react('heart', 1.4);
          if (B.throws >= 5) {
            this.ball = null;
            e.brain.mode = 'idle';
            e.brain.think = 2;
            this.events.playHint?.(null);
            this.events.playDone?.(e, 'pelota', 5);
            return;
          }
          this.events.playHint?.(`¡Otra vez! Toca el suelo para lanzar (${B.throws}/5)`);
        } else if (!A.moving) this.pop.goTo(e, pm.tx, pm.ty, 'trot');
      }
    }
    const S = this.hide;
    if (S) {
      const e = S.e, A = e.ent.m;
      if (!this.pop.entries.includes(e)) return this.stopPlay();
      S.t += dt;
      if (!S.hidden && !A.moving) {
        S.hidden = true;
        e.ent.play('sit');
      }
      if (S.hidden) {
        S.meowT -= dt;
        if (S.meowT <= 0) {
          S.meowT = 6 + Math.random() * 3;
          sfx.meow(e.ent.look.shape.legH);
          if (S.t > 30) e.ent.react('note', 1.5);
        }
        const pm = this.player.m;
        if (Math.hypot(pm.x - A.x, pm.y - A.y) / TILE < 1.7) this.foundHidden();
        else if (S.t > 120) {
          // se cansa de esperar y sale a buscarte
          this.hide = null;
          e.brain.mode = 'idle';
          this.pop.goTo(e, pm.tx, pm.ty, 'trot');
          this.events.playHint?.(null);
          this.events.toast(`¡${e.data.name} estaba escondido aquí! Ha salido él solito.`);
        }
      }
    }
  }

  private foundHidden(): void {
    const S = this.hide;
    if (!S) return;
    this.hide = null;
    const e = S.e;
    e.brain.mode = 'idle';
    e.brain.think = 2;
    e.ent.react('heart', 2);
    e.ent.play('stretch');
    this.events.playHint?.(null);
    this.events.playDone?.(e, 'escondite', Math.round(S.t));
  }

  // ---------------------------------------------------------------- Vecinos por el barrio
  /** Llegan (por la entrada) o se van (por la salida) según su horario. */
  syncNpcs(walking: boolean): void {
    const G = this.grid;
    for (const nb of NEIGHBORS) {
      const slot = whereIs(nb.id, this.hour);
      const here = this.npcs.find((n) => n.nb.id === nb.id);
      const should = slot?.zone === this.zoneId;
      if (here && !should && !here.leaving) {
        // se marcha por la salida más cercana
        here.leaving = true;
        const ex = this.zoneDef.exits[0];
        const t = nearestWalkable(G, Math.floor((ex.r[0] + ex.r[2]) / 2), Math.floor((ex.r[1] + ex.r[3]) / 2));
        const p = t && findPath(G, here.ent.m.tx, here.ent.m.ty, t[0], t[1]);
        if (p) here.ent.m.setPath(p);
        else here.ent.m.stop();
      } else if (here && should) {
        here.slot = slot;
        here.leaving = false;
      } else if (!here && should && slot) {
        const start = walking ? this.zoneDef.entry : slot.at;
        const s0 = nearestWalkable(G, start[0], start[1]);
        if (!s0) continue;
        const ent = new Player(s0[0], s0[1], G, npcOutfit(nb.id));
        ent.m.dir = 1;
        const n = { nb, ent, slot, leaving: false, t: Math.random() * 3, pet: 3 + Math.random() * 4, dogT: 0 } as (typeof this.npcs)[number];
        if (nb.id === 'lua') {
          // Chispa, su galga, va con ella a todas partes
          n.dog = new Animal('Chispa', makeLook('galgo', 1, 4242), s0[0], s0[1], G);
          n.dog.m.speed = 34;
        }
        this.npcs.push(n);
        if (walking) {
          const t = nearestWalkable(G, slot.at[0], slot.at[1]);
          const p = t && findPath(G, s0[0], s0[1], t[0], t[1]);
          if (p) ent.m.setPath(p);
        }
      }
    }
  }

  private updateNpcs(dt: number): void {
    const G = this.grid;
    this.npcT -= dt;
    if (this.npcT <= 0) {
      this.npcT = 4;
      this.syncNpcs(true);
    }
    for (const n of this.npcs) {
      const m = n.ent.m;
      n.ent.update(dt, G, this.weather.rain > 0.3);
      n.t -= dt;
      n.pet -= dt;
      if (n.leaving) continue;
      const S = n.slot;
      if (S && !m.moving && n.t <= 0) {
        const far = Math.hypot(m.tx - S.at[0], m.ty - S.at[1]) > 1.5;
        let target: [number, number] | null = null;
        if (S.activity === 'stroll') {
          n.t = 6 + Math.random() * 5;
          target = [S.at[0] + Math.round((Math.random() - 0.5) * 6), S.at[1] + Math.round((Math.random() - 0.5) * 6)];
        } else if (S.activity === 'jog') {
          // vueltas al muelle a buen ritmo
          n.t = 0.5;
          const k = Math.floor(Math.random() * 4), R = 4;
          target = [S.at[0] + (k === 0 ? R : k === 2 ? -R : 0), S.at[1] + (k === 1 ? R : k === 3 ? -R : 0)];
        } else {
          n.t = 5;
          if (far) target = S.at;
        }
        if (target) {
          const t = nearestWalkable(G, target[0], target[1]);
          const p = t && findPath(G, m.tx, m.ty, t[0], t[1]);
          if (p && p.length > 1) m.setPath(p);
        }
      }
      // se paran a hacer carantoñas a los animales que tienen cerca
      if (!m.moving && n.pet <= 0) {
        n.pet = 6 + Math.random() * 6;
        const a = this.pop.entries.find((e) => Math.hypot(e.ent.m.x - m.x, e.ent.m.y - m.y) / TILE < 2.2 && e.brain.mode !== 'flee' && e.brain.mode !== 'sleep');
        if (a) {
          m.dir = dirTo(m.x, m.y, a.ent.m.x, a.ent.m.y, m.dir);
          n.ent.action = 'crouch';
          n.ent.actionT = 1.6;
          a.ent.react('heart', 1.4);
          a.data.wellbeing = Math.min(1, a.data.wellbeing + 0.02);
        }
      }
      // la galga de Lúa la sigue
      const d = n.dog;
      if (d) {
        n.dogT -= dt;
        const dist = Math.hypot(d.m.x - m.x, d.m.y - m.y) / TILE;
        if (n.dogT <= 0 && dist > 1.4) {
          n.dogT = 0.8;
          d.m.speed = dist > 3 ? 52 : 34;
          const t = nearestWalkable(G, m.tx + 1, m.ty);
          const p = t && findPath(G, d.m.tx, d.m.ty, t[0], t[1]);
          if (p && p.length > 1) d.m.setPath(p);
        }
        d.update(dt, G);
        if (!d.m.moving && d.state === 'walk') d.play('idle');
      }
    }
    // los que se iban y ya han llegado a la salida desaparecen
    this.npcs = this.npcs.filter((n) => !(n.leaving && !n.ent.m.moving));
  }

  /** ¿Tiene este vecino algo nuevo que contarte (capítulo o encargo listo)? */
  npcHasNews?: (id: string) => boolean;

  /** Quita a un animal de la zona (adoptado). */
  removeAnimal(id: string): void {
    this.pop.entries = this.pop.entries.filter((e) => e.data.id !== id);
    if (this.pop.request?.id === id) this.pop.clearRequest();
  }

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
    this.grid = { w: m.tilesW, h: m.tilesH, walk: m.walk, height: m.height, edges: m.edges };
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
      friends: (a, b) => this.events.friends?.(a, b),
      moment: (id, e) => this.pendingMoments.push({ id, e, t: 6 }),
      pounce: (e, a, what) => {
        // con viento, una hoja sale rodando justo hacia donde salta el gato
        if (what === 'hojas') this.ambient?.blowLeaf(e.ent.m.x + Math.cos(a) * 8, e.ent.m.y + Math.sin(a) * 8, a, 22);
      },
    });
    this.pop.setSpots(this.namedSpots());
    this.treasures = [];
    this.pickup = null;
    this.treasureT = 60 + Math.random() * 120;
    this.populate();
    this.updateVisitors();
    if (Math.random() < 0.7) setTimeout(() => this.spawnTreasure(), 4000);
    // vecinos: los que a esta hora están en esta zona, ya en su sitio
    this.syncNpcs(false);
    this.structures = [];
    this.refreshStructures();
    this.ambient = new Ambient(m, this.bounds);
    this.ambient.sea = this.zoneDef.sea ?? null;
    this.ambient.onFlap = () => sfx.flap();
    this.pop.puddles = this.ambient.puddles;
    this.folk.populate(this.grid, folkScene(this.zoneId, this.hour));
    if (this.zoneId === 'puerto') {
      // el bar del puerto: luz cálida en la puerta y en la acera de noche
      const L = (x: number, y: number, z: number, r: number, kind: LightSrc['kind']) =>
        this.lights.push({ sx: 2 * (x - y), sy: x + y - z, gx: 2 * (x - y), gy: x + y - 40, r, kind, phase: this.lights.length });
      L(136, 52, 84, 34, 'kiosk');
      L(136, 70, 40, 44, 'window');
    }
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
    this.pop.feeders = [
      ...placed.map((d) => ({ id: d.id, x: d.tx * TILE + 8, y: d.ty * TILE + 8, ref: d })),
      // el bebedero de piedra del puerto (proyecto del barrio) nunca se vacía
      ...this.structures.filter((s) => s.id === 'bebedero-piedra').map((s) => ({ id: 'bebedero', x: s.tx * TILE + 8, y: s.ty * TILE + 8 })),
    ];
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
    const fair = this.happening === 'mercadillo' ? 3 : 1;
    if (here >= Z.cap + decor + (fair > 1 ? 2 : 0) || now - last < (Math.max(5, 12 - decor * 2) * 60_000) / fair) return null;
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

  /** suceso del día activo (lo pone main) */
  happening: HappeningId | null = null;
  /** estructuras de los proyectos del barrio terminados en esta zona */
  structures: (Drawable & { id: string; tx: number; ty: number })[] = [];

  /** Coloca (o quita) las estructuras de los proyectos terminados de esta zona. */
  refreshStructures(): void {
    this.structures = [];
    const P = this.world.meta?.projects ?? {};
    const G = this.grid;
    const place = (id: string, art: string, at: [number, number]) => {
      const t = nearestWalkable(G, at[0], at[1]);
      if (!t) return;
      const x = t[0] * TILE + 8, y = t[1] * TILE + 8, z = G.height[t[1] * G.w + t[0]];
      const img = decorSprite(art);
      const sx = 2 * (x - y), sy = x + y - z;
      this.structures.push({
        id, tx: t[0], ty: t[1], box: [x - 7, y - 7, z, x + 7, y + 7, z + img.height], rect: [sx - img.width / 2, sy - img.height, img.width, img.height],
        draw: (ctx, cx, cy) => ctx.drawImage(img, Math.round(sx - img.width / 2 - cx), Math.round(sy - img.height + 3 - cy)),
      });
    };
    const Z = this.zoneDef;
    if (this.zoneId === 'calle' && P.rascador?.done) place('rascador', 'rascador', [5, 16]);
    if (this.zoneId === 'parque' && P.casetas?.done) {
      place('caseta1', 'caseta', Z.homes[0]);
      place('caseta2', 'caseta', Z.homes[1]);
    }
    if (this.zoneId === 'descampado' && P.refugio?.done) place('refugio', 'refugio', Z.homes[1] ?? Z.homes[0]);
    if (this.zoneId === 'puerto' && P.bebedero?.done) place('bebedero-piedra', 'bebedero-piedra', [Z.entry[0] - 3, Z.entry[1]]);
    this.refreshDecor();
  }

  /** tesoros escondidos en el suelo de esta zona */
  treasures: { def: TreasureDef; tx: number; ty: number; x: number; y: number; z: number }[] = [];
  private treasureT = 120;
  /** tesoro que se va a recoger al llegar a su lado */
  private pickup: { tx: number; ty: number } | null = null;

  /** Cómo está el mundo ahora (para tesoros y visitantes). */
  worldNow(): WorldNow {
    return { season: this.season, rain: this.weather.rain, snow: Math.max(this.snowCover, this.weather.snow), hour: this.hour, events: this.fiestas, open: this.world.meta?.zonesOpen ?? ['calle'] };
  }

  /** Esconde un tesoro en algún rincón (a veces un animal amigo te lleva hasta él). */
  spawnTreasure(): void {
    if (this.treasures.length >= 2 || this.opts.shot) return;
    const have = this.world.meta?.treasures ?? {};
    const def = pickTreasure(this.zoneId, this.worldNow(), have, Math.random);
    if (!def) return;
    const G = this.grid, pm = this.player.m;
    for (let k = 0; k < 40; k++) {
      const tx = 3 + Math.floor(Math.random() * (G.w - 3)), ty = 3 + Math.floor(Math.random() * (G.h - 3));
      if (!walkable(G, tx, ty) || Math.hypot(tx - pm.tx, ty - pm.ty) < 4 || this.treasures.some((t) => t.tx === tx && t.ty === ty)) continue;
      const x = tx * TILE + 4 + Math.random() * 8, y = ty * TILE + 4 + Math.random() * 8;
      this.treasures.push({ def, tx, ty, x, y, z: G.height[ty * G.w + tx] });
      const guide = this.pop.entries.find((e) => hearts(e.data) >= 3 && e.brain.mode !== 'eat' && e.brain.mode !== 'sleep' && !e.ent.m.moving);
      if (guide && Math.random() < 0.45) this.pop.pointAt(guide, tx, ty);
      return;
    }
  }

  /** Llegan o se van los visitantes de temporada de esta zona según el tiempo y la estación. */
  updateVisitors(): void {
    if (this.opts.shot) return;
    const w = this.worldNow();
    for (const v of VISITORS) {
      const id = `v-${v.id}`;
      const here = v.when(w) && w.open.includes(v.zone);
      let D = this.world.animals.find((a) => a.id === id);
      if (!here) {
        if (D && D.zone !== 'visitante') D.zone = 'visitante';
        if (v.zone === this.zoneId && this.pop.entries.some((e) => e.data.id === id)) this.removeAnimal(id);
        continue;
      }
      const first = !D;
      if (!D) {
        D = visitorData(v, Date.now());
        this.world.animals.push(D);
      }
      D.zone = v.zone;
      if (v.zone !== this.zoneId) continue;
      let e = this.pop.entries.find((x) => x.data.id === id);
      if (!e) {
        e = this.pop.add(D, this.zoneDef.entry[0], this.zoneDef.entry[1]);
        this.events.visitor?.(e, first);
      }
      e.ent.acc = v.hat;
    }
  }

  /** momentos raros recién empezados: cuentan si los ves (en pantalla y cerca) en unos segundos */
  private pendingMoments: { id: MomentId; e: Entry; t: number }[] = [];
  /** tiempo mirando a un animal que hace su costumbre (para descubrirla) */
  private routineWatch = new Map<string, number>();

  /** Sitios con nombre de la zona, para las costumbres de los animales. */
  private namedSpots(): { tile: [number, number]; place: string }[] {
    const de: Record<ZoneId, string> = { calle: 'de tu calle', plaza: 'de la plaza', parque: 'de la Alameda', mercado: 'del mercado', descampado: 'del descampado', puerto: 'del puerto', horta: 'del huerto' };
    const z = de[this.zoneId];
    const out: { tile: [number, number]; place: string }[] = [];
    for (const b of this.zone.meta.benches) out.push({ tile: b, place: `junto al banco ${z}` });
    for (const f of this.zone.meta.fountains) out.push({ tile: [Math.floor(f.basin.cx / TILE) + 2, Math.floor(f.basin.cy / TILE) + 2], place: `junto a la fuente ${z}` });
    this.zoneDef.homes.slice(0, 3).forEach((h, i) => out.push({ tile: h, place: ['en la esquina', 'en el portal', 'en el rincón'][i] + ' ' + z }));
    if (this.zoneDef.portal) out.push({ tile: [Math.floor(this.zoneDef.portal[0] / TILE), Math.floor(this.zoneDef.portal[1] / TILE)], place: 'en tu felpudo' });
    return out.filter((s) => nearestWalkable(this.grid, s.tile[0], s.tile[1])).map((s) => ({ ...s, tile: nearestWalkable(this.grid, s.tile[0], s.tile[1])! }));
  }

  /** ¿Se ve este animal (en pantalla y no muy lejos)? */
  private sees(e: Entry): boolean {
    const v = this.view, [sx, sy] = e.ent.screenPos();
    const dx = sx - this.cam.x, dy = sy - this.cam.y;
    const near = Math.hypot(e.ent.m.x - this.player.m.x, e.ent.m.y - this.player.m.y) / TILE < 9;
    return near && Math.abs(dx) < v.w / 2 - 8 && Math.abs(dy) < v.h / 2 - 8;
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
    // pelota: tocar el suelo la lanza ahí
    if (this.ball?.phase === 'aim') {
      const heights = [...new Set(Array.from(this.grid.height))].sort((a, b) => b - a);
      for (const h of heights) {
        const [x, y] = screenToWorld(wx, wy, h);
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx < 0 || ty < 0 || tx >= this.grid.w || ty >= this.grid.h || this.grid.height[ty * this.grid.w + tx] !== h || !walkable(this.grid, tx, ty)) continue;
        const pm = this.player.m, B = this.ball;
        pm.dir = dirTo(pm.x, pm.y, x, y, pm.dir);
        this.player.action = 'give';
        this.player.actionT = 0.5;
        B.from = [pm.x, pm.y, pm.z + 18];
        B.to = [x, y, h];
        B.t = 0;
        B.phase = 'fly';
        sfx.ui('open');
        return;
      }
      return;
    }
    // escondite: tocar al gato escondido lo encuentra
    if (this.hide?.hidden) {
      const [sx, sy] = this.hide.e.ent.screenPos();
      if (Math.abs(wx - sx) < 16 && wy > sy - 26 && wy < sy + 6) {
        this.foundHidden();
        return;
      }
    }
    // tesoros: ir a recogerlos
    for (const T of this.treasures) {
      const sx = 2 * (T.x - T.y), sy = T.x + T.y - T.z;
      if (Math.abs(wx - sx) < 9 && wy > sy - 12 && wy < sy + 5) {
        this.pending = null;
        this.refill = null;
        this.pickup = { tx: T.tx, ty: T.ty };
        if (this.walkTo(T.tx, T.ty)) {
          this.cam.follow = true;
          this.marker = { x: T.x, y: T.y, t: 0.8 };
        } else this.pickup = null;
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
    music.setZone(this.zoneId);
    const f = this.zone.meta.fountains[0];
    ambience.update(dt, {
      rain: this.weather.rain, wind: this.weather.wind, hour: this.hour, port: !!this.zoneDef.ambient.port,
      fountainDist: f ? Math.hypot(this.player.m.x - f.basin.cx, this.player.m.y - f.basin.cy) / TILE : 99,
    });
    this.handlePending(dt);
    this.updateStepBack(dt);
    this.updatePlay(dt);
    this.treasureT -= dt;
    if (this.treasureT <= 0) {
      this.treasureT = 150 + Math.random() * 120;
      this.spawnTreasure();
    }
    if (this.pickup && !this.player.m.moving) {
      const P = this.pickup, pm = this.player.m;
      this.pickup = null;
      const i = this.treasures.findIndex((t) => t.tx === P.tx && t.ty === P.ty);
      if (i >= 0 && Math.hypot(pm.x - this.treasures[i].x, pm.y - this.treasures[i].y) / TILE < 1.6) {
        const T = this.treasures.splice(i, 1)[0];
        this.player.action = 'crouch';
        this.player.actionT = 1.1;
        this.pop.endPoint(T.tx, T.ty);
        this.events.treasure?.(T.def);
      }
    }
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
        grid: this.grid, hour: this.hour, raining: rain, now: Date.now(), wind: this.weather.wind, season: this.season, snow: this.snowCover,
        player: { x: this.player.m.x, y: this.player.m.y, moving: this.player.m.moving },
        shelters: [
          ...this.zone.meta.shelters,
          ...[...this.decor, ...this.structures].filter((d) => /caseta|sombrilla|braserito|refugio/.test(d.id)).map((d) => [d.tx - 0.5, d.ty - 0.5, d.tx + 1.5, d.ty + 1.5] as [number, number, number, number]),
        ],
        approaching: this.pending?.e.data.id ?? null,
        mods: this.happening === 'reparto' && this.zoneId === 'mercado' ? { boxMul: 6 } : this.happening === 'mimos' ? { requestMul: 0.4 } : this.happening === 'siestas' ? { restMul: 1.6 } : undefined,
      });
    } else for (const e of this.pop.entries) e.ent.update(dt, this.grid);
    for (const e of this.pop.entries) {
      e.ent.bandage = e.brain.bandage > 0;
      e.ent.mud = !!e.data.muddy;
    }
    // momentos raros: solo cuentan si los has visto
    for (const M of this.pendingMoments) {
      M.t -= dt;
      if (M.t > 0 && this.pop.entries.includes(M.e) && this.sees(M.e)) {
        M.t = 0;
        this.events.moment?.(M.id, M.e);
      }
    }
    this.pendingMoments = this.pendingMoments.filter((M) => M.t > 0);
    // costumbres: mirar un rato a un animal que la está haciendo la descubre
    if (!this.opts.shot)
      for (const e of this.pop.entries) {
        if (e.data.routineKnown || !this.pop.doingRoutine(e) || !this.sees(e)) continue;
        const t = (this.routineWatch.get(e.data.id) ?? 0) + dt;
        this.routineWatch.set(e.data.id, t);
        if (t > 4) {
          e.data.routineKnown = true;
          const rt = this.pop.routineOf(e.data);
          if (rt) this.events.routine?.(e, rt.text);
        }
      }
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
    this.updateNpcs(dt);
    this.folk.update(dt, this.grid, folkScene(this.zoneId, this.hour), this.zoneDef.entry, this.weather.rain > 0.3);
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
    this.ambient.snowCover = this.snowCover;
    this.worldLife(dt);
    if (this.marker) {
      // se queda mientras se camina hacia él y se desvanece al llegar
      const pm = this.player.m;
      if (!pm.moving || this.pending) this.marker.t -= dt;
      if (this.marker.t <= 0) this.marker = null;
    }
  }

  /** Vida por horas y huellas del clima: campanas, huellas en la nieve y chapoteos. */
  private worldLife(dt: number): void {
    const hh = Math.floor(this.hour);
    if (this.bellHour !== hh) {
      if (this.bellHour >= 0 && (hh === 12 || hh === 20) && !this.titleDrift) this.ringBells(hh === 12 ? 6 : 3);
      this.bellHour = hh;
    }
    if (this.snowCover > 0.3) {
      const P = this.player.m;
      this.ambient.track(this.player, P.x, P.y, P.z, false, 5);
      for (const n of this.npcs) this.ambient.track(n.ent, n.ent.m.x, n.ent.m.y, n.ent.m.z, false, 5);
      for (const f of this.folk.ents) this.ambient.track(f, f.m.x, f.m.y, f.m.z, false, 5);
      for (const a of this.animals) this.ambient.track(a, a.m.x, a.m.y, a.m.z, true, a.look.shape.legH > 12 ? 6 : 4);
    }
    if (this.weather.rain > 0.1) {
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 0.12;
        let loud = false;
        for (const e of this.pop.entries) {
          const A = e.ent;
          const jumping = e.brain.mode === 'spin' && e.brain.moment === 'charco';
          if ((A.m.moving || jumping) && this.ambient.inPuddle(A.m.x, A.m.y)) {
            this.ambient.splashAt(A.m.x, A.m.y);
            if (jumping) loud = true;
          }
        }
        const P = this.player.m;
        if (P.moving && this.ambient.inPuddle(P.x, P.y)) this.ambient.splashAt(P.x, P.y);
        if (loud && Math.random() < 0.35) sfx.splash();
      }
    }
  }

  /** Las campanas de la iglesia: se oyen más en la plaza; las palomas se espantan. */
  ringBells(strokes = 6): void {
    const vol = this.zoneId === 'plaza' ? 0.3 : this.zoneId === 'calle' || this.zoneId === 'mercado' ? 0.16 : 0.09;
    sfx.bells(strokes, vol);
    if (this.zoneId === 'plaza') this.ambient.scatter();
    for (const e of this.pop.entries) if (e.brain.mode !== 'sleep' && Math.random() < 0.6) e.ent.react('alert', 1.2);
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
    for (const e of [this.player, ...this.npcs.map((n) => n.ent), ...this.folk.ents, ...this.npcs.flatMap((n) => (n.dog ? [n.dog] : [])), ...this.animals]) {
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
    // la pelota (en el aire, en el suelo o en la boca del perro)
    if (this.ball) {
      const B = this.ball, e = B.e;
      const carried = B.phase === 'return';
      const [px, py, pz] = carried ? [e.ent.m.x, e.ent.m.y, e.ent.m.z + e.ent.look.shape.legH * 1.5] : [B.x, B.y, B.z];
      const bsx = 2 * (px - py), bsy = px + py - pz;
      const gz = carried ? e.ent.m.z : B.phase === 'fly' ? B.from[2] + (B.to[2] - B.from[2]) * Math.min(1, B.t / 0.75) : B.z;
      list.push({
        box: [px - 2, py - 2, pz, px + 2, py + 2, pz + 3], rect: [bsx - 3, bsy - 5, 6, 6],
        draw: (ctx, cx, cy) => {
          const X = Math.round(bsx - cx), Y = Math.round(bsy - cy);
          if (!carried) {
            ctx.fillStyle = PALETTE.stone1;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(X - 2, Math.round(px + py - gz - cy), 4, 1);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = PALETTE.coral;
          ctx.fillRect(X - 2, Y - 4, 4, 4);
          ctx.fillRect(X - 1, Y - 5, 2, 6);
          ctx.fillRect(X - 3, Y - 3, 6, 2);
          ctx.fillStyle = PALETTE.cal4;
          ctx.fillRect(X - 1, Y - 4, 1, 1);
          ctx.fillStyle = PALETTE.rose;
          ctx.fillRect(X + 1, Y - 1, 1, 1);
        },
      });
    }
    // tesoros escondidos: brillan de vez en cuando
    for (const T of this.treasures) {
      const img = matrix('tr-' + T.def.id, T.def.rows, { '.': null, ...T.def.key });
      const tsx = 2 * (T.x - T.y), tsy = T.x + T.y - T.z;
      list.push({
        box: [T.x - 3, T.y - 3, T.z, T.x + 3, T.y + 3, T.z + 2], rect: [tsx - 6, tsy - 10, 12, 12],
        draw: (ctx, cx, cy) => {
          const X = Math.round(tsx - img.width / 2 - cx), Y = Math.round(tsy - img.height + 1 - cy);
          ctx.drawImage(img, X, Y);
          const ph = (performance.now() / 1000 + T.tx * 0.37) % 2.4;
          if (ph < 0.5) {
            // destello en cruz
            const k = ph < 0.25 ? 1 : 2;
            ctx.fillStyle = PALETTE.cal4;
            ctx.fillRect(X + img.width, Y - 2, 1, 1);
            ctx.fillStyle = PALETTE.butter;
            ctx.fillRect(X + img.width - k, Y - 2, k * 2 + 1, 1);
            ctx.fillRect(X + img.width, Y - 2 - k, 1, k * 2 + 1);
          }
        },
      });
    }
    // gato en una caja: la caja tiene parte de atrás y de delante para que el gato quede dentro
    const BX = this.pop.box;
    if (BX) {
      const bsx = 2 * (BX.x - BX.y), bsy = BX.x + BX.y - BX.z;
      const back = cardboardBox('back'), front = cardboardBox('front');
      list.push(
        { box: [BX.x - 8, BX.y - 8, BX.z, BX.x + 8, BX.y - 7, BX.z + 12], rect: [bsx - 15, bsy - 11, 31, 26], draw: (ctx, cx, cy) => ctx.drawImage(back, Math.round(bsx - 15 - cx), Math.round(bsy - 11 - cy)) },
        { box: [BX.x - 8, BX.y + 7, BX.z, BX.x + 8, BX.y + 8, BX.z + 10], rect: [bsx - 15, bsy - 11, 31, 26], draw: (ctx, cx, cy) => ctx.drawImage(front, Math.round(bsx - 15 - cx), Math.round(bsy - 11 - cy)) },
      );
    }
    list.push(this.player, ...this.animals, ...this.pop.bowls, ...this.decor, ...this.structures, ...this.ambient.drawables, ...this.fest.props, ...this.npcs.map((n) => n.ent), ...this.folk.ents, ...this.npcs.flatMap((n) => (n.dog ? [n.dog] : [])));
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
    const REQ = this.pop.request;
    for (const en of this.pop.entries) {
      const a = en.ent, D = en.data, mode = en.brain.mode;
      // petición: bocadillo con lo que quiere y un «!» que salta
      if (REQ && REQ.id === D.id && !a.reaction) {
        const k = REQ.kind === 'comida' ? 'food' : REQ.kind === 'agua' ? 'water' : REQ.kind === 'caricias' ? 'heart' : 'play';
        const img = needBubble(k, species(D) === 'cat');
        const [sx, sy] = a.screenPos();
        const top = a.look.shape.legH * 2.3 + 13 + Math.round(Math.abs(Math.sin(now * 4)) * 3);
        const X = Math.round(sx - camX - img.width / 2), Y = Math.round(sy - camY - top);
        b.drawImage(img, X, Y);
        b.fillStyle = PALETTE.mustard;
        b.fillRect(X - 3, Y + 1, 2, 4);
        b.fillRect(X - 3, Y + 6, 2, 1);
        continue;
      }
      if (a.reaction || mode === 'eat' || mode === 'goBowl' || mode === 'care' || mode === 'feeder' || mode === 'box') continue;
      if (this.pop.bowls.some((bw) => bw.forId === D.id && bw.state === 'full')) continue;
      const kind = D.injured ? 'hurt' : Math.min(D.hunger, D.thirst) < 0.35 ? (D.hunger <= D.thirst ? 'food' : 'water') : null;
      if (!kind) continue;
      const img = needBubble(kind, species(D) === 'cat');
      const [sx, sy] = a.screenPos();
      const top = a.look.shape.legH * 2.3 + 12 + Math.round(Math.sin(now * 2 + D.seed) * 1.5);
      b.drawImage(img, Math.round(sx - camX - img.width / 2), Math.round(sy - camY - top));
    }
    // vecinos con algo nuevo que contarte: «!» sobre la cabeza
    for (const n of this.npcs) {
      if (n.leaving || !this.npcHasNews?.(n.nb.id)) continue;
      const [fx, fy] = n.ent.feet();
      const X = Math.round(fx - camX), Y = Math.round(fy - camY - 62 - Math.abs(Math.sin(now * 3)) * 3);
      b.fillStyle = PALETTE.ink2;
      b.fillRect(X - 2, Y - 1, 5, 10);
      b.fillStyle = PALETTE.mustard;
      b.fillRect(X - 1, Y, 3, 5);
      b.fillRect(X - 1, Y + 6, 3, 2);
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
