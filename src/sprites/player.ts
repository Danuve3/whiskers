// Personaje jugable: chibi por capas (piel, pelo, ropa, gorro, gafas, accesorios, mochila,
// paraguas). Todas las capas se rasterizan juntas en cada frame, así se animan a la vez.
import type { ColorName, RampName } from '../gfx/palette.ts';
import { place, rasterize, clean, outline, toImageData, visibleAt, stamp, rot, ell, sphere, capsule, add, type Prim, type V3 } from './rig.ts';

export const PREG = { SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, SHOES: 4, HAT: 5, BAG: 6, UMB: 7, SCARF: 8, ACCENT: 9, SLEEVE: 10, STICK: 11 } as const;

export type HairStyle = 'corto' | 'media' | 'largo' | 'mono' | 'coleta' | 'rizos' | 'rapado' | 'flequillo';
export type TopKind = 'camiseta' | 'jersey' | 'chubasquero' | 'peto' | 'rebeca';
export type BottomKind = 'pantalon' | 'corto' | 'falda';
export type HatKind = 'ninguno' | 'gorro' | 'gorra' | 'boina' | 'sombrero' | 'pescador' | 'navidad';
export type GlassesKind = 'ninguna' | 'redondas' | 'sol';
export type AccKind = 'ninguno' | 'bufanda' | 'panuelo';
export type BagKind = 'mochila' | 'bandolera' | 'ninguna';

export interface Outfit {
  skin: RampName;
  hair: HairStyle;
  hairColor: RampName;
  top: TopKind;
  topColor: RampName;
  bottom: BottomKind;
  bottomColor: RampName;
  shoes: RampName;
  hat: HatKind;
  hatColor: RampName;
  glasses: GlassesKind;
  acc: AccKind;
  accColor: RampName;
  bag: BagKind;
  bagColor: RampName;
  umbrella: RampName;
  /** ¿llueve? (abre el paraguas) */
  rain?: boolean;
}

export const DEFAULT_OUTFIT: Outfit = {
  skin: 'skin', hair: 'media', hairColor: 'woodDark', top: 'jersey', topColor: 'yellow', bottom: 'pantalon', bottomColor: 'blue',
  shoes: 'woodDark', hat: 'ninguno', hatColor: 'red', glasses: 'ninguna', acc: 'bufanda', accColor: 'red', bag: 'bandolera', bagColor: 'wood', umbrella: 'red',
};

export type PlayerClip = 'idle' | 'walk' | 'crouch' | 'give' | 'umbrella';

interface PPose {
  breath: number;
  legs: [number, number][]; // [dx, lift] por pierna (izq, dcha)
  arms: [number, number][]; // balanceo y elevación
  bob: number;
  crouch: number;
  give: number;
  headTilt: number;
  umbrella: boolean;
  hairSwing: number;
  headYaw: number;
}

const base = (): PPose => ({ headYaw: 0, breath: 0, legs: [[0, 0], [0, 0]], arms: [[0, 0], [0, 0]], bob: 0, crouch: 0, give: 0, headTilt: 0, umbrella: false, hairSwing: 0 });

function clipPoses(clip: PlayerClip, umb: boolean): { p: PPose; dur: number; eyes: 'open' | 'closed' | 'happy' }[] {
  const out: { p: PPose; dur: number; eyes: 'open' | 'closed' | 'happy' }[] = [];
  switch (clip) {
    case 'idle':
    case 'umbrella':
      for (const [b, d] of [[0, 480], [0.5, 280], [1, 560], [0.5, 280]] as const) out.push({ p: { ...base(), breath: b, umbrella: umb || clip === 'umbrella', hairSwing: b * 0.3 }, dur: d, eyes: 'open' });
      break;
    case 'walk':
      for (let i = 0; i < 8; i++) {
        const ph = (i / 8) * Math.PI * 2;
        const s = Math.sin(ph);
        out.push({
          p: { ...base(), legs: [[s * 4.2, Math.max(0, -Math.cos(ph)) * 2.2], [-s * 4.2, Math.max(0, Math.cos(ph)) * 2.2]], arms: [[-s * 0.55, 0], [s * 0.55, 0]], bob: Math.abs(Math.cos(ph)) * 1.0 - 0.5, umbrella: umb, hairSwing: -s * 0.6, headTilt: s * 0.04 },
          dur: i % 4 === 0 ? 120 : 90, eyes: 'open',
        });
      }
      break;
    case 'crouch':
      for (const [c, d] of [[0.4, 90], [0.8, 90], [1, 400], [1, 400]] as const) out.push({ p: { ...base(), crouch: c, umbrella: umb, give: c > 0.9 ? 0.6 : 0 }, dur: d, eyes: c > 0.9 ? 'happy' : 'open' });
      break;
    case 'give':
      for (const [g, d] of [[0.4, 90], [1, 300], [1, 300], [0.5, 120]] as const) out.push({ p: { ...base(), give: g, crouch: 0.5, umbrella: umb }, dur: d, eyes: 'happy' });
      break;
  }
  return out;
}

