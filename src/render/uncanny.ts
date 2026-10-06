// src/render/uncanny.ts — owner A. Raw uUncanny envelopes (ARCHITECTURE §3.A item 3, GDD §5.9) and the two derived
// weights of ART §2.3: grade/sky uUncW = clamp((u − 0.15)/0.85) and line boil uBoil. Pure: sim time in, numbers out.
import type { UncannyId } from '../types';

export const UNCANNY_BASE_NIGHT = 0.15;
export const UNCANNY_SUBWAY = 0.6;

/** ART §2.3 grade/sky weight: 0 at the night baseline 0.15, 1 at 1. */
export function uncW(u: number): number { return Math.min(1, Math.max(0, (u - 0.15) / 0.85)); }
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** ART §2.3 line boil: 0 when u ≤ 0, else 0.3 → 1 over u 0.15 → 0.6. */
export function boilOf(u: number): number { return u <= 0 ? 0 : 0.3 + 0.7 * smooth(0.15, 0.6, u); }

/** Baseline from game state: night before P8_done 0.15; inside subway_int a constant 0.6 (M_subway). */
export function uncannyBase(o: { phase: string; p8Done: boolean; scene: string }): number {
  let b = 0;
  if (o.phase === 'night' && !o.p8Done) b = UNCANNY_BASE_NIGHT;
  if (o.scene === 'subway_int') b = Math.max(b, UNCANNY_SUBWAY);
  return b;
}

export const CHAI_RISE = 1.2;      // M_chai_wake: → 1 over 1.2 s, held until the next dialogueEnd
export const CHAI_FALL = 1.0;      // release back to the baseline
export const ZHE_FALL = 2.0;       // M_zhe: 1 → 0 over 2 s

interface Pulse { t0: number; dur: number; peak: number }

export class UncannyEnvelope {
  private chai: { t0: number; releaseAt: number | null; releaseFrom: number } | null = null;
  private zhe: number | null = null;
  private pulses: Pulse[] = [];

  trigger(id: UncannyId, t: number): void {
    switch (id) {
      case 'M_chai_wake': this.chai = { t0: t, releaseAt: null, releaseFrom: 1 }; this.zhe = null; break;
      case 'M_zhimei_move': this.pulses.push({ t0: t, dur: 0.6, peak: 0.3 }); break;
      case 'M_lighthouse_off': this.pulses.push({ t0: t, dur: 4, peak: 0.5 }); break;
      case 'M_zhe': this.zhe = t; this.chai = null; this.pulses = []; break;
      default: break;   // M_wake_face / M_mirror_face (C's screen), M_subway (implied by the scene)
    }
  }
  /** A dialogue ended: the chai hold releases (back to the baseline after M_chai_wake's line). */
  dialogueEnd(t: number): void {
    if (this.chai && this.chai.releaseAt === null) {
      this.chai.releaseFrom = this.chaiLevel(t, 0);
      this.chai.releaseAt = t;
    }
  }
  reset(): void { this.chai = null; this.zhe = null; this.pulses = []; }

  private chaiLevel(t: number, base: number): number {
    const c = this.chai;
    if (!c) return 0;
    if (c.releaseAt === null) {
      const k = Math.min(1, Math.max(0, (t - c.t0) / CHAI_RISE));
      return base + (1 - base) * k;
    }
    const k = Math.min(1, Math.max(0, (t - c.releaseAt) / CHAI_FALL));
    return c.releaseFrom + (base - c.releaseFrom) * k;
  }

  /** Raw uUncanny at sim time t over the baseline. M_zhe overrides everything while it decays. */
  value(t: number, base: number): number {
    if (this.zhe !== null) {
      const k = (t - this.zhe) / ZHE_FALL;
      if (k < 1) return Math.max(0, 1 - Math.max(0, k));
      this.zhe = null;
    }
    let v = base;
    if (this.chai) {
      v = Math.max(v, this.chaiLevel(t, base));
      if (this.chai.releaseAt !== null && t - this.chai.releaseAt >= CHAI_FALL) this.chai = null;
    }
    if (this.pulses.length) {                               // in-place prune: no per-frame array (ARCH §5.1)
      let n = 0;
      for (let i = 0; i < this.pulses.length; i++) {
        const p = this.pulses[i];
        if (t >= p.t0 + p.dur) continue;
        this.pulses[n++] = p;
        if (t >= p.t0) v = Math.max(v, p.peak);
      }
      this.pulses.length = n;
    }
    return Math.min(1, Math.max(0, v));
  }
}
