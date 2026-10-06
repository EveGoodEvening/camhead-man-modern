// src/ui/hints.ts — owner E. Pure hint engine (GDD §13, ARCHITECTURE §3.E item 6): target selection, tiers, H spacing.
import type { BeatHintDef, Cond, FlagId, ObjectiveDef, ObjectiveId, PuzzleDef, StrKey } from '../types';

export const TIER_AT: readonly [number, number, number] = [90, 180, 300];   // seconds without progress → T1/T2/T3
export const MIN_GAP = 20;                                                   // seconds between two hints
export const NIGHT_HUBS: readonly string[] = ['P6_lighthouse_1987', 'P7_line_zero', 'P8_chai_to_zhe', 'P9_paper_eye'];

export interface HintTarget {
  id: string; availableWhen: Cond; steps: readonly FlagId[]; done: FlagId; hints: readonly [StrKey, StrKey, StrKey];
  /** P3r3 G5: step flag → lowest tier worth sending once it is set */
  floor?: Partial<Record<FlagId, 2 | 3>>;
}

export function hintTargets(puzzles: readonly PuzzleDef[], beats: readonly BeatHintDef[]): HintTarget[] {
  return [
    ...puzzles.map((p) => ({ id: p.id as string, availableWhen: p.availableWhen, steps: p.steps, done: p.solvedFlag, hints: p.hints, floor: p.hintFloor })),
    ...beats.map((b) => ({ id: b.id as string, availableWhen: b.availableWhen, steps: b.steps, done: b.doneFlag, hints: b.hints, floor: b.hintFloor })),
  ];
}

/** P3r3 G5: the lowest tier that still talks about an unfinished step (1 when no floor step is set). */
export function tierFloor(t: HintTarget | null, has: (f: FlagId) => boolean): 1 | 2 | 3 {
  let f: 1 | 2 | 3 = 1;
  if (!t?.floor) return f;
  for (const k in t.floor) {
    const v = t.floor[k as FlagId];
    if (v && v > f && has(k as FlagId)) f = v;
  }
  return f;
}

export interface TargetCtx {
  has(f: FlagId): boolean;
  evalCond(c: Cond | undefined): boolean;
  objective: ObjectiveId | null;
  objectives: readonly ObjectiveDef[];
  recent: string | null;               // last target with progress (rule 1)
  night: boolean;
  /** P3r3 G5: the puzzle 土地's smoke / the objective chip lead to right now (night hub only), so hints agree with them */
  smoke?: string | null;
}

function byId(targets: readonly HintTarget[], id: string | null | undefined): HintTarget | null {
  if (!id) return null;
  for (let i = 0; i < targets.length; i++) if (targets[i].id === id) return targets[i];
  return null;
}
function objectiveHintFor(c: TargetCtx): string | null {
  for (let i = 0; i < c.objectives.length; i++) if (c.objectives[i].id === c.objective) return c.objectives[i].hintFor ?? null;
  return null;
}

/** GDD §13 rules 1–3, first match wins. Polled every tick: no closures or arrays. */
export function currentTarget(targets: readonly HintTarget[], c: TargetCtx): HintTarget | null {
  const smoke = byId(targets, c.smoke);
  if (smoke && !c.has(smoke.done)) return smoke;                                      // 0. where the smoke leads
  const recent = byId(targets, c.recent);
  if (recent && !c.has(recent.done)) return recent;                                   // 1. last target with progress
  const forObj = byId(targets, objectiveHintFor(c));
  if (forObj && !c.has(forObj.done)) return forObj;                                   // 2. the current objective's target
  if (c.night) {                                                                       // 3. night hubs P6 → P9
    for (let i = 0; i < NIGHT_HUBS.length; i++) {
      const t = byId(targets, NIGHT_HUBS[i]);
      if (t && !c.has(t.done) && c.evalCond(t.availableWhen)) return t;
    }
  }
  return null;
}

/** The target (if any, unfinished) whose steps include `flag`. */
export function progressed(targets: readonly HintTarget[], flag: FlagId, has: (f: FlagId) => boolean): HintTarget | null {
  return targets.find((t) => !has(t.done) && t.steps.includes(flag)) ?? null;
}

export interface HintState {
  target: string | null;
  tier: 0 | 1 | 2 | 3;
  idle: number;                 // seconds without progress, counted only while not paused
  lastSentAt: number;           // sim time of the last hint
  queuedAt: number | null;      // a manual H that waits for the 20 s gap
}
export function newHintState(): HintState { return { target: null, tier: 0, idle: 0, lastSentAt: -1e9, queuedAt: null }; }

export function autoTier(idle: number): 0 | 1 | 2 | 3 {
  return idle >= TIER_AT[2] ? 3 : idle >= TIER_AT[1] ? 2 : idle >= TIER_AT[0] ? 1 : 0;
}

const nextTier = (t: HintState['tier']): 1 | 2 | 3 => (t >= 3 ? 3 : ((t + 1) as 1 | 2 | 3));

/** Progress on the current target: timer and tiers restart (GDD §13). */
export function onProgress(s: HintState): void { s.idle = 0; s.tier = 0; s.queuedAt = null; }

/** One tick. Returns the tier to send now (auto or a queued H), or null. */
export function hintTick(s: HintState, o: { dt: number; paused: boolean; now: number; target: string | null; floor?: 1 | 2 | 3 }): { tier: 1 | 2 | 3; auto: boolean } | null {
  if (o.target !== s.target) { s.target = o.target; s.tier = 0; s.idle = 0; s.queuedAt = null; }
  if (!s.target) return null;
  const floor = o.floor ?? 1;
  // P3r3 G5: the tiers below the floor talk about steps already done — skip them (the next H / auto hint = the floor)
  if (s.tier < floor - 1) s.tier = (floor - 1) as HintState['tier'];
  if (!o.paused) s.idle += o.dt;
  if (s.queuedAt !== null && o.now >= s.queuedAt && !o.paused) {
    s.queuedAt = null;
    s.tier = nextTier(s.tier); s.lastSentAt = o.now;
    return { tier: s.tier, auto: false };
  }
  const a0 = autoTier(s.idle);
  const a = a0 === 0 ? 0 : Math.min(3, a0 + floor - 1) as 1 | 2 | 3;
  if (!o.paused && a > s.tier) {
    s.tier = a; s.lastSentAt = o.now;
    return { tier: a as 1 | 2 | 3, auto: true };
  }
  return null;
}

/** H pressed: send the next tier now; inside the 20 s gap answer 'wait' at once (P3r3 G5: nothing is queued — a
 *  「土地正在输入…」 that resolved 15–40 s later read as a hung hint system). After T3, T3 again. */
export function hintRequest(s: HintState, now: number): { send: 1 | 2 | 3 } | 'wait' | 'none' {
  if (!s.target) return 'none';
  if (now - s.lastSentAt >= MIN_GAP) {
    s.queuedAt = null;
    s.tier = nextTier(s.tier); s.lastSentAt = now;
    return { send: s.tier };
  }
  return 'wait';
}
