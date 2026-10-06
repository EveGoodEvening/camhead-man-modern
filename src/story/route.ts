// src/story/route.ts — owner F (P3 wayfinding). Walkable routes for 土地's smoke and the HUD incense arrow.
// A small hand-authored street graph per scene (ring road, promenade, the footbridge stairs, the alley, the estate yard,
// the hill path, the pier …) plus lazy walk tests against the LIVE physics (colliders + walk surfaces + gates), so a
// closed gate or a moved prop removes an edge instead of sending the smoke through a wall. Pure apart from the Walker.
import type { SceneId } from '../types';
import { chartToFlat, type Flat } from '../core/planet';
import { ALLEY, BRIDGE, ESTATE, LIGHTHOUSE, PIER, ROCK, SUBWAY } from '../world/layout';
import { STUDIO, SUBWAY_INT } from '../world/interiors/plans';

/** What the router needs from physics (flat chart coords of one scene; h = feet height above base ground). */
export interface Walker {
  heightAt(x: number, z: number, currentH: number): number;
  blocked(x: number, z: number, h: number, radius: number): boolean;
}
export interface RouteNode { id: string; x: number; z: number; h: number }
export interface RouteGraph { scene: SceneId; nodes: RouteNode[]; edges: readonly (readonly [number, number])[] }

/** Walk-test step (m): < 0.45 / 0.56 so the step-up rule can climb the 0.55-slope stairs sample by sample. */
export const WALK_STEP = 0.4;
/** Probe radius: a little under the player's 0.35 m so a route may hug a doorway the player can pass. */
export const WALK_RADIUS = 0.25;
/** Probe radius of the straight legs to / from free points (P3r3 G4): the player's own 0.35 m. */
export const LEG_RADIUS = 0.35;
/** Attach the player / the target to graph nodes at most this far away (m). */
export const ATTACH_RANGE = 34;
/** Go straight to the target when it is this close and the straight walk is clear. */
export const DIRECT_RANGE = 26;

/** Sideways slack of the walk test (m): the probe may sidestep a lamp post, bin or bollard, at most SIDE_STEP per sample
 *  and SIDE_MAX in all, and every sidestep is tested at its midpoint too, so it never slips through a thin wall or
 *  round a wall end that the straight line crosses. */
const SIDE_STEP = 0.4, SIDE_MAX = 1.2;
/** The last metres before b are not collision-tested: a target is often a prop (bench, cabinet, locker) or stands in one. */
const END_FREE = 0.7;
const SIDE_TRY = [0, -1, 1], SIDE_BACK_NEG = [0, -1, 1], SIDE_BACK_POS = [0, 1, -1], NO_SIDE = [0];

/** Walk a → b like the player: heights follow the step-up rule from a.h; fails on a collider that a gentle sidestep
 *  (≤ 1.2 m) does not clear (walls, rails, hoardings, closed gates) or on arriving at the wrong level (under the deck
 *  instead of on it). `slack = false` walks the straight line only (interiors: no clutter, thin partitions). */
