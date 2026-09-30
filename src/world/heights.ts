// src/world/heights.ts — owner B. Analytic walk surfaces (GDD §5.6, ARCHITECTURE §3.B heights.ts). Pure: no three.js.
// Each function takes flat chart coords (x = r·sin lon, z = r·cos lon) and returns a height or null outside.
import type { WalkSurfaceDef } from '../contracts';
import { ch, dirAt, fl, inLon, lonDiff, sub, type P2 } from './geo';
import { ALLEY, BRIDGE, ESTATE, PIER, ROCK, SITE, alleyDir, b1Rect } from './layout';

const polar = (x: number, z: number) => { const r = Math.hypot(x, z); return { r, lon: ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360 }; };

/** Distance of p from the radial line at `lon`, and the radius measured along it (flat). */
function alongRadial(p: P2, lon: number): { along: number; across: number } {
  const L = (lon * Math.PI) / 180, ux = Math.sin(L), uz = Math.cos(L);
  return { along: p.x * ux + p.z * uz, across: p.x * uz - p.z * ux };
}

/** Hill: plateau h 4 for r ≤ 6, slope h = 4·(13−r)/7 for r 6–13 (GDD §5.1). */
export function hillH(x: number, z: number): number | null {
  const r = Math.hypot(x, z);
  if (r > 13) return null;
  if (r <= 6) return 4;
  return (4 * (13 - r)) / 7;
}

/** Footbridge deck (radial span r 28.2 → 39.8 at lon 30, h 5.5). */
export function deckH(x: number, z: number): number | null {
  const a = alongRadial({ x, z }, BRIDGE.lon);
  if (Math.abs(a.across) > BRIDGE.halfW || a.along < BRIDGE.deckR0 - 0.05 || a.along > BRIDGE.deckR1 + 0.05) return null;
  return BRIDGE.deckH;
}

/** North stair: along r 27 from lon 51 (h 0) up to lon 30 (h 5.5), landing to lon 27.9 (slope 0.55, 10 m run). */
export function northStairH(x: number, z: number): number | null {
  const { r, lon } = polar(x, z), s = BRIDGE.north;
  if (Math.abs(r - s.r) > s.halfW || !inLon(lon, s.lon0, s.lonBot)) return null;
  const t = Math.min(1, Math.max(0, lonDiff(lon, s.lonBot) / (s.lonBot - s.lonTop)));
  return BRIDGE.deckH * t;
}
/** South stair (the group-photo stairs): along r 41 from lon 16 (h 0) up to lon 30 (h 5.5), landing to lon 32.1. */
export function southStairH(x: number, z: number): number | null {
  const { r, lon } = polar(x, z), s = BRIDGE.south;
  if (Math.abs(r - s.r) > s.halfW || !inLon(lon, s.lonBot, s.lon0)) return null;
  const t = Math.min(1, Math.max(0, lonDiff(s.lonBot, lon) / (s.lonTop - s.lonBot)));
  return BRIDGE.deckH * t;
}

/** Cat-ear alley ramp: h 0 at the mouth (r 29, lon 96) → 1.2 at the studio door (r 17.5, lon 104). */
export function alleyH(x: number, z: number): number | null {
  const d = sub({ x, z }, ALLEY.mouth);
  const L = Math.hypot(ALLEY.end.x - ALLEY.mouth.x, ALLEY.end.z - ALLEY.mouth.z);
  const t = (d.x * alleyDir.x + d.z * alleyDir.z) / L;
  const across = Math.abs(d.x * alleyDir.z - d.z * alleyDir.x);
  if (across > ALLEY.halfW + 0.3 || t < 0 || t > 1.35) return null;
  return ALLEY.topH * Math.min(1, t);
}

/** Pier: 2 m ramp (r 48 → 50, h 0 → 0.6), deck h 0.6 to r 63 (+ the bench bulge), stone steps up to the rock (h 1.5). */
export function pierH(x: number, z: number): number | null {
  const a = alongRadial({ x, z }, PIER.lon);
  const bulge = a.along >= PIER.bench.r0 && a.along <= PIER.bench.r1;
  if (Math.abs(a.across) > (bulge ? PIER.bench.bulgeHalfW : PIER.halfW)) return null;
  if (a.along < PIER.r0 - 0.3 || a.along > ROCK.stepR1 + 0.05) return null;
  if (a.along <= PIER.rampR) return PIER.deckH * Math.max(0, (a.along - PIER.r0) / (PIER.rampR - PIER.r0));
  if (a.along <= ROCK.stepR0) return PIER.deckH;
  return PIER.deckH + (ROCK.h - PIER.deckH) * ((a.along - ROCK.stepR0) / (ROCK.stepR1 - ROCK.stepR0));
}
/** Lighthouse rock platform: r 64.6–70, lon 321–330, h 1.5. */
export function rockH(x: number, z: number): number | null {
  const { r, lon } = polar(x, z);
  if (r < ROCK.r0 - 0.05 || r > ROCK.r1 || !inLon(lon, ROCK.lon0, ROCK.lon1)) return null;
  return ROCK.h;
}

/** Estate B1 roof (h 18): teleport-only (sp_roof, pk_coop); keeps the player up there. */
export function b1RoofH(x: number, z: number): number | null {
  const rc = b1Rect();
  const f = dirAt(rc.c, rc.hdg), dx = x - rc.c.x, dz = z - rc.c.z;
  const along = dx * f.x + dz * f.z, across = dx * f.z - dz * f.x;
  if (Math.abs(along) > rc.hd - 0.05 || Math.abs(across) > rc.hw - 0.05) return null;
  return ESTATE.b1.floors * 3;
}

/** Cement pipes at the site (xiaoliu sits at h 0.8; GDD sp_site_pipes). */
export function pipesH(x: number, z: number): number | null {
  const p = fl(SITE.pipes.r, SITE.pipes.lon);
  return Math.hypot(x - p.x, z - p.z) <= 0.9 ? 0.8 : null;
}

export const SURFACE_FNS = {
  hill: hillH, deck: deckH, stairN: northStairH, stairS: southStairH, alley: alleyH, pier: pierH, rock: rockH,
  roof: b1RoofH, pipes: pipesH,
} as const;

/** All planet walk surfaces for physics.registerWalkSurface. */
export function planetSurfaces(): WalkSurfaceDef[] {
  return Object.entries(SURFACE_FNS).map(([id, fn]) => ({ id: `world:${id}`, scene: 'planet' as const, heightAt: fn }));
}

/** Same rule as physics.heightAt (max surface ≤ currentH + step), for pure tests and the walkcheck. */
export function groundAt(x: number, z: number, currentH: number, step = 0.45): number {
  let best = 0;
  for (const fn of Object.values(SURFACE_FNS)) {
    const h = fn(x, z);
    if (h !== null && h <= currentH + step && h > best) best = h;
  }
  return best;
}

/** Chart helper for tests. */
export function hAtChart(r: number, lon: number, currentH: number): number { const p = fl(r, lon); return groundAt(p.x, p.z, currentH); }
export { ch };
