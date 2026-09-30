// src/data/ids/story.ts — owner F (seeded by S from GDD §10.2 / §11 / §11.12 / §7.3 / §10.6 / §11.13).
// Append-only: never rename or delete an id.

/** Story flags (GDD §10.2 + §18.2 union + ARCHITECTURE §3.F darkroom flags). Bestiary flags live in types.ts. */
export const FLAG_IDS = [
  'game_started', 'wx_tudi_added', 'P1_done', 'ch1_started', 'met_xiaolin', 'met_granny', 'met_chen',
  'studio_locked_seen', 'locker_seen', 'sms_full', 'P2_done', 'memo_1_heard', 'height_marks_seen',
  'film_at_tudi', 'granny_asked_photo', 'gate_face_ok', 'P3_done', 'ch2_started',
  'roadwork_cleared', 'tide_out', 'idol_scanned', 'P4_done', 'tudi_met', 'mirror_selfie',
  'P5_started', 'door403_found', 'key_rooftop', 'on_roof_once', 'meiqiu_talked', 'pigeons_gone',
  'frame_1', 'P5_done', 'ch3_started', 'plaque_read', 'trail_1987', 'lighthouse_open', 'frame_3',
  'P6_done', 'subway_entered', 'name_known', 'memo_2_heard', 'gantry_open', 'frame4_registered',
  'frame_4', 'P7_done', 'P8_done', 'faces_restored', 'dot_taken', 'zhimei_eye', 'zhimei_at_seawall',
  'frame_2', 'P9_done', 'all_frames', 'developed', 'memo_3_heard', 'finale_started',
  'group_photo_done', 'bus_arrived', 'ending_A', 'ending_B', 'credits_done',
  // ARCHITECTURE §3.F: darkroom trays are interacts gated by these flags
  'dk_tray_1', 'dk_tray_2', 'dk_tray_3', 'dk_hung',
  // F additions: darkroom safelight on (the first E at dk_bench, GDD S_darkroom step 1)
  'dk_lit',
] as const;
export type StoryFlagId = (typeof FLAG_IDS)[number];

/** Dialogue nodes: every GDD §11 heading, the §11.11 voice memos, and the P3 gate outcomes. */
export const NODE_IDS = [
  'me.wake', 'me.p1', 'me.p2', 'me.height', 'me.memo1', 'me.p3', 'me.mirror', 'me.frame3', 'me.name', 'me.zhe',
  'me.developed', 'me.group_ready', 'me.group_done',
  'xiaolin.first', 'xiaolin.studio', 'xiaolin.signal', 'xiaolin.after_p2', 'xiaolin.day_idle', 'xiaolin.dusk_idle',
  'xiaolin.night_idle', 'xiaolin.night_name', 'xiaolin.night_zhe', 'xiaolin.night_idle2', 'xiaolin.dawn',
  'xiaolin.group_start', 'xiaolin.group_retry',
  'granny.first', 'granny.ask_photo', 'granny.ask_repeat', 'granny.after_photo', 'granny.day_idle',
  'granny.dusk_wait', 'granny.dusk_coop', 'granny.dusk_coop_repeat', 'granny.dusk_key', 'granny.night_idle',
  'granny.night_name', 'granny.window_cut', 'granny.window', 'granny.window_idle', 'granny.dawn',
  'granny.group_after',
  'chen.first', 'chen.boat', 'chen.dusk_pier', 'chen.night_bench', 'chen.after_frame3', 'chen.night_name',
  'chen.idle', 'chen.dawn',
  'liu.day', 'liu.dusk', 'liu.night_hint', 'liu.night_name', 'liu.night_after', 'liu.night_idle', 'liu.dawn',
  'tudi.after_p4', 'tudi.dusk_mirror', 'tudi.dusk_cat', 'tudi.night', 'tudi.night_zhe', 'tudi.dawn',
  'meiqiu.plain', 'meiqiu.roof', 'meiqiu.roof_after', 'meiqiu.night', 'meiqiu.dawn',
  'zhimei.plain', 'zhimei.dusk', 'zhimei.night_pre', 'zhimei.night_wait', 'zhimei.night_dot', 'zhimei.eye',
  'zhimei.seawall', 'zhimei.done', 'zhimei.after', 'zhimei.dawn',
  'chai.day', 'chai.night_first', 'chai.night', 'chai.after', 'chai.dawn',
  'att.first', 'att.wrong', 'att.named', 'att.gantry_repeat', 'att.platform', 'att.registered', 'att.after',
  'att.dawn', 'att.bus',
  'memo_1', 'memo_2', 'memo_3',
  // GDD §9 P3 gate verdicts (GATE_OUTCOMES)
  'gate.noface', 'gate.other', 'gate.one', 'gate.both_open', 'gate.both_closed', 'gate.pass',
  // ---- F additions (append-only) ----
  // gate prompt (owner 'gate'), phone texts, notes, the dusk hoarding line (GDD §9 P2/P3, §7.1, §11.9)
  'gate.prompt', 'sms.garbled', 'sms.full', 'note.dad', 'note.envelope', 'chai.dusk',
  // GDD §11.13 object texts (owner = the InteractId)
  'it.bus_sign', 'it.bench', 'it.boat', 'it.zhouji_tile', 'it.locker', 'it.locker_empty', 'it.manhole_day',
  'it.manhole_night', 'it.mirror', 'it.cathole', 'it.studio_shutter', 'it.milkbox_locked', 'it.milkbox',
  'it.fire_ladder', 'it.roof_tv', 'it.coop_small', 'it.coop_empty', 'it.water_tank', 'it.temple_idol',
  'it.temple_idol_face', 'it.lion', 'it.banyan', 'it.roadwork', 'it.tide', 'it.fish_tank', 'it.paper_rule',
  'it.paper_phone', 'it.subway_gate', 'it.pipes', 'it.plaque', 'it.lh_door', 'it.gantry', 'it.bus_door',
  'it.st_wall', 'it.st_wall_night', 'it.st_wall_after', 'it.st_doorframe', 'it.st_cabinet', 'it.st_cabinet_again',
  'it.st_poster', 'it.st_backdrop', 'it.dk_phone', 'it.dk_phone_again', 'it.dk_bench', 'it.dk_bench_done',
  // GDD §12 show reactions (SHOW_REACTIONS) and per-receiver fallbacks (SHOW_FALLBACK)
  'show.xiaolin.granny', 'show.xiaolin.mirror', 'show.xiaolin.height', 'show.xiaolin.zhe', 'show.xiaolin.tudi',
  'show.xiaolin.trail', 'show.granny.height', 'show.granny.mirror', 'show.granny.door403', 'show.granny.cat',
  'show.granny.face', 'show.granny.2006', 'show.granny.2006_after', 'show.chen.2006', 'show.chen.trail',
  'show.chen.plaque', 'show.chen.boat', 'show.liu.zhe', 'show.liu.chai', 'show.liu.hoarding', 'show.zhimei.2006',
  'show.tudi.2011', 'show.tudi.photo', 'show.att.height',
  'show.xiaolin.any', 'show.granny.any', 'show.chen.any', 'show.liu.any', 'show.tudi.any', 'show.meiqiu.any',
  'show.zhimei.any', 'show.zhimei.any_eye', 'show.chai.any', 'show.att.any',
] as const;
export type NodeId = (typeof NODE_IDS)[number];

