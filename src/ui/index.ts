// src/ui/index.ts — owner E. The DOM shell and its engines (ARCHITECTURE §3.E): title, dialogue, cards, phone, HUD, hints,
// show, inputs, pause/settings. Public entry: createUi (UiApi, §2.7). Everything else in src/ui is internal.
import { Vector3 } from 'three';
import './styles/base.css';
import './styles/dialog.css';
import './styles/phone.css';
import './styles/widgets.css';
import './styles/cards.css';
import type { Handle, ModuleFactory, UiApi } from '../contracts';
import type { ReceiverId, Settings, SfxId } from '../types';
import { NODES } from '../data/dialogue';
import { CLUES } from '../data/items';
import { DLG, has, t } from '../data/zh';
import { createCards } from './cards/cards';
import { isNpc, makeLayers, speakerName, type UiCtx } from './ctx';
import { createDialogue, receiverFor } from './dialog/controller';
import { trackScale } from './dom';
import { createHintRuntime } from './hintRuntime';
import { createHud } from './hud/hud';
import { createWayfinder } from './hud/wayfinder';
import { createToasts } from './hud/toast';
import { createTutorials, type TutView } from './hud/tutorial';
import { createInputs } from './inputs/inputs';
import { endAdvanceTick, ModalStack, trackAdvanceSource } from './modal';
import { openNotices } from './notices';
import { createPause } from './pause';
import { createPhone } from './phone/phone';
import { itemDesc, itemIcon, itemName } from './phone/album';
import { applySettings, loadSettings, openSettings, saveSettings } from './settings';
import { openControls } from './controls';
import { createShow } from './show/show';
import { createTitle } from './title';
import { createWx } from './wx';
import { runDevHook } from './dev';
import { createTouch } from './touch';

export type UiInternals = ReturnType<typeof buildUi>;

function buildUi(core: Parameters<ModuleFactory<UiApi>>[0]) {
  const { root, layers } = makeLayers();
  const test = core.params.test;
  const modals = new ModalStack(core, layers.modal);
  const deferred: (() => void)[] = [];
  // Context pops requested while a tick is still before its input consumers (the E / Space press that closed a dialog
  // or card must not also interact, walk or fire the shutter) wait for the tick's `late` phase. Outside a tick
  // (__game calls, promise continuations) they apply at once, so `advance(9); goto(X); interact()` in one call works.
  const tick = { early: false };
  const ctx: UiCtx = {
    core, root, layers, test,
    settings: loadSettings(test),
    nameOf: (s) => speakerName(core, s),
    meName: () => (core.store.has('name_known') ? t('ui.name.me') : t('ui.name.unknown')),
    sfx: (id: SfxId) => { if (!test) core.bus.emit('sfx', { id }); },
    toast: (key, vars, kind) => toasts.push(key, vars, kind),
    modalKind: () => modals.kind,
    phoneOnWx: () => phone.isOpen && phone.tab === 'wx',
    nextTick: (fn) => { if (tick.early) deferred.push(fn); else fn(); },
  };
  const toasts = createToasts(core, layers.toast);
  const hud = createHud(ctx);
  toasts.setAvoid(hud.chipEl());
  const way = createWayfinder(ctx);   // P3 wayfinding: incense arrow at the screen edge
  const tuts = createTutorials(core, layers.tut, layers.top);
  const wx = createWx(ctx);
  const hints = createHintRuntime(ctx, wx, tuts);
  const cards = createCards(ctx);
  let showEngine: ReturnType<typeof createShow> | null = null;
  const dialogue = createDialogue(ctx, (r) => { void showEngine?.openShow(r); });
  showEngine = createShow(ctx, modals, (id) => dialogue.startNode(id as never));
  const show = showEngine;
  const inputs = createInputs(ctx, modals);
  const phone = createPhone(ctx, modals, wx, () => hints.request());
  const setSettings = (s: Settings) => { ctx.settings = s; saveSettings(s, test); applySettings(core, s); };
  const controls = (onDone?: () => void) => openControls(modals, onDone);
  const settings = (onDone?: () => void) => openSettings(modals, () => ctx.settings, setSettings, onDone, controls);
  let popTitle: (() => void) | null = null;
  const title = createTitle(ctx, {
    start: () => { void core.services.audio.unlock().catch(() => undefined); hideTitle(); void core.services.story.startGame({ skipIntro: false }); },
    cont: () => { void core.services.audio.unlock().catch(() => undefined); hideTitle(); void core.services.story.continueGame(); },
    settings: () => settings(),
    notices: (done) => openNotices(modals, done),
  });
  layers.hud.append(title.el);
  const showTitle = () => {
    modals.closeAll(); dialogue.clearQueue(); dialogue.closeCurrent(); toasts.clear();
    title.show(core.store.hasSave(), core.store.saveCleared?.() ?? false);
    if (!popTitle) popTitle = core.input.pushContext('title', 'ui:title');
    core.bus.emit('title', { shown: true });
  };
  const hideTitle = () => {
    title.hide();
    popTitle?.(); popTitle = null;
    core.bus.emit('title', { shown: false });
  };
  const pause = createPause(core, modals, {
    settings: (done) => settings(done),
    controls: (done) => controls(done),
    notices: (done) => openNotices(modals, done),
    toTitle: () => {
      core.store.save();
      core.cameraRig.setTitleMode(true);
      try { core.services.render.setPalette('title', 0); } catch { /* render not ready */ }
      showTitle();
    },
  });
  const touch = createTouch(core, layers.hud);
  return { touch, deferred, tick, ctx, modals, toasts, hud, way, tuts, wx, hints, cards, dialogue, show, inputs, phone, title, pause, showTitle, hideTitle, settings, controls };
}

