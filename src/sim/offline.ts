// Progreso offline: al volver, se calcula el tiempo transcurrido (con tope de 48 h).
import { decay, type AnimalData } from './model.ts';
import { feedFromFeeders, type PlacedFeeder } from './feeders.ts';

export const OFFLINE_CAP_H = 48;
/** cada cuánto llega alguien nuevo mientras no estás (horas) */
export const ARRIVAL_EVERY_H = 2;

export interface OfflineReport {
  hours: number;
  arrivals: number;
  missed: string[];
  /** raciones que han servido los comederos y bebederos mientras no estabas */
  served: number;
}

export function offlineHours(lastSeen: number, now: number): number {
  return Math.max(0, Math.min(OFFLINE_CAP_H, (now - lastSeen) / 3_600_000));
}

/** Aplica la caída leve de necesidades y decide cuántos animales nuevos llegan. */
export function applyOffline(animals: AnimalData[], lastSeen: number, now: number, freeSlots: number, feeders: PlacedFeeder[] = []): OfflineReport {
  const hours = offlineHours(lastSeen, now);
  for (const a of animals) decay(a, hours, now);
  const served = feedFromFeeders(animals, feeders);
  const arrivals = Math.min(freeSlots, Math.floor(hours / ARRIVAL_EVERY_H));
  // los amigos que más te han echado de menos (confianza alta y hambre)
  const missed = animals.filter((a) => a.trust >= 2 && a.hunger < 0.6).sort((a, b) => b.trust - a.trust).slice(0, 3).map((a) => a.name);
  return { hours, arrivals, missed, served };
}
