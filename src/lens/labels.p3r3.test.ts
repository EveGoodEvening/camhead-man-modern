// src/lens/labels.p3r3.test.ts — P3r3 look L5: the recognition bar must not describe what the lens cannot see.
// An occluded target reports 「被挡住了」 before its face / distance hints, the sky label follows the phase, and the
// hill lawn / bushes / pot plants no longer read as a banyan.
import { describe, expect, it } from 'vitest';
import type { FlagId, Phase, PhotoTarget, TargetId } from '../types';
import { TARGETS } from '../data/photoTargets';
import { SCENERY_LABELS } from '../data/labels';
import { t } from '../data/zh';
import { evalShot, type ShotCtx, type ShotView, type TargetView } from './evalShot';
import { SKY_LABEL, labelDef, sceneryRecog } from './labels';

const T = (id: TargetId): PhotoTarget => TARGETS.find((r) => r.id === id)!;
const ctx = (flags: readonly FlagId[] = ['ch1_started']): ShotCtx => ({
  zoom: 1, night: false, flash: false, torch: false, overlay: false, peek: null, scene: 'planet', phase: 'day',
  has: (f) => flags.includes(f), refPhoto: null, moved: false, active: new Set(), text: t,
  fallback: () => ({ label: 'SKY', confidence: 99 }),
});
const one = (tg: PhotoTarget, v: TargetView): ShotView => ({
  project: (x) => (x.id === tg.id ? { anchor: v.anchor, dist: v.dist } : null),
  measure: (x) => (x.id === tg.id ? v : null),
});

describe('P3r3 L5 recognition', () => {
  it('王阿婆 hidden behind a stall, seen from behind: 被挡住了, not 要正脸', () => {
    const g = T('T_granny_face');
    const v: TargetView = { anchor: { x: 0, y: 0, front: true }, dist: 3.3, frac: 0.3, blocked: 5, facingDeg: 150 };
    const r = evalShot(one(g, v), [g], ctx());
    expect(r.frame).toBe('yellow');
    expect(r.failed).toBe('occluded');
    expect(r.hint).toBe(t('fail.occluded'));
    // visible but turned away: the face hint again
    const r2 = evalShot(one(g, { ...v, blocked: 0 }), [g], ctx());
    expect(r2.failed).toBe('facing');
  });
  it('an occluded far target says 被挡住了 before 太远了', () => {
    const g = T('T_granny_face');
    const r = evalShot(one(g, { anchor: { x: 0, y: 0, front: true }, dist: 9, frac: 0.1, blocked: 4, facingDeg: 0 }), [g], ctx());
    expect(r.failed).toBe('occluded');
  });
  it('the sky label follows the phase', () => {
    const want: Record<Phase, string> = { day: '天空 · 青色', dusk: '天空 · 橘红', night: '天空 · 夜', dawn: '天空 · 发白' };
    for (const ph of Object.keys(want) as Phase[]) {
      const d = labelDef(SKY_LABEL[ph]);
      expect(d, ph).toBeTruthy();
      expect(sceneryRecog(d!, 1).label).toBe(want[ph]);
      expect(sceneryRecog(d!, 1).confidence).toBe(99);
    }
  });
  it('lawn and bushes have their own labels', () => {
    for (const id of ['grass', 'plant'] as const) {
      const d = SCENERY_LABELS.find((l) => l.id === id)!;
      expect(sceneryRecog(d, 3).label).not.toContain('榕树');
    }
  });
});
