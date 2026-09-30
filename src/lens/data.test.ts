// src/lens/data.test.ts — owner D. Data validation for GDD §8 / §14 (every key resolves in zh/lens.ts, every anchor
// and spot id exists, every GDD target row is present), scenery labels, and album eviction through the store.
import { describe, expect, it } from 'vitest';
import type { Photo, ShotCond, StrKey } from '../types';
import { TARGETS } from '../data/photoTargets';
import { SCENERY_LABELS, LANDMARK_LABELS } from '../data/labels';
import { BESTIARY } from '../data/bestiary';
import { LABEL_IDS, TARGET_IDS } from '../data/ids/lens';
import { SPOT_IDS, WORLD_ANCHOR_IDS } from '../data/ids/spots';
import { STR as LENS } from '../data/zh/lens';
import { has, t } from '../data/zh';
import { createTestCore } from '../core/testkit';
import { NOMINAL } from './anchors';
import { hashConfidence, sceneryKey, sceneryRecog, splitConfidence } from './labels';
import { STORY_TAGS } from './capture';
import { PLANS, planFor } from './devTargets';

const anchorIds = new Set<string>(WORLD_ANCHOR_IDS);
const spotIds = new Set<string>(SPOT_IDS);

describe('photoTargets (GDD §8.1)', () => {
  it('has exactly one row per TargetId', () => {
    const ids = TARGETS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TARGET_IDS].sort());
  });
  it('every string key it references resolves (labels, ok, fail overrides, dual, contain names)', () => {
    const missing: string[] = [];
    const need = (k: StrKey | undefined) => { if (k && !has(k)) missing.push(k); };
    for (const x of TARGETS) {
      x.labels.forEach((l) => need(l.key));
      need(x.okKey);
      for (const k of Object.values(x.failKeys ?? {})) need(k);
      if (x.special === 'chai_dual') need(`lbl.${x.id}.dual`);
      for (const c of x.mustContain ?? []) need(`lbl.${c}.name`);
    }
    for (const c of ['layer', 'size', 'center', 'whole', 'facing', 'dark', 'occluded', 'viewpoint', 'overlay', 'hidden', 'still'] as ShotCond[]) need(`fail.${c}`);
    for (const k of ['fail.zoom.1', 'fail.zoom.3', 'fail.zoom.10', 'fail.dist.far', 'fail.dist.near', 'fail.flash.required', 'fail.flash.forbidden', 'fail.contain']) need(k);
    expect(missing).toEqual([]);
  });
  it('every anchor / whole / viewpoint / hidden / contain / onlyFrom reference exists', () => {
    const bad: string[] = [];
    for (const x of TARGETS) {
      const a = x.anchor;
      if ('world' in a && !anchorIds.has(a.world)) bad.push(`${x.id} anchor ${a.world}`);
      if (x.whole && 'world' in x.whole && !anchorIds.has(x.whole.world)) bad.push(`${x.id} whole`);
      if (x.viewpoint && !spotIds.has(x.viewpoint.spot)) bad.push(`${x.id} viewpoint`);
      for (const s of x.mustBeHidden ?? []) if (!spotIds.has(s)) bad.push(`${x.id} hidden ${s}`);
      for (const c of x.mustContain ?? []) if (!TARGET_IDS.includes(c)) bad.push(`${x.id} contain ${c}`);
      if (x.refPhoto && x.kind !== 'rephoto') bad.push(`${x.id} refPhoto without rephoto`);
      if (x.kind === 'rephoto' && (!x.refPhoto || !x.viewpoint)) bad.push(`${x.id} rephoto needs refPhoto + viewpoint`);
    }
    expect(bad).toEqual([]);
  });
  it('world anchors used by the lens have a GDD nominal fallback', () => {
    const used = new Set<string>();
    for (const x of TARGETS) {
      if ('world' in x.anchor) used.add(x.anchor.world);
      if (x.whole && 'world' in x.whole) used.add(x.whole.world);
    }
    for (const id of ['coop_door', 'tripod_head', 'lh_lamp', 'pit', 'dk_line', 'net_dot', 'mirror']) used.add(id);
    expect([...used].filter((id) => !(id in NOMINAL))).toEqual([]);
    // whole-plane anchors need corners
    expect(NOMINAL.trail_plane?.w).toBe(8);
    expect(NOMINAL.chai?.w).toBe(3.6);
  });
  it('matches the GDD table values that the golden path depends on', () => {
    const g = (id: string) => TARGETS.find((x) => x.id === id)!;
    expect(g('T_rephoto_2006')).toMatchObject({ zoom: [1], viewpoint: { spot: 'vp_group_photo', posTol: 1.5, yawTol: 10, pitchTol: 10 } });
    expect(g('T_rephoto_2011')).toMatchObject({ zoom: [3], viewpoint: { spot: 'vp_temple_2011', posTol: 1.0, yawTol: 8, pitchTol: 8 } });
    expect(g('T_granny_face')).toMatchObject({ maxDist: 4, frameArea: 0.6, facing: { maxAngle: 45 }, zoom: [1, 3], special: 'granny_blink' });
    expect(g('T_mirror_self')).toMatchObject({ maxDist: 6, minFrac: 0.12, flash: 'forbidden', viewpoint: { coneDeg: 30 } });
    expect(g('T_chai')).toMatchObject({ maxDist: 25, mustBeHidden: ['sp_net_dot'], special: 'chai_dual', okConfidence: 97 });
    expect(g('T_zhimei_sea')).toMatchObject({ frameArea: 0.8, mustContain: ['T_lighthouse', 'T_sea'], maxDist: 10, still: true });
    expect(g('T_light_trail')).toMatchObject({ viewpoint: { spot: 'sp_bench', posTol: 1.2 }, still: true, needsNight: true });
    for (const k of ['T_studio_qr', 'T_bus_qr', 'T_bike_qr', 'T_temple_qr']) expect(g(k)).toMatchObject({ kind: 'qr', maxDist: 2.5, frameArea: 0.2 });
    expect(TARGETS.filter((x) => x.id.startsWith('T_door_')).length).toBe(12);
    expect(g('T_door_403').okConfidence).toBe(96);
    expect(t(g('T_door_403').okKey!)).toBe('403 · 福字倒贴');
  });
  it('every non-landmark target has a dev walk plan', () => {
    for (const x of TARGETS) if (x.kind !== 'landmark') expect(planFor(x)).toBeTruthy();
    expect(Object.keys(PLANS).every((k) => (TARGET_IDS as readonly string[]).includes(k))).toBe(true);
  });
});

