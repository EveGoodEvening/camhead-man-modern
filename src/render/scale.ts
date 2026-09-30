// src/render/scale.ts — owner A. Adaptive render scale (Phase 2 perf): the frame is fill-bound, so when the smoothed
// frame time misses the 60 Hz budget the drawing buffer shrinks (0.6–1.0 of the base pixel ratio) and grows back once
// frames are comfortably fast. Ink lines are sized from the MRT height (pipeline.composite: uLinePx = h / 720), so they
// keep their on-screen width (≈ 2–3 CSS px) at every scale. Never used under ?test or an explicit ?dpr (deterministic).

export interface ScaleOpts {
  min: number; max: number; step: number;
  /** ms: shrink when the smoothed frame time is above `slowMs`, grow after `growAfterMs` below `fastMs` */
  slowMs: number; fastMs: number; growAfterMs: number;
}

export const SCALE_DEFAULTS: ScaleOpts = { min: 0.6, max: 1, step: 0.05, slowMs: 19.5, fastMs: 17.4, growAfterMs: 3000 };

/** Pure controller (unit-tested): feed it the wall-clock delta of every rendered frame. */
export class RenderScaler {
  scale: number;
  private readonly o: ScaleOpts;
  private ema = -1;
  private fastFor = 0;
  private cooldown = 0;
  private ceiling: number;
  private sinceUp = Infinity;
  private ceilingAge = 0;
  constructor(o: Partial<ScaleOpts> = {}) {
    this.o = { ...SCALE_DEFAULTS, ...o };
    this.scale = this.o.max;
    this.ceiling = this.o.max;
  }

  /** Returns true when `scale` changed. Hitches (> 250 ms: tab switch, shader compile) are ignored. */
  update(dtMs: number): boolean {
    const o = this.o;
    if (!(dtMs > 0) || dtMs > 250) return false;
    this.ema = this.ema < 0 ? dtMs : this.ema * 0.92 + dtMs * 0.08;
    this.cooldown = Math.max(0, this.cooldown - dtMs);
    this.sinceUp += dtMs;
    // a ceiling learnt from a failed step up relaxes by one step every 20 s
    if (this.ceiling < o.max) { this.ceilingAge += dtMs; if (this.ceilingAge > 20000) { this.ceiling = Math.min(o.max, this.ceiling + o.step); this.ceilingAge = 0; } }
    if (this.cooldown > 0) return false;
    if (this.ema > o.slowMs && this.scale > o.min) {
      // a step down right after a step up: that level is too expensive, remember it for a while
      if (this.sinceUp < 2500) { this.ceiling = Math.max(o.min, this.scale - o.step); this.ceilingAge = 0; }
      const k = this.ema > o.slowMs * 1.5 ? 2 : 1;                      // far off budget: two steps at once
      return this.set(this.scale - k * o.step, 600);
    }
    if (this.ema < o.fastMs && this.scale < Math.min(o.max, this.ceiling)) {
      this.fastFor += dtMs;
      if (this.fastFor >= o.growAfterMs) { this.sinceUp = 0; return this.set(this.scale + o.step, 1000); }
    } else this.fastFor = 0;
    return false;
  }

  private set(v: number, cooldownMs: number): boolean {
    const o = this.o;
    const q = Math.round(Math.min(o.max, Math.max(o.min, v)) / o.step) * o.step;
    this.fastFor = 0;
    this.cooldown = cooldownMs;
    this.ema = -1;                                                       // re-measure at the new size
    if (Math.abs(q - this.scale) < 1e-6) return false;
    this.scale = Number(q.toFixed(3));
    return true;
  }
}
