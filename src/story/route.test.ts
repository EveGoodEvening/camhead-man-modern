// src/story/route.test.ts — P3 wayfinding: the smoke's street graph walks with the REAL colliders / walk surfaces.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Bus } from '../events';
import { createPhysics } from '../core/physics';
import { SURFACES, chartToFlat, flatToChart, flatToWorld, toFlat, type Flat } from '../core/planet';
import { planetColliders } from '../world/colliders';
import { planetSurfaces } from '../world/heights';
import { studioColliders, subwayColliders } from '../world/interiors/plans';
import { SPOTS } from '../data/locations';
import type { SceneId, SpotId } from '../types';
import { Router, alongRoute, followOn, routeGraph, walkable, type Walker } from './route';

const w = new Vector3();
function world(open: { estate?: boolean; roadwork?: boolean; gantry?: boolean }) {
  const ph = createPhysics(new Bus());
  for (const c of planetColliders()) {
    const h = ph.registerCollider(c);
    if (c.gate === 'gate_estate') h.enabled = !open.estate;
    else if (c.gate) h.enabled = !open.roadwork;
  }
  for (const s of planetSurfaces()) ph.registerWalkSurface(s);
  for (const c of studioColliders()) ph.registerCollider(c);
  const sw = subwayColliders();
  for (const c of sw.walls) ph.registerCollider(c);
  for (const c of sw.gantry) ph.registerCollider(c).enabled = !open.gantry;
  const walker = (scene: SceneId): Walker => ({
    heightAt: (x, z, h) => ph.heightAt(scene, x, z, h),
    blocked: (x, z, h, r) => ph.blocked(scene, flatToWorld(SURFACES[scene], { x, z, h: h + 0.05 }, w), r),
  });
  return { ph, walker };
}
const spotFlat = (id: SpotId): Flat => {
  const s = SPOTS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return toFlat(s.stand ?? s.pos);
};
const lonOf = (p: Flat) => flatToChart(p).lon;
/** Closest distance of q to the polyline (flat). */
function nearPolyline(pts: readonly Flat[], q: Flat): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - q.x, a.z + dz * t - q.z));
  }
  return best;
}

