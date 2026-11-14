import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game, newWorld, npcOutfit, PORTAL, type WorldState } from './game.ts';
import { setupUI, button, Sheet, el } from './ui/kit.ts';
import { openEditor } from './ui/editor.ts';
import { load, store, type SaveData } from './save/save.ts';
import { openRadial, closeRadial, openCard, toast } from './ui/animalUI.ts';
import { decay, hearts, FOODS } from './sim/model.ts';
import { audio } from './audio/engine.ts';
import { music } from './audio/music.ts';
import * as sfx from './audio/sfx.ts';
import { openSettings } from './ui/settings.ts';
import { paramsFor, type Sky } from './sim/weather.ts';
import { EVENTS, type Season, type EventId } from './sim/calendar.ts';
import { newMeta, evaluate, bump, giftTick, collectGift, giveReward, type MetaHost } from './meta/controller.ts';
import { Hud, achievementBanner, openAlbum, openAchievements, openMissions, openNeighbor, DECOR_NAMES } from './ui/metaUI.ts';

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
const estacion = params.get('estacion') as Season | null;
const evento = params.get('evento') as EventId | null;
const game = new Game(canvas, {
  hour: hora !== null ? Number(hora) : undefined,
  shot,
  weather: clima ? paramsFor(clima as Sky) : shot ? paramsFor('sol') : undefined,
  season: estacion ?? undefined,
  events: evento ? [evento] : shot ? [] : undefined,
});

// estado del mundo dentro de la partida
if (!save.world.animals) Object.assign(save.world, newWorld((save.created % 2147483646) + 1));
const W = save.world as unknown as WorldState;
W.meta ??= newMeta();
game.world = W;

const host: MetaHost = {
  get stats() { return W.stats; },
  get inventory() { return W.inventory; },
  get unlocked() { return save.unlocked; },
  get animals() { return W.animals; },
  get meta() { return W.meta; },
  get season() { return game.season; },
  notifyAchievement: (a) => achievementBanner(a),
  notify: (m) => toast(m, 3600),
};
const check = () => {
  evaluate(host);
  persist();
};

function wardrobe(title: string) {
  openEditor(save.outfit, save.unlocked, title, (o) => {
    save.outfit = o;
    save.characterDone = true;
    game.player.setOutfit(o);
    persist();
  });
}

function card(a: (typeof W.animals)[number]) {
  const e = game.pop.entries.find((x) => x.data.id === a.id);
  if (!e) return;
  bump(host, 'fichas');
  check();
  openCard(e, (n) => {
    e.data.name = n;
    e.ent.name = n;
    bump(host, 'renombres');
    check();
  });
}

game.events = {
  animalTap: (e) => {
    const wasKnown = e.data.known;
    openRadial(game, e, (en) => card(en.data));
    if (!wasKnown) check();
  },
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
    const key = act === 'feed' ? 'alimentar' : act === 'water' ? 'agua' : act === 'heal' ? 'curar' : 'caricias';
    bump(host, key);
    // estadísticas de contexto (para logros y misiones)
    const h = new Date().getHours();
    if (game.weather.rain > 0.3) bump(host, 'cuidadosLluvia');
    else if (game.sky === 'sol' && (game.grade?.night ?? 0) < 0.3) bump(host, 'cuidadosSol');
    if ((game.grade?.night ?? 0) > 0.6) bump(host, 'cuidadosNoche');
    if (act === 'feed' && h >= 2 && h < 5) bump(host, 'cuidadosMadrugada');
    if (res.favorite) bump(host, 'favoritas');
    if (res.heartUp) bump(host, 'corazonesGanados');
    if (res.favorite) toast(`¡${FOODS[e.data.favorite].name}! Es la comida favorita de ${e.data.name}.`);
    if (res.heartUp) sfx.heart();
    if (res.heartUp) toast(`${e.data.name} confía más en ti: ahora tiene ${hearts(e.data)} ${hearts(e.data) === 1 ? 'corazón' : 'corazones'}.`);
    else if (act === 'heal') toast(`Le pones una tirita a ${e.data.name}. ¡Como nuevo!`);
    check();
  },
  npcTap: (nb) => openNeighbor(host, nb, npcOutfit(nb.id), (txt) => {
    const step = (W.meta.errands.step[nb.id] ?? 1) - 1;
    const er = nb.errands[step];
    if (er) giveReward(host, er.reward);
    toast(`${nb.name} te da: ${txt}`);
    check();
  }),
  giftTap: (i) => {
    sfx.gift();
    toast(collectGift(host, i));
    check();
  },
  fountain: () => {
    bump(host, 'visitasFuente');
    check();
  },
};

