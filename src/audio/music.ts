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
  lead: 'pluck' | 'harp' | 'box';
  pad: number; // volumen del pad
  bass: number;
  bells: number;
  verb: number;
  swing: number;
}

const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

export const MOODS: Record<string, Mood> = {
  mañana: { name: 'mañana', tempo: 84, root: 62, mode: IONIAN, penta: [0, 1, 2, 4, 5], progressions: [[0, 4, 5, 3], [0, 3, 1, 4], [0, 5, 3, 4]], density: 0.62, lead: 'pluck', pad: 0.35, bass: 0.7, bells: 0.3, verb: 0.3, swing: 0.04 },
  tarde: { name: 'tarde', tempo: 72, root: 55, mode: MIXO, penta: [0, 1, 2, 4, 5], progressions: [[0, 6, 3, 0], [0, 3, 6, 4], [5, 3, 0, 6]], density: 0.5, lead: 'harp', pad: 0.5, bass: 0.8, bells: 0.2, verb: 0.4, swing: 0.06 },
  noche: { name: 'noche', tempo: 62, root: 64, mode: LYDIAN, penta: [0, 1, 2, 4, 5], progressions: [[0, 1, 5, 0], [0, 4, 1, 3], [3, 1, 0, 4]], density: 0.4, lead: 'box', pad: 0.45, bass: 0.35, bells: 0.5, verb: 0.65, swing: 0 },
  lluvia: { name: 'lluvia', tempo: 58, root: 52, mode: DORIAN, penta: [0, 2, 3, 4, 6], progressions: [[0, 3, 6, 0], [0, 5, 3, 4], [0, 6, 5, 3]], density: 0.36, lead: 'harp', pad: 0.7, bass: 0.55, bells: 0.25, verb: 0.75, swing: 0.03 },
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

  start(): void {
    if (this.timer !== null) return;
    this.nextBar = audio.now + 0.5;
    this.timer = window.setInterval(() => this.tick(), 120);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (!audio.ready || !this.enabled) return;
    const ahead = 0.6;
    while (this.nextBar < audio.now + ahead) {
      this.scheduleBar(this.nextBar);
      this.nextBar += (60 / this.mood.tempo) * 4;
    }
  }

  private scaleNote(deg: number, oct = 0): number {
    const m = this.mood.mode;
    const o = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return this.mood.root + m[d] + 12 * (o + oct);
  }

  private chord(deg: number): number[] {
    return [this.scaleNote(deg), this.scaleNote(deg + 2), this.scaleNote(deg + 4)];
  }

  private scheduleBar(t: number): void {
    // cambio de ambiente en límites de frase (cada 4 compases)
    if (this.bar % 4 === 0) {
      if (MOODS[this.target] && MOODS[this.target] !== this.mood) {
        this.mood = MOODS[this.target];
        audio.musicVerb.gain.setTargetAtTime(this.mood.verb, audio.now, 2);
      }
      const P = this.mood.progressions;
      this.prog = P[Math.floor(Math.random() * P.length)];
      if (Math.random() < 0.3) this.prog = [...this.prog].reverse();
    }
    const M = this.mood;
    const beat = 60 / M.tempo;
    const step = beat / 4;
    const deg = this.prog[this.bar % 4];
    const ch = this.chord(deg);
    const lastOfPhrase = this.bar % 4 === 3;
    // pad y bajo
    if (M.pad > 0) pad(t, ch.map((n) => n + (n > M.root + 7 ? -12 : 0)), 0.5 * M.pad, beat * 4);
    if (M.bass > 0) {
      bass(t, this.scaleNote(deg, -2), 0.5 * M.bass, beat * 1.8);
      if (Math.random() < 0.6) bass(t + beat * 2, this.scaleNote(deg + (Math.random() < 0.5 ? 4 : 0), -2), 0.38 * M.bass, beat * 1.5);
    }
    // melodía: motivo con memoria (repetir y variar)
    let notes: { step: number; deg: number; len: number }[];
    if (this.motif.length && Math.random() < 0.45) {
      const shift = deg - (this.prog[(this.bar + 3) % 4] ?? deg);
      notes = this.motif.map((n) => ({ ...n, deg: n.deg + (Math.random() < 0.7 ? 0 : Math.sign(shift)) }));
    } else {
      notes = [];
      const patterns = [[0, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12], [0, 6, 8, 14], [2, 4, 8, 10, 12], [0, 8, 10, 12, 14], [0, 2, 4, 8]];
      const pat = patterns[Math.floor(Math.random() * patterns.length)].filter(() => Math.random() < 0.55 + M.density * 0.5);
      for (const s of pat) {
        const strong = s % 8 === 0;
        let d = this.lastDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        if (strong) {
          // gravedad hacia notas del acorde
          const targets = [deg, deg + 2, deg + 4, deg + 7].map((x) => x);
          d = targets.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
        } else if (!M.penta.includes(((d % 7) + 7) % 7)) d += 1;
        d = Math.max(-1, Math.min(11, d));
        this.lastDeg = d;
        notes.push({ step: s, deg: d, len: 2 + Math.floor(Math.random() * 3) });
      }
      this.motif = notes;
    }
    if (lastOfPhrase && notes.length) notes[notes.length - 1].len = 8;
    for (const n of notes) {
      const swing = n.step % 2 === 1 ? M.swing * beat : 0;
      const human = (Math.random() - 0.5) * 0.012;
      const vel = (n.step % 4 === 0 ? 0.32 : 0.22) * (0.85 + Math.random() * 0.3);
      pluck(t + n.step * step + swing + human, this.scaleNote(n.deg, M.lead === 'box' ? 1 : 0), vel, M.lead, n.len * step);
    }
    // campanitas ocasionales
    if (Math.random() < M.bells) {
      const s = [4, 10, 12, 14][Math.floor(Math.random() * 4)];
      bell(t + s * step, this.scaleNote(deg + [0, 2, 4][Math.floor(Math.random() * 3)], 2), 0.1);
    }
    this.bar++;
  }
}

export const music = new Music();
