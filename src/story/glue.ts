// src/story/glue.ts — owner F. ARCHITECTURE §3.F "glue.ts": registers every INTERACTS row and every ZONE, emits
// puzzleSolved + the puzzle clocks, triggers the darkroom reveal, and holds the only special-case code (the gantry).
import { Vector3 } from 'three';
import type { Core, InteractableDef, Pos } from '../contracts';
import type { FlagId, InteractDef, InteractId, PuzzleDef, SceneId, WorldAnchorId } from '../types';
import { INTERACTS } from '../data/interacts';
import { PUZZLES } from '../data/puzzles';
import { ZONES } from '../data/story';
import { pickInteractable, DEFAULT_RADIUS, type PickItem } from '../core/interact';
import { SURFACES, frameAt, headingToDir, posToWorld } from '../core/planet';
import { nightClock } from './smoke';
import { DLG } from '../data/zh';

/** GDD §9 P2: the SMS arrives on the back screen (the toast + memo clue carry the short form). */
const SMS_SCREEN: Partial<Record<FlagId, 'sms.garbled' | 'sms.full'>> = { locker_seen: 'sms.garbled', sms_full: 'sms.full' };
const SMS_SECONDS = 9;

/** Seconds of sim time an unfinished interact run keeps its row disabled (P3 G4). */
const RUN_GUARD = 8;

/** P3r3 G1: the object in front of a stand spot — `ahead` m along its yaw, `lift` m up (reach + prompt label on it). */
export function objectAnchor(scene: SceneId, pos: Pos, yaw: number, ahead: number, lift: number, out = new Vector3()): Vector3 {
  posToWorld(scene, pos, out);
  const f = frameAt(SURFACES[scene], out);
  const dir = headingToDir(f, yaw, new Vector3());
  return out.addScaledVector(dir, ahead).addScaledVector(f.up, lift);
}

/** P3r3 G1: an object anchored ahead of its stand spot (a door, a box) counts from any facing within this distance. */
export const OBJECT_NEAR_FREE = 0.9;

interface Reg { def: InteractDef; scene: SceneId; at: Pos | (() => Vector3); radius: number }

export interface Glue {
  init(): void;
  /** Run the enabled INTERACTS row with this id (tests, dev tools); resolves when its node/actions finish. */
  interactById(id: InteractId): Promise<void>;
  /** Re-arm after a chapter boot / reset. */
  reset(): void;
}

