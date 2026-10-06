// src/audio/synth.ts — owner A. Every SfxId synthesized with WebAudio (GDD §17, TECH §6): oscillators + one seeded
// noise buffer, exponential envelopes (never to 0). Works on AudioContext and OfflineAudioContext (dev RMS page).
import type { SfxId } from '../types';

export interface Synth { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }
/** Extra per-call parameters decided by the caller (pitch variants). */
export interface SfxOpts { vol: number; high?: boolean; pitch?: number }

/** Seeded white noise (Park–Miller), 2 s, so every run sounds the same and tests are deterministic. */
export function makeNoise(ctx: BaseAudioContext, seconds = 2, seed = 1234567): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = seed;
  for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return b;
}

const EPS = 0.0001;
function env(g: GainNode, t: number, a: number, peak: number, dec: number): void {
  g.gain.setValueAtTime(EPS, t);
  g.gain.exponentialRampToValueAtTime(Math.max(EPS * 2, peak), t + Math.max(0.001, a));
  g.gain.exponentialRampToValueAtTime(EPS, t + Math.max(0.001, a) + Math.max(0.005, dec));
}

export function tone(s: Synth, freq: number, t: number, dur: number, type: OscillatorType, vol: number, freqEnd?: number, dest?: AudioNode): void {
  const o = s.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = s.ctx.createGain();
  env(g, t, 0.004, vol, dur);
  o.connect(g).connect(dest ?? s.out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function noiseHit(
  s: Synth, t: number, dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, attack = 0.002, offset = 0.3,
  dest?: AudioNode,
): void {
  const n = s.ctx.createBufferSource();
  n.buffer = s.noise;
  const f = s.ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = s.ctx.createGain();
  env(g, t, attack, vol, dur);
  n.connect(f).connect(g).connect(dest ?? s.out);
  n.start(t, offset % Math.max(0.01, s.noise.duration - dur - 0.1), dur + attack + 0.05);
}

function shutter(s: Synth, t: number, v: number): void {
  noiseHit(s, t, 0.03, 'bandpass', 3200, 0.8, 0.8 * v, 0.001, 0.25);
  tone(s, 1760, t + 0.004, 0.012, 'square', 0.1 * v);
  noiseHit(s, t + 0.06, 0.025, 'bandpass', 2400, 1.2, 0.45 * v, 0.001, 0.61);   // rebound click
  tone(s, 1320, t + 0.062, 0.01, 'square', 0.06 * v);
}

/** Each entry schedules the sound at `t` and returns its length in seconds. */
export const SFX: Readonly<Record<SfxId, (s: Synth, t: number, o: SfxOpts) => number>> = {
  sfx_shutter: (s, t, o) => { shutter(s, t, o.vol); return 0.12; },
  sfx_burst: (s, t, o) => { for (let i = 0; i < 3; i++) shutter(s, t + i * 0.3, o.vol); return 0.75; },
  sfx_flash: (s, t, o) => { tone(s, 4000, t, 0.2, 'sine', 0.05 * o.vol, 9000); return 0.25; },
  sfx_scan: (s, t, o) => { tone(s, 1200, t, 0.08, 'square', 0.07 * o.vol); tone(s, 1600, t + 0.11, 0.12, 'square', 0.07 * o.vol); return 0.28; },
  sfx_step: (s, t, o) => { noiseHit(s, t, 0.06, 'lowpass', 600, 0.7, 0.3 * o.vol, 0.003, 0.4 + (o.pitch ?? 0) * 0.13); return 0.08; },
  sfx_waves: (s, t, o) => { noiseHit(s, t, 1.6, 'bandpass', 520, 0.6, 0.25 * o.vol, 0.7, 0.9); return 2.4; },
  sfx_ping: (s, t, o) => { tone(s, 880, t, 0.04, 'sine', 0.2 * o.vol); tone(s, 880, t + 0.11, 0.04, 'sine', 0.2 * o.vol); return 0.2; },
  sfx_type: (s, t, o) => { noiseHit(s, t, 0.008, 'highpass', 3000, 0.7, 0.12 * o.vol, 0.001, 0.77); tone(s, 2100, t, 0.01, 'triangle', 0.02 * o.vol); return 0.03; },
  sfx_paper: (s, t, o) => {
    for (let i = 0; i < 7; i++) {
      const dt = i * 0.045 + ((i * 37) % 11) * 0.004;
      noiseHit(s, t + dt, 0.03 + (i % 3) * 0.01, 'highpass', 4200 + (i % 4) * 900, 0.9, (0.18 - i * 0.012) * o.vol, 0.002, 0.13 * i);
    }
    return 0.45;
  },
  sfx_drone: (s, t, o) => {
    const lp = s.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2;
    const g = s.ctx.createGain(); env(g, t, 0.6, 0.18 * o.vol, 1.8);
    lp.connect(g).connect(s.out);
    for (const f of [55, 58]) { const osc = s.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f; osc.connect(lp); osc.start(t); osc.stop(t + 2.6); }
    return 2.6;
  },
  sfx_notice: (s, t, o) => {                    // 叮咚 announcement: three falling tones
    [784, 659, 523].forEach((f, i) => { tone(s, f, t + i * 0.34, 0.45, 'triangle', 0.16 * o.vol); tone(s, f * 2, t + i * 0.34, 0.2, 'sine', 0.04 * o.vol); });
    return 1.2;
  },
  sfx_chime: (s, t, o) => {                     // metro chime: four rising tones
    [523, 659, 784, 1047].forEach((f, i) => { tone(s, f, t + i * 0.22, 0.32, 'sine', 0.15 * o.vol); tone(s, f * 3, t + i * 0.22, 0.08, 'sine', 0.02 * o.vol); });
    return 1.1;
  },
  sfx_pigeons: (s, t, o) => {                   // wing-flap noise clusters
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 10; i++) {
        noiseHit(s, t + c * 0.35 + i * 0.075 + (i % 2) * 0.012, 0.035, 'bandpass', 1300 + ((i * 7 + c * 3) % 5) * 180, 1.4, (0.22 - i * 0.012) * o.vol, 0.004, 0.05 * i + c * 0.4);
      }
    }
    return 1.2;
  },
  sfx_countdown: (s, t, o) => { tone(s, o.high ? 1500 : 1000, t, 0.07, 'square', 0.06 * o.vol); return 0.1; },
  sfx_horn: (s, t, o) => {
    const lp = s.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(s.out);
    for (let i = 0; i < 2; i++) {
      const osc = s.ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 330;
      const g = s.ctx.createGain(); const t0 = t + i * 0.55;
      g.gain.setValueAtTime(EPS, t0); g.gain.exponentialRampToValueAtTime(0.09 * o.vol, t0 + 0.02);
      g.gain.setValueAtTime(0.09 * o.vol, t0 + 0.36); g.gain.exponentialRampToValueAtTime(EPS, t0 + 0.42);
      osc.connect(g).connect(lp); osc.start(t0); osc.stop(t0 + 0.45);
    }
    return 1.1;
  },
  sfx_keypad: (s, t, o) => { tone(s, o.pitch ?? 880, t, 0.06, 'square', 0.05 * o.vol); return 0.08; },
  sfx_memo: (s, t, o) => { for (let i = 0; i < 3; i++) tone(s, 300, t + i * 0.42, 0.26, 'triangle', 0.2 * o.vol); return 1.2; },
  sfx_click: (s, t, o) => { tone(s, 3800, t, 0.006, 'square', 0.04 * o.vol); noiseHit(s, t, 0.006, 'highpass', 5000, 0.7, 0.08 * o.vol, 0.001, 1.1); return 0.02; },
  sfx_stamp: (s, t, o) => {
    noiseHit(s, t, 0.12, 'lowpass', 260, 0.8, 0.7 * o.vol, 0.002, 1.3);
    tone(s, 110, t, 0.14, 'sine', 0.35 * o.vol, 55);
    return 0.2;
  },
  sfx_door: (s, t, o) => {                      // rolling shutter rattle, then a thud
    const n = s.ctx.createBufferSource(); n.buffer = s.noise;
    const bp = s.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 1.1;
    const g = s.ctx.createGain(); env(g, t, 0.05, 0.3 * o.vol, 0.6);
    const am = s.ctx.createGain(); am.gain.value = 0.6;
    const lfo = s.ctx.createOscillator(); lfo.frequency.value = 24;
    const lfoG = s.ctx.createGain(); lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(am.gain);
    n.connect(bp).connect(am).connect(g).connect(s.out);
    n.start(t, 0.2, 0.8); lfo.start(t); lfo.stop(t + 0.75);
    noiseHit(s, t + 0.62, 0.1, 'lowpass', 200, 0.7, 0.5 * o.vol, 0.002, 1.5);
    return 0.8;
  },
  sfx_fail: (s, t, o) => { tone(s, 330, t, 0.13, 'square', 0.05 * o.vol); tone(s, 247, t + 0.15, 0.2, 'square', 0.05 * o.vol); return 0.4; },
};

export const SFX_IDS = Object.keys(SFX) as SfxId[];
