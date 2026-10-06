// src/story/wayfinding.test.ts — P3 wayfinding: the objective chip names every smoke step, and the chip, the smoke
// target and the route agree (StoryApi.smokeStep).
import { describe, expect, it } from 'vitest';
import { OBJECTIVES, SMOKE_ELIGIBLE, SMOKE_STEP_TEXT } from '../data/story';
import { has, t } from '../data/zh';
import type { SmokeRule, SpotId } from '../types';
import { createHarness } from './testHarness';
import { NEAREST_HYSTERESIS } from './smoke';
import { edgePoint, wayOpacity, WAY_NEAR } from '../ui/hud/wayfinder';

const where = (r: SmokeRule): string => ('spot' in r ? r.spot : 'npc' in r ? `npc:${r.npc}` : 'nearest');

describe('objective steps (chip / smoke agreement)', () => {
  it('every step text exists, stays short enough for the chip, and every nearest candidate has one', () => {
    const keys = [
      ...OBJECTIVES.flatMap((o) => [o.textKey, ...o.smoke.flatMap((r) => (r.text ? [r.text] : []))]),
      ...Object.values(SMOKE_STEP_TEXT).flatMap((l) => (l ?? []).map((e) => e.text)),
      'obj.step.roof_up', 'obj.step.roof_down',
    ];
    for (const k of keys) {
      expect(has(k), k).toBe(true);
      expect([...t(k)].length, k).toBeLessThanOrEqual(24);
    }
    for (const s of Object.keys(SMOKE_ELIGIBLE)) expect(SMOKE_STEP_TEXT[s as SpotId]?.length, s).toBeGreaterThan(0);
  });

  it('within an objective, rules that lead to different places never share a chip text', () => {
    for (const o of OBJECTIVES) {
      const seen = new Map<string, string>();
      for (const r of o.smoke) {
        if ('nearest' in r) continue;                         // per-spot texts (SMOKE_STEP_TEXT)
        const text = r.text ?? o.textKey, to = where(r);
        const prev = seen.get(text);
        expect(prev === undefined || prev === to, `${o.id}: ${text} → ${prev} and ${to}`).toBe(true);
        seen.set(text, to);
      }
    }
  });

  it('garbled SMS → 「找个信号好的高处」 toward the deck; full SMS → back to the locker', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.setObjective('obj_locker');
    h.goto('sp_locker');
    h.core.store.set('locker_seen');
    let s = h.story.smokeStep?.();
    expect(s?.textKey).toBe('obj.step.sms_signal');
    expect(t(s?.textKey ?? '')).toContain('信号');
    expect(s?.spot).toBe('sp_bridge_deck');
    expect(s?.route[s.route.length - 1].h).toBeCloseTo(5.5, 1);
    h.core.store.set('sms_full');
    s = h.story.smokeStep?.();
    expect(s?.spot).toBe('sp_locker');
    expect(s?.textKey).toBe('obj.step.sms_full');
  });

  it('obj_temple: inside the studio → leave; before granny → ask a resident at the store', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.setObjective('obj_temple');
    h.goto('st_entry');
    expect(h.story.smokeStep?.()).toMatchObject({ textKey: 'obj.step.studio_leave', spot: 'st_exit', scene: 'studio_int' });
    h.goto('sp_studio_door');
    expect(h.story.smokeStep?.()).toMatchObject({ textKey: 'obj.step.ask_resident', spot: 'sp_store_front', scene: 'planet' });
    h.core.store.setObjective('obj_studio_enter');
    h.goto('st_entry');
    expect(h.story.smokeStep?.()?.textKey).toBe('obj.step.studio_look');
  });

  it('the roof is teleport-only: from the ground a roof step leads to the fire ladder', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    for (const f of ['tudi_met', 'mirror_selfie', 'P5_started', 'door403_found', 'key_rooftop', 'on_roof_once'] as const) h.core.store.set(f);
    h.core.store.setObjective('obj_coop');
    h.goto('sp_estate_yard');
    const s = h.story.smokeStep?.();
    expect(s?.textKey).toBe('obj.step.roof_up');
    const end = s?.route[s.route.length - 1];
    expect(end && end.h).toBeLessThan(1);
    h.goto('sp_roof');
    expect(h.story.smokeStep?.()?.textKey).toBe('obj.step.coop_cat');
  });

  it('obj_frames: the chip names the chosen errand, and the choice does not flicker between close candidates', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.goto('sp_pier_base');
    expect(h.story.smokeStep?.()).toMatchObject({ spot: 'sp_bench', textKey: 'obj.step.f_bench' });
    h.core.store.set('trail_1987');
    expect(h.story.smokeStep?.()?.textKey).toBe('obj.step.f_lh_door');
    h.core.store.set('lighthouse_open');
    expect(h.story.smokeStep?.()?.textKey).toBe('obj.step.f_switch');
    h.goto('vp_subway_top');
    const first = h.story.smokeStep?.()?.spot;
    expect(['vp_subway_top', 'sp_subway_entry']).toContain(first);
    h.goto('sp_subway_entry');                     // 2 m away: the choice sticks (hysteresis)
    expect(h.story.smokeStep?.()?.spot).toBe(first);
    expect(NEAREST_HYSTERESIS).toBeGreaterThan(2);
  });
});

describe('HUD incense arrow placement', () => {
  const I = { l: 60, r: 60, t: 120, b: 90 };
  it('ahead = top centre, behind = bottom centre, sides on the side edges', () => {
    expect(edgePoint(0, 1280, 720, I)).toEqual({ x: 640, y: 120 });
    const back = edgePoint(Math.PI, 1280, 720, I);
    expect(back.x).toBeCloseTo(640, 6); expect(back.y).toBeCloseTo(630, 6);
    const right = edgePoint(Math.PI / 2, 1280, 720, I);
    expect(right.x).toBeCloseTo(1220, 6); expect(right.y).toBeCloseTo(360, 6);
    const left = edgePoint(-Math.PI / 2, 1280, 720, I);
    expect(left.x).toBeCloseTo(60, 6);
  });
  it('dims on screen (P3r3 U2: stays as a cue while the way ahead is right), hides near the target', () => {
    const ahead = wayOpacity({ onScreen: true, remaining: 30, allowed: true });
    expect(ahead).toBeGreaterThan(0.2);
    expect(ahead).toBeLessThan(wayOpacity({ onScreen: false, remaining: 30, allowed: true }));
    expect(wayOpacity({ onScreen: true, remaining: WAY_NEAR - 0.1, allowed: true })).toBe(0);
    expect(wayOpacity({ onScreen: false, remaining: 30, allowed: true })).toBeGreaterThan(0.5);
    expect(wayOpacity({ onScreen: false, remaining: WAY_NEAR - 0.1, allowed: true })).toBe(0);
    expect(wayOpacity({ onScreen: false, remaining: 30, allowed: false })).toBe(0);
  });
});
