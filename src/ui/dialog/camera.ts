// src/ui/dialog/camera.ts — owner E (framing retuned by P3-look L2, see below). The dialogue camera override (ART §6.4):
// a 3/4 shot 2.5 m out from the speaker at head height. Cuts (no lerp) between speakers.
// The camera must not sit inside a wall (interiors are ~7 m, NPCs stand near walls): the 3/4 side is chosen by a boom test
// against the colliders (same idea as the follow rig, AGENTS.md [S-verify]), falling back to the other side, straight on,
// then a shorter boom.
import { Box3, Vector3 } from 'three';
import type { ActorDef, CameraOverride, Core } from '../../contracts';
import { gatherTris, isVisualOccluder, segmentHitsTris, type TriSet } from '../../core/sightTris';

// P3-look (L2): the fixed 1.1 m eye / 1.45 m look point put short speakers' faces under the dialogue box (纸妹 showed only
// her hair buns, 小刘 on the pipes the top of his head) and tall ones' at the box edge. The framing now follows the
// speaker's HEAD: the eye sits just above it and looks 0.28 m below it, so the face lands at ≈ 35 % of the frame height
// (the box covers the bottom ≈ 35 %), with a tighter vFOV. The 3/4 side prefers angles that keep the hero out of frame
// (he used to stand between camera and speaker, or as a cropped black slab at the edge). An NPC that cannot turn to the
// hero (C sets root.userData.fixedFacing: seated, perched, driving, at a window) is framed from its own front.
const FOV = 38, DIST = 2.5, EYE_OVER = 0.05, LOOK_UNDER = 0.28, CLEAR = 0.2, SAMPLES = 6, HERO_HEAD = 1.75;
/** Candidate (side angle in degrees, boom length factor), tried in order. */
const CANDIDATES_NEAR: readonly (readonly [number, number])[] = [1, 0.75, 0.55].flatMap((f) =>
  [38, -38, 55, -55, 24, -24, 0, 75, -75].map((deg) => [deg, f] as const));
/** P3r3 (look c): last resorts from his far side — the hero may talk ACROSS a visual-only barrier (小刘 behind the
 *  roadwork boards: every near-side shot filmed a board). Only win when nothing on the hero's side can see the face. */
const CANDIDATES: readonly (readonly [number, number])[] = [...CANDIDATES_NEAR, ...[1, 0.75].flatMap((f) =>
  [110, -110, 145, -145, 180].map((deg) => [deg, f] as const))];
/** Candidate used when no candidate has a clear collider line (the shortest near-side one, as before). */
const FALLBACK_NEAR = CANDIDATES_NEAR.length - 1;
/** Speakers that cannot turn face their own forward: straight on first (props beside them stay out of the sight line). */
const CANDIDATES_FIXED: readonly (readonly [number, number])[] = [1, 0.75, 0.55].flatMap((f) =>
  [0, 20, -20, 38, -38, 55, -55].map((deg) => [deg, f] as const));
let cands = CANDIDATES;
/** The head bone sits at the neck: the face centre is this far above it (m). */
const FACE_OVER_BONE = 0.1;
const P = new Vector3(), up = new Vector3(), d = new Vector3(), dd = new Vector3(), look = new Vector3(), feet = new Vector3();
const pos = new Vector3(), probe = new Vector3(), head = new Vector3(), hero = new Vector3(), fwd = new Vector3(), right = new Vector3();
let headH = 1.55, eyeOver: number = EYE_OVER, underCap = 0.3;
/** Seated / perched speakers (root.userData.seated) are filmed from a little above: their seat (pipes, bench backs) otherwise crosses the face. */
const EYE_OVER_SEATED = 0.5;

/** Camera position for candidate k around the speaker P (module scratch vectors; no per-frame closure). */
/** P3r2 look L2: over the hero's shoulder at a fixed-facing speaker he stands right in front of (the ending's 上车吗？:
 *  the straight-on shots were all through him, so the camera swung round to a side-on attendant behind a post).
 *  k = −1 / −2: his left / right shoulder; −3 / −4: beside him at chest height, looking up at the speaker (a wall right
 *  behind him: the bus-door talk under the shelter). */
