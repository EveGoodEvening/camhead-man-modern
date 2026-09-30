// src/lens/evalShot.test.ts — owner D. The GDD §3.4 judge: condition order + first-failure reporting, confidence
// formulas, candidate priority, zoom-tier labels, chai_dual, granny blink, rephoto score.
import { describe, expect, it } from 'vitest';
import type { FlagId, PhotoTarget, TargetId } from '../types';
import { SHOT_ORDER } from '../types';
import { TARGETS } from '../data/photoTargets';
import { t } from '../data/zh';
import {
  checkTarget, evalShot, failConfidence, isAvailable, okConfidence, rephotoScore, tierKey, zoomHintKey,
  type Projection, type ShotCtx, type ShotView, type TargetView,
} from './evalShot';
import { blinkClosed } from './ctx';

const T = (id: TargetId): PhotoTarget => {
  const x = TARGETS.find((r) => r.id === id);
  if (!x) throw new Error(id);
  return x;
};
/** A passing view for `t` (tweak per test). */
function goodView(tg: PhotoTarget, o: Partial<TargetView> = {}): TargetView {
  return {
    anchor: { x: 0, y: 0, front: true }, dist: Math.min(3, tg.maxDist ?? 30), frac: 0.5, blocked: 0,
    whole: tg.whole ? [{ x: -0.5, y: -0.5, front: true }, { x: 0.5, y: 0.5, front: true }] : undefined,
    facingDeg: tg.facing ? 10 : undefined,
    vp: tg.viewpoint ? { ePos: 0, eYaw: 0, ePitch: 0, cone: 0 } : undefined,
    hidden: tg.mustBeHidden?.map(() => true),
    contain: tg.mustContain?.map((id) => ({ id, point: { x: 0.1, y: 0.1, front: true }, occluded: false })),
    ...o,
  };
}
function viewOf(map: Partial<Record<TargetId, TargetView>>): ShotView {
  return {
    project: (tg): Projection | null => { const v = map[tg.id]; return v ? { anchor: v.anchor, dist: v.dist } : null; },
    measure: (tg) => map[tg.id] ?? null,
  };
}
function ctx(o: Partial<ShotCtx> & { flags?: readonly FlagId[] } = {}): ShotCtx {
  // chapter 1 by default: the ch1 targets (T_locker17, T_granny_face, T_studio_qr) require ch1_started (P3 G2)
  const flags = new Set<string>(['ch1_started', ...(o.flags ?? [])]);
  return {
    zoom: 1, night: false, flash: false, torch: false, overlay: false, peek: null, scene: 'planet', phase: 'day',
    has: (f) => flags.has(f), refPhoto: null, moved: false, active: new Set(), text: t,
    fallback: () => ({ label: 'SKY', confidence: 99 }),
    ...o,
  };
}
const only = (tg: PhotoTarget, v: TargetView, c: ShotCtx) => evalShot(viewOf({ [tg.id]: v }), [tg], c);

