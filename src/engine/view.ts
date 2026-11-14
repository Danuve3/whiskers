// Lienzo con zoom entero: se pinta a 1 px de juego en un búfer pequeño y se escala ×zoom
// en píxeles de dispositivo, sin suavizado.
export class View {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly buf: HTMLCanvasElement;
  readonly b: CanvasRenderingContext2D;
  zoom = 3;
  /** zoom preferido por el usuario (relativo al automático) */
  zoomBias = 0;
  w = 0;
  h = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.buf = document.createElement('canvas');
    this.b = this.buf.getContext('2d')!;
    this.resize();
  }

  autoZoom(devW: number): number {
    // ~300-360 px de juego de ancho en vertical (personajes grandes y legibles)
    return Math.max(1, Math.round(devW / 330));
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const devW = Math.round(window.innerWidth * this.dpr);
    const devH = Math.round(window.innerHeight * this.dpr);
    this.canvas.width = devW;
    this.canvas.height = devH;
    const auto = this.autoZoom(Math.min(devW, devH * 0.75));
    this.zoom = Math.max(1, Math.min(auto + 2, auto + this.zoomBias));
    this.w = Math.ceil(devW / this.zoom);
    this.h = Math.ceil(devH / this.zoom);
    this.buf.width = this.w;
    this.buf.height = this.h;
    this.ctx.imageSmoothingEnabled = false;
    this.b.imageSmoothingEnabled = false;
  }

  setZoomBias(bias: number): void {
    const devW = this.canvas.width, devH = this.canvas.height;
    const auto = this.autoZoom(Math.min(devW, devH * 0.75));
    this.zoomBias = Math.max(1 - auto, Math.min(2, bias));
    this.resize();
  }

  present(): void {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buf, 0, 0, this.w * this.zoom, this.h * this.zoom);
  }

  /** CSS px → px de juego en el búfer */
  toBuf(cssX: number, cssY: number): [number, number] {
    return [(cssX * this.dpr) / this.zoom, (cssY * this.dpr) / this.zoom];
  }
}
