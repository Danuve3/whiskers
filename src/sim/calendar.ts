// Calendario real: estaciones, fase lunar, fiestas del barrio y horas de sol (latitud gallega).
export type Season = 'primavera' | 'verano' | 'otoño' | 'invierno';
export type EventId = 'samain' | 'magosto' | 'navidad' | 'sanjuan' | 'entroido' | 'animales';

export const EVENTS: Record<EventId, { name: string; blurb: string }> = {
  samain: { name: 'Samaín', blurb: 'Calabazas talladas con luz en las puertas. Los gatos negros están de moda.' },
  magosto: { name: 'Magosto', blurb: 'Huele a castañas asadas y a hojas secas. Hay castañas para los perros.' },
  navidad: { name: 'Navidad', blurb: 'Guirnaldas de luces entre los balcones y gorritos para todos.' },
  sanjuan: { name: 'San Juan', blurb: 'Hoguera en la plaza y sardinas en el puerto. La noche más corta.' },
  entroido: { name: 'Entroido', blurb: 'Carnaval: banderines de colores y confeti por todas partes.' },
  animales: { name: 'Día de los animales', blurb: 'San Francisco de Asís: los vecinos traen regalos para los animales.' },
};

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function season(d: Date): Season {
  const m = d.getMonth() + 1, day = d.getDate();
  const md = m * 100 + day;
  if (md >= 320 && md < 621) return 'primavera';
  if (md >= 621 && md < 922) return 'verano';
  if (md >= 922 && md < 1221) return 'otoño';
  return 'invierno';
}

/** Fase lunar 0..1 (0 = nueva, 0.5 = llena) a partir de una luna nueva conocida. */
export function moonPhase(d: Date): number {
  const SYNODIC = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const days = (d.getTime() - ref) / 86_400_000;
  return (((days / SYNODIC) % 1) + 1) % 1;
}

export function isFullMoon(d: Date): boolean {
  const p = moonPhase(d);
  return Math.abs(p - 0.5) < 0.034; // ±1 día
}

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function between(d: Date, m0: number, d0: number, m1: number, d1: number): boolean {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const a = m0 * 100 + d0, b = m1 * 100 + d1;
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

export function activeEvents(d: Date): EventId[] {
  const out: EventId[] = [];
  if (between(d, 10, 28, 11, 1)) out.push('samain');
  if (between(d, 11, 8, 11, 14)) out.push('magosto');
  if (between(d, 12, 20, 1, 6)) out.push('navidad');
  if (between(d, 6, 22, 6, 24)) out.push('sanjuan');
  if (between(d, 10, 4, 10, 4)) out.push('animales');
  // Entroido: del sábado al martes de carnaval (Pascua − 50 … − 47)
  const e = easter(d.getFullYear()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((e - t) / 86_400_000);
  if (diff >= 47 && diff <= 50) out.push('entroido');
  return out;
}

/** Amanecer y anochecer aproximados (hora local) para la latitud de Galicia (~43° N). */
export function sunTimes(d: Date): { sunrise: number; sunset: number } {
  const doy = dayOfYear(d);
  // duración del día entre ~9 h (invierno) y ~15,3 h (verano)
  const decl = Math.cos(((doy - 172) / 365) * Math.PI * 2);
  const length = 12.15 + 3.15 * decl;
  // mediodía solar ~14:20 en verano (CEST) y ~13:20 en invierno (CET)
  const dst = isDST(d);
  const noon = (dst ? 14.35 : 13.35) - 0.05 * Math.sin(((doy - 3) / 365) * Math.PI * 2);
  return { sunrise: noon - length / 2, sunset: noon + length / 2 };
}

function isDST(d: Date): boolean {
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
  if (jan === jul) {
    // sin horario de verano en el sistema: aproximar con el calendario europeo
    const m = d.getMonth() + 1;
    return m > 3 && m < 11;
  }
  return d.getTimezoneOffset() < Math.max(jan, jul);
}

/**
 * Convierte la hora real en la hora «canónica» que usa la gradación de color
 * (amanecer a las 7, atardecer a las 20), de modo que la luz siga al sol de verdad.
 */
export function canonicalHour(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const { sunrise, sunset } = sunTimes(d);
  const R = 7, S = 20;
  if (h < sunrise) return (h / sunrise) * R;
  if (h < sunset) return R + ((h - sunrise) / (sunset - sunrise)) * (S - R);
  return S + ((h - sunset) / (24 - sunset)) * (24 - S);
}
