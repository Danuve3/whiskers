// Comederos y bebederos colocados: tienen una reserva de raciones que los animales de su zona
// gastan al comer o beber, también mientras no estás o mientras estás en otra zona.
import type { AnimalData } from './model.ts';

export const SERVINGS = 8;

export interface PlacedFeeder {
  id: string;
  zone: string;
  /** reserva 0..1 (1 = lleno, SERVINGS raciones); sin definir = lleno */
  fill?: number;
}

export function isFeeder(id: string): id is 'comedero' | 'bebedero' {
  return id === 'comedero' || id === 'bebedero';
}

/** Una ración del comedero (o bebedero) para un animal. */
export function serve(f: PlacedFeeder, a: AnimalData): boolean {
  f.fill ??= 1;
  if (f.fill < 1 / SERVINGS - 1e-6) return false;
  if (f.id === 'comedero') a.hunger = Math.min(1, a.hunger + 0.4);
  else a.thirst = Math.min(1, a.thirst + 0.4);
  a.wellbeing = Math.min(1, a.wellbeing + 0.04);
  f.fill = Math.max(0, f.fill - 1 / SERVINGS);
  return true;
}

/** Los animales que no ves comen solos de los comederos de su zona. Devuelve las raciones servidas. */
export function feedFromFeeders(animals: AnimalData[], placed: PlacedFeeder[], skipZone?: string): number {
  let used = 0;
  for (const f of placed) {
    if (!isFeeder(f.id) || f.zone === skipZone) continue;
    const key = f.id === 'comedero' ? 'hunger' : 'thirst';
    for (const a of animals) {
      if (a.zone !== f.zone) continue;
      while (a[key] < 0.5 && serve(f, a)) used++;
    }
  }
  return used;
}
