// Música generativa: nunca suena igual. Escalas modales/pentatónicas, tempo lento,
// pulsado tipo guitarra/arpa, pad suave, campanitas de caja de música y bajo redondo.
// Cambia según la hora (mañana luminosa, tarde cálida, noche suave) y el clima.
import { audio, mtof } from './engine.ts';

interface Mood {
  name: string;
  tempo: number;
  root: number; // MIDI
  mode: number[]; // escala de 7 notas (semitonos)
  penta: number[]; // notas preferidas para la melodía (grados de la escala)
  progressions: number[][]; // grados (0..6)
  density: number;
  lead: Lead;
  pad: number; // volumen del pad
  bass: number;
  bells: number;
  verb: number;
  swing: number;
}

type Lead = 'pluck' | 'harp' | 'box' | 'reed' | 'flute' | 'marimba' | 'epiano';

const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

export const MOODS: Record<string, Mood> = {
  mañana: { name: 'mañana', tempo: 84, root: 62, mode: IONIAN, penta: [0, 1, 2, 4, 5], progressions: [[0, 4, 5, 3], [0, 3, 1, 4], [0, 5, 3, 4]], density: 0.62, lead: 'pluck', pad: 0.35, bass: 0.7, bells: 0.3, verb: 0.3, swing: 0.04 },
  tarde: { name: 'tarde', tempo: 72, root: 55, mode: MIXO, penta: [0, 1, 2, 4, 5], progressions: [[0, 6, 3, 0], [0, 3, 6, 4], [5, 3, 0, 6]], density: 0.5, lead: 'harp', pad: 0.5, bass: 0.8, bells: 0.2, verb: 0.4, swing: 0.06 },
  noche: { name: 'noche', tempo: 62, root: 64, mode: LYDIAN, penta: [0, 1, 2, 4, 5], progressions: [[0, 1, 5, 0], [0, 4, 1, 3], [3, 1, 0, 4]], density: 0.4, lead: 'box', pad: 0.45, bass: 0.35, bells: 0.5, verb: 0.65, swing: 0 },
  lluvia: { name: 'lluvia', tempo: 58, root: 52, mode: DORIAN, penta: [0, 2, 3, 4, 6], progressions: [[0, 3, 6, 0], [0, 5, 3, 4], [0, 6, 5, 3]], density: 0.36, lead: 'harp', pad: 0.7, bass: 0.55, bells: 0.25, verb: 0.75, swing: 0.03 },
};

/**
 * Carácter de cada zona: instrumento, escala, compás y algún acompañamiento propio. Se combina con el
 * momento del día (tempo, densidad, reverb), así que cada zona suena distinta pero siempre tranquila.
 */
interface ZoneFlavor {
  lead?: Lead;
  mode?: number[];
  rootShift: number;
  tempoMul: number;
  /** pulsos por compás: 4, 3 (vals) o 6 (seis por ocho, en corcheas) */
  meter: 3 | 4 | 6;
  extra: 'none' | 'drone' | 'shaker';
  bellsMul: number;
  padMul: number;
}
export const ZONE_FLAVORS: Record<string, ZoneFlavor> = {
  calle: { rootShift: 0, tempoMul: 1, meter: 4, extra: 'none', bellsMul: 1, padMul: 1 },
  plaza: { lead: 'reed', mode: MIXO, rootShift: -2, tempoMul: 1.12, meter: 3, extra: 'drone', bellsMul: 0.8, padMul: 0.6 },
  parque: { lead: 'flute', mode: LYDIAN, rootShift: 3, tempoMul: 0.92, meter: 4, extra: 'none', bellsMul: 1.3, padMul: 1.1 },
  mercado: { lead: 'marimba', rootShift: 5, tempoMul: 1.1, meter: 4, extra: 'shaker', bellsMul: 0.5, padMul: 0.7 },
  descampado: { lead: 'epiano', mode: DORIAN, rootShift: -3, tempoMul: 0.85, meter: 4, extra: 'none', bellsMul: 0.6, padMul: 1.2 },
  horta: { lead: 'pluck', mode: LYDIAN, rootShift: 2, tempoMul: 0.95, meter: 6, extra: 'none', bellsMul: 1.4, padMul: 0.8 },
  puerto: { lead: 'harp', mode: AEOLIAN, rootShift: -5, tempoMul: 0.9, meter: 6, extra: 'drone', bellsMul: 0.7, padMul: 0.9 },
};

export function moodFor(hour: number, rain: number): string {
  if (rain > 0.3) return 'lluvia';
  if (hour >= 6 && hour < 13) return 'mañana';
  if (hour >= 13 && hour < 20) return 'tarde';
  return 'noche';
}

