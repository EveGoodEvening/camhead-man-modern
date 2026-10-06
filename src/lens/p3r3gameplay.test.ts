// src/lens/p3r3gameplay.test.ts — P3r3 gameplay: G2 the viewpoint hint names what is off (position / turn / tilt) and
// the score moves with every error, G6 the generic 纸妹 portrait yields to the sea photo, G7 the night-talk tag names
// who E talks to, G11 the smoke leaves once arrived / while the overlay is up.
import { describe, expect, it } from 'vitest';
import type { FlagId, PhotoTarget, TargetId } from '../types';
import { TARGETS } from '../data/photoTargets';
import { t } from '../data/zh';
import { evalShot, rephotoScore, viewpointMiss, type Projection, type ShotCtx, type ShotView, type TargetView } from './evalShot';
import { talkTagText } from './index';
import { SMOKE_ARRIVED, smokeWanted } from './extras';

const T = (id: TargetId): PhotoTarget => { const x = TARGETS.find((r) => r.id === id); if (!x) throw new Error(id); return x; };
function view(tg: PhotoTarget, o: Partial<TargetView> = {}): TargetView {
  return {
    anchor: { x: 0, y: 0, front: true }, dist: Math.min(3, tg.maxDist ?? 30), frac: 0.5, blocked: 0,
    vp: tg.viewpoint ? { ePos: 0, eYaw: 0, ePitch: 0, cone: 0, dYaw: 0, dPitch: 0 } : undefined,
    contain: tg.mustContain?.map((id) => ({ id, point: { x: 0.1, y: 0.1, front: true }, occluded: false })),
    ...o,
  };
}
const viewOf = (map: Partial<Record<TargetId, TargetView>>): ShotView => ({
  project: (tg): Projection | null => { const v = map[tg.id]; return v ? { anchor: v.anchor, dist: v.dist } : null; },
  measure: (tg) => map[tg.id] ?? null,
});
function ctx(o: Partial<ShotCtx> & { flags?: readonly FlagId[] } = {}): ShotCtx {
  const flags = new Set<string>(['ch1_started', ...(o.flags ?? [])]);
  return {
    zoom: 1, night: false, flash: false, torch: false, overlay: false, peek: null, scene: 'planet', phase: 'day',
    has: (f) => flags.has(f), refPhoto: null, moved: false, active: new Set(), text: t,
    fallback: () => ({ label: 'SKY', confidence: 99 }), ...o,
  };
}

describe('G2: rephoto viewpoint hints name the error', () => {
  const tg = T('T_rephoto_2006');
  const c = ctx({ overlay: true, refPhoto: 'ph_2006_group', flags: ['wx_tudi_added'] });
  const at = (vp: NonNullable<TargetView['vp']>) => evalShot(viewOf({ [tg.id]: view(tg, { vp }) }), [tg], c);
  it('pitch too high / too low at the right spot → tilt down / up (never 换个位置)', () => {
    const high = at({ ePos: 0.25, eYaw: 2, ePitch: 18, cone: null, dYaw: 2, dPitch: 18 });
    expect(high.failed).toBe('viewpoint');
    expect(high.hint).toBe(t('fail.viewpoint.down'));
    expect(high.hint).toContain('低');
    const low = at({ ePos: 0.25, eYaw: 2, ePitch: 14, cone: null, dYaw: 2, dPitch: -14 });
    expect(low.hint).toBe(t('fail.viewpoint.up'));
  });
  it('turned too far right / left → turn the other way', () => {
    expect(at({ ePos: 0.2, eYaw: 14, ePitch: 0, cone: null, dYaw: 14, dPitch: 0 }).hint).toBe(t('fail.viewpoint.left'));
    expect(at({ ePos: 0.2, eYaw: 14, ePitch: 0, cone: null, dYaw: -14, dPitch: 0 }).hint).toBe(t('fail.viewpoint.right'));
  });
  it('off the spot → the target’s own 换个位置 line, before any direction', () => {
    const r = at({ ePos: 2.5, eYaw: 14, ePitch: 18, cone: null, dYaw: 14, dPitch: 18 });
    expect(r.hint).toBe(t('fail.T_rephoto_2006.viewpoint'));
    expect(viewpointMiss(tg, view(tg, { vp: { ePos: 2.5, eYaw: 0, ePitch: 0, cone: null } }))).toBe('pos');
  });
  it('the score still moves when walking while the tilt is what is wrong (was a flat 82 %)', () => {
    const tol = { pos: 1.5, yaw: 10, pitch: 10 };
    const near = rephotoScore({ ePos: 0.25, eYaw: 2, ePitch: 18 }, tol, true);
    const far = rephotoScore({ ePos: 1.4, eYaw: 2, ePitch: 18 }, tol, true);
    expect(near).toBeGreaterThan(far);
    expect(rephotoScore({ ePos: 1.5, eYaw: 10, ePitch: 10 }, tol, true)).toBe(90);   // in tolerance ⇒ still ≥ 90
  });
});

describe('G6: the generic 纸妹 portrait yields to the sea photo during P9', () => {
  const zm = T('T_zhimei'), sea = T('T_zhimei_sea');
  const night = { night: true, phase: 'night' as const };
  it('with zhimei_eye and no frame_2 a head shot without the lighthouse is yellow 「还缺：灯塔」, not green', () => {
    const c = ctx({ ...night, flags: ['zhimei_eye'] });
    const v = viewOf({
      T_zhimei: view(zm),
      T_zhimei_sea: view(sea, { contain: [{ id: 'T_lighthouse', point: null, occluded: false }, { id: 'T_sea', point: { x: 0, y: -0.5, front: true }, occluded: false }] }),
    });
    const r = evalShot(v, TARGETS, c);
    expect(r.targetId).toBe('T_zhimei_sea');
    expect(r.frame).toBe('yellow');
    expect(r.hint).toBe(t('fail.contain', { name: t('lbl.T_lighthouse.name') }));
  });
  it('before the eye and after frame ② the generic portrait is back', () => {
    for (const flags of [[], ['zhimei_eye', 'frame_2']] as FlagId[][]) {
      const r = evalShot(viewOf({ T_zhimei: view(zm) }), TARGETS, ctx({ ...night, flags }));
      expect(r.targetId, flags.join()).toBe('T_zhimei');
      expect(r.frame).toBe('green');
    }
  });
});

describe('G7: the night-talk tag names who E talks to', () => {
  it('names the character (折 after P8), falls back to the plain tag for unknown ids', () => {
    expect(talkTagText('zhimei', false)).toBe('按 E 和纸妹交谈');
    expect(talkTagText('tudi', false)).toBe('按 E 和土地交谈');
    expect(talkTagText('chai', true)).toBe(t('vf.talkTag.who', { name: t('npc.chai_zhe') }));
    expect(talkTagText('nobody', false)).toBe(t('vf.talkTag'));
  });
});

describe('G11: smoke leaves once arrived and while the reference overlay is up', () => {
  it('smokeWanted', () => {
    expect(smokeWanted({ overlay: false, remaining: 20 })).toBe(true);
    expect(smokeWanted({ overlay: true, remaining: 20 })).toBe(false);
    expect(smokeWanted({ overlay: false, remaining: SMOKE_ARRIVED - 0.1 })).toBe(false);
  });
});
