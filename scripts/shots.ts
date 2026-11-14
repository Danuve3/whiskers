// Capturas de revisión visual con Playwright (resolución de móvil).
// Uso: npm run shots [-- filtro] → shots/*.png
// Arranca un servidor Vite temporal y lo cierra al terminar.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';

const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] ?? '';

interface Shot {
  name: string;
  path: string;
  w: number;
  h: number;
  dpr: number;
  wait?: number;
  full?: boolean;
}

const MOBILE = { w: 390, h: 844, dpr: 3 };
const SHOTS: Shot[] = [
  { name: 'galeria-gato', path: 'dev-sprites.html?only=tabby', w: 1280, h: 900, dpr: 1, full: true, wait: 1500 },
  { name: 'galeria-galgo', path: 'dev-sprites.html?only=galgo', w: 1280, h: 900, dpr: 1, full: true, wait: 1500 },
  { name: 'galeria-personaje', path: 'dev-sprites.html?only=player', w: 1280, h: 900, dpr: 1, full: true, wait: 1500 },
  { name: 'galeria-props', path: 'dev-sprites.html?only=props', w: 1280, h: 900, dpr: 1, full: true, wait: 1500 },
  { name: 'juego-dia', path: '?shot=1&hora=11', ...MOBILE, wait: 2500 },
  { name: 'juego-atardecer', path: '?shot=1&hora=19.4', ...MOBILE, wait: 2500 },
  { name: 'juego-noche', path: '?shot=1&hora=23', ...MOBILE, wait: 2500 },
  { name: 'juego-lluvia', path: '?shot=1&hora=13&clima=lluvia', ...MOBILE, wait: 2500 },
  { name: 'juego-noche-lluvia', path: '?shot=1&hora=22&clima=lluvia', ...MOBILE, wait: 2500 },
  { name: 'juego-amanecer', path: '?shot=1&hora=7&clima=niebla', ...MOBILE, wait: 2500 },
];

const exe = existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
const server = await createServer({ server: { port: 5199, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const addr = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/whiskers/';
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  for (const s of SHOTS) {
    if (filter && !s.name.includes(filter)) continue;
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr });
    page.on('pageerror', (e) => console.error(`[${s.name}] error:`, e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error(`[${s.name}]`, m.text()); });
    await page.goto(addr + s.path, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(s.wait ?? 800);
    await page.screenshot({ path: OUT + s.name + '.png', fullPage: !!s.full });
    console.log('✓', s.name);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
