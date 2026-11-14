// Motor de audio: contexto, buses (música, efectos, ambiente), reverb por convolución generada
// y utilidades de síntesis. Arranca con el primer toque y se pausa con la pestaña oculta.
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  amb!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  /** reverb larga para la música de noche y con lluvia */
  musicVerb!: GainNode;
  noise!: AudioBuffer;
  private vols = { music: 0.7, sfx: 0.8, ambient: 0.7 };
  private muted = false;

  /** Crear (o reanudar) el contexto: solo tras un gesto del usuario. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.musicVerb = ctx.createGain();
    this.musicVerb.gain.value = 0.35;
    this.music.connect(this.musicVerb).connect(this.reverbSend);
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    const sfxVerb = ctx.createGain();
    sfxVerb.gain.value = 0.18;
    this.sfx.connect(sfxVerb).connect(this.reverbSend);
    this.amb.connect(this.master);
    this.noise = this.makeNoise(4);
    this.apply();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setVolumes(v: { music: number; sfx: number; ambient: number; muted: boolean }): void {
    this.vols = { music: v.music, sfx: v.sfx, ambient: v.ambient };
    this.muted = v.muted;
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.08);
    this.music.gain.setTargetAtTime(this.vols.music * 0.55, t, 0.15);
    this.sfx.gain.setTargetAtTime(this.vols.sfx * 0.8, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vols.ambient * 0.7, t, 0.15);
  }

  /** Respuesta al impulso generada: ruido estéreo con caída exponencial y primeras reflexiones. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // ruido filtrado (más oscuro al final) con caída exponencial
        const w = Math.random() * 2 - 1;
        const k = 0.35 + t * 0.6;
        lp = lp + (w - lp) * (1 - k);
        d[i] = lp * Math.pow(1 - t, decay);
      }
      // primeras reflexiones
      for (const [ms, g] of [[11, 0.5], [23, 0.35], [37, 0.28], [53, 0.2]] as const) {
        const i = Math.floor((ms + ch * 3) * ctx.sampleRate / 1000);
        if (i < n) d[i] += g * (ch ? -1 : 1);
      }
    }
    return b;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** Fuente de ruido (en bucle) con filtro. */
  noiseSource(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random() * 2;
    return s;
  }
}

export const audio = new AudioEngine();

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Envolvente ADSR sencilla sobre un AudioParam. */
export function env(p: AudioParam, t: number, a: number, peak: number, d: number, s: number, rel: number, len: number): void {
  p.cancelScheduledValues(t);
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(Math.max(0.0001, s), t + a, d / 3);
  p.setTargetAtTime(0.0001, t + Math.max(a, len), rel / 4);
}