/** P3r3 (look d): the beside-him shot (−3 / −4) sat at chest height looking UP at the attendant's hat, his torso behind
 *  the dialogue box. It now stands at his eye line with a wider lens and looks at the speaker's chest (`drop` below the
 *  head): head in the upper third, shoulders and chest above the box, the speaker left of the choice buttons. */
const OTS = [{ back: 0.75, side: 0.55, over: 0.12, drop: 0.12, fov: FOV, lat: 0 }, { back: 0.05, side: 0.7, over: 0, drop: 0.38, fov: 46, lat: 0.3 }] as const;
const NONE = -99;
const otsDir = new Vector3(), otsRight = new Vector3();
function place(k: number): void {
  if (k < 0) {
    otsDir.copy(P).sub(feet); otsDir.addScaledVector(up, -otsDir.dot(up)).normalize();
    otsRight.crossVectors(otsDir, up).normalize();
    const o = OTS[k <= -3 ? 1 : 0], sd = k === -1 || k === -3 ? -1 : 1;
    pos.copy(hero).addScaledVector(otsDir, -o.back).addScaledVector(otsRight, sd * o.side).addScaledVector(up, o.over);
    look.copy(P).addScaledVector(up, headH - o.drop);
    // `lat` m to the view's right: the speaker sits left of centre, clear of the choice buttons (right of the box)
    if (o.lat) look.addScaledVector(otsRight.crossVectors(otsDir.copy(look).sub(pos), up).normalize(), o.lat);
    return;
  }
  const [deg, f] = cands[k];
  dd.copy(d).applyAxisAngle(up, (deg * Math.PI) / 180);
  // the offsets scale with the boom, so a shorter fallback keeps the same angles (the face stays at ≈ 35 %)
  pos.copy(P).addScaledVector(dd, boom * f).addScaledVector(up, headH + eyeOver * f);
  look.copy(P).addScaledVector(up, headH - Math.min(LOOK_UNDER * f, headH * underCap) - bigDrop * f);
}
/** P3r2 (camera): a big speaker (拆's 3 m glyph on the hoarding) is framed whole: boom length and look drop per actor. */
let boom: number = DIST, bigDrop = 0, fov: number = FOV;
const BIG_FOV = 70;
const bigRadius = new WeakMap<object, number>();
const _box = new Box3(), _size = new Vector3();
function radiusOf(root: ActorDef['root']): number {
  let r = bigRadius.get(root);
  if (r === undefined) {
    _box.setFromObject(root);
    r = _box.isEmpty() ? 0 : Math.max(_box.getSize(_size).x, _size.y, _size.z) / 2;
    bigRadius.set(root, r);
  }
  return r;
}

/** Where the hero's head lands for the current `pos` → `look`: 0 = out of frame / behind, 1 = at the frame edge (a
 *  cropped slab), 2 = over the speaker (blocks the face). Pure (exported for tests). */
export function heroCover(camPos: Vector3, lookAt: Vector3, camUp: Vector3, heroHead: Vector3, speakerDist: number, aspect: number, fovDeg = FOV): 0 | 1 | 2 {
  fwd.copy(lookAt).sub(camPos).normalize();
  right.crossVectors(fwd, camUp).normalize();
  probe.copy(heroHead).sub(camPos);
  const z = probe.dot(fwd);
  if (z < 0.2) return 0;
  const tx = Math.tan((fovDeg * Math.PI) / 360) * aspect;
  const x = Math.abs(probe.dot(right) / (z * tx));
  if (x > 1.2) return 0;                                   // the phone head (≈ 0.35 m) clears the frame edge
  return x < 0.45 && z < speakerDist ? 2 : 1;
}

/** P3r2 (camera): seconds of the eased hand-over into / out of a dialogue shot (sim time; cameraRig.blend). */
export const DIALOG_EASE_IN = 0.7, DIALOG_EASE_OUT = 0.55;

/** Object inspect framing. Most InteractDefs sit on the STAND spot (it_bench = sp_bus_bench, the 周记 tile = the
 *  tile the hero stands on), so the anchor is often the hero's own feet: the "prop" is then taken ≈ 1.1 m ahead of him.
 *  P3r2 look L6: the shot now looks OVER his shoulder at the prop (camera behind-side of him, on the prop's open side),
 *  so what he inspects is in frame (the old front-side two-shot filmed the milk-box wall from inside it, or away from
 *  the box). The band from the lowest point of interest up to his head sits between `bandTop` and `bandBottom`
 *  (fractions of the frame height from the top): under the toasts (top ≈ 22 %) and above the dialogue box (≈ 35 %). */
