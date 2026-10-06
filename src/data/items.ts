// src/data/items.ts — owner F. GDD §7.1 items, §7.2 preset photos (metadata; D renders them), §7.3 clues.
import type { ClueDef, ItemDef, PresetPhotoDef } from '../types';

export const ITEMS: readonly ItemDef[] = [
  { id: 'key_ring', nameKey: 'item.key_ring.name', descKey: 'item.key_ring.desc', icon: 'key' },
  { id: 'note_dad', nameKey: 'item.note_dad.name', descKey: 'item.note_dad.desc', icon: 'note' },
  { id: 'key_rooftop', nameKey: 'item.key_rooftop.name', descKey: 'item.key_rooftop.desc', icon: 'key' },
  { id: 'frame_1', nameKey: 'item.frame_1.name', descKey: 'item.frame_1.desc', icon: 'negative' },
  { id: 'frame_2', nameKey: 'item.frame_2.name', descKey: 'item.frame_2.desc', icon: 'negative' },
  { id: 'frame_3', nameKey: 'item.frame_3.name', descKey: 'item.frame_3.desc', icon: 'negative' },
  { id: 'frame_4', nameKey: 'item.frame_4.name', descKey: 'item.frame_4.desc', icon: 'negative' },
  { id: 'cinnabar_dot', nameKey: 'item.cinnabar_dot.name', descKey: 'item.cinnabar_dot.desc', icon: 'dot' },
  { id: 'envelope_dad', nameKey: 'item.envelope_dad.name', descKey: 'item.envelope_dad.desc', icon: 'envelope' },
];

/** GDD §7.2. Every preset carries a tag equal to its own id (GDD §7.2 last line); D renders and stores them. */
export const PRESET_PHOTOS: readonly PresetPhotoDef[] = [
  // PAST layer from the 周记 tile: 20 simplified neighbours on the south stairs, old store sign, no crane, no 拆;
  // sepia + white border + orange date stamp; faces follow faceState
  { id: 'ph_2006_group', titleKey: 'txt.preset.ph_2006_group', from: 'vp_group_photo', zoom: 1, past: true, sepia: true,
    dateStamp: "'06 8 15", tags: ['ph_2006_group'] },
  // PAST layer at 3× from the left-lion viewpoint: temple-fair lanterns, the idol still has a face, 「3×」 watermark
  { id: 'ph_temple_2011', titleKey: 'txt.preset.ph_temple_2011', from: 'vp_temple_2011', zoom: 3, past: true,
    tags: ['ph_temple_2011'] },
  // darkroom stitch, left→right ④ bus sign + boat │ ③ lower stairs + chalk X │ ② upper stairs + banyan │ ① store sign
  { id: 'ph_2023_stitched', titleKey: 'txt.preset.ph_2023_stitched', from: 'vp_group_photo', zoom: 1,
    tags: ['ph_2023_stitched'] },
  // taken live by the tripod: PHOTO_ONLY layer (周远 with a face, 老周's ghost beside him)
  { id: 'ph_2026_group', titleKey: 'txt.preset.ph_2026_group', from: 'sp_tripod', zoom: 1, photoOnly: true,
    tags: ['ph_2026_group'] },
];

export const CLUES: readonly ClueDef[] = [
  { id: 'clue_rules', textKey: 'clue.clue_rules' },
  { id: 'clue_photo_back', textKey: 'clue.clue_photo_back' },
  { id: 'clue_sms_garbled', textKey: 'clue.clue_sms_garbled' },
  { id: 'clue_sms_full', textKey: 'clue.clue_sms_full' },
  { id: 'clue_boat_0815', textKey: 'clue.clue_boat_0815' },
  { id: 'clue_empty_bag', textKey: 'clue.clue_empty_bag' },
  { id: 'clue_height_marks', textKey: 'clue.clue_height_marks' },
  { id: 'clue_memo_1', textKey: 'clue.clue_memo_1' },
  { id: 'clue_sticker', textKey: 'clue.clue_sticker' },
  { id: 'clue_cat_zhou', textKey: 'clue.clue_cat_zhou' },
  { id: 'clue_plaque', textKey: 'clue.clue_plaque' },
  { id: 'clue_chen_bench', textKey: 'clue.clue_chen_bench' },
  { id: 'clue_liu_lamp', textKey: 'clue.clue_liu_lamp' },
  { id: 'clue_jingle', textKey: 'clue.clue_jingle' },
  { id: 'clue_granny_name', textKey: 'clue.clue_granny_name' },
];
