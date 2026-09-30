// src/core/layers.ts — owner: S. FROZEN. Render layers and surface-id ranges (ARCHITECTURE §2.3, ART §4.3).
import type { Object3D } from 'three';

/** HERO_FP (5, Phase 2 / requests-C #1): C's first-person phone head. Only the mirror LiveView may see it; the main
 *  camera and `render.capture()` must never enable it, and no other owner may use it. */
export const LAYER = { WORLD: 0, GHOST: 2, PAST: 3, PHOTO_ONLY: 4, HERO_FP: 5 } as const;
export type LayerId = (typeof LAYER)[keyof typeof LAYER];

/** Surface-id ranges per owner (inclusive). 0 and 255 are reserved. */
export const SURFACE = {
  ENV: [1, 199], TITLE_DRESSING: [190, 199], HERO: [200, 209], NPC: [210, 229], INTERACTABLE: [230, 239],
  SPIRIT_OBJECT: [240, 244], SPIRIT_CHAR: [245, 254],
} as const;
export const SURFACE_RESERVED = [0, 255] as const;
/** First id of the spirit-ink range (240–254 are drawn with spirit ink). */
export const SPIRIT_INK_MIN = 240;

/** Set exactly one layer on an object and all its descendants. */
export function setLayerDeep(obj: Object3D, layer: number): void {
  obj.traverse((o) => { o.layers.set(layer); });
}
