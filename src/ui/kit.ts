// Utilidades de interfaz: escala de píxel de la UI, marcos y elementos básicos.
import { frames, icon } from './art.ts';

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
  return el('button', { class: `btn ui-text ${cls}`, onclick: () => onClick() }, label);
}

/** Hoja inferior con animación de entrada/salida. */
export class Sheet {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;
  constructor(title: string, cls = '') {
    this.body = el('div', { class: 'scroll' });
    this.root = el('div', { class: `sheet panel ui-text ${cls}` }, el('div', { class: 'title' }, title), this.body);
    document.getElementById('ui')!.appendChild(this.root);
  }
  open(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('open')));
  }
  close(): Promise<void> {
    this.root.classList.remove('open');
    return new Promise((res) => setTimeout(() => {
      this.root.remove();
      res();
    }, 400));
  }
}
