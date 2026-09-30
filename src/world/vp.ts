// src/world/vp.ts — owner B. GDD §5.4 ‡† vp_temple_2011 construction: a point on the hill slope (outside the plateau)
// from which the 3× lens aimed at the idol centre shows the left lion head at NDC x ≈ −0.6, |y| ≤ 0.3, lion ≥ 2.5 m away.
import { PerspectiveCamera, Vector3 } from 'three';
import { SURFACES, chartToWorld, dirToHeading, frameAt } from '../core/planet';
import type { ChartPos } from '../types';
import { hillH } from './heights';
import { fl } from './geo';
import { TEMPLE } from './layout';

export const LENS_H = 1.72;
export const ZOOM3_VFOV = 20;
export const LION_HEAD_H = 4.8;

export interface VpResult { pos: ChartPos; yaw: number; pitch: number; ndc: { x: number; y: number }; lionDist: number }

/** Project the lion head from a slope point (r, lon) with the lens aimed at the idol centre. */
export function evalVp(r: number, lon: number, aspect = 16 / 9): VpResult {
  const p = fl(r, lon);
  const h = hillH(p.x, p.z) ?? 0;
  const eye = chartToWorld({ r, lon, h: h + LENS_H });
  const idol = chartToWorld({ r: TEMPLE.idol.r, lon: TEMPLE.idol.lon, h: TEMPLE.idol.h });
  const lion = chartToWorld({ r: TEMPLE.lionL.r, lon: TEMPLE.lionL.lon, h: LION_HEAD_H });
  const cam = new PerspectiveCamera(ZOOM3_VFOV, aspect, 0.1, 100);
  const f = frameAt(SURFACES.planet, chartToWorld({ r, lon, h }));
  cam.position.copy(eye);
  cam.up.copy(f.up);
  cam.lookAt(idol);
  cam.updateMatrixWorld(true);
  const q = lion.clone().project(cam);
  const d = idol.clone().sub(eye);
  const vert = d.dot(f.up), horiz = d.clone().addScaledVector(f.up, -vert);
  const hLen = horiz.length();                      // before normalize(): the pitch needs the real horizontal run
  return {
    pos: { r, lon, h },
    yaw: dirToHeading(f, horiz.normalize()),
    pitch: (Math.atan2(vert, hLen || 1e-6) * 180) / Math.PI,
    ndc: { x: q.x, y: q.y },
    lionDist: lion.distanceTo(eye),
  };
}

/** Grid search nearest to the GDD approximation (7.6, 143.5). */
export function computeVpTemple(): VpResult {
  let best: VpResult | null = null, bestScore = Infinity;
  const approx = fl(7.6, 143.5);
  for (let r = 6.4; r <= 11; r += 0.05) {
    for (let lon = 120; lon <= 170; lon += 0.25) {
      const v = evalVp(r, lon);
      if (v.lionDist < 2.5 || Math.abs(v.ndc.y) > 0.3) continue;
      const p = fl(r, lon);
      const score = (v.ndc.x + 0.6) ** 2 * 400 + Math.hypot(p.x - approx.x, p.z - approx.z) * 0.05;
      if (score < bestScore) { bestScore = score; best = v; }
    }
  }
  return best ?? evalVp(7.6, 143.5);
}

export { Vector3 };
