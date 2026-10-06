// src/world/layout.ts — owner B. The authored town plan (GDD §5.1–§5.6) as pure data: building footprints, key
// feature positions and street furniture. Colliders, walk surfaces, occluders and meshes are all derived from this,
// so vitest can check reachability without WebGL. Deterministic: its own fixed-seed RNG (authored content).
import { createRng } from '../core/rng';
import type { Rng } from '../contracts';
import { PAL } from '../art/palette';
import {
  add, arcLen, degFor, dirAt, fl, headingOf, inLon, len, lerp2, lonSpan, norm360, radialRect, sub, type P2, type Rect,
} from './geo';

// ---------------------------------------------------------------- GDD §5.1 rings
export const R = {
  hill: 13, plateau: 6, backRing: 21.8, qilouBack: 22, qilouFront: 29, arcadeWall: 27,
  sideIn: 29, roadIn: 31, road: 34, roadOut: 37, sideOut: 39, promenadeIn: 43, promenadeOut: 47.5,
  seawall: 48, wave: 62, disc: 64,
} as const;
/** Shoreline radius: seawall on the sea side (lon 300 → 60), wave wall elsewhere. */
export function shoreR(lon: number): number { return inLon(lon, 300, 60) ? R.seawall : R.wave; }
export const SEA_SIDE = { from: 300, to: 60 } as const;

// ---------------------------------------------------------------- buildings
export type Roof = 'flat' | 'gable' | 'terrace';
export type ShopFront = 'shutter' | 'glass' | 'open' | 'wall' | 'none';
export interface Bldg {
  id: string;
  rect: Rect;                // footprint; rect.hdg = the front (street) side
  floors: number; fh: number;
  base: number;              // ground height at the front (alley ramp)
  wall: string; trim: string; roofColor: string; roof: Roof;
  arcade: number;            // arcade depth behind the front (0 = none)
  shop: ShopFront;
  signKey: string | null; signBg: string; signInk: string;
  vSignKey: string | null;
  far: boolean;              // cheap back-fill (no colliders, fewer details)
  collide: boolean; proxy: boolean;
  seed: number;
  kind: 'qilou' | 'house' | 'special';
}

const WALLS = [PAL.plasterBeige, PAL.plasterWhite, PAL.tilePink, PAL.tileWhite, PAL.concrete, PAL.plasterBeige, PAL.tileWhite];
const TRIMS = [PAL.roofMauve, PAL.plasterWhite, PAL.concrete, PAL.sidewalk];
const SIGN_BG = [PAL.blue, PAL.signSlate, PAL.plasterWhite, PAL.steelGreen, PAL.bannerRed, PAL.ochre, PAL.charcoal, PAL.yellow];
export const SHOP_SIGNS = [
  'sign.shop_hardware', 'sign.shop_barber', 'sign.shop_noodle', 'sign.shop_tea', 'sign.shop_pharmacy', 'sign.shop_fruit',
  'sign.shop_rice', 'sign.shop_tailor', 'sign.shop_dental', 'sign.shop_mahjong', 'sign.shop_bakery', 'sign.shop_phone',
  'sign.shop_laundry', 'sign.shop_bbq', 'sign.shop_tobacco', 'sign.shop_print', 'sign.shop_seafood', 'sign.shop_hotel',
  'sign.shop_herb', 'sign.shop_moving', 'sign.shop_net', 'sign.shop_shoes', 'sign.shop_tofu', 'sign.shop_optical',
  'sign.shop_gold', 'sign.shop_tackle', 'sign.shop_bike', 'sign.shop_video',
] as const;

function inkFor(bg: string): string { return bg === PAL.plasterWhite || bg === PAL.yellow ? PAL.inkDeep : PAL.clothWhite; }