const INSPECT = { fov: 42, bandTop: 0.24, bandBottom: 0.62, head: 1.9, minDist: 2.2, maxDist: 6, ahead: 1.1 } as const;
/** Candidate camera headings relative to the hero's facing (deg; 0 = straight ahead of him, 180 = behind), in order. */
const INSPECT_SWINGS: readonly number[] = [145, -145, 125, -125, 160, -160, 105, -105, 70, -70];
const iu = new Vector3(), ifw = new Vector3(), idd = new Vector3(), ip = new Vector3(), il = new Vector3(), it = new Vector3(), im = new Vector3();
const iprop = new Vector3();
/** Frame-edge probes (NDC x, y) for props within 1.4 m of the inspect lens (a post / board across the frame edge). */
const INSPECT_EDGES: readonly (readonly [number, number])[] = [[0, 0], [-0.82, 0], [0.82, 0], [-0.8, 0.7], [0.8, 0.7], [-0.8, -0.6], [0.8, -0.6]];
const INSPECT_NEAR = 0.7, INSPECT_NEAR_MAX = 3.5;

/** Pure (exported for tests): camera for swing `deg`. The prop is the anchor when it is ≥ 0.8 m from his feet, else a
 *  point `ahead` m in front of him; the subject is the midpoint between him and the prop. */
export function inspectPose(anchor: Vector3, feet: Vector3, up: Vector3, fwd: Vector3, deg: number, scale: number, outPos: Vector3, outLook: Vector3): void {
  it.copy(anchor).sub(feet);
  const ah = it.dot(up);
  it.addScaledVector(up, -ah);
  const far = it.length() >= 0.8;
  if (far) iprop.copy(it); else iprop.copy(fwd).multiplyScalar(INSPECT.ahead);
  const ph = far ? ah : Math.max(0.6, Math.min(1.2, ah > 0.3 ? ah : 1.0));
  im.copy(feet).addScaledVector(iprop, 0.5);
  const low = Math.max(0, Math.min(0.9, ph - 0.4));
  const band = INSPECT.head - low;
  const t = Math.tan((INSPECT.fov * Math.PI) / 360);
  const frac = INSPECT.bandBottom - INSPECT.bandTop;
  const dist = Math.min(INSPECT.maxDist, Math.max(INSPECT.minDist, 1.6 * iprop.length(), band / (2 * t * frac))) * scale;
  idd.copy(fwd).applyAxisAngle(up, (deg * Math.PI) / 180);
  const mid = (INSPECT.head + low) / 2;                  // band centre above the feet
  outPos.copy(im).addScaledVector(idd, dist).addScaledVector(up, mid + 0.35);
  // the band centre sits at (bandTop + bandBottom) / 2 from the top, i.e. that far above the optical axis
  const above = (0.5 - (INSPECT.bandTop + INSPECT.bandBottom) / 2) * 2 * t * dist;
  outLook.copy(im).addScaledVector(up, mid - above);
}

const probe2 = new Vector3();
/** World point of the prop inspectPose frames (the anchor, or ≈ 1.1 m ahead of him at chest height). */
function propAt(anchor: Vector3, feet: Vector3, up: Vector3, fwd: Vector3, out: Vector3): Vector3 {
  it.copy(anchor).sub(feet);
  const ah = it.dot(up);
  it.addScaledVector(up, -ah);
  if (it.length() >= 0.8) return out.copy(anchor);
  return out.copy(feet).addScaledVector(fwd, INSPECT.ahead).addScaledVector(up, ah > 0.3 ? ah : 1.0);
}

