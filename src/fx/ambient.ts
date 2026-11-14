// Vida ambiental: hojas, mariposas, luciérnagas, palomas, humo, vapor, ropa tendida, fuente,
// sombras de nubes, lluvia, salpicaduras, charcos y niebla. Todo con pools y en píxeles enteros.
import { PALETTE } from '../gfx/palette.ts';
import type { ZoneMeta } from '../engine/assets.ts';
import { drawEllipse, ring, pixelEllipse } from './pixel.ts';
import { leaf, butterfly, pigeon, cloth } from './sprites.ts';
import type { Drawable } from '../world/entities.ts';
import type { Box } from '../engine/iso.ts';

const S = (x: number, y: number, z: number): [number, number] => [2 * (x - y), x + y - z];

interface P {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  k: number; // variante
  gy: number; // altura de suelo (pantalla) para aterrizar
}

class Pool {
  items: P[] = [];
  constructor(n: number) {
    for (let i = 0; i < n; i++) this.items.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, k: 0, gy: 0 });
  }
  spawn(): P | null {
    for (const p of this.items) if (!p.on) {
      p.on = true;
      p.t = 0;
      return p;
    }
    return null;
  }
}

export interface Weather {
  rain: number; // 0..1
  fog: number;
  snow: number;
  overcast: number;
  wind: number; // −1..1
}

class Pigeon implements Drawable {
  x: number;
  y: number;
  z: number;
  state: 'walk' | 'peck' | 'idle' | 'fly' | 'gone' = 'idle';
  t = 0;
  flip = false;
  fx = 0;
  fy = 0;
  box: Box = [0, 0, 0, 0, 0, 0];
  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.state === 'gone') return;
    const [sx, sy] = S(this.x, this.y, this.z);
    const fr = this.state === 'fly' ? (Math.floor(this.t * 10) % 2 ? 'fly1' : 'fly2') : this.state === 'peck' && Math.floor(this.t * 3) % 2 ? 'peck' : 'idle';
    const img = pigeon(fr, this.flip);
    const X = Math.round(sx + this.fx - camX - img.width / 2), Y = Math.round(sy + this.fy - camY - img.height);
    if (this.state !== 'fly') {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(pixelEllipse(4, 1, PALETTE.stone0), Math.round(sx - camX - 4), Math.round(sy - camY - 1));
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, X, Y);
  }
}

export class Ambient {
  leaves = new Pool(40);
  flies = new Pool(10);
  bugs = new Pool(24);
  smoke = new Pool(70);
  steam = new Pool(30);
  drops = new Pool(260);
  splash = new Pool(80);
  ripples = new Pool(40);
  spray = new Pool(90);
  pigeons: Pigeon[] = [];
  clouds: { x: number; y: number; r: number; v: number }[] = [];
  puddles: { x: number; y: number; r: number; s: number }[] = [];
  private t = 0;
  private bounds: [number, number, number, number];
  private trees: [number, number][] = [];

  constructor(private meta: ZoneMeta, bounds: [number, number, number, number]) {
    this.bounds = bounds;
    for (const o of meta.objects) if (o.kind === 'arbol') {
      const b = o.box;
      this.trees.push(S((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[5] - 20));
    }
    // palomas en la plaza
    const seedPts = [[150, 200], [210, 150], [230, 210], [170, 140], [120, 180]];
    for (const [x, y] of seedPts.slice(0, 4)) this.pigeons.push(new Pigeon(x + Math.random() * 10, y + Math.random() * 10, 40));
    // nubes
    for (let i = 0; i < 3; i++) this.clouds.push({ x: bounds[0] + Math.random() * (bounds[2] - bounds[0]), y: bounds[1] + Math.random() * (bounds[3] - bounds[1]), r: 70 + Math.random() * 50, v: 5 + Math.random() * 3 });
    // charcos en zonas planas transitables (determinista)
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400 && this.puddles.length < 14; i++) {
      const tx = 4 + Math.floor(rnd() * 15), ty = 4 + Math.floor(rnd() * 15);
      const idx = ty * meta.tilesW + tx;
      if (!meta.walk[idx] || meta.height[idx] !== 40) continue;
      const x = tx * 16 + 4 + rnd() * 8, y = ty * 16 + 4 + rnd() * 8;
      this.puddles.push({ x, y, r: 6 + rnd() * 9, s: rnd() });
    }
  }

  get drawables(): Drawable[] {
    return this.pigeons.filter((p) => p.state !== 'gone');
  }