export function walkable(w: Walker, a: Flat, b: Flat, radius = WALK_RADIUS, slack = true, detour?: Flat[]): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(d / WALK_STEP));
  const sx = d > 1e-6 ? -dz / d : 0, sz = d > 1e-6 ? dx / d : 0;
  let h = a.h, off = 0, px = a.x, pz = a.z;
  // P3r3 G4: the sidesteps the probe took (the last on-line point before each, every stepped-aside sample, the first
  // one back on the line), so a drawn route can follow them round the post instead of through it
  if (detour) detour.length = 0;
  let ph = a.h;
  for (let i = 1; i <= n; i++) {
    const t = i / n, cx = a.x + dx * t, cz = a.z + dz * t;
    if (Math.abs(h - b.h) > 0.7 + 0.6 * (1 - t) * d) return false;   // can no longer climb/descend to b's level
    if ((1 - t) * d < END_FREE) { h = w.heightAt(cx, cz, h); ph = h; px = cx; pz = cz; continue; }   // targets are often props
    let moved = false;
    // keep the current offset, else drift back toward the line, else step aside (either way)
    const back = -Math.sign(off);
    const tries = !slack ? NO_SIDE : off === 0 ? SIDE_TRY : back < 0 ? SIDE_BACK_NEG : SIDE_BACK_POS;
    for (const k of tries) {
      const o = Math.max(-SIDE_MAX, Math.min(SIDE_MAX, off + k * SIDE_STEP));
      if (k !== 0 && o === off) continue;   // clamped at SIDE_MAX
      const x = cx + sx * o, z = cz + sz * o;
      const hh = w.heightAt(x, z, h);
      if (w.blocked(x, z, hh, radius)) continue;
      if (o !== off) {
        const mx = (px + x) / 2, mz = (pz + z) / 2;
        if (w.blocked(mx, mz, w.heightAt(mx, mz, h), radius)) continue;
      }
      if (detour && (o !== 0 || off !== 0)) {
        if (off === 0) detour.push({ x: px, z: pz, h: ph });
        detour.push({ x, z, h: hh });
      }
      h = hh; ph = hh; off = o; px = x; pz = z; moved = true;
      break;
    }
    if (!moved) return false;
  }
  return Math.abs(h - b.h) <= 0.7;
}

// ---------------------------------------------------------------- graphs
type NodeSpec = readonly [id: string, r: number, lon: number, h?: number];
const RING = 34, PROM = 45.5;
/** GDD §5.1 hill: plateau h 4 inside r 6, slope down to h 0 at the r 13 wall. */
const hill = (r: number) => Math.min(4, Math.max(0, (4 * (13 - r)) / 7));