export const inspectCamDebug = { score: -1, tris: -1, pos: [0, 0, 0] as number[] };
(globalThis as { __inspectCam?: typeof inspectCamDebug }).__inspectCam = inspectCamDebug;
/** P3r2 (camera): object inspect shot (it.* nodes, the gate prompt) — see INSPECT. Clear sight lines only. */
export function inspectCamera(core: Core, scene: ActorDef['scene'], anchor: Vector3): CameraOverride {
  let chosen = false;
  const pos0 = new Vector3(), look0 = new Vector3(), up0 = new Vector3();
  const clearLine = (from: Vector3, to: Vector3): boolean => {
    const len = from.distanceTo(to);
    const skip = Math.min(0.6, len * 0.3);
    for (let i = 1; i <= SAMPLES; i++) {
      probe.copy(from).lerp(to, Math.min(1, skip / len + (i / SAMPLES) * (1 - skip / len)));
      if (core.physics.blocked(scene, probe, CLEAR)) return false;
    }
    return true;
  };
  // P3r3 look L4: the rendered world too (the bus-shelter notice board filled the boat inspect, a shelter post / the
  // board sat across a frame edge): visual-only props are not colliders
  let itris: TriSet | null = null;
  const ivf = new Vector3(), ivr = new Vector3(), ivp = new Vector3();
  // (the prop itself is not tested: a big one — the boat — has its anchor inside its own hull)
  const visualScore = (head: Vector3): number => {
    if (!itris || !itris.count) return 0;
    let s = 0;
    if (segmentHitsTris(itris, head, ip, 0.2, 0.05)) s += 4;
    ivf.copy(il).sub(ip).normalize();
    ivr.crossVectors(ivf, iu).normalize();
    const t = Math.tan((INSPECT.fov * Math.PI) / 360);
    // foreground within INSPECT_NEAR of the subject distance (a notice board 2.5 m out on a 6 m inspect shot)
    const near = Math.min(INSPECT_NEAR_MAX, INSPECT_NEAR * il.distanceTo(ip));
    for (const [x, y] of INSPECT_EDGES) {
      ivp.copy(ip).addScaledVector(ivf, 1).addScaledVector(ivr, x * t * 16 / 9).addScaledVector(iu, y * t);
      if (segmentHitsTris(itris, ivp.sub(ip).setLength(near).add(ip), ip, 0, 0.05, true)) s += 1;
    }
    return s;
  };
  const choose = () => {
    core.player.pos(feet);
    core.player.up(iu);
    core.player.heading(ifw);
    ifw.addScaledVector(iu, -ifw.dot(iu)).normalize();
    propAt(anchor, feet, iu, ifw, probe2);
    try { itris = gatherTris(core.scenes.get(scene), probe2.clone().lerp(feet, 0.5), INSPECT.maxDist + 2, isVisualOccluder); } catch { itris = null; }
    let found = false, bestS = Infinity;
    for (const f of [1, 0.8, 0.6]) {
      for (const deg of INSPECT_SWINGS) {
        inspectPose(anchor, feet, iu, ifw, deg, f, ip, il);
        // both the prop and the hero's head must be visible from there
        propAt(anchor, feet, iu, ifw, probe2);
        hero.copy(feet).addScaledVector(iu, 1.5);
        if (!clearLine(probe2, ip) || !clearLine(hero, ip)) continue;
        const s = visualScore(hero);
        if (s < bestS) { bestS = s; pos0.copy(ip); look0.copy(il); found = true; }
        if (s === 0) break;
      }
      if (found && bestS === 0) break;
    }
    inspectCamDebug.score = bestS; inspectCamDebug.tris = itris?.count ?? -1; inspectCamDebug.pos = pos0.toArray();
    itris = null;
    if (!found) inspectPose(anchor, feet, iu, ifw, INSPECT_SWINGS[0], 0.6, pos0, look0);
    up0.copy(iu);
    chosen = true;
  };
  return (cam) => {
    if (!chosen) choose();
    cam.position.copy(pos0);
    cam.up.copy(up0);
    cam.lookAt(look0);
    if (cam.fov !== INSPECT.fov || cam.near !== 0.1) { cam.fov = INSPECT.fov; cam.near = 0.1; cam.far = 250; cam.updateProjectionMatrix(); }
  };
}

/** P3r2 (camera): the speaker rides the hero (土地 on his shoulder at night): it is invisible from the first-person
 *  viewfinder, so the dialogue camera is pushed over the lens and frames the pair from the front. */
export function ridesHero(root: ActorDef['root']): boolean {
  for (let o = root.parent; o; o = o.parent) if (o.name === 'hero') return true;
  return false;
}

/** P3r2 look L2: other people in the shot are occluders too (the dawn lineup: 王阿婆's profile covered a third of the
 *  frame, 老陈 showed only his hat behind her head). Each is a vertical capsule of radius OCC_R from its feet to just
 *  above its head. Pure (exported for tests): does the segment a→b pass through any of them? */
