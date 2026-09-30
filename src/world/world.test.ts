// src/world/world.test.ts — owner B. ARCHITECTURE §3.B self-tests: signalAt zones, walk-surface heights, spot table vs
// GDD, the P8 construction, anchors completeness, and on-foot reachability (walkcheck) with gates closed / open.
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { createPhysics } from '../core/physics';
import { SPOTS } from '../data/locations';
import { SPOT_IDS, WORLD_ANCHOR_IDS } from '../data/ids/spots';
import { chartToFlat, isChart, posToWorld } from '../core/planet';
import { signalFor } from './signal';
import { deckH, groundAt, hAtChart, northStairH, southStairH, planetSurfaces } from './heights';
import { planetColliders } from './colliders';
import { constructP8, glyphDiff, segmentHitsSphere, chaiBasis, GLYPH } from './p8';
import { bfs, standOf, TELEPORT_ONLY } from './walkcheck';
import { fl } from './geo';
import { ANCHOR_DEFS } from './anchors';
import { computeVpTemple } from './vp';
import { sectorHidden, CULL_LON } from './occlCull';

const sig = (r: number, lon: number, h = 0) => { const p = fl(r, lon); return signalFor('planet', p.x, p.z, h); };

describe('signal (GDD §3.10)', () => {
  it('matches the zone table', () => {
    expect(sig(34, 30, 5.5)).toBe(4);           // deck centre
    expect(sig(27, 40, 3)).toBe(3);             // north stair
    expect(sig(41, 23, 2.75)).toBe(3);          // south stair
    expect(sig(21, 160, 18)).toBe(3);           // estate roof
    expect(sig(66.5, 325, 1.5)).toBe(3);        // lighthouse door
    expect(sig(22, 100, 0.6)).toBe(0);          // alley
    expect(sig(34, 200, 0)).toBe(2);            // ring road
    expect(sig(45, 330, 0)).toBe(2);            // seawall promenade
    expect(sig(55, 322, 0.6)).toBe(2);          // pier
    expect(sig(34, 30, 0)).toBe(2);             // under the bridge (road)
    expect(sig(20, 60, 0)).toBe(1);             // elsewhere
    expect(sig(30, 60, 0)).toBe(1);             // store door (GDD P2: 便利店门口 1 格)
    expect(sig(31, 55, 0)).toBe(1);             // locker stand
    expect(sig(33, 60, 0)).toBe(2);             // road in front of the store (路上 2 格)
    expect(signalFor('studio_int', 0, 0, 0)).toBe(0);
  });
});

describe('walk surfaces (GDD §5.6)', () => {
  it('is 0 under the bridge and 5.5 on the deck', () => {
    expect(hAtChart(34, 30, 0)).toBe(0);
    expect(hAtChart(34, 30, 5.5)).toBeCloseTo(5.5);
    expect(deckH(fl(34, 30).x, fl(34, 30).z)).toBe(5.5);
  });
  it('stairs are monotonic with slope 0.55 and match the lineup heights', () => {
    let prev = -1;
    for (let lon = 16; lon <= 30; lon += 0.5) { const p = fl(41, lon); const h = southStairH(p.x, p.z) ?? -1; expect(h).toBeGreaterThanOrEqual(prev); prev = h; }
    prev = 99;
    for (let lon = 30; lon <= 51; lon += 0.5) { const p = fl(27, lon); const h = northStairH(p.x, p.z) ?? 99; expect(h).toBeLessThanOrEqual(prev); prev = h; }
    // g6 = 土地 crouching on a sea-side rail post (P3r2 lineup), not on a walk surface
    for (const id of ['g1', 'g2', 'g3', 'g4', 'g7', 'g8', 'g9', 'sp_stairs_x']) {
      const s = SPOTS.find((x) => x.id === id);
      if (!s || !isChart(s.pos)) throw new Error(id);
      const f = chartToFlat(s.pos);
      expect(Math.abs(groundAt(f.x, f.z, f.h) - f.h)).toBeLessThan(0.06);
    }
  });
  it('hill, pier and rock heights', () => {
    expect(hAtChart(3, 145, 4)).toBe(4);
    expect(hAtChart(9.5, 145, 2)).toBeCloseTo((4 * 3.5) / 7);
    expect(hAtChart(52, 322, 0.6)).toBeCloseTo(0.6);
    expect(hAtChart(66.5, 325, 1.5)).toBeCloseTo(1.5);
    expect(hAtChart(17.6, 104, 1.2)).toBeCloseTo(1.2, 1);
  });
});

