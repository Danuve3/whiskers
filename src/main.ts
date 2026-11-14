import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game } from './game.ts';
import { setupUI, button, iconImg, el } from './ui/kit.ts';
import { openEditor } from './ui/editor.ts';
import { load, store, type SaveData } from './save/save.ts';
import { newWorld, type WorldState } from './game.ts';
import { openRadial, closeRadial, openCard, toast } from './ui/animalUI.ts';
import { decay, hearts, FOODS } from './sim/model.ts';
import { audio } from './audio/engine.ts';
import { music } from './audio/music.ts';
import * as sfx from './audio/sfx.ts';
import { openSettings } from './ui/settings.ts';

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

// estado del mundo dentro de la partida
if (!save.world.animals) Object.assign(save.world, newWorld((save.created % 2147483646) + 1));
game.world = save.world as unknown as WorldState;
game.events = {
  animalTap: (e) => openRadial(game, e, (en) => openCard(en, (n) => {
    en.data.name = n;
    en.ent.name = n;
    persist();
  })),
  groundTap: () => closeRadial(),
  firstGesture: () => {
    audio.start();
    audio.setVolumes(save.settings);
    music.start();
  },
  toast: (m) => toast(m),
  care: (e, act, res) => {
    if (!res.ok) {
      if (res.reason) toast(res.reason);
      return;
    }
    const st = game.world.stats;
    const key = act === 'feed' ? 'alimentar' : act === 'water' ? 'agua' : act === 'heal' ? 'curar' : 'caricias';
    st[key] = (st[key] ?? 0) + 1;
    if (res.favorite) toast(`¡${FOODS[e.data.favorite].name}! Es la comida favorita de ${e.data.name}.`);
    if (res.heartUp) sfx.heart();
    if (res.heartUp) toast(`${e.data.name} confía más en ti: ahora tiene ${hearts(e.data)} ${hearts(e.data) === 1 ? 'corazón' : 'corazones'}.`);
    else if (act === 'heal') toast(`Le pones una tirita a ${e.data.name}. ¡Como nuevo!`);
    persist();
  },
};

void (async () => {
  await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
  await game.init();
  // las necesidades bajan muy despacio con el tiempo real
  let lastDecay = Date.now();
  setInterval(() => {
    const now = Date.now();
    const h = (now - lastDecay) / 3_600_000;
    lastDecay = now;
    for (const a of game.world.animals) decay(a, h, now);
  }, 5000);
  setInterval(() => {
    const e = game.maybeArrival(Date.now());
    if (e) toast(`Alguien nuevo ronda la plaza… ¿será ${e.data.name}?`);
  }, 30000);
  game.player.setOutfit(save.outfit);
  game.start();
  if (!shot) {
    document.getElementById('ui')!.append(el('div', { class: 'hud' },
      button(iconImg('armario'), () => wardrobe('Armario')),
      button(iconImg('ajustes'), () => openSettings(save, () => audio.setVolumes(save.settings), (d) => {
        store(d);
        location.reload();
      })),
    ));
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
