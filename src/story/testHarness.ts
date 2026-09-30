// src/story/testHarness.ts — owner F. Node-only harness for the story tests (ARCHITECTURE §3.F self-test): the real
// core (store, rules, physics, player, loop via core/testkit) + the real story module, with fake ui / lens / chars /
// render / audio that behave like E and D at the logic level (dialogue closes instantly unless it has choices, cards
// resolve on the next microtask, shots write the GDD §8.1 onShot tags/actions directly). Not imported by the game.
import { Object3D, Texture, Vector3 } from 'three';
import type {
  AudioApi, CharactersApi, Core, HeroApi, LensApi, LensState, RenderApi, StoryApi, UiApi,
} from '../contracts';
import type {
  Action, ChapterId, GateVerdict, InputKind, NodeId, Photo, PresetPhotoId, ReceiverId, SpotId, TargetId,
} from '../types';
import { createTestCore } from '../core/testkit';
import type { CoreInternals } from '../core/boot';
import type { StorageLike } from '../core/save';
import { NODES } from '../data/dialogue';
import { INPUTS } from '../data/puzzles';
import { GATE_OUTCOMES, SHOW_FALLBACK, SHOW_REACTIONS } from '../data/show';
import { createStoryImpl, type StoryImpl } from './index';
import { SURFACES, worldToFlat } from '../core/planet';
import { inDarkroomReach } from '../lens/extras';

/** GDD §8.1 onShot (tags + actions) for the targets the story reacts to. */
export const SHOTS: Partial<Record<TargetId, { tags: readonly string[]; actions: readonly Action[] }>> = {
  T_rephoto_2006: { tags: ['rephoto_2006'], actions: [{ set: 'P1_done' }] },
  T_locker17: { tags: ['locker_17'], actions: [{ set: 'locker_seen' }] },
  T_studio_qr: { tags: [], actions: [{ wx: 'wx_auto_studio' }, { set: 'studio_locked_seen' }] },
  T_height_marks: { tags: ['height_marks'], actions: [{ set: 'height_marks_seen' }] },
  // §8.1 also lists wx_after_scan here: the harness keeps it to prove the wx dedupe
  T_temple_qr: { tags: [], actions: [{ photo: 'ph_temple_2011' }, { set: 'idol_scanned' }, { wx: 'wx_after_scan' }] },
  T_rephoto_2011: { tags: ['rephoto_2011'], actions: [{ set: 'P4_done' }] },
  T_tudi: { tags: ['tudi_photo'], actions: [] },
  T_mirror_self: { tags: ['mirror_selfie'], actions: [{ set: 'mirror_selfie' }, { clue: 'clue_sticker' }] },
  T_door_403: { tags: ['door_403'], actions: [{ set: 'door403_found' }] },
  T_meiqiu: { tags: ['cat_meiqiu'], actions: [] },
  T_pigeons: { tags: ['pigeons_flash'], actions: [{ set: 'pigeons_gone' }] },
  T_plaque: { tags: ['plaque'], actions: [{ set: 'plaque_read' }] },
  T_light_trail: { tags: ['trail_1987'], actions: [{ set: 'trail_1987' }] },
  T_frame3_lamp: { tags: ['frame3_seen'], actions: [] },
  T_frame4_pit: { tags: ['frame4_photo'], actions: [{ set: 'frame4_registered' }] },
  // ARCHITECTURE §2.8.16 example puts {beat:'S_zhe'} into onShot: the story's beat dedupe must absorb it
  T_chai: { tags: ['zhe_photo'], actions: [{ set: 'P8_done' }, { beat: 'S_zhe' }] },
  T_zhimei: { tags: ['zhimei_photo'], actions: [] },
  T_zhimei_sea: { tags: ['zhimei_sea'], actions: [] },
};

export interface Recorder {
  cards: string[]; beats: string[]; nodes: string[]; wx: string[]; wxRaw: string[]; toasts: string[]; ui: string[];
  palettes: string[]; heroPlays: string[]; titleShown: number; inputs: { kind: InputKind; ok: boolean }[]; shows: (NodeId | null)[];
}