describe('candidates', () => {
  it('white frame with the fallback label when nothing is framed', () => {
    const r = evalShot(viewOf({}), TARGETS, ctx());
    expect(r).toMatchObject({ frame: 'white', targetId: null, label: 'SKY', confidence: 99, failed: null, hint: null, tags: [] });
  });
  it('needs the anchor in front and inside NDC 0.92', () => {
    const tg = T('T_locker17');
    expect(only(tg, goodView(tg, { anchor: { x: 0.95, y: 0, front: true } }), ctx({ zoom: 3 })).frame).toBe('white');
    expect(only(tg, goodView(tg, { anchor: { x: 0, y: -0.93, front: true } }), ctx({ zoom: 3 })).frame).toBe('white');
    expect(only(tg, goodView(tg, { anchor: { x: 0, y: 0, front: false } }), ctx({ zoom: 3 })).frame).toBe('white');
    expect(only(tg, goodView(tg, { anchor: { x: 0.9, y: 0.9, front: true } }), ctx({ zoom: 3 })).frame).toBe('green');
  });
  it('filters by phase, requires, excludes, scene, onlyFrom; landmarks never compete', () => {
    const c = { phase: 'day' as const, has: (f: FlagId) => f === 'wx_tudi_added', scene: 'planet' as const, peek: null };
    expect(isAvailable(T('T_rephoto_2006'), c)).toBe(true);
    expect(isAvailable(T('T_rephoto_2006'), { ...c, has: () => false })).toBe(false);                 // requires
    expect(isAvailable(T('T_rephoto_2006'), { ...c, has: () => true })).toBe(false);                  // excludes P1_done
    expect(isAvailable(T('T_granny_face'), { ...c, phase: 'dusk' })).toBe(false);                     // day only
    expect(isAvailable(T('T_portrait_wall'), c)).toBe(false);                                         // studio_int
    expect(isAvailable(T('T_portrait_wall'), { ...c, scene: 'studio_int' })).toBe(true);
    expect(isAvailable(T('T_pigeons'), { ...c, has: (f) => f === 'on_roof_once' })).toBe(false);      // only from pk_coop
    expect(isAvailable(T('T_pigeons'), { ...c, has: (f) => f === 'on_roof_once', peek: 'pk_coop' })).toBe(true);
    expect(isAvailable(T('T_lighthouse'), c)).toBe(false);
  });
  it('priority: active puzzle > nearest the centre > id', () => {
    const a = T('T_door_201'), b = T('T_door_403');
    const flags: FlagId[] = ['P3_done'];
    const v = viewOf({ T_door_201: goodView(a, { anchor: { x: 0.05, y: 0, front: true } }), T_door_403: goodView(b, { anchor: { x: 0.3, y: 0, front: true } }) });
    expect(evalShot(v, [a, b], ctx({ zoom: 3, flags })).targetId).toBe('T_door_201');
    expect(evalShot(v, [a, b], ctx({ zoom: 3, flags, active: new Set<TargetId>(['T_door_403']) })).targetId).toBe('T_door_403');
    const tie = viewOf({ T_door_201: goodView(a, { anchor: { x: 0.2, y: 0, front: true } }), T_door_403: goodView(b, { anchor: { x: -0.2, y: 0, front: true } }) });
    expect(evalShot(tie, [b, a], ctx({ zoom: 3, flags })).targetId).toBe('T_door_201');
  });
});

