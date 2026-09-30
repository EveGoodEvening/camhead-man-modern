// src/chars/faces.ts — owner C. Old-photo FaceState (GDD §5.7): mosaic by day/dusk, blank at night, clear after P8 (and
// at dawn) through a 1.5 s blank → mosaic → clear animation. Pure: no DOM.
import type { FaceState, FlagId, Phase } from '../types';
import type { PhotoLook } from './atlas';

export const FACE_ANIM_SECONDS = 1.5;
export const MOSAIC_CELLS = 6;

export function deriveFaceState(phase: Phase, has: (f: FlagId) => boolean): FaceState {
  if (has('P8_done') || has('faces_restored') || phase === 'dawn') return 'clear';
  return phase === 'night' ? 'blank' : 'mosaic';
}

/** What the portraits show `dt` seconds into the restore animation (null = not animating). */
export function faceLook(state: FaceState, animElapsed: number | null): PhotoLook {
  if (animElapsed !== null && animElapsed < FACE_ANIM_SECONDS) {
    if (animElapsed < 0.5) return 'blank';
    if (animElapsed < 1.0) return { mosaic: MOSAIC_CELLS };
    if (animElapsed < 1.25) return { mosaic: 12 };
    return 'clear';
  }
  if (state === 'clear') return 'clear';
  if (state === 'blank') return 'blank';
  return { mosaic: MOSAIC_CELLS };
}

export function lookKey(l: PhotoLook): string { return typeof l === 'string' ? l : `m${l.mosaic}`; }

/** Blink formula (GDD §9 P3): closed while ((animT − epoch) mod 0.8) ≥ 0.48. */
export function blinkClosed(animT: number, epoch: number): boolean {
  const d = (((animT - epoch) % 0.8) + 0.8) % 0.8;
  return d >= 0.48 - 1e-9;
}
