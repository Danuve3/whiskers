// Modelo de cuadrúpedo (gatos y perros) parametrizado por silueta y pose.
// Espacio local: x hacia delante, y a la izquierda, z arriba; suelo en z = 0.
import { type Prim, type V3, ell, sphere, capsule, add, sub, rot, len, mul } from './rig.ts';

export const REG = { FUR: 0, BELLY: 1, NOSE: 2, EAR_IN: 3, PAW: 4, EYE: 5, TONGUE: 6, MUZZLE: 7 } as const;
export const PART = { BODY: 1, CHEST: 2, HIPS: 3, NECK: 4, HEAD: 5, SNOUT: 6, EAR_L: 7, EAR_R: 8, TAIL: 9, LEG_FL: 10, LEG_FR: 11, LEG_HL: 12, LEG_HR: 13, JOWL: 14 } as const;

export type EarType = 'cat' | 'tuft' | 'rose' | 'drop' | 'bat' | 'prick' | 'long' | 'fold' | 'big';
export type TailType = 'cat' | 'fluffy' | 'whip' | 'curl' | 'stub' | 'otter' | 'sabre' | 'plume';

export interface Shape {
  species: 'cat' | 'dog';
  /** altura de hombros/caderas (articulación superior de la pata) */
  legH: number;
  /** distancia entre articulaciones delanteras y traseras */
  bodyLen: number;
  chest: [number, number, number]; // radios
  hips: [number, number, number];
  belly: [number, number, number];
  /** elevación del vientre respecto a la línea de articulaciones (galgo: recogido) */
  tuck: number;
  neckLen: number;
  neckR: number;
  neckAngle: number; // radianes sobre la horizontal
  head: [number, number, number];
  snout: [number, number, number]; // radios del hocico
  snoutLen: number; // distancia del centro de la cabeza al centro del hocico
  stop: number; // caída del hocico respecto a la cabeza
  ear: EarType;
  earSize: number;
  tail: TailType;
  tailLen: number;
  tailR: number;
  legR: [number, number]; // radio arriba, abajo
  paw: number;
  legSpread: number;
  /** pelo largo: piezas más gordas y contorno algo esponjoso */
  fluff: number;
  eyeSize: 1 | 2 | 3;
  jowls?: boolean;
  /** pompones de caniche */
  pompom?: boolean;
}

export interface Pose {
  /** desplazamiento del cuerpo (x, z) */
  bodyX: number;
  bodyZ: number;
  /** cabeceo del tronco (rad, + = delante arriba) */
  pitch: number;
  /** respiración (0..1) */
  breath: number;
  headDx: number;
  headDz: number;
  headPitch: number; // + mira arriba
  headYaw: number;
  headRoll: number;
  earBack: number; // 0..1 orejas hacia atrás
  earTwitch: number; // −1..1
  tailLift: number; // −1 (caída) .. 1 (erguida)
  tailWag: number; // −1..1
  tailCurl: number; // 0..1 extra
  /** pies: [FL, FR, HL, HR] en local (x, z de altura del pie) */
  feet: [number, number][];
  /** 0..1 sentado */
  sit: number;
  /** 0..1 tumbado (esfinge) */
  lie: number;
  /** dormido enroscado */
  curl: number;
  mouth: number; // 0 cerrada, 1 abierta
  tongue: number;
  /** pata trasera levantada para rascarse (0..1) y fase */
  scratch: number;
  /** pata delantera levantada (lamerse) */
  pawLift: number;
  /** 0..1 estiramiento (patas delante, pecho abajo) */
  stretch: number;
  /** agazapado (cauteloso / huida) */
  crouch: number;
}

export function basePose(): Pose {
  return {
    bodyX: 0, bodyZ: 0, pitch: 0, breath: 0, headDx: 0, headDz: 0, headPitch: 0, headYaw: 0, headRoll: 0,
    earBack: 0, earTwitch: 0, tailLift: 0.3, tailWag: 0, tailCurl: 0,
    feet: [[0, 0], [0, 0], [0, 0], [0, 0]], sit: 0, lie: 0, curl: 0, mouth: 0, tongue: 0, scratch: 0, pawLift: 0, stretch: 0, crouch: 0,
  };
}

