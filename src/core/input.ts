// src/core/input.ts — owner: S. FROZEN. Keys/mouse → actions with per-tick edges, a context stack, and debug injection.
import type { InputAction, InputApi, InputContext, SimClock } from '../contracts';
import type { Bus } from '../events';
import { actionsForKey, actionsForMouse, actionsForWheel, moveVector, preventsDefault } from './keymap';

/** Contexts in which the pointer may be locked (mouse look). `modal` / `title` need a visible cursor. */
export const LOCK_CONTEXTS: readonly InputContext[] = ['gameplay', 'viewfinder', 'peek', 'dialog', 'cutscene'];
/** Free-control contexts: unlike dialogue/cards, these must not accept play input without mouse capture. */
const LOOK_CONTEXTS: readonly InputContext[] = ['gameplay', 'viewfinder', 'peek'];
/** Contexts in which losing the pointer lock means "the player pressed Esc" (the browser eats that keydown). */
export const ESC_ON_UNLOCK: readonly InputContext[] = ['gameplay', 'viewfinder', 'peek', 'dialog', 'cutscene'];
/** P3 G9: in these the synthesised Esc is destructive (「再见」, skipping credits), so an unlock caused by the window
 *  losing focus (alt-tab) must not count as a keypress there; in gameplay it opening pause is what we want. */
const ESC_NEEDS_FOCUS: readonly InputContext[] = ['dialog', 'cutscene'];
/** An Esc keydown this close (ms, event timestamps) to the unlock already delivered the escape action. */
const ESC_DEDUPE_MS = 400;

/** Radians of yaw/pitch per pixel of mouse motion at sensitivity 1 is decided by the consumer; we return pixels. */
export interface InputImpl extends InputApi {
  begin(): void;   // start of a tick: latch edges and injections
  end(): void;     // end of a tick: clear edges and unconsumed look (look is per tick)
  /** Drop every pending edge, held key and look delta (after a pause change). Pending inject() calls are kept. */
  flush(): void;
  attach(target: EventTarget, canvas: EventTarget & { requestPointerLock?: () => unknown }, o: { pointerLock: boolean; doc?: PointerLockDoc }): void;
  readonly locked: boolean;
}

/** The part of `document` input needs (injectable for tests). */
export interface PointerLockDoc extends EventTarget {
  readonly pointerLockElement: unknown;
  exitPointerLock?: () => void;
  readonly visibilityState?: string;
  hasFocus?: () => boolean;
}

