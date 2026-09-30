// src/lens/view.ts — owner D. Builds the ShotView (evalShot's input) from the lens camera: NDC projection, distances,
// facing, ≤ 5 occlusion rays per candidate against world.occluders (coarse proxies), hidden/contain checks and the
// viewpoint errors (ARCHITECTURE §3.D, §5.1). No per-frame allocation on the hot path.
import { Raycaster, Vector3, type Intersection, type Object3D, type PerspectiveCamera } from 'three';
import type { Core } from '../contracts';
import type { PhotoTarget, SceneId, TargetId } from '../types';
import { TARGETS } from '../data/photoTargets';
import { DEG, SURFACES, dirToHeading, frameAt, headingToDir, worldToFlat, type SurfaceFrame } from '../core/planet';
import { gatherTris, isVisualOccluder, segmentHitsTris, type TriSet } from '../core/sightTris';
import type { Anchors } from './anchors';
import type { NdcPoint, Projection, ShotView, TargetView } from './evalShot';

const BY_ID = new Map<TargetId, PhotoTarget>(TARGETS.map((t) => [t.id, t]));
/** Nothing further than this competes for the frame (the dist condition says 「太远了」 inside it). */
export const MAX_RANGE = 90;
/** A target competes for the frame only within this multiple of its maxDist (so 「太远了」 shows when you are close-ish). */
export const CANDIDATE_RANGE = 2;
/** P3r3 look L5: NPC targets this close also get their occlusion rays tested against rendered props (m). */
export const VIS_RANGE = 8, VIS_REGATHER = 0.6;
export const targetById = (id: TargetId): PhotoTarget | undefined => BY_ID.get(id);

export interface LensPose { pos: Vector3; dir: Vector3; up: Vector3; yaw: number; pitch: number; scene: SceneId }

