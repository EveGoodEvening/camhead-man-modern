// src/world/boom.look.test.ts — P3-look L1: the follow-camera boom against the real planet colliders. Rails stop at
// their rail top (they used to be 60 m tall invisible walls, so the boom collapsed onto the phone head on the bridge
// and the stairs), thin posts are walker-only, and the walker is still stopped by all of them.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Bus } from '../events';
import { createPhysics } from '../core/physics';
import { SURFACES, frameAt, headingToDir, posToWorld } from '../core/planet';
import { FOLLOW, followPose } from '../core/cameraRig';
import { BRIDGE } from './layout';
import { STAIR_HEADROOM, planetColliders } from './colliders';
import { northStairH, southStairH, hAtChart } from './heights';
import { fl } from './geo';

const physics = createPhysics(new Bus());
for (const c of planetColliders()) physics.registerCollider(c);

/** Boom length the rig would get at chart (r, lon) facing `yaw` (pitch 0): pivot → first blocked sample. */
function boomAt(r: number, lon: number, yaw: number): number {
  const h = hAtChart(r, lon, 10);
  const feet = posToWorld('planet', { r, lon, h }, new Vector3());
  const f = frameAt(SURFACES.planet, feet, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
  const heading = headingToDir(f, yaw, new Vector3());
  const pos = new Vector3(), tgt = new Vector3();
  followPose(feet, f.up, heading, 0, pos, tgt);
  const pivot = feet.clone().addScaledVector(f.up, FOLLOW.eye);
  const len = pivot.distanceTo(pos);
  const n = Math.ceil(len / 0.05);
  for (let i = 1; i <= n; i++) {
    if (physics.blocked('planet', pivot.clone().lerp(pos, i / n), 0.2)) return (len * (i - 1)) / n;
  }
  return len;
}

describe('follow boom vs rails and thin props (P3-look L1)', () => {
  it('rails carry a height band that ends near the rail top', () => {
    const rails = planetColliders().filter((c) => /^(bridge:rail|stair[NS]:rail|stair[NS]:end)$/.test(c.tag ?? ''));
    expect(rails.length).toBeGreaterThan(20);
    for (const c of rails) {
      expect(c.hRange, c.tag).toBeDefined();
      expect(c.hRange![1], c.tag).toBeLessThanOrEqual(BRIDGE.deckH + 1.21);
      // walker still stopped: on the deck / landings, and on the flights (P3r3 G3: rails of the high part of a flight
      // start 1 m under its treads, so people on the lawn walk under it)
      const ground = c.tag === 'bridge:rail' || /:end$/.test(c.tag ?? '') ? BRIDGE.deckH - 1 : 0;
      if (/stair[NS]:rail/.test(c.tag ?? '')) {
        const at = c.shape.at as { r: number; lon: number };
        const N = c.tag!.startsWith('stairN');
        const q = fl((N ? BRIDGE.north : BRIDGE.south).r, at.lon);
        const h = (N ? northStairH(q.x, q.z) : southStairH(q.x, q.z)) ?? 0;
        expect(c.hRange![0], c.tag).toBeLessThanOrEqual(h < STAIR_HEADROOM ? 0 : h - 0.8);
      } else expect(c.hRange![0], c.tag).toBeLessThanOrEqual(ground);
    }
    // each stair rail piece stops within 1.2 m ± half a piece of slope (0.55 · 0.25 m) of the stair beside it
    for (const c of rails.filter((x) => /stair[NS]:rail/.test(x.tag ?? ''))) {
      const at = c.shape.at as { r: number; lon: number };
      const N = c.tag!.startsWith('stairN');
      const s = N ? BRIDGE.north : BRIDGE.south;
      const q = fl(s.r, at.lon);
      const h = (N ? northStairH(q.x, q.z) : southStairH(q.x, q.z)) ?? 0;
      expect(c.hRange![1] - h, `${c.tag}@${at.lon.toFixed(2)}`).toBeLessThanOrEqual(1.2 + 0.15);
    }
  });

  it('thin posts stop the walker but not the boom', () => {
    const thin = planetColliders().filter((c) => c.shape.kind === 'circle' && c.shape.radius < 0.3 && c.scene === 'planet'
      && /^(lamp|pole|hydrant|bollard|mailbox|bus:post|bus:sign|net:pole|bridge:pillar|market:col|b1:col|col:)/.test(c.tag ?? ''));
    expect(thin.length).toBeGreaterThan(30);
    for (const c of thin) {
      expect(c.hRange, c.tag).toBeDefined();
      expect(c.hRange![1], c.tag).toBeGreaterThanOrEqual(1.2);        // walker (feet h ≤ 1.2) blocked
      expect(c.hRange![1], c.tag).toBeLessThan(FOLLOW.eye);           // boom (pivot h 1.5) passes
    }
  });

  it('the boom keeps (nearly) its full length on the deck and the south stairs, across the rails', () => {
    // deck: the GDD §5.8 first overlook (sp_bridge_deck, yaw 90) and swung round
    for (const yaw of [0, 90, 180, 270]) expect(boomAt(34, 30, yaw), `deck yaw ${yaw}`).toBeGreaterThan(3.2);
    // south stair halfway up (h ≈ 2.75) looking across the flight either way (the boom crosses a rail)
    for (const yaw of [0, 180]) expect(boomAt(41, 23, yaw), `stairS yaw ${yaw}`).toBeGreaterThan(3.2);
    // north stair
    for (const yaw of [90, 270]) expect(boomAt(27, 40, yaw), `stairN yaw ${yaw}`).toBeGreaterThan(3.2);
  });

  it('the walker is still kept on the flights and the deck', () => {
    // a point just outside the south stair's rail, at the stair height there, is blocked for the walker
    const lon = 23, h = southStairH(fl(41, lon).x, fl(41, lon).z) ?? 0;
    const out = posToWorld('planet', { r: 41 + BRIDGE.south.halfW + 0.1, lon, h }, new Vector3());
    const f = frameAt(SURFACES.planet, out, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
    expect(physics.blocked('planet', out.clone().addScaledVector(f.up, 0.3), 0.35)).toBe(true);
    const deckEdge = posToWorld('planet', { r: 34, lon: 30, h: BRIDGE.deckH }, new Vector3());
    const across = posToWorld('planet', { r: 34, lon: 30 + (BRIDGE.halfW / (34 * Math.PI / 180)), h: BRIDGE.deckH + 0.3 }, new Vector3());
    expect(physics.blocked('planet', across, 0.35)).toBe(true);
    expect(deckEdge.length()).toBeGreaterThan(80);
  });

  it('P3r3 G3: the lawn under the high part of the south flight is open, the low part and the columns are not', () => {
    const ground = (r: number, lon: number) => {
      const p = posToWorld('planet', { r, lon, h: 0 }, new Vector3());
      const f = frameAt(SURFACES.planet, p, { up: new Vector3(), north: new Vector3(), east: new Vector3() });
      return physics.blocked('planet', p.addScaledVector(f.up, 0.05), 0.35);
    };
    // walking uphill from the P1 spot (r 47) at lon 23–26.6 (clear of the stair column at lon 24.75 and the bridge
    // pillar at 28.25): nothing stops him between r 44 and the road (r 38)
    for (const lon of [23, 25.6, 26.6]) {
      const hits: number[] = [];
      for (let r = 44; r >= 38; r -= 0.1) if (ground(r, lon)) hits.push(Number(r.toFixed(1)));
      expect(hits, `lon ${lon}`).toEqual([]);
    }
    // the low end of the flight (h < 2.45) still stops a walker at its outer rail
    expect(ground(42.4, 18)).toBe(true);
    // the support column at 5/8 of the flight
    const lonCol = BRIDGE.south.lonBot + (BRIDGE.south.lonTop - BRIDGE.south.lonBot) * 5 / 8;
    expect(ground(41, lonCol)).toBe(true);
  });
});