function planetGraph(): RouteGraph {
  const specs: NodeSpec[] = [];
  const edges: [string, string][] = [];
  // ring road every 15°, closed loop (the B1/B2 roadwork gates cut it by day: their edges fail the walk test)
  for (let lon = 0; lon < 360; lon += 15) specs.push([`R${lon}`, RING, lon]);
  for (let lon = 0; lon < 360; lon += 15) edges.push([`R${lon}`, `R${(lon + 15) % 360}`]);
  // sea-side promenade (lon 300 → 15) and the 周记 tile
  const prom = [300, 315, 330, 345, 0, 12];
  for (const lon of prom) specs.push([`P${lon}`, PROM, lon]);
  for (let i = 1; i < prom.length; i++) if (prom[i] !== 12) edges.push([`P${prom[i - 1]}`, `P${prom[i]}`]);   // the slipway boat sits between P0 and P12
  for (const lon of prom) if (lon !== 315) edges.push([`P${lon}`, `R${lon === 12 ? 15 : lon}`]);   // a tree blocks lon 315
  specs.push(['TILE', 47.2, 23]);
  edges.push(['P12', 'TILE']);
  // footbridge: south stair (r 41, lon 16 → 30), deck (lon 30, r 28.2 → 39.8), north stair (r 27, lon 30 → 51)
  const S = BRIDGE.south, N = BRIDGE.north, dh = BRIDGE.deckH;
  specs.push(['SS0', S.r, S.lonBot - 0.8, 0], ['SS1', S.r, (S.lonBot + S.lonTop) / 2, dh / 2], ['SS2', S.r, S.lonTop + 0.6, dh]);
  specs.push(['DK_S', BRIDGE.deckR1 - 0.6, BRIDGE.lon, dh], ['DK', 34, BRIDGE.lon, dh], ['DK_N', BRIDGE.deckR0 + 0.6, BRIDGE.lon, dh]);
  specs.push(['NS2', N.r, N.lonTop - 0.6, dh], ['NS1', N.r, (N.lonTop + N.lonBot) / 2, dh / 2], ['NS0', N.r + 0.4, N.lonBot - 0.8, 0]);
  edges.push(['SS0', 'SS1'], ['SS1', 'SS2'], ['SS2', 'DK_S'], ['DK_S', 'DK'], ['DK', 'DK_N'], ['DK_N', 'NS2'], ['NS2', 'NS1'], ['NS1', 'NS0']);
  specs.push(['SS_FOOT', 40.2, S.lonBot - 3]);
  edges.push(['SS0', 'SS_FOOT'], ['SS_FOOT', 'R15'], ['SS_FOOT', 'P12']);
  specs.push(['NS_FOOT', 30.3, N.lonBot - 1.5]);   // the stair foot opens seaward; the store wall closes lon > 51
  edges.push(['NS0', 'NS_FOOT'], ['NS_FOOT', 'R45'], ['NS_FOOT', 'R60']);
  // cat-ear alley: mouth (r 29, lon 96) → the studio door (r 17.5, lon 104, h 1.2)
  const am = { r: Math.hypot(ALLEY.mouth.x, ALLEY.mouth.z), lon: 96 };
  specs.push(['AL0', am.r + 1.2, am.lon, 0], ['AL1', 23.5, 100, 0.6], ['AL2', 18.6, 103.5, 1.2]);
  edges.push(['R90', 'AL0'], ['R105', 'AL0'], ['AL0', 'AL1'], ['AL1', 'AL2']);
  // estate: gate (lon 140, r 28.6) → yard → hill gate (r 15, lon 145) → up the hill to the temple plateau
  const gl = ESTATE.gateLon;
  specs.push(['EG0', ESTATE.frontR + 1.6, gl], ['EG1', ESTATE.frontR - 1.6, gl], ['YARD', 22, 142], ['YARD_W', 23, 133], ['YARD_E', 25.5, 151]);
  edges.push(['R135', 'EG0'], ['R150', 'EG0'], ['EG0', 'EG1'], ['EG1', 'YARD'], ['EG1', 'YARD_W'], ['EG1', 'YARD_E'], ['YARD', 'YARD_W'], ['YARD', 'YARD_E']);
  specs.push(['LADDER', 17.2, 145], ['HG', 14.4, 145], ['H1', 11, 145, hill(11)], ['H2', 8, 143, hill(8)], ['TOP', 5, 150, 4], ['TOP_W', 6.5, 134, 3.7]);
  edges.push(['YARD', 'LADDER'], ['LADDER', 'HG'], ['YARD', 'HG'], ['HG', 'H1'], ['H1', 'H2'], ['H2', 'TOP'], ['H2', 'TOP_W'], ['TOP', 'TOP_W']);
  // P3r3 G4: a ring round the hill slope (r 10) so a player anywhere inside the retaining wall — the pockets behind the
  // estate and the alley — attaches to the graph and is led out through the hill gate (lon 145) instead of straight
  // into the wall
  for (let lon = 0; lon < 360; lon += 30) specs.push([`HR${lon}`, 10, lon, hill(10)]);
  for (let lon = 0; lon < 360; lon += 30) edges.push([`HR${lon}`, `HR${(lon + 30) % 360}`]);
  edges.push(['HR150', 'H1'], ['HR120', 'H1'], ['HR150', 'H2'], ['HR120', 'TOP_W'], ['HR150', 'TOP']);
  // P3r3 G4: the paper shop's doorway (west of its counter, lon ≈ 224.4): legs from inside used to cut through the front
  specs.push(['PAPER_IN', 40.4, 224.6], ['PAPER_OUT', 37.6, 224.4]);
  edges.push(['PAPER_IN', 'PAPER_OUT'], ['PAPER_OUT', 'R225'], ['PAPER_OUT', 'R240'], ['PAPER_OUT', 'R210']);
  // subway mouth (lon 262): the landing r 27–29.7
  specs.push(['SW0', SUBWAY.landR1 + 0.3, SUBWAY.lon], ['SW1', (SUBWAY.landR0 + SUBWAY.landR1) / 2, SUBWAY.lon]);
  edges.push(['R255', 'SW0'], ['R270', 'SW0'], ['SW0', 'SW1']);
  // pier (lon 322): ramp → deck → rock steps → the lighthouse door
  specs.push(['PR0', PIER.r0 - 1, PIER.lon], ['PR1', PIER.rampR + 0.8, PIER.lon], ['PR2', PIER.bench.r1 + 1.5, PIER.lon], ['PR3', ROCK.stepR0 - 0.6, PIER.lon]);
  specs.push(['ROCK', ROCK.stepR1 + 0.8, PIER.lon + 1, ROCK.h], ['LH', LIGHTHOUSE.doorSpot.r, LIGHTHOUSE.doorSpot.lon, ROCK.h]);
  edges.push(['P315', 'PR0'], ['P330', 'PR0'], ['PR0', 'PR1'], ['PR1', 'PR2'], ['PR2', 'PR3'], ['PR3', 'ROCK'], ['ROCK', 'LH']);
  return build('planet', specs.map(([id, r, lon, h]) => ({ id, ...chartToFlat({ r, lon, h: h ?? 0 }) })), edges);
}