interface RowOpts {
  id: string; rFront: number; rBack: number; lonA: number; lonB: number; minW: number; maxW: number;
  floors: readonly [number, number]; arcade: number; far?: boolean; shops?: boolean; roofs?: readonly Roof[];
}
let signCursor = 0;
function mkBldg(id: string, rect: Rect, rng: Rng, o: Partial<Bldg> = {}): Bldg {
  const bg = rng.pick(SIGN_BG);
  return {
    id, rect, floors: 2, fh: 3, base: 0,
    wall: rng.pick(WALLS), trim: rng.pick(TRIMS), roofColor: PAL.roofMauve, roof: 'flat', arcade: 0,
    shop: 'shutter', signKey: null, signBg: bg, signInk: inkFor(bg), vSignKey: null,
    far: false, collide: true, proxy: true, seed: rng.int(0, 1e9), kind: 'qilou', ...o,
  };
}

/** A curved row of adjacent buildings between lon A → B (east-going); rects widened so fronts leave no cracks. */
export function row(o: RowOpts, rng: Rng): Bldg[] {
  const out: Bldg[] = [];
  const total = lonSpan(o.lonA, o.lonB);
  const rWide = Math.max(o.rFront, o.rBack);
  let at = 0, i = 0;
  while (at < total - 0.01) {
    let w = rng.range(o.minW, o.maxW);
    let d = degFor(rWide, w);
    if (total - at - d < degFor(rWide, o.minW * 0.7)) d = total - at;
    const a = norm360(o.lonA + at), b = norm360(o.lonA + at + d);
    const rr = radialRect(o.rFront, o.rBack, a, b);
    w = arcLen(rWide, d) + 0.12;
    const rect: Rect = { c: rr.c, hdg: rr.hdg, hw: w / 2, hd: rr.hd };
    const floors = rng.int(o.floors[0], o.floors[1]);
    const shopy = o.shops !== false && !o.far;
    const signKey = shopy && rng.next() < 0.85 ? SHOP_SIGNS[(signCursor++ * 7 + rng.int(0, 3)) % SHOP_SIGNS.length] : null;
    out.push(mkBldg(`${o.id}_${i}`, rect, rng, {
      floors, arcade: o.arcade, far: !!o.far, collide: !o.far, proxy: !o.far,
      roof: rng.pick(o.roofs ?? (['flat', 'flat', 'gable', 'terrace'] as const)),
      shop: o.far ? 'none' : rng.pick(['shutter', 'glass', 'open', 'shutter', 'glass'] as const),
      signKey, vSignKey: shopy && rng.next() < 0.3 ? SHOP_SIGNS[rng.int(0, SHOP_SIGNS.length - 1)] : null,
      kind: o.far ? 'house' : 'qilou',
    }));
    at += d; i++;
  }
  return out;
}

// ---------------------------------------------------------------- key features (GDD §5.3 / §5.4)
export const ALLEY = { mouth: fl(29, 96), end: fl(17.5, 104), halfW: 1.5, topH: 1.2 } as const;
export const alleyDir: P2 = (() => { const d = sub(ALLEY.end, ALLEY.mouth); const l = len(d); return { x: d.x / l, z: d.z / l }; })();
/** Flat normal of the alley pointing to its west (lower lon) side. */
export const alleyWest: P2 = { x: alleyDir.z, z: -alleyDir.x };
export const STUDIO_FRONT: P2 = add(ALLEY.end, alleyDir, 1.2);

export const BRIDGE = {
  lon: 30, deckR0: 28.2, deckR1: 39.8, deckH: 5.5, halfW: 1.5,
  north: { r: 27, lon0: 26.8, lonTop: 30, lonBot: 51, halfW: 1.2 },
  south: { r: 41, lon0: 32.1, lonTop: 30, lonBot: 16, halfW: 1.2 },
} as const;

