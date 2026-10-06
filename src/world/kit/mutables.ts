// src/world/kit/mutables.ts — owner B. Zero-draw-call dynamic dressing: tagged vertex ranges inside merged chunks are
// hidden (collapsed), shown, lifted along the local up, or re-textured (uv swap) — gates, marks, tripod, frame ①.
import type { BufferAttribute, Mesh } from 'three';
import type { UvRect } from '../atlas';
import type { BuiltChunk } from './batch';

interface Range { mesh: Mesh; start: number; count: number; orig: Float32Array; uv0: Float32Array }

export class Mutables {
  private by = new Map<string, Range[]>();
  constructor(chunks: readonly BuiltChunk[], prefix = 'dyn:') {
    for (const ch of chunks) for (const [tag, list] of ch.ranges) {
      if (!tag.startsWith(prefix)) continue;
      const pos = ch.mesh.geometry.getAttribute('position') as BufferAttribute;
      const uv = ch.mesh.geometry.getAttribute('uv') as BufferAttribute | undefined;
      for (const r of list) {
        const orig = new Float32Array(r.count * 3), uv0 = new Float32Array(r.count * 2);
        for (let i = 0; i < r.count; i++) {
          orig[i * 3] = pos.getX(r.start + i); orig[i * 3 + 1] = pos.getY(r.start + i); orig[i * 3 + 2] = pos.getZ(r.start + i);
          if (uv) { uv0[i * 2] = uv.getX(r.start + i); uv0[i * 2 + 1] = uv.getY(r.start + i); }
        }
        const key = tag.slice(prefix.length);
        const l = this.by.get(key) ?? [];
        l.push({ mesh: ch.mesh, start: r.start, count: r.count, orig, uv0 });
        this.by.set(key, l);
      }
    }
  }
  has(key: string): boolean { return this.by.has(key); }
  keys(): string[] { return [...this.by.keys()]; }
  /** Lift every vertex of `key` by dh metres along its own radial direction (mesh-local offset included). */
  lift(key: string, dh: number, visible = true): void {
    for (const r of this.by.get(key) ?? []) {
      const pos = r.mesh.geometry.getAttribute('position') as BufferAttribute;
      const o = r.mesh.position;
      for (let i = 0; i < r.count; i++) {
        let x = r.orig[i * 3], y = r.orig[i * 3 + 1], z = r.orig[i * 3 + 2];
        if (!visible) { x = r.orig[0]; y = r.orig[1]; z = r.orig[2]; }
        else if (dh !== 0) {
          const wx = x + o.x, wy = y + o.y, wz = z + o.z, L = Math.hypot(wx, wy, wz) || 1;
          x += (wx / L) * dh; y += (wy / L) * dh; z += (wz / L) * dh;
        }
        pos.setXYZ(r.start + i, x, y, z);
      }
      pos.needsUpdate = true;
    }
  }
  show(key: string, on: boolean): void { this.lift(key, 0, on); }
  /** Map the range's original [0,1]-relative uv from its old rect into a new rect. */
  swapUv(key: string, from: UvRect, to: UvRect): void {
    for (const r of this.by.get(key) ?? []) {
      const uv = r.mesh.geometry.getAttribute('uv') as BufferAttribute | undefined;
      if (!uv) continue;
      for (let i = 0; i < r.count; i++) {
        const u = (r.uv0[i * 2] - from.u0) / Math.max(1e-9, from.u1 - from.u0), v = (r.uv0[i * 2 + 1] - from.v0) / Math.max(1e-9, from.v1 - from.v0);
        uv.setXY(r.start + i, to.u0 + (to.u1 - to.u0) * u, to.v0 + (to.v1 - to.v0) * v);
      }
      uv.needsUpdate = true;
    }
  }
}
