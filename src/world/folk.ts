// Gente del barrio sin nombre que da vida a ciertas horas: la cola de la panadería por la
// mañana y la tertulia a la puerta del bar del puerto por la noche.
import { Player, dirFromDelta } from './entities.ts';
import { findPath, nearestWalkable, type Grid } from './path.ts';
import { DEFAULT_OUTFIT, type Outfit } from '../sprites/player.ts';
import type { ZoneId } from './zones.ts';

export interface FolkScene {
  kind: 'cola' | 'bar';
  /** sitios donde esperan (en la cola, el 0 es el primero) */
  spots: [number, number][];
  /** puerta por la que entran (cola) o hacia la que miran (bar) */
  door: [number, number];
  max: number;
}

/** Qué escena hay en una zona a una hora (o ninguna). */
export function folkScene(zone: ZoneId, hour: number): FolkScene | null {
  if (zone === 'plaza' && hour >= 7.5 && hour < 10.5) return { kind: 'cola', spots: [[9, 4], [9, 5], [9, 6], [10, 7]], door: [9, 3], max: 4 };
  if (zone === 'puerto' && (hour >= 20 || hour < 1)) return { kind: 'bar', spots: [[7, 4], [9, 4], [8, 5]], door: [8, 3], max: 3 };
  return null;
}

const O = DEFAULT_OUTFIT;
/** pocos trajes fijos: así sus sprites se cachean */
export const FOLK_OUTFITS: Outfit[] = [
  { ...O, skin: 'skinWarm', hair: 'rizos', hairColor: 'grey', top: 'rebeca', topColor: 'violet', bottom: 'falda', bottomColor: 'black', acc: 'ninguno', bag: 'ninguna', umbrella: 'violet' },
  { ...O, skin: 'skinDeep', hair: 'corto', hairColor: 'black', top: 'jersey', topColor: 'blueGrey', bottom: 'pantalon', bottomColor: 'woodDark', acc: 'bufanda', accColor: 'yellow', bag: 'ninguna', umbrella: 'blue' },
  { ...O, skin: 'skin', hair: 'largo', hairColor: 'orange', top: 'camiseta', topColor: 'red', bottom: 'pantalon', bottomColor: 'blue', acc: 'ninguno', bag: 'mochila', bagColor: 'yellow', umbrella: 'yellow' },
  { ...O, skin: 'skinTan', hair: 'rapado', hairColor: 'grey', top: 'chubasquero', topColor: 'blue', bottom: 'pantalon', bottomColor: 'grey', hat: 'boina', hatColor: 'woodDark', acc: 'ninguno', bag: 'ninguna', umbrella: 'black' },
];

interface Folk {
  ent: Player;
  /** índice de sitio (−1 si va o se marcha) */
  spot: number;
  state: 'come' | 'wait' | 'enter' | 'leave';
  t: number;
}

export class Townsfolk {
  folk: Folk[] = [];
  private spawnT = 0;
  private outfitN = Math.floor(Math.random() * FOLK_OUTFITS.length);

  get ents(): Player[] {
    return this.folk.map((f) => f.ent);
  }

  reset(): void {
    this.folk = [];
    this.spawnT = 0;
  }

  private make(g: Grid, at: [number, number]): Player | null {
    const s = nearestWalkable(g, at[0], at[1]);
    if (!s) return null;
    const ent = new Player(s[0], s[1], g, FOLK_OUTFITS[this.outfitN++ % FOLK_OUTFITS.length]);
    ent.m.speed = 40;
    ent.hurry = false;
    return ent;
  }

  private walk(g: Grid, f: Folk, to: [number, number]): void {
    const t = nearestWalkable(g, to[0], to[1]);
    const p = t && findPath(g, f.ent.m.tx, f.ent.m.ty, t[0], t[1]);
    if (p && p.length) f.ent.m.setPath(p);
  }

