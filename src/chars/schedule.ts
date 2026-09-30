// src/chars/schedule.ts — owner C. Where each NPC is, per phase and flags (GDD §6.1 layer table, §6.2 schedule).
// Pure: resolves a Placement from the NpcDef + state; the runtime turns it into transforms, layers and colliders.
import type { ActorLayer, ChartPos, Cond, FlagId, NpcDef, NpcId, Phase, SpotId } from '../types';

export type PlaceMode = 'spot' | 'shoulder' | 'bus' | 'arms' | 'hidden';
/** Offset in the target spot's frame: side = metres to its right, fwd = along its yaw, up; yaw added to the spot yaw. */
export interface Offset { side: number; fwd: number; up: number; yaw: number }
export interface Placement {
  spot: SpotId | null;          // logical spot (ActorDef.spot(); the goto actor rule matches this)
  at: SpotId | null;            // spot the model stands on (zhimei: zp1–zp4)
  chart?: ChartPos; chartYaw?: number;   // absolute override for the standing point (tudi at the incense burner)
  mode: PlaceMode;
  offset: Offset | null;        // visual offset (the actor root stays on the spot so smoke checks see it there)
  layer: ActorLayer;
  collide: boolean;
}

export interface ScheduleState {
  phase: Phase;
  has(f: FlagId): boolean;
  evalCond(c: Cond): boolean;
  zhimeiSpot: 0 | 1 | 2 | 3;
}

export const LIVING: ReadonlySet<NpcId> = new Set<NpcId>(['xiaolin', 'granny_wang', 'old_chen', 'xiaoliu']);
export const ZP: readonly SpotId[] = ['zp1', 'zp2', 'zp3', 'zp4'];

const OFFSETS: Partial<Record<string, Offset>> = {
  'meiqiu@pk_coop': { side: 0.85, fwd: 0.55, up: 0, yaw: 200 },
  'meiqiu@sp_estate_yard': { side: -0.55, fwd: 0.45, up: 0, yaw: 25 },
  'tudi@g6': { side: 0, fwd: 0, up: 0, yaw: 0 },          // P3r2: g6 is the rail post's top itself
  'zhimei@g3': { side: 0, fwd: 0, up: 0, yaw: 0 },
};
/** GDD §6.2 dusk: 土地 by the incense burner. P3r3 look L1: he stood behind the burner (r 2.6 / lon 141.5, 0.46 m tall)
 *  and from vp_temple_2011 his whole body projected inside the burner's silhouette, so the P4 payoff showed no spirit.
 *  He now stands ON the burner lid (world/layout TEMPLE.burner r 4.97 / lon 138.5, lid top h 4 + 0.805), on its front
 *  edge toward the viewpoint: in the middle of the 1× frame, in front of the idol, visible from every side. */
export const TUDI_DUSK: ChartPos = { r: 5.2, lon: 138.5, h: 4.81 };

/** Schedule spot before C's special cases (first matching override wins, then the phase entry). */
export function scheduleSpot(def: NpcDef, s: ScheduleState): SpotId | null {
  for (const o of def.overrides ?? []) if (s.evalCond(o.when)) return o.spot;
  return def.schedule[s.phase] ?? null;
}

export function resolvePlacement(def: NpcDef, s: ScheduleState, forced: SpotId | null | undefined): Placement {
  const id = def.id;
  const dawn = s.phase === 'dawn';
  const layer: ActorLayer = def.layer === 'ghost' && dawn ? 'world' : def.layer;
  const base: Placement = { spot: null, at: null, mode: 'hidden', offset: null, layer, collide: false };
  let spot = forced !== undefined ? forced : scheduleSpot(def, s);

  if (forced === undefined) {
    if (id === 'tudi') {
      // GDD §9 P4: 土地 appears only after P4_done; at night he rides the hero's left shoulder (GHOST, following)
      if (!dawn && !s.has('P4_done')) return base;
      if (s.phase === 'night') return { ...base, mode: 'shoulder', layer: 'ghost' };
      if (s.phase === 'dusk') return { ...base, spot, at: spot, chart: TUDI_DUSK, chartYaw: 180, mode: 'spot' };
    }
    if (id === 'attendant' && dawn && s.has('bus_arrived')) return { ...base, spot: 'sp_bus_door', at: 'sp_bus_door', mode: 'bus' };
    if (id === 'meiqiu' && dawn && spot === 'g4') return { ...base, spot, at: spot, mode: 'arms' };
  }
  if (!spot) return base;
  let at: SpotId = spot;
  if (id === 'zhimei' && spot === 'sp_paper_shop') at = ZP[s.zhimeiSpot] ?? 'zp1';
  // P3r3 look L2: the subway attendant is solid too — the P7 smoke ends on his spot, a player walked into him and the talk
  // camera then framed the back of the phone head instead of the uniform
  const collide = (LIVING.has(id) && !dawn) || (id === 'attendant' && at === 'sw_gantry');
  return { ...base, spot, at, mode: 'spot', offset: OFFSETS[`${id}@${at}`] ?? null, collide };
}
