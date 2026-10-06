// P3 gameplay fixes (G8 save robustness, G9 Esc on pointer unlock, G10 aspect fit) — pure/core level.
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock, SimTimers } from './clock';
import { createInput, type PointerLockDoc } from './input';
import { createLoop } from './loop';
import { createLog } from './log';
import { SAVE_KEY, createSaveManager, parseSave, writeWithFallback, type StorageLike } from './save';
import { createStore, initialState } from './state';
import { ASPECT_MAX, ASPECT_MIN, fitFov } from './cameraRig';
import { DEG } from './planet';
import { displayFov, PHOTO_ASPECT } from '../lens/pose';
import { keepFor } from '../lens/capture';

const hfov = (v: number, a: number) => (2 * Math.atan(Math.tan((v * DEG) / 2) * a)) / DEG;

describe('G8 parseSave validates ids that index tables', () => {
  const save = (patch: Record<string, unknown>) => JSON.stringify({ ...initialState(1), flags: { game_started: true, ch1_started: true, ch2_started: true }, ...patch });
  it('an unknown chapter falls back to the one the flags prove; phase and palette follow', () => {
    const s = parseSave(save({ chapter: 'ch9', phase: 'noon', palette: 'xx' }))!;
    expect(s.chapter).toBe('ch2');
    expect(s.phase).toBe('dusk');
    expect(s.palette).toBe('dusk');
  });
  it('a bad palette alone becomes the phase palette (the prologue keeps morning); title is never a game palette', () => {
    expect(parseSave(save({ chapter: 'prologue', phase: 'day', palette: 'xx' }))!.palette).toBe('morning');
    expect(parseSave(save({ chapter: 'ch3', phase: 'night', palette: 'title' }))!.palette).toBe('night');
    expect(parseSave(save({ chapter: 'ch1', phase: 'day', palette: 'day' }))!.palette).toBe('day');
  });
  it('an unknown player scene drops the position (the chapter spot is used instead)', () => {
    const s = parseSave(save({ player: { scene: 'moon', pos: [1, 2, 3], heading: [0, 0, 1] } }))!;
    expect(s.player).toEqual(initialState(1).player);
  });
});

