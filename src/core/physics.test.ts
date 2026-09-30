import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Bus } from '../events';
import { SURFACES, chartToFlat, chartToWorld, flatToWorld } from './planet';
import { createPhysics } from './physics';

const P = SURFACES.planet;
const arc = (a: Vector3, b: Vector3) => Math.acos(Math.min(1, a.clone().normalize().dot(b.clone().normalize()))) * 80;

describe('physics: colliders', () => {
  it('circle collider pushes the player out (2 iterations)', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 30, lon: 60 }, radius: 1 } });
    const p = chartToWorld({ r: 30.3, lon: 60 });
    expect(ph.resolve('planet', p, 0)).toBe(false);
    expect(arc(p, chartToWorld({ r: 30, lon: 60 }))).toBeCloseTo(1.35, 5);
  });
  it('box collider with heading: blocked() is a point test', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'planet', shape: { kind: 'box', at: { r: 30, lon: 60 }, headingDeg: 90, halfW: 0.5, halfD: 3 } });
    expect(ph.blocked('planet', chartToWorld({ r: 30, lon: 62 }), 0.1)).toBe(true);      // along its 3 m depth (east)
    expect(ph.blocked('planet', chartToWorld({ r: 31.5, lon: 60 }), 0.1)).toBe(false);  // 1.5 m north: outside W
  });
  it('hRange filters colliders by player height; disabled handles are ignored', () => {
    const ph = createPhysics(new Bus());
    const h = ph.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 30, lon: 60 }, radius: 1 }, hRange: [4, 7] });
    const low = chartToWorld({ r: 30.3, lon: 60 });
    const before = low.clone();
    ph.resolve('planet', low, 0);
    expect(low.distanceTo(before)).toBe(0);                                             // below the range: no block
    ph.resolve('planet', low, 5.5);
    expect(low.distanceTo(before)).toBeGreaterThan(0.5);                                // on the deck: blocked
    const p2 = before.clone();
    h.enabled = false;
    ph.resolve('planet', p2, 5.5);
    expect(p2.distanceTo(before)).toBe(0);
  });
  it('colliders only apply to their own scene', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'studio_int', shape: { kind: 'circle', at: { x: 0, y: 0, z: 0 }, radius: 1 } });
    const p = chartToWorld({ r: 0.2, lon: 0 });
    const b = p.clone();
    ph.resolve('planet', p, 0);
    expect(p.distanceTo(b)).toBe(0);
  });
});

describe('physics: walk surfaces (GDD §5.6 layering)', () => {
  // bridge: deck h 5.5 over r 28–40 at lon 30 (±1.2 m); south stairs rise along r 41 from lon 16 (h 0) to lon 30 (h 5.5)
  const deck = (x: number, z: number) => {
    const r = Math.hypot(x, z), lon = (Math.atan2(x, z) * 180) / Math.PI;
    return r >= 28 && r <= 40 && Math.abs(lon - 30) * (Math.PI / 180) * r <= 1.2 ? 5.5 : null;
  };
  const stairs = (x: number, z: number) => {
    const r = Math.hypot(x, z), lon = (Math.atan2(x, z) * 180) / Math.PI;
    return Math.abs(r - 41) <= 1.2 && lon >= 16 && lon <= 30 ? (5.5 * (lon - 16)) / 14 : null;
  };
  const make = () => {
    const ph = createPhysics(new Bus());
    ph.registerWalkSurface({ id: 'deck', scene: 'planet', heightAt: deck });
    ph.registerWalkSurface({ id: 'stairs', scene: 'planet', heightAt: stairs });
    return ph;
  };
  it('the road under the bridge stays at h 0', () => {
    const f = chartToFlat({ r: 34, lon: 30 });
    expect(make().heightAt('planet', f.x, f.z, 0)).toBe(0);
  });
  it('on the deck the deck height wins', () => {
    const f = chartToFlat({ r: 34, lon: 30 });
    expect(make().heightAt('planet', f.x, f.z, 5.5)).toBe(5.5);
  });
  it('climbing the stairs is continuous (step ≤ 0.45)', () => {
    const ph = make();
    let h = 0;
    for (let lon = 16; lon <= 30; lon += 0.25) {
      const f = chartToFlat({ r: 41, lon });
      const nh = ph.heightAt('planet', f.x, f.z, h);
      expect(nh - h).toBeLessThanOrEqual(0.45);
      h = nh;
    }
    expect(h).toBeCloseTo(5.5, 5);
  });
  it('a surface more than 0.45 m above is ignored', () => {
    const ph = createPhysics(new Bus());
    ph.registerWalkSurface({ id: 'roof', scene: 'planet', heightAt: () => 18 });
    expect(ph.heightAt('planet', 0, 30, 0)).toBe(0);
    expect(ph.heightAt('planet', 0, 30, 17.8)).toBe(18);
  });
});

describe('physics: zones', () => {
  it('emits enterZone / exitZone on edges only', () => {
    const bus = new Bus();
    const ph = createPhysics(bus);
    const ev: string[] = [];
    bus.on('enterZone', (e) => ev.push(`in:${e.spot}`));
    bus.on('exitZone', (e) => ev.push(`out:${e.spot}`));
    ph.registerZone({ id: 'sp_locker', scene: 'planet', at: { r: 31, lon: 55 }, radius: 6 });
    ph.updateZones('planet', chartToWorld({ r: 31, lon: 70 }));
    ph.updateZones('planet', chartToWorld({ r: 31, lon: 58 }));
    ph.updateZones('planet', chartToWorld({ r: 31, lon: 57 }));
    ph.updateZones('planet', chartToWorld({ r: 31, lon: 80 }));
    expect(ev).toEqual(['in:sp_locker', 'out:sp_locker']);
  });
  it('resolves SpotId zones through the spot resolver and honours hRange', () => {
    const bus = new Bus();
    const ph = createPhysics(bus);
    const ev: string[] = [];
    bus.on('enterZone', (e) => ev.push(e.spot));
    ph.setSpotResolver((id) => (id === 'sp_chai' ? { scene: 'planet', pos: { r: 44, lon: 256 } } : null));
    ph.registerZone({ id: 'chai', scene: 'planet', at: 'sp_chai', radius: 15, hRange: [-1, 3] });
    ph.updateZones('planet', flatToWorld(P, { ...chartToFlat({ r: 40, lon: 256 }), h: 10 }));
    expect(ev).toEqual([]);
    ph.updateZones('planet', chartToWorld({ r: 40, lon: 256 }));
    expect(ev).toEqual(['chai']);
  });
});
