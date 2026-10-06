// src/core/sphere.ts — owner: S. FROZEN. TECH §3 port, generalised to SurfaceInfo (center + radius): walker with
// parallel transport, unit-sphere log/exp maps, 2D chart collisions. Positions here are on the BASE sphere (radius R);
// height above ground is tracked separately by the player.
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { SurfaceInfo } from '../contracts';

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _m = new Matrix4();

/** Unit up at a world position on surface s. */
export function upAt(s: SurfaceInfo, pos: Vector3, out = new Vector3()): Vector3 {
  return out.copy(pos).sub(s.center).normalize();
}

/** Project v onto the tangent plane of unit `up` and normalize. Never NaN. */
export function projectOnTangent(v: Vector3, up: Vector3, out = new Vector3()): Vector3 {
  out.copy(v).addScaledVector(up, -v.dot(up));
  if (out.lengthSq() < 1e-12) {
    out.set(1, 0, 0);
    if (Math.abs(up.x) > 0.9) out.set(0, 0, 1);
    out.addScaledVector(up, -out.dot(up));
  }
  return out.normalize();
}

/** Walk `dist` metres along the great circle from `pos` toward tangent `dir`. Mutates pos (|pos − c| kept).
 *  Returns the applied rotation so callers can parallel-transport other tangents. */
export function walkOnSurface(s: SurfaceInfo, pos: Vector3, dir: Vector3, dist: number, outRot = new Quaternion()): Quaternion {
  const rel = _c.copy(pos).sub(s.center);
  const r = rel.length();
  const axis = _a.crossVectors(rel, dir);
  const len = axis.length();
  if (len < 1e-12 || dist === 0 || r === 0) return outRot.identity();
  outRot.setFromAxisAngle(axis.divideScalar(len), dist / r);
  rel.applyQuaternion(outRot).setLength(r);
  pos.copy(rel).add(s.center);
  return outRot;
}

/** Unit-sphere log map: tangent at `from` pointing to `to`, |v| = angle (rad). */
export function logMap(from: Vector3, to: Vector3, out = new Vector3()): Vector3 {
  const c = Math.min(1, Math.max(-1, from.dot(to)));
  out.copy(to).addScaledVector(from, -c);
  const l = out.length();
  if (l < 1e-15) return out.set(0, 0, 0);
  return out.multiplyScalar(Math.acos(c) / l);
}

/** Unit-sphere exp map: follow tangent `v` (|v| = angle) from `from`. */
export function expMap(from: Vector3, v: Vector3, out = new Vector3()): Vector3 {
  const ang = v.length();
  if (ang < 1e-15) return out.copy(from);
  const s = Math.sin(ang) / ang, c = Math.cos(ang);
  return out.set(from.x * c + v.x * s, from.y * c + v.y * s, from.z * c + v.z * s).normalize();
}

/** Model authored Y-up facing +Z: basis (right = up × fwd, up, fwd). */
export function basisQuaternion(up: Vector3, forward: Vector3, out = new Quaternion()): Quaternion {
  const f = projectOnTangent(forward, up, _c);
  const right = _a.crossVectors(up, f).normalize();
  const fwd = _b.crossVectors(right, up).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(right, up, fwd));
}

// ---------------------------------------------------------------- collision (TECH resolveCollider)
export interface CircleShape { kind: 'circle'; n: Vector3; r: number }                                     // n = unit dir from center
export interface BoxShape { kind: 'box'; n: Vector3; forward: Vector3; halfW: number; halfD: number }      // metres
export type Shape = CircleShape | BoxShape;

const _pn = new Vector3(), _v = new Vector3(), _right = new Vector3(), _tmp = new Vector3();

/** 2D offset (metres) of unit direction `pn` in the collider's log-map chart. */
function chartOffset(col: Shape, pn: Vector3, R: number, out: Vector3): Vector3 {
  return logMap(col.n, pn, out).multiplyScalar(R);
}

