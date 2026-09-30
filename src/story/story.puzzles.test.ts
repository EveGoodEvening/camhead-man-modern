// Per-puzzle state transitions (GDD §9, §10.2), both endings (§15), quiet solve()/bootChapter, save recovery, beat
// dedupe/skip and smoke targets — through the real core + story with the harness's fake E/D.
import { describe, expect, it } from 'vitest';
import { createHarness, gateVerdict, type Harness } from './testHarness';
import { nightClock } from './smoke';
import type { Photo } from '../types';

const flagsOf = (h: Harness) => h.flags();

describe('boot and start', () => {
  it('bootChapter marks every satisfied rule as fired: no cards, no beats, wx history filled', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    await h.settle();
    expect(h.rec.cards).toEqual([]);
    expect(h.rec.beats).toEqual([]);
    expect(h.core.store.state.phase).toBe('night');
    expect(h.core.store.state.objective).toBe('obj_frames');
    expect(h.core.store.state.wxLog.map((w) => w.id)).toEqual(expect.arrayContaining(['wx_intro', 'wx_rules', 'wx_ch1', 'wx_dusk', 'wx_mirror']));
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['seen:fx.P5_done', 'seen:fx.ch3_started', 'seen:fx.meiqiu_talked']));
    expect(h.core.player.scene).toBe('planet');
    expect(h.core.store.state.photos.map((p) => p.preset)).toEqual(expect.arrayContaining(['ph_2006_group', 'ph_temple_2011']));
  });
  it('every chapter boots quietly to its objective', async () => {
    for (const c of ['prologue', 'ch1', 'ch2', 'ch3', 'finale'] as const) {
      const h = await createHarness({ chapter: c });
      await h.settle();
      expect(h.rec.cards, c).toEqual([]);
      expect(h.core.store.state.chapter).toBe(c);
      expect(h.core.store.state.objective).not.toBeNull();
    }
  });
  it('「开机」 plays S_wake: epigraph, 序章 card, me.wake, the friend request, then wx_intro', async () => {
    const h = await createHarness({ start: 'intro' });
    expect(h.story.currentBeat()).toBe('S_wake');
    for (let i = 0; i < 60 && h.story.currentBeat(); i++) { h.step(30); await new Promise((r) => setTimeout(r, 0)); }
    expect(h.story.currentBeat()).toBeNull();
    expect(h.rec.cards).toEqual(['chapter:epigraph', 'chapter:prologue']);
    expect(h.rec.nodes).toContain('me.wake');
    expect(h.rec.toasts).toEqual(expect.arrayContaining(['sys.friend_request', 'sys.friend_added']));
    expect(flagsOf(h)).toContain('wx_tudi_added');
    expect(h.rec.wx).toEqual(['wx_intro']);
    expect(h.core.store.state.palette).toBe('morning');
  });
  /** lon of S_wake's end pose: 1 m east of sp_bus_bench (38.5, 0) — P3r2 wakeEndPose. */
  const WAKE_END_LON = 1 / (38.5 * (Math.PI / 180));
  it('S_wake lies on the sp_bus_bench bench and ends standing there facing the bridge (I-play, C2/F7)', async () => {
    const h = await createHarness({ start: 'intro' });
    let seenWake = false;
    for (let i = 0; i < 60 && h.story.currentBeat(); i++) {
      h.step(30); await new Promise((r) => setTimeout(r, 0));
      if (h.rec.heroPlays.includes('wake') && !seenWake && h.story.currentBeat()) {
        seenWake = true;
        const c = h.core.player.chart();                 // on the spot, facing yaw 90 (the bench is across it)
        expect(c && 'r' in c ? Math.hypot(c.r - 38.5, c.lon) : 99).toBeLessThan(0.1);
        expect(Math.abs(h.core.player.yawDeg() - 90)).toBeLessThan(1);
      }
    }
    expect(seenWake).toBe(true);
    const c = h.core.player.chart();
    // P3r2 (camera): he ends one step (1 m) east of the spot, off the bench, with the follow camera 8° from above
    expect(c && 'r' in c ? Math.hypot(c.r - 38.5, (c.lon - WAKE_END_LON) * 38.5 * (Math.PI / 180)) : 99).toBeLessThan(0.1);
    expect(Math.abs(h.core.player.yawDeg() - 90)).toBeLessThan(1);
    expect(h.core.cameraRig.pitchDeg).toBeCloseTo(-8);
    expect(h.core.player.pose).toBe('stand');
    expect(h.rec.heroPlays.at(-1)).toBe('stand');
  });
  it('S_wake skipped at the first card still ends standing on sp_bus_bench', async () => {
    const h = await createHarness({ start: 'intro' });
    h.story.skip();
    for (let i = 0; i < 10; i++) { h.step(5); await new Promise((r) => setTimeout(r, 0)); }
    expect(h.story.currentBeat()).toBeNull();
    const c = h.core.player.chart();
    expect(c && 'r' in c ? Math.hypot(c.r - 38.5, (c.lon - WAKE_END_LON) * 38.5 * (Math.PI / 180)) : 99).toBeLessThan(0.1);
    expect(Math.abs(h.core.player.yawDeg() - 90)).toBeLessThan(1);
    expect(h.rec.heroPlays.at(-1)).toBe('stand');
    expect(h.rec.heroPlays).not.toContain('wake');           // skipped before the fade-in: never lies down
  });
  it('starting again after the credits resets the run but keeps `cleared`', async () => {
    const h = await createHarness({ chapter: 'finale' });
    h.core.store.markCleared();
    await h.story.startGame({ skipIntro: true });
    expect(h.core.store.state.cleared).toBe(true);
    expect(flagsOf(h)).not.toContain('P1_done');
    expect(flagsOf(h)).toContain('wx_tudi_added');
  });
});

