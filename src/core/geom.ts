// src/core/geom.ts — owner: S. FROZEN. Vertex painting + merging with per-triangle labels (ARCHITECTURE §2.8.10).
import { BufferAttribute, Color, type BufferGeometry, type Intersection } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LabelId } from '../types';

/** Bake a flat sRGB colour (stored linear, TECH §2.1) and an 8-bit surface id; optionally tag a scenery label. */
export function paint(geo: BufferGeometry, hex: string, surfaceId: number, labelId?: LabelId): BufferGeometry {
  const n = geo.getAttribute('position').count;
  const c = new Color(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('aSurfaceId', new BufferAttribute(new Float32Array(n).fill(surfaceId), 1));
  geo.userData.paintLabel = labelId ?? null;
  return geo;
}

/**
 * Merge painted geometries into one: normalises indexed/non-indexed inputs, drops `uv` unless every input has it,
 * computes missing normals, and writes `userData.triLabels` (Uint16Array, 0xffff = none) + `userData.labelTable`.
 */
export function mergePainted(geos: readonly BufferGeometry[]): BufferGeometry {
  const allUv = geos.every((g) => g.getAttribute('uv') !== undefined);
  const labelTable: LabelId[] = [];
  const triLabelParts: number[] = [];
  const prepared = geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) {
      if (name === 'position' || name === 'normal' || name === 'color' || name === 'aSurfaceId') continue;
      if (name === 'uv' && allUv) continue;
      g.deleteAttribute(name);
    }
    if (!g.getAttribute('color') || !g.getAttribute('aSurfaceId')) paint(g, '#ff00ff', 1);
    const label = (g0.userData.paintLabel ?? null) as LabelId | null;
    let idx = 0xffff;
    if (label) {
      idx = labelTable.indexOf(label);
      if (idx < 0) { labelTable.push(label); idx = labelTable.length - 1; }
    }
    const tris = g.getAttribute('position').count / 3;
    for (let t = 0; t < tris; t++) triLabelParts.push(idx);
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('mergePainted: incompatible geometries');
  merged.userData.triLabels = Uint16Array.from(triLabelParts);
  merged.userData.labelTable = labelTable;
  for (const g of prepared) g.dispose();
  return merged;
}

/** Scenery label under a raycast hit: mesh-level userData.labelId, else the merged per-triangle label. */
export function labelOfHit(hit: Intersection): LabelId | null {
  const o = hit.object;
  const own = o.userData.labelId as LabelId | undefined;
  if (own) return own;
  const geo = (o as { geometry?: BufferGeometry }).geometry;
  const tri = geo?.userData.triLabels as Uint16Array | undefined;
  const table = geo?.userData.labelTable as LabelId[] | undefined;
  if (!tri || !table || hit.faceIndex === undefined || hit.faceIndex === null) return null;
  const i = tri[hit.faceIndex];
  return i === undefined || i === 0xffff ? null : (table[i] ?? null);
}

/** ART §3.1 optional contact band: darken vertex colours ×k on the bottom `height` metres of the geometry. */
export function contactBand(geo: BufferGeometry, height = 0.3, k = 0.88): BufferGeometry {
  const pos = geo.getAttribute('position'), col = geo.getAttribute('color');
  if (!col) return geo;
  geo.computeBoundingBox();
  const minY = geo.boundingBox ? geo.boundingBox.min.y : 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) - minY < height) col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;
}