describe('labels (GDD §8.2 / §8.3)', () => {
  it('one scenery label per LabelId, keys resolve', () => {
    expect(SCENERY_LABELS.map((l) => l.id).sort()).toEqual([...LABEL_IDS].sort());
    for (const l of SCENERY_LABELS) for (const k of l.keys) if (k) expect(has(k)).toBe(true);
    for (const k of Object.values(LANDMARK_LABELS)) expect(has(k)).toBe(true);
    expect(Object.keys(LANDMARK_LABELS).length).toBe(10);
  });
  it('fixed confidences are parsed out of the text, others hash to 90–99 deterministically', () => {
    expect(splitConfidence('骑楼 · 老的 94%')).toEqual({ label: '骑楼 · 老的', conf: 94 });
    expect(splitConfidence('路灯 · 会鞠躬？ 12%')).toEqual({ label: '路灯 · 会鞠躬？', conf: 12 });
    expect(splitConfidence('马路 · 石板')).toEqual({ label: '马路 · 石板', conf: null });
    const sky = SCENERY_LABELS.find((l) => l.id === 'sky_day')!;
    expect(sceneryRecog(sky, 1)).toEqual({ label: '天空 · 青色', confidence: 99 });
    const moon = SCENERY_LABELS.find((l) => l.id === 'sky_night')!;
    expect(sceneryRecog(moon, 10)).toEqual({ label: '月亮 · 不是灯', confidence: 97 });
    for (const z of [1, 3, 10] as const) {
      const c = hashConfidence('road', z);
      expect(c).toBeGreaterThanOrEqual(90); expect(c).toBeLessThanOrEqual(99);
      expect(hashConfidence('road', z)).toBe(c);
    }
    const cone = SCENERY_LABELS.find((l) => l.id === 'cone')!;
    expect(sceneryKey(cone, 10)).toBe('lbl.cone.3');           // no 10× tier → the 3× one
    expect(sceneryRecog(cone, 1)).toEqual({ label: '路锥 · 橙色', confidence: 99 });
  });
  it('zh/lens uses only its own prefixes', () => {
    const bad = Object.keys(LENS).filter((k) => !['vf.', 'lbl.', 'fail.', 'bst.', 'tp.'].some((p) => k.startsWith(p)));
    expect(bad).toEqual([]);
  });
});

describe('bestiary (GDD §14)', () => {
  it('six entries with resolvable texts and targets', () => {
    expect(BESTIARY.length).toBe(6);
    for (const b of BESTIARY) {
      expect(TARGET_IDS.includes(b.target)).toBe(true);
      for (const k of [b.nameKey, b.whereKey, b.bodyKey]) expect(has(k)).toBe(true);
    }
    expect(t('bst.bst_fish_watching.body')).toBe('别的鱼都在游，只有这一条在看。它比你先认出你。');
  });
});

describe('album (GDD §3.13)', () => {
  const photo = (seq: number, tags: string[] = []): Photo => ({
    id: `p${seq}`, dataURL: '', tags, label: '', clock: '10:00', zoom: 1, night: false, flash: false,
    keep: tags.some((x) => STORY_TAGS.has(x)), seq,
  });
  it('story tags make a photo keep (never evicted)', () => {
    expect(STORY_TAGS.has('rephoto_2006')).toBe(true);
    expect(STORY_TAGS.has('granny_face_open')).toBe(true);
    expect(STORY_TAGS.has('chai_photo')).toBe(true);
    expect(STORY_TAGS.has('bst_second_shadow')).toBe(true);
    expect(STORY_TAGS.has('npc:xiaolin')).toBe(false);
    expect(STORY_TAGS.has('lm:lighthouse')).toBe(false);
  });
  it('the 41st ordinary photo evicts the oldest non-keep one; keep photos survive', () => {
    const { core, bus } = createTestCore();
    const removed: string[] = [];
    bus.on('photoRemoved', (e) => removed.push(e.id));
    core.store.addPhoto(photo(1, ['zhe_photo']));
    for (let i = 2; i <= 41; i++) core.store.addPhoto(photo(i, ['npc:xiaolin']));
    expect(removed).toEqual([]);
    const r = core.store.addPhoto(photo(42));
    expect(r.evicted?.id).toBe('p2');
    expect(removed).toEqual(['p2']);
    expect(core.store.photo('p1')).not.toBeNull();
    expect(core.store.state.photos.filter((p) => !p.keep).length).toBe(40);
  });
});
