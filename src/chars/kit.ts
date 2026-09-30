// src/chars/kit.ts — owner C. Procedural character kit (ART §7.1): primitives → one painted, rigidly skinned geometry.
// Pure (node-safe): no canvas, no WebGL. Every part carries colour, aSurfaceId, a uv (atlas) and one bone index.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, Euler, ExtrudeGeometry, LatheGeometry,
  Matrix4, Quaternion, Shape, SphereGeometry, Vector2, Vector3, type BufferAttribute as BA,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WHITE_UV, type CellRect } from './atlasLayout';

export interface PartUv {
  /** Planar projection along +Z of the part's local x/y into an atlas cell (front-facing verts only). */
  cell: CellRect;
  /** Local x/y extent that maps onto the cell's inner rect (metres, centred on `center`). */
  halfW: number; halfH: number; center?: readonly [number, number];
  /** Inner rect of the cell (0..1 of the cell) the extent maps onto; default the whole cell. */
  inner?: readonly [number, number, number, number];
  /** Verts whose normal.z is below this map to the cell's white corner (0 = back hemisphere). */
  minNz?: number;
  /** Keep the part's own uvs (0..1) mapped into the cell instead of projecting. */
  own?: boolean;
  /** Project in the part's local space (before `m`), e.g. heads placed straight onto the planet. */
  pre?: boolean;
}

interface Part { geo: BufferGeometry; color: Color; sid: number; bone: number; uv?: PartUv; tag?: string; uvFinal?: boolean }

const _q = new Quaternion(), _v = new Vector3(), _s = new Vector3(), _e = new Euler();
const DEG = Math.PI / 180;

/** Transform helper: translate, then Euler XYZ in degrees, then scale. */
export function xf(t: readonly [number, number, number], rDeg: readonly [number, number, number] = [0, 0, 0], s: number | readonly [number, number, number] = 1): Matrix4 {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  _q.setFromEuler(_e.set(rDeg[0] * DEG, rDeg[1] * DEG, rDeg[2] * DEG, 'XYZ'));
  return new Matrix4().compose(_v.set(t[0], t[1], t[2]), _q, _s.set(sc[0], sc[1], sc[2]));
}

/** Oriented segment transform: a Y-axis primitive of unit height placed from a to b. */
export function between(a: readonly [number, number, number], b: readonly [number, number, number]): { m: Matrix4; len: number } {
  const A = new Vector3(...a), B = new Vector3(...b);
  const d = B.clone().sub(A), len = d.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return { m: new Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new Vector3(1, 1, 1)), len };
}

// ---------------------------------------------------------------- primitives (low-poly, chunky)
export const P = {
  cube: (w: number, h: number, d: number) => new BoxGeometry(w, h, d),
  box: (w: number, h: number, d: number, r = 0.02, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)),
  sphere: (r: number, ws = 10, hs = 7) => new SphereGeometry(r, ws, hs),
  capsule: (r: number, len: number, cap = 2, rad = 8) => new CapsuleGeometry(r, Math.max(0.001, len), cap, rad),
  cyl: (rt: number, rb: number, h: number, seg = 10, open = false) => new CylinderGeometry(rt, rb, h, seg, 1, open),
  disc: (r: number, seg = 12) => new CircleGeometry(r, seg),
  /** Lathe from (radius, y) pairs, bottom → top; closed with the first/last radius collapsed if 0. */
  lathe: (profile: readonly (readonly [number, number])[], seg = 10) => new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(r, 0), y)), seg),
  /** Tapered limb along −Y from 0 to −len with rounded ends (3 spans; seg radial). */
  limb: (r0: number, r1: number, len: number, seg = 7) => new LatheGeometry([
    new Vector2(0, -len - r1 * 0.85), new Vector2(r1, -len), new Vector2(r0, 0), new Vector2(0, r0 * 0.85),
  ], seg),
  /** Chunky toe-cap shoe: a capsule lying along +Z, flattened. */
  shoe: (w: number, h: number, d: number) => new CapsuleGeometry(h / 2, Math.max(0.01, d - h), 2, 7).rotateX(Math.PI / 2).scale(w / h, 1, 1),
  /** Flat card from a 2D outline (x right, y up), extruded `depth` along +Z, centred on z. */
  card: (pts: readonly (readonly [number, number])[], depth: number, bevel = 0) => {
    const sh = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
    const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
};

/** Builds one merged, non-indexed geometry with position/normal/uv/color/aSurfaceId/skinIndex/skinWeight. */
export class Kit {
  private parts: Part[] = [];

