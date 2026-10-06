// src/core/clock.ts — owner: S. FROZEN. Simulation clock + sim-time timers (every gameplay timer reads clock, §2.2).
import type { SimClock } from '../contracts';

export class MutableClock implements SimClock {
  t = 0;
  animT = 0;
  frame = 0;
  frozen = false;
  /** Advance one tick. animT stops while frozen (GDD §19.2 freeze). */
  advance(dt: number): void {
    this.t += dt;
    if (!this.frozen) this.animT += dt;
    this.frame++;
  }
}

interface Pending { at: number; resolve: () => void }

/** Promise timers resolved on sim time `t` (not animT). Poll once per tick. */
export class SimTimers {
  private list: Pending[] = [];
  private readonly clock: SimClock;
  constructor(clock: SimClock) { this.clock = clock; }
  after(seconds: number): Promise<void> {
    if (!(seconds > 0)) return Promise.resolve();
    return new Promise((resolve) => { this.list.push({ at: this.clock.t + seconds - 1e-9, resolve }); });
  }
  /** Resolves on the next poll (≈ one tick). */
  nextTick(): Promise<void> {
    return new Promise((resolve) => { this.list.push({ at: -Infinity, resolve }); });
  }
  poll(): void {
    if (this.list.length === 0) return;
    const now = this.clock.t;
    const due = this.list.filter((p) => p.at <= now);
    if (due.length === 0) return;
    this.list = this.list.filter((p) => p.at > now);
    for (const p of due) p.resolve();
  }
  get count(): number { return this.list.length; }
}
