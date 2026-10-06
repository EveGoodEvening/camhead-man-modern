// src/data/story.ts — owner F. GDD §10.1 chapters, §10.2 state machine, §10.6 objectives + smoke, zones, the
// ?chapter= boot states and the beat end states.
//
// STORY_RULES follows §10.2 row by row. Two rule shapes:
//   · trigger rules set a §10.2 flag from a world event or condition (zone, signal, scene, all frames …);
//   · effect rules `fx(flag, …)` = { flag: 'seen:fx.<flag>', when: { all: [flag] } } fire the row's side effects once
//     when the flag appears, whoever set it (D's onShot, E's input/show outcomes, node effects, beats, solve()).
// Chapter guards per the §10.2 note: #5–#15 ch1_started, #17–#28 ch2_started, #30–#43 ch3_started, #46–#48 finale.
import type { ZoneDef } from '../contracts';
import type {
  Action, BeatDef, ChapterBoot, ChapterDef, ChapterId, Cond, FlagId, ObjectiveDef, PuzzleId, SpotId, StoryRule, Verb,
} from '../types';

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'prologue', cardId: 'prologue', phase: 'day', palette: 'morning', clock: '06:10' },
  { id: 'ch1', cardId: 'ch1', phase: 'day', palette: 'day', clock: '10:00' },
  { id: 'ch2', cardId: 'ch2', phase: 'dusk', palette: 'dusk', clock: '17:40' },
  { id: 'ch3', cardId: 'ch3', phase: 'night', palette: 'night', clock: '22:00' },
  { id: 'finale', cardId: 'finale', phase: 'dawn', palette: 'dawn', clock: '05:40' },
];

const G1: Cond = { all: ['ch1_started'] };
const G2: Cond = { all: ['ch2_started'] };
const G3: Cond = { all: ['ch3_started'] };
const G4: Cond = { all: ['finale_started'] };

/** Effect rule for a flag set elsewhere (ids `seen:fx.<flag>`). */
const fx = (flag: FlagId, effects: readonly Action[], guard?: Cond): StoryRule =>
  (guard ? { flag: `seen:fx.${flag}`, when: { all: [flag] }, guard, effects } : { flag: `seen:fx.${flag}`, when: { all: [flag] }, effects });

/** GDD §10.2 #1: the first 开机. Also used verbatim (quietly) by startGame({ skipIntro: true }). */
/** I-play: the HUD clock that goes with a bare `?phase=` (the first chapter set in that phase: day 06:10, dusk 17:40,
 *  night 22:00, dawn 05:40), so a night screenshot never reads 06:10. */
export function phaseClock(phase: ChapterDef['phase']): string {
  return CHAPTERS.find((c) => c.phase === phase)?.clock ?? '06:10';
}

export const GAME_START_EFFECTS: readonly Action[] = [
  { chapter: 'prologue', phase: 'day', palette: 'morning', clock: '06:10' },
  { photo: 'ph_2006_group' },
  { beat: 'S_wake' },
];

