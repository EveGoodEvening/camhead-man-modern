// src/debug.ts — owner: S. FROZEN. window.__game (GDD §19.2, ARCHITECTURE §2.9); present in production builds too.
// Every method is safe to call at any time: bad ids log a warning and do nothing.
import { Vector3 } from 'three';
import type { Core, DebugState, GameDebug, Pos, Vec3Tuple } from './contracts';
import type {
  BestiaryId, ClueId, FlagId, InputKind, ItemId, LocationId, NpcId, PeekId, PresetPhotoId, PuzzleId, SpotId, Verb, Zoom,
} from './types';
import type { CoreInternals } from './core/boot';
import { LOCATIONS } from './data/locations';
import { CLUE_IDS } from './data/ids/story';
import { TARGET_IDS } from './data/ids/lens';
import { BESTIARY_IDS, isChapterId, isFlagId, isPhase, isSpotId } from './core/params';
import { DEFAULT_PALETTE } from './core/state';
import { DEG, PLANET_R, posToWorld } from './core/planet';

declare global { interface Window { __game: GameDebug } }

// Record<Union, 1> keys: the compiler checks these runtime lists are complete.
const keys = <T extends string>(r: Record<T, 1>): readonly T[] => Object.keys(r) as T[];
const ITEM_IDS = keys<ItemId>({ key_ring: 1, note_dad: 1, key_rooftop: 1, frame_1: 1, frame_2: 1, frame_3: 1, frame_4: 1, cinnabar_dot: 1, envelope_dad: 1 });
const VERBS = keys<Verb>({
  move: 1, run: 1, look: 1, interact: 1, viewfinder: 1, shutter: 1, burst: 1, zoom: 1, scan: 1, flash: 1, torch: 1, show: 1,
  rephoto: 1, night: 1, detach: 1, signal: 1, phone: 1, hint: 1,
});
const PRESETS = keys<PresetPhotoId>({ ph_2006_group: 1, ph_temple_2011: 1, ph_2023_stitched: 1, ph_2026_group: 1 });
const PUZZLES = keys<PuzzleId>({
  P1_rephoto_bridge: 1, P2_signal_locker: 1, P3_face_gate: 1, P4_tudi_face: 1, P5_rooftop_coop: 1, P6_lighthouse_1987: 1,
  P7_line_zero: 1, P8_chai_to_zhe: 1, P9_paper_eye: 1,
});
const NPCS = keys<NpcId>({ xiaolin: 1, granny_wang: 1, old_chen: 1, xiaoliu: 1, tudi: 1, meiqiu: 1, zhimei: 1, chai: 1, attendant: 1, lao_zhou: 1 });
const PEEKS = keys<PeekId>({ pk_coop: 1, pk_psd: 1, tripod: 1, lh_door: 1 });
const INPUT_KINDS = keys<InputKind>({ locker: 1, lighthouse: 1, namepicker: 1, milkbox: 1 });
const ZOOMS: readonly Zoom[] = [1, 3, 10];
const has = <T extends string>(list: readonly T[], s: string): s is T => (list as readonly string[]).includes(s);
const tuple = (v: Vector3): Vec3Tuple => [v.x, v.y, v.z];

