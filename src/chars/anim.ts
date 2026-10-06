// src/chars/anim.ts — owner C. Procedural humanoid animation (ART §7.1): walk 1.8 Hz @ 3.2 m/s, 3 cm bob, arm swing
// ±25°, torso counter-twist, 1.5 % breathing @ 0.3 Hz; pose overrides (sit / lie / raise / point / talk …) blended
// per bone by quaternion slerp. All inputs are sim time (core.clock), never wall time.
import { Euler, Quaternion } from 'three';
import type { Rig } from './rig';

const D = Math.PI / 180;
export type E3 = readonly [number, number, number];            // degrees, XYZ order
/** A pose: absolute bone rotations (degrees) plus optional hips offset (metres, relative to rest). */
export interface PoseDef { rot: Readonly<Record<string, E3>>; hips?: E3 }

export interface Style {
  stride: number;        // metres per full cycle at walk speed (3.2 / 1.8)
  legAmp: number;        // thigh swing (deg)
  armAmp: number;        // arm swing (deg)
  bob: number;           // metres
  twist: number;         // torso counter-twist (deg)
  armOut: number;        // rest abduction (deg) — chunky jackets hold arms off the body
  elbow: number;         // rest elbow bend (deg)
  hunch: number;         // static forward bend of the spine (deg) — granny 12
  breathe: number;       // chest scale amplitude
  kneeAmp: number;
  size: number;          // scales bob and pose hip offsets (1 = adult ≈ 1.7 m)
}
export const DEFAULT_STYLE: Style = {
  stride: 3.2 / 1.8, legAmp: 26, armAmp: 25, bob: 0.03, twist: 6, armOut: 7, elbow: 10, hunch: 0, breathe: 0.015, kneeAmp: 40,
  size: 1,
};

export interface AnimInput {
  phase: number;           // walk cycle phase in cycles (monotonic)
  move: number;            // 0..1 locomotion weight
  run: number;             // 0..1 run blend
  t: number;               // animT seconds
  talk: number;            // 0..1 talking gestures
  lookYaw: number;         // radians, + = toward the character's left
  lookPitch: number;       // radians, + = up
  poses: ReadonlyMap<string, number>;   // pose name → weight
}

const _e = new Euler(), _q = new Quaternion(), _q2 = new Quaternion();

function setRot(acc: Map<string, [number, number, number]>, name: string, x: number, y: number, z: number): void {
  const a = acc.get(name);
  if (a) { a[0] += x; a[1] += y; a[2] += z; } else acc.set(name, [x, y, z]);
}

export class HumanAnimator {
  readonly rig: Rig;
  readonly style: Style;
  readonly poses: Readonly<Record<string, PoseDef>>;
  private acc = new Map<string, [number, number, number]>();
  private names: string[];

  constructor(rig: Rig, style: Partial<Style> = {}, poses: Readonly<Record<string, PoseDef>> = {}) {
    this.rig = rig;
    this.style = { ...DEFAULT_STYLE, ...style };
    this.poses = { ...BASE_POSES, ...poses };
    this.names = Object.keys(rig.b);
  }

