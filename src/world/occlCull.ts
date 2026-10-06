// src/world/occlCull.ts — owner B. Street-level occlusion rules that core's horizon cull cannot know (ARCH §5.1,
// §6 risk 1). SwiftShader pays for every rasterised fragment even when early-z rejects it, so geometry that is always
// hidden from a low camera must not be drawn at all:
//  • back-fill houses ('far' layer) sit behind the front rows → only drawn when the camera is ≥ 3.2 m above ground;
//  • sector chunks more than CULL_LON° of longitude away from a street-level camera are behind the hill (h 4 + the
//    banyan) and the planet's curvature (a 9 m roof 60 m away is ~22 m below the tangent plane): not drawn either.
// Landmark chunks with their own keys (crane `hp:*`), the hill chunks and the half-planet layers are never touched.
// Runs in the `late` phase after core:cull (which rewrites `visible` every tick), so it only ever hides more.
import type { Core } from '../contracts';
import { PLANET_R } from '../core/planet';
import type { BuiltChunk } from './kit/batch';

/** Minimum lon distance (deg) between a street camera and a whole chunk before the chunk is skipped. */
export const CULL_LON = 50;
/** The rule applies only below this camera height above the base sphere (m) and outside this chart radius (m). */
export const CULL_MAX_CAM_H = 4.2;
export const CULL_MIN_CAM_R = 18;
const FAR_MAX_CAM_H = 3.2;
/** The market shed and the razed site leave the back-fill rows open to view between these longitudes. */
const FAR_OPEN_LON = [172, 282] as const;

interface Span { mesh: BuiltChunk['mesh']; lon: number; half: number; far: boolean }

/** Pure decision (exported for tests): is a chunk spanning lon ± half hidden from a camera at camLon? */
export function sectorHidden(camLon: number, lon: number, half: number, limit = CULL_LON): boolean {
  let d = Math.abs(camLon - lon) % 360;
  if (d > 180) d = 360 - d;
  return d - half > limit;
}

/** Longitude span of a chunk's vertices (null when it reaches the hill, where longitude says nothing). */
export function chunkSpan(ch: BuiltChunk): { lon: number; half: number } | null {
  const pos = ch.mesh.geometry.getAttribute('position');
  const o = ch.mesh.position;
  const lonOf = (i: number): number => {
    const x = pos.getX(i) + o.x, y = pos.getY(i) + o.y, z = pos.getZ(i) + o.z;
    const t = Math.hypot(x, z), th = Math.atan2(t, y);
    if (th * PLANET_R < 14) return NaN;
    return ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
  };
  // centre = circular mean of the vertex longitudes, half = the largest deviation from it. Vertices on the hill (the
  // r 13 retaining wall that every sector chunk touches) are behind the hill from any street camera and say nothing
  // about the lon span: skip them (I-look: bailing out on them left every sector chunk uncullable). A chunk that
  // lies mostly on the hill is not a sector chunk (null).
  let sx = 0, sz = 0, n = 0, inner = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const l = lonOf(i);
    if (Number.isNaN(l)) { inner++; continue; }
    sx += Math.sin((l * Math.PI) / 180); sz += Math.cos((l * Math.PI) / 180); n++;
  }
  if (n === 0 || inner > n * 0.25) return null;
  const lon = ((Math.atan2(sx, sz) * 180) / Math.PI + 360) % 360;
  let half = 0;
  for (let i = 0; i < pos.count; i++) {
    const l = lonOf(i);
    if (Number.isNaN(l)) continue;
    let d = Math.abs(l - lon) % 360;
    if (d > 180) d = 360 - d;
    if (d > half) half = d;
  }
  return { lon, half };
}

export interface OcclCull { setEnabled(on: boolean, far?: boolean, limit?: number): void; readonly hiddenCount: number }

export function installOcclusionCull(core: Core, chunks: readonly BuiltChunk[]): OcclCull {
  const spans: Span[] = [];
  for (const ch of chunks) {
    if (ch.mesh.parent?.name !== 'planet' || ch.key === 'planet' || ch.key === 'hill' || ch.key.startsWith('hp:')) continue;
    const s = chunkSpan(ch);
    if (s && s.half < 90) spans.push({ mesh: ch.mesh, lon: s.lon, half: s.half, far: ch.layer === 'far' });
    else if (ch.layer === 'far') spans.push({ mesh: ch.mesh, lon: 0, half: 180, far: true });
  }
  let enabled = true, farOn = true, hidden = 0, limit = CULL_LON;
  core.loop.addSystem('world:far', 'late', () => {
    hidden = 0;
    if (!enabled || core.scenes.active !== 'planet') return;
    const cam = core.cameraRig.camera.position;
    const len = cam.length(), hCam = len - PLANET_R;
    const t = Math.hypot(cam.x, cam.z);
    const rCam = Math.atan2(t, cam.y) * PLANET_R;
    const camLon0 = ((Math.atan2(cam.x, cam.z) * 180) / Math.PI + 360) % 360;
    // back-fill rows are only covered by the front rows when seen from the ring road outside the open market / site
    const farHidden = hCam < FAR_MAX_CAM_H && rCam >= 28.5 && rCam <= 39.5 && !(camLon0 > FAR_OPEN_LON[0] && camLon0 < FAR_OPEN_LON[1]);
    const street = rCam >= CULL_MIN_CAM_R && hCam < CULL_MAX_CAM_H;
        for (const s of spans) {
      if (!s.mesh.visible) continue;
      if ((farOn && s.far && farHidden) || (street && sectorHidden(camLon0, s.lon, s.half, limit))) { s.mesh.visible = false; hidden++; }
    }
  });
  return {
    setEnabled(on, far = true, lim = CULL_LON) { enabled = on; farOn = far; limit = lim; },
    get hiddenCount() { return hidden; },
  };
}
