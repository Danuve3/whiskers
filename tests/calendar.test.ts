import { describe, it, expect } from 'vitest';
import { season, moonPhase, isFullMoon, easter, activeEvents, sunTimes, canonicalHour } from '../src/sim/calendar.ts';
import { dailySkies, weatherAt, skyAt } from '../src/sim/weather.ts';

describe('calendario', () => {
  it('estaciones por fecha', () => {
    expect(season(new Date(2026, 0, 15))).toBe('invierno');
    expect(season(new Date(2026, 3, 15))).toBe('primavera');
    expect(season(new Date(2026, 6, 15))).toBe('verano');
    expect(season(new Date(2026, 10, 14))).toBe('otoño');
    expect(season(new Date(2026, 11, 25))).toBe('invierno');
  });
  it('fase lunar coincide con lunas llenas conocidas', () => {
    // luna llena: 13 ene 2025, 5 nov 2025
    expect(isFullMoon(new Date(Date.UTC(2025, 0, 13, 22)))).toBe(true);
    expect(isFullMoon(new Date(Date.UTC(2025, 10, 5, 13)))).toBe(true);
    // luna nueva: 29 ene 2025
    expect(moonPhase(new Date(Date.UTC(2025, 0, 29, 12)))).toBeLessThan(0.04);
    expect(isFullMoon(new Date(Date.UTC(2025, 0, 29, 12)))).toBe(false);
  });
  it('Pascua', () => {
    expect(easter(2025).toDateString()).toBe(new Date(2025, 3, 20).toDateString());
    expect(easter(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easter(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it('fiestas del barrio', () => {
    expect(activeEvents(new Date(2026, 9, 31))).toContain('samain');
    expect(activeEvents(new Date(2026, 10, 11))).toContain('magosto');
    expect(activeEvents(new Date(2026, 11, 25))).toContain('navidad');
    expect(activeEvents(new Date(2027, 0, 3))).toContain('navidad');
    expect(activeEvents(new Date(2026, 5, 23))).toContain('sanjuan');
    expect(activeEvents(new Date(2026, 9, 4))).toContain('animales');
    // Entroido 2026: martes de carnaval 17 de febrero
    expect(activeEvents(new Date(2026, 1, 17))).toContain('entroido');
    expect(activeEvents(new Date(2026, 4, 10))).toEqual([]);
  });
  it('los días son más largos en verano y la hora canónica respeta el orden', () => {
    const w = sunTimes(new Date(2026, 11, 21)), s = sunTimes(new Date(2026, 5, 21));
    expect(s.sunset - s.sunrise).toBeGreaterThan(w.sunset - w.sunrise + 4);
    expect(w.sunrise).toBeGreaterThan(8);
    expect(s.sunset).toBeGreaterThan(21.5);
    let prev = -1;
    for (let h = 0; h < 24; h += 0.5) {
      const c = canonicalHour(new Date(2026, 5, 21, Math.floor(h), (h % 1) * 60));
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });
});

describe('clima diario', () => {
  it('es determinista por fecha', () => {
    expect(dailySkies(new Date(2026, 10, 14, 9))).toEqual(dailySkies(new Date(2026, 10, 14, 18)));
  });
  it('solo nieva en invierno y la niebla no aparece por la tarde-noche', () => {
    for (let d = 0; d < 365; d++) {
      const date = new Date(2026, 0, 1 + d);
      const skies = dailySkies(date);
      if (season(date) !== 'invierno') expect(skies).not.toContain('nieve');
      expect(skies[2]).not.toBe('niebla');
      expect(skies[3]).not.toBe('niebla');
    }
  });
  it('llueve a menudo pero no siempre', () => {
    let rainy = 0;
    for (let d = 0; d < 365; d++) if (dailySkies(new Date(2026, 0, 1 + d)).some((s) => s === 'lluvia' || s === 'orballo')) rainy++;
    expect(rainy).toBeGreaterThan(60);
    expect(rainy).toBeLessThan(300);
  });
  it('las transiciones son suaves', () => {
    const a = weatherAt(new Date(2026, 10, 14, 12, 50));
    const b = weatherAt(new Date(2026, 10, 14, 13, 5));
    expect(Math.abs(a.rain - b.rain)).toBeLessThan(0.6);
    expect(['sol', 'nublado', 'lluvia', 'orballo', 'niebla', 'nieve']).toContain(skyAt(new Date()));
  });
});
