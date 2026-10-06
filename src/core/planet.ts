// src/core/planet.ts — owner: S. FROZEN. The only place that encodes the coordinate conventions (GDD §0.2).
import { BufferAttribute, Matrix4, Quaternion, Vector3, type BufferGeometry, type Object3D } from 'three';
import type { SurfaceInfo } from '../contracts';
import type { ChartPos, LocalPos, SceneId } from '../types';

export const PLANET_R = 80;
export const PLANET_CENTER: Readonly<Vector3> = new Vector3(0, 0, 0);
export const INTERIOR_R = 5000;
export const INTERIOR_CENTER: Readonly<Vector3> = new Vector3(0, -INTERIOR_R, 0);
export const DEG = Math.PI / 180;
export const SURFACES: Readonly<Record<SceneId, SurfaceInfo>> = {
  planet: { scene: 'planet', center: PLANET_CENTER as Vector3, radius: PLANET_R, northRef: 'pole' },
  studio_int: { scene: 'studio_int', center: INTERIOR_CENTER as Vector3, radius: INTERIOR_R, northRef: 'fixed' },
  subway_int: { scene: 'subway_int', center: INTERIOR_CENTER as Vector3, radius: INTERIOR_R, northRef: 'fixed' },
};
const POLE = new Vector3(0, 1, 0), E1 = new Vector3(1, 0, 0), E2 = new Vector3(0, 0, 1), NEG_Z = new Vector3(0, 0, -1);
const _a = new Vector3(), _b = new Vector3(), _m = new Matrix4();

/** Flat chart coords: x = r·sin(lon), z = r·cos(lon) (planet); interiors: LocalPos x/z. h = height above base ground. */
export interface Flat { x: number; z: number; h: number }
export function isChart(p: ChartPos | LocalPos): p is ChartPos { return 'r' in p; }
export function chartToFlat(p: ChartPos): Flat {
  const l = p.lon * DEG;
  return { x: p.r * Math.sin(l), z: p.r * Math.cos(l), h: p.h ?? 0 };
}
export function flatToChart(f: Flat): ChartPos {
  const lon = ((Math.atan2(f.x, f.z) / DEG) + 360) % 360;
  return { r: Math.hypot(f.x, f.z), lon, h: f.h };
}
export function toFlat(p: ChartPos | LocalPos): Flat { return isChart(p) ? chartToFlat(p) : { x: p.x, z: p.z, h: p.y }; }

/** Exponential map at the surface's +Y pole (ART §6.2 chartToWorld with n=+Y, e1=+X, e2=+Z). */
export function flatToWorld(s: SurfaceInfo, f: Flat, out = new Vector3()): Vector3 {
  const r = Math.hypot(f.x, f.z), k = s.radius + f.h;
  if (r < 1e-9) return out.copy(POLE).multiplyScalar(k).add(s.center);
  const th = r / s.radius, sn = Math.sin(th) / r;
  return out.copy(POLE).multiplyScalar(Math.cos(th)).addScaledVector(E1, sn * f.x).addScaledVector(E2, sn * f.z)
    .multiplyScalar(k).add(s.center);
}
export function worldToFlat(s: SurfaceInfo, v: Vector3): Flat {
  const d = _a.copy(v).sub(s.center), len = d.length();
  d.divideScalar(len);
  const th = Math.acos(Math.min(1, Math.max(-1, d.y)));
  const t = Math.hypot(d.x, d.z);
  const r = th * s.radius;
  return t < 1e-12 ? { x: 0, z: 0, h: len - s.radius } : { x: (d.x / t) * r, z: (d.z / t) * r, h: len - s.radius };
}
export function chartToWorld(p: ChartPos, out = new Vector3()): Vector3 { return flatToWorld(SURFACES.planet, chartToFlat(p), out); }
export function posToWorld(scene: SceneId, p: ChartPos | LocalPos, out = new Vector3()): Vector3 {
  return flatToWorld(SURFACES[scene], toFlat(p), out);
}
/** lat 0 = equator, lat 90 = town pole (+Y); lon 0 = +Z, increasing toward +X (TECH dirFromLatLon). Degrees. */
export function latLonToDir(latDeg: number, lonDeg: number, out = new Vector3()): Vector3 {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return out.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}
export function latLonToWorld(latDeg: number, lonDeg: number, altitude = 0, out = new Vector3()): Vector3 {
  return latLonToDir(latDeg, lonDeg, out).multiplyScalar(PLANET_R + altitude).add(PLANET_CENTER);
}
export function worldToLatLon(v: Vector3): { lat: number; lon: number; alt: number } {
  const d = _a.copy(v).sub(PLANET_CENTER), len = d.length();
  return { lat: Math.asin(Math.min(1, Math.max(-1, d.y / len))) / DEG, lon: ((Math.atan2(d.x, d.z) / DEG) + 360) % 360, alt: len - PLANET_R };
}
/** GDD §0.2: lat = 90° − r·(180/π)/R  (= 90 − r·0.716197° at R = 80). */
export function chartToLatLon(p: ChartPos): { lat: number; lon: number } { return { lat: 90 - (p.r / PLANET_R) / DEG, lon: p.lon }; }

