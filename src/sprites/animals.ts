// Siluetas, pelajes, animaciones y caché de frames de los animales.
import type { ColorName, RampName } from '../gfx/palette.ts';
import { place, rasterize, clean, outline, toImageData, visibleAt, stamp, rot, type V3, type Raster } from './rig.ts';
import { buildQuad, basePose, REG, PART, type Shape, type Pose } from './quadruped.ts';

// ---------------------------------------------------------------- Pelajes
export type Pattern = 'solid' | 'tabby' | 'bicolor' | 'tuxedo' | 'calico' | 'tortie' | 'point' | 'spots' | 'brindle' | 'saddle' | 'blackTan' | 'tricolor' | 'patches';

export interface Coat {
  base: RampName;
  /** rampa secundaria (rayas, manchas, puntas) */
  second: RampName;
  /** pecho/vientre/hocico claro */
  light: RampName;
  pattern: Pattern;
  /** ¿pecho/hocico claro? */
  whiteChest: boolean;
  socks: boolean;
  eye: ColorName;
  /** heterocromía: color del ojo lejano */
  eye2?: ColorName;
  nose: ColorName;
  seed: number;
  /** tercer color (manchas de bodeguero) */
  third?: RampName;
  /** textura del pelo */
  tex?: 'curly' | 'shaggy' | 'wrinkle';
  /** máscara oscura (hocico y orejas) */
  mask?: boolean;
  /** punta de la cola blanca */
  tailTip?: boolean;
  special?: 'moon';
}

function n3(x: number, y: number, z: number, s: number): number {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + Math.floor(z) * 2147483647 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Ruido suave por interpolación (para manchas de calicó/carey). */
function smooth3(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t: number) => t * t * (3 - 2 * t);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? f(xf) : 1 - f(xf)) * (dy ? f(yf) : 1 - f(yf)) * (dz ? f(zf) : 1 - f(zf));
    v += w * n3(xi + dx, yi + dy, zi + dz, s);
  }
  return v;
}

type PaintOut = { ramp: RampName; shift?: number; color?: ColorName } | null;

function painter(S: Shape, C: Coat, yaw: number) {
  const inner = basePainter(S, C, yaw);
  return (reg: number, part: number, hit: V3, n: V3): PaintOut => {
    const p = rot(hit, -yaw);
    let out = inner(reg, part, hit, n);
    if (!out) return out;
    const isEar = part === PART.EAR_L || part === PART.EAR_R;
    if (C.mask && (reg === REG.MUZZLE || (isEar && reg === REG.FUR))) out = { ramp: C.second };
    if (C.tailTip && part === PART.TAIL && p[2] > S.legH + S.chest[2] && p[0] < -S.bodyLen * 0.5 - S.tailLen * 0.55) out = { ramp: C.light };
    if (reg === REG.FUR || reg === REG.BELLY || reg === REG.MUZZLE) {
      if (C.tex === 'curly' && smooth3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, C.seed + 5) > 0.6) out = { ...out, shift: (out.shift ?? 0) - 1 };
      if (C.tex === 'shaggy' && n3(p[0] * 0.7, p[1] * 1.6, p[2] * 0.35, C.seed + 9) > 0.86) out = { ...out, shift: (out.shift ?? 0) - 1 };
      if (C.tex === 'wrinkle' && (part === PART.HEAD || (part === PART.BODY && p[0] > S.bodyLen * 0.35)) && Math.sin(p[2] * 2.4) > 0.9) out = { ...out, shift: (out.shift ?? 0) - 1 };
    }
    return out;
  };
}

