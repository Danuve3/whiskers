// Ajustes: mezclador (música, efectos, ambiente), silencio y exportar/importar la partida.
import { Sheet, el, button, setHaptics, haptic } from './kit.ts';
import { exportJSON, importJSON, type SaveData } from '../save/save.ts';
import { toast } from './animalUI.ts';

export function openSettings(save: SaveData, applyAudio: () => void, onImport: (d: SaveData) => void): void {
  const sheet = new Sheet('Ajustes', 'settings');
  const S = save.settings;
  const slider = (label: string, key: 'music' | 'sfx' | 'ambient') => {
    const input = el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(S[key] * 100)), class: 'range' });
    input.addEventListener('input', () => {
      S[key] = Number(input.value) / 100;
      applyAudio();
    });
    return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), input);
  };
  const mute = button(S.muted ? 'Activar sonido' : 'Silenciar', () => {
    S.muted = !S.muted;
    mute.textContent = S.muted ? 'Activar sonido' : 'Silenciar';
    applyAudio();
  });
  const vib = button(S.haptics === false ? 'Vibración: no' : 'Vibración: sí', () => {
    S.haptics = S.haptics === false;
    setHaptics(S.haptics);
    vib.textContent = S.haptics ? 'Vibración: sí' : 'Vibración: no';
    haptic(12);
  });
  const exp = button('Exportar partida', () => {
    const blob = new Blob([exportJSON(save)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `whiskers-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  const file = el('input', { type: 'file', accept: 'application/json,.json' });
  file.style.display = 'none';
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const d = importJSON(await f.text());
      onImport(d);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo leer la partida');
    }
  });
  const imp = button('Importar partida', () => file.click());
  const close = button('Cerrar', () => void sheet.close());
  sheet.body.append(
    slider('Música', 'music'), slider('Efectos', 'sfx'), slider('Ambiente', 'ambient'),
    el('div', { class: 'row center' }, mute, vib),
    el('div', { class: 'row center' }, exp, imp, file),
    el('div', { class: 'footer' }, close),
  );
  sheet.open();
}
