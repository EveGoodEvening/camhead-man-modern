// src/ui/dialog/controller.ts — owner E. The dialogue engine runtime (GDD §11.0, ARCHITECTURE §3.E item 2):
// node selection, once/seen, fixed options, choices, typewriter on sim time, FIFO queue, dialogue camera.
// Everything a debug call depends on happens synchronously (AGENTS.md [S-verify]: calls in one evaluate are sync).
import { Vector3 } from 'three';
import type { ActorDef, InputApi } from '../../contracts';
import type { DialogueNode, InteractId, NodeId, ReceiverId, SpeakerId } from '../../types';
import { NODES } from '../../data/dialogue';
import { INTERACTS } from '../../data/interacts';
import { NPCS } from '../../data/npcs';
import { DLG, t } from '../../data/zh';
import { keyless } from '../../data/zh/ui';
import { isNpc, type UiCtx } from '../ctx';
import { keyAdvance } from '../modal';
import { createDialogBox, fixedLabel, type ChoiceItem, type TagVariant } from './box';
import { DIALOG_EASE_IN, DIALOG_EASE_OUT, dialogCamera, inspectCamera, ridesHero } from './camera';
import { autoNode, eligibleNodes, fillName, fixedOptions, talkableByE, visibleChoices, type ChoiceView, type FixedOption } from './engine';
import { clicks, schedule, visibleCount } from './typewriter';

const onTouch = () => typeof document !== 'undefined' && document.documentElement.classList.contains('ui-touch-device');

type Line = readonly [SpeakerId, string];
interface Active {
  id: NodeId; node: DialogueNode | null; lines: readonly Line[]; index: number;
  times: number[]; elapsed: number; shown: number; text: string; chars: string[];
  end: boolean;                 // last line complete: choices (if any) are up
  effectsRun: boolean;
  receiver: ReceiverId | null;
  choices: ChoiceView[]; fixed: FixedOption[]; sel: number;
  /** Sim time of a highlight made by Space/E itself (P3r2 U4), -1 = none / made with the arrows or a number. */
  selByAdvanceAt: number;
  resolve: () => void; promise: Promise<void>;
  popCtx: () => void; popCam: (() => void) | null; camActor: ActorDef | null;
  openedFrame: number;
}
const tmpV = new Vector3(), tmpP = new Vector3(), heroHead = new Vector3(), tmpUp = new Vector3();
const CHOICE_KEYS = ['choice1', 'choice2', 'choice3', 'choice4'] as const;
interface Queued { id: NodeId; viaTalk: boolean; resolve: () => void; promise: Promise<void> }

export interface Dialogue {
  talk(owner: SpeakerId | ReceiverId | InteractId): Promise<void>;
  startNode(id: NodeId, o?: { viaTalk?: boolean }): Promise<void>;
  advance(n?: number): void;
  choose(i: number): void;
  playerAdvance(): void;
  currentLine(): { speaker: SpeakerId; text: string } | null;
  choiceCount(): number;
  busy(): boolean;
  completeTyping(): boolean;
  closeCurrent(): void;
  /** Drop queued (not yet started) nodes, resolving their promises. */
  clearQueue(): void;
  update(dt: number): void;
  tick(i: InputApi): void;
  talkable(owner: string): boolean;
  receiverOf(owner: string): ReceiverId | null;
}

/** Show receiver behind a node owner: NPCs and the gate directly; interacts by talkAs (it_estate_gate → gate). */
/** Seconds of no Space/E after a Space/E highlight before Space/E confirms it (P3r2 U4). */
export const CHOICE_ARM = 0.5;

/** What Space / E (the `advance` action) does at the end of a line. `choices` = visible NODE choices (0 = none, or
 *  still typing); `byAdvanceAt` = sim time of a highlight Space/E made itself (-1 = arrows / none); `key` = the press
 *  came from a key, not a canvas click. 'pass' = the old behaviour (next line / pick the highlight / 再见). */
