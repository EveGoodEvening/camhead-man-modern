// FaceState derivation, the restore animation and the P3 blink formula (GDD §5.7, §9 P3).
import { describe, expect, it } from 'vitest';
import type { FlagId } from '../types';
import { blinkClosed, deriveFaceState, faceLook, lookKey } from './faces';
import { hopStep, type HopState } from './zhimei';

const has = (fl: readonly FlagId[]) => (f: FlagId) => fl.includes(f);

describe('deriveFaceState', () => {
  it('mosaic by day and dusk, blank at night, clear after P8 and at dawn', () => {
    expect(deriveFaceState('day', has([]))).toBe('mosaic');
    expect(deriveFaceState('dusk', has([]))).toBe('mosaic');
    expect(deriveFaceState('night', has([]))).toBe('blank');
    expect(deriveFaceState('night', has(['P8_done']))).toBe('clear');
    expect(deriveFaceState('dawn', has([]))).toBe('clear');
  });
  it('restore animation runs blank → mosaic → clear over 1.5 s', () => {
    const seq = [0, 0.3, 0.6, 0.9, 1.1, 1.3, 1.6].map((t) => lookKey(faceLook('clear', t)));
    expect(seq).toEqual(['blank', 'blank', 'm6', 'm6', 'm12', 'clear', 'clear']);
    expect(lookKey(faceLook('mosaic', null))).toBe('m6');
    expect(lookKey(faceLook('blank', null))).toBe('blank');
  });
});

describe('granny blink (GDD §9 P3)', () => {
  it('closed 0.32 s, open 0.48 s per 0.8 s cycle', () => {
    let closed = 0;
    const N = 8000;
    for (let i = 0; i < N; i++) if (blinkClosed(5 + (i / N) * 0.8, 5)) closed++;
    expect(closed / N).toBeCloseTo(0.4, 2);
  });
  it('a 3-shot burst 0.3 s apart always mixes open and closed eyes', () => {
    for (let k = 0; k < 2000; k++) {
      const t0 = 3.1 + k * 0.00137;
      const shots = [0, 0.3, 0.6].map((d) => blinkClosed(t0 + d, 3.1));
      expect(shots.some((c) => c)).toBe(true);
      expect(shots.some((c) => !c)).toBe(true);
    }
  });
});

describe('zhimei hop (GDD §5.9 M_zhimei_move)', () => {
  const run = (frames: { t: number; inView: boolean; phase?: 'day' | 'dusk' | 'night'; dist?: number; eye?: boolean }[]) => {
    const s: HopState = { seen: false, outSince: null };
    return frames.map((f) => hopStep(s, { t: f.t, phase: f.phase ?? 'night', eye: f.eye ?? false, atShop: true, inView: f.inView, dist: f.dist ?? 10 }));
  };
  it('hops only after being seen and then out of view for more than 2 s', () => {
    expect(run([{ t: 0, inView: false }, { t: 3, inView: false }])).toEqual([false, false]);
    expect(run([{ t: 0, inView: true }, { t: 1, inView: false }, { t: 2.9, inView: false }, { t: 3.1, inView: false }])).toEqual([false, false, false, true]);
  });
  it('never hops by day, after 点睛, or when the player is far away', () => {
    expect(run([{ t: 0, inView: true, phase: 'day' }, { t: 1, inView: false, phase: 'day' }, { t: 4, inView: false, phase: 'day' }]).some(Boolean)).toBe(false);
    expect(run([{ t: 0, inView: true, eye: true }, { t: 1, inView: false, eye: true }, { t: 4, inView: false, eye: true }]).some(Boolean)).toBe(false);
    expect(run([{ t: 0, inView: true }, { t: 1, inView: false, dist: 60 }, { t: 4, inView: false, dist: 60 }]).some(Boolean)).toBe(false);
  });
});
