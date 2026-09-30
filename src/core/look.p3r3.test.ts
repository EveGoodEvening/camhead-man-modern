// P3r3 look fixer ('open-look'): program headroom, bowed camera eases, visual sight tests for the dialogue camera, the
// roof look-out assist, the fitted group-photo lens, the studio set dressing. Pure / headless checks; the in-browser
// evidence (program counts, screenshots) is in the report.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { EASE_HERO_R, EASE_MAX, LOOKOUT, easePoint, lookoutAhead, planEase, type EasePlanCtx } from './cameraRig';
import { gatherTris, isVisualOccluder, segmentHitsTris } from './sightTris';
import { createTestCore } from './testkit';
import { chartToWorld, posToWorld } from './planet';
import { backFaces } from '../world/kit/batch';
import { GROUP_FRAME, PHOTO_MARGIN, TRIPOD_AT, groupAim, groupPhotoFov } from '../lens/tripod';
import { TRIPOD_HEAD_H } from '../world/build/places2';
import { SPOTS } from '../data/locations';
import { STUDIO_PROPS, studioColliders } from '../world/interiors/plans';

const SRC = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('P3r3 (a) shader program headroom', () => {
  it('backFaces reverses the winding and negates the normals (= what DoubleSide shades)', () => {
    const g = new PlaneGeometry(1, 1);
    const b = backFaces(g);
    const n0 = new Vector3(), a = new Vector3(), c = new Vector3(), d = new Vector3();
    const pos = b.getAttribute('position'), nor = b.getAttribute('normal');
    a.fromBufferAttribute(pos, 0); c.fromBufferAttribute(pos, 1); d.fromBufferAttribute(pos, 2);
    n0.crossVectors(c.sub(a), d.sub(a)).normalize();
    expect(n0.z).toBeCloseTo(-1);                              // the plane faced +z; its copy faces −z
    for (let i = 0; i < nor.count; i++) expect(nor.getZ(i)).toBeCloseTo(-1);
    expect(b.index).toBeNull();
  });
  it('no toon material in the world / cast is DoubleSide (each side variant is its own program)', () => {
    for (const f of ['/src/world/index.ts', '/src/chars/index.ts']) {
      const calls = SRC[f].split('makeToonMaterial(').slice(1).map((x) => x.slice(0, x.indexOf(')')));
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) expect(c, f).not.toContain('DoubleSide');
    }
  });
  it('the capture ghost pass uses two materials (the depth pass reuses the colour material)', () => {
    const src = SRC['/src/render/index.ts'];
    expect(src).not.toContain('depth: new MeshBasicMaterial');
    expect(src).toContain('g.color.colorWrite = false');
  });
});

describe('P3r3 (b) sight triangles', () => {
  const scene = () => {
    const root = new Object3D();
    // a 2 × 2 m board facing +z at z = 0, named like a world chunk
    const m = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial());
    m.name = 'world:solid:test'; m.position.set(0, 1, 0); root.add(m); root.updateMatrixWorld(true);
    const g = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial());
    g.name = 'world:ground:test'; g.position.set(0, 1, -0.5); root.add(g); root.updateMatrixWorld(true);
    return root;
  };
  it('gathers only visual occluder layers near the point', () => {
    const t = gatherTris(scene(), new Vector3(0, 1, 0), 3, isVisualOccluder);
    expect(t.count).toBe(2);                                 // the board's two triangles, not the ground layer
    expect(gatherTris(scene(), new Vector3(50, 1, 0), 3, isVisualOccluder).count).toBe(0);
  });
  it('segment test: crossing, trims, and seen-from-b (front faces only)', () => {
    const t = gatherTris(scene(), new Vector3(0, 1, 0), 3, isVisualOccluder);
    const a = new Vector3(0, 1, -1), b = new Vector3(0, 1, 1);
    expect(segmentHitsTris(t, a, b)).toBe(true);
    expect(segmentHitsTris(t, a, b, 1.1)).toBe(false);          // the crossing lies inside the trimmed start
    expect(segmentHitsTris(t, a, b, 0, 0, true)).toBe(true);    // b (+z) sees the board's front
    expect(segmentHitsTris(t, b, a, 0, 0, true)).toBe(false);   // a (−z) sees only its back: FrontSide draws nothing
    expect(segmentHitsTris(t, new Vector3(3, 1, -1), new Vector3(3, 1, 1))).toBe(false);
  });
  it('collapsed (degenerate) triangles are skipped: an opened gate hides nothing', () => {
    const root = new Object3D();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const m = new Mesh(g, new MeshBasicMaterial()); m.name = 'world:solid:x'; root.add(m); root.updateMatrixWorld(true);
    expect(gatherTris(root, new Vector3(), 5, isVisualOccluder).count).toBe(0);
  });
});

