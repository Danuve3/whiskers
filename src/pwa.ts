// Registro del service worker con aviso discreto de nueva versión.
import { Workbox } from 'workbox-window';

export function registerPWA(onUpdate: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  wb.addEventListener('waiting', () => {
    onUpdate(() => {
      wb.addEventListener('controlling', () => window.location.reload());
      wb.messageSkipWaiting();
    });
  });
  void wb.register();
}
