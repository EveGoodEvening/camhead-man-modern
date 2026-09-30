// src/core/save.ts — owner: S. FROZEN. localStorage persistence (ARCHITECTURE §2.8.9 "Save").
// Debounced by 1 s of sim time after flag changes, immediate-when-free on phaseChanged; never mid-presentation;
// quota fallback drops the oldest non-keep photos, then saves without photos. Every storage access is try/catch.
import type { Bus } from '../events';
import type { Log, SimClock } from '../contracts';
import type { ChapterId, GameState, PaletteKey, Phase } from '../types';
import { cloneState, initialState, type StoreImpl } from './state';
import { isChapterId, isPhase } from './params';
import { SURFACES } from './planet';

export const SAVE_KEY = 'cmm.save.v1';
export const SAVE_DEBOUNCE = 1;
/** After a failed write (storage disabled, quota even without photos) retry this much sim time later, not every tick. */
export const SAVE_RETRY = 30;
/** P3 G8: periodic autosave (sim seconds) while the player walks around, so 继续 restores a recent position. */
export const SAVE_PERIODIC = 10;
/** …only if the player moved at least this far (m) since the last write (every save stringifies the album). */
export const SAVE_MOVED = 2;

const PALETTE_KEYS: readonly PaletteKey[] = ['title', 'morning', 'day', 'dusk', 'night', 'dawn'];
/** The chapter a save's flags prove (a hand-edited / unknown `chapter` falls back to this). */
function chapterFromFlags(f: Record<string, true>): ChapterId {
  return f.finale_started ? 'finale' : f.ch3_started ? 'ch3' : f.ch2_started ? 'ch2' : f.ch1_started ? 'ch1' : 'prologue';
}
const CHAPTER_PHASE: Readonly<Record<ChapterId, Phase>> = { prologue: 'day', ch1: 'day', ch2: 'dusk', ch3: 'night', finale: 'dawn' };

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

/** window.localStorage, or memory if unavailable (private mode, sandboxed iframe). */
export function browserStorage(): StorageLike {
  try {
    const ls = globalThis.localStorage;
    if (ls) { ls.getItem(SAVE_KEY); return ls; }
  } catch { /* fall through */ }
  return new MemoryStorage();
}

