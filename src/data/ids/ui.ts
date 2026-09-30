// src/data/ids/ui.ts — owner E (seeded by S from GDD §11.14). Append-only: never rename or delete an id.
export const TUT_IDS = [
  'tut_phone', 'tut_setref', 'tut_view', 'tut_overlay', 'tut_zoom', 'tut_burst', 'tut_show', 'tut_night',
  'tut_flash', 'tut_detach', 'tut_hint',
  // P3 round 2 onboarding (appended): first-minute controls taught in context (GDD §11.14)
  'tut_move', 'tut_shutter', 'tut_menu',
] as const;
export type TutId = (typeof TUT_IDS)[number];
