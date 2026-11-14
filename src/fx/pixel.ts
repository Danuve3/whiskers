// Primitivas de píxel nítidas (sin antialiasing): elipses isométricas, anillos, puntos.
const ellCache = new Map<string, HTMLCanvasElement>();

/** Elipse 2:1 rellena, con bordes en escalones de píxel. */
export function pixelEllipse(rx: number, ry: number, color: string): HTMLCanvasElement {
  const k = `${rx}|${ry}|${color}`;
  let c = ellCache.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = rx * 2;
  c.height = ry * 2;
  const x = c.getContext('2d')!;
  x.fillStyle = color;
  for (let j = 0; j < ry * 2; j++) {
    const dy = (j + 0.5 - ry) / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
    if (half > 0) x.fillRect(rx - half, j, half * 2, 1);
  }
  ellCache.set(k, c);
  return c;
}

export function drawEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  const e = pixelEllipse(Math.max(1, Math.round(rx)), Math.max(1, Math.round(ry)), color);
  ctx.drawImage(e, Math.round(cx - e.width / 2), Math.round(cy - e.height / 2));
}

/** Anillo de 1 px (ondas en el agua). */
export function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, color: string): void {
  const ry = rx / 2;
  ctx.fillStyle = color;
  if (rx < 2) {
    ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    return;
  }
  if (rx < 3.5) {
    // anillo pequeño dibujado a mano
    const x = Math.round(cx), y = Math.round(cy);
    ctx.fillRect(x - 2, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x - 1, y - 1, 3, 1);
    ctx.fillRect(x - 1, y + 1, 3, 1);
    return;
  }
  const n = Math.max(8, Math.round(rx * 3));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    ctx.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}

/** Mezcla lineal de colores [r,g,b]. */
export function mix3(a: number[], b: number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgb(c: number[]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