/** Push a base-sphere position out of one collider. Returns true if it moved. */
export function resolveShape(s: SurfaceInfo, pos: Vector3, playerR: number, col: Shape): boolean {
  const R = s.radius;
  _pn.copy(pos).sub(s.center).normalize();
  const bound = col.kind === 'circle' ? col.r : Math.hypot(col.halfW, col.halfD);
  if (_pn.dot(col.n) < Math.cos(Math.min(Math.PI, (bound + playerR) / R))) return false;   // broad phase
  const v = chartOffset(col, _pn, R, _v);
  if (col.kind === 'circle') {
    const d = v.length(), minD = col.r + playerR;
    if (d >= minD) return false;
    if (d < 1e-6) projectOnTangent(_tmp.set(1, 0.3, 0.2), col.n, v);
    v.setLength(minD / R);
  } else {
    _right.crossVectors(col.n, col.forward).normalize();
    const x = v.dot(_right), z = v.dot(col.forward);
    const cx = Math.min(col.halfW, Math.max(-col.halfW, x)), cz = Math.min(col.halfD, Math.max(-col.halfD, z));
    let dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    let nx: number, nz: number;
    if (d < 1e-9) {                                            // center inside: leave through the nearest face
      if (col.halfW - Math.abs(x) < col.halfD - Math.abs(z)) { nx = Math.sign(x || 1) * (col.halfW + playerR); nz = z; }
      else { nx = x; nz = Math.sign(z || 1) * (col.halfD + playerR); }
    } else {
      if (d >= playerR) return false;
      dx /= d; dz /= d;
      nx = cx + dx * playerR; nz = cz + dz * playerR;
    }
    v.copy(_right).multiplyScalar(nx).addScaledVector(col.forward, nz).divideScalar(R);
  }
  expMap(col.n, v, _tmp);
  pos.copy(_tmp).multiplyScalar(R).add(s.center);
  return true;
}

/** Point-in-shape test (no push): used by the camera boom. */
export function insideShape(s: SurfaceInfo, pos: Vector3, radius: number, col: Shape): boolean {
  const R = s.radius;
  _pn.copy(pos).sub(s.center).normalize();
  const bound = col.kind === 'circle' ? col.r : Math.hypot(col.halfW, col.halfD);
  if (_pn.dot(col.n) < Math.cos(Math.min(Math.PI, (bound + radius) / R))) return false;
  const v = chartOffset(col, _pn, R, _v);
  if (col.kind === 'circle') return v.length() < col.r + radius;
  _right.crossVectors(col.n, col.forward).normalize();
  const x = v.dot(_right), z = v.dot(col.forward);
  const dx = Math.max(0, Math.abs(x) - col.halfW), dz = Math.max(0, Math.abs(z) - col.halfD);
  return Math.hypot(dx, dz) < radius;
}

/** Resolve against many shapes. Returns true if the position is still inside one afterwards. */
export function resolveAll(s: SurfaceInfo, pos: Vector3, playerR: number, cols: readonly Shape[], iterations = 2): boolean {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of cols) moved = resolveShape(s, pos, playerR, c) || moved;
    if (!moved) return false;
  }
  return cols.some((c) => insideShape(s, pos, playerR - 1e-4, c));
}

/** P3r3 (open-play a): least sideways share of a step that hits a round collider (nearly) head-on. */
export const SLIDE_MIN = 0.55;
const SLIDE_LOOK = [0, 0.5, 1.0, Math.PI / 2];
const _e1 = new Vector3(), _e2 = new Vector3(), _o = new Vector3(), _slid = new Vector3();

/**
 * Turn a step prev → pos that ends inside a circle along the circle's rim (walk round an NPC / post instead of being
 * pushed straight back, which pins a walker who aims at its centre). The tangential part of the step is kept, at
 * least SLIDE_MIN of the step's length, on the side the step already leans to (dead centre: a fixed side); when
 * that side runs into another collider the other side is tried, and when both do the step is left for resolveAll.
 * Positions are base-sphere points. Returns true when it moved `pos`.
 */
export function slideCircles(s: SurfaceInfo, prev: Vector3, pos: Vector3, playerR: number, cols: readonly Shape[]): boolean {
  const R = s.radius;
  let slid = false;
  for (const col of cols) {
    if (col.kind !== 'circle') continue;
    const minD = col.r + playerR;
    _pn.copy(pos).sub(s.center).normalize();
    if (_pn.dot(col.n) < Math.cos(Math.min(Math.PI, minD / R))) continue;           // broad phase
    const v1 = chartOffset(col, _pn, R, _v);
    if (v1.length() >= minD) continue;
    projectOnTangent(_tmp.set(1, 0.3, 0.2), col.n, _e1);
    _e2.crossVectors(col.n, _e1).normalize();
    const bx = v1.dot(_e1), by = v1.dot(_e2);
    _pn.copy(prev).sub(s.center).normalize();
    const v0 = chartOffset(col, _pn, R, _o);
    const ax = v0.dot(_e1), ay = v0.dot(_e2), al = Math.hypot(ax, ay);
    if (al < minD - 1e-3) continue;                                     // already inside before the step: resolveAll
    const mx = bx - ax, my = by - ay, ml = Math.hypot(mx, my);
    if (ml < 1e-6) continue;
    const nx = ax / al, ny = ay / al;                                   // rim normal where the walker meets it
    if (mx * nx + my * ny >= 0) continue;                               // moving away / along it
    const mt = mx * -ny + my * nx;                                      // step along the tangent (+ = counter-clockwise)
    const along = Math.max(Math.abs(mt), SLIDE_MIN * ml);
    const first = mt !== 0 ? Math.sign(mt) : 1;
    const ang0 = Math.atan2(ny, nx), k = (minD * (1 + 1e-4)) / R;
    const rim = (ang: number) => {
      _tmp.copy(_e1).multiplyScalar(Math.cos(ang) * k).addScaledVector(_e2, Math.sin(ang) * k);
      return expMap(col.n, _tmp, _slid).multiplyScalar(R).add(s.center);
    };
    // a side is open when the rim is free a quarter turn ahead (else a gap narrower than the body wedges him there)
    const open = (side: number) => {
      for (const a of SLIDE_LOOK) {
        rim(ang0 + side * Math.max(a, along / minD));
        for (const other of cols) if (other !== col && insideShape(s, _slid, playerR - 1e-3, other)) return false;
      }
      return true;
    };
    for (const side of [first, -first]) {
      if (!open(side)) continue;
      pos.copy(rim(ang0 + (side * along) / minD));
      slid = true;
      break;
    }
  }
  return slid;
}

