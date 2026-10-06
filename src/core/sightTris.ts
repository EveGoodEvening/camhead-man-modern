// src/core/sightTris.ts — P3r3 (look b/c). Visual sight-line tests against the RENDERED world geometry.
// The colliders only know what the player bumps into: 小刘's roadwork boards, the subway canopy, awnings, shop signs and
// most props above 1.3 m are visual only, so a dialogue camera or an eased camera move "cleared" by physics.blocked()
// could still sit behind a board or fly through a roof. A TriSet is a flat list of world-space triangles gathered once
// around a place (merged world chunks are non-indexed, so this is a linear copy), then any number of segment tests.
import { Sphere, Vector3, type BufferAttribute, type Mesh, type Object3D } from 'three';

export interface TriSet {
  /** 9 floats per triangle (world space) */
  readonly tris: Float32Array;
  readonly count: number;
}

const _sph = new Sphere(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _m = new Vector3();

/** World-space triangles of every accepted, visible mesh under `root` that lie (roughly) within `radius` of `center`.
 *  Degenerate triangles (collapsed dynamic ranges: an opened gate's boards) are skipped. */
export function gatherTris(root: Object3D, center: Vector3, radius: number, accept: (m: Mesh) => boolean, maxTris = 40000): TriSet {
  const out: number[] = [];
  const meshes: Mesh[] = [];
  root.traverseVisible((o) => { const m = o as Mesh; if (m.isMesh && accept(m)) meshes.push(m); });
  for (const m of meshes) {
    const g = m.geometry;
    const pos = g.getAttribute('position') as BufferAttribute | undefined;
    if (!pos) continue;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere) {
      _sph.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      if (_sph.center.distanceTo(center) > _sph.radius + radius) continue;
    }
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const r2 = radius * radius;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      _a.fromBufferAttribute(pos, ia); _b.fromBufferAttribute(pos, ib); _c.fromBufferAttribute(pos, ic);
      _a.applyMatrix4(m.matrixWorld); _b.applyMatrix4(m.matrixWorld); _c.applyMatrix4(m.matrixWorld);
      _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
      const ext = Math.max(_m.distanceToSquared(_a), _m.distanceToSquared(_b), _m.distanceToSquared(_c));
      const d = _m.distanceTo(center);
      if (d * d > r2 && d - Math.sqrt(ext) > radius) continue;
      // degenerate (collapsed) triangle
      _b.sub(_a); _c.sub(_a);
      if (_m.crossVectors(_b, _c).lengthSq() < 1e-10) continue;
      out.push(_a.x, _a.y, _a.z, _a.x + _b.x, _a.y + _b.y, _a.z + _b.z, _a.x + _c.x, _a.y + _c.y, _a.z + _c.z);
      if (out.length >= maxTris * 9) return { tris: Float32Array.from(out), count: out.length / 9 };
    }
  }
  return { tris: Float32Array.from(out), count: out.length / 9 };
}

const _d = new Vector3(), _e1 = new Vector3(), _e2 = new Vector3(), _p = new Vector3(), _t = new Vector3(), _q = new Vector3();

/** Does the open segment a→b cross any triangle of the set? `trimA` / `trimB` metres at the ends are not tested (the
 *  subject's own body / the camera's near plane). `seenFromB`: only triangles whose FRONT faces b count — what a camera
 *  at b would actually draw (world materials are FrontSide; a subject leaning into a wall starts inside its box, and the
 *  exit through a back face hides nothing). Möller–Trumbore per triangle. */
export function segmentHitsTris(set: TriSet, a: Vector3, b: Vector3, trimA = 0, trimB = 0, seenFromB = false): boolean {
  _d.copy(b).sub(a);
  const len = _d.length();
  if (len < 1e-6) return false;
  _d.divideScalar(len);
  const t0 = trimA, t1 = len - trimB;
  if (t1 <= t0) return false;
  const T = set.tris;
  for (let i = 0; i < set.count; i++) {
    const o = i * 9;
    _e1.set(T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]);
    _e2.set(T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]);
    _p.crossVectors(_d, _e2);
    const det = _e1.dot(_p);
    if (det > -1e-9 && (seenFromB || det < 1e-9)) continue;    // det < 0 ⇔ the front face looks toward b
    const inv = 1 / det;
    _t.set(a.x - T[o], a.y - T[o + 1], a.z - T[o + 2]);
    const u = _t.dot(_p) * inv;
    if (u < 0 || u > 1) continue;
    _q.crossVectors(_t, _e1);
    const v = _d.dot(_q) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = _e2.dot(_q) * inv;
    if (t > t0 && t < t1) return true;
  }
  return false;
}

/** World chunk meshes that hide what is behind them (B names them `world:<layer>:<chunk>`): every layer but the
 *  ground, the alpha-cut dust net and cables (a thin cable crossing a face is fine). */
export function isVisualOccluder(m: Mesh): boolean {
  const n = m.name;
  if (!n.startsWith('world:')) return false;
  const layer = n.slice(6, n.indexOf(':', 6));
  return layer !== 'ground' && layer !== 'net' && layer !== 'cable' && layer !== 'far';
}