export const STORY_RULES: readonly StoryRule[] = [
  // #1 标题「开机」 → S_wake (?skipTitle applies the same effects quietly)
  { flag: 'game_started', when: { event: 'gameStarted', match: { fromSave: false } }, effects: GAME_START_EFFECTS },
  // #2 S_wake step 6
  fx('wx_tudi_added', [{ wx: 'wx_intro' }, { objective: 'obj_p1' }]),
  // #3 P1 (D: T_rephoto_2006 sets P1_done) → back of the photo, the rules, 序卷, then #4
  fx('P1_done', [
    { clue: 'clue_photo_back' }, { node: 'me.p1' }, { wx: 'wx_rules' }, { clue: 'clue_rules' },
    { card: 'liaozhai', id: 'xu' }, { set: 'ch1_started' },
  ]),
  // #4 序卷 closed → 第一章 (the palette tweens behind the chapter card)
  fx('ch1_started', [
    { chapter: 'ch1', phase: 'day', palette: 'day', clock: '10:00' }, { card: 'chapter', id: 'ch1' },
    { wx: 'wx_ch1' }, { objective: 'obj_studio' },
  ]),
  // #5 met_xiaolin: effect of xiaolin.first
  // #6 shutter E (or its QR, D)
  fx('studio_locked_seen', [{ objective: 'obj_locker' }], G1),
  // #7 within 6 m of the locker (zone), or E on it, or a photo of T_locker17 (D)
  { flag: 'locker_seen', when: { event: 'enterZone', match: { spot: 'sp_locker' } }, guard: G1, effects: [] },
  // the SMS is a phone buzz (toast + memo clue), never a dialogue box: walking past 小林 must not be interrupted
  fx('locker_seen', [{ sfx: 'sfx_ping' }, { toast: 'sys.sms_garbled' }, { clue: 'clue_sms_garbled' }, { objective: 'obj_locker' }], G1),
  // #8 full bars (bridge deck centre) after the garbled SMS
  { flag: 'sms_full', when: { event: 'signalChanged', match: { bars: 4 } }, guard: { all: ['ch1_started', 'locker_seen'], none: ['P2_done'] }, effects: [] },
  fx('sms_full', [{ sfx: 'sfx_ping' }, { toast: 'sys.sms_full' }, { clue: 'clue_sms_full' }, { objective: 'obj_locker' }], G1),
  // #9 locker 17 + 0815 (INPUTS.locker.onOk gives key_ring + note_dad, sets P2_done)
  fx('P2_done', [{ node: 'note.dad' }, { node: 'me.p2' }, { objective: 'obj_studio_enter' }], G1),
  // #10 the darkroom phone (memo_1 played by the interact)
  fx('memo_1_heard', [{ clue: 'clue_memo_1' }, { node: 'me.memo1' }], G1),
  // #11 the doorframe (interact or T_height_marks)
  fx('height_marks_seen', [{ clue: 'clue_height_marks' }, { node: 'me.height' }], G1),
  // #12 cabinet 0815 → up the hill (granny.ask_photo becomes eligible by its own condition)
  fx('film_at_tudi', [{ clue: 'clue_empty_bag' }, { wx: 'wx_studio_bag' }, { objective: 'obj_temple' }], G1),
  // #13 granny.ask_photo ended
  fx('granny_asked_photo', [{ objective: 'obj_gate' }], G1),
  // #14 gate_face_ok: GATE_OUTCOMES.one · #15 P3_done: GATE_OUTCOMES.pass → the gate opens (B, GateDef)
  // (me.p3 is gate.pass's close effect: queued from here it played before the verdict — P3r3 T1)
  fx('P3_done', [{ sfx: 'sfx_scan' }], G1),
  // #16 through the gate → 卷一, 第二章, dusk; B1/B2 lift
  { flag: 'ch2_started', when: { event: 'enterZone', match: { spot: 'sp_estate_gate_inner' } }, guard: { all: ['P3_done', 'ch1_started'] }, effects: [] },
  // (P3 G2: without ch1_started here a prologue P3 opened 第二章 before P1, and the late P1 then rewound the town to
  // ch1/day for good — tudi.after_p4 is dusk-only, so S_mirror/P5 became unreachable)
  fx('ch2_started', [
    { card: 'liaozhai', id: 'juan1' }, { chapter: 'ch2', phase: 'dusk', palette: 'dusk', clock: '17:40' },
    { set: 'roadwork_cleared' }, { set: 'tide_out' }, { card: 'chapter', id: 'ch2' },
    { wx: 'wx_dusk' }, { objective: 'obj_p4' },
  ]),
  // P4 set-up: the first E on the faceless idol pushes wx_idol
  { flag: 'seen:fx.wx_idol', when: { event: 'interact', match: { id: 'it_temple_idol' } },
    guard: { all: ['ch2_started'], none: ['P4_done'] }, effects: [{ wx: 'wx_idol' }] },
  // #17 T_temple_qr scanned (D)
  fx('idol_scanned', [{ photo: 'ph_temple_2011' }, { wx: 'wx_after_scan' }], G2),
  // #18 T_rephoto_2011 (D) → night vision; the idol's face and tudi appear (B/C read the flag)
  fx('P4_done', [{ verb: 'night' }, { wx: 'wx_after_p4' }], G2),
  // #19 tudi.after_p4 ended
  fx('tudi_met', [{ objective: 'obj_mirror' }], G2),
  // #20 T_mirror_self (D) → S_mirror (me.mirror + M_mirror_face)
  fx('mirror_selfie', [{ clue: 'clue_sticker' }, { beat: 'S_mirror' }, { wx: 'wx_mirror' }, { objective: 'obj_coop' }], G2),
  // #21 P5_started: granny.dusk_coop · #22 door403_found: T_door_403 (D) · #23 key_rooftop: INPUTS.milkbox
  // #24 first time on the roof (ladder teleport or walking into the roof zone)
  { flag: 'on_roof_once', when: { event: 'teleported', match: { spot: 'sp_roof' } }, guard: G2, effects: [] },
  { flag: 'on_roof_once', when: { event: 'enterZone', match: { spot: 'sp_roof' } }, guard: G2, effects: [] },
  // #25 meiqiu.roof
  fx('meiqiu_talked', [{ verb: 'detach' }, { clue: 'clue_cat_zhou' }], G2),
  // #26 pigeons_gone: T_pigeons (D); frame ① lies at frame1_drop (it_frame1)
  // #27 frame ① picked up → #28 P5_done → S_sunset
  fx('frame_1', [{ set: 'P5_done' }], G2),
  fx('P5_done', [{ beat: 'S_sunset' }], G2),
  // #29 S_sunset over → 卷二, 第三章, night; land at the fire ladder
  fx('ch3_started', [
    { card: 'liaozhai', id: 'juan2' }, { chapter: 'ch3', phase: 'night', palette: 'night', clock: '22:00' },
    { card: 'chapter', id: 'ch3' }, { teleport: 'sp_fire_ladder' }, { wx: 'wx_night' }, { objective: 'obj_frames' },
  ]),
  // #30 T_plaque (D)
  fx('plaque_read', [{ clue: 'clue_plaque' }], G3),
  // #31 trail_1987: T_light_trail (D) · #32 lighthouse_open: INPUTS.lighthouse
  // #33 the main switch drops frame ③ → P6
  fx('frame_3', [{ set: 'P6_done' }, { node: 'me.frame3' }], G3),
  // #34 down the subway stairs
  { flag: 'subway_entered', when: { event: 'sceneChanged', match: { to: 'subway_int' } }, guard: G3, effects: [] },
  // #35 周远 (att.named sets it, then me.name) → the voice memo
  fx('name_known', [{ wx: 'wx_name_memo' }, { set: 'memo_2_heard' }], G3),
  // #36 gantry_open: the gantry (glue) · #37 T_frame4_pit (D) → att.registered regardless of distance
  fx('frame4_registered', [{ node: 'att.registered' }], G3),
  // #38 att.registered gives frame ④ → P7
  fx('frame_4', [{ set: 'P7_done' }], G3),
  // #39 T_chai 「折」 (D) → S_zhe (faces_restored, granny to the window, wx_zhe)
  fx('P8_done', [{ beat: 'S_zhe' }], G3),
  // 夜里第一次走进拆字 15 m → M_chai_wake + chai.night_first
  { flag: 'seen:fx.chai_wake', when: { event: 'enterZone', match: { spot: 'sp_chai' } },
    guard: { phase: ['night'], all: ['ch3_started'], none: ['P8_done', 'seen:chai.night_first'] },
    effects: [{ uncanny: 'M_chai_wake' }, { sfx: 'sfx_notice' }, { node: 'chai.night_first' }] },
  // #40 dot_taken: it_dot · #41 点睛 → she walks to the seawall
  fx('zhimei_eye', [{ set: 'zhimei_at_seawall' }], G3),
  // #42 zhimei.done gives frame ② → P9
  fx('frame_2', [{ set: 'P9_done' }], G3),
  // #43 all four frames; with 折 too → the darkroom
  { flag: 'all_frames', when: { all: ['frame_1', 'frame_2', 'frame_3', 'frame_4'] }, guard: G3, effects: [] },
  { flag: 'seen:fx.darkroom_ready', when: { all: ['all_frames', 'P8_done'] }, guard: G3,
    effects: [{ wx: 'wx_darkroom' }, { objective: 'obj_darkroom' }] },
  // #44 S_darkroom over → envelope, stitched print, 卷三 → #45
  fx('developed', [
    { give: 'envelope_dad' }, { photo: 'ph_2023_stitched' }, { set: 'memo_3_heard' }, { setClock: '04:30' },
    { card: 'liaozhai', id: 'juan3' }, { set: 'finale_started' },
  ]),
  // #45 卷三 closed → 终章 at dawn on the 周记 tile (C moves everyone to g*)
  fx('finale_started', [
    { chapter: 'finale', phase: 'dawn', palette: 'dawn', clock: '05:40' }, { card: 'chapter', id: 'finale' },
    { teleport: 'vp_group_photo' }, { wx: 'wx_dawn' }, { objective: 'obj_dawn' }, { beat: 'S_group_photo' },
  ]),
  // #46 the tripod photo (D) → 人 100% → the bus (glue starts busZero.arrive when granny.group_after ends) → #47
  fx('group_photo_done', [
    { setClock: '05:58' }, { node: 'me.group_done' }, { node: 'granny.group_after' }, { setClock: '06:00' },
    { sfx: 'sfx_horn' }, { wait: 4 }, { set: 'bus_arrived' },
  ], G4),
  fx('bus_arrived', [{ objective: 'obj_bus' }], G4),
  // #48 att.bus 【上车】/【不上车】
  fx('ending_A', [{ beat: 'S_ending_A' }], G4),
  fx('ending_B', [{ beat: 'S_ending_B' }], G4),
  // #49 credits_done: glue (markCleared, title palette, title screen); core rewrites the save as cleared
  // 怪谈录 3/6 and 6/6
  { flag: 'seen:fx.bst3', when: { event: 'bestiaryAdded', match: { count: 3 } }, effects: [{ wx: 'wx_bst3' }] },
  { flag: 'seen:fx.bst6', when: { event: 'bestiaryAdded', match: { count: 6 } }, effects: [{ wx: 'wx_bst6' }] },
];