export interface ActorCapsule { feet: Vector3; up: Vector3; top: number }
const OCC_R = 0.3, _s = new Vector3(), _q = new Vector3();
/** A person within NEAR_R of the lens fills a third of the frame even beside the sight line (纸妹 in front of 王阿婆). */
const NEAR_R = 1.0;
export function actorsCrowd(cam: Vector3, caps: readonly ActorCapsule[]): boolean {
  for (const c of caps) {
    _q.copy(cam).sub(c.feet);
    const h = _q.dot(c.up);
    if (h < -0.5 || h > c.top + 0.6) continue;
    if (_q.addScaledVector(c.up, -h).lengthSq() < NEAR_R * NEAR_R) return true;
  }
  return false;
}
export function actorsBlock(a: Vector3, b: Vector3, caps: readonly ActorCapsule[], samples = 10): boolean {
  for (let i = 1; i <= samples; i++) {
    _s.copy(a).lerp(b, i / samples);
    for (const c of caps) {
      _q.copy(_s).sub(c.feet);
      const h = _q.dot(c.up);
      if (h < 0 || h > c.top) continue;
      if (_q.addScaledVector(c.up, -h).lengthSq() < OCC_R * OCC_R) return true;
    }
  }
  return false;
}

/** Dev probe: the last candidate scores (−1 = collider in the way), the pick and its score. */
export const dialogCamDebug = { scores: [] as number[], pick: 0, score: 0 };
(globalThis as { __dialogCam?: typeof dialogCamDebug }).__dialogCam = dialogCamDebug;
export function dialogCamera(core: Core, target: () => ActorDef | null): CameraOverride {
  // the probe starts 0.6 m out from the speaker: NPCs carry their own 0.35 m collider (C); a seated / perched speaker
  // (C's root.userData.seated) sits on or against a prop (bench, 小刘's pipe stack), so its first 1.1 m are its own seat
  let skip = 0.6;
  const caps: ActorCapsule[] = [];
  const capPool: ActorCapsule[] = [];
  const gatherCaps = (a: ActorDef) => {
    caps.length = 0;
    for (const o of core.actors.list(a.scene)) {
      if (o === a || o.id === 'hero' || !o.root.visible || o.layer === 'photo_only' || ridesHero(o.root)) continue;
      const c = capPool[caps.length] ?? (capPool[caps.length] = { feet: new Vector3(), up: new Vector3(), top: 1.9 });
      o.root.getWorldPosition(c.feet);
      if (c.feet.distanceTo(P) > 9) continue;
      c.up.copy(c.feet).sub(core.scenes.surface(a.scene).center).normalize();
      (o.head ?? o.root).getWorldPosition(_q);
      c.top = Math.max(0.6, Math.min(4, _q.sub(c.feet).dot(c.up) + 0.3));
      caps.push(c);
    }
  };
  const clear = (scene: ActorDef['scene']): boolean => {
    // another person between the lens and the speaker's face (from just in front of the face to the lens)
    if (caps.length && (actorsCrowd(pos, caps) || actorsBlock(probe2.copy(look).lerp(pos, Math.min(0.9, 0.35 / Math.max(0.01, look.distanceTo(pos)))), pos, caps))) return false;
    const len = look.distanceTo(pos);
    for (let i = 1; i <= SAMPLES; i++) {
      probe.copy(look).lerp(pos, Math.min(1, skip / len + (i / SAMPLES) * (1 - skip / len)));
      if (core.physics.blocked(scene, probe, CLEAR)) return false;
      // the same point 1 m above the speaker's ground: posts, poles and shelter columns are walker-only colliders
      // (≤ 1.3 m, so the follow boom may pass them) but still cross a face in a dialogue shot
      probe.addScaledVector(up, 1 - probe.dot(up) + P.dot(up));
      if (core.physics.blocked(scene, probe, CLEAR)) return false;
    }
    return true;
  };
  // P3r3 (look c): the colliders miss visual-only props (小刘's roadwork boards stand 0.6 m beside him — inside the
  // 0.6 m skip of the collider test — the subway canopy, awnings, signs above 1.3 m): the face → lens line is also tested
  // against the rendered world triangles around the speaker (gathered once per speaker, ≈ 2 ms). A candidate hidden
  // that way ranks below every visible one; if none is visible the old collider-only choice stands.
  let tris: TriSet | null = null;
  /** Sample points over the head and the upper body ([lateral m, height from the face centre m]): the score is the
   *  blocked fraction, the head weighted most (a board edge across his face, a slab swallowing half his head). */
  const VIS_HEAD: readonly (readonly [number, number])[] = [[-0.12, 0.02], [0, 0.02], [0.12, 0.02], [-0.1, -0.12], [0, -0.12], [0.1, -0.12]];
  const VIS_BODY: readonly (readonly [number, number])[] = [[-0.16, -0.45], [0, -0.45], [0.16, -0.45], [-0.16, -0.75], [0, -0.75], [0.16, -0.75]];
  const VIS_EDGES: readonly (readonly [number, number])[] = [[-0.9, 0], [0.9, 0], [-0.8, 0.8], [0.8, 0.8], [0, 0.9]];
  const trisAt = new Vector3();
  const face = new Vector3();
  // 0 = clear; 1 = world geometry within ~1 m of the lens across the frame edge (a board filling a third of the frame);
  // else up to 11: how much of his head (×9) and upper body (×2) is behind world geometry
  const vr = new Vector3(), vf = new Vector3(), vp = new Vector3();
  const blockedFrac = (pts: readonly (readonly [number, number])[], k: number): number => {
    let n = 0;
    for (const [side, dh] of pts) {
      // from just in front of the body (0.1 m toward the lens): a wall right behind his shoulder is not in the way
      face.copy(P).addScaledVector(up, headH + dh * k).addScaledVector(vr, side * k).addScaledVector(vf, -0.1);
      if (segmentHitsTris(tris as TriSet, face, pos, 0.05, 0.05, true)) n++;   // world only: the speaker is not in the set
    }
    return n / pts.length;
  };
  const visible = (): number => {
    if (!tris || !tris.count) return 0;
    vf.copy(look).sub(pos).normalize();
    vr.crossVectors(vf, up).normalize();
    const k = Math.min(1, headH / 1.5);                  // a cat / a small spirit: the sample pattern shrinks with it
    const hidden = 9 * blockedFrac(VIS_HEAD, k) + 2 * blockedFrac(VIS_BODY, k);
    if (hidden > 0) return hidden;
    const t = Math.tan((fov * Math.PI) / 360);
    for (const [x, y] of VIS_EDGES) {
      vp.copy(pos).addScaledVector(vf, 1).addScaledVector(vr, x * t * 16 / 9).addScaledVector(up, y * t);
      if (segmentHitsTris(tris, vp.sub(pos).setLength(1.1).add(pos), pos, 0, 0.05, true)) return 1;
    }
    return 0;
  };
  // the chosen candidate is re-tested only on a new speaker or every 15 frames (≤ 162 blocked() calls); a clear
  // candidate with the hero out of frame wins, then one with him only at the edge, then any clear one
  let lastActor: ActorDef | null = null, lastFrame = -1e9, pick = 0;
  return (cam) => {
    const a = target();
    if (!a) return;
    a.root.getWorldPosition(P);
    const center = core.scenes.surface(a.scene).center;
    up.copy(P).sub(center).normalize();
    (a.head ?? a.root).getWorldPosition(head);
    head.sub(P);
    const hh = head.dot(up);
    P.add(head.addScaledVector(up, -hh));        // centre the ring under the head: a posed visual may sit off its root
    headH = Math.min(4, Math.max(0.25, hh + FACE_OVER_BONE));             // perched speakers (小刘 on the pipes) sit high
    core.player.pos(feet);
    hero.copy(feet).addScaledVector(core.player.up(probe), HERO_HEAD);
    // toward the player, in the tangent plane; an NPC that cannot turn (fixedFacing) or a hero right on top of the
    // speaker falls back to the actor's own facing, so the face is filmed rather than the back of the head
    d.copy(feet).sub(P);
    d.addScaledVector(up, -d.dot(up));
    skip = a.root.userData.seated === true ? 1.1 : 0.6;
    eyeOver = a.root.userData.seated === true ? EYE_OVER_SEATED : EYE_OVER;
    const riding = ridesHero(a.root);
    underCap = riding ? 10 : 0.3;                        // a rider's tiny head sits high above the ground: no cap
    // a speaker bigger than a person (> 1.3 m half-size): stand back until it fits, straight on, centre ≈ 40 % from the top
    const rad = riding ? 0 : radiusOf(a.root);
    const big = rad > 1.3;
    // 拆 stands behind the P8 construction net ≈ 3 m out, which a longer boom films through: keep the 2.5 m boom and
    // widen the lens until the glyph fits (≤ 70°)
    // P3r3 (look c): a small speaker (煤球, head ≈ 0.3 m up) was a speck at the bottom of a 2.5 m shot with 王阿婆's legs
    // filling the frame: the boom shrinks with the head height (≥ 0.5 × DIST)
    boom = riding || big ? DIST : DIST * Math.min(1, Math.max(0.5, headH / 1.4));
    fov = big ? Math.min(BIG_FOV, (2 * Math.atan((rad * 0.85) / boom) * 180) / Math.PI) : FOV;
    bigDrop = big ? 0.1 * 2 * boom * Math.tan((fov * Math.PI) / 360) : 0;
    const nc = a.root.userData.fixedFacing === true || riding || big ? CANDIDATES_FIXED : CANDIDATES;
    if (nc !== cands) { cands = nc; lastFrame = -1e9; }
    if (d.lengthSq() < 0.04 || a.root.userData.fixedFacing === true || riding) {
      d.set(0, 0, 1).transformDirection((a.root.userData.facingObject as typeof a.root | undefined)?.matrixWorld ?? a.root.matrixWorld);
      d.addScaledVector(up, -d.dot(up));
    }
    d.normalize();
    if (a !== lastActor || core.clock.frame - lastFrame >= 15) {
      if (a !== lastActor || !tris || trisAt.distanceTo(P) > 1) {
        trisAt.copy(P);
        try { tris = gatherTris(core.scenes.get(a.scene), P, boom * 1.2 + 1.5, isVisualOccluder); } catch { tris = null; }
      }
      lastActor = a; lastFrame = core.clock.frame;
      gatherCaps(a);
      const dist = P.distanceTo(hero);
      let best = NONE, bestScore = 99;
      dialogCamDebug.scores.length = 0;
      // a fixed-facing speaker is filmed near its own front: the hero at the frame edge is fine there (swinging on to
      // get him out of frame put the ending's camera round the shelter, behind a post)
      const good = 2 * (riding ? 2 : cands === CANDIDATES_FIXED ? 1 : 0);   // scores: 2 × heroCover + visible()   // on his shoulder: he is in the shot by design
      // he stands in front of a fixed-facing speaker, within reach: over his shoulder first
      probe.copy(feet).sub(P);
      if (!riding && !big && cands === CANDIDATES_FIXED && dist < 3.2 && probe.dot(d) > 0.4) {
        for (const k of [-1, -2, -3, -4]) {
          place(k);
          if (!clear(a.scene) || visible() > 0) continue;
          best = k; bestScore = 2;
          break;
        }
      }
      for (let k = 0; k < cands.length && bestScore > good; k++) {
        place(k);
        if (!clear(a.scene)) { dialogCamDebug.scores[k] = -1; continue; }
        // far-side last resorts film the back of a speaker who turned to the hero: +3, so they only beat a face that is
        // half hidden or worse
        const far = cands === CANDIDATES && k >= CANDIDATES_NEAR.length ? 3 : 0;
        const sc = 2 * heroCover(pos, look, up, hero, Math.max(dist, boom * cands[k][1]), cam.aspect || 16 / 9, fov) + visible() + far;
        dialogCamDebug.scores[k] = sc;
        if (sc < bestScore) { bestScore = sc; best = k; }
      }
      pick = best !== NONE ? best : cands === CANDIDATES ? FALLBACK_NEAR : cands.length - 1;
      dialogCamDebug.pick = pick; dialogCamDebug.score = bestScore;
    }
    place(pick);
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(look);
    const f = pick < 0 && pick !== NONE ? OTS[pick <= -3 ? 1 : 0].fov : fov;
    if (cam.fov !== f || cam.near !== 0.1) { cam.fov = f; cam.near = 0.1; cam.far = 250; cam.updateProjectionMatrix(); }
  };
}
