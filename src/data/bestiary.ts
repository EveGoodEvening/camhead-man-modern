// src/data/bestiary.ts — owner D (GDD §14). The lens awards an entry on the first green shot of its target.
import type { BestiaryDef, BestiaryId, TargetId } from '../types';

const row = (id: BestiaryId, target: TargetId): BestiaryDef => ({
  id, nameKey: `bst.${id}.name`, whereKey: `bst.${id}.where`, bodyKey: `bst.${id}.body`, target,
});

export const BESTIARY: readonly BestiaryDef[] = [
  row('bst_second_shadow', 'T_bst_second_shadow'),
  row('bst_manhole_eye', 'T_bst_manhole_eye'),
  row('bst_queue_shadows', 'T_bst_queue_shadows'),
  row('bst_lion_turns', 'T_bst_lion_turns'),
  row('bst_tv_still_on', 'T_bst_tv_still_on'),
  row('bst_fish_watching', 'T_bst_fish_watching'),
];