describe('condition order and first failure', () => {
  it('SHOT_ORDER is the GDD order', () => {
    expect(SHOT_ORDER).toEqual(['layer', 'zoom', 'occluded', 'dist', 'size', 'center', 'whole', 'facing', 'dark', 'flash', 'viewpoint', 'overlay', 'hidden', 'contain', 'still']);
  });
  it('reports only the first failing condition', () => {
    const tg = T('T_zhimei_sea');     // layer, zoom [1], dist 10, frameArea .8, contain, still
    const v = goodView(tg, { dist: 20, anchor: { x: 0.85, y: 0, front: true } });
    const r = only(tg, v, ctx({ zoom: 3, flags: ['zhimei_eye'] }));
    expect(r.failed).toBe('layer');
    expect(r.hint).toBe('这里好像有东西……（夜景 N）');
    expect(only(tg, v, ctx({ zoom: 3, night: true, flags: ['zhimei_eye'] })).failed).toBe('zoom');
    expect(only(tg, v, ctx({ zoom: 1, night: true, flags: ['zhimei_eye'] })).failed).toBe('dist');
    expect(only(tg, goodView(tg, { anchor: { x: 0.85, y: 0, front: true } }), ctx({ night: true, flags: ['zhimei_eye'] })).failed).toBe('center');
  });
  it('every condition fails with its GDD §3.4 default hint', () => {
    const base = T('T_locker17');
    const mk = (extra: Partial<PhotoTarget>): PhotoTarget => ({ ...base, id: 'T_locker17', zoom: undefined, maxDist: 10, failKeys: undefined, ...extra });
    const cases: [PhotoTarget, Partial<TargetView>, Partial<ShotCtx>, string, string][] = [
      [mk({ layer: 'ghost' }), {}, {}, 'layer', '这里好像有东西……（夜景 N）'],
      [mk({ layer: 'ghost' }), {}, { nightVerb: true }, 'layer', '这里好像有东西……（夜景 N）'],
      // before P4 N does nothing: the hint must not point at it (P3-text T3)
      [mk({ layer: 'ghost' }), {}, { nightVerb: false }, 'layer', '这里好像有东西……肉眼看不见。'],
      [mk({ needsNight: true }), {}, { nightVerb: false }, 'layer', '这里好像有东西……肉眼看不见。'],
      [mk({ zoom: [1] }), {}, { zoom: 3 }, 'zoom', '退回 1×'],
      [mk({ zoom: [3, 10] }), {}, { zoom: 1 }, 'zoom', '试试 3×'],
      [mk({ zoom: [10] }), {}, { zoom: 1 }, 'zoom', '试试 10×'],
      [mk({}), { dist: 12 }, {}, 'dist', '太远了'],
      [mk({ minDist: 2 }), { dist: 1 }, {}, 'dist', '太近了'],
      [mk({ minFrac: 0.3 }), { frac: 0.2 }, {}, 'size', '再近一点，或者放大'],
      [mk({ frameArea: 0.6 }), { anchor: { x: 0.7, y: 0, front: true } }, {}, 'center', '放到画面中间'],
      [mk({ whole: [{ r: 1, lon: 1 }] }), { whole: [{ x: 0.95, y: 0, front: true }] }, {}, 'whole', '没拍全'],
      [mk({ facing: { maxAngle: 45 } }), { facingDeg: 60 }, {}, 'facing', '要正脸'],
      [mk({ needsLight: true }), {}, {}, 'dark', '太暗了，对不上焦'],
      [mk({}), { blocked: 3 }, {}, 'occluded', '被挡住了'],
      [mk({ flash: 'required' }), {}, {}, 'flash', '试试闪光（Q）'],
      [mk({ flash: 'forbidden' }), {}, { flash: true }, 'flash', '别开闪光'],
      [mk({ viewpoint: { spot: 'vp_group_photo', posTol: 1 } }), { vp: { ePos: 2, eYaw: 0, ePitch: 0, cone: null } }, {}, 'viewpoint', '换个位置'],
      [mk({ kind: 'rephoto', refPhoto: 'ph_2006_group' }), {}, {}, 'overlay', '先按 R 叠上对照'],
      [mk({ mustBeHidden: ['sp_net_dot'] }), { hidden: [false] }, {}, 'hidden', '那一点还露着'],
      [mk({ mustContain: ['T_sea'] }), { contain: [{ id: 'T_sea', point: { x: 0.99, y: 0, front: true }, occluded: false }] }, {}, 'contain', '还缺：海'],
      [mk({ still: true }), {}, { moved: true }, 'still', '糊了，别动。'],
    ];
    for (const [tg, v, c, cond, hint] of cases) {
      const r = only(tg, goodView(tg, v), ctx(c));
      expect([tg.id, r.failed, r.hint]).toEqual([tg.id, cond, hint]);
      expect(r.frame).toBe('yellow');
    }
  });
  it('blocked ≤ 2 of 5 rays still counts as visible', () => {
    const tg = T('T_locker17');
    expect(only(tg, goodView(tg, { blocked: 2 }), ctx({ zoom: 3 })).frame).toBe('green');
  });
  it('viewpoint checks position, yaw, pitch and the normal cone', () => {
    const tg = T('T_rephoto_2006');
    const c = ctx({ overlay: true, refPhoto: 'ph_2006_group', flags: ['wx_tudi_added'] });
    expect(only(tg, goodView(tg, { vp: { ePos: 1.4, eYaw: 9, ePitch: 9, cone: null } }), c).frame).toBe('green');
    expect(only(tg, goodView(tg, { vp: { ePos: 1.6, eYaw: 0, ePitch: 0, cone: null } }), c).failed).toBe('viewpoint');
    expect(only(tg, goodView(tg, { vp: { ePos: 0, eYaw: 11, ePitch: 0, cone: null } }), c).failed).toBe('viewpoint');
    const m = T('T_mirror_self');
    const mc = ctx({ flags: ['tudi_met'] });
    expect(only(m, goodView(m, { vp: { ePos: 3, eYaw: 0, ePitch: 0, cone: 29 } }), mc).frame).toBe('green');
    const bad = only(m, goodView(m, { vp: { ePos: 3, eYaw: 0, ePitch: 0, cone: 31 } }), mc);
    expect([bad.failed, bad.hint]).toEqual(['viewpoint', '镜子里没有你，换个角度']);
  });
  it('overlay needs R on and the matching reference', () => {
    const tg = T('T_rephoto_2011');
    const c = { zoom: 3 as const, flags: ['idol_scanned' as FlagId] };
    expect(only(tg, goodView(tg), ctx({ ...c, overlay: true, refPhoto: 'ph_2006_group' })).failed).toBe('overlay');
    expect(only(tg, goodView(tg), ctx({ ...c, overlay: false, refPhoto: 'ph_temple_2011' })).failed).toBe('overlay');
    expect(only(tg, goodView(tg), ctx({ ...c, overlay: true, refPhoto: 'ph_temple_2011' })).frame).toBe('green');
    expect(only(tg, goodView(tg), ctx({ ...c, zoom: 1, overlay: true, refPhoto: 'ph_temple_2011' })).hint).toBe('试试 3×');
  });
  it('per-target fail overrides (GDD §9)', () => {
    const p = T('T_pigeons');
    expect(only(p, goodView(p), ctx({ peek: 'pk_coop', flags: ['on_roof_once'] })).hint).toBe('它们不怕你——试试闪光（Q）');
    const d = T('T_door_403');
    expect(only(d, goodView(d), ctx({ flags: ['P3_done'] })).hint).toBe('太小了，试试 3×');
    const lt = T('T_light_trail');
    expect(only(lt, goodView(lt), ctx({ phase: 'night' })).hint).toBe('写字要慢，看字要久——开夜景（N），别动。');
    const pit = T('T_frame4_pit');
    expect(only(pit, goodView(pit), ctx({ scene: 'subway_int', peek: 'pk_psd', flags: ['gantry_open'] })).hint).toBe('太暗了，对不上焦——试试闪光（Q）。');
    expect(only(pit, goodView(pit), ctx({ scene: 'subway_int', peek: 'pk_psd', flags: ['gantry_open'], flash: true })).frame).toBe('green');
  });
});

