// src/world/p8.ts — owner B. GDD §9 P8 construction rule (拆 − 折 = the dot), computed at init, never hard-coded.
// Pure math + a mask-based glyph diff (node-testable); the canvas measurement lives in glyphs.ts (browser).
import { Matrix4, Vector3 } from 'three';
import type { ChartPos } from '../types';
import { SURFACES, chartToWorld, placeMatrix, worldToFlat } from '../core/planet';
import { SITE } from './layout';

/** Canvas layout shared by the glyph measurement and the chai texture (GDD §6.1: 3.6 m red ring). */
export const GLYPH = { size: 512, fontPx: 318, cx: 256, cy: 262, planeM: 3.6 } as const;

export interface DotPx { cx: number; cy: number; x0: number; y0: number; x1: number; y1: number; count: number }

/**
 * Pixels set in A but not in B, opened by `erode` 3×3 erosions (hinting slivers where 斥 and 斤 differ by a pixel or
 * two vanish; the 丶 survives), then the largest 4-connected blob. Its bbox is grown back by `erode` px.
 */
export function glyphDiff(a: Uint8Array, b: Uint8Array, w: number, h: number, erode = 3): DotPx | null {
  let diff = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) diff[i] = a[i] && !b[i] ? 1 : 0;
  for (let k = 0; k < erode; k++) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      next[i] = diff[i] && diff[i - 1] && diff[i + 1] && diff[i - w] && diff[i + w] && diff[i - w - 1] && diff[i - w + 1] && diff[i + w - 1] && diff[i + w + 1] ? 1 : 0;
    }
    diff = next;
  }
  const seen = new Uint8Array(w * h);
  // the 丶 is a compact blob; shifted stroke outlines (拆 and 折 are designed separately) are long thin slivers
  let best: DotPx | null = null, bestAny: DotPx | null = null;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!diff[s] || seen[s]) continue;
    let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop() as number, x = i % w, y = (i / w) | 0;
      n++; sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && diff[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    const blob: DotPx = { cx: sx / n, cy: sy / n, x0: x0 - erode, y0: y0 - erode, x1: x1 + erode, y1: y1 + erode, count: n };
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const compact = Math.max(bw, bh) / Math.min(bw, bh) <= 2.5 && n / (bw * bh) >= 0.35;
    if (compact && (!best || n > best.count)) best = blob;
    if (!bestAny || n > bestAny.count) bestAny = blob;
  }
  return best ?? bestAny;
}

/** Fallback dot = the one measured in Chromium with the WenQuanYi Zen Hei fallback (used by node tests / no canvas). */
export const DEFAULT_DOT: DotPx = { cx: 368.6, cy: 300.3, x0: 349, y0: 279, x1: 392, y1: 320, count: 628 };   // measured (WenQuanYi 700)

export interface P8Result {
  P: Vector3; D: Vector3; S: Vector3; E0: Vector3; V: Vector3;
  dotSize: number;                // world size of the net patch (m, square side)
  glyphDotSize: number;           // world size of the dot on the glyph plane
  netDot: ChartPos; groundDot: ChartPos; lampFoot: ChartPos;
  shadeRadius: number; occluderRadius: number;
}

/** Chai plane basis: centre, right (viewer's right), up. */
export function chaiBasis(): { c: Vector3; right: Vector3; up: Vector3; normal: Vector3; m: Matrix4 } {
  const m = placeMatrix('planet', { r: SITE.chai.r, lon: SITE.chai.lon, h: SITE.chai.h }, 0);
  const c = new Vector3(), right = new Vector3(), up = new Vector3(), normal = new Vector3();
  m.extractBasis(right, up, normal);
  c.setFromMatrixPosition(m);
  return { c, right: right.normalize(), up: up.normalize(), normal: normal.normalize(), m };
}
/** Canvas pixel → world point on the chai plane. */
export function glyphToWorld(px: number, py: number, out = new Vector3()): Vector3 {
  const { c, right, up } = chaiBasis();
  const k = GLYPH.planeM / GLYPH.size;
  return out.copy(c).addScaledVector(right, (px - GLYPH.size / 2) * k).addScaledVector(up, (GLYPH.size / 2 - py) * k);
}
function flatR(v: Vector3): number { const f = worldToFlat(SURFACES.planet, v); return Math.hypot(f.x, f.z); }
function toChart(v: Vector3, h?: number): ChartPos {
  const f = worldToFlat(SURFACES.planet, v);
  return { r: Math.hypot(f.x, f.z), lon: ((Math.atan2(f.x, f.z) * 180) / Math.PI + 360) % 360, h: h ?? f.h };
}

/** GDD §9 P8 steps 3–5. */
export function constructP8(dot: DotPx = DEFAULT_DOT): P8Result {
  const P = glyphToWorld(dot.cx, dot.cy);
  const E0 = chartToWorld({ r: SITE.E0.r, lon: SITE.E0.lon, h: SITE.E0.h });
  const V = chartToWorld({ r: SITE.V.r, lon: SITE.V.lon, h: SITE.V.h });
  // D: the E0 → P line meets the net surface r = 41 (bisection on the chart radius)
  let lo = 0, hi = 1;
  const tmp = new Vector3();
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    tmp.copy(E0).lerp(P, t);
    if (flatR(tmp) < SITE.netR) lo = t; else hi = t;
  }
  const D = E0.clone().lerp(P, (lo + hi) / 2);
  const S = V.clone().lerp(D, 0.8);
  const glyphDotSize = (Math.max(dot.x1 - dot.x0, dot.y1 - dot.y0) + 6) * (GLYPH.planeM / GLYPH.size);
  const dotSize = glyphDotSize * (E0.distanceTo(D) / E0.distanceTo(P));
  const dChart = toChart(D);
  const sChart = toChart(S);
  return {
    P, D, S, E0, V, dotSize, glyphDotSize,
    netDot: dChart,
    groundDot: { r: dChart.r - 0.6, lon: dChart.lon, h: 0 },
    lampFoot: { r: sChart.r, lon: sChart.lon, h: 0 },
    shadeRadius: 0.28, occluderRadius: 0.45,
  };
}

/** Ray–sphere test (segment a → b against centre c, radius r). */
export function segmentHitsSphere(a: Vector3, b: Vector3, c: Vector3, r: number): boolean {
  const d = b.clone().sub(a), L = d.length();
  d.divideScalar(L);
  const t = Math.max(0, Math.min(L, c.clone().sub(a).dot(d)));
  return a.clone().addScaledVector(d, t).distanceTo(c) <= r;
}
