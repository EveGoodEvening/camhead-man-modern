// src/lens/anchors.ts — owner D. Resolves PhotoTarget anchors / `whole` points to world positions.
// `{ world }` anchors come from B (world.anchor); a nominal GDD position backs each one up so that a missing or
// obviously wrong anchor (> GUARD m from the GDD value) never breaks a puzzle: we warn once and use the nominal point.
import { Vector3 } from 'three';
import type { AnchorInfo, Core } from '../contracts';
import type { ChartPos, LocalPos, PhotoTarget, SceneId, TargetId, WorldAnchorId } from '../types';
import { DEG, SURFACES, frameAt, headingToDir, isChart, posToWorld } from '../core/planet';

type Pos = ChartPos | LocalPos;
interface Nominal {
  scene: SceneId; pos: Pos; radius?: number; /** heading the face looks toward (deg) */ facing?: number; w?: number; h?: number;
  /** † constructed by B (GDD §9 P8): the GDD value is only approximate, never second-guess B's point */
  built?: boolean;
}

/** Estate block 1 west gallery: door face at 2.3 m west of the centreline (lon 160), anchor 0.1 m outside (GDD §9 P5). */
function doorPos(n: string): ChartPos {
  const col = Number(n[2]), floor = Number(n[0]);
  const r = [17, 20, 23, 26][col - 1];
  return { r, lon: 160 - (2.4 / r) / DEG, h: floor * 3 - 1.5 };
}

/** GDD nominal positions for every world anchor the lens uses. */
export const NOMINAL: Readonly<Partial<Record<WorldAnchorId, Nominal>>> = {
  studio_qr: { scene: 'planet', pos: { r: 17.7, lon: 104, h: 2.7 }, facing: 180 },
  bus_qr: { scene: 'planet', pos: { r: 39.6, lon: 357.5, h: 1.5 }, facing: 180 },
  bike_qr: { scene: 'planet', pos: { r: 28.6, lon: 97.8, h: 0.9 }, facing: 0 },
  temple_qr: { scene: 'planet', pos: { r: 3, lon: 150, h: 4.6 }, facing: 180 },
  locker17: { scene: 'planet', pos: { r: 29.4, lon: 55, h: 1.3 }, facing: 180 },
  portrait_wall: { scene: 'studio_int', pos: { x: -4.75, y: 1.6, z: -0.5 }, radius: 1.6, facing: 90 },
  doorframe: { scene: 'studio_int', pos: { x: 1.4, y: 1.3, z: 1.5 }, facing: 270 },
  idol: { scene: 'planet', pos: { r: 1.5, lon: 145, h: 5.2 }, facing: 180 },
  mirror: { scene: 'planet', pos: { r: 30, lon: 92, h: 2.4 }, radius: 0.4, facing: 160 },
  door_201: { scene: 'planet', pos: doorPos('201'), facing: 270 }, door_202: { scene: 'planet', pos: doorPos('202'), facing: 270 },
  door_203: { scene: 'planet', pos: doorPos('203'), facing: 270 }, door_204: { scene: 'planet', pos: doorPos('204'), facing: 270 },
  door_301: { scene: 'planet', pos: doorPos('301'), facing: 270 }, door_302: { scene: 'planet', pos: doorPos('302'), facing: 270 },
  door_303: { scene: 'planet', pos: doorPos('303'), facing: 270 }, door_304: { scene: 'planet', pos: doorPos('304'), facing: 270 },
  door_401: { scene: 'planet', pos: doorPos('401'), facing: 270 }, door_402: { scene: 'planet', pos: doorPos('402'), facing: 270 },
  door_403: { scene: 'planet', pos: doorPos('403'), facing: 270 }, door_404: { scene: 'planet', pos: doorPos('404'), facing: 270 },
  coop_inside: { scene: 'planet', pos: { r: 17.4, lon: 161, h: 18.45 } },
  coop_door: { scene: 'planet', pos: { r: 18.3, lon: 161, h: 18.5 }, facing: 180 },
  frame1_drop: { scene: 'planet', pos: { r: 20, lon: 160.5, h: 18 } },
  plaque: { scene: 'planet', pos: { r: 66.5, lon: 325, h: 2.2 }, facing: 345 },
  trail_plane: { scene: 'planet', pos: { r: 68, lon: 326, h: 13 }, radius: 4, w: 8, h: 3, facing: 345 },
  lh_lamp: { scene: 'planet', pos: { r: 68, lon: 326, h: 15 } },
  lh_switch: { scene: 'planet', pos: { r: 66.4, lon: 326.3, h: 2.6 } },
  pit: { scene: 'subway_int', pos: { x: 4.5, y: -0.9, z: 2.7 } },
  chai: { scene: 'planet', pos: { r: 44, lon: 256, h: 3.2 }, radius: 1.8, w: 3.6, h: 3.6, facing: 0 },
  net_dot: { scene: 'planet', pos: { r: 41, lon: 257.5, h: 4.2 }, built: true },
  lamp_p8: { scene: 'planet', pos: { r: 38.4, lon: 258.7, h: 3.7 }, radius: 0.45, built: true },
  dot_ground: { scene: 'planet', pos: { r: 40.3, lon: 257.5, h: 0 }, built: true },
  sea_point: { scene: 'planet', pos: { r: 60, lon: 318, h: 0 }, radius: 3 },
  lion_left_head: { scene: 'planet', pos: { r: 5, lon: 138, h: 5 } },
  roof_tv: { scene: 'planet', pos: { r: 22.5, lon: 162.5, h: 18.6 } },
  fish7: { scene: 'planet', pos: { r: 40.6, lon: 200, h: 1.0 } },
  dk_line: { scene: 'studio_int', pos: { x: 3.3, y: 2.0, z: -0.5 } },
  tripod_head: { scene: 'planet', pos: { r: 47.2, lon: 23, h: 1.5 }, facing: 0 },
  'lm:banyan': { scene: 'planet', pos: { r: 0, lon: 0, h: 12 }, radius: 7 },
  'lm:footbridge': { scene: 'planet', pos: { r: 34, lon: 30, h: 6 }, radius: 7 },
  'lm:boat': { scene: 'planet', pos: { r: 44, lon: 6, h: 2 }, radius: 4 },
  'lm:crane': { scene: 'planet', pos: { r: 52, lon: 250, h: 20 }, radius: 8 },
  'lm:lighthouse': { scene: 'planet', pos: { r: 68, lon: 326, h: 9 }, radius: 4 },
  'lm:bus_stop': { scene: 'planet', pos: { r: 39.5, lon: 0, h: 1.5 }, radius: 2.5 },
  'lm:store': { scene: 'planet', pos: { r: 29, lon: 60, h: 3 }, radius: 4 },
  'lm:studio': { scene: 'planet', pos: { r: 17.2, lon: 104, h: 3 }, radius: 3 },
  'lm:hoarding': { scene: 'planet', pos: { r: 44, lon: 255, h: 2 }, radius: 8 },
};
/** GDD §8.1 NPC anchors that are not the head: height above the NPC's feet (T_zhimei_sea = 纸妹's chest, h 0.8). */
export const NPC_ANCHOR_H: Readonly<Partial<Record<TargetId, number>>> = { T_zhimei_sea: 0.8 };
/** A world anchor this far from its GDD value is treated as broken (B may move things ±2 m; † points a little more). */
export const GUARD = 6;
export const LANDMARK_ANCHORS: readonly WorldAnchorId[] = [
  'lm:banyan', 'lm:footbridge', 'lm:boat', 'lm:crane', 'lm:lighthouse', 'lm:bus_stop', 'lm:store', 'lm:studio', 'lm:hoarding',
];