export function createGlue(core: Core, o: { playBeat: (id: 'S_darkroom') => Promise<void>; finishCredits: () => void }): Glue {
  const { store, rules, bus, log } = core;
  const regs: Reg[] = [];
  const byId = new Map<InteractId, Reg[]>();
  const solvedBy = new Map<FlagId, PuzzleDef>(PUZZLES.map((p) => [p.solvedFlag, p]));
  const feet = new Vector3(), up = new Vector3(), facing = new Vector3(), tmp = new Vector3();
  let revealing = false;
  /** P3 G4: rows whose run is still in flight (e.g. it_lh_switch's {wait:2} before frame ③) are disabled, so a second
   *  E cannot replay their toast/sfx/uncanny pulse. Kept in memory only: a save never lands mid-run. A run that never
   *  settles (a presentation promise dropped by closeAll) stops blocking its row after RUN_GUARD s of sim time. */
  const running = new Map<InteractId, number>();
  const inFlight = (id: InteractId) => { const t0 = running.get(id); return t0 !== undefined && core.clock.t - t0 < RUN_GUARD; };

  const svc = () => core.services;
  const peek = () => { try { return svc().lens.state.peek; } catch { return null; } };
  const enabled = (r: Reg) => {
    if (inFlight(r.def.id)) return false;
    const p = peek();
    if (r.def.peek ? p !== r.def.peek : p !== null) return false;
    return rules.evalCond(r.def.when);
  };

  const anchorFn = (id: WorldAnchorId, fallback: Vector3): { scene: SceneId; at: () => Vector3 } => {
    let scene: SceneId = 'planet';
    const v = fallback.clone();
    try {
      const a = svc().world.anchor(id);
      scene = a.scene;
      v.copy(a.pos);
    } catch (e) { log.warn(`[story] anchor ${id} unavailable`, e); }
    return { scene, at: () => v };
  };

  const resolve = (def: InteractDef): { scene: SceneId; at: Pos | (() => Vector3) } => {
    const s = def.spot;
    if (typeof s === 'string') {
      try {
        const sp = svc().world.spot(s);
        if (def.ahead !== undefined) {
          const v = objectAnchor(sp.scene, sp.pos, sp.yaw ?? 0, def.ahead, def.lift ?? 1);
          return { scene: sp.scene, at: () => v };
        }
        return { scene: sp.scene, at: sp.pos };
      }
      catch { return { scene: def.scene ?? 'planet', at: { r: 0, lon: 0 } }; }
    }
    if ('world' in s) return anchorFn(s.world, new Vector3());
    return { scene: def.scene ?? ('r' in s ? 'planet' : 'studio_int'), at: s };
  };

  const posOf = (r: Reg, out: Vector3): Vector3 => (typeof r.at === 'function' ? out.copy(r.at()) : posToWorld(r.scene, r.at, out));

  // ---------------------------------------------------------------- the one special case (GDD §9 P7 step 4)
  const gantry = async () => {
    const yaw = core.player.yawDeg() + 180;
    core.player.setYaw(yaw);                                   // he turns his back to the gantry
    core.cameraRig.look(yaw, 0);
    try { svc().chars.hero.setScreen('ridecode', { seconds: 2.5 }); } catch (e) { log.warn('[story] ridecode screen', e); }
    const at0 = core.player.pos(new Vector3());
    await rules.run([{ toast: 'sys.gantry_back' }, { sfx: 'sfx_scan' }, { set: 'gantry_open' }, { toast: 'sys.gantry_ok' }, { wait: 1.2 }], 'it:gantry');
    // P3r3 look L2: after the 「嘀——」 he turns back round to the open lane and the platform (east, interior yaw 90) and
    // the follow camera eases in behind him (it was left looking west at the exit, the hero dithered against the gantry)
    if (core.player.scene === 'subway_int' && core.input.context() === 'gameplay' && core.player.pos(new Vector3()).distanceTo(at0) < 0.3) {
      core.cameraRig.blend?.(0.8);
      core.player.setYaw(90);
      core.cameraRig.look(90, 0);
    }
  };

  const runRow = async (def: InteractDef): Promise<void> => {
    if (def.id === 'it_gantry' && store.has('name_known') && !store.has('gantry_open')) return gantry();
    const ui = svc().ui;
    if (def.node) await ui.startNode(def.node);
    if (def.talkAs) await ui.talk(def.talkAs);
    else if (!def.node && !def.actions) await ui.talk(def.id);
    if (def.actions) await rules.run(def.actions, `it:${def.id}`);
  };
  const run = async (def: InteractDef): Promise<void> => {
    if (inFlight(def.id)) return;
    const t0 = core.clock.t;
    running.set(def.id, t0);
    try { await runRow(def); } finally { if (running.get(def.id) === t0) running.delete(def.id); }
  };

  /** Stale-pick guard: core picks on ticks, a debug goto+interact in one call can hand us a row we're no longer at. */
  const fresh = (r: Reg): Reg | null => {
    if (r.scene === core.player.scene && enabled(r)) {
      core.player.pos(feet); core.player.up(up);
      const d = posOf(r, tmp).distanceTo(feet.addScaledVector(up, 1));
      if (d <= r.radius + 0.75) return r;
    }
    core.player.pos(feet); core.player.up(up); core.player.facing(facing);
    const cand = regs.filter((x) => x.scene === core.player.scene && enabled(x));
    const items: PickItem[] = cand.map((x) => ({
      pos: posOf(x, new Vector3()), radius: x.radius, priority: x.def.priority ?? 0, ignoreFacing: false,
      nearFree: x.def.ahead !== undefined ? OBJECT_NEAR_FREE : undefined,
    }));
    const i = pickInteractable(items, feet, up, facing);
    return i >= 0 ? cand[i] : null;
  };

  const darkroomPoll = () => {
    if (revealing || !store.has('dk_hung') || store.has('developed') || core.player.scene !== 'studio_int') return;
    // GDD S_darkroom step 4: viewfinder on, in the darkroom within 4 m of dk_line. The range test is the lens's own
    // (LensApi.darkroomInRange), so the beat can never start where the reveal would not (P3 G1 soft-lock).
    let ready = false;
    try { const lens = svc().lens; ready = lens.state.active && !lens.state.peek && (lens.darkroomInRange?.() ?? false); }
    catch { ready = false; }
    if (!ready) return;
    revealing = true;                           // S_darkroom itself awaits lens.darkroomReveal() (beats.ts)
    void o.playBeat('S_darkroom').finally(() => { revealing = false; });
  };

  return {
    init() {
      // flag listeners first: they must see a flag before the rules fire its effects (clock before chapter changes)
      bus.on('flagSet', ({ flag }) => {
        const p = solvedBy.get(flag);
        if (p) {
          bus.emit('puzzleSolved', { id: p.id });
          store.setClock(p.clockAfter || nightClock(store.state.clock));
        }
        if (flag === 'credits_done') o.finishCredits();
        const sms = SMS_SCREEN[flag];
        if (sms) {
          try { svc().chars.hero.setScreen('typing', { text: (DLG[sms] ?? []).map((l) => l[1]).join(''), seconds: SMS_SECONDS }); }
          catch (e) { log.warn('[story] sms screen', e); }
        }
      });
      // GDD §9 S_group_photo step 8: the bus rolls in while granny and 老陈 speak
      bus.on('dialogueEnd', ({ node }) => {
        // P3r3 G12: her photo request follows her first lines when the player already knows about the temple (it used
        // to need a second E, and 「去山上的庙？」 then answered nothing)
        if (node === 'granny.first' && store.state.phase === 'day' && store.has('film_at_tudi')
          && !store.has('granny_asked_photo') && !store.has('P3_done')) {
          try { void svc().ui.startNode('granny.ask_photo'); } catch (e) { log.warn('[story] granny.ask_photo', e); }
          return;
        }
        if (node !== 'granny.group_after') return;
        try { void svc().chars.busZero.arrive(4); } catch (e) { log.warn('[story] busZero.arrive', e); }
      });
      for (const def of INTERACTS) {
        const { scene, at } = resolve(def);
        const reg: Reg = { def, scene, at, radius: def.range ?? DEFAULT_RADIUS };
        regs.push(reg);
        const list = byId.get(def.id) ?? [];
        list.push(reg);
        byId.set(def.id, list);
        const d: InteractableDef = {
          id: def.id, scene, at, radius: reg.radius, prompt: def.prompt, priority: def.priority ?? 0,
          ...(def.ahead !== undefined ? { nearFree: OBJECT_NEAR_FREE } : {}),
          enabled: () => enabled(reg),
          onInteract: () => { const r = fresh(reg); return r ? run(r.def) : undefined; },
        };
        if (def.promptKey) d.promptKey = def.promptKey;
        try { core.interact.registerInteractable(d); } catch (e) { log.warn(`[story] interact ${def.id}`, e); }
      }
      for (const z of ZONES) {
        try { core.physics.registerZone(z); } catch (e) { log.warn(`[story] zone ${z.id}`, e); }
      }
      core.loop.addSystem('story:darkroom', 'logic', darkroomPoll);
    },
    async interactById(id) {
      const r = (byId.get(id) ?? []).find(enabled);
      if (!r) { log.warn(`[story] interactById: no enabled row for ${id}`); return; }
      bus.emit('interact', { id });
      await run(r.def);
    },
    reset() { revealing = false; running.clear(); },
  };
}
