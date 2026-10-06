// S-verify: save/load edge cases (corrupt JSON, disabled storage) and lens-gated condition rules.
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock } from './clock';
import { createLog } from './log';
import { createRules } from './rules';
import { SAVE_KEY, SAVE_RETRY, createSaveManager, parseSave, type StorageLike } from './save';
import { createStore, initialState } from './state';

describe('parseSave: corrupt saves never crash 「继续」', () => {
  const ok = { ...initialState(1), flags: { game_started: true } };
  it('rejects garbage and wrong-typed core fields', () => {
    for (const raw of ['', '{', 'null', '[]', '42', '"x"', JSON.stringify({ ...ok, version: 2 }),
      JSON.stringify({ ...ok, flags: null }), JSON.stringify({ ...ok, flags: [] }), JSON.stringify({ ...ok, photos: {} })]) {
      expect(parseSave(raw)).toBeNull();
    }
  });
  it('repairs wrong-typed fields from the initial state instead of passing them through', () => {
    const bad = {
      ...ok, items: 'key_ring', verbs: null, clues: [1, 2], chapter: 7, phase: null, hint: 3, objective: 5,
      flags: { game_started: true, P1_done: 'yes' }, photos: [null, 3, { id: 'a', tags: ['x'], seq: 1 }, { id: 'b' }],
      player: { scene: 'planet', pos: [0, NaN, 1], heading: [0, 0, -1] }, wxLog: [{ id: 'wx_a', at: '06:10' }, 'junk'],
    };
    const s = parseSave(JSON.stringify(bad));
    expect(s).not.toBeNull();
    const d = initialState(1);
    expect(s!.items).toEqual([]);
    expect(s!.verbs).toEqual(d.verbs);
    expect(s!.clues).toEqual([]);
    expect(s!.chapter).toBe('prologue');
    expect(s!.phase).toBe('day');
    expect(s!.hint).toEqual(d.hint);
    expect(s!.objective).toBeNull();
    expect(s!.flags).toEqual({ game_started: true });
    expect(s!.photos.map((p) => p.id)).toEqual(['a']);
    expect(s!.player).toEqual(d.player);
    expect(s!.wxLog).toEqual([{ id: 'wx_a', at: '06:10' }]);
  });
  it('store.load() on a corrupt save returns false (no throw) and keeps the current state', () => {
    const bus = new Bus(), clock = new MutableClock(), store = createStore(bus, 1);
    const storage: StorageLike = { getItem: () => '{"version":1,"flags":null,"photos":[]}', setItem: () => undefined, removeItem: () => undefined };
    const sm = createSaveManager({ store, bus, clock, storage, log: createLog(false), isBusy: () => false, snapshotPlayer: () => undefined });
    store.setPersistence(sm);
    expect(() => store.load()).not.toThrow();
    expect(store.load()).toBe(false);
    expect(store.hasSave()).toBe(false);
  });
});

describe('save manager: storage that always throws', () => {
  it('does not re-serialise every tick after a failed write; warns once; retries later', () => {
    const bus = new Bus(), clock = new MutableClock(), store = createStore(bus, 1);
    let writes = 0;
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { writes++; throw new DOMException('denied', 'SecurityError'); },
      removeItem: () => undefined,
    };
    const warns: string[] = [];
    const log = { ...createLog(false), warn: (m: string) => { warns.push(m); } };
    const sm = createSaveManager({ store, bus, clock, storage, log, isBusy: () => false, snapshotPlayer: () => undefined });
    store.set('game_started');
    const tick = (n: number) => { for (let i = 0; i < n; i++) { clock.advance(1 / 60); sm.update(); } };
    tick(70);                                                     // debounce (1 s) elapses once
    const afterFirst = writes;
    expect(afterFirst).toBeGreaterThan(0);
    tick(600);                                                    // 10 s: no retry storm
    expect(writes).toBe(afterFirst);
    tick(Math.ceil(SAVE_RETRY * 60));
    expect(writes).toBeGreaterThan(afterFirst);                   // retried once later
    expect(warns.filter((w) => w.includes('save failed')).length).toBe(1);
    expect(sm.due).toBe(true);
    void SAVE_KEY;
  });
});

describe('rules: lens-gated condition rules', () => {
  it('a {lens:"night"} condition rule fires when the night view turns on (lensChanged), not at the next flag', () => {
    const bus = new Bus(), store = createStore(bus, 1);
    let night = false;
    const rules = createRules({ store, bus, log: createLog(false), activeScene: () => 'planet', nightView: () => night });
    rules.onAction('set', (a) => { store.set(a.set); });
    rules.loadStory([{ flag: 'P1_done', when: { lens: 'night', all: ['game_started'] }, effects: [] }]);
    store.set('game_started');
    expect(store.has('P1_done')).toBe(false);
    night = true;
    bus.emit('lensChanged', { zoom: 1, night: true, flash: false, overlay: false, torch: false });
    expect(store.has('P1_done')).toBe(true);
  });
});
