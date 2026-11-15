import './styles.css';
import { registerPWA } from './pwa.ts';
import { Game, newWorld, npcOutfit, PORTAL, type WorldState } from './game.ts';
import { setupUI, button, Sheet, el, setHaptics, haptic } from './ui/kit.ts';
import { openEditor } from './ui/editor.ts';
import { load, store, type SaveData } from './save/save.ts';
import { openRadial, closeRadial, openCard, toast } from './ui/animalUI.ts';
import { decay, hearts, FOODS, species, rng, generateAnimal, type Action } from './sim/model.ts';
import { audio } from './audio/engine.ts';
import { music } from './audio/music.ts';
import * as sfx from './audio/sfx.ts';
import { openSettings } from './ui/settings.ts';
import { paramsFor, type Sky } from './sim/weather.ts';
import { EVENTS, type Season, type EventId } from './sim/calendar.ts';
import { newMeta, evaluate, bump, giftTick, collectGift, giveReward, type MetaHost } from './meta/controller.ts';
import { rewardText, NEIGHBORS, errandProgress } from './sim/progress.ts';
import { STORIES, unlockedChapters } from './sim/neighbors.ts';
import { lifeLines, openTrickGame, openAdoption } from './ui/life.ts';
import { openBrush, openBath } from './ui/games.ts';
import { tideAt } from './sim/fishing.ts';
import { HAPPENINGS, happeningFor, dayIndex, taskStart, taskProgress, CHALLENGES, seasonKey, PROJECTS, type Happening } from './sim/rhythm.ts';
import { REQUEST_ACTION, REQUEST_BONUS, MOMENTS, nextTrick, pickMother, makeLitter, adoptionCandidate, letterText, ADOPTERS } from './sim/life.ts';
import { makeLook } from './sprites/breeds.ts';
import { SETS, setProgress, VISITORS } from './sim/collect.ts';
import type { Entry } from './world/population.ts';
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
  rhythm();
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
  bump(host, 'fichas');
  check();
  const look = e?.ent.look ?? makeLook(a.breed, a.variant, a.seed, a.rare);
  const routine = e ? game.pop.routineOf(a) : null;
  const extras = lifeLines(a, W.animals, routine, Date.now(), (id) => NEIGHBORS.find((n) => n.id === id)?.name ?? 'un vecino');
  openCard(a, look, (n) => {
    a.name = n;
    if (e) e.ent.name = n;
    bump(host, 'renombres');
    check();
  }, extras);
}

// ---------------------------------------------------------------- Ritmo del barrio
/** Suceso del día, reto de la estación y proyectos: se comprueban con cada cambio. */
function rhythm(): void {
  if (shot) return;
  const now = Date.now();
  const open = W.meta.zonesOpen ?? ['calle'];
  const S = W.stats as Record<string, number>;
  // suceso de hoy
  const day = dayIndex(now);
  if (W.meta.happening?.day !== day) {
    const H = happeningFor(day, open);
    W.meta.happening = { day, id: H.id, start: taskStart(H.task, S), done: false };
    startHappening(H);
    setTimeout(() => toast(`Hoy en el barrio · ${H.name}: ${H.text}`, 6500), 2500);
  }
  const HS = W.meta.happening;
  const H = HAPPENINGS.find((x) => x.id === HS.id);
  if (H && !HS.done && taskProgress(H.task, S, HS.start) >= H.task.n) {
    HS.done = true;
    giveReward(host, H.reward);
    toast(`¡${H.name}: hecho! Premio: ${rewardText(H.reward)}.`, 4500);
    haptic([10, 40, 10]);
  }
  game.happening = H && !HS.done ? H.id : null;
  // reto de la estación
  const C = CHALLENGES[game.season];
  const key = seasonKey(now, game.season);
  if (W.meta.challenge?.key !== key) W.meta.challenge = { key, start: taskStart(C, S), done: false };
  const CS = W.meta.challenge;
  if (!CS.done && taskProgress(C, S, CS.start) >= C.n) {
    CS.done = true;
    giveReward(host, C.reward);
    toast(`¡Reto de la estación conseguido: ${C.name}! Premio exclusivo: ${rewardText(C.reward)}.`, 5500);
    haptic([16, 60, 16]);
  }
  // proyectos del barrio (empiezan cuando su zona se abre)
  const P = (W.meta.projects ??= {});
  for (const pr of PROJECTS) {
    if (!open.includes(pr.zone)) continue;
    P[pr.id] ??= { start: taskStart(pr, S), done: false };
    if (!P[pr.id].done && taskProgress(pr, S, P[pr.id].start) >= pr.n) {
      P[pr.id].done = true;
      bump(host, 'proyectos');
      toast(`¡Proyecto del barrio terminado! ${pr.done}`, 6000);
      haptic([16, 60, 16, 60, 16]);
      sfx.gift();
      game.refreshStructures();
    }
  }
}

