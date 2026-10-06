// src/audio/ambience.ts — owner A. Continuous beds (GDD §17): sea waves (band-passed noise, 0.1 Hz swell, louder toward
// the sea), city hum per phase/scene, wind up high / on the pier, subway tunnel rumble, night insects on the planet,
// and the sfx_drone bed whose gain follows uUncanny. Gains glide with setTargetAtTime (no clicks).
import type { Rng } from '../contracts';
import type { Synth } from './synth';

export interface AmbTargets { waves: number; hum: number; wind: number; rumble: number; drone: number; insects: number }

const BEDS: readonly (keyof AmbTargets)[] = ['waves', 'hum', 'wind', 'rumble', 'drone'];

export class Ambience {
  private readonly s: Synth;
  private readonly rng: Rng;
  private readonly bus: GainNode;
  private readonly g: Record<keyof AmbTargets, GainNode>;
  private readonly last: Record<keyof AmbTargets, number> = { waves: 0, hum: 0, wind: 0, rumble: 0, drone: 0, insects: 0 };
  private nextChirp = 0;
  private insects = 0;
  constructor(s: Synth, rng: Rng) {
    this.s = s;
    this.rng = rng;
    const ctx = s.ctx, t = ctx.currentTime;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(s.out);
    const gain = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus); return g; };
    this.g = { waves: gain(), hum: gain(), wind: gain(), rumble: gain(), drone: gain(), insects: gain() };
    const loop = (filter: BiquadFilterType, f: number, q: number, dest: AudioNode, offset: number) => {
      const n = ctx.createBufferSource(); n.buffer = s.noise; n.loop = true;
      const bq = ctx.createBiquadFilter(); bq.type = filter; bq.frequency.value = f; bq.Q.value = q;
      n.connect(bq).connect(dest); n.start(t, offset);
      return bq;
    };
    // waves: band-passed noise with a 0.1 Hz swell (LFO on an intermediate gain)
    const swell = ctx.createGain(); swell.gain.value = 0.65; swell.connect(this.g.waves);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.35;
    lfo.connect(lfoAmt).connect(swell.gain); lfo.start(t);
    const wbp = loop('bandpass', 520, 0.6, swell, 0.1);
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.07;
    const wAmt = ctx.createGain(); wAmt.gain.value = 180; wlfo.connect(wAmt).connect(wbp.frequency); wlfo.start(t);
    // city hum: mains 50/100 Hz + low traffic noise
    for (const [f, v] of [[50, 0.5], [100, 0.3]] as const) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = v; o.connect(og).connect(this.g.hum); o.start(t);
    }
    loop('lowpass', 220, 0.5, this.g.hum, 0.5);
    // wind: high-passed noise with a gust LFO
    const gust = ctx.createGain(); gust.gain.value = 0.6; gust.connect(this.g.wind);
    const gl = ctx.createOscillator(); gl.frequency.value = 0.17;
    const gla = ctx.createGain(); gla.gain.value = 0.4; gl.connect(gla).connect(gust.gain); gl.start(t);
    loop('highpass', 1100, 0.4, gust, 0.9);
    // subway: tunnel rumble
    loop('lowpass', 90, 0.9, this.g.rumble, 1.3);
    // drone: two detuned saws 55 + 58 Hz through a low-pass (GDD §17 sfx_drone), always running, gain = uncanny
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 240; dlp.Q.value = 3; dlp.connect(this.g.drone);
    const dl = ctx.createOscillator(); dl.frequency.value = 0.13;
    const dla = ctx.createGain(); dla.gain.value = 90; dl.connect(dla).connect(dlp.frequency); dl.start(t);
    for (const f of [55, 58]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dlp); o.start(t); }
  }

  /** Glide every bed toward its target (called each tick; cheap no-ops when unchanged). */
  set(tg: AmbTargets, duck: number): void {
    const t = this.s.ctx.currentTime;
    for (const k of BEDS) {
      // schedule only on a real change: one setTargetAtTime per bed per tick would pile up automation events
      const v = tg[k] * duck;
      if (Math.abs(v - this.last[k]) < 1e-4) continue;
      this.last[k] = v;
      this.g[k].gain.setTargetAtTime(v, t, k === 'drone' ? 0.25 : 0.6);
    }
    this.insects = tg.insects * duck;
    this.chirps(t);
  }

  /** Night insects: sparse 4–5 kHz chirp trains scheduled ahead on the audio clock (seeded, deterministic). */
  private chirps(t: number): void {
    if (this.insects <= 0.001) { this.nextChirp = t + 0.5; return; }
    if (this.nextChirp > t + 0.2) return;
    const ctx = this.s.ctx, start = Math.max(t + 0.02, this.nextChirp);
    const f = this.rng.range(4200, 5200), n = this.rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); const t0 = start + i * 0.055;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(this.insects, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
      o.connect(g).connect(this.bus); o.start(t0); o.stop(t0 + 0.05);
    }
    this.nextChirp = start + n * 0.055 + this.rng.range(0.4, 1.6);
  }
}
