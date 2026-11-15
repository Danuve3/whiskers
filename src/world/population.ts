// Comportamiento de los animales: horarios, confianza, comida, lluvia, seguir, travesuras.
import { TILE, type Box } from '../engine/iso.ts';
import { findPath, nearestWalkable, walkable, frontEdges, type Grid } from './path.ts';
import { Animal, dirFromDelta, type Drawable } from './entities.ts';
import { makeLook } from '../sprites/breeds.ts';
import { warmAnimal } from '../sprites/workerClient.ts';
import { serve, SERVINGS, type PlacedFeeder } from '../sim/feeders.ts';
import { apply, comfortDistance, hearts, species, stage, type Action, type ActionResult, type AnimalData, type FoodId } from '../sim/model.ts';
import { matrix } from '../fx/sprites.ts';
import { PALETTE } from '../gfx/palette.ts';
import { bond, affinity, FRIENDS, routineFor, inRoutine, pickRequest, type Routine, type AnimalRequest, type MomentId } from '../sim/life.ts';
import { growth } from '../sim/life.ts';
import { scaleShape } from '../sprites/breeds.ts';
import type { Season } from '../sim/calendar.ts';
import * as sfx from '../audio/sfx.ts';

export type Mode = 'idle' | 'walk' | 'rest' | 'flee' | 'watch' | 'goBowl' | 'eat' | 'follow' | 'shelter' | 'sleep' | 'sock' | 'wait' | 'care' | 'feeder'
  | 'social' | 'routine' | 'ask' | 'spin' | 'box' | 'trick' | 'pounce' | 'point';

export interface Brain {
  feederId?: string;
  mode: Mode;
  t: number; // tiempo restante en el modo
  think: number;
  bowl: Bowl | null;
  bandage: number;
  purr: number;
  /** con quién (amigos, madre) y qué hacen juntos */
  target?: Entry;
  social?: 'siesta' | 'acicalar' | 'jugar';
  /** momento raro en curso (para avisar al verlo) */
  moment?: MomentId;
  /** pausa entre trucos al saludarte */
  trickCD?: number;
  /** ya ha adoptado la postura del modo actual */
  posed?: boolean;
  spinStep?: number;
  /** casilla de un tesoro que te está enseñando */
  point?: [number, number];
  /** al comer, se acerca hasta tener la boca sobre la comida */
  slide?: [number, number];
}

export interface Entry {
  data: AnimalData;
  ent: Animal;
  brain: Brain;
}

/** A qué distancia (tiles) tiene que estar el jugador del cuenco para que este animal se acerque. */
export function bowlDistance(D: AnimalData): number {
  return [5, 4, 2.6, 0, 0][Math.min(4, hearts(D))] * (D.personality === 'timido' ? 1.15 : 1) * (D.personality === 'gloton' ? 0.75 : 1);
}

// Comida y agua en el suelo: el mismo icono que en los menús (pescado para los gatos, muslo para los
// perros, gota para el agua) y se va gastando mientras el animal come o bebe.
const FLOOR_FISH = ['....kkkkk.....', '..kkSSSSSk..kk', '.kwSSSSSSSkkSk', 'kkmmmmnnmmSSk.', '.kmmmmmmmmkmmk', '..kkwwwwwk..kk', '....kkkkk.....'];
const FLOOR_MEAT = ['..kkkk.......', '.kYYook......', 'kYoooook.....', 'kooooooOk....', '.kOooOOOk....', '..kOOOOkwk...', '...kkkk.kwkk.', '........kwwck', '.........kkk.'];
const FLOOR_DROP = ['...k...', '..ksk..', '..ksk..', '.kssSk.', 'kswssSk', 'kswsSSk', 'kssSSSk', '.kSSSk.', '..kkk..'];
const FLOOR_KEY = { '.': null, k: 'ink2', w: 'cal4', c: 'cal3', s: 'sky', S: 'water2', m: 'stone3', n: 'stone2', o: 'tile3', O: 'tile2', Y: 'butter' } as const;