describe('confidence and labels', () => {
  it('green: okConfidence, else 90 + floor(9q)', () => {
    const tg = T('T_locker17');
    expect(okConfidence(tg, { x: 0.5, y: 0, front: true })).toBe(96);
    const free: PhotoTarget = { ...tg, okConfidence: undefined };
    expect(okConfidence(free, { x: 0, y: 0, front: true })).toBe(99);
    expect(okConfidence(free, { x: 0.46, y: 0.2, front: true })).toBe(94);   // q = 0.5 → 90 + 4
    expect(okConfidence(free, { x: 0.92, y: 0, front: true })).toBe(90);
  });
  it('failing: 30 + floor(50·satisfied/applicable)', () => {
    expect(failConfidence(0, 5)).toBe(30);
    expect(failConfidence(4, 5)).toBe(70);
    expect(failConfidence(7, 9)).toBe(68);
    const tg = T('T_locker17');   // applicable: zoom dist size center occluded = 5; zoom fails → 4/5
    const r = only(tg, goodView(tg), ctx({ zoom: 1 }));
    expect(checkTarget(tg, goodView(tg), ctx({ zoom: 1 })).length).toBe(5);
    expect(r.confidence).toBe(70);
    expect(r.label).toBe('快递柜 · 邻里柜');
  });
  it('day_viewfinder checkpoint text: 识别：17 号格 · 滞留 1096 天 96%', () => {
    const tg = T('T_locker17');
    const r = only(tg, goodView(tg, { anchor: { x: 0.01, y: -0.02, front: true } }), ctx({ zoom: 3 }));
    expect(r.frame).toBe('green');
    expect(t('vf.recog', { label: r.label, conf: r.confidence ?? 0 })).toBe('识别：17 号格 · 滞留 1096 天 96%');
    expect(r.tags).toEqual(['locker_17']);
  });
  it('zoom tiers: highest label ≤ current zoom, falling back to the lower tier', () => {
    const cat = T('T_meiqiu');
    expect(tierKey(cat, 1)).toBe('lbl.T_meiqiu.1');
    expect(tierKey(cat, 3)).toBe('lbl.T_meiqiu.3');
    expect(tierKey(cat, 10)).toBe('lbl.T_meiqiu.10');
    const fish = T('T_bst_fish_watching');
    expect(tierKey(fish, 10)).toBe('lbl.T_bst_fish_watching.3');
    expect(only(cat, goodView(cat), ctx({ zoom: 3 })).label).toBe('黑猫 · 左耳缺角');
    expect(only(cat, goodView(cat), ctx({ zoom: 3 })).confidence).toBe(88);
    expect(only(T('T_plaque'), goodView(T('T_plaque')), ctx({ zoom: 10, flags: ['ch2_started'] })).label).toBe('建于一九八▢年 · 啃痕：拆');
  });
  it('showConfidence false → fixed text, no percentage (S_mirror)', () => {
    const m = T('T_mirror_self');
    const r = only(m, goodView(m), ctx({ flags: ['tudi_met'] }));
    expect([r.frame, r.label, r.confidence]).toEqual(['green', '手机 97% · 人 3%', null]);
    expect(r.tags).toEqual(['mirror_selfie']);
  });
  it('zoomHintKey picks the nearest allowed zoom', () => {
    expect(zoomHintKey([1], 10)).toBe('fail.zoom.1');
    expect(zoomHintKey([3, 10], 1)).toBe('fail.zoom.3');
    expect(zoomHintKey([1, 3], 10)).toBe('fail.zoom.3');
    expect(zoomHintKey([10], 3)).toBe('fail.zoom.10');
  });
});

