// P3r2 (camera): eased camera hand-overs (cameraRig.blend), the dialogue / inspect framings, the see-through compile-time
// variant and the ph_2026_group composition. Pure / headless checks; the in-browser A/B and screenshots are in the report.
import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera, ShaderLib, Vector3 } from 'three';
import { blendWeight } from './cameraRig';
import { createTestCore, type TestCore } from './testkit';
import { DEG, SURFACES, chartToWorld, frameAt } from './planet';
import { inspectPose, ridesHero } from '../ui/dialog/camera';
import { makeToonMaterial, patchToonShader } from '../render/materials';
import { GROUP_FRAME, TRIPOD_AT, groupAim, headingToTripod } from '../lens/tripod';
import { ZOOM_FOV } from '../lens/pose';
import { SPOTS } from '../data/locations';
import { TRIPOD_HEAD_H } from '../world/build/places2';

const tick = (t: TestCore, n: number) => { for (let i = 0; i < n; i++) t.internals.loop.tick(1 / 60); };

describe('cameraRig.blend (dialogue ease in / out)', () => {
  it('blendWeight is a clamped smoothstep', () => {
    expect(blendWeight(0, 1)).toBe(0);
    expect(blendWeight(0.5, 1)).toBeCloseTo(0.5);
    expect(blendWeight(2, 1)).toBe(1);
    expect(blendWeight(-1, 1)).toBe(0);
    expect(blendWeight(0.1, 0)).toBe(1);
  });
  it('a push after blend() moves from the old pose to the override over the blend time, then sits on it', () => {
    const t = createTestCore();
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 0 }, yawDeg: 0 });
    tick(t, 5);
    const rig = t.core.cameraRig;
    const from = rig.camera.position.clone();
    const target = from.clone().add(new Vector3(4, 0, 0));
    rig.blend?.(0.5);
    const pop = rig.push('test', (cam) => { cam.position.copy(target); cam.lookAt(0, 0, 0); });
    tick(t, 1);
    const early = rig.camera.position.distanceTo(target);
    expect(early).toBeGreaterThan(3.5);                     // one tick in: still near the old pose (no cut)
    tick(t, 14);                                            // ≈ 0.25 s: half way
    const mid = rig.camera.position.distanceTo(target);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(3);
    tick(t, 30);                                            // past 0.5 s: exactly on the override
    expect(rig.camera.position.distanceTo(target)).toBeLessThan(1e-6);
    // and back out: pop + blend eases back to the follow camera instead of cutting
    rig.blend?.(0.5);
    pop();
    tick(t, 1);
    expect(rig.camera.position.distanceTo(target)).toBeLessThan(0.5);
    tick(t, 40);
    expect(rig.camera.position.distanceTo(from)).toBeLessThan(0.2);
  });
  it('P3r2 gate: a teleport cancels a running blend, and a blend asked for before the new place was shown cuts', () => {
    const t = createTestCore();
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 0 }, yawDeg: 0 });
    tick(t, 5);
    const rig = t.core.cameraRig;
    rig.blend?.(0.5);                                       // e.g. a dialogue ease-out still running …
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 90 }, yawDeg: 0 });   // … when a goto moves him 30 m
    tick(t, 1);
    const feet = new Vector3();
    t.core.player.pos(feet);
    expect(rig.camera.position.distanceTo(feet)).toBeLessThan(6);   // on the follow boom at once, no sweep
    // teleport, then blend() in the same evaluate (golden S_studio: goto + inspect) → a cut to the override
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 180 }, yawDeg: 0 });
    t.core.player.pos(feet);
    const target = feet.clone().add(new Vector3(0, 3, 0));
    rig.blend?.(0.7);
    const pop = rig.push('test', (cam) => { cam.position.copy(target); });
    tick(t, 1);
    expect(rig.camera.position.distanceTo(target)).toBeLessThan(1e-6);
    pop();
  });
});

