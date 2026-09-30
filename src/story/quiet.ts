// src/story/quiet.ts — owner F. Quiet application of story actions (solve(), ?skipTitle, bootChapter) — ARCHITECTURE
// §2.8.9 "quiet: state only, no cards, beats, waits, typing".
//
// The core rules engine always fires rules loudly, even when the flag that satisfied them was set by a quiet run. So
// while quiet actions run, the story rules are unloaded (rules.loadStory([])) and this module is the rules engine: after
// every state change it walks the condition rules in table order, sets the ones that hold and applies their effects
// quietly (depth first, like the engine's synchronous run). Everything here is synchronous, so a later __game call in
// the same page.evaluate already sees the result (AGENTS.md [S-verify]). Reloading the rules re-evaluates once more.
import type { Core } from '../contracts';
import type { Action, BeatId, Cond, StoryRule, WxId } from '../types';
import { BEATS, STORY_RULES } from '../data/story';
import { NODES } from '../data/dialogue';

const COND_RULES: readonly StoryRule[] = STORY_RULES.filter((r) => !('event' in r.when));
const MAX_PASSES = 64;

export interface Quiet {
  /** Apply actions quietly (synchronous). Rules fired meanwhile run their effects quietly too. */
  apply(actions: readonly Action[]): void;
  /** Run `fn` with the story rules unloaded, then mark every condition rule that now holds as fired without running
   *  its effects (boot states already contain them). Returns the wx ids those rules would have pushed. */
  withRulesMarked(fn: () => void): WxId[];
  readonly depth: number;
}

export function beatEnd(id: BeatId): readonly Action[] {
  return BEATS.find((b) => b.id === id)?.end ?? [];
}

export function createQuiet(core: Core): Quiet {
  const { store, rules, log } = core;
  let depth = 0;

  const safe = (what: string, fn: () => unknown) => {
    try { const r = fn(); if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch((e: unknown) => log.warn(`[story] ${what}`, e)); }
    catch (e) { log.warn(`[story] ${what} failed`, e); }
  };

  const holds = (c: Cond | undefined) => rules.evalCond(c);

  /** Fire every condition rule that holds (quietly), until nothing changes. */
  const settle = () => {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let fired = false;
      for (const r of COND_RULES) {
        if (store.has(r.flag)) continue;
        if (holds(r.when as Cond) && holds(r.guard)) {
          store.set(r.flag);
          run(r.effects);
          fired = true;
        }
      }
      if (!fired) return;
    }
    log.warn('[story] quiet rules did not settle');
  };

  const applyOne = (a: Action): void => {
    if ('set' in a) { store.set(a.set); settle(); }
    else if ('give' in a) { store.give(a.give); settle(); }
    else if ('take' in a) { store.take(a.take); settle(); }
    else if ('verb' in a) store.unlockVerb(a.verb);
    else if ('clue' in a) store.addClue(a.clue);
    else if ('objective' in a) store.setObjective(a.objective);
    else if ('setClock' in a) store.setClock(a.setClock);
    else if ('chapter' in a) { store.setChapter({ chapter: a.chapter, phase: a.phase, palette: a.palette, clock: a.clock }, true); settle(); }
    else if ('teleport' in a) safe('teleport', () => core.player.goto(a.teleport, { fade: false }));
    else if ('photo' in a) safe('photo', () => core.services.lens.renderPreset(a.photo));
    else if ('wx' in a) safe('wx', () => core.services.ui.pushWx(a.wx, { quiet: true }));
    else if ('node' in a) {
      const n = NODES.find((x) => x.id === a.node);
      if (n?.once) store.set(`seen:${n.id}`);
      if (n?.effects) run(n.effects);
    } else if ('beat' in a) {
      store.set(`seen:beat.${a.beat}`);
      run(beatEnd(a.beat));
    }
    // card, sfx, uncanny, wait, toast, ui, memo, pose, detach: presentation only
  };

  const run = (actions: readonly Action[]) => { for (const a of actions) applyOne(a); };

  const unloaded = <T>(fn: () => T): T => {
    const top = depth === 0;
    if (top) rules.loadStory([]);
    depth++;
    try { return fn(); } finally {
      depth--;
      if (top) rules.loadStory(STORY_RULES);
    }
  };

  const wxOf = (acts: readonly Action[], out: WxId[]) => {
    for (const a of acts) {
      if ('wx' in a) out.push(a.wx);
      else if ('beat' in a) wxOf(beatEnd(a.beat), out);
    }
  };

  return {
    apply(actions) { unloaded(() => { run(actions); settle(); }); },
    withRulesMarked(fn) {
      const wx: WxId[] = [];
      unloaded(() => {
        fn();
        for (let pass = 0; pass < MAX_PASSES; pass++) {
          let marked = false;
          for (const r of COND_RULES) {
            if (store.has(r.flag) || !holds(r.when as Cond) || !holds(r.guard)) continue;
            store.set(r.flag);
            wxOf(r.effects, wx);
            marked = true;
          }
          if (!marked) break;
        }
      });
      return wx;
    },
    get depth() { return depth; },
  };
}
