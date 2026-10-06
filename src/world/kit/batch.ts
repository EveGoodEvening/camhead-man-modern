// src/world/kit/batch.ts — owner B. Collects painted pieces per (layer, chunk) and merges them into cullable meshes
// (ARCHITECTURE §5.2: paint + mergePainted per chunk; ART §6.3 chunking; horizon culling via scenes.registerCullable).
import { BufferAttribute, Float32BufferAttribute, Matrix4, Mesh, Vector3, type BufferGeometry, type Material } from 'three';
import type { Core } from '../../contracts';
import type { LabelId, SceneId } from '../../types';
import { paint, mergePainted } from '../../core/geom';
import { PLANET_R, SURFACES, worldToFlat } from '../../core/planet';
import { WHITE_UV, type UvRect } from '../atlas';

/** P3r2 (camera): 'thin' = shadow-casting solid pieces the follow camera looks through (rails, posts, benches); it and
 *  'detail' use the see-through toon variant, the big 'solid' areas do not (SwiftShader pays the dither everywhere). */
export type LayerKind = 'ground' | 'solid' | 'thin' | 'detail' | 'win' | 'foliage' | 'interact' | 'cable' | 'net' | 'sign' | 'far';

export interface AddOpts { uv?: UvRect | null; label?: LabelId; chunk?: string; flipU?: boolean }

interface Piece { geo: BufferGeometry; tag?: string; order: number }
interface Bucket { layer: LayerKind; key: string; pieces: Piece[] }

export interface BuiltChunk {
  mesh: Mesh; layer: LayerKind; key: string;
  /** vertex ranges of tagged pieces (non-indexed after merge) */
  ranges: Map<string, { start: number; count: number }[]>;
}

const _v = new Vector3();

/** Chunk key for a planet world position: hill (r < 13) or a lon sector (45° for solid/detail, 90° for the
 *  big flat or cheap layers — fewer draw calls where horizon culling gains little). */
export function sectorKey(scene: SceneId, world: Vector3, layer: LayerKind = 'solid'): string {
  if (scene !== 'planet') return scene;
  const f = worldToFlat(SURFACES.planet, world);
  const r = Math.hypot(f.x, f.z);
  const lon = ((Math.atan2(f.x, f.z) * 180) / Math.PI + 360) % 360;
  // draw-call budget (ARCH §5.1 world ≤ 45): cheap / flat layers in halves, shadow casters in 45° sectors
  if (layer === 'cable' || layer === 'interact' || layer === 'net' || layer === 'ground' || layer === 'sign' || layer === 'win') {
    return r < 13 && layer !== 'ground' && layer !== 'sign' && layer !== 'win' ? 'hill' : `h${Math.floor(((lon + 45) % 360) / 180) % 2}`;
  }
  const wide = layer === 'foliage' || layer === 'far' || layer === 'detail';
  if (r < 13) return 'hill';
  return wide ? `q${Math.floor(lon / 90) % 4}` : `s${Math.floor(lon / 45) % 8}`;
}

/** Write uv for a painted piece: remap its own 0..1 uv into `rect`, or pin every vertex to the white texel. */
export function setUv(geo: BufferGeometry, rect: UvRect | null | undefined, flipU = false): BufferGeometry {
  const n = geo.getAttribute('position').count;
  const src = geo.getAttribute('uv');
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (rect && src) {
      let u = src.getX(i);
      if (flipU) u = 1 - u;
      out[i * 2] = rect.u0 + (rect.u1 - rect.u0) * u;
      out[i * 2 + 1] = rect.v0 + (rect.v1 - rect.v0) * src.getY(i);
    } else { out[i * 2] = WHITE_UV.u; out[i * 2 + 1] = WHITE_UV.v; }
  }
  geo.setAttribute('uv', new Float32BufferAttribute(out, 2));
  return geo;
}

const ORDER: Record<LayerKind, number> = { far: -1, solid: -6, thin: -5, foliage: -6, interact: -5, detail: -4, sign: -3, win: -3, net: -2, cable: -2, ground: 4 };

export class Batch {
  readonly scene: SceneId;
  private buckets = new Map<string, Bucket>();
  tris = 0;
  constructor(scene: SceneId) { this.scene = scene; }

  /** Paint `geo` (local), transform by `m` (null = already in world/scene space) and file it. Returns the geometry. */
  add(layer: LayerKind, geo: BufferGeometry, m: Matrix4 | null, hex: string, sid: number, o: AddOpts = {}, tag?: string): BufferGeometry {
    // textured pieces of the untextured layers go to 'sign' (SwiftShader: sampling costs ~50 ns/fragment, so the
    // big wall / ground / roof areas use a map-less program)
    if (o.uv && (layer === 'solid' || layer === 'thin' || layer === 'detail' || layer === 'ground' || layer === 'far')) layer = 'sign';
    paint(geo, hex, sid, o.label);
    setUv(geo, o.uv, o.flipU);
    if (m) geo.applyMatrix4(m);
    return this.put(layer, geo, o.chunk, tag);
  }
  /** File an already painted + uv'd world-space geometry. */
  put(layer: LayerKind, geo: BufferGeometry, chunk?: string, tag?: string): BufferGeometry {
    if (!geo.getAttribute('uv')) setUv(geo, null);
    geo.computeBoundingSphere();
    const key = chunk ?? sectorKey(this.scene, geo.boundingSphere ? geo.boundingSphere.center : _v.set(0, PLANET_R, 0), layer);
    const id = `${layer}|${key}`;
    let b = this.buckets.get(id);
    if (!b) { b = { layer, key, pieces: [] }; this.buckets.set(id, b); }
    // intra-chunk order: pieces nearest the ring road (where the player walks) first → early-z rejects the rows
    // behind them (SwiftShader is fragment-bound)
    let order = 0;
    if (this.scene === 'planet' && geo.boundingSphere) {
      const f = worldToFlat(SURFACES.planet, geo.boundingSphere.center);
      order = Math.abs(Math.hypot(f.x, f.z) - 34) - f.h * 0.05;
    }
    b.pieces.push({ geo, tag, order });
    // P3r3 (program headroom): the alpha-cut dust net used a DoubleSide material, i.e. its own shader program. Its
    // back side is now real geometry (reversed winding, negated normals = exactly what DoubleSide shades), so the net
    // shares the FrontSide 'sign' program.
    if (layer === 'net') b.pieces.push({ geo: backFaces(geo), tag, order });
    return geo;
  }

