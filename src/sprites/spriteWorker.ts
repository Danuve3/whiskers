// Worker de sprites: rasteriza los clips de animales y del personaje fuera del hilo
// principal, para que generar frames nuevos nunca cause tirones en la imagen ni en la música.
import { computeClip, type Look, type Clip } from './animals.ts';
import { computePlayer, type Outfit, type PlayerClip } from './player.ts';

export type SpriteJob =
  | { t: 'a'; k: string; look: Look; clip: Clip; dir: number }
  | { t: 'p'; k: string; outfit: Outfit; clip: PlayerClip; dir: number };

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<SpriteJob>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (ev) => {
  const j = ev.data;
  try {
    const frames = j.t === 'a' ? computeClip(j.look, j.clip, j.dir) : computePlayer(j.outfit, j.clip, j.dir);
    scope.postMessage({ t: j.t, k: j.k, frames }, frames.map((f) => f.img.data.buffer));
  } catch (err) {
    scope.postMessage({ t: 'err', k: j.k, msg: String(err) }, []);
  }
};
