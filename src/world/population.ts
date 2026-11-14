// Comportamiento de los animales: horarios, confianza, comida, lluvia, seguir, travesuras.
import { TILE, type Box } from '../engine/iso.ts';
import { findPath, nearestWalkable, walkable, type Grid } from './path.ts';
import { Animal, dirFromDelta, type Drawable } from './entities.ts';
import { makeLook } from '../sprites/breeds.ts';
import { warmAnimal } from '../sprites/workerClient.ts';
import { apply, comfortDistance, hearts, species, stage, type Action, type ActionResult, type AnimalData, type FoodId } from '../sim/model.ts';
import { matrix } from '../fx/sprites.ts';
import * as sfx from '../audio/sfx.ts';

export type Mode = 'idle' | 'walk' | 'rest' | 'flee' | 'watch' | 'goBowl' | 'eat' | 'follow' | 'shelter' | 'sleep' | 'sock' | 'wait' | 'care' | 'feeder';

export interface Brain {
  feederId?: string;
  mode: Mode;
  t: number; // tiempo restante en el modo
  think: number;
  bowl: Bowl | null;
  bandage: number;
  purr: number;
}

export interface Entry {
  data: AnimalData;
  ent: Animal;
  brain: Brain;
}

const BOWL_ROWS = ['..kkkkkk..', '.kfffffFk.', 'kRRRRRRRRk', 'krRRRRRRrk', '.kkkkkkkk.'];
export class Bowl implements Drawable {
  box: Box;
  rect: [number, number, number, number];
  state: 'full' | 'eating' | 'empty' = 'full';
  fade = 1;
  constructor(public x: number, public y: number, public z: number, public kind: 'food' | 'water', public food: FoodId, public forId: string) {
    this.box = [x - 4, y - 4, z, x + 4, y + 4, z + 4];
    const sx = 2 * (x - y), sy = x + y - z;
    this.rect = [sx - 5, sy - 5, 10, 6];
  }
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const sx = Math.round(2 * (this.x - this.y) - camX), sy = Math.round(this.x + this.y - this.z - camY);
    const full = this.state !== 'empty';
    const key = this.kind === 'food'
      ? { '.': null, k: 'ink2' as const, R: 'coral' as const, r: 'rose' as const, f: full ? ('wood3' as const) : ('cal1' as const), F: full ? ('wood2' as const) : ('cal1' as const) }
      : { '.': null, k: 'ink2' as const, R: 'sky' as const, r: 'water2' as const, f: full ? ('water4' as const) : ('cal1' as const), F: full ? ('water3' as const) : ('cal1' as const) };
    const img = matrix(`bowl-${this.kind}-${full}`, BOWL_ROWS, key);
    ctx.globalAlpha = this.fade;
    ctx.drawImage(img, sx - 5, sy - 4);
    ctx.globalAlpha = 1;
  }
}

export interface WorldCtx {
  grid: Grid;
  hour: number;
  raining: boolean;
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
}

const tdist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) / TILE;

export class Population {
  entries: Entry[] = [];
  bowls: Bowl[] = [];
  /** comederos, bebederos, mantas y casetas colocados */
  feeders: { id: string; x: number; y: number }[] = [];

  constructor(private grid: Grid, private ev: PopulationEvents) {}

  add(data: AnimalData, tx?: number, ty?: number): Entry {
    const look = makeLook(data.breed, data.variant, data.seed, data.rare);
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
    const t = nearestWalkable(this.grid, Math.round(tx), Math.round(ty));
    if (!t) return false;
    const blocked = (x: number, y: number) => this.entries.some((o) => o !== e && !o.ent.m.moving && o.ent.m.tx === x && o.ent.m.ty === y);
    const path = findPath(this.grid, e.ent.m.tx, e.ent.m.ty, t[0], t[1], blocked);
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
    const b = new Bowl(x, y, z, kind, food, forId);
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
      if (b.state === 'empty') b.fade -= dt * 0.35;
    }
    this.bowls = this.bowls.filter((b) => b.fade > 0);
    for (const e of this.entries) {
      this.think(e, dt, w);
      e.ent.update(dt, this.grid);
      if (e.brain.bandage > 0) e.brain.bandage -= dt;
      if (e.brain.purr > 0) e.brain.purr -= dt;
    }
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
        const f = B.feederId === 'bebedero';
        if (f) D.thirst = Math.min(1, D.thirst + 0.4);
        else D.hunger = Math.min(1, D.hunger + 0.4);
        D.wellbeing = Math.min(1, D.wellbeing + 0.05);
        B.mode = 'idle';
        B.think = 2;
        return;
      }
      return;
    }
    if (B.think <= 0 && !A.m.moving && this.awake(e, w.hour)) {
      const need: string | null = D.hunger < 0.45 ? 'comedero' : D.thirst < 0.45 ? 'bebedero' : null;
      const f = need ? this.feeders.find((x) => x.id === need) : null;
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
      const need = [5, 4, 2.6, 0, 0][Math.min(4, hearts(D))] * (D.personality === 'timido' ? 1.15 : 1) * (D.personality === 'gloton' ? 0.75 : 1);
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
          B.bowl.state = 'eating';
          A.play(B.bowl.kind === 'food' ? 'eat' : 'drink');
          if (B.bowl.kind === 'water') sfx.lap();
        } else {
          B.mode = 'idle';
        }
      }
      return;
    }

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
    // --- vida normal
    const r = Math.random();
    const restW = D.personality === 'dormilon' ? 0.55 : 0.3;
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
