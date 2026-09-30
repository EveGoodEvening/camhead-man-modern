// src/data/photoTargets.ts — owner D. Every row of GDD §8.1 (+ §9 puzzle feedback, §14 bestiary).
// Defaults (GDD §8.1): zoom [1,3,10], maxDist 30, minFrac 0.04, frameArea 0.92, layer world.
// Anchors: `{ world }` wherever B's geometry decides the point (ARCHITECTURE §3.D); explicit chart points where the
// GDD fixes them and B has no anchor. L=G rows: `layer: 'ghost'` for spirit-layer things, `needsNight` for world-layer
// things that must still be shot in the night viewfinder (zhimei, the light trail; rule ③).
import type { Phase, PhotoTarget, StrKey, TargetId, WorldAnchorId } from '../types';

const L = (id: TargetId, tiers: readonly (1 | 3 | 10)[]): PhotoTarget['labels'] =>
  tiers.map((z) => ({ zoom: z, key: `lbl.${id}.${z}` }));
const DUSK_NIGHT: readonly Phase[] = ['dusk', 'night'];
const QR = { kind: 'qr' as const, radius: 0.15, maxDist: 2.5, frameArea: 0.2, minFrac: 0.02 };

/** GDD §9 P5: fu-character states per door; 403 is the upside-down one. */
const DOORS = ['201', '202', '203', '204', '301', '302', '303', '304', '401', '402', '403', '404'] as const;
const door = (n: (typeof DOORS)[number]): PhotoTarget => {
  const id = `T_door_${n}` as TargetId;
  return {
    id, anchor: { world: `door_${n}` as WorldAnchorId }, radius: 0.35, zoom: [3, 10], maxDist: 20, minFrac: 0.02,
    requires: ['P3_done'],
    labels: [{ zoom: 1, key: 'lbl.T_door.1' }, { zoom: 3, key: `lbl.${id}.3` as StrKey }],
    okKey: `lbl.${id}.3`, okConfidence: n === '403' ? 96 : 90,
    failKeys: { zoom: 'fail.T_door.zoom' },
    onShot: { tags: [`door_${n}`], actions: n === '403' ? [{ set: 'door403_found' }] : [] },
  };
};

