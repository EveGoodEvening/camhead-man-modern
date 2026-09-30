import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import type { Photo } from '../types';
import { MAX_ALBUM, createStore, initialState } from './state';
import { MemoryStorage, SAVE_KEY, createSaveManager, parseSave, writeWithFallback, type StorageLike } from './save';
import { MutableClock } from './clock';
import { createLog } from './log';

const photo = (seq: number, keep = false, extra: Partial<Photo> = {}): Photo => ({
  id: `p${seq}`, dataURL: 'data:image/jpeg;base64,' + 'A'.repeat(200), tags: [], label: 'x', clock: '06:10',
  zoom: 1, night: false, flash: false, keep, seq, ...extra,
});

describe('store', () => {
  it('give(item) also sets the same-named flag when it is a FlagId', () => {
    const bus = new Bus();
    const st = createStore(bus, 1);
    const flags: string[] = [];
    bus.on('flagSet', (e) => flags.push(e.flag));
    st.give('key_rooftop');
    st.give('key_ring');
    expect(st.hasItem('key_rooftop')).toBe(true);
    expect(st.has('key_rooftop')).toBe(true);
    expect(flags).toEqual(['key_rooftop']);
    st.take('key_rooftop');
    expect(st.hasItem('key_rooftop')).toBe(false);
    expect(st.has('key_rooftop')).toBe(true);           // flags never unset
  });
  it('set() returns false the second time and emits once', () => {
    const bus = new Bus();
    const st = createStore(bus, 1);
    let n = 0;
    bus.on('flagSet', () => n++);
    expect(st.set('P1_done')).toBe(true);
    expect(st.set('P1_done')).toBe(false);
    expect(n).toBe(1);
  });
  it('evicts the oldest non-keep photo beyond 40 (GDD §3.13) and clears the reference', () => {
    const bus = new Bus();
    const st = createStore(bus, 1);
    const removed: string[] = [];
    bus.on('photoRemoved', (e) => removed.push(e.id));
    st.addPhoto(photo(0, true));
    for (let i = 1; i <= MAX_ALBUM; i++) expect(st.addPhoto(photo(i)).evicted).toBeNull();
    st.setRefPhoto('p1');
    const r = st.addPhoto(photo(MAX_ALBUM + 1));
    expect(r.evicted?.id).toBe('p1');
    expect(removed).toEqual(['p1']);
    expect(st.state.refPhotoId).toBeNull();
    expect(st.state.photos.filter((p) => !p.keep).length).toBe(MAX_ALBUM);
    expect(st.photo('p0')?.keep).toBe(true);
  });
  it('addBestiary sets the flag and reports the count', () => {
    const bus = new Bus();
    const st = createStore(bus, 1);
    let count = 0;
    bus.on('bestiaryAdded', (e) => { count = e.count; });
    st.addBestiary('bst_fish_watching');
    expect(st.has('bst_fish_watching')).toBe(true);
    expect(count).toBe(1);
  });
  it('setPhase uses the default palette and emits phaseChanged with instant', () => {
    const bus = new Bus();
    const st = createStore(bus, 1);
    const ev: unknown[] = [];
    bus.on('phaseChanged', (e) => ev.push(e));
    st.setPhase('night', undefined, true);
    expect(ev).toEqual([{ phase: 'night', palette: 'night', chapter: 'prologue', instant: true }]);
  });
});

function harness(storage: StorageLike, busy = () => false) {
  const bus = new Bus();
  const clock = new MutableClock();
  const store = createStore(bus, 7);
  const save = createSaveManager({ store, bus, clock, storage, log: createLog(false), isBusy: busy, snapshotPlayer: () => undefined });
  store.setPersistence(save);
  return { bus, clock, store, save };
}

describe('save', () => {
  it('round trip: save → fresh store → load restores flags, items and photos', () => {
    const storage = new MemoryStorage();
    const a = harness(storage);
    a.store.set('game_started'); a.store.set('P1_done'); a.store.give('frame_1');
    a.store.addPhoto(photo(1)); a.store.addPhoto(photo(2, true, { preset: 'ph_2006_group', tags: ['ph_2006_group'] }));
    a.store.setChapter({ chapter: 'ch1', phase: 'day', palette: 'day', clock: '10:00' });
    expect(a.store.save()).toBe(true);
    const b = harness(storage);
    expect(b.store.hasSave()).toBe(true);
    let loaded = '';
    b.bus.on('stateLoaded', (e) => { loaded = e.reason; });
    expect(b.store.load()).toBe(true);
    expect(loaded).toBe('save');
    expect(b.store.has('P1_done')).toBe(true);
    expect(b.store.hasItem('frame_1')).toBe(true);
    expect(b.store.state.chapter).toBe('ch1');
    expect(b.store.state.photos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(b.store.state.photos[1].dataURL).toBe('');          // presets are re-rendered, not stored
  });
  it('debounces flag saves by 1 s of sim time and waits while busy', () => {
    const storage = new MemoryStorage();
    let busy = true;
    const h = harness(storage, () => busy);
    h.store.set('game_started');
    h.save.update();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    h.clock.advance(1.01);
    h.save.update();
    expect(storage.getItem(SAVE_KEY)).toBeNull();                // busy: postponed, not dropped
    busy = false;
    h.save.update();
    expect(parseSave(storage.getItem(SAVE_KEY))?.flags.game_started).toBe(true);
  });
  it('quota fallback: drops old photos, then saves without photos', () => {
    class Quota implements StorageLike {
      m = new Map<string, string>();
      limit: number;
      constructor(limit: number) { this.limit = limit; }
      getItem(k: string) { return this.m.get(k) ?? null; }
      setItem(k: string, v: string) { if (v.length > this.limit) throw new DOMException('full', 'QuotaExceededError'); this.m.set(k, v); }
      removeItem(k: string) { this.m.delete(k); }
    }
    const s = initialState(1);
    s.flags.game_started = true;
    for (let i = 0; i < 20; i++) s.photos.push(photo(i));
    const base = JSON.stringify({ ...s, photos: [] }).length;
    const q1 = new Quota(base + 6 * 400);
    expect(writeWithFallback(q1, s)).toBe(true);
    const saved = parseSave(q1.getItem(SAVE_KEY));
    expect(saved!.photos.length).toBeGreaterThan(0);
    expect(saved!.photos.length).toBeLessThan(20);
    expect(saved!.photos[saved!.photos.length - 1].id).toBe('p19');   // newest kept, oldest dropped
    const q2 = new Quota(base + 10);
    expect(writeWithFallback(q2, s)).toBe(true);
    expect(parseSave(q2.getItem(SAVE_KEY))!.photos).toEqual([]);
  });
  it('credits_done replaces the save with a cleared fresh state; hasSave() is then false', () => {
    const storage = new MemoryStorage();
    const h = harness(storage);
    h.store.set('game_started');
    h.store.save();
    h.store.set('credits_done');
    expect(h.store.hasSave()).toBe(false);
    expect(parseSave(storage.getItem(SAVE_KEY))?.cleared).toBe(true);
  });
});
