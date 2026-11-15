// Recordatorio diario opcional: se apoya en Periodic Background Sync (Chrome para Android con la
// app instalada). El service worker lee de la caché cuándo se jugó por última vez.
const TAG = 'whiskers-recordatorio';
const ESTADO = 'whiskers-estado';

type PeriodicReg = ServiceWorkerRegistration & {
  periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void>; unregister(tag: string): Promise<void> };
};

export type ReminderResult = 'ok' | 'denied' | 'unsupported';

export async function setReminder(on: boolean): Promise<ReminderResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = (await navigator.serviceWorker.getRegistration()) as PeriodicReg | undefined;
  if (!on) {
    await reg?.periodicSync?.unregister(TAG).catch(() => undefined);
    return 'ok';
  }
  if (!reg?.periodicSync || !('Notification' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (st.state !== 'granted') return 'unsupported';
    await reg.periodicSync.register(TAG, { minInterval: 12 * 3600e3 });
    return 'ok';
  } catch {
    return 'unsupported';
  }
}

/** Guarda para el service worker si el recordatorio está activo, cuándo se jugó y a quién echar de menos. */
export function syncReminderState(on: boolean, lastSeen: number, name: string): void {
  if (typeof caches === 'undefined') return;
  void caches.open(ESTADO).then(async (c) => {
    const prev = await c.match('estado').then((r) => (r ? r.json() : {})).catch(() => ({}));
    await c.put('estado', new Response(JSON.stringify({ ...prev, on, lastSeen, name })));
  }).catch(() => undefined);
}