/** Serialize with preset photo pixels stripped (presets are re-rendered, never stored). */
export function serialize(s: GameState, photos: GameState['photos'] = s.photos): string {
  const copy: GameState = { ...s, photos: photos.map((p) => (p.preset ? { ...p, dataURL: '' } : p)) };
  return JSON.stringify(copy);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Parse a save; a corrupt or hand-edited one must never crash 「继续」. Wrong-typed fields fall back to the initial
 *  state's value; missing/invalid core fields (version, flags, photos) reject the whole save. */
export function parseSave(raw: string | null): GameState | null {
  if (!raw) return null;
  let s: unknown;
  try { s = JSON.parse(raw); } catch { return null; }
  if (!isObj(s) || s.version !== 1 || !isObj(s.flags) || !Array.isArray(s.photos)) return null;
  const base = initialState(typeof s.seed === 'number' ? s.seed : 1);
  const out = { ...base } as unknown as Record<string, unknown>;
  const b = base as unknown as Record<string, unknown>;
  for (const k of Object.keys(base)) {
    const v = s[k], d = b[k];
    if (v === undefined) continue;
    if (Array.isArray(d)) { if (k === 'photos' || k === 'wxLog' ? Array.isArray(v) : isStrArr(v)) out[k] = v; }
    else if (d === null) { if (v === null || typeof v === 'string') out[k] = v; }
    else if (isObj(d)) { if (isObj(v)) out[k] = k === 'flags' ? v : { ...d, ...v }; }
    else if (typeof v === typeof d) out[k] = v;
  }
  const flags: Record<string, true> = {};
  for (const [k, v] of Object.entries(s.flags)) if (v === true) flags[k] = true;
  out.flags = flags;
  out.photos = (s.photos as unknown[]).filter((p) => isObj(p) && typeof p.id === 'string' && Array.isArray(p.tags));
  out.wxLog = (out.wxLog as unknown[]).filter((w) => isObj(w) && typeof w.id === 'string');
  // P3 G8: ids that index tables (CHAPTER_BOOT, PALETTES, SURFACES) must be known ones, or 「继续」 throws later
  if (!isChapterId(String(out.chapter))) out.chapter = chapterFromFlags(flags);
  if (!isPhase(String(out.phase))) out.phase = CHAPTER_PHASE[out.chapter as ChapterId];
  if (!(PALETTE_KEYS as readonly string[]).includes(String(out.palette)) || out.palette === 'title') {
    out.palette = out.chapter === 'prologue' && out.phase === 'day' ? 'morning' : out.phase;
  }
  const pl = s.player;
  if (!(isObj(pl) && typeof pl.scene === 'string' && Object.hasOwn(SURFACES, pl.scene) && Array.isArray(pl.pos) && pl.pos.length === 3 && pl.pos.every(Number.isFinite)
    && Array.isArray(pl.heading) && pl.heading.length === 3 && pl.heading.every(Number.isFinite))) out.player = base.player;
  return out as unknown as GameState;
}

/** Write with the GDD §20.2 #9 quota fallback. Returns false only if even the photo-less save failed. */
export function writeWithFallback(storage: StorageLike, s: GameState, log?: Log): boolean {
  const tryWrite = (photos: GameState['photos']): boolean => {
    try { storage.setItem(SAVE_KEY, serialize(s, photos)); return true; } catch { return false; }
  };
  if (tryWrite(s.photos)) return true;
  // drop the oldest non-keep photos in steps of 5, then everything
  const keep = s.photos.filter((p) => p.keep);
  let nonKeep = s.photos.filter((p) => !p.keep).sort((a, b) => a.seq - b.seq);
  while (nonKeep.length > 0) {
    nonKeep = nonKeep.slice(Math.min(5, nonKeep.length));
    const photos = [...keep, ...nonKeep].sort((a, b) => a.seq - b.seq);
    if (tryWrite(photos)) { log?.warn('[save] quota: dropped old photos from the save'); return true; }
  }
  if (tryWrite([])) { log?.warn('[save] quota: saved without photos'); return true; }
  // GDD §20.2 #9 last attempt: the progress alone (flags, items, chapter …) without the album and the chat log
  try { storage.setItem(SAVE_KEY, JSON.stringify({ ...s, photos: [], wxLog: [] })); log?.warn('[save] quota: saved flags only'); return true; }
  catch { /* fall through */ }
  log?.warn('[save] quota: save failed');
  return false;
}

/** P3r3 G9: the bus stands at the stop and nobody has chosen yet — the finale checkpoint kept past the credits. */
export function atEndingChoice(s: GameState): boolean {
  return s.flags.bus_arrived === true && !s.flags.ending_A && !s.flags.ending_B && !s.flags.credits_done;
}

export interface SaveManager {
  save(): boolean; load(): boolean; hasSave(): boolean; clearSave(): void;
  /** P3r3 G9: the stored save is a cleared run's ending checkpoint (the title offers 「重温结局」). */
  saveCleared(): boolean;
  /** Loop hook (late phase): performs a due save once presentation is idle. */
  update(): void;
  /** P3 G8: save now if the game may be saved (pause menu, page hide); false if skipped or failed. */
  flush(): boolean;
  readonly due: boolean;
}

export function createSaveManager(o: {
  store: StoreImpl; bus: Bus; clock: SimClock; storage: StorageLike; log: Log;
  isBusy: () => boolean;                      // beat running, card showing, or rules pending
  snapshotPlayer: (s: GameState) => void;     // writes store.raw.player before saving
  /** P3 G8: periodic saves only while this holds (plain gameplay); omitted = never periodic. */
  canAutosave?: () => boolean;
  /** P3 G8: 'saved' after a chapter (phase) autosave, 'full' once when storage refuses even the flags-only save. */
  notify?: (e: 'saved' | 'full') => void;
}): SaveManager {
  const { store, bus, clock, storage, log } = o;
  let dueAt: number | null = null;
  let chapterSave = false;
  let lastSaveAt = 0;
  const lastPos: [number, number, number] = [NaN, NaN, NaN];
  /** After a failed write the session keeps its latest state here, so 回到标题 → 继续 still works (GDD §20.2 #9). */
  let mirror: string | null = null;
  let toldFull = false;
  /** P3r3 G9: the last saved state at the bus door before the ending choice (serialized), kept for the cleared save. */
  let checkpoint: string | null = null;
  const readRaw = (): string | null => {
    if (mirror !== null) return mirror;
    try { return storage.getItem(SAVE_KEY); } catch { return null; }
  };
  const markDue = (delay: number) => {
    if (!store.has('game_started')) return;
    // flags: restart the 1 s debounce; phaseChanged (delay 0): due now
    dueAt = delay === 0 ? clock.t : clock.t + delay;
  };

  let warnedFail = false;
  bus.on('flagSet', (e) => {
    if (e.flag === 'credits_done') {
      // GDD §10.2 #49 (P3r3 G9): replace the save with the ending checkpoint — the bus at the stop, the choice still
      // open — marked `cleared`, so the title can replay the other ending without a new run; without a checkpoint
      // (a chapter-boot finale) a fresh state whose only meaningful field is `cleared`.
      const cp = parseSave(checkpoint);
      const next = cp && atEndingChoice(cp) ? cp : initialState(store.state.seed);
      next.cleared = true;
      writeWithFallback(storage, next, log);
      mirror = null;
      dueAt = null;
      return;
    }
    // the bus just pulled in: save as soon as presentation is idle, so the checkpoint exists before the choice
    if (e.flag === 'bus_arrived') { markDue(0); return; }
    markDue(SAVE_DEBOUNCE);
  });
  // a loud chapter change (not a boot / load / debug phase, which are instant) is announced with 「已自动保存」
  bus.on('phaseChanged', (e) => { markDue(0); if (!e.instant) chapterSave = true; });

  const movedSinceSave = (): boolean => {
    o.snapshotPlayer(scratch);
    const p = scratch.player.pos;
    return !(Math.hypot(p[0] - lastPos[0], p[1] - lastPos[1], p[2] - lastPos[2]) < SAVE_MOVED);
  };
  const scratch = initialState(1);
  const api: SaveManager = {
    get due() { return dueAt !== null; },
    save() {
      if (store.has('credits_done')) { dueAt = null; return false; }
      o.snapshotPlayer(store.raw);
      const ok = writeWithFallback(storage, store.state, warnedFail ? undefined : log);
      lastSaveAt = clock.t;
      const pp = store.state.player.pos;
      lastPos[0] = pp[0]; lastPos[1] = pp[1]; lastPos[2] = pp[2];
      if (atEndingChoice(store.state)) { try { checkpoint = serialize(store.state); } catch { /* keep the older one */ } }
      if (ok) {
        dueAt = null; warnedFail = false; mirror = null;
        if (chapterSave) { chapterSave = false; o.notify?.('saved'); }
      } else {
        // storage is disabled/full even without photos: keep the session's state in memory, tell the player once, and
        // retry much later instead of re-serialising every tick
        warnedFail = true;
        dueAt = clock.t + SAVE_RETRY;
        try { mirror = serialize(store.state); } catch { /* keep the older mirror */ }
        if (!toldFull) { toldFull = true; o.notify?.('full'); }
      }
      return ok;
    },
    load() {
      const raw = readRaw();
      const s = parseSave(raw);
      if (!s || !s.flags.game_started) return false;
      if (atEndingChoice(s)) checkpoint = raw;
      store.replace(cloneState(s), 'save');
      return true;
    },
    hasSave() {
      const s = parseSave(readRaw());
      return !!s && s.flags.game_started === true;
    },
    saveCleared() {
      const s = parseSave(readRaw());
      return !!s && s.flags.game_started === true && s.cleared === true && atEndingChoice(s);
    },
    clearSave() {
      try { storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      dueAt = null; mirror = null;
    },
    update() {
      if (dueAt === null || clock.t < dueAt) {
        // P3 G8: a periodic save after walking somewhere, so 继续 does not put the player back at the last flag change
        if (dueAt === null && o.canAutosave && store.has('game_started') && !store.has('credits_done')
          && clock.t - lastSaveAt >= SAVE_PERIODIC && movedSinceSave() && !o.isBusy() && o.canAutosave()) api.save();
        return;
      }
      if (o.isBusy()) return;                 // never mid-presentation: wait, then write once clear
      api.save();
    },
    flush() {
      if (!store.has('game_started') || store.has('credits_done') || o.isBusy()) return false;
      return api.save();
    },
  };
  return api;
}
