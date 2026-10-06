// src/world/interiors/plans.ts — owner B. Pure layouts of the two pocket interiors (GDD §5.3 #5 / #9, §9 S_darkroom
// constraints). LocalPos: x east, z south (north = −Z), y up. Shared by meshes, colliders and anchors.
import type { ColliderDef } from '../../contracts';
import type { LocalPos } from '../../types';

// ---------------------------------------------------------------- studio_int (front room + darkroom)
export const STUDIO = {
  x0: -5, x1: 5, z0: -3.5, z1: 6.5, ceil: 3.2,
  partX: 1.5, doorZ0: 1.0, doorZ1: 2.0, darkZ1: 3.5,     // darkroom: x 1.5..5, z −3.5..3.5
  portrait: { x: -4.9, y: 1.6, z: -0.5, cols: 6, rows: 4, w: 2.6, h: 1.7 },
  doorframe: { x: 1.5, y: 1.3, z: 1.5 },
  cabinet: { x: -2, z: -3.5, w: 1.8, h: 1.9, d: 0.45 },
  poster: { x: 0.5, y: 1.6, z: -3.45, w: 0.8, h: 1.1 },
  backdrop: { x: -4.85, z: 3.6, w: 2.6, h: 2.6 },
  tripod: { x: -2.4, z: 3.6 },
  counter: { x: 3.2, z: 5.0, w: 2.6, d: 0.7 },
  shutter: { x: 0, z: 6.5, w: 2.6, h: 2.5 },
  bench: { x: 3.3, z: -3.1, w: 3.0, d: 0.7, h: 0.9 },
  trays: { brown: { x: 2.7, z: -3.05 }, white: { x: 3.5, z: -3.05 }, blue: { x: 4.3, z: -3.05 } },
  phone: { x: 4.75, y: 0.9, z: 1.0 },
  line: { y: 2.0, z: -0.5, x0: 1.7, x1: 4.9 },
} as const;

/** P3r3 (look g, L10): front-room set dressing (interiors/build.ts studioDressing). Kept off the walk lines: entry
 *  (0, 2.4) → portrait wall stand (−3.1, −0.5) / cabinet stand (−2, −1.5) / poster stand (0.5, −1.7) / darkroom door
 *  (1.5, 1..2), and clear of the backdrop stool + tripod. */
export const STUDIO_PROPS = {
  lights: [[-3.35, 2.3], [-3.35, 4.9]] as readonly (readonly [number, number])[],
  frames: [{ kind: 'couple', z: -2.2, y: 1.75, w: 0.7, h: 0.9 }, { kind: 'child', z: 2.8, y: 1.6, w: 0.45, h: 0.56 }] as const,
  clock: { x: -2.6, y: 2.45 },
  calendar: { x: 2.3, y: 1.7 },
  bench: { x: -3.2, z: 6.05, w: 1.5, d: 0.45 },
  plant: { x: -4.55, z: 6.05 },
  mat: { x: 0, z: 5.6 },
  shelf: { z: 5.0, w: 1.9 },
  vitrine: { x: 3.9, z: 5.05, w: 0.8, d: 0.45, h: 0.32 },
} as const;

// ---------------------------------------------------------------- subway_int (hall + platform in one room)
export const SUBWAY_INT = {
  x0: -14, x1: 7, z0: -3, z1: 2.0, ceil: 3.4, stairX: -10,
  gantryX: -1, gantryZ: [-0.5, 0.5] as const,   // the one gate-controlled lane (anchor z 0); fixed cabinets elsewhere
  psdZ: 2.0, pitZ1: 3.9, pitY: -1.1, psdGapX: 4.5,
  display: { x: 0.5, y: 2.5, z: -2.9, w: 2.2, h: 0.5 },
} as const;

const box = (scene: 'studio_int' | 'subway_int', x: number, z: number, hw: number, hd: number, tag: string): ColliderDef =>
  ({ scene, shape: { kind: 'box', at: { x, y: 0, z }, headingDeg: 0, halfW: hw, halfD: hd }, tag });