  update(dt: number, hour: number, w: Weather, playerXY: [number, number], season: 'otoño' | 'invierno' | 'primavera' | 'verano'): void {
    this.t += dt;
    const day = hour > 7.5 && hour < 19.5;
    const night = hour < 6.5 || hour > 21;
    // hojas que caen de los árboles
    if (this.trees.length && Math.random() < dt * (season === 'otoño' ? 2.2 : 0.5) * (1 + w.wind)) {
      const [tx, ty] = this.trees[Math.floor(Math.random() * this.trees.length)];
      const p = this.leaves.spawn();
      if (p) {
        p.x = tx + (Math.random() - 0.5) * 70;
        p.y = ty + (Math.random() - 0.5) * 30;
        p.vx = 6 + w.wind * 14;
        p.vy = 10 + Math.random() * 6;
        p.k = Math.floor(Math.random() * 4);
        p.gy = p.y + 50 + Math.random() * 40;
        p.life = 9;
      }
    }
    for (const p of this.leaves.items) if (p.on) {
      p.t += dt;
      if (p.y < p.gy) {
        p.x += (p.vx + Math.sin(p.t * 3 + p.k) * 14) * dt;
        p.y += p.vy * dt;
      }
      if (p.t > p.life) p.on = false;
    }
    // mariposas de día (con buen tiempo), luciérnagas de noche
    if (day && w.rain < 0.1 && season !== 'invierno' && Math.random() < dt * 0.25) {
      const p = this.flies.spawn();
      if (p) {
        p.x = this.bounds[0] + Math.random() * (this.bounds[2] - this.bounds[0]);
        p.y = this.bounds[1] + 200 + Math.random() * 300;
        p.k = Math.floor(Math.random() * 4);
        p.life = 14;
      }
    }
    for (const p of this.flies.items) if (p.on) {
      p.t += dt;
      p.x += Math.sin(p.t * 0.9 + p.k) * 22 * dt + 6 * dt;
      p.y += Math.cos(p.t * 1.3 + p.k * 2) * 16 * dt;
      if (p.t > p.life) p.on = false;
    }
    if (night && w.rain < 0.2 && Math.random() < dt * 1.5) {
      const p = this.bugs.spawn();
      if (p) {
        p.x = this.bounds[0] + 300 + Math.random() * (this.bounds[2] - this.bounds[0] - 600);
        p.y = this.bounds[1] + 300 + Math.random() * 350;
        p.k = Math.random() * 10;
        p.life = 6 + Math.random() * 6;
      }
    }
    for (const p of this.bugs.items) if (p.on) {
      p.t += dt;
      p.x += Math.sin(p.t * 0.7 + p.k) * 8 * dt;
      p.y += Math.cos(p.t * 0.5 + p.k) * 6 * dt - 1.5 * dt;
      if (p.t > p.life) p.on = false;
    }
    // humo de chimeneas
    for (const c of this.meta.smoke) {
      if (Math.random() < dt * (night || hour < 10 ? 3.2 : 1.6)) {
        const p = this.smoke.spawn();
        if (p) {
          [p.x, p.y] = S(c[0], c[1], c[2]);
          p.vx = 3 + w.wind * 10 + Math.random() * 3;
          p.vy = -12 - Math.random() * 5;
          p.life = 3.5 + Math.random() * 1.5;
          p.k = Math.random();
        }
      }
    }
    for (const p of this.smoke.items) if (p.on) {
      p.t += dt;
      p.x += p.vx * dt + Math.sin(p.t * 2 + p.k * 6) * 3 * dt;
      p.y += p.vy * dt;
      p.vy *= 1 - dt * 0.3;
      if (p.t > p.life) p.on = false;
    }
    // vapor de la panadería (sobre todo por la mañana)
    const steamRate = hour > 6 && hour < 12 ? 5 : 1.5;
    for (const c of this.meta.steam) {
      if (Math.random() < dt * steamRate) {
        const p = this.steam.spawn();
        if (p) {
          [p.x, p.y] = S(c[0], c[1], c[2]);
          p.x += (Math.random() - 0.5) * 10;
          p.vx = (Math.random() - 0.5) * 4;
          p.vy = -10 - Math.random() * 6;
          p.life = 1.6 + Math.random();
          p.k = Math.random();
        }
      }
    }
    for (const p of this.steam.items) if (p.on) {
      p.t += dt;
      p.x += p.vx * dt + Math.sin(p.t * 4 + p.k * 6) * 4 * dt;
      p.y += p.vy * dt;
      if (p.t > p.life) p.on = false;
    }
    // fuente: chorros (partículas en parábola) y ondas
    for (const f of this.meta.fountains) {
      for (const sp of f.spouts) {
        if (Math.random() < dt * 22) {
          const p = this.spray.spawn();
          if (p) {
            p.x = sp[0]; p.y = sp[1]; p.gy = sp[2];
            p.vx = sp[3]; p.vy = sp[4];
            p.t = 0; p.life = 0.62 + Math.random() * 0.08;
            p.k = Math.random();
          }
        }
      }
      if (Math.random() < dt * 2.4) {
        const p = this.ripples.spawn();
        if (p) {
          const a = Math.random() * Math.PI * 2;
          const r = 9 + Math.random() * 3;
          [p.x, p.y] = S(f.basin.cx + Math.cos(a) * r, f.basin.cy + Math.sin(a) * r, f.basin.z);
          p.life = 1.4;
          p.k = 0;
        }
      }
    }
    for (const p of this.spray.items) if (p.on) {
      p.t += dt;
      if (p.t > p.life) {
        p.on = false;
        if (Math.random() < 0.08) {
          const r = this.ripples.spawn();
          if (r) {
            const d = 10;
            [r.x, r.y] = S(p.x + p.vx * d, p.y + p.vy * d, 49);
            r.life = 1;
          }
        }
      }
    }
    for (const p of this.ripples.items) if (p.on) {
      p.t += dt;
      if (p.t > p.life) p.on = false;
    }
    // palomas: picotean, caminan y salen volando si te acercas
    for (const pg of this.pigeons) {
      pg.t += dt;
      const [px, py] = playerXY;
      const near = Math.hypot(pg.x - px, pg.y - py) < 26;
      if (pg.state !== 'fly' && pg.state !== 'gone' && near) {
        pg.state = 'fly';
        pg.t = 0;
        pg.flip = pg.x - px < 0 ? false : true;
      }
      if (pg.state === 'fly') {
        pg.fx += (pg.flip ? -1 : 1) * 60 * dt;
        pg.fy -= 50 * dt;
        if (pg.t > 3) {
          pg.state = 'gone';
          pg.t = 0;
        }
      } else if (pg.state === 'gone') {
        if (pg.t > 14 && !near) {
          // vuelven a posarse
          pg.state = 'idle';
          pg.fx = 0;
          pg.fy = 0;
          pg.x = 120 + Math.random() * 140;
          pg.y = 120 + Math.random() * 140;
          pg.t = 0;
        }
      } else {
        if (pg.t > 1.5 + Math.random() * 3) {
          pg.t = 0;
          pg.state = Math.random() < 0.45 ? 'peck' : Math.random() < 0.5 ? 'walk' : 'idle';
          if (pg.state === 'walk') pg.flip = Math.random() < 0.5;
        }
        if (pg.state === 'walk') {
          pg.x += (pg.flip ? -1 : 1) * 4 * dt;
          pg.y += (pg.flip ? 1 : -1) * 4 * dt;
        }
      }
      const z = pg.z;
      pg.box = [pg.x - 2, pg.y - 2, z, pg.x + 2, pg.y + 2, z + 6];
    }
    // nubes
    for (const c of this.clouds) {
      c.x += c.v * dt * (1 + w.wind);
      if (c.x - c.r > this.bounds[2]) c.x = this.bounds[0] - c.r;
    }
    // lluvia
    const nd = Math.floor(w.rain * 320 * dt * 4);
    for (let i = 0; i < nd; i++) {
      const p = this.drops.spawn();
      if (!p) break;
      p.k = Math.random();
      p.life = 0.5 + Math.random() * 0.6;
      p.vx = 40 + w.wind * 50;
      p.vy = 380;
      p.gy = 0;
    }
  }

