// Composición rápida de una zona en Node (sin navegador) para revisar el arte del escenario.
// Uso: tsx scripts/preview-zone.ts plaza salida.png [escala] [x0 y0 w h] [noche]
import { readFileSync } from 'node:fs';
import { readPNG, writePNG } from './lib/png.ts';

const [, , zoneName = 'plaza', out = 'preview.png', scaleS = '1', cx = '', cy = '', cw = '', ch = '', mode = 'dia'] = process.argv;
const GEN = new URL('../public/gen/', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(GEN + zoneName + '.json', 'utf8'));
const pages = meta.atlas.map((f: string) => readPNG(GEN + f));
type S = [number, number, number, number, number, number, number];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const k in meta.sprites) {
  const s = meta.sprites[k] as S;
  minX = Math.min(minX, s[5]); minY = Math.min(minY, s[6]);
  maxX = Math.max(maxX, s[5] + s[3]); maxY = Math.max(maxY, s[6] + s[4]);
}
const W = maxX - minX, H = maxY - minY;
const img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 43; img[i * 4 + 1] = 45; img[i * 4 + 2] = 92; img[i * 4 + 3] = 255; }
function blit(name: string, alpha = 1) {
  const s = meta.sprites[name] as S;
  if (!s) return;
  const p = pages[s[0]];
  for (let y = 0; y < s[4]; y++)
    for (let x = 0; x < s[3]; x++) {
      const si = ((s[2] + y) * p.width + s[1] + x) * 4;
      if (!p.data[si + 3]) continue;
      const di = ((s[6] - minY + y) * W + s[5] - minX + x) * 4;
      for (let c = 0; c < 3; c++) img[di + c] = img[di + c] * (1 - alpha) + p.data[si + c] * alpha;
    }
}
for (const g of meta.zone.ground) blit(g);
// orden topológico simple por cajas (como en el runtime)
const objs = meta.zone.objects.slice();
const behind = (a: any, b: any) => {
  const A = a.box, B = b.box;
  if (A[3] <= B[0]) return true; if (B[3] <= A[0]) return false;
  if (A[4] <= B[1]) return true; if (B[4] <= A[1]) return false;
  if (A[5] <= B[2]) return true; if (B[5] <= A[2]) return false;
  return (A[0] + A[1] + A[3] + A[4]) < (B[0] + B[1] + B[3] + B[4]);
};
const sorted: any[] = [];
const visited = new Set<any>();
const visit = (o: any) => { if (visited.has(o)) return; visited.add(o); for (const p of objs) if (p !== o && behind(p, o)) visit(p); sorted.push(o); };
for (const o of objs) visit(o);
for (const o of sorted) blit(o.sprite);
if (mode === 'noche') {
  for (let i = 0; i < W * H; i++) { img[i*4] *= 0.35; img[i*4+1] *= 0.4; img[i*4+2] *= 0.75; }
  for (const o of sorted) if (o.night) blit(o.night);
}
const sc = Number(scaleS);
const X0 = cx ? Number(cx) - minX : 0, Y0 = cy ? Number(cy) - minY : 0;
const OW = cw ? Number(cw) : W, OH = ch ? Number(ch) : H;
const o = new Uint8Array(OW * sc * OH * sc * 4);
for (let y = 0; y < OH * sc; y++)
  for (let x = 0; x < OW * sc; x++) {
    const sx = X0 + Math.floor(x / sc), sy = Y0 + Math.floor(y / sc);
    const di = (y * OW * sc + x) * 4;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) { o[di + 3] = 255; continue; }
    const si = (sy * W + sx) * 4;
    o[di] = img[si]; o[di + 1] = img[si + 1]; o[di + 2] = img[si + 2]; o[di + 3] = 255;
  }
writePNG(out, { width: OW * sc, height: OH * sc, data: o });
console.log(`${W}×${H} origen (${minX},${minY})`);
