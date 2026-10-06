// src/core/rules.ts — owner: S. FROZEN. Cond evaluation, the action runner and story rules (ARCHITECTURE §2.8.9).
import type { Bus, GameEvents } from '../events';
import type { ActionCtx, ActionHandler, ActionKind, Log, RulesApi, StoreApi } from '../contracts';
import type { Action, Cond, SceneId, StoryRule } from '../types';

export const ACTION_KINDS: readonly ActionKind[] = [
  'set', 'give', 'take', 'verb', 'clue', 'beat', 'wx', 'objective', 'teleport', 'chapter', 'photo', 'memo', 'uncanny',
  'ui', 'node', 'card', 'sfx', 'wait', 'toast', 'pose', 'detach', 'setClock',
];
/** Condition rules are re-evaluated after these events (§2.8.9 list + the two lens events that Cond.lens depends on). */
export const REEVAL_EVENTS: readonly (keyof GameEvents)[] = [
  'flagSet', 'itemGained', 'phaseChanged', 'photoTaken', 'sceneChanged', 'bestiaryAdded', 'stateLoaded',
  // Cond.lens ('night' / 'plain') reads the lens: without these a lens-gated condition rule waits for an unrelated event
  'lensChanged', 'viewfinder',
];
const MAX_PASSES = 64;

export function actionKind(a: Action): ActionKind | null {
  for (const k of ACTION_KINDS) if (k in a) return k;
  return null;
}

type AnyHandler = (a: Action, ctx: ActionCtx) => void | Promise<void>;

function isPromise(v: unknown): v is Promise<void> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

export interface RulesDeps {
  store: StoreApi; bus: Bus; log: Log;
  activeScene: () => SceneId;
  nightView: () => boolean;                  // services.lens.isNightView(), false until lens exists
}

export interface RulesImpl extends RulesApi {
  /** Force a condition-rule pass (after loadStory, or by tests). */
  evaluate(): void;
  hasHandler(kind: ActionKind): boolean;
}

export function createRules(d: RulesDeps): RulesImpl {
  const { store, bus, log } = d;
  const handlers = new Map<ActionKind, AnyHandler>();
  const warned = new Set<string>();
  let pending = 0;
  let condRules: StoryRule[] = [];
  let evaluating = false, dirty = false;
  const offs: (() => void)[] = [];

  const evalCond = (c: Cond | undefined): boolean => {
    if (!c) return true;
    if (c.phase && c.phase.length && !c.phase.includes(store.state.phase)) return false;
    if (c.all && !c.all.every((f) => store.has(f))) return false;
    if (c.none && c.none.some((f) => store.has(f))) return false;
    if (c.any && c.any.length && !c.any.some((f) => store.has(f))) return false;
    if (c.items && !c.items.every((i) => store.hasItem(i))) return false;
    if (c.tags && c.tags.length && !store.state.photos.some((p) => p.tags.some((t) => c.tags!.includes(t)))) return false;
    if (c.lens === 'night' && !d.nightView()) return false;
    if (c.lens === 'plain' && d.nightView()) return false;
    if (c.scene && c.scene !== d.activeScene()) return false;
    return true;
  };

  const exec = (a: Action, ctx: ActionCtx): void | Promise<void> => {
    const k = actionKind(a);
    if (!k) { log.warn('[rules] unknown action', a); return; }
    const h = handlers.get(k);
    if (!h) {
      if (!warned.has(k)) { warned.add(k); log.warn(`[rules] no handler for action kind '${k}'`); }
      return;
    }
    try { return h(a, ctx); } catch (e) { log.warn(`[rules] handler '${k}' threw`, e); }
  };

  const fire = (r: StoryRule) => {
    store.set(r.flag);
    void api.run(r.effects, `rule:${r.flag}`);
  };

  const api: RulesImpl = {
    evalCond,
    run(actions, source, o) {
      const ctx: ActionCtx = { source, quiet: !!o?.quiet };
      pending++;
      let i = 0;
      const done = () => { pending--; };
      const cont = (): Promise<void> | void => {
        while (i < actions.length) {
          const r = exec(actions[i++], ctx);
          if (isPromise(r)) {
            return r.then(cont, (e: unknown) => { log.warn(`[rules] action failed in ${source}`, e); return cont(); });
          }
        }
      };
      let r: Promise<void> | void;
      try { r = cont(); } catch (e) { done(); log.warn(`[rules] run failed in ${source}`, e); return Promise.resolve(); }
      if (isPromise(r)) return r.then(done, (e: unknown) => { done(); log.warn(`[rules] run failed in ${source}`, e); });
      done();
      return Promise.resolve();
    },
    onAction<K extends ActionKind>(kind: K, h: ActionHandler<K>) {
      if (handlers.has(kind)) log.warn(`[rules] handler for '${kind}' replaced`);
      handlers.set(kind, h as unknown as AnyHandler);
    },
    loadStory(rules) {
      for (const off of offs) off();
      offs.length = 0;
      condRules = [];
      for (const r of rules) {
        const w = r.when;
        if ('event' in w) {
          const ev = w.event;
          const match = w.match;
          offs.push(bus.on(ev, (payload: unknown) => {
            if (store.has(r.flag) || !evalCond(r.guard)) return;
            if (match) {
              const p = (payload ?? {}) as Record<string, unknown>;
              for (const key of Object.keys(match)) if (p[key] !== match[key]) return;
            }
            fire(r);
          }));
        } else {
          condRules.push(r);
        }
      }
      for (const ev of REEVAL_EVENTS) offs.push(bus.on(ev, () => api.evaluate()));
      api.evaluate();
    },
    evaluate() {
      if (evaluating) { dirty = true; return; }
      evaluating = true;
      try {
        let passes = 0;
        do {
          dirty = false;
          for (const r of condRules) {
            if (store.has(r.flag)) continue;
            const w = r.when as Cond;
            if (evalCond(w) && evalCond(r.guard)) { fire(r); dirty = true; }
          }
          passes++;
        } while (dirty && passes < MAX_PASSES);
        if (dirty) log.warn('[rules] condition rules did not settle in 64 passes');
      } finally { evaluating = false; dirty = false; }
    },
    pending: () => pending,
    hasHandler: (k) => handlers.has(k),
  };
  return api;
}
