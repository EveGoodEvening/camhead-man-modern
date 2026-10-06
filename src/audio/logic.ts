// src/audio/logic.ts — owner A. Pure audio decisions (vitest-able, no WebAudio): footstep cadence, ambience gains,
// the sfx_type rate limit and the countdown pitch rule (GDD §17).

/** GDD §17 footsteps: 1.8 Hz walking, ×1.4 running; returns how many steps fall in this tick. */
export class StepCadence {
  private phase = 0.5;
  static readonly WALK_HZ = 1.8;
  static readonly RUN_SPEED = 4.2;          // m/s above which the player counts as running (walk 3.2, run 5.5)
  tick(dt: number, speed: number): number {
    if (speed < 0.4) { this.phase = 0.5; return 0; }
    const hz = StepCadence.WALK_HZ * (speed > StepCadence.RUN_SPEED ? 1.4 : 1);
    const before = Math.floor(this.phase);
    this.phase += dt * hz;
    return Math.floor(this.phase) - before;
  }
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Waves louder toward the sea: silent on the hill, full from chart r ≥ 43 (GDD §17 / ARCH §3.A). */
export function waveGain(r: number, scene: string): number {
  if (scene !== 'planet') return 0;
  return 0.02 + 0.16 * smooth(14, 43, r);
}

/** City hum per phase/scene (quiet at night, a room tone indoors). */
export function humGain(phase: string, scene: string): number {
  if (scene === 'studio_int') return 0.012;
  if (scene === 'subway_int') return 0.03;
  return phase === 'night' ? 0.012 : phase === 'dusk' ? 0.024 : phase === 'dawn' ? 0.014 : 0.03;
}

/** Wind up high (bridge deck, roof) and out on the pier / lighthouse rocks. */
export function windGain(r: number, h: number, scene: string): number {
  if (scene !== 'planet') return 0;
  return 0.06 * Math.max(smooth(4, 16, h), smooth(55, 66, r));
}

/** sfx_drone follows uUncanny (0 at 0, audible at the 0.15 night baseline, full at 1). */
export function droneGain(uncanny: number): number { return uncanny <= 0.01 ? 0 : 0.035 + 0.11 * uncanny; }

/** Allows at most `perSecond` events per second of the given clock. */
export class RateLimit {
  private last = -Infinity;
  private readonly gap: number;
  constructor(perSecond: number) { this.gap = 1 / perSecond; }
  allow(now: number): boolean {
    if (now - this.last < this.gap - 1e-9) return false;
    this.last = now;
    return true;
  }
}

/**
 * GDD §17 sfx_countdown: 1 kHz blips, the last 3 seconds of the 10 s tripod timer at 1.5 kHz. Decided by time since
 * the first blip of a run (a gap > 1.6 s starts a new run), so it does not depend on how many blips the emitter sends:
 * blips at ≥ total − 3.5 s are high (7, 8, 9 s for 10 s). A blip < 0.3 s after the previous one is a duplicate
 * (e.g. an emitter that blips on start AND on the first whole second) and is dropped.
 */
export type Blip = 'low' | 'high' | 'skip';
export class CountdownPitch {
  private start = -Infinity;
  private last = -Infinity;
  private readonly total: number;
  constructor(total = 10) { this.total = total; }
  next(now: number): Blip {
    const gap = now - this.last;
    if (gap < 0.3) return 'skip';
    if (gap > 1.6) this.start = now;
    this.last = now;
    return now - this.start >= this.total - 3.5 ? 'high' : 'low';
  }
}
