// src/core/loop.ts — owner: S. FROZEN. Fixed phase order per tick; one render after the tick(s) (ARCHITECTURE §2.2).
import type { Bus } from '../events';
import type { LoopApi, SystemPhase } from '../contracts';
import type { MutableClock, SimTimers } from './clock';
import type { InputImpl } from './input';
import type { Log } from '../contracts';

export const PHASE_ORDER: readonly SystemPhase[] = ['input', 'logic', 'player', 'actors', 'world', 'lens', 'camera', 'ui', 'late'];

interface Sys { name: string; phase: SystemPhase; rank: number; seq: number; update: (dt: number) => void }

export interface LoopImpl extends LoopApi {
  /** One simulation tick (no render). */
  tick(dt: number): void;
  /** Render once (render.frame), even while paused. */
  render(dt: number): void;
  /** Realtime driver: call from setAnimationLoop with the clamped delta. */
  frame(dt: number): void;
  setRenderer(fn: (dt: number) => void): void;
  systems(): readonly { name: string; phase: SystemPhase }[];
}

export function createLoop(o: { clock: MutableClock; timers: SimTimers; input: InputImpl; bus: Bus; log: Log }): LoopImpl {
  const { clock, timers, input, bus, log } = o;
  let list: Sys[] = [];
  let seq = 0;
  let paused = false;
  let flushInput = false;
  let renderFn: (dt: number) => void = () => undefined;
  const failed = new Set<string>();

  const runSystems = (dt: number) => {
    for (const s of list) {
      try { s.update(dt); } catch (e) {
        // A throwing system must not kill the loop; report once per system (warn, never console.error).
        if (!failed.has(s.name)) { failed.add(s.name); log.warn(`[loop] system ${s.name} threw`, e); }
      }
    }
  };

  const api: LoopImpl = {
    get paused() { return paused; },
    addSystem(name, phase, update) {
      const sys: Sys = { name, phase, rank: PHASE_ORDER.indexOf(phase), seq: seq++, update };
      list = [...list, sys].sort((a, b) => a.rank - b.rank || a.seq - b.seq);
      return () => { list = list.filter((x) => x !== sys); };
    },
    tick(dt) {
      clock.advance(dt);
      if (flushInput) { flushInput = false; input.flush(); }
      input.begin();
      timers.poll();
      runSystems(dt);
      input.end();
    },
    render(dt) {
      try { renderFn(dt); } catch (e) { log.warn('[loop] render threw', e); }
    },
    frame(dt) {
      if (!paused) api.tick(dt);
      api.render(dt);
    },
    step(frames, dt) {
      const n = Math.max(0, Math.floor(frames));
      if (!paused) for (let i = 0; i < n; i++) api.tick(dt);
      api.render(dt);
    },
    advance(seconds) {
      const n = Math.max(0, Math.round(seconds * 60));
      for (let i = 0; i < n; i++) api.tick(1 / 60);
    },
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      // No tick reads input while paused. Drop what piled up (menu clicks, E presses, mouse drags) at the next tick so
      // resuming neither re-fires stale edges (e.g. the Esc that closed the pause menu) nor jumps the camera.
      flushInput = true;
      bus.emit('paused', { on: p });
    },
    setRenderer(fn) { renderFn = fn; },
    systems: () => list.map((s) => ({ name: s.name, phase: s.phase })),
  };
  return api;
}
