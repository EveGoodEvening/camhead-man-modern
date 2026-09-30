// src/story/goldenRows.ts — owner F. GDD §19.3 golden path as harness rows (logic level: fake E/D, real core + story).
// Shared by story.golden.test.ts and the dev page (dev/story.html). No player-facing text here.
import type { Harness } from './testHarness';
import { INPUTS } from '../data/puzzles';

export interface GoldenRow { step: string; flags: readonly string[]; run(h: Harness): Promise<void> }

// the two picker characters (surname, given name): grid cells 0 and 6 of the GDD §9 P7 picker
const GRID = INPUTS.namepicker.grid ?? [];
const NAME = [GRID[0], GRID[6]];

export const GOLDEN_ROWS: readonly GoldenRow[] = [
  { step: 'P1', flags: ['P1_done', 'ch1_started'], async run(h) {
    h.goto('vp_group_photo'); h.core.store.setRefPhoto('ph_2006_group'); h.shoot('T_rephoto_2006');
  } },
  { step: 'P2', flags: ['locker_seen', 'sms_full', 'P2_done'], async run(h) {
    h.goto('sp_locker'); h.step(10); await h.settle();
    h.goto('sp_bridge_deck'); h.step(10); h.core.bus.emit('signalChanged', { bars: 4 }); await h.settle();
    h.goto('sp_locker'); h.input('locker', ['17', '0815']);
  } },
  { step: 'S_studio', flags: ['film_at_tudi'], async run(h) { h.goto('st_cabinet'); await h.interact('it_st_cabinet'); } },
  { step: 'P3', flags: ['P3_done', 'ch2_started'], async run(h) {
    h.goto('sp_store_front'); await h.talk('granny_wang'); await h.talk('granny_wang');
    const ps = h.shoot('T_granny_face', { burst: true });
    h.goto('sp_estate_gate');
    const o = ps.find((p) => p.tags.includes('granny_face_open')), c = ps.find((p) => p.tags.includes('granny_face_closed'));
    await h.show('gate', [o?.id, c?.id].filter((x): x is string => !!x));
    await h.settle();
    h.goto('sp_estate_gate_inner'); h.step(5);
  } },
  { step: 'P4', flags: ['idol_scanned', 'P4_done'], async run(h) {
    h.goto('sp_donation_box'); h.shoot('T_temple_qr'); h.step(40); await h.settle();
    h.goto('vp_temple_2011'); h.core.store.setRefPhoto('ph_temple_2011'); h.shoot('T_rephoto_2011');
  } },
  { step: 'tudi', flags: ['tudi_met'], async run(h) { h.night(true); await h.talk('tudi'); } },
  { step: 'S_mirror', flags: ['mirror_selfie'], async run(h) { h.goto('sp_mirror_stand'); h.shoot('T_mirror_self'); } },
  { step: 'P5', flags: ['frame_1', 'P5_done', 'ch3_started'], async run(h) {
    h.goto('sp_estate_yard'); await h.talk('granny_wang');
    h.goto('sp_milkbox'); h.input('milkbox', '403'); await h.settle();
    h.goto('sp_fire_ladder'); await h.interact('it_fire_ladder'); await h.settle();
    h.night(true); await h.talk('meiqiu'); await h.settle();
    await h.interact('it_coop'); h.shoot('T_pigeons'); await h.settle();
    h.goto('sp_roof'); await h.interact('it_frame1');
  } },
  { step: 'P6', flags: ['trail_1987', 'frame_3', 'P6_done'], async run(h) {
    h.goto('sp_bench'); await h.interact('it_bench_pier'); h.night(true); h.shoot('T_light_trail', { night: true });
    h.goto('sp_lighthouse_door'); h.input('lighthouse', '1987'); await h.settle();
    await h.interact('it_lh_door'); await h.interact('it_lh_switch');
  } },
  { step: 'P7', flags: ['name_known', 'gantry_open', 'frame_4', 'P7_done'], async run(h) {
    h.goto('sw_gantry'); h.step(2); await h.talk('attendant');
    h.input('namepicker', NAME); await h.settle();
    await h.interact('it_gantry'); await h.interact('it_psd'); h.shoot('T_frame4_pit');
  } },
  { step: 'P8', flags: ['P8_done', 'faces_restored'], async run(h) { h.goto('vp_subway_top'); h.shoot('T_chai'); } },
  { step: 'P9', flags: ['dot_taken', 'zhimei_eye', 'frame_2', 'P9_done', 'all_frames'], async run(h) {
    h.goto('sp_dot_ground'); await h.interact('it_dot');
    h.goto('sp_paper_shop'); h.night(true);
    const talk = h.talk('zhimei'); h.choose(0); await talk; await h.settle();
    h.goto('sp_seawall_zhimei'); h.night(true);
    const [sea] = h.shoot('T_zhimei_sea', { night: true });
    await h.show('zhimei', [sea.id]);
  } },
  { step: 'darkroom', flags: ['dk_hung', 'developed', 'finale_started'], async run(h) {
    h.goto('dk_bench');
    for (const id of ['it_dk_bench', 'it_dk_tray_brown', 'it_dk_tray_white', 'it_dk_tray_blue'] as const) await h.interact(id);
    await h.settle();
    h.core.services.lens.setViewfinder(true);
  } },
  { step: 'group', flags: ['group_photo_done', 'bus_arrived'], async run(h) {
    h.goto('sp_tripod'); await h.interact('it_tripod'); h.core.services.lens.startTripodTimer();
    h.goto('sp_stairs_x'); h.tripodSuccess();
  } },
  { step: 'ending', flags: ['ending_A', 'credits_done'], async run(h) {
    h.goto('sp_bus_bench'); const talk = h.talk('attendant'); h.choose(0); await talk;
  } },
];
