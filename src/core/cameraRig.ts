// src/core/cameraRig.ts — owner: S. FROZEN. Follow / title / override-stack camera (ART §6.4, ARCHITECTURE §2.8.5).
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CameraOverride, CameraRigApi, Core } from '../contracts';
import { DEG, PLANET_CENTER, SURFACES, worldToFlat } from './planet';
import { gatherTris, isVisualOccluder, segmentHitsTris, type TriSet } from './sightTris';
import type { PhysicsImpl } from './physics';
import type { PlayerImpl } from './player';

export const FOLLOW = { fov: 50, back: 3.6, eye: 1.5, eyeUp: 0.9, shoulder: 0.5, ahead: 6, near: 0.1, far: 250, omega: 8 } as const;
export const PITCH_MIN = -30, PITCH_MAX = 20;
export const TITLE = { fov: 30, dist: 460, elev: 35, near: 250, far: 600, rate: 0.05, lookY: 20 } as const;
export const LOOK_RAD_PER_PX = 0.0025;
const _right = new Vector3(), _look = new Vector3(), _pivot = new Vector3(), _probe = new Vector3(), _lookY = new Vector3(0, TITLE.lookY, 0);
const _pv = new Vector3();
/** Camera clearance used by the boom test (m). */
export const BOOM_CLEARANCE = 0.2;
/** A boom pulled in below this fraction of FOLLOW.back tries these lifts (m, along the player's up) first. */
export const BOOM_SHORT = 0.6;
export const BOOM_LIFTS = [1.2, 2.0, 2.8] as const;
/** P3r2 look L5: before lifting, a pulled-in boom tries the other shoulder and small swings round the pivot (deg): in
 *  the bus shelter / lighthouse doorway / subway platform the right-shoulder boom hit a side wall and pulled in to
 *  ≈ 1.3–1.7 m, where the phone head filled a third of the frame (the lift then parked the camera on the shelter roof). */
export const BOOM_SWINGS = [-1, 22, -22, 40, -40] as const;
const _want = new Vector3(), _alt = new Vector3(), _off = new Vector3();

/** P3r3 look L4: a follow boom still shorter than `on` m after the swings and lifts (a wall right behind him: the
 *  footbridge stair foot, the locker in front of the store, interiors) put the dithered phone head over a third of the
 *  frame. The camera then cranes up over his head (`rise` ≈ riseK × the room behind him, capped; interiors stay below
 *  `interiorTop` above the feet) at `minBack`…`maxBack` behind him and tilts down so his head sits `headBelow` of the
 *  half-frame below the centre (pitch ≤ maxPitch): the street ahead with his head at the bottom, instead of the back
 *  of his head. `off` = hysteresis. The raised line is tested against colliders and the rendered world (arcade roofs,
 *  awnings are not colliders). */
export const CRANE = { on: 1.5, off: 1.8, minBack: 0.45, maxBack: 1.1, riseK: 1.4, riseMin: 0.8, riseMax: 1.45, interiorTop: 2.8, headBelow: 0.6, maxPitch: 45, head: 1.72 } as const;
const _cb = new Vector3(), _cf = new Vector3(), _cd = new Vector3();
/** Crane directions tried (deg round the pivot from straight back). */
export const CRANE_SWINGS = [0, 30, -30] as const;
/** Pure (exported for tests): the crane pose for a boom whose free room behind the pivot is `room` m along `back` (unit,
 *  tangent), rising `rise` m; `fwd` = his heading (unit, tangent). Returns the view pitch (deg, down). */
export function cranePose(pivot: Vector3, up: Vector3, back: Vector3, fwd: Vector3, room: number, rise: number, fovDeg: number, outPos: Vector3, outTgt: Vector3): number {
  const hb = Math.max(CRANE.minBack, Math.min(CRANE.maxBack, room));
  outPos.copy(pivot).addScaledVector(up, rise).addScaledVector(back, hb);
  const headDrop = rise - (CRANE.head - FOLLOW.eye);                 // head below the lens (m)
  const headDown = Math.atan2(headDrop, hb) / DEG;
  const pitch = Math.max(0, Math.min(CRANE.maxPitch, headDown - CRANE.headBelow * (fovDeg / 2)));
  const p = pitch * DEG;
  _cd.copy(fwd).multiplyScalar(Math.cos(p)).addScaledVector(up, -Math.sin(p));
  outTgt.copy(outPos).addScaledVector(_cd, FOLLOW.ahead);
  return pitch;
}
/** The rise for `room` m behind him (pure). */
export function craneRise(room: number, interior: boolean): number {
  const r = Math.max(CRANE.riseMin, Math.min(CRANE.riseMax, room * CRANE.riseK));
  return interior ? Math.min(r, CRANE.interiorTop - FOLLOW.eye) : r;
}

