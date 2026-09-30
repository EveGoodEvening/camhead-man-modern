// S-verify: runtime behaviour / game feel of the core walker + follow camera (pole, frame rate, walls, locks).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SURFACES, dirToHeading, frameAt, worldToFlat } from './planet';
import { BOOM_CLEARANCE, FOLLOW } from './cameraRig';
import { createTestCore, type TestCore } from './testkit';

const tick = (t: TestCore, n: number, move: { x: number; y: number } | null = null, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) { t.core.input.inject({ move }); t.internals.loop.tick(dt); }
};
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
/** Camera right axis (column 0 of its world matrix). */
const camRight = (t: TestCore) => new Vector3().setFromMatrixColumn(t.core.cameraRig.camera.matrixWorld, 0);
/** Is any point on pivot → camera inside a collider (with slightly less than the rig's clearance)? */
function boomClipped(t: TestCore): boolean {
  const p = t.core.player.pos(), up = t.core.player.up();
  const pivot = p.clone().addScaledVector(up, FOLLOW.eye);
  const cam = t.core.cameraRig.camera.position;
  for (let i = 1; i <= 40; i++) {
    if (t.core.physics.blocked(t.core.player.scene, pivot.clone().lerp(cam, i / 40), BOOM_CLEARANCE - 0.02)) return true;
  }
  return false;
}

describe('walker + follow camera over the hilltop', () => {
  it('walks straight through the pole: no flip, no roll, heading continuous, comes out heading south', () => {
    const t = createTestCore();                                   // fake world: no colliders
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 0 }, yawDeg: 0 });
    tick(t, 1);
    const prevHd = t.core.player.heading();
    let maxTurn = 0, maxRoll = 0, minUpDot = 1, maxBoomErr = 0;
    for (let i = 0; i < 750; i++) {                                // 12.5 s × 3.2 m/s = 40 m: pole at 20 m
      tick(t, 1, { x: 0, y: 1 });
      const hd = t.core.player.heading(), up = t.core.player.up();
      expect(Number.isFinite(hd.x + hd.y + hd.z)).toBe(true);
      // parallel transport: consecutive headings differ only by the tiny transport rotation (≈ 0.04°/tick)
      maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, hd.dot(prevHd))) * 180 / Math.PI);
      prevHd.copy(hd);
      const cam = t.core.cameraRig.camera;
      minUpDot = Math.min(minUpDot, cam.up.dot(up));
      maxRoll = Math.max(maxRoll, Math.abs(camRight(t).dot(up)));  // horizon level: camera right ⟂ local up
      const rel = cam.position.clone().sub(t.core.player.pos());
      maxBoomErr = Math.max(maxBoomErr, Math.abs(rel.length() - Math.hypot(FOLLOW.back, FOLLOW.eye, FOLLOW.shoulder)));
    }
    expect(maxTurn).toBeLessThan(0.2);
    expect(minUpDot).toBeGreaterThan(0.9999);
    expect(maxRoll).toBeLessThan(1e-6);
    expect(maxBoomErr).toBeLessThan(1.2);                          // damped lag only (≈ 2v/ω), never a swing
    const c = t.core.player.chart() as { r: number; lon: number };
    expect(c.r).toBeCloseTo(20, 1);
    expect(c.lon).toBeCloseTo(180, 1);
    expect(t.core.player.yawDeg()).toBeCloseTo(180, 1);           // heading south on the far side of the hill
    // the camera is still behind the player
    const rel = t.core.cameraRig.camera.position.clone().sub(t.core.player.pos());
    expect(rel.dot(t.core.player.heading())).toBeLessThan(-3);
  });

  it('look() exactly at the pole is well defined (north = −Z there)', () => {
    const t = createTestCore();
    t.core.player.teleport({ scene: 'planet', at: { r: 0, lon: 0 }, yawDeg: 90 });
    tick(t, 1);
    expect(t.core.player.yawDeg()).toBeCloseTo(90, 6);
    const hd = t.core.player.heading();
    expect(hd.x).toBeCloseTo(1, 6);                               // east at the pole = +X
    tick(t, 30, { x: 0, y: 1 });
    expect(Number.isFinite(t.core.cameraRig.camera.position.x)).toBe(true);
  });
});