/** GDD §10.6 (smoke: first matching rule wins; `nearest` picks the closest spot whose SMOKE_ELIGIBLE cond holds).
 *  P3 wayfinding: every rule also names the objective chip text for its step (`text`, else the objective's own
 *  textKey; `nearest` rules read SMOKE_STEP_TEXT), so the chip, 土地's smoke and the HUD incense arrow agree. */
export const OBJECTIVES: readonly ObjectiveDef[] = [
  { id: 'obj_p1', textKey: 'obj.obj_p1', smoke: [{ spot: 'vp_group_photo' }], hintFor: 'P1_rephoto_bridge' },
  { id: 'obj_studio', textKey: 'obj.obj_studio', smoke: [{ spot: 'sp_studio_door' }], hintFor: 'P2_signal_locker' },
  {
    id: 'obj_locker', textKey: 'obj.obj_locker', hintFor: 'P2_signal_locker',
    smoke: [
      { when: { all: ['locker_seen'], none: ['sms_full'] }, spot: 'sp_bridge_deck', text: 'obj.step.sms_signal' },
      { when: { all: ['sms_full'] }, spot: 'sp_locker', text: 'obj.step.sms_full' },
      { spot: 'sp_locker' },
    ],
  },
  {
    id: 'obj_studio_enter', textKey: 'obj.obj_studio_enter', hintFor: 'S_studio',
    smoke: [{ when: { scene: 'studio_int' }, spot: 'st_cabinet', text: 'obj.step.studio_look' }, { spot: 'sp_studio_door' }],
  },
  {
    id: 'obj_temple', textKey: 'obj.obj_temple', hintFor: 'P3_face_gate',
    smoke: [
      { when: { scene: 'studio_int' }, spot: 'st_exit', text: 'obj.step.studio_leave' },
      { when: { none: ['granny_asked_photo'] }, spot: 'sp_store_front', text: 'obj.step.ask_resident' },
      { spot: 'sp_estate_gate' },
    ],
  },
  {
    id: 'obj_gate', textKey: 'obj.obj_gate', hintFor: 'P3_face_gate',
    smoke: [
      // P3r3 U1: the gate is open — walking through it starts chapter 2 (the chip used to stay on 「出示照片」)
      { when: { all: ['P3_done'], none: ['ch2_started'] }, spot: 'sp_estate_gate_inner', text: 'obj.step.gate_through' },
      { when: { tags: ['granny_face_open', 'granny_face_closed'] }, spot: 'sp_estate_gate', text: 'obj.step.gate_show' },
      { npc: 'granny_wang', text: 'obj.step.gate_granny' },
    ],
  },
  {
    id: 'obj_p4', textKey: 'obj.obj_p4', hintFor: 'P4_tudi_face',
    smoke: [
      { when: { all: ['P4_done'] }, npc: 'tudi', text: 'obj.step.tudi_night' },
      { when: { none: ['idol_scanned'] }, spot: 'sp_donation_box', text: 'obj.step.temple_scan' },
      { spot: 'vp_temple_2011', text: 'obj.step.temple_rephoto' },
    ],
  },
  { id: 'obj_mirror', textKey: 'obj.obj_mirror', smoke: [{ spot: 'sp_mirror_stand' }], hintFor: 'S_mirror' },
  {
    id: 'obj_coop', textKey: 'obj.obj_coop', hintFor: 'P5_rooftop_coop',
    smoke: [
      { when: { none: ['P5_started'] }, spot: 'sp_estate_yard', text: 'obj.step.coop_granny' },
      { when: { none: ['door403_found', 'key_rooftop'] }, spot: 'vp_estate_doors', text: 'obj.step.coop_doors' },
      { when: { none: ['key_rooftop'] }, spot: 'sp_milkbox', text: 'obj.step.coop_milkbox' },
      { when: { none: ['on_roof_once'] }, spot: 'sp_fire_ladder', text: 'obj.step.coop_ladder' },
      { when: { none: ['meiqiu_talked'] }, npc: 'meiqiu', text: 'obj.step.coop_cat' },
      { when: { none: ['pigeons_gone'] }, spot: 'pk_coop', text: 'obj.step.coop_peek' },
      { spot: 'sp_roof', text: 'obj.step.coop_frame' },
    ],
  },
  {
    // night hub: no hintFor (GDD §13 rule 3 walks P6 → P9)
    id: 'obj_frames', textKey: 'obj.obj_frames',
    smoke: [
      { when: { scene: 'subway_int', none: ['name_known'] }, spot: 'sw_gantry', text: 'obj.step.sw_attendant' },
      { when: { scene: 'subway_int', none: ['gantry_open'] }, spot: 'sw_gantry', text: 'obj.step.sw_gantry' },
      { when: { scene: 'subway_int', none: ['frame4_registered'] }, spot: 'pk_psd', text: 'obj.step.sw_psd' },
      { when: { scene: 'subway_int' }, spot: 'sw_exit', text: 'obj.step.sw_leave' },
      { when: { scene: 'studio_int' }, spot: 'st_exit', text: 'obj.step.studio_out' },
      { nearest: ['sp_bench', 'sp_lighthouse_door', 'sp_subway_entry', 'vp_subway_top', 'sp_dot_ground', 'sp_paper_shop', 'sp_seawall_zhimei'] },
    ],
  },
  {
    id: 'obj_darkroom', textKey: 'obj.obj_darkroom', hintFor: 'S_darkroom',
    smoke: [
      { when: { scene: 'studio_int', none: ['dk_hung'] }, spot: 'dk_bench', text: 'obj.step.dk_bench' },
      { when: { scene: 'studio_int' }, spot: 'dk_line', text: 'obj.step.dk_line' }, { spot: 'sp_studio_door' },
    ],
  },
  { id: 'obj_dawn', textKey: 'obj.obj_dawn', smoke: [{ spot: 'sp_tripod' }], hintFor: 'S_group_photo' },
  { id: 'obj_bus', textKey: 'obj.obj_bus', smoke: [{ spot: 'sp_bus_door' }] },
];

