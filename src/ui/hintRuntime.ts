// src/ui/hintRuntime.ts — owner E. Wires the pure hint engine (hints.ts) to the game: current target, progress from
// flagSet, auto tiers on sim time, H requests, delivery as 土地 wx text (GDD §13).
import type { UiCtx } from './ctx';
import type { Tutorials } from './hud/tutorial';
import type { WxRuntime } from './wx';
import { BEAT_HINTS, PUZZLES } from '../data/puzzles';
import { OBJECTIVES, SMOKE_PUZZLE } from '../data/story';
import { currentTarget, hintRequest, hintTargets, hintTick, newHintState, onProgress, progressed, tierFloor, type HintTarget, type TargetCtx } from './hints';

export interface HintRuntime { update(dt: number, paused: boolean): void; request(): void }

export function createHintRuntime(ctx: UiCtx, wx: WxRuntime, tuts: Tutorials): HintRuntime {
  const { core } = ctx;
  const targets = hintTargets(PUZZLES, BEAT_HINTS);
  const s = newHintState();
  let recent: string | null = null;

  // one context object, refreshed in place every tick (no per-tick closures)
  const tctx: TargetCtx = {
    has: (f) => core.store.has(f), evalCond: (c) => core.rules.evalCond(c), objective: null, objectives: OBJECTIVES, recent: null, night: false,
  };
  const hasFlag = (f: Parameters<typeof core.store.has>[0]) => core.store.has(f);
  /** P3r3 G5: at the night hub (an objective without its own hintFor) the hint follows the smoke / chip step. */
  let smokeAt = -1, smokeId: string | null = null;
  const smokePuzzle = (): string | null => {
    const obj = OBJECTIVES.find((o) => o.id === core.store.state.objective);
    if (!obj || obj.hintFor) return null;
    if (core.clock.frame - smokeAt < 15 && smokeAt >= 0) return smokeId;
    smokeAt = core.clock.frame;
    let spot: string | null = null;
    try { spot = core.services.story.smokeStep?.({ textOnly: true })?.spot ?? null; } catch { spot = null; }
    smokeId = spot ? SMOKE_PUZZLE[spot as keyof typeof SMOKE_PUZZLE] ?? null : null;
    return smokeId;
  };
  const target = (): HintTarget | null => {
    tctx.objective = core.store.state.objective; tctx.recent = recent; tctx.night = core.store.state.phase === 'night';
    tctx.smoke = smokePuzzle();
    return currentTarget(targets, tctx);
  };
  const persist = () => core.store.setHint({ target: s.target, tier: s.tier, idleSince: s.idle, lastSentAt: s.lastSentAt });
  const send = (tg: HintTarget, tier: 1 | 2 | 3, auto: boolean) => {
    wx.pushHint(tg.hints[tier - 1]);
    core.bus.emit('hint', { target: tg.id, tier });
    persist();
    if (auto && tier === 1) tuts.trigger('tut_hint');
  };

  core.bus.on('flagSet', (e) => {
    const tg = progressed(targets, e.flag, (f) => core.store.has(f));
    if (!tg) return;
    recent = tg.id;
    if (tg.id === s.target) { onProgress(s); persist(); }
  });
  core.bus.on('stateLoaded', () => {
    const h = core.store.state.hint;
    recent = null;
    s.target = h.target; s.tier = h.tier; s.idle = Number.isFinite(h.idleSince) ? Math.max(0, h.idleSince) : 0;
    s.lastSentAt = -1e9; s.queuedAt = null;
  });

  return {
    update(dt, paused) {
      const tg = target();
      const r = hintTick(s, { dt, paused, now: core.clock.t, target: tg?.id ?? null, floor: tierFloor(tg, hasFlag) });
      if (r && tg) send(tg, r.tier, r.auto);
    },
    request() {
      tuts.done('tut_hint');
      const tg = target();
      hintTick(s, { dt: 0, paused: true, now: core.clock.t, target: tg?.id ?? null, floor: tierFloor(tg, hasFlag) });
      const r = hintRequest(s, core.clock.t);
      if (r === 'none' || !tg) { wx.pushHint('ui.hint.none'); return; }
      // P3r3 G5: an H inside the 20 s gap gets an answer at once instead of a typing toast that resolved much later
      if (r === 'wait') { ctx.toast('ui.hint.wait', undefined, 'wx'); return; }
      send(tg, r.send, false);
    },
  };
}
