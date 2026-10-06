import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { SURFACES, chartToWorld, dirToHeading, frameAt, placeAt, posToWorld, worldToFlat } from './planet';
import { createTestCore } from './testkit';

const tick = (t: ReturnType<typeof createTestCore>, n: number, move: { x: number; y: number } | null = null) => {
  for (let i = 0; i < n; i++) { t.core.input.inject({ move }); t.internals.loop.tick(1 / 60); }
};

describe('player', () => {
  it('walks along the sphere at 3.2 m/s and stays on the surface', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bus_bench', { fade: false });
    const a = t.core.player.pos();
    tick(t, 90, { x: 0, y: 1 });
    const b = t.core.player.pos();
    const arc = Math.acos(a.clone().normalize().dot(b.clone().normalize())) * 80;
    expect(arc).toBeGreaterThan(4.5);
    expect(arc).toBeLessThan(4.9);
    expect(b.length()).toBeCloseTo(80, 6);
    expect(t.core.player.speed()).toBeCloseTo(3.2, 1);
    // heading 90 from the bench = east = lon increasing (a great circle drifts slightly outward in r)
    const c = t.core.player.chart() as { r: number; lon: number };
    expect(c.lon).toBeGreaterThan(6);
    expect(Math.abs(c.r - 38.5)).toBeLessThan(0.5);
  });
  it('goto sets position, yaw and emits teleported; cross-scene goto is synchronous in ?test', () => {
    const t = createTestCore();
    const ev: string[] = [];
    t.bus.on('teleported', (e) => ev.push(`${e.scene}:${e.spot}`));
    t.bus.on('sceneChanged', (e) => ev.push(`${e.from}>${e.to}`));
    void t.core.player.goto('sp_store_door');
    expect(t.core.player.yawDeg()).toBeCloseTo(180, 6);
    void t.core.player.goto('st_entry');
    expect(t.core.scenes.active).toBe('studio_int');
    expect(t.core.player.scene).toBe('studio_int');
    expect(ev).toEqual(['planet:sp_store_door', 'planet>studio_int', 'studio_int:st_entry']);
    expect(t.core.player.object.parent).toBe(t.core.scenes.get('studio_int'));
  });
  it('object rule: goto(object spot) stands on `stand`, facing the object', () => {
    const t = createTestCore();
    void t.core.player.goto('dk_bench');
    const p = t.core.player.chart() as { x: number; z: number };
    expect(p.x).toBeCloseTo(3.5, 3); expect(p.z).toBeCloseTo(-1.6, 3);
    expect(t.core.player.yawDeg()).toBeCloseTo(0, 3);                     // north = −Z, toward the bench
    void t.core.player.goto('sp_donation_box');
    const c = t.core.player.chart() as { r: number; h: number };
    expect(c.r).toBeCloseTo(4.8, 3);
    expect(t.core.cameraRig.pitchDeg).toBeLessThan(0);                  // the QR is below eye level
  });
  it('actor rule: front stands 1.8 m in front facing the actor; behind looks where it looks', () => {
    const t = createTestCore();
    const root = placeAt(new Object3D(), 'planet', { r: 30, lon: 60 }, 180);
    root.updateMatrixWorld();
    t.core.actors.register({ id: 'xiaolin', scene: 'planet', root, head: root, layer: 'world', spot: () => 'sp_store_door' });
    void t.core.player.goto('sp_store_door');
    const p = t.core.player.pos();
    const ap = chartToWorld({ r: 30, lon: 60 });
    expect(p.distanceTo(ap)).toBeCloseTo(1.8, 2);
    const f = frameAt(SURFACES.planet, p);
    expect(Math.abs(((dirToHeading(f, ap.clone().sub(p)) - t.core.player.yawDeg() + 540) % 360) - 180)).toBeLessThan(0.5);
    const z = placeAt(new Object3D(), 'planet', { r: 47, lon: 316 }, 160);
    z.updateMatrixWorld();
    t.core.actors.register({ id: 'zhimei', scene: 'planet', root: z, head: z, layer: 'world', spot: () => 'sp_seawall_zhimei' });
    void t.core.player.goto('sp_seawall_zhimei');
    const q = t.core.player.pos();
    expect(q.distanceTo(chartToWorld({ r: 47, lon: 316 }))).toBeCloseTo(3.0, 2);
    const zp = chartToWorld({ r: 47, lon: 316 });
    const fq = frameAt(SURFACES.planet, q);
    expect(t.core.player.yawDeg()).toBeCloseTo(dirToHeading(fq, zp.clone().sub(q)), 3);   // she is dead centre
    expect(Math.abs(t.core.player.yawDeg() - 160)).toBeLessThan(2);                     // ≈ her facing (meridians converge)
  });
  it('clamps the planet player to r ≤ 71 m', () => {
    const t = createTestCore();
    t.core.player.teleport({ scene: 'planet', at: { r: 70.5, lon: 0 }, yawDeg: 180 });
    tick(t, 120, { x: 0, y: 1 });
    const f = worldToFlat(SURFACES.planet, t.core.player.pos());
    expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(71 + 1e-6);
  });
  it('descends from a spot height at 8 m/s when no walk surface holds it', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bridge_deck');
    expect(t.core.player.flat().h).toBeCloseTo(5.5, 6);
    tick(t, 30);
    expect(t.core.player.flat().h).toBeCloseTo(1.5, 1);
    tick(t, 30);
    expect(t.core.player.flat().h).toBe(0);
  });
  it('sit locks movement; movement input stands up', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bench');
    t.core.player.setPose('sit');
    const a = t.core.player.flat();
    tick(t, 2, { x: 0, y: 1 });
    expect(t.core.player.pose).toBe('stand');
    const b = t.core.player.flat();
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.2);
  });
  it('the follow camera sits behind the player with the local up vector', () => {
    const t = createTestCore();
    void t.core.player.goto('sp_bus_bench');
    tick(t, 1);
    const cam = t.core.cameraRig.camera;
    const p = t.core.player.pos(), up = t.core.player.up(), hd = t.core.player.heading();
    const rel = cam.position.clone().sub(p);
    expect(rel.dot(hd)).toBeCloseTo(-3.6, 1);
    expect(rel.dot(up)).toBeCloseTo(1.5, 1);
    expect(cam.up.dot(up)).toBeGreaterThan(0.999);
    const look = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(look.dot(hd)).toBeGreaterThan(0.9);
    // after walking the camera stays behind (damped follow)
    tick(t, 60, { x: 0, y: 1 });
    const rel2 = cam.position.clone().sub(t.core.player.pos());
    expect(rel2.dot(t.core.player.heading())).toBeLessThan(-3);
    expect(cam.up.dot(t.core.player.up())).toBeGreaterThan(0.999);
    expect(posToWorld('planet', { r: 0, lon: 0 }).y).toBe(80);
  });
  it('the camera boom stops in front of a thin wall between the player and the camera', () => {
    const t = createTestCore();
    t.core.physics.registerCollider({ scene: 'studio_int', shape: { kind: 'box', at: { x: 0, y: 0, z: 3.5 }, headingDeg: 0, halfW: 5, halfD: 0.1 } });
    void t.core.player.goto('st_entry');                 // (0, 0, 2.4) facing −Z; the wall is 1.1 m behind
    tick(t, 1);
    const z = t.core.cameraRig.camera.position.z;
    expect(z).toBeLessThan(3.4 - 0.19);
    expect(z).toBeGreaterThan(3.0);                      // pulled in only as far as needed
  });
});