describe('puzzles', () => {
  it('P1: only the rephoto opens chapter 1; the clock shows 06:40 until the chapter card', async () => {
    const h = await createHarness({ chapter: 'prologue' });
    h.shoot('T_rephoto_2006');
    expect(h.core.store.state.clock).toBe('06:40');
    await h.settle();
    expect(h.core.store.state.chapter).toBe('ch1');
    expect(h.core.store.state.clock).toBe('10:00');
    expect(h.rec.wx).toEqual(['wx_rules', 'wx_ch1']);
  });
  it('P2: prologue locker is only text; ch1 route B (direct code) works; wrong codes do nothing', async () => {
    const h = await createHarness({ chapter: 'prologue' });
    await h.interact('it_locker');
    expect(h.rec.nodes).toEqual(['it.locker']);
    expect(flagsOf(h)).not.toContain('locker_seen');
    const h1 = await createHarness({ chapter: 'ch1' });
    h1.input('locker', ['18', '0815']);
    h1.input('locker', ['17', '0000']);
    await h1.settle();
    expect(flagsOf(h1)).not.toContain('P2_done');
    h1.input('locker', ['17', '0815']);
    await h1.settle();
    expect(flagsOf(h1)).toContain('P2_done');
    expect(h1.core.store.state.objective).toBe('obj_studio_enter');
  });
  it('P2: E on the locker = the garbled SMS first, the keypad second; the shutter sets studio_locked_seen', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    await h.interact('it_studio_shutter');
    await h.settle();
    expect(flagsOf(h)).toContain('studio_locked_seen');
    expect(h.core.store.state.objective).toBe('obj_locker');
    await h.interact('it_locker');
    await h.settle();
    expect(h.rec.toasts).toContain('sys.sms_garbled');
    expect(h.rec.ui).toEqual([]);
    await h.interact('it_locker');
    await h.settle();
    expect(h.rec.ui).toEqual(['keypad_locker']);
  });
  it('P3: the gate verdict table', () => {
    const ph = (tags: string[]) => ({ tags } as unknown as Photo);
    expect(gateVerdict([ph(['portrait_wall'])])).toBe('noface');
    expect(gateVerdict([ph(['npc:xiaolin'])])).toBe('other');
    expect(gateVerdict([ph(['npc:granny_wang'])])).toBe('noface');
    expect(gateVerdict([ph(['granny_face_open']), ph(['npc:xiaolin'])])).toBe('one');
    expect(gateVerdict([ph(['granny_face_open']), ph(['granny_face_open'])])).toBe('both_open');
    expect(gateVerdict([ph(['granny_face_closed']), ph(['granny_face_closed'])])).toBe('both_closed');
    expect(gateVerdict([ph(['granny_face_open']), ph(['granny_face_closed'])])).toBe('pass');
  });
  it('P3: one face = gate_face_ok only; walking in before P3 does nothing; after P3 the zone starts ch2', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.set('film_at_tudi');
    const [a] = h.shoot('T_granny_face');
    await h.show('gate', [a.id]);
    expect(flagsOf(h)).toContain('gate_face_ok');
    expect(flagsOf(h)).not.toContain('P3_done');
    h.goto('sp_estate_gate_inner'); h.step(5);
    await h.settle();
    expect(flagsOf(h)).not.toContain('ch2_started');
    const burst = h.shoot('T_granny_face', { burst: true });
    await h.show('gate', [burst[0].id, burst[1].id]);
    await h.settle();
    expect(flagsOf(h)).toContain('P3_done');
    h.goto('sp_estate_yard'); h.step(3);
    h.goto('sp_estate_gate_inner'); h.step(5);
    await h.settle();
    expect(h.core.store.state.phase).toBe('dusk');
  });
  it('P4: wx_idol once from the idol; the QR scan sends wx_after_scan once even when onShot sends it too', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    await h.interact('it_temple_idol');
    await h.interact('it_temple_idol');
    h.shoot('T_temple_qr');
    await h.settle();
    expect(h.rec.wx).toEqual(['wx_idol', 'wx_after_scan']);
    expect(h.rec.wxRaw.filter((w) => w === 'wx_after_scan')).toHaveLength(2);
    h.shoot('T_rephoto_2011');
    await h.settle();
    expect(h.core.store.state.verbs).toContain('night');
    expect(h.core.store.state.clock).toBe('18:10');
  });
  it('P5: milkbox and ladder are locked until their conditions; wrong box does nothing', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    await h.interact('it_milkbox');
    expect(h.rec.ui).toEqual([]);
    expect(h.rec.nodes.at(-1)).toBe('it.milkbox_locked');
    await h.interact('it_fire_ladder');
    expect(h.rec.nodes.at(-1)).toBe('it.fire_ladder');
    h.core.store.set('mirror_selfie');
    await h.settle();
    await h.talk('granny_wang');
    expect(flagsOf(h)).toContain('P5_started');
    await h.interact('it_milkbox');
    expect(h.rec.ui).toEqual(['milkbox']);
    h.input('milkbox', '402');
    await h.settle();
    expect(flagsOf(h)).not.toContain('key_rooftop');
    h.input('milkbox', '403');
    await h.settle();
    expect(h.core.store.state.items).toContain('key_rooftop');
    await h.interact('it_coop');
    expect(h.lens.peek).toBeNull();                       // no detach before 煤球
  });
  it('P6: wrong code, the switch only inside the door view', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.input('lighthouse', '1986');
    await h.settle();
    expect(flagsOf(h)).not.toContain('lighthouse_open');
    h.input('lighthouse', '1987');
    await h.settle();
    await h.interact('it_lh_switch');
    expect(flagsOf(h)).not.toContain('frame_3');
    await h.interact('it_lh_door');
    expect(h.lens.peek).toBe('lh_door');
    await h.interact('it_lh_switch');
    await h.settle();
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['frame_3', 'P6_done']));
    expect(h.core.store.state.items).toContain('frame_3');
  });
  it('P7: the gantry before and after the name', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.goto('sw_gantry'); h.step(2);
    await h.interact('it_gantry');
    expect(h.rec.nodes.at(-1)).toBe('it.gantry');
    expect(flagsOf(h)).not.toContain('gantry_open');
    h.input('namepicker', ['周', '远']);
    await h.settle();
    const yaw = h.core.player.yawDeg();
    await h.interact('it_gantry');
    expect(flagsOf(h)).toContain('gantry_open');
    expect(Math.abs((((h.core.player.yawDeg() - yaw) % 360) + 360) % 360 - 180)).toBeLessThan(1);   // turned around
  });
  it('P8: the 拆 photo does not solve; the first night visit wakes 拆 once', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.goto('sp_chai'); h.step(3);
    await h.settle();
    expect(h.rec.nodes.filter((n) => n === 'chai.night_first')).toHaveLength(1);
    h.goto('sp_bus_bench'); h.step(3); h.goto('sp_chai'); h.step(3);
    await h.settle();
    expect(h.rec.nodes.filter((n) => n === 'chai.night_first')).toHaveLength(1);
    await h.show('xiaoliu', []);
    expect(h.rec.shows.at(-1)).toBe('show.liu.any');
  });
  it('P9: show reactions before and after the eye', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.core.store.set('P8_done');
    await h.settle();
    const [p] = h.shoot('T_zhimei_sea');
    await h.show('zhimei', [p.id]);
    expect(h.rec.shows.at(-1)).toBe('show.zhimei.any');   // her one eye can't see it yet
    h.core.store.set('zhimei_eye');
    await h.settle();
    await h.show('zhimei', ['ph_2006_group']);
    expect(h.rec.shows.at(-1)).toBe('show.zhimei.2006');
    const [x] = h.shoot('T_plaque');
    await h.show('zhimei', [x.id]);
    expect(h.rec.shows.at(-1)).toBe('show.zhimei.any_eye');
    await h.show('zhimei', [p.id]);
    await h.settle();
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['frame_2', 'P9_done']));
  });
  it('granny names 周远 from the height marks before name_known (extra clue)', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.set('P2_done');
    await h.settle();
    const [hm] = h.shoot('T_height_marks');
    await h.settle();
    expect(h.core.store.state.clues).toContain('clue_height_marks');
    await h.show('granny_wang', [hm.id]);
    await h.settle();
    expect(h.core.store.state.clues).toContain('clue_granny_name');
  });
});