describe('P3r3 (b) bowed camera eases', () => {
  const up = new Vector3(0, 1, 0);
  const ctx = (o: Partial<EasePlanCtx> = {}): EasePlanCtx => ({ blocked: () => false, up, hero: null, interior: false, ...o });
  it('a clear move is a straight line; the ends are exact', () => {
    const a = new Vector3(0, 1.5, 0), b = new Vector3(4, 1.5, 0);
    const off = planEase(a, b, ctx());
    expect(off?.length()).toBe(0);
    expect(easePoint(a, b, off as Vector3, 0, new Vector3()).distanceTo(a)).toBeLessThan(1e-9);
    expect(easePoint(a, b, off as Vector3, 1, new Vector3()).distanceTo(b)).toBeLessThan(1e-9);
  });
  it('a move that would fly through the hero bows over or round him and keeps EASE_HERO_R', () => {
    const a = new Vector3(0, 1.6, -3), b = new Vector3(0, 1.6, 3);
    const hero = { feet: new Vector3(0, 0, 0), up };
    const off = planEase(a, b, ctx({ hero }));
    expect(off).not.toBeNull();
    expect((off as Vector3).length()).toBeGreaterThan(0);
    for (let i = 0; i <= 20; i++) {
      const p = easePoint(a, b, off as Vector3, i / 20, new Vector3());
      const h = Math.max(0, Math.min(1.9, p.y));
      expect(Math.hypot(p.x, p.y - h, p.z)).toBeGreaterThanOrEqual(EASE_HERO_R - 1e-6);
    }
  });
  it('a collider in the straight line bends the path; a wall everywhere, or a move > EASE_MAX, is a cut', () => {
    const a = new Vector3(0, 1.5, 0), b = new Vector3(6, 1.5, 0);
    const post = (p: Vector3) => Math.hypot(p.x - 3, p.z) < 0.4 && p.y < 2.2;       // a 2.2 m post midway
    const off = planEase(a, b, ctx({ blocked: post }));
    expect(off).not.toBeNull();
    for (let i = 1; i < 30; i++) expect(post(easePoint(a, b, off as Vector3, i / 30, new Vector3()))).toBe(false);
    expect(planEase(a, b, ctx({ blocked: (p) => Math.abs(p.x - 3) < 0.3 }))).toBeNull();
    expect(planEase(a, new Vector3(EASE_MAX + 1, 1.5, 0), ctx())).toBeNull();
    // the visual test (rendered props with no collider) counts too
    expect(planEase(a, b, ctx({ segHit: () => true }))).toBeNull();
  });
  it('interiors never lift more than 0.5 m (ceilings are not colliders)', () => {
    const a = new Vector3(0, 1.5, 0), b = new Vector3(6, 1.5, 0);
    const off = planEase(a, b, ctx({ interior: true, blocked: (p) => Math.hypot(p.x - 3, p.z) < 0.4 }));
    expect(off === null || off.dot(up) <= 0.5 + 1e-9).toBe(true);
  });
  it('teleport-free blend in the test core still eases (straight, nothing in the way)', () => {
    const t = createTestCore();
    t.core.player.teleport({ scene: 'planet', at: { r: 20, lon: 0 }, yawDeg: 0 });
    for (let i = 0; i < 5; i++) t.internals.loop.tick(1 / 60);
    const rig = t.core.cameraRig;
    const target = rig.camera.position.clone().add(new Vector3(2, 0, 0));
    rig.blend?.(0.5);
    const pop = rig.push('test', (cam) => { cam.position.copy(target); });
    t.internals.loop.tick(1 / 60);
    expect(rig.camera.position.distanceTo(target)).toBeGreaterThan(1.5);
    for (let i = 0; i < 40; i++) t.internals.loop.tick(1 / 60);
    expect(rig.camera.position.distanceTo(target)).toBeLessThan(1e-6);
    pop();
  });
});