/** P3 G10: the vertical FOVs in this game are authored for a landscape window (16:9 … 16:10). Between ASPECT_MIN and
 *  ASPECT_MAX they apply as is; a narrower (portrait) window keeps the horizontal FOV it would have at ASPECT_MIN
 *  (720×1280 showed a 29° slit with the hero filling it), a wider one keeps the horizontal FOV of ASPECT_MAX (an
 *  ultrawide stretched to ~135°). */
export const ASPECT_MIN = 1.2, ASPECT_MAX = 2.4;
export function fitFov(vfovDeg: number, aspect: number): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return vfovDeg;
  const t = Math.tan((vfovDeg * DEG) / 2);
  if (aspect < ASPECT_MIN) return (2 * Math.atan((t * ASPECT_MIN) / aspect)) / DEG;
  if (aspect > ASPECT_MAX) return (2 * Math.atan((t * ASPECT_MAX) / aspect)) / DEG;
  return vfovDeg;
}
/** Owners of overrides that fit the window themselves (the viewfinder frames a 16:9 photo, lens/modes.ts). */
const SELF_FIT: readonly string[] = ['lens'];

export interface CameraRigImpl extends CameraRigApi {
  update(dt: number): void;
  readonly titleMode: boolean;
}

/** Desired follow camera (pure): pivot = feet + up·eye; boom behind the heading, pitched; right-shoulder offset. */
export function followPose(feet: Vector3, up: Vector3, heading: Vector3, pitchDeg: number, outPos: Vector3, outTarget: Vector3): void {
  const p = pitchDeg * DEG;
  const eye = pitchDeg > 0 ? FOLLOW.eye + (FOLLOW.eyeUp - FOLLOW.eye) * (pitchDeg / PITCH_MAX) : FOLLOW.eye;
  const right = _right.crossVectors(heading, up).normalize();
  const look = _look.copy(heading).multiplyScalar(Math.cos(p)).addScaledVector(up, Math.sin(p));
  const pivot = _pivot.copy(feet).addScaledVector(up, eye);
  outPos.copy(pivot).addScaledVector(look, -FOLLOW.back).addScaledVector(right, FOLLOW.shoulder);
  outTarget.copy(pivot).addScaledVector(look, FOLLOW.ahead);
}

/** P3r2: weight of the NEW pose `el` seconds into a `dur`-second camera blend (smoothstep; 1 = done). */
export function blendWeight(el: number, dur: number): number {
  if (!(dur > 0)) return 1;
  const x = Math.min(1, Math.max(0, el / dur));
  return x * x * (3 - 2 * x);
}

/** P3r3 (look g, L10): the roof look-out. The whole town sits below the horizon dip from an 18 m roof (≈ 36° down on
 *  an 80 m planet), so at the rig's usual pitch the roof showed parapet and sky only (GDD §19.4 roof_view 「几乎全城都在
 *  视野里」). When he stands on high ground (≥ minH above the base ground) with a drop within `ahead` m in front of him,
 *  the follow camera eases `pitch` degrees down (the boom rises over the parapet) — unless the player moved the view
 *  vertically in the last `hold` s. Pure predicate below; the easing lives in follow(). */
export const LOOKOUT = { minH: 6, ahead: 2.6, drop: 3, pitch: -24, rate: 2.5, hold: 2.5 } as const;
/** Is there a drop of ≥ LOOKOUT.drop within LOOKOUT.ahead m in front of flat point (x, z) at height h? (pure) */
export function lookoutAhead(heightAt: (x: number, z: number, h: number) => number, x: number, z: number, h: number, dx: number, dz: number): boolean {
  if (h < LOOKOUT.minH) return false;
  const n = Math.hypot(dx, dz) || 1;
  for (const k of [1.2, 1.9, LOOKOUT.ahead]) {
    if (heightAt(x + (dx / n) * k, z + (dz / n) * k, h) < h - LOOKOUT.drop) return true;
  }
  return false;
}

