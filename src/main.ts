import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game } from './game.ts';
import { setupUI, button, iconImg, el } from './ui/kit.ts';
import { openEditor } from './ui/editor.ts';
import { load, store, type SaveData } from './save/save.ts';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const hora = params.get('hora');
const clima = params.get('clima');

setupUI();
const save: SaveData = load();
const persist = () => {
  save.lastSeen = Date.now();
  store(save);
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas, {
  hour: hora !== null ? Number(hora) : undefined,
  shot,
  weather: clima === 'lluvia' ? { rain: 1, overcast: 1, wind: 0.4 } : clima === 'niebla' ? { fog: 1, overcast: 0.5 } : clima === 'nublado' ? { overcast: 1 } : {},
});

function wardrobe(title: string) {
  openEditor(save.outfit, save.unlocked, title, (o) => {
    save.outfit = o;
    save.characterDone = true;
    game.player.setOutfit(o);
    persist();
  });
}

void (async () => {
  await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
  await game.init();
  game.player.setOutfit(save.outfit);
  game.start();
  if (!shot) {
    document.getElementById('ui')!.append(el('div', { class: 'hud' }, button(iconImg('armario'), () => wardrobe('Armario'))));
    if (!save.characterDone || params.has('editor')) wardrobe('¿Quién eres?');
  }
  if (params.has('editor') && shot) wardrobe('¿Quién eres?');
  setInterval(persist, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
  });
  addEventListener('pagehide', persist);
  (window as unknown as { __ready: boolean; __game: Game }).__ready = true;
  (window as unknown as { __game: Game }).__game = game;
})();

registerPWA((apply) => {
  const b = button('Hay una versión nueva · tocar para actualizar', apply, 'update-toast');
  document.getElementById('ui')!.appendChild(b);
});
