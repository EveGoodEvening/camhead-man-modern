// src/world/kit/hull.ts — owner B. A lofted fishing-boat hull (GDD §5.3 #1 闽望渔 0815; ART §9 rounded silhouettes):
// stations from the transom (t 0) to a raked, pointed bow (t 1), each a flared U section. Local frame: x across,
// y up (keel at 0), z along the length (bow at +z). Flat-shaded, non-indexed, outward winding.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export interface HullDims { len: number; beam: number }
export interface HullParts { lower: BufferGeometry; band: BufferGeometry; upper: BufferGeometry; deck: BufferGeometry; transom: BufferGeometry }

const STATIONS = 14;

function halfW(t: number, beam: number): number {
  const w = t < 0.45 ? 0.86 + 0.14 * (t / 0.45) : 1 - 0.97 * Math.pow((t - 0.45) / 0.55, 1.8);
  return (beam / 2) * Math.max(0.03, w);
}
const keelY = (t: number) => (t > 0.55 ? 0.95 * Math.pow((t - 0.55) / 0.45, 1.6) : 0);
const sheerY = (t: number) => 1.6 + 0.55 * t * t;
const bandY = (t: number) => Math.min(sheerY(t) - 0.35, Math.max(0.95, keelY(t) + 0.45));

/** Section points of one side (s = ±1) at station t, keel → sheer: [keel, bilge, chine, band0, band1, sheer]. */
export function hullSection(t: number, s: number, d: HullDims): Vector3[] {
  const w = halfW(t, d.beam), k = keelY(t), y3 = bandY(t), z = -d.len / 2 + t * d.len;
  return [
    new Vector3(0, k, z),
    new Vector3(s * 0.55 * w, k + 0.12, z),
    new Vector3(s * 0.93 * w, Math.min(y3, k + 0.42), z),
    new Vector3(s * w, y3, z),
    new Vector3(s * w * 1.01, y3 + 0.16, z),
    new Vector3(s * w * 1.04, sheerY(t), z),
  ];
}

function builder(): { tri(a: Vector3, b: Vector3, c: Vector3, out: Vector3, uv?: [number, number][]): void; geo(): BufferGeometry } {
  const pos: number[] = [], uvs: number[] = [];
  const e1 = new Vector3(), e2 = new Vector3(), n = new Vector3();
  return {
    tri(a, b, c, out, uv) {
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const flip = n.dot(out) < 0;
      const vs = flip ? [a, c, b] : [a, b, c];
      const us = uv ? (flip ? [uv[0], uv[2], uv[1]] : uv) : [[0, 0], [1, 0], [1, 1]] as [number, number][];
      for (let i = 0; i < 3; i++) { pos.push(vs[i].x, vs[i].y, vs[i].z); uvs.push(us[i][0], us[i][1]); }
    },
    geo() {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      return g;
    },
  };
}

export function buildHull(d: HullDims): HullParts {
  const lower = builder(), band = builder(), upper = builder(), deck = builder(), transom = builder();
  const secs: { l: Vector3[]; r: Vector3[] }[] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    secs.push({ l: hullSection(t, -1, d), r: hullSection(t, 1, d) });
  }
  const out = new Vector3(), mid = new Vector3();
  const quad = (b: ReturnType<typeof builder>, a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3, cy: number) => {
    mid.copy(a0).add(a1).add(b0).add(b1).multiplyScalar(0.25);
    out.set(mid.x, mid.y - cy, 0);
    if (out.lengthSq() < 1e-6) out.set(0, -1, 0);
    b.tri(a0, b0, b1, out); b.tri(a0, b1, a1, out);
  };
  for (let i = 0; i < STATIONS; i++) {
    const t = (i + 0.5) / STATIONS, cy = (keelY(t) + sheerY(t)) * 0.55;
    for (const side of ['l', 'r'] as const) {
      const A = secs[i][side], Bn = secs[i + 1][side];
      for (let k = 0; k < 5; k++) {
        const target = k < 3 ? lower : k === 3 ? band : upper;
        quad(target, A[k], Bn[k], A[k + 1], Bn[k + 1], cy);
      }
    }
    // deck between the two sheer lines
    const up = new Vector3(0, 1, 0);
    deck.tri(secs[i].l[5], secs[i].r[5], secs[i + 1].r[5], up); deck.tri(secs[i].l[5], secs[i + 1].r[5], secs[i + 1].l[5], up);
  }
  // transom: fan over the stern section
  const s0 = secs[0], back = new Vector3(0, 0, -1), c = new Vector3(0, sheerY(0) * 0.5, -d.len / 2);
  const ring = [...s0.l.slice().reverse(), ...s0.r.slice(1)];
  for (let k = 0; k < ring.length - 1; k++) transom.tri(c, ring[k], ring[k + 1], back);
  transom.tri(c, s0.r[5], s0.l[5], back);
  return { lower: lower.geo(), band: band.geo(), upper: upper.geo(), deck: deck.geo(), transom: transom.geo() };
}

/** A strip lying on the upper hull band of side s between stations t0 → t1 (the painted name), subdivided so it
 *  follows the tapering bow (a single quad's chord would sink inside the convex hull). uv reads upright from outside;
 *  `lift` pushes it off the surface. */
export function hullDecal(d: HullDims, s: number, t0: number, t1: number, f0: number, f1: number, lift = 0.03): BufferGeometry {
  const p = (t: number, f: number) => {
    const sec = hullSection(t, s, d);
    const q = sec[4].clone().lerp(sec[5], f);
    q.x += s * lift;
    return q;
  };
  const b2 = builder(), out = new Vector3(s, 0, 0), n = STATIONS;
  // viewer's right is toward the stern on the +x side and toward the bow on the −x side
  const u = (k: number) => (s > 0 ? 1 - k / n : k / n);
  for (let k = 0; k < n; k++) {
    const ta = t0 + ((t1 - t0) * k) / n, tb = t0 + ((t1 - t0) * (k + 1)) / n;
    const a = p(ta, f0), b = p(tb, f0), c = p(tb, f1), dd = p(ta, f1);
    b2.tri(a, b, c, out, [[u(k), 0], [u(k + 1), 0], [u(k + 1), 1]]);
    b2.tri(a, c, dd, out, [[u(k), 0], [u(k + 1), 1], [u(k), 1]]);
  }
  return b2.geo();
}
