import { describe, it, expect } from 'vitest';
import { migrate, newSave, exportJSON, importJSON, load, store, CURRENT_VERSION } from '../src/save/save.ts';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

describe('guardado', () => {
  it('crea una partida nueva en la versión actual', () => {
    expect(newSave().v).toBe(CURRENT_VERSION);
  });
  it('migra partidas sin versión y rellena campos', () => {
    const d = migrate({ outfit: { hair: 'rizos' } });
    expect(d.v).toBe(CURRENT_VERSION);
    expect(d.outfit.hair).toBe('rizos');
    expect(d.outfit.skin).toBeTruthy();
    expect(d.settings.music).toBeGreaterThan(0);
  });
  it('rechaza partidas de versiones futuras', () => {
    expect(() => migrate({ v: 999 })).toThrow();
  });
  it('exporta e importa sin perder datos', () => {
    const d = newSave(123);
    d.unlocked.push('gorro-navidad');
    const back = importJSON(exportJSON(d));
    expect(back.unlocked).toEqual(['gorro-navidad']);
    expect(back.created).toBe(123);
  });
  it('rechaza archivos que no son de Whiskers', () => {
    expect(() => importJSON(JSON.stringify({ juego: 'otro' }))).toThrow();
  });
  it('guarda y carga en un almacenamiento', () => {
    const m = new Mem();
    const d = newSave();
    d.characterDone = true;
    store(d, m);
    expect(load(m).characterDone).toBe(true);
  });
  it('una partida corrupta no rompe el juego', () => {
    const m = new Mem();
    m.setItem('whiskers.save', '{no es json');
    expect(load(m).v).toBe(CURRENT_VERSION);
  });
});