// ---------------------------------------------------------------- Instrumentos
function out(): AudioNode {
  return audio.music;
}

function pluck(t: number, midi: number, vel: number, kind: 'pluck' | 'harp' | 'box', dur: number): void {
  const ctx = audio.ctx!;
  const f = mtof(midi);
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = kind === 'pluck' ? 1.5 : 0.7;
  const decay = kind === 'box' ? 1.4 : kind === 'harp' ? 2.2 : 1.1;
  lp.frequency.setValueAtTime(Math.min(9000, f * (kind === 'box' ? 9 : 7)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.6), t + decay * 0.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + (kind === 'harp' ? 0.008 : 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, decay));
  const pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 0.5;
  lp.connect(g).connect(pan).connect(out());
  const parts = kind === 'box' ? [[1, 1, 'sine'], [4, 0.18, 'sine'], [2.0, 0.25, 'triangle']] : kind === 'harp' ? [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine']] : [[1, 1, 'triangle'], [1.003, 0.6, 'sawtooth'], [2, 0.25, 'sine']];
  for (const [mul, a, type] of parts as [number, number, OscillatorType][]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    const og = ctx.createGain();
    og.gain.value = a * (type === 'sawtooth' ? 0.25 : 1);
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + Math.max(dur, decay) + 0.1);
  }
}

/** Melódica/acordeón (plaza), flauta (Alameda), marimba (mercado) y piano eléctrico (descampado). */
function lead2(t: number, midi: number, vel: number, kind: Lead, dur: number): void {
  const ctx = audio.ctx!;
  const f = mtof(midi);
  const g = ctx.createGain();
  const pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 0.4;
  g.connect(pan).connect(out());
  const stop = t + dur + (kind === 'marimba' ? 0.6 : kind === 'epiano' ? 2 : 0.5);
  const atk = kind === 'flute' ? 0.07 : kind === 'reed' ? 0.035 : 0.004;
  const v = vel * (kind === 'reed' ? 0.55 : kind === 'flute' ? 0.75 : kind === 'marimba' ? 1.1 : 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + atk);
  if (kind === 'marimba') g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  else if (kind === 'epiano') g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, 1.9));
  else {
    g.gain.setTargetAtTime(v * 0.75, t + atk, 0.2);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
  }
  // vibrato suave (melódica y flauta) o trémolo (piano eléctrico)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = kind === 'epiano' ? 4.2 : 5.2;
  const lg = ctx.createGain();
  lg.gain.value = kind === 'epiano' ? 0 : f * 0.004;
  lfo.connect(lg);
  lfo.start(t);
  lfo.stop(stop);
  const parts: [number, number, OscillatorType][] =
    kind === 'reed' ? [[1, 0.5, 'sawtooth'], [1.004, 0.5, 'square'], [2, 0.12, 'sawtooth']]
      : kind === 'flute' ? [[1, 1, 'sine'], [2, 0.12, 'triangle']]
        : kind === 'marimba' ? [[1, 1, 'sine'], [3.99, 0.22, 'sine'], [10, 0.05, 'sine']]
          : [[1, 1, 'sine'], [2, 0.3, 'sine'], [3, 0.08, 'triangle']];
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = kind === 'reed' ? Math.min(2600, f * 4) : 6000;
  lp.connect(g);
  for (const [mul, a, type] of parts) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    lg.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = a * (type === 'sawtooth' || type === 'square' ? 0.22 : 1);
    if (kind === 'marimba' && mul > 1) {
      og.gain.setValueAtTime(a, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    }
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(stop);
  }
  // soplo de la flauta
  if (kind === 'flute') {
    const n = audio.noiseSource(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(bp).connect(ng).connect(out());
    n.start(t);
    n.stop(t + 0.3);
  }
}

/** Bordón grave y largo (gaita lejana en la plaza, el mar en el puerto). */
function drone(t: number, midi: number, vel: number, dur: number): void {
  const ctx = audio.ctx!;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  lp.connect(g).connect(out());
  for (const [m, a] of [[1, 1], [1.5, 0.55]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi) * m;
    o.detune.value = (Math.random() - 0.5) * 6;
    const og = ctx.createGain();
    og.gain.value = a * 0.08;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.8);
  }
}

/** Shaker muy suave (mercado). */
function shaker(t: number, vel: number): void {
  const ctx = audio.ctx!;
  const n = audio.noiseSource(false);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  n.connect(hp).connect(g).connect(out());
  n.start(t, Math.random() * 2);
  n.stop(t + 0.12);
}