/** P3r3 (look b): eased hand-overs are no longer straight lines. A straight lerp from a story / dialogue camera to the
 *  follow boom crossed the road 12 m in 0.5 s and flew THROUGH the hero (golden P8, after S_zhe: 1.9 m from his feet at
 *  torso height, 1 m from his body axis: the near-lens fade dithered him across the whole frame) or past posts. The move now follows a bowed path
 *  a→b + off·4k(1−k): the first offset (straight, lifted, swung to either side) whose samples are clear of colliders
 *  and keep EASE_HERO_R from the hero wins; nothing clear (or a move longer than EASE_MAX m) = a cut. */
export const EASE_MAX = 18, EASE_HERO_R = 1.2, EASE_HERO_TOP = 1.9;
/** Offsets tried in order: [up, side] metres (side = right of the a→b direction). Interiors: no lift above 0.5 m
 *  (their ceilings are not colliders). */
export const EASE_OFFSETS: readonly (readonly [number, number])[] = [[0, 0], [1.2, 0], [2.4, 0], [0.8, 1.6], [0.8, -1.6], [0, 2.4], [0, -2.4], [4, 0]];
export interface EasePlanCtx {
  /** collider test at a world point (the boom clearance) */
  blocked(p: Vector3): boolean;
  /** local up at the move (planet: away from the centre) */
  up: Vector3;
  /** the hero's feet + up (null: no hero in this scene) */
  hero: { feet: Vector3; up: Vector3 } | null;
  interior: boolean;
  /** optional visual test: does the path piece p→q cross rendered geometry (a canopy, a board)? */
  segHit?(p: Vector3, q: Vector3): boolean;
}
const _ep = new Vector3(), _eq = new Vector3(), _es = new Vector3(), _ed = new Vector3(), _eh = new Vector3();
/** Distance from p to the hero's body segment (feet → feet + up·EASE_HERO_TOP). */
function heroDist(p: Vector3, hero: { feet: Vector3; up: Vector3 }): number {
  _eh.copy(p).sub(hero.feet);
  const h = Math.max(0, Math.min(EASE_HERO_TOP, _eh.dot(hero.up)));
  return _eh.addScaledVector(hero.up, -h).length();
}
/** Point k ∈ [0, 1] on the bowed path (pure). */
export function easePoint(a: Vector3, b: Vector3, off: Vector3, k: number, out: Vector3): Vector3 {
  return out.lerpVectors(a, b, k).addScaledVector(off, 4 * k * (1 - k));
}
/** Pure (exported for tests): the bow offset for an eased move a → b, or null when it must be a cut. */
export function planEase(a: Vector3, b: Vector3, ctx: EasePlanCtx, out = new Vector3()): Vector3 | null {
  const len = a.distanceTo(b);
  if (len < 0.05) return out.set(0, 0, 0);
  if (len > EASE_MAX) return null;
  _ed.copy(b).sub(a);
  _es.crossVectors(_ed, ctx.up);
  if (_es.lengthSq() < 1e-8) _es.set(1, 0, 0).cross(ctx.up);
  _es.normalize();
  const n = Math.max(10, Math.min(60, Math.ceil(len / 0.3)));
  const need = ctx.hero ? Math.min(EASE_HERO_R, 0.9 * Math.min(heroDist(a, ctx.hero), heroDist(b, ctx.hero))) : 0;
  for (const [u, sd] of EASE_OFFSETS) {
    if (ctx.interior && u > 0.5) continue;
    out.copy(ctx.up).multiplyScalar(u).addScaledVector(_es, sd);
    let ok = true;
    _eq.copy(a);
    for (let i = 1; i < n && ok; i++) {
      easePoint(a, b, out, i / n, _ep);
      const inner = _ep.distanceTo(a) > 0.3 && _ep.distanceTo(b) > 0.3;
      if (ctx.hero && heroDist(_ep, ctx.hero) < need) ok = false;
      // the ends are the two owners' own poses (each tested by its owner): only the way between them is checked
      else if (inner && ctx.blocked(_ep)) ok = false;
      else if (ctx.segHit && i > 1 && inner && _eq.distanceTo(a) > 0.3 && ctx.segHit(_eq, _ep)) ok = false;
      _eq.copy(_ep);
    }
    if (ok) return out;
  }
  return null;
}

