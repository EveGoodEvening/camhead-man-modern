// src/render/lights.ts — owner A. ART §3.1 sun in the geographic frame (never the heading), the ±22 m BasicShadowMap
// box that follows the player with texel snapping, one DirectionalLight per scene (same program for all scenes),
// and the lamp registry that packs the nearest lit lamps in view into uLamps (GDD §5.7 路灯).
import { DirectionalLight, Vector3, Vector4, type Scene } from 'three';
import type { SceneId } from '../types';
import { SURFACES, frameAt, type SurfaceFrame } from '../core/planet';

/** ART §3.1 SUN_LOCAL = normalize(east 0.55, up 0.80, south 0.25). */
export const SUN_LOCAL = { east: 0.55, up: 0.8, south: 0.25 } as const;
export const SHADOW_HALF = 22;          // m, ART §3.1 ortho frustum ±22
export const SHADOW_DIST = 45;          // light placed at player + sun·45
export const SHADOW_FAR = 90;

/** Sun direction in world space for a surface frame (pure; out is normalized). */
export function sunFromFrame(f: SurfaceFrame, out: Vector3): Vector3 {
  return out.copy(f.up).multiplyScalar(SUN_LOCAL.up).addScaledVector(f.east, SUN_LOCAL.east)
    .addScaledVector(f.north, -SUN_LOCAL.south).normalize();
}

/** Direction at elevation/azimuth (degrees; azimuth clockwise from north) in a surface frame. */
export function dirInFrame(f: SurfaceFrame, elDeg: number, azDeg: number, out: Vector3): Vector3 {
  const e = (elDeg * Math.PI) / 180, a = (azDeg * Math.PI) / 180;
  return out.copy(f.north).multiplyScalar(Math.cos(a) * Math.cos(e)).addScaledVector(f.east, Math.sin(a) * Math.cos(e))
    .addScaledVector(f.up, Math.sin(e)).normalize();
}

export interface LampRec { scene: SceneId; pos: Vector3; radius: number; on: boolean }

/** Pack the ≤ 8 nearest lit lamps of `scene` (to `ref`) into `out`; the rest get w = 0 (off). Returns the count.
 *  Allocation-free (runs every frame): insertion into fixed scratch slots. */
export function packLamps(lamps: Iterable<LampRec>, scene: SceneId, ref: Vector3, out: Vector4[],
  visible?: (pos: Vector3, radius: number) => boolean): number {
  const cap = Math.min(out.length, _bestL.length);
  let n = 0;
  for (const l of lamps) {
    if (!l.on || l.scene !== scene || !(l.radius > 0)) continue;
    if (visible && !visible(l.pos, l.radius)) continue;          // pool sphere outside the view: its slot goes to one in view
    const d = l.pos.distanceToSquared(ref);
    if (n === cap && d >= _bestD[n - 1]) continue;
    let i = n < cap ? n++ : cap - 1;
    while (i > 0 && _bestD[i - 1] > d) { _bestD[i] = _bestD[i - 1]; _bestL[i] = _bestL[i - 1]; i--; }
    _bestD[i] = d; _bestL[i] = l;
  }
  for (let i = 0; i < out.length; i++) {
    const b = i < n ? _bestL[i] : null;
    if (b) out[i].set(b.pos.x, b.pos.y, b.pos.z, b.radius); else out[i].set(0, 0, 0, 0);
  }
  for (let i = 0; i < n; i++) _bestL[i] = null;
  return n;
}
const _bestD = new Float64Array(8);
const _bestL: (LampRec | null)[] = new Array<LampRec | null>(8).fill(null);

/** Snap `target` to shadow-texel increments in the light's view plane (basis x, y ⟂ dir); returns the offset applied. */
export function snapToTexels(target: Vector3, dir: Vector3, upHint: Vector3, texel: number, outOffset: Vector3): Vector3 {
  const x = _x.crossVectors(upHint, dir);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).cross(dir);
  x.normalize();
  const y = _y.crossVectors(dir, x).normalize();
  const tx = target.dot(x), ty = target.dot(y);
  const sx = Math.round(tx / texel) * texel - tx, sy = Math.round(ty / texel) * texel - ty;
  return outOffset.copy(x).multiplyScalar(sx).addScaledVector(y, sy);
}
const _x = new Vector3(), _y = new Vector3();

/** One shadow-casting sun per main-pass scene (identical light setups → shared toon programs). */
export class SunRig {
  readonly lights: Record<SceneId, DirectionalLight>;
  private readonly fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  private readonly dir = new Vector3();
  private readonly off = new Vector3();
  private readonly tgt = new Vector3();
  constructor(scenes: Record<SceneId, Scene>, mapSize: number) {
    const mk = (s: Scene) => {
      const l = new DirectionalLight(0xffffff, 1);
      l.castShadow = true;
      l.shadow.mapSize.set(mapSize, mapSize);
      Object.assign(l.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: SHADOW_FAR });
      l.shadow.camera.updateProjectionMatrix();
      l.shadow.bias = -0.0008;
      l.shadow.normalBias = 0.03;
      l.name = 'render:sun';
      s.add(l, l.target);
      return l;
    };
    this.lights = { planet: mk(scenes.planet), studio_int: mk(scenes.studio_int), subway_int: mk(scenes.subway_int) };
  }
  /**
   * Point the scene's shadow box at `focus` (player feet). `sunDir` = world sun direction there; `north` = a stable
   * up-hint for the shadow camera (never parallel to the sun). `off` = true parks the box in empty space (title/wide).
   */
  follow(scene: SceneId, focus: Vector3, sunDir: Vector3, north: Vector3, off: boolean): void {
    const l = this.lights[scene];
    if (off) {
      // Shadow lookups outside the frustum return 1: park the box far outside the planet, looking away from it.
      const c = SURFACES[scene].center;
      l.position.set(c.x, c.y + 20000, c.z);
      l.target.position.set(c.x, c.y + 21000, c.z);
      l.shadow.camera.up.set(0, 0, 1);
    } else {
      const texel = (2 * SHADOW_HALF) / l.shadow.mapSize.x;
      snapToTexels(focus, sunDir, north, texel, this.off);
      this.tgt.copy(focus).add(this.off);
      l.target.position.copy(this.tgt);
      l.position.copy(this.tgt).addScaledVector(sunDir, SHADOW_DIST);
      l.shadow.camera.up.copy(north);
    }
    l.target.updateMatrixWorld();
    l.updateMatrixWorld();
  }
  /** Geographic frame + sun at a pole point on `scene`'s surface (results in `.frame` / `.sun`, reused). */
  frameAt(scene: SceneId, p: Vector3): void {
    frameAt(SURFACES[scene], p, this.fr);
    sunFromFrame(this.fr, this.dir);
  }
  get frame(): SurfaceFrame { return this.fr; }
  get sun(): Vector3 { return this.dir; }
}