describe('frame-rate independence', () => {
  const run = (dt: number) => {
    const t = createTestCore();
    void t.core.player.goto('sp_bus_bench', { fade: false });
    const n = Math.round(2 / dt);
    tick(t, n, { x: 0.6, y: 0.8 }, dt);                           // 2 s diagonal walk (facing turns toward the motion)
    tick(t, Math.round(1.5 / dt), null, dt);                      // 1.5 s standing: the camera settles
    return { p: t.core.player.pos(), f: t.core.player.facing(), cam: t.core.cameraRig.camera.position.clone() };
  };
  it('walk distance, body facing and the settled camera do not depend on dt (1/60, 1/30, 1/20)', () => {
    const a = run(1 / 60), b = run(1 / 30), c = run(1 / 20);
    expect(a.p.distanceTo(b.p)).toBeLessThan(0.01);
    expect(a.p.distanceTo(c.p)).toBeLessThan(0.01);
    expect(a.f.angleTo(c.f)).toBeLessThan(0.01);
    expect(a.cam.distanceTo(b.cam)).toBeLessThan(0.02);
    expect(a.cam.distanceTo(c.cam)).toBeLessThan(0.02);
  });
});

describe('locks and poses', () => {
  it('a teleport out of the sitting pose clears the sit lock (was a soft-lock)', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bench');
    t.core.player.setPose('sit');
    expect(t.core.player.pose).toBe('sit');
    void t.core.player.goto('sp_bus_bench');                     // e.g. a story teleport while seated
    expect(t.core.player.pose).toBe('stand');
    const a = t.core.player.pos();
    tick(t, 60, { x: 0, y: 1 });
    expect(t.core.player.pos().distanceTo(a)).toBeGreaterThan(3);
    t.core.player.setPose('sit');
    t.core.player.teleport({ scene: 'planet', at: { r: 30, lon: 90 } });
    const b = t.core.player.pos();
    tick(t, 60, { x: 0, y: 1 });
    expect(t.core.player.pos().distanceTo(b)).toBeGreaterThan(3);
  });
  it('poseChanged is emitted only when the pose changes', () => {
    const t = createTestCore();
    const ev: string[] = [];
    t.bus.on('poseChanged', (e) => ev.push(e.pose));
    void t.core.player.goto('sp_bus_bench');
    void t.core.player.goto('sp_store_door');
    t.core.player.setPose('sit');
    void t.core.player.goto('sp_bus_bench');
    expect(ev).toEqual(['sit', 'stand']);
  });
  it('a cross-scene goto with fade (realtime) blocks walking and interacting until the fade is over', async () => {
    const t = createTestCore({ search: '?seed=1' });              // not ?test: fades run on sim time
    const start = t.core.player.pos();
    let ended = false;
    const done = t.core.player.goto('st_entry').then(() => { ended = true; });
    expect(t.core.input.context()).toBe('cutscene');
    let ticks = 0;
    for (; ticks < 120 && !ended; ticks++) {
      const sceneBefore = t.core.player.scene, before = t.core.player.pos();
      tick(t, 1, { x: 0, y: 1 });
      if (t.core.input.context() === 'cutscene') {
        if (t.core.player.scene === 'planet') expect(t.core.player.pos().distanceTo(start)).toBe(0);   // fade in
        else if (sceneBefore === 'studio_int') expect(t.core.player.pos().distanceTo(before)).toBe(0); // fade out
      }
      await flush();
    }
    await done;
    expect(ticks).toBeGreaterThan(25);                            // 0.25 s in + 0.25 s out on sim time
    expect(t.core.player.scene).toBe('studio_int');
    expect(t.core.input.context()).toBe('gameplay');
    const c = t.core.player.chart() as { x: number; z: number };
    expect(c.z).toBeCloseTo(2.4, 1);                              // the walk input during the fade did nothing
  });
});

describe('colliders: wedging and last-resort snap', () => {
  it('walking into a gap narrower than the body stops at the mouth, never teleports', () => {
    const t = createTestCore();
    const warns: unknown[] = [];
    (t.core.log as { warn: (...a: unknown[]) => void }).warn = (...a) => { warns.push(a); };
    for (const x of [-0.6, 0.6]) {
      t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'box', at: { x, y: 0, z: -1 }, headingDeg: 0, halfW: 0.35, halfD: 1.5 } });
    }
    t.core.player.teleport({ scene: 'studio_int', at: { x: 0.02, y: 0, z: 2 }, yawDeg: 0 });   // facing −Z, into the gap
    let prev = t.core.player.pos(), maxJump = 0;
    for (let i = 0; i < 180; i++) {
      tick(t, 1, { x: 0, y: 1 });
      const p = t.core.player.pos();
      maxJump = Math.max(maxJump, p.distanceTo(prev));
      prev = p;
    }
    expect(maxJump).toBeLessThan(0.1);
    expect(warns).toEqual([]);
    const c = t.core.player.chart() as { z: number };
    expect(c.z).toBeGreaterThan(0.4);                             // at the mouth (z ≈ 0.5 + clearance), not through
    expect(t.core.physics.blocked('studio_int', t.core.player.pos(), 0.34)).toBe(false);
  });
  it('a collider enabled on top of the player snaps to the nearest FREE standing point (stand, not an object pos)', () => {
    const t = createTestCore();
    const warns: string[] = [];
    (t.core.log as { warn: (...a: unknown[]) => void }).warn = (m) => { warns.push(String(m)); };
    void t.core.player.goto('dk_bench');                          // stands at (3.5, 0, −1.6)
    // two slabs whose push-outs fight: leaving A lands in B and vice versa (2 iterations cannot resolve it)
    t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'box', at: { x: 3.8, y: 0, z: 0 }, headingDeg: 0, halfW: 0.8, halfD: 5 } });
    t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'box', at: { x: 2.05, y: 0, z: 0 }, headingDeg: 0, halfW: 1.05, halfD: 5 } });
    tick(t, 3, { x: 0, y: 1 });
    expect(warns.some((w) => w.includes('snapped'))).toBe(true);
    expect(t.core.physics.blocked('studio_int', t.core.player.pos(), 0.34)).toBe(false);
  });
});