/** `nearest` smoke candidates: a spot is a candidate only while its errand is still open (GDD §10.6 obj_frames). */
export const SMOKE_ELIGIBLE: Readonly<Partial<Record<SpotId, Cond>>> = {
  sp_bench: { none: ['trail_1987', 'frame_3'] },
  sp_lighthouse_door: { all: ['trail_1987'], none: ['frame_3'] },
  sp_subway_entry: { none: ['frame_4'] },
  vp_subway_top: { none: ['P8_done'] },
  sp_dot_ground: { all: ['P8_done'], none: ['dot_taken'] },
  sp_paper_shop: { all: ['dot_taken'], none: ['zhimei_eye'] },
  sp_seawall_zhimei: { all: ['zhimei_eye'], none: ['frame_2'] },
};

/** P3r3 G5: the puzzle each obj_frames smoke step belongs to — the night-hub hint follows the smoke, so chip, smoke
 *  and 土地's wx always talk about the same errand (hints used to go P6 → P9 while the smoke went to the nearest). */
export const SMOKE_PUZZLE: Readonly<Partial<Record<SpotId, PuzzleId>>> = {
  sp_bench: 'P6_lighthouse_1987', sp_lighthouse_door: 'P6_lighthouse_1987',
  sp_subway_entry: 'P7_line_zero', sw_gantry: 'P7_line_zero', pk_psd: 'P7_line_zero', sw_entry: 'P7_line_zero', sw_exit: 'P7_line_zero',
  vp_subway_top: 'P8_chai_to_zhe',
  sp_dot_ground: 'P9_paper_eye', sp_paper_shop: 'P9_paper_eye', sp_seawall_zhimei: 'P9_paper_eye',
};

