// ARCHITECTURE §3.F self-test: the GDD §19.3 golden path at the logic level (real core store/rules/physics/player,
// real story module, fake E/D). Every row asserts its flags, in order, then the next row starts.
import { describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './testHarness';

const has = (h: Harness, ...flags: string[]) => { for (const f of flags) expect(h.flags(), `flag ${f}`).toContain(f); };

describe('story golden path (GDD §19.3)', () => {
  it('runs from the bus bench to the credits (ending A)', async () => {
    const h = await createHarness({ start: 'skip' });
    const { core, rec } = h;
    await h.settle();
    has(h, 'game_started', 'wx_tudi_added');
    expect(core.store.state.objective).toBe('obj_p1');
    expect(core.store.state.photos.some((p) => p.preset === 'ph_2006_group')).toBe(true);
    expect(rec.cards).toEqual([]);                       // ?skipTitle: no epigraph / chapter card
    expect(core.store.state.wxLog.map((w) => w.id)).toEqual(['wx_intro']);

    // P1
    h.goto('vp_group_photo'); core.store.setRefPhoto('ph_2006_group'); h.shoot('T_rephoto_2006');
    await h.settle();
    has(h, 'P1_done', 'ch1_started');
    expect(rec.cards).toEqual(['liaozhai:xu', 'chapter:ch1']);
    expect(core.store.state.chapter).toBe('ch1');
    expect(core.store.state.palette).toBe('day');
    expect(core.store.state.clock).toBe('10:00');
    expect(core.store.state.clues).toEqual(expect.arrayContaining(['clue_photo_back', 'clue_rules']));
    expect(core.store.state.objective).toBe('obj_studio');

    // P2: the locker zone (6 m) → garbled SMS; full bars on the deck → full SMS; 17 + 0815
    h.goto('sp_locker'); h.step(10);
    await h.settle();
    has(h, 'locker_seen');
    expect(rec.toasts).toContain('sys.sms_garbled');
    expect(h.story.smokeTarget()).toBe('sp_bridge_deck');
    h.goto('sp_bridge_deck'); h.step(10);
    core.bus.emit('signalChanged', { bars: 4 });         // B's signal system (the fake world has none)
    await h.settle();
    has(h, 'sms_full');
    expect(h.story.smokeTarget()).toBe('sp_locker');
    h.goto('sp_locker'); h.input('locker', ['17', '0815']);
    await h.settle();
    has(h, 'P2_done');
    expect(core.store.state.items).toEqual(expect.arrayContaining(['key_ring', 'note_dad']));
    expect(rec.nodes).toEqual(expect.arrayContaining(['note.dad', 'me.p2']));
    expect(core.store.state.clock).toBe('11:10');
    expect(core.store.state.objective).toBe('obj_studio_enter');

    // S_studio
    h.goto('st_cabinet'); await h.interact('it_st_cabinet');
    await h.settle();
    has(h, 'film_at_tudi');
    expect(core.store.state.objective).toBe('obj_temple');
    expect(rec.wx).toContain('wx_studio_bag');

    // P3: granny (first talk, then the photo request), burst, show two, walk through the gate
    h.goto('sp_store_front'); await h.talk('granny_wang'); await h.talk('granny_wang');
    has(h, 'granny_asked_photo');
    const burst = h.shoot('T_granny_face', { burst: true });
    h.goto('sp_estate_gate');
    const open = burst.find((p) => p.tags.includes('granny_face_open'))!;
    const closed = burst.find((p) => p.tags.includes('granny_face_closed'))!;
    await h.show('gate', [open.id, closed.id]);
    await h.settle();
    has(h, 'P3_done');
    expect(rec.shows.at(-1)).toBe('gate.pass');
    expect(core.store.state.clock).toBe('12:30');
    h.goto('sp_estate_gate_inner'); h.step(5);
    await h.settle();
    has(h, 'ch2_started', 'roadwork_cleared', 'tide_out');
    expect(core.store.state.phase).toBe('dusk');
    expect(rec.cards.slice(-2)).toEqual(['liaozhai:juan1', 'chapter:ch2']);
    expect(core.store.state.objective).toBe('obj_p4');

    // P4: scan, rephoto at 3×
    h.goto('sp_donation_box'); h.shoot('T_temple_qr'); h.step(40);
    await h.settle();
    has(h, 'idol_scanned');
    expect(core.store.state.photos.some((p) => p.preset === 'ph_temple_2011')).toBe(true);
    h.goto('vp_temple_2011'); core.store.setRefPhoto('ph_temple_2011'); h.shoot('T_rephoto_2011');
    await h.settle();
    has(h, 'P4_done');
    expect(core.store.state.verbs).toContain('night');

    // 土地 (night view, E on him)
    h.night(true); await h.talk('tudi');
    await h.settle();
    has(h, 'tudi_met');
    expect(core.store.state.objective).toBe('obj_mirror');

    // S_mirror
    h.goto('sp_mirror_stand'); h.shoot('T_mirror_self');
    await h.settle();
    has(h, 'mirror_selfie');
    expect(rec.beats).toContain('S_mirror');
    expect(core.store.state.objective).toBe('obj_coop');

    // P5
    h.goto('sp_estate_yard'); await h.talk('granny_wang');
    has(h, 'P5_started');
    h.goto('sp_milkbox'); h.input('milkbox', '403');
    await h.settle();
    has(h, 'key_rooftop');
    h.goto('sp_fire_ladder'); await h.interact('it_fire_ladder');
    await h.settle();
    has(h, 'on_roof_once');
    h.night(true); await h.talk('meiqiu');
    await h.settle();
    has(h, 'meiqiu_talked');
    expect(core.store.state.verbs).toContain('detach');
    await h.interact('it_coop');
    expect(h.lens.peek).toBe('pk_coop');
    h.shoot('T_pigeons');
    await h.settle();
    has(h, 'pigeons_gone');
    h.goto('sp_roof'); await h.interact('it_frame1');
    await h.settle();
    has(h, 'frame_1', 'P5_done', 'ch3_started');
    expect(rec.beats).toContain('S_sunset');
    expect(core.store.state.phase).toBe('night');
    expect(core.store.state.clock).toBe('22:00');
    expect(core.player.chart()).toMatchObject({ r: expect.closeTo(16.4, 0) });
    expect(core.store.state.objective).toBe('obj_frames');

    // P6
    h.goto('sp_bench'); await h.interact('it_bench_pier');
    expect(core.player.pose).toBe('sit');
    h.night(true); h.shoot('T_light_trail', { night: true });
    h.goto('sp_lighthouse_door'); h.input('lighthouse', '1987');
    await h.settle();
    has(h, 'trail_1987', 'lighthouse_open');
    await h.interact('it_lh_door');
    expect(h.lens.peek).toBe('lh_door');
    await h.interact('it_lh_switch');
    await h.settle();
    has(h, 'frame_3', 'P6_done');
    expect(core.store.state.clock).toBe('22:40');

    // P7
    h.goto('sw_gantry'); h.step(2);
    await h.talk('attendant');
    expect(rec.ui).toContain('namepicker');
    h.input('namepicker', ['陈', '远']);
    await h.settle();
    expect(rec.nodes).toContain('att.wrong');
    h.input('namepicker', ['周', '远']);
    await h.settle();
    has(h, 'subway_entered', 'name_known', 'memo_2_heard');
    expect(rec.wx).toContain('wx_name_memo');
    expect(rec.nodes).toEqual(expect.arrayContaining(['att.named', 'me.name']));
    await h.interact('it_gantry');
    has(h, 'gantry_open');
    await h.interact('it_psd');
    expect(h.lens.peek).toBe('pk_psd');
    h.shoot('T_frame4_pit');
    await h.settle();
    has(h, 'frame4_registered', 'frame_4', 'P7_done');
    expect(core.store.state.clock).toBe('23:20');

    // P8
    h.goto('vp_subway_top'); h.shoot('T_chai');
    await h.settle();
    has(h, 'P8_done', 'faces_restored');
    expect(rec.beats.filter((b) => b === 'S_zhe')).toHaveLength(1);
    expect(rec.wx).toContain('wx_zhe');

    // P9
    h.goto('sp_dot_ground'); await h.interact('it_dot');
    has(h, 'dot_taken');
    h.goto('sp_paper_shop'); h.night(true);
    const talk = h.talk('zhimei');
    expect(rec.nodes.at(-1)).toBe('zhimei.night_dot');
    h.choose(0);
    await talk; await h.settle();
    has(h, 'zhimei_eye', 'zhimei_at_seawall');
    expect(core.store.state.items).not.toContain('cinnabar_dot');
    h.goto('sp_seawall_zhimei'); h.night(true);
    const [sea] = h.shoot('T_zhimei_sea', { night: true });
    await h.show('zhimei', [sea.id]);
    await h.settle();
    has(h, 'frame_2', 'P9_done', 'all_frames');
    expect(rec.wx).toContain('wx_darkroom');
    expect(core.store.state.objective).toBe('obj_darkroom');

    // S_darkroom: bench, three trays, then the viewfinder near the line
    h.goto('dk_bench');
    await h.interact('it_dk_bench');
    await h.interact('it_dk_tray_brown');
    await h.interact('it_dk_tray_white');
    await h.interact('it_dk_tray_blue');
    has(h, 'dk_lit', 'dk_tray_1', 'dk_tray_2', 'dk_tray_3', 'dk_hung', 'memo_3_heard');
    core.services.lens.setViewfinder(true);
    await h.settle();
    has(h, 'developed', 'finale_started');
    expect(rec.beats).toEqual(expect.arrayContaining(['S_darkroom', 'S_group_photo']));
    expect(core.store.state.items).toContain('envelope_dad');
    expect(core.store.state.photos.some((p) => p.preset === 'ph_2023_stitched')).toBe(true);
    expect(core.store.state.phase).toBe('dawn');
    expect(core.store.state.objective).toBe('obj_dawn');
    expect(rec.cards.slice(-2)).toEqual(['liaozhai:juan3', 'chapter:finale']);

    // 合影
    h.goto('sp_tripod'); await h.interact('it_tripod');
    expect(h.lens.peek).toBe('tripod');
    core.services.lens.startTripodTimer();
    h.goto('sp_stairs_x'); h.tripodSuccess();
    await h.settle();
    has(h, 'group_photo_done', 'bus_arrived');
    expect(core.store.state.clock).toBe('06:00');
    expect(core.store.state.objective).toBe('obj_bus');

    // 结局 A
    h.goto('sp_bus_bench');
    const bus = h.talk('attendant');
    expect(rec.nodes.at(-1)).toBe('att.bus');
    h.choose(0);
    await bus; await h.settle();
    has(h, 'ending_A', 'credits_done');
    expect(core.store.state.cleared).toBe(true);
    expect(rec.titleShown).toBe(1);

    // no story wx was delivered twice, and every wx the story knows arrived at most once
    expect(new Set(rec.wx).size).toBe(rec.wx.length);
  }, 60_000);
});

describe('shared golden rows (dev/story.html)', () => {
  it('every GOLDEN_ROWS row sets its flags', async () => {
    const { GOLDEN_ROWS } = await import('./goldenRows');
    const h = await createHarness({ start: 'skip' });
    await h.settle();
    for (const row of GOLDEN_ROWS) {
      await row.run(h);
      await h.settle();
      for (const f of row.flags) expect(h.flags(), `${row.step}: ${f}`).toContain(f);
    }
  }, 60_000);
});
