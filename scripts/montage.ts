// Junta varias capturas en una fila (reducidas ×1/d): tsx scripts/montage.ts out.png d a.png b.png ...
import { readPNG, writePNG } from './lib/png.ts';
const [, , out, ds, ...files] = process.argv;
const d = +ds;
const imgs = files.map((f) => readPNG(f));
const W = imgs.reduce((a, i) => a + Math.floor(i.width / d) + 6, 0), H = Math.max(...imgs.map((i) => Math.floor(i.height / d)));
const o = new Uint8Array(W * H * 4);
let ox = 0;
for (const im of imgs) {
  const w = Math.floor(im.width / d), h = Math.floor(im.height / d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y * d) * im.width + x * d) * 4, di = (y * W + ox + x) * 4;
    o[di] = im.data[si]; o[di + 1] = im.data[si + 1]; o[di + 2] = im.data[si + 2]; o[di + 3] = 255;
  }
  ox += w + 6;
}
writePNG(out, { width: W, height: H, data: o });
