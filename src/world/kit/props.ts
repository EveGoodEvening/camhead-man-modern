// src/world/kit/props.ts — owner B. Street furniture (ART §9 props): lamps, utility poles + cables, trees, benches,
// bins, shared bikes, scooters, vending machines, planters, bollards, hydrants, net racks, life rings, rocks, crates.
import { CatmullRomCurve3, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { PAL } from '../../art/palette';
import type { Rng } from '../../contracts';
import { createRng } from '../../core/rng';
import { SURFACES, chartToWorld, flatToWorld, placeMatrix } from '../../core/planet';
import type { ChartPos } from '../../types';
import { add as add2, ch, dirAt, fl, lerp2, type P2 } from '../geo';
import type { Prop } from '../layout';
import { SID, winTag, type BuildCtx } from './building';
import { blob, box, boxRot, cyl, cylX, quad } from './prims';

/** A tree (ART §9: 4–8 noisy blobs, tapered trunk, ≤ 400 tris), foliage layer with flecks. */
export function tree(c: BuildCtx, at: ChartPos, s: number, rng: Rng, o: { h?: number; banyan?: boolean } = {}): void {
  const M = placeMatrix('planet', at, rng.range(0, 360));
  const th = (o.h ?? 3.2) * s;
  c.B.add('solid', cyl(0.13 * s, 0.24 * s, th, 6), M, PAL.trunk, 136, { label: 'tree' });
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3), rr = rng.range(0.6, 1.1) * s;
    c.B.add('foliage', blob(rng.range(1.1, 1.5) * s, Math.cos(a) * rr, th + rng.range(0.3, 1.1) * s, Math.sin(a) * rr, rng, 0.14, 1, 0.85),
      M, i === 2 ? PAL.foliageDeep : PAL.foliage, 137 + (i % 2), { label: 'tree' });
  }
  c.B.add('foliage', blob(1.3 * s, 0, th + 1.9 * s, 0, rng, 0.14, 1, 0.8), M, PAL.foliage, 137, { label: 'tree' });
}

export function lamp(c: BuildCtx, p: P2, hdg: number, rng: Rng, lamps: { p: P2; h: number }[]): void {
  const M = placeMatrix('planet', ch(p), hdg);
  c.B.add('thin', cyl(0.07, 0.1, 4.7, 6), M, PAL.signSlate, 175, { label: 'street_lamp' });   // P3r2: see-through pole
  c.B.add('solid', box(0.09, 0.09, 1.25, 0, 4.62, 0.58), M, PAL.signSlate, 175, { label: 'street_lamp' });
  c.B.add('solid', boxRot(0.36, 0.14, 0.6, 0, 4.62, 1.12, 0.12), M, PAL.signSlate, 176, { label: 'street_lamp' });
  c.B.add('win', box(0.26, 0.05, 0.44, 0, 4.5, 1.12), M, PAL.metalRail, 177, { label: 'street_lamp' }, winTag('lamp'));
  c.B.add('detail', box(0.2, 0.28, 0.1, 0, 2.6, -0.1), M, PAL.metalRail, 178);
  lamps.push({ p: add2(p, dirAt(p, hdg), 1.12), h: 4.45 });
  void rng;
}

export interface PoleTop { p: P2; h: number; arm: P2 }
export function utilityPole(c: BuildCtx, p: P2, hdg: number): PoleTop {
  const M = placeMatrix('planet', ch(p), hdg);
  c.B.add('thin', cyl(0.11, 0.16, 7.4, 6), M, PAL.concrete, 179, { label: 'cable' });   // P3r2: see-through pole
  c.B.add('solid', box(1.6, 0.12, 0.12, 0, 6.8, 0), M, PAL.trunk, 180, { label: 'cable' });
  c.B.add('detail', box(1.2, 0.1, 0.1, 0, 6.1, 0), M, PAL.trunk, 180);
  c.B.add('detail', cyl(0.28, 0.28, 0.7, 6, 0.28, 5.0, 0.05), M, PAL.metalRail, 181);   // transformer can
  return { p, h: 6.85, arm: dirAt(p, hdg + 90) };
}