export const ESTATE = {
  b1: { lon: 160, r0: 15.5, r1: 28, w: 7, gallery: 1.2, floors: 6 },
  b2: { lon: 120, r0: 15, r1: 27, w: 6, floors: 5 },
  frontR: 28.6, gateLon: 140, gateHalfDeg: 2.5,
  doorsR: [17, 20, 23, 26] as const, doorFloorsH: [4.5, 7.5, 10.5] as const,
  milkbox: { r: 27.0, h0: 0.35 },
} as const;
/** B1 rect (front = west gallery side, heading 270 at its centre). */
export function b1Rect(): Rect {
  const c = fl((ESTATE.b1.r0 + ESTATE.b1.r1) / 2, ESTATE.b1.lon);
  return { c, hdg: 270, hw: (ESTATE.b1.r1 - ESTATE.b1.r0) / 2, hd: ESTATE.b1.w / 2 };
}
export function b2Rect(): Rect {
  const c = fl((ESTATE.b2.r0 + ESTATE.b2.r1) / 2, ESTATE.b2.lon);
  return { c, hdg: 90, hw: (ESTATE.b2.r1 - ESTATE.b2.r0) / 2, hd: ESTATE.b2.w / 2 };
}
/** Point on B1 at radius r along its centreline, pushed `off` metres toward the gallery (west) side. */
export function b1Point(r: number, off: number): P2 {
  const base = fl(r, ESTATE.b1.lon);
  const w = dirAt(fl(21, ESTATE.b1.lon), 270);
  return add(base, w, off);
}
export function b2Point(r: number, off: number): P2 {
  const base = fl(r, ESTATE.b2.lon);
  const e = dirAt(fl(21, ESTATE.b2.lon), 90);
  return add(base, e, off);
}

export const TEMPLE = {
  shrine: { r: 1.2, lon: 145, w: 3.2, d: 3.0, frontR: 2.7 },
  idol: { r: 1.5, lon: 145, h: 5.2 },
  donation: { r: 3.1, lon: 166 },
  lionL: { r: 5.4, lon: 133.5 }, lionR: { r: 5.4, lon: 156.5 },
  burner: { r: 4.97, lon: 138.5 },           // on the vp_temple_2011 → idol line (「中间是香炉和木像」), off the stand axis
  banyan: { r: 3.2, lon: 330, crownR: 7, top: 18 },
} as const;

export const SITE = {
  hoardR: 44.15, hoardLon0: 240, hoardLon1: 270, hoardH: 5.6, netR: 41, netLon0: 250.5, netLon1: 263, netH0: 2.0, netH1: 6.3,
  chai: { r: 43.9, lon: 256, h: 3.2, d: 3.6 }, crane: { r: 52, lon: 250 }, pipes: { r: 48, lon: 276 },
  E0: { r: 34, lon: 256, h: 1.6 }, V: { r: 29.5, lon: 262, h: 1.72 },
} as const;
export const SUBWAY = { lon: 262, landR0: 27.0, landR1: 29.7, stairR1: 22.5, halfW: 1.6, grilleR: 26.9 } as const;
export const PIER = { lon: 322, r0: 48, rampR: 50, r1: 63, deckH: 0.6, halfW: 1.25, bench: { r: 52, lon: 322, bulgeHalfW: 2.1, r0: 50.8, r1: 53.4 } } as const;
export const ROCK = { r0: 64.6, r1: 70, lon0: 320, lon1: 330, h: 1.5, stepR0: 63, stepR1: 64.6 } as const;
export const LIGHTHOUSE = { r: 68, lon: 326, baseR: 1.45, topR: 1.0, h: 18, lampH: 15, doorSpot: { r: 66.5, lon: 325 } } as const;
// shelter lon 0.9 → 9.1 (its roof edge ≥ 0.4 m east of sp_bus_bench, so the day_start frame keeps its top rows sky);
// the wake bench is a separate radial bench whose seat centre sits 0.4 m behind sp_bus_bench (requests-C #2)
export const BUS = { shelterLon: 5.0, r: 38.5, halfDeg: 4.1, benchBack: 0.4 } as const;
export const BOAT = { r: 45.1, lon: 5.5, len: 7.2, beam: 2.3 } as const;
export const MIRROR = { r: 30, lon: 92, h: 2.4, yaw: 160, radius: 0.42 } as const;
export const STORE = { lonA: 52.5, lonB: 67, locker: { r: 29.4, lon: 55, h: 1.3 } } as const;
export const B1_GATE = { lon: 176, r0: 13, r1: 47.6 } as const;
export const B2_GATE = { lon: 337, r0: 28.8, r1: 48.4, waterLon0: 329, waterLon1: 337.4 } as const;
export const TILE = { r: 47.2, lon: 23 } as const;

