// src/core/state.ts — owner: S. FROZEN. The GameState store (GDD §18.2, ARCHITECTURE §2.8.9). Every mutation emits.
import type { Bus } from '../events';
import type { StoreApi } from '../contracts';
import type { GameState, PaletteKey, Phase, Photo, Verb } from '../types';
import { isFlagId } from './params';

export const MAX_ALBUM = 40;                                  // GDD §3.13: non-keep photos
export const DEFAULT_PALETTE: Readonly<Record<Phase, PaletteKey>> = { day: 'day', dusk: 'dusk', night: 'night', dawn: 'dawn' };
/** Verbs unlocked at the start (GDD §3.3, unlock column "start"). */
export const START_VERBS: readonly Verb[] = [
  'move', 'run', 'look', 'interact', 'viewfinder', 'shutter', 'burst', 'zoom', 'scan', 'flash', 'torch', 'show',
  'rephoto', 'signal', 'phone', 'hint',
];

export function initialState(seed: number): GameState {
  return {
    version: 1, seed,
    chapter: 'prologue', phase: 'day', palette: 'morning', clock: '06:10',
    flags: {}, items: [], verbs: [...START_VERBS], clues: [], bestiary: [], photos: [],
    refPhotoId: null, objective: null,
    hint: { target: null, tier: 0, idleSince: 0, lastSentAt: -1e9 },
    zhimeiSpot: 0, wxLog: [],
    player: { scene: 'planet', pos: [0, 80, 0], heading: [0, 0, -1] },
    cleared: false,
  };
}

/** Deep copy through JSON (GameState is plain data). */
export function cloneState(s: GameState): GameState { return JSON.parse(JSON.stringify(s)) as GameState; }

export interface StoreImpl extends StoreApi {
  /** Mutable access for the save manager (player position snapshot). */
  readonly raw: GameState;
  /** Attach the persistence backend (save.ts). */
  setPersistence(p: { save(): boolean; load(): boolean; hasSave(): boolean; clearSave(): void; saveCleared?(): boolean }): void;
}

export function createStore(bus: Bus, seed: number): StoreImpl {
  let s = initialState(seed);
  let persist: { save(): boolean; load(): boolean; hasSave(): boolean; clearSave(): void; saveCleared?(): boolean } | null = null;
  const nonKeep = () => s.photos.filter((p) => !p.keep);

  const api: StoreImpl = {
    get state() { return s; },
    get raw() { return s; },
    has: (f) => s.flags[f] === true,
    set(f) {
      if (s.flags[f]) return false;
      s.flags[f] = true;
      bus.emit('flagSet', { flag: f });
      return true;
    },
    give(i) {
      if (!s.items.includes(i)) {
        s.items.push(i);
        bus.emit('itemGained', { item: i });
      }
      if (isFlagId(i)) api.set(i);                           // key_rooftop, frame_1..4 (GDD §18.2 convention)
    },
    take(i) {
      const k = s.items.indexOf(i);
      if (k < 0) return;
      s.items.splice(k, 1);
      bus.emit('itemLost', { item: i });
    },
    hasItem: (i) => s.items.includes(i),
    unlockVerb(v) {
      if (s.verbs.includes(v)) return;
      s.verbs.push(v);
      bus.emit('verbUnlocked', { verb: v });
    },
    hasVerb: (v) => s.verbs.includes(v),
    addClue(c) {
      if (s.clues.includes(c)) return;
      s.clues.push(c);
      bus.emit('clueAdded', { id: c });
    },
    addBestiary(b) {
      if (s.bestiary.includes(b)) return;
      s.bestiary.push(b);
      bus.emit('bestiaryAdded', { id: b, count: s.bestiary.length });
      api.set(b);
    },
    addPhoto(p: Photo) {
      s.photos.push(p);
      let evicted: Photo | null = null;
      const nk = nonKeep();
      if (nk.length > MAX_ALBUM) {
        evicted = nk.reduce((a, b) => (b.seq < a.seq ? b : a));
        api.removePhoto(evicted.id);
      }
      return { evicted };
    },
    removePhoto(id) {
      const k = s.photos.findIndex((p) => p.id === id);
      if (k < 0) return;
      s.photos.splice(k, 1);
      if (s.refPhotoId === id) api.setRefPhoto(null);
      bus.emit('photoRemoved', { id });
    },
    photo: (id) => s.photos.find((p) => p.id === id) ?? null,
    setRefPhoto(id) {
      if (s.refPhotoId === id) return;
      s.refPhotoId = id;
      bus.emit('refPhotoChanged', { id });
    },
    setObjective(id) {
      if (s.objective === id) return;
      s.objective = id;
      bus.emit('objectiveChanged', { id });
    },
    setChapter(o, instant = false) {
      s.chapter = o.chapter; s.phase = o.phase; s.palette = o.palette;
      bus.emit('phaseChanged', { phase: o.phase, palette: o.palette, chapter: o.chapter, instant });
      api.setClock(o.clock);
    },
    setPhase(phase, palette, instant = false) {
      s.phase = phase;
      s.palette = palette ?? DEFAULT_PALETTE[phase];
      bus.emit('phaseChanged', { phase, palette: s.palette, chapter: s.chapter, instant });
    },
    setClock(clock) {
      if (s.clock === clock) return;
      s.clock = clock;
      bus.emit('clockChanged', { clock });
    },
    setZhimeiSpot(i) { s.zhimeiSpot = i; },
    logWx(id, at) { s.wxLog.push({ id, at }); },
    setHint(h) { s.hint = { ...h }; },
    markCleared() { s.cleared = true; },
    replace(next, reason) {
      s = cloneState(next);
      bus.emit('stateLoaded', { reason });
    },
    save: () => persist?.save() ?? false,
    load: () => persist?.load() ?? false,
    hasSave: () => persist?.hasSave() ?? false,
    saveCleared: () => persist?.saveCleared?.() ?? false,
    clearSave: () => { persist?.clearSave(); },
    setPersistence(p) { persist = p; },
  };
  return api;
}
