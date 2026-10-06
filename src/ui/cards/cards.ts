// src/ui/cards/cards.ts — owner E. Card engine: FIFO queue, sim-time updates, cardShown/cardClosed, skip(). While a card
// is up the input context is 'cutscene' (movement locked, pointer lock kept) and E / Space / Esc / click go to the card.
import type { InputApi } from '../../contracts';
import type { CardKind } from '../../types';
import type { UiCtx } from '../ctx';
import { makeCard, noteCard, type CardView } from './views';

interface Job { kind: CardKind | 'note'; id: string; make: () => CardView; resolve: () => void; promise: Promise<void> }

/** P3r3 U4: a player who is still mashing Space from the dialogue before must not skip the literary cards. For GRACE
 *  seconds after a card shows every key is ignored; once its whole text is on screen (typed out, or completed by a
 *  key), a close needs READ more seconds. The press that completes a reveal counts as soon as GRACE is over. */
export const CARD_GRACE: Readonly<Record<CardKind | 'note', number>> = { chapter: 1, liaozhai: 1, epilogue: 1, photo: 1, note: 1, credits: 0 };
export const CARD_READ: Readonly<Record<CardKind | 'note', number>> = { chapter: 1.2, liaozhai: 2.5, epilogue: 2.5, photo: 1.5, note: 2, credits: 0 };
/** Pure: does a key press count? `age` = seconds since the card showed, `sinceFull` = seconds since its whole text has
 *  been on screen (negative while it is still revealing). */
export function cardKeyAccepted(kind: CardKind | 'note', age: number, sinceFull: number): boolean {
  if (age < CARD_GRACE[kind]) return false;
  if (sinceFull < 0) return true;
  return sinceFull >= CARD_READ[kind];
}

export interface Cards {
  show(kind: CardKind, id: string): Promise<void>;
  note(title: string, body: string): Promise<void>;
  update(dt: number): void;
  tick(i: InputApi): void;
  skip(): boolean;
  busy(): boolean;
  readonly current: CardKind | 'note' | null;
}

export function createCards(ctx: UiCtx): Cards {
  const { core } = ctx;
  const queue: Job[] = [];
  let cur: { job: Job; view: CardView; t0: number; pop: () => void; frame: number; full: number } | null = null;
  const markFull = () => { if (cur && cur.full < 0 && cur.view.revealed) cur.full = core.clock.t; };
  /** A player key (E / Space / Esc / a click on the card), gated by cardKeyAccepted. */
  const press = () => {
    const c = cur;
    if (!c) return;
    markFull();
    const now = core.clock.t;
    if (!cardKeyAccepted(c.job.kind, now - c.t0, c.full < 0 ? -1 : now - c.full)) return;
    c.view.key();
    markFull();
    finishIfDone();
  };

  const start = () => {
    if (cur) return;
    const job = queue.shift();
    if (!job) return;
    let view: CardView;
    try { view = job.make(); } catch (e) { core.log.warn(`[ui] card ${job.kind}:${job.id} failed`, e); job.resolve(); start(); return; }
    cur = { job, view, t0: core.clock.t, pop: core.input.pushContext('cutscene', `ui:card:${job.kind}`), frame: core.clock.frame, full: -1 };
    ctx.layers.card.append(view.el);
    view.el.addEventListener('click', () => { if (cur?.view === view) press(); });
    view.update(0, 0, false);
    markFull();
    if (job.kind !== 'note') core.bus.emit('cardShown', { kind: job.kind, id: job.id });
  };
  const finish = () => {
    const c = cur;
    if (!c) return;
    cur = null;
    c.view.el.remove();
    ctx.nextTick(c.pop);
    if (c.job.kind !== 'note') core.bus.emit('cardClosed', { kind: c.job.kind, id: c.job.id });
    c.job.resolve();
    start();
  };
  const finishIfDone = () => { if (cur?.view.done) finish(); };
  const enqueue = (kind: Job['kind'], id: string, make: () => CardView) => {
    const same = cur && cur.job.kind === kind && cur.job.id === id ? cur.job : queue.find((j) => j.kind === kind && j.id === id);
    if (same && kind !== 'note') return same.promise;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    queue.push({ kind, id, make, resolve, promise });
    start();
    return promise;
  };

  return {
    get current() { return cur?.job.kind ?? null; },
    show(kind, id) { return enqueue(kind, id, () => makeCard(core, kind, id, () => ctx.sfx('sfx_stamp'))); },
    note(title, body) { return enqueue('note', title, () => noteCard(title, body)); },
    update(dt) {
      if (!cur) return;
      cur.view.update(core.clock.t - cur.t0, dt, core.input.held('shutter') || core.input.held('advance'));
      markFull();
      finishIfDone();
    },
    tick(i) {
      if (!cur || core.clock.frame === cur.frame) return;
      if (cur.job.kind === 'credits') { if (i.pressed('escape')) finish(); return; }
      if (i.pressed('advance') || i.pressed('interact') || i.pressed('escape')) press();
    },
    skip() {
      if (!cur && !queue.length) return false;
      if (cur) finish();
      return true;
    },
    busy: () => cur !== null || queue.length > 0,
  };
}