/** Key events typed into a text field (E's keypad / name picker) are not game input. */
export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return !!el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export function createInput(clock: SimClock, bus: Bus): InputImpl {
  const sources = new Map<InputAction, Set<string>>();   // action → held sources (key codes / mouse buttons)
  const downAt = new Map<InputAction, number>();
  /** P3r3 G8: DOM event timeStamps (ms) of the last press edge / release of each action (real keys/buttons only) */
  const downWall = new Map<InputAction, number>(), upWall = new Map<InputAction, number>();
  // double-buffered edge sets: no allocation per tick
  let pendingDown = new Set<InputAction>(), pendingUp = new Set<InputAction>();
  let tickDown = new Set<InputAction>(), tickUp = new Set<InputAction>();
  let lookDX = 0, lookDY = 0;
  let sens = 1, invertY = false;
  let pendingInject: { move?: { x: number; y: number } | null; look?: { dx: number; dy: number }; press?: readonly InputAction[] } | null = null;
  let tickMove: { x: number; y: number } | null = null;
  const NO_PRESS: readonly InputAction[] = [];
  let tickPress: readonly InputAction[] = NO_PRESS;
  const stack: { c: InputContext; owner: string; id: number }[] = [];
  let nextId = 1;
  let locked = false;
  let pointerLock = false, requestingLock = false, exitingLock = false;
  let canvasEl: (EventTarget & { requestPointerLock?: () => unknown }) | null = null;
  let docEl: PointerLockDoc | null = null;
  let lastEscAt = -Infinity;

  bus.on('settings', (s) => { sens = s.sens; invertY = s.invertY; });

  const press = (a: InputAction, src: string, ts?: number) => {
    let s = sources.get(a);
    if (!s) { s = new Set(); sources.set(a, s); }
    if (s.size === 0) {
      pendingDown.add(a); downAt.set(a, clock.t); upWall.delete(a);
      if (ts !== undefined) downWall.set(a, ts); else downWall.delete(a);
    }
    s.add(src);
  };
  const release = (a: InputAction, src: string, ts?: number) => {
    const s = sources.get(a);
    if (!s || !s.has(src)) return;
    s.delete(src);
    if (s.size === 0) { pendingUp.add(a); if (ts !== undefined) upWall.set(a, ts); }
  };
  const releaseAll = (keep?: readonly InputAction[]) => {
    for (const [a, s] of sources) {
      if (keep?.includes(a)) continue;
      if (s.size) pendingUp.add(a);
      s.clear();
    }
  };
  /** Release mouse-button sources whose button is no longer down (mouseup outside the window is never delivered). */
  const syncButtons = (buttons: number) => {
    for (const [btn, bit] of [[0, 1], [1, 4], [2, 2]] as const) {
      if (buttons & bit) continue;
      for (const a of actionsForMouse(btn)) release(a, `m:${btn}`);
    }
  };
  const isHeld = (a: InputAction) => (sources.get(a)?.size ?? 0) > 0;
  const context = (): InputContext => (stack.length ? stack[stack.length - 1].c : 'gameplay');
  const needsPointerLock = () => pointerLock && !locked && LOOK_CONTEXTS.includes(context());
  const blocked = (a: InputAction) => needsPointerLock() && a !== 'escape' && a !== 'phone' && a !== 'memo';
  const exitLockIfCursorContext = () => {
    if (!locked || exitingLock || !docEl?.exitPointerLock || LOCK_CONTEXTS.includes(context())) return;
    // Remember the cause until the async event arrives, even if the modal has already closed by then.
    exitingLock = true;
    try { docEl.exitPointerLock(); } catch { exitingLock = false; }
  };

  const api: InputImpl = {
    get locked() { return locked; },
    begin() {
      const d = tickDown, u = tickUp;
      tickDown = pendingDown; tickUp = pendingUp;
      d.clear(); u.clear();
      pendingDown = d; pendingUp = u;
      const inj = pendingInject; pendingInject = null;
      tickMove = inj?.move ?? null;
      tickPress = inj?.press ?? NO_PRESS;
      // an injected press has no DOM timestamps (P3r3 G8): never measure an older real hold for it
      for (const a of tickPress) if (!isHeld(a)) { downWall.delete(a); upWall.delete(a); }
      if (inj?.look) { lookDX += inj.look.dx; lookDY += inj.look.dy; }
    },
    end() {
      tickDown.clear(); tickUp.clear(); tickMove = null; tickPress = NO_PRESS;
      // look is per tick: whatever no camera consumed this tick (dialog, cutscene, modal) must not jump the camera later
      lookDX = 0; lookDY = 0;
    },
    flush() {
      releaseAll();
      pendingDown.clear(); pendingUp.clear(); tickDown.clear(); tickUp.clear();
      tickMove = null; tickPress = NO_PRESS;          // debug/test injections are deliberate: kept
      lookDX = 0; lookDY = 0;
    },
    move() {
      if (tickMove) {
        const l = Math.hypot(tickMove.x, tickMove.y);
        return l > 1 ? { x: tickMove.x / l, y: tickMove.y / l } : { x: tickMove.x, y: tickMove.y };
      }
      if (needsPointerLock()) return { x: 0, y: 0 };
      return moveVector(isHeld);
    },
    consumeLook() {
      const r = { dx: lookDX * sens + 0, dy: lookDY * sens * (invertY ? -1 : 1) + 0 };   // + 0 normalises -0
      lookDX = 0; lookDY = 0;
      return r;
    },
    pressed: (a) => (!blocked(a) && tickDown.has(a)) || tickPress.includes(a),
    released: (a) => tickUp.has(a),
    held: (a) => (!blocked(a) && isHeld(a)) || tickPress.includes(a),
    heldFor: (a) => (!blocked(a) && isHeld(a) ? clock.t - (downAt.get(a) ?? clock.t) : 0),
    holdWallMs(a) {
      const d = downWall.get(a), u = upWall.get(a);
      return isHeld(a) || d === undefined || u === undefined ? null : Math.max(0, u - d);
    },
    context,
    needsPointerLock,
    pushContext(c, owner, o) {
      const id = nextId++;
      stack.push({ c, owner, id });
      releaseAll(o?.keep);
      exitLockIfCursorContext();
      return () => {
        const i = stack.findIndex((e) => e.id === id);
        if (i < 0) return;
        const wasCursor = !LOCK_CONTEXTS.includes(context());
        stack.splice(i, 1);
        exitLockIfCursorContext();
        if (wasCursor && LOCK_CONTEXTS.includes(context())) api.requestPointerLock();
      };
    },
    inject(o) {
      pendingInject = {
        move: o.move !== undefined ? o.move : pendingInject?.move,
        look: o.look ?? pendingInject?.look,
        press: [...(pendingInject?.press ?? []), ...(o.press ?? [])],
      };
    },
    requestPointerLock() {
      if (!pointerLock || !canvasEl || locked || requestingLock || exitingLock || !LOCK_CONTEXTS.includes(context())) return;
      if (docEl?.hasFocus && !docEl.hasFocus()) return;
      requestingLock = true;
      try {
        const r = canvasEl.requestPointerLock?.();
        if (r instanceof Promise) r.catch(() => { requestingLock = false; });
      } catch { requestingLock = false; } // Denied: keep the recovery hint and wait for a fresh click.
    },
    attach(target, canvas, o) {
      canvasEl = canvas;
      docEl = o.doc ?? (typeof document !== 'undefined' ? (document as unknown as PointerLockDoc) : null);
      pointerLock = o.pointerLock && typeof canvas.requestPointerLock === 'function';
      locked = docEl?.pointerLockElement === canvas;
      target.addEventListener('keydown', (ev) => {
        const e = ev as KeyboardEvent;
        if (isEditableTarget(e.target)) return;                 // typing into E's text fields
        if (e.code === 'Escape') lastEscAt = e.timeStamp;
        if (preventsDefault(e.code)) e.preventDefault();
        if (e.repeat) return;
        for (const a of actionsForKey(e.code)) if (!blocked(a)) press(a, `k:${e.code}`, e.timeStamp);
      });
      // keyup always releases (focus may have moved into a text field while the key was held)
      target.addEventListener('keyup', (ev) => { const e = ev as KeyboardEvent; for (const a of actionsForKey(e.code)) release(a, `k:${e.code}`, e.timeStamp); });
      target.addEventListener('blur', () => releaseAll());
      docEl?.addEventListener('visibilitychange', () => { if (docEl?.visibilityState === 'hidden') releaseAll(); });
      canvas.addEventListener('mousedown', (ev) => {
        const e = ev as MouseEvent;
        // The click that recaptures the mouse is not also a shutter/advance press (including a held burst).
        if (needsPointerLock()) { if (e.button === 0) api.requestPointerLock(); return; }
        for (const a of actionsForMouse(e.button)) press(a, `m:${e.button}`, e.timeStamp);
        if (e.button === 0 && pointerLock && !locked) api.requestPointerLock();
      });
      target.addEventListener('mouseup', (ev) => { const e = ev as MouseEvent; for (const a of actionsForMouse(e.button)) release(a, `m:${e.button}`, e.timeStamp); });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (ev) => {
        if (!needsPointerLock()) for (const a of actionsForWheel((ev as WheelEvent).deltaY)) pendingDown.add(a);
        ev.preventDefault();
      }, { passive: false });
      target.addEventListener('mousemove', (ev) => {
        const e = ev as MouseEvent;
        syncButtons(e.buttons);
        // Unlocked drags are for touch / ?test / browsers without Pointer Lock, not half-active desktop play.
        if (locked || (!pointerLock && e.buttons !== 0)) { lookDX += e.movementX; lookDY += e.movementY; }
      });
      docEl?.addEventListener('pointerlockchange', (ev) => {
        const was = locked;
        locked = !!docEl && docEl.pointerLockElement === canvas;
        requestingLock = false;
        const intentional = exitingLock;
        exitingLock = false;
        // Drop held movement/buttons and queued look, but keep an Esc keydown already delivered by the browser.
        const escape = pendingDown.has('escape');
        api.flush();
        if (escape) pendingDown.add('escape');
        if (locked) { exitLockIfCursorContext(); return; }
        if (intentional) { api.requestPointerLock(); return; }
        // Browsers swallow the Esc keydown that ends a pointer lock: deliver it once, without relocking behind Esc.
        const c = context();
        const focused = !ESC_NEEDS_FOCUS.includes(c) || !docEl?.hasFocus || docEl.hasFocus();
        if (was && !locked && ESC_ON_UNLOCK.includes(c) && focused && ev.timeStamp - lastEscAt > ESC_DEDUPE_MS) {
          pendingDown.add('escape');
        }
      });
      docEl?.addEventListener('pointerlockerror', () => { requestingLock = false; });
    },
  };
  return api;
}
