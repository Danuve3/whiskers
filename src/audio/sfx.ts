// Efectos sintetizados: maullidos y ladridos según el tamaño, ronroneo, pienso, agua, pasos,
// tirita, regalo, logro, palomas y sonidos de interfaz.
import { audio, mtof } from './engine.ts';

function ok(): boolean {
  return audio.ready;
}

function voice(t: number, f0: number, curve: [number, number][], dur: number, formants: number[], vel: number, type: OscillatorType = 'sawtooth'): void {
  const ctx = audio.ctx!;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0 * curve[0][1], t);
  for (const [k, m] of curve) o.frequency.linearRampToValueAtTime(f0 * m, t + k * dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.04);
  g.gain.setTargetAtTime(vel * 0.8, t + 0.05, dur * 0.3);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.8, dur * 0.12);
  const sum = ctx.createGain();
  for (const [i, f] of formants.entries()) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(f * 0.8, t);
    bp.frequency.linearRampToValueAtTime(f, t + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
    const fg = ctx.createGain();
    fg.gain.value = 1 / (i + 1);
    o.connect(bp).connect(fg).connect(sum);
  }
  const pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 0.3;
  sum.connect(g).connect(pan).connect(audio.sfx);
  o.start(t);
  o.stop(t + dur + 0.3);
}

/** Maullido: tono según el tamaño (legH) del gato. */
export function meow(size = 8.5): void {
  if (!ok()) return;
  const t = audio.now + 0.01;
  const f0 = 520 * Math.pow(8.5 / size, 0.6) * (0.9 + Math.random() * 0.2);
  const dur = 0.45 + Math.random() * 0.25;
  voice(t, f0, [[0, 0.85], [0.3, 1.18], [0.75, 1.0], [1, 0.72]], dur, [900, 1800, 3000], 0.22);
}

/** Ladrido: el chihuahua agudo, el mastín grave. */
export function bark(size = 14, times = 2): void {
  if (!ok()) return;
  const f0 = 190 * Math.pow(14 / size, 0.85);
  for (let i = 0; i < times; i++) {
    const t = audio.now + 0.01 + i * (0.22 + size * 0.004);
    voice(t, f0 * (0.95 + Math.random() * 0.1), [[0, 1.3], [0.2, 1.1], [1, 0.7]], 0.13 + size * 0.004, [f0 * 3.2, f0 * 6, 2400], 0.32);
    // golpe de aire
    const n = audio.noiseSource(false);
    const bp = audio.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0 * 4;
    const g = audio.ctx!.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(g).connect(audio.sfx);
    n.start(t, Math.random());
    n.stop(t + 0.12);
  }
}

/** Ronroneo: ruido grave modulado a ~25 Hz. */
export function purr(seconds = 2.2): void {
  if (!ok()) return;
  const ctx = audio.ctx!;
  const t = audio.now;
  const n = audio.noiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const am = ctx.createGain();
  am.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 24 + Math.random() * 4;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.3);
  g.gain.setTargetAtTime(0.0001, t + seconds, 0.25);
  n.connect(lp).connect(am).connect(g).connect(audio.sfx);
  n.start(t);
  lfo.start(t);
  n.stop(t + seconds + 1.2);
  lfo.stop(t + seconds + 1.2);
}

function burst(t: number, freq: number, q: number, len: number, vel: number): void {
  const ctx = audio.ctx!;
  const n = audio.noiseSource(false);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.connect(bp).connect(g).connect(audio.sfx);
  n.start(t, Math.random() * 3);
  n.stop(t + len + 0.02);
}

/** Crujido de pienso cayendo en el cuenco. */
export function kibble(): void {
  if (!ok()) return;
  const t = audio.now;
  for (let i = 0; i < 14; i++) burst(t + i * 0.035 + Math.random() * 0.02, 2500 + Math.random() * 2500, 4, 0.03, 0.25);
  ding(t + 0.05, 76, 0.05);
}

/** Agua cayendo en el cuenco (el tono sube a medida que se llena). */
export function pour(): void {
  if (!ok()) return;
  const ctx = audio.ctx!;
  const t = audio.now;
  const n = audio.noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 5;
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.35, t + 0.05);
  g.gain.setTargetAtTime(0.0001, t + 0.85, 0.08);
  n.connect(bp).connect(g).connect(audio.sfx);
  n.start(t);
  n.stop(t + 1.3);
  for (let i = 0; i < 6; i++) ding(t + 0.1 + i * 0.13, 84 + i, 0.03);
}

/** Lametazos (beber). */
export function lap(): void {
  if (!ok()) return;
  const t = audio.now;
  for (let i = 0; i < 4; i++) burst(t + i * 0.22, 1400, 8, 0.05, 0.18);
}

/** Paso según el suelo. */
export function step(surface: 'piedra' | 'hierba' | 'madera' = 'piedra'): void {
  if (!ok()) return;
  const t = audio.now;
  const f = surface === 'hierba' ? 900 : surface === 'madera' ? 500 : 1500;
  burst(t, f * (0.9 + Math.random() * 0.2), surface === 'hierba' ? 0.8 : 2, surface === 'hierba' ? 0.08 : 0.045, surface === 'hierba' ? 0.08 : 0.11);
}

function ding(t: number, midi: number, vel: number): void {
  const ctx = audio.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(audio.sfx);
  o.start(t);
  o.stop(t + 0.7);
}

/** Tirita: rasgar el papel y un «boop» simpático. */
export function bandage(): void {
  if (!ok()) return;
  const ctx = audio.ctx!;
  const t = audio.now;
  const n = audio.noiseSource(false);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1500, t);
  hp.frequency.linearRampToValueAtTime(5000, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  n.connect(hp).connect(g).connect(audio.sfx);
  n.start(t);
  n.stop(t + 0.3);
  ding(t + 0.35, 72, 0.12);
  ding(t + 0.45, 79, 0.1);
}

/** Corazón de confianza: campanita suave. */
export function heart(): void {
  if (!ok()) return;
  const t = audio.now;
  ding(t, 81, 0.1);
  ding(t + 0.09, 88, 0.08);
}

/** Regalo: arpegio de campanas. */
export function gift(): void {
  if (!ok()) return;
  const t = audio.now;
  [72, 76, 79, 84, 88].forEach((m, i) => ding(t + i * 0.08, m, 0.1));
}

/** Logro: pequeña fanfarria de caja de música. */
export function achievement(): void {
  if (!ok()) return;
  const t = audio.now;
  [[0, 72], [0.12, 76], [0.24, 79], [0.36, 84], [0.6, 83], [0.72, 84], [0.84, 88]].forEach(([d, m]) => ding(t + d, m, 0.13));
}

/** Aleteo de palomas. */
export function flap(): void {
  if (!ok()) return;
  const t = audio.now;
  for (let i = 0; i < 8; i++) burst(t + i * 0.06, 600 + Math.random() * 300, 1, 0.05, 0.1 * (1 - i / 8));
}

/** Interfaz: toque suave, abrir y cerrar. */
export function ui(kind: 'tap' | 'open' | 'close' | 'nope' = 'tap'): void {
  if (!ok()) return;
  const t = audio.now;
  if (kind === 'tap') ding(t, 84, 0.06);
  else if (kind === 'open') {
    ding(t, 79, 0.06);
    ding(t + 0.06, 86, 0.05);
  } else if (kind === 'close') {
    ding(t, 86, 0.05);
    ding(t + 0.06, 79, 0.05);
  } else {
    ding(t, 70, 0.06);
    ding(t + 0.08, 67, 0.05);
  }
}
