// src/render/lowfx.ts — owner A. `?lowfx=1` fallback (GDD §0.3): flat ink blob shadows under every registered actor,
// drawn in the FX pass (depthWrite false, never in the main pass); actors stop casting map shadows; the shadow map
// is refreshed every 2nd frame (DPR 0.75 is set by main.ts).
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Vector3, type Object3D } from 'three';
import type { Core } from '../contracts';
import { flatFxMaterial } from './fx';

const MAX = 16, SEG = 12;

export class BlobShadows {
  readonly mesh: Mesh;
  private readonly pos = new Float32Array(MAX * SEG * 3 * 3);
  private readonly geo = new BufferGeometry();
  private readonly core: Core;
  private readonly muted = new WeakSet<Object3D>();
  constructor(core: Core) {
    this.core = core;
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.mesh = new Mesh(this.geo, flatFxMaterial('#1f282d', 0.32));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'render:blobs';
    this.mesh.renderOrder = -1;
  }
  private put(o: number, x: number, y: number): number {
    const p = this.pos;
    p[o] = _p.x + _t.x * x + _b.x * y; p[o + 1] = _p.y + _t.y * x + _b.y * y; p[o + 2] = _p.z + _t.z * x + _b.z * y;
    return o + 3;
  }
  update(): void {
    const core = this.core, scene = core.scenes.active, c = core.scenes.surface(scene).center;
    let o = 0, n = 0;
    for (const a of core.actors.list(scene)) {
      if (n >= MAX || !a.root.visible) continue;
      if (!this.muted.has(a.root)) {                          // actors fall back to blobs: no map shadow from them
        a.root.traverse((x) => { x.castShadow = false; });
        this.muted.add(a.root);
      }
      a.root.getWorldPosition(_p);
      _u.copy(_p).sub(c).normalize();
      _t.set(1, 0, 0).addScaledVector(_u, -_u.x);
      if (_t.lengthSq() < 1e-6) _t.set(0, 0, 1).addScaledVector(_u, -_u.z);
      _t.normalize();
      _b.crossVectors(_u, _t);
      _p.addScaledVector(_u, 0.03);
      const r = a.id === 'hero' ? 0.42 : 0.38;
      for (let k = 0; k < SEG; k++) {                          // no per-frame closures (ARCH §5.1)
        const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2;
        o = this.put(o, 0, 0);
        o = this.put(o, Math.cos(a0) * r, Math.sin(a0) * r * 0.8);
        o = this.put(o, Math.cos(a1) * r, Math.sin(a1) * r * 0.8);
      }
      n++;
    }
    this.pos.fill(0, o);
    this.geo.setDrawRange(0, n * SEG * 3);
    this.geo.getAttribute('position').needsUpdate = true;
  }
}
const _p = new Vector3(), _u = new Vector3(), _t = new Vector3(), _b = new Vector3();