// ---------------------------------------------------------------- the plan
export interface Plan { bldgs: Bldg[] }

let cached: Plan | null = null;
export function plan(): Plan {
  if (cached) return cached;
  signCursor = 0;
  const rng = createRng(0x5eed_b0b);
  const b: Bldg[] = [];
  const q = (o: RowOpts) => b.push(...row(o, rng.fork(o.id)));
  // inner qilou (GDD §5.3 fill bands), fronts at r 29 facing the road
  // in_a stays 2 storeys: from sp_bus_bench (GDD §5.8) its roofline must stay below the day_start frame's top rows
  q({ id: 'in_a', rFront: 29, rBack: 22, lonA: 10, lonB: 26.5, minW: 5, maxW: 7, floors: [2, 2], arcade: 2 });
  q({ id: 'in_ret', rFront: 24.6, rBack: 21.6, lonA: 26.5, lonB: 52.5, minW: 4.5, maxW: 6, floors: [2, 3], arcade: 0 });
  q({ id: 'in_b', rFront: 29, rBack: 22, lonA: 67, lonB: 83.2, minW: 5, maxW: 7, floors: [2, 3], arcade: 2 });
  q({ id: 'in_c', rFront: 29, rBack: 22, lonA: 106, lonB: 112.8, minW: 3, maxW: 4, floors: [2, 2], arcade: 0 });
  q({ id: 'in_d', rFront: 28.6, rBack: 22, lonA: 167.6, lonB: 176, minW: 3, maxW: 5, floors: [2, 2], arcade: 0 });
  q({ id: 'in_e', rFront: 29, rBack: 22, lonA: 176, lonB: 255, minW: 5, maxW: 7.5, floors: [2, 3], arcade: 2 });
  q({ id: 'in_f', rFront: 29, rBack: 22, lonA: 270, lonB: 333.5, minW: 5, maxW: 7.5, floors: [2, 3], arcade: 2 });
  q({ id: 'in_g', rFront: 29, rBack: 22, lonA: 333.5, lonB: 340.5, minW: 6, maxW: 8, floors: [3, 3], arcade: 0 });
  q({ id: 'in_h', rFront: 29, rBack: 22, lonA: 340.5, lonB: 350, minW: 4, maxW: 5, floors: [2, 2], arcade: 2 });
  // subway plaza back building (low)
  q({ id: 'in_sub', rFront: 24.5, rBack: 21.6, lonA: 255, lonB: 270, minW: 6, maxW: 8, floors: [1, 2], arcade: 0, shops: false });
  // outer qilou, fronts at r 39 facing the road (heading 0)
  q({ id: 'out_sea', rFront: 39.2, rBack: 42.6, lonA: 45, lonB: 61.5, minW: 4, maxW: 5.5, floors: [1, 2], arcade: 0 });
  q({ id: 'out_a', rFront: 39.2, rBack: 47, lonA: 61.5, lonB: 176, minW: 5.5, maxW: 8, floors: [2, 3], arcade: 0 });
  q({ id: 'out_b', rFront: 39.2, rBack: 47, lonA: 176, lonB: 195, minW: 5.5, maxW: 7, floors: [2, 3], arcade: 0 });
  q({ id: 'out_c', rFront: 39.2, rBack: 45.2, lonA: 229.5, lonB: 236, minW: 4, maxW: 5, floors: [2, 2], arcade: 0 });
  q({ id: 'out_c0', rFront: 39.2, rBack: 45.2, lonA: 220.5, lonB: 223, minW: 2, maxW: 3, floors: [2, 2], arcade: 0, shops: false });
  // back fill: low houses behind the rows (seen from the bridge, the roof and the title; no colliders)
  const far = (id: string, r0: number, r1: number, a: number, bb: number) =>
    q({ id, rFront: r0, rBack: r1, lonA: a, lonB: bb, minW: 4, maxW: 7, floors: [1, 2], arcade: 0, far: true, roofs: ['gable', 'gable', 'flat'] });
  far('bk_a', 21.4, 15.5, 176, 250);
  far('bk_b', 21.4, 15.5, 268, 340);
  far('bk_c', 21.4, 15.5, 18, 84);
  far('ob_a', 47.6, 55, 64, 174);
  far('ob_b', 47.6, 54, 177, 194);
  far('ob_c', 50.8, 57, 196, 220);
  far('ob_d', 45.8, 53, 221, 236);
  // explicit specials (built by their own kit): they still get colliders/proxies from colliders.ts
  for (const x of b) if (x.far) { x.floors = Math.min(x.floors, 2); }
  cached = { bldgs: b };
  return cached;
}

