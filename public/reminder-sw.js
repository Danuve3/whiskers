// Recordatorio diario opcional de Whiskers (lo importa el service worker generado).
// Usa Periodic Background Sync: Chrome para Android con la app instalada. Solo avisa si ha pasado
// casi un día sin jugar, y como mucho una vez al día.
const ESTADO = 'whiskers-estado';
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'whiskers-recordatorio') return;
  event.waitUntil((async () => {
    const cache = await caches.open(ESTADO);
    const r = await cache.match('estado');
    if (!r) return;
    const s = await r.json();
    const now = Date.now();
    if (!s.on || now - s.lastSeen < 20 * 3600e3 || now - (s.lastNotified || 0) < 20 * 3600e3) return;
    await self.registration.showNotification('Whiskers', {
      body: `${s.name || 'Nemesio'} te echa de menos. ¿Pasas a verle?`,
      icon: 'gen/icon-192.png',
      badge: 'gen/icon-192.png',
      tag: 'whiskers-recordatorio',
    });
    s.lastNotified = now;
    await cache.put('estado', new Response(JSON.stringify(s)));
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
