// P3r2 G2 / G5: the tripod's chalk route walks with the REAL colliders (straight lines, player radius, no sidestep
// slack) from the tile and from the retry spot to the X; live labels never give away a photo-only answer.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Bus } from '../events';
import { createPhysics, PLAYER_RADIUS } from '../core/physics';
import { SURFACES, chartToFlat, flatToWorld } from '../core/planet';
import { planetColliders } from '../world/colliders';
import { planetSurfaces } from '../world/heights';
import { walkable, type Walker } from '../story/route';
import { SPOTS } from '../data/locations';
import { TARGETS } from '../data/photoTargets';
import { t } from '../data/zh';
import { GUIDE_ROUTE, TRIPOD_AT, X_RADIUS } from './tripod';

const w = new Vector3();
function walker(): Walker {
  const ph = createPhysics(new Bus());
  for (const c of planetColliders()) ph.registerCollider(c);
  for (const s of planetSurfaces()) ph.registerWalkSurface(s);
  return {
    heightAt: (x, z, h) => ph.heightAt('planet', x, z, h),
    blocked: (x, z, h, r) => ph.blocked('planet', flatToWorld(SURFACES.planet, { x, z, h: h + 0.05 }, w), r),
  };
}

describe('G2 tripod guide route', () => {
  const wk = walker();
  const pts = GUIDE_ROUTE.map((p) => chartToFlat(p));
  it('every leg walks straight at the player radius (the drawn line is a real path)', () => {
    const bad: string[] = [];
    for (let i = 1; i < pts.length; i++) if (!walkable(wk, pts[i - 1], pts[i], PLAYER_RADIUS, false)) bad.push(`${i - 1}->${i}`);
    expect(bad).toEqual([]);
  });
  it('the tile and the retry spot reach the first chalk point, and the route ends on the X', () => {
    const start = chartToFlat({ ...TRIPOD_AT, h: 0 }), retry = chartToFlat({ r: 47.2, lon: 24.6, h: 0 });
    expect(walkable(wk, start, pts[0], PLAYER_RADIUS, false)).toBe(true);
    expect(walkable(wk, retry, pts[0], PLAYER_RADIUS, false)).toBe(true);
    const x = SPOTS.find((s) => s.id === 'sp_stairs_x')!.pos as { r: number; lon: number; h: number };
    const xf = chartToFlat(x), end = pts[pts.length - 1];
    expect(Math.hypot(end.x - xf.x, end.z - xf.z)).toBeLessThan(X_RADIUS * 0.5);
  });
  it('the whole walk is short enough for the 10 s timer at walking pace (3.2 m/s) with room to spare', () => {
    const start = chartToFlat({ r: 47.2, lon: 24.6, h: 0 });
    let len = Math.hypot(pts[0].x - start.x, pts[0].z - start.z);
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    expect(len / 3.2).toBeLessThan(6.5);
  });
});

describe('G5 live labels', () => {
  it('T_light_trail reads a nudge toward the long exposure live; 「1987」 only on the photo', () => {
    const tg = TARGETS.find((x) => x.id === 'T_light_trail')!;
    expect(tg.liveKey).toBeTruthy();
    expect(t(tg.liveKey!)).not.toMatch(/1987/);
    expect(t(tg.okKey!)).toMatch(/1987/);
  });
  it('no live label repeats its ok label', () => {
    for (const tg of TARGETS) if (tg.liveKey && tg.okKey) expect(t(tg.liveKey)).not.toBe(t(tg.okKey));
  });
});
