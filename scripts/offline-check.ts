// Prueba de modo avión: sirve dist/, deja que el service worker precachee, corta la red y recarga.
// Uso: npm run build && npm run offline-check
import { preview } from 'vite';
import { readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const server = await preview({ preview: { port: 4174, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls!.local[0];
const browser = await chromium.launch();
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('error:', e.message));
  await page.goto(url + '?notitulo', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  // esperar a que el SW esté activo y precacheado
  await page.evaluate('navigator.serviceWorker.ready');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction('!!navigator.serviceWorker.controller', null, { timeout: 30000 });
  const cached = await page.evaluate(`caches.keys().then(async (ks) => { let n = 0; for (const k of ks) n += (await (await caches.open(k)).keys()).length; return n; })`);
  console.log(`· recursos en caché: ${cached}`);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  const zones = await page.evaluate(`Promise.all(['calle','plaza','parque','mercado','descampado','puerto'].map((z) => fetch('${new URL(url).pathname}gen/' + z + '.json').then((r) => r.ok)))`);
  const files = readdirSync('dist/gen');
  const base = new URL(url).pathname;
  const allGen = await page.evaluate(`Promise.all(${JSON.stringify(files)}.map((f) => fetch('${base}gen/' + f).then((r) => r.ok, () => false)))`);
  const missing = files.filter((_f: string, i: number) => !(allGen as boolean[])[i]);
  console.log(`· arte disponible sin red: ${files.length - missing.length}/${files.length}`, missing.length ? missing : '');
  const pixels = await page.evaluate(`(() => { const c = document.getElementById('game'); const x = c.getContext('2d'); const d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[3]; })()`);
  console.log(`· sin red: el juego arranca (${pixels ? 'pinta' : 'no pinta'}) y las zonas cargan: ${JSON.stringify(zones)}`);
  ok = (zones as boolean[]).every(Boolean) && !!pixels && missing.length === 0;
  await page.screenshot({ path: 'shots/offline.png' });
} finally {
  await browser.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
console.log(ok ? '✓ funciona 100 % offline' : '✗ falla en modo avión');
process.exit(ok ? 0 : 1);
