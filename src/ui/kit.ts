// Utilidades de interfaz: escala de píxel de la UI, marcos y elementos básicos.
import { frames, icon } from './art.ts';
import * as sfx from '../audio/sfx.ts';

export function setupUI(): void {
  const root = document.documentElement;
  const f = frames();
  root.style.setProperty('--panel-img', `url(${f.panel.url})`);
  root.style.setProperty('--btn-img', `url(${f.btn.url})`);
  root.style.setProperty('--btn-on-img', `url(${f.btnOn.url})`);
  root.style.setProperty('--btn-down-img', `url(${f.btnDown.url})`);
  const scale = () => {
    // píxel de interfaz en px CSS: entero en píxeles de dispositivo siempre que se pueda
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(window.innerWidth, window.innerHeight * 0.75);
    const css = w < 360 ? 1.5 : w < 560 ? 2 : 3;
    const dev = Math.max(1, Math.round(css * dpr));
    root.style.setProperty('--u', `${dev / dpr}px`);
  };
  scale();
  addEventListener('resize', scale);
}

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (typeof v === 'boolean') {
      if (v) e.setAttribute(k, '');
    } else e.setAttribute(k, String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined) e.append(k);
  return e;
}

export function iconImg(name: string, cls = 'icon'): HTMLImageElement {
  return el('img', { src: icon(name), class: cls, alt: '', draggable: 'false' });
}

export function button(label: string | Node, onClick: () => void, cls = ''): HTMLButtonElement {
  return el('button', { class: `btn ui-text ${cls}`, onclick: () => {
    sfx.ui('tap');
    onClick();
  } }, label);
}

/** Hoja inferior con animación de entrada/salida. */
// ---------------------------------------------------------------- Botón «atrás» (Android)
// Una entrada de historial hace de guarda mientras haya algo abierto: «atrás» cierra lo último
// abierto en vez de salir del juego.
const backStack: (() => void)[] = [];
let guard = false;
export function onBack(close: () => void): () => void {
  backStack.push(close);
  if (!guard && typeof history !== 'undefined') {
    history.pushState({ whiskers: 1 }, '');
    guard = true;
  }
  return () => {
    const i = backStack.lastIndexOf(close);
    if (i >= 0) backStack.splice(i, 1);
  };
}
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    guard = false;
    const f = backStack.pop();
    if (!f) return;
    f();
    if (backStack.length) {
      history.pushState({ whiskers: 1 }, '');
      guard = true;
    }
  });

// ---------------------------------------------------------------- Vibración suave
let hapticsOn = true;
export function setHaptics(on: boolean): void {
  hapticsOn = on;
}
export function haptic(pattern: number | number[]): void {
  if (!hapticsOn || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* sin vibración */
  }
}

export class Sheet {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;
  private offBack?: () => void;
  private closing = false;
  constructor(title: string, cls = '') {
    this.body = el('div', { class: 'scroll' });
    const grab = el('div', { class: 'grab' });
    const head = el('div', { class: 'title' }, title);
    this.root = el('div', { class: `sheet panel ui-text ${cls}` }, grab, head, this.body);
    document.getElementById('ui')!.appendChild(this.root);
    // deslizar hacia abajo desde el asa o el título para cerrar
    for (const h of [grab, head]) this.swipe(h);
  }
  private swipe(handle: HTMLElement): void {
    let y0 = 0, t0 = 0, dy = 0, id = -1;
    handle.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      y0 = e.clientY;
      t0 = performance.now();
      dy = 0;
      handle.setPointerCapture(id);
      this.root.style.transition = 'none';
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      this.root.style.transform = `translate(-50%, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.root.style.transition = '';
      const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
      this.root.style.transform = '';
      if (dy > 80 || (fast && dy > 24)) void this.close();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  open(): void {
    sfx.ui('open');
    this.offBack = onBack(() => void this.close());
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('open')));
  }
  close(): Promise<void> {
    if (this.closing) return Promise.resolve();
    this.closing = true;
    this.offBack?.();
    sfx.ui('close');
    this.root.classList.remove('open');
    return new Promise((res) => setTimeout(() => {
      this.root.remove();
      res();
    }, 400));
  }
}