  /** Merge every bucket into one mesh (position = bound centre, geometry re-centred), add to `parent` scene. */
  build(core: Core, mats: Record<LayerKind, Material>, o: { detail?: (layer: LayerKind) => boolean } = {}): BuiltChunk[] {
    const out: BuiltChunk[] = [];
    const scene = core.scenes.get(this.scene);
    for (const b of this.buckets.values()) {
      if (!b.pieces.length) continue;
      b.pieces.sort((p, q) => p.order - q.order);
      const ranges = new Map<string, { start: number; count: number }[]>();
      let start = 0;
      for (const p of b.pieces) {
        const count = p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count;
        if (p.tag) { const l = ranges.get(p.tag) ?? []; l.push({ start, count }); ranges.set(p.tag, l); }
        start += count;
      }
      const geo = mergePainted(b.pieces.map((p) => p.geo));
      for (const p of b.pieces) p.geo.dispose();
      geo.computeBoundingSphere();
      const c = geo.boundingSphere ? geo.boundingSphere.center.clone() : new Vector3();
      geo.translate(-c.x, -c.y, -c.z);
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new Mesh(geo, mats[b.layer]);
      mesh.name = `world:${b.layer}:${b.key}`;
      mesh.position.copy(c);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // draw order for early-z on SwiftShader (fragment-bound): tall occluders first, then small stuff, the ground
      // after them (its hidden pixels are rejected), the planet body last (three sorts by renderOrder, then material)
      mesh.renderOrder = ORDER[b.layer] + (b.key === 'planet' ? 5 : 0);
      const shadowCaster = b.layer === 'solid' || b.layer === 'thin' || b.layer === 'foliage';
      mesh.castShadow = shadowCaster;
      mesh.receiveShadow = true;
      const detail = o.detail ? o.detail(b.layer) : b.layer === 'detail' || b.layer === 'cable';
      if (b.key.startsWith('hp:')) mesh.userData.hideInPast = true;   // present-day only (crane, new signage)
      if (detail) mesh.userData.detail = true;
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      if (this.scene === 'planet') {
        const pos = geo.getAttribute('position') as BufferAttribute;
        let hMax = 0;
        for (let i = 0; i < pos.count; i += 3) {
          _v.set(pos.getX(i) + c.x, pos.getY(i) + c.y, pos.getZ(i) + c.z);
          hMax = Math.max(hMax, _v.length() - PLANET_R);
        }
        core.scenes.registerCullable(mesh, { radius: geo.boundingSphere?.radius ?? 10, height: Math.max(1, hMax), detail });
      }
      this.tris += (geo.getAttribute('position').count / 3) | 0;
      out.push({ mesh, layer: b.layer, key: b.key, ranges });
    }
    this.buckets.clear();
    return out;
  }
}

/** A copy of `geo` facing the other way: every triangle's winding reversed and its normals negated (non-indexed). */
export function backFaces(geo: BufferGeometry): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.userData = { ...geo.userData };
  for (const a of Object.values(g.attributes) as BufferAttribute[]) {
    const n = a.itemSize, arr = a.array;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < n; k++) { const i = (t + 1) * n + k, j = (t + 2) * n + k, x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    }
  }
  const nm = g.getAttribute('normal') as BufferAttribute | undefined;
  if (nm) { for (let i = 0; i < nm.array.length; i++) nm.array[i] = -nm.array[i]; nm.needsUpdate = true; }
  return g;
}

/** Local (x right-of-model, y up, z forward) → flat chart (X, h, Z) at chart point p facing heading hdg. */
export function flatMatrix(p: { x: number; z: number }, hdg: number, h = 0): Matrix4 {
  const r = Math.hypot(p.x, p.z);
  const n = r < 1e-9 ? { x: 0, z: -1 } : { x: -p.x / r, z: -p.z / r };
  const e = r < 1e-9 ? { x: 1, z: 0 } : { x: p.z / r, z: -p.x / r };
  const c = Math.cos((hdg * Math.PI) / 180), s = Math.sin((hdg * Math.PI) / 180);
  const f = { x: n.x * c + e.x * s, z: n.z * c + e.z * s };
  const lx = { x: f.z, z: -f.x };
  return new Matrix4().set(
    lx.x, 0, f.x, p.x,
    0, 1, 0, h,
    lx.z, 0, f.z, p.z,
    0, 0, 0, 1,
  );
}
