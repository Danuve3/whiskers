// Entrada táctil y de ratón: tocar, arrastrar para mover la cámara, pellizcar / rueda para zoom.
export interface InputHandlers {
  tap(cssX: number, cssY: number): void;
  drag(dxCss: number, dyCss: number): void;
  dragEnd(): void;
  zoom(step: 1 | -1): void;
  firstGesture(): void;
}

export function attachInput(el: HTMLElement, h: InputHandlers): void {
  const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let dragging = false;
  let pinchStart = 0;
  let pinchDone = 0;
  let gestured = false;
  const TAP_SLOP = 10;

  el.addEventListener('pointerdown', (e) => {
    if (!gestured) {
      gestured = true;
      h.firstGesture();
    }
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchDone = 0;
      dragging = true;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = d / pinchStart;
      if (ratio > 1.35 && pinchDone < 1) {
        h.zoom(1);
        pinchStart = d;
      } else if (ratio < 0.74 && pinchDone > -1) {
        h.zoom(-1);
        pinchStart = d;
      }
      return;
    }
    if (!dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) dragging = true;
    if (dragging) h.drag(dx, dy);
  });
  const up = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    pts.delete(e.pointerId);
    if (!dragging && pts.size === 0 && e.type === 'pointerup') h.tap(e.clientX, e.clientY);
    if (pts.size === 0) {
      if (dragging) h.dragEnd();
      dragging = false;
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    h.zoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
