// src/core/fonts.ts — owner: S. FROZEN. Font stacks (ART §8.3) and the boot font warm-up (§2.8.11). Never throws.
import { CARDS, DLG, STR, WX_TEXT } from '../data/zh';

export const FONT = {
  display: '"ZCOOL QingKe HuangYou", "WenQuanYi Zen Hei", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  body: '"ZCOOL KuaiLe", "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  hand: '"Long Cang", "ZCOOL KuaiLe", "Kaiti SC", "STKaiti", "KaiTi", cursive',
  brush: '"Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif',
  hud: '"Silkscreen", "Courier New", monospace',
  sign: '"WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", sans-serif',
} as const;

export const HUD_GLYPHS = '0123456789:%×RECISOF.';

function uniqueChars(s: string): string { return [...new Set([...s])].join(''); }

/** Every player-facing string the zh barrel knows (for warming the body font's unicode-range slices). */
export function allText(): string {
  const parts: string[] = [...Object.values(STR)];
  for (const lines of Object.values(DLG)) for (const l of lines ?? []) parts.push(l[1]);
  for (const lines of Object.values(WX_TEXT)) parts.push(...(lines ?? []));
  return uniqueChars(parts.join(''));
}
export function titleText(): string {
  return uniqueChars(['ui.title', 'ui.subtitle', 'ui.start', 'ui.continue', 'ui.settings'].map((k) => STR[k] ?? '').join(''));
}
export function cardText(): string {
  const chapters = Object.keys(STR).filter((k) => k.startsWith('ch.')).map((k) => STR[k]).join('');
  return uniqueChars(Object.values(CARDS).map((c) => `${c.title}${c.subtitle ?? ''}${c.body ?? ''}${c.seal ?? ''}`).join('') + chapters + titleText());
}

/** Handwriting (Long Cang) text: memo clues/items, note popups, album captions and the group-photo caption
 *  (Phase 2, requests-E #1: warm it so the first memo open does not swap fonts). */
export function handText(): string {
  const pre = ['clue.', 'item.', 'ui.memo.', 'obj.', 'lbl.ph_'];
  const parts = Object.keys(STR).filter((k) => pre.some((p) => k.startsWith(p))).map((k) => STR[k] ?? '');
  for (const [k, lines] of Object.entries(DLG)) if (k.startsWith('note.')) for (const l of lines ?? []) parts.push(l[1]);
  parts.push(CARDS.ph_2026_group?.title ?? '');
  return uniqueChars(parts.join(''));
}

export function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** Load the exact glyphs of `text` in `font`; false on timeout/offline (the fallback font is used). */
export async function ensureFont(font: string, text: string, timeoutMs = 3000): Promise<boolean> {
  try {
    if (typeof document === 'undefined' || !document.fonts) return false;
    const faces = await Promise.race([document.fonts.load(font, text), sleep(timeoutMs).then(() => [] as FontFace[])]);
    return faces.length > 0;
  } catch { return false; }
}

/** Boot warm-up: at most 3 s, never throws. Canvas text must be baked only after this resolves. */
export async function warmFonts(timeoutMs = 3000): Promise<void> {
  try {
    if (typeof document === 'undefined' || !document.fonts) return;
    const loads = Promise.all([
      document.fonts.load('26px "ZCOOL KuaiLe"', allText()),
      document.fonts.load('132px "ZCOOL QingKe HuangYou"', titleText()),
      document.fonts.load('64px "Ma Shan Zheng"', cardText()),
      document.fonts.load('16px Silkscreen', HUD_GLYPHS),
      document.fonts.load('22px "Long Cang"', handText()),
    ]).catch(() => undefined);
    await Promise.race([loads, sleep(timeoutMs)]);
  } catch { /* never throws */ }
}