export function advanceAtChoice(choices: number, sel: number, byAdvanceAt: number, now: number, key: boolean): 'highlight' | 'wait' | 'pass' {
  if (choices <= 0) return 'pass';
  if (sel < 0) return 'highlight';
  if (byAdvanceAt >= 0 && (!key || now - byAdvanceAt < CHOICE_ARM)) return 'wait';
  return 'pass';
}

export function receiverFor(owner: string): ReceiverId | null {
  if (owner === 'gate' || owner === 'it_estate_gate') return 'gate';
  if (isNpc(owner)) return owner;
  const def = INTERACTS.find((d) => d.id === owner);
  if (def?.talkAs && isNpc(def.talkAs)) return def.talkAs;
  return null;
}

export function createDialogue(ctx: UiCtx, openShow: (r: ReceiverId) => void): Dialogue {
  const { core } = ctx;
  let active: Active | null = null;
  const queue: Queued[] = [];
  let typedSince = 0;
  const autoLatch = new Map<string, NodeId>();   // owner → auto node already played in this approach
  core.bus.on('stateLoaded', () => autoLatch.clear());
  const box = createDialogBox(ctx.layers.dialog, () => api.playerAdvance());
  const seen = (id: NodeId) => core.store.has(`seen:${id}`);
  const nodeOf = (id: NodeId) => NODES.find((n) => n.id === id) ?? null;
  const hero = () => { try { return core.services.chars.hero; } catch { return null; } };
  const lensActive = () => { try { return core.services.lens.state.active || core.services.lens.state.peek !== null; } catch { return false; } };
  const lensPeek = () => { try { return core.services.lens.state.peek; } catch { return null; } };
  const beatRunning = () => { try { return core.services.story.currentBeat() !== null; } catch { return false; } };

  const variantOf = (s: SpeakerId): TagVariant => {
    if (s === 'me') return 'me';
    if (s === 'system') return 'system';
    if (s === 'narr') return 'narr';
    return NPCS.find((n) => n.id === s)?.tag === 'spirit' ? 'spirit' : 'npc';
  };
  const actorFor = (s: string): ActorDef | null => {
    const a = core.actors.get(s);
    return a && a.id !== 'hero' && a.scene === core.player.scene ? a : null;
  };

  /** The speaking NPC turns its head to the hero for the talk (C's NpcHandle.lookAt). */
  /** The interactable the player just pressed E on, when it started this node (object inspects: it.*, gate.*). */
  const inspectAnchor = (owner: string, id: NodeId): Vector3 | null => {
    try {
      const cur = core.interact.current();
      if (!cur) return null;
      // P3r2 look L6: an interact id has several rows (it_estate_gate: a node-less inspect row first, then gate.prompt)
      if (cur.id !== owner && !INTERACTS.some((d) => d.id === cur.id && d.node === id)) return null;
      return cur.anchor.clone();
    } catch { return null; }
  };
  const lookAtHero = (a: Active, on: boolean) => {
    const owner = a.node?.owner ?? '';
    if (!isNpc(owner)) return;
    try {
      const npc = core.services.chars.npc(owner);
      if (!npc) return;
      if (!on) { npc.lookAt(null); return; }
      core.player.pos(heroHead).addScaledVector(core.player.up(tmpUp), 1.7);
      npc.lookAt(heroHead);
    } catch { /* chars not ready */ }
  };
  const renderLine = () => {
    if (!active) return;
    box.setText(active.text, active.shown);
    const lineDone = active.shown >= active.times.length;
    box.setNext(active.end && active.choices.length + active.fixed.length > 0 ? 'hidden' : lineDone ? 'ready' : 'typing');
  };
  const showLine = (i: number) => {
    const a = active;
    if (!a) return;
    a.index = i;
    const line = a.lines[i];
    if (!line) return;
    const [sp, raw] = line;
    // touch devices: 土地's 「往后按 N」 names the 夜景 button instead (P3 round 2)
    a.text = fillName(onTouch() ? keyless(raw) : raw, ctx.meName());
    a.chars = [...a.text];
    a.times = schedule(a.text, ctx.settings.textSpeed);
    a.elapsed = 0; a.shown = 0;
    const voice = a.id.startsWith('memo_');
    box.setSpeaker(ctx.nameOf(sp), variantOf(sp), sp, voice ? t('ui.wx.voice') : undefined);
    const cam = actorFor(sp);
    if (cam) a.camActor = cam;
    box.setChoices([]);
    renderLine();
    core.bus.emit('dialogueLine', { node: a.id, index: i, speaker: sp, text: a.text });
    if (sp === 'me') { try { hero()?.setScreen('typing', { text: a.text }); } catch { /* chars not ready */ } }
    if (a.times.length === 0) completeLine();
  };
  const completeLine = () => {
    const a = active;
    if (!a) return;
    a.shown = a.times.length;
    if (a.index >= a.lines.length - 1) enterEnd();
    renderLine();
  };
  const enterEnd = () => {
    const a = active;
    if (!a || a.end) return;
    a.end = true;
    a.choices = visibleChoices(a.node, core.rules.evalCond);
    const auto = !!a.node?.auto;
    a.fixed = auto || beatRunning() ? [] : fixedOptions(a.node, a.receiver);
    if (a.choices.length) runEffects(a);              // choice nodes apply their effects before the pick
    if (a.choices.length || (a.fixed.length && a.receiver)) buildChoices(a);
    renderLine();
  };
  const buildChoices = (a: Active) => {
    const items: ChoiceItem[] = a.choices.map((c, k) => ({ label: t(c.key), fixed: false, testid: `choice-${k}`, pick: () => api.choose(k) }));
    a.fixed.forEach((f, k) => items.push({ label: fixedLabel(f), fixed: true, testid: `choice-${f}`, pick: () => api.choose(a.choices.length + k) }));
    a.sel = -1;
    a.selByAdvanceAt = -1;
    box.setChoices(items);
    box.highlight(-1);
  };
  const runEffects = (a: Active) => {
    if (a.effectsRun) return;
    a.effectsRun = true;
    const fx = a.node?.effects ?? [];
    if (fx.length) void core.rules.run(fx, `node:${a.id}`);
  };

  const begin = (id: NodeId, viaTalk: boolean, resolve: () => void, promise: Promise<void>) => {
    const node = nodeOf(id);
    const lines = DLG[id] ?? [];
    const receiver = viaTalk || node?.owner === 'gate' || node?.owner === 'it_estate_gate' ? receiverFor(node?.owner ?? '') : null;
    if (node?.once) core.store.set(`seen:${id}`);
    if (lines.length === 0 && !(node?.choices?.length)) {
      core.log.warn(`[ui] node ${id} has no lines`);
      core.bus.emit('dialogueStart', { node: id });
      core.bus.emit('dialogueEnd', { node: id });
      if (node?.effects?.length) void core.rules.run(node.effects, `node:${id}`);
      resolve();
      next();
      return;
    }
    const a: Active = {
      id, node, lines, index: 0, times: [], elapsed: 0, shown: 0, text: '', chars: [], end: false, effectsRun: false,
      receiver, choices: [], fixed: [], sel: 0, selByAdvanceAt: -1, resolve, promise,
      popCtx: core.input.pushContext('dialog', `ui:dialog:${id}`), popCam: null, camActor: null, openedFrame: core.clock.frame,
    };
    active = a;
    const owner = node?.owner ?? '';
    a.camActor = actorFor(owner) ?? actorFor(lines[0]?.[0] ?? '');
    // P3r2 (camera): an object inspect (no speaking actor, started by E on an interactable) frames the object above the box
    const objAt = a.camActor ? null : inspectAnchor(owner, id);
    // 土地 riding the hero's shoulder is invisible from the first-person viewfinder: film the pair over the lens
    const overLens = !!a.camActor && ridesHero(a.camActor.root) && core.cameraRig.top() === 'lens' && lensPeek() === null;
    // P3r2 look L2: beat lines too, when the beat has no camera of its own up (拆's lines after the S_zhe cut filmed the
    // hero's back): a beat's own shot is a pushed override, so top() !== null keeps it
    if ((a.camActor || objAt) && ((!lensActive() && core.cameraRig.top() === null) || overLens)) {
      core.cameraRig.snap();
      core.cameraRig.blend?.(DIALOG_EASE_IN);            // ease into the shot (Messenger-style), not a cut
      a.popCam = core.cameraRig.push('ui:dialog', objAt
        ? inspectCamera(core, core.player.scene, objAt)
        : dialogCamera(core, () => active?.camActor ?? null));
    }
    lookAtHero(a, true);
    box.show(true);
    core.bus.emit('dialogueStart', { node: id });
    if (lines.length) showLine(0);
    else { a.text = ''; a.times = []; enterEnd(); }
  };
  const next = () => {
    if (active) return;
    const q = queue.shift();
    if (q) begin(q.id, q.viaTalk, q.resolve, q.promise);
  };
  /** Close the current node; effects run after the UI is torn down so a follow-up {node} starts cleanly. */
  const close = (then?: NodeId) => {
    const a = active;
    if (!a) return;
    active = null;
    ctx.nextTick(a.popCtx);
    lookAtHero(a, false);
    if (a.popCam) {
      a.popCam(); core.cameraRig.snap();
      // P3r2 look L4: a talk filmed over the viewfinder (土地 on the shoulder) cuts straight back into the lens; an eased
      // hand-over flew an outside shot of the headless hero under the returning viewfinder HUD into his neck
      core.cameraRig.blend?.(core.cameraRig.top() === 'lens' ? 0 : DIALOG_EASE_OUT);
    }
    box.setChoices([]);
    if (!then) box.show(false);
    try { hero()?.setScreen('status'); } catch { /* ignore */ }
    core.bus.emit('dialogueEnd', { node: a.id });
    runEffects(a);
    if (then) {
      let res!: () => void;
      const p = new Promise<void>((r) => { res = r; });
      begin(then, false, res, p);
      void p.then(a.resolve);
    } else {
      a.resolve();
      next();
    }
    if (!active) box.show(false);
  };

  const pick = (i: number) => {
    const a = active;
    if (!a) return;
    if (!a.end) { a.shown = a.times.length; a.index = a.lines.length - 1; enterEnd(); }
    if (i < a.choices.length) {
      const c = a.node?.choices?.[a.choices[i].index];
      core.bus.emit('choiceMade', { node: a.id, index: a.choices[i].index });
      if (c?.actions?.length) void core.rules.run(c.actions, `choice:${a.id}#${a.choices[i].index}`);
      if (active !== a) return;                         // an action replaced the dialogue
      close(c?.then);
      return;
    }
    const f = a.fixed[i - a.choices.length];
    if (f === 'show' && a.receiver) { const r = a.receiver; close(); openShow(r); return; }
    if (f === 'bye' || (i >= a.choices.length && a.choices.length === 0)) close();
  };

  const api: Dialogue = {
    talk(owner) {
      const node = eligibleNodes(NODES, owner, core.rules.evalCond, seen)[0];
      if (!node) { core.log.warn(`[ui] talk: no eligible node for ${owner}`); return Promise.resolve(); }
      return api.startNode(node.id, { viaTalk: true });
    },
    startNode(id, o) {
      if (active?.id === id) return active.promise;
      const q = queue.find((x) => x.id === id);
      if (q) return q.promise;
      let resolve!: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      if (active) queue.push({ id, viaTalk: !!o?.viaTalk, resolve, promise });
      else begin(id, !!o?.viaTalk, resolve, promise);
      return promise;
    },
    advance(n = 1) {
      for (let k = 0; k < Math.max(1, n) && active; k++) {
        const a = active;
        if (!a.end && a.index < a.lines.length - 1) { showLine(a.index + 1); continue; }
        if (!a.end) { completeLine(); if (a.choices.length) break; }
        if (a.choices.length) break;                   // node choices wait for choose()
        close();
      }
    },
    playerAdvance() {
      const a = active;
      if (!a) return;
      if (a.shown < a.times.length) { completeLine(); return; }
      if (!a.end) { showLine(a.index + 1); return; }
      if (a.choices.length) return;
      close();
    },
    choose(i) { pick(i); },
    currentLine() {
      const a = active;
      if (!a) return null;
      const line = a.lines[a.index];
      return line ? { speaker: line[0], text: a.text } : null;
    },
    choiceCount: () => (active?.end ? active.choices.length : 0),
    busy: () => active !== null || queue.length > 0,
    completeTyping() {
      if (!active || active.shown >= active.times.length) return false;
      completeLine();
      return true;
    },
    closeCurrent() { if (active) close(); },
    clearQueue() { for (const q of queue.splice(0)) q.resolve(); },
    talkable: (owner) => talkableByE(NODES, owner, core.rules.evalCond, seen),
    receiverOf: receiverFor,
    update(dt) {
      const a = active;
      if (!a) {
        // auto nodes (GDD §11.0): the owner in range, gameplay context, every 10th tick. A non-`once` auto node plays
        // once per approach: it is latched until the player leaves the owner's range (else it would loop forever).
        if (core.clock.frame % 10 === 0 && core.input.context() === 'gameplay') {
          for (const act of core.actors.list(core.player.scene)) {
            if (act.id === 'hero') continue;
            const n = autoNode(NODES, act.id, core.rules.evalCond, seen);
            if (!n) { autoLatch.delete(act.id); continue; }
            const d = act.root.getWorldPosition(tmpV).distanceTo(core.player.pos(tmpP));
            if (d > Math.max(2.5, act.talkRange ?? 2.5)) { autoLatch.delete(act.id); continue; }
            if (autoLatch.get(act.id) === n.id) continue;
            autoLatch.set(act.id, n.id);
            void api.startNode(n.id);
            break;
          }
        }
        return;
      }
      if (a.shown >= a.times.length) return;
      a.elapsed += dt;
      const n = visibleCount(a.times, a.elapsed);
      if (n !== a.shown) {
        for (let k = a.shown; k < n; k++) if (clicks(a.chars[k] ?? '') && ++typedSince % 2 === 1) { ctx.sfx('sfx_type'); break; }
        a.shown = n;
        if (n >= a.times.length) completeLine();
        renderLine();
      }
    },
    tick(i) {
      const a = active;
      if (!a || i.context() !== 'dialog' || core.clock.frame === a.openedFrame) return;
      const total = a.end ? a.choices.length + a.fixed.length : 0;
      for (let k = 0; k < CHOICE_KEYS.length; k++) if (total > k && i.pressed(CHOICE_KEYS[k])) { pick(k); return; }
      if (total > 0 && (i.pressed('forward') || i.pressed('back'))) {
        a.sel = a.sel < 0 ? (i.pressed('back') ? 0 : total - 1) : (a.sel + (i.pressed('back') ? 1 : total - 1)) % total;
        a.selByAdvanceAt = -1;
        box.highlight(a.sel);
        return;
      }
      if (i.pressed('escape') && a.end && !a.choices.length) { close(); return; }   // Esc = 「再见」
      if (i.pressed('advance')) {
        // P3r2 U4: at node choices (「上车吗？」) Space / E used to be silent no-ops. The first press only highlights option 1
        // (never picks: a player mashing Space through the lines must not fall into an ending); a key press after a
        // CHOICE_ARM pause confirms it (each press inside the pause restarts it). A canvas click never confirms a
        // highlight it did not choose itself.
        const action = advanceAtChoice(a.end ? a.choices.length : 0, a.sel, a.selByAdvanceAt, core.clock.t, keyAdvance(i));
        if (action === 'highlight') { a.sel = 0; a.selByAdvanceAt = core.clock.t; box.highlight(0); ctx.sfx('sfx_click'); return; }
        if (action === 'wait') { a.selByAdvanceAt = core.clock.t; return; }
        if (a.end && a.sel >= 0) { pick(a.sel); return; }   // an explicitly highlighted choice
        api.playerAdvance();                                  // node choices wait; fixed-only = 「再见」
      }
    },
  };
  return api;
}