/** P3 wayfinding: chip text of a `nearest` smoke candidate (first matching entry wins). */
export const SMOKE_STEP_TEXT: Readonly<Partial<Record<SpotId, readonly { when?: Cond; text: string }[]>>> = {
  sp_bench: [{ text: 'obj.step.f_bench' }],
  sp_lighthouse_door: [{ when: { all: ['lighthouse_open'] }, text: 'obj.step.f_switch' }, { text: 'obj.step.f_lh_door' }],
  sp_subway_entry: [{ text: 'obj.step.f_subway' }],
  vp_subway_top: [{ text: 'obj.step.f_chai' }],
  sp_dot_ground: [{ text: 'obj.step.f_dot' }],
  sp_paper_shop: [{ text: 'obj.step.f_zhimei' }],
  sp_seawall_zhimei: [{ text: 'obj.step.f_seawall' }],
};

/** Trigger zones (their id is the spot id, matched by the enterZone rules above). */
export const ZONES: readonly ZoneDef[] = [
  { id: 'sp_locker', scene: 'planet', at: 'sp_locker', radius: 6 },
  { id: 'sp_estate_gate_inner', scene: 'planet', at: 'sp_estate_gate_inner', radius: 1.5 },
  { id: 'sp_chai', scene: 'planet', at: 'sp_chai', radius: 15 },
  { id: 'sp_roof', scene: 'planet', at: 'sp_roof', radius: 6, hRange: [14, 30] },
];