/** GDD §11.12 (wx_hint_* are StrKeys pushed by E, not WxIds). */
export const WX_IDS = [
  'wx_intro', 'wx_rules', 'wx_ch1', 'wx_auto_studio', 'wx_studio_bag', 'wx_dusk', 'wx_idol', 'wx_after_scan',
  'wx_after_p4', 'wx_mirror', 'wx_night', 'wx_name_memo', 'wx_zhe', 'wx_darkroom', 'wx_dawn', 'wx_bst3', 'wx_bst6',
  'wx_endA',
] as const;
export type WxId = (typeof WX_IDS)[number];

/** GDD §7.3 */
export const CLUE_IDS = [
  'clue_rules', 'clue_photo_back', 'clue_sms_garbled', 'clue_sms_full', 'clue_boat_0815', 'clue_empty_bag',
  'clue_height_marks', 'clue_memo_1', 'clue_sticker', 'clue_cat_zhou', 'clue_plaque', 'clue_chen_bench',
  'clue_liu_lamp', 'clue_jingle',
  // F addition: GDD §12 granny + height_marks row (「线索 clue_height_marks 追加「王阿婆：周远」」)
  'clue_granny_name',
] as const;
export type ClueId = (typeof CLUE_IDS)[number];

/** GDD §10.6 */
export const OBJECTIVE_IDS = [
  'obj_p1', 'obj_studio', 'obj_locker', 'obj_studio_enter', 'obj_temple', 'obj_gate', 'obj_p4', 'obj_mirror',
  'obj_coop', 'obj_frames', 'obj_darkroom', 'obj_dawn', 'obj_bus',
] as const;
export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

/** GDD §11.13 rows + the ARCHITECTURE §2.8.14 studio/darkroom objects. */
export const INTERACT_IDS = [
  'it_bus_sign', 'it_bench', 'it_boat', 'it_zhouji_tile', 'it_locker', 'it_manhole', 'it_mirror', 'it_cathole',
  'it_studio_shutter', 'it_estate_gate', 'it_milkbox', 'it_fire_ladder', 'it_roof_tv', 'it_coop', 'it_water_tank',
  'it_temple_idol', 'it_lion', 'it_banyan', 'it_roadwork', 'it_tide', 'it_fish_tank', 'it_paper_rule',
  'it_paper_phone', 'it_hoarding', 'it_subway_gate', 'it_pipes', 'it_bench_pier', 'it_plaque', 'it_lh_door',
  'it_lh_switch', 'it_gantry', 'it_psd', 'it_tripod', 'it_bus_door', 'it_roof_ladder', 'it_st_exit', 'it_sw_exit',
  'it_frame1', 'it_dot',
  'it_st_wall', 'it_st_doorframe', 'it_st_cabinet', 'it_st_poster', 'it_st_backdrop', 'it_dk_phone', 'it_dk_bench',
  'it_dk_tray_brown', 'it_dk_tray_white', 'it_dk_tray_blue',
] as const;
export type InteractId = (typeof INTERACT_IDS)[number];
