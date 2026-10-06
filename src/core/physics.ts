// src/core/physics.ts — owner: S. FROZEN. Colliders (log-map chart, 2 iterations), walk surfaces, zones (§2.8.3).
import { Vector3 } from 'three';
import type { Bus } from '../events';
import type { ColliderDef, Handle, PhysicsApi, Pos, SurfaceInfo, WalkSurfaceDef, ZoneDef } from '../contracts';
import type { SceneId, SpotId } from '../types';
import { SURFACES, frameAt, headingToDir, posToWorld } from './planet';
import { insideShape, resolveAll, slideCircles, type Shape } from './sphere';

export const PLAYER_RADIUS = 0.35;
const _da = new Vector3(), _db = new Vector3(), _sp = new Vector3();
export const STEP_UP = 0.45;
export const DEFAULT_H_RANGE: readonly [number, number] = [-1, 60];

interface ColliderRec { def: ColliderDef; handle: Handle; shape: Shape; cells: number[] }

/** P3r3 (open-play f): uniform 3D grid over each scene's base sphere. A collider sits in every cell that its bound
 *  (+ INDEX_MARGIN) touches, so one cell lookup returns every collider within INDEX_MARGIN of a point. `blocked()` used
 *  to test all ~740 planet colliders (28 µs a call; a cold smoke route makes a few hundred calls = 4–9 ms). */
export const INDEX_CELL = 4;
export const INDEX_MARGIN = 1.5;
/** Queries up to this radius use the grid (the player's resolve pushes ≤ 2 × radius, still inside the margin). */
const INDEX_MAX_QUERY = 0.5;
/** Cells relative to the scene centre, ±4096 per axis (±16 km: interiors sit on a 5 km sphere); a colliding key would
 *  only add candidates, never lose one. */
const cellKey = (ix: number, iy: number, iz: number) => ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
interface SurfaceRec { def: WalkSurfaceDef; handle: Handle }
interface ZoneRec { def: ZoneDef; handle: Handle; center: Vector3 | null; inside: boolean }

function makeHandle(onRemove: () => void, enabled = true): Handle {
  return { enabled, remove: onRemove };
}

/** Build the chart-space shape for a collider definition. */
export function shapeOf(def: ColliderDef): Shape {
  const s = SURFACES[def.scene];
  const p = posToWorld(def.scene, def.shape.at, new Vector3());
  const n = p.clone().sub(s.center).normalize();
  if (def.shape.kind === 'circle') return { kind: 'circle', n, r: def.shape.radius };
  const f = frameAt(s, p);
  const forward = headingToDir(f, def.shape.headingDeg, new Vector3()).normalize();
  return { kind: 'box', n, forward, halfW: def.shape.halfW, halfD: def.shape.halfD };
}

export interface PhysicsImpl extends PhysicsApi {
  /** Push a base-sphere position (player at height h) out of colliders. Returns true if still stuck after 2 passes. */
  resolve(scene: SceneId, pos: Vector3, h: number, radius?: number): boolean;
  /** P3r3 (open-play a): a step from `prev` to `pos` (base-sphere points) that ends inside a round collider is turned
   *  along its rim instead of being pushed straight back (a walker hitting an NPC head-on used to stop dead). Call
   *  before `resolve`. Returns true if it slid. */
  slide(scene: SceneId, prev: Vector3, pos: Vector3, h: number, radius?: number): boolean;
  /** Per-tick zone edge detection for the player (feet world position). */
  updateZones(scene: SceneId, feet: Vector3): void;
  /** Resolves a zone `at` given as a SpotId (set by main: world.spot). */
  setSpotResolver(fn: (id: SpotId) => { scene: SceneId; pos: Pos } | null): void;
  colliderCount(scene?: SceneId): number;
  /** P3r2 G4: does the straight segment a→b (world points) pass through a collider whose tag is in `tags`? Samples
   *  every 5 cm with a 1 cm radius and ignores `hRange` (walls, partitions: full-height sight blockers). */
  sightBlocked(scene: SceneId, a: Vector3, b: Vector3, tags: ReadonlySet<string>): boolean;
}