  update(i: AnimInput): void {
    const s = this.style, acc = this.acc;
    for (const n of this.names) { const a = acc.get(n); if (a) { a[0] = 0; a[1] = 0; a[2] = 0; } }
    const p = i.phase * Math.PI * 2;
    const sn = Math.sin(p), cs = Math.cos(p);
    const m = i.move, run = i.run;
    const legA = (s.legAmp + 14 * run) * m, armA = (s.armAmp + 15 * run) * m;
    // legs (negative x = forward)
    setRot(acc, 'legL', -legA * sn, 0, 0);
    setRot(acc, 'legR', legA * sn, 0, 0);
    const knee = (s.kneeAmp + 25 * run) * m;
    setRot(acc, 'shinL', 4 + knee * Math.max(0, cs) * 0.9, 0, 0);
    setRot(acc, 'shinR', 4 + knee * Math.max(0, -cs) * 0.9, 0, 0);
    setRot(acc, 'footL', legA * sn * 0.4 - knee * Math.max(0, cs) * 0.3, 0, 0);
    setRot(acc, 'footR', -legA * sn * 0.4 - knee * Math.max(0, -cs) * 0.3, 0, 0);
    // arms: opposite to legs, slight abduction, elbows bend more when running
    setRot(acc, 'armL', armA * sn, 0, s.armOut + 3 * m);
    setRot(acc, 'armR', -armA * sn, 0, -s.armOut - 3 * m);
    const el = s.elbow + (8 + 55 * run) * m;
    setRot(acc, 'foreL', -el - 6 * m * Math.max(0, -sn), 0, 0);
    setRot(acc, 'foreR', -el - 6 * m * Math.max(0, sn), 0, 0);
    // torso: counter-twist, run lean, hunch; breathing handled by scale below
    const tw = s.twist * m;
    setRot(acc, 'hips', 0, -tw * sn * 0.6, 0);
    setRot(acc, 'spine', s.hunch * 0.5 + 9 * run * m, tw * sn, 0);
    setRot(acc, 'chest', s.hunch * 0.5, tw * sn * 0.4, 0);
    // idle life: slow weight shift + head drift when standing
    const idle = 1 - m;
    const sway = Math.sin(i.t * 2 * Math.PI * 0.21);
    setRot(acc, 'hips', 0, 0, 1.2 * sway * idle);
    setRot(acc, 'spine', 0, 0, -1.0 * sway * idle);
    setRot(acc, 'head', 1.5 * Math.sin(i.t * 0.9) * idle, 0, 0);
    // talking: small hand gestures and head nods
    if (i.talk > 0) {
      const g = Math.sin(i.t * 5.1), g2 = Math.sin(i.t * 3.3 + 1);
      setRot(acc, 'armR', (-18 - 10 * g) * i.talk, 0, -6 * i.talk);
      setRot(acc, 'foreR', (-45 - 15 * g2) * i.talk, 0, 0);
      setRot(acc, 'head', 4 * Math.sin(i.t * 7) * i.talk, 0, 2 * g2 * i.talk);
    }

    // write rotations, then blend pose overrides
    const b = this.rig.b;
    for (const n of this.names) {
      const a = acc.get(n);
      const bone = b[n];
      if (a) bone.quaternion.setFromEuler(_e.set(a[0] * D, a[1] * D, a[2] * D, 'XYZ'));
      else bone.quaternion.identity();
    }
    let hx = 0, hy = 0, hz = 0;
    for (const [name, w] of i.poses) {
      if (w <= 0) continue;
      const pd = this.poses[name];
      if (!pd) continue;
      for (const bn in pd.rot) {
        const bone = b[bn];
        if (!bone) continue;
        const r = pd.rot[bn];
        _q.setFromEuler(_e.set(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));
        bone.quaternion.slerp(_q, Math.min(1, w));
      }
      if (pd.hips) { const k = w * s.size; hx += pd.hips[0] * k; hy += pd.hips[1] * k; hz += pd.hips[2] * k; }
    }
    // hips: rest + bob (lowest at double support) + pose offsets
    const hips = b.hips;
    if (hips) {
      const r = this.rig.rest.hips;
      const bob = s.bob * s.size * (1 + 0.6 * run) * m * (Math.abs(cs) - 0.5);
      hips.position.set(r.x + hx, r.y + bob + hy, r.z + hz);
    }
    // head look (applied on top)
    const head = b.head ?? b.neck;
    if (head && (i.lookYaw !== 0 || i.lookPitch !== 0)) {
      _q2.setFromEuler(_e.set(-i.lookPitch, i.lookYaw, 0, 'YXZ'));
      head.quaternion.multiply(_q2);
    }
    // breathing: 1.5 % chest scale at 0.3 Hz (ART §7.1)
    const chest = b.chest;
    if (chest) {
      const k = 1 + s.breathe * Math.sin(i.t * 2 * Math.PI * 0.3) * (0.6 + 0.4 * idle);
      chest.scale.set(1 + (k - 1) * 0.5, k, 1 + (k - 1) * 0.8);
    }
  }
}

/** Poses shared by every humanoid. Rotations are absolute (they replace locomotion by weight). */
export const BASE_POSES: Readonly<Record<string, PoseDef>> = {
  sit: {
    rot: {
      hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-2, 0, 0],
      legL: [-88, 0, 4], legR: [-88, 0, -4], shinL: [86, 0, 0], shinR: [86, 0, 0], footL: [2, 0, 0], footR: [2, 0, 0],
      armL: [-28, 0, 10], armR: [-28, 0, -10], foreL: [-38, 0, 0], foreR: [-38, 0, 0],
    },
    hips: [0, -0.35, -0.38],
  },
  /** Lying on the back along the bench (body along −X, face up). */
  lie: {
    rot: {
      hips: [-90, 0, 90], spine: [0, 0, 0], chest: [0, 0, 0], head: [10, 0, 0],
      legL: [0, 0, 2], legR: [0, 0, -2], shinL: [8, 0, 0], shinR: [8, 0, 0],
      armL: [0, 0, 8], armR: [-40, 0, -20], foreL: [0, 0, 0], foreR: [-80, 0, 0],
    },
    hips: [0.1, -0.3, -0.42],
  },
  /** Steadying the phone head with both hands like a camera (viewfinder / selfie). Solved by two-bone IK for the hero
   *  (shoulder 0.232/1.315 → wrist 0.172/1.55/−0.02, elbows flared out): the mitts grip the slab's sides BEHIND the lens
   *  plane, so the first-person viewfinder and every capture from the lens never see the hands (they used to fill the
   *  frame edges). */
  raise: {
    rot: {
      armL: [-5.8, -14.1, 135.7], armR: [-5.8, 14.1, -135.7], foreL: [-4.2, -7.9, 123.9], foreR: [-4.2, 7.9, -123.9],
      handL: [0, 0, 0], handR: [0, 0, 0],
    },
  },
  point: { rot: { armR: [-88, -8, -8], foreR: [-4, 0, 0], head: [-4, 0, 0] } },
  /** Both hands to the head (detach / reattach). */
  reach: { rot: { armL: [-160, 0, 28], armR: [-160, 0, -28], foreL: [-40, 0, 0], foreR: [-40, 0, 0] } },
  /** Arms cradling something in front of the chest (granny's frame / cat). */
  hold: { rot: { armL: [-26, 0, 6], armR: [-26, 0, -6], foreL: [-62, -48, 0], foreR: [-62, 48, 0] } },
  /** Hands on hips. */
  akimbo: { rot: { armL: [8, 0, 38], armR: [8, 0, -38], foreL: [-100, 0, 0], foreR: [-100, 0, 0] } },
  /** Crouch (tudi on the shoulder / on a post). */
  crouch: {
    rot: { legL: [-100, 0, 14], legR: [-100, 0, -14], shinL: [130, 0, 0], shinR: [130, 0, 0], spine: [18, 0, 0], footL: [-30, 0, 0], footR: [-30, 0, 0] },
    hips: [0, -0.12, -0.03],
  },
  turn: { rot: {} },
};
