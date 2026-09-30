// src/story/index.ts — owner F. createStory: the StoryApi (ARCHITECTURE §2.7 / §3.F) — game start / continue /
// chapter boot, the FIFO beat runner, quiet solve(), smoke targets, and the {beat} action handler.
import { Vector3 } from 'three';
import type { ModuleFactory, StoryApi, Core } from '../contracts';
import type { BeatId, ChapterId, GameState, InteractId, PuzzleId, Action } from '../types';
import { BEAT_RECOVERY, CHAPTER_BOOT, CHAPTERS, GAME_START_EFFECTS, STORY_RULES } from '../data/story';
import { chapterSeenFlags } from './bootTuts';
import { PUZZLES, SOLVE_REWARDS } from '../data/puzzles';
import { initialState } from '../core/state';
import { isFlagId } from '../core/params';
import { SURFACES, dirToHeading, flatToChart, frameAt, worldToFlat } from '../core/planet';
import { Director } from './director';
import { BEAT_SCRIPTS, wakeEndPose } from './beats';
import { installDarkroomCams } from './cams';
import { beatEnd, createQuiet } from './quiet';
import { createGlue } from './glue';
import { createSmoke } from './smoke';

export interface StoryImpl extends StoryApi {
  /** Tests / dev: run the enabled interact row with this id. */
  interactById(id: InteractId): Promise<void>;
  /** Tests / dev: apply actions quietly (the solve()/boot path). */
  applyQuiet(actions: readonly Action[]): void;
}

const BEAT_IDS = Object.keys(BEAT_SCRIPTS) as BeatId[];