describe('special hooks', () => {
  const chai = T('T_chai');
  const c = ctx({ phase: 'night', flags: ['ch3_started'] });
  it('chai_dual: only `hidden` failing → yellow, but the photo is 「拆 · 红圈喷漆 97%」 tagged chai_photo', () => {
    const r = only(chai, goodView(chai, { hidden: [false] }), c);
    expect(r).toMatchObject({ frame: 'yellow', failed: 'hidden', hint: '那一点还露着', label: '拆 · 红圈喷漆', confidence: 97, tags: ['chai_photo'] });
  });
  it('chai_dual does not apply when another condition fails too', () => {
    const r = only(chai, goodView(chai, { hidden: [false], whole: [{ x: 0.95, y: 0, front: true }] }), c);
    expect(r.failed).toBe('whole');
    expect(r.tags).toEqual([]);
  });
  it('chai green = 折 · 红圈喷漆 97% (night_chai checkpoint)', () => {
    const r = only(chai, goodView(chai), c);
    expect([r.frame, r.label, r.confidence, r.tags]).toEqual(['green', '折 · 红圈喷漆', 97, ['zhe_photo']]);
  });
  it('granny_blink writes the eye state into tags and label', () => {
    const g = T('T_granny_face');
    const mk = (closed: boolean) => only(g, goodView(g), ctx({
      eyesClosed: () => closed, vars: () => ({ eyes: t(closed ? 'lbl.eyes.closed' : 'lbl.eyes.open') }),
    }));
    expect(mk(false)).toMatchObject({ frame: 'green', label: '人脸 · 王秀英 · 睁眼', tags: ['granny_face_open'] });
    expect(mk(true)).toMatchObject({ frame: 'green', label: '人脸 · 王秀英 · 闭眼', tags: ['granny_face_closed'] });
  });
  it('the granny burst (3 × 0.3 s) always holds an open and a closed frame; single shots ≈ 40 % closed', () => {
    let closedSingles = 0;
    const N = 800;
    for (let i = 0; i < N; i++) {
      const start = (i / N) * 0.8 + 3.1;           // any phase of the 0.8 s cycle, t0 = 3.1
      const shots = [0, 0.3, 0.6].map((dt) => blinkClosed(start + dt, 3.1));
      expect(shots.includes(true) && shots.includes(false)).toBe(true);
      if (blinkClosed(start, 3.1)) closedSingles++;
    }
    expect(closedSingles / N).toBeCloseTo(0.4, 2);
  });
});

