// src/world/occluders.test.ts — I-play (Phase 2): evalShot occluder proxies against the gameplay viewpoints.
import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3, type Object3D } from 'three';
import { SPOTS } from '../data/locations';
import { posToWorld } from '../core/planet';
import type { ChartPos } from '../types';
import { buildOccluders } from './occluders';
import { constructP8 } from './p8';
import { ANCHOR_DEFS } from './anchors';
import { b1Point } from './layout';
import { ch } from './geo';

const occ = buildOccluders(constructP8()).planet;
function blockers(a: Vector3, b: Vector3, list: readonly Object3D[] = occ): string[] {
  const d = b.clone().sub(a), len = d.length();
  const rc = new Raycaster(a, d.normalize(), 0, len - 0.05);
  return rc.intersectObjects(list as Object3D[], false).map((h) => h.object.name);
}
const spotEye = (id: string) => {
  const s = SPOTS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  const p = posToWorld('planet', s.pos as ChartPos);
  return p.clone().addScaledVector(p.clone().normalize(), 1.72);
};

describe('occluder proxies (I-play)', () => {
  it('sp_roof: the B1 proxy is no lid over the roof (T_bst_tv_still_on / T_meiqiu rays)', () => {
    const eye = spotEye('sp_roof');
    const tv = posToWorld('planet', ANCHOR_DEFS.roof_tv.pos as ChartPos);
    expect(blockers(eye, tv)).toEqual([]);
    // the cat sits on the roof slab a few metres away (any spot on the roof at h 18.3 must be visible)
    for (const [r, off] of [[18, 1], [24, -2], [26.5, 2.5]] as const) {
      const p = posToWorld('planet', { ...ch(b1Point(r, off)), h: 18.3 });
      expect(blockers(eye, p), `${r},${off}`).not.toContain('occ:b1');
    }
  });
  it('the B1 proxy still blocks a street-level ray through the block', () => {
    const a = posToWorld('planet', { ...ch(b1Point(21, -8)), h: 5 });
    const b = posToWorld('planet', { ...ch(b1Point(21, 8)), h: 5 });
    expect(blockers(a, b)).toContain('occ:b1');
  });
});
