import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game, newWorld, npcOutfit, PORTAL, type WorldState } from './game.ts';
import { setupUI, button, Sheet, el, setHaptics, haptic } from './ui/kit.ts';
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
import { rewardText } from './sim/progress.ts';
import { ZONES, zoneOpen, type ZoneId } from './world/zones.ts';
import { openWelcome, openFishing } from './ui/extras.ts';
import { showTitle } from './ui/title.ts';
import { Tutorial } from './ui/tutorial.ts';
import { applyOffline } from './sim/offline.ts';
import { feedFromFeeders } from './sim/feeders.ts';
import { syncReminderState } from './reminder.ts';
import { iconImg } from './ui/kit.ts';
import { ExitSigns, RecenterButton, openMap } from './ui/nav.ts';
import { AnimalStrip, startHints, markUsed, needyByZone } from './ui/assist.ts';
import { Hud, achievementBanner, openAlbum, openAchievements, openMissions, openNeighbor, DECOR_NAMES } from './ui/metaUI.ts';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const hora = params.get('hora');
const clima = params.get('clima');

setupUI();
const save: SaveData = load();
setHaptics(save.settings.haptics !== false);
const persist = () => {
  save.lastSeen = Date.now();
  // dónde estabas: al volver apareces en la misma zona y casilla
  const g = (window as unknown as { __game?: Game }).__game;
  if (g?.grid && !shot) (save.world as unknown as WorldState).meta.pos = [g.player.m.tx, g.player.m.ty];
  store(save);
  // para el recordatorio diario: el animal que más te quiere es quien «te echa de menos»
  const ws = save.world as unknown as WorldState;
  const fav = [...(ws.animals ?? [])].sort((a, b) => b.trust - a.trust)[0];
  if (!shot) syncReminderState(!!save.settings.reminder, save.lastSeen, fav?.name ?? 'Nemesio');
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
  notifyAchievement: (a) => {
    if (!shot) achievementBanner(a);
  },
  notify: (m) => toast(m, 3600),
};
const check = () => {
  evaluate(host);
  // zonas que se abren
  const open = (W.meta.zonesOpen ??= ['calle']);
  for (const id of Object.keys(ZONES) as ZoneId[]) {
    if (open.includes(id) || !zoneOpen(id, W.stats, W.animals)) continue;
    open.push(id);
    toast(`¡Se ha abierto ${ZONES[id].title}! ${ZONES[id].blurb}`, 5000);
    sfx.gift();
  }
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
    tuto?.event('tapAnimal');
    const wasKnown = e.data.known;
    openRadial(game, e, (en) => card(en.data), (en) => {
      game.startLaser(en);
      laserBar.style.display = '';
    });
    if (!wasKnown) check();
  },
  laserDone: (e) => {
    laserBar.style.display = 'none';
    bump(host, 'laser');
    sfx.purr(2);
    toast(`¡${e.data.name} se lo ha pasado en grande! Su bienestar sube.`);
    check();
  },
  groundTap: () => {
    closeRadial();
    tuto?.event('moved');
  },
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
    if (res.trustGain > 0 || res.heartUp) game.floatTrust(e, res.heartUp);
    // vibración suave: ronroneo al acariciar, latido al ganar un corazón
    if (res.heartUp) haptic([16, 60, 16]);
    else if (act === 'pet') haptic([6, 40, 6, 40, 6]);
    else haptic(8);
    if (act === 'feed') tuto?.event('fed');
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
  npcTap: (nb) => openNeighbor(host, nb, npcOutfit(nb.id), (er) => {
    giveReward(host, er.reward);
    toast(`${nb.name} te da: ${rewardText(er.reward)}`);
    check();
  }),
  giftTap: (i) => {
    haptic(12);
    sfx.gift();
    toast(collectGift(host, i));
    check();
  },
  fountain: () => {
    bump(host, 'visitasFuente');
    check();
  },
  zoneChanged: (z) => {
    W.meta.zone = z;
    W.meta.visited ??= [];
    if (!W.meta.visited.includes(z)) W.meta.visited.push(z);
    if (z === 'plaza') tuto?.event('plaza');
    toast(`${ZONES[z].title} · ${ZONES[z].blurb}`, 3600);
    check();
  },
};

// recordar qué comida se dio a Albóndigo (logro secreto)
const origRequest = game.request.bind(game);
game.request = (e, act, food = 'pienso') => {
  if (act === 'feed' && food === 'jamon' && e.data.name === 'Albóndigo') bump(host, 'albondigoJamon');
  if (act === 'feed') tuto?.event('requestFeed');
  origRequest(e, act, food);
};

let pendingWelcome: (() => void) | null = null;
let tuto: Tutorial | null = null;

const laserBar = el('div', { class: 'laserbar panel ui-text' }, 'Arrastra el dedo para mover el punto rojo');
laserBar.style.display = 'none';
const fishBtn = button(el('span', { style: 'display:flex;align-items:center;gap:6px' }, iconImg('anzuelo', 'icon small'), 'Pescar'), () => openFishing(() => {
  W.inventory.sardinas = (W.inventory.sardinas ?? 0) + 1;
  bump(host, 'pesca');
  check();
}), 'floatbtn');
fishBtn.style.display = 'none';

