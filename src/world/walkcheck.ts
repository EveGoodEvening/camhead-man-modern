// src/world/walkcheck.ts — owner B. Reachability on foot (ARCHITECTURE §3.B DoD, `?dev=world:walkcheck`): a BFS over a
// flat-chart grid using the real physics (colliders + hRange) and the same step rule as the walker (≤ 0.45 m up).
import { Vector3 } from 'three';
import type { ChartPos, SpotDef } from '../types';
import { PLAYER_RADIUS } from '../core/physics';
import { SURFACES, chartToFlat, flatToWorld, isChart } from '../core/planet';

export interface BlockTester { blocked(scene: 'planet', world: Vector3, radius: number): boolean }
export type HeightFn = (x: number, z: number, currentH: number) => number;

export interface Reach {
  cell: number;
  /** reached state near (x, z) with |h − wantH| ≤ hTol within `tol` metres */
  near(x: number, z: number, tol: number, wantH?: number, hTol?: number): boolean;
  count: number;
}

export function bfs(ph: BlockTester, heightAt: HeightFn, start: ChartPos, o: { cell?: number; maxR?: number } = {}): Reach {
  const cell = o.cell ?? 0.5, maxR = o.maxR ?? 70.8;
  const N = Math.ceil((2 * maxR) / cell) + 1;
  const idx = (x: number) => Math.round((x + maxR) / cell);
  const pos = (i: number) => i * cell - maxR;
  const w = new Vector3();
  const blockCache = new Map<number, boolean>();
  const isBlocked = (i: number, j: number, h: number) => {
    const k = (i * N + j) * 2048 + Math.min(2047, Math.max(0, Math.round(h * 20)));
    let b = blockCache.get(k);
    if (b === undefined) {
      flatToWorld(SURFACES.planet, { x: pos(i), z: pos(j), h }, w);
      b = ph.blocked('planet', w, PLAYER_RADIUS - 1e-3);
      blockCache.set(k, b);
    }
    return b;
  };
  const visited = new Map<number, number[]>();   // cell → heights reached
  const seen = (i: number, j: number, h: number) => {
    const l = visited.get(i * N + j);
    if (l && l.some((x) => Math.abs(x - h) < 0.2)) return true;
    if (l) l.push(h); else visited.set(i * N + j, [h]);
    return false;
  };
  const s = chartToFlat(start);
  const q: number[] = [];
  const i0 = idx(s.x), j0 = idx(s.z), h0 = heightAt(pos(i0), pos(j0), s.h);
  seen(i0, j0, h0); q.push(i0, j0, h0);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let head = 0;
  while (head < q.length) {
    const i = q[head++], j = q[head++], h = q[head++];
    for (const [di, dj] of dirs) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const x = pos(ni), z = pos(nj);
      if (Math.hypot(x, z) > maxR) continue;
      if (isBlocked(ni, nj, h)) continue;
      if (di && dj && (isBlocked(i + di, j, h) || isBlocked(i, j + dj, h))) continue;   // no corner cutting
      const target = heightAt(x, z, h);
      const nh = target;
      if (seen(ni, nj, nh)) continue;
      q.push(ni, nj, nh);
    }
  }
  return {
    cell, count: visited.size,
    near(x, z, tol, wantH, hTol = 0.6) {
      const r = Math.ceil(tol / cell);
      const ci = idx(x), cj = idx(z);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.hypot(pos(ci + a) - x, pos(cj + b) - z) > tol) continue;
        const l = visited.get((ci + a) * N + (cj + b));
        if (l && (wantH === undefined || l.some((hh) => Math.abs(hh - wantH) <= hTol))) return true;
      }
      return false;
    },
  };
}

/** Spots that are reachable only by teleport / fade (GDD §5.6) or are not standing points. */
// g6: 土地 crouches on a stair rail post in the dawn lineup (P3r2), a perch like sp_site_pipes
export const TELEPORT_ONLY = new Set<string>(['sp_roof', 'pk_coop', 'sp_estate_window', 'sp_site_pipes', 'g6']);

/** Where a player would stand for a spot (stand for object spots), flat + h. */
export function standOf(s: SpotDef): { x: number; z: number; h: number } | null {
  const p = s.stand ?? s.pos;
  if (!isChart(p)) return null;
  return chartToFlat(p);
}
