import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import type { Photo, StoryRule } from '../types';
import { createLog } from './log';
import { createRules } from './rules';
import { createStore } from './state';

function make(night = false) {
  const bus = new Bus();
  const store = createStore(bus, 1);
  let nightView = night;
  const rules = createRules({ store, bus, log: createLog(false), activeScene: () => 'planet', nightView: () => nightView });
  rules.onAction('set', (a) => { store.set(a.set); });
  rules.onAction('give', (a) => { store.give(a.give); });
  return { bus, store, rules, setNight: (v: boolean) => { nightView = v; } };
}

describe('rules: evalCond', () => {
  it('ANDs every field', () => {
    const { store, rules } = make();
    expect(rules.evalCond(undefined)).toBe(true);
    expect(rules.evalCond({ phase: ['day'] })).toBe(true);
    expect(rules.evalCond({ phase: ['night'] })).toBe(false);
    store.set('P1_done');
    expect(rules.evalCond({ all: ['P1_done'], none: ['P2_done'] })).toBe(true);
    expect(rules.evalCond({ all: ['P1_done'], none: ['P1_done'] })).toBe(false);
    expect(rules.evalCond({ any: ['P2_done', 'P1_done'] })).toBe(true);
    expect(rules.evalCond({ items: ['key_ring'] })).toBe(false);
    expect(rules.evalCond({ scene: 'planet' })).toBe(true);
    expect(rules.evalCond({ scene: 'studio_int' })).toBe(false);
  });
  it('tags look at album photos; lens night/plain use the lens', () => {
    const { store, rules, setNight } = make();
    expect(rules.evalCond({ tags: ['granny_face_open'] })).toBe(false);
    store.addPhoto({ id: 'a', dataURL: '', tags: ['granny_face_open'], label: '', clock: '', zoom: 1, night: false, flash: false, keep: true, seq: 1 } as Photo);
    expect(rules.evalCond({ tags: ['granny_face_closed', 'granny_face_open'] })).toBe(true);
    expect(rules.evalCond({ lens: 'plain' })).toBe(true);
    expect(rules.evalCond({ lens: 'night' })).toBe(false);
    setNight(true);
    expect(rules.evalCond({ lens: 'night' })).toBe(true);
    expect(rules.evalCond({ lens: 'plain' })).toBe(false);
  });
});

describe('rules: run()', () => {
  it('is synchronous up to the first promise-returning handler', async () => {
    const { store, rules } = make();
    let release!: () => void;
    rules.onAction('wait', () => new Promise<void>((r) => { release = r; }));
    const p = rules.run([{ set: 'P1_done' }, { wait: 1 }, { set: 'P2_done' }], 'test');
    expect(store.has('P1_done')).toBe(true);
    expect(store.has('P2_done')).toBe(false);
    expect(rules.pending()).toBe(1);
    release();
    await p;
    expect(store.has('P2_done')).toBe(true);
    expect(rules.pending()).toBe(0);
  });
  it('passes quiet to handlers; missing handlers warn and continue', async () => {
    const { store, rules } = make();
    const seen: boolean[] = [];
    rules.onAction('sfx', (_a, ctx) => { seen.push(ctx.quiet); });
    await rules.run([{ sfx: 'sfx_click' }, { beat: 'S_wake' }, { set: 'P3_done' }], 't', { quiet: true });
    expect(seen).toEqual([true]);
    expect(store.has('P3_done')).toBe(true);
  });
});

describe('rules: story rules', () => {
  it('condition rules fire once, in order, until nothing changes', () => {
    const { store, rules } = make();
    const table: StoryRule[] = [
      { flag: 'P5_done', when: { all: ['frame_1'] }, effects: [] },
      { flag: 'all_frames', when: { all: ['frame_1', 'frame_2', 'frame_3', 'frame_4'] }, effects: [{ set: 'P9_done' }] },
      { flag: 'ch3_started', when: { all: ['P5_done'] }, effects: [] },
    ];
    rules.loadStory(table);
    let fired = 0;
    store.give('frame_1');
    expect(store.has('P5_done')).toBe(true);
    expect(store.has('ch3_started')).toBe(true);
    expect(store.has('all_frames')).toBe(false);
    store.give('frame_2'); store.give('frame_3'); store.give('frame_4');
    expect(store.has('all_frames')).toBe(true);
    expect(store.has('P9_done')).toBe(true);
    void fired;
  });
  it('event rules match payload keys and respect guard + fire-once', () => {
    const { bus, store, rules } = make();
    rules.loadStory([
      { flag: 'ch2_started', when: { event: 'enterZone', match: { spot: 'sp_estate_gate_inner' } }, guard: { all: ['P3_done'] }, effects: [{ give: 'key_ring' }] },
    ]);
    bus.emit('enterZone', { spot: 'sp_estate_gate_inner' });
    expect(store.has('ch2_started')).toBe(false);                 // guard fails
    store.set('P3_done');
    bus.emit('enterZone', { spot: 'sp_locker' });
    expect(store.has('ch2_started')).toBe(false);                 // match fails
    bus.emit('enterZone', { spot: 'sp_estate_gate_inner' });
    expect(store.has('ch2_started')).toBe(true);
    expect(store.hasItem('key_ring')).toBe(true);
    store.take('key_ring');
    bus.emit('enterZone', { spot: 'sp_estate_gate_inner' });
    expect(store.hasItem('key_ring')).toBe(false);                // fired once only
  });
  it('condition rules with a guard wait for it; re-evaluated after stateLoaded', () => {
    const { bus, store, rules } = make();
    rules.loadStory([{ flag: 'sms_full', when: { all: ['locker_seen'] }, guard: { all: ['ch1_started'] }, effects: [] }]);
    store.set('locker_seen');
    expect(store.has('sms_full')).toBe(false);
    const s = JSON.parse(JSON.stringify(store.state));
    s.flags.ch1_started = true;
    store.replace(s, 'debug');
    void bus;
    expect(store.has('sms_full')).toBe(true);
  });
});
