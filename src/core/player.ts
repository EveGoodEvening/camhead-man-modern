// src/core/player.ts — owner: S. FROZEN. Walker + pose/locks/speed caps + goto/teleport (ARCHITECTURE §2.8.4).
import { Object3D, Vector3 } from 'three';
import type { Core, PlayerApi, PlayerPose, Pos } from '../contracts';
import type { ChartPos, LocalPos, SceneId, SpotDef, SpotId } from '../types';
import { SPOTS } from '../data/locations';
import {
  DEG, SURFACES, dirToHeading, flatToChart, flatToWorld, frameAt, headingToDir, isChart, posToWorld, toFlat,
  worldToFlat, type SurfaceFrame,
} from './planet';
import { SurfaceWalker, basisQuaternion } from './sphere';
import { PLAYER_RADIUS, type PhysicsImpl } from './physics';
import type { ScenesImpl } from './scenes';

export const WALK_SPEED = 3.2;
export const RUN_SPEED = 5.5;
export const DESCEND_SPEED = 8;
export const PLANET_MAX_R = 71;
export const DEFAULT_APPROACH = 1.8;
const EYE = 1.5;

export interface GotoTarget { scene: SceneId; world: Vector3; h: number; yawDeg: number; pitchDeg: number }

export interface PlayerImpl extends PlayerApi {
  update(dt: number): void;
  readonly h: number;
  /** Where goto(spot) would put the player (exported for tests and debug). */
  resolveGoto(spot: SpotId): GotoTarget | null;
}

const _f: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
const _v = new Vector3(), _w = new Vector3(), _fwd = new Vector3(), _prev = new Vector3(), _probe = new Vector3();

function spotDef(core: Core, id: SpotId): SpotDef | null {
  try {
    const w = core.services.world as Core['services']['world'] | undefined;
    if (w) return w.spot(id);
  } catch { /* fall back to the data table */ }
  return SPOTS.find((s) => s.id === id) ?? null;
}

/** Height of a Pos above base ground. */
function posH(p: Pos): number { return isChart(p) ? (p.h ?? 0) : p.y; }