describe('spot table (GDD §5.4 ±2 m / ±3°)', () => {
  it('has every SpotId once', () => {
    const ids = SPOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of SPOT_IDS) expect(ids).toContain(id);
  });
  it('moved spots stay within ±2 m of the GDD §5.4 values († construction spots excepted)', () => {
    const GDD: Record<string, [number, number, number]> = {
      sp_bus_bench: [38.5, 0, 0], sp_fire_ladder: [16.4, 147.3, 0], sp_donation_box: [3, 150, 4], sp_lion_left: [5, 138, 4],
      sp_temple_idol: [1.5, 145, 4], vp_temple_2011: [7.6, 143.5, 3.1], sp_store_door: [30, 60, 0], sp_locker: [31, 55, 0],
      sp_mirror: [30, 92, 2.4], sp_bridge_deck: [34, 30, 5.5], sp_bench: [52, 322, 0.6], sp_lighthouse_door: [66.5, 325, 1.5],
    };
    for (const [id, [r, lon, h]] of Object.entries(GDD)) {
      const s = SPOTS.find((x) => x.id === id);
      if (!s || !isChart(s.pos)) throw new Error(id);
      const a = fl(r, lon), b = fl(s.pos.r, s.pos.lon);
      expect(Math.hypot(a.x - b.x, a.z - b.z) + Math.abs((s.pos.h ?? 0) - h), id).toBeLessThanOrEqual(2);
    }
  });
  it('every non-teleport planet spot stands on its walk height', () => {
    for (const s of SPOTS) {
      if (s.scene !== 'planet' || TELEPORT_ONLY.has(s.id)) continue;
      const st = standOf(s);
      if (!st) continue;
      const hh = groundAt(st.x, st.z, st.h);
      expect(Math.abs(hh - st.h), s.id).toBeLessThan(0.35);
    }
  });
});

describe('P8 construction (GDD §9)', () => {
  it('diffs two glyph masks to the dot (thin hinting slivers are opened away)', () => {
    const w = 40, h = 40, a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let y = 2; y < 38; y++) { a[y * w + 5] = 1; a[y * w + 6] = 1; b[y * w + 5] = 1; }   // a 1-px sliver, 36 px long
    for (let y = 20; y < 32; y++) for (let x = 22; x < 34; x++) a[y * w + x] = 1;          // the 12×12 dot
    const d = glyphDiff(a, b, w, h, 2);
    expect(d?.cx).toBeCloseTo(27.5); expect(d?.cy).toBeCloseTo(25.5);
    expect((d?.x1 ?? 0) - (d?.x0 ?? 0)).toBe(11);
  });
  it('hides the dot from V behind the shade and overlays the glyph from E0', () => {
    const r = constructP8();
    // D lies on E0 → P (overlay), on the net radius
    const dir = r.P.clone().sub(r.E0).normalize();
    const toD = r.D.clone().sub(r.E0).normalize();
    expect(dir.angleTo(toD)).toBeLessThan(1e-6);
    expect(r.netDot.r).toBeCloseTo(41, 2);
    // from V the dot patch (all corners) is behind the occluder sphere; the shade itself is between V and D
    const half = r.dotSize / 2;
    const { right, up } = chaiBasis();
    for (const [sx, sy] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const corner = r.D.clone().addScaledVector(right, sx * half).addScaledVector(up, sy * half);
      expect(segmentHitsSphere(r.V, corner, r.S, r.occluderRadius)).toBe(true);
    }
    // ... but not the chai centre nor the ring's 4 corner points at ±45° (anchor corners: T_chai whole stays visible)
    const b = chaiBasis();
    const rr = GLYPH.planeM / 2;
    for (const [sx, sy] of [[0, 0], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]]) {
      const p = b.c.clone().addScaledVector(b.right, sx * rr).addScaledVector(b.up, sy * rr);
      expect(segmentHitsSphere(r.V, p, r.S, r.occluderRadius)).toBe(false);
    }
    // from E0 the shade does not cover the dot
    expect(segmentHitsSphere(r.E0, r.D, r.S, r.occluderRadius)).toBe(false);
    // the lamp stands on the outer sidewalk
    expect(r.lampFoot.r).toBeGreaterThan(36.5);
    expect(r.lampFoot.r).toBeLessThan(40);
  });
});

describe('anchors', () => {
  it('defines every WorldAnchorId', () => {
    for (const id of WORLD_ANCHOR_IDS) expect(ANCHOR_DEFS[id], id).toBeTruthy();
  });
});