/** A sagging cable between two chart points (flat + h), wrapped: TubeGeometry r 0.02–0.03, 3 radial sides (ART §9). */
export function cable(c: BuildCtx, a: P2, ha: number, b: P2, hb: number, sag = 0.045, r = 0.028): void {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const pts: Vector3[] = [];
  const n = Math.max(6, Math.ceil(L / 2.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, q = lerp2(a, b, t);
    const h = ha + (hb - ha) * t - 4 * sag * L * t * (1 - t);
    pts.push(flatToWorld(SURFACES.planet, { x: q.x, z: q.z, h }, new Vector3()));
  }
  const g = new TubeGeometry(new CatmullRomCurve3(pts), n * 2, r, 3, false);
  c.B.add('cable', g, null, PAL.cable, SID.cable, { label: 'cable' });
}

export function bench(c: BuildCtx, p: P2, hdg: number, len = 1.6): void {
  const M = placeMatrix('planet', ch(p), hdg);
  // P3r2 (camera): benches stay solid (not see-through): below the 1.5 m boom they only hide a standing hero's shins,
  // and the S_wake / seated shots film him from the side or front
  c.B.add('solid', box(len, 0.08, 0.45, 0, 0.44, 0), M, PAL.ochre, 182, { label: 'bench' });
  c.B.add('solid', boxRot(len, 0.35, 0.06, 0, 0.72, -0.22, -0.2), M, PAL.ochre, 182, { label: 'bench' });
  for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) c.B.add('solid', box(0.08, 0.44, 0.4, x, 0, 0), M, PAL.charcoal, 183, { label: 'bench' });
}

export function bike(c: BuildCtx, p: P2, hdg: number, rng: Rng): void {
  const M = placeMatrix('planet', ch(p), hdg);
  const col = rng.pick([PAL.steelGreen, PAL.orange, PAL.yellow, PAL.skyBlue]);
  for (const z of [-0.5, 0.5]) c.B.add('detail', cylX(0.33, 0.05, 8, 0, 0.33, z), M, PAL.charcoal, 184, { label: 'bike' });
  c.B.add('detail', boxRot(0.06, 0.06, 0.9, 0, 0.62, 0, -0.35), M, col, 185, { label: 'bike' });
  c.B.add('detail', box(0.05, 0.5, 0.05, 0, 0.35, -0.2), M, col, 185, { label: 'bike' });
  c.B.add('detail', box(0.2, 0.06, 0.25, 0, 0.86, -0.2), M, PAL.charcoal, 184, { label: 'bike' });
  c.B.add('detail', box(0.5, 0.05, 0.05, 0, 0.98, 0.45), M, PAL.charcoal, 184, { label: 'bike' });
  c.B.add('detail', box(0.32, 0.2, 0.25, 0, 0.8, 0.62), M, col, 186, { label: 'bike' });
}
export function scooter(c: BuildCtx, p: P2, hdg: number, rng: Rng): void {
  const M = placeMatrix('planet', ch(p), hdg);
  const col = rng.pick([PAL.clothWhite, PAL.skyBlue, PAL.bannerRed, PAL.charcoal]);
  for (const z of [-0.55, 0.55]) c.B.add('detail', cylX(0.24, 0.1, 8, 0, 0.24, z), M, PAL.charcoal, 184, { label: 'bike' });
  c.B.add('detail', box(0.34, 0.3, 1.0, 0, 0.3, -0.05), M, col, 187, { label: 'bike' });
  c.B.add('detail', box(0.3, 0.12, 0.5, 0, 0.62, -0.2), M, PAL.charcoal, 184, { label: 'bike' });
  c.B.add('detail', boxRot(0.3, 0.6, 0.1, 0, 0.75, 0.48, 0.25), M, col, 187, { label: 'bike' });
  c.B.add('detail', box(0.6, 0.05, 0.05, 0, 1.08, 0.55), M, PAL.charcoal, 184, { label: 'bike' });
}