export interface SurfaceFrame { up: Vector3; north: Vector3; east: Vector3 }
/** north: planet → toward the +Y pole (toward the banyan; −Z at the pole itself); interiors → fixed −Z. east = north × up. */
export function frameAt(s: SurfaceInfo, pos: Vector3, out: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() }): SurfaceFrame {
  out.up.copy(pos).sub(s.center).normalize();
  const ref = s.northRef === 'pole' ? POLE : NEG_Z;
  out.north.copy(ref).addScaledVector(out.up, -ref.dot(out.up));
  if (out.north.lengthSq() < 1e-10) out.north.copy(NEG_Z).addScaledVector(out.up, -NEG_Z.dot(out.up));
  out.north.normalize();
  out.east.crossVectors(out.north, out.up).normalize();
  return out;
}
/** Heading/yaw: degrees clockwise from local north seen from outside (0 = uphill/north, 90 = east = lon increasing, 180 = seaward). */
export function headingToDir(f: SurfaceFrame, headingDeg: number, out = new Vector3()): Vector3 {
  const h = headingDeg * DEG;
  return out.copy(f.north).multiplyScalar(Math.cos(h)).addScaledVector(f.east, Math.sin(h));
}
export function dirToHeading(f: SurfaceFrame, dir: Vector3): number {
  return ((Math.atan2(dir.dot(f.east), dir.dot(f.north)) / DEG) + 360) % 360;
}
/** Model authored Y-up facing +Z → basis (right = up × fwd, up, fwd). */
export function orientationFromUpForward(up: Vector3, forward: Vector3, out = new Quaternion()): Quaternion {
  const f = _b.copy(forward).addScaledVector(up, -forward.dot(up)).normalize();
  const right = _a.crossVectors(up, f).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(right, up, f));
}
const _fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
const _dir = new Vector3();
export function placeMatrix(scene: SceneId, p: ChartPos | LocalPos, headingDeg = 0, out = new Matrix4(), scale = 1): Matrix4 {
  const pos = posToWorld(scene, p, new Vector3());
  frameAt(SURFACES[scene], pos, _fr);
  const q = orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir));
  return out.compose(pos, q, new Vector3(scale, scale, scale));
}
export function placeAt(obj: Object3D, scene: SceneId, p: ChartPos | LocalPos, headingDeg = 0): Object3D {
  posToWorld(scene, p, obj.position);
  frameAt(SURFACES[scene], obj.position, _fr);
  orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir), obj.quaternion);
  return obj;
}
/** Task-brief signature: planet only; altitude = height above ground. */
export function placeOnSphere(obj: Object3D, latDeg: number, lonDeg: number, headingDeg = 0, altitude = 0): Object3D {
  latLonToWorld(latDeg, lonDeg, altitude, obj.position);
  frameAt(SURFACES.planet, obj.position, _fr);
  orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir), obj.quaternion);
  return obj;
}
/** Heading of a flat-chart direction (dx, dz) at flat point (x, z) on the planet chart. */
export function flatDirToHeading(x: number, z: number, dx: number, dz: number): number {
  const r = Math.hypot(x, z);
  if (r < 1e-9) return ((Math.atan2(dx, -dz) / DEG) + 360) % 360;   // at the pole north = −Z, east = +X
  const nx = -x / r, nz = -z / r, ex = z / r, ez = -x / r;
  return ((Math.atan2(dx * ex + dz * ez, dx * nx + dz * nz) / DEG) + 360) % 360;
}
/** Wrap flat-authored geometry (x, y = height, z) onto the surface per vertex; normals rotated by the minimal rotation. */
export function wrapGeometry(geo: BufferGeometry, scene: SceneId = 'planet'): BufferGeometry {
  const s = SURFACES[scene], pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const q = new Quaternion(), v = new Vector3(), n = new Vector3(), up = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const f = { x: pos.getX(i), h: pos.getY(i), z: pos.getZ(i) };
    flatToWorld(s, f, v);
    up.copy(flatToWorld(s, { x: f.x, z: f.z, h: 0 }, up)).sub(s.center).normalize();
    pos.setXYZ(i, v.x, v.y, v.z);
    if (nor) { q.setFromUnitVectors(POLE, up); n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyQuaternion(q); nor.setXYZ(i, n.x, n.y, n.z); }
  }
  (pos as BufferAttribute).needsUpdate = true;
  if (nor) (nor as BufferAttribute).needsUpdate = true;
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
export function arcDistance(a: Vector3, b: Vector3, s: SurfaceInfo = SURFACES.planet): number {
  const da = _a.copy(a).sub(s.center).normalize(), db = _b.copy(b).sub(s.center).normalize();
  return Math.acos(Math.min(1, Math.max(-1, da.dot(db)))) * s.radius;
}
/** ART §6.3 horizon test. a = arc distance, b = bound radius, H = object height, hCam = camera height above ground. */
export function horizonVisible(arc: number, bound: number, height: number, hCam: number, R = PLANET_R): boolean {
  return arc - bound < Math.sqrt(2 * R * Math.max(0, hCam + 0.5)) + Math.sqrt(2 * R * Math.max(0, height)) + 5;
}
