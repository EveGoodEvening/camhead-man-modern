// src/core/interact.ts — owner: S. FROZEN. Interactable registry + per-tick picking (ARCHITECTURE §2.8.6).
// Priority is compared before distance; then the lowest d·(2 − cos) inside ±60° of the body facing.
// Phase 2 (I): picking also runs in the `peek` context (only peek-bound interacts are enabled there, via F's
// `enabled()`), and `repick()` refreshes the pick on demand (__game.interact() after a goto; D's lh_door peek).
import { Vector3 } from 'three';
import type { Core, Handle, InteractApi, InteractableDef } from '../contracts';
import type { PromptVerb, StrKey } from '../types';
import { posToWorld } from './planet';
import type { PlayerImpl } from './player';
import type { PhysicsImpl } from './physics';

export const DEFAULT_RADIUS = 2.5;
export const CONE_COS = Math.cos(Math.PI / 3);
const CHEST = 1.0;

export interface PickItem { pos: Vector3; radius: number; priority: number; ignoreFacing: boolean; nearFree?: number }
/** Horizontal distance under which the facing cone is skipped (anchors at the feet / right in front). */
export const NEAR_FREE = 0.3;

const _d = new Vector3(), _t = new Vector3(), _c = new Vector3();

/** Pure picker (tests): returns the index of the best item or −1. `chest` = feet + up·1. */
export function pickInteractable(items: readonly PickItem[], feet: Vector3, up: Vector3, facing: Vector3): number {
  let best = -1, bestPrio = -Infinity, bestScore = Infinity;
  const chest = _c.copy(feet).addScaledVector(up, CHEST);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const d = chest.distanceTo(it.pos);
    if (d > it.radius) continue;
    _d.copy(it.pos).sub(feet);
    _t.copy(_d).addScaledVector(up, -_d.dot(up));
    const horiz = _t.length();
    const cos = horiz < (it.nearFree ?? NEAR_FREE) ? 1 : _t.divideScalar(horiz).dot(facing);
    if (!it.ignoreFacing && cos < CONE_COS) continue;
    const score = d * (2 - cos);
    if (it.priority > bestPrio || (it.priority === bestPrio && score < bestScore)) {
      best = i; bestPrio = it.priority; bestScore = score;
    }
  }
  return best;
}

interface Rec { def: InteractableDef; handle: Handle; pos: Vector3 }

/** P3r2 G4: collider tags that block the reach from the chest to an anchor (interior walls and partitions; world
 *  interiors tag them so). Without it the darkroom bench / trays were usable through the studio partition. */
export const SIGHT_TAGS: ReadonlySet<string> = new Set(['wall', 'part']);
/** The reach test stops this short of the anchor: things mounted on a wall may sit inside its collider. */
export const SIGHT_END_SLACK = 0.25;

/** Input contexts in which interactables are picked (GDD §4: E 常规; the lh_door peek's switch). */
export const PICK_CONTEXTS: readonly string[] = ['gameplay', 'peek'];

export interface InteractImpl extends InteractApi {
  update(): void;
  list(): readonly InteractableDef[];
}

export function createInteract(core: Core, player: PlayerImpl, physics?: Pick<PhysicsImpl, 'sightBlocked'>): InteractImpl {
  const recs = new Set<Rec>();
  let current: Rec | null = null;
  const items: PickItem[] = [];
  const cand: Rec[] = [];
  const feet = new Vector3(), up = new Vector3(), facing = new Vector3(), chest = new Vector3(), reachEnd = new Vector3();
  /** True when a wall / partition stands between the chest and an in-range anchor (G4). */
  const occluded = (scene: Rec['def']['scene'], anchor: Vector3, radius: number): boolean => {
    if (!physics) return false;
    const d = chest.distanceTo(anchor);
    if (d > radius || d <= SIGHT_END_SLACK) return false;
    reachEnd.copy(anchor).sub(chest).multiplyScalar((d - SIGHT_END_SLACK) / d).add(chest);
    try { return physics.sightBlocked(scene, chest, reachEnd, SIGHT_TAGS); } catch { return false; }
  };

  const anchorOf = (r: Rec): Vector3 => {
    const at = r.def.at;
    if (typeof at === 'function') return r.pos.copy(at());
    return posToWorld(r.def.scene, at, r.pos);
  };
  const setCurrent = (r: Rec | null) => {
    if (r === current) return;
    current = r;
    core.bus.emit('promptChanged', {
      id: r ? r.def.id : null, verb: r ? r.def.prompt : null, promptKey: r ? r.def.promptKey ?? null : null,
    });
  };

  const api: InteractImpl = {
    registerInteractable(def) {
      const rec: Rec = {
        def, pos: new Vector3(),
        handle: { enabled: true, remove: () => { recs.delete(rec); if (current === rec) setCurrent(null); } },
      };
      recs.add(rec);
      return rec.handle;
    },
    current() {
      if (!current) return null;
      return {
        id: current.def.id, prompt: current.def.prompt as PromptVerb,
        promptKey: (current.def.promptKey ?? null) as StrKey | null, anchor: current.pos.clone(),
      };
    },
    async trigger() {
      const r = current;
      if (!r) return;
      core.bus.emit('interact', { id: r.def.id });
      try { await r.def.onInteract(); } catch (e) { core.log.warn(`[interact] ${r.def.id} threw`, e); }
    },
    repick() {
      if (!PICK_CONTEXTS.includes(core.input.context()) || player.pose === 'sit') { setCurrent(null); return; }
      player.pos(feet); player.up(up); player.facing(facing);
      chest.copy(feet).addScaledVector(up, CHEST);
      items.length = 0; cand.length = 0;
      for (const r of recs) {
        if (!r.handle.enabled || r.def.scene !== player.scene) continue;
        let ok = true;
        try { ok = r.def.enabled ? r.def.enabled() : true; } catch { ok = false; }
        if (!ok) continue;
        const pos = anchorOf(r), radius = r.def.radius ?? DEFAULT_RADIUS;
        if (occluded(r.def.scene, pos, radius)) continue;
        items.push({ pos, radius, priority: r.def.priority ?? 0, ignoreFacing: !!r.def.ignoreFacing, nearFree: r.def.nearFree });
        cand.push(r);
      }
      const i = pickInteractable(items, feet, up, facing);
      setCurrent(i >= 0 ? cand[i] : null);
    },
    update() {
      api.repick();
      if (core.input.pressed('interact') && current) void api.trigger();
    },
    list: () => [...recs].map((r) => r.def),
  };
  return api;
}
