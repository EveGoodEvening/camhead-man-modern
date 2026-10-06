// src/data/show.ts — owner F. GDD §12 show reactions (first matching row per receiver wins; any shared tag matches),
// the per-receiver fallback lines, and the §9 P3 gate verdict outcomes (E classifies two photos into a GateVerdict).
import type { GateOutcome, GateVerdict, ShowFallbackRow, ShowReaction } from '../types';

const P8: ShowReaction['when'] = { all: ['P8_done'] };
const NOT_P8: ShowReaction['when'] = { none: ['P8_done'] };

export const SHOW_REACTIONS: readonly ShowReaction[] = [
  // 小林
  { receiver: 'xiaolin', tags: ['granny_face_open', 'granny_face_closed'], node: 'show.xiaolin.granny' },
  { receiver: 'xiaolin', tags: ['mirror_selfie'], node: 'show.xiaolin.mirror' },
  { receiver: 'xiaolin', tags: ['height_marks'], node: 'show.xiaolin.height' },
  { receiver: 'xiaolin', tags: ['zhe_photo'], node: 'show.xiaolin.zhe' },
  { receiver: 'xiaolin', tags: ['tudi_photo'], node: 'show.xiaolin.tudi' },
  { receiver: 'xiaolin', tags: ['trail_1987'], node: 'show.xiaolin.trail' },
  // 王阿婆 (height_marks before name_known also files her 「周远」 under the clues)
  { receiver: 'granny_wang', tags: ['height_marks'], when: { none: ['name_known'] }, node: 'show.granny.height',
    actions: [{ clue: 'clue_granny_name' }] },
  { receiver: 'granny_wang', tags: ['height_marks'], node: 'show.granny.height' },
  { receiver: 'granny_wang', tags: ['mirror_selfie'], node: 'show.granny.mirror' },
  { receiver: 'granny_wang', tags: ['door_403'], node: 'show.granny.door403' },
  { receiver: 'granny_wang', tags: ['cat_meiqiu'], node: 'show.granny.cat' },
  { receiver: 'granny_wang', tags: ['granny_face_open', 'granny_face_closed'], node: 'show.granny.face' },
  { receiver: 'granny_wang', tags: ['rephoto_2006', 'ph_2006_group'], when: P8, node: 'show.granny.2006_after' },
  { receiver: 'granny_wang', tags: ['rephoto_2006', 'ph_2006_group'], when: NOT_P8, node: 'show.granny.2006' },
  // 老陈
  { receiver: 'old_chen', tags: ['rephoto_2006', 'ph_2006_group'], node: 'show.chen.2006' },
  { receiver: 'old_chen', tags: ['trail_1987'], node: 'show.chen.trail' },
  { receiver: 'old_chen', tags: ['plaque'], node: 'show.chen.plaque' },
  { receiver: 'old_chen', tags: ['lm:boat'], node: 'show.chen.boat' },
  // 小刘
  { receiver: 'xiaoliu', tags: ['zhe_photo'], node: 'show.liu.zhe' },
  { receiver: 'xiaoliu', tags: ['chai_photo'], node: 'show.liu.chai' },
  { receiver: 'xiaoliu', tags: ['lm:hoarding'], node: 'show.liu.hoarding' },
  // 纸妹: the sea photo completes P9 (zhimei.done gives frame_2 → rule sets P9_done)
  { receiver: 'zhimei', tags: ['zhimei_sea'], when: { all: ['zhimei_eye'], none: ['frame_2'] }, node: 'zhimei.done' },
  // P3 G7: her own sea photo again after P9 must not fall through to 「不是这张。」
  { receiver: 'zhimei', tags: ['zhimei_sea'], when: { phase: ['dawn'], all: ['frame_2'] }, node: 'zhimei.dawn' },
  { receiver: 'zhimei', tags: ['zhimei_sea'], when: { all: ['frame_2'] }, node: 'zhimei.after' },
  { receiver: 'zhimei', tags: ['rephoto_2006', 'ph_2006_group'], node: 'show.zhimei.2006' },
  // 土地
  { receiver: 'tudi', tags: ['rephoto_2011', 'ph_temple_2011'], node: 'show.tudi.2011' },
  { receiver: 'tudi', tags: ['tudi_photo'], node: 'show.tudi.photo' },
  // 站务员
  { receiver: 'attendant', tags: ['height_marks'], node: 'show.att.height' },
];

/** GDD §12 通用台词: first row whose `when` holds (zhimei has a before/after-eye pair). */
export const SHOW_FALLBACK: readonly ShowFallbackRow[] = [
  { receiver: 'xiaolin', node: 'show.xiaolin.any' },
  { receiver: 'granny_wang', node: 'show.granny.any' },
  { receiver: 'old_chen', node: 'show.chen.any' },
  { receiver: 'xiaoliu', node: 'show.liu.any' },
  { receiver: 'tudi', node: 'show.tudi.any' },
  { receiver: 'meiqiu', node: 'show.meiqiu.any' },
  { receiver: 'zhimei', when: { all: ['zhimei_eye'] }, node: 'show.zhimei.any_eye' },
  { receiver: 'zhimei', node: 'show.zhimei.any' },
  { receiver: 'chai', node: 'show.chai.any' },
  { receiver: 'attendant', node: 'show.att.any' },
  { receiver: 'gate', node: 'gate.noface' },
];

/** GDD §9 P3 verdict precedence (E classifies): only granny_face_* tags count as her face. */
export const GATE_OUTCOMES: Readonly<Record<GateVerdict, GateOutcome>> = {
  noface: { node: 'gate.noface' },
  other: { node: 'gate.other' },
  one: { node: 'gate.one', actions: [{ set: 'gate_face_ok' }] },
  both_open: { node: 'gate.both_open' },
  both_closed: { node: 'gate.both_closed' },
  pass: { node: 'gate.pass', actions: [{ set: 'P3_done' }] },
};