function studioGraph(): RouteGraph {
  const S = STUDIO, dz = (S.doorZ0 + S.doorZ1) / 2;
  const nodes: RouteNode[] = [
    { id: 'ENTRY', x: 0, z: 3.4, h: 0 }, { id: 'FRONT', x: -0.6, z: 0.6, h: 0 }, { id: 'DOOR_W', x: S.partX - 0.7, z: dz, h: 0 },
    { id: 'DOOR_E', x: S.partX + 0.7, z: dz, h: 0 }, { id: 'DARK', x: 3.3, z: 0.2, h: 0 },
  ];
  return build('studio_int', nodes, [['ENTRY', 'FRONT'], ['ENTRY', 'DOOR_W'], ['FRONT', 'DOOR_W'], ['DOOR_W', 'DOOR_E'], ['DOOR_E', 'DARK']]);
}

function subwayGraph(): RouteGraph {
  const G = SUBWAY_INT;
  const nodes: RouteNode[] = [
    { id: 'STAIRS', x: G.stairX + 0.8, z: 0, h: 0 }, { id: 'HALL', x: -5.8, z: 0, h: 0 }, { id: 'GATE_W', x: G.gantryX - 1.2, z: 0, h: 0 },
    { id: 'GATE_E', x: G.gantryX + 1.2, z: 0, h: 0 }, { id: 'PLATFORM', x: 3.5, z: 0.4, h: 0 },
  ];
  return build('subway_int', nodes, [['STAIRS', 'HALL'], ['HALL', 'GATE_W'], ['GATE_W', 'GATE_E'], ['GATE_E', 'PLATFORM']]);
}

function build(scene: SceneId, nodes: RouteNode[], named: readonly (readonly [string, string])[]): RouteGraph {
  const ix = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = named.map(([a, b]) => {
    const i = ix.get(a), j = ix.get(b);
    if (i === undefined || j === undefined) throw new Error(`[route] unknown node in edge ${a}-${b}`);
    return [i, j] as const;
  });
  return { scene, nodes, edges };
}

let graphs: Record<SceneId, RouteGraph> | null = null;
export function routeGraph(scene: SceneId): RouteGraph {
  graphs ??= { planet: planetGraph(), studio_int: studioGraph(), subway_int: subwayGraph() };
  return graphs[scene];
}

// ---------------------------------------------------------------- router
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Stairs and the hill climb ≤ 0.56 m per m: a node far above/below a point cannot be reached in a straight walk. */
const climbable = (a: Flat, b: Flat) => Math.abs(a.h - b.h) <= 0.5 + 0.6 * dist(a, b);

/**
 * Routes over one scene graph with lazily verified edges. `reset()` forgets every verdict (call it when gates or the
 * layout may have changed: flags, phase, scene). Returns the flat polyline from → … → to (feet level), or null when
 * neither the graph nor a straight walk connects them (callers then fall back to a straight line).
 */
