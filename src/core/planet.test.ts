import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import {
  PLANET_R, SURFACES, chartToLatLon, chartToWorld, dirToHeading, flatDirToHeading, flatToChart, flatToWorld, frameAt,
  headingToDir, latLonToWorld, placeAt, posToWorld, worldToFlat, worldToLatLon, horizonVisible,
} from './planet';

const close = (a: Vector3, b: Vector3, eps = 1e-6) => expect(a.distanceTo(b)).toBeLessThan(eps);

describe('planet conventions (ARCHITECTURE §2.3)', () => {
  it('chartToLatLon({r:38.5, lon:0}).lat ≈ 62.43', () => {
    expect(chartToLatLon({ r: 38.5, lon: 0 }).lat).toBeCloseTo(62.43, 2);
  });
  it('at lon 0 east = +X; at lon 90 east = −Z', () => {
    const f0 = frameAt(SURFACES.planet, chartToWorld({ r: 38.5, lon: 0 }));
    close(f0.east, new Vector3(1, 0, 0));
    const f90 = frameAt(SURFACES.planet, chartToWorld({ r: 38.5, lon: 90 }));
    close(f90.east, new Vector3(0, 0, -1));
  });
  it('sp_bus_bench north = (0, 0.46, −0.89)', () => {
    const f = frameAt(SURFACES.planet, chartToWorld({ r: 38.5, lon: 0 }));
    expect(f.north.x).toBeCloseTo(0, 6);
    expect(f.north.y).toBeCloseTo(0.46, 2);
    expect(f.north.z).toBeCloseTo(-0.89, 2);
  });
  it('a model placed with heading 90 faces heading 90', () => {
    const o = placeAt(new Object3D(), 'planet', { r: 30, lon: 60 }, 90);
    o.updateMatrixWorld();
    const fwd = new Vector3(0, 0, 1).transformDirection(o.matrixWorld);
    const f = frameAt(SURFACES.planet, o.position);
    expect(dirToHeading(f, fwd)).toBeCloseTo(90, 6);
    const upModel = new Vector3(0, 1, 0).transformDirection(o.matrixWorld);
    close(upModel, f.up);
  });
  it('headings are clockwise from north seen from outside (lon increases toward heading 90)', () => {
    const p = chartToWorld({ r: 30, lon: 10 });
    const f = frameAt(SURFACES.planet, p);
    const step = p.clone().addScaledVector(headingToDir(f, 90), 0.5);
    expect(worldToLatLon(step).lon).toBeGreaterThan(10);
    expect(flatDirToHeading(0, 30, 1, 0)).toBeCloseTo(90, 6);   // at lon 0 (+Z), +X is east
  });
  it('at the pole north = −Z', () => {
    const f = frameAt(SURFACES.planet, new Vector3(0, PLANET_R, 0));
    close(f.north, new Vector3(0, 0, -1));
  });
  it('in interiors north = −Z and east = +X', () => {
    const p = posToWorld('studio_int', { x: 2, y: 0, z: 1 });
    const f = frameAt(SURFACES.studio_int, p);
    close(f.north, new Vector3(0, 0, -1), 1e-3);
    close(f.east, new Vector3(1, 0, 0), 1e-3);
  });
  it('latLonToWorld ∘ chartToLatLon is the identity', () => {
    for (const c of [{ r: 38.5, lon: 0 }, { r: 12, lon: 145 }, { r: 64, lon: 300 }, { r: 0.5, lon: 222 }]) {
      const ll = chartToLatLon(c);
      close(latLonToWorld(ll.lat, ll.lon), chartToWorld(c), 1e-9);
    }
  });
  it('flat ↔ world ↔ chart round trips', () => {
    const f = { x: 12.3, z: -40.1, h: 2 };
    const w = flatToWorld(SURFACES.planet, f);
    const back = worldToFlat(SURFACES.planet, w);
    expect(back.x).toBeCloseTo(f.x, 9); expect(back.z).toBeCloseTo(f.z, 9); expect(back.h).toBeCloseTo(2, 9);
    const c = flatToChart(f);
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(c.r, 9);
  });
  it('interiors are flat to within 1 cm over the room', () => {
    const p = posToWorld('subway_int', { x: 7, y: 0, z: 3 });
    expect(Math.abs(p.y)).toBeLessThan(0.01);
  });
  it('horizon: ~15.5 m ground horizon at 1.5 m eye height', () => {
    expect(horizonVisible(10, 0, 0, 1.0)).toBe(true);
    expect(horizonVisible(60, 1, 0, 1.0)).toBe(false);
    expect(horizonVisible(60, 1, 32, 1.0)).toBe(true);   // the crane stays visible
  });
});
