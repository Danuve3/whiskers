import './styles.css';
import { registerPWA } from './pwa.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function draw() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3b3149';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff4dc';
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(32 * dpr)}px "Pixelify Sans"`;
  ctx.fillText('Whiskers', canvas.width / 2, canvas.height / 2);
  ctx.font = `${Math.round(14 * dpr)}px "Pixelify Sans"`;
  ctx.fillStyle = '#ead9c0';
  ctx.fillText('El barrio se está despertando…', canvas.width / 2, canvas.height / 2 + 32 * dpr);
}
void document.fonts.load('32px "Pixelify Sans"').then(draw);
addEventListener('resize', draw);
draw();

registerPWA((apply) => {
  const el = document.createElement('button');
  el.textContent = 'Nueva versión disponible · tocar para actualizar';
  el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);font:inherit;padding:8px 12px;border:2px solid #5e3f36;background:#fff4dc;color:#1d1828';
  el.onclick = apply;
  document.getElementById('ui')!.appendChild(el);
});