// ---------------------------------------------------------------- street furniture (props)
export type PropKind =
  | 'lamp' | 'pole' | 'tree' | 'bench' | 'bin' | 'bike' | 'scooter' | 'vending' | 'cone' | 'planter' | 'bollard'
  | 'hydrant' | 'barrier' | 'crate' | 'bush' | 'phonebox' | 'mailbox' | 'sign_post' | 'rock' | 'netrack' | 'lifering';
export interface Prop { kind: PropKind; p: P2; hdg: number; s?: number; seed: number; tag?: string }

let propCache: Prop[] | null = null;
export function props(): Prop[] {
  if (propCache) return propCache;
  const rng = createRng(0x70_a5);
  const out: Prop[] = [];
  const P = (kind: PropKind, r: number, lon: number, hdg: number, s = 1, tag?: string) => out.push({ kind, p: fl(r, lon), hdg, s, seed: rng.int(0, 1e9), tag });
  // street lamps on the outer sidewalk (every ~24 m), facing the road; the P8 lamp is built by p8.ts
  for (let lon = 12; lon < 360; lon += 40) {
    if (inLon(lon, 250, 266)) continue;
    P('lamp', 38.4, lon, 0);
  }
  for (let lon = 32; lon < 360; lon += 40) {
    if (inLon(lon, 20, 40) || inLon(lon, 255, 270) || inLon(lon, 134, 146)) continue;
    P('lamp', 29.6, lon, 180);
  }
  // utility poles (cables span between them and the buildings): inner sidewalk edge
  for (let lon = 2; lon < 360; lon += 17) {
    if (inLon(lon, 24, 36) || inLon(lon, 88, 100) || inLon(lon, 136, 145) || inLon(lon, 256, 268) || inLon(lon, 330, 342)) continue;
    P('pole', 30.6, lon, 180);
  }
  // trees: park, verge, estate yard, subway plaza, outer backyards, hill slope
  const trees: [number, number, number][] = [
    // park: two trees at its east / west edges, keeping the bus stop → hill → banyan sight line (lon ≈ 356–4) open
    // (GDD §5.3 fill bands: 「两棵树…从公交站能直接看到山和榕树」, §5.8)
    [24.6, 350.8, 1.0], [26.2, 8.8, 0.9], [0, 0, 0],      // [0,0,0]: removed third tree, rng draws kept
    [41.2, 345, 1], [41.4, 352, 0.85], [41, 12, 0.9], [41, 40, 1], [41.3, 48, 0.8], [41, 305, 1.1], [41.2, 312, 0.9], [40.8, 330, 1],
    [16.8, 131.5, 0.85], [26.5, 262.5, 0.9], [24, 268, 0.75],
    [9.5, 118, 0.9], [10.5, 175, 1], [9.2, 205, 0.85], [10.8, 240, 1.05], [9.6, 280, 0.9], [10.2, 20, 0.95], [9.8, 60, 0.9], [10.6, 95, 0.8],
    [56, 70, 1.1], [58, 95, 1], [57.5, 128, 1.15], [56.5, 160, 0.95], [58, 185, 1], [59, 206, 1.1], [56, 232, 0.9],
    [17.5, 190, 0.9], [18, 225, 1], [17.5, 300, 0.95], [18.2, 330, 0.85], [18, 40, 0.9], [17, 75, 1],
    [45.5, 278, 0.8], [57, 290, 1],
  ];
  for (const [r, lon, s] of trees) {
    if (s === 0) { rng.range(0, 360); rng.int(0, 1e9); continue; }   // keep every later seeded prop where it was
    P('tree', r, lon, rng.range(0, 360), s);
  }
  // benches, bins, bikes, vending machines, planters, hydrants
  P('bench', 27.2, 2, 180); P('bench', 45.8, 35, 0); P('bench', 45.5, 330, 0); P('bench', 41.2, 355, 0);
  P('bin', 29.8, 70, 180); P('bin', 38.2, 18, 0); P('bin', 29.8, 200, 180); P('bin', 38.2, 300, 0); P('bin', 29.9, 58, 180);
  P('vending', 29.5, 66.2, 180); P('vending', 29.6, 216, 180);
  for (const [r, lon] of [[28.2, 98.6], [28.6, 99.6], [28.9, 100.6], [29.3, 101.5], [30, 62.3], [30.2, 63.8], [38.1, 210], [38.2, 211.5], [29.7, 290], [29.7, 291.4]] as const) P('bike', r, lon, 180 + rng.range(-12, 12));
  for (const [r, lon] of [[38.4, 68], [38.3, 226.2], [29.9, 236], [38.3, 312]] as const) P('scooter', r, lon, rng.range(0, 360));
  for (const lon of [20, 75, 190, 230, 280, 300, 320]) P('planter', 29.4, lon, 180);
  P('hydrant', 29.5, 48, 180); P('hydrant', 38.5, 160, 0);
  P('mailbox', 38.4, 5.5, 0); P('phonebox', 29.6, 110, 180);
  // seawall bollards, net racks and life rings (GDD §5.3 pier)
  for (let lon = 302; lon < 360 + 58; lon += 7) { const l = norm360(lon); if (inLon(l, 318, 326) || inLon(l, 2, 10)) continue; P('bollard', 47.2, l, 0); }
  P('netrack', 45.8, 313, 90); P('netrack', 45.8, 328, 90); P('netrack', 44.8, 16, 90);
  P('lifering', 47.6, 319.8, 0); P('lifering', 47.6, 26.5, 0);
  P('crate', 42.4, 8.8, 20); P('crate', 42.2, 10, 70); P('crate', 43, 315, 10); P('crate', 43.6, 316.2, 50);
  // rocks along the wave wall and around the lighthouse rock
  for (let lon = 62; lon < 300; lon += 5.5) P('rock', 63.2 + rng.range(-0.4, 1.4), lon + rng.range(-1.5, 1.5), rng.range(0, 360), rng.range(0.8, 1.5));
  for (let i = 0; i < 14; i++) {
    const a = 316 + i * 1.4 + rng.range(-1, 1), r = 63.5 + rng.range(-1, 8);
    if (Math.abs(a - PIER.lon) < 2.6 && r < 66) continue;          // keep the pier and its steps clear
    P('rock', r, a, rng.range(0, 360), rng.range(0.9, 1.8));
  }
  propCache = out;
  return out;
}

/** Lamp heads on the planet (street lamps + special lamps) for render.registerLamp. */
export function lampHeads(): { p: P2; h: number }[] {
  return props().filter((x) => x.kind === 'lamp').map((x) => ({ p: add(x.p, dirAt(x.p, x.hdg), 1.1), h: 4.6 }));
}

// ---------------------------------------------------------------- misc helpers used by several builders
export function headingToward(from: P2, to: P2): number { return headingOf(from, sub(to, from)); }
export function mid(a: P2, b: P2): P2 { return lerp2(a, b, 0.5); }
