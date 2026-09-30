// src/story/bootTuts.ts — owner F (P3r3 open-play c). A ?chapter= boot (or the chapter menu) drops the player into
// the middle of the game: the tutorials a real run has finished by then are marked done, so a ch2 boot does not teach
// 「按 [E] 调查」 or 「Esc 暂停」 again (golden / chapter captures showed both on every chapter).
import type { ChapterId, FlagId, TutId } from '../types';

/** Tutorials done by the START of each chapter in a normal run (GDD §11.14 triggers). */
const DONE_BY: Readonly<Record<ChapterId, readonly TutId[]>> = {
  prologue: [],
  // P1 (the prologue's rephoto) completes the first-minute bubbles
  ch1: ['tut_move', 'tut_phone', 'tut_setref', 'tut_view', 'tut_shutter', 'tut_overlay'],
  // ch1: 「Esc 暂停」 at its start, the locker's 3× zoom, the gate 出示, 王阿婆's burst
  ch2: ['tut_menu', 'tut_zoom', 'tut_show', 'tut_burst'],
  // ch2: P4 night view, P5 coop (摘头 + flash)
  ch3: ['tut_night', 'tut_detach', 'tut_flash'],
  finale: [],
};
const ORDER: readonly ChapterId[] = ['prologue', 'ch1', 'ch2', 'ch3', 'finale'];

/** `seen:*` flags a boot into chapter `c` starts with (pure). The first E is taught in the prologue. */
export function chapterSeenFlags(c: ChapterId): FlagId[] {
  const k = ORDER.indexOf(c);
  if (k <= 0) return [];
  // P3r3 U2: the incense badge's intro bubble (ui/hud/wayfinder.ts) shows during the prologue's walk to P1
  const out: FlagId[] = ['seen:tut_interact', 'seen:ui_way_intro'];
  for (let i = 1; i <= k; i++) for (const id of DONE_BY[ORDER[i]]) out.push(`seen:${id}`);
  return out;
}
