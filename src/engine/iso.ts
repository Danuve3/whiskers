// Proyección isométrica 2:1. Unidades de mundo = vóxeles (16 por tile; z en píxeles).
export const TILE = 16;

export function sx(x: number, y: number): number {
  return 2 * (x - y);
}
export function sy(x: number, y: number, z: number): number {
  return x + y - z;
}

/** Punto de suelo a altura z que cae en la coordenada de pantalla-mundo (px, py). */
export function screenToWorld(px: number, py: number, z: number): [number, number] {
  const a = px / 2; // x − y
  const b = py + z; // x + y
  return [(a + b) / 2, (b - a) / 2];
}

export type Box = [number, number, number, number, number, number];

/** ¿Está la caja A detrás de B? (cajas que no se interpenetran) */
export function boxBehind(A: Box, B: Box): boolean {
  if (A[3] <= B[0]) return true;
  if (B[3] <= A[0]) return false;
  if (A[4] <= B[1]) return true;
  if (B[4] <= A[1]) return false;
  if (A[5] <= B[2]) return true;
  if (B[5] <= A[2]) return false;
  return A[0] + A[1] + A[3] + A[4] < B[0] + B[1] + B[3] + B[4];
}