function buildPlayer(o: Outfit, P: PPose): { prims: Prim[]; eyes: V3[]; mouth: V3; cheeks: V3[] } {
  const prims: Prim[] = [];
  const cz = P.crouch;
  const drop = cz * 9 + P.bob;
  const hipZ = 17 - drop;
  // piernas
  for (const side of [1, -1]) {
    const idx = side > 0 ? 0 : 1;
    const far = side < 0 ? -1 : 0;
    const [dx, lift] = P.legs[idx];
    const hip: V3 = [0, side * 2.8, hipZ];
    let knee: V3 = [dx * 0.5 + cz * 5, side * 3, hipZ - 7.5 + lift * 0.6 + cz * 3];
    let foot: V3 = [dx, side * 3, 1.6 + lift];
    if (cz > 0) {
      knee = [4 + cz * 2 + (side > 0 ? 0 : -3), side * 3.4, 8 + cz * 1];
      foot = [side > 0 ? 1 : -2, side * 3.2, 1.6];
    }
    const pant = o.bottom === 'corto' ? PREG.SKIN : PREG.BOTTOM;
    capsule(prims, hip, knee, 2.8, 2.5, PREG.BOTTOM, 20 + idx, far);
    capsule(prims, knee, foot, 2.4, 2.1, o.bottom === 'falda' ? PREG.SKIN : pant, 20 + idx, far);
    prims.push(ell(add(foot, [1.1, 0, -0.2]), 3.3, 2.3, 1.7, PREG.SHOES, 22 + idx, 0, 0, 0, far));
  }
  // cadera / falda
  if (o.bottom === 'falda') prims.push(ell([0, 0, hipZ - 2.5], 5.6, 6.2, 5.2, PREG.BOTTOM, 3));
  else prims.push(ell([0, 0, hipZ + 0.5], 4.6, 5.6, 3.6, PREG.BOTTOM, 3));
  // torso
  const br = 1 + P.breath * 0.04;
  const torsoC: V3 = [0, 0, hipZ + 8.5];
  const long = o.top === 'chubasquero';
  prims.push(ell(torsoC, 4.9 * br, 6.3, 7.6 * br, PREG.TOP, 2));
  if (long) prims.push(ell([0, 0, hipZ + 1], 5.4, 6.6, 4.5, PREG.TOP, 2));
  if (o.top === 'peto') prims.push(ell([0.6, 0, hipZ + 6], 4.6, 5.4, 5, PREG.BOTTOM, 2));
  if (o.top === 'rebeca') {
    // rebeca abierta: camisa clara en el centro y botones
    prims.push(ell([3.2, 0, hipZ + 8.5], 2.2, 2.4, 7, PREG.ACCENT, 2));
  }
  // mochila o bandolera
  if (o.bag === 'mochila') prims.push(ell([-5.2, 0, hipZ + 10], 3.2, 5, 5.8, PREG.BAG, 8));
  if (o.bag === 'bandolera') {
    prims.push(ell([0.5, 6.4, hipZ + 1.5], 2.6, 1.6, 3.2, PREG.BAG, 8));
    capsule(prims, [2.6, 4.8, hipZ + 3], [3.4, -3.8, hipZ + 15.2], 0.75, 0.75, PREG.BAG, 9);
  }
  // brazos
  for (const side of [1, -1]) {
    const idx = side > 0 ? 0 : 1;
    const far = side < 0 ? -1 : 0;
    const sh: V3 = [0, side * 6.4, hipZ + 13.5];
    let [swing, raise] = P.arms[idx];
    let hand: V3 = [Math.sin(swing) * 6, side * 7.4, sh[2] - Math.cos(swing) * 9.5 + raise];
    if (P.give > 0 && side > 0) hand = [5 + P.give * 4, side * 5.5, sh[2] - 6 + P.give * 2];
    if (P.umbrella && side < 0) {
      hand = [4.2, -3.2, sh[2] + 1.5];
      raise = 1;
    }
    const elbow: V3 = add(sh, [(hand[0] - sh[0]) * 0.45 - 0.8, side * 1.2, (hand[2] - sh[2]) * 0.5]);
    const sleeveReg = o.top === 'camiseta' ? PREG.SKIN : PREG.TOP;
    capsule(prims, sh, elbow, 2.2, 2.0, PREG.TOP, 30 + idx, far);
    capsule(prims, elbow, hand, 1.95, 1.8, sleeveReg, 30 + idx, far);
    prims.push(sphere(hand, 1.95, PREG.SKIN, 32 + idx, far));
    void raise;
  }
  // bufanda / pañuelo
  if (o.acc === 'bufanda') {
    prims.push(ell([0.3, 0, hipZ + 15.5], 4.6, 5.6, 2.3, PREG.SCARF, 12));
    capsule(prims, [3.6, 2.2, hipZ + 15], [4.4, 2.6, hipZ + 9.5 + P.hairSwing], 1.3, 1.1, PREG.SCARF, 12);
  } else if (o.acc === 'panuelo') prims.push(ell([1.2, 0, hipZ + 15.2], 3.6, 4.5, 2.2, PREG.SCARF, 12));
  // cabeza
  const hz = hipZ + 25.5;
  const head: V3 = [0.3, 0, hz];
  const ht = P.headTilt;
  const hy = P.headYaw;
  const H = (v: V3): V3 => add(head, rot(v, hy, 0, ht));
  prims.push(ell(head, 8.2, 8.6, 8.6, PREG.SKIN, 5, hy, 0, ht));
  // orejas
  prims.push(sphere(H([-0.6, 8.2, -0.6]), 1.6, PREG.SKIN, 6));
  prims.push(sphere(H([-0.6, -8.2, -0.6]), 1.6, PREG.SKIN, 6, -1));
  hair(prims, o, H, P);
  hat(prims, o, H);
  // paraguas
  if (P.umbrella) {
    const handL: V3 = [4.2, -3.2, hipZ + 15];
    capsule(prims, handL, [1.8, -1.4, hz + 18], 0.6, 0.6, PREG.STICK, 40);
    const canopy = ell([1.6, -1.2, hz + 11], 12.5, 12.5, 9.5, PREG.UMB, 41);
    canopy.clipBelow = hz + 11;
    canopy.ribs = 8;
    prims.push(canopy);
    prims.push(sphere([1.6, -1.2, hz + 21], 1, PREG.STICK, 42));
  }
  const eyes: V3[] = [H([7.0, 3.0, -0.6]), H([7.0, -3.0, -0.6])];
  const cheeks: V3[] = [H([6.6, 4.6, -3]), H([6.6, -4.6, -3])];
  const mouth = H([8.0, 0, -3.8]);
  return { prims, eyes, mouth, cheeks };
}