function bell(t: number, midi: number, vel: number): void {
  const ctx = audio.ctx!;
  const f = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  g.connect(out());
  for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.93, 0.06]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * m;
    const og = ctx.createGain();
    og.gain.value = a;
    og.gain.setValueAtTime(a, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 / m);
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 2.7);
  }
}

function bass(t: number, midi: number, vel: number, dur: number): void {
  const ctx = audio.ctx!;
  const f = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.02);
  g.gain.setTargetAtTime(vel * 0.6, t + 0.05, 0.2);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.connect(g).connect(out());
  for (const [type, a] of [['sine', 1], ['triangle', 0.4]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = a;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.8);
  }
}

function pad(t: number, notes: number[], vel: number, dur: number): void {
  const ctx = audio.ctx!;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(vel * 0.8, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(800, t + dur + 1);
  lp.connect(g).connect(out());
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.12 / notes.length;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 1.4);
    }
  }
}

// ---------------------------------------------------------------- Compositor
export class Music {
  private mood: Mood = MOODS.mañana;
  private target = 'mañana';
  private zone: ZoneFlavor = ZONE_FLAVORS.calle;
  private zoneTarget = 'calle';
  private nextBar = 0;
  private bar = 0;
  private prog: number[] = [0, 3, 4, 0];
  private motif: { step: number; deg: number; len: number }[] = [];
  private lastDeg = 2;
  private timer: number | null = null;
  enabled = true;

  setTarget(name: string): void {
    this.target = name;
  }