describe('solve(), beats and recovery', () => {
  it('solve() is quiet and chains the night: ch3 hub → darkroom ready at 00:40', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    for (const p of ['P6_lighthouse_1987', 'P7_line_zero', 'P8_chai_to_zhe', 'P9_paper_eye'] as const) h.story.solve(p);
    await h.settle();
    expect(h.rec.cards).toEqual([]);
    expect(h.rec.beats).toEqual([]);
    expect(h.rec.nodes).toEqual([]);
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['P6_done', 'P7_done', 'P8_done', 'P9_done', 'all_frames', 'faces_restored', 'seen:beat.S_zhe']));
    expect(h.core.store.state.items).toEqual(expect.arrayContaining(['frame_1', 'frame_2', 'frame_3', 'frame_4']));
    expect(h.core.store.state.objective).toBe('obj_darkroom');
    expect(h.core.store.state.clock).toBe('00:40');
    // the darkroom checkpoint (GDD §19.4): dk_hung + the viewfinder at the line → reveal → S_darkroom
    h.core.store.set('dk_hung');
    h.goto('dk_line');
    h.core.services.lens.setViewfinder(true);
    h.step(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.story.currentBeat()).toBe('S_darkroom');
    await h.settle();
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['developed', 'finale_started']));
  });
  it('solve(P5) from ch2 lands at the fire ladder at night without cards', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    h.story.solve('P5_rooftop_coop');
    expect(h.core.store.state.phase).toBe('night');
    expect(h.core.store.state.chapter).toBe('ch3');
    expect(h.core.player.chart()).toMatchObject({ r: expect.closeTo(16.4, 0) });
    await h.settle();
    expect(h.rec.cards).toEqual([]);
  });
  it('a beat plays once even if requested twice; skip() applies its end', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.core.store.set('P8_done');                        // → S_zhe
    void h.story.playBeat('S_zhe');
    expect(h.story.currentBeat()).toBe('S_zhe');
    expect(h.story.skip()).toBe(true);
    await h.settle();
    expect(h.rec.beats).toEqual(['S_zhe']);
    expect(flagsOf(h)).toContain('faces_restored');
    expect(h.rec.wx).toContain('wx_zhe');
  });
  it('S_sunset runs its 8 s pan then chapter 3 (not skipped)', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    h.core.store.set('P5_done');
    expect(h.story.currentBeat()).toBe('S_sunset');
    for (let i = 0; i < 20 && h.story.currentBeat(); i++) { h.step(60); await new Promise((r) => setTimeout(r, 0)); }
    expect(h.story.currentBeat()).toBeNull();
    await h.settle();
    expect(h.rec.cards).toEqual(['liaozhai:juan2', 'chapter:ch3']);
    expect(h.core.store.state.phase).toBe('night');
    expect(h.rec.palettes[0]).toBe('night');
  });
  it('continue after a save cut mid-beat re-applies the beat end', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    const s = JSON.parse(JSON.stringify(h.core.store.state));
    s.flags.P5_done = true; s.flags['seen:fx.P5_done'] = true; s.flags['seen:beat.S_sunset'] = true;
    s.player = { scene: 'planet', pos: [0, 80, 0], heading: [0, 0, -1] };
    h.storage.setItem('cmm.save.v1', JSON.stringify(s));
    await h.story.continueGame();
    await h.settle();
    expect(flagsOf(h)).toContain('ch3_started');
    expect(h.core.store.state.phase).toBe('night');
  });
});