describe('dialogue / inspect framing', () => {
  it('ridesHero sees a speaker parented anywhere under the hero root (土地 on the shoulder)', () => {
    const hero = new Object3D(); hero.name = 'hero';
    const shoulder = new Object3D(); hero.add(shoulder);
    const tudi = new Object3D(); shoulder.add(tudi);
    const other = new Object3D();
    expect(ridesHero(tudi)).toBe(true);
    expect(ridesHero(other)).toBe(false);
  });
  it('the inspect two-shot keeps the hero (head to feet or an object in front of him) above the dialogue box', () => {
    const feet = chartToWorld({ r: 30, lon: 40 });
    const f = frameAt(SURFACES.planet, feet, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
    const cam = new PerspectiveCamera(42, 16 / 9, 0.1, 250);
    const pos = new Vector3(), look = new Vector3();
    for (const anchor of [feet.clone(), feet.clone().addScaledVector(f.north, 1.8).addScaledVector(f.up, 1.2)]) {
      for (const deg of [145, -125, 105]) {
        inspectPose(anchor, feet, f.up, f.north, deg, 1, pos, look);
        cam.position.copy(pos); cam.up.copy(f.up); cam.lookAt(look); cam.updateMatrixWorld(true);
        const y = (p: Vector3) => (1 - p.clone().project(cam).y) / 2;   // 0 = top of the frame
        const head = y(feet.clone().addScaledVector(f.up, 1.85));
        // P3r2 look L6: under the toasts (top ≈ 22 %), above the dialogue box
        expect(head).toBeGreaterThan(0.2);
        expect(head).toBeLessThan(0.42);
        // the prop: the anchor itself, or (anchor = his own stand spot) what he faces ≈ 1.1 m ahead at chest height
        const prop = anchor.distanceTo(feet) < 0.5 ? feet.clone().addScaledVector(f.north, 1.1).addScaledVector(f.up, 1.0) : anchor;
        expect(y(prop)).toBeLessThan(0.64);
        expect(y(prop)).toBeGreaterThan(0.1);
        expect(Math.abs(prop.clone().project(cam).x)).toBeLessThan(0.85);                // the box covers the bottom ≈ 35 %
      }
    }
  });
});

describe('see-through is a compile-time toon variant (P3r2 perf)', () => {
  const s = { vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToonShader(s);
  it('the cone, the fade and the discard all sit inside #ifdef CM_SEETHRU', () => {
    const f = s.fragmentShader;
    const a = f.indexOf('#ifdef CM_SEETHRU'), d = f.indexOf('discard;'), e = f.indexOf('#endif', d);
    expect(a).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(a);
    expect(f.indexOf('uSeeThru.w > 0.0')).toBeGreaterThan(a);
    expect(f.indexOf('uSeeThru.w > 0.0')).toBeLessThan(d);
    expect(e).toBeGreaterThan(d);
    expect(f.slice(e)).not.toContain('discard');
  });
  it('only materials made with { seeThru: true } get the define and their own program key', () => {
    const plain = makeToonMaterial({ vertexColors: true }), thin = makeToonMaterial({ vertexColors: true, seeThru: true });
    expect(plain.customProgramCacheKey()).not.toBe(thin.customProgramCacheKey());
    const run = (m: typeof plain) => {
      const p = { vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader, uniforms: {} } as never;
      m.onBeforeCompile(p, undefined as never);
      return (p as { fragmentShader: string }).fragmentShader;
    };
    expect(run(plain)).not.toContain('#define CM_SEETHRU');
    expect(run(thin)).toContain('#define CM_SEETHRU 1');
    expect(run(thin.clone())).toContain('#define CM_SEETHRU 1');
  });
});

describe('ph_2026_group composition (GDD §9 S_group_photo, P3r2)', () => {
  const tripod = chartToWorld({ ...TRIPOD_AT, h: TRIPOD_HEAD_H });
  const look = groupAim(tripod, new Vector3());
  const fr = frameAt(SURFACES.planet, tripod, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
  const cam = new PerspectiveCamera(ZOOM_FOV[1], 16 / 9, 0.05, 250);
  cam.position.copy(tripod); cam.up.copy(fr.up); cam.lookAt(look); cam.updateMatrixWorld(true);
  const ndc = (p: Vector3) => p.clone().project(cam);
  it('the lens aims at the angular middle of the band (front row shins → 老周 head), eye-level-ish', () => {
    const lo = ndc(chartToWorld(GROUP_FRAME.low)), hi = ndc(chartToWorld(GROUP_FRAME.high));
    expect(lo.y + hi.y).toBeCloseTo(0, 1);
    expect(Math.abs(lo.y)).toBeLessThan(0.95);
    expect(Math.abs(hi.y)).toBeLessThan(0.95);
    const pitch = Math.asin(look.clone().sub(tripod).normalize().dot(fr.up)) / DEG;
    expect(Math.abs(pitch)).toBeLessThan(8);
    expect(TRIPOD_HEAD_H).toBeLessThanOrEqual(2.3);
  });
  it('every lineup spot faces the tripod and every body (feet → head) is inside the 1× frame', () => {
    for (const id of ['g1', 'g3', 'g4', 'g6', 'g7', 'g8', 'g9', 'sp_stairs_x'] as const) {
      const s = SPOTS.find((x) => x.id === id);
      if (!s || !('r' in s.pos)) throw new Error(id);
      if (id !== 'sp_stairs_x') expect(Math.abs((((s.yaw ?? 0) - headingToTripod(s.pos) + 540) % 360) - 180), id).toBeLessThan(1);
      const h = s.pos.h ?? 0, tall = id === 'g6' ? 0.5 : id === 'g3' ? 1.3 : 1.8;
      for (const dh of [0, tall]) {                // P3r2 look L3: the feet too
        const p = ndc(chartToWorld({ r: s.pos.r, lon: s.pos.lon, h: h + dh }));
        expect(Math.abs(p.x), `${id} x`).toBeLessThan(0.95);
        expect(Math.abs(p.y), `${id} y @${dh}`).toBeLessThan(0.97);
      }
    }
  });
});
