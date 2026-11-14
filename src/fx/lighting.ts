// Pase de luz: gradación por canal, ventanas encendidas y charcos de luz cálida en escalones.
import type { Grade } from './daylight.ts';
import { pixelEllipse, rgb } from './pixel.ts';

export interface LightSrc {
  /** pantalla-mundo del punto de luz y del suelo bajo ella */
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  r: number;
  kind: 'lamp' | 'wall' | 'kiosk' | 'window';
  phase: number;
}

export class Lighting {
  private lit = document.createElement('canvas');
  private lx = this.lit.getContext('2d')!;
  private mask = document.createElement('canvas');
  private mx = this.mask.getContext('2d')!;
  private t = 0;

  /** Guarda una copia de la escena sin tintar (para iluminar con su color real). */
  capture(src: HTMLCanvasElement): void {
    if (this.lit.width !== src.width || this.lit.height !== src.height) {
      this.lit.width = src.width;
      this.lit.height = src.height;
      this.mask.width = src.width;
      this.mask.height = src.height;
    }
    this.lx.globalCompositeOperation = 'copy';
    this.lx.drawImage(src, 0, 0);
    this.lx.globalCompositeOperation = 'source-over';
  }

  grade(ctx: CanvasRenderingContext2D, w: number, h: number, g: Grade): void {
    const [r, gg, b] = g.mul;
    if (r < 0.999 || gg < 0.999 || b < 0.999) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgb([r * 255, gg * 255, b * 255]);
      ctx.fillRect(0, 0, w, h);
    }
    if (g.lift[0] + g.lift[1] + g.lift[2] > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgb(g.lift);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Charcos de luz: devuelve el color original (cálido) dentro de anillos concéntricos de píxel. */
  pools(ctx: CanvasRenderingContext2D, lights: LightSrc[], camX: number, camY: number, night: number, dt: number): void {
    this.t += dt;
    if (night < 0.05) return;
    const W = this.mask.width, H = this.mask.height;
    // calentar la copia sin tintar (opaca, así el multiplicar no altera el alfa)
    this.lx.globalCompositeOperation = 'multiply';
    this.lx.fillStyle = 'rgb(255,228,176)';
    this.lx.fillRect(0, 0, W, H);
    this.lx.globalCompositeOperation = 'source-over';
    const mx = this.mx;
    mx.clearRect(0, 0, W, H);
    for (const l of lights) {
      const flick = l.kind === 'lamp' ? 0.92 + 0.08 * Math.sin(this.t * 13 + l.phase * 9) * Math.sin(this.t * 3.1 + l.phase) : 1;
      const X = l.gx - camX, Y = l.gy - camY;
      if (X < -l.r * 2 || Y < -l.r || X > W + l.r * 2 || Y > H + l.r) continue;
      const rings = [[1, 0.16], [0.78, 0.2], [0.56, 0.24], [0.34, 0.3]] as const;
      for (const [k, a] of rings) {
        mx.globalAlpha = a * night * flick;
        const e = pixelEllipse(Math.round(l.r * k * 2), Math.round(l.r * k), '#fff');
        mx.drawImage(e, Math.round(X - e.width / 2), Math.round(Y - e.height / 2));
      }
      // halo alrededor del farol
      if (l.kind !== 'window') {
        const hx = l.sx - camX, hy = l.sy - camY;
        for (const [rr, a] of [[9, 0.35], [6, 0.6], [3, 0.95]] as const) {
          mx.globalAlpha = a * night * flick;
          const e = pixelEllipse(rr, rr, '#fff');
          mx.drawImage(e, Math.round(hx - rr), Math.round(hy - rr));
        }
      }
    }
    mx.globalAlpha = 1;
    // escena original calentada, recortada por la máscara
    mx.globalCompositeOperation = 'source-in';
    mx.drawImage(this.lit, 0, 0);
    mx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.mask, 0, 0);
    // punto brillante del farol
    for (const l of lights) {
      if (l.kind === 'window') continue;
      const hx = Math.round(l.sx - camX), hy = Math.round(l.sy - camY);
      ctx.globalAlpha = night;
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(hx - 1, hy - 2, 3, 4);
      ctx.fillStyle = '#fbe7a1';
      ctx.fillRect(hx, hy - 1, 1, 2);
    }
    ctx.globalAlpha = 1;
  }
}
