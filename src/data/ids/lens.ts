// src/data/ids/lens.ts — owner D (seeded by S from GDD §8.1 / §8.3). Append-only: never rename or delete an id.
export const TARGET_IDS = [
  'T_rephoto_2006', 'T_locker17', 'T_studio_qr', 'T_bus_qr', 'T_bike_qr', 'T_granny_face', 'T_portrait_wall',
  'T_height_marks', 'T_temple_qr', 'T_rephoto_2011', 'T_tudi', 'T_mirror_self',
  'T_door_201', 'T_door_202', 'T_door_203', 'T_door_204', 'T_door_301', 'T_door_302', 'T_door_303', 'T_door_304',
  'T_door_401', 'T_door_402', 'T_door_403', 'T_door_404',
  'T_pigeons', 'T_meiqiu', 'T_plaque', 'T_light_trail', 'T_frame3_lamp', 'T_frame4_pit', 'T_chai', 'T_zhimei',
  'T_zhimei_sea', 'T_lighthouse', 'T_sea',
  'T_bst_second_shadow', 'T_bst_manhole_eye', 'T_bst_queue_shadows', 'T_bst_lion_turns', 'T_bst_tv_still_on',
  'T_bst_fish_watching',
] as const;
export type TargetId = (typeof TARGET_IDS)[number];

/** GDD §8.3 scenery label ids (mesh userData.labelId / merged triLabels). */
export const LABEL_IDS = [
  'sky_day', 'sky_night', 'sea', 'road', 'qilou', 'window', 'window_lit', 'ac_unit', 'bike', 'cable', 'street_lamp',
  'cone', 'boxes', 'oden', 'laundry', 'fu', 'rubble', 'pipe', 'paper_horse', 'paper_villa', 'paper_phone', 'incense',
  'lion', 'tree', 'water_tank', 'antenna', 'bench', 'bollard', 'net', 'person', 'person_night', 'self_shoe',
  // P3r3 look L5: dusk / dawn skies, the hill lawn and bushes / pot plants (they all read 「榕树 · 气根」 or 「天空 · 青色」)
  'sky_dusk', 'sky_dawn', 'grass', 'plant',
] as const;
export type LabelId = (typeof LABEL_IDS)[number];
