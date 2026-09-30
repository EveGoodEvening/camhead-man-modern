// src/ui/hud/hud.ts — owner E. HUD (ARCHITECTURE §3.E item 5, ART §8.2): objective chip, phone status (signal, time,
// battery 1%), the world-anchored interaction prompt and the pointer-lock hint.
import { Vector3 } from 'three';
import type { ObjectiveId, PromptVerb, StrKey } from '../../types';
import { OBJECTIVES } from '../../data/story';
import { has, t } from '../../data/zh';
import type { UiCtx } from '../ctx';
import { h, showEl, stamp } from '../dom';
import { promptScreenPos } from './promptPos';
import { touchCapable } from '../touch';

export interface Hud {
  update(): void;
  setVisible(on: boolean): void;
  refresh(): void;
  statusEl(): HTMLElement;
  chipEl(): HTMLElement;
}

/** Set by the first interact: the prompt stops spelling out 「按 E」. */
export const TEACH_FLAG = 'seen:tut_interact' as const;

export function objectiveText(id: ObjectiveId | null): string {
  if (!id) return '';
  const def = OBJECTIVES.find((o) => o.id === id);
  const key: StrKey = def?.textKey ?? `obj.${id}`;
  return has(key) ? t(key) : '';
}

/** Signal bars element (reused by the phone's own status bar). */
export function barsEl(): { el: HTMLElement; set(n: number): void } {
  const el = h('span', 'ui-bars', {}, [h('i'), h('i'), h('i'), h('i')]);
  return {
    el,
    set(n) { el.dataset.bars = String(n); el.querySelectorAll('i').forEach((b, k) => b.classList.toggle('on', k < n)); },
  };
}

export function createHud(ctx: UiCtx): Hud {
  const { core, layers } = ctx;
  const chip = h('div', 'ui-objective ui-slab ui-hidden', { testid: 'objective-chip' });
  const bars = barsEl();
  const time = h('span', 'ui-time', { testid: 'hud-time' });
  const status = h('div', 'ui-status', { testid: 'phone-status' }, [bars.el, time, h('span', 'ui-batt'), h('span', 'ui-pct', { text: t('ui.battery') })]);
  const prompt = h('div', 'ui-prompt ui-slab ui-hidden', { testid: 'prompt' });
  const key = h('span', 'ui-key', { text: 'E' });
  const verb = h('span', 'ui-verb');
  const touch = touchCapable();   // no pointer lock to ask for on touch (P3 U3)
  // P3 round 2: until the first E, the prompt teaches the key itself (「按 [E] 调查」 / 「点「交互」调查」)
  const pre = h('span', 'ui-pre', { text: t(touch ? 'ui.prompt.teachTouch' : 'ui.prompt.teach') });
  prompt.append(pre, key, verb);
  const teaching = () => !core.store.has(TEACH_FLAG);
  core.bus.on('interact', () => { if (teaching()) core.store.set(TEACH_FLAG); prompt.classList.remove('ui-teach'); });
  const lock = h('div', 'ui-lockhint ui-slab ui-hidden', { testid: 'lock-hint', text: t('ui.clickToLock') });
  layers.hud.append(chip, status, lock);
  layers.world.append(prompt);

  let visible = true;
  let promptOn = false;
  let lastX = NaN, lastY = NaN;
  const v = new Vector3(), up = new Vector3();

  // P3 wayfinding: the chip shows the current objective STEP (what 土地's smoke / the HUD arrow lead to), re-read
  // every CHIP_EVERY frames so flag / scene / nearest-candidate changes update it (stamped when it changes)
  const stepText = (id: ObjectiveId | null): string => {
    let key: StrKey | null = null;
    try { key = id ? core.services.story.smokeStep?.({ textOnly: true })?.textKey ?? null : null; } catch { key = null; }
    return key && has(key) ? t(key) : objectiveText(id);
  };
  let chipFrame = 0;
  const setObjective = (id: ObjectiveId | null) => {
    const txt = stepText(id);
    chip.textContent = txt;
    showEl(chip, !!txt && visible);
    if (txt) stamp(chip);
  };
  const setPrompt = (vb: PromptVerb | null, pk: StrKey | null) => {
    promptOn = !!vb;
    if (vb) {
      verb.textContent = pk && has(pk) ? t(pk) : t(`ui.prompt.${vb}`);
      prompt.classList.toggle('ui-teach', teaching());
      stamp(prompt); lastX = NaN;
    }
    showEl(prompt, promptOn && visible);
  };

  core.bus.on('objectiveChanged', (e) => setObjective(e.id));
  // P3r2 gate: a scene switch / teleport / flag can change the step at once; re-read it on the next frame instead of
  // up to 10 frames later (a chapter boot into the subway showed the planet step 「去码头长凳坐坐…」 at first)
  const recheckChip = () => { chipFrame = 9; };
  for (const ev of ['sceneChanged', 'teleported', 'flagSet'] as const) core.bus.on(ev, recheckChip);
  core.bus.on('stateLoaded', () => { setObjective(core.store.state.objective); time.textContent = core.store.state.clock; });
  core.bus.on('clockChanged', (e) => { time.textContent = e.clock; });
  core.bus.on('signalChanged', (e) => bars.set(e.bars));
  core.bus.on('promptChanged', (e) => setPrompt(e.verb, e.promptKey));
  bars.set(1);
  time.textContent = core.store.state.clock;

  return {
    statusEl: () => status,
    chipEl: () => chip,
    refresh() { setObjective(core.store.state.objective); time.textContent = core.store.state.clock; },
    setVisible(on) {
      if (on === visible) return;
      visible = on;
      showEl(chip, on && !!chip.textContent);
      showEl(status, on);
      showEl(prompt, on && promptOn);
    },
    update() {
      if (++chipFrame % 10 === 0 && chip.textContent !== stepText(core.store.state.objective)) setObjective(core.store.state.objective);
      // pointer-lock hint: realtime only, when the game wants the mouse (ART §4 / GDD §4 「单击画面」)
      const ctxName = core.input.context();
      const wantLock = !ctx.test && !touch && (ctxName === 'gameplay' || ctxName === 'viewfinder' || ctxName === 'peek');
      showEl(lock, wantLock && visible && document.pointerLockElement !== core.canvas && document.hasFocus());
      if (!promptOn || !visible) return;
      const cur = core.interact.current();
      if (!cur) return;
      // project 0.3 m above the anchor (ART §8.2)
      core.player.up(up);
      v.copy(cur.anchor).addScaledVector(up, 0.3).project(core.cameraRig.camera);
      // off screen / behind the camera: dock at the lower centre (never hide the next step, e.g. the lh_door switch)
      const { x: cx, y: cy } = promptScreenPos(v, innerWidth, innerHeight);
      prompt.style.visibility = 'visible';
      if (cx === lastX && cy === lastY) return;
      lastX = cx; lastY = cy;
      prompt.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -100%) rotate(-1deg)`;
    },
  };
}