function basePainter(S: Shape, C: Coat, yaw: number) {
  return (reg: number, part: number, hit: V3, n: V3): PaintOut => {
    void n;
    const p = rot(hit, -yaw); // a espacio local del animal
    const isLeg = part >= PART.LEG_FL && part <= PART.LEG_HR;
    if (reg === REG.EAR_IN) return { ramp: 'earIn' };
    if (reg === REG.TONGUE) return { ramp: 'red', shift: 1 };
    const lightRamp = C.light;
    if (reg === REG.PAW) return { ramp: C.socks || (C.whiteChest && S.species === 'cat') ? lightRamp : C.base };
    if (reg === REG.BELLY) return { ramp: C.whiteChest ? lightRamp : C.base, shift: C.whiteChest ? 0 : 0 };
    if (reg === REG.MUZZLE) {
      if (C.whiteChest && (C.pattern === 'tabby' || C.pattern === 'bicolor' || C.pattern === 'tuxedo')) return { ramp: lightRamp };
      if (C.pattern === 'point') return { ramp: C.second };
      return { ramp: C.base };
    }
    // FUR con patrón
    switch (C.pattern) {
      case 'tabby': {
        let s = 0;
        if (part === PART.TAIL) s = Math.sin((p[0] - p[2]) * 1.35);
        else if (isLeg) s = Math.sin(p[2] * 1.25 + 0.5) - (p[2] > S.legH * 0.7 ? 1 : 0);
        else if (part === PART.HEAD) {
          // la "M" de la frente: rayas finas sobre la coronilla
          const top = p[2] - S.legH - S.chest[2];
          s = top > S.head[2] * 0.9 && Math.abs(p[1]) < S.head[1] * 0.45 ? Math.sin(p[1] * 2.4) * 1.2 : -1;
        } else s = Math.sin(p[0] * 1.45 + p[1] * 0.4 + Math.sin(p[2] * 0.9 + p[1] * 0.3) * 1.1) * (p[2] > S.legH * 0.55 ? 1 : 0);
        if (s > 0.62) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'bicolor':
      case 'tuxedo': {
        const bl = smooth3(p[0] * 0.18, p[1] * 0.25, p[2] * 0.18, C.seed);
        if (p[2] < S.legH * 0.85 || bl > 0.7) return { ramp: lightRamp };
        return { ramp: C.base };
      }
      case 'calico':
      case 'tortie': {
        const sc = C.pattern === 'tortie' ? 0.45 : 0.2;
        const v = smooth3(p[0] * sc + 10, p[1] * sc, p[2] * sc, C.seed);
        if (C.pattern === 'calico' && (p[2] < S.legH * 0.9 || part === PART.SNOUT)) return { ramp: lightRamp };
        if (v > 0.55) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'point': {
        if (part === PART.TAIL || part === PART.EAR_L || part === PART.EAR_R || isLeg && p[2] < S.legH * 0.6) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'spots': {
        // rosetas: anillo oscuro con centro algo más oscuro que la base
        const v = smooth3(p[0] * 0.75, p[1] * 0.75, p[2] * 0.75, C.seed);
        if (part === PART.HEAD && p[2] < S.legH + S.chest[2] + S.head[2] * 0.4) return { ramp: C.base };
        if (v > 0.66) return { ramp: C.base, shift: -1 };
        if (v > 0.56) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'brindle': {
        // atigrado: rayas verticales finas y algo onduladas, solo en tronco y muslos
        if (part === PART.HEAD || part === PART.SNOUT || part === PART.TAIL || (isLeg && p[2] < S.legH * 0.6)) return { ramp: C.base };
        const s = Math.sin(p[0] * 1.9 + Math.sin(p[2] * 0.45 + C.seed) * 1.6);
        return { ramp: s > 0.82 ? C.second : C.base };
      }
      case 'blackTan': {
        // negro con fuego: cejas, mejillas, pecho y patas
        if (isLeg && p[2] < S.legH * 0.55) return { ramp: C.second };
        if (part === PART.BODY && p[2] < S.legH + S.chest[2] * 0.2 && p[0] > 0) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'tricolor': {
        if (isLeg && p[2] < S.legH * 0.7) return { ramp: C.light };
        if (part === PART.BODY && p[2] > S.legH + S.chest[2] * 0.25 && p[0] < S.bodyLen * 0.35) return { ramp: C.second };
        if (part === PART.HEAD && Math.abs(p[1]) < S.head[1] * 0.18 && p[2] > S.legH + S.chest[2] + S.head[2] * 0.2) return { ramp: C.light };
        return { ramp: C.base };
      }
      case 'patches': {
        // bodeguero: blanco con cabeza tricolor y una mancha en la grupa
        if (part === PART.HEAD || part === PART.EAR_L || part === PART.EAR_R) {
          const v = smooth3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, C.seed);
          if (Math.abs(p[1]) < S.head[1] * 0.2 && p[2] > S.legH + S.chest[2]) return { ramp: C.base };
          return { ramp: v > 0.5 ? C.second : C.third ?? C.second };
        }
        if (part === PART.BODY && p[0] < -S.bodyLen * 0.25 && p[2] > S.legH + 1 && smooth3(p[0] * 0.25, p[1] * 0.25, p[2] * 0.25, C.seed + 3) > 0.45) return { ramp: C.second };
        return { ramp: C.base };
      }
      case 'saddle': {
        if (p[2] > S.legH + 2 && part !== PART.HEAD && part !== PART.NECK && !isLeg && part !== PART.TAIL) return { ramp: C.second };
        return { ramp: C.base };
      }
      default:
        return { ramp: C.base };
    }
  };
}

// ---------------------------------------------------------------- Animaciones
export type Clip =
  | 'idle' | 'walk' | 'trot' | 'run' | 'sneak' | 'sitDown' | 'sit' | 'standUp' | 'lieDown' | 'lie' | 'getUp'
  | 'sleep' | 'stretch' | 'lick' | 'scratch' | 'eat' | 'drink' | 'wag' | 'meow';

export type EyeState = 'open' | 'half' | 'closed' | 'happy';

interface FrameDef {
  pose: Pose;
  dur: number;
  eyes: EyeState;
}

function P(over: Partial<Pose>): Pose {
  return { ...basePose(), ...over };
}

function gaitFeet(S: Shape, phase: number, kind: 'walk' | 'trot' | 'run'): [number, number][] {
  const stride = kind === 'walk' ? S.legH * 0.55 : kind === 'trot' ? S.legH * 0.85 : S.legH * 1.1;
  const lift = kind === 'walk' ? S.legH * 0.18 : S.legH * 0.28;
  const offs = kind === 'walk' ? [0.25, 0.75, 0, 0.5] : [0, 0.5, 0.5, 0];
  const stance = kind === 'walk' ? 0.62 : 0.5;
  return offs.map((o) => {
    const p = (phase + o) % 1;
    if (p < stance) return [stride / 2 - (p / stance) * stride, 0] as [number, number];
    const t = (p - stance) / (1 - stance);
    return [-stride / 2 + t * stride, Math.sin(t * Math.PI) * lift] as [number, number];
  });
}

export function clipFrames(S: Shape, clip: Clip): FrameDef[] {
  const out: FrameDef[] = [];
  const cat = S.species === 'cat';
  const tailIdle = cat ? 0.35 : -0.2;
  switch (clip) {
    case 'idle':
      for (const [b, d, w] of [[0, 420, 0], [0.5, 260, 0.12], [1, 520, 0.2], [0.5, 260, 0.1]] as const)
        out.push({ pose: P({ breath: b, tailWag: w, tailLift: tailIdle }), dur: d, eyes: 'open' });
      break;
    case 'walk':
      for (let i = 0; i < 8; i++) {
        const ph = i / 8;
        out.push({
          pose: P({ feet: gaitFeet(S, ph, 'walk'), bodyZ: -Math.abs(Math.sin(ph * Math.PI * 2)) * 0.6 + 0.3, headDz: Math.sin(ph * Math.PI * 4) * 0.4, tailWag: Math.sin(ph * Math.PI * 2) * 0.35, tailLift: tailIdle + 0.1 }),
          dur: i % 4 === 0 ? 120 : 85, eyes: 'open',
        });
      }
      break;
    case 'sneak':
      for (let i = 0; i < 8; i++) {
        const ph = i / 8;
        out.push({ pose: P({ feet: gaitFeet(S, ph, 'walk'), crouch: 0.55, headDz: -1, earBack: 0.35, tailLift: -0.4, tailWag: Math.sin(ph * Math.PI * 2) * 0.15 }), dur: i % 4 === 0 ? 220 : 160, eyes: 'open' });
      }
      break;
    case 'trot':
    case 'run':
      for (let i = 0; i < 6; i++) {
        const ph = i / 6;
        const run = clip === 'run';
        out.push({
          pose: P({ feet: gaitFeet(S, ph, run ? 'run' : 'trot'), bodyZ: Math.sin(ph * Math.PI * 4) * 0.8 + (run ? -1 : 0), crouch: run ? 0.25 : 0, earBack: run ? 0.9 : 0.1, pitch: Math.sin(ph * Math.PI * 2) * (run ? 0.08 : 0.03), tailLift: run ? -0.3 : tailIdle + 0.2, tailWag: Math.sin(ph * Math.PI * 2) * 0.3 }),
          dur: i % 3 === 0 ? 85 : 70, eyes: 'open',
        });
      }
      break;
    case 'sitDown':
      // anticipación: la cabeza sube un poco antes de bajar la grupa
      for (const [s, hd, d] of [[0.15, 0.6, 90], [0.45, 0.4, 90], [0.8, 0.1, 110], [1, 0, 160]] as const)
        out.push({ pose: P({ sit: s, headDz: hd, tailLift: tailIdle - s * 0.9, tailCurl: s * 0.6 }), dur: d, eyes: 'open' });
      break;
    case 'standUp':
      for (const [s, d] of [[0.8, 90], [0.45, 90], [0.15, 110]] as const)
        out.push({ pose: P({ sit: s, tailLift: tailIdle - s * 0.9 }), dur: d, eyes: 'open' });
      break;
    case 'sit':
      for (const [b, d, w] of [[0, 520, 0], [0.5, 300, 0.1], [1, 600, 0.15], [0.5, 300, 0.05]] as const)
        out.push({ pose: P({ sit: 1, breath: b, tailLift: tailIdle - 0.9, tailCurl: 0.6, tailWag: w }), dur: d, eyes: 'open' });
      break;
    case 'lieDown':
      for (const [l, d] of [[0.25, 100], [0.55, 110], [0.85, 130], [1, 180]] as const)
        out.push({ pose: P({ lie: l, tailLift: -0.8 * l, headDz: -l * 1.5 }), dur: d, eyes: 'open' });
      break;
    case 'getUp':
      for (const [l, d] of [[0.85, 100], [0.55, 90], [0.25, 90]] as const)
        out.push({ pose: P({ lie: l, tailLift: -0.8 * l }), dur: d, eyes: 'open' });
      break;
    case 'lie':
      for (const [b, d] of [[0, 700], [0.5, 350], [1, 800], [0.5, 350]] as const)
        out.push({ pose: P({ lie: 1, breath: b, tailLift: -0.8, headDz: -1.5 }), dur: d, eyes: 'half' });
      break;
    case 'sleep':
      for (const [b, d] of [[0, 1100], [0.5, 500], [1, 1300], [0.5, 500]] as const)
        out.push({ pose: P({ curl: 1, breath: b }), dur: d, eyes: 'closed' });
      break;
    case 'stretch':
      for (const [s, d, e] of [[0.35, 120, 'open'], [0.75, 160, 'half'], [1, 650, 'closed'], [1, 250, 'closed'], [0.55, 150, 'half'], [0.15, 150, 'open']] as const)
        out.push({ pose: P({ stretch: s, tailLift: 0.5 + s * 0.4, mouth: s > 0.9 && cat ? 1 : 0 }), dur: d, eyes: e as EyeState });
      break;
    case 'lick':
      for (let i = 0; i < 6; i++)
        out.push({ pose: P({ sit: 1, pawLift: 0.85, headPitch: -0.35, headDz: -1.2 + (i % 2) * 0.6, headYaw: 0.15, mouth: i % 2, tongue: i % 2, tailLift: tailIdle - 0.9, tailCurl: 0.6 }), dur: i % 2 ? 110 : 140, eyes: 'half' });
      break;
    case 'scratch':
      for (let i = 0; i < 6; i++)
        out.push({ pose: P({ sit: 1, scratch: (i % 3) / 3 + 0.01, headRoll: 0.35, headYaw: 0.25, tailLift: tailIdle - 0.9 }), dur: 55, eyes: 'happy' });
      break;
    case 'eat':
      for (let i = 0; i < 4; i++)
        out.push({ pose: P({ headPitch: -1.1, headDz: -S.legH * 0.55 + (i % 2) * 0.8, headDx: 1.5, pitch: -0.05, mouth: i % 2 ? 0.6 : 0, tailLift: tailIdle + 0.15, tailWag: cat ? 0 : Math.sin(i * 1.6) * 0.8 }), dur: i % 2 ? 140 : 180, eyes: 'half' });
      break;
    case 'drink':
      for (let i = 0; i < 4; i++)
        out.push({ pose: P({ headPitch: -1.1, headDz: -S.legH * 0.6 + (i % 2) * 0.4, headDx: 1.5, pitch: -0.05, mouth: i % 2 ? 0.4 : 0, tongue: i % 2, tailLift: tailIdle }), dur: 95, eyes: 'half' });
      break;
    case 'wag':
      for (let i = 0; i < 4; i++)
        out.push({ pose: P({ tailWag: [1, 0.3, -1, -0.3][i], tailLift: cat ? 0.9 : 0.5, mouth: cat ? 0 : 0.5, tongue: cat ? 0 : 1, breath: i % 2 }), dur: 70, eyes: 'happy' });
      break;
    case 'meow':
      for (const [m, d] of [[0.3, 90], [1, 260], [0.4, 120]] as const)
        out.push({ pose: P({ mouth: m, headPitch: 0.25, tailLift: tailIdle + 0.3 }), dur: d, eyes: 'open' });
      break;
  }
  return out;
}

// ---------------------------------------------------------------- Ojos y nariz dibujados a mano
const EYES: Record<string, Record<EyeState, string[]>> = {
  near: {
    open: ['wK', 'KK'],
    half: ['oo', 'KK'],
    closed: ['..', 'oo'],
    happy: ['.o', 'o.'],
  },
  far: {
    open: ['K', 'K'],
    half: ['o', 'K'],
    closed: ['.', 'o'],
    happy: ['o', '.'],
  },
  nearBig: {
    open: ['wK', 'IK', 'KI'],
    half: ['oo', 'IK', 'KI'],
    closed: ['..', 'oo', '..'],
    happy: ['.o', 'o.', '..'],
  },
  farBig: {
    open: ['K', 'K', 'I'],
    half: ['o', 'K', 'I'],
    closed: ['.', 'o', '.'],
    happy: ['o', '.', '.'],
  },
};

// ---------------------------------------------------------------- Caché de frames
export interface Frame {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
  dur: number;
  eyes: { x: number; y: number; near: boolean }[];
  eyeState: EyeState;
  outline: ColorName;
}

export interface Look {
  key: string;
  shape: Shape;
  coat: Coat;
}

const cache = new Map<string, Frame[]>();

/** dir: 0 abajo-dcha (+x), 1 abajo-izq (+y), 2 arriba-izq (−x), 3 arriba-dcha (−y) */
export function getFrames(look: Look, clip: Clip, dir: number): Frame[] {
  const k = `${look.key}|${clip}|${dir}`;
  let f = cache.get(k);
  if (!f) {
    f = renderClip(look, clip, dir);
    cache.set(k, f);
  }
  return f;
}

function canvasSize(S: Shape): [number, number, number, number] {
  const h = Math.ceil(S.legH * 2.2 + 34);
  const w = Math.ceil((S.bodyLen + S.legH) * 1.7 + 30);
  return [w, h, Math.floor(w / 2), h - 12];
}

const OUTLINE_OF: Partial<Record<RampName, ColorName>> = {};

export function renderClip(look: Look, clip: Clip, dir: number): Frame[] {
  const S = look.shape, C = look.coat;
  const yaw = (dir * Math.PI) / 2;
  const [W, H, ox, oy] = canvasSize(S);
  // la cabeza se gira un poco hacia la cámara: la cara se lee mejor y resulta más simpática
  const toCam = dir === 0 || dir === 3 ? 1 : -1;
  const front = dir === 0 || dir === 1;
  const moving = clip === 'walk' || clip === 'trot' || clip === 'run' || clip === 'sneak';
  const bias = front ? (moving ? 0.3 : 0.6) : moving ? 0 : S.species === 'cat' ? 0.3 : 0.12;
  return clipFrames(S, clip).map((fd) => {
    const pose = { ...fd.pose, headYaw: fd.pose.headYaw + toCam * bias };
    const built = buildQuad(S, pose);
    const prims = place(built.prims, yaw);
    const r: Raster = rasterize(prims, W, H, ox, oy, painter(S, C, yaw));
    clean(r);
    outline(r);
    const img = toImageData(r);
    // ojos
    const eyes: Frame['eyes'] = [];
    const eyePts = built.eyes.map((e) => rot(e, yaw));
    eyePts.forEach((e, i) => {
      const v = visibleAt(r, e, 2.2);
      if (v) eyes.push({ x: v[0], y: v[1], near: i === 0 });
    });
    const outlineColor: ColorName = (OUTLINE_OF[C.base] ??= rampOutline(C.base));
    drawEyes(img, eyes, fd.eyes, S, C, outlineColor);
    // marca de luna creciente en la frente (gato lunar)
    if (C.special === 'moon' && built.brow) {
      const b = visibleAt(r, rot(built.brow, yaw), 2.5);
      if (b) stamp(img, b[0] - 1, b[1] - 1, ['.b', 'b.', '.b'], { b: 'butter', '.': null });
    }
    // nariz
    const nose = visibleAt(r, rot(built.nose, yaw), 2);
    if (nose && pose.curl === 0) stamp(img, nose[0], nose[1], S.species === 'cat' ? ['n'] : ['nn'], { n: C.nose });
    if (pose.mouth > 0.5) {
      const m = visibleAt(r, rot(built.mouth, yaw), 2.5);
      if (m) stamp(img, m[0], m[1], ['K'], { K: 'ink' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return { canvas, ox, oy, dur: fd.dur, eyes, eyeState: fd.eyes, outline: outlineColor };
  });
}

function rampOutline(r: RampName): ColorName {
  return RAMP_DARK[r] ?? 'ink';
}
const RAMP_DARK: Partial<Record<RampName, ColorName>> = { wood: 'wood0', fawn: 'wood1', woodDark: 'ink', white: 'cal0', tile: 'tile0', stone: 'stone0', black: 'ink' };

export function drawEyes(img: ImageData, eyes: Frame['eyes'], st: EyeState, S: Shape, C: Coat, lid: ColorName): void {
  for (const e of eyes) {
    const set = e.near ? (S.eyeSize >= 3 ? EYES.nearBig : EYES.near) : S.eyeSize >= 3 ? EYES.farBig : EYES.far;
    const rows = set[st];
    const iris = !e.near && C.eye2 ? C.eye2 : C.eye;
    stamp(img, e.x, e.y - 1, rows, { K: 'ink', w: 'cal4', I: iris, o: lid, '.': null });
  }
}
