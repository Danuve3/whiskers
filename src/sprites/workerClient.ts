// Cliente del worker de sprites (solo hilo principal). Pide de antemano los clips que se van
// a ver y adopta los frames cuando llegan. Si no hay workers, cae al precalentado en tiempo
// ocioso; si un clip se necesita antes de que llegue, se genera en el momento como siempre.
import { framesKey, hasFrames, putFrames, warm as idleWarm, warmClips, type Look, type RawFrame } from './animals.ts';
import { playerKey, hasPlayerFrames, putPlayerFrames, PLAYER_CLIPS, type Outfit, type RawPFrame } from './player.ts';
import type { SpriteJob } from './spriteWorker.ts';

type Reply = { t: 'a'; k: string; frames: RawFrame[] } | { t: 'p'; k: string; frames: RawPFrame[] } | { t: 'err'; k: string; msg: string };

let worker: Worker | null | undefined;
const pending = new Map<string, SpriteJob>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('sin workers');
    const w = new Worker(new URL('./spriteWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<Reply>) => {
      const r = ev.data;
      pending.delete(r.k);
      inFlight = Math.max(0, inFlight - 1);
      if (r.t === 'a') putFrames(r.k, r.frames);
      else if (r.t === 'p') putPlayerFrames(r.k, r.frames);
      pump();
    };
    w.onerror = () => fallback();
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** El worker no arrancó (navegador antiguo): rehacer lo pendiente en tiempo ocioso. */
function fallback(): void {
  worker?.terminate();
  worker = null;
  const looks = new Map<string, Look>();
  for (const j of pending.values()) if (j.t === 'a') looks.set(j.look.key, j.look);
  pending.clear();
  for (const q of queues) q.length = 0;
  inFlight = 0;
  for (const l of looks.values()) idleWarm(l);
}

// Colas por prioridad: 0 personaje, 1 clips básicos de los animales, 2 el resto.
// Solo hay unos pocos trabajos a la vez en el worker, así lo urgente adelanta a lo demás.
const queues: SpriteJob[][] = [[], [], []];
const MAX_IN_FLIGHT = 2;
let inFlight = 0;

function send(j: SpriteJob, prio: number): void {
  if (pending.has(j.k)) return;
  pending.set(j.k, j);
  queues[prio].push(j);
  pump();
}

function pump(): void {
  while (worker && inFlight < MAX_IN_FLIGHT) {
    const q = queues.find((x) => x.length);
    if (!q) return;
    const j = q.shift()!;
    // puede que ya se haya generado en el momento porque hacía falta antes
    if (j.t === 'a' ? hasFrames(j.k) : hasPlayerFrames(j.k)) {
      pending.delete(j.k);
      continue;
    }
    inFlight++;
    worker.postMessage(j);
  }
}

/** Prepara todos los clips habituales de un animal. */
export function warmAnimal(look: Look): void {
  if (!getWorker()) {
    idleWarm(look);
    return;
  }
  warmClips(look).forEach((clip, i) => {
    for (let dir = 0; dir < 4; dir++) {
      const k = framesKey(look, clip, dir);
      if (!hasFrames(k)) send({ t: 'a', k, look, clip, dir }, i < 4 ? 1 : 2);
    }
  });
}

/** Prepara el personaje con este conjunto (con y sin paraguas). */
export function warmPlayer(outfit: Outfit): void {
  if (!getWorker()) return;
  for (const rain of [!!outfit.rain, !outfit.rain]) {
    const o = { ...outfit, rain };
    PLAYER_CLIPS.forEach((clip, i) => {
      for (let dir = 0; dir < 4; dir++) {
        const k = playerKey(o, clip, dir);
        if (!hasPlayerFrames(k)) send({ t: 'p', k, outfit: o, clip, dir }, rain === !!outfit.rain && i < 3 ? 0 : 2);
      }
    });
  }
}
