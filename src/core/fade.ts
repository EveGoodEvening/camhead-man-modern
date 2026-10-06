// src/core/fade.ts — owner: S. FROZEN. The black #fade layer; resolves on sim time, instant in ?test (§2.8.7).
import type { SimClock } from '../contracts';

export interface FadeImpl {
  fade(toBlack: boolean, seconds?: number): Promise<void>;
  /** Loop hook: advance the tween on sim time. */
  update(): void;
  readonly opacity: number;
}

export function createFade(el: HTMLElement | null, clock: SimClock, instant: boolean): FadeImpl {
  let opacity = 0;
  let tween: { from: number; to: number; t0: number; dur: number; resolve: () => void } | null = null;
  const apply = () => {
    if (!el) return;
    el.style.opacity = String(opacity);
    el.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';
  };
  apply();
  return {
    get opacity() { return opacity; },
    fade(toBlack, seconds = 0.25) {
      const to = toBlack ? 1 : 0;
      if (tween) { tween.resolve(); tween = null; }
      if (instant || seconds <= 0) { opacity = to; apply(); return Promise.resolve(); }
      return new Promise<void>((resolve) => { tween = { from: opacity, to, t0: clock.t, dur: seconds, resolve }; });
    },
    update() {
      if (!tween) return;
      const k = Math.min(1, (clock.t - tween.t0) / tween.dur);
      opacity = tween.from + (tween.to - tween.from) * k;
      apply();
      if (k >= 1) { const r = tween.resolve; tween = null; r(); }
    },
  };
}
