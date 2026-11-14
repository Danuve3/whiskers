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
  { name: 'galeria-gato-a', path: 'dev-sprites.html?only=tabby&scale=3&noche=0&clips=idle,walk,trot,run,sneak', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-gato-b', path: 'dev-sprites.html?only=tabby&scale=3&noche=0&clips=sitDown,sit,lieDown,lie,sleep,stretch', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-gato-c', path: 'dev-sprites.html?only=tabby&scale=3&clips=lick,scratch,eat,drink,wag,meow', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-gato-x1', path: 'dev-sprites.html?only=tabby&scale=1&noche=0', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-galgo-a', path: 'dev-sprites.html?only=galgo&scale=3&noche=0&clips=idle,walk,trot,run,sneak', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-galgo-b', path: 'dev-sprites.html?only=galgo&scale=3&noche=0&clips=sitDown,sit,lieDown,lie,sleep,stretch', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-galgo-c', path: 'dev-sprites.html?only=galgo&scale=3&clips=lick,scratch,eat,drink,wag,meow', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-galgo-x1', path: 'dev-sprites.html?only=galgo&scale=1&noche=0', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'razas-gatos', path: 'dev-sprites.html?only=gatos&scale=3', w: 1400, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'razas-perros', path: 'dev-sprites.html?only=perros&scale=3', w: 1400, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'razas-andar', path: 'dev-sprites.html?only=razas&scale=2&clip=walk', w: 1400, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'razas-fila', path: 'dev-sprites.html?only=fila', w: 1400, h: 600, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-personaje', path: 'dev-sprites.html?only=player', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'galeria-props', path: 'dev-sprites.html?only=props', w: 1280, h: 900, dpr: 1, full: true, wait: 2500 },
  { name: 'titulo', path: '?clima=sol', ...MOBILE, wait: 3500 },
  { name: 'editor', path: '?shot=1&hora=11&editor=1', ...MOBILE, wait: 2500 },
  { name: 'juego-dia', path: '?shot=1&hora=11', ...MOBILE, wait: 2500 },
  { name: 'juego-atardecer', path: '?shot=1&hora=19.4', ...MOBILE, wait: 2500 },
  { name: 'juego-noche', path: '?shot=1&hora=23', ...MOBILE, wait: 2500 },
  { name: 'juego-lluvia', path: '?shot=1&hora=13&clima=lluvia', ...MOBILE, wait: 2500 },
  { name: 'juego-noche-lluvia', path: '?shot=1&hora=22&clima=lluvia', ...MOBILE, wait: 2500 },
  { name: 'estacion-invierno-nieve', path: '?shot=1&hora=12&clima=nieve&estacion=invierno', ...MOBILE, wait: 3000 },
  { name: 'estacion-primavera', path: '?shot=1&hora=11&estacion=primavera', ...MOBILE, wait: 2500 },
  { name: 'estacion-verano-sanjuan', path: '?shot=1&hora=22.5&estacion=verano&evento=sanjuan', ...MOBILE, wait: 2500 },
  { name: 'evento-samain', path: '?shot=1&hora=21.5&evento=samain&clima=niebla', ...MOBILE, wait: 2500 },
  { name: 'evento-magosto', path: '?shot=1&hora=17&evento=magosto&clima=nublado', ...MOBILE, wait: 2500 },
  { name: 'evento-navidad', path: '?shot=1&hora=19.8&evento=navidad&estacion=invierno&clima=nieve', ...MOBILE, wait: 3000 },
  { name: 'evento-entroido', path: '?shot=1&hora=12&evento=entroido&estacion=invierno', ...MOBILE, wait: 2500 },
  { name: 'clima-orballo', path: '?shot=1&hora=10&clima=orballo', ...MOBILE, wait: 2500 },
  { name: 'zona-calle', path: '?shot=1&hora=10.5&zona=calle', ...MOBILE, wait: 2500 },
  { name: 'zona-parque', path: '?shot=1&hora=12&zona=parque', ...MOBILE, wait: 2500 },
  { name: 'zona-mercado', path: '?shot=1&hora=11&zona=mercado', ...MOBILE, wait: 2500 },
  { name: 'zona-descampado', path: '?shot=1&hora=18.5&zona=descampado', ...MOBILE, wait: 2500 },
  { name: 'zona-puerto', path: '?shot=1&hora=16&zona=puerto', ...MOBILE, wait: 2500 },
  { name: 'zona-puerto-noche', path: '?shot=1&hora=22&zona=puerto', ...MOBILE, wait: 2500 },
  { name: 'juego-amanecer', path: '?shot=1&hora=7&clima=niebla&estacion=otoño', ...MOBILE, wait: 2500 },
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
    if (s.full) {
      // los lienzos fuera de la ventana no siempre se pintan: agrandar la ventana a toda la página
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: s.w, height: Math.min(h, 8000) });
    }
    await page.waitForTimeout(s.wait ?? 800);
    await page.screenshot({ path: OUT + s.name + '.png', fullPage: !!s.full });
    console.log('✓', s.name);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
