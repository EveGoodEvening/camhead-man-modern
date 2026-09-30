// src/chars/zhimei.ts — owner C. 纸妹's hop (GDD §5.9 M_zhimei_move): at dusk or night, before 点睛, once the player has
// seen her and then kept her out of the view frustum for > 2 s (within 30 m), she jumps zp1→zp2→zp3→zp4→zp1,
// with the uncanny pulse, a paper rustle and store.setZhimeiSpot. Pure decision + a tiny state holder.
import type { Phase } from '../types';

export const HOP_AFTER = 2;
export const HOP_RANGE = 30;

export interface HopState { seen: boolean; outSince: number | null }
export interface HopInput { t: number; phase: Phase; eye: boolean; atShop: boolean; inView: boolean; dist: number }

/** Returns true when she should hop now (and resets the state). */
export function hopStep(s: HopState, i: HopInput): boolean {
  const active = (i.phase === 'dusk' || i.phase === 'night') && !i.eye && i.atShop && i.dist <= HOP_RANGE;
  if (!active) { s.outSince = null; if (i.dist > HOP_RANGE) s.seen = false; return false; }
  if (i.inView) { s.seen = true; s.outSince = null; return false; }
  if (!s.seen) return false;
  if (s.outSince === null) { s.outSince = i.t; return false; }
  if (i.t - s.outSince > HOP_AFTER) { s.seen = false; s.outSince = null; return true; }
  return false;
}
