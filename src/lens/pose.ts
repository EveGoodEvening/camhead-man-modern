// src/lens/pose.ts — owner D. First-person lens pose (GDD §3.3 viewfinder, §3.11 detach; ART §6.4):
// lens at the head (1.72 m, +0.05 m forward), pitch −60..+70°, zoom 1/3/10 → vFOV 55/20/6.5°; peeks look from a
// fixed mount with yaw ±60° / pitch ±45° around their base direction. The lens camera always carries the nominal
// FOV (evalShot and captures are deterministic); the displayed FOV tweens (50→55° over 0.35 s on entry).
import { PerspectiveCamera, Vector3 } from 'three';
import type { Core } from '../contracts';
import type { SceneId, Zoom } from '../types';
import { DEG, SURFACES, dirToHeading, frameAt, headingToDir, type SurfaceFrame } from '../core/planet';
import type { LensPose } from './view';

export const ZOOM_FOV: Readonly<Record<Zoom, number>> = { 1: 55, 3: 20, 10: 6.5 };
export const ENTER_FOV = 50;
export const ENTER_SECONDS = 0.35;
export const ZOOM_SECONDS = 0.15;
export const PITCH_MIN = -60, PITCH_MAX = 70;
export const EYE = 1.72, EYE_SIT = 1.7, FORWARD = 0.05;
export const PEEK_YAW = 60, PEEK_PITCH = 45;
export const LOOK_RAD_PER_PX = 0.0025;
/** P3 G10: every photo (and so every evalShot) is 16:9 at the lens vFOV, whatever the window's aspect. */
export const PHOTO_ASPECT = 16 / 9;
/** The main camera's vFOV while the viewfinder shows `photoVfov` in a window of `aspect`: wider windows keep it (the
 *  sides outside the photo are matted), narrower ones widen it until the photo's full width fits (top/bottom matte). */
export function displayFov(photoVfov: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= PHOTO_ASPECT) return photoVfov;
  return (2 * Math.atan((Math.tan((photoVfov * DEG) / 2) * PHOTO_ASPECT) / aspect)) / DEG;
}

/** P3r3 (open-play d): the tripod view shows more than the photo will — tan(vFOV/2) × TRIPOD_WIDE — so the stair foot
 *  the body must walk round is on screen; a light matte marks the photo's own 16:9 frame (the photo is unchanged). */
export const TRIPOD_WIDE = 1.3;
/** vFOV (deg) whose half-angle tangent is k × that of `fov`. */
export function widenFov(fov: number, k: number): number {
  return (2 * Math.atan(Math.tan((fov * DEG) / 2) * k)) / DEG;
}

export interface PeekBase { scene: SceneId; pos: Vector3; yaw: number; pitch: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createPose(core: Core) {
  const cam = new PerspectiveCamera(55, 16 / 9, 0.05, 250);
  cam.name = 'lens';
  const fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  const pose: LensPose = { pos: new Vector3(), dir: new Vector3(), up: new Vector3(), yaw: 0, pitch: 0, scene: 'planet' };
  const hd = new Vector3(), tgt = new Vector3();
  let pitch = 0;
  let lastRig = 0;
  let peek: PeekBase | null = null;
  let dYaw = 0, dPitch = 0;
  let fovShown = ENTER_FOV, fovFrom = ENTER_FOV, fovTo = 55, fovT0 = 0, fovDur = 0;

  const dirFrom = (f: SurfaceFrame, yaw: number, p: number, out: Vector3) =>
    headingToDir(f, yaw, out).multiplyScalar(Math.cos(p * DEG)).addScaledVector(f.up, Math.sin(p * DEG));

