// src/world/anchorsRuntime.ts — owner B. Resolves ANCHOR_DEFS into AnchorInfo (world positions, normals, corners),
// with the P8 construction and live objects/canvases applied (ARCHITECTURE §2.7 AnchorInfo).
import { Vector3, type Object3D } from 'three';
import type { AnchorInfo, Core } from '../contracts';
import type { WorldAnchorId } from '../types';
import { WORLD_ANCHOR_IDS } from '../data/ids/spots';
import { SURFACES, frameAt, headingToDir, posToWorld } from '../core/planet';
import { ANCHOR_DEFS } from './anchors';
import { GLYPH, type P8Result } from './p8';

export type AnchorTable = Map<WorldAnchorId, AnchorInfo>;
export interface AnchorExtras {
  objects: Partial<Record<WorldAnchorId, Object3D>>;
  canvases: Partial<Record<WorldAnchorId, HTMLCanvasElement>>;
  /** heading overrides for planes that face something computed at build time */
  faceHdg?: Partial<Record<WorldAnchorId, number>>;
}

export function resolveAnchors(core: Core, p8: P8Result, extras: AnchorExtras): AnchorTable {
  const out: AnchorTable = new Map();
  for (const id of WORLD_ANCHOR_IDS) {
    const d = ANCHOR_DEFS[id];
    try {
      const pos = posToWorld(d.scene, d.pos);
      const s = SURFACES[d.scene];
      const fr = frameAt(s, pos);
      let normal: Vector3 | undefined;
      const face = extras.faceHdg?.[id] ?? d.faceHdg;
      if (face !== undefined && d.scene === 'planet') normal = headingToDir(fr, face, new Vector3()).normalize();
      else if (d.normal) normal = new Vector3(d.normal.x, d.normal.y, d.normal.z).normalize();
      let corners: Vector3[] | undefined;
      if (d.plane && normal) {
        const up = Math.abs(normal.dot(fr.up)) > 0.9 ? fr.north.clone() : fr.up.clone();
        const right = new Vector3().crossVectors(up, normal).normalize();
        const diag = id === 'chai';                         // the ring's 4 points at ±45° (GDD §8.1 T_chai whole)
        const hw = diag ? (GLYPH.planeM / 2) * Math.SQRT1_2 : d.plane.hw, hh = diag ? (GLYPH.planeM / 2) * Math.SQRT1_2 : d.plane.hh;
        corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => pos.clone().addScaledVector(right, a * hw).addScaledVector(up, b * hh));
      }
      const info: AnchorInfo = { scene: d.scene, pos, normal, radius: d.radius, corners };
      const obj = extras.objects[id];
      if (obj) { info.object = obj; obj.getWorldPosition(info.pos); }
      const cv = extras.canvases[id];
      if (cv) info.canvas = cv;
      out.set(id, info);
    } catch (e) { core.log.warn(`[world] anchor ${id} failed`, e); }
  }
  // GDD §9 P8 constructed points
  const set = (id: WorldAnchorId, pos: Vector3, radius?: number) => { const a = out.get(id); if (a) { a.pos = pos.clone(); if (radius) a.radius = radius; } };
  set('net_dot', p8.D, Math.max(0.1, p8.dotSize / 2));
  set('lamp_p8', p8.S, p8.occluderRadius);
  set('dot_ground', posToWorld('planet', { ...p8.groundDot, h: 0.03 }));
  return out;
}