export class Router {
  readonly graph: RouteGraph;
  private readonly walker: Walker;
  private readonly adj: number[][];
  private readonly nodes: Flat[];
  private edgeOk = new Map<number, boolean>();
  /** P3r3 G4: sidestep points of each passing edge, in the direction a → b of `graph.edges[k]` */
  private edgePts = new Map<number, Flat[]>();
  private attachOk = new Map<string, boolean>();
  /** walk tests run since construction (perf probes / tests) */
  tests = 0;
  /** sidestep slack in walk tests (planet clutter); interiors walk straight lines between their few nodes */
  private readonly slack: boolean;
  constructor(graph: RouteGraph, walker: Walker) {
    this.graph = graph; this.walker = walker; this.slack = graph.scene === 'planet';
    // snap authored heights onto the real walk surfaces (stairs / hill / pier), from just above the authored value
    this.nodes = graph.nodes.map((n) => ({ x: n.x, z: n.z, h: walker.heightAt(n.x, n.z, n.h + 0.3) }));
    this.adj = graph.nodes.map(() => []);
    graph.edges.forEach(([a, b], k) => { this.adj[a].push(k); this.adj[b].push(k); });
  }
  reset(): void { this.edgeOk.clear(); this.attachOk.clear(); this.edgePts.clear(); }
  node(i: number): Flat { return this.nodes[i]; }

  private walk(a: Flat, b: Flat): boolean { this.tests++; return walkable(this.walker, a, b, WALK_RADIUS, this.slack); }
  /** P3r3 G4: legs from / to free points (the player, the target, a direct route) are drawn as straight lines that the
   *  player follows literally, so they are tested straight and with the player's own radius (the sidestep slack let a
   *  leg from the hill pocket clip the retaining wall end and a walker stuck on it for minutes). */
  private walkLeg(a: Flat, b: Flat): boolean { this.tests++; return walkable(this.walker, a, b, LEG_RADIUS, false); }
  private edge(k: number): boolean {
    let ok = this.edgeOk.get(k);
    if (ok === undefined) {
      const [a, b] = this.graph.edges[k];
      const pts: Flat[] = [];
      this.tests++;
      ok = walkable(this.walker, this.nodes[a], this.nodes[b], WALK_RADIUS, this.slack, pts);
      if (!ok) {
        this.tests++;
        ok = walkable(this.walker, this.nodes[b], this.nodes[a], WALK_RADIUS, this.slack, pts);
        pts.reverse();
      }
      this.edgeOk.set(k, ok);
      if (ok && pts.length) this.edgePts.set(k, pts);
    }
    return ok;
  }
  /** Cached walk between a (rounded) free point and a node, in the given direction. `strict` = the straight leg with
   *  the player's radius (P3r3 G4); otherwise the lenient sidestepping test (a target inside a doorway / prop). */
  private attach(p: Flat, i: number, toNode: boolean, strict = true): boolean {
    const key = `${strict ? 's' : 'l'}${toNode ? '>' : '<'}${Math.round(p.x * 2)},${Math.round(p.z * 2)},${Math.round(p.h * 2)}:${i}`;
    let ok = this.attachOk.get(key);
    if (ok === undefined) {
      const [a, b] = toNode ? [p, this.nodes[i]] : [this.nodes[i], p];
      ok = strict ? this.walkLeg(a, b) : this.walk(a, b);
      if (this.attachOk.size > 4000) this.attachOk.clear();
      this.attachOk.set(key, ok);
    }
    return ok;
  }

