// src/story/cams.ts — owner F. Camera overrides for beats (ART §6.4 conventions: camera.up = the local up of the
// subject, headings clockwise from local north). Every override reuses its vectors (no per-frame allocation).
import { Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { CameraOverride, Core } from '../contracts';
import type { SceneId } from '../types';
import { DEG, SURFACES, dirToHeading, flatToChart, frameAt, headingToDir, posToWorld, worldToFlat, type SurfaceFrame } from '../core/planet';
import type { ChartPos } from '../types';
import { TITLE, titlePose } from '../core/cameraRig';
import { setLens, smooth } from './director';

export interface Shot { pos: Vector3; look: Vector3; up: Vector3; fov: number }

const mkFrame = (): SurfaceFrame => ({ up: new Vector3(), north: new Vector3(), east: new Vector3() });

/** A camera placed relative to a subject: `back` metres along −facing (negative = in front), `side` to the right. */
export function relShot(scene: SceneId, subject: Vector3, facing: Vector3, o: RelOpts): Shot {
  const f = frameAt(SURFACES[scene], subject, mkFrame());
  const fwd = facing.clone().addScaledVector(f.up, -facing.dot(f.up)).normalize();
  const right = fwd.clone().cross(f.up).normalize();
  const pos = subject.clone().addScaledVector(fwd, -o.back).addScaledVector(right, o.side).addScaledVector(f.up, o.height);
  const look = subject.clone().addScaledVector(f.up, o.lookH).addScaledVector(fwd, o.lookFwd ?? 0);
  return { pos, look, up: f.up.clone(), fov: o.fov };
}

export interface RelOpts { back: number; side: number; height: number; lookH: number; lookFwd?: number; fov: number }

const _probe = new Vector3(), _dir = new Vector3();
const SHOT_CLEARANCE = 0.3;

/** Line of sight from a framing's look point to its camera is free of colliders (the camera-boom test). The first
 *  `skip` metres are not tested: the subject itself may sit against a collider (a bench, a railing). */
export function segmentClear(core: Core, scene: SceneId, look: Vector3, cam: Vector3, skip = 0.6): boolean {
  const len = look.distanceTo(cam);
  if (len <= skip) return true;
  const n = Math.max(2, Math.ceil((len - skip) / 0.25));
  for (let i = 0; i <= n; i++) {
    const k = (skip + ((len - skip) * i) / n) / len;
    try { if (core.physics.blocked(scene, _probe.copy(look).lerp(cam, k), SHOT_CLEARANCE)) return false; } catch { return true; }
  }
  return true;
}

/** relShot framings around a subject whose sight lines are all clear: the designed angle first, then the same
 *  framing swung round the subject (B's props move; a fixed offset can end up inside a wall). */
export function clearShots(core: Core, scene: SceneId, subject: Vector3, facing: Vector3, opts: readonly RelOpts[],
  swings: readonly number[] = [0, 30, -30, 60, -60, 95, -95, 135, -135, 180]): Shot[] {
  const f = frameAt(SURFACES[scene], subject, mkFrame());
  for (const deg of swings) {
    _dir.copy(facing).applyAxisAngle(f.up, deg * DEG);
    const shots = opts.map((o) => relShot(scene, subject, _dir, o));
    if (shots.every((s) => segmentClear(core, scene, s.look, s.pos))) return shots;
  }
  // nothing clear: pull the designed framing in toward the subject
  return opts.map((o) => relShot(scene, subject, facing, { ...o, back: o.back * 0.45, side: o.side * 0.45 }));
}

/** P3r2 look L2: a speaker filmed front-on (the Messenger dialogue framing: face above the dialogue box). The camera
 *  stands `dist` m in front of the actor's own facing at `eyeOver` above its face, looking `lookDrop` below the face
 *  (a held object at the chest stays in frame); swung round the actor when a collider or another actor is in the way.
 *  Returns null when the actor is not in the current scene. */
export interface FaceOpts { dist: number; side?: number; eyeOver?: number; lookDrop?: number; fov: number }
const _hp = new Vector3(), _fw = new Vector3(), _rp = new Vector3(), _q2 = new Vector3();
/** `swings` = [] frames straight on without the collider test (an upstairs gallery stands inside its building's
 *  footprint collider, so every sight line from it "hits" and clearShots fell back to a 2 m top-down shot). */
export function faceShots(core: Core, actorId: string, opts: readonly FaceOpts[], swings?: readonly number[], facing?: Vector3): Shot[] | null {
  const a = core.actors.get(actorId);
  if (!a || a.scene !== core.player.scene) return null;
  a.root.updateWorldMatrix(true, true);
  a.root.getWorldPosition(_rp);
  (a.head ?? a.root).getWorldPosition(_hp);
  const f = frameAt(SURFACES[a.scene], _rp, mkFrame());
  const headH = _hp.clone().sub(_rp).dot(f.up) + 0.1;                 // the head bone sits at the neck
  const face = (a.root.userData.facingObject as typeof a.root | undefined) ?? a.root;
  if (facing) _fw.copy(facing); else _fw.set(0, 0, 1).transformDirection(face.matrixWorld);
  _fw.addScaledVector(f.up, -_fw.dot(f.up));
  if (_fw.lengthSq() < 1e-6) return null;
  _fw.normalize();
  const feet = _hp.clone().addScaledVector(f.up, -_hp.clone().sub(_rp).dot(f.up));
  // stand off to the side away from the nearest neighbour (the lineup: 老陈 filled a third of 小林's close-up)
  const right = _fw.clone().cross(f.up).normalize();
  let nb = 0, nbD = 2.2;
  for (const o of core.actors.list(a.scene)) {
    if (o === a || o.id === 'hero' || !o.root.visible || o.layer === 'photo_only') continue;
    const d = o.root.getWorldPosition(_q2).sub(feet);
    const dd = d.length();
    if (dd < nbD) { nbD = dd; nb = Math.sign(d.dot(right)) || 1; }
  }
  const sgn = nb === 0 ? 1 : -nb;
  const rel = opts.map((o) => ({ back: -o.dist, side: sgn * Math.abs(o.side ?? 0), height: headH + (o.eyeOver ?? 0.05), lookH: headH - (o.lookDrop ?? 0.2), fov: o.fov }));
  const sw = swings ?? [0, 15, -15, 30, -30, 50, -50];
  if (sw.length === 0) return rel.map((o) => relShot(a.scene, feet, _fw, o));
  return clearShots(core, a.scene, feet, _fw.clone(), rel, nb === 0 ? sw : sw.map((x) => -nb * x));
}

/** Static or slowly dollying shot between two framings over `seconds` (eased). */
export function dolly(a: Shot, b: Shot, t0: number, seconds: number, now: () => number): CameraOverride {
  const pos = new Vector3(), look = new Vector3(), up = new Vector3();
  return (cam: PerspectiveCamera) => {
    const k = smooth((now() - t0) / Math.max(0.001, seconds));
    pos.lerpVectors(a.pos, b.pos, k);
    look.lerpVectors(a.look, b.look, k);
    up.lerpVectors(a.up, b.up, k).normalize();
    setLens(cam, a.fov + (b.fov - a.fov) * k, 0.1, 250);
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(look);
  };
}

/** Pan in place around `center` (a 360° look-around, GDD S_sunset): heading from `startYaw`, `sweep` degrees. */
export function pan(center: Vector3, scene: SceneId, startYaw: number, sweep: number, pitch: number, t0: number, seconds: number, now: () => number, fov = 55): CameraOverride {
  const f = frameAt(SURFACES[scene], center, mkFrame());
  const dir = new Vector3(), look = new Vector3(), pos = new Vector3();
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  return (cam: PerspectiveCamera) => {
    const x = Math.min(1, Math.max(0, (now() - t0) / seconds));
    // ease in/out only at the very ends so the middle is a steady turn
    const k = x < 0.12 ? (x * x) / 0.24 : x > 0.88 ? 1 - ((1 - x) * (1 - x)) / 0.24 : x - 0.06;
    headingToDir(f, startYaw + sweep * (k / 0.94), dir);
    dir.multiplyScalar(cp).addScaledVector(f.up, sp);
    // orbit the eye 1.2 m around the centre so the parallax reads as a camera move, not a rotating skybox
    pos.copy(center).addScaledVector(dir, -1.2);
    look.copy(pos).addScaledVector(dir, 10);
    setLens(cam, fov, 0.1, 250);
    cam.position.copy(pos);
    cam.up.copy(f.up);
    cam.lookAt(look);
  };
}

/** Orbit around `center` (GDD S_sunset 「镜头绕天台转 360°」): the camera sits `radius` out at heading `startYaw + sweep·k`,
 *  `height` above, and looks back at the centre, so whatever lies beyond the centre scrolls past behind it. */
export function orbit(center: Vector3, scene: SceneId, startYaw: number, sweep: number, radius: number, height: number, t0: number, seconds: number, now: () => number, fov = 50, lookDrop = 0.9): CameraOverride {
  const f = frameAt(SURFACES[scene], center, mkFrame());
  const dir = new Vector3(), pos = new Vector3(), look = new Vector3();
  return (cam: PerspectiveCamera) => {
    const x = Math.min(1, Math.max(0, (now() - t0) / seconds));
    const k = x < 0.12 ? (x * x) / 0.24 : x > 0.88 ? 1 - ((1 - x) * (1 - x)) / 0.24 : x - 0.06;
    headingToDir(f, startYaw + sweep * (k / 0.94), dir);
    pos.copy(center).addScaledVector(dir, radius).addScaledVector(f.up, height);
    // look through the subject toward the horizon (≈ −15° pitch): the landmark behind him (lighthouse, crane, 拆)
    // sits on the curved skyline above his shoulder, the roof and the town fill the lower half
    look.copy(center).addScaledVector(f.up, -height * lookDrop).addScaledVector(dir, -radius * 1.5);
    setLens(cam, fov, 0.1, 250);
    cam.position.copy(pos);
    cam.up.copy(f.up);
    cam.lookAt(look);
  };
}

/** Rise from the current camera to the ART §6.4 title orbit over `seconds`. The end pose is the orbit's own pose at
 *  the current animT, so handing over to cameraRig.setTitleMode(true) at the end is seamless. */
export function pullBack(startPos: Vector3, startLook: Vector3, startUp: Vector3, t0: number, seconds: number, now: () => number, animT: () => number): CameraOverride {
  const startDir = startPos.clone().normalize();
  const r0 = Math.max(81, startPos.length());
  const endPos = new Vector3(), endDir = new Vector3(), endLook = new Vector3(0, TITLE.lookY, 0), endUp = new Vector3(0, 1, 0);
  const dir = new Vector3(), pos = new Vector3(), look = new Vector3(), up = new Vector3();
  return (cam: PerspectiveCamera) => {
    const k = smooth((now() - t0) / seconds);
    titlePose(animT() * TITLE.rate, endPos);
    endDir.copy(endPos).normalize();
    const r1 = endPos.length();
    dir.copy(startDir).lerp(endDir, k).normalize();
    pos.copy(dir).multiplyScalar(r0 * Math.pow(r1 / r0, k));
    look.lerpVectors(startLook, endLook, Math.min(1, k * 1.2));
    up.lerpVectors(startUp, endUp, k).normalize();
    const r = pos.length();
    setLens(cam, 50 + (TITLE.fov - 50) * k, Math.max(0.1, Math.min(TITLE.near, (r - 90) * 0.6)), Math.max(250, Math.min(TITLE.far + 100, r + 150)));
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(look);
  };
}

// ------------------------------------------------------------------------------------------------ darkroom (P3r2 L1)
/** P3r2 look L1: the darkroom steps (GDD §9 S_darkroom 1–4) are guided E presses at the bench, and the follow camera
 *  stood behind him with his body over the trays. From the first E (safelight on) until shortly after the negatives are
 *  hung, a bench camera films from the west end of the bench — the lamp, the lit tray with the print coming up, and him
 *  — and when the third tray hangs the negatives (「举起镜头看看」) it looks over his head at the drying line for
 *  DK_LINE_HOLD s. It lets go when he walks off, the viewfinder opens or the beat takes over. Studio-local coordinates
 *  (x east, z south, y up; world/interiors/plans.ts STUDIO). */
export const DK_LINE_HOLD = 3.2;
export const DK_BENCH_REACH = 1.3;
/** Pure: the bench shot (local coords) for the tray the print is in (null = the lamp + bench before the first tray). */
export function darkroomBenchShot(tray: { x: number; z: number } | null, hero: { x: number; z: number }): { pos: [number, number, number]; look: [number, number, number] } {
  // the camera stands at the bench's west end, north of the drying line, a little under his eye line: the safelight
  // stays in the top of the frame. Before the first tray it looks between him and the lamp; then between the lit tray
  // (the print coming up in it) and his hands.
  if (!tray) return { pos: [1.85, 1.6, -0.75], look: [(3.3 + hero.x) / 2, 1.75, (-3.2 + hero.z) / 2] };
  const lx = tray.x * 0.55 + hero.x * 0.45, lz = tray.z * 0.55 + hero.z * 0.45;
  return { pos: [1.85, 1.6, -0.75], look: [lx, 1.3, lz] };
}
/** Pure: over his head from the bench side, at the negatives on the drying line. */
export function darkroomLineShot(): { pos: [number, number, number]; look: [number, number, number] } {
  return { pos: [3.85, 2.55, -2.45], look: [3.2, 1.45, -0.5] };
}

export function installDarkroomCams(core: Core): void {
  let pop: (() => void) | null = null;
  let mode: 'bench' | 'line' | null = null, lineUntil = -1, hungSeen = false;
  const pos = new Vector3(), look = new Vector3(), up = new Vector3(), feet = new Vector3();
  const local = (p: readonly [number, number, number], out: Vector3) => posToWorldLocal(p, out);
  const fov = { bench: 50, line: 46 } as const;
  const override: CameraOverride = (cam) => {
    const stand = worldToFlatLocal(core.player.pos(feet));
    const has = (f: string) => core.store.has(f as never);
    const tray = !has('dk_tray_1') ? null : has('dk_tray_3') ? STUDIO_TRAYS.blue : has('dk_tray_2') ? STUDIO_TRAYS.white : STUDIO_TRAYS.brown;
    const s = mode === 'line' ? darkroomLineShot() : darkroomBenchShot(tray, stand);
    local(s.pos, pos); local(s.look, look);
    up.copy(pos).sub(SURFACES.studio_int.center).normalize();
    setLens(cam, mode === 'line' ? fov.line : fov.bench, 0.1, 60);
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(look);
  };
  const release = (ease: boolean) => {
    if (!pop) return;
    pop(); pop = null; mode = null;
    core.cameraRig.snap();
    if (ease) core.cameraRig.blend?.(0.5);
  };
  core.bus.on('stateLoaded', () => { release(false); hungSeen = core.store.has('dk_hung' as never); });
  core.bus.on('sceneChanged', () => release(false));
  core.bus.on('flagSet', (e) => { if (e.flag === 'dk_hung') { hungSeen = true; lineUntil = core.clock.t + DK_LINE_HOLD; } });
  core.loop.addSystem('story:dkcam', 'logic', () => {
    const has = (f: string) => core.store.has(f as never);
    let want: 'bench' | 'line' | null = null;
    if (core.player.scene === 'studio_int' && has('dk_lit') && !has('developed')) {
      const f = worldToFlatLocal(core.player.pos(feet));
      const near = Math.hypot(f.x - DK_STAND.x, f.z - DK_STAND.z) <= DK_BENCH_REACH;
      let lensOn = false;
      try { lensOn = core.services.lens.state.active; } catch { /* lens not ready */ }
      let beat = false;
      try { beat = core.services.story.currentBeat() !== null; } catch { /* story not ready */ }
      if (near && !lensOn && !beat) {
        if (!has('dk_hung')) want = 'bench';
        else if (hungSeen && core.clock.t < lineUntil) want = 'line';
      }
    }
    if (want === mode) return;
    if (!want) { release(true); return; }
    if (!pop) {
      const top = core.cameraRig.top();
      if (top !== null) return;                        // a dialogue / the lens owns the camera: wait
      core.cameraRig.snap();
      core.cameraRig.blend?.(0.6);
      pop = core.cameraRig.push('story:dk', override);
    } else core.cameraRig.blend?.(0.8);                // bench → line: a camera move, not a cut
    mode = want;
  });
}
/** P3r2 look L1: S_darkroom's closing shot: the developed print on the drying line (left / centre), him beside it. */
export function darkroomPrintCam(): CameraOverride {
  const pos = posToWorldLocal([2.35, 1.55, 1.3], new Vector3()), look = posToWorldLocal([3.45, 1.5, -0.45], new Vector3());
  const up = pos.clone().sub(SURFACES.studio_int.center).normalize();
  return (cam) => { setLens(cam, 50, 0.1, 60); cam.position.copy(pos); cam.up.copy(up); cam.lookAt(look); };
}
/** dk_bench's stand point (data/locations.ts). */
const DK_STAND = { x: 3.5, z: -1.6 } as const;
const STUDIO_TRAYS = { brown: { x: 2.7, z: -3.05 }, white: { x: 3.5, z: -3.05 }, blue: { x: 4.3, z: -3.05 } } as const;
function posToWorldLocal(p: readonly [number, number, number], out: Vector3): Vector3 { return posToWorld('studio_int', { x: p[0], y: p[1], z: p[2] }, out); }
function worldToFlatLocal(v: Vector3): { x: number; z: number } { return worldToFlat(SURFACES.studio_int, v); }

// ------------------------------------------------------------------------------------------------ ending A (P3r3 L3)
/** P3r3 look L3: ending A's boarding (GDD §15.1 「主角上车，车门关上」), staged in the PARKED bus's own frame (chars/bus.ts:
 *  x = the bus's left, the kerb-side door at x −1.26 / z BUS.doorZ, z = forward, y up). The old side shot was built
 *  from wherever he stood and filmed the shelter bench, a bin or a flat bus side. He is put on the kerb 0.95 m from the
 *  open door facing it; the camera stands on the kerb ahead of the bus, 0.95 m off its side, and looks back along it at
 *  the doorway (him, the uniform in the door, the bus's nose and headlight), pushing in a little while he steps in. */
/** chars/bus.ts BUS.doorZ (asserted equal in a test; story does not import C's internals). */
export const BUS_DOOR_Z = 3.8;
export const BOARD_STAGE = {
  stand: [-2.2, 0, BUS_DOOR_Z] as const,
  /** metres he walks along +x (through the doorway, where the body side hides him) */
  walk: 1.3,
  a: { pos: [-2.2, 1.7, BUS_DOOR_Z + 3.5] as const, look: [-1.9, 1.1, BUS_DOOR_Z - 0.1] as const },
  b: { pos: [-2.1, 1.64, BUS_DOOR_Z + 2.9] as const, look: [-1.8, 1.12, BUS_DOOR_Z - 0.1] as const },
  fov: 50,
} as const;
const _bl = new Vector3();
function busLocal(bus: Object3D, p: readonly [number, number, number], out = new Vector3()): Vector3 {
  bus.updateWorldMatrix(true, false);
  return out.set(p[0], p[1], p[2]).applyMatrix4(bus.matrixWorld);
}
/** World framings + his stand point / heading for the boarding, from the parked bus's root. */
export function boardShots(bus: Object3D): { a: Shot; b: Shot; stand: ChartPos; yawDeg: number } {
  const S = BOARD_STAGE;
  const standW = busLocal(bus, S.stand);
  const f = frameAt(SURFACES.planet, standW, mkFrame());
  const shot = (o: { pos: readonly [number, number, number]; look: readonly [number, number, number] }): Shot => {
    const pos = busLocal(bus, o.pos);
    return { pos, look: busLocal(bus, o.look), up: frameAt(SURFACES.planet, pos, mkFrame()).up.clone(), fov: S.fov };
  };
  // he faces the door: the bus's +x (its left = toward the lane) at his feet, flattened
  const into = busLocal(bus, [S.stand[0] + 1, 0, S.stand[2]], _bl).sub(standW);
  into.addScaledVector(f.up, -into.dot(f.up)).normalize();
  const c = flatToChart(worldToFlat(SURFACES.planet, standW));
  return { a: shot(S.a), b: shot(S.b), stand: { r: c.r, lon: c.lon, h: 0 }, yawDeg: dirToHeading(f, into) };
}