/** Studio walls + furniture (headingDeg 0: halfW along x, halfD along z). */
export function studioColliders(): ColliderDef[] {
  const S = STUDIO, o: ColliderDef[] = [];
  const cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  o.push(box('studio_int', cx, S.z0 - 0.1, (S.x1 - S.x0) / 2 + 0.2, 0.1, 'wall'));
  o.push(box('studio_int', cx, S.z1 + 0.1, (S.x1 - S.x0) / 2 + 0.2, 0.1, 'wall'));
  o.push(box('studio_int', S.x0 - 0.1, cz, 0.1, (S.z1 - S.z0) / 2 + 0.2, 'wall'));
  o.push(box('studio_int', S.x1 + 0.1, cz, 0.1, (S.z1 - S.z0) / 2 + 0.2, 'wall'));
  // partition x 1.5 with the door gap z 1..2; darkroom south wall z 3.5
  o.push(box('studio_int', S.partX, (S.z0 + S.doorZ0) / 2, 0.08, (S.doorZ0 - S.z0) / 2, 'part'));
  o.push(box('studio_int', S.partX, (S.doorZ1 + S.darkZ1) / 2, 0.08, (S.darkZ1 - S.doorZ1) / 2, 'part'));
  o.push(box('studio_int', (S.partX + S.x1) / 2, S.darkZ1, (S.x1 - S.partX) / 2, 0.08, 'part'));
  o.push(box('studio_int', S.cabinet.x, S.cabinet.z + S.cabinet.d / 2, S.cabinet.w / 2, S.cabinet.d / 2, 'cabinet'));
  o.push(box('studio_int', S.bench.x, S.bench.z, S.bench.w / 2, S.bench.d / 2, 'bench'));
  o.push(box('studio_int', S.counter.x, S.counter.z, S.counter.w / 2, S.counter.d / 2, 'counter'));
  o.push(box('studio_int', S.tripod.x, S.tripod.z, 0.3, 0.3, 'tripod'));
  o.push(box('studio_int', S.phone.x, S.phone.z, 0.25, 0.3, 'phone'));
  // P3r3 set dressing (walker-only: the camera boom may pass over a bench or a light stand)
  const P = STUDIO_PROPS, WALK: [number, number] = [-1, 1.3];
  for (const [x, z] of P.lights) o.push({ ...box('studio_int', x, z, 0.3, 0.3, 'prop'), hRange: WALK });
  o.push({ ...box('studio_int', P.bench.x, P.bench.z, P.bench.w / 2, P.bench.d / 2, 'prop'), hRange: WALK });
  o.push({ ...box('studio_int', P.plant.x, P.plant.z, 0.3, 0.3, 'prop'), hRange: WALK });
  return o;
}
/** Subway walls, stairs, pillars and the gantry (lane 2 = the middle lane is the gate-controlled one). */
export function subwayColliders(): { walls: ColliderDef[]; gantry: ColliderDef[] } {
  const S = SUBWAY_INT, w: ColliderDef[] = [];
  const cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  w.push(box('subway_int', cx, S.z0 - 0.1, (S.x1 - S.x0) / 2 + 0.2, 0.1, 'wall'));
  w.push(box('subway_int', cx, S.z1 + 0.12, (S.x1 - S.x0) / 2 + 0.2, 0.12, 'psd'));
  w.push(box('subway_int', S.x0 - 0.1, cz, 0.1, (S.z1 - S.z0) / 2 + 0.2, 'wall'));
  w.push(box('subway_int', S.x1 + 0.1, cz, 0.1, (S.z1 - S.z0) / 2 + 0.2, 'wall'));
  w.push(box('subway_int', (S.x0 + S.stairX) / 2 - 0.4, cz, (S.stairX - S.x0) / 2 - 0.4, (S.z1 - S.z0) / 2, 'stairs'));
  for (const x of [-6.5, 2.2]) w.push(box('subway_int', x, -0.6, 0.3, 0.3, 'pillar'));
  // gantry: fixed cabinets and one flap lane that opens with gantry_open (GDD P7). P3r3 look L2: the cabinets are 1.0 m
  // tall, so they are walker-only (the follow boom's pivot is at 1.5 m): off the lane axis they pulled the boom in to
  // 0.5 m and the dithered hero filled the frame
  const g: ColliderDef[] = [];
  const [za, zb] = S.gantryZ;
  const GANTRY_H: [number, number] = [-1, 1.3];
  w.push({ ...box('subway_int', S.gantryX, (S.z0 + za) / 2, 0.25, (za - S.z0) / 2, 'gantry:fixed'), hRange: GANTRY_H });
  g.push({ ...box('subway_int', S.gantryX, (za + zb) / 2, 0.25, (zb - za) / 2, 'gantry:lane'), hRange: GANTRY_H });
  w.push({ ...box('subway_int', S.gantryX, (zb + S.z1) / 2, 0.25, (S.z1 - zb) / 2, 'gantry:fixed'), hRange: GANTRY_H });
  return { walls: w, gantry: g };
}

export function lp(x: number, y: number, z: number): LocalPos { return { x, y, z }; }