export function createStoryImpl(core: Core): StoryImpl {
  const { store, rules, bus, log } = core;
  const d = new Director(core);
  const quiet = createQuiet(core);
  const smoke = createSmoke(core);
  const queue: { id: BeatId; resolve: () => void }[] = [];
  let running: BeatId | null = null;
  /** Bumped by stopBeats(): a beat aborted by a chapter boot / new game must not apply its end to the new state. */
  let generation = 0;

  const svc = () => core.services;
  const tryDo = (what: string, fn: () => unknown) => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch((e: unknown) => log.warn(`[story] ${what}`, e));
    } catch (e) { log.warn(`[story] ${what} failed`, e); }
  };

  // ---------------------------------------------------------------- beat runner (FIFO, one at a time)
  const pump = async (): Promise<void> => {
    if (running) return;
    const next = queue.shift();
    if (!next) return;
    running = next.id;
    const gen = generation;
    d.begin(`beat:${next.id}`);
    const popCtx = core.input.pushContext('cutscene', 'story:beat');
    bus.emit('beatStart', { id: next.id });
    try { await BEAT_SCRIPTS[next.id]({ core, d }); } catch (e) { log.warn(`[story] beat ${next.id} threw`, e); }
    d.end();
    popCtx();
    running = null;
    // the state the beat guarantees (after a skip too); effect rules keyed on its flags fire as usual — unless the
    // state it belonged to was replaced meanwhile (bootChapter / startGame)
    if (gen === generation) void rules.run(beatEnd(next.id), `beat-end:${next.id}`);
    bus.emit('beatEnd', { id: next.id });
    next.resolve();
    void pump();
  };

  const playBeat = (id: BeatId, force = false): Promise<void> => {
    if (!BEAT_SCRIPTS[id]) { log.warn(`[story] unknown beat ${id}`); return Promise.resolve(); }
    if (!force && (store.has(`seen:beat.${id}`) || running === id || queue.some((q) => q.id === id))) return Promise.resolve();
    store.set(`seen:beat.${id}`);
    return new Promise<void>((resolve) => { queue.push({ id, resolve }); void pump(); });
  };

  /** Abort whatever beat runs and drop the queue (chapter boot, new game). */
  const stopBeats = () => {
    generation++;
    for (const q of queue.splice(0)) q.resolve();
    if (running) d.abort(true);
  };

  const finishCredits = () => {
    // GDD §10.2 #49: back to the title; core already rewrote the save as a cleared one
    store.markCleared();
    tryDo('palette', () => svc().render.setPalette('title', 1.5));
    tryDo('title orbit', () => core.cameraRig.setTitleMode(true));
    tryDo('hero', () => { svc().chars.hero.root.visible = true; });
    tryDo('title', () => svc().ui.showTitle());
  };

  const glue = createGlue(core, { playBeat: (id) => playBeat(id), finishCredits });

  const leaveTitle = () => {
    tryDo('hideTitle', () => svc().ui.hideTitle());
    core.cameraRig.setTitleMode(false);
    tryDo('hero', () => { svc().chars.hero.root.visible = true; });
  };

  const emitPhase = () => {
    const s = store.state;
    bus.emit('phaseChanged', { phase: s.phase, palette: s.palette, chapter: s.chapter, instant: true });
  };

  /** Player position from a save snapshot (world coords → chart/local Pos + yaw). */
  const restorePlayer = (s: GameState): boolean => {
    const p = s.player;
    const v = new Vector3(p.pos[0], p.pos[1], p.pos[2]);
    const surf = SURFACES[p.scene];
    if (!surf || !Number.isFinite(v.x) || v.distanceTo(surf.center) < surf.radius * 0.5) return false;
    const f = worldToFlat(surf, v);
    if (p.scene === 'planet' && Math.hypot(f.x, f.z) < 0.5) return false;          // the untouched default (pole)
    const at = p.scene === 'planet' ? flatToChart({ x: f.x, z: f.z, h: f.h }) : { x: f.x, y: f.h, z: f.z };
    const h = new Vector3(p.heading[0], p.heading[1], p.heading[2]);
    const yaw = h.lengthSq() > 1e-6 ? dirToHeading(frameAt(surf, v), h) : 0;
    core.player.teleport({ scene: p.scene, at, yawDeg: yaw, pitchDeg: 0 });
    return true;
  };

  const api: StoryImpl = {
    async init() {
      // beats: loud → the runner; quiet (someone else's quiet run) → the end state only
      rules.onAction('beat', (a, ctx) => {
        if (ctx.quiet) { quiet.apply([a]); return undefined; }
        return playBeat(a.beat);
      });
      core.loop.addSystem('story:director', 'logic', () => { d.poll(); });
      installDarkroomCams(core);                     // P3r2 look L1: the darkroom bench / drying-line camera
      glue.init();                                   // listeners before loadStory (see glue.ts)
      rules.loadStory(STORY_RULES);
    },

    async startGame(o) {
      stopBeats();
      leaveTitle();
      // 「开机」 after a finished or loaded run starts over (keep only the cleared mark)
      if (Object.keys(store.state.flags).length > 0 || store.state.photos.length > 0) {
        const fresh = initialState(store.state.seed);
        fresh.cleared = store.state.cleared;
        store.replace(fresh, 'reset');
      }
      glue.reset();
      await core.player.goto('sp_bus_bench', { fade: false });
      if (o.skipIntro) {
        // ?skipTitle: straight into the playable state (S_wake's end, no fades/cards)
        quiet.apply([{ set: 'game_started' }, ...GAME_START_EFFECTS]);
        try { wakeEndPose(core); } catch (e) { core.log.warn('[story] wake end pose', e); }   // P3r2 (camera)
        emitPhase();
        bus.emit('gameStarted', { fromSave: false });
      } else {
        bus.emit('gameStarted', { fromSave: false });   // rule #1 → chapter, preset photo, S_wake
      }
    },

    async continueGame() {
      stopBeats();
      if (!store.load()) { await api.startGame({ skipIntro: false }); return; }
      leaveTitle();
      glue.reset();
      emitPhase();
      if (!restorePlayer(store.state)) await core.player.goto(CHAPTER_BOOT[store.state.chapter].spot, { fade: false });
      for (const p of CHAPTER_BOOT[store.state.chapter].presets) tryDo('preset', () => svc().lens.renderPreset(p));
      bus.emit('gameStarted', { fromSave: true });
      // a save never lands mid-beat, but if one did, finish that beat's end state now
      for (const r of BEAT_RECOVERY) if (rules.evalCond(r.when)) void rules.run(beatEnd(r.beat), `recover:${r.beat}`);
    },

    playBeat: (id) => playBeat(id),
    currentBeat: () => running,

    skip() {
      if (!running || d.aborted) return false;
      d.abort();
      tryDo('close dialogue', () => { if (svc().ui.busy().dialogue) svc().ui.closeAll(); });
      return true;
    },

    bootChapter(c: ChapterId) {
      const boot = CHAPTER_BOOT[c];
      const ch = CHAPTERS.find((x) => x.id === c);
      if (!boot || !ch) { log.warn(`[story] bootChapter: unknown chapter ${c}`); return; }
      stopBeats();
      tryDo('closeAll', () => svc().ui.closeAll());
      leaveTitle();
      const s = initialState(store.state.seed);
      s.chapter = c; s.phase = boot.phase; s.palette = boot.palette; s.clock = boot.clock;
      for (const f of boot.flags) s.flags[f] = true;
      for (const f of chapterSeenFlags(c)) s.flags[f] = true;   // P3r3: tutorials a real run has done by now
      for (const i of boot.items) if (isFlagId(i)) s.flags[i] = true;
      s.items = [...boot.items]; s.verbs = [...boot.verbs]; s.clues = [...boot.clues]; s.objective = boot.objective;
      s.cleared = store.state.cleared;
      glue.reset();
      // mark every rule the boot state already satisfies as fired (its effects are part of the boot state)
      const wx = quiet.withRulesMarked(() => store.replace(s, 'chapter'));
      for (const id of wx) store.logWx(id, boot.clock);
      emitPhase();
      for (const p of boot.presets) tryDo('preset', () => svc().lens.renderPreset(p));
      void core.player.goto(boot.spot, { fade: false });
    },

    solve(p: PuzzleId) {
      const def = PUZZLES.find((x) => x.id === p);
      if (!def) { log.warn(`[story] solve: unknown puzzle ${p}`); return; }
      const acts: Action[] = [];
      for (const f of def.steps) acts.push(isItemFlag(f) ? { give: f } : { set: f });
      acts.push(...SOLVE_REWARDS[p], { set: def.solvedFlag });
      quiet.apply(acts);
    },

    smokeTarget: () => smoke(),
    smokeStep: (o) => smoke.step(o),

    devHook(arg: string) {
      // ?dev=story:<BeatId> replays a beat (screenshots); ?dev=story:solve:<PuzzleId>; ?dev=story:chapter:<id>
      const [cmd, x] = arg.split(':');
      if ((BEAT_IDS as string[]).includes(cmd)) void playBeat(cmd as BeatId, true);
      else if (cmd === 'solve' && x) api.solve(x as PuzzleId);
      else if (cmd === 'chapter' && x) api.bootChapter(x as ChapterId);
      else log.warn(`[story] devHook: unknown ${arg}`);
    },

    interactById: (id) => glue.interactById(id),
    applyQuiet: (actions) => quiet.apply(actions),
  };
  return api;
}

const ITEM_FLAGS = new Set<string>(['key_rooftop', 'frame_1', 'frame_2', 'frame_3', 'frame_4']);
function isItemFlag(f: string): f is 'key_rooftop' | 'frame_1' | 'frame_2' | 'frame_3' | 'frame_4' { return ITEM_FLAGS.has(f); }

export const createStory: ModuleFactory<StoryApi> = (core) => createStoryImpl(core);
