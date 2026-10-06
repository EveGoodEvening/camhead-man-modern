// src/lens/modes.ts — owner D. Viewfinder open/close and the four peeks (GDD §3.3, §3.11; ARCHITECTURE §3.D):
// camera override, input context, speed cap 1.2 m/s + strafe, hero first person, GHOST layer while night is on,
// render.setViewfinder. Peeks teleport to their spot first (D's own teleport never closes the viewfinder).
import { Object3D, Vector3, type PerspectiveCamera } from 'three';
import type { CameraOverride } from '../contracts';
import type { PeekId, SceneId, SpotId, StrKey } from '../types';
import { t } from '../data/zh';
import { LAYER } from '../core/layers';
import { DEG, SURFACES, dirToHeading, frameAt, headingToDir, type SurfaceFrame } from '../core/planet';
import { EYE, TRIPOD_WIDE, displayFov, widenFov } from './pose';
import { groupAim } from './tripod';
import type { LensCtx } from './ctx';
import type { Shots } from './capture';

export const VF_SPEED = 1.2;
/** How far the lh_door view steps into the doorway toward the tower axis (m). */
export const LH_STEP_IN = 1.4;
/** How far the pk_coop head sits past the coop_door anchor (0.05 m proud of the door) into the coop (m). */
export const COOP_IN = 0.38;   // P3r3: 0.15 left the door post and wire edge across the left third of the view
/** P3r3 (open-play d): the head rides this high above the coop_door anchor (the door's sill, 7 cm over the coop floor:
 *  the old view was two thirds floor) and looks down at the pigeons on their negative, which sit COOP_LOOK_BACK m
 *  behind the coop_inside anchor and COOP_LOOK_UP above it. */
export const COOP_RAISE = 0.42, COOP_LOOK_UP = 0.1, COOP_LOOK_BACK = 0.12;
export const PEEK_SPOT: Readonly<Record<PeekId, SpotId>> = {
  pk_coop: 'pk_coop', pk_psd: 'pk_psd', tripod: 'sp_tripod', lh_door: 'sp_lighthouse_door',
};

