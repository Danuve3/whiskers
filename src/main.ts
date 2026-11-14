import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game } from './game.ts';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const hora = params.get('hora');
const clima = params.get('clima');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas, {
  hour: hora !== null ? Number(hora) : undefined,
  shot,
  weather: clima === 'lluvia' ? { rain: 1, overcast: 1, wind: 0.4 } : clima === 'niebla' ? { fog: 1, overcast: 0.5 } : clima === 'nublado' ? { overcast: 1 } : {},
});

void (async () => {
  await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
  await game.init();
  game.start();
  (window as unknown as { __ready: boolean; __game: Game }).__ready = true;
  (window as unknown as { __game: Game }).__game = game;
})();

registerPWA((apply) => {
  const el = document.createElement('button');
  el.className = 'update-toast';
  el.textContent = 'Hay una versión nueva · tocar para actualizar';
  el.onclick = apply;
  document.getElementById('ui')!.appendChild(el);
});