describe('endings', () => {
  const toBus = async () => {
    const h = await createHarness({ chapter: 'finale' });
    await h.interact('it_tripod');
    h.core.services.lens.startTripodTimer();
    h.goto('sp_stairs_x'); h.tripodSuccess();
    await h.settle();
    expect(flagsOf(h)).toContain('bus_arrived');
    return h;
  };
  it('A: 上车 → S_ending_A → credits_done → title', async () => {
    const h = await toBus();
    await h.interact('it_bus_door');
    expect(h.rec.nodes.slice(-2)).toEqual(['it.bus_door', 'att.bus']);
    h.choose(0);
    await h.settle();
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['ending_A', 'credits_done']));
    expect(flagsOf(h)).not.toContain('ending_B');
    expect(h.core.store.state.cleared).toBe(true);
    expect(h.rec.titleShown).toBe(1);
  });
  it('B: 不上车 → the full outro plays in order (photo, epilogue B, 终卷 · 守望, credits)', async () => {
    const h = await toBus();
    const talk = h.talk('attendant');
    h.choose(1);
    await talk;
    expect(h.story.currentBeat()).toBe('S_ending_B');
    for (let i = 0; i < 60 && h.story.currentBeat(); i++) { h.step(60); await new Promise((r) => setTimeout(r, 0)); }
    await h.settle();
    expect(h.rec.cards).toEqual(['photo:ph_2026_group', 'epilogue:B', 'liaozhai:zhong_B', 'credits:credits']);
    expect(h.rec.palettes).toEqual(expect.arrayContaining(['day', 'title']));
    expect(flagsOf(h)).toEqual(expect.arrayContaining(['ending_B', 'credits_done']));
    expect(h.rec.wx).not.toContain('wx_endA');
  });
});