/** Angle difference in degrees, wrapped to [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

export function createViewBuilder(core: Core, anchors: Anchors) {
  const ray = new Raycaster();
  ray.layers.enableAll();
  const hits: Intersection[] = [];
  const prepared = new WeakSet<Object3D>();
  const v = new Vector3(), pp = new Vector3(), w = new Vector3(), d = new Vector3(), right = new Vector3(), upv = new Vector3(), fwd = new Vector3();
  const fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  let cam: PerspectiveCamera | null = null;
  let pose: LensPose | null = null;
  let occ: readonly Object3D[] = [];
  let tanHalf = 1;
  /** Reused per-target projections (every available target is projected every frame). */
  const projPool = new Map<TargetId, Projection>();
  const mp = new Vector3(), hq = new Vector3(), cq = new Vector3(), sw = new Vector3();

  const occluders = (scene: SceneId): readonly Object3D[] => {
    let list: readonly Object3D[] = [];
    try { list = core.services.world.occluders(scene); } catch { list = []; }
    for (const o of list) {
      if (!prepared.has(o)) { prepared.add(o); if (!o.parent) o.updateMatrixWorld(true); }
    }
    return list;
  };

  /** Is the segment lens → p blocked by a proxy? It stops `short` m before p (0.1 for surface anchors; a landmark's
   *  radius for landmark centres, which sit inside their own proxy). */
  const blocked = (p: Vector3, short = 0.1): boolean => {
    if (!pose || occ.length === 0) return false;
    d.copy(p).sub(pose.pos);
    const len = d.length();
    if (len < short + 0.05) return false;
    ray.set(pose.pos, d.divideScalar(len));
    ray.near = 0; ray.far = len - short;
    hits.length = 0;
    ray.intersectObjects(occ as Object3D[], true, hits);
    const any = hits.length > 0;
    hits.length = 0;
    return any;
  };

  /** P3r3 look L5: a person's face is also hidden by rendered props the coarse proxies leave out (a market stall's
   *  board, crates): the occlusion rays of NPC targets within VIS_RANGE also test the world triangles around the lens,
   *  gathered only while such a target is measured and again after the lens moves VIS_REGATHER m. */
  let visTris: TriSet | null = null, visScene = '';
  const visAt = new Vector3();
  const visBlocked = (p: Vector3): boolean => {
    if (!pose) return false;
    if (!visTris || visScene !== pose.scene || visAt.distanceTo(pose.pos) > VIS_REGATHER) {
      visAt.copy(pose.pos); visScene = pose.scene;
      try { visTris = gatherTris(core.scenes.get(pose.scene), pose.pos, VIS_RANGE + VIS_REGATHER + 0.5, isVisualOccluder); } catch { visTris = null; }
    }
    return !!visTris && segmentHitsTris(visTris, pose.pos, p, 0.15, 0.2);
  };

  const ndc = (p: Vector3, out: NdcPoint): NdcPoint => {
    if (!cam || !pose) { out.x = 9; out.y = 9; out.front = false; return out; }
    out.front = w.copy(p).sub(pose.pos).dot(pose.dir) > 0.01;
    v.copy(p).project(cam);
    out.x = v.x; out.y = v.y;
    return out;
  };

  /** The planet itself hides anything whose sight line dips below the surface (tiny-planet horizon, ART §6.3). */
  const belowHorizon = (p: Vector3): boolean => {
    if (!pose || pose.scene !== 'planet') return false;
    const c = SURFACES.planet.center;
    d.copy(p).sub(pose.pos);
    const len2 = d.lengthSq();
    if (len2 < 1e-6) return false;
    const k = Math.max(0, Math.min(1, w.copy(c).sub(pose.pos).dot(d) / len2));
    return w.copy(pose.pos).addScaledVector(d, k).distanceTo(c) < SURFACES.planet.radius - 0.5;
  };

  const project = (t: PhotoTarget): Projection | null => {
    if (!pose) return null;
    const p = anchors.targetPos(t, pp);
    if (!p) return null;
    const dist = p.distanceTo(pose.pos);
    if (dist > Math.min(MAX_RANGE, CANDIDATE_RANGE * (t.maxDist ?? 30)) || belowHorizon(p)) return null;
    let pr = projPool.get(t.id);
    if (!pr) { pr = { anchor: { x: 0, y: 0, front: false }, dist: 0 }; projPool.set(t.id, pr); }
    ndc(p, pr.anchor);
    pr.dist = dist;
    return pr;
  };

  const viewpointErr = (t: PhotoTarget): TargetView['vp'] => {
    const vp = t.viewpoint;
    if (!vp || !pose) return null;
    let spot;
    try { spot = core.services.world.spot(vp.spot); } catch { return null; }
    if (spot.scene !== pose.scene) return { ePos: 1e9, eYaw: 180, ePitch: 180, cone: null };
    const s = SURFACES[spot.scene];
    let spotW: Vector3;
    try { spotW = core.services.world.spotPos(vp.spot, sw); } catch { return null; }
    const a = worldToFlat(s, pose.pos), b = worldToFlat(s, spotW);
    const ePos = Math.hypot(a.x - b.x, a.z - b.z);
    const eYaw = spot.yaw !== undefined && vp.yawTol !== undefined ? angleDiff(pose.yaw, spot.yaw) : 0;
    const dPitch = pose.pitch - (spot.pitch ?? 0);
    const ePitch = vp.pitchTol !== undefined ? Math.abs(dPitch) : 0;
    // P3r3 G2: signed errors name the direction in the hint (yaw clockwise, wrapped to ±180; pitch up)
    const dYaw = spot.yaw !== undefined ? ((((pose.yaw - spot.yaw) % 360) + 540) % 360) - 180 : 0;
    let cone: number | null = null;
    if (vp.coneDeg !== undefined) {
      frameAt(s, spotW, fr);
      const normal = headingToDir(fr, spot.yaw ?? 0, fwd);
      d.copy(pose.pos).sub(spotW);
      d.addScaledVector(fr.up, -d.dot(fr.up));
      cone = d.lengthSq() < 1e-8 ? 90 : Math.acos(Math.max(-1, Math.min(1, d.normalize().dot(normal)))) / DEG;
    }
    return { ePos, eYaw, ePitch, cone, dYaw, dPitch };
  };

  const BOUND_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const bp = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const nrm = new Vector3();
  /** Anchor + 4 bound points at 0.7·radius. Flat things with a known face (hoarding, doors, plaque, QR) sample in their
   *  own plane, 5 cm proud of it, so an oblique view is not "occluded" by the very wall the target is painted on;
   *  everything else samples on the camera plane. */
  const boundPoints = (t: PhotoTarget, p: Vector3): Vector3[] => {
    const k = t.radius * 0.7;
    const face = 'world' in t.anchor ? anchors.world(t.anchor.world)?.normal ?? null : null;
    if (face && cam && pose) {
      nrm.copy(face).normalize();
      frameAt(SURFACES[pose.scene], p, fr);
      right.crossVectors(fr.up, nrm);
      if (right.lengthSq() < 1e-6) right.setFromMatrixColumn(cam.matrixWorld, 0);
      right.normalize();
      upv.crossVectors(nrm, right).normalize();
      bp[0].copy(p).addScaledVector(nrm, 0.05);
    } else if (cam) {
      right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      upv.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
      nrm.set(0, 0, 0);
      bp[0].copy(p);
    }
    for (let i = 0; i < 4; i++) {
      bp[i + 1].copy(p).addScaledVector(nrm, 0.05).addScaledVector(right, BOUND_DIRS[i][0] * k).addScaledVector(upv, BOUND_DIRS[i][1] * k);
    }
    return bp;
  };

  const measure = (t: PhotoTarget): TargetView | null => {
    if (!cam || !pose) return null;
    const p = anchors.targetPos(t, mp);
    if (!p) return null;
    const dist = p.distanceTo(pose.pos);
    const anchor = ndc(p, { x: 0, y: 0, front: false });
    const frac = t.radius / Math.max(1e-3, dist * tanHalf);
    // 5 occlusion rays: anchor + 4 bound points (GDD §3.4)
    const pts = boundPoints(t, p);
    let n = 0;
    const vis = 'npc' in t.anchor && dist <= VIS_RANGE;
    for (const q of pts) if (blocked(q) || (vis && visBlocked(q))) n++;
    const view: TargetView = { anchor, dist, frac, blocked: n };
    const whole = anchors.wholeOf(t);
    if (t.whole) view.whole = whole ? whole.map((q) => ndc(q, { x: 0, y: 0, front: false })) : [];
    if (t.facing) {
      const f = anchors.facingOf(t, fwd);
      view.facingDeg = f ? Math.acos(Math.max(-1, Math.min(1, f.normalize().dot(d.copy(pose.pos).sub(p).normalize())))) / DEG : null;
    }
    if (t.viewpoint) view.vp = viewpointErr(t);
    if (t.mustBeHidden?.length) {
      view.hidden = t.mustBeHidden.map((s) => {
        const q = anchors.spotPoint(s, hq);
        if (!q) return true;
        const np = ndc(q, { x: 0, y: 0, front: false });
        const inFrame = np.front && Math.abs(np.x) <= 1 && Math.abs(np.y) <= 1;
        return !inFrame || blocked(q);
      });
    }
    if (t.mustContain?.length) {
      view.contain = t.mustContain.map((id) => {
        const ct = BY_ID.get(id);
        const q = ct ? anchors.targetPos(ct, cq) : null;
        if (!q) return { id, point: null, occluded: true };
        return { id, point: ndc(q, { x: 0, y: 0, front: false }), occluded: blocked(q, Math.max(0.1, (ct?.radius ?? 0) * 0.9)) };
      });
    }
    return view;
  };

  const view: ShotView = { project, measure };

  return {
    /** Bind the lens camera + pose for this evaluation (the camera must have updated matrices). */
    bind(c: PerspectiveCamera, p: LensPose): ShotView {
      cam = c; pose = p;
      tanHalf = Math.tan((c.fov * DEG) / 2);
      occ = occluders(p.scene);
      return view;
    },
    ndc(p: Vector3): NdcPoint { return ndc(p, { x: 0, y: 0, front: false }); },
    /** Dev: which proxies block each of the 5 rays for `t` (names). */
    debugRays(t: PhotoTarget): string[][] {
      const p = anchors.targetPos(t, new Vector3());
      if (!p || !pose) return [];
      return boundPoints(t, p).map((q) => {
        d.copy(q).sub(pose!.pos);
        const len = d.length();
        ray.set(pose!.pos, d.divideScalar(len)); ray.near = 0; ray.far = len - 0.1;
        hits.length = 0;
        ray.intersectObjects(occ as Object3D[], true, hits);
        const names = hits.map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(1)}/${len.toFixed(1)}`);
        hits.length = 0;
        return names;
      });
    },
    blocked,
    /** Projected size fraction of a sphere (radius r) at p. */
    frac(p: Vector3, r: number): number { return pose ? r / Math.max(1e-3, p.distanceTo(pose.pos) * tanHalf) : 0; },
    heading(dir: Vector3, at: Vector3, scene: SceneId): number { return dirToHeading(frameAt(SURFACES[scene], at, fr), dir); },
  };
}
export type ViewBuilder = ReturnType<typeof createViewBuilder>;
