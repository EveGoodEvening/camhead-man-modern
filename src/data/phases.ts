// src/data/phases.ts — owner A. GDD §10.3 (wins for morning/dusk/night/dawn) + ART §5.2 / §4.4 presets.
// Colours are sRGB hex. speckCut is the fraction threshold of the composite's per-cell speck hash (0.14° cells), tuned
// so specks/stars read as sparse 2–4 px flecks like the reference (ART's 0.99/0.992/0.985 were for its filtered bake). The composite applies `grade` (multiply) to surfaces; `night` switches the material's
// ART §2.2 / GDD §10.4 moonlit transform; the uncanny overlay is blended with the shifted weight uUncW (ART §2.3).
import type { PaletteDef, PaletteKey } from '../types';

const LINE_FADE_GAME = [30, 110, 0.35] as const;   // ART §4.4 gameplay
const LINE_FADE_OFF = [1e4, 2e4, 1] as const;      // title: no line fade

export const PALETTES: Readonly<Record<PaletteKey, PaletteDef>> = {
  title: {
    key: 'title', skyBase: '#65c1bc', skyCloud: '#6dcac0', cloudCut: 0.6, speck: '#7fd3c8', speckCut: 0.9993,
    moon: null, moonSize: 0, grade: [1, 1, 1], night: false, ink: '#2f3a3f', inkHalo: null, fog: null,
    lineFade: LINE_FADE_OFF, grain: 0.018,
  },
  morning: {
    key: 'morning', skyBase: '#65c1bc', skyCloud: '#f2cfc2', cloudCut: 0.55, speck: null, speckCut: 1,
    moon: null, moonSize: 0, grade: [1.02, 0.98, 0.96], night: false, ink: '#2f3a3f', inkHalo: null,
    fog: { color: '#cfd9cc', near: 40, far: 120, max: 0.28 }, lineFade: LINE_FADE_GAME, grain: 0.018,
  },
  day: {
    key: 'day', skyBase: '#65c1bc', skyCloud: '#9ae4d5', cloudCut: 0.52, speck: '#9ae4d5', speckCut: 0.9988,
    moon: null, moonSize: 0, grade: [1, 1, 1], night: false, ink: '#2f3a3f', inkHalo: null,
    fog: { color: '#9ae4d5', near: 40, far: 120, max: 0.3 }, lineFade: LINE_FADE_GAME, grain: 0.018,
  },
  dusk: {
    key: 'dusk', skyBase: '#c98a74', skyCloud: '#efc193', cloudCut: 0.54, speck: null, speckCut: 1,
    moon: null, moonSize: 0, grade: [1.0, 0.9, 0.82], night: false, ink: '#2f3040', inkHalo: null,
    fog: { color: '#efc193', near: 40, far: 120, max: 0.3 }, lineFade: LINE_FADE_GAME, grain: 0.018,
  },
  night: {
    key: 'night', skyBase: '#22365a', skyCloud: '#34507a', cloudCut: 0.56, speck: '#cfe8dc', speckCut: 0.996,
    moon: '#f3ecd2', moonSize: 0.035, grade: [1, 1, 1], night: true, ink: '#141b20', inkHalo: '#6d8fb0',
    fog: { color: '#22365a', near: 25, far: 100, max: 0.45 }, lineFade: LINE_FADE_GAME, grain: 0.035,
  },
  dawn: {
    key: 'dawn', skyBase: '#9ec9c8', skyCloud: '#f4d6c8', cloudCut: 0.52, speck: null, speckCut: 1,
    moon: null, moonSize: 0, grade: [1.03, 0.98, 0.95], night: false, ink: '#2f3a3f', inkHalo: null,
    fog: { color: '#f4d6c8', near: 40, far: 120, max: 0.3 }, lineFade: LINE_FADE_GAME, grain: 0.018,
  },
};

/** GDD §10.3 uncanny overlay (blended with the shifted weight uUncW, ART §2.3). */
export const UNCANNY_SKY = {
  skyBase: '#16262b', skyCloud: '#3d6b62', cloudCut: 0.5, speck: '#3d6b62', moon: '#d0453b', moonSize: 0.06,
  ink: '#10181a',
} as const;

/**
 * Sky composition per palette (A's addition, not part of PaletteDef):
 * - `cloudFade`: 1 keeps cloud banks low on the local horizon (clouds thin out above ~10° elevation), so the night sky
 *   overhead stays the flat `#22365a` the GDD §19.4 `night_store` top-rows check measures; 0 = clouds everywhere.
 * - `starMinEl`: sine of the lowest elevation where specks/stars may appear (night: 26°, above the 25° top edge of a
 *   level 50° gameplay frame, so stars show when the player looks up).
 * - `speckInk`: 1 in 4 specks drawn in ink (ART §5.2 title preset).
 * - `moonEl` / `moonAz`: moon position in the geographic frame of the sun pole (degrees, azimuth clockwise from north).
 */
export interface SkyStyle { cloudFade: number; starMinEl: number; speckInk: boolean; moonEl: number; moonAz: number }
export const SKY_STYLE: Readonly<Record<PaletteKey, SkyStyle>> = {
  title: { cloudFade: 0, starMinEl: -1, speckInk: true, moonEl: 14, moonAz: 215 },
  morning: { cloudFade: 0, starMinEl: -1, speckInk: false, moonEl: 14, moonAz: 215 },
  day: { cloudFade: 0, starMinEl: -1, speckInk: false, moonEl: 14, moonAz: 215 },
  dusk: { cloudFade: 0.15, starMinEl: -1, speckInk: false, moonEl: 14, moonAz: 215 },
  night: { cloudFade: 1, starMinEl: 0.44, speckInk: false, moonEl: 14, moonAz: 215 },
  dawn: { cloudFade: 0.15, starMinEl: -1, speckInk: false, moonEl: 14, moonAz: 215 },
};
