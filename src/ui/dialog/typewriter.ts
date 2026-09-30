// src/ui/dialog/typewriter.ts — owner E. Pure typewriter timing on sim time (ART §8.2, ARCHITECTURE §3.E item 2).
// 25 ms per character at 'mid'; pauses after , 、 (120 ms), 。！？ (250 ms) and a run of … (400 ms).
import type { Settings } from '../../types';

export const CHAR_MS: Readonly<Record<Settings['textSpeed'], number>> = { fast: 12, mid: 25, slow: 45 };

const SHORT = new Set(['\uFF0C', '\u3001', '\uFF1B', '\uFF1A', ',', ';']);
const LONG = new Set(['\u3002', '\uFF01', '\uFF1F', '!', '?']);
const ELLIPSIS = '…';                                                           // …

/** Seconds (from line start) at which character i becomes visible. Pauses scale with the speed setting. */
export function schedule(text: string, speed: Settings['textSpeed'] = 'mid'): number[] {
  const chars = [...text];
  const base = CHAR_MS[speed] / 1000;
  const k = CHAR_MS[speed] / CHAR_MS.mid;
  const out: number[] = new Array<number>(chars.length);
  let t = 0;
  for (let i = 0; i < chars.length; i++) {
    t += base;
    out[i] = t;
    const c = chars[i], next = chars[i + 1];
    if (i === chars.length - 1) break;
    if (c === ELLIPSIS) { if (next !== ELLIPSIS) t += 0.4 * k; }
    else if (LONG.has(c)) t += 0.25 * k;
    else if (SHORT.has(c)) t += 0.12 * k;
  }
  return out;
}

/** Number of characters visible `elapsed` seconds into the line. */
export function visibleCount(times: readonly number[], elapsed: number): number {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= elapsed + 1e-9) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Total duration of the line in seconds. */
export function duration(times: readonly number[]): number { return times.length ? times[times.length - 1] : 0; }

/** Characters that make the type click (skip spaces and punctuation). */
export function clicks(c: string): boolean {
  return c.trim() !== '' && !SHORT.has(c) && !LONG.has(c) && c !== ELLIPSIS;
}
