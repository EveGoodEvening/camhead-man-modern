// src/data/dialogue.ts — owner F. GDD §11 node table (conditions, priority, once, effects); lines live in zh/dlg.ts.
// Nodes without an explicit prio use 10 (GDD §11.0). Script-only nodes (cuts, show reactions, gate verdicts, objects,
// me.*) are never picked by ui.talk(): NPC-owned ones use SCRIPT (a flag nobody sets); the rest have non-NPC owners.
import type { Cond, DialogueNode, NodeId, SpeakerId, ReceiverId, InteractId, Action } from '../types';

/** Never true: `seen:script` is never set (script-only nodes are started by {node} actions, beats or show/gate). */
const SCRIPT: Cond = { all: ['seen:script'] };
const DAY: Cond['phase'] = ['day'];
const DUSK: Cond['phase'] = ['dusk'];
const NIGHT: Cond['phase'] = ['night'];
const DAWN: Cond['phase'] = ['dawn'];

type Owner = SpeakerId | ReceiverId | InteractId;
interface Opt { once?: boolean; effects?: readonly Action[]; choices?: DialogueNode['choices']; noFixedOptions?: boolean }
const n = (id: NodeId, owner: Owner, when: Cond, prio = 10, o: Opt = {}): DialogueNode => ({ id, owner, when, prio, ...o });
/** Script-only line block owned by a speaker (never selectable by talk). */
const cut = (id: NodeId, owner: Owner, o: Opt = {}): DialogueNode => ({ id, owner, when: SCRIPT, prio: 0, noFixedOptions: true, ...o });
/** Object text (GDD §11.13): owned by its interact, started by the interact itself. */
const obj = (id: NodeId, owner: InteractId): DialogueNode => ({ id, owner, when: {}, prio: 0, noFixedOptions: true });