  route(from: Flat, to: Flat): Flat[] | null {
    const direct = dist(from, to);
    if (direct <= DIRECT_RANGE && this.walkLeg(from, to)) return [from, to];
    const n = this.nodes.length;
    // target attachments: nearest nodes that can walk onto the target
    const ends = this.nodes.map((p, i) => ({ i, d: dist(p, to) + Math.abs(p.h - to.h) * 2 }))
      .filter((e) => e.d <= ATTACH_RANGE && climbable(this.nodes[e.i], to)).sort((a, b) => a.d - b.d);
    const goal: { i: number; d: number }[] = [];
    for (const e of ends) { if (goal.length >= 3) break; if (this.attach(to, e.i, false)) goal.push(e); }
    // a target in a doorway / behind a counter: fall back to the lenient test (the last metres are free anyway)
    if (!goal.length) for (const e of ends) { if (goal.length >= 3) break; if (this.attach(to, e.i, false, false)) goal.push(e); }
    if (!goal.length) return null;
    for (let guard = 0; guard < 12; guard++) {
      // Dijkstra from the target side over edges not known to fail
      const dd = new Float64Array(n).fill(Infinity), next = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      for (const g of goal) if (g.d < dd[g.i]) dd[g.i] = g.d;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dd[i] < best) { best = dd[i]; u = i; }
        if (u < 0) break;
        done[u] = 1;
        for (const k of this.adj[u]) {
          if (this.edgeOk.get(k) === false) continue;
          const [a, b] = this.graph.edges[k], v = a === u ? b : a;
          const c = dd[u] + dist(this.nodes[u], this.nodes[v]) + Math.abs(this.nodes[u].h - this.nodes[v].h);
          if (c < dd[v]) { dd[v] = c; next[v] = u; }
        }
      }
      // start: the cheapest node the player can walk to (direct walk competes when it is clear)
      const starts = this.nodes.map((p, i) => ({ i, c: dist(from, p) + dd[i] }))
        .filter((s) => Number.isFinite(s.c) && dist(from, this.nodes[s.i]) <= ATTACH_RANGE && climbable(from, this.nodes[s.i]))
        .sort((a, b) => a.c - b.c);
      // P3r3 G4: 48 candidates (was 12: behind the hill wall the 12 cheapest all fail) up to direct·3 + 160 m (was
      // + 40, which gave up on a start 7 m from the studio door whose only way round is ≈ 80 m through the hill gate —
      // the smoke then drew a straight line into the wall); straight legs first, the lenient test only if none is clear
      let start = -1;
      const cand = starts.slice(0, 48);
      for (const strict of [true, false]) {
        for (const s of cand) {
          if (s.c > direct * 3 + 160) break;
          if (this.attach(from, s.i, true, strict)) { start = s.i; break; }
        }
        if (start >= 0) break;
      }
      if (start < 0) return null;
      // verify the chain; a failing edge is remembered and the search re-runs without it
      const chain = [start];
      const pts: Flat[] = [from, this.nodes[start]];
      let bad = false;
      for (let u = start; next[u] >= 0; u = next[u]) {
        const v = next[u];
        const k = this.adj[u].find((e) => { const [a, b] = this.graph.edges[e]; return (a === u && b === v) || (a === v && b === u); });
        if (k === undefined || !this.edge(k)) { bad = true; break; }
        chain.push(v);
        const dt = this.edgePts.get(k);
        if (dt) pts.push(...(this.graph.edges[k][0] === u ? dt : [...dt].reverse()));
        pts.push(this.nodes[v]);
        if (chain.length > n) { bad = true; break; }
      }
      if (bad) continue;
      const last = chain[chain.length - 1];
      if (!goal.some((g) => g.i === last)) continue;
      pts.push(to);
      return pts;
    }
    return null;
  }
}

/** P3r3 G4: the rest of a route for a player who walked along it — the nearest point within the first `window` m of
 *  the polyline, if he is within `maxOff` m of it (height counts double), else null (recompute). Re-running the router
 *  every 1.5 m flip-flopped between two start nodes on either side of a post, and a walker following the smoke turned
 *  back and forth on the spot. */
export function followOn(route: readonly Flat[], p: Flat, maxOff = 2.5, window = 14): Flat[] | null {
  let best = Infinity, bestI = -1, s = 0;
  for (let i = 1; i < route.length && s <= window; i++) {
    const a = route[i - 1], b = route[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) + 2 * Math.abs(a.h + (b.h - a.h) * t - p.h);
    if (d < best) { best = d; bestI = i; }
    s += Math.sqrt(l2);
  }
  if (bestI < 0 || best > maxOff) return null;
  return [p, ...route.slice(bestI)];
}

/** Point `ahead` metres along a flat polyline (clamped to its end), and the total length. */
export function alongRoute(pts: readonly Flat[], ahead: number): { p: Flat; len: number } {
  let left = ahead, len = 0;
  let out: Flat | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    len += d;
    if (!out && d >= left && d > 0) {
      const t = left / d;
      out = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t };
    } else if (!out) left -= d;
  }
  return { p: out ?? pts[pts.length - 1], len };
}