  /** Al entrar en la zona: la escena ya está montada (sin verlos llegar). */
  populate(g: Grid, sc: FolkScene | null): void {
    this.reset();
    if (!sc) return;
    const n = sc.kind === 'cola' ? 3 : 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ent = this.make(g, sc.spots[i]);
      if (!ent) continue;
      this.folk.push({ ent, spot: i, state: 'wait', t: sc.kind === 'cola' ? 5 + Math.random() * 8 : 40 + Math.random() * 90 });
    }
    this.face(sc);
    this.spawnT = 8 + Math.random() * 10;
  }

  private face(sc: FolkScene): void {
    const here = this.folk.filter((f) => f.state === 'wait' && !f.ent.m.moving);
    for (const f of here) {
      const m = f.ent.m;
      if (sc.kind === 'cola') m.dir = dirFromDelta(sc.door[0] + 0.5 - m.x / 16, sc.door[1] + 0.5 - m.y / 16, m.dir);
      else {
        // en corrillo: hacia el centro del grupo
        let cx = 0, cy = 0;
        for (const o of here) { cx += o.ent.m.x; cy += o.ent.m.y; }
        cx /= here.length; cy /= here.length;
        if (here.length > 1) m.dir = dirFromDelta(cx - m.x, cy - m.y, m.dir);
        else m.dir = dirFromDelta(sc.door[0] + 0.5 - m.x / 16, sc.door[1] + 0.5 - m.y / 16, m.dir);
      }
    }
  }

  update(dt: number, g: Grid, sc: FolkScene | null, entry: [number, number], rain: boolean): void {
    for (const f of this.folk) f.ent.update(dt, g, rain);
    // fin de la escena: todos se van
    if (!sc) {
      for (const f of this.folk) if (f.state !== 'leave' && f.state !== 'enter') {
        f.state = 'leave';
        f.spot = -1;
        this.walk(g, f, entry);
      }
    } else {
      this.spawnT -= dt;
      const taken = new Set(this.folk.filter((f) => f.spot >= 0).map((f) => f.spot));
      if (this.spawnT <= 0 && taken.size < sc.max) {
        this.spawnT = sc.kind === 'cola' ? 9 + Math.random() * 9 : 30 + Math.random() * 40;
        // en la cola, al final; en el bar, el primer hueco
        const spot = sc.kind === 'cola' ? taken.size : sc.spots.findIndex((_, i) => !taken.has(i));
        const ent = spot >= 0 ? this.make(g, entry) : null;
        if (ent) {
          const f: Folk = { ent, spot, state: 'come', t: 0 };
          this.folk.push(f);
          this.walk(g, f, sc.spots[spot]);
        }
      }
      for (const f of this.folk) {
        if (f.state === 'come' && !f.ent.m.moving) {
          f.state = 'wait';
          f.t = sc.kind === 'cola' ? 11 + Math.random() * 8 : 50 + Math.random() * 90;
          this.face(sc);
        }
        if (f.state !== 'wait') continue;
        f.t -= dt;
        if (sc.kind === 'cola' && f.spot === 0 && f.t <= 0 && !f.ent.m.moving) {
          // le toca: entra en la panadería y los demás avanzan un puesto
          f.state = 'enter';
          f.spot = -1;
          this.walk(g, f, sc.door);
          for (const o of this.folk) if (o.spot > 0) {
            o.spot--;
            o.state = 'come';
            this.walk(g, o, sc.spots[o.spot]);
          }
        } else if (sc.kind === 'bar' && f.t <= 0) {
          f.state = 'leave';
          f.spot = -1;
          this.walk(g, f, entry);
        }
      }
    }
    // los que entran por la puerta se desvanecen; los que se van desaparecen al llegar
    for (const f of this.folk) {
      if (f.state === 'enter' && !f.ent.m.moving) f.ent.alpha -= dt * 2;
      if (f.state === 'leave' && !f.ent.m.moving) f.ent.alpha -= dt * 3;
    }
    this.folk = this.folk.filter((f) => f.ent.alpha > 0);
  }
}