export class Bowl implements Drawable {
  box: Box;
  rect: [number, number, number, number];
  state: 'full' | 'eating' | 'empty' = 'full';
  fade = 1;
  /** 0 = intacto … 1 = se lo ha terminado */
  progress = 0;
  /** duración de la comida (s), para calcular el progreso */
  dur = 3;
  /** de qué lado come el animal (los bocados empiezan por ahí) */
  fromLeft = true;
  private crumbs: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private crumbT = 0;
  constructor(public x: number, public y: number, public z: number, public kind: 'food' | 'water', public food: FoodId, public forId: string, public cat = true) {
    this.box = [x - 5, y - 5, z, x + 5, y + 5, z + 4];
    const sx = 2 * (x - y), sy = x + y - z;
    this.rect = [sx - 8, sy - 9, 16, 11];
  }
  private sprite(): HTMLCanvasElement {
    const rows = this.kind === 'water' ? FLOOR_DROP : this.cat ? FLOOR_FISH : FLOOR_MEAT;
    return matrix(`floor-${this.kind}-${this.cat}`, rows, FLOOR_KEY);
  }
  /** Avanza el consumo y las migas (o gotitas). */
  tick(dt: number): void {
    if (this.state === 'eating') {
      this.crumbT -= dt;
      if (this.crumbT <= 0) {
        this.crumbT = 0.22 + Math.random() * 0.2;
        this.crumbs.push({ x: (Math.random() - 0.5) * 8, y: -3, vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 10, t: 0.6 });
      }
    }
    for (const c of this.crumbs) {
      c.t -= dt;
      c.vy += 60 * dt;
      c.x += c.vx * dt;
      c.y = Math.min(1, c.y + c.vy * dt);
    }
    this.crumbs = this.crumbs.filter((c) => c.t > 0);
  }
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const sx = Math.round(2 * (this.x - this.y) - camX), sy = Math.round(this.x + this.y - this.z - camY);
    const img = this.sprite();
    const W = img.width, H = img.height;
    const p = this.state === 'empty' ? 1 : this.progress;
    ctx.globalAlpha = this.fade;
    // sombrita en el suelo
    ctx.fillStyle = PALETTE.stone1;
    ctx.globalAlpha = this.fade * 0.35 * (1 - p * 0.7);
    ctx.fillRect(sx - Math.round(W / 2) + 1, sy, W - 2, 1);
    ctx.globalAlpha = this.fade;
    const X = sx - Math.floor(W / 2), Y = sy - H + 1;
    if (p < 1) {
      if (this.kind === 'water') {
        // el agua baja de nivel: desaparecen las filas de arriba
        const cut = Math.floor(H * p);
        ctx.drawImage(img, 0, cut, W, H - cut, X, Y + cut, W, H - cut);
        if (cut > 0 && cut < H - 1) {
          ctx.fillStyle = PALETTE.water4;
          ctx.fillRect(X + 2, Y + cut, W - 4, 1);
        }
      } else {
        // bocados: se come desde su lado, con el borde mordisqueado
        const keep = Math.ceil(W * (1 - p));
        const sx0 = this.fromLeft ? W - keep : 0;
        ctx.drawImage(img, sx0, 0, keep, H, X + sx0, Y, keep, H);
        if (p > 0 && keep > 1) {
          const edge = this.fromLeft ? X + sx0 : X + keep - 1;
          ctx.fillStyle = PALETTE.ink2;
          for (let j = 1; j < H - 1; j += 2) ctx.fillRect(edge, Y + j, 1, 1);
        }
      }
    }
    // migas o gotitas que saltan
    ctx.fillStyle = this.kind === 'water' ? PALETTE.water3 : this.cat ? PALETTE.stone3 : PALETTE.tile3;
    for (const c of this.crumbs) ctx.fillRect(Math.round(sx + c.x), Math.round(sy - 2 + c.y), 1, 1);
    ctx.globalAlpha = 1;
  }
}

export interface WorldCtx {
  grid: Grid;
  hour: number;
  raining: boolean;
  /** viento (|w| > 0.5 = ventoso), estación y si hay nieve cuajada */
  wind: number;
  season: Season;
  snow: number;
  /** ajustes del suceso del día (más cajas, más peticiones, más siestas…) */
  mods?: { boxMul?: number; requestMul?: number; restMul?: number };
  now: number;
  player: { x: number; y: number; moving: boolean };
  shelters: [number, number, number, number][];
  /** el jugador va hacia este animal para interactuar */
  approaching: string | null;
}

export interface PopulationEvents {
  care(e: Entry, act: Action, res: ActionResult): void;
  toast(msg: string): void;
  sock(e: Entry): void;
  /** se han hecho amigos */
  friends?(a: Entry, b: Entry): void;
  /** empieza un momento raro (el juego decide si se ha visto) */
  moment?(id: MomentId, e: Entry): void;
}

const tdist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) / TILE;

export class Population {
  entries: Entry[] = [];
  bowls: Bowl[] = [];
  /** comederos, bebederos, mantas y casetas colocados */
  feeders: { id: string; x: number; y: number; ref?: PlacedFeeder }[] = [];

  private edges: Uint8Array;
  /** costumbre de cada animal en esta zona */
  private routines = new Map<string, Routine | null>();
  private spots: { tile: [number, number]; place: string }[] = [];
  /** petición en curso (como mucho una a la vez en la zona) */
  request: AnimalRequest | null = null;
  private nextRequest = 40 + Math.random() * 60;
  private bondT = 0;
  /** gato dentro de una caja de cartón (momento raro) */
  box: { x: number; y: number; z: number; e: Entry } | null = null;

  constructor(private grid: Grid, private ev: PopulationEvents) {
    this.edges = frontEdges(grid);
  }

  /** Sitios con nombre para las costumbres (bancos, rincones, fuente…). */
  setSpots(spots: { tile: [number, number]; place: string }[]): void {
    this.spots = spots;
    this.routines.clear();
  }
  routineOf(D: AnimalData): Routine | null {
    if (!this.routines.has(D.id)) this.routines.set(D.id, routineFor(D, this.spots));
    return this.routines.get(D.id) ?? null;
  }
  /** ¿Está ahora mismo haciendo su costumbre, en su sitio? */
  doingRoutine(e: Entry): boolean {
    const rt = this.routineOf(e.data);
    return !!rt && e.brain.mode === 'routine' && !e.ent.m.moving && tdist(e.ent.m.x, e.ent.m.y, rt.tile[0] * TILE + 8, rt.tile[1] * TILE + 8) < 1.6;
  }
  /** Mandar a un animal a una casilla (juegos dirigidos por el juego: pelota, escondite). */
  goTo(e: Entry, tx: number, ty: number, kind: 'walk' | 'trot' | 'run' | 'sneak'): boolean {
    return this.go(e, tx, ty, this.speeds(e)[kind]);
  }