  /** Add a primitive (consumed). `m` places it in mesh (bind-pose) space. */
  add(geo: BufferGeometry, hex: string, sid: number, bone: number, m?: Matrix4, uv?: PartUv, tag?: string): this {
    let uvFinal = false;
    if (uv?.pre) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      geo = g;
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const gp = geo.getAttribute('position') as BA, gn = geo.getAttribute('normal') as BA, gu = geo.getAttribute('uv') as BA | undefined;
      const arr = new Float32Array(gp.count * 2);
      for (let i = 0; i < gp.count; i++) {
        const [u, v] = partUv(uv, gp.getX(i), gp.getY(i), gn.getZ(i), gu ? gu.getX(i) : 0, gu ? gu.getY(i) : 0);
        arr[i * 2] = u; arr[i * 2 + 1] = v;
      }
      geo.setAttribute('uv', new BufferAttribute(arr, 2));
      uvFinal = true;
    }
    if (m) geo.applyMatrix4(m);
    this.parts.push({ geo, color: new Color(hex), sid, bone, uv, tag, uvFinal });
    return this;
  }

  /** Mirror an add on the X axis (left ↔ right) with a different bone. */
  addMirrored(make: () => BufferGeometry, hex: string, sid: number, boneL: number, boneR: number, m: Matrix4, uv?: PartUv): this {
    this.add(make(), hex, sid, boneL, m, uv);
    const g = make().applyMatrix4(m).applyMatrix4(new Matrix4().makeScale(-1, 1, 1));
    flipWinding(g);
    return this.add(g, hex, sid, boneR, undefined, uv);
  }

  get triangleCount(): number {
    let n = 0;
    for (const p of this.parts) n += (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3;
    return n;
  }

  /** Vertex ranges (start, count) of tagged parts in the built geometry (for uv blinks / hide tricks). */
  readonly ranges = new Map<string, { start: number; count: number }[]>();

  build(): BufferGeometry {
    const geos = this.parts.map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo));
    let total = 0;
    for (const g of geos) total += g.getAttribute('position').count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const col = new Float32Array(total * 3), sid = new Float32Array(total);
    const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
    let o = 0;
    this.parts.forEach((p, k) => {
      const g = geos[k];
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const gp = g.getAttribute('position') as BA, gn = g.getAttribute('normal') as BA, gu = g.getAttribute('uv') as BA | undefined;
      const n = gp.count;
      if (p.tag) {
        const list = this.ranges.get(p.tag) ?? [];
        list.push({ start: o, count: n });
        this.ranges.set(p.tag, list);
      }
      for (let i = 0; i < n; i++) {
        const j = o + i;
        pos[j * 3] = gp.getX(i); pos[j * 3 + 1] = gp.getY(i); pos[j * 3 + 2] = gp.getZ(i);
        nor[j * 3] = gn.getX(i); nor[j * 3 + 1] = gn.getY(i); nor[j * 3 + 2] = gn.getZ(i);
        col[j * 3] = p.color.r; col[j * 3 + 1] = p.color.g; col[j * 3 + 2] = p.color.b;
        sid[j] = p.sid;
        si[j * 4] = p.bone; sw[j * 4] = 1;
        const [u, v] = p.uvFinal && gu ? [gu.getX(i), gu.getY(i)] : partUv(p.uv, gp.getX(i), gp.getY(i), gn.getZ(i), gu ? gu.getX(i) : 0, gu ? gu.getY(i) : 0);
        uv[j * 2] = u; uv[j * 2 + 1] = v;
      }
      o += n;
    });
    const out = new BufferGeometry();
    out.setAttribute('position', new BufferAttribute(pos, 3));
    out.setAttribute('normal', new BufferAttribute(nor, 3));
    out.setAttribute('uv', new BufferAttribute(uv, 2));
    out.setAttribute('color', new BufferAttribute(col, 3));
    out.setAttribute('aSurfaceId', new BufferAttribute(sid, 1));
    out.setAttribute('skinIndex', new BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    for (const g of geos) g.dispose();
    for (const p of this.parts) p.geo.dispose();
    this.parts = [];
    return out;
  }
}

function partUv(pu: PartUv | undefined, x: number, y: number, nz: number, u0: number, v0: number): [number, number] {
  if (!pu) return [WHITE_UV[0], WHITE_UV[1]];
  const c = pu.cell;
  const [ix0, iy0, ix1, iy1] = pu.inner ?? [0, 0, 1, 1];
  let fx: number, fy: number;
  if (pu.own) { fx = u0; fy = v0; }
  else {
    if (nz < (pu.minNz ?? 0)) return [c.u0 + 0.02 * (c.u1 - c.u0), c.v0 + 0.02 * (c.v1 - c.v0)];
    const cx = pu.center ? pu.center[0] : 0, cy = pu.center ? pu.center[1] : 0;
    fx = Math.min(1, Math.max(0, 0.5 + (x - cx) / (2 * pu.halfW)));
    fy = Math.min(1, Math.max(0, 0.5 + (y - cy) / (2 * pu.halfH)));
  }
  const ux = ix0 + fx * (ix1 - ix0), uy = iy0 + fy * (iy1 - iy0);
  return [c.u0 + ux * (c.u1 - c.u0), c.v0 + uy * (c.v1 - c.v0)];
}

/** Reverse triangle winding of a (possibly indexed) geometry after a mirror transform. */
export function flipWinding(g: BufferGeometry): BufferGeometry {
  if (g.index) {
    const a = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.getAttribute(name) as BA;
      const s = at.itemSize, arr = at.array as Float32Array;
      for (let i = 0; i < at.count; i += 3) {
        for (let c = 0; c < s; c++) {
          const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  return g;
}

export function triCount(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
