// src/world/kit/prims.ts — owner B. Local-space primitive geometries (Y-up, +Z = front; ARCHITECTURE §2.3 models).
import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry,
  Matrix4, PlaneGeometry, SphereGeometry, Vector3,
} from 'three';
import type { Rng } from '../../contracts';

const _m = new Matrix4();

/** Box with its BOTTOM centre at (x, y, z); optional rotation about local Y (radians, counter-clockwise from above). */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rotY = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (rotY) g.applyMatrix4(_m.makeRotationY(rotY));
  g.translate(x, y, z);
  return g;
}
export type BoxFace = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
/** `box()` without the listed faces (a face hidden under a decal quad or against another mass is still rasterised
 *  at full cost on SwiftShader, which shades occluded fragments too). */
export function boxOpen(w: number, h: number, d: number, x: number, y: number, z: number, drop: readonly BoxFace[]): BufferGeometry {
  const g = box(w, h, d, x, y, z);
  const order: BoxFace[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const idx = g.getIndex();
  if (!idx) return g;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (!drop.includes(order[f])) for (let i = f * 6; i < f * 6 + 6; i++) keep.push(idx.getX(i));
  g.setIndex(keep);
  g.clearGroups();
  return g;
}
/** Box centred at (x,y,z) and rotated by Euler XYZ (radians). */
export function boxRot(w: number, h: number, d: number, x: number, y: number, z: number, rx: number, ry = 0, rz = 0): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
export type Facing = 'z' | '-z' | 'x' | '-x' | 'y' | '-y';
/** A textured quad (uv 0..1, u to the viewer's right) facing `f`, centred at (x, y, z). */
export function quad(w: number, h: number, x: number, y: number, z: number, f: Facing = 'z'): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  if (f === '-z') g.rotateY(Math.PI);
  else if (f === 'x') g.rotateY(Math.PI / 2);
  else if (f === '-x') g.rotateY(-Math.PI / 2);
  else if (f === 'y') g.rotateX(-Math.PI / 2);
  else if (f === '-y') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
/** A picture-frame ring (outer w × h, border bw) as 4 strips facing +z at (x, y, z): the frame of a pane without a
 *  full quad hidden behind the pane (SwiftShader rasterises hidden layers at full cost). */
export function frameRing(w: number, h: number, bw: number, x: number, y: number, z: number): BufferGeometry[] {
  const iw = w - 2 * bw;
  return [
    quad(w, bw, x, y + (h - bw) / 2, z), quad(w, bw, x, y - (h - bw) / 2, z),
    quad(bw, h - 2 * bw, x - (w - bw) / 2, y, z), quad(bw, h - 2 * bw, x + (iw + bw) / 2, y, z),
  ];
}
export function cyl(rTop: number, rBot: number, h: number, seg: number, x = 0, y = 0, z = 0, open = false): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}
/** Cylinder lying along local X (pipes, rails), centred at (x, y, z). */
export function cylX(r: number, len: number, seg: number, x: number, y: number, z: number, open = false): BufferGeometry {
  const g = new CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
export function cylZ(r: number, len: number, seg: number, x: number, y: number, z: number, open = false): BufferGeometry {
  const g = new CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
export function sphere(r: number, x: number, y: number, z: number, ws = 8, hs = 6): BufferGeometry {
  const g = new SphereGeometry(r, ws, hs);
  g.translate(x, y, z);
  return g;
}
/** Noisy icosahedron blob (foliage, rocks, rubble); ±jit radial noise, seeded. */
export function blob(r: number, x: number, y: number, z: number, rng: Rng, jit = 0.12, detail = 1, sy = 1): BufferGeometry {
  const g0 = detail < 0 ? new DodecahedronGeometry(r, 0) : new IcosahedronGeometry(r, detail);
  const g = g0.index ? g0.toNonIndexed() : g0;       // r186 polyhedra are already non-indexed (P3r3 L7: 500 warnings/load)
  const p = g.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let s = seen.get(k);
    if (s === undefined) { s = 1 + rng.range(-jit, jit); seen.set(k, s); }
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * sy, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return g;
}
/** Gable roof prism: ridge along X, width w (X), depth d (Z), rise h, eave overhang o; base at y. */
export function gable(w: number, d: number, h: number, y: number, o = 0.3, x = 0, z = 0): BufferGeometry {
  const hw = w / 2 + o, hd = d / 2 + o;
  const v = [
    // two slopes
    -hw, y, hd, hw, y, hd, hw, y + h, 0, -hw, y, hd, hw, y + h, 0, -hw, y + h, 0,
    hw, y, -hd, -hw, y, -hd, -hw, y + h, 0, hw, y, -hd, -hw, y + h, 0, hw, y + h, 0,
    // gables
    hw, y, hd, hw, y, -hd, hw, y + h, 0, -hw, y, -hd, -hw, y, hd, -hw, y + h, 0,
    // soffit
    -hw, y, hd, -hw, y, -hd, hw, y, -hd, -hw, y, hd, hw, y, -hd, hw, y, hd,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  g.translate(x, 0, z);
  return g;
}
/** Hip-ish temple roof with upturned corners: 4 sloped quads + ridge, simple and low-poly. */
export function hipRoof(w: number, d: number, h: number, y: number, o: number, lift: number): BufferGeometry {
  const hw = w / 2 + o, hd = d / 2 + o, rw = w * 0.28;
  const c = (x: number, z: number) => [x, y + ((Math.abs(x) >= hw - 1e-6 && Math.abs(z) >= hd - 1e-6) ? lift : 0), z];
  const A = c(-hw, hd), B = c(hw, hd), C = c(hw, -hd), D = c(-hw, -hd);
  const R1 = [-rw, y + h, 0], R2 = [rw, y + h, 0];
  const tri = (a: number[], b: number[], cc: number[]) => [...a, ...b, ...cc];
  const v = [
    ...tri(A, B, R2), ...tri(A, R2, R1),       // front slope
    ...tri(C, D, R1), ...tri(C, R1, R2),       // back slope
    ...tri(B, C, R2), ...tri(D, A, R1),        // hips
    ...tri(A, D, C), ...tri(A, C, B),          // soffit
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
/** Thin straight rail between two local points (a box of section s). */
export function bar(a: Vector3, b: Vector3, s: number): BufferGeometry {
  const d = b.clone().sub(a), L = d.length();
  const g = new BoxGeometry(s, s, L);
  const m = new Matrix4().lookAt(new Vector3(0, 0, 0), d, Math.abs(d.y / L) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
export function v3(x: number, y: number, z: number): Vector3 { return new Vector3(x, y, z); }