export function createModes(lc: LensCtx, shots: Shots) {
  const { core, state, pose, anchors } = lc;
  const fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  const tmp = new Vector3(), tmp2 = new Vector3();
  let popCam: (() => void) | null = null;
  let popCtx: (() => void) | null = null;
  let mount: Object3D | null = null;
  let detached = false;
  let vfSince = 0;
  let negative = false;
  /** core.clock.frame of the last enterPeek: core interact (loop phase `player`) mounts the head on a real E, and the
   *  lens input (phase `lens`, same tick) still sees that E pressed — it must not also exit / start the timer (G1). */
  let enteredFrame = -1;
  const listeners: ((on: boolean) => void)[] = [];

  const hero = () => { try { return core.services.chars.hero; } catch { return null; } };
  const syncRender = () => {
    try { core.services.render.setViewfinder({ on: state.active, night: state.active && state.night, negative }); }
    catch (e) { core.log.warn('[lens] render.setViewfinder failed', e); }
  };
  const emitLens = () => core.bus.emit('lensChanged', { zoom: state.zoom, night: state.night, flash: state.flash, overlay: state.overlay, torch: state.torch });

  /** The main camera follows the lens pose; displayed FOV tweens; GHOST only in the night viewfinder. */
  const override: CameraOverride = (camera: PerspectiveCamera) => {
    const p = lc.updatePose();
    camera.position.copy(p.pos);
    camera.quaternion.copy(pose.cam.quaternion);
    camera.up.copy(p.up);
    const shown = displayFov(pose.shownFov(state.zoom), camera.aspect);
    const fov = state.peek === 'tripod' ? widenFov(shown, TRIPOD_WIDE) : shown;
    if (camera.fov !== fov || camera.near !== 0.05 || camera.far !== 250) {
      camera.fov = fov; camera.near = 0.05; camera.far = 250; camera.updateProjectionMatrix();
    }
    camera.layers.set(LAYER.WORLD);
    if (state.night) camera.layers.enable(LAYER.GHOST);
  };

  const pushCamera = () => { if (!popCam) popCam = core.cameraRig.push('lens', override); };
  const popAll = () => {
    popCam?.(); popCam = null;
    popCtx?.(); popCtx = null;
    core.cameraRig.camera.layers.set(LAYER.WORLD);
  };

  const api = {
    get since() { return vfSince; },
    get negative() { return negative; },
    /** True while the tick that entered the current peek is still running (its E edge belongs to the mount). */
    get justEntered() { return state.peek !== null && enteredFrame === core.clock.frame; },
    setNegative(on: boolean) { if (negative !== on) { negative = on; syncRender(); } },
    onChange(fn: (on: boolean) => void) { listeners.push(fn); },
    syncRender, emitLens,
    open() {
      if (state.active) return;
      state.active = true;
      state.frame = 'white';
      pose.enter(state.zoom);
      pushCamera();
      // hold-to-aim: the RMB (and a held shutter) survive the push, so the real mouseup still releases aimHold
      popCtx = core.input.pushContext('viewfinder', 'lens', { keep: ['aimHold', 'shutter'] });
      core.player.setSpeedCap('lens', VF_SPEED);
      core.player.setStrafe(true);
      hero()?.setFirstPerson(true);
      try { hero()?.setScreen('rec'); } catch { /* C not ready */ }
      vfSince = core.clock.t;
      shots.reset();
      lc.invalidate();
      syncRender();
      core.bus.emit('viewfinder', { on: true });
      for (const f of listeners) f(true);
    },
    close() {
      if (state.peek) { void api.exitPeek(); return; }
      if (!state.active) return;
      shots.cancel();
      state.active = false; state.night = false; state.zoom = 1; state.frame = 'white';
      negative = false;
      popAll();
      core.player.setSpeedCap('lens', null);
      core.player.setStrafe(false);
      hero()?.setFirstPerson(false);
      try { hero()?.setScreen('status'); } catch { /* C not ready */ }
      pose.exit();
      lc.invalidate();
      syncRender();
      try { core.services.render.setSmoke(null); } catch { /* A not ready */ }
      core.bus.emit('viewfinder', { on: false });
      core.bus.emit('lensHint', { cond: null, target: null });
      emitLens();
      for (const f of listeners) f(false);
    },
    /** GDD §3.11: teleport to the peek spot, detach the head onto its mount, fixed first-person view. */
    enterPeek(id: PeekId): Promise<void> {
      if (state.peek === id) return Promise.resolve();
      if (state.peek) api.exitPeekSync();
      if (state.active) api.close();
      lc.selfTeleport++;
      try { void core.player.goto(PEEK_SPOT[id], { fade: false }); } finally { lc.selfTeleport--; }
      const scene: SceneId = core.player.scene;
      const s = SURFACES[scene];
      // base pose + mount point
      const feet = core.player.pos(new Vector3());
      frameAt(s, feet, fr);
      const eye = tmp.copy(feet).addScaledVector(fr.up, EYE);
      let pos = eye.clone(), look: Vector3 | null = null, yaw = core.player.yawDeg(), pitch = 0;
      if (id === 'pk_coop') {
        // GDD §3.11 「塞进缝里」: the head goes through the small door, COOP_IN m past the door anchor toward the nest
        pos = anchors.world('coop_door')?.pos.clone() ?? eye.clone();
        const inside = anchors.world('coop_inside')?.pos ?? null;
        look = null;
        if (inside) {
          frameAt(s, inside, fr);
          const inDir = tmp2.copy(inside).sub(pos);
          inDir.addScaledVector(fr.up, -inDir.dot(fr.up));
          const len = inDir.length();
          if (len > 0.1) {
            inDir.divideScalar(len);
            pos.addScaledVector(inDir, Math.min(COOP_IN, len * 0.5));
            look = inside.clone().addScaledVector(fr.up, COOP_LOOK_UP).addScaledVector(inDir, COOP_LOOK_BACK);
          } else look = inside.clone();
          pos.addScaledVector(fr.up, COOP_RAISE);
        }
      } else if (id === 'pk_psd') {
        const fwd = headingToDir(fr, yaw, tmp2);
        pos = feet.clone().addScaledVector(fr.up, 1.25).addScaledVector(fwd, 0.55);
        look = anchors.world('pit')?.pos ?? null;
      } else if (id === 'tripod') {
        pos = anchors.world('tripod_head')?.pos.clone() ?? feet.clone().addScaledVector(fr.up, 1.5);
        try { const d = core.services.world.spot('sp_tripod'); yaw = d.yaw ?? 0; pitch = d.pitch ?? 0; } catch { /* defaults */ }
        look = lineupCentre(pos);
      } else {
        // GDD §9 P6: 「门口仰视」 — step through the open door and look up the shaft at the lamp room
        const axis = anchors.world('lm:lighthouse')?.pos ?? null;
        if (axis) {
          const toAxis = tmp2.copy(axis).sub(eye);
          toAxis.addScaledVector(fr.up, -toAxis.dot(fr.up));
          const len = toAxis.length();
          if (len > 0.2) pos.addScaledVector(toAxis.divideScalar(len), Math.min(LH_STEP_IN, len));
        }
        look = anchors.world('lh_lamp')?.pos ?? null;
      }
      if (look && look.distanceTo(pos) > 0.05) {
        frameAt(s, pos, fr);
        const d = tmp2.copy(look).sub(pos).normalize();
        yaw = dirToHeading(fr, d);
        pitch = Math.asin(Math.max(-1, Math.min(1, d.dot(fr.up)))) / DEG;
      }
      pose.setPeek({ scene, pos, yaw, pitch });
      state.peek = id; state.active = true; state.zoom = 1; state.frame = 'white';
      enteredFrame = core.clock.frame;
      pushCamera();
      // every peek pushes `peek`; core interact also picks there (Phase 2), so lh_door's peek-bound switch stays live
      popCtx = core.input.pushContext('peek', 'lens');
      if (id === 'tripod') {
        core.player.setYaw(yaw);            // W walks away from the tripod camera (GDD §9 S_group_photo)
        core.player.setStrafe(false);
      } else core.player.lock('lens:peek', true);
      hero()?.setFirstPerson(true);
      vfSince = core.clock.t;
      shots.reset();
      lc.invalidate();
      syncRender();
      core.bus.emit('peek', { id });
      core.bus.emit('viewfinder', { on: true });
      for (const f of listeners) f(true);
      if (id === 'lh_door') {
        if (detached) { detached = false; void Promise.resolve(hero()?.detachHead(null)).catch(() => undefined); }
        // refresh the interact pick now (it only updates per tick) so the next E hits the peek-bound switch
        try { core.interact.repick(); } catch { /* ignore */ }
        return Promise.resolve();
      }
      const w = mountFor(id, scene, pos, yaw);
      detached = true;
      try { return hero()?.detachHead(w) ?? Promise.resolve(); } catch (e) { core.log.warn('[lens] detachHead failed', e); return Promise.resolve(); }
    },
    exitPeekSync() {
      const id = state.peek;
      if (!id) return;
      state.peek = null; state.active = false; state.night = false; state.zoom = 1; state.frame = 'white';
      negative = false;
      popAll();
      pose.setPeek(null);
      core.player.lock('lens:peek', false);
      hero()?.setFirstPerson(false);
      shots.cancel();
      lc.invalidate();
      syncRender();
      core.bus.emit('peek', { id: null });
      core.bus.emit('viewfinder', { on: false });
      core.bus.emit('lensHint', { cond: null, target: null });
      for (const f of listeners) f(false);
    },
    async exitPeek(): Promise<void> {
      if (!state.peek) return;
      api.exitPeekSync();
      if (detached) {
        detached = false;
        try { await hero()?.detachHead(null); } catch (e) { core.log.warn('[lens] reattach failed', e); }
      }
    },
    exitKey(): StrKey {
      return state.peek === 'lh_door' ? 'vf.peek.exitDoor' : state.peek === 'tripod' ? 'vf.peek.exitTripod' : 'vf.peek.exit';
    },
    label(): string | null {
      if (!state.peek) return null;
      return t(`vf.peek.${state.peek}`);
    },
  };

  /** GDD §9 S_group_photo: frame the whole lineup. P3r2 (camera): the composition lives in tripod.ts (GROUP_FRAME: the
   *  front row's shins to 老周's head), not the mean direction to g1–g9. */
  const lineupCentre = (from: Vector3): Vector3 | null => groupAim(from, new Vector3());

  /** The head's mount: B's live anchor object when it has one, else our own marker at the lens point. */
  const mountFor = (id: PeekId, scene: SceneId, pos: Vector3, yaw: number): Object3D => {
    const key = id === 'pk_coop' ? 'coop_door' : id === 'tripod' ? 'tripod_head' : null;
    const obj = key ? anchors.world(key)?.info?.object ?? null : null;
    if (obj) return obj;
    if (!mount) { mount = new Object3D(); mount.name = 'lens:mount'; }
    core.scenes.get(scene).add(mount);
    mount.position.copy(pos);
    frameAt(SURFACES[scene], pos, fr);
    const f = headingToDir(fr, yaw, tmp2);
    mount.up.copy(fr.up);
    mount.lookAt(tmp.copy(pos).add(f));
    mount.updateMatrixWorld(true);
    return mount;
  };

  return api;
}
export type Modes = ReturnType<typeof createModes>;
