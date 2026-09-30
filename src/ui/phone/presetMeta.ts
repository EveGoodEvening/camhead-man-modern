// src/ui/phone/presetMeta.ts — owner E. What the album detail says about a PRESET photo (P3 U7). The player never
// took the old prints (2006 group, 2011 temple fair) or the darkroom stitch, so today's clock and lens settings
// (「06:10 · 1× · 普通 · 闪光：关」) are wrong for them: they get their own date (from the print's date stamp) and a
// 「翻拍 · 旧照」 / 「暗房冲洗 · 接片」 line instead. The tripod photo (photoOnly) was really taken now: normal meta.
import type { PresetPhotoDef } from '../../types';

/** 「'06 8 15」 → 「2006.08.15」 (null when the stamp does not parse). */
export function stampDate(stamp: string | undefined): string | null {
  const m = /^'?(\d{2})\s+(\d{1,2})\s+(\d{1,2})$/.exec((stamp ?? '').trim());
  if (!m) return null;
  return `20${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`;
}

export interface PresetMeta {
  /** Replaces the clock under the print ('' = none). */
  caption: string;
  /** zh keys + literal values for the detail row, in order. */
  row: ({ key: string } | { text: string })[];
}

/** null = an ordinary photo (show clock / zoom / mode / flash). */
export function presetMeta(def: PresetPhotoDef | undefined): PresetMeta | null {
  if (!def || def.photoOnly) return null;
  const date = stampDate(def.dateStamp);
  if (def.past) return { caption: date ?? '', row: [{ key: 'ui.album.oldPhoto' }, ...(date ? [{ text: date }] : [])] };
  return { caption: '', row: [{ key: 'ui.album.stitched' }] };
}