function hair(prims: Prim[], o: Outfit, H: (v: V3) => V3, P: PPose): void {
  const R = PREG.HAIR;
  const sw = P.hairSwing;
  switch (o.hair) {
    case 'rapado':
      prims.push(ell(H([-0.6, 0, 1.6]), 8.0, 8.4, 7.8, R, 7));
      break;
    case 'corto':
      prims.push(ell(H([-1, 0, 2.2]), 8.4, 8.9, 8.0, R, 7));
      prims.push(ell(H([4.4, 1.5, 6.0]), 4.0, 5.5, 2.2, R, 7, 0, 0.3));
      break;
    case 'flequillo':
      prims.push(ell(H([-1, 0, 1.8]), 8.6, 9, 8.3, R, 7));
      prims.push(ell(H([5, 0, 5.2]), 4.4, 8.2, 2.6, R, 7, 0, 0.35));
      break;
    case 'media':
      prims.push(ell(H([-1.2, 0, 1.4]), 8.8, 9.3, 8.6, R, 7));
      prims.push(ell(H([4.6, 2.2, 5.6]), 4.2, 6.2, 2.6, R, 7, 0, 0.35));
      prims.push(ell(H([-1.5, 6.8, -3.6 + sw * 0.3]), 4, 2.6, 4.6, R, 7));
      prims.push(ell(H([-1.5, -6.8, -3.6 + sw * 0.3]), 4, 2.6, 4.6, R, 7));
      prims.push(ell(H([-4.6, 0, -2.5]), 4.2, 7.4, 5.4, R, 7));
      break;
    case 'largo':
      prims.push(ell(H([-1.2, 0, 1.4]), 8.8, 9.3, 8.6, R, 7));
      prims.push(ell(H([4.6, 2.2, 5.6]), 4.2, 6.2, 2.6, R, 7, 0, 0.35));
      prims.push(ell(H([-4.8 - sw * 0.6, 0, -8]), 4, 8, 9.5, R, 7));
      break;
    case 'mono':
      prims.push(ell(H([-1, 0, 1.6]), 8.6, 9, 8.4, R, 7));
      prims.push(sphere(H([-2.5, 0, 10]), 4, R, 7));
      prims.push(ell(H([4.4, 1.5, 5.8]), 4.0, 6, 2.3, R, 7, 0, 0.35));
      break;
    case 'coleta':
      prims.push(ell(H([-1, 0, 1.6]), 8.6, 9, 8.4, R, 7));
      prims.push(ell(H([4.4, 1.5, 5.8]), 4.0, 6, 2.3, R, 7, 0, 0.35));
      capsule(prims, H([-8, 0, 2]), H([-11 - sw, 0, -7]), 2.6, 1.6, R, 7);
      break;
    case 'rizos':
      for (const [x, y, z, r] of [[-1, 0, 4, 7.5], [3, 5, 4, 4.4], [3, -5, 4, 4.4], [-4, 6, 0, 4.4], [-4, -6, 0, 4.4], [-6, 0, 1, 5], [4, 0, 7, 4.2], [-2, 3, 8, 4.2], [-2, -3, 8, 4.2]] as const)
        prims.push(sphere(H([x, y, z]), r, R, 7));
      break;
  }
}

