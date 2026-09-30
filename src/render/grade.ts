// src/render/grade.ts — owner A. Palette presets → composite/material values, 3 s chapter tweens with the cloud cut
// stepped in 3 jumps (ART §5.2), and the uncanny sky/ink overlay weighted by uUncW (ART §2.3). Pure: no WebGL.
import type { PaletteKey } from '../types';
import { PALETTES, SKY_STYLE, UNCANNY_SKY } from '../data/phases';

export type V3 = [number, number, number];

/** Everything the composite and the material read from a palette, in sRGB 0..1 (the composite does no conversion). */
export interface PaletteVals {
  skyBase: V3; skyCloud: V3; cloudCut: number; cloudFade: number;
  speck: V3; speckCut: number; speckInk: number; starMinEl: number;
  moon: V3; moonSize: number; moonEl: number; moonAz: number;
  grade: V3; night: number; ink: V3; inkHalo: V3; halo: number;
  fogColor: V3; fogNear: number; fogFar: number; fogMax: number;
  lineFade: V3; grain: number;
}

export function hexToRgb(hex: string): V3 {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 0, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SPECK_OFF = 2;   // step(2, x) is 0 for every x in 0..1

export function resolvePalette(key: PaletteKey): PaletteVals {
  // P3 G8: an unknown key (hand-edited save) renders as day instead of throwing out of 「继续」
  const k: PaletteKey = key in PALETTES ? key : 'day';
  const p = PALETTES[k], st = SKY_STYLE[k];
  const fog = p.fog;
  return {
    skyBase: hexToRgb(p.skyBase), skyCloud: hexToRgb(p.skyCloud), cloudCut: p.cloudCut, cloudFade: st.cloudFade,
    speck: hexToRgb(p.speck ?? p.skyCloud), speckCut: p.speck ? p.speckCut : SPECK_OFF, speckInk: st.speckInk ? 1 : 0,
    starMinEl: st.starMinEl,
    moon: hexToRgb(p.moon ?? UNCANNY_SKY.moon), moonSize: p.moon ? p.moonSize : 0, moonEl: st.moonEl, moonAz: st.moonAz,
    grade: [p.grade[0], p.grade[1], p.grade[2]], night: p.night ? 1 : 0,
    ink: hexToRgb(p.ink), inkHalo: hexToRgb(p.inkHalo ?? '#6d8fb0'), halo: p.inkHalo ? 1 : 0,
    fogColor: hexToRgb(fog ? fog.color : p.skyCloud), fogNear: fog ? fog.near : 40, fogFar: fog ? fog.far : 120,
    fogMax: fog ? fog.max : 0,
    lineFade: [p.lineFade[0], p.lineFade[1], p.lineFade[2]], grain: p.grain,
  };
}

/** Copy `v` into `out` without allocating (per-frame path). */
let VAL_KEYS: (keyof PaletteVals)[] | null = null;
export function copyVals(v: PaletteVals, out: PaletteVals): PaletteVals {
  VAL_KEYS ??= Object.keys(v) as (keyof PaletteVals)[];
  for (const k of VAL_KEYS) {
    const a = v[k];
    if (Array.isArray(a)) { const o = out[k] as V3; o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; }
    else (out as unknown as Record<string, number>)[k] = a as number;
  }
  return out;
}

export function cloneVals(v: PaletteVals): PaletteVals {
  return {
    ...v, skyBase: [...v.skyBase], skyCloud: [...v.skyCloud], speck: [...v.speck], moon: [...v.moon], grade: [...v.grade],
    ink: [...v.ink], inkHalo: [...v.inkHalo], fogColor: [...v.fogColor], lineFade: [...v.lineFade],
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (o: V3, a: V3, b: V3, k: number): V3 => { o[0] = lerp(a[0], b[0], k); o[1] = lerp(a[1], b[1], k); o[2] = lerp(a[2], b[2], k); return o; };
/** ART §5.2: cloud-cut changes tween in 3 discrete jumps (at k = 1/3, 2/3, 1), so the sky "repaints". */
export function steppedK(k: number): number { return k >= 1 ? 1 : Math.floor(Math.max(0, k) * 3 + 1e-9) / 3; }

/** out = a→b at k ∈ [0,1]. Colours and numbers lerp; cloud cut steps; binary switches flip at the midpoint. */
export function lerpVals(a: PaletteVals, b: PaletteVals, k: number, out: PaletteVals): PaletteVals {
  const ks = steppedK(k), half = k >= 0.5;
  lerp3(out.skyBase, a.skyBase, b.skyBase, k);
  lerp3(out.skyCloud, a.skyCloud, b.skyCloud, k);
  out.cloudCut = lerp(a.cloudCut, b.cloudCut, ks);
  out.cloudFade = lerp(a.cloudFade, b.cloudFade, ks);
  // a side without specks keeps the other side's colour and fades the cut out
  lerp3(out.speck, a.speckCut >= SPECK_OFF ? b.speck : a.speck, b.speckCut >= SPECK_OFF ? a.speck : b.speck, k);
  out.speckCut = lerp(a.speckCut, b.speckCut, ks);
  out.speckInk = half ? b.speckInk : a.speckInk;
  out.starMinEl = lerp(a.starMinEl, b.starMinEl, ks);
  lerp3(out.moon, a.moonSize > 0 ? a.moon : b.moon, b.moonSize > 0 ? b.moon : a.moon, k);
  out.moonSize = lerp(a.moonSize, b.moonSize, k);
  out.moonEl = lerp(a.moonEl, b.moonEl, k); out.moonAz = lerp(a.moonAz, b.moonAz, k);
  lerp3(out.grade, a.grade, b.grade, k);
  out.night = lerp(a.night, b.night, k);
  lerp3(out.ink, a.ink, b.ink, k);
  lerp3(out.inkHalo, a.inkHalo, b.inkHalo, k);
  out.halo = half ? b.halo : a.halo;
  lerp3(out.fogColor, a.fogMax > 0 ? a.fogColor : b.fogColor, b.fogMax > 0 ? b.fogColor : a.fogColor, k);
  out.fogNear = lerp(a.fogMax > 0 ? a.fogNear : b.fogNear, b.fogMax > 0 ? b.fogNear : a.fogNear, k);
  out.fogFar = lerp(a.fogMax > 0 ? a.fogFar : b.fogFar, b.fogMax > 0 ? b.fogFar : a.fogFar, k);
  out.fogMax = lerp(a.fogMax, b.fogMax, k);
  lerp3(out.lineFade, a.lineFade, b.lineFade, k);
  out.grain = lerp(a.grain, b.grain, k);
  return out;
}

const UNC = {
  skyBase: hexToRgb(UNCANNY_SKY.skyBase), skyCloud: hexToRgb(UNCANNY_SKY.skyCloud), speck: hexToRgb(UNCANNY_SKY.speck),
  moon: hexToRgb(UNCANNY_SKY.moon), ink: hexToRgb(UNCANNY_SKY.ink),
};

/** Blend the GDD §10.3 uncanny sky/ink overlay into `v` with the SHIFTED weight w = uUncW (0 at the 0.15 baseline). */
export function applyUncanny(v: PaletteVals, w: number, out: PaletteVals): PaletteVals {
  if (out !== v) copyVals(v, out);
  if (w <= 0) return out;
  const ws = steppedK(w);
  lerp3(out.skyBase, v.skyBase, UNC.skyBase, w);
  lerp3(out.skyCloud, v.skyCloud, UNC.skyCloud, w);
  out.cloudCut = lerp(v.cloudCut, UNCANNY_SKY.cloudCut, ws);
  out.cloudFade = lerp(v.cloudFade, 0, ws);
  lerp3(out.speck, v.speck, UNC.speck, w);
  lerp3(out.moon, v.moonSize > 0 ? v.moon : UNC.moon, UNC.moon, w);
  out.moonSize = lerp(v.moonSize, UNCANNY_SKY.moonSize, w);
  lerp3(out.ink, v.ink, UNC.ink, w);
  return out;
}

/** Palette tween on sim time (chapter changes 3 s; phaseChanged.instant → 0). */
export class PaletteTween {
  key: PaletteKey;
  private from: PaletteVals;
  private to: PaletteVals;
  private t0 = 0;
  private dur = 0;
  private readonly cur: PaletteVals;
  constructor(key: PaletteKey) {
    this.key = key;
    this.from = resolvePalette(key);
    this.to = resolvePalette(key);
    this.cur = resolvePalette(key);
  }
  /** Start a tween to `key` at time t (from wherever the current tween is). */
  set(key: PaletteKey, t: number, seconds: number): void {
    const now = cloneVals(this.value(t));
    this.key = key;
    this.from = now;
    this.to = resolvePalette(key);
    this.t0 = t;
    this.dur = Math.max(0, seconds);
  }
  progress(t: number): number { return this.dur <= 0 ? 1 : Math.min(1, Math.max(0, (t - this.t0) / this.dur)); }
  value(t: number): PaletteVals { return lerpVals(this.from, this.to, this.progress(t), this.cur); }
}
