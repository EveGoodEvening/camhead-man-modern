// src/data/puzzles.ts — owner F. GDD §9 puzzles (steps = progress flags for the §13 hint timer, targets, T1–T3 hints,
// §18.6 clockAfter: '' = night rule +40 min capped at 03:40), the four hinted beats (GDD §13), the §18.4 input answers
// and outcomes, and the rewards `solve()` grants besides the step/solved flags.
import type { Action, BeatHintDef, InputDef, InputKind, PuzzleDef, PuzzleId } from '../types';

const hints = (p: string): readonly [string, string, string] => [`hint.${p}.1`, `hint.${p}.2`, `hint.${p}.3`];

export const PUZZLES: readonly PuzzleDef[] = [
  {
    id: 'P1_rephoto_bridge', chapter: 'prologue', titleKey: 'pz.p1', availableWhen: { all: ['wx_tudi_added'] },
    steps: [], solvedFlag: 'P1_done', targets: ['T_rephoto_2006'], hints: hints('p1'), clockAfter: '06:40',
  },
  {
    id: 'P2_signal_locker', chapter: 'ch1', titleKey: 'pz.p2', availableWhen: { all: ['ch1_started'] },
    steps: ['studio_locked_seen', 'locker_seen', 'sms_full'], solvedFlag: 'P2_done',
    targets: ['T_locker17', 'T_studio_qr'], hints: hints('p2'), clockAfter: '11:10',
    // P3r3 G5: once the full SMS is in, 「站得越高越好」 is old news — the first hint is the locker code
    hintFloor: { sms_full: 3 },
  },
  {
    id: 'P3_face_gate', chapter: 'ch1', titleKey: 'pz.p3', availableWhen: { all: ['film_at_tudi'] },
    steps: ['granny_asked_photo', 'gate_face_ok'], solvedFlag: 'P3_done', targets: ['T_granny_face'],
    hints: hints('p3'), clockAfter: '12:30', hintFloor: { granny_asked_photo: 2, gate_face_ok: 3 },
  },
  {
    id: 'P4_tudi_face', chapter: 'ch2', titleKey: 'pz.p4', availableWhen: { all: ['ch2_started'] },
    steps: ['idol_scanned'], solvedFlag: 'P4_done', targets: ['T_temple_qr', 'T_rephoto_2011'],
    hints: hints('p4'), clockAfter: '18:10', hintFloor: { idol_scanned: 2 },
  },
  {
    id: 'P5_rooftop_coop', chapter: 'ch2', titleKey: 'pz.p5', availableWhen: { all: ['mirror_selfie'] },
    steps: ['P5_started', 'door403_found', 'key_rooftop', 'on_roof_once', 'meiqiu_talked', 'pigeons_gone', 'frame_1'],
    solvedFlag: 'P5_done',
    targets: [
      'T_door_201', 'T_door_202', 'T_door_203', 'T_door_204', 'T_door_301', 'T_door_302', 'T_door_303', 'T_door_304',
      'T_door_401', 'T_door_402', 'T_door_403', 'T_door_404', 'T_meiqiu', 'T_pigeons',
    ],
    hints: hints('p5'), clockAfter: '18:50', hintFloor: { door403_found: 3, key_rooftop: 3 },
  },
  {
    id: 'P6_lighthouse_1987', chapter: 'ch3', titleKey: 'pz.p6', availableWhen: { all: ['ch3_started'] },
    steps: ['plaque_read', 'trail_1987', 'lighthouse_open', 'frame_3'], solvedFlag: 'P6_done',
    targets: ['T_plaque', 'T_light_trail', 'T_frame3_lamp'], hints: hints('p6'), clockAfter: '',
    hintFloor: { plaque_read: 2, trail_1987: 3, lighthouse_open: 3 },
  },
  {
    id: 'P7_line_zero', chapter: 'ch3', titleKey: 'pz.p7', availableWhen: { all: ['ch3_started', 'meiqiu_talked'] },
    steps: ['subway_entered', 'name_known', 'gantry_open', 'frame4_registered', 'frame_4'], solvedFlag: 'P7_done',
    targets: ['T_frame4_pit'], hints: hints('p7'), clockAfter: '', hintFloor: { subway_entered: 2, name_known: 3 },
  },
  {
    id: 'P8_chai_to_zhe', chapter: 'ch3', titleKey: 'pz.p8', availableWhen: { all: ['ch3_started'] },
    steps: [], solvedFlag: 'P8_done', targets: ['T_chai'], hints: hints('p8'), clockAfter: '',
  },
  {
    id: 'P9_paper_eye', chapter: 'ch3', titleKey: 'pz.p9', availableWhen: { all: ['P8_done'] },
    steps: ['dot_taken', 'zhimei_eye', 'zhimei_at_seawall'], solvedFlag: 'P9_done',
    targets: ['T_zhimei', 'T_zhimei_sea'], hints: hints('p9'), clockAfter: '', hintFloor: { dot_taken: 3 },
  },
];

