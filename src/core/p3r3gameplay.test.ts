// src/core/p3r3gameplay.test.ts — P3r3 gameplay fixes in core: G8 the burst hold is measured in wall time from the
// DOM events (a capture that froze the page no longer turns a 1.2 s hold into a click), G9 the cleared save keeps the
// bus-door checkpoint so the other ending can be replayed from the title.
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { createStore } from './state';
import { MemoryStorage, SAVE_KEY, atEndingChoice, createSaveManager, parseSave, type StorageLike } from './save';
import { MutableClock } from './clock';
import { createLog } from './log';
import { createInput } from './input';
import { burstHeld, BURST_HOLD } from '../lens/capture';

function saveHarness(storage: StorageLike) {
  const bus = new Bus();
  const clock = new MutableClock();
  const store = createStore(bus, 7);
  const save = createSaveManager({ store, bus, clock, storage, log: createLog(false), isBusy: () => false, snapshotPlayer: () => undefined });
  store.setPersistence(save);
  return { bus, clock, store, save };
}

describe('G9: the cleared save is the ending checkpoint', () => {
  it('credits after a bus-door save → the save is that checkpoint, cleared, and the title can replay it', () => {
    const storage = new MemoryStorage();
    const h = saveHarness(storage);
    h.store.set('game_started'); h.store.set('finale_started'); h.store.set('group_photo_done');
    h.store.set('bus_arrived');
    expect(h.save.due).toBe(true);                      // due at once, so the checkpoint exists before the choice
    h.save.update();
    h.store.set('ending_B');
    h.store.set('credits_done');
    const s = parseSave(storage.getItem(SAVE_KEY));
    expect(s?.cleared).toBe(true);
    expect(s && atEndingChoice(s)).toBe(true);
    expect(s?.flags.ending_B).toBeUndefined();
    expect(h.store.hasSave()).toBe(true);
    expect(h.store.saveCleared?.()).toBe(true);
    // continuing from it and finishing again keeps the checkpoint (the other ending, then the title again)
    const b = saveHarness(storage);
    expect(b.store.load()).toBe(true);
    expect(b.store.state.cleared).toBe(true);
    b.store.set('ending_A');
    b.store.set('credits_done');
    const s2 = parseSave(storage.getItem(SAVE_KEY));
    expect(s2 && atEndingChoice(s2)).toBe(true);
    expect(s2?.cleared).toBe(true);
  });
  it('without a checkpoint (a finale chapter boot) the credits still write a fresh cleared state', () => {
    const storage = new MemoryStorage();
    const h = saveHarness(storage);
    h.store.set('game_started');
    h.store.save();
    h.store.set('credits_done');
    expect(parseSave(storage.getItem(SAVE_KEY))?.cleared).toBe(true);
    expect(h.store.hasSave()).toBe(false);
    expect(h.store.saveCleared?.()).toBe(false);
  });
});

describe('G8: burst hold in wall time', () => {
  const setup = () => {
    const input = createInput(new MutableClock(), new Bus());
    const target = new EventTarget(), canvas = new EventTarget();
    input.attach(target, canvas, { pointerLock: false, doc: Object.assign(new EventTarget(), { pointerLockElement: null }) });
    const mouse = (on: EventTarget, type: string, ts: number) => {
      const e = new Event(type);
      Object.defineProperty(e, 'button', { value: 0 }); Object.defineProperty(e, 'buttons', { value: type === 'mousedown' ? 1 : 0 });
      Object.defineProperty(e, 'timeStamp', { value: ts });
      on.dispatchEvent(e);
    };
    return { input, down: (ts: number) => mouse(canvas, 'mousedown', ts), up: (ts: number) => mouse(target, 'mouseup', ts) };
  };
  it('a 1.2 s hold whose mouseup is handled after a long frame still counts as held', () => {
    const { input, down, up } = setup();
    down(1000);
    input.begin(); expect(input.pressed('shutter')).toBe(true); input.end();
    expect(input.holdWallMs?.('shutter')).toBeNull();              // still held
    up(2200);                                                      // released 1.2 s later (delivered after the stall)
    input.begin(); input.end();
    expect(input.held('shutter')).toBe(false);
    expect(input.holdWallMs?.('shutter')).toBe(1200);
    expect(burstHeld(input.held('shutter'), input.holdWallMs?.('shutter'))).toBe(true);
  });
  it('a click stays a click; an injected press never borrows an older hold', () => {
    const { input, down, up } = setup();
    down(1000); up(1000 + BURST_HOLD * 1000 - 120);
    input.begin(); input.end();
    expect(burstHeld(input.held('shutter'), input.holdWallMs?.('shutter'))).toBe(false);
    down(5000); up(7000);
    input.begin(); input.end();
    input.inject({ press: ['shutter'] });
    input.begin();
    expect(input.pressed('shutter')).toBe(true);
    input.end();
    expect(input.holdWallMs?.('shutter')).toBeNull();
  });
});