export function vending(c: BuildCtx, p: P2, hdg: number): void {
  const M = placeMatrix('planet', ch(p), hdg);
  c.B.add('solid', box(1.0, 1.85, 0.75, 0, 0, 0), M, PAL.bannerRed, 188);
  const uv = c.T.art('vending', 64, 112, (g, w, h, r) => {
    g.fillStyle = '#f3f6ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f282d'; g.fillRect(3, 3, w - 6, h * 0.6);
    const cols = ['#ff6b5e', '#58e0c8', '#ffd24a', '#f3f6ea', '#46b0cd'];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) { g.fillStyle = r.pick(cols); g.fillRect(6 + x * 11, 8 + y * 16, 7, 11); }
    g.fillStyle = '#333e42'; g.fillRect(8, h * 0.72, w - 16, 10);
    g.strokeStyle = '#2f3a3f'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
  c.B.add('win', quad(0.86, 1.6, 0, 1.0, 0.38, 'z'), M, '#ffffff', 189, { uv }, winTag('neon'));
}

export function planter(c: BuildCtx, p: P2, hdg: number, rng: Rng): void {
  const M = placeMatrix('planet', ch(p), hdg);
  c.B.add('solid', box(0.8, 0.5, 0.8, 0, 0, 0), M, PAL.roofMauve, 110);
  c.B.add('foliage', blob(0.55, 0, 0.8, 0, rng, 0.2, 0), M, PAL.foliage, 137, { label: 'plant' });
}

export function propInstance(c: BuildCtx, pr: Prop, lamps: { p: P2; h: number }[]): PoleTop | null {
  const rng = createRng(pr.seed);
  const M = placeMatrix('planet', ch(pr.p), pr.hdg);
  switch (pr.kind) {
    case 'lamp': lamp(c, pr.p, pr.hdg, rng, lamps); return null;
    case 'pole': return utilityPole(c, pr.p, pr.hdg);
    case 'tree': tree(c, { ...ch(pr.p), h: groundH(pr.p) }, pr.s ?? 1, rng); return null;
    case 'bench': bench(c, pr.p, pr.hdg); return null;
    case 'bike': bike(c, pr.p, pr.hdg, rng); return null;
    case 'scooter': scooter(c, pr.p, pr.hdg, rng); return null;
    case 'vending': vending(c, pr.p, pr.hdg); return null;
    case 'planter': planter(c, pr.p, pr.hdg, rng); return null;
    case 'bin':
      c.B.add('detail', cyl(0.26, 0.22, 0.85, 7), M, rng.pick([PAL.steelGreen, PAL.skyBlue]), 190 - 1, {});
      c.B.add('detail', cyl(0.28, 0.28, 0.08, 7, 0, 0.85, 0), M, PAL.charcoal, 188, {});
      return null;
    case 'hydrant':
      c.B.add('detail', cyl(0.12, 0.14, 0.7, 6), M, PAL.bannerRed, 186, {});
      c.B.add('detail', cylX(0.05, 0.4, 5, 0, 0.45, 0), M, PAL.bannerRed, 186, {});
      return null;
    case 'mailbox':
      c.B.add('solid', box(0.55, 1.1, 0.45, 0, 0, 0), M, PAL.steelGreen, 187, {});
      c.B.add('solid', box(0.6, 0.12, 0.5, 0, 1.1, 0), M, PAL.foliageDeep, 185, {});
      return null;
    case 'phonebox':
      c.B.add('solid', box(1.0, 2.2, 0.8, 0, 0, 0), M, PAL.skyBlue, 184, {});
      c.B.add('win', quad(0.8, 1.2, 0, 1.3, 0.41, 'z'), M, PAL.glassDark, 80, { uv: c.T.pane(0) }, winTag('shop'));
      return null;
    case 'bollard':
      c.B.add('solid', cyl(0.16, 0.2, 0.55, 7), M, PAL.charcoal, 183, { label: 'bollard' });
      c.B.add('solid', cyl(0.26, 0.26, 0.08, 7, 0, 0.55, 0), M, PAL.charcoal, 182, { label: 'bollard' });
      return null;
    case 'netrack':
      for (const x of [-1, 1]) c.B.add('thin', box(0.08, 1.8, 0.08, x, 0, 0), M, PAL.trunk, 181, {});
      c.B.add('solid', box(2.1, 0.08, 0.08, 0, 1.8, 0), M, PAL.trunk, 181, {});
      c.B.add('detail', boxRot(2.0, 1.4, 0.05, 0, 1.1, 0.12, 0.1), M, rng.pick([PAL.steelGreen, PAL.blue, PAL.orange]), 180, { label: 'net' });
      return null;
    case 'lifering': {
      const g = new TorusGeometry(0.3, 0.07, 5, 12);
      g.translate(0, 1.1, 0);
      c.B.add('detail', g, M, PAL.orange, 179, {});
      c.B.add('detail', box(0.08, 1.4, 0.08, 0, 0, -0.1), M, PAL.metalRail, 178, {});
      return null;
    }
    case 'crate':
      c.B.add('detail', box(0.7, 0.4, 0.5, 0, 0, 0), M, rng.pick([PAL.blue, PAL.orange, PAL.skyBlue]), 177, { label: 'boxes' });
      c.B.add('detail', box(0.7, 0.4, 0.5, rng.range(-0.1, 0.1), 0.4, rng.range(-0.1, 0.1)), M, rng.pick([PAL.blue, PAL.orange, PAL.sidewalkTan]), 176, { label: 'boxes' });
      return null;
    case 'rock':
      c.B.add('solid', blob(0.7 * (pr.s ?? 1), 0, 0, 0, rng, 0.25, -1, 0.65), M, rng.pick([PAL.concrete, PAL.sidewalk, '#8b8f86']), SID.rock, {});
      return null;
    case 'cone':
      c.B.add('detail', cyl(0.03, 0.2, 0.7, 6), M, PAL.orange, 176, { label: 'cone' });
      c.B.add('detail', cyl(0.13, 0.15, 0.1, 6, 0, 0.3, 0), M, PAL.clothWhite, 175, { label: 'cone' });
      return null;
    default: return null;
  }
}

/** Ground height at a flat point for props standing on the hill (else 0). */
function groundH(p: P2): number {
  const r = Math.hypot(p.x, p.z);
  if (r <= 6) return 4;
  if (r < 13) return (4 * (13 - r)) / 7;
  return 0;
}

export { chartToWorld, fl };