// recordar qué comida se dio a Albóndigo (logro secreto)
const origRequest = game.request.bind(game);
game.request = (e, act, food = 'pienso') => {
  if (act === 'feed' && food === 'jamon' && e.data.name === 'Albóndigo') bump(host, 'albondigoJamon');
  origRequest(e, act, food);
};

function decorSheet() {
  const sh = new Sheet('Decoración');
  if (!W.meta.decor.length) sh.body.append(el('div', { class: 'center' }, 'Todavía no tienes decoración. Los vecinos y los logros te darán comederos, bebederos, mantas y casetas.'));
  for (const id of W.meta.decor) {
    const d = DECOR_NAMES[id] ?? { name: id, desc: '' };
    sh.body.append(el('div', { class: 'item panel' }, el('div', { class: 'txt' }, el('div', {}, d.name), el('div', { class: 'small' }, d.desc))));
  }
  sh.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sh.close())));
  sh.open();
}

void (async () => {
  await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
  await game.init();
  // las necesidades bajan muy despacio con el tiempo real
  let lastDecay = Date.now();
  setInterval(() => {
    const now = Date.now();
    const h = (now - lastDecay) / 3_600_000;
    lastDecay = now;
    for (const a of W.animals) decay(a, h, now);
  }, 5000);
  setInterval(() => {
    const e = game.maybeArrival(Date.now());
    if (e) toast(`Alguien nuevo ronda la plaza… ¿será ${e.data.name}?`);
  }, 30000);
  // regalos de los amigos en el portal
  setInterval(() => {
    const now = Date.now();
    const mins = W.meta.lastGiftCheck ? (now - W.meta.lastGiftCheck) / 60000 : 10;
    W.meta.lastGiftCheck = now;
    if (giftTick(host, now, PORTAL, mins)) toast('Hay algo en el portal de casa…');
  }, 120000);
  // fiestas vividas
  for (const ev of game.fiestas) {
    const key = `${ev}-${new Date().getFullYear()}`;
    if (!W.meta.eventsSeen.includes(key)) {
      W.meta.eventsSeen.push(key);
      bump(host, 'eventos');
      if (ev === 'navidad' && !save.unlocked.includes('evento-navidad')) save.unlocked.push('evento-navidad');
      if (ev === 'magosto') W.inventory.castanas = (W.inventory.castanas ?? 0) + 5;
    }
  }
  if (game.season === 'verano' && !save.unlocked.includes('logro-verano')) save.unlocked.push('logro-verano');
  game.player.setOutfit(save.outfit);
  game.start();
  evaluate(host);
  if (!shot) {
    const hud = new Hud({
      album: () => openAlbum(host, card),
      logros: () => openAchievements(host),
      misiones: () => openMissions(host),
      armario: () => wardrobe('Armario'),
      decoracion: decorSheet,
      ajustes: () => openSettings(save, () => audio.setVolumes(save.settings), (d) => {
        store(d);
        location.reload();
      }),
    });
    const tickHud = () => {
      const d = new Date();
      hud.update(d.getHours() + d.getMinutes() / 60, game.sky, (game.grade?.night ?? 0) > 0.5, game.fiestas);
    };
    tickHud();
    setInterval(tickHud, 10000);
    if (!save.characterDone || params.has('editor')) wardrobe('¿Quién eres?');
    else if (game.fiestas.length) setTimeout(() => toast(`¡Hoy es ${EVENTS[game.fiestas[0]].name}! ${EVENTS[game.fiestas[0]].blurb}`, 5000), 1200);
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
