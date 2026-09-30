// src/world/geo.ts — owner B. Pure flat-chart helpers for the town layout (GDD §0.2; no three.js scene code).
// Flat chart: x = r·sin(lon), z = r·cos(lon); h = height above base ground. Headings are clockwise from local north.
import { DEG, flatDirToHeading } from '../core/planet';
import type { ChartPos } from '../types';

export interface P2 { x: number; z: number }

export const TAU = Math.PI * 2;

export function fl(r: number, lon: number): P2 { const l = lon * DEG; return { x: r * Math.sin(l), z: r * Math.cos(l) }; }
export function ch(p: P2, h = 0): ChartPos { return { r: Math.hypot(p.x, p.z), lon: ((Math.atan2(p.x, p.z) / DEG) + 360) % 360, h }; }
export function norm360(a: number): number { return ((a % 360) + 360) % 360; }
/** Signed smallest difference b − a in degrees (−180, 180]. */
export function lonDiff(a: number, b: number): number { let d = norm360(b - a); if (d > 180) d -= 360; return d; }
/** lon ∈ [from, to] going eastward (wraps through 0). */
export function inLon(lon: number, from: number, to: number): boolean {
  if (to - from >= 360) return true;
  const l = norm360(lon), a = norm360(from), b = norm360(to);
  return a <= b ? l >= a && l <= b : l >= a || l <= b;
}
export function lonSpan(from: number, to: number): number { const d = norm360(to - from); return d === 0 && from !== to ? 360 : d; }
/** Arc length along r for a lon span (m). */
export function arcLen(r: number, dLon: number): number { return r * Math.abs(dLon) * DEG; }
/** Degrees of lon covering `m` metres of arc at radius r. */
export function degFor(r: number, m: number): number { return (m / Math.max(1e-6, r)) / DEG; }

/** Local frame at flat point p: north (toward the pole), east (lon increasing). */
export function northAt(p: P2): P2 { const r = Math.hypot(p.x, p.z); return r < 1e-9 ? { x: 0, z: -1 } : { x: -p.x / r, z: -p.z / r }; }
export function eastAt(p: P2): P2 { const r = Math.hypot(p.x, p.z); return r < 1e-9 ? { x: 1, z: 0 } : { x: p.z / r, z: -p.x / r }; }
/** Flat direction of heading `hdg` at p. */
export function dirAt(p: P2, hdg: number): P2 {
  const n = northAt(p), e = eastAt(p), c = Math.cos(hdg * DEG), s = Math.sin(hdg * DEG);
  return { x: n.x * c + e.x * s, z: n.z * c + e.z * s };
}
export function add(a: P2, b: P2, k = 1): P2 { return { x: a.x + b.x * k, z: a.z + b.z * k }; }
export function sub(a: P2, b: P2): P2 { return { x: a.x - b.x, z: a.z - b.z }; }
export function len(a: P2): number { return Math.hypot(a.x, a.z); }
export function lerp2(a: P2, b: P2, t: number): P2 { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
/** Heading (at point p) of the flat segment direction d. */
export function headingOf(p: P2, d: P2): number { return flatDirToHeading(p.x, p.z, d.x, d.z); }
/** Offset a chart position by metres along its local (north, east). */
export function offsetNE(p: P2, north: number, east: number): P2 {
  const n = northAt(p), e = eastAt(p);
  return { x: p.x + n.x * north + e.x * east, z: p.z + n.z * north + e.z * east };
}

/** A rectangle footprint on the chart: centre, heading of its local +Z (front), half extents (w across, d along). */
export interface Rect { c: P2; hdg: number; hw: number; hd: number }

/** Radially aligned rect whose front edge (facing the road) is at rFront, spanning lon [a, b] at that radius. */
export function radialRect(rFront: number, rBack: number, lonA: number, lonB: number): Rect & { front: P2 } {
  const mid = norm360(lonA + lonSpan(lonA, lonB) / 2);
  const rMid = (rFront + rBack) / 2;
  const w = arcLen(rMid, lonSpan(lonA, lonB));
  const c = fl(rMid, mid);
  const facesOut = rFront > rBack;   // front toward larger r → faces seaward (heading 180)
  return { c, hdg: facesOut ? 180 : 0, hw: w / 2, hd: Math.abs(rFront - rBack) / 2, front: fl(rFront, mid) };
}

/** Model-local +X at heading `hdg` (= up × forward, i.e. the model's own left / a facing viewer's right). */
export function localX(p: P2, hdg: number): P2 { const f = dirAt(p, hdg); return { x: f.z, z: -f.x }; }
/** Point in a rect's local frame (x = model-local +X, z forward) → flat. */
export function rectPoint(rc: Rect, x: number, z: number): P2 {
  const f = dirAt(rc.c, rc.hdg);
  return { x: rc.c.x + f.x * z + f.z * x, z: rc.c.z + f.z * z - f.x * x };
}