function hat(prims: Prim[], o: Outfit, H: (v: V3) => V3): void {
  const R = PREG.HAT;
  switch (o.hat) {
    case 'gorro':
      prims.push(ell(H([-0.8, 0, 4.5]), 8.6, 9.2, 6.5, R, 13));
      prims.push(ell(H([0, 0, 2]), 8.9, 9.5, 2.2, PREG.ACCENT, 13));
      prims.push(sphere(H([-1.5, 0, 11]), 2.4, PREG.ACCENT, 13));
      break;
    case 'navidad':
      prims.push(ell(H([-0.8, 0, 4.5]), 8.6, 9.2, 6.5, R, 13));
      capsule(prims, H([-2, 0, 9]), H([-8, 3, 7]), 3.5, 1.2, R, 13);
      prims.push(sphere(H([-8.6, 3.3, 6]), 2, PREG.ACCENT, 13));
      prims.push(ell(H([0, 0, 2.2]), 9, 9.6, 2.2, PREG.ACCENT, 13));
      break;
    case 'gorra':
      prims.push(ell(H([-0.8, 0, 4.2]), 8.5, 9.1, 6.2, R, 13));
      prims.push(ell(H([7.6, 0, 2.4]), 5, 6.4, 0.9, R, 13));
      break;
    case 'boina':
      prims.push(ell(H([-0.5, 1, 6.4]), 9.2, 9.6, 3.2, R, 13, 0, 0.12, 0.1));
      prims.push(sphere(H([-0.5, 1, 9.8]), 0.9, R, 13));
      break;
    case 'sombrero':
      prims.push(ell(H([0, 0, 4]), 15, 15, 1.3, R, 13));
      prims.push(ell(H([-0.5, 0, 7.2]), 7.6, 8, 4.6, R, 13));
      prims.push(ell(H([-0.5, 0, 5.2]), 7.9, 8.3, 1.3, PREG.ACCENT, 13));
      break;
    case 'pescador':
      prims.push(ell(H([0, 0, 3.8]), 11.5, 11.5, 2.2, R, 13, 0, -0.08));
      prims.push(ell(H([-0.5, 0, 6.6]), 8, 8.4, 4.4, R, 13));
      break;
  }
}