export const NODES: readonly DialogueNode[] = [
  // ---------------------------------------------------------------- §11.1 我 (played by rules / beats)
  cut('me.wake', 'me'), cut('me.p1', 'me'), cut('me.p2', 'me'), cut('me.height', 'me'), cut('me.memo1', 'me'),
  cut('me.p3', 'me'), cut('me.mirror', 'me'), cut('me.frame3', 'me'), cut('me.name', 'me'), cut('me.zhe', 'me'),
  cut('me.developed', 'me'), cut('me.group_ready', 'me'), cut('me.group_done', 'me'),

  // ---------------------------------------------------------------- §11.2 小林
  n('xiaolin.first', 'xiaolin', { phase: ['day', 'dusk', 'night'], none: ['met_xiaolin'] }, 100,
    { once: true, effects: [{ set: 'met_xiaolin' }] }),
  n('xiaolin.studio', 'xiaolin', { phase: DAY, all: ['studio_locked_seen'], none: ['locker_seen', 'P2_done'] }, 90, { once: true }),
  n('xiaolin.signal', 'xiaolin', { phase: DAY, all: ['locker_seen'], none: ['sms_full', 'P2_done'] }, 80),
  n('xiaolin.after_p2', 'xiaolin', { phase: DAY, all: ['P2_done'], none: ['P3_done'] }, 70, { once: true }),
  n('xiaolin.day_idle', 'xiaolin', { phase: DAY }),
  n('xiaolin.dusk_idle', 'xiaolin', { phase: DUSK }),
  n('xiaolin.night_idle', 'xiaolin', { phase: NIGHT, none: ['name_known'] }),
  n('xiaolin.night_name', 'xiaolin', { phase: NIGHT, all: ['name_known'] }, 60, { once: true }),
  n('xiaolin.night_zhe', 'xiaolin', { phase: NIGHT, all: ['P8_done'] }, 50, { once: true }),
  n('xiaolin.night_idle2', 'xiaolin', { phase: NIGHT, all: ['name_known'] }, 5),
  n('xiaolin.dawn', 'xiaolin', { phase: DAWN }),
  cut('xiaolin.group_start', 'xiaolin'),
  cut('xiaolin.group_retry', 'xiaolin'),

  // ---------------------------------------------------------------- §11.3 王阿婆
  n('granny.first', 'granny_wang', { phase: DAY, none: ['met_granny'] }, 100, { once: true, effects: [{ set: 'met_granny' }] }),
  n('granny.ask_photo', 'granny_wang', { phase: DAY, all: ['film_at_tudi'], none: ['granny_asked_photo', 'P3_done'] }, 90,
    { once: true, effects: [{ set: 'granny_asked_photo' }] }),
  n('granny.ask_repeat', 'granny_wang', { phase: DAY, all: ['granny_asked_photo'], none: ['P3_done'] }, 50),
  n('granny.after_photo', 'granny_wang',
    { phase: DAY, all: ['granny_asked_photo'], tags: ['granny_face_open', 'granny_face_closed'], none: ['P3_done'] }, 55),
  n('granny.day_idle', 'granny_wang', { phase: DAY }),
  n('granny.dusk_wait', 'granny_wang', { phase: DUSK, none: ['mirror_selfie'] }, 20),
  n('granny.dusk_coop', 'granny_wang', { phase: DUSK, all: ['mirror_selfie'], none: ['P5_started'] }, 90,
    { once: true, effects: [{ set: 'P5_started' }] }),
  n('granny.dusk_coop_repeat', 'granny_wang', { phase: DUSK, all: ['P5_started'], none: ['key_rooftop'] }, 40),
  n('granny.dusk_key', 'granny_wang', { phase: DUSK, all: ['key_rooftop'], none: ['frame_1'] }, 40),
  n('granny.night_idle', 'granny_wang', { phase: NIGHT, none: ['P8_done'] }),
  n('granny.night_name', 'granny_wang', { phase: NIGHT, all: ['name_known'], none: ['P8_done'] }, 50, { once: true }),
  cut('granny.window_cut', 'granny_wang'),
  n('granny.window', 'granny_wang', { phase: NIGHT, all: ['P8_done'] }, 60, { once: true }),
  n('granny.window_idle', 'granny_wang', { phase: NIGHT, all: ['P8_done'] }, 5),
  n('granny.dawn', 'granny_wang', { phase: DAWN }),
  cut('granny.group_after', 'granny_wang'),

  // ---------------------------------------------------------------- §11.4 老陈
  n('chen.first', 'old_chen', { phase: DAY, none: ['met_chen'] }, 100, { once: true, effects: [{ set: 'met_chen' }] }),
  n('chen.boat', 'old_chen', { phase: DAY, all: ['met_chen'] }, 20, { effects: [{ clue: 'clue_boat_0815' }] }),
  n('chen.dusk_pier', 'old_chen', { phase: ['dusk', 'night'], none: ['P6_done'] }, 30, { effects: [{ clue: 'clue_chen_bench' }] }),
  // the bench line also records clue_chen_bench, so a player who skipped the dusk talk still gets the memo entry
  n('chen.night_bench', 'old_chen', { phase: NIGHT, none: ['trail_1987'] }, 40, { effects: [{ clue: 'clue_chen_bench' }] }),
  n('chen.after_frame3', 'old_chen', { phase: NIGHT, all: ['frame_3'] }, 50, { once: true }),
  n('chen.night_name', 'old_chen', { phase: NIGHT, all: ['name_known'] }, 45, { once: true }),
  n('chen.idle', 'old_chen', { phase: ['dusk', 'night'] }, 5),
  n('chen.dawn', 'old_chen', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.5 小刘
  n('liu.day', 'xiaoliu', { phase: DAY }, 20),
  n('liu.dusk', 'xiaoliu', { phase: DUSK }, 20),
  n('liu.night_hint', 'xiaoliu', { phase: NIGHT, none: ['P8_done'] }, 30, { effects: [{ clue: 'clue_liu_lamp' }] }),
  n('liu.night_name', 'xiaoliu', { phase: NIGHT, all: ['name_known'], none: ['P8_done'] }, 35, { once: true }),
  n('liu.night_after', 'xiaoliu', { phase: NIGHT, all: ['P8_done'] }, 40, { once: true }),
  n('liu.night_idle', 'xiaoliu', { phase: NIGHT, all: ['P8_done'] }, 5),
  n('liu.dawn', 'xiaoliu', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.6 土地 (talkNeedsNight; dawn: plain E)
  n('tudi.after_p4', 'tudi', { phase: DUSK, all: ['P4_done'], none: ['tudi_met'], lens: 'night' }, 100,
    { once: true, effects: [{ set: 'tudi_met' }] }),
  n('tudi.dusk_mirror', 'tudi', { phase: DUSK, all: ['tudi_met'], none: ['mirror_selfie'], lens: 'night' }),
  n('tudi.dusk_cat', 'tudi', { phase: DUSK, all: ['mirror_selfie'], lens: 'night' }),
  // P3r2 look L4: night_zhe hints at 点睛 only until it is done; then 土地 falls back to his general night lines
  n('tudi.night', 'tudi', { phase: NIGHT, lens: 'night' }),
  n('tudi.night_zhe', 'tudi', { phase: NIGHT, all: ['P8_done'], none: ['zhimei_eye'], lens: 'night' }, 20),
  n('tudi.dawn', 'tudi', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.7 煤球
  n('meiqiu.plain', 'meiqiu', { phase: ['day', 'dusk', 'night'], lens: 'plain' }, 1),
  n('meiqiu.roof', 'meiqiu', { phase: DUSK, lens: 'night', none: ['meiqiu_talked'] }, 100,
    { once: true, effects: [{ set: 'meiqiu_talked' }] }),
  n('meiqiu.roof_after', 'meiqiu', { phase: DUSK, lens: 'night', all: ['meiqiu_talked'], none: ['frame_1'] }, 50),
  n('meiqiu.night', 'meiqiu', { phase: NIGHT, lens: 'night' }),
  n('meiqiu.dawn', 'meiqiu', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.8 纸妹
  n('zhimei.plain', 'zhimei', { lens: 'plain', none: ['zhimei_eye'] }, 1),
  n('zhimei.dusk', 'zhimei', { phase: DUSK, lens: 'night' }, 20),
  n('zhimei.night_pre', 'zhimei', { phase: NIGHT, lens: 'night', none: ['P8_done'] }, 30),
  n('zhimei.night_wait', 'zhimei', { phase: NIGHT, lens: 'night', all: ['P8_done'], none: ['dot_taken'] }, 35),
  n('zhimei.night_dot', 'zhimei', { phase: NIGHT, lens: 'night', all: ['dot_taken'], none: ['zhimei_eye'] }, 40, {
    choices: [
      // 点睛: the paper sound, then zhimei.eye (its effects spend the dot and set zhimei_eye)
      { key: 'txt.choice.use_dot', then: 'zhimei.eye', actions: [{ sfx: 'sfx_paper' }] },
      { key: 'txt.choice.wait' },
    ],
  }),
  cut('zhimei.eye', 'zhimei', { effects: [{ take: 'cinnabar_dot' }, { set: 'zhimei_eye' }] }),
  n('zhimei.seawall', 'zhimei', { phase: NIGHT, all: ['zhimei_eye'], none: ['frame_2'] }, 40),
  cut('zhimei.done', 'zhimei', { effects: [{ give: 'frame_2' }] }),
  n('zhimei.after', 'zhimei', { phase: NIGHT, all: ['frame_2'] }),
  n('zhimei.dawn', 'zhimei', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.9 拆 / 折 (it_hoarding → talkAs 'chai')
  n('chai.day', 'chai', { phase: DAY }),
  n('chai.dusk', 'chai', { phase: DUSK }),
  n('chai.night_first', 'chai', { phase: NIGHT, none: ['P8_done'] }, 20, { once: true }),
  n('chai.night', 'chai', { phase: NIGHT, none: ['P8_done'] }),
  n('chai.after', 'chai', { phase: NIGHT, all: ['P8_done'] }),
  n('chai.dawn', 'chai', { phase: DAWN }),

  // ---------------------------------------------------------------- §11.10 站务员
  n('att.first', 'attendant', { scene: 'subway_int', none: ['name_known'] }, 100,
    { noFixedOptions: true, effects: [{ ui: 'namepicker' }] }),
  // P3r3 G12: a wrong name reopens the picker at once (it used to close, and the next talk replayed att.first)
  cut('att.wrong', 'attendant', { effects: [{ ui: 'namepicker' }] }),
  cut('att.named', 'attendant', { effects: [{ set: 'name_known' }, { node: 'me.name' }] }),
  n('att.gantry_repeat', 'attendant', { scene: 'subway_int', all: ['name_known'], none: ['gantry_open'] }),
  n('att.platform', 'attendant', { scene: 'subway_int', all: ['gantry_open'], none: ['frame4_registered'] }),
  // also started by the frame4_registered rule regardless of distance (GDD §10.2 #37)
  n('att.registered', 'attendant', { all: ['frame4_registered'], none: ['frame_4'] }, 50, { effects: [{ give: 'frame_4' }] }),
  n('att.after', 'attendant', { scene: 'subway_int', all: ['frame_4'] }),
  n('att.dawn', 'attendant', { phase: DAWN, none: ['group_photo_done'] }),
  n('att.bus', 'attendant', { phase: DAWN, all: ['bus_arrived'], none: ['ending_A', 'ending_B'] }, 100, {
    noFixedOptions: true,
    choices: [
      { key: 'txt.choice.board', actions: [{ set: 'ending_A' }] },
      { key: 'txt.choice.stay', actions: [{ set: 'ending_B' }] },
    ],
  }),

  // ---------------------------------------------------------------- §11.11 老周的语音 ({memo:n} / wx memo bubble)
  cut('memo_1', 'lao_zhou'), cut('memo_2', 'lao_zhou'), cut('memo_3', 'lao_zhou'),

  // ---------------------------------------------------------------- §9 P3 门禁 (owner 'gate')
  // gate.prompt keeps the fixed options: 「出示照片…」 opens the two-photo picker for receiver 'gate'
  { id: 'gate.prompt', owner: 'gate', when: {}, prio: 0 },
  cut('gate.noface', 'gate'), cut('gate.other', 'gate'), cut('gate.one', 'gate'),
  cut('gate.both_open', 'gate'), cut('gate.both_closed', 'gate'),
  // P3r3 T1: 我's line follows the verdict (show() sets P3_done before it starts gate.pass, so an fx node queued first)
  cut('gate.pass', 'gate', { effects: [{ node: 'me.p3' }] }),

  // ---------------------------------------------------------------- §9 P2 SMS, §7.1 note and envelope
  cut('sms.garbled', 'system'), cut('sms.full', 'system'), cut('note.dad', 'system'), cut('note.envelope', 'system'),

  // ---------------------------------------------------------------- §11.13 object texts
  obj('it.bus_sign', 'it_bus_sign'), obj('it.bench', 'it_bench'), obj('it.boat', 'it_boat'),
  obj('it.zhouji_tile', 'it_zhouji_tile'), obj('it.locker', 'it_locker'), obj('it.locker_empty', 'it_locker'),
  obj('it.manhole_day', 'it_manhole'), obj('it.manhole_night', 'it_manhole'), obj('it.mirror', 'it_mirror'),
  obj('it.cathole', 'it_cathole'), obj('it.studio_shutter', 'it_studio_shutter'),
  obj('it.milkbox_locked', 'it_milkbox'), obj('it.milkbox', 'it_milkbox'), obj('it.fire_ladder', 'it_fire_ladder'),
  obj('it.roof_tv', 'it_roof_tv'), obj('it.coop_small', 'it_coop'), obj('it.coop_empty', 'it_coop'),
  obj('it.water_tank', 'it_water_tank'), obj('it.temple_idol', 'it_temple_idol'),
  obj('it.temple_idol_face', 'it_temple_idol'), obj('it.lion', 'it_lion'), obj('it.banyan', 'it_banyan'),
  obj('it.roadwork', 'it_roadwork'), obj('it.tide', 'it_tide'), obj('it.fish_tank', 'it_fish_tank'),
  obj('it.paper_rule', 'it_paper_rule'), obj('it.paper_phone', 'it_paper_phone'),
  obj('it.subway_gate', 'it_subway_gate'), obj('it.pipes', 'it_pipes'), obj('it.plaque', 'it_plaque'),
  obj('it.lh_door', 'it_lh_door'), obj('it.gantry', 'it_gantry'), obj('it.bus_door', 'it_bus_door'),
  obj('it.st_wall', 'it_st_wall'), obj('it.st_wall_night', 'it_st_wall'), obj('it.st_wall_after', 'it_st_wall'),
  obj('it.st_doorframe', 'it_st_doorframe'), obj('it.st_cabinet', 'it_st_cabinet'),
  obj('it.st_cabinet_again', 'it_st_cabinet'), obj('it.st_poster', 'it_st_poster'),
  obj('it.st_backdrop', 'it_st_backdrop'), obj('it.dk_phone', 'it_dk_phone'), obj('it.dk_phone_again', 'it_dk_phone'),
  obj('it.dk_bench', 'it_dk_bench'), obj('it.dk_bench_done', 'it_dk_bench'),

  // ---------------------------------------------------------------- §12 show reactions + fallbacks
  cut('show.xiaolin.granny', 'xiaolin'), cut('show.xiaolin.mirror', 'xiaolin'), cut('show.xiaolin.height', 'xiaolin'),
  cut('show.xiaolin.zhe', 'xiaolin'), cut('show.xiaolin.tudi', 'xiaolin'), cut('show.xiaolin.trail', 'xiaolin'),
  cut('show.granny.height', 'granny_wang'), cut('show.granny.mirror', 'granny_wang'),
  cut('show.granny.door403', 'granny_wang'), cut('show.granny.cat', 'granny_wang'),
  cut('show.granny.face', 'granny_wang'), cut('show.granny.2006', 'granny_wang'),
  cut('show.granny.2006_after', 'granny_wang'),
  cut('show.chen.2006', 'old_chen'), cut('show.chen.trail', 'old_chen'), cut('show.chen.plaque', 'old_chen'),
  cut('show.chen.boat', 'old_chen'),
  cut('show.liu.zhe', 'xiaoliu'), cut('show.liu.chai', 'xiaoliu'), cut('show.liu.hoarding', 'xiaoliu'),
  cut('show.zhimei.2006', 'zhimei'), cut('show.tudi.2011', 'tudi'), cut('show.tudi.photo', 'tudi'),
  cut('show.att.height', 'attendant'),
  cut('show.xiaolin.any', 'xiaolin'), cut('show.granny.any', 'granny_wang'), cut('show.chen.any', 'old_chen'),
  cut('show.liu.any', 'xiaoliu'), cut('show.tudi.any', 'tudi'), cut('show.meiqiu.any', 'meiqiu'),
  cut('show.zhimei.any', 'zhimei'), cut('show.zhimei.any_eye', 'zhimei'), cut('show.chai.any', 'chai'),
  cut('show.att.any', 'attendant'),
];
