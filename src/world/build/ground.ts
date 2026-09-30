// src/world/build/ground.ts — owner B. Planet body + the wrapped town ground (ART §6.3: tessellated disc, per-vertex
// wrap), ring road with paint, sidewalks and curbs, hill, promenade, seawall/wave wall, shallow band and foam.
import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';
import { PAL } from '../../art/palette';
import { DEG, PLANET_R, placeMatrix, wrapGeometry } from '../../core/planet';
import type { LabelId } from '../../types';
import { dirAt, fl, inLon, lonSpan, degFor, type P2, type Rect } from '../geo';
import { BRIDGE, ESTATE, PIER, R, SUBWAY, SITE, plan } from '../layout';
import { alleyFlanks, backPart, storeRect } from '../colliders';
import { hillH } from '../heights';
import type { Batch } from '../kit/batch';
import { SID, type BuildCtx } from '../kit/building';
import { box, cyl, blob } from '../kit/prims';

type HFn = number | ((r: number, lon: number) => number);

/** Flat annulus sector (r0..r1, lon0 → lon1 eastward) at height h, as a grid; normals up. */
export function annulus(r0: number, r1: number, lon0: number, lon1: number, h: HFn, maxSeg = 3, segR?: number, rBreaks?: readonly number[]): BufferGeometry {
  const span = lonSpan(lon0, lon1);
  const nL = Math.max(2, Math.ceil((r1 * span * DEG) / maxSeg));
  const nR = rBreaks ? rBreaks.length - 1 : segR ?? Math.max(1, Math.ceil((r1 - r0) / maxSeg));
  const rAt = (j: number) => (rBreaks ? rBreaks[j] : r0 + ((r1 - r0) * j) / nR);
  const pos: number[] = [];
  const P = (r: number, lon: number) => {
    const l = lon * DEG, hh = typeof h === 'number' ? h : h(r, lon);
    return [r * Math.sin(l), hh, r * Math.cos(l)];
  };
  for (let i = 0; i < nL; i++) {
    const a = lon0 + (span * i) / nL, b = lon0 + (span * (i + 1)) / nL;
    for (let j = 0; j < nR; j++) {
      const ra = rAt(j), rb = rAt(j + 1);
      const A = P(ra, a), B = P(ra, b), C = P(rb, b), D = P(rb, a);
      // lon increases clockwise seen from +Y (x = r sin, z = r cos) → wind A, B, C for an up normal
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ ground under closed building masses (I-look)
// SwiftShader shades every rasterised fragment, occluded or not (no early-z), and the ground under a building is only
// ever seen through its walls: drop ground triangles that lie wholly inside a closed ground-floor mass (arcade rows:
// the back part only — the arcade walkway keeps its ground). Walls start 0.4 m below ground, so the 0.35 m margin
// never opens a seam.
const FOOT_MARGIN = 0.35;
interface Foot { c: P2; f: P2; e: P2; hw: number; hd: number }
let feet: Foot[] | null = null;
function footprints(): Foot[] {
  if (feet) return feet;
  const rects: Rect[] = [];
  for (const b of plan().bldgs) if (!b.far && b.base === 0) rects.push(b.arcade > 0 ? backPart(b.rect, b.arcade) : b.rect);
  rects.push(storeRect(), ...alleyFlanks());
  feet = rects.map((rc) => ({ c: rc.c, f: dirAt(rc.c, rc.hdg), e: dirAt(rc.c, rc.hdg + 90), hw: rc.hw - FOOT_MARGIN, hd: rc.hd - FOOT_MARGIN }));
  return feet;
}
const inFoot = (q: Foot, x: number, z: number) => {
  const dx = x - q.c.x, dz = z - q.c.z;
  return Math.abs(dx * q.f.x + dz * q.f.z) <= q.hd && Math.abs(dx * q.e.x + dz * q.e.z) <= q.hw;
};
/** Remove the triangles of a (chart-space, non-indexed) ground piece that lie wholly inside one building footprint. */
export function cullUnderBuildings(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position');
  const keep: number[] = [];
  const F = footprints();
  for (let t = 0; t < pos.count; t += 3) {
    const x0 = pos.getX(t), z0 = pos.getZ(t);
    const q = F.find((f) => inFoot(f, x0, z0));
    const hidden = !!q && inFoot(q, pos.getX(t + 1), pos.getZ(t + 1)) && inFoot(q, pos.getX(t + 2), pos.getZ(t + 2));
    if (!hidden) for (let k = 0; k < 3; k++) keep.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  return out;
}

/** Paint + wrap + file one ground piece. */
function put(B: Batch, g: BufferGeometry, hex: string, sid: number, label?: LabelId, layer: 'ground' | 'detail' = 'ground'): void {
  wrapGeometry(g);
  B.add(layer, g, null, hex, sid, { label });
}

export function buildPlanetBody(B: Batch): void {
  const g = new IcosahedronGeometry(PLANET_R - 0.05, 5);
  B.add('ground', g, null, PAL.sea, SID.planet, { label: 'sea', chunk: 'planet' });
}

export function buildGround(c: BuildCtx): void {
  const { B } = c;
  // hill: plateau + slope (walk heights, GDD §5.1), stone path at lon 145
  put(B, annulus(0.01, 6, 0, 360, 4, 2.5, 3), PAL.sidewalkTan, SID.plaza);
  put(B, annulus(6, 13.05, 0, 360, (r, lon) => { const p = fl(r, lon); return (hillH(p.x, p.z) ?? 0); }, 2.5, 5), PAL.grass, SID.hill, 'grass');
  put(B, annulus(6, 13.1, 141.5, 148.5, (r, lon) => { const p = fl(r, lon); return (hillH(p.x, p.z) ?? 0) + 0.03; }, 1.2, 6), PAL.sidewalkTan, SID.plaza + 1);
  // back streets r 13–22 (mostly under houses) and the qilou zone / arcades r 22–29
  put(B, annulus(13, 22, 0, 360, 0, 3.2, 3), PAL.concrete, SID.plaza + 2);
  // (a hole over the metro stairwell pit: lon 262 ± 4.2°, r 22.5–27)
  // (radial rows split at the inner rows' back part r 22–27, fine lon cells, so the part under the masses can go)
  put(B, cullUnderBuildings(annulus(22, 29, SUBWAY.lon + 4.2, SUBWAY.lon - 4.2, 0.01, 1.4, undefined, [22, 22.36, 26.64, 29])), PAL.sidewalk, SID.sidewalk + 1);
  put(B, annulus(22, 22.5, SUBWAY.lon - 4.2, SUBWAY.lon + 4.2, 0.01, 3, 1), PAL.sidewalk, SID.sidewalk + 1);
  put(B, annulus(27, 29, SUBWAY.lon - 4.2, SUBWAY.lon + 4.2, 0.01, 3, 1), PAL.sidewalk, SID.sidewalk + 1);
  // estate yard (paved lighter) over the zone
  put(B, annulus(13.2, 28.5, 113, 168, 0.02, 2.5, 5), PAL.sidewalkTan, SID.plaza + 3);
  // sidewalks, curbs, road (GDD §5.1: road r 31–37, sidewalks 29–31 / 37–39)
  put(B, annulus(29, 31, 0, 360, 0.02, 2.4, 1), PAL.sidewalk, SID.sidewalk, 'road');
  put(B, annulus(37, 39, 0, 360, 0.02, 2.4, 1), PAL.sidewalkTan, SID.sidewalk + 2, 'road');
  put(B, annulus(31, 37, 0, 360, 0.0, 2.4, 3), PAL.road, SID.road, 'road');
  for (const [r0, r1] of [[30.85, 31.15], [36.85, 37.15]] as const) put(B, curbStrip(r0, r1), PAL.concrete, SID.curb);
  // paint: double yellow centre line, white edge lines, zebra crossings
  put(B, annulus(33.88, 33.98, 0, 360, 0.012, 2.4, 1), PAL.paintYellow, SID.paint);
  put(B, annulus(34.02, 34.12, 0, 360, 0.012, 2.4, 1), PAL.paintYellow, SID.paint);
  for (const r of [31.45, 36.55]) {
    for (let lon = 0; lon < 360; lon += 3.2) put(B, annulus(r - 0.07, r + 0.07, lon, lon + 1.9, 0.012, 3, 1), PAL.paintWhite, SID.paint + 1);
  }
  for (const lon of [352.5, 138, 205, 262.5, 64]) zebra(c, lon);
  // outer band: sea side verge + promenade (GDD §5.3 #2), land side ground to the wave wall
  put(B, annulus(39, 43, 300, 45, 0.015, 2.5, 2), PAL.grass, SID.grass);
  put(B, annulus(43, R.seawall, 300, 60, 0.02, 2.2, 2), PAL.sidewalkTan, SID.promenade);
  put(B, promenadeTiles(), PAL.sidewalk, SID.promenade + 1);
  put(B, annulus(39, 43, 45, 62, 0.015, 2.5, 2), PAL.sidewalk, SID.plaza + 4);
  // outer rows r 39.2–47 / 45.2 (closed masses, no arcades): split so the part under them can go
  put(B, cullUnderBuildings(annulus(39, 47, 62, 235, 0.01, 1.4, undefined, [39, 39.56, 44.84, 46.64, 47])), PAL.sidewalk, SID.plaza + 4);
  put(B, annulus(47, R.wave, 62, 235, 0.01, 3, 4), PAL.sidewalk, SID.plaza + 4);
  put(B, annulus(39, R.wave, 235, 286, 0.01, 3, 6), PAL.sidewalkTan, SID.sand, 'rubble');
  put(B, annulus(39, R.wave, 286, 300, 0.01, 3, 6), PAL.concrete, SID.plaza + 5);
  put(B, annulus(R.seawall, R.wave, 300, 300.01 + 0.01, 0.01, 3, 1), PAL.concrete, SID.plaza + 5);
  // backyard grass patches (outer, land side)
  for (const [a, b] of [[64, 100], [118, 150], [178, 194], [222, 234]] as const) put(B, annulus(55, 61, a, b, 0.02, 3, 2), PAL.grass, SID.grass + 1);
  // shallow band + foam outside the shore
  shore(c);
  // bridge / subway ground marks
  put(B, annulus(SUBWAY.landR0, SUBWAY.landR1, SUBWAY.lon - degFor(28, SUBWAY.halfW), SUBWAY.lon + degFor(28, SUBWAY.halfW), 0.03, 1, 2), PAL.tileWhite, SID.plaza + 6);
  void BRIDGE; void ESTATE; void PIER; void SITE;
}

function curbStrip(r0: number, r1: number): BufferGeometry { return annulus(r0, r1, 0, 360, 0.09, 2.4, 1); }

function promenadeTiles(): BufferGeometry {
  const gs: number[] = [];
  const g = new BufferGeometry();
  for (let lon = 345; lon < 360 + 60; lon += 4) {
    const a = annulus(45.1, 45.4, lon, lon + 2.2, 0.03, 3, 1);
    gs.push(...(a.getAttribute('position').array as Float32Array));
  }
  g.setAttribute('position', new Float32BufferAttribute(gs, 3));
  g.computeVertexNormals();
  return g;
}

function zebra(c: BuildCtx, lon: number): void {
  for (let k = -4; k <= 4; k++) {
    const l = lon + degFor(34, k * 0.9);
    const g = annulus(31.3, 36.7, l - degFor(34, 0.25), l + degFor(34, 0.25), 0.014, 1, 3);
    wrapGeometry(g);
    c.B.add('ground', g, null, PAL.paintWhite, SID.paint + 2, { label: 'road' });
  }
}

/** Shallow band + foam + seawall parapet / wave wall + rail (GDD §5.1 coastline, §5.6 boundary). */
function shore(c: BuildCtx): void {
  const { B, rng } = c;
  for (const [a, b, r] of [[300, 60, R.seawall + 0.3], [60, 300, R.wave + 0.4]] as const) {
    put(B, annulus(r, r + 1.2, a, b, -0.015, 3, 1), PAL.foam, SID.foam);
    put(B, annulus(r + 1.2, Math.min(r + 7, 71.5), a, b, -0.025, 3.5, 2), PAL.seaShallow, SID.shallow, 'sea');
  }
  // radial shore joins at lon 60 / 300 (land side is wave-wall land beyond r 48)
  for (const lon of [300, 61.5]) {
    const g = annulus(R.seawall + 0.3, R.wave + 0.4, lon - 0.4, lon + 0.4, 0.01, 2, 5);
    put(B, g, PAL.concrete, SID.seawall);
  }
  // seawall parapet (r 47.6–48.3, h 0.85) with rail posts; pier gap at lon 322
  const gap = degFor(R.seawall, PIER.halfW + 0.05);
  const segs: [number, number][] = [[300, PIER.lon - gap], [PIER.lon + gap, 60]];
  for (const [a, b] of segs) {
    const span = lonSpan(a, b), n = Math.ceil((R.seawall * span * DEG) / 2.5);
    for (let i = 0; i < n; i++) {
      const l0 = a + (span * i) / n, l1 = a + (span * (i + 1)) / n, lm = (l0 + l1) / 2;
      const len = R.seawall * (l1 - l0) * DEG + 0.02;
      const M = placeMatrix('planet', { r: R.seawall - 0.05, lon: lm, h: 0 }, 90);
      B.add('solid', box(0.7, 1.9, len, 0, -1.1, 0), M, PAL.concrete, SID.seawall, { label: 'bollard' });
      B.add('solid', box(0.82, 0.12, len, 0, 0.8, 0), M, PAL.sidewalk, SID.seawall + 1, {});
      if (i % 2 === 0) B.add('detail', cyl(0.035, 0.035, 0.75, 5, 0, 0.9, 0), M, PAL.metalRail, SID.seawall + 2, {});
      B.add('detail', box(0.06, 0.06, len, 0, 1.6, 0), M, PAL.metalRail, SID.seawall + 2, {});
    }
  }
  // wave wall r 62 (lon 60 → 300) with tetrapod-ish rocks (props add more)
  {
    const span = lonSpan(60, 300), n = Math.ceil((R.wave * span * DEG) / 3);
    for (let i = 0; i < n; i++) {
      const l0 = 60 + (span * i) / n, l1 = 60 + (span * (i + 1)) / n, lm = (l0 + l1) / 2;
      const len = R.wave * (l1 - l0) * DEG + 0.02;
      const M = placeMatrix('planet', { r: R.wave + 0.2, lon: lm, h: 0 }, 90);
      B.add('solid', box(0.6, 2.0, len, 0, -1.0, 0), M, PAL.concrete, SID.seawall, {});
      if (inLon(lm, 62, 298) && rng.next() < 0.5) {
        const Mr = placeMatrix('planet', { r: R.wave + 1.6 + rng.range(0, 1.2), lon: lm, h: -0.3 }, rng.range(0, 360));
        B.add('solid', blob(rng.range(0.7, 1.2), 0, 0, 0, rng, 0.2, -1, 0.7), Mr, rng.pick([PAL.concrete, PAL.sidewalk]), SID.rock, {});
      }
    }
  }
  // retaining wall r 13 with the lon 145 gap (stone, ivy)
  {
    const a = 149.4, b = 140.6, span = lonSpan(a, b), n = Math.ceil((13 * span * DEG) / 1.6);
    for (let i = 0; i < n; i++) {
      const l0 = a + (span * i) / n, l1 = a + (span * (i + 1)) / n, lm = (l0 + l1) / 2;
      const len = 13 * (l1 - l0) * DEG + 0.03;
      const M = placeMatrix('planet', { r: 13, lon: lm, h: 0 }, 90);
      B.add('solid', box(0.5, 1.3, len, 0, -0.35, 0), M, PAL.concrete, SID.seawall + 3, {});
      if (rng.next() < 0.55) B.add('detail', blob(rng.range(0.35, 0.6), rng.range(-0.1, 0.25), rng.range(0.2, 0.8), 0, rng, 0.3, 0, 0.8), M, rng.pick([PAL.foliageDeep, PAL.foliage]), SID.plant, { label: 'plant' });
    }
  }
}