export interface Harness {
  core: Core; internals: CoreInternals; story: StoryImpl; rec: Recorder; lens: LensState; storage: StorageLike;
  flags(): string[];
  has(f: string): boolean;
  step(n?: number): void;
  settle(): Promise<void>;
  goto(spot: SpotId): void;
  shoot(t: TargetId, o?: { burst?: boolean; night?: boolean }): Photo[];
  interact(id: Parameters<StoryImpl['interactById']>[0]): Promise<void>;
  talk(owner: ReceiverId | 'me'): Promise<void>;
  choose(i: number): void;
  show(receiver: ReceiverId, photoIds: readonly string[]): Promise<void>;
  input(kind: InputKind, value: string | readonly string[]): void;
  night(on: boolean): void;
  tripodSuccess(): void;
  pending(): number;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

export async function createHarness(o: { chapter?: ChapterId; start?: 'skip' | 'intro' } = {}): Promise<Harness> {
  const rec: Recorder = {
    cards: [], beats: [], nodes: [], wx: [], wxRaw: [], toasts: [], ui: [], palettes: [], heroPlays: [], titleShown: 0, inputs: [], shows: [],
  };
  const lensState: LensState = { active: false, zoom: 1, night: false, flash: false, overlay: false, torch: false, peek: null, exposing: false, frame: 'white' };
  let seq = 0;
  let pendingChoice: { node: (typeof NODES)[number]; resolve: () => void } | null = null;
  let timerStarted = false;
  // late binding: the fakes need the core, created below
  let core!: Core;

  const addPhoto = (id: string, tags: readonly string[], extra: Partial<Photo> = {}): Photo => {
    const p: Photo = {
      id, dataURL: '', tags: [...tags], label: id, clock: core.store.state.clock, zoom: 1, night: false, flash: false,
      keep: tags.length > 0, seq: ++seq, ...extra,
    };
    core.store.addPhoto(p);
    return p;
  };

  // ------------------------------------------------------------------ fake E
  const nodeOf = (id: string) => NODES.find((n) => n.id === id) ?? null;
  const closeNode = async (n: (typeof NODES)[number] | null, id: string, extra: readonly Action[] = []) => {
    if (n?.once) core.store.set(`seen:${id}`);
    core.bus.emit('dialogueEnd', { node: id as NodeId });
    await core.rules.run([...(n?.effects ?? []), ...extra], `node:${id}`);
  };
  const ui: UiApi = {
    async init() {
      const r = core.rules;
      r.onAction('node', (a, ctx) => {
        if (ctx.quiet) return r.run(nodeOf(a.node)?.effects ?? [], `node:${a.node}`, { quiet: true });
        return ui.startNode(a.node);
      });
      r.onAction('card', (a, ctx) => (ctx.quiet ? undefined : ui.showCard(a.card, a.id)));
      r.onAction('wx', (a, ctx) => ui.pushWx(a.wx, { quiet: ctx.quiet }));
      r.onAction('memo', () => Promise.resolve());
      r.onAction('toast', (a) => { rec.toasts.push(a.toast); });
      r.onAction('ui', (a) => {
        rec.ui.push(a.ui);
        if (a.ui === 'timer') lens.startTripodTimer();
      });
    },
    showTitle() { rec.titleShown++; },
    hideTitle() { /* noop */ },
    async talk(owner) {
      const best = NODES
        .filter((n) => n.owner === owner && !(n.once && core.store.has(`seen:${n.id}`)) && core.rules.evalCond(n.when))
        .sort((a, b) => b.prio - a.prio)[0];
      if (best) await ui.startNode(best.id);
    },
    startNode(id) {
      rec.nodes.push(id);
      core.bus.emit('dialogueStart', { node: id });
      const n = nodeOf(id);
      if (n?.choices?.length) return new Promise<void>((resolve) => { pendingChoice = { node: n, resolve }; });
      return closeNode(n, id);
    },
    advance() { /* lines close instantly */ },
    choose(i) {
      const pc = pendingChoice;
      if (!pc) return;
      pendingChoice = null;
      const c = pc.node.choices?.[i];
      void (async () => {
        await closeNode(pc.node, pc.node.id, c?.actions ?? []);
        if (c?.then) await ui.startNode(c.then);
        pc.resolve();
      })();
    },
    currentLine: () => null,
    choiceCount: () => pendingChoice?.node.choices?.length ?? 0,
    async showCard(kind, id) {
      rec.cards.push(`${kind}:${id}`);
      core.bus.emit('cardShown', { kind, id });
      await Promise.resolve();
      core.bus.emit('cardClosed', { kind, id });
    },
    skip: () => false,
    async pushWx(id) {
      rec.wxRaw.push(id);
      if (core.store.state.wxLog.some((w) => w.id === id)) return;     // story wx are one-shot (AGENTS.md [F])
      rec.wx.push(id);
      core.store.logWx(id, core.store.state.clock);
      core.bus.emit('wx', { id });
    },
    openPhone() { /* noop */ },
    closeAll() { const pc = pendingChoice; pendingChoice = null; pc?.resolve(); },
    async openInput() { /* noop */ },
    submitInput(kind, value) {
      const def = INPUTS[kind];
      const v = Array.isArray(value) ? value : [String(value)];
      const ok = kind === 'locker' ? v[0] === def.answer[0] && v[1] === def.answer[1] : v.join('') === def.answer.join('');
      rec.inputs.push({ kind, ok });
      core.bus.emit('inputResult', { kind, ok, value: v.join('') });
      void core.rules.run(ok ? def.onOk : def.onFail ?? [], `input:${kind}`);
    },
    async openShow() { /* noop */ },
    async show(receiver, photoIds) {
      const photos = photoIds.map((id) => core.store.photo(id)).filter((p): p is Photo => !!p);
      core.bus.emit('show', { receiver, photoIds: [...photoIds] });
      if (receiver === 'gate') {
        const v = gateVerdict(photos);
        const out = GATE_OUTCOMES[v];
        rec.shows.push(out.node);
        await ui.startNode(out.node);
        await core.rules.run(out.actions ?? [], 'show:gate');
        return;
      }
      const tags = new Set(photos.flatMap((p) => p.tags));
      const row = SHOW_REACTIONS.find((r) => r.receiver === receiver && core.rules.evalCond(r.when) && r.tags.some((t) => tags.has(t)));
      const node = row?.node ?? SHOW_FALLBACK.find((r) => r.receiver === receiver && core.rules.evalCond(r.when))?.node ?? null;
      rec.shows.push(node);
      if (node) await ui.startNode(node);
      await core.rules.run(row?.actions ?? [], `show:${receiver}`);
    },
    toast(key) { rec.toasts.push(key); },
    requestHint() { /* noop */ },
    busy: () => ({ dialogue: pendingChoice !== null, card: false, modal: null }),
  };

  // ------------------------------------------------------------------ fake D
  const lens: LensApi = {
    state: lensState,
    async init() {
      core.rules.onAction('photo', (a) => lens.renderPreset(a.photo).then(() => undefined));
      core.rules.onAction('detach', (a, ctx) => (ctx.quiet ? undefined : lens.enterPeek(a.detach)));
      core.bus.on('teleported', () => { lens.setViewfinder(false); lensState.peek = null; });
    },
    setViewfinder(on) {
      if (lensState.active === on) return;
      lensState.active = on;
      if (!on) lensState.night = false;
      core.bus.emit('viewfinder', { on });
    },
    setZoom(z) { lensState.zoom = z; },
    setLens(x) {
      if (x.night) lens.setViewfinder(true);
      Object.assign(lensState, Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)));
      core.bus.emit('lensChanged', { zoom: lensState.zoom, night: lensState.night, flash: lensState.flash, overlay: lensState.overlay, torch: lensState.torch });
    },
    aim() { lens.setViewfinder(true); },
    evalNow: () => ({ frame: 'white', targetId: null, label: '', confidence: null, failed: null, hint: null, tags: [] }),
    shoot: () => ({ frame: 'white', targetId: null, label: '', confidence: null, failed: null, hint: null, tags: [] }),
    async enterPeek(id) { lensState.peek = id; core.bus.emit('peek', { id }); },
    async exitPeek() { lensState.peek = null; core.bus.emit('peek', { id: null }); },
    startTripodTimer() { timerStarted = true; },
    async renderPreset(id: PresetPhotoId) { return core.store.state.photos.find((p) => p.preset === id) ?? addPhoto(id, [id], { preset: id, keep: true }); },
    async darkroomReveal() { await lens.renderPreset('ph_2023_stitched'); },
    darkroomInRange() {
      if (core.player.scene !== 'studio_int') return false;
      const s = SURFACES.studio_int;
      return inDarkroomReach(worldToFlat(s, core.player.pos()), worldToFlat(s, core.services.world.spotPos('dk_line', new Vector3())));
    },
    lastPhotoId: () => core.store.state.photos.at(-1)?.id ?? null,
    isNightView: () => lensState.active && lensState.night,
  };

  // ------------------------------------------------------------------ fake C / A
  const hero: HeroApi = {
    root: new Object3D(), head: new Object3D(),
    lensPos: (out) => out.set(0, 81.7, 0), setFirstPerson() {}, setExpression() {}, flashFace() {}, setScreen() {},
    async detachHead() {}, setTorch() {}, async play(a) { rec.heroPlays.push(a); },
  };
  const chars: CharactersApi = {
    async init() {}, hero, npc: () => null, faceState: () => 'mosaic', faceTexture: () => new Texture(),
    busZero: { root: new Object3D(), async arrive() {}, async depart() {} },
  };
  const render = {
    async init() {}, frame() {}, capture: () => ({}) as HTMLCanvasElement,
    createLiveView: () => ({ texture: new Texture(), render() {}, dispose() {} }),
    fxScene: () => ({}) as ReturnType<RenderApi['fxScene']>,
    setPalette(k: string) { rec.palettes.push(k); }, setViewfinder() {},
    registerLamp: () => ({ setOn() {}, remove() {} }), setSmoke() {}, async compile() {},
    stats: () => ({ calls: 0, triangles: 0, programs: 0 }), uncanny: () => 0, timeRender: () => 0, snapshot: () => '',
  } as RenderApi;
  const audio: AudioApi = { async init() {}, async unlock() {}, play() {}, setMuted() {}, setVolume() {} };

  const tc = createTestCore({ services: { ui, lens, chars, render, audio } });
  core = tc.core;
  const internals = tc.internals;
  const story = createStoryImpl(core);
  (core.services as { story: StoryApi }).story = story;
  core.bus.on('beatStart', ({ id }) => { rec.beats.push(id); });
  await lens.init(); await ui.init(); await story.init();

  const h: Harness = {
    core, internals, story, rec, lens: lensState, storage: tc.storage,
    flags: () => Object.keys(core.store.state.flags),
    has: (f) => core.store.has(f as never),
    step(n = 1) { internals.loop.step(n, 1 / 60); },
    async settle() {
      for (let i = 0; i < 400; i++) {
        internals.loop.step(5, 1 / 60);
        await flush();
        if (story.currentBeat()) story.skip();
        if (pendingChoice) return;
        if (!story.currentBeat() && core.rules.pending() === 0) { await flush(); if (core.rules.pending() === 0 && !story.currentBeat()) return; }
      }
    },
    goto(spot) { void core.player.goto(spot, { fade: false }); },
    shoot(t, so = {}) {
      const s = SHOTS[t] ?? { tags: [], actions: [] };
      const out: Photo[] = [];
      const n = so.burst ? 3 : 1;
      for (let k = 0; k < n; k++) {
        let tags = [...s.tags];
        if (t === 'T_granny_face') tags = [k % 2 === 0 ? 'granny_face_open' : 'granny_face_closed'];
        const p = addPhoto(`p${seq + 1}`, tags, { night: !!so.night, keep: tags.length > 0 });
        core.bus.emit('photoTaken', { photo: p, result: { frame: 'green', targetId: t, label: t, confidence: 90, failed: null, hint: null, tags } });
        void core.rules.run(s.actions, `shot:${t}`);
        out.push(p);
      }
      return out;
    },
    // never awaited to the end: interact actions may hold sim-time waits (it_lh_switch) that only ticks resolve
    async interact(id) { void story.interactById(id); await flush(); },
    async talk(owner) { await ui.talk(owner as ReceiverId); },
    choose(i) { ui.choose(i); },
    show: (receiver, ids) => ui.show(receiver, ids),
    input(kind, value) { ui.submitInput(kind, value); },
    night(on) { lens.setLens({ night: on }); },
    tripodSuccess() {
      if (!timerStarted) return;
      void lens.renderPreset('ph_2026_group');
      void core.rules.run([{ set: 'group_photo_done' }], 'tripod');
    },
    pending: () => core.rules.pending(),
  };

  if (o.chapter) story.bootChapter(o.chapter);
  else if (o.start) await story.startGame({ skipIntro: o.start === 'skip' });
  return h;
}

/** E's GDD §9 P3 classification (only granny_face_* count as her face). */
export function gateVerdict(photos: readonly Photo[]): GateVerdict {
  const face = (p: Photo) => p.tags.includes('granny_face_open') || p.tags.includes('granny_face_closed');
  const faces = photos.filter(face);
  if (faces.length >= 2) {
    const open = faces.filter((p) => p.tags.includes('granny_face_open')).length;
    return open === faces.length ? 'both_open' : open === 0 ? 'both_closed' : 'pass';
  }
  if (faces.length === 1) return 'one';
  if (photos.some((p) => p.tags.some((t) => t.startsWith('npc:') && t !== 'npc:granny_wang'))) return 'other';
  return 'noface';
}