describe('route graph', () => {
  const all = world({ estate: true, roadwork: true, gantry: true });
  for (const scene of ['planet', 'studio_int', 'subway_int'] as const) {
    it(`every ${scene} edge is walkable with every gate open`, () => {
      const g = routeGraph(scene), wk = all.walker(scene);
      const r = new Router(g, wk);
      const bad = g.edges.filter(([a, b], k) => {
        void k;
        return !(walkable(wk, r.node(a), r.node(b)) || walkable(wk, r.node(b), r.node(a)));
      }).map(([a, b]) => `${g.nodes[a].id}-${g.nodes[b].id}`);
      expect(bad).toEqual([]);
    }, 60_000);
  }

  it('garbled SMS: locker → bridge deck climbs the north stair (never through its rails)', () => {
    const r = new Router(routeGraph('planet'), all.walker('planet'));
    const path = r.route(spotFlat('sp_locker'), spotFlat('sp_bridge_deck'));
    expect(path).not.toBeNull();
    const pts = path as Flat[];
    // passes the stair foot and a mid-stair point before reaching the deck height
    expect(pts.some((p) => Math.abs(flatToChart(p).r - 27) < 1 && p.h > 2 && p.h < 4)).toBe(true);
    expect(pts[pts.length - 1].h).toBeCloseTo(5.5, 1);
  });

  it('estate gate → temple goes through the yard and the hill gate', () => {
    const r = new Router(routeGraph('planet'), all.walker('planet'));
    const pts = r.route(spotFlat('sp_estate_gate'), spotFlat('sp_donation_box')) as Flat[];
    expect(pts).not.toBeNull();
    expect(nearPolyline(pts, chartToFlat({ r: 14.4, lon: 145 }))).toBeLessThan(1.5);
  });

  it('bus bench → lighthouse door walks the pier', () => {
    const r = new Router(routeGraph('planet'), all.walker('planet'));
    const pts = r.route(spotFlat('sp_bus_bench'), spotFlat('sp_lighthouse_door')) as Flat[];
    expect(pts).not.toBeNull();
    expect(pts.some((p) => Math.abs(lonOf(p) - 322) < 1.5 && flatToChart(p).r > 55)).toBe(true);
  });

  it('closed gates remove edges: by day the ring is cut at the roadwork, so bus stop → subway has no route', () => {
    const day = world({});
    const r = new Router(routeGraph('planet'), day.walker('planet'));
    expect(r.route(spotFlat('sp_bus_bench'), spotFlat('sp_subway_entry'))).toBeNull();
    // …but the store is reachable, and a later reset keeps working
    expect(r.route(spotFlat('sp_bus_bench'), spotFlat('sp_store_front'))).not.toBeNull();
    r.reset();
    expect(r.route(spotFlat('sp_bus_bench'), spotFlat('sp_mirror_stand'))).not.toBeNull();
  });

  it('studio front room → darkroom bench goes through the partition door', () => {
    const r = new Router(routeGraph('studio_int'), all.walker('studio_int'));
    const pts = r.route(spotFlat('st_entry'), spotFlat('dk_bench')) as Flat[];
    expect(pts).not.toBeNull();
    expect(nearPolyline(pts, { x: 1.5, z: 1.5, h: 0 })).toBeLessThan(0.4);
  });

  it('every planet smoke-able spot is routable from the bus stop with every gate open (except teleport-only ones)', () => {
    const r = new Router(routeGraph('planet'), all.walker('planet'));
    const skip = new Set(['sp_roof', 'pk_coop', 'sp_estate_window', 'sp_site_pipes', 'sp_mirror']);
    const missing: string[] = [];
    for (const s of SPOTS) {
      if (s.scene !== 'planet' || skip.has(s.id) || /^g\d$/.test(s.id)) continue;
      if (!r.route(spotFlat('sp_bus_bench'), spotFlat(s.id))) missing.push(s.id);
    }
    expect(missing).toEqual([]);
  }, 60_000);

  it('P3r3 G4: from the pockets inside the hill wall the smoke leads out through the hill gate, never at the wall', () => {
    const r = new Router(routeGraph('planet'), all.walker('planet'));
    const wk = all.walker('planet');
    const door = spotFlat('sp_studio_door');
    for (const [rr, lon, h] of [[11.25, 99, 1.0], [11.5, 110, 1.0], [12, 99, 0.6], [10.5, 99, 1.4], [11.25, 80, 1.0], [11.25, 95, 1.0]]) {
      const from = chartToFlat({ r: rr, lon, h });
      const pts = r.route(from, door);
      expect(pts, `${rr}/${lon}`).not.toBeNull();
      expect(pts!.length, `${rr}/${lon}`).toBeGreaterThan(2);                       // not the straight line into the wall
      expect(nearPolyline(pts!, chartToFlat({ r: 14.4, lon: 145 })), `${rr}/${lon}`).toBeLessThan(1.5);
    }
    // the first leg from the reported spot is clear for the player's own radius, walked straight
    const pts = r.route(chartToFlat({ r: 11.25, lon: 99, h: 1 }), door)!;
    expect(walkable(wk, pts[0], pts[1], 0.35, false)).toBe(true);
  });

  it('P3r3 G4: followOn keeps the rest of the route for a player walking along it, and gives up once he left it', () => {
    const pts = [{ x: 0, z: 0, h: 0 }, { x: 10, z: 0, h: 0 }, { x: 10, z: 10, h: 0 }];
    expect(followOn(pts, { x: 4, z: 0.5, h: 0 })).toEqual([{ x: 4, z: 0.5, h: 0 }, { x: 10, z: 0, h: 0 }, { x: 10, z: 10, h: 0 }]);
    expect(followOn(pts, { x: 10.3, z: 6, h: 0 })).toEqual([{ x: 10.3, z: 6, h: 0 }, { x: 10, z: 10, h: 0 }]);
    expect(followOn(pts, { x: 4, z: 4, h: 0 })).toBeNull();                   // 4 m off the route
    expect(followOn(pts, { x: 4, z: 0, h: 2 })).toBeNull();                   // same place, another level (a deck)
  });

  it('alongRoute walks the polyline', () => {
    const pts = [chartToFlat({ r: 30, lon: 0 }), { x: 0, z: 40, h: 0 }, { x: 10, z: 40, h: 0 }];
    expect(alongRoute(pts, 5).p.z).toBeCloseTo(35, 5);
    expect(alongRoute(pts, 15).p.x).toBeCloseTo(5, 5);
    expect(alongRoute(pts, 99).p.x).toBe(10);
    expect(alongRoute(pts, 0).len).toBeCloseTo(20, 5);
  });
});