export function createPhysics(bus: Bus): PhysicsImpl {
  const colliders = new Set<ColliderRec>();
  const surfaces = new Set<SurfaceRec>();
  const zones = new Set<ZoneRec>();
  let spotResolver: (id: SpotId) => { scene: SceneId; pos: Pos } | null = () => null;
  const _shapes: Shape[] = [];
  const grids = new Map<SceneId, Map<number, ColliderRec[]>>();
  const _q = new Vector3();

  const indexAdd = (rec: ColliderRec) => {
    const s = SURFACES[rec.def.scene];
    let g = grids.get(rec.def.scene);
    if (!g) { g = new Map(); grids.set(rec.def.scene, g); }
    const sh = rec.shape;
    const bound = (sh.kind === 'circle' ? sh.r : Math.hypot(sh.halfW, sh.halfD)) + INDEX_MARGIN;   // arc ≥ chord
    const c = _q.copy(sh.n).multiplyScalar(s.radius);
    const lo = (v: number) => Math.floor((v - bound) / INDEX_CELL), hi = (v: number) => Math.floor((v + bound) / INDEX_CELL);
    for (let ix = lo(c.x); ix <= hi(c.x); ix++) for (let iy = lo(c.y); iy <= hi(c.y); iy++) for (let iz = lo(c.z); iz <= hi(c.z); iz++) {
      const k = cellKey(ix, iy, iz);
      let list = g.get(k);
      if (!list) { list = []; g.set(k, list); }
      list.push(rec);                     // registration order is kept inside every cell (resolve order unchanged)
      rec.cells.push(k);
    }
  };
  const indexRemove = (rec: ColliderRec) => {
    const g = grids.get(rec.def.scene);
    if (g) for (const k of rec.cells) { const list = g.get(k); const i = list ? list.indexOf(rec) : -1; if (list && i >= 0) list.splice(i, 1); }
    rec.cells.length = 0;
  };
  const usable = (c: ColliderRec, scene: SceneId, h: number) => {
    if (c.def.scene !== scene || !c.handle.enabled || c.def.enabled === false) return false;
    const [lo, hi] = c.def.hRange ?? DEFAULT_H_RANGE;
    return h >= lo && h <= hi;
  };

  /** Colliders of `scene` live at height h; with `near` (world point) and a small radius only those near it. */
  const activeShapes = (scene: SceneId, h: number, near?: Vector3, radius = 0): Shape[] => {
    _shapes.length = 0;
    if (near && radius <= INDEX_MAX_QUERY) {
      const s = SURFACES[scene];
      const p = _q.copy(near).sub(s.center).setLength(s.radius);
      const list = grids.get(scene)?.get(cellKey(Math.floor(p.x / INDEX_CELL), Math.floor(p.y / INDEX_CELL), Math.floor(p.z / INDEX_CELL)));
      if (list) for (const c of list) if (usable(c, scene, h)) _shapes.push(c.shape);
      return _shapes;
    }
    for (const c of colliders) if (usable(c, scene, h)) _shapes.push(c.shape);
    return _shapes;
  };

  const zoneCenter = (z: ZoneRec): Vector3 | null => {
    if (z.center) return z.center;
    if (typeof z.def.at === 'string') {
      const r = spotResolver(z.def.at);
      if (!r) return null;
      z.center = posToWorld(r.scene, r.pos, new Vector3());
    } else {
      z.center = posToWorld(z.def.scene, z.def.at, new Vector3());
    }
    return z.center;
  };

  const api: PhysicsImpl = {
    registerCollider(def) {
      const rec: ColliderRec = { def, shape: shapeOf(def), cells: [], handle: makeHandle(() => { colliders.delete(rec); indexRemove(rec); }) };
      colliders.add(rec);
      indexAdd(rec);
      return rec.handle;
    },
    registerWalkSurface(def) {
      const rec: SurfaceRec = { def, handle: makeHandle(() => { surfaces.delete(rec); }) };
      surfaces.add(rec);
      return rec.handle;
    },
    registerZone(def) {
      const rec: ZoneRec = {
        def, center: null, inside: false,
        handle: makeHandle(() => {
          zones.delete(rec);
          if (rec.inside) bus.emit('exitZone', { spot: def.id });
        }),
      };
      zones.add(rec);
      return rec.handle;
    },
    heightAt(scene, x, z, currentH) {
      let best = 0;
      for (const s of surfaces) {
        if (s.def.scene !== scene || !s.handle.enabled) continue;
        let h: number | null = null;
        try { h = s.def.heightAt(x, z); } catch { h = null; }
        if (h === null || !Number.isFinite(h)) continue;
        if (h <= currentH + STEP_UP && h > best) best = h;
      }
      return best;
    },
    blocked(scene, world, radius) {
      const s: SurfaceInfo = SURFACES[scene];
      const h = world.distanceTo(s.center) - s.radius;
      for (const c of activeShapes(scene, h, world, radius)) if (insideShape(s, world, radius, c)) return true;   // no per-call closure
      return false;
    },
    resolve(scene, pos, h, radius = PLAYER_RADIUS) {
      return resolveAll(SURFACES[scene], pos, radius, activeShapes(scene, h, pos, radius), 2);
    },
    slide(scene, prev, pos, h, radius = PLAYER_RADIUS) {
      return slideCircles(SURFACES[scene], prev, pos, radius, activeShapes(scene, h, pos, radius));
    },
    updateZones(scene, feet) {
      for (const z of zones) {
        let inside = false;
        if (z.handle.enabled && z.def.scene === scene) {
          const c = zoneCenter(z);
          if (c) {
            const s = SURFACES[scene];
            const h = feet.distanceTo(s.center) - s.radius;
            const [lo, hi] = z.def.hRange ?? [-Infinity, Infinity];
            const da = _da.copy(feet).sub(s.center).normalize(), db = _db.copy(c).sub(s.center).normalize();
            const arc = Math.acos(Math.min(1, Math.max(-1, da.dot(db)))) * s.radius;
            inside = arc <= z.def.radius && h >= lo && h <= hi;
          }
        }
        if (inside !== z.inside) {
          z.inside = inside;
          bus.emit(inside ? 'enterZone' : 'exitZone', { spot: z.def.id });
        }
      }
    },
    setSpotResolver(fn) { spotResolver = fn; for (const z of zones) z.center = null; },
    colliderCount: (scene) => [...colliders].filter((c) => !scene || c.def.scene === scene).length,
    sightBlocked(scene, a, b, tags) {
      const s: SurfaceInfo = SURFACES[scene];
      let any = false;
      for (const c of colliders) {
        if (c.def.scene === scene && c.handle.enabled && c.def.enabled !== false && c.def.tag && tags.has(c.def.tag)) { any = true; break; }
      }
      if (!any) return false;
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.05));
      for (let i = 0; i <= n; i++) {
        _sp.copy(a).lerp(b, i / n);
        for (const c of colliders) {
          if (c.def.scene !== scene || !c.handle.enabled || c.def.enabled === false || !c.def.tag || !tags.has(c.def.tag)) continue;
          if (insideShape(s, _sp, 0.01, c.shape)) return true;
        }
      }
      return false;
    },
  };
  return api;
}