export interface ResolvedAnchor {
  scene: SceneId; pos: Vector3; normal: Vector3 | null; radius: number | null; corners: Vector3[] | null;
  info: AnchorInfo | null;
}

export function createAnchors(core: Core) {
  const cache = new Map<WorldAnchorId, ResolvedAnchor>();
  const warned = new Set<string>();
  const warn = (k: string, msg: string) => { if (!warned.has(k)) { warned.add(k); core.log.warn(msg); } };
  const tmp = new Vector3();

  const nominalOf = (id: WorldAnchorId): ResolvedAnchor | null => {
    const n = NOMINAL[id];
    if (!n) return null;
    const pos = posToWorld(n.scene, n.pos);
    let normal: Vector3 | null = null, corners: Vector3[] | null = null;
    const fr = frameAt(SURFACES[n.scene], pos);
    if (n.facing !== undefined) normal = headingToDir(fr, n.facing);
    if (n.w && n.h && normal) {
      // a vertical rectangle facing `facing` (trail plane → the bench, chai → the road)
      const nrm = normal;
      const right = new Vector3().crossVectors(fr.up, nrm).normalize();
      corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        pos.clone().addScaledVector(right, (a * n.w!) / 2).addScaledVector(fr.up, (b * n.h!) / 2));
    }
    return { scene: n.scene, pos, normal, radius: n.radius ?? null, corners, info: null };
  };

  /** A world anchor (cached; object-backed anchors follow their live object). */
  const world = (id: WorldAnchorId): ResolvedAnchor | null => {
    const hit = cache.get(id);
    if (hit) {
      if (hit.info?.object) hit.info.object.getWorldPosition(hit.pos);
      return hit;
    }
    const nom = nominalOf(id);
    let res: ResolvedAnchor | null = null;
    try {
      const info = core.services.world.anchor(id);
      if (info && info.pos) {
        const pos = info.object ? info.object.getWorldPosition(new Vector3()) : info.pos.clone();
        const dh = nom ? Math.abs(heightOf(info.scene, pos) - heightOf(nom.scene, nom.pos)) : 0;
        const hTol = Math.max(1, (NOMINAL[id]?.radius ?? 0) * 0.5);
        const built = !!NOMINAL[id]?.built;
        if (nom && (nom.scene !== info.scene || (!built && (pos.distanceTo(nom.pos) > GUARD || dh > hTol)))) {
          warn(`far:${id}`, `[lens] anchor ${id} is ${nom.scene !== info.scene ? 'in another scene' : `${pos.distanceTo(nom.pos).toFixed(1)} m (Δh ${dh.toFixed(1)} m)`} from its GDD position; using the GDD value`);
        } else {
          res = {
            scene: info.scene, pos, normal: info.normal?.clone() ?? nom?.normal ?? null, radius: info.radius ?? nom?.radius ?? null,
            corners: info.corners?.map((c) => c.clone()) ?? nom?.corners ?? null, info,
          };
        }
      }
    } catch (e) { warn(`throw:${id}`, `[lens] world.anchor(${id}) failed: ${String(e)}`); }
    res = res ?? nom;
    if (res) cache.set(id, res);
    return res;
  };

  /** World position of a target anchor (null when it cannot be resolved, e.g. an NPC that is not present). */
  const targetPos = (t: PhotoTarget, out: Vector3): Vector3 | null => {
    const a = t.anchor;
    if ('npc' in a) {
      const n = core.services.chars.npc(a.npc);
      if (!n || !isShown(n.root)) return null;
      const h = NPC_ANCHOR_H[t.id];
      if (h !== undefined) {
        // a body point at height h above the NPC's feet (PhotoTarget anchors can only name the head bone)
        n.root.getWorldPosition(out);
        const s = SURFACES[t.scene ?? 'planet'];
        return out.add(tmp.copy(out).sub(s.center).normalize().multiplyScalar(h));
      }
      return n.head.getWorldPosition(out);
    }
    if ('world' in a) { const r = world(a.world); return r ? out.copy(r.pos) : null; }
    return posToWorld(t.scene ?? 'planet', a as Pos, out);
  };

  const wholeOf = (t: PhotoTarget): Vector3[] | null => {
    const w = t.whole;
    if (!w) return null;
    if ('world' in w) {
      const r = world(w.world);
      if (!r) return null;
      if (r.corners?.length) return r.corners;
      return null;
    }
    return w.map((p) => posToWorld(t.scene ?? 'planet', p));
  };

  /** Direction the photographed object faces (for `facing`): an NPC head's +Z, else the anchor normal. */
  const facingOf = (t: PhotoTarget, out: Vector3): Vector3 | null => {
    const a = t.anchor;
    if ('npc' in a) {
      const n = core.services.chars.npc(a.npc);
      if (!n) return null;
      n.head.updateWorldMatrix(true, false);
      return out.set(0, 0, 1).transformDirection(n.head.matrixWorld);
    }
    if ('world' in a) { const r = world(a.world); return r?.normal ? out.copy(r.normal) : null; }
    return null;
  };

  const spotPoint = (spot: string, out: Vector3): Vector3 | null => {
    // sp_net_dot is B's constructed point D (GDD §9 P8); prefer the anchor.
    if (spot === 'sp_net_dot') { const r = world('net_dot'); if (r) return out.copy(r.pos); }
    try { return core.services.world.spotPos(spot as never, out); } catch { return null; }
  };

  return {
    world, targetPos, wholeOf, facingOf, spotPoint,
    /** Forget cached anchors (world rebuilt / state reload). */
    reset() { cache.clear(); },
    /** Radius for a landmark anchor (AnchorInfo.radius ?? nominal). */
    radiusOf(id: WorldAnchorId): number { return world(id)?.radius ?? 3; },
    nominal: nominalOf,
    isChart,
    _tmp: tmp,
  };
}
export type Anchors = ReturnType<typeof createAnchors>;

/** Height above the surface's base sphere. */
function heightOf(scene: SceneId, p: Vector3): number {
  const s = SURFACES[scene];
  return p.distanceTo(s.center) - s.radius;
}

/** Visible in the scene graph (every ancestor visible). */
export function isShown(o: { visible: boolean; parent: unknown }): boolean {
  let n: { visible: boolean; parent: unknown } | null = o;
  while (n) {
    if (!n.visible) return false;
    n = n.parent as { visible: boolean; parent: unknown } | null;
  }
  return true;
}