/** What a beat guarantees (quiet runs, skip() and save recovery run only this; ARCHITECTURE §2.5 BeatDef). */
export const BEATS: readonly BeatDef[] = [
  { id: 'S_wake', end: [{ set: 'wx_tudi_added' }] },
  { id: 'S_studio', end: [] },
  { id: 'S_mirror', end: [] },
  { id: 'S_sunset', end: [{ set: 'ch3_started' }] },
  { id: 'S_zhe', end: [{ set: 'faces_restored' }, { wx: 'wx_zhe' }] },
  { id: 'S_darkroom', end: [{ give: 'envelope_dad' }, { set: 'developed' }] },
  { id: 'S_group_photo', end: [] },
  { id: 'S_ending_A', end: [{ set: 'credits_done' }] },
  { id: 'S_ending_B', end: [{ set: 'credits_done' }] },
];

/** Beats whose end must be re-applied after loading a save that stopped between trigger and end (never expected: saves
 *  wait for beats, but a crash or a tab close mid-beat could leave one). */
export const BEAT_RECOVERY: readonly { beat: BeatDef['id']; when: Cond }[] = [
  { beat: 'S_wake', when: { all: ['game_started'], none: ['wx_tudi_added'] } },
  { beat: 'S_sunset', when: { all: ['P5_done'], none: ['ch3_started'] } },
  { beat: 'S_zhe', when: { all: ['P8_done'], none: ['faces_restored'] } },
  { beat: 'S_darkroom', when: { all: ['dk_hung', 'seen:beat.S_darkroom'], none: ['developed'] } },
  { beat: 'S_ending_A', when: { all: ['ending_A'], none: ['credits_done'] } },
  { beat: 'S_ending_B', when: { all: ['ending_B'], none: ['credits_done'] } },
];

