// src/data/labels.ts — owner D (GDD §8.2 landmark labels, §8.3 scenery labels).
// Scenery keys: 1× / 3× / 10× (null = fall back to the lower tier). A fixed confidence written in the GDD text
// ("骑楼 · 老的 94%") lives in the string itself; the lens strips it. Otherwise the confidence is a deterministic
// hash in 90–99 (or `confidence` when set).
import type { LabelDef, LabelId, StrKey } from '../types';

const tiers = (id: LabelId, n: 1 | 2 | 3, confidence?: number): LabelDef => ({
  id,
  keys: [`lbl.${id}.1`, n >= 2 ? `lbl.${id}.3` : null, n >= 3 ? `lbl.${id}.10` : null],
  ...(confidence !== undefined ? { confidence } : {}),
});

export const SCENERY_LABELS: readonly LabelDef[] = [
  tiers('sky_day', 3),
  tiers('sky_night', 3),
  tiers('sea', 3),
  tiers('road', 3),
  tiers('qilou', 3),
  tiers('window', 3),
  tiers('window_lit', 3),
  tiers('ac_unit', 3),
  tiers('bike', 3),
  tiers('cable', 3),
  tiers('street_lamp', 3),
  tiers('cone', 2),
  tiers('boxes', 3),
  tiers('oden', 2),
  tiers('laundry', 3),
  tiers('fu', 2),
  tiers('rubble', 3),
  tiers('pipe', 2),
  tiers('paper_horse', 2),
  tiers('paper_villa', 3),
  tiers('paper_phone', 3),
  tiers('incense', 3),
  tiers('lion', 3),
  tiers('tree', 3),
  tiers('water_tank', 2),
  tiers('antenna', 2),
  tiers('bench', 3),
  tiers('bollard', 2),
  tiers('net', 2),
  tiers('person', 3),
  tiers('person_night', 3),
  tiers('self_shoe', 2),
  tiers('sky_dusk', 3),
  tiers('sky_dawn', 3),
  tiers('grass', 3),
  tiers('plant', 3),
];

/** GDD §8.2, keyed by lm:* tag (lm:sea comes from the T_sea landmark target). */
export const LANDMARK_LABELS: Readonly<Record<string, StrKey>> = {
  'lm:banyan': 'lbl.lm.banyan',
  'lm:footbridge': 'lbl.lm.footbridge',
  'lm:boat': 'lbl.lm.boat',
  'lm:crane': 'lbl.lm.crane',
  'lm:lighthouse': 'lbl.lm.lighthouse',
  'lm:bus_stop': 'lbl.lm.bus_stop',
  'lm:store': 'lbl.lm.store',
  'lm:studio': 'lbl.lm.studio',
  'lm:hoarding': 'lbl.lm.hoarding',
  'lm:sea': 'lbl.lm.sea',
};