  /** Charcos, salpicaduras y ondas de la fuente (capa de suelo, antes de los objetos). */
  drawGround(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: Weather, sky: [number, number, number], night = 0): void {
    // sombras de nubes (solo con sol)
    if (w.rain < 0.1 && w.overcast < 0.4) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.07;
      for (const c of this.clouds) {
        const x = c.x - camX, y = c.y - camY;
        drawEllipse(ctx, x, y, c.r * 2, c.r * 0.7, '#5a4e68');
        drawEllipse(ctx, x + c.r * 1.1, y - c.r * 0.25, c.r * 1.3, c.r * 0.5, '#5a4e68');
        drawEllipse(ctx, x - c.r * 0.9, y + c.r * 0.2, c.r * 1.1, c.r * 0.4, '#5a4e68');
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // charcos (aparecen con la lluvia): manchas irregulares que reflejan el cielo
    const wet = Math.max(w.rain, 0);
    if (wet > 0.05) {
      const refl = `rgb(${(sky[0] * 0.62 + 30) | 0},${(sky[1] * 0.66 + 34) | 0},${(sky[2] * 0.72 + 44) | 0})`;
      for (const p of this.puddles) {
        const [sx, sy] = S(p.x, p.y, 40);
        const X = sx - camX, Y = sy - camY;
        if (X < -40 || Y < -20 || X > 2000 || Y > 2000) continue;
        const r = p.r * Math.min(1, wet * 1.5);
        const lobes: [number, number, number][] = [[0, 0, 1], [r * 0.9, r * 0.15 * (p.s - 0.5) * 4, 0.6], [-r * 0.8, r * 0.2, 0.55]];
        ctx.globalAlpha = Math.min(1, wet * 2);
        for (const [dx, dy, k] of lobes) drawEllipse(ctx, X + dx, Y + dy, r * 1.6 * k + 1, r * 0.8 * k + 1, PALETTE.stone1);
        for (const [dx, dy, k] of lobes) drawEllipse(ctx, X + dx, Y + dy - 0.5, r * 1.6 * k, r * 0.8 * k, refl);
        // reflejo del cielo/farola: franja clara
        ctx.fillStyle = night > 0.5 ? PALETTE.lampLight : PALETTE.water4;
        ctx.fillRect(Math.round(X - r * 0.7), Math.round(Y - r * 0.25), Math.max(2, Math.round(r * 0.6)), 1);
        ctx.fillStyle = PALETTE.cal4;
        ctx.fillRect(Math.round(X + r * 0.3), Math.round(Y + r * 0.15), Math.max(1, Math.round(r * 0.25)), 1);
        const ph = (this.t * 1.1 + p.s * 5) % 1;
        if (w.rain > 0.2) ring(ctx, X + (p.s - 0.5) * r, Y, 1 + ph * r * 0.8, PALETTE.water4);
        ctx.globalAlpha = 1;
      }
    }
    // ondas en la fuente
    for (const p of this.ripples.items) if (p.on) {
      const k = p.t / p.life;
      ctx.globalAlpha = 1 - k;
      ring(ctx, p.x - camX, p.y - camY, 1 + k * 7, PALETTE.water4);
    }
    ctx.globalAlpha = 1;
  }

  /** Chorros de la fuente, humo, vapor, hojas, mariposas (encima de la escena). */
  drawAir(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    // chorros: parábola desde el caño
    ctx.fillStyle = PALETTE.water4;
    for (const p of this.spray.items) if (p.on) {
      const t = p.t * 1.6;
      const x = p.x + p.vx * t * 9, y = p.y + p.vy * t * 9;
      const z = p.gy - 26 * t * t * 1.5;
      const [sx, sy] = S(x, y, Math.max(z, 49));
      ctx.fillStyle = p.k < 0.3 ? PALETTE.cal4 : PALETTE.water4;
      ctx.fillRect(Math.round(sx - camX), Math.round(sy - camY), 1, p.k < 0.5 ? 2 : 1);
    }
    for (const p of this.smoke.items) if (p.on) {
      const k = p.t / p.life;
      const r = 1.5 + k * 5;
      ctx.globalAlpha = 0.55 * (1 - k);
      drawEllipse(ctx, p.x - camX, p.y - camY, r, r * 0.8, k < 0.3 ? PALETTE.stone4 : PALETTE.stone3);
    }
    for (const p of this.steam.items) if (p.on) {
      const k = p.t / p.life;
      ctx.globalAlpha = 0.6 * (1 - k);
      drawEllipse(ctx, p.x - camX, p.y - camY, 1 + k * 3, 1 + k * 2, PALETTE.cal4);
    }
    ctx.globalAlpha = 1;
    for (const p of this.leaves.items) if (p.on) {
      const fade = p.t > p.life - 1 ? p.life - p.t : 1;
      ctx.globalAlpha = Math.max(0, fade);
      const img = leaf(p.k + (p.y < p.gy ? Math.floor(p.t * 4) : 0), 'autumn');
      ctx.drawImage(img, Math.round(p.x - camX), Math.round(p.y - camY));
    }
    ctx.globalAlpha = 1;
    const cols = ['mustard', 'cal4', 'lilac', 'sky'] as const;
    for (const p of this.flies.items) if (p.on) {
      const img = butterfly(Math.floor(p.t * 8) % 2 === 0, cols[p.k % 4]);
      ctx.drawImage(img, Math.round(p.x - camX), Math.round(p.y - camY));
    }
  }

  /** Ropa tendida que se mece con el viento. */
  drawLaundry(ctx: CanvasRenderingContext2D, camX: number, camY: number, wind: number): void {
    let n = 0;
    for (const [a, b] of this.meta.lines) {
      const [ax, ay] = S(a[0], a[1], a[2]);
      const [bx, by] = S(b[0], b[1], b[2]);
      const steps = Math.max(4, Math.round(Math.abs(bx - ax)));
      ctx.fillStyle = PALETTE.ink2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sag = Math.sin(t * Math.PI) * 6;
        ctx.fillRect(Math.round(ax + (bx - ax) * t - camX), Math.round(ay + (by - ay) * t + sag - camY), 1, 1);
      }
      const count = 4;
      for (let k = 0; k < count; k++) {
        const t = (k + 0.7) / (count + 0.4);
        const sag = Math.sin(t * Math.PI) * 6;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t + sag;
        const sw = Math.round(Math.sin(this.t * (1.5 + wind) + k * 1.7 + n) * (1 + Math.abs(wind)));
        const img = cloth(k + n * 2);
        ctx.drawImage(img, Math.round(x - img.width / 2 + sw * 0.5 - camX), Math.round(y - camY));
      }
      n++;
    }
  }