describe('P3r3 (g) roof look-out', () => {
  // a flat 10 m roof (|x|, |z| ≤ 5 at h 18) over ground at 0
  const roof = (x: number, z: number, h: number) => (Math.abs(x) <= 5 && Math.abs(z) <= 5 && h >= 17 ? 18 : 0);
  it('facing a roof edge within reach tilts the view; mid-roof, ground level and facing inward do not', () => {
    expect(lookoutAhead(roof, 4, 0, 18, 1, 0)).toBe(true);
    expect(lookoutAhead(roof, 0, 0, 18, 1, 0)).toBe(false);
    expect(lookoutAhead(roof, 4, 0, 18, -1, 0)).toBe(false);
    expect(lookoutAhead(() => 0, 0, 0, 0, 1, 0)).toBe(false);
    expect(lookoutAhead(roof, 4, 0, LOOKOUT.minH - 0.5, 1, 0)).toBe(false);
  });
});

describe('P3r3 (f) ph_2026_group lens', () => {
  const tripod = chartToWorld({ ...TRIPOD_AT, h: TRIPOD_HEAD_H });
  const fov = groupPhotoFov(tripod);
  const cam = new PerspectiveCamera(fov, 16 / 9, 0.1, 250);
  cam.position.copy(tripod); cam.up.copy(tripod).normalize(); cam.lookAt(groupAim(tripod, new Vector3()));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const ndc = (p: { r: number; lon: number; h: number }) => chartToWorld(p).project(cam);
  it('tighter than the 1× view, and the band (front-row feet → 老周 head) fills it to the margins', () => {
    expect(fov).toBeLessThan(54);
    const lo = ndc(GROUP_FRAME.low), hi = ndc(GROUP_FRAME.high);
    expect(Math.max(Math.abs(lo.y), Math.abs(hi.y))).toBeCloseTo(1 - 2 * PHOTO_MARGIN, 2);
  });
  it('every lineup member (feet and head) stays inside the photo; 土地 sits between 小刘 and 站务员', () => {
    const pos = (id: string) => { const s = SPOTS.find((x) => x.id === id); if (!s || !('r' in s.pos)) throw new Error(id); return s.pos as { r: number; lon: number; h?: number }; };
    for (const id of ['g1', 'g3', 'g4', 'g6', 'g7', 'g8', 'g9']) {
      const s = pos(id), h = s.h ?? 0, tall = id === 'g6' ? 0.5 : id === 'g3' ? 1.3 : 1.8;
      for (const dh of [0, tall]) {
        const p = ndc({ r: s.r, lon: s.lon, h: h + dh });
        expect(Math.abs(p.x), `${id} x`).toBeLessThan(0.95);
        expect(Math.abs(p.y), `${id} y`).toBeLessThan(0.97);
      }
    }
    const x = (id: string) => { const s = pos(id); return ndc({ r: s.r, lon: s.lon, h: (s.h ?? 0) + 0.3 }).x; };
    expect((x('g6') - x('g9')) * (x('g6') - x('g7'))).toBeLessThan(0);
  });
});

describe('P3r3 (g) studio set dressing', () => {
  it('the props leave the walk lines from the entry to every studio stand and the darkroom door clear', () => {
    const t = createTestCore();
    for (const c of studioColliders()) t.core.physics.registerCollider(c);
    const v = (x: number, z: number, y = 0.5) => chartToWorldLocal(x, y, z);
    const lines: [number, number, number, number][] = [
      [0, 2.4, -3.1, -0.5], [0, 2.4, -2, -1.5], [0, 2.4, 0.5, -1.7], [0, 2.4, 1.2, 1.5], [0, 2.4, 0, 5.5], [0, 4.2, 3.2, 4.2], [0, 2.4, -1.6, 3.6],
    ];
    for (const [x0, z0, x1, z1] of lines) {
      for (let i = 0; i <= 40; i++) {
        const k = i / 40;
        expect(t.core.physics.blocked('studio_int', v(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k), 0.3), `${x0},${z0}→${x1},${z1} @${k}`).toBe(false);
      }
    }
    expect(STUDIO_PROPS.lights.length).toBe(2);
  });
});

/** Interiors are local x / y / z around their own surface (core/planet posToWorld). */
function chartToWorldLocal(x: number, y: number, z: number): Vector3 {
  return posToWorld('studio_int', { x, y, z }, new Vector3());
}
