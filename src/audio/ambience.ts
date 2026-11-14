// Ambiente: lluvia (ruido filtrado + gotas), viento, grillos de noche, pájaros de día,
// gaviotas lejanas y el murmullo de la fuente según la distancia.
import { audio } from './engine.ts';

interface Bed {
  gain: GainNode;
}

export class Ambience {
  private rain: Bed | null = null;
  private wind: Bed | null = null;
  private fountain: Bed | null = null;
  private crickets: GainNode | null = null;
  private birdT = 0;
  private gullT = 8;
  private dropT = 0;
  private crickT = 0;

  private bed(make: (out: GainNode) => void): Bed {
    const g = audio.ctx!.createGain();
    g.gain.value = 0;
    g.connect(audio.amb);
    make(g);
    return { gain: g };
  }

  private init(): void {
    const ctx = audio.ctx!;
    this.rain = this.bed((g) => {
      const n = audio.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      n.connect(hp).connect(lp).connect(g);
      n.start();
    });
    this.wind = this.bed((g) => {
      const n = audio.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400;
      bp.Q.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const d = ctx.createGain();
      d.gain.value = 220;
      lfo.connect(d).connect(bp.frequency);
      lfo.start();
      n.connect(bp).connect(g);
      n.start();
    });
    this.fountain = this.bed((g) => {
      const n = audio.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.9;
      const am = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.3;
      const d = ctx.createGain();
      d.gain.value = 0.25;
      am.gain.value = 0.75;
      lfo.connect(d).connect(am.gain);
      lfo.start();
      n.connect(bp).connect(am).connect(g);
      n.start();
    });
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    this.crickets.connect(audio.amb);
  }

  update(dt: number, s: { rain: number; wind: number; hour: number; fountainDist: number; port: boolean }): void {
    if (!audio.ready) return;
    if (!this.rain) this.init();
    const t = audio.now;
    const night = s.hour < 6.5 || s.hour > 21;
    this.rain!.gain.gain.setTargetAtTime(s.rain * 0.55, t, 1.2);
    this.wind!.gain.gain.setTargetAtTime(0.05 + Math.abs(s.wind) * 0.12 + s.rain * 0.05, t, 2);
    const fv = Math.max(0, 1 - s.fountainDist / 9) ** 1.5 * 0.32;
    this.fountain!.gain.gain.setTargetAtTime(fv, t, 0.5);
    this.crickets!.gain.setTargetAtTime(night && s.rain < 0.2 ? 0.5 : 0, t, 2);
    // gotas sueltas sobre toldos y charcos
    this.dropT -= dt;
    if (s.rain > 0.1 && this.dropT <= 0) {
      this.dropT = 0.04 + Math.random() * (0.25 / s.rain);
      this.tick(t, 2500 + Math.random() * 3000, 0.04 * s.rain);
    }
    // grillos: trinos agudos en grupos
    this.crickT -= dt;
    if (night && s.rain < 0.2 && this.crickT <= 0) {
      this.crickT = 0.6 + Math.random() * 1.4;
      this.chirp(t);
    }
    // pájaros de día con buen tiempo
    this.birdT -= dt;
    if (!night && s.hour > 7 && s.rain < 0.2 && this.birdT <= 0) {
      this.birdT = 3 + Math.random() * 7;
      this.bird(t);
    }
    // gaviotas (más en el puerto, lejanas en el resto)
    this.gullT -= dt;
    if (!night && this.gullT <= 0) {
      this.gullT = (s.port ? 6 : 25) + Math.random() * 20;
      this.gull(t, s.port ? 0.12 : 0.04);
    }
  }

  private tick(t: number, f: number, vel: number): void {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(pan).connect(audio.amb);
    o.start(t);
    o.stop(t + 0.06);
  }

  private chirp(t: number): void {
    const ctx = audio.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.crickets!);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = 4300 + Math.random() * 300;
      const g = ctx.createGain();
      const s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.03, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.06);
      o.connect(g).connect(pan);
      o.start(s);
      o.stop(s + 0.08);
    }
  }

  private bird(t: number): void {
    const ctx = audio.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(audio.amb);
    const notes = 2 + Math.floor(Math.random() * 4);
    let s = t;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const f = 2600 + Math.random() * 1600;
      o.frequency.setValueAtTime(f, s);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.75), s + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.035, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
      o.connect(g).connect(pan);
      o.start(s);
      o.stop(s + 0.12);
      s += 0.11 + Math.random() * 0.06;
    }
  }

  private gull(t: number, vel: number): void {
    const ctx = audio.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(audio.amb);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, s);
      o.frequency.linearRampToValueAtTime(1500, s + 0.08);
      o.frequency.linearRampToValueAtTime(1000, s + 0.25);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(vel, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.27);
      o.connect(bp).connect(g).connect(pan);
      o.start(s);
      o.stop(s + 0.3);
    }
  }
}

export const ambience = new Ambience();