  /** Un animal amigo te lleva hasta un tesoro y se sienta a su lado. */
  pointAt(e: Entry, tx: number, ty: number): void {
    e.brain.mode = 'point';
    e.brain.point = [tx, ty];
    e.brain.t = 50;
    e.brain.posed = false;
    this.go(e, tx + 0.6, ty + 0.6, this.speeds(e).trot);
  }
  /** Ya has recogido el tesoro: deja de señalarlo. */
  endPoint(tx: number, ty: number): void {
    for (const e of this.entries)
      if (e.brain.mode === 'point' && e.brain.point?.[0] === tx && e.brain.point?.[1] === ty) {
        e.brain.mode = 'idle';
        e.brain.think = 1;
        e.ent.react('heart', 1.6);
      }
  }

  /** Petición atendida (o caducada). */
  clearRequest(): void {
    const r = this.request;
    this.request = null;
    this.nextRequest = 90 + Math.random() * 120;
    const e = r && this.entries.find((x) => x.data.id === r.id);
    if (e && e.brain.mode === 'ask') {
      e.brain.mode = 'idle';
      e.brain.think = 1;
    }
  }
  private busy(e: Entry): boolean {
    const m = e.brain.mode;
    return m === 'eat' || m === 'goBowl' || m === 'care' || m === 'feeder' || m === 'flee' || m === 'sock' || m === 'ask' || m === 'social' || m === 'trick' || m === 'spin' || m === 'box' || m === 'pounce' || e.ent.m.moving;
  }
  /** Dar vueltas en el sitio (persiguiendo la cola, un truco, chapotear…). */
  private spin(e: Entry, seconds: number, moment?: MomentId): void {
    e.ent.m.stop();
    e.brain.mode = 'spin';
    e.brain.t = seconds;
    e.brain.moment = moment;
    if (moment) this.ev.moment?.(moment, e);
  }

  /** Casilla transitable más cercana que no esté en el borde delantero. */
  private inner(x: number, y: number): [number, number] | null {
    for (let r = 1; r < 5; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (walkable(this.grid, nx, ny) && !this.edges[ny * this.grid.w + nx]) return [nx, ny];
        }
    return null;
  }

  add(data: AnimalData, tx?: number, ty?: number): Entry {
    let look = makeLook(data.breed, data.variant, data.seed, data.rare);
    // los nacidos en el barrio crecen con los días: más pequeños y con la cabeza grande
    const g = growth(data, Date.now());
    if (g < 1) {
      const gk = Math.round(g * 20) / 20;
      const S = scaleShape(look.shape, gk), hk = Math.pow(gk, -0.45);
      look = { ...look, key: `${look.key}-g${gk}`, shape: { ...S, head: [S.head[0] * hk, S.head[1] * hk, S.head[2] * hk], snoutLen: S.snoutLen * 0.8 } };
    }
    const [sx, sy] = tx !== undefined && ty !== undefined ? [tx, ty] : data.home;
    const p = nearestWalkable(this.grid, sx, sy) ?? [10, 10];
    const ent = new Animal(data.name, look, p[0], p[1], this.grid);
    warmAnimal(look);
    ent.m.dir = Math.floor(Math.random() * 4);
    const e: Entry = { data, ent, brain: { mode: 'idle', t: 0, think: Math.random() * 2, bowl: null, bandage: 0, purr: 0 } };
    this.entries.push(e);
    return e;
  }

  private go(e: Entry, tx: number, ty: number, speed: number): boolean {
    let t = nearestWalkable(this.grid, Math.round(tx), Math.round(ty));
    if (!t) return false;
    // los perros grandes no se paran ni pasean por el borde delantero (sobresaldrían por encima de la pared)
    const big = e.ent.look.shape.legH > 12;
    if (big && this.edges[t[1] * this.grid.w + t[0]]) t = this.inner(t[0], t[1]) ?? t;
    const blocked = (x: number, y: number) => this.entries.some((o) => o !== e && !o.ent.m.moving && o.ent.m.tx === x && o.ent.m.ty === y);
    const cost = big ? (x: number, y: number) => (this.edges[y * this.grid.w + x] ? 2.5 : 0) : undefined;
    const path = findPath(this.grid, e.ent.m.tx, e.ent.m.ty, t[0], t[1], blocked, cost);
    if (!path || path.length < 2) return false;
    e.ent.m.speed = speed;
    e.ent.m.setPath(path);
    return true;
  }

  private speeds(e: Entry) {
    const cat = species(e.data) === 'cat';
    const k = e.ent.look.shape.legH > 15 ? 1.15 : e.ent.look.shape.legH < 7 ? 0.8 : 1;
    return { walk: (cat ? 26 : 30) * k, trot: 40 * k, run: 52 * k, sneak: 17 * k };
  }

  /** ¿Activo según su horario? */
  private awake(e: Entry, hour: number): boolean {
    if (e.data.schedule === 'siempre') return true;
    if (e.data.schedule === 'dia') return hour >= 7 && hour < 21.5;
    return hour >= 19.5 || hour < 8;
  }

  placeBowl(x: number, y: number, z: number, kind: 'food' | 'water', food: FoodId, forId: string): Bowl {
    const who = this.entries.find((q) => q.data.id === forId);
    const b = new Bowl(x, y, z, kind, food, forId, !who || species(who.data) === 'cat');
    this.bowls.push(b);
    const e = this.entries.find((x) => x.data.id === forId);
    if (e) {
      e.brain.think = 0.4;
      e.ent.react('alert', 1.4);
      if (species(e.data) === 'cat' && Math.random() < 0.6) setTimeout(() => sfx.meow(e.ent.look.shape.legH), 500);
    }
    return b;
  }

