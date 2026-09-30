// src/core/coreActions.ts — owner: S. FROZEN. The core-owned action handlers (ARCHITECTURE §2.8.9 table).
import type { Core } from '../contracts';
import type { SimTimers } from './clock';

export function registerCoreActions(core: Core, timers: SimTimers): void {
  const { rules, store, bus } = core;
  rules.onAction('set', (a) => { store.set(a.set); });
  rules.onAction('give', (a) => { store.give(a.give); });
  rules.onAction('take', (a) => { store.take(a.take); });
  rules.onAction('verb', (a) => { store.unlockVerb(a.verb); });
  rules.onAction('clue', (a) => { store.addClue(a.clue); });
  rules.onAction('objective', (a) => { store.setObjective(a.objective); });
  rules.onAction('setClock', (a) => { store.setClock(a.setClock); });
  rules.onAction('teleport', (a, ctx) => core.player.goto(a.teleport, { fade: !ctx.quiet }));
  rules.onAction('chapter', (a, ctx) => {
    store.setChapter({ chapter: a.chapter, phase: a.phase, palette: a.palette, clock: a.clock }, ctx.quiet);
  });
  rules.onAction('pose', (a) => { core.player.setPose(a.pose); });
  rules.onAction('wait', (a, ctx) => (ctx.quiet ? undefined : timers.after(a.wait)));
  rules.onAction('sfx', (a, ctx) => { if (!ctx.quiet) bus.emit('sfx', { id: a.sfx }); });
  rules.onAction('uncanny', (a, ctx) => { if (!ctx.quiet) bus.emit('uncanny', { id: a.uncanny }); });
}
