// Guardado en localStorage con esquema versionado, migraciones, autoguardado y exportar/importar.
import { DEFAULT_OUTFIT, type Outfit } from '../sprites/player.ts';

export const SAVE_KEY = 'whiskers.save';
export const CURRENT_VERSION = 1;

export interface Settings {
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
  /** vibración suave (por defecto, sí) */
  haptics?: boolean;
  /** recordatorio diario (por defecto, no) */
  reminder?: boolean;
}

export interface SaveData {
  v: number;
  created: number;
  /** última vez que se jugó (ms) — para el progreso offline */
  lastSeen: number;
  outfit: Outfit;
  /** prendas y objetos desbloqueados */
  unlocked: string[];
  settings: Settings;
  /** ¿ya se creó el personaje? */
  characterDone: boolean;
  tutorialDone: boolean;
  /** datos de juego que crecen en hitos posteriores */
  world: Record<string, unknown>;
}

export function newSave(now = Date.now()): SaveData {
  return {
    v: CURRENT_VERSION, created: now, lastSeen: now, outfit: { ...DEFAULT_OUTFIT }, unlocked: [],
    settings: { music: 0.7, sfx: 0.8, ambient: 0.7, muted: false }, characterDone: false, tutorialDone: false, world: {},
  };
}

/** Migraciones: MIGRATIONS[n] convierte de la versión n a la n+1. */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: (d) => ({ ...newSave(), ...d, v: 1 }),
};

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return newSave();
  let d = raw as Record<string, unknown>;
  let v = typeof d.v === 'number' ? d.v : 0;
  if (v > CURRENT_VERSION) throw new Error('Partida de una versión más nueva del juego');
  while (v < CURRENT_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error('No hay migración desde la versión ' + v);
    d = m(d);
    v = d.v as number;
  }
  // completar campos que falten (robustez ante partidas parciales)
  const base = newSave();
  const out = { ...base, ...d } as SaveData;
  out.outfit = { ...base.outfit, ...(out.outfit ?? {}) };
  out.settings = { ...base.settings, ...(out.settings ?? {}) };
  return out;
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function load(storage: Storage | null = safeStorage()): SaveData {
  try {
    const s = storage?.getItem(SAVE_KEY);
    return s ? migrate(JSON.parse(s)) : newSave();
  } catch {
    return newSave();
  }
}

export function store(d: SaveData, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    /* almacenamiento lleno o bloqueado: se intentará más tarde */
  }
}

export function exportJSON(d: SaveData): string {
  return JSON.stringify({ juego: 'whiskers', ...d }, null, 2);
}

export function importJSON(text: string): SaveData {
  const raw = JSON.parse(text);
  if (raw && typeof raw === 'object' && 'juego' in raw && raw.juego !== 'whiskers') throw new Error('Este archivo no es una partida de Whiskers');
  delete raw.juego;
  return migrate(raw);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
