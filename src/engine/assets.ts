// Carga de atlas y metadatos de zona generados por el pipeline de arte.
import type { Box } from './iso.ts';

export interface SpriteRef {
  img: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
  /** origen en pantalla-mundo */
  ox: number;
  oy: number;
}

export interface ZoneMeta {
  name: string;
  tilesW: number;
  tilesH: number;
  ground: string[];
  objects: { sprite: string; night: string | null; box: Box; occluder: boolean; kind: string }[];
  lights: { x: number; y: number; z: number; kind: 'lamp' | 'wall' | 'kiosk' }[];
  smoke: [number, number, number][];
  steam: [number, number, number][];
  lines: [[number, number, number], [number, number, number]][];
  shelters: [number, number, number, number][];
  fountains: { spouts: [number, number, number, number, number][]; basin: { cx: number; cy: number; r: number; z: number }; bowl: { cx: number; cy: number; r: number; z: number } }[];
  height: number[];
  walk: number[];
  spawn: [number, number];
  benches: [number, number][];
}

export interface ZoneAssets {
  meta: ZoneMeta;
  sprites: Map<string, SpriteRef>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('No se pudo cargar ' + src));
    img.src = src;
  });
}

export async function loadZone(name: string): Promise<ZoneAssets> {
  const base = import.meta.env.BASE_URL + 'gen/';
  const json = await (await fetch(base + name + '.json')).json();
  const pages = await Promise.all((json.atlas as string[]).map((f) => loadImage(base + f)));
  const sprites = new Map<string, SpriteRef>();
  for (const [k, v] of Object.entries(json.sprites as Record<string, number[]>)) {
    sprites.set(k, { img: pages[v[0]], x: v[1], y: v[2], w: v[3], h: v[4], ox: v[5], oy: v[6] });
  }
  return { meta: json.zone as ZoneMeta, sprites };
}