  /** Acción directa (curar, acariciar) cuando el jugador ya está al lado. */
  directCare(e: Entry, act: Action): ActionResult {
    const res = apply(e.data, act, Date.now());
    if (res.ok) {
      e.ent.m.stop();
      e.brain.mode = 'care';
      e.brain.t = 2.6;
      if (act === 'pet') {
        e.ent.play(species(e.data) === 'dog' ? 'wag' : 'sit');
        e.brain.purr = 2.5;
        if (species(e.data) === 'cat') sfx.purr(2.4);
        else sfx.bark(e.ent.look.shape.legH, 1);
      } else {
        e.ent.play('sit');
        e.brain.bandage = 180;
        sfx.bandage();
      }
      sfx.heart();
      e.ent.react('heart', 2);
    }
    this.ev.care(e, act, res);
    return res;
  }

  private feederAnim = new Map<Entry, 'eat' | 'drink'>();

  update(dt: number, w: WorldCtx): void {
    // al llegar al comedero, comer
    for (const [e, clip] of this.feederAnim) {
      if (!e.ent.m.moving && e.brain.mode === 'feeder') {
        e.ent.play(clip);
        e.brain.t = 3.2;
        this.feederAnim.delete(e);
      } else if (e.brain.mode !== 'feeder') this.feederAnim.delete(e);
    }
    for (const b of this.bowls) {
      b.tick(dt);
      // terminado: ya no queda nada, desaparece enseguida
      if (b.state === 'empty') b.fade -= dt * 2.5;
    }
    this.bowls = this.bowls.filter((b) => b.fade > 0);
    for (const e of this.entries) {
      this.think(e, dt, w);
      e.ent.update(dt, this.grid);
      if (e.brain.bandage > 0) e.brain.bandage -= dt;
      if (e.brain.purr > 0) e.brain.purr -= dt;
      if (e.brain.trickCD) e.brain.trickCD -= dt;
    }
    // amistades: pasar tiempo cerca y tranquilos acerca a dos animales
    this.bondT += dt;
    if (this.bondT >= 1) {
      const s = this.bondT;
      this.bondT = 0;
      for (let i = 0; i < this.entries.length; i++)
        for (let j = i + 1; j < this.entries.length; j++) {
          const a = this.entries[i], b = this.entries[j];
          if (a.ent.m.moving || b.ent.m.moving) continue;
          const together = a.brain.target === b || b.brain.target === a;
          if (!together && tdist(a.ent.m.x, a.ent.m.y, b.ent.m.x, b.ent.m.y) > 2.2) continue;
          if (bond(a.data, b.data, s * (together ? 3 : 1))) this.ev.friends?.(a, b);
        }
    }
    // peticiones espontáneas: de vez en cuando, alguien que ya confía viene a pedirte algo
    if (this.request && w.now > this.request.until) this.clearRequest();
    this.nextRequest -= dt;
    if (!this.request && this.nextRequest <= 0) {
      this.nextRequest = (45 + Math.random() * 60) * (w.mods?.requestMul ?? 1);
      const c = this.entries.filter((e) => !this.busy(e) && this.awake(e, w.hour) && e.brain.mode !== 'sleep' && tdist(e.ent.m.x, e.ent.m.y, w.player.x, w.player.y) < 9);
      const e = c[Math.floor(Math.random() * c.length)];
      const R = e && pickRequest(e.data, w.now, Math.random);
      if (e && R) {
        this.request = R;
        e.brain.mode = 'ask';
        e.brain.think = 0;
        e.ent.react('alert', 1.2);
      }
    }
  }

