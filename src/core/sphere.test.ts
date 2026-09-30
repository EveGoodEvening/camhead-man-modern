import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SURFACES, chartToWorld, frameAt, headingToDir, posToWorld } from './planet';
import {
  SurfaceWalker, basisQuaternion, expMap, horizonAngle, insideShape, logMap, resolveAll, resolveShape, type Shape,
} from './sphere';

const P = SURFACES.planet;
const dirOf = (v: Vector3) => v.clone().sub(P.center).normalize();

describe('sphere walker (TECH §3 port)', () => {
  it('a full lap brings position and heading back', () => {
    const start = chartToWorld({ r: 34, lon: 0 });
    const f = frameAt(P, start);
    const w = new SurfaceWalker(P, start, headingToDir(f, 90));
    const h0 = w.heading.clone();
    const lap = 2 * Math.PI * 80;
    for (let i = 0; i < 1000; i++) w.update({ x: 0, y: 1 }, lap / 1000, 1, false);
    expect(w.pos.distanceTo(start)).toBeLessThan(1e-6);
    expect(w.heading.distanceTo(h0)).toBeLessThan(1e-6);
    expect(w.pos.length()).toBeCloseTo(80, 9);
  });
  it('crosses the pole without flipping or NaN', () => {
    const start = chartToWorld({ r: 5, lon: 180 });
    const f = frameAt(P, start);
    const w = new SurfaceWalker(P, start, headingToDir(f, 0));   // uphill = toward the pole
    for (let i = 0; i < 100; i++) w.update({ x: 0, y: 1 }, 0.1, 1, false);   // 10 m
    expect(Number.isFinite(w.pos.x)).toBe(true);
    const c = w.pos.clone();
    // now 5 m past the pole on the lon 0 side, still moving away from it (heading seaward = 180)
    expect(Math.atan2(c.x, c.z)).toBeCloseTo(0, 3);
    const fr = frameAt(P, w.pos);
    expect(w.heading.dot(headingToDir(fr, 180))).toBeGreaterThan(0.999);
  });
  it('parallel transport keeps heading tangent and unit', () => {
    const start = chartToWorld({ r: 20, lon: 40 });
    const w = new SurfaceWalker(P, start, headingToDir(frameAt(P, start), 33));
    for (let i = 0; i < 200; i++) w.update({ x: 0.4, y: 0.8 }, 0.05, 3.2, false);
    const up = dirOf(w.pos);
    expect(Math.abs(w.heading.dot(up))).toBeLessThan(1e-9);
    expect(w.heading.length()).toBeCloseTo(1, 9);
    expect(Math.abs(w.facing.dot(up))).toBeLessThan(1e-9);
  });
  it('facing turns toward the motion; strafe keeps it on the heading', () => {
    const start = chartToWorld({ r: 20, lon: 40 });
    const w = new SurfaceWalker(P, start, headingToDir(frameAt(P, start), 0));
    for (let i = 0; i < 60; i++) w.update({ x: 1, y: 0 }, 1 / 60, 3.2, false);
    const right = new Vector3().crossVectors(w.heading, w.up).normalize();
    expect(w.facing.dot(right)).toBeGreaterThan(0.99);
    const w2 = new SurfaceWalker(P, start, headingToDir(frameAt(P, start), 0));
    for (let i = 0; i < 60; i++) w2.update({ x: 1, y: 0 }, 1 / 60, 3.2, true);
    expect(w2.facing.dot(w2.heading)).toBeGreaterThan(0.99);
  });
  it('log/exp maps round trip', () => {
    const a = new Vector3(0.3, 0.9, 0.1).normalize(), b = new Vector3(-0.2, 0.8, 0.5).normalize();
    const v = logMap(a, b);
    expect(v.length()).toBeCloseTo(Math.acos(a.dot(b)), 12);
    expect(expMap(a, v).distanceTo(b)).toBeLessThan(1e-12);
  });
  it('orientation basis maps +Y to up and +Z to forward', () => {
    const up = new Vector3(0.2, 0.9, 0.3).normalize();
    const fwd = new Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
    const q = basisQuaternion(up, fwd);
    expect(new Vector3(0, 1, 0).applyQuaternion(q).distanceTo(up)).toBeLessThan(1e-9);
    expect(new Vector3(0, 0, 1).applyQuaternion(q).distanceTo(fwd)).toBeLessThan(1e-9);
  });
});

describe('chart collisions', () => {
  const at = chartToWorld({ r: 30, lon: 20 });
  const n = dirOf(at);
  it('pushes out of a circle to exactly r + playerR', () => {
    const col: Shape = { kind: 'circle', n, r: 1 };
    const p = chartToWorld({ r: 30.5, lon: 20 });
    expect(resolveShape(P, p, 0.35, col)).toBe(true);
    const arc = Math.acos(dirOf(p).dot(n)) * 80;
    expect(arc).toBeCloseTo(1.35, 6);
    expect(p.length()).toBeCloseTo(80, 9);
  });
  it('pushes out of a box through the nearest face', () => {
    const fwd = headingToDir(frameAt(P, at), 0);
    const col: Shape = { kind: 'box', n, forward: fwd, halfW: 2, halfD: 1 };
    const p = at.clone();                                            // dead centre
    resolveShape(P, p, 0.35, col);
    expect(insideShape(P, p, 0.34, col)).toBe(false);
    const d = Math.acos(dirOf(p).dot(n)) * 80;
    expect(d).toBeCloseTo(1.35, 3);                                  // left through ±D (the short axis)
  });
  it('slides along a wall instead of stopping', () => {
    const fr = frameAt(P, at);
    const col: Shape = { kind: 'box', n, forward: headingToDir(fr, 0), halfW: 10, halfD: 0.5 };
    const startP = at.clone().addScaledVector(fr.north, 2).setLength(80);
    const w = new SurfaceWalker(P, startP, headingToDir(frameAt(P, startP), 225));   // diagonally into the wall
    for (let i = 0; i < 120; i++) w.update({ x: 0, y: 1 }, 1 / 60, 3.2, false, (pos) => { resolveAll(P, pos, 0.35, [col]); });
    expect(insideShape(P, w.pos, 0.34, col)).toBe(false);
    const east = w.pos.clone().sub(startP).dot(fr.east);
    expect(east).toBeLessThan(-2);                                    // it kept moving west along the wall
  });
  it('interiors behave as a flat plane (R = 5000)', () => {
    const S = SURFACES.studio_int;
    const p = posToWorld('studio_int', { x: 0, y: 0, z: 0 });
    const w = new SurfaceWalker(S, p, new Vector3(0, 0, -1));
    for (let i = 0; i < 60; i++) w.update({ x: 0, y: 1 }, 1 / 60, 3, false);
    expect(w.pos.z).toBeCloseTo(-3, 3);
    expect(Math.abs(w.pos.y)).toBeLessThan(0.002);
  });
  it('horizon angle grows with eye and object height', () => {
    expect(horizonAngle(80, 1.5, 0)).toBeCloseTo(Math.sqrt(2 * 1.5 / 80), 2);
    expect(horizonAngle(80, 1.5, 18)).toBeGreaterThan(horizonAngle(80, 1.5, 0));
  });
});