// ---- ?chapter= boot states (GDD §19.1: everything the chapter's first puzzle needs) ----
const BASE_VERBS: readonly Verb[] = [
  'move', 'run', 'look', 'interact', 'viewfinder', 'shutter', 'burst', 'zoom', 'scan', 'flash', 'torch', 'show',
  'rephoto', 'signal', 'phone', 'hint',
];
const F_PRO: readonly FlagId[] = ['game_started', 'wx_tudi_added'];
const F_CH1: readonly FlagId[] = [...F_PRO, 'P1_done', 'ch1_started'];
const F_CH2: readonly FlagId[] = [
  ...F_CH1, 'met_xiaolin', 'studio_locked_seen', 'locker_seen', 'sms_full', 'P2_done', 'film_at_tudi',
  'granny_asked_photo', 'gate_face_ok', 'P3_done', 'ch2_started', 'roadwork_cleared', 'tide_out',
];
const F_CH3: readonly FlagId[] = [
  ...F_CH2, 'idol_scanned', 'P4_done', 'tudi_met', 'mirror_selfie', 'P5_started', 'door403_found', 'key_rooftop',
  'on_roof_once', 'meiqiu_talked', 'pigeons_gone', 'frame_1', 'P5_done', 'ch3_started',
];
const F_FIN: readonly FlagId[] = [
  ...F_CH3, 'trail_1987', 'lighthouse_open', 'frame_3', 'P6_done', 'subway_entered', 'name_known', 'memo_2_heard',
  'gantry_open', 'frame4_registered', 'frame_4', 'P7_done', 'P8_done', 'faces_restored', 'dot_taken', 'zhimei_eye',
  'zhimei_at_seawall', 'frame_2', 'P9_done', 'all_frames', 'dk_lit', 'dk_tray_1', 'dk_tray_2', 'dk_tray_3', 'dk_hung',
  'developed', 'memo_3_heard', 'finale_started',
];
const C_CH1 = ['clue_photo_back', 'clue_rules'] as const;
const C_CH2 = [...C_CH1, 'clue_sms_garbled', 'clue_sms_full', 'clue_empty_bag'] as const;
const C_CH3 = [...C_CH2, 'clue_sticker', 'clue_cat_zhou'] as const;

export const CHAPTER_BOOT: Readonly<Record<ChapterId, ChapterBoot>> = {
  prologue: {
    flags: F_PRO, items: [], verbs: BASE_VERBS, clues: [], presets: ['ph_2006_group'],
    phase: 'day', palette: 'morning', clock: '06:10', objective: 'obj_p1', spot: 'sp_bus_bench',
  },
  ch1: {
    flags: F_CH1, items: [], verbs: BASE_VERBS, clues: C_CH1, presets: ['ph_2006_group'],
    phase: 'day', palette: 'day', clock: '10:00', objective: 'obj_studio', spot: 'vp_group_photo',
  },
  ch2: {
    flags: F_CH2, items: ['key_ring', 'note_dad'], verbs: BASE_VERBS, clues: C_CH2, presets: ['ph_2006_group'],
    phase: 'dusk', palette: 'dusk', clock: '17:40', objective: 'obj_p4', spot: 'sp_estate_gate_inner',
  },
  ch3: {
    flags: F_CH3, items: ['key_ring', 'note_dad', 'key_rooftop', 'frame_1'], verbs: [...BASE_VERBS, 'night', 'detach'],
    clues: C_CH3, presets: ['ph_2006_group', 'ph_temple_2011'], phase: 'night', palette: 'night', clock: '22:00',
    objective: 'obj_frames', spot: 'sp_fire_ladder',
  },
  finale: {
    flags: F_FIN, items: ['key_ring', 'note_dad', 'key_rooftop', 'frame_1', 'frame_2', 'frame_3', 'frame_4', 'envelope_dad'],
    verbs: [...BASE_VERBS, 'night', 'detach'],
    clues: [...C_CH3, 'clue_plaque'], presets: ['ph_2006_group', 'ph_temple_2011', 'ph_2023_stitched'],
    phase: 'dawn', palette: 'dawn', clock: '05:40', objective: 'obj_dawn', spot: 'vp_group_photo',
  },
};
