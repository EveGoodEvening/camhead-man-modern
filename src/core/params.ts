// src/core/params.ts — owner: S. FROZEN. URL parameters: GDD §19.1 + ARCHITECTURE §2.10.
import type { UrlParams } from '../contracts';
import type { ChapterId, FlagId, Phase, SpotId } from '../types';
import { SPOT_IDS } from '../data/ids/spots';
import { FLAG_IDS } from '../data/ids/story';

export const CHAPTER_IDS: readonly ChapterId[] = ['prologue', 'ch1', 'ch2', 'ch3', 'finale'];
export const PHASES: readonly Phase[] = ['day', 'dusk', 'night', 'dawn'];
export const BESTIARY_IDS = [
  'bst_second_shadow', 'bst_manhole_eye', 'bst_queue_shadows', 'bst_lion_turns', 'bst_tv_still_on', 'bst_fish_watching',
] as const;

export function isSpotId(s: string): s is SpotId { return (SPOT_IDS as readonly string[]).includes(s); }
export function isFlagId(s: string): s is FlagId {
  return (FLAG_IDS as readonly string[]).includes(s) || (BESTIARY_IDS as readonly string[]).includes(s) || s.startsWith('seen:');
}
export function isChapterId(s: string): s is ChapterId { return (CHAPTER_IDS as readonly string[]).includes(s); }
export function isPhase(s: string): s is Phase { return (PHASES as readonly string[]).includes(s); }

/** A bare flag (`?test`) or any value other than 0/false counts as on. */
function flag(q: URLSearchParams, k: string): boolean {
  if (!q.has(k)) return false;
  const v = q.get(k);
  return v !== '0' && v !== 'false';
}

export interface ParsedParams { params: UrlParams; warnings: string[] }

export function parseParams(search: string): ParsedParams {
  const q = new URLSearchParams(search);
  const warnings: string[] = [];
  const seedRaw = Number(q.get('seed') ?? '1');
  const chapterRaw = q.get('chapter');
  const phaseRaw = q.get('phase');
  const atRaw = q.get('at');
  const dprRaw = q.get('dpr');
  const flags: FlagId[] = [];
  for (const f of (q.get('flags') ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (isFlagId(f)) flags.push(f); else warnings.push(`unknown flag ${f}`);
  }
  const chapter = chapterRaw && isChapterId(chapterRaw) ? chapterRaw : null;
  if (chapterRaw && !chapter) warnings.push(`unknown chapter ${chapterRaw}`);
  const phase = phaseRaw && isPhase(phaseRaw) ? phaseRaw : null;
  if (phaseRaw && !phase) warnings.push(`unknown phase ${phaseRaw}`);
  const at = atRaw && isSpotId(atRaw) ? atRaw : null;
  if (atRaw && !at) warnings.push(`unknown spot ${atRaw}`);
  const dpr = dprRaw !== null && Number.isFinite(Number(dprRaw)) && Number(dprRaw) > 0 ? Number(dprRaw) : null;
  const params: UrlParams = {
    test: flag(q, 'test'),
    seed: Number.isFinite(seedRaw) ? Math.floor(seedRaw) : 1,
    skipTitle: flag(q, 'skipTitle'),
    chapter, phase, at, flags,
    mute: flag(q, 'mute'),
    lowfx: flag(q, 'lowfx'),
    dpr,
    save: q.get('save') === '1' || q.get('save') === 'true',
    fly: flag(q, 'fly'),
    debug: flag(q, 'debug'),
    dev: q.get('dev'),
  };
  return { params, warnings };
}