class QuotaStorage implements StorageLike {
  m = new Map<string, string>();
  max: number;
  constructor(max: number) { this.max = max; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { if (v.length > this.max) throw new Error('QuotaExceededError'); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('G8 quota handling', () => {
  const big = () => {
    const s = initialState(1);
    s.flags = { game_started: true, ch1_started: true };
    s.wxLog = Array.from({ length: 400 }, (_, i) => ({ id: 'wx_intro', clock: `${i}` })) as never;
    return s;
  };
  it('the last attempt saves the flags without album and chat log', () => {
    const s = big();
    const lenNoPhotos = JSON.stringify({ ...s, photos: [] }).length;
    const st = new QuotaStorage(lenNoPhotos - 10);
    expect(writeWithFallback(st, s)).toBe(true);
    const back = parseSave(st.getItem(SAVE_KEY))!;
    expect(back.flags.ch1_started).toBe(true);
    expect(back.wxLog).toEqual([]);
  });
  it('a total failure keeps a memory mirror (继续 still works this session) and notifies once', () => {
    const bus = new Bus();
    const clock = new MutableClock();
    const store = createStore(bus, 1);
    const st = new QuotaStorage(10);
    const told: string[] = [];
    const m = createSaveManager({ store, bus, clock, storage: st, log: createLog(false), isBusy: () => false, snapshotPlayer: () => {}, notify: (e) => told.push(e) });
    store.set('game_started');
    expect(m.save()).toBe(false);
    expect(m.save()).toBe(false);
    expect(told).toEqual(['full']);
    expect(m.hasSave()).toBe(true);
    expect(m.load()).toBe(true);
  });
  it('periodic autosave after walking, only when allowed; chapter saves announce 已自动保存', () => {
    const bus = new Bus();
    const clock = new MutableClock();
    const store = createStore(bus, 1);
    const st = new QuotaStorage(1e9);
    let x = 0, ok = true;
    const told: string[] = [];
    const m = createSaveManager({
      store, bus, clock, storage: st, log: createLog(false), isBusy: () => false, canAutosave: () => ok,
      snapshotPlayer: (s) => { s.player = { scene: 'planet', pos: [x, 80, 0], heading: [0, 0, -1] }; }, notify: (e) => told.push(e),
    });
    store.set('game_started');
    clock.t = 2; m.update();                                   // the flag's debounced save
    expect(st.m.has(SAVE_KEY)).toBe(true);
    st.m.clear();
    clock.t = 20; m.update();
    expect(st.m.has(SAVE_KEY)).toBe(false);                    // did not move
    x = 5; ok = false; m.update();
    expect(st.m.has(SAVE_KEY)).toBe(false);                    // moved, but not a safe moment
    ok = true; m.update();
    expect(JSON.parse(st.m.get(SAVE_KEY)!).player.pos[0]).toBe(5);
    expect(told).toEqual([]);
    store.setPhase('dusk');
    clock.t = 21; m.update();
    expect(told).toEqual(['saved']);
  });
});

describe('G8 story photos: only the first good shot per story tag is keep', () => {
  it('burst duplicates and repeats are ordinary album photos', () => {
    const album: { keep: boolean; tags: string[] }[] = [];
    const add = (tags: string[]) => { const keep = keepFor(tags, album); album.push({ keep, tags }); return keep; };
    expect(add(['granny_face_open'])).toBe(true);
    expect(add(['granny_face_open'])).toBe(false);
    expect(add(['granny_face_closed'])).toBe(true);
    expect(add(['zhimei_sea'])).toBe(true);
    expect(add(['zhimei_sea'])).toBe(false);
    expect(add(['sky'])).toBe(false);
  });
});

describe('G9 Esc synthesised on pointer unlock', () => {
  function rig() {
    const clock = new MutableClock();
    const bus = new Bus();
    const input = createInput(clock, bus);
    const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => {} });
    let lockEl: unknown = null, focus = true;
    const doc = Object.assign(new EventTarget(), { exitPointerLock: () => {}, visibilityState: 'visible', hasFocus: () => focus });
    Object.defineProperty(doc, 'pointerLockElement', { get: () => lockEl });
    input.attach(new EventTarget(), canvas, { pointerLock: true, doc: doc as unknown as PointerLockDoc });
    const loop = createLoop({ clock, timers: new SimTimers(clock), input, bus, log: createLog(false) });
    const lock = (on: boolean) => { lockEl = on ? canvas : null; const e = new Event('pointerlockchange'); Object.defineProperty(e, 'timeStamp', { value: 10_000 }); doc.dispatchEvent(e); };
    const escaped = () => { let out = false; const off = loop.addSystem('p', 'input', () => { out = input.pressed('escape'); }); loop.tick(1 / 60); off(); return out; };
    return { input, lock, escaped, setFocus: (f: boolean) => { focus = f; } };
  }
  it('in a dialogue the Esc the browser swallowed still arrives (「再见」 in one press)', () => {
    const r = rig();
    r.input.pushContext('dialog', 't');
    r.lock(true); r.lock(false);
    expect(r.escaped()).toBe(true);
  });
  it('but an unlock caused by alt-tab (no focus) does not close the dialogue or skip a card', () => {
    const r = rig();
    r.input.pushContext('cutscene', 't');
    r.lock(true); r.setFocus(false); r.lock(false);
    expect(r.escaped()).toBe(false);
  });
});

describe('G10 aspect fit', () => {
  it('landscape windows keep the authored vFOV', () => {
    for (const a of [ASPECT_MIN, 16 / 10, 16 / 9, ASPECT_MAX]) expect(fitFov(50, a)).toBeCloseTo(50, 6);
  });
  it('portrait keeps the ASPECT_MIN horizontal FOV; ultrawide keeps the ASPECT_MAX one', () => {
    expect(hfov(fitFov(50, 720 / 1280), 720 / 1280)).toBeCloseTo(hfov(50, ASPECT_MIN), 4);
    expect(hfov(fitFov(50, 2560 / 600), 2560 / 600)).toBeCloseTo(hfov(50, ASPECT_MAX), 4);
  });
  it('the viewfinder shows the whole 16:9 photo width on any window', () => {
    expect(displayFov(55, 21 / 9)).toBe(55);
    for (const a of [16 / 10, 4 / 3, 9 / 16]) expect(hfov(displayFov(55, a), a)).toBeCloseTo(hfov(55, PHOTO_ASPECT), 4);
  });
});