export function createPlayer(core: Core, physics: PhysicsImpl, scenes: ScenesImpl): PlayerImpl {
  const start = SPOTS.find((s) => s.id === 'sp_bus_bench');
  const startPos = posToWorld('planet', start ? start.pos : { r: 38.5, lon: 0 });
  frameAt(SURFACES.planet, startPos, _f);
  const walker = new SurfaceWalker(SURFACES.planet, startPos, headingToDir(_f, start?.yaw ?? 90));
  const object = new Object3D();
  object.name = 'player';
  let scene: SceneId = 'planet';
  let h = 0;
  let pose: PlayerPose = 'stand';
  let strafe = false;
  let speedNow = 0;
  let stuck = false;
  const locks = new Set<string>();
  const caps = new Map<string, number>();
  scenes.get('planet').add(object);

  const surface = () => SURFACES[scene];
  const feet = (out: Vector3) => out.copy(walker.pos).sub(surface().center).setLength(surface().radius + h).add(surface().center);
  const syncObject = () => {
    feet(object.position);
    object.quaternion.copy(walker.quaternion);
    object.updateMatrixWorld();
  };

  const moveToScene = (to: SceneId) => {
    if (to === scene) return;
    scene = to;
    scenes.get(to).add(object);
    scenes.switchTo(to);
  };

  const place = (to: SceneId, world: Vector3, hh: number, yawDeg: number) => {
    moveToScene(to);
    if (scenes.active !== to) scenes.switchTo(to);
    const s = SURFACES[to];
    frameAt(s, world, _f);
    walker.place(s, world, headingToDir(_f, yawDeg, _v));
    const f = worldToFlat(s, walker.pos);
    h = Math.max(hh, physics.heightAt(to, f.x, f.z, hh));
    syncObject();
  };

  /** Is a feet position (base-sphere point `base` at height hh) inside a collider? */
  const blockedAt = (base: Vector3, hh: number) => {
    const s = surface();
    _probe.copy(base).sub(s.center).setLength(s.radius + hh).add(s.center);
    return physics.blocked(scene, _probe, PLAYER_RADIUS - 1e-3);
  };
  /** §6 risk 12 last resort: the nearest spot on this scene whose standing point is free (object spots stand on `stand`). */
  const nearestSpotSnap = () => {
    let best: { def: SpotDef; at: Pos } | null = null, bestD = Infinity;
    const p = feet(_w);
    for (const sp of SPOTS) {
      if (sp.scene !== scene) continue;
      const at = sp.stand ?? sp.pos;
      const w = basePos(sp.scene, at);
      if (blockedAt(w, posH(at))) continue;
      const d = w.distanceTo(p);
      if (d < bestD) { bestD = d; best = { def: sp, at }; }
    }
    if (best) {
      core.log.warn(`[player] stuck inside a collider; snapped to ${best.def.id}`);
      place(best.def.scene, basePos(best.def.scene, best.at), posH(best.at), best.def.yaw ?? api.yawDeg());
    }
  };
  /** Teleports always leave the player standing and unlocked from the bench (the sit lock is the pose's own). */
  const standUp = () => {
    locks.delete('pose:sit');
    if (pose !== 'stand') { pose = 'stand'; core.bus.emit('poseChanged', { pose: 'stand' }); }
  };

  const api: PlayerImpl = {
    object,
    get scene() { return scene; },
    get pose() { return pose; },
    get h() { return h; },
    pos: (out = new Vector3()) => feet(out),
    up: (out = new Vector3()) => out.copy(walker.up),
    heading: (out = new Vector3()) => out.copy(walker.heading),
    facing: (out = new Vector3()) => out.copy(walker.facing),
    flat: () => { const f = worldToFlat(surface(), walker.pos); return { x: f.x, z: f.z, h }; },
    chart(): ChartPos | LocalPos {
      const f = worldToFlat(surface(), walker.pos);
      if (scene === 'planet') { const c = flatToChart({ x: f.x, z: f.z, h }); return { r: c.r, lon: c.lon, h }; }
      return { x: f.x, y: h, z: f.z };
    },
    yawDeg: () => dirToHeading(frameAt(surface(), walker.pos, _f), walker.heading),
    speed: () => speedNow,
    resolveGoto(spot) {
      const def = spotDef(core, spot);
      if (!def) return null;
      const s = SURFACES[def.scene];
      const actor = core.actors.list(def.scene).find((a) => {
        try { return a.spot?.() === spot; } catch { return false; }
      });
      if (actor) {
        // Actor rule (§2.8.4): stand approachDist in front (facing it) or behind (looking where it looks).
        actor.root.updateWorldMatrix(true, false);
        const ap = actor.root.getWorldPosition(new Vector3());
        frameAt(s, ap, _f);
        _fwd.set(0, 0, 1).transformDirection(actor.root.matrixWorld);
        _fwd.addScaledVector(_f.up, -_fwd.dot(_f.up));
        if (_fwd.lengthSq() < 1e-8) _fwd.copy(_f.north); else _fwd.normalize();
        const dist = def.approachDist ?? DEFAULT_APPROACH;
        const behind = def.approach === 'behind';
        const apf = worldToFlat(s, ap);
        const stand = ap.clone().addScaledVector(_fwd, behind ? -dist : dist);
        const sf = worldToFlat(s, stand);
        const world = flatToWorld(s, { x: sf.x, z: sf.z, h: 0 });
        const fr = frameAt(s, world, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
        // both cases look at the actor: from behind this is its own facing, transported along the geodesic
        const lookDir = ap.clone().sub(world);
        // stand on whatever walk surface is there at the actor's level (stairs lineup), else the ground
        const standH = physics.heightAt(def.scene, sf.x, sf.z, Math.max(0, apf.h));
        return { scene: def.scene, world, h: standH, yawDeg: dirToHeading(fr, lookDir), pitchDeg: def.pitch ?? 0 };
      }
      if (def.stand) {
        // Object rule: stand on `stand`, facing `pos` (GDD §0.2).
        const world = basePos(def.scene, def.stand);
        const target = posToWorld(def.scene, def.pos);
        const fr = frameAt(s, world, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
        const d = target.clone().sub(world);
        const standH = posH(def.stand);
        const eyeW = world.clone().addScaledVector(fr.up, standH + EYE);
        const toT = target.clone().sub(eyeW);
        const vert = toT.dot(fr.up), horiz = Math.hypot(toT.dot(fr.north), toT.dot(fr.east));
        const pitch = Math.max(-30, Math.min(20, Math.atan2(vert, Math.max(0.01, horiz)) / DEG));
        return { scene: def.scene, world, h: standH, yawDeg: dirToHeading(fr, d), pitchDeg: pitch };
      }
      const world = basePos(def.scene, def.pos);
      return { scene: def.scene, world, h: posH(def.pos), yawDeg: def.yaw ?? api.yawDeg(), pitchDeg: def.pitch ?? 0 };
    },
    goto(spot, o) {
      const t = api.resolveGoto(spot);
      if (!t) { core.log.warn(`[player] goto: unknown spot ${spot}`); return Promise.resolve(); }
      const apply = () => {
        standUp();
        place(t.scene, t.world, t.h, t.yawDeg);
        core.cameraRig.look(t.yawDeg, t.pitchDeg);
        core.cameraRig.snap();
        core.bus.emit('teleported', { scene: t.scene, spot });
        // Phase 2 (I): zones react to the teleport now, not on the next tick (a `goto(X); detach(…)` row would miss X's zone)
        physics.updateZones(scene, object.position);
      };
      const cross = t.scene !== scene;
      if (cross && o?.fade !== false && !core.params.test) {
        // no walking, interacting (a second E on the door) or mouse look while the screen fades through black
        const pop = core.input.pushContext('cutscene', 'core:goto');
        return (async () => {
          try { await core.fade(true, 0.25); apply(); await core.fade(false, 0.25); } finally { pop(); }
        })();
      }
      apply();
      return Promise.resolve();
    },
    teleport(o) {
      const to = o.scene ?? scene;
      const world = basePos(to, o.at);
      standUp();
      place(to, world, posH(o.at), o.yawDeg ?? api.yawDeg());
      if (o.yawDeg !== undefined || o.pitchDeg !== undefined) core.cameraRig.look(o.yawDeg ?? api.yawDeg(), o.pitchDeg ?? 0);
      core.cameraRig.snap();
      core.bus.emit('teleported', { scene: to, spot: null });
      physics.updateZones(scene, object.position);
    },
    rotateHeading(dYawRad) { walker.yaw(dYawRad); if (strafe) walker.facing.copy(walker.heading); syncObject(); },
    setYaw(yawDeg) {
      frameAt(surface(), walker.pos, _f);
      headingToDir(_f, yawDeg, walker.heading);
      walker.facing.copy(walker.heading);
      basisQuaternion(walker.up, walker.facing, walker.quaternion);
      syncObject();
    },
    lock(owner, on) { if (on) locks.add(owner); else locks.delete(owner); },
    setSpeedCap(owner, mps) { if (mps === null) caps.delete(owner); else caps.set(owner, mps); },
    setStrafe(on) { strafe = on; },
    setPose(p, spot) {
      if (spot) { void api.goto(spot, { fade: false }); }
      if (p === pose) return;
      pose = p;
      if (p === 'sit') locks.add('pose:sit'); else locks.delete('pose:sit');
      core.bus.emit('poseChanged', { pose: p });
    },
    update(dt) {
      const input = core.input;
      const ctx = input.context();
      const raw = input.move();
      const moving = Math.abs(raw.x) + Math.abs(raw.y) > 1e-3;
      if (pose === 'sit' && ctx === 'gameplay' && (moving || input.pressed('escape'))) api.setPose('stand');
      const canMove = (ctx === 'gameplay' || ctx === 'viewfinder' || ctx === 'peek') && locks.size === 0;
      let spd = input.held('run') ? RUN_SPEED : WALK_SPEED;
      for (const c of caps.values()) spd = Math.min(spd, c);
      stuck = false;
      _prev.copy(walker.pos);
      let travelled = walker.update(canMove ? raw : { x: 0, y: 0 }, dt, spd, strafe, (p) => {
        physics.slide(scene, _prev, p, h);      // P3r3: round colliders (NPCs, posts) are walked round, never pinned
        stuck = physics.resolve(scene, p, h);
      });
      if (stuck && !blockedAt(_prev, h)) {
        // wedged (a gap narrower than the body, two pushes fighting): stay where the last step was valid
        walker.pos.copy(_prev);
        stuck = false;
        travelled = 0;
      }
      if (scene === 'planet') {
        const f = worldToFlat(SURFACES.planet, walker.pos);
        const r = Math.hypot(f.x, f.z);
        if (r > PLANET_MAX_R) {
          const k = PLANET_MAX_R / r;
          flatToWorld(SURFACES.planet, { x: f.x * k, z: f.z * k, h: 0 }, walker.pos);
        }
      }
      if (stuck) nearestSpotSnap();
      const f = worldToFlat(surface(), walker.pos);
      const target = physics.heightAt(scene, f.x, f.z, h);
      h = target >= h - 0.05 ? target : Math.max(target, h - DESCEND_SPEED * dt);
      if (h < 0) h = 0;
      syncObject();
      speedNow = dt > 0 ? travelled / dt : 0;
      physics.updateZones(scene, object.position);
    },
  };
  syncObject();
  return api;
}

/** World position of a Pos at ground level (h = 0). */
function basePos(scene: SceneId, p: Pos): Vector3 {
  const f = toFlat(p);
  return flatToWorld(SURFACES[scene], { x: f.x, z: f.z, h: 0 });
}