/** Lo que cambia al empezar un suceso. */
function startHappening(H: Happening): void {
  if (H.id === 'banos') {
    // unos cuantos perros de la plaza amanecen embarrados
    let n = 0;
    for (const a of W.animals) if (a.zone === 'plaza' && species(a) === 'dog' && n++ < 3) a.muddy = true;
  }
}

// ---------------------------------------------------------------- Vecinos
function nbState(id: string): { points: number; talkDay: number; read: number } {
  const N = (W.meta.neighbors ??= {});
  return (N[id] ??= { points: 0, talkDay: -1, read: 0 });
}
/** ¿Tiene algo nuevo que contarte (capítulo sin leer o encargo listo para entregar)? */
game.npcHasNews = (id) => {
  const st = nbState(id);
  if (unlockedChapters(id, st, W.meta.projects ?? {}) > st.read) return true;
  const nb = NEIGHBORS.find((n) => n.id === id);
  if (!nb) return false;
  const { errand, progress } = errandProgress(W.meta.errands, nb, W.stats as Record<string, number>);
  return !!errand && W.meta.errands.start[id] !== undefined && progress >= errand.n;
};
/** Final de la historia de Maruxa: la nieta de Pementa aparece en la plaza. */
function pementa(): void {
  if (W.animals.some((a) => a.id === 'n-pementa')) return;
  const base = generateAnimal(777_001, { zone: 'plaza', breeds: ['persa'], used: [], now: Date.now(), home: [9, 5] });
  const D = { ...base, id: 'n-pementa', name: 'Pementa', breed: 'persa', variant: 0, personality: 'dormilon' as const, rare: null, injured: false, trust: 2.2, trustMax: 2.2 };
  W.animals.push(D);
  if (game.zoneId === 'plaza') game.pop.add(D, 9, 5);
  toast('Una gata blanca, viejita y preciosa, se ha instalado junto a la panadería: Pementa.', 5000);
}

// ---------------------------------------------------------------- Vida propia de los animales
const nbName = (id: string) => NEIGHBORS.find((n) => n.id === id)?.name ?? 'un vecino';
function lifeTick(): void {
  const now = Date.now();
  game.updateVisitors();
  const busy = !!document.querySelector('.sheet.open, .title-screen') || (!!tuto && !tuto.done);
  const open = (W.meta.zonesOpen ?? ['calle']) as ZoneId[];
  const living = W.animals.filter((a) => !a.adoptedBy && open.includes(a.zone as ZoneId));
  // camada: una tirada por día real (más probable en primavera)
  const day = Math.floor(now / 86_400_000);
  if (W.meta.litterDay !== day) {
    W.meta.litterDay = day;
    const mom = pickMother(living, now, game.season, W.meta.lastLitter ?? 0, rng(day * 7919 + 13)());
    if (mom) {
      W.meta.lastLitter = now;
      W.nextSeed += 31;
      const kids = makeLitter(mom, now, W.nextSeed * 7 + 101, W.animals.map((a) => a.name));
      const near = game.pop.entries.find((x) => x.data.id === mom.id);
      for (const k of kids) {
        W.animals.push(k);
        if (near) game.pop.add(k, near.ent.m.tx, near.ent.m.ty);
      }
      bump(host, 'camadas');
      toast(`¡${mom.name} ha tenido ${kids.length} ${species(mom) === 'cat' ? 'gatitos' : 'cachorros'} en ${ZONES[mom.zone as ZoneId].title}! Se llaman ${kids.map((k) => k.name).join(', ')}.`, 5200);
      haptic([16, 60, 16]);
      check();
    }
  }
  // adopción: un vecino se ofrece a llevarse a casa a alguien muy querido
  if (!busy) {
    const c = adoptionCandidate(living, now, W.meta.lastOffer ?? 0);
    if (c) {
      W.meta.lastOffer = now;
      const who = ADOPTERS[(c.seed + day) % ADOPTERS.length];
      openAdoption(c, nbName(who), (yes) => {
        if (!yes) {
          toast(`${c.name} se queda en el barrio. ${nbName(who)} lo entiende perfectamente.`);
          return;
        }
        c.adoptedBy = who;
        c.adoptedAt = Date.now();
        c.zone = 'adoptado';
        game.removeAnimal(c.id);
        bump(host, 'adopciones');
        toast(`${c.name} se va a vivir con ${nbName(who)}. Pronto te llegará carta.`, 4200);
        check();
      });
    }
  }
  // cartas de los adoptados (la primera al día siguiente, luego cada par de días)
  W.meta.letters ??= [];
  for (const a of W.animals.filter((x) => x.adoptedBy)) {
    const mine = W.meta.letters.filter((L) => L.animal === a.id);
    const lastAt = mine.length ? Math.max(...mine.map((L) => L.at)) : a.adoptedAt ?? now;
    if (now - lastAt > 86_400_000 * (mine.length ? 2 : 1)) {
      W.meta.letters.push({ animal: a.id, from: nbName(a.adoptedBy!), text: letterText(a.name, nbName(a.adoptedBy!), mine.length), at: now });
      bump(host, 'cartas');
      toast(`Tienes carta de ${nbName(a.adoptedBy!)}: noticias de ${a.name}. Mírala en el álbum.`, 4200);
    }
  }
}