// ---------------------------------------------------------------- Pintado y caché
function painter(o: Outfit) {
  return (reg: number): { ramp: RampName; shift?: number } | null => {
    switch (reg) {
      case PREG.SKIN: return { ramp: o.skin };
      case PREG.HAIR: return { ramp: o.hairColor };
      case PREG.TOP: return { ramp: o.topColor };
      case PREG.SLEEVE: return { ramp: o.topColor };
      case PREG.BOTTOM: return { ramp: o.bottomColor };
      case PREG.SHOES: return { ramp: o.shoes };
      case PREG.HAT: return { ramp: o.hatColor };
      case PREG.ACCENT: return { ramp: 'white' };
      case PREG.BAG: return { ramp: o.bagColor };
      case PREG.SCARF: return { ramp: o.accColor };
      case PREG.UMB: return { ramp: o.umbrella };
      case PREG.STICK: return { ramp: 'woodDark' };
    }
    return { ramp: 'white' };
  };
}

export interface PFrame {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
  dur: number;
  eyes: { x: number; y: number }[];
}

const cache = new Map<string, PFrame[]>();

export function outfitKey(o: Outfit): string {
  return JSON.stringify(o);
}

export function getPlayerFrames(o: Outfit, clip: PlayerClip, dir: number): PFrame[] {
  const k = outfitKey(o) + '|' + clip + '|' + dir;
  let f = cache.get(k);
  if (!f) {
    f = renderPlayer(o, clip, dir);
    cache.set(k, f);
  }
  return f;
}

export function clearPlayerCache(): void {
  cache.clear();
}

const W = 48, Hh = 76, OX = 24, OY = 66;

function renderPlayer(o: Outfit, clip: PlayerClip, dir: number): PFrame[] {
  const yaw = (dir * Math.PI) / 2;
  const toCam = dir === 0 || dir === 3 ? 1 : -1;
  const turn = dir === 0 || dir === 1 ? 0.38 : 0.12;
  return clipPoses(clip, !!o.rain).map(({ p, dur, eyes: es }) => {
    const b = buildPlayer(o, { ...p, headYaw: toCam * turn });
    const prims = place(b.prims, yaw);
    const r = rasterize(prims, W, Hh, OX, OY, painter(o));
    clean(r);
    outline(r, 3);
    const img = toImageData(r);
    const eyes: PFrame['eyes'] = [];
    b.eyes.forEach((e, i) => {
      const v = visibleAt(r, rot(e, yaw), 2.5);
      if (!v) return;
      eyes.push({ x: v[0], y: v[1] });
      const near = i === 0 ? dir === 0 || dir === 3 : dir === 1 || dir === 2;
      void near;
      const rows = es === 'happy' ? ['.K.', 'K.K'] : es === 'closed' ? ['KK'] : ['K', 'K'];
      stamp(img, v[0] - (rows[0].length > 1 ? 1 : 0), v[1] - 1, rows, { K: 'ink', '.': null });
      if (o.glasses !== 'ninguna') stamp(img, v[0] - 1, v[1] - 2, o.glasses === 'sol' ? ['KKK', 'KKK'] : ['ooo', 'o.o', 'ooo'], { o: 'ink2', K: 'ink', '.': null });
    });
    for (const c of b.cheeks) {
      const v = visibleAt(r, rot(c, yaw), 2);
      if (v) stamp(img, v[0], v[1], ['p'], { p: 'pink' as ColorName });
    }
    const m = visibleAt(r, rot(b.mouth, yaw), 2);
    if (m) stamp(img, m[0], m[1], es === 'happy' ? ['r'] : ['r'], { r: 'rose' });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = Hh;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return { canvas, ox: OX, oy: OY, dur, eyes };
  });
}