  const api = {
    cam, pose,
    get pitch() { return pitch; },
    get peek() { return peek; },
    /** Entering the viewfinder starts from the rig's yaw/pitch (ARCHITECTURE §3.D). */
    enter(zoom: Zoom) {
      pitch = clamp(core.cameraRig.pitchDeg, PITCH_MIN, PITCH_MAX);
      lastRig = core.cameraRig.pitchDeg;
      api.tweenFov(ENTER_FOV, ZOOM_FOV[zoom], ENTER_SECONDS);
    },
    /** Leaving hands the (clamped) pitch back to the follow camera. */
    exit() {
      // a teleport (goto → cameraRig.look) that closes us has already set the new pitch: keep it
      if (core.cameraRig.pitchDeg === lastRig) core.cameraRig.pitchDeg = pitch;
      lastRig = core.cameraRig.pitchDeg;
    },
    setPeek(b: PeekBase | null) { peek = b; dYaw = 0; dPitch = 0; },
    tweenFov(from: number, to: number, seconds: number) {
      fovFrom = from; fovTo = to; fovT0 = core.clock.t; fovDur = core.params.test ? 0 : seconds;
      fovShown = fovDur > 0 ? from : to;
    },
    /** Mouse look (px), scaled by zoom so 10× is steerable. */
    look(dx: number, dy: number, zoom: Zoom, bodyTurns: boolean) {
      const k = LOOK_RAD_PER_PX * (ZOOM_FOV[zoom] / 55);
      if (peek) {
        dYaw = clamp(dYaw + (dx * k) / DEG, -PEEK_YAW, PEEK_YAW);
        dPitch = clamp(dPitch - (dy * k) / DEG, -PEEK_PITCH, PEEK_PITCH);
        return;
      }
      if (dx && bodyTurns) core.player.rotateHeading(dx * k);
      if (dy) pitch = clamp(pitch - (dy * k) / DEG, PITCH_MIN, PITCH_MAX);
    },
    /** Point the lens along a world direction (aim). */
    aimDir(dir: Vector3) {
      if (peek) {
        frameAt(SURFACES[peek.scene], peek.pos, fr);
        const y = dirToHeading(fr, dir), p = Math.asin(clamp(dir.dot(fr.up), -1, 1)) / DEG;
        dYaw = clamp(((((y - peek.yaw) % 360) + 540) % 360) - 180, -PEEK_YAW, PEEK_YAW);
        dPitch = clamp(p - peek.pitch, -PEEK_PITCH, PEEK_PITCH);
        return;
      }
      core.player.pos(tgt);
      frameAt(SURFACES[core.player.scene], tgt, fr);
      core.player.setYaw(dirToHeading(fr, dir));
      pitch = clamp(Math.asin(clamp(dir.dot(fr.up), -1, 1)) / DEG, PITCH_MIN, PITCH_MAX);
    },
    setPitch(p: number) { pitch = clamp(p, PITCH_MIN, PITCH_MAX); },
    /** Absolute yaw/pitch (degrees, local frame) — `__game.look()` while the lens is active (requests-D #4). */
    lookAbs(yaw: number, p: number) {
      if (peek) {
        dYaw = clamp(((((yaw - peek.yaw) % 360) + 540) % 360) - 180, -PEEK_YAW, PEEK_YAW);
        dPitch = clamp(p - peek.pitch, -PEEK_PITCH, PEEK_PITCH);
        return;
      }
      core.player.setYaw(yaw);
      pitch = clamp(p, PITCH_MIN, PITCH_MAX);
    },
    /** Recompute pose + lens camera (nominal FOV). Cheap; safe to call several times per tick. */
    update(zoom: Zoom, aspect: number): LensPose {
      // __game.look()/cameraRig.look() while the viewfinder is open: adopt the rig's new pitch (it is clamped −30..20)
      if (core.cameraRig.pitchDeg !== lastRig) { lastRig = core.cameraRig.pitchDeg; pitch = clamp(lastRig, PITCH_MIN, PITCH_MAX); }
      if (peek) {
        const s = SURFACES[peek.scene];
        frameAt(s, peek.pos, fr);
        pose.pos.copy(peek.pos);
        pose.scene = peek.scene;
        pose.yaw = (((peek.yaw + dYaw) % 360) + 360) % 360;
        pose.pitch = clamp(peek.pitch + dPitch, -89, 89);
      } else {
        const scene = core.player.scene;
        core.player.pos(pose.pos);
        core.player.up(fr.up);
        core.player.heading(hd);
        const eye = core.player.pose === 'sit' ? EYE_SIT : EYE;
        pose.pos.addScaledVector(fr.up, eye).addScaledVector(hd, FORWARD);
        frameAt(SURFACES[scene], pose.pos, fr);
        pose.scene = scene;
        pose.yaw = dirToHeading(fr, hd);
        pose.pitch = pitch;
      }
      dirFrom(fr, pose.yaw, pose.pitch, pose.dir).normalize();
      pose.up.copy(fr.up);
      cam.position.copy(pose.pos);
      cam.up.copy(fr.up);
      cam.lookAt(tgt.copy(pose.pos).add(pose.dir));
      const fov = ZOOM_FOV[zoom];
      if (cam.fov !== fov || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
      return pose;
    },
    /** Displayed FOV for the main camera (tweened on entry / zoom). */
    shownFov(zoom: Zoom): number {
      if (fovTo !== ZOOM_FOV[zoom]) api.tweenFov(fovShown, ZOOM_FOV[zoom], ZOOM_SECONDS);
      if (fovDur <= 0) fovShown = fovTo;
      else {
        const k = clamp((core.clock.t - fovT0) / fovDur, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        fovShown = fovFrom + (fovTo - fovFrom) * e;
        if (k >= 1) fovDur = 0;
      }
      return fovShown;
    },
  };
  return api;
}
export type Pose = ReturnType<typeof createPose>;