export interface Built {
  prims: Prim[];
  /** frente (para marcas especiales) */
  brow?: V3;
  eyes: V3[]; // [cerca, lejos]
  nose: V3;
  mouth: V3;
  head: V3;
}

/** Cinemática inversa de dos huesos en el plano sagital. bendDir: +1 articulación hacia delante. */
function ik2(hip: V3, foot: V3, l1: number, l2: number, bendDir: number): V3 {
  const d = sub(foot, hip);
  let D = len(d);
  const maxD = (l1 + l2) * 0.999;
  if (D > maxD) D = maxD;
  const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const dn = mul(d, 1 / (len(d) || 1));
  // perpendicular en el plano x-z
  const perp: V3 = [-dn[2] * bendDir, 0, dn[0] * bendDir];
  return add(add(hip, mul(dn, a)), mul(perp, hgt));
}

export function buildQuad(S: Shape, P: Pose): Built {
  if (P.curl > 0) return curled(S, P);
  const prims: Prim[] = [];
  const F = 1 + S.fluff * 0.12;
  // Colocación del tronco por pose: hombro y cadera explícitos; la inclinación sale de su vector.
  const crouchZ = -P.crouch * S.legH * 0.28;
  const sitK = P.sit, lieK = P.lie, strK = P.stretch;
  const half = S.bodyLen / 2;
  // de pie
  let sh: V3 = [P.bodyX + half, 0, S.legH + 1 + P.bodyZ + crouchZ];
  let hq: V3 = [P.bodyX - half, 0, S.legH + P.bodyZ + crouchZ];
  // sentado: patas delanteras rectas, grupa en el suelo
  if (sitK > 0) {
    const shZ = S.legH + 1 - S.chest[2] * 0.05;
    const hipZ = S.hips[2] * 0.85;
    const dz = shZ - hipZ;
    const dx = Math.sqrt(Math.max(S.bodyLen * S.bodyLen * 0.85 - dz * dz, S.bodyLen * S.bodyLen * 0.12));
    const shS: V3 = [half * 0.6, 0, shZ], hqS: V3 = [half * 0.6 - dx, 0, hipZ];
    sh = lerp(sh, shS, sitK);
    hq = lerp(hq, hqS, sitK);
  }
  // tumbado (esfinge)
  if (lieK > 0) {
    sh = lerp(sh, [half, 0, S.chest[2] * 0.95], lieK);
    hq = lerp(hq, [-half, 0, S.hips[2] * 0.9], lieK);
  }
  // estiramiento: pecho abajo y adelante, grupa arriba
  if (strK > 0) {
    sh = lerp(sh, [half + S.bodyLen * 0.15, 0, S.chest[2] * 1.1 + S.legH * 0.25], strK);
    hq = lerp(hq, [-half + S.bodyLen * 0.1, 0, S.legH + 1], strK);
  }
  const pitch = Math.atan2(sh[2] - hq[2], sh[0] - hq[0]) + P.pitch;
  const shoulder = sh;
  const hip = hq;
  const shoulderS = sh;
  const br = 1 + P.breath * 0.06;
  // pecho, caderas y vientre
  prims.push(ell(add(shoulderS, [0, 0, 0]), S.chest[0] * F, S.chest[1] * F * br, S.chest[2] * F * br, REG.FUR, PART.BODY, 0, pitch));
  prims.push(ell(add(hip, [0, 0, 0.5]), S.hips[0] * F, S.hips[1] * F, S.hips[2] * F, REG.FUR, PART.BODY, 0, pitch));
  const mid = add(mul(add(shoulderS, hip), 0.5), [0, 0, S.tuck]);
  prims.push(ell(mid, S.belly[0] * F, S.belly[1] * F * br, S.belly[2] * F * br, REG.FUR, PART.BODY, 0, pitch * 0.8));
  // pecho claro (vientre) un poco por debajo y delante
  prims.push(ell(add(shoulderS, rot([S.chest[0] * 0.35, 0, -S.chest[2] * 0.42], 0, pitch)), S.chest[0] * 0.62 * F, S.chest[1] * 0.78 * F, S.chest[2] * 0.6 * F, REG.BELLY, PART.BODY, 0, pitch));

  // cuello y cabeza
  const neckBase = add(shoulderS, rot([S.chest[0] * 0.55, 0, S.chest[2] * 0.45], 0, pitch));
  const na = S.neckAngle + P.headPitch * 0.4 - P.stretch * 0.6 - P.crouch * 0.5 + P.lie * 0.15;
  const headC = add(neckBase, [Math.cos(na) * S.neckLen + P.headDx, 0, Math.sin(na) * S.neckLen + P.headDz]);
  capsule(prims, neckBase, headC, S.neckR * F, S.neckR * 0.85 * F, REG.FUR, PART.BODY);
  const hy = P.headYaw, hp = -P.headPitch * 0.8 + 0.08, hr = P.headRoll;
  const hrot = (v: V3): V3 => add(headC, rot(v, hy, -hp, hr));
  prims.push(ell(headC, S.head[0] * F, S.head[1] * F, S.head[2] * F, REG.FUR, PART.HEAD, hy, -hp, hr));
  // hocico
  const snoutC = hrot([S.snoutLen, 0, -S.stop]);
  prims.push(ell(snoutC, S.snout[0], S.snout[1], S.snout[2], REG.MUZZLE, PART.SNOUT, hy, -hp, hr));
  if (S.jowls) {
    prims.push(ell(hrot([S.snoutLen * 0.8, S.snout[1] * 0.55, -S.stop - S.snout[2] * 0.5]), S.snout[0] * 0.6, S.snout[1] * 0.5, S.snout[2] * 0.6, REG.MUZZLE, PART.JOWL, hy, -hp, hr));
    prims.push(ell(hrot([S.snoutLen * 0.8, -S.snout[1] * 0.55, -S.stop - S.snout[2] * 0.5]), S.snout[0] * 0.6, S.snout[1] * 0.5, S.snout[2] * 0.6, REG.MUZZLE, PART.JOWL, hy, -hp, hr));
  }
  if (P.mouth > 0) {
    prims.push(ell(hrot([S.snoutLen + S.snout[0] * 0.2, 0, -S.stop - S.snout[2] * 0.9]), S.snout[0] * 0.5, S.snout[1] * 0.6, 0.9 + P.mouth * 0.8, REG.TONGUE, PART.SNOUT, hy, -hp, hr));
  }
  const nose = hrot([S.snoutLen + S.snout[0] * 0.95, 0, -S.stop + S.snout[2] * 0.35]);
  const mouth = hrot([S.snoutLen + S.snout[0] * 0.6, 0, -S.stop - S.snout[2] * 0.8]);
  const eyeX = S.head[0] * 0.78, eyeY = S.head[1] * 0.5, eyeZ = S.head[2] * 0.22;
  const eyes = [hrot([eyeX, eyeY, eyeZ]), hrot([eyeX, -eyeY, eyeZ])];
  const brow = hrot([S.head[0] * 0.7, 0, S.head[2] * 0.7]);
  if (S.pompom) prims.push(sphere(hrot([-S.head[0] * 0.2, 0, S.head[2] * 0.95]), S.head[0] * 0.75, REG.FUR, PART.HEAD));

  // orejas
  const es = S.earSize;
  for (const side of [1, -1]) {
    const part = side > 0 ? PART.EAR_L : PART.EAR_R;
    const back = P.earBack, tw = side > 0 ? P.earTwitch : -P.earTwitch * 0.5;
    const baseL: V3 = [-S.head[0] * 0.15, side * S.head[1] * 0.55, S.head[2] * 0.75];
    if (S.ear === 'cat' || S.ear === 'tuft' || S.ear === 'prick' || S.ear === 'bat' || S.ear === 'big') {
      const wide = S.ear === 'bat' || S.ear === 'big' ? 1.35 : 1;
      const tipL: V3 = [-S.head[0] * 0.15 - back * es * 0.8 + tw * 0.6, side * (S.head[1] * 0.75 + es * 0.22 * wide + back * es * 0.3), S.head[2] * 0.75 + es * (1 - back * 0.45)];
      const b = hrot(baseL), t = hrot(tipL);
      capsule(prims, b, t, es * 0.42 * wide, 0.35, REG.FUR, part);
      // interior rosado (un poco delante)
      const inB = hrot(add(baseL, [0.9, -side * 0.1, 0.4])), inT = hrot(add(tipL, [0.9, -side * 0.15, -es * 0.25]));
      if (back < 0.6) capsule(prims, inB, inT, es * 0.24 * wide, 0.2, REG.EAR_IN, part);
      if (S.ear === 'tuft') prims.push(sphere(hrot(add(tipL, [0, 0, 0.8])), 0.6, REG.FUR, part));
    } else if (S.ear === 'rose') {
      // orejas del galgo: plegadas hacia atrás
      const b = hrot([-S.head[0] * 0.35, side * S.head[1] * 0.6, S.head[2] * 0.55]);
      const t = hrot([-S.head[0] * 0.35 - es * 0.9, side * (S.head[1] * 0.75), S.head[2] * 0.35 + es * 0.25 * (1 - back) + tw * 0.5]);
      capsule(prims, b, t, es * 0.32, 0.5, REG.FUR, part);
    } else if (S.ear === 'drop' || S.ear === 'long' || S.ear === 'fold') {
      const drop = S.ear === 'long' ? 1.6 : S.ear === 'fold' ? 0.5 : 1;
      // oreja caída: un faldón fino pegado a la mejilla
      const top: V3 = [-S.head[0] * 0.15, side * S.head[1] * 0.92, S.head[2] * 0.45];
      const bot: V3 = [S.head[0] * 0.02 - back * es * 0.4, side * (S.head[1] * 1.0), S.head[2] * 0.45 - es * drop + tw * 0.4];
      const mid = hrot(lerp(top, bot, 0.5));
      const len = Math.hypot(bot[0] - top[0], bot[2] - top[2]);
      const tilt = Math.atan2(bot[0] - top[0], top[2] - bot[2]);
      prims.push(ell(mid, es * 0.36, 1.1, len * 0.62, REG.FUR, part, hy, -hp + tilt, hr));
    }
  }

  // patas
  const legs: { root: V3; idx: number; front: boolean; side: number; part: number }[] = [
    { root: add(shoulderS, rot([0, 0, -S.chest[2] * 0.2], 0, pitch)), idx: 0, front: true, side: 1, part: PART.LEG_FL },
    { root: add(shoulderS, rot([0, 0, -S.chest[2] * 0.2], 0, pitch)), idx: 1, front: true, side: -1, part: PART.LEG_FR },
    { root: hip, idx: 2, front: false, side: 1, part: PART.LEG_HL },
    { root: hip, idx: 3, front: false, side: -1, part: PART.LEG_HR },
  ];
  for (const L of legs) {
    const far = L.side < 0;
    const bias = far ? -1 : 0;
    const y = L.side * S.legSpread;
    const root: V3 = [L.root[0], y, L.root[2]];
    const ft = P.feet[L.idx];
    let foot: V3;
    if (L.front) foot = [shoulder[0] + ft[0] + P.stretch * S.legH * 0.7, y, ft[1]];
    else foot = [hip[0] + ft[0] + sitK * S.legH * 0.5, y + L.side * sitK * 0.8, ft[1]];
    if (lieK > 0) {
      const lf: V3 = L.front ? [shoulder[0] + S.legH * 0.85, y, 1.2] : [hip[0] + S.legH * 0.55, y + L.side * 1.5, 1.2];
      foot = lerp(foot, lf, lieK);
    }
    if (!L.front && P.scratch > 0 && L.side > 0) {
      // pata trasera hacia la oreja
      foot = add(headC, [-S.head[0] * 0.8, S.head[1] * 0.9, -S.head[2] * 0.6 + Math.sin(P.scratch * Math.PI * 2) * 1.5]);
    }
    if (L.front && P.pawLift > 0 && L.side > 0) {
      foot = add(lerp(foot, add(mouth, [0.5, 1.5, -1.5]), P.pawLift), [0, 0, 0]);
    }
    // longitudes a partir de la altura de la articulación en pie (patas casi rectas)
    const rootZ0 = L.front ? S.legH + 1 - S.chest[2] * 0.2 : S.legH;
    const legLen = rootZ0 * (L.front ? 1.03 : 1.07);
    const l1 = legLen * (L.front ? 0.5 : 0.48), l2 = legLen * (L.front ? 0.5 : 0.52);
    const knee = ik2(root, foot, l1, l2, L.front ? 1 : -1);
    const reg = REG.FUR;
    if (!L.front) {
      // muslo con volumen
      prims.push(ell(add(root, [0.5, y * 0.15, -1.2]), S.hips[0] * 0.55 * F, S.legR[0] * 1.3 * F, S.hips[2] * 0.75 * F, reg, L.part, 0, -0.4, 0, bias));
    }
    capsule(prims, root, knee, S.legR[0] * F, S.legR[0] * 0.85 * F, reg, L.part, bias);
    capsule(prims, knee, foot, S.legR[0] * 0.8 * F, S.legR[1] * F, reg, L.part, bias);
    prims.push(ell(add(foot, [S.paw * 0.35, 0, S.paw * 0.35]), S.paw * 1.05, S.paw * 0.85, S.paw * 0.6, REG.PAW, L.part, 0, 0, 0, bias));
    if (S.pompom) prims.push(sphere(lerp(foot, knee, 0.35), S.legR[0] * 1.55, REG.FUR, L.part, bias));
  }

  // cola: cadena con movimiento secundario
  tail(prims, S, P, add(hip, rot([-S.hips[0] * 0.8, 0, S.hips[2] * 0.35], 0, pitch)));

  return { prims, eyes, nose, mouth, head: headC, brow };
}

function lerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function tail(prims: Prim[], S: Shape, P: Pose, base: V3): void {
  const n = S.tail === 'stub' ? 3 : 12;
  const L = S.tail === 'stub' ? 3 : S.tailLen;
  let p = base;
  const lift = P.tailLift;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    let ang: number; // ángulo en el plano x-z (0 = hacia atrás horizontal)
    let side = 0;
    switch (S.tail) {
      case 'curl':
        ang = 0.6 + t * 4.2 * (0.7 + P.tailCurl * 0.3);
        side = t * 0.4;
        break;
      case 'whip':
      case 'sabre':
        ang = -1.1 + lift * 0.8 + t * t * (1.6 + lift * 0.6);
        break;
      case 'plume':
        ang = 0.9 + lift * 0.5 + t * 1.6;
        break;
      default:
        ang = -0.5 + lift * 1.4 + t * t * (0.9 + P.tailCurl * 1.6);
    }
    // meneo con retraso (más amplio en la punta)
    side += P.tailWag * Math.sin(t * 1.4) * 1.2;
    const step = L / n;
    const dir: V3 = [-Math.cos(ang) * Math.cos(side), Math.sin(side) * 1.0, Math.sin(ang) * Math.cos(side)];
    const q = add(p, mul(dir, step));
    const r = S.tailR * (S.tail === 'fluffy' || S.tail === 'plume' ? 1.05 + 0.3 * Math.sin(t * Math.PI) : S.tail === 'whip' ? 1 - t * 0.6 : S.tail === 'otter' ? 1.4 - t * 0.8 : 1 - t * 0.35);
    capsule(prims, p, q, r * (1 + S.fluff * 0.08), r * 0.92, REG.FUR, PART.TAIL);
    p = q;
  }
  if (S.pompom) prims.push(sphere(p, S.tailR * 1.7, REG.FUR, PART.TAIL));
}