/** ART §6.4 title orbit position for azimuth phi. */
export function titlePose(phi: number, out: Vector3): Vector3 {
  const e = TITLE.elev * DEG;
  return out.set(Math.cos(e) * Math.sin(phi), Math.sin(e), Math.cos(e) * Math.cos(phi)).multiplyScalar(TITLE.dist).add(PLANET_CENTER);
}

export function createCameraRig(core: Core, player: PlayerImpl, physics: PhysicsImpl): CameraRigImpl {
  const camera = new PerspectiveCamera(FOLLOW.fov, 16 / 9, FOLLOW.near, FOLLOW.far);
  camera.name = 'main';
  const stack: { owner: string; fn: CameraOverride; id: number }[] = [];
  let nextId = 1;
  let titleMode = false;
  let snapNext = true;
  let pitch = 0;
  let baseFov: number = FOLLOW.fov;
  let fovTween: { from: number; to: number; t0: number; dur: number } | null = null;
  // aspect fit bookkeeping: the authored fov of the last frame and what we turned it into (an override that set the
  // fov once must not be fitted again every frame)
  let fitNominal = FOLLOW.fov as number, fitApplied = FOLLOW.fov as number;
  const pos = new Vector3(), vel = new Vector3(), tgt = new Vector3(), tvel = new Vector3();
  const dPos = new Vector3(), dTgt = new Vector3(), feet = new Vector3(), up = new Vector3(), hd = new Vector3();
  const tmp = new Vector3();
  // P3r2: an eased hand-over between camera owners (dialogue in / out): the pose at blend() time is kept and mixed
  // into whatever the new owner produces, so the change reads as a camera move instead of a cut
  let blendState: { t0: number; dur: number; pos: Vector3; q: Quaternion; fov: number; off: Vector3 | null; planned: boolean } | null = null;
  const easeUp = new Vector3(), easeFeet = new Vector3(), easeHeroUp = new Vector3(), easeHero = { feet: easeFeet, up: easeHeroUp };
  const easeCtx: EasePlanCtx = {
    blocked: (p) => physics.blocked(player.scene, p, BOOM_CLEARANCE),
    up: easeUp, hero: easeHero, interior: false,
    segHit: (p, q) => !!easeTris && segmentHitsTris(easeTris, p, q),
  };
  let easeTris: TriSet | null = null;
  // P3r2 gate: a teleport / scene switch breaks continuity. Blending from a pose in another place (or another scene's
  // coordinates) swept the camera through the planet, or left it outside a room for half a second (golden S_studio
  // captured an all-dark studio: the cabinet inspect blended from the last PLANET pose). A teleport cancels a running
  // blend, and a blend() asked for before the camera has been shown at the new place is a plain cut.
  let movedSinceShown = false;
  try {
    core.bus.on('teleported', () => { blendState = null; movedSinceShown = true; });
    core.bus.on('sceneChanged', () => { blendState = null; movedSinceShown = true; });
  } catch { /* test doubles without a bus */ }

  const setLens = (fov: number, near: number, far: number) => {
    if (camera.fov !== fov || camera.near !== near || camera.far !== far) {
      camera.fov = fov; camera.near = near; camera.far = far;
      camera.updateProjectionMatrix();
    }
  };
  const spring = (x: Vector3, v: Vector3, target: Vector3, dt: number) => {
    const w = FOLLOW.omega;
    // critically damped spring (semi-implicit Euler, sub-stepped for stability)
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      tmp.copy(x).sub(target).multiplyScalar(-w * w).addScaledVector(v, -2 * w);
      v.addScaledVector(tmp, h);
      x.addScaledVector(v, h);
    }
  };

  /** Pull `p` in toward `pivot` to just before the first collider on pivot → p (samples ≤ 0.3 m, then bisect).
   *  Returns true if it moved. */
  const pullIn = (pivot: Vector3, p: Vector3): boolean => {
    const scene = player.scene;
    const len = pivot.distanceTo(p);
    const n = Math.max(2, Math.ceil(len / 0.3));
    let hit = -1;
    for (let i = 1; i <= n; i++) {
      if (physics.blocked(scene, _probe.copy(pivot).lerp(p, i / n), BOOM_CLEARANCE)) { hit = i; break; }
    }
    if (hit < 0) return false;
    let lo = (hit - 1) / n, hi = hit / n;
    for (let i = 0; i < 5; i++) {
      const mid = (lo + hi) / 2;
      if (physics.blocked(scene, _probe.copy(pivot).lerp(p, mid), BOOM_CLEARANCE)) hi = mid; else lo = mid;
    }
    p.copy(_probe.copy(pivot).lerp(p, Math.max(0.05, lo)));
    return true;
  };

  // P3r3 look L4: crane state (hysteresis) + the rendered triangles around the pivot, gathered only while craning
  let craning = false;
  let craneTris: TriSet | null = null;
  const craneAt = new Vector3(), cranePos = new Vector3(), craneTgt = new Vector3();
  let craneScene = '';
  const craneBack = new Vector3();
  const craneRoom: number[] = [], craneOrder: number[] = [];
  const tryCrane = (pivot: Vector3, want: Vector3): boolean => {
    const sc = player.scene;
    craneBack.copy(want).sub(pivot); craneBack.addScaledVector(up, -craneBack.dot(up));
    if (craneBack.lengthSq() < 1e-6) craneBack.copy(hd).negate();
    craneBack.normalize();
    _cf.copy(hd).addScaledVector(up, -hd.dot(up)).normalize();
    if (!craneTris || craneScene !== sc || craneAt.distanceTo(pivot) > 1.2) {
      craneAt.copy(pivot); craneScene = sc;
      try { craneTris = gatherTris(core.scenes.get(sc), pivot, 3.5, isVisualOccluder); } catch { craneTris = null; }
    }
    // the direction round the pivot with the most free room behind him (straight back preferred: a stair flight or a
    // post on one side swings it), at pivot height (colliders + rendered world)
    craneOrder.length = 0;
    for (let i = 0; i < CRANE_SWINGS.length; i++) {
      _cb.copy(craneBack).applyAxisAngle(up, CRANE_SWINGS[i] * DEG);
      _alt.copy(pivot).addScaledVector(_cb, CRANE.maxBack + BOOM_CLEARANCE);
      pullIn(pivot, _alt);
      let room = Math.max(0, _alt.distanceTo(pivot) - 0.05);
      if (craneTris) {
        for (let k = room; k > 0.2; k -= 0.15) {
          if (!segmentHitsTris(craneTris, pivot, _cd.copy(pivot).addScaledVector(_cb, k), 0.1, 0)) { room = k; break; }
          room = 0;
        }
      }
      craneRoom[i] = room;
      if (room >= 0.25) craneOrder.push(i);
    }
    craneOrder.sort((a, b) => (craneRoom[b] - 0.004 * Math.abs(CRANE_SWINGS[b])) - (craneRoom[a] - 0.004 * Math.abs(CRANE_SWINGS[a])));
    for (const i of craneOrder) {
      _cb.copy(craneBack).applyAxisAngle(up, CRANE_SWINGS[i] * DEG);
      _cf.copy(_cb).negate();                              // look over his head, him centred (the swing turns the view)
      const room = craneRoom[i];
      for (let rise = craneRise(room, sc !== 'planet'); rise >= 0.5; rise -= 0.35) {
        cranePose(pivot, up, _cb, _cf, room, rise, baseFov, cranePos, craneTgt);
        if (pullIn(pivot, cranePos) && cranePos.distanceTo(pivot) < rise * 0.9) continue;
        if (craneTris && segmentHitsTris(craneTris, pivot, cranePos, 0.1, 0.05)) continue;
        return true;
      }
    }
    return false;
  };
  let lookout = 0, pitchTouched = -1e9;
  const lookoutWanted = (): boolean => {
    if (player.scene !== 'planet') return false;
    try {
      const f = player.flat();
      _pv.copy(feet).add(hd);
      const g = worldToFlat(SURFACES.planet, _pv);
      return lookoutAhead((x, z, h) => physics.heightAt('planet', x, z, h), f.x, f.z, f.h, g.x - f.x, g.z - f.z);
    } catch { return false; }
  };
  const follow = (dt: number) => {
    if (core.input.context() === 'gameplay') {
      const l = core.input.consumeLook();
      if (l.dx) player.rotateHeading(l.dx * LOOK_RAD_PER_PX);
      if (l.dy) { pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - (l.dy * LOOK_RAD_PER_PX) / DEG)); pitchTouched = core.clock.t; }
    }
    player.pos(feet); player.up(up); player.heading(hd);
    const wantOut = core.clock.t - pitchTouched > LOOKOUT.hold && lookoutWanted() ? LOOKOUT.pitch : 0;
    lookout = snapNext ? wantOut : lookout + (wantOut - lookout) * Math.min(1, dt * LOOKOUT.rate);
    followPose(feet, up, hd, Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + lookout)), dPos, dTgt);
    const pivot = _pv.copy(feet).addScaledVector(up, FOLLOW.eye);
    _want.copy(dPos);
    if (pullIn(pivot, dPos) && dPos.distanceTo(pivot) < FOLLOW.back * BOOM_SHORT) {
      // the other shoulder (-1) or the boom swung round the pivot, still looking at the same target
      let best = dPos.distanceTo(pivot);
      const right = _right.crossVectors(hd, up).normalize();
      for (const sw of BOOM_SWINGS) {
        if (sw === -1) _alt.copy(_want).addScaledVector(right, -2 * FOLLOW.shoulder);
        else _alt.copy(pivot).add(_off.copy(_want).sub(pivot).applyAxisAngle(up, sw * DEG));
        pullIn(pivot, _alt);
        const d = _alt.distanceTo(pivot);
        if (d > best + 0.4) { best = d; dPos.copy(_alt); }
        if (best >= FOLLOW.back * 0.85) break;
      }
    }
    if (dPos.distanceTo(pivot) < FOLLOW.back * BOOM_SHORT && player.scene === 'planet') {
      // I-play: a low obstacle right behind the player (the seawall rail behind vp_group_photo, ch1 / finale boot)
      // pulled the boom in to ~0.5 m, so the phone head filled the screen. Try lifting the camera over it; a wall with
      // no top (every lift blocked just as early) keeps the plain pull-in. Planet only: interiors have ceilings that
      // are not colliders.
      let best = dPos.distanceTo(pivot);
      for (const lift of BOOM_LIFTS) {
        _alt.copy(_want).addScaledVector(up, lift);
        pullIn(pivot, _alt);
        const d = _alt.distanceTo(pivot);
        if (d > best + 0.5) { best = d; dPos.copy(_alt); }
        if (best >= FOLLOW.back * 0.9) break;
      }
    }
    {
      const len = dPos.distanceTo(pivot);
      craning = len < (craning ? CRANE.off : CRANE.on);
      if (craning && tryCrane(pivot, _want)) { dPos.copy(cranePos); dTgt.copy(craneTgt); }
      else if (!craning) craneTris = null;
    }
    if (snapNext) { pos.copy(dPos); tgt.copy(dTgt); vel.set(0, 0, 0); tvel.set(0, 0, 0); snapNext = false; }
    else {
      spring(pos, vel, dPos, dt); spring(tgt, tvel, dTgt, dt);
      // The damped camera lags ≈ 2v/ω (0.8 m at walking speed) behind its goal, so backing towards a wall would carry
      // it through the wall: the damped position obeys the same boom test, and loses the velocity into the wall.
      if (pullIn(pivot, pos)) vel.set(0, 0, 0);
    }
    camera.position.copy(pos);
    camera.up.copy(up);                                  // the player's local up before every lookAt (ART §6.4)
    camera.lookAt(tgt);
    setLens(baseFov, FOLLOW.near, FOLLOW.far);
  };

  const title = () => {
    titlePose(core.clock.animT * TITLE.rate, camera.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp.copy(PLANET_CENTER).add(_lookY));
    setLens(TITLE.fov, TITLE.near, TITLE.far);
  };

  const api: CameraRigImpl = {
    camera,
    get titleMode() { return titleMode; },
    get pitchDeg() { return pitch; },
    set pitchDeg(v: number) { pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v)); },
    push(owner, fn) {
      const id = nextId++;
      stack.push({ owner, fn, id });
      return () => {
        const i = stack.findIndex((e) => e.id === id);
        if (i >= 0) { stack.splice(i, 1); snapNext = true; }
      };
    },
    top: () => (stack.length ? stack[stack.length - 1].owner : null),
    setTitleMode(on) { titleMode = on; snapNext = true; },
    look(yawDeg, pitchDeg) { player.setYaw(yawDeg); api.pitchDeg = pitchDeg; snapNext = true; },
    fovTo(deg, seconds) {
      if (seconds <= 0 || core.params.test) { baseFov = deg; fovTween = null; return; }
      fovTween = { from: baseFov, to: deg, t0: core.clock.t, dur: seconds };
    },
    snap() { snapNext = true; },
    blend(seconds) {
      if (!(seconds > 0) || movedSinceShown) { blendState = null; return; }
      // the pose last shown (mid-blend: the mixed pose, so a blend started during a blend stays continuous)
      blendState = { t0: core.clock.t, dur: seconds, pos: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, off: null, planned: false };
    },
    update(dt) {
      if (fovTween) {
        const k = Math.min(1, (core.clock.t - fovTween.t0) / fovTween.dur);
        baseFov = fovTween.from + (fovTween.to - fovTween.from) * k;
        if (k >= 1) fovTween = null;
      }
      let owner = 'follow';
      if (titleMode) title();
      else if (stack.length) {
        const top = stack[stack.length - 1];
        owner = top.owner;
        try { top.fn(camera, dt); } catch (e) { core.log.warn(`[camera] override ${top.owner} threw`, e); }
      } else follow(dt);
      const nominal = camera.fov === fitApplied ? fitNominal : camera.fov;
      const fitted = SELF_FIT.includes(owner) ? camera.fov : fitFov(nominal, camera.aspect);
      fitNominal = nominal; fitApplied = fitted;
      if (camera.fov !== fitted) { camera.fov = fitted; camera.updateProjectionMatrix(); }
      if (blendState && !titleMode) {
        if (!blendState.planned) {
          // the new owner's first pose is known now: choose the path once (the ends may drift a little: the follow
          // spring, a walking speaker — the bow offset stays)
          blendState.planned = true;
          const sc = player.scene;
          const c = core.scenes?.surface ? core.scenes.surface(sc).center : PLANET_CENTER;
          easeUp.copy(blendState.pos).add(camera.position).multiplyScalar(0.5).sub(c).normalize();
          player.pos(easeFeet); player.up(easeHeroUp);
          easeCtx.interior = sc !== 'planet';
          // P3r3: the visual world too (the P8 lift went through the subway canopy, which has no collider)
          easeTris = null;
          const len = blendState.pos.distanceTo(camera.position);
          if (len > 0.05 && len <= EASE_MAX) {
            try {
              _off.copy(blendState.pos).add(camera.position).multiplyScalar(0.5);
              easeTris = gatherTris(core.scenes.get(sc), _off, len / 2 + 4.5, isVisualOccluder);
            } catch { easeTris = null; }
          }
          blendState.off = planEase(blendState.pos, camera.position, easeCtx, new Vector3());
          easeTris = null;
          if (!blendState.off) blendState = null;          // no clear way between the two shots: cut
        }
      }
      if (blendState && !titleMode) {
        const k = blendWeight(core.clock.t - blendState.t0, blendState.dur);
        if (k >= 1) blendState = null;
        else {
          easePoint(blendState.pos, camera.position, blendState.off ?? _off.set(0, 0, 0), k, camera.position);
          camera.quaternion.slerpQuaternions(blendState.q, camera.quaternion, k);
          const f = blendState.fov + (fitted - blendState.fov) * k;
          // remember the mixed value as "applied" so the next frame reads the owner's nominal fov back correctly
          if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); }
          fitApplied = f;
        }
      } else if (titleMode) blendState = null;
      movedSinceShown = false;
      camera.updateMatrixWorld();
    },
  };
  return api;
}