describe('camera boom vs occluders', () => {
  it('an occluder sliding between player and camera never leaves the damped camera inside it', () => {
    const t = createTestCore();
    void t.core.player.goto('st_entry');                          // (0, 0, 2.4) facing −Z; camera behind at +Z
    tick(t, 30);
    expect(boomClipped(t)).toBe(false);
    // a pillar appears right between them (like walking past a lamp post)
    t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'circle', at: { x: 0.35, y: 0, z: 4.4 }, radius: 0.3 } });
    for (let i = 0; i < 30; i++) { tick(t, 1); expect(boomClipped(t)).toBe(false); }
  });
  it('strafing past a post keeps the boom clear every tick', () => {
    const t = createTestCore();
    t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'circle', at: { x: 0, y: 0, z: 5 }, radius: 0.4 } });
    t.core.player.teleport({ scene: 'studio_int', at: { x: -3, y: 0, z: 2.4 }, yawDeg: 0 });
    t.core.player.setStrafe(true);
    tick(t, 5);
    for (let i = 0; i < 120; i++) { tick(t, 1, { x: 1, y: 0 }); expect(boomClipped(t)).toBe(false); }
  });
  it('the horizon stays level while orbiting (mouse look) and at the pitch limits', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bus_bench');
    for (let i = 0; i < 90; i++) {
      t.core.input.inject({ look: { dx: 25, dy: i < 45 ? 15 : -30 } });
      t.internals.loop.tick(1 / 60);
      expect(Math.abs(camRight(t).dot(t.core.player.up()))).toBeLessThan(1e-6);
    }
    expect(t.core.cameraRig.pitchDeg).toBe(20);
    const f = frameAt(SURFACES.planet, t.core.player.pos());
    expect(dirToHeading(f, t.core.player.heading())).not.toBeCloseTo(90, 0);   // the heading orbited
    expect(worldToFlat(SURFACES.planet, t.core.player.pos()).h).toBe(0);
  });
});

describe('camera boom over a low obstacle (I-play)', () => {
  const setup = (scene: 'planet' | 'studio_int') => {
    const t = createTestCore();
    if (scene === 'planet') {
      // (r 20, lon 0) facing north (toward the pole): a 1.8 m high wall 0.9 m behind, 10 m wide
      t.core.physics.registerCollider({ scene: 'planet', shape: { kind: 'box', at: { r: 20.9, lon: 0 }, headingDeg: 0, halfW: 5, halfD: 0.1 }, hRange: [-1, 1.8] });
      t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 0 }, yawDeg: 0 });
    } else {
      // st_entry (0, 0, 2.4) faces −Z: the same wall 0.9 m behind
      t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'box', at: { x: 0, y: 0, z: 3.3 }, headingDeg: 0, halfW: 5, halfD: 0.1 }, hRange: [-1, 1.8] });
      void t.core.player.goto('st_entry');
    }
    t.core.cameraRig.look(t.core.player.yawDeg(), 8);
    tick(t, 2);
    const p = t.core.player.pos(), up = t.core.player.up();
    return { t, boom: t.core.cameraRig.camera.position.distanceTo(p.clone().addScaledVector(up, FOLLOW.eye)) };
  };
  it('planet: a head-high wall right behind the player lifts the camera instead of pulling it into the head', () => {
    const { t, boom } = setup('planet');
    expect(boom).toBeGreaterThan(FOLLOW.back * 0.6);
    expect(boomClipped(t)).toBe(false);
  });
  it('interiors keep the plain pull-in (ceilings are not colliders)', () => {
    const { t, boom } = setup('studio_int');
    expect(boom).toBeLessThan(FOLLOW.back * 0.6);
    expect(boomClipped(t)).toBe(false);
  });
});