/** GDD §13: the four beats with hints (done flags film_at_tudi, mirror_selfie, developed, group_photo_done). */
export const BEAT_HINTS: readonly BeatHintDef[] = [
  { id: 'S_studio', availableWhen: { all: ['P2_done'] }, steps: ['height_marks_seen', 'memo_1_heard'],
    doneFlag: 'film_at_tudi', hints: hints('s_studio') },
  { id: 'S_mirror', availableWhen: { all: ['tudi_met'] }, steps: [], doneFlag: 'mirror_selfie', hints: hints('s_mirror') },
  { id: 'S_darkroom', availableWhen: { all: ['all_frames', 'P8_done'] },
    steps: ['dk_lit', 'dk_tray_1', 'dk_tray_2', 'dk_tray_3', 'dk_hung'], doneFlag: 'developed', hints: hints('s_darkroom'),
    hintFloor: { dk_lit: 3 } },
  { id: 'S_group_photo', availableWhen: { all: ['finale_started'] }, steps: [], doneFlag: 'group_photo_done',
    hints: hints('s_group') },
];

const MILKBOXES: readonly string[] = [1, 2, 3, 4, 5, 6].flatMap((f) => [1, 2, 3, 4].map((d) => `${f}0${d}`));

/** GDD §18.4 answers; UI = E, outcomes = these actions (onOk runs after E shows its own ok text). */
export const INPUTS: Readonly<Record<InputKind, InputDef>> = {
  // stage 0 = slot 17, stage 1 = pickup code 0815; the 2nd wrong code adds the sender's memo (GDD §9 P2)
  locker: {
    kind: 'locker', answer: ['17', '0815'], failKeys: ['kp.locker.badSlot', 'kp.locker.badCode'],
    hintAfter: { stage: 1, fails: 2, key: 'kp.locker.memo' },
    onOk: [{ sfx: 'sfx_click' }, { give: 'key_ring' }, { give: 'note_dad' }, { set: 'P2_done' }],
  },
  lighthouse: {
    kind: 'lighthouse', answer: ['1987'], failKeys: ['kp.lh.bad'],
    onOk: [{ sfx: 'sfx_door' }, { set: 'lighthouse_open' }],
  },
  // 2 × 6 picker, pick surname + given name, 确认 (GDD §9 P7); the joined picks must equal 周远
  namepicker: {
    kind: 'namepicker', answer: ['周远'],
    grid: ['周', '陈', '王', '林', '刘', '吴', '远', '望', '潮', '明', '焦', '影'],
    onOk: [{ sfx: 'sfx_chime' }, { node: 'att.named' }],
    onFail: [{ node: 'att.wrong' }],
  },
  // 24 boxes 101–604; only 403 holds the key, a few others hold texts (GDD §9 P5)
  milkbox: {
    kind: 'milkbox', answer: ['403'], grid: MILKBOXES,
    cells: { 101: 'mb.101', 204: 'mb.204', 403: 'mb.403', 502: 'mb.502', 604: 'mb.604' },
    onOk: [{ sfx: 'sfx_click' }, { give: 'key_rooftop' }],
  },
};

/** Extra state `story.solve(p)` grants on top of `steps` and `solvedFlag` (items the steps imply, GDD §19.2). */
export const SOLVE_REWARDS: Readonly<Record<PuzzleId, readonly Action[]>> = {
  P1_rephoto_bridge: [],
  P2_signal_locker: [{ give: 'key_ring' }, { give: 'note_dad' }],
  P3_face_gate: [{ set: 'gate_face_ok' }],
  P4_tudi_face: [{ photo: 'ph_temple_2011' }],
  P5_rooftop_coop: [{ give: 'key_rooftop' }, { give: 'frame_1' }],
  P6_lighthouse_1987: [{ give: 'frame_3' }],
  P7_line_zero: [{ give: 'frame_4' }],
  P8_chai_to_zhe: [],
  P9_paper_eye: [{ take: 'cinnabar_dot' }, { give: 'frame_2' }],
};