describe('walkcheck (GDD §5.5 / §5.6)', () => {
  const setup = (open: boolean) => {
    const ph = createPhysics(new Bus());
    for (const c of planetColliders()) {
      const h = ph.registerCollider(c);
      if (c.gate && c.gate !== 'gate_estate') h.enabled = !open;
      if (c.gate === 'gate_estate') h.enabled = !open;
    }
    for (const s of planetSurfaces()) ph.registerWalkSurface(s);
    return ph;
  };
  const start = { r: 38.5, lon: 0, h: 0 };
  it('by day B1/B2 cut the r 13–62 band (lon 200 unreachable; estate closed)', () => {
    const ph = setup(false);
    const reach = bfs(ph, (x, z, h) => ph.heightAt('planet', x, z, h), start, { cell: 0.5 });
    const at = (r: number, lon: number) => { const p = fl(r, lon); return reach.near(p.x, p.z, 0.5); };
    expect(at(34, 100)).toBe(true);
    expect(at(34, 170)).toBe(true);
    expect(at(34, 345)).toBe(true);
    for (const r of [15, 20, 25, 30, 34, 38, 42, 46, 50, 55, 60]) expect(at(r, 200), `r ${r}`).toBe(false);
    expect(at(34, 300)).toBe(false);
    expect(at(22, 142)).toBe(false);               // estate yard behind the face gate
    expect(at(3, 145)).toBe(false);                // hilltop
  }, 60_000);
  it('no object-spot stand point is inside a collider (goto would push / snap the player away)', () => {
    const ph = setup(true);
    const bad = SPOTS.filter((s) => s.scene === 'planet' && s.stand && ph.blocked('planet', posToWorld('planet', s.stand), 0.3)).map((s) => s.id);
    expect(bad).toEqual([]);
  });
  it('with every gate open, every §5.4 planet spot is reachable on foot', () => {
    const ph = setup(true);
    const reach = bfs(ph, (x, z, h) => ph.heightAt('planet', x, z, h), start, { cell: 0.5 });
    const missing: string[] = [];
    for (const s of SPOTS) {
      if (s.scene !== 'planet' || TELEPORT_ONLY.has(s.id)) continue;
      const st = standOf(s);
      if (!st) continue;
      if (!reach.near(st.x, st.z, 0.9, st.h, 0.6)) missing.push(s.id);
    }
    expect(missing).toEqual([]);
    // nothing leaks onto the sea or into the back alleys
    for (const [r, lon] of [[55, 0], [52, 90], [18, 200], [18, 60], [66, 200], [50, 250], [55, 150], [53, 185], [52, 230], [17, 300], [17, 20], [19, 110], [55, 260], [52, 45]] as const) {
      const p = fl(r, lon);
      expect(reach.near(p.x, p.z, 0.5), `${r},${lon}`).toBe(false);
    }
  }, 90_000);
});

describe('vp_temple_2011 (GDD §5.4 ‡†)', () => {
  it('is constructed by the lion rule and the data row carries its exact yaw / pitch', () => {
    const v = computeVpTemple();
    expect(v.ndc.x).toBeCloseTo(-0.6, 1);
    expect(Math.abs(v.ndc.y)).toBeLessThanOrEqual(0.3);
    expect(v.lionDist).toBeGreaterThanOrEqual(2.5);
    // aiming at the idol centre from the slope is nearly level (GDD: pitch ≈ +4); a 13.7° pitch looked over the idol
    expect(v.pitch).toBeGreaterThan(0);
    expect(v.pitch).toBeLessThan(6);
    const s = SPOTS.find((x) => x.id === 'vp_temple_2011');
    if (!s || !isChart(s.pos)) throw new Error('vp_temple_2011');
    expect(Math.abs(s.pos.r - v.pos.r)).toBeLessThan(0.05);
    expect(Math.abs(s.pos.lon - v.pos.lon)).toBeLessThan(0.1);
    expect(Math.abs((s.yaw ?? 0) - v.yaw)).toBeLessThan(0.2);
    expect(Math.abs((s.pitch ?? 0) - v.pitch)).toBeLessThan(0.2);
  });
});

describe('street-level occlusion cull', () => {
  it('hides only chunks entirely beyond CULL_LON of longitude from the camera', () => {
    expect(sectorHidden(60, 60 + CULL_LON + 22.5 + 1, 22.5)).toBe(true);
    expect(sectorHidden(60, 60 + CULL_LON + 22.5 - 1, 22.5)).toBe(false);
    expect(sectorHidden(350, 350 + 180, 22.5)).toBe(true);        // across the pole, wrapping 360
    expect(sectorHidden(10, 300, 22.5)).toBe(false);              // 70° away with a 22.5° half span
  });
});