describe('rephoto score (GDD §3.8)', () => {
  const tol = { pos: 1.5, yaw: 10, pitch: 10 };
  it('in tolerance → ≥ 90; perfect → 100', () => {
    expect(rephotoScore({ ePos: 0, eYaw: 0, ePitch: 0 }, tol, true)).toBe(100);
    expect(rephotoScore({ ePos: 1.5, eYaw: 10, ePitch: 10 }, tol, true)).toBe(90);
    expect(rephotoScore({ ePos: 0.75, eYaw: 2, ePitch: 1 }, tol, true)).toBe(95);
  });
  it('worst ratio wins, clamps at 0', () => {
    expect(rephotoScore({ ePos: 0, eYaw: 20, ePitch: 0 }, tol, true)).toBe(80);
    expect(rephotoScore({ ePos: 30, eYaw: 0, ePitch: 0 }, tol, true)).toBe(0);
  });
  it('wrong zoom caps at 60', () => {
    expect(rephotoScore({ ePos: 0, eYaw: 0, ePitch: 0 }, tol, false)).toBe(60);
    expect(rephotoScore({ ePos: 1.2, eYaw: 0, ePitch: 0 }, tol, false)).toBe(60);
    expect(rephotoScore({ ePos: 6, eYaw: 0, ePitch: 0 }, tol, false)).toBe(60);
  });
  it('the rephoto result carries overlayScore; green ⇔ in tolerance with overlay on', () => {
    const tg = T('T_rephoto_2006');
    const c = ctx({ overlay: true, refPhoto: 'ph_2006_group', flags: ['wx_tudi_added'] });
    const good = only(tg, goodView(tg, { vp: { ePos: 0.3, eYaw: 3, ePitch: 2, cone: null } }), c);
    expect(good.frame).toBe('green');
    expect(good.overlayScore).toBe(97);   // max(0.3/1.5, 3/10, 2/10) = 0.3
    expect(good.label).toBe('显影 · 二〇〇六 · 对位成功');
    expect(good.confidence).toBe(100);
    const off = only(tg, goodView(tg, { vp: { ePos: 3, eYaw: 3, ePitch: 2, cone: null } }), c);
    expect(off.frame).toBe('yellow');
    expect(off.overlayScore).toBe(79);   // P3r3 G2: 2 + 0.3·(0.3 + 0.2) — the other two errors still count while failing
    expect(off.hint).toBe('换个位置——照片是从低处往天桥上拍的');
  });
});

describe('several candidates', () => {
  it('the first green among the top three wins; otherwise the top one reports', () => {
    const trail = T('T_light_trail'), sea = T('T_zhimei_sea');
    const c = ctx({ phase: 'night', night: true, flags: ['zhimei_eye'], active: new Set<TargetId>(['T_light_trail', 'T_zhimei_sea']) });
    const views = {
      T_light_trail: goodView(trail, { anchor: { x: 0, y: 0.1, front: true }, dist: 25, vp: { ePos: 20, eYaw: 0, ePitch: 0, cone: null } }),
      T_zhimei_sea: goodView(sea, { anchor: { x: 0, y: -0.4, front: true } }),
    };
    expect(evalShot(viewOf(views), [trail, sea], c)).toMatchObject({ targetId: 'T_zhimei_sea', frame: 'green' });
    const bad = { ...views, T_zhimei_sea: goodView(sea, { anchor: { x: 0, y: -0.4, front: true }, dist: 12 }) };
    expect(evalShot(viewOf(bad), [trail, sea], c)).toMatchObject({ targetId: 'T_light_trail', frame: 'yellow', failed: 'viewpoint' });
  });
});

describe('priority tiers', () => {
  it('an idle green target never masks a failing active one', () => {
    const sea = T('T_zhimei_sea'), plain = T('T_zhimei');
    const c = ctx({ phase: 'night', night: true, flags: ['zhimei_eye'], active: new Set<TargetId>(['T_zhimei_sea']) });
    const v = viewOf({
      T_zhimei_sea: goodView(sea, { contain: [{ id: 'T_lighthouse', point: null, occluded: true }, { id: 'T_sea', point: { x: 0, y: 0, front: true }, occluded: false }] }),
      T_zhimei: goodView(plain),
    });
    const r = evalShot(v, [sea, plain], c);
    expect([r.targetId, r.frame, r.failed, r.hint]).toEqual(['T_zhimei_sea', 'yellow', 'contain', '还缺：灯塔']);
  });
});

describe('same anchor, both green', () => {
  it('the more demanding target wins (T_zhimei_sea over T_zhimei on 纸妹\'s head)', () => {
    const sea = T('T_zhimei_sea'), plain = T('T_zhimei');
    const c = ctx({ phase: 'night', night: true, flags: ['zhimei_eye'], active: new Set<TargetId>(['T_zhimei', 'T_zhimei_sea']) });
    const r = evalShot(viewOf({ T_zhimei_sea: goodView(sea), T_zhimei: goodView(plain) }), [plain, sea], c);
    expect([r.targetId, r.label, r.confidence, r.tags]).toEqual(['T_zhimei_sea', '纸人 · 双眼 · 看海', 96, ['zhimei_sea']]);
  });
});
