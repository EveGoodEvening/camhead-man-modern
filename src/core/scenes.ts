// src/core/scenes.ts — owner: S. FROZEN. The three main-pass Scenes + planet horizon culling (ART §6.3, §2.8.7).
import { Scene, Vector3, type Object3D } from 'three';
import type { Bus } from '../events';
import type { ScenesApi } from '../contracts';
import type { SceneId } from '../types';
import { PLANET_R, SURFACES, arcDistance, horizonVisible } from './planet';

export const DETAIL_MAX_ARC = 45;       // m: `detail` objects farther than this are hidden (cheap LOD)
export const DETAIL_MAX_CAM_H = 60;     // m: `detail` objects hide while the camera is higher than this

interface Cullable { obj: Object3D; radius: number; height: number; detail: boolean; pos: Vector3 }

export interface ScenesImpl extends ScenesApi {
  /** Apply horizon culling from a camera world position (called every tick before rendering). */
  cull(cameraPos: Vector3): void;
  /** P3-look (L4): horizon-cull the planet for ANOTHER camera (render.capture / LiveViews from elsewhere, also while an
   *  interior is active). Every cullable's `visible` is recomputed for `cameraPos` — which also lifts B's lon-sector
   *  hiding, computed for the main camera — and the returned function restores the previous flags. */
  cullFor(cameraPos: Vector3): () => void;
  readonly all: Readonly<Record<SceneId, Scene>>;
}

/** Pure culling decision (exported for tests). */
export function cullVisible(arc: number, radius: number, height: number, hCam: number, detail: boolean): boolean {
  if (detail && (hCam > DETAIL_MAX_CAM_H || arc - radius > DETAIL_MAX_ARC)) return false;
  return horizonVisible(arc, radius, height, hCam);
}

export function createScenes(bus: Bus): ScenesImpl {
  const scenes: Record<SceneId, Scene> = { planet: new Scene(), studio_int: new Scene(), subway_int: new Scene() };
  for (const [id, s] of Object.entries(scenes)) s.name = id;
  let active: SceneId = 'planet';
  const cullables = new Set<Cullable>();
  const _p = new Vector3();

  return {
    get active() { return active; },
    all: scenes,
    get: (id) => scenes[id],
    surface: (id) => SURFACES[id],
    switchTo(id) {
      if (id === active) return;
      const from = active;
      active = id;
      bus.emit('sceneChanged', { from, to: id });
    },
    registerCullable(obj, o) {
      obj.updateWorldMatrix(true, false);
      const c: Cullable = { obj, radius: o.radius, height: o.height, detail: !!o.detail, pos: new Vector3() };
      cullables.add(c);
      return () => { cullables.delete(c); obj.visible = true; };
    },
    cullFor(cameraPos) {
      const hCam = cameraPos.length() - PLANET_R;
      const saved: [Object3D, boolean][] = [];
      for (const c of cullables) {
        saved.push([c.obj, c.obj.visible]);
        _p.setFromMatrixPosition(c.obj.matrixWorld);
        c.obj.visible = cullVisible(arcDistance(_p, cameraPos), c.radius, c.height, hCam, c.detail);
      }
      return () => { for (const [o, v] of saved) o.visible = v; };
    },
    cull(cameraPos) {
      if (active !== 'planet') return;
      const hCam = cameraPos.length() - PLANET_R;
      for (const c of cullables) {
        _p.setFromMatrixPosition(c.obj.matrixWorld);
        const arc = arcDistance(_p, cameraPos);
        c.obj.visible = cullVisible(arc, c.radius, c.height, hCam, c.detail);
      }
    },
  };
}
