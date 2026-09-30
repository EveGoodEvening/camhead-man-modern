// src/world/trail.ts — owner B. GDD §9 P6 light trail: the writing plane (8 × 3 m, centre by the lighthouse at h 13,
// facing the bench), the 「1987」 stroke canvas (cyan-white #cfe8dc with a 2 px ink edge, hand-written) handed to D via
// anchor('trail_plane').canvas, and the naked-eye light dot running the strokes on a 10 s animT loop (night only).
import { AdditiveBlending, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import type { Core } from '../contracts';
import { makeCanvas } from '../core/canvas';
import { chartToWorld, placeMatrix } from '../core/planet';
import { createRng } from '../core/rng';
import { fl } from './geo';
import { LIGHTHOUSE, PIER, headingToward } from './layout';
import type { PlacesOut } from './build/places';

export const TRAIL = { w: 8, h: 3, hCenter: 13, loop: 10, write: 8 } as const;
type Stroke = readonly (readonly [number, number])[];
/** Digit strokes in cell units (0..1 across, 0..1 down); the canvas lays out 4 cells. */
const DIGITS: Record<string, Stroke[]> = {
  '1': [[[0.35, 0.22], [0.55, 0.08], [0.55, 0.92]]],
  '9': [[[0.72, 0.3], [0.62, 0.1], [0.35, 0.1], [0.22, 0.3], [0.3, 0.5], [0.55, 0.52], [0.72, 0.36], [0.7, 0.62], [0.58, 0.92]]],
  '8': [[[0.62, 0.22], [0.5, 0.08], [0.3, 0.16], [0.32, 0.38], [0.68, 0.6], [0.66, 0.86], [0.45, 0.93], [0.28, 0.82], [0.34, 0.6], [0.66, 0.36], [0.62, 0.22]]],
  '7': [[[0.2, 0.12], [0.78, 0.1], [0.55, 0.45], [0.42, 0.92]]],
};
const ORDER = ['1', '9', '8', '7'];

/** All stroke points in plane-normalised coords (u 0..1 left→right as seen from the bench, v 0..1 top→bottom). */
export function trailPath(): [number, number][] {
  const pts: [number, number][] = [];
  ORDER.forEach((d, i) => {
    for (const s of DIGITS[d]) for (const [x, y] of s) pts.push([0.07 + (i + x) * 0.215, 0.1 + y * 0.8]);
  });
  return pts;
}
/** Position along the 8 s writing (0..1) → plane coords (arc-length parametrised, pen lifts included). */
let cache: { p: [number, number][]; seg: number[] } | null = null;
/** Position along the writing (0..1) → plane coords; the path and its arc lengths are cached and `out` is reused, so
 *  the per-tick trail system allocates nothing (ARCH §5.1). */
export function trailAt(k: number, out: [number, number] = [0, 0]): [number, number] {
  if (!cache) {
    const p = trailPath();
    const seg: number[] = [0];
    for (let i = 1; i < p.length; i++) seg.push(seg[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], (p[i][1] - p[i - 1][1]) * 0.375));
    cache = { p, seg };
  }
  const { p, seg } = cache;
  const L = seg[seg.length - 1], d = Math.min(1, Math.max(0, k)) * L;
  let i = 1;
  while (i < seg.length - 1 && seg[i] < d) i++;
  const t = (d - seg[i - 1]) / Math.max(1e-9, seg[i] - seg[i - 1]);
  out[0] = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
  out[1] = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
  return out;
}

export function trailCanvas(): HTMLCanvasElement {
  const W = 512, H = 192;
  const { canvas, ctx: g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  const rng = createRng(0x1987);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    g.strokeStyle = pass === 0 ? '#2f3a3f' : '#cfe8dc';
    g.lineWidth = pass === 0 ? 11 : 7;
    ORDER.forEach((d, i) => {
      for (const s of DIGITS[d]) {
        g.beginPath();
        s.forEach(([x, y], k) => {
          const px = (0.07 + (i + x) * 0.215) * W + (pass ? 0 : rng.range(-0.6, 0.6)), py = (0.1 + y * 0.8) * H;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        });
        g.stroke();
      }
    });
  }
  return canvas;
}

export function buildTrail(core: Core, out: PlacesOut): void {
  const bench = fl(PIER.bench.r, PIER.bench.lon), tower = fl(LIGHTHOUSE.r, LIGHTHOUSE.lon);
  const face = headingToward(tower, bench);
  out.faceHdg.trail_plane = face;
  const canvas = trailCanvas();
  out.canvases.trail_plane = canvas;
  let fx;
  try { fx = core.services.render.fxScene('planet'); } catch { return; }
  const M = placeMatrix('planet', { r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: TRAIL.hCenter }, face);
  const c = new Vector3(), right = new Vector3(), up = new Vector3(), n = new Vector3();
  M.extractBasis(right, up, n);
  c.setFromMatrixPosition(M);
  // the plane faces the bench: the viewer's right is the plane's local +X
  const dot = new Mesh(new SphereGeometry(0.22, 10, 8), new MeshBasicMaterial({ color: new Color('#e8fff6'), transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }));
  const halo = new Mesh(new SphereGeometry(0.6, 10, 8), new MeshBasicMaterial({ color: new Color('#7ef0c8'), transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
  dot.add(halo);
  dot.visible = false;
  dot.name = 'world:trail_dot';
  fx.add(dot);
  const uv: [number, number] = [0, 0];
  core.loop.addSystem('world:trail', 'world', () => {
    const night = core.store.state.phase === 'night';
    const tt = core.clock.animT % TRAIL.loop;
    dot.visible = night && tt < TRAIL.write;
    if (!dot.visible) return;
    const [u, v] = trailAt(tt / TRAIL.write, uv);
    dot.position.copy(c).addScaledVector(right, (u - 0.5) * TRAIL.w).addScaledVector(up, (0.5 - v) * TRAIL.h).addScaledVector(n, 0.3);
  });
  void chartToWorld;
}
