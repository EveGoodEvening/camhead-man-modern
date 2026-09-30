// src/ui/touch.ts — owner E. Optional touch controls (GDD §4 触屏, ARCHITECTURE §3.E "touch.ts, built last"): left half
// virtual stick, right half drag-to-look, and on-screen keys. Only on coarse-pointer touch devices.
// The buttons are VIRTUAL KEYS: pointerdown / pointerup dispatch the matching keydown / keyup on window, so they reach
// core input exactly like the keyboard (held keys work: hold 快门 for the burst) and every context sees them (返回 =
// Esc exits the lh_door peek, opens pause in gameplay; P3 U3). The stick and the look drag go through input.inject().
import type { Core } from '../contracts';
import { t } from '../data/zh';
import { receiverFor } from './dialog/controller';
import { h, showEl } from './dom';

export function touchCapable(): boolean {
  try { return navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

/** Where the touch layer is showing: plain play, the viewfinder, or a peek (head detached / lh_door look-up). */
export type TouchMode = 'gameplay' | 'viewfinder' | 'peek';
/** What a button needs to know about the game to decide whether it shows. */
export interface TouchState {
  mode: TouchMode;
  /** lens.state.peek (the lh_door look-up runs in the gameplay context with a peek set). */
  peek: string | null;
  zoom: 1 | 3 | 10;
  night: boolean; flash: boolean; overlay: boolean;
  verbs: { night: boolean; show: boolean };
  hasRef: boolean;
  /** The current interactable accepts 出示 (G). */
  showTarget: boolean;
  /** An interact prompt is live (the 交互 button pulses). */
  prompt: boolean;
  /** Night or the subway: the 头灯 (headlamp, Q outside the lens) button shows (P3 round 2). */
  dark: boolean;
  torch: boolean;
}

export type TouchBtnId = 'phone' | 'back' | 'view' | 'use' | 'shutter' | 'zoom' | 'night' | 'flash' | 'overlay' | 'show' | 'torch';

const lensOn = (s: TouchState) => s.mode === 'viewfinder' || s.mode === 'peek' || s.peek !== null;

/** Which buttons show in a state (pure; unit-tested). */
export function touchButtons(s: TouchState): TouchBtnId[] {
  const out: TouchBtnId[] = ['back'];
  const lens = lensOn(s);
  if (!lens) out.push('phone');
  if (!s.peek) out.push('view');                             // aimToggle is ignored during a peek (Esc exits)
  out.push('use');
  if (lens) out.push('shutter');
  if (s.mode === 'viewfinder' && !s.peek) {
    out.push('zoom', 'flash');
    if (s.verbs.night) out.push('night');
    if (s.hasRef || s.overlay) out.push('overlay');
  }
  if (!lens && s.verbs.show && s.showTarget) out.push('show');
  if (!lens && (s.dark || s.torch)) out.push('torch');
  return out;
}

/** The key a button sends (zoom cycles 1× → 3× → 10× → 1×). */
export function touchKey(id: TouchBtnId, s: TouchState): string {
  switch (id) {
    case 'phone': return 'Tab';
    case 'back': return 'Escape';
    case 'view': return 'KeyF';
    case 'use': return 'KeyE';
    case 'shutter': return 'Space';
    case 'zoom': return s.zoom === 1 ? 'Digit2' : s.zoom === 3 ? 'Digit3' : 'Digit1';
    case 'night': return 'KeyN';
    case 'flash': return 'KeyQ';
    case 'overlay': return 'KeyR';
    case 'show': return 'KeyG';
    case 'torch': return 'KeyQ';     // Q outside the viewfinder = headlamp (GDD §4)
  }
}

const LABEL: Record<TouchBtnId, string> = {
  phone: 'ui.touch.phone', back: 'ui.back', view: 'ui.touch.view', use: 'ui.touch.use', shutter: 'ui.touch.shutter',
  zoom: 'ui.touch.zoom', night: 'ui.touch.night', flash: 'ui.touch.flash', overlay: 'ui.touch.overlay', show: 'ui.touch.show',
  torch: 'ui.touch.torch',
};
/** Lens toggles sit in their own column above the main pad. */
const TOOLS: readonly TouchBtnId[] = ['zoom', 'night', 'flash', 'overlay', 'torch'];

export interface Touch { update(visible: boolean, mode?: TouchMode): void }

export function createTouch(core: Core, host: HTMLElement): Touch | null {
  if (!touchCapable()) return null;
  document.documentElement.classList.add('ui-touch-device');
  const layer = h('div', 'ui-touch', { testid: 'touch' });
  const stickBase = h('div', 'ui-stick ui-hidden');
  const stickKnob = h('div', 'ui-knob');
  stickBase.append(stickKnob);
  const pad = h('div', 'ui-touch-btns');
  const tools = h('div', 'ui-touch-tools');
  const backRow = h('div', 'ui-touch-back');
  let state: TouchState | null = null;

  const send = (type: 'keydown' | 'keyup', code: string) => {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  };
  const btns = new Map<TouchBtnId, HTMLButtonElement>();
  const ups: (() => void)[] = [];
  for (const id of ['back', 'zoom', 'night', 'flash', 'overlay', 'torch', 'phone', 'show', 'view', 'use', 'shutter'] as const) {
    const b = h('button', `ui-tbtn ui-slab ui-tbtn-${id}`, { text: t(LABEL[id], { z: 1 }), testid: `touch-${id}` }) as HTMLButtonElement;
    let down: string | null = null;
    const up = () => { if (down) { send('keyup', down); down = null; } b.classList.remove('ui-down'); };
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (down || !state) return;
      down = touchKey(id, state);
      b.classList.add('ui-down');
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      send('keydown', down);
    });
    b.addEventListener('pointerup', (e) => { e.stopPropagation(); up(); });
    ups.push(up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    (id === 'back' ? backRow : TOOLS.includes(id) ? tools : pad).append(b);
    btns.set(id, b);
  }
  layer.append(stickBase, backRow, tools, pad);
  host.append(layer);

  let stickId: number | null = null, lookId: number | null = null;
  let sx = 0, sy = 0, mx = 0, my = 0, lx = 0, ly = 0, dx = 0, dy = 0;
  const R = 60;
  layer.addEventListener('pointerdown', (e) => {
    if (e.clientX < innerWidth / 2 && stickId === null) {
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY; mx = 0; my = 0;
      stickBase.style.transform = `translate(${sx - R}px, ${sy - R}px)`;
      showEl(stickBase, true);
    } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    try { layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      const ox = e.clientX - sx, oy = e.clientY - sy, l = Math.hypot(ox, oy), k = l > R ? R / l : 1;
      mx = (ox * k) / R; my = (-oy * k) / R;
      stickKnob.style.transform = `translate(${ox * k}px, ${oy * k}px)`;
    } else if (e.pointerId === lookId) { dx += (e.clientX - lx) * 1.5; dy += (e.clientY - ly) * 1.5; lx = e.clientX; ly = e.clientY; }
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === stickId) { stickId = null; mx = 0; my = 0; stickKnob.style.transform = ''; showEl(stickBase, false); }
    if (e.pointerId === lookId) lookId = null;
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  const readState = (mode: TouchMode): TouchState => {
    let ls: { peek: string | null; zoom: 1 | 3 | 10; night: boolean; flash: boolean; overlay: boolean; torch: boolean } = { peek: null, zoom: 1, night: false, flash: false, overlay: false, torch: false };
    try { ls = core.services.lens.state; } catch { /* lens not ready */ }
    const cur = core.interact.current();
    const id = cur?.id.startsWith('npc:') ? cur.id.slice(4) : cur?.id ?? '';
    return {
      mode, peek: ls.peek, zoom: ls.zoom, night: ls.night, flash: ls.flash, overlay: ls.overlay,
      verbs: { night: core.store.hasVerb('night'), show: core.store.hasVerb('show') },
      hasRef: !!core.store.state.refPhotoId, showTarget: !!cur && receiverFor(id) !== null, prompt: !!cur,
      dark: core.store.state.phase === 'night' || core.player.scene === 'subway_int', torch: ls.torch,
    };
  };
  let lastSig = '';

  return {
    update(visible, mode = 'gameplay') {
      showEl(layer, visible);
      if (!visible) {
        dx = 0; dy = 0;
        for (const up of ups) up();   // never leave a virtual key held behind a dialogue / modal
        return;
      }
      state = readState(mode);
      const on = touchButtons(state);
      const sig = `${on.join()}|${state.zoom}|${state.night}|${state.flash}|${state.overlay}|${state.prompt}|${state.torch}`;
      if (sig !== lastSig) {
        lastSig = sig;
        for (const [id, b] of btns) showEl(b, on.includes(id));
        btns.get('zoom')!.textContent = t('ui.touch.zoom', { z: state.zoom });
        btns.get('night')!.classList.toggle('ui-on', state.night);
        btns.get('flash')!.classList.toggle('ui-on', state.flash);
        btns.get('overlay')!.classList.toggle('ui-on', state.overlay);
        btns.get('torch')!.classList.toggle('ui-on', state.torch);
        btns.get('use')!.classList.toggle('ui-ready', state.prompt);
      }
      const move = stickId !== null ? { x: mx, y: my } : undefined;
      if (move || dx || dy) {
        core.input.inject({ move: move ?? null, look: dx || dy ? { dx, dy } : undefined });
        dx = 0; dy = 0;
      }
    },
  };
}