describe('smoke and clock', () => {
  it('night clock: +40 min, wraps midnight, caps at 03:40', () => {
    expect(nightClock('22:00')).toBe('22:40');
    expect(nightClock('23:40')).toBe('00:20');
    expect(nightClock('03:20')).toBe('03:40');
    expect(nightClock('03:40')).toBe('03:40');
  });
  it('obj_frames points at the nearest open errand; interiors point at their exit', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.goto('sp_pier_base');
    expect(h.story.smokeTarget()).toBe('sp_bench');
    h.core.store.set('trail_1987');
    expect(h.story.smokeTarget()).toBe('sp_lighthouse_door');
    h.goto('vp_subway_top');
    expect(h.story.smokeTarget()).toBe('vp_subway_top');
    h.core.store.set('P8_done');
    await h.settle();
    h.goto('sp_subway_entry');
    expect(h.story.smokeTarget()).toBe('sp_subway_entry');
    h.goto('sw_entry');
    expect(h.story.smokeTarget()).toBe('sw_gantry');
    h.goto('st_entry');
    expect(h.story.smokeTarget()).toBe('st_exit');      // P3r3 G10: in reach of it_st_exit
  });
  it('obj_gate follows granny until a face photo exists', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.setObjective('obj_gate');
    expect(h.story.smokeTarget()).toBe('sp_store_front');
    h.shoot('T_granny_face');
    expect(h.story.smokeTarget()).toBe('sp_estate_gate');
  });
});