  /** Lluvia, salpicaduras y luciérnagas (después del tinte de luz). */
  drawOverlay(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, w: Weather, night: number): void {
    // luciérnagas
    for (const p of this.bugs.items) if (p.on) {
      const blink = (Math.sin(p.t * 3 + p.k) + 1) / 2;
      if (blink < 0.3) continue;
      const x = Math.round(p.x - camX), y = Math.round(p.y - camY);
      ctx.globalAlpha = blink * 0.35;
      ctx.fillStyle = PALETTE.lampLight;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.globalAlpha = blink;
      ctx.fillStyle = PALETTE.butter;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
    // lluvia (en coordenadas de pantalla, cae sobre todo)
    if (w.rain > 0) {
      ctx.fillStyle = night > 0.5 ? '#9aa8d8' : PALETTE.cal4;
      for (const p of this.drops.items) if (p.on) {
        p.t += 1 / 60;
        if (!p.gy) {
          p.x = Math.random() * (vw + 60) - 30;
          p.y = -10 - Math.random() * vh * 0.3;
          p.gy = Math.random() * vh * 1.1;
        }
        p.x += p.vx / 60;
        p.y += p.vy / 60;
        ctx.globalAlpha = p.k < 0.5 ? 0.55 : 0.32;
        const X = Math.round(p.x), Y = Math.round(p.y);
        ctx.fillRect(X, Y, 1, 3);
        ctx.fillRect(X + 1, Y + 3, 1, 3);
        if (p.y >= p.gy) {
          p.on = false;
          const s = this.splash.spawn();
          if (s) {
            s.x = p.x;
            s.y = p.y;
            s.life = 0.22;
          }
        }
      }
      ctx.globalAlpha = 0.8;
      for (const s of this.splash.items) if (s.on) {
        s.t += 1 / 60;
        const k = s.t / s.life;
        const x = Math.round(s.x), y = Math.round(s.y) + 3;
        if (k < 0.4) ctx.fillRect(x, y, 1, 1);
        else {
          ctx.fillRect(x - 2, y - 1, 1, 1);
          ctx.fillRect(x + 2, y - 1, 1, 1);
          ctx.fillRect(x, y - 2, 1, 1);
        }
        if (s.t > s.life) s.on = false;
      }
      ctx.globalAlpha = 1;
    }
    // niebla: velo general y bancos bajos que se desplazan (elipses en escalones)
    if (w.fog > 0.02) {
      ctx.globalAlpha = 0.16 * w.fog;
      ctx.fillStyle = PALETTE.cal3;
      ctx.fillRect(0, 0, vw, vh);
      for (let i = 0; i < 9; i++) {
        const span = vw + 260;
        const x = ((i * 137 + this.t * (4 + (i % 3))) % span) - 130;
        const y = ((i * 211) % (vh + 60)) - 30;
        const r = 70 + (i % 4) * 22;
        ctx.globalAlpha = 0.1 * w.fog;
        ctx.drawImage(pixelEllipse(r, Math.round(r * 0.32), PALETTE.cal4), Math.round(x - r), Math.round(y - r * 0.32));
        ctx.drawImage(pixelEllipse(Math.round(r * 0.6), Math.round(r * 0.2), PALETTE.cal4), Math.round(x - r * 0.3), Math.round(y - r * 0.2));
      }
      ctx.globalAlpha = 1;
    }
    void camX;
    void camY;
  }
}