/** ¿Atiende esta acción lo que el animal estaba pidiendo? */
function fulfil(e: Entry, act: Action | 'laser'): void {
  const R = game.pop.request;
  if (!R || R.id !== e.data.id) return;
  const want = REQUEST_ACTION[R.kind];
  const ok = want === act || (R.kind === 'jugar' && (act === 'laser' || (act === 'pet' && species(e.data) === 'dog')));
  if (!ok) return;
  e.data.trust = Math.min(5, e.data.trust + REQUEST_BONUS);
  e.data.trustMax = Math.max(e.data.trustMax, e.data.trust);
  game.pop.clearRequest();
  game.floatTrust(e, true);
  haptic([16, 60, 16]);
  bump(host, 'peticiones');
  toast(`¡Justo lo que quería ${e.data.name}! Confía un poquito más en ti.`);
  check();
}

game.events = {
  animalTap: (e) => {
    tuto?.event('tapAnimal');
    const wasKnown = e.data.known;
    openRadial(game, e, (en) => card(en.data), {
      laser: (en) => {
        game.startLaser(en);
        laserBar.style.display = '';
        fulfil(en, 'laser');
      },
      trick: (en) => {
        const tr = nextTrick(en.data);
        if (!tr) return;
        openTrickGame(en.data, en.ent.look, tr.name, () => {
          (en.data.tricks ??= []).push(tr.id);
          bump(host, 'trucos');
          en.data.trust = Math.min(5, en.data.trust + 0.2);
          check();
        });
      },
      ball: (en) => game.startBall(en),
      hide: (en) => {
        if (!game.startHide(en)) toast(`${en.data.name} no encuentra dónde esconderse aquí. Prueba en otra zona.`);
      },
      brush: (en) => openBrush(en.data, en.ent.look, () => {
        playReward(en, 'cepillados', 0.15, 0.3);
        toast(`${en.data.name} tiene el pelo suavísimo.`);
      }),
      bath: (en) => openBath(en.data, en.ent.look, () => {
        en.data.muddy = false;
        playReward(en, 'banos', 0.15, 0.35);
        toast(`${en.data.name} está limpio y huele a jabón de lavanda.`);
      }),
    });
    if (!wasKnown) check();
  },
  playHint: (text) => {
    playBar.style.display = text ? '' : 'none';
    if (text) playText.textContent = text;
  },
  playDone: (e, kind, extra) => {
    if (kind === 'pelota') {
      playReward(e, 'pelota', 0.25, 0.25);
      toast(`¡${e.data.name} ha traído la pelota ${extra} veces! Está feliz y cansado.`);
      fulfil(e, 'pet');
    } else {
      playReward(e, 'escondite', 0.3, 0.2);
      toast(`¡Encontraste a ${e.data.name}! (${extra} s). Le ha encantado el juego.`);
      fulfil(e, 'laser');
    }
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
  friends: (a, b) => {
    bump(host, 'amistades');
    toast(`${a.data.name} y ${b.data.name} se han hecho amigos.`);
    haptic(10);
    check();
  },
  moment: (id, e) => {
    bump(host, `momento-${id}`);
    const M = (W.meta.moments ??= {});
    const first = !M[id];
    M[id] = { n: (M[id]?.n ?? 0) + 1, first: M[id]?.first ?? Date.now() };
    bump(host, 'momentos');
    if (first) {
      toast(`✦ Momento nuevo: ${MOMENTS[id].name}. ${e.data.name} · ${MOMENTS[id].text}`, 4200);
      haptic([8, 40, 8]);
      sfx.gift();
    }
    check();
  },
  treasure: (def) => {
    const H = (W.meta.treasures ??= {});
    H[def.id] = (H[def.id] ?? 0) + 1;
    bump(host, 'tesoros');
    const set = SETS.find((s) => s.id === def.set)!;
    const [n, tot] = setProgress(def.set, H);
    sfx.gift();
    haptic(10);
    toast(`Has encontrado: ${def.name}. ${set.name}: ${n} de ${tot}.`);
    W.meta.setsDone ??= [];
    if (n === tot && !W.meta.setsDone.includes(set.id)) {
      W.meta.setsDone.push(set.id);
      giveReward(host, set.reward);
      bump(host, 'colecciones');
      toast(`¡Colección completa: ${set.name}! Premio: ${rewardText(set.reward)}.`, 5000);
      haptic([16, 60, 16]);
    }
    check();
  },
  visitor: (e, first) => {
    const v = VISITORS.find((x) => x.id === e.data.visitor);
    toast(first ? `Ha llegado ${e.data.name}, un visitante de temporada: ${v?.whenText ?? ''}.` : `${e.data.name} ha vuelto de visita.`, 4200);
    if (first) bump(host, 'visitantes');
    check();
  },
  routine: (e, text) => {
    bump(host, 'costumbres');
    toast(`Has descubierto una costumbre de ${e.data.name}: ${text}.`, 4500);
    check();
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
    if (act === 'heal' && game.happening === 'veterinaria') e.data.trust = Math.min(5, e.data.trust + res.trustGain);
    if (res.trustGain > 0 || res.heartUp) game.floatTrust(e, res.heartUp);
    fulfil(e, act);
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
  npcTap: (nb) => {
    const st = nbState(nb.id);
    const today = dayIndex(Date.now());
    if (st.talkDay !== today) {
      st.talkDay = today;
      st.points += 1;
    }
    const chapters = STORIES[nb.id] ?? [];
    openNeighbor(host, nb, npcOutfit(nb.id), (er) => {
      giveReward(host, er.reward);
      st.points += 3;
      toast(`${nb.name} te da: ${rewardText(er.reward)}`);
      check();
    }, {
      chapters, unlocked: unlockedChapters(nb.id, st, W.meta.projects ?? {}), read: st.read,
      onRead: (k) => {
        st.read = Math.max(st.read, k + 1);
        const r = chapters[k]?.reward;
        if (r) {
          giveReward(host, r);
          toast(`${nb.name} te da: ${rewardText(r)}`);
        }
        bump(host, 'capitulos');
        if (nb.id === 'maruxa' && k === 3) pementa();
        check();
      },
    });
  },
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
// barra de los juegos en el barrio (pelota, escondite), con × para dejarlo
const playText = el('span', {});
const playStop = el('button', { class: 'tuto-x', 'aria-label': 'Dejar de jugar' }, '×');
playStop.addEventListener('pointerup', (ev) => {
  ev.stopPropagation();
  game.stopPlay();
});
const playBar = el('div', { class: 'laserbar playbar panel ui-text' }, playText, playStop);
playBar.style.display = 'none';
/** Recompensa común de los juegos: confianza, bienestar, estadística y +♥. */
function playReward(e: Entry, stat: string, trust: number, well: number): void {
  e.data.trust = Math.min(5, e.data.trust + trust);
  e.data.trustMax = Math.max(e.data.trustMax, e.data.trust);
  e.data.wellbeing = Math.min(1, e.data.wellbeing + well);
  e.data.lastCare = Date.now();
  bump(host, stat);
  bump(host, 'juegos');
  game.floatTrust(e, false);
  haptic([10, 40, 10]);
  check();
}
const fishBtn = button(el('span', { style: 'display:flex;align-items:center;gap:6px' }, iconImg('anzuelo', 'icon small'), 'Pescar'), () => openFishing(
  () => ({ hour: game.hour, rain: game.weather.rain, season: game.season, tide: tideAt(Date.now()).tide }),
  (f) => {
    const F = (W.meta.fish ??= {});
    const first = !F[f.id];
    F[f.id] = (F[f.id] ?? 0) + 1;
    if (f.food) W.inventory[f.food.id] = (W.inventory[f.food.id] ?? 0) + f.food.n * (game.happening === 'sardinas' ? 2 : 1);
    bump(host, 'pesca');
    if (first) toast(`Nueva captura para tu colección: ${f.name}.`);
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
  rhythm();
  // vida propia: camadas, adopciones y cartas (cada medio minuto)
  if (!shot) {
    setTimeout(lifeTick, 8000);
    setInterval(lifeTick, 30000);
  }
  document.getElementById('ui')!.append(laserBar, playBar, fishBtn);
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
