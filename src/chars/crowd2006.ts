// src/chars/crowd2006.ts — owner C. The 2006 whole-street photo crowd (GDD §2.3, §7.2 ph_2006_group): 20 simplified
// neighbours standing step by step on the south stairs, PAST layer only (rendered in `past` captures). Faces are old
// photo cells, so they follow FaceState (mosaic / blank / clear). One static mesh.
import { Matrix4, type BufferGeometry, type Material, type Object3D } from 'three';
import type { Rng } from '../contracts';
import { PAL } from '../art/palette';
import { LAYER, setLayerDeep } from '../core/layers';
import { chartToFlat, flatDirToHeading, placeMatrix } from '../core/planet';
import { portraitFor } from './atlas';
import { PHOTO_FACE_INNER, photoCell } from './atlasLayout';
import { Kit, P, xf } from './kit';
import { rigidMesh } from './rig';

export const CROWD_SIZE = 20;
/** South-stair step height (GDD §5.3: 5.5 m over lon 16° → 30°; matches g1–g9). */
export function stairH(lon: number): number { return Math.max(0, 0.393 * (lon - 16)); }
const CAMERA = { r: 47.2, lon: 23 };

export interface CrowdSlot { r: number; lon: number; h: number; heading: number; height: number; seed: number }
export function crowdSlots(): CrowdSlot[] {
  const cam = chartToFlat(CAMERA);
  const out: CrowdSlot[] = [];
  for (let j = 0; j < 10; j++) {
    for (const [row, r] of [[0, 41.65], [1, 40.55]] as const) {
      const lon = 16.9 + j * 1.3 + row * 0.55;
      const f = chartToFlat({ r, lon });
      const i = out.length;
      const kid = i % 7 === 3;
      out.push({ r, lon, h: stairH(lon), heading: flatDirToHeading(f.x, f.z, cam.x - f.x, cam.z - f.z), height: kid ? 1.25 : 1.55 + ((i * 37) % 23) / 100, seed: i });
    }
  }
  return out;
}

const SID = { cloth: 212, legs: 213, skin: 210, hair: 211, face: 221 } as const;

export function buildCrowdGeometry(rng: Rng): BufferGeometry {
  const kit = new Kit();
  const m = new Matrix4();
  for (const s of crowdSlots()) {
    const p = portraitFor(s.seed, rng);
    const k = s.height / 1.7;
    placeMatrix('planet', { r: s.r, lon: s.lon, h: s.h }, s.heading, m);
    const at = (t: readonly [number, number, number], r: readonly [number, number, number] = [0, 0, 0], sc: number | readonly [number, number, number] = 1) =>
      m.clone().multiply(xf([t[0] * k, t[1] * k, t[2] * k], r, typeof sc === 'number' ? sc * k : [sc[0] * k, sc[1] * k, sc[2] * k]));
    kit.add(P.cube(0.3, 0.8, 0.2), p.old ? '#5d6461' : PAL.navy, SID.legs, 0, at([0, 0.4, 0]));
    kit.add(P.lathe([[0, 0.78], [0.19, 0.8], [0.19, 1.1], [0.21, 1.33], [0.1, 1.44], [0, 1.45]], 6).scale(1, 1, 0.66), p.cloth, SID.cloth, 0, at([0, 0, 0]));
    for (const sx of [1, -1]) kit.add(P.cube(0.09, 0.55, 0.1), p.cloth, SID.cloth, 0, at([sx * 0.25, 1.1, 0], [0, 0, sx * 6]));
    const hy = 1.58;
    kit.add(P.sphere(0.12, 8, 6), '#ffffff', SID.face, 0, at([0, hy, 0], [0, 0, 0], [0.92, 1.05, 1]),
      { cell: photoCell(s.seed), halfW: 0.12, halfH: 0.12, inner: PHOTO_FACE_INNER, minNz: 0.1, pre: true });
    kit.add(P.sphere(0.125, 8, 5), p.hair, SID.hair, 0, at([0, hy + 0.035, -0.035]));
  }
  return kit.build();
}

/** The crowd for `past` captures (hidden from the live view by its layer). */
export function buildCrowd(rng: Rng, mat: Material): Object3D {
  const geo = buildCrowdGeometry(rng);
  const rig = rigidMesh(geo, mat, { center: [0, 0, 0], radius: 200 });
  rig.mesh.frustumCulled = false;
  rig.mesh.castShadow = false;
  rig.mesh.name = 'crowd2006';
  setLayerDeep(rig.mesh, LAYER.PAST);
  return rig.mesh;
}
