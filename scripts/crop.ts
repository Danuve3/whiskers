// Recorta (y opcionalmente escala) una captura: tsx scripts/crop.ts in.png out.png x y w h [escala]
import { readPNG, writePNG } from './lib/png.ts';
const [, , inp, out, xs, ys, ws, hs, ss = '1'] = process.argv;
const img = readPNG(inp);
const x0 = +xs, y0 = +ys, w = +ws, h = +hs, s = +ss;
const o = new Uint8Array(w * s * h * s * 4);
for (let y = 0; y < h * s; y++)
  for (let x = 0; x < w * s; x++) {
    const sx = x0 + Math.floor(x / s), sy = y0 + Math.floor(y / s);
    const di = (y * w * s + x) * 4;
    if (sx >= img.width || sy >= img.height) { o[di + 3] = 255; continue; }
    const si = (sy * img.width + sx) * 4;
    o.set(img.data.subarray(si, si + 4), di);
  }
writePNG(out, { width: w * s, height: h * s, data: o });