// ---------------------------------------------------------------- walker
export interface MoveInput { x: number; y: number }   // x = strafe right, y = forward, each in [-1, 1]

/** TECH SphereWalker on a SurfaceInfo. pos stays on the base sphere; heading/facing are parallel-transported. */
export class SurfaceWalker {
  surface: SurfaceInfo;
  readonly pos = new Vector3();
  readonly heading = new Vector3();   // camera heading (tangent); mouse X rotates it; walking transports it
  readonly facing = new Vector3();    // body facing (tangent); model faces +Z
  readonly quaternion = new Quaternion();
  turnRate = 12;                      // 1/s exponential smoothing
  private readonly _up = new Vector3();
  private readonly _move = new Vector3();
  private readonly _rot = new Quaternion();
  private readonly _r = new Vector3();

  constructor(surface: SurfaceInfo, start: Vector3, heading: Vector3) {
    this.surface = surface;
    this.place(surface, start, heading);
  }
  /** Teleport: project start onto the base sphere, heading onto the tangent plane. */
  place(surface: SurfaceInfo, start: Vector3, heading: Vector3): void {
    this.surface = surface;
    this.pos.copy(start).sub(surface.center).setLength(surface.radius).add(surface.center);
    const up = this.up;
    projectOnTangent(heading, up, this.heading);
    this.facing.copy(this.heading);
    basisQuaternion(up, this.facing, this.quaternion);
  }
  get up(): Vector3 { return upAt(this.surface, this.pos, this._up); }
  /** +rad = clockwise seen from outside (heading/yaw convention). */
  yaw(rad: number): void {
    this.heading.applyAxisAngle(this.up, -rad);
    projectOnTangent(this.heading, this.up, this.heading);
  }
  /**
   * Move with input at `speed` m/s. `resolve` pushes the position out of colliders (called after the step).
   * strafe: facing follows heading instead of the motion. Returns the metres actually travelled.
   */
  update(input: MoveInput, dt: number, speed: number, strafe: boolean, resolve?: (pos: Vector3) => void): number {
    const up = this.up;
    const right = _a.crossVectors(this.heading, up);
    const move = this._move.copy(this.heading).multiplyScalar(input.y).addScaledVector(right, input.x);
    const mag = Math.min(1, move.length());
    let travelled = 0;
    if (mag > 1e-4 && speed > 0) {
      move.normalize();
      const before = this._r.copy(this.pos);
      const rot = walkOnSurface(this.surface, this.pos, move, speed * mag * dt, this._rot);
      if (resolve) resolve(this.pos);
      const newUp = upAt(this.surface, this.pos, this._up);
      projectOnTangent(this.heading.applyQuaternion(rot), newUp, this.heading);
      move.applyQuaternion(rot);
      projectOnTangent(this.facing.applyQuaternion(rot), newUp, this.facing);
      const target = strafe ? this.heading : move;
      const k = 1 - Math.exp(-this.turnRate * dt);
      if (this.facing.dot(target) < -0.99) this.facing.addScaledVector(_b.crossVectors(newUp, target), 0.1);
      this.facing.lerp(target, k);
      projectOnTangent(this.facing, newUp, this.facing);
      travelled = before.distanceTo(this.pos);
    } else {
      projectOnTangent(this.heading, up, this.heading);
      if (strafe) this.facing.lerp(this.heading, 1 - Math.exp(-this.turnRate * dt));
      projectOnTangent(this.facing, up, this.facing);
    }
    basisQuaternion(this.up, this.facing, this.quaternion);
    return travelled;
  }
}

// ---------------------------------------------------------------- horizon (TECH §3.4)
/** Max angular separation at which an object of height hObj is still visible from eye height hEye. */
export function horizonAngle(r: number, hEye: number, hObj: number): number {
  return Math.acos(r / (r + Math.max(0, hEye))) + Math.acos(r / (r + Math.max(0, hObj)));
}