export const createUi: ModuleFactory<UiApi> = (core) => {
  let ui: UiInternals | null = null;
  const need = (): UiInternals => { if (!ui) throw new Error('ui used before init'); return ui; };
  let lastReceiver: ReceiverId | null = null;
  const talkPos = new Vector3();

  const receiverFromSource = (src: string): ReceiverId | null => {
    const m = /(?:interact|node|talk|npc)[:]([A-Za-z0-9_.]+)/.exec(src);
    const id = m?.[1]?.split('.')[0] ?? '';
    if (id === 'granny') return 'granny_wang';
    if (id === 'chen') return 'old_chen';
    if (id === 'liu') return 'xiaoliu';
    if (id === 'att') return 'attendant';
    return receiverFor(id) ?? (isNpc(id) ? id : null);
  };

  const api: UiApi = {
    async init() {
      ui = buildUi(core);
      const u = ui;
      const { ctx, dialogue, cards, modals, wx, inputs, show, phone, hints, hud, toasts, tuts, title } = u;
      core.uiRoot.append(ctx.root);
      trackScale(ctx.root);
      trackAdvanceSource(core.canvas, window);
      applySettings(core, ctx.settings);

      // ---- action handlers (ARCHITECTURE §2.8.9 table: ui card node wx memo toast) ----
      core.rules.onAction('node', (a, c) => {
        if (c.quiet) {
          const n = NODES.find((x) => x.id === a.node);
          if (n?.once) core.store.set(`seen:${n.id}`);
          return n?.effects?.length ? core.rules.run(n.effects, `node:${a.node}`, { quiet: true }) : undefined;
        }
        return dialogue.startNode(a.node);
      });
      core.rules.onAction('card', (a, c) => (c.quiet ? undefined : cards.show(a.card, a.id)));
      core.rules.onAction('wx', (a, c) => { wx.push(a.wx, c.quiet); });
      core.rules.onAction('toast', (a, c) => { if (!c.quiet) toasts.push(a.toast); });
      core.rules.onAction('memo', (a, c) => {
        core.bus.emit('memo', { n: a.memo });
        if (c.quiet) return undefined;
        ctx.sfx('sfx_memo');
        const id = `memo_${a.memo}` as const;
        return DLG[id] ? dialogue.startNode(id) : undefined;
      });
      core.rules.onAction('ui', (a, c) => {
        if (c.quiet) return undefined;
        switch (a.ui) {
          case 'keypad_locker': return inputs.open('locker');
          case 'keypad_lighthouse': return inputs.open('lighthouse');
          case 'namepicker': return inputs.open('namepicker');
          case 'milkbox': return inputs.open('milkbox');
          case 'show': return show.openShow(receiverFromSource(c.source) ?? lastReceiver ?? 'gate');
          case 'timer': try { core.services.lens.startTripodTimer(); } catch (e) { core.log.warn('[ui] timer failed', e); } return undefined;
          case 'ending_choice': return NODES.some((n) => n.id === 'att.bus') ? dialogue.startNode('att.bus') : undefined;
        }
        return undefined;
      });

      // ---- toasts from state (GDD §16.2) ----
      core.bus.on('itemGained', (e) => {
        toasts.push('ui.toast.item', { name: itemName(e.item) }, 'item', itemIcon(e.item));
        if ((e.item === 'note_dad' || e.item === 'envelope_dad') && itemDesc(e.item)) void cards.note(itemName(e.item), itemDesc(e.item));
      });
      core.bus.on('clueAdded', (e) => {
        if (e.id === 'clue_rules') return;
        const txt = clueTitle(e.id);
        if (txt) toasts.push('ui.toast.clue', { title: txt }, 'clue');
      });
      core.bus.on('bestiaryAdded', () => toasts.push('ui.toast.bestiary', undefined, 'bst'));
      core.bus.on('photoRemoved', () => { if (!phone.isOpen) toasts.push('ui.toast.photoFull', undefined, 'photoFull'); });
      core.bus.on('dialogueStart', (e) => { const r = receiverFromSource(`node:${e.node}`); if (r) lastReceiver = r; });
      core.bus.on('teleported', () => { phone.close(); });

      const lensPeek = () => { try { return core.services.lens.state.peek; } catch { return null; } };
      // ---- one talk interactable per actor (npc:<id>) ----
      const talkHandles: Handle[] = [];
      let actorCount = -1;
      const registerTalk = () => {
        for (const h of talkHandles.splice(0)) h.remove();
        const list = core.actors.list();
        actorCount = list.length;
        for (const a of list) {
          if (a.id === 'hero' || a.talkNeedsNight) continue;
          talkHandles.push(core.interact.registerInteractable({
            id: `npc:${a.id}`, scene: a.scene, at: () => a.head.getWorldPosition(talkPos), radius: a.talkRange ?? 2.5,
            // core also picks in the `peek` context (Phase 2): never offer a talk while the head is detached
            prompt: 'talk', enabled: () => a.root.visible && lensPeek() === null && dialogue.talkable(a.id),
            onInteract: () => api.talk(a.id as ReceiverId),
          }));
        }
      };
      registerTalk();
      for (const ev of ['phaseChanged', 'stateLoaded', 'sceneChanged'] as const) core.bus.on(ev, registerTalk);

      // ---- systems (ARCHITECTURE §2.2): input hotkeys, logic engines, HUD projection ----
      core.loop.addSystem('ui:input', 'input', () => {
        u.tick.early = true;
        if (u.deferred.length) for (const fn of u.deferred.splice(0)) fn();
        const i = core.input;
        const c = i.context();
        if (cards.current) { cards.tick(i); return; }
        if (c === 'modal') { modals.tick(i); return; }
        if (c === 'title') { if (!modals.top) title.tick(i); return; }
        if (c === 'dialog') { dialogue.tick(i); return; }
        if (c === 'gameplay') {
          if (i.pressed('phone')) phone.open('album');
          else if (i.pressed('memo')) phone.open('memo');
          else if (i.pressed('hint')) hints.request();
          // a peek's Esc belongs to D; seated, Esc stands up (GDD §5 「任何移动输入或 Esc 起身」, core player) — P3 G9
          else if (i.pressed('escape')) { if (lensPeek() === null && core.player.pose !== 'sit') u.pause.open(); }
          else if (i.pressed('show') && core.store.hasVerb('show')) {
            const cur = core.interact.current();
            const id = cur?.id.startsWith('npc:') ? cur.id.slice(4) : cur?.id ?? '';
            const r = receiverFor(id);
            if (r) void show.openShow(r);
          }
        } else if (c === 'viewfinder' && i.pressed('hint')) hints.request();
      });
      core.loop.addSystem('ui:logic', 'logic', (dt) => {
        dialogue.update(dt);
        wx.update();
        cards.update(dt);
        let beat = false;
        try { beat = core.services.story.currentBeat() !== null; } catch { /* ignore */ }
        const started = core.store.has('game_started') && !title.shown;
        hints.update(dt, !started || dialogue.busy() || cards.busy() || beat || modals.kind === 'pause');
        if (core.clock.frame % 120 === 0 && core.actors.list().length !== actorCount) registerTalk();
      });
      core.loop.addSystem('ui:ctx', 'late', () => {
        u.tick.early = false;
        if (u.deferred.length) for (const fn of u.deferred.splice(0)) fn();
        endAdvanceTick();
      });
      const tutView: TutView = { where: null, showTarget: false, prompt: null };
      core.loop.addSystem('ui:hud', 'ui', (dt) => {
        const c = core.input.context();
        const play = !title.shown && !cards.busy() && !dialogue.busy();
        // the lh_door look-up view keeps the HUD: its 「拉下总闸」 prompt is live there (requests-D #6)
        hud.setVisible(play && (c === 'gameplay' || (c === 'peek' && lensPeek() === 'lh_door')));
        hud.update();
        u.way.update(play && c === 'gameplay' && lensPeek() === null);
        toasts.setLow(modals.kind !== null || lensPeek() !== null);   // I-play: peek header chip sits top-centre
        toasts.setHeld(cards.current !== null);                         // P3r3 U3: toasts wait behind no card
        toasts.update();
        // P3 round 2: each bubble only in its own context (tutorial.ts TUT_PLACE)
        const cur = core.interact.current();
        tutView.where = !play ? null : c === 'gameplay' && lensPeek() === null ? 'gameplay' : c === 'viewfinder' ? 'viewfinder'
          : modals.kind === 'phone' ? 'phone' : null;
        tutView.prompt = cur?.prompt ?? null;
        tutView.showTarget = !!cur && core.store.hasVerb('show') && receiverFor(cur.id.startsWith('npc:') ? cur.id.slice(4) : cur.id) !== null;
        tuts.update(tutView, dt);
        u.touch?.update(play && (c === 'gameplay' || c === 'viewfinder' || c === 'peek'), c === 'viewfinder' || c === 'peek' ? c : 'gameplay');
      });
      hud.refresh();
    },
    showTitle() { need().showTitle(); },
    hideTitle() { need().hideTitle(); },
    talk(owner) { return need().dialogue.talk(owner); },
    startNode(id) { return need().dialogue.startNode(id); },
    advance(n) { need().dialogue.advance(n); },
    choose(i) { need().dialogue.choose(i); },
    currentLine() { return ui ? ui.dialogue.currentLine() : null; },
    choiceCount() { return ui ? ui.dialogue.choiceCount() : 0; },
    showCard(kind, id) { return need().cards.show(kind, id); },
    skip() {
      if (!ui) return false;
      return ui.cards.skip() || ui.dialogue.completeTyping();
    },
    async pushWx(id, o) { need().wx.push(id, !!o?.quiet); },
    openPhone(tab) { need().phone.open(tab ?? 'album'); },
    closeAll() { if (!ui) return; ui.modals.closeAll(); ui.dialogue.clearQueue(); ui.dialogue.closeCurrent(); },
    openInput(kind) { return need().inputs.open(kind); },
    submitInput(kind, value) { need().inputs.submit(kind, value); },
    openShow(receiver) { return need().show.openShow(receiver); },
    show(receiver, photoIds) { return need().show.show(receiver, photoIds); },
    toast(key, vars) { need().toasts.push(key, vars); },
    requestHint() { need().hints.request(); },
    busy() {
      if (!ui) return { dialogue: false, card: false, modal: null };
      return { dialogue: ui.dialogue.busy(), card: ui.cards.busy(), modal: ui.modals.kind };
    },
    devHook(arg) { if (ui) runDevHook(core, ui, arg); },
  };
  return api;
};

/** Short clue title for the toast: the text before 「：」 (≤ 12 chars), else the first 12 chars. */
function clueTitle(id: string): string {
  const d = CLUES.find((c) => c.id === id);
  const key = d?.textKey ?? `clue.${id}`;
  if (!has(key)) return '';
  const s = t(key);
  const k = s.indexOf('\uFF1A');
  const head = k > 0 && k <= 12 ? s.slice(0, k) : s;
  const chars = [...head];
  return chars.length > 12 ? `${chars.slice(0, 12).join('')}…` : head;
}