export const TARGETS: readonly PhotoTarget[] = [
  // ---------------------------------------------------------------- prologue / ch1
  {
    id: 'T_rephoto_2006', anchor: { r: 41, lon: 23, h: 3 }, radius: 5, kind: 'rephoto', zoom: [1],
    viewpoint: { spot: 'vp_group_photo', posTol: 1.5, yawTol: 10, pitchTol: 10 }, refPhoto: 'ph_2006_group',
    requires: ['wx_tudi_added'], excludes: ['P1_done', 'ch2_started'],   // P3 G2: P1 can never rewind a later chapter
    labels: L('T_rephoto_2006', [1]), okKey: 'lbl.T_rephoto_2006.ok', okConfidence: 100,
    failKeys: { viewpoint: 'fail.T_rephoto_2006.viewpoint' },
    onShot: { tags: ['rephoto_2006'], actions: [{ set: 'P1_done' }] },
  },
  {
    id: 'T_locker17', anchor: { world: 'locker17' }, radius: 0.3, zoom: [3, 10], maxDist: 8,
    requires: ['ch1_started'],                                  // GDD §10.2 #7 is a ch1 flag (P3 G2)
    labels: L('T_locker17', [1, 3, 10]), okKey: 'lbl.T_locker17.ok', okConfidence: 96,
    onShot: { tags: ['locker_17'], actions: [{ set: 'locker_seen' }] },
  },
  {
    id: 'T_studio_qr', anchor: { world: 'studio_qr' }, ...QR,
    requires: ['ch1_started'],                                  // GDD §10.2 #6 is a ch1 flag (P3 G2)
    labels: [{ zoom: 1, key: 'lbl.qr' }],
    onShot: { tags: [], actions: [{ set: 'studio_locked_seen' }, { wx: 'wx_auto_studio' }] },
  },
  {
    id: 'T_bus_qr', anchor: { world: 'bus_qr' }, ...QR,
    labels: [{ zoom: 1, key: 'lbl.qr' }],
    onShot: { tags: [], actions: [{ toast: 'vf.qr.bus' }] },
  },
  {
    id: 'T_bike_qr', anchor: { world: 'bike_qr' }, ...QR, radius: 0.1,
    labels: [{ zoom: 1, key: 'lbl.qr' }],
    onShot: { tags: [], actions: [{ toast: 'vf.qr.bike' }] },
  },
  {
    id: 'T_granny_face', anchor: { npc: 'granny_wang', bone: 'head' }, radius: 0.14, zoom: [1, 3], maxDist: 4,
    frameArea: 0.6, facing: { maxAngle: 45 }, phases: ['day'], requires: ['ch1_started'],   // P3 G2: P3 is a ch1 puzzle
    labels: L('T_granny_face', [1, 3]), okKey: 'lbl.T_granny_face.ok', special: 'granny_blink',
    onShot: { tags: [] },
  },
  {
    id: 'T_portrait_wall', anchor: { world: 'portrait_wall' }, radius: 1.6, zoom: [1], minFrac: 0.25, scene: 'studio_int',
    labels: L('T_portrait_wall', [1]), okKey: 'lbl.T_portrait_wall.1', okConfidence: 90,
    onShot: { tags: ['portrait_wall'] },
  },
  {
    id: 'T_height_marks', anchor: { world: 'doorframe' }, radius: 0.5, zoom: [1, 3], scene: 'studio_int',
    labels: L('T_height_marks', [1, 3]), okKey: 'lbl.T_height_marks.3', okConfidence: 97,
    onShot: { tags: ['height_marks'], actions: [{ set: 'height_marks_seen' }] },
  },
  // ---------------------------------------------------------------- ch2
  {
    id: 'T_temple_qr', anchor: { world: 'temple_qr' }, ...QR, requires: ['ch2_started'],
    labels: L('T_temple_qr', [1]),
    // wx_after_scan is F's effect rule on idol_scanned (STORY_RULES fx); sending it here too would push it twice
    onShot: { tags: [], actions: [{ set: 'idol_scanned' }, { photo: 'ph_temple_2011' }] },   // set first: rules.run applies it synchronously (I)
  },
  {
    id: 'T_rephoto_2011', anchor: { world: 'idol' }, radius: 0.8, kind: 'rephoto', zoom: [3],
    viewpoint: { spot: 'vp_temple_2011', posTol: 1.0, yawTol: 8, pitchTol: 8 }, refPhoto: 'ph_temple_2011',
    requires: ['idol_scanned'], excludes: ['P4_done'],
    labels: L('T_rephoto_2011', [1]), okKey: 'lbl.T_rephoto_2011.ok', okConfidence: 100,
    failKeys: { viewpoint: 'fail.T_rephoto_2011.viewpoint' },
    onShot: { tags: ['rephoto_2011'], actions: [{ set: 'P4_done' }] },
  },
  {
    id: 'T_tudi', anchor: { npc: 'tudi', bone: 'head' }, radius: 0.15, zoom: [1, 3], layer: 'ghost', still: true,
    requires: ['P4_done'],
    labels: L('T_tudi', [1, 3]), okKey: 'lbl.T_tudi.ok', okConfidence: 88,
    onShot: { tags: ['tudi_photo'] },
  },
  {
    id: 'T_mirror_self', anchor: { world: 'mirror' }, radius: 0.4, zoom: [1, 3], maxDist: 6, minFrac: 0.12,
    flash: 'forbidden', viewpoint: { spot: 'sp_mirror', posTol: 6, coneDeg: 30 },
    requires: ['tudi_met'], excludes: ['mirror_selfie'],
    labels: L('T_mirror_self', [1, 3]), okKey: 'lbl.T_mirror_self.ok', showConfidence: false,
    failKeys: { viewpoint: 'fail.T_mirror_self.viewpoint', size: 'fail.T_mirror_self.size', flash: 'fail.T_mirror_self.flash' },
    onShot: { tags: ['mirror_selfie'], actions: [{ set: 'mirror_selfie' }, { clue: 'clue_sticker' }] },
  },
  ...DOORS.map(door),
  {
    id: 'T_pigeons', anchor: { world: 'coop_inside' }, radius: 0.3, zoom: [1, 3], flash: 'required', onlyFrom: 'pk_coop',
    requires: ['on_roof_once'], excludes: ['pigeons_gone'],
    labels: L('T_pigeons', [1]), okKey: 'lbl.T_pigeons.ok', okConfidence: 99,
    failKeys: { flash: 'fail.T_pigeons.flash' },
    onShot: { tags: ['pigeons_flash'], actions: [{ set: 'pigeons_gone' }] },
  },
  {
    id: 'T_meiqiu', anchor: { npc: 'meiqiu', bone: 'head' }, radius: 0.1,
    labels: L('T_meiqiu', [1, 3, 10]), okConfidence: 88,
    onShot: { tags: ['cat_meiqiu'] },
  },
  {
    id: 'T_plaque', anchor: { world: 'plaque' }, radius: 0.25, zoom: [3, 10], maxDist: 12, requires: ['ch2_started'],
    labels: L('T_plaque', [1, 3, 10]), okConfidence: 95,
    onShot: { tags: ['plaque'], actions: [{ set: 'plaque_read' }] },
  },
  // ---------------------------------------------------------------- ch3
  {
    id: 'T_light_trail', anchor: { world: 'trail_plane' }, radius: 4, zoom: [1], needsNight: true, still: true,
    whole: { world: 'trail_plane' }, viewpoint: { spot: 'sp_bench', posTol: 1.2 },
    phases: ['night'], excludes: ['trail_1987'],
    labels: L('T_light_trail', [1]), okKey: 'lbl.T_light_trail.ok', liveKey: 'lbl.T_light_trail.live', okConfidence: 99,
    special: 'light_trail',
    failKeys: {
      layer: 'fail.T_light_trail.layer', viewpoint: 'fail.T_light_trail.viewpoint', whole: 'fail.T_light_trail.whole',
      still: 'fail.T_light_trail.still',
    },
    onShot: { tags: ['trail_1987'], actions: [{ set: 'trail_1987' }] },
  },
  {
    id: 'T_frame3_lamp', anchor: { world: 'lh_lamp' }, radius: 0.3, zoom: [10], onlyFrom: 'lh_door',
    requires: ['lighthouse_open'], excludes: ['frame_3'],        // I-play: gone once it fell (no 「卡在灯罩上」 after)
    labels: L('T_frame3_lamp', [1, 3, 10]), okKey: 'lbl.T_frame3_lamp.10', okConfidence: 94,
    onShot: { tags: ['frame3_seen'] },
  },
  {
    id: 'T_frame4_pit', anchor: { world: 'pit' }, radius: 0.2, zoom: [1, 3], needsLight: true, onlyFrom: 'pk_psd',
    scene: 'subway_int', requires: ['gantry_open'], excludes: ['frame4_registered'],
    labels: L('T_frame4_pit', [1, 3]), okKey: 'lbl.T_frame4_pit.ok', okConfidence: 95,
    failKeys: { dark: 'fail.T_frame4_pit.dark' },
    onShot: { tags: ['frame4_photo'], actions: [{ set: 'frame4_registered' }] },
  },
  {
    id: 'T_chai', anchor: { world: 'chai' }, radius: 1.8, zoom: [1, 3], maxDist: 25, whole: { world: 'chai' },
    mustBeHidden: ['sp_net_dot'], phases: ['night'], requires: ['ch3_started'], excludes: ['P8_done'],
    labels: L('T_chai', [1, 3]), okKey: 'lbl.T_chai.ok', okConfidence: 97, special: 'chai_dual',
    onShot: { tags: ['zhe_photo'], actions: [{ set: 'P8_done' }] },
  },
  {
    id: 'T_zhimei', anchor: { npc: 'zhimei', bone: 'head' }, radius: 0.15, zoom: [1, 3], needsNight: true, still: true,
    phases: DUSK_NIGHT,
    labels: L('T_zhimei', [1, 3]), okKey: 'lbl.T_zhimei.3', okConfidence: 88,
    yieldsTo: 'T_zhimei_sea',                                   // P3r3 G6: at the seawall only the sea photo counts
    onShot: { tags: ['zhimei_photo'] },
  },
  {
    // GDD §8.1: her chest at h 0.8 (the lens resolves the height through src/lens/anchors.ts NPC_ANCHOR_H)
    id: 'T_zhimei_sea', anchor: { npc: 'zhimei', bone: 'head' }, radius: 0.4, zoom: [1], needsNight: true, still: true,
    frameArea: 0.8, mustContain: ['T_lighthouse', 'T_sea'], maxDist: 10,
    requires: ['zhimei_eye'], excludes: ['frame_2'],
    labels: L('T_zhimei_sea', [1]), okKey: 'lbl.T_zhimei_sea.ok', okConfidence: 96,
    onShot: { tags: ['zhimei_sea'] },
  },
  // ---------------------------------------------------------------- landmarks (framing + auto tags only)
  {
    id: 'T_lighthouse', anchor: { r: 68, lon: 326, h: 9 }, radius: 4, kind: 'landmark', maxDist: 60,
    labels: L('T_lighthouse', [1, 3, 10]), onShot: { tags: ['lm:lighthouse'] },
  },
  {
    id: 'T_sea', anchor: { world: 'sea_point' }, radius: 3, kind: 'landmark', maxDist: 60,
    labels: L('T_sea', [1]), onShot: { tags: ['lm:sea'] },
  },
  // ---------------------------------------------------------------- bestiary (GDD §14)
  {
    id: 'T_bst_second_shadow', anchor: { r: 34, lon: 31.5, h: 0 }, radius: 0.9, zoom: [1, 3], flash: 'required', maxDist: 10,
    labels: L('T_bst_second_shadow', [1]), okKey: 'lbl.T_bst_second_shadow.ok', okConfidence: 91,
    onShot: { tags: ['bst_second_shadow'] },
  },
  {
    id: 'T_bst_manhole_eye', anchor: { r: 31.5, lon: 64, h: 0 }, radius: 0.4, zoom: [1, 3], layer: 'ghost', still: true,
    phases: DUSK_NIGHT,
    labels: L('T_bst_manhole_eye', [1]), okKey: 'lbl.T_bst_manhole_eye.ok', okConfidence: 87,
    onShot: { tags: ['bst_manhole_eye'] },
  },
  {
    id: 'T_bst_queue_shadows', anchor: { r: 37.5, lon: 358, h: 0 }, radius: 1.5, zoom: [1], layer: 'ghost', still: true,
    phases: ['night'],
    labels: L('T_bst_queue_shadows', [1]), okKey: 'lbl.T_bst_queue_shadows.ok', okConfidence: 90,
    onShot: { tags: ['bst_queue_shadows'] },
  },
  {
    id: 'T_bst_lion_turns', anchor: { world: 'lion_left_head' }, radius: 0.3, zoom: [1, 3], phases: ['night'],
    labels: L('T_bst_lion_turns', [1]), okKey: 'lbl.T_bst_lion_turns.ok', okConfidence: 93,
    onShot: { tags: ['bst_lion_turns'] },
  },
  {
    id: 'T_bst_tv_still_on', anchor: { world: 'roof_tv' }, radius: 0.3, zoom: [1, 3], layer: 'ghost', still: true,
    phases: DUSK_NIGHT,
    labels: L('T_bst_tv_still_on', [1]), okKey: 'lbl.T_bst_tv_still_on.ok', okConfidence: 92,
    onShot: { tags: ['bst_tv_still_on'] },
  },
  {
    id: 'T_bst_fish_watching', anchor: { world: 'fish7' }, radius: 0.05, zoom: [10], maxDist: 8, phases: DUSK_NIGHT,
    labels: L('T_bst_fish_watching', [1, 3]), okKey: 'lbl.T_bst_fish_watching.ok', okConfidence: 99,
    onShot: { tags: ['bst_fish_watching'] },
  },
];