  /** Modos de vida propia en curso. Devuelve true si este fotograma ya está decidido. */
  private lifeModes(e: Entry, dt: number, w: WorldCtx, pd: number, sp: ReturnType<Population['speeds']>): boolean {
    const B = e.brain, A = e.ent, D = e.data;
    const end = (think = 1.5) => {
      B.mode = 'idle';
      B.think = think;
      B.posed = false;
      B.moment = undefined;
      B.target = undefined;
      A.inPlace = false;
    };
    switch (B.mode) {
      case 'spin': {
        if (B.t <= 0) {
          end();
          A.play('idle');
          return true;
        }
        A.inPlace = true;
        B.spinStep = (B.spinStep ?? 0) - dt;
        if (B.spinStep <= 0) {
          B.spinStep = 0.14;
          A.m.dir = (A.m.dir + 1) % 4;
          A.play('trot');
        }
        return true;
      }
      case 'trick':
        if (B.t <= 0) end(2);
        return true;
      case 'point': {
        if (B.t <= 0 || !B.point) {
          end(2);
          return true;
        }
        if (A.m.moving) return true;
        if (!B.posed) {
          B.posed = true;
          this.faceTo(e, B.point[0] * TILE + 8, B.point[1] * TILE + 8);
          A.play('sit');
        }
        if (B.think <= 0) {
          // de vez en cuando te mira y vuelve a mirar el tesoro
          B.think = 3 + Math.random() * 2;
          A.react('alert', 1.1);
          if (species(D) === 'dog' && Math.random() < 0.5) sfx.bark(A.look.shape.legH, 1);
          else if (Math.random() < 0.5) sfx.meow(A.look.shape.legH);
        }
        return true;
      }
      case 'box':
        if (B.t <= 0 || pd < 1.2) {
          if (this.box?.e === e) this.box = null;
          A.sink = 0;
          end(2);
          if (pd < 1.2) A.play('stretch');
        }
        return true;
      case 'pounce':
        if (!B.posed && B.t < 1.1) {
          B.posed = true;
          const a = A.m.dir * (Math.PI / 2) + (Math.random() - 0.5);
          this.go(e, A.m.x / TILE - 0.5 + Math.cos(a) * 2, A.m.y / TILE - 0.5 + Math.sin(a) * 2, sp.run);
        }
        if (B.t <= 0 && !A.m.moving) {
          end(2);
          A.play(Math.random() < 0.5 ? 'sit' : 'lick');
        }
        return true;
      case 'ask': {
        const R = this.request;
        if (!R || R.id !== D.id || w.now > R.until) {
          if (R && R.id === D.id) this.clearRequest();
          else end();
          return true;
        }
        if (A.m.moving) return true;
        if (pd > 1.9) this.go(e, w.player.x / TILE - 0.5 + 0.8, w.player.y / TILE - 0.5 + 0.8, pd > 4 ? sp.trot : sp.walk);
        else if (B.think <= 0) {
          B.think = 2.5;
          this.faceTo(e, w.player.x, w.player.y);
          A.play(species(D) === 'dog' && R.kind === 'jugar' ? 'wag' : 'sit');
          if (species(D) === 'cat' && Math.random() < 0.5) sfx.meow(A.look.shape.legH);
        }
        return true;
      }
      case 'routine': {
        const rt = this.routineOf(D);
        if (!rt || !inRoutine(rt, w.hour) || B.t <= 0) {
          end(2);
          return true;
        }
        if (A.m.moving) return true;
        const there = tdist(A.m.x, A.m.y, rt.tile[0] * TILE + 8, rt.tile[1] * TILE + 8) < 1.6;
        if (!there) {
          if (!this.go(e, rt.tile[0], rt.tile[1], sp.walk)) end(3);
          return true;
        }
        if (rt.kind === 'ronda' && B.think <= 0) {
          // ronda: da vueltecitas alrededor de su sitio
          B.think = 4;
          this.go(e, rt.tile[0] + Math.round((Math.random() - 0.5) * 3), rt.tile[1] + Math.round((Math.random() - 0.5) * 3), sp.walk);
          return true;
        }
        if (!B.posed) {
          B.posed = true;
          A.play(rt.kind === 'siesta' ? 'sleep' : rt.kind === 'sol' ? 'lie' : 'sit');
          if (rt.kind === 'siesta') A.react('sleep', 3);
          if (rt.kind === 'sol' && species(D) === 'cat' && !w.raining && w.hour > 9 && w.hour < 19) {
            B.moment = 'sol';
            this.ev.moment?.('sol', e);
          }
        }
        return true;
      }
      case 'social': {
        const F = B.target;
        if (!F || !this.entries.includes(F) || B.t <= 0) {
          end(3);
          return true;
        }
        if (A.m.moving) return true;
        const fd = tdist(A.m.x, A.m.y, F.ent.m.x, F.ent.m.y);
        if (fd > 1.7) {
          if (F.ent.m.moving || !this.go(e, F.ent.m.x / TILE + 0.3, F.ent.m.y / TILE + 0.3, sp.walk)) end(3);
          return true;
        }
        if (!B.posed) {
          B.posed = true;
          this.faceTo(e, F.ent.m.x, F.ent.m.y);
          // el amigo se une (si no está a otra cosa)
          const joins = !this.busy(F) || F.brain.mode === 'social';
          if (joins && F.brain.mode !== 'social') {
            F.brain.mode = 'social';
            F.brain.target = e;
            F.brain.social = B.social;
            F.brain.t = B.t;
            F.brain.posed = true;
            this.faceTo(F, A.m.x, A.m.y);
          }
          if (B.social === 'siesta') {
            A.play('sleep');
            A.react('sleep', 3);
            if (joins) F.ent.play('sleep');
            B.moment = 'siesta';
            this.ev.moment?.('siesta', e);
          } else if (B.social === 'acicalar') {
            A.play('lick');
            if (joins) F.ent.play('sit');
            B.moment = 'acicalar';
            this.ev.moment?.('acicalar', e);
          } else {
            this.spin(e, 2.2);
            if (joins) this.spin(F, 2.2);
            A.react('heart', 1.5);
          }
        }
        return true;
      }
    }
    return false;
  }

  private faceTo(e: Entry, x: number, y: number): void {
    e.ent.m.dir = dirFromDelta(x - e.ent.m.x, y - e.ent.m.y, e.ent.m.dir);
  }