  /** La zona cambia el instrumento, la escala y el compás (al empezar la siguiente frase). */
  setZone(name: string): void {
    this.zoneTarget = ZONE_FLAVORS[name] ? name : 'calle';
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextBar = audio.now + 0.5;
    this.timer = window.setInterval(() => this.tick(), 120);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Ánimo efectivo: el del momento del día con el carácter de la zona. */
  private eff(): Mood & { meter: number; extra: ZoneFlavor['extra'] } {
    const M = this.mood, Z = this.zone;
    return {
      ...M,
      lead: Z.lead ?? M.lead,
      mode: Z.mode ?? M.mode,
      root: M.root + Z.rootShift,
      tempo: M.tempo * Z.tempoMul,
      bells: M.bells * Z.bellsMul,
      pad: M.pad * Z.padMul,
      meter: Z.meter,
      extra: Z.extra,
    };
  }

  /** Duración del compás (s). En seis por ocho los pulsos son corcheas. */
  private barLen(M: { tempo: number; meter: number }): number {
    const beat = 60 / M.tempo;
    return M.meter === 6 ? beat * 3 : beat * M.meter;
  }

  private tick(): void {
    if (!audio.ready || !this.enabled) return;
    const ahead = 0.6;
    while (this.nextBar < audio.now + ahead) {
      const len = this.scheduleBar(this.nextBar);
      this.nextBar += len;
    }
  }

  private scaleNote(deg: number, oct = 0, M = this.eff()): number {
    const m = M.mode;
    const o = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return M.root + m[d] + 12 * (o + oct);
  }

  private chord(deg: number, M: ReturnType<Music['eff']>): number[] {
    return [this.scaleNote(deg, 0, M), this.scaleNote(deg + 2, 0, M), this.scaleNote(deg + 4, 0, M)];
  }

  private note(t: number, midi: number, vel: number, lead: Lead, dur: number): void {
    if (lead === 'pluck' || lead === 'harp' || lead === 'box') pluck(t, midi, vel, lead, dur);
    else lead2(t, midi, vel, lead, dur);
  }

  /** Programa un compás y devuelve su duración. */
  private scheduleBar(t: number): number {
    // al cambiar de zona, frase nueva ya en el compás siguiente
    if (ZONE_FLAVORS[this.zoneTarget] !== this.zone) this.bar = 0;
    // cambio de ambiente y de zona en límites de frase (cada 4 compases)
    if (this.bar % 4 === 0) {
      if (MOODS[this.target] && MOODS[this.target] !== this.mood) {
        this.mood = MOODS[this.target];
        audio.musicVerb.gain.setTargetAtTime(this.mood.verb, audio.now, 2);
      }
      if (ZONE_FLAVORS[this.zoneTarget] !== this.zone) {
        this.zone = ZONE_FLAVORS[this.zoneTarget];
        this.motif = [];
      }
      const P = this.mood.progressions;
      this.prog = P[Math.floor(Math.random() * P.length)];
      if (Math.random() < 0.3) this.prog = [...this.prog].reverse();
    }
    const M = this.eff();
    const beat = 60 / M.tempo;
    const len = this.barLen(M);
    // rejilla: semicorcheas en 4/4 y 3/4; corcheas en 6/8
    const steps = M.meter === 6 ? 6 : M.meter * 4;
    const step = len / steps;
    const deg = this.prog[this.bar % 4];
    const ch = this.chord(deg, M);
    const lastOfPhrase = this.bar % 4 === 3;
    // pad y bajo
    if (M.pad > 0) pad(t, ch.map((n) => n + (n > M.root + 7 ? -12 : 0)), 0.5 * M.pad, len);
    if (M.bass > 0) {
      bass(t, this.scaleNote(deg, -2, M), 0.5 * M.bass, Math.min(len * 0.45, beat * 1.8));
      if (M.meter === 3) {
        // vals: «chun-pa-pa» con dos golpecitos de acorde
        for (const k of [1, 2]) for (const n of ch.slice(1)) this.note(t + k * beat, n, 0.07, M.lead, beat * 0.6);
      } else if (M.meter === 6) {
        if (Math.random() < 0.7) bass(t + len / 2, this.scaleNote(deg + 4, -2, M), 0.36 * M.bass, len * 0.4);
      } else if (Math.random() < 0.6) bass(t + beat * 2, this.scaleNote(deg + (Math.random() < 0.5 ? 4 : 0), -2, M), 0.38 * M.bass, beat * 1.5);
    }
    if (M.extra === 'drone' && this.bar % 2 === 0) drone(t, this.scaleNote(0, -2, M), 0.5, len * 2);
    if (M.extra === 'shaker') for (let k = 0; k < steps; k += 2) shaker(t + k * step + (k % 4 === 2 ? M.swing * beat : 0), k % 4 === 0 ? 0.05 : 0.03);
    // melodía: motivo con memoria (repetir y variar)
    let notes: { step: number; deg: number; len: number }[];
    if (this.motif.length && Math.random() < 0.45) {
      const shift = deg - (this.prog[(this.bar + 3) % 4] ?? deg);
      notes = this.motif.map((n) => ({ ...n, deg: n.deg + (Math.random() < 0.7 ? 0 : Math.sign(shift)) }));
    } else {
      notes = [];
      const patterns = M.meter === 3
        ? [[0, 4, 8], [0, 6, 8, 10], [0, 2, 4, 8], [0, 4, 6, 8, 10], [0, 8]]
        : M.meter === 6
          ? [[0, 2, 3, 5], [0, 3], [0, 1, 2, 3, 5], [0, 2, 4], [1, 3, 5]]
          : [[0, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12], [0, 6, 8, 14], [2, 4, 8, 10, 12], [0, 8, 10, 12, 14], [0, 2, 4, 8]];
      const pat = patterns[Math.floor(Math.random() * patterns.length)].filter(() => Math.random() < 0.55 + M.density * 0.5);
      for (const s of pat) {
        const strong = M.meter === 6 ? s % 3 === 0 : s % (M.meter === 3 ? 4 : 8) === 0;
        let d = this.lastDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        if (strong) {
          // gravedad hacia notas del acorde
          const targets = [deg, deg + 2, deg + 4, deg + 7];
          d = targets.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
        } else if (!M.penta.includes(((d % 7) + 7) % 7)) d += 1;
        d = Math.max(-1, Math.min(11, d));
        this.lastDeg = d;
        notes.push({ step: s, deg: d, len: 2 + Math.floor(Math.random() * 3) });
      }
      this.motif = notes;
    }
    if (lastOfPhrase && notes.length) notes[notes.length - 1].len = M.meter === 6 ? 4 : 8;
    const octUp = M.lead === 'box' || M.lead === 'flute' || M.lead === 'marimba' ? 1 : 0;
    for (const n of notes) {
      if (n.step >= steps) continue;
      const swing = n.step % 2 === 1 ? M.swing * beat : 0;
      const human = (Math.random() - 0.5) * 0.012;
      const vel = (n.step % 4 === 0 ? 0.32 : 0.22) * (0.85 + Math.random() * 0.3);
      this.note(t + n.step * step + swing + human, this.scaleNote(n.deg, octUp, M), vel, M.lead, n.len * step);
    }
    // campanitas ocasionales
    if (Math.random() < M.bells) {
      const s = Math.floor(steps * (0.25 + Math.random() * 0.7));
      bell(t + s * step, this.scaleNote(deg + [0, 2, 4][Math.floor(Math.random() * 3)], 2, M), 0.1);
    }
    this.bar++;
    return len;
  }
}

export const music = new Music();