function decorSheet() {
  const sh = new Sheet('Decoración');
  if (!W.meta.decor.length) sh.body.append(el('div', { class: 'center' }, 'Todavía no tienes decoración para colocar. Los vecinos y los logros te darán comederos, bebederos, mantas y casetas.'));
  for (const id of [...new Set(W.meta.decor)]) {
    const d = DECOR_NAMES[id] ?? { name: id, desc: '' };
    sh.body.append(el('div', { class: 'item panel' }, el('div', { class: 'txt' }, el('div', {}, d.name), el('div', { class: 'small' }, d.desc)), button('Colocar aquí', () => {
      if (game.placeDecor(id)) {
        toast(`${d.name} colocado en ${ZONES[game.zoneId].title}.`);
        void sh.close();
        persist();
      } else toast('Ahí no cabe. Prueba mirando hacia un sitio libre.');
    })));
  }
  const placed = (W.meta.placed ?? []).filter((p) => p.zone === game.zoneId);
  if (placed.length) sh.body.append(el('div', { class: 'small center' }, `En esta zona: ${placed.map((p) => DECOR_NAMES[p.id]?.name ?? p.id).join(', ')}.`));
  sh.body.append(el('div', { class: 'footer' }, button('Cerrar', () => void sh.close())));
  sh.open();
}

void (async () => {
  await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
  const zona = params.get('zona') as ZoneId | null;
  await game.init(shot ? zona ?? 'plaza' : (W.meta.zone as ZoneId | undefined) ?? 'calle', shot ? undefined : W.meta.pos);
  // las necesidades bajan muy despacio con el tiempo real
  let lastDecay = Date.now();
  setInterval(() => {
    const now = Date.now();
    const h = (now - lastDecay) / 3_600_000;
    lastDecay = now;
    for (const a of W.animals) decay(a, h, now);
    // los de otras zonas comen solos de sus comederos
    feedFromFeeders(W.animals, W.meta.placed ?? [], game.zoneId);
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
  // progreso offline: «Mientras no estabas…»
  const now0 = Date.now();
  const openZones = (W.meta.zonesOpen ?? ['calle']) as ZoneId[];
  const free = openZones.reduce((a, z) => a + Math.max(0, ZONES[z].cap - W.animals.filter((x) => x.zone === z).length), 0);
  const rep = shot ? null : applyOffline(W.animals, save.lastSeen, now0, free, W.meta.placed ?? []);
  const arrivals: string[] = [];
  if (rep && rep.hours >= 0.25) {
    for (let i = 0; i < rep.arrivals; i++) {
      const z = openZones[i % openZones.length];
      const used = new Set(W.animals.map((a) => a.home.join(',')));
      const home = ZONES[z].homes.find((h) => !used.has(h.join(','))) ?? ZONES[z].homes[i % ZONES[z].homes.length];
      game.spawnNew(home, true, z);
      arrivals.push(W.animals[W.animals.length - 1].name);
    }
    const gifts = giftTick(host, now0, PORTAL, rep.hours * 60);
    if (save.characterDone) pendingWelcome = () => openWelcome({ hours: rep.hours, arrivals, gifts, missed: rep.missed, served: rep.served });
  }
  game.start();
  evaluate(host);
  document.getElementById('ui')!.append(laserBar, fishBtn);
  setInterval(() => {
    const f = game.zoneDef.fishing;
    const near = !!f && Math.hypot(game.player.m.tx - f[0], game.player.m.ty - f[1]) <= 2.2 && !game.player.m.moving;
    fishBtn.style.display = near ? '' : 'none';
  }, 300);
  (window as unknown as { __game: Game }).__game = game;
  (window as unknown as { __ready: boolean }).__ready = true;
  if (!shot) {
    // pantalla de título con el barrio al atardecer
    const realHour = game.hourOverride;
    if (!params.has('notitulo')) {
      game.hourOverride = 19.3;
      game.titleDrift = true;
      await new Promise<void>((res) => showTitle(() => {
        audio.start();
        audio.setVolumes(save.settings);
        music.start();
        game.hourOverride = realHour;
        game.titleDrift = false;
        game.cam.follow = true;
        res();
      }));
    }
    const hud = new Hud({
      album: () => {
        tuto?.event('album');
        openAlbum(host, card);
      },
      logros: () => openAchievements(host),
      misiones: () => openMissions(host),
      armario: () => {
        markUsed(W.meta, 'armario');
        wardrobe('Armario');
      },
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
    // navegación: carteles sobre las salidas y mapa del barrio
    ExitSigns.enabled = save.settings.exitSigns !== false;
    new ExitSigns(game);
    new RecenterButton(game);
    const mapBtn = el('div', { class: 'mapbtn' }, button(iconImg('mapa'), () => {
      markUsed(W.meta, 'mapa');
      openMap(game);
    }));
    document.getElementById('ui')!.append(mapBtn);
    // puntito en el mapa si en otra zona abierta alguien necesita algo
    setInterval(() => {
      const nz = needyByZone(W.animals);
      const other = (Object.keys(nz) as ZoneId[]).some((z) => z !== game.zoneId && zoneOpen(z, W.stats, W.animals));
      mapBtn.classList.toggle('alert', other);
    }, 2000);
    new AnimalStrip(game, (en) => game.events.animalTap(en, innerWidth / 2, innerHeight / 2), () => markUsed(W.meta, 'lista'));
    W.meta.visited ??= [];
    if (!W.meta.visited.includes(game.zoneId)) W.meta.visited.push(game.zoneId);
    startHints(game, W.meta, W.stats as Record<string, number>, () => !!tuto && !tuto.done);
    if (!save.characterDone || params.has('editor')) wardrobe('¿Quién eres?');
    else {
      pendingWelcome?.();
      if (game.fiestas.length) setTimeout(() => toast(`¡Hoy es ${EVENTS[game.fiestas[0]].name}! ${EVENTS[game.fiestas[0]].blurb}`, 5000), 1200);
    }
    // tutorial del primer día
    if (!save.tutorialDone) {
      tuto = new Tutorial((W.stats.tutorial ?? 0) as number, (st) => {
        W.stats.tutorial = st;
        if (tuto?.done) save.tutorialDone = true;
        persist();
      });
    }
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