  private think(e: Entry, dt: number, w: WorldCtx): void {
    const B = e.brain, A = e.ent, D = e.data;
    const sp = this.speeds(e);
    B.t -= dt;
    B.think -= dt;
    const pd = tdist(A.m.x, A.m.y, w.player.x, w.player.y);
    const st = stage(D);
    const comfort = comfortDistance(D);

    // --- comiendo / bebiendo
    if (B.mode === 'eat') {
      if (B.bowl) B.bowl.progress = Math.max(0, Math.min(1, 1 - B.t / B.bowl.dur));
      if (B.slide) {
        const k = Math.min(1, dt * 6);
        A.m.x += (B.slide[0] - A.m.x) * k;
        A.m.y += (B.slide[1] - A.m.y) * k;
      }
      if (B.t <= 0 && B.bowl) {
        const bowl = B.bowl;
        const act: Action = bowl.kind === 'food' ? 'feed' : 'water';
        const res = apply(D, act, w.now, bowl.food);
        bowl.state = 'empty';
        B.bowl = null;
        B.mode = 'idle';
        B.think = 1.5;
        A.react('heart', 2.2);
        sfx.heart();
        A.play(species(D) === 'dog' ? 'wag' : 'lick');
        this.ev.care(e, act, res);
      }
      return;
    }
    if (B.mode === 'care' && B.t > 0) return;
    // comedero/bebedero colocado: comen solos cuando tienen hambre o sed (sin prisas)
    if (B.mode === 'feeder') {
      if (!A.m.moving && B.t > 0) return;
      if (!A.m.moving && B.t <= 0) {
        // gasta una ración del comedero (o bebedero) más cercano de ese tipo
        const near = this.feeders.filter((x) => x.id === B.feederId).sort((a, b) => tdist(A.m.x, A.m.y, a.x, a.y) - tdist(A.m.x, A.m.y, b.x, b.y))[0];
        if (near?.ref) serve(near.ref, D);
        else if (near) serve({ id: near.id, zone: D.zone }, D);
        B.mode = 'idle';
        B.think = 2;
        return;
      }
      return;
    }
    if (B.think <= 0 && !A.m.moving && this.awake(e, w.hour)) {
      const need: string | null = D.hunger < 0.45 ? 'comedero' : D.thirst < 0.45 ? 'bebedero' : null;
      const f = need ? this.feeders.find((x) => x.id === need && (x.ref?.fill ?? 1) >= 1 / SERVINGS - 1e-6) : null;
      if (f && pd > comfort * 0.6) {
        if (this.go(e, f.x / TILE - 0.5, f.y / TILE - 0.5, sp.walk) || tdist(A.m.x, A.m.y, f.x, f.y) < 1.5) {
          B.mode = 'feeder';
          B.feederId = need!;
          B.t = 3.2;
          this.feederAnim.set(e, need === 'comedero' ? 'eat' : 'drink');
          return;
        }
      }
    }
    // --- cuenco para mí
    const bowl = this.bowls.find((b) => b.forId === D.id && b.state === 'full');
    if (bowl && B.mode !== 'goBowl') {
      // según la confianza, solo se acerca si estás lo bastante lejos
      const need = bowlDistance(D);
      if (tdist(bowl.x, bowl.y, w.player.x, w.player.y) >= need) {
        B.mode = 'goBowl';
        B.bowl = bowl;
        const fast = D.personality === 'gloton' ? sp.trot : hearts(D) <= 1 ? sp.sneak : sp.walk;
        if (!this.go(e, bowl.x / TILE - 0.6, bowl.y / TILE - 0.6, fast)) {
          // ya está al lado
          A.m.stop();
        }
        if (D.personality === 'gloton') A.react('alert', 1.2);
      } else {
        // espera a una distancia prudente, mirando la comida (y de reojo, a ti)
        if (pd < comfort * 0.6 && !A.m.moving) {
          const dx = A.m.x - w.player.x, dy = A.m.y - w.player.y, l = Math.hypot(dx, dy) || 1;
          this.go(e, A.m.x / TILE + (dx / l) * 2.5, A.m.y / TILE + (dy / l) * 2.5, sp.sneak);
          B.mode = 'flee';
          B.t = 2;
          return;
        }
        if (!A.m.moving && (B.mode !== 'watch' || B.think <= 0)) {
          this.faceTo(e, bowl.x, bowl.y);
          A.play('sit');
          B.mode = 'watch';
          B.think = 2;
        }
        if (B.mode !== 'flee') return;
      }
    }
    if (B.mode === 'goBowl' && B.bowl) {
      const d = tdist(A.m.x, A.m.y, B.bowl.x, B.bowl.y);
      if (!A.m.moving || d < 0.75) {
        if (d < 2.1) {
          A.m.stop();
          this.faceTo(e, B.bowl.x, B.bowl.y);
          B.mode = 'eat';
          B.t = B.bowl.kind === 'food' ? 3.6 : 2.6;
          B.bowl.dur = B.t;
          // la boca sobre la comida: el cuerpo queda medio cuerpo por detrás del cuenco
          {
            const dx = B.bowl.x - A.m.x, dy = B.bowl.y - A.m.y, l = Math.hypot(dx, dy) || 1;
            const back = A.look.shape.bodyLen * 0.5 + 2;
            const tx = B.bowl.x - (dx / l) * back, ty = B.bowl.y - (dy / l) * back;
            B.slide = walkable(this.grid, Math.floor(tx / TILE), Math.floor(ty / TILE)) ? [tx, ty] : undefined;
          }
          B.bowl.fromLeft = A.m.x - A.m.y < B.bowl.x - B.bowl.y;
          B.bowl.state = 'eating';
          A.play(B.bowl.kind === 'food' ? 'eat' : 'drink');
          if (B.bowl.kind === 'water') sfx.lap();
        } else {
          B.mode = 'idle';
        }
      }
      return;
    }

    // --- vida propia: modos en curso
    if (this.lifeModes(e, dt, w, pd, sp)) return;

    // --- miedo: si te acercas demasiado (salvo que vengas a cuidarlo y ya confíe un poco)
    // si vienes a cuidarlo con calma, aguanta un poco más antes de apartarse
    const approachingMe = w.approaching === D.id;
    const fear = approachingMe ? (hearts(D) >= 2 ? 0 : 0.5) : 0.85;
    if (st !== 'tranquilo' && st !== 'te-sigue' && pd < comfort * fear && B.mode !== 'flee' && B.mode !== 'sleep') {
      const dx = A.m.x - w.player.x, dy = A.m.y - w.player.y;
      const l = Math.hypot(dx, dy) || 1;
      const k = st === 'huye' ? 6 : 3.5;
      const tx = A.m.x / TILE + (dx / l) * k, ty = A.m.y / TILE + (dy / l) * k;
      if (this.go(e, tx, ty, st === 'huye' ? sp.run : sp.sneak)) {
        B.mode = 'flee';
        B.t = 3;
        if (st === 'huye') A.react('alert', 0.9);
      }
      return;
    }
    if (B.mode === 'flee') {
      if (!A.m.moving) {
        // se queda mirando desde lejos
        this.faceTo(e, w.player.x, w.player.y);
        A.play(st === 'huye' ? 'idle' : 'sit');
        B.mode = 'watch';
        B.think = 2 + Math.random() * 3;
      }
      return;
    }
    // --- seguir al jugador (confianza alta)
    if (B.mode === 'follow') {
      if (B.t <= 0) B.mode = 'idle';
      else if (pd > 2.2 && (!A.m.moving || B.think <= 0)) {
        B.think = 1.2;
        const a = Math.random() * Math.PI * 2;
        this.go(e, w.player.x / TILE + Math.cos(a) * 1.2, w.player.y / TILE + Math.sin(a) * 1.2, pd > 4 ? sp.trot : sp.walk);
      } else if (!A.m.moving && pd <= 2.2 && A.state !== 'sit' && A.state !== 'sitDown') {
        this.faceTo(e, w.player.x, w.player.y);
        A.play(w.player.moving ? 'idle' : 'sit');
      }
      return;
    }
    // --- travesura: robar un calcetín
    if (B.mode === 'sock') {
      if (!A.m.moving) {
        if (pd < 1.6) {
          A.react('note', 1.8);
          this.ev.sock(e);
          const dx = A.m.x - w.player.x, dy = A.m.y - w.player.y, l = Math.hypot(dx, dy) || 1;
          this.go(e, A.m.x / TILE + (dx / l) * 6, A.m.y / TILE + (dy / l) * 6, sp.run);
          B.mode = 'flee';
          B.t = 3;
        } else B.mode = 'idle';
      }
      return;
    }
    // perros con trucos aprendidos: te los hacen al saludarte
    if (D.tricks?.length && hearts(D) >= 3 && pd < 2.3 && !w.player.moving && (B.trickCD ?? 0) <= 0 && !A.m.moving && B.mode !== 'sleep' && B.mode !== 'rest') {
      B.trickCD = 75 + Math.random() * 60;
      this.faceTo(e, w.player.x, w.player.y);
      const t = D.tricks[Math.floor(Math.random() * D.tricks.length)];
      if (t === 'girar') this.spin(e, 1.2);
      else {
        A.play(t === 'tumbarse' ? 'lie' : 'sit');
        if (t === 'pata') A.react('heart', 1.6);
        B.mode = 'trick';
        B.t = 2.4;
      }
      return;
    }
    // perros por la calle con lluvia: se embarran (luego se les puede bañar)
    if (w.raining && A.m.moving && species(D) === 'dog' && B.mode !== 'shelter' && !D.muddy && Math.random() < dt * 0.04) D.muddy = true;
    if (B.think > 0 || A.m.moving) return;
    B.think = 2.5 + Math.random() * 4;

    // --- horario: dormir en casa fuera de su horario
    if (!this.awake(e, w.hour)) {
      const [hx, hy] = D.home;
      if (tdist(A.m.x, A.m.y, hx * TILE + 8, hy * TILE + 8) > 1.2) this.go(e, hx, hy, sp.walk);
      else if (A.state !== 'sleep') {
        A.play('sleep');
        A.react('sleep', 4);
      }
      B.mode = 'sleep';
      B.think = 6;
      return;
    }
    if (B.mode === 'sleep') {
      // se despierta estirándose
      B.mode = 'idle';
      A.play('stretch');
      return;
    }
    // --- lluvia: a cubierto
    if (w.raining && w.shelters.length) {
      let best: [number, number] | null = null, bd = Infinity;
      for (const s of w.shelters) {
        for (let k = 0; k < 6; k++) {
          const tx = Math.floor(s[0] + Math.random() * (s[2] - s[0])), ty = Math.floor(s[1] + Math.random() * (s[3] - s[1]));
          if (!walkable(this.grid, tx, ty)) continue;
          const d = tdist(A.m.x, A.m.y, tx * TILE + 8, ty * TILE + 8);
          if (d < bd) {
            bd = d;
            best = [tx, ty];
          }
        }
      }
      if (best && bd > 0.8) {
        this.go(e, best[0], best[1], sp.trot);
        B.mode = 'shelter';
        return;
      }
      if (best) {
        A.play(Math.random() < 0.5 ? 'sit' : 'lie');
        B.mode = 'shelter';
        B.think = 8;
        return;
      }
    }
    // --- confianza alta: a veces te sigue
    if (st === 'te-sigue' && pd < 7 && Math.random() < 0.35) {
      B.mode = 'follow';
      B.t = 20 + Math.random() * 25;
      A.react('heart', 1.2);
      return;
    }
    if (D.personality === 'travieso' && hearts(D) >= 2 && pd < 6 && Math.random() < 0.05) {
      B.mode = 'sock';
      this.go(e, w.player.x / TILE, w.player.y / TILE, sp.trot);
      return;
    }
    // --- crías: no se separan mucho de su madre
    if (D.mother) {
      const M = this.entries.find((x) => x.data.id === D.mother);
      if (M && tdist(A.m.x, A.m.y, M.ent.m.x, M.ent.m.y) > 1.8 && Math.random() < 0.8) {
        this.go(e, M.ent.m.x / TILE - 0.5 + (Math.random() - 0.5) * 1.5, M.ent.m.y / TILE - 0.5 + (Math.random() - 0.5) * 1.5, sp.trot);
        B.mode = 'walk';
        return;
      }
    }
    // --- su costumbre (sitio y hora favoritos)
    const rt = this.routineOf(D);
    if (rt && inRoutine(rt, w.hour) && Math.random() < 0.75) {
      B.mode = 'routine';
      B.t = 30 + Math.random() * 30;
      B.posed = false;
      if (tdist(A.m.x, A.m.y, rt.tile[0] * TILE + 8, rt.tile[1] * TILE + 8) > 1.2) this.go(e, rt.tile[0], rt.tile[1], sp.walk);
      return;
    }
    // --- amigos: siesta juntos, acicalarse o jugar
    if (Math.random() < 0.3) {
      const F = this.entries.find((x) => x !== e && !this.busy(x) && x.brain.mode !== 'sleep' && this.awake(x, w.hour) && affinity(D, x.data) >= FRIENDS);
      if (F) {
        const cats = species(D) === 'cat' && species(F.data) === 'cat';
        B.mode = 'social';
        B.target = F;
        B.posed = false;
        B.social = cats ? (Math.random() < 0.5 ? 'acicalar' : 'siesta') : Math.random() < 0.5 ? 'jugar' : 'siesta';
        B.t = 25 + Math.random() * 20;
        this.go(e, F.ent.m.x / TILE + 0.3, F.ent.m.y / TILE + 0.3, sp.walk);
        return;
      }
    }
    // --- momentos raros
    const cat = species(D) === 'cat', day = w.hour > 8 && w.hour < 20;
    if (w.snow > 0.3 && Math.random() < 0.08) {
      this.ev.moment?.('nieve', e);
      this.go(e, A.m.tx + Math.round((Math.random() - 0.5) * 6), A.m.ty + Math.round((Math.random() - 0.5) * 6), sp.trot);
      B.mode = 'walk';
      return;
    }
    if (!cat && Math.random() < (w.raining ? 0.12 : 0.03)) {
      this.spin(e, 2.6, w.raining ? 'charco' : 'cola');
      return;
    }
    if (cat && ((Math.abs(w.wind) > 0.5 && w.season === 'otoño' && Math.random() < 0.15) || (day && !w.raining && (w.season === 'primavera' || w.season === 'verano') && Math.random() < 0.08))) {
      B.mode = 'pounce';
      B.t = 2.2;
      B.posed = false;
      B.moment = Math.abs(w.wind) > 0.5 && w.season === 'otoño' ? 'hojas' : 'mariposa';
      A.play('idle');
      A.react('alert', 0.9);
      this.ev.moment?.(B.moment, e);
      return;
    }
    if (cat && !w.raining && !this.box && Math.random() < 0.025 * (w.mods?.boxMul ?? 1)) {
      A.m.stop();
      this.box = { x: A.m.x, y: A.m.y, z: A.m.z, e };
      A.play('sit');
      A.sink = 7;
      B.mode = 'box';
      B.t = 22 + Math.random() * 10;
      B.moment = 'caja';
      this.ev.moment?.('caja', e);
      return;
    }
    // --- vida normal
    const r = Math.random();
    const restW = Math.min(0.8, (D.personality === 'dormilon' ? 0.55 : 0.3) * (w.mods?.restMul ?? 1));
    if (r < restW) {
      if (D.personality === 'dormilon' && tdist(A.m.x, A.m.y, D.home[0] * TILE + 8, D.home[1] * TILE + 8) > 1.2) {
        this.go(e, D.home[0], D.home[1], sp.walk);
        B.mode = 'walk';
        return;
      }
      const opts = D.personality === 'dormilon' ? ['sleep', 'sleep', 'lie', 'sit'] as const : ['sit', 'lie', 'sit', 'sleep'] as const;
      const c = opts[Math.floor(Math.random() * opts.length)];
      A.play(c);
      if (c === 'sleep') A.react('sleep', 3);
      B.mode = c === 'sleep' ? 'rest' : 'rest';
      B.think = 6 + Math.random() * 8;
    } else if (r < 0.62) {
      const tx = A.m.tx + Math.round((Math.random() - 0.5) * 8), ty = A.m.ty + Math.round((Math.random() - 0.5) * 8);
      this.go(e, tx, ty, Math.random() < 0.2 ? sp.trot : sp.walk);
      B.mode = 'walk';
    } else if (r < 0.8) {
      const g = species(D) === 'cat' ? (['lick', 'scratch', 'stretch'] as const) : (['scratch', 'stretch', 'wag'] as const);
      A.play(g[Math.floor(Math.random() * g.length)]);
      B.mode = 'idle';
    } else {
      if (st !== 'huye' && pd < 6) this.faceTo(e, w.player.x, w.player.y);
      A.play('idle');
      B.mode = 'idle';
    }
  }
}