/** Pose de dormir enroscado: cuerpo en rosquilla, cabeza sobre las patas, cola alrededor. */
function curled(S: Shape, P: Pose): Built {
  const prims: Prim[] = [];
  const F = 1 + S.fluff * 0.12;
  const br = 1 + P.breath * 0.07;
  const R = S.bodyLen * 0.5 + S.chest[0] * 0.5;
  const h = Math.max(S.chest[2], S.hips[2]) * 0.95;
  // lomo curvado como arco de elipsoides
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 0.15 + (i / 6) * Math.PI * 1.25;
    const c: V3 = [Math.cos(a) * R * 0.55, -Math.sin(a) * R * 0.55, h * 0.75 * br];
    prims.push(ell(c, S.chest[0] * 0.75 * F, S.chest[1] * 1.05 * F, h * 0.8 * F * br, REG.FUR, PART.BODY, -a + Math.PI / 2));
  }
  // cabeza apoyada
  const headC: V3 = [R * 0.35, R * 0.35, S.head[2] * 0.9];
  prims.push(ell(headC, S.head[0] * F, S.head[1] * F, S.head[2] * 0.9 * F, REG.FUR, PART.HEAD, 0.9, 0.15, -0.25));
  const snoutC = add(headC, rot([S.snoutLen * 0.9, 0, -S.stop - 0.5], 0.9));
  prims.push(ell(snoutC, S.snout[0], S.snout[1], S.snout[2], REG.MUZZLE, PART.SNOUT, 0.9));
  // orejas
  for (const side of [1, -1]) {
    const b = add(headC, rot([-S.head[0] * 0.2, side * S.head[1] * 0.55, S.head[2] * 0.6], 0.9, 0.15, -0.25));
    const t = add(b, rot([-S.earSize * 0.4, side * S.earSize * 0.25, S.earSize * (S.ear === 'cat' || S.ear === 'prick' || S.ear === 'big' || S.ear === 'bat' || S.ear === 'tuft' ? 0.85 : 0.1)], 0.9));
    capsule(prims, b, t, S.earSize * 0.4, 0.4, REG.FUR, side > 0 ? PART.EAR_L : PART.EAR_R);
  }
  // patas delanteras recogidas bajo la barbilla
  prims.push(ell(add(headC, [1.5, 2.5, -S.head[2] * 0.8]), S.paw * 1.6, S.paw * 1.1, S.paw * 0.7, REG.PAW, PART.LEG_FL));
  // cola rodeando por delante (hacia la cámara)
  let p: V3 = [-R * 0.75, R * 0.2, 2.6];
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 0.95 - (i / 12) * Math.PI * 1.05;
    const q: V3 = [Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95 + 0.6, 2.4 + Math.sin((i / 12) * Math.PI) * 0.8];
    capsule(prims, p, q, S.tailR * (S.tail === 'fluffy' ? 1.3 : 1), S.tailR * 0.9, REG.FUR, PART.TAIL);
    p = q;
  }
  const eyes = [add(headC, rot([S.head[0] * 0.75, S.head[1] * 0.45, S.head[2] * 0.15], 0.9, 0.15, -0.25)), add(headC, rot([S.head[0] * 0.75, -S.head[1] * 0.45, S.head[2] * 0.15], 0.9, 0.15, -0.25))];
  const nose = add(snoutC, rot([S.snout[0] * 0.9, 0, S.snout[2] * 0.3], 0.9));
  return { prims, eyes, nose, mouth: nose, head: headC };
}
