// src/story/smoke.ts — owner F. GDD §10.6 smoke target resolution (土地的烟, §3.12) and the §18.6 night clock rule.
// P3 wayfinding: the current objective STEP (chip text + target + a walkable route, StoryApi.smokeStep) shared by the
// lens smoke ribbon and the HUD incense arrow, so the chip, the smoke and the arrow never disagree.
import { Vector3 } from 'three';
import type { Core, SmokeStep } from '../contracts';
import type { Cond, NpcId, ObjectiveDef, SceneId, SmokeRule, SpotId, StrKey } from '../types';
import { OBJECTIVES, SMOKE_ELIGIBLE, SMOKE_STEP_TEXT } from '../data/story';
import { NPCS } from '../data/npcs';
import { SPOTS } from '../data/locations';
import { SURFACES, flatToWorld, toFlat, worldToFlat, type Flat } from '../core/planet';
import { Router, followOn, routeGraph, type Walker } from './route';

const NIGHT_START = 22 * 60;           // 22:00
const NIGHT_CAP = 3 * 60 + 40;         // 03:40
const NIGHT_STEP = 40;

/** GDD §18.6: +40 min per night puzzle from the current clock, capped at 03:40 (wraps past midnight). */
export function nightClock(clock: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  const now = m ? Number(m[1]) * 60 + Number(m[2]) : NIGHT_START;
  const rel = (x: number) => (x - NIGHT_START + 1440) % 1440;          // minutes since 22:00
  const next = Math.min(rel(now) + NIGHT_STEP, rel(NIGHT_CAP));
  const abs = (NIGHT_START + next) % 1440;
  return `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const sceneOf = (spot: SpotId): SceneId => SPOTS.find((s) => s.id === spot)?.scene ?? 'planet';
/** Where the smoke leads when the target is in another scene than the player. */
// P3r3 G10: the way out ends in reach of the exit interact (st_exit / sw_exit), not at the arrival spot 3–4 m short of it
const EXIT: Readonly<Record<SceneId, SpotId>> = { planet: 'sp_bus_bench', studio_int: 'st_exit', subway_int: 'sw_exit' };
const DOOR: Readonly<Record<SceneId, SpotId>> = { planet: 'sp_bus_bench', studio_int: 'sp_studio_door', subway_int: 'sp_subway_entry' };

/** The estate roof (h 18) is reached only by the fire-ladder teleport (GDD §5.6): route to the ladder instead. */
export const ROOF_H = 12;
const ROOF_LADDER_TOP: Flat = toFlat({ r: 16.1, lon: 149.7, h: 18 });
/** A `nearest` choice sticks until another candidate is this much closer (vp_subway_top and sp_subway_entry are 2 m
 *  apart: without it the chip flickered between two texts at the subway mouth). */
export const NEAREST_HYSTERESIS = 8;

/** Chip text of a resolved step (pure): the rule's own text, else a `nearest` spot's SMOKE_STEP_TEXT, else the
 *  objective's text. */
export function stepText(obj: ObjectiveDef, rule: SmokeRule | null, spot: SpotId | null, evalCond: (c: Cond | undefined) => boolean): StrKey {
  if (rule?.text) return rule.text;
  if (rule && 'nearest' in rule && spot) {
    for (const e of SMOKE_STEP_TEXT[spot] ?? []) if (evalCond(e.when)) return e.text;
  }
  return obj.textKey;
}

/** P3r2 look L7: flags that can change a route or a smoke target (everything but `seen:*` bookkeeping). */
export function routeFlag(flag: string): boolean { return !flag.startsWith('seen:'); }

export interface SmokeResolver {
  (): SpotId | null;
  /** StoryApi.smokeStep (`textOnly`: chip text and target only, no route computation) */
  step(o?: { textOnly?: boolean }): SmokeStep | null;
  /** walk tests run by the router (perf probes) */
  stats(): { tests: number; routes: number };
}

export function createSmoke(core: Core): SmokeResolver {
  const p = new Vector3(), q = new Vector3();
  let lastNearest: SpotId | null = null;

  const npcSpot = (id: NpcId): SpotId | null => {
    try {
      const a = core.actors.get(id);
      const s = a?.spot?.() ?? null;
      if (s) return s;
    } catch { /* fall back to the schedule */ }
    const def = NPCS.find((n) => n.id === id);
    if (!def) return null;
    for (const o of def.overrides ?? []) if (core.rules.evalCond(o.when)) return o.spot;
    return def.schedule[core.store.state.phase] ?? null;
  };

  const nearest = (list: readonly SpotId[]): SpotId | null => {
    core.player.pos(p);
    const scene = core.player.scene;
    let best: SpotId | null = null, bestD = Infinity, lastD = Infinity;
    for (const s of list) {
      if (!core.rules.evalCond(SMOKE_ELIGIBLE[s])) continue;
      let d: number;
      try {
        if (sceneOf(s) !== scene) d = 1e6;                       // other scene: last resort
        else d = core.services.world.spotPos(s, q).distanceTo(p);
      } catch { d = 1e6; }
      if (s === lastNearest) lastD = d;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (lastNearest && best !== lastNearest && lastD - bestD < NEAREST_HYSTERESIS) best = lastNearest;
    lastNearest = best;
    return best;
  };

  const resolve = (r: SmokeRule): SpotId | null => {
    if ('spot' in r) return r.spot;
    if ('npc' in r) return npcSpot(r.npc);
    return nearest(r.nearest);
  };

  /** First matching rule of the current objective, its spot and the scene redirect (never into another scene). */
  const current = (): { obj: ObjectiveDef; rule: SmokeRule | null; spot: SpotId | null } | null => {
    const obj = OBJECTIVES.find((o) => o.id === core.store.state.objective);
    if (!obj) return null;
    for (const r of obj.smoke) {
      if (!core.rules.evalCond(r.when)) continue;
      const spot = resolve(r);
      if (!spot) continue;
      const here = core.player.scene, there = sceneOf(spot);
      if (there === here) return { obj, rule: r, spot };
      return { obj, rule: r, spot: here === 'planet' ? DOOR[there] : EXIT[here] };
    }
    return { obj, rule: null, spot: null };
  };

  const target = (): SpotId | null => current()?.spot ?? null;

  // ---------------------------------------------------------------- routes (lazy, cached, reset on state changes)
  const routers: Partial<Record<SceneId, Router>> = {};
  const w = new Vector3();
  const walker = (scene: SceneId): Walker => ({
    heightAt: (x, z, h) => core.physics.heightAt(scene, x, z, h),
    blocked: (x, z, h, r) => core.physics.blocked(scene, flatToWorld(SURFACES[scene], { x, z, h: h + 0.05 }, w), r),
  });
  const router = (scene: SceneId): Router => (routers[scene] ??= new Router(routeGraph(scene), walker(scene)));
  const resetRoutes = () => { for (const r of Object.values(routers)) r?.reset(); cache = null; };
  // gates, B1/B2 and doors all change with flags; teleports/scene switches move the player discontinuously
  for (const ev of ['phaseChanged', 'sceneChanged', 'stateLoaded', 'teleported'] as const) {
    try { core.bus.on(ev, resetRoutes); } catch { /* fake bus */ }
  }
  // P3r2 look L7: a cold route costs 10–28 ms of main thread; `seen:*` bookkeeping flags (tutorials, beats, nodes, fx)
  // never open a gate or move a target, so they must not throw the cache away (every tutorial / beat hitched a frame)
  try { core.bus.on('flagSet', (e: { flag: string }) => { if (!routeFlag(e.flag)) return; resetRoutes(); }); } catch { /* fake bus */ }
  let cache: { key: string; from: Flat; t: number; route: Flat[]; direct: boolean } | null = null;
  let routes = 0;
  const RECOMPUTE_M = 1.5, RECOMPUTE_S = 0.3;

  type Goto = { resolveGoto?(s: SpotId): { scene: SceneId; world: Vector3; h: number } | null };
  const spotFlats = (id: SpotId, scene: SceneId): { stand: Flat; end: Flat } => {
    // P3r3 G10: a spot an NPC stands on (纸妹 at the seawall, the attendant at the gantry) — lead to where goto() would
    // put the player (approachDist in front / behind), not into the character; the smoke ends above the character
    try {
      const actor = core.actors.list(scene).find((a) => { try { return a.spot?.() === id; } catch { return false; } });
      const g = actor ? (core.player as unknown as Goto).resolveGoto?.(id) : null;
      if (actor && g && g.scene === scene) {
        const st = worldToFlat(SURFACES[scene], g.world);
        const ap = worldToFlat(SURFACES[scene], actor.root.getWorldPosition(q));
        return { stand: { x: st.x, z: st.z, h: g.h }, end: ap };
      }
    } catch { /* fake core: fall through to the table */ }
    let def = SPOTS.find((s) => s.id === id);
    try { def = core.services.world.spot(id) ?? def; } catch { /* fake world */ }
    if (!def) {
      const pos = worldToFlat(SURFACES[scene], core.services.world.spotPos(id, q));
      return { stand: pos, end: pos };
    }
    return { stand: toFlat(def.stand ?? def.pos), end: toFlat(def.pos) };
  };

  const step = (o?: { textOnly?: boolean }): SmokeStep | null => {
    const c = current();
    if (!c) return null;
    const ev = (x: Cond | undefined) => core.rules.evalCond(x);
    let textKey = stepText(c.obj, c.rule, c.spot, ev);
    const scene = core.player.scene;
    if (!c.spot) return null;
    let stand: Flat, end: Flat;
    try { ({ stand, end } = spotFlats(c.spot, scene)); } catch { return null; }
    const from = worldToFlat(SURFACES[scene], core.player.pos(p));
    // the teleport-only roof: lead to the ladder that connects the two levels
    if (scene === 'planet') {
      if (stand.h >= ROOF_H && from.h < ROOF_H) {
        ({ stand, end } = spotFlats('sp_fire_ladder', scene));
        textKey = 'obj.step.roof_up';
      } else if (stand.h < ROOF_H && from.h >= ROOF_H) {
        stand = end = ROOF_LADDER_TOP;
        textKey = 'obj.step.roof_down';
      }
    }
    const key = `${scene}:${stand.x.toFixed(1)},${stand.z.toFixed(1)},${stand.h.toFixed(1)}`;
    if (o?.textOnly) {
      const r = cache && cache.key === key ? cache.route.slice() : [from, stand];
      r[0] = from;
      return { textKey, spot: c.spot, scene, route: r, end, direct: !cache || cache.key !== key || cache.direct };
    }
    const now = core.clock.t;
    const moved = cache ? Math.hypot(from.x - cache.from.x, from.z - cache.from.z) + Math.abs(from.h - cache.from.h) : Infinity;
    // P3r3 G4: walking along the smoke keeps its route (trimmed to where he is); only a player who left it re-routes
    const rest = cache && cache.key === key && !cache.direct && now >= cache.t && moved > RECOMPUTE_M && now - cache.t >= RECOMPUTE_S
      ? followOn(cache.route, from) : null;
    if (rest && cache) cache = { key, from, t: now, route: rest, direct: false };
    else if (!cache || cache.key !== key || (moved > RECOMPUTE_M && now - cache.t >= RECOMPUTE_S) || now < cache.t) {
      let route: Flat[] | null = null;
      try { route = router(scene).route(from, stand); } catch (e) { core.log.warn('[story] smoke route failed', e); }
      routes++;
      cache = { key, from, t: now, route: route ?? [from, stand], direct: !route };
    }
    // every call: drop the part he has walked past (a node 1.3 m behind him no longer pulls the thread back)
    const trimmed = cache.direct ? null : followOn(cache.route, from);
    const route = trimmed ?? cache.route.slice();
    route[0] = from;
    return { textKey, spot: c.spot, scene, route, end, direct: cache.direct };
  };

  return Object.assign(target, {
    step,
    stats: () => ({ tests: Object.values(routers).reduce((n, r) => n + (r?.tests ?? 0), 0), routes }),
  });
}
