// src/world/occluders.ts — owner B. Coarse occluder proxies for evalShot rays (ARCHITECTURE §3.B item 6): boxes for
// buildings (never gallery slabs, railings or nets), the P8 lamp-shade sphere (r 0.45). Kept out of the scene graph.
import { BoxGeometry, Matrix4, Mesh, SphereGeometry, type Object3D } from 'three';
import type { SceneId } from '../types';
import { placeMatrix } from '../core/planet';
import { ch, type Rect } from './geo';
import { plan, SITE, LIGHTHOUSE, BOAT } from './layout';
import { alleyFlanks, b1UnitRect, backPart, boatRect, shrineRect, storeRect, studioRect, warehouseRect } from './colliders';
import { b2Rect, ESTATE } from './layout';
import { STUDIO } from './interiors/plans';
import type { P8Result } from './p8';

function proxy(M: Matrix4, w: number, h: number, d: number, y0: number, name: string): Mesh {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, y0 + h / 2, 0);
  const m = new Mesh(g);
  m.name = `occ:${name}`;
  m.matrixAutoUpdate = false;
  m.matrix.copy(M);
  m.matrixWorld.copy(M);
  return m;
}
function rectProxy(rc: Rect, h: number, name: string, y0 = -0.3): Mesh {
  const M = placeMatrix('planet', { ...ch(rc.c), h: 0 }, rc.hdg);
  return proxy(M, rc.hw * 2, h - y0, rc.hd * 2, y0, name);
}

export function buildOccluders(p8: P8Result): Record<SceneId, Object3D[]> {
  const planet: Object3D[] = [];
  for (const b of plan().bldgs) {
    if (!b.proxy) continue;
    const H = b.floors * b.fh + (b.roof === 'gable' ? 1.2 : 0.7);
    if (b.arcade > 0) {
      planet.push(rectProxy(backPart(b.rect, b.arcade), b.fh, `${b.id}:shop`, -0.3 + b.base));
      const M = placeMatrix('planet', { ...ch(b.rect.c), h: b.base }, b.rect.hdg);
      planet.push(proxy(M, b.rect.hw * 2, H - b.fh, b.rect.hd * 2, b.fh, `${b.id}:upper`));
    } else planet.push(rectProxy(b.rect, H + b.base, b.id));
  }
  planet.push(rectProxy(storeRect(), 6.7, 'store'));
  for (const [i, rc] of alleyFlanks().entries()) planet.push(rectProxy(rc, 7.5, `alley${i}`));
  planet.push(rectProxy(studioRect(), 7.6, 'studio'));
  // stops at the door wall (§3.B) and at the ROOF SLAB (h 18): the 0.9 m parapet allowance used to put a solid lid over
  // the roof, blocking every ray from sp_roof to the cat / TV standing on it (T_meiqiu, T_bst_tv_still_on)
  planet.push(rectProxy(b1UnitRect(), ESTATE.b1.floors * 3, 'b1'));
  planet.push(rectProxy(b2Rect(), ESTATE.b2.floors * 3 + 0.9, 'b2'));
  // shrine: walls, piers, lintel and roof — NOT the 1.85 m doorway (the idol is photographed through it, P4)
  {
    const rc = shrineRect(), W = rc.hw * 2, D = rc.hd * 2, zF = rc.hd;
    const Ms = placeMatrix('planet', { ...ch(rc.c), h: 4 }, rc.hdg);
    const part = (x: number, z: number, w: number, h: number, d: number, y0: number, name: string) =>
      planet.push(proxy(Ms.clone().multiply(new Matrix4().makeTranslation(x, 0, z)), w, h, d, y0, `shrine:${name}`));
    part(0, -zF + 0.12, W, 2.8, 0.25, -0.2, 'back');
    for (const sx of [-1, 1]) part(sx * (W / 2 - 0.12), 0, 0.25, 2.8, D, -0.2, sx < 0 ? 'side_l' : 'side_r');
    for (const sx of [-1, 1]) part(sx * (W / 2 - 0.4), zF - 0.12, 0.55, 2.8, 0.25, -0.2, sx < 0 ? 'pier_l' : 'pier_r');
    part(0, zF - 0.12, W, 0.55, 0.25, 2.05, 'lintel');
    part(0, 0, W + 0.4, 1.3, D + 0.4, 2.6, 'roof');
  }
  planet.push(rectProxy(warehouseRect(), 6, 'warehouse'));
  planet.push(rectProxy(boatRect(), 3.2, 'boat', 0.4));
  void BOAT;
  // hoarding wall (the chai plane sits 0.1+ m in front of it)
  for (let lon = SITE.hoardLon0; lon < SITE.hoardLon1; lon += 3) {
    const M = placeMatrix('planet', { r: SITE.hoardR + 0.05, lon: lon + 1.5, h: 0 }, 0);
    planet.push(proxy(M, 3.2, SITE.hoardH, 0.3, 0, `hoard${lon}`));
  }
  // lighthouse tower
  {
    const M = placeMatrix('planet', { r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: 1.5 }, 0);
    planet.push(proxy(M, 2.2, 13, 2.2, 0, 'lighthouse'));
  }
  // P8: the lamp-shade occluder sphere (GDD §9 P8 step 4–5)
  const s = new Mesh(new SphereGeometry(p8.occluderRadius, 12, 8));
  s.name = 'occ:p8_shade';
  s.position.copy(p8.S);
  s.updateMatrix(); s.matrixAutoUpdate = false; s.updateMatrixWorld(true);
  planet.push(s);
  // studio: the darkroom partition walls (portrait-wall shots from inside the darkroom are blocked)
  const studio: Object3D[] = [
    local(STUDIO.partX, STUDIO.ceil, (STUDIO.z0 + STUDIO.doorZ0) / 2, 0.16, STUDIO.ceil, STUDIO.doorZ0 - STUDIO.z0, 'part1'),
    local(STUDIO.partX, STUDIO.ceil, (STUDIO.doorZ1 + STUDIO.darkZ1) / 2, 0.16, STUDIO.ceil, STUDIO.darkZ1 - STUDIO.doorZ1, 'part2'),
  ];
  return { planet, studio_int: studio, subway_int: [] };
}

/** Interiors sit on the R = 5000 sphere centred at (0, −5000, 0): local (x, y, z) is world (x, y, z) within 1 cm. */
function local(x: number, _ceil: number, z: number, w: number, h: number, d: number, name: string): Mesh {
  return proxy(new Matrix4().makeTranslation(x, 0, z), w, h, d, 0, name);
}