export function installDebug(core: Core, internals: CoreInternals): GameDebug {
  const { loop, input, clock, store } = internals;
  const safe = <T>(what: string, fn: () => T, fallback: T): T => {
    try { return fn(); } catch (e) { core.log.warn(`[__game] ${what} failed`, e); return fallback; }
  };
  /** Bad ids never throw (§2.9): warn and report false so the caller does nothing. */
  /** P3r3: verbs that stand for a real E (interact, talk, a keypad input, detach) end the 「按 [E]」 teaching prompt. */
  const taughtE = () => { if (!core.store.has('seen:tut_interact')) core.store.set('seen:tut_interact'); };
  const valid = (ok: boolean, what: string, v: unknown): boolean => {
    if (!ok) core.log.warn(`[__game] ${what}: unknown id ${JSON.stringify(v)}`);
    return ok;
  };
  const openVf = () => { if (!core.services.lens.state.active) core.services.lens.setViewfinder(true); };
  const toWorld = (p: Pos | Vec3Tuple): Vector3 => (Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : posToWorld(core.scenes.active, p));
  let popFree: (() => void) | null = null;
  let frozenByUser = false;

  const state = (): DebugState => {
    const s = store.state, svc = core.services;
    const pos = core.player.pos(), hd = core.player.heading();
    const ui = safe('ui.busy', () => svc.ui.busy(), { dialogue: false, card: false, modal: null });
    const beat = safe('story.currentBeat', () => svc.story.currentBeat(), null);
    const actions = core.rules.pending();
    const cur = core.interact.current();
    const stats = safe('render.stats', () => svc.render.stats(), { calls: 0, triangles: 0, programs: 0 });
    return {
      chapter: s.chapter, phase: s.phase, palette: s.palette, clock: s.clock,
      cleared: s.cleared,
      flags: Object.keys(s.flags) as FlagId[], items: [...s.items], verbs: [...s.verbs], clues: [...s.clues], objective: s.objective,
      scene: core.player.scene, pos: tuple(pos), chart: core.player.chart(), heading: tuple(hd), yaw: core.player.yawDeg(),
      dialogue: safe('ui.currentLine', () => svc.ui.currentLine(), null),
      choices: safe('ui.choiceCount', () => svc.ui.choiceCount(), 0),
      prompt: cur ? { id: cur.id, verb: cur.prompt } : null,
      busy: { any: ui.dialogue || ui.card || beat !== null || ui.modal !== null || actions > 0, dialogue: ui.dialogue, card: ui.card, beat, modal: ui.modal, actions },
      photos: s.photos.map((p) => ({ id: p.id, tags: [...p.tags], label: p.label })),
      lens: { ...safe('lens.state', () => svc.lens.state, { active: false, zoom: 1, night: false, flash: false, overlay: false, torch: false, peek: null, exposing: false, frame: 'white' }) },
      actors: core.actors.list().filter((a) => a.id !== 'hero').map((a) => ({
        id: a.id, scene: a.scene, pos: tuple(a.root.getWorldPosition(new Vector3())),
        spot: safe('actor.spot', () => a.spot?.() ?? null, null), layer: a.layer, visible: a.root.visible,
      })),
      faceState: safe('chars.faceState', () => svc.chars.faceState(), 'mosaic'),
      uncanny: safe('render.uncanny', () => svc.render.uncanny(), 0),
      calls: stats.calls, triangles: stats.triangles, programs: stats.programs, frame: clock.frame, t: clock.t,
      smoke: safe('story.smokeTarget', () => {
        const sp = svc.story.smokeTarget();
        return sp ? { spot: sp, pos: tuple(svc.world.spotPos(sp, new Vector3())) } : null;
      }, null),
    };
  };

  const api: GameDebug = {
    ready: false,
    step(frames = 1, dt = 1 / 60, move = null) {
      safe('step', () => {
        const n = Math.max(0, Math.floor(frames));
        if (!loop.paused) for (let i = 0; i < n; i++) { input.inject({ move }); loop.tick(dt); }
        loop.render(dt);
      }, undefined);
      return state();
    },
    freeze(on = true) { frozenByUser = on; clock.frozen = on || loop.paused; },
    // unpausing restores the freeze() state instead of always thawing animT
    pause(on = true) { loop.setPaused(on); clock.frozen = on || frozenByUser; },
    goto(spot) {
      if (!isSpotId(spot)) { core.log.warn(`[__game] goto: unknown spot ${spot}`); return; }
      safe('goto', () => { void core.player.goto(spot, { fade: false }); }, undefined);
    },
    teleport(latOrPlace, lon, headingDeg) {
      safe('teleport', () => {
        if (typeof latOrPlace === 'number') {
          const r = (90 - latOrPlace) * DEG * PLANET_R;
          core.player.teleport({ scene: 'planet', at: { r, lon: lon ?? 0 }, yawDeg: headingDeg });
        } else if (isSpotId(latOrPlace)) {
          void core.player.goto(latOrPlace as SpotId, { fade: false });
          if (headingDeg !== undefined) core.cameraRig.look(headingDeg, core.cameraRig.pitchDeg);
        } else {
          const loc = LOCATIONS.find((l) => l.id === (latOrPlace as LocationId));
          if (!loc) { core.log.warn(`[__game] teleport: unknown place ${latOrPlace}`); return; }
          core.player.teleport({ scene: 'planet', at: loc.center, yawDeg: headingDeg });
        }
      }, undefined);
    },
    skip() { safe('skip', () => core.services.ui.skip() || core.services.story.skip(), false); },
    setPhase(p) { if (valid(isPhase(p), 'setPhase', p)) safe('setPhase', () => store.setPhase(p, DEFAULT_PALETTE[p], true), undefined); },
    setChapter(c) { if (valid(isChapterId(c), 'setChapter', c)) safe('setChapter', () => core.services.story.bootChapter(c), undefined); },
    grant(id) {
      safe('grant', () => {
        if (has(BESTIARY_IDS, id)) store.addBestiary(id as BestiaryId);
        else if (has(ITEM_IDS, id)) store.give(id);
        else if (isFlagId(id)) store.set(id);
        else if (has(VERBS, id)) store.unlockVerb(id);
        else if (has(CLUE_IDS, id)) store.addClue(id as ClueId);
        else if (has(PRESETS, id)) void core.services.lens.renderPreset(id);
        else core.log.warn(`[__game] grant: unknown id ${id}`);
      }, undefined);
    },
    setFlag(id) { api.grant(id); },
    solve(p) { if (valid(has(PUZZLES, p), 'solve', p)) safe('solve', () => core.services.story.solve(p), undefined); },
    look(yawDeg, pitchDeg) {
      safe('look', () => {
        // §2.9: D's lens pitch (−60..+70) while the viewfinder / a peek is open; the follow rig clamps to −30..+20
        const lens = core.services.lens;
        if (lens.state.active && lens.look) lens.look(yawDeg, pitchDeg);
        else core.cameraRig.look(yawDeg, pitchDeg);
      }, undefined);
    },
    aim(target) { if (valid(has(TARGET_IDS, target), 'aim', target)) safe('aim', () => { openVf(); core.services.lens.aim(target); }, undefined); },
    viewfinder(on) { safe('viewfinder', () => core.services.lens.setViewfinder(on), undefined); },
    setPhoneMode(on) { api.viewfinder(on); },
    zoom(z: Zoom) { if (valid(ZOOMS.includes(z), 'zoom', z)) safe('zoom', () => { openVf(); core.services.lens.setZoom(z); }, undefined); },
    lens(o) { safe('lens', () => { openVf(); core.services.lens.setLens(o); }, undefined); },
    setRef(id) { safe('setRef', () => store.setRefPhoto(id), undefined); },
    shoot(o) {
      return safe('shoot', () => { openVf(); return core.services.lens.shoot(o); },
        { frame: 'white', targetId: null, label: '', confidence: null, failed: null, hint: null, tags: [] });
    },
    evalShot() {
      return safe('evalShot', () => core.services.lens.evalNow(),
        { frame: 'white', targetId: null, label: '', confidence: null, failed: null, hint: null, tags: [] });
    },
    interact() {
      safe('interact', () => {
        const lens = core.services.lens;
        const peek = lens.state.peek;
        // the pick normally updates once per tick: re-pick first so `goto(X); interact()` in one call hits X (requests-F #1)
        const fresh = () => { core.interact.repick(); void core.interact.trigger(); };
        if (peek === 'pk_coop' || peek === 'pk_psd') void lens.exitPeek();
        else if (peek === 'tripod') lens.startTripodTimer();
        else if (peek === 'lh_door') fresh();
        else if (lens.isNightView()) {                     // D's crosshair talk (P3r3: past the real-E gate)
          if (lens.nightTalk) lens.nightTalk(); else { input.inject({ press: ['interact'] }); loop.tick(1 / 60); }
        }
        else fresh();
        taughtE();   // P3r3: like a real E on every path (peeks, tripod, night talk)
      }, undefined);
    },
    talk(npc) { if (valid(has(NPCS, npc), 'talk', npc)) safe('talk', () => { taughtE(); void core.services.ui.talk(npc); }, undefined); },
    advance(n) { safe('advance', () => core.services.ui.advance(n), undefined); },
    choose(i) { safe('choose', () => core.services.ui.choose(i), undefined); },
    show(receiver, photoIds) { if (valid(receiver === 'gate' || has(NPCS, receiver), 'show', receiver)) safe('show', () => { void core.services.ui.show(receiver, photoIds); }, undefined); },
    input(kind, value) { if (valid(has(INPUT_KINDS, kind), 'input', kind)) safe('input', () => { taughtE(); core.services.ui.submitInput(kind, value); }, undefined); },
    detach(peek) { if (valid(has(PEEKS, peek), 'detach', peek)) safe('detach', () => { taughtE(); void core.services.lens.enterPeek(peek); }, undefined); },
    reattach() { safe('reattach', () => { void core.services.lens.exitPeek(); }, undefined); },
    lastPhotoId: () => safe('lastPhotoId', () => core.services.lens.lastPhotoId(), null),
    freeCam(o) {
      safe('freeCam', () => {
        popFree?.(); popFree = null;
        if (!o) return;
        const at = toWorld(o.at), look = toWorld(o.lookAt);
        popFree = core.cameraRig.push('debug', (cam) => {
          cam.position.copy(at);
          cam.up.copy(at).sub(core.scenes.surface(core.scenes.active).center).normalize();
          cam.lookAt(look);
        });
      }, undefined);
    },
    state: () => state(),
    getState: () => state(),
    snapshot: () => safe('snapshot', () => core.services.render.snapshot(), ''),
    timeRender: (n = 8) => safe('timeRender', () => core.services.render.timeRender(n), -1),
  };
  window.__game = api;
  return api;
}
