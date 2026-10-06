// S-verify: the DOM half of core/input (fake EventTargets; node has no DOM) + pause flushing through the loop.
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock, SimTimers } from './clock';
import { createInput, isEditableTarget, type InputImpl, type PointerLockDoc } from './input';
import { createLoop } from './loop';
import { createLog } from './log';

type Props = Record<string, unknown>;
function ev(type: string, props: Props = {}): Event {
  const e = new Event(type, { cancelable: true });
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return e;
}
function rig(pointerLock = false) {
  const clock = new MutableClock();
  const bus = new Bus();
  const input = createInput(clock, bus);
  const win = new EventTarget();
  let lockRequests = 0;
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => { lockRequests++; } });
  let lockEl: unknown = null, exits = 0;
  const doc = Object.assign(new EventTarget(), { exitPointerLock: () => { exits++; }, visibilityState: 'visible' });
  Object.defineProperty(doc, 'pointerLockElement', { get: () => lockEl });   // (Object.assign would copy a getter's value)
  input.attach(win, canvas, { pointerLock, doc: doc as unknown as PointerLockDoc });
  const loop = createLoop({ clock, timers: new SimTimers(clock), input, bus, log: createLog(false) });
  const setLock = (on: boolean, timeStamp = 10_000) => { lockEl = on ? canvas : null; doc.dispatchEvent(ev('pointerlockchange', { timeStamp })); };
  /** Run one tick and report what a system saw. */
  const seen = (fn: (i: InputImpl) => unknown) => {
    let out: unknown;
    const off = loop.addSystem('probe', 'input', () => { out = fn(input); });
    loop.tick(1 / 60);
    off();
    return out;
  };
  return { input, win, canvas, doc, loop, setLock, seen, locks: () => lockRequests, exits: () => exits };
}
const key = (type: 'keydown' | 'keyup', code: string, extra: Props = {}) => ev(type, { code, repeat: false, timeStamp: 1, ...extra });

describe('input: DOM events', () => {
  it('ignores key repeat; keyup releases; blur releases everything (no stuck keys)', () => {
    const r = rig();
    r.win.dispatchEvent(key('keydown', 'KeyW'));
    expect(r.seen((i) => i.move())).toEqual({ x: 0, y: 1 });
    r.win.dispatchEvent(key('keydown', 'KeyE'));
    r.win.dispatchEvent(key('keydown', 'KeyE', { repeat: true }));
    expect(r.seen((i) => i.pressed('interact'))).toBe(true);
    r.win.dispatchEvent(key('keydown', 'KeyE', { repeat: true }));
    expect(r.seen((i) => i.pressed('interact'))).toBe(false);     // auto-repeat never re-fires E
    r.win.dispatchEvent(ev('blur'));
    expect(r.seen((i) => [i.move(), i.held('interact')])).toEqual([{ x: 0, y: 0 }, false]);
  });
  it('key events typed into text fields are not game input (keyup still releases)', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    const r = rig();
    const field = Object.assign(new EventTarget(), { tagName: 'INPUT' });
    field.addEventListener('keydown', (e) => r.win.dispatchEvent(ev('keydown', { code: (e as KeyboardEvent).code, repeat: false, target: field })));
    const e = ev('keydown', { code: 'Space', repeat: false, target: field });
    r.win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);                        // a space typed into the name picker stays a space
    expect(r.seen((i) => i.pressed('shutter'))).toBe(false);
  });
  it('look deltas are per tick: mouse motion during a dialog does not jump the camera afterwards', () => {
    const r = rig();
    const pop = r.input.pushContext('dialog', 'E');
    r.setLock(true);
    r.win.dispatchEvent(ev('mousemove', { movementX: 400, movementY: 50, buttons: 0 }));
    r.seen(() => null);                                            // nobody consumes look in a dialog
    pop();
    expect(r.seen((i) => i.consumeLook())).toEqual({ dx: 0, dy: 0 });
    r.win.dispatchEvent(ev('mousemove', { movementX: 7, movementY: 3, buttons: 0 }));
    expect(r.seen((i) => i.consumeLook())).toEqual({ dx: 7, dy: 3 });
  });
  it('pause: presses and drags made while paused do not fire after resuming', () => {
    const r = rig();
    r.loop.setPaused(true);
    r.win.dispatchEvent(key('keydown', 'KeyE'));
    r.win.dispatchEvent(key('keyup', 'KeyE'));
    r.canvas.dispatchEvent(ev('wheel', { deltaY: -1 }));
    r.win.dispatchEvent(ev('mousemove', { movementX: 300, movementY: 0, buttons: 1 }));
    r.loop.frame(1 / 60);                                          // paused: no tick
    r.win.dispatchEvent(key('keydown', 'Escape'));                 // the Esc that closes the pause menu
    r.loop.setPaused(false);
    expect(r.seen((i) => [i.pressed('interact'), i.pressed('zoomIn'), i.pressed('escape'), i.consumeLook().dx])).toEqual([false, false, false, 0]);
    r.win.dispatchEvent(key('keydown', 'KeyE'));
    expect(r.seen((i) => i.pressed('interact'))).toBe(true);        // input works again right away
  });
  it('a mouse button released outside the window is released on the next mousemove', () => {
    const r = rig();
    r.canvas.dispatchEvent(ev('mousedown', { button: 2 }));
    expect(r.seen((i) => i.held('aimHold'))).toBe(true);
    r.win.dispatchEvent(ev('mousemove', { movementX: 1, movementY: 0, buttons: 0 }));
    expect(r.seen((i) => [i.held('aimHold'), i.released('aimHold')])).toEqual([false, true]);
  });
  it('pointer lock: requested only in play contexts; opening a modal or the title releases it', () => {
    const r = rig(true);
    const popTitle = r.input.pushContext('title', 'E');
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(r.locks()).toBe(0);                                     // clicking the title never hides the cursor
    popTitle();
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(r.locks()).toBe(1);
    r.setLock(true);
    expect(r.input.locked).toBe(true);
    r.input.pushContext('modal', 'E:phone');
    expect(r.exits()).toBe(1);
  });
  it('restores mouse control after a modal closes, even if its unlock event arrives late', () => {
    const r = rig(true);
    r.setLock(true, 1000);
    const close = r.input.pushContext('modal', 'E:phone');
    close();
    // Pointer Lock is asynchronous: the phone can close before its exit event is delivered.
    r.setLock(false, 2000);
    expect(r.seen((i) => i.pressed('escape'))).toBe(false);
    expect(r.locks()).toBe(1);
    r.setLock(true, 3000);
    r.win.dispatchEvent(ev('mousemove', { movementX: 7, movementY: 3, buttons: 0 }));
    expect(r.seen((i) => i.consumeLook())).toEqual({ dx: 7, dy: 3 });
  });
  it('losing the lock in gameplay delivers the Esc the browser swallowed (once), but not when a modal caused it', () => {
    const r = rig(true);
    r.setLock(true, 1000);
    r.setLock(false, 2000);
    expect(r.seen((i) => i.pressed('escape'))).toBe(true);
    // Esc keydown delivered AND lock lost: only one escape edge
    r.setLock(true, 3000);
    r.win.dispatchEvent(key('keydown', 'Escape', { timeStamp: 3990 }));
    r.setLock(false, 4000);
    expect(r.seen((i) => i.pressed('escape'))).toBe(true);
    r.win.dispatchEvent(key('keyup', 'Escape'));
    expect(r.seen((i) => i.pressed('escape'))).toBe(false);
    // E opened a modal (cursor context): no synthetic escape that would close it again
    r.setLock(true, 5000);
    r.input.pushContext('modal', 'E:pause');
    r.setLock(false, 6000);
    expect(r.seen((i) => i.pressed('escape'))).toBe(false);
  });
  it('nested menus restore capture only when the last cursor context closes', () => {
    const r = rig(true);
    r.setLock(true);
    const phone = r.input.pushContext('modal', 'phone');
    r.setLock(false);
    const settings = r.input.pushContext('modal', 'settings');
    settings();
    expect(r.input.context()).toBe('modal');
    expect(r.locks()).toBe(0);
    r.win.dispatchEvent(key('keydown', 'KeyW')); // menu navigation must not become walking on return
    phone();
    expect(r.locks()).toBe(1);
    expect(r.input.needsPointerLock()).toBe(true);
    expect(r.seen((i) => i.move())).toEqual({ x: 0, y: 0 });
    r.setLock(true);
    expect(r.input.needsPointerLock()).toBe(false);
    expect(r.seen((i) => i.move())).toEqual({ x: 0, y: 0 });
    r.win.dispatchEvent(key('keyup', 'KeyW'));
    r.win.dispatchEvent(key('keydown', 'KeyW'));
    expect(r.seen((i) => i.move())).toEqual({ x: 0, y: 1 });
  });
  it.each(['gameplay', 'viewfinder', 'peek'] as const)('gates %s controls until captured; the recovery click never fires a shutter', (context) => {
    const r = rig(true);
    r.input.pushContext(context, 'play');
    expect(r.input.needsPointerLock()).toBe(true);
    r.win.dispatchEvent(key('keydown', 'KeyW'));
    r.win.dispatchEvent(key('keydown', 'KeyE'));
    r.canvas.dispatchEvent(ev('wheel', { deltaY: -1 }));
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    r.win.dispatchEvent(ev('mousemove', { movementX: 12, movementY: 3, buttons: 1 }));
    expect(r.seen((i) => [i.move(), i.consumeLook(), i.pressed('interact'), i.pressed('zoomIn'), i.pressed('shutter'), i.pressed('advance')]))
      .toEqual([{ x: 0, y: 0 }, { dx: 0, dy: 0 }, false, false, false, false]);
    expect(r.locks()).toBe(1);
    r.setLock(true);
    expect(r.seen((i) => [i.move(), i.held('shutter'), i.pressed('advance')])).toEqual([{ x: 0, y: 0 }, false, false]);
    r.win.dispatchEvent(ev('mouseup', { button: 0 }));
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    r.win.dispatchEvent(ev('mousemove', { movementX: 5, movementY: 2, buttons: 1 }));
    expect(r.seen((i) => [i.pressed('shutter'), i.consumeLook()])).toEqual([true, { dx: 5, dy: 2 }]);
  });
  it('a denied restore keeps controls gated and lets a fresh click try again', async () => {
    const r = rig(true);
    const request = r.canvas.requestPointerLock;
    r.canvas.requestPointerLock = () => Promise.reject(new Error('fresh user gesture required'));
    r.setLock(true);
    r.setLock(false); // native Esc: it must not immediately steal the pointer back
    expect(r.locks()).toBe(0);
    expect(r.seen((i) => i.pressed('escape'))).toBe(true);
    const resume = r.input.pushContext('modal', 'pause');
    resume();
    await Promise.resolve();
    expect(r.input.needsPointerLock()).toBe(true);
    r.win.dispatchEvent(key('keydown', 'KeyW'));
    expect(r.seen((i) => i.move())).toEqual({ x: 0, y: 0 });
    r.canvas.requestPointerLock = request;
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(r.locks()).toBe(1);
    r.doc.dispatchEvent(ev('pointerlockerror')); // legacy implementations report failure only through the event
    r.win.dispatchEvent(ev('mouseup', { button: 0 }));
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(r.locks()).toBe(2);
    r.setLock(true);
    expect(r.input.needsPointerLock()).toBe(false);
    expect(r.seen((i) => i.held('shutter'))).toBe(false);
  });
  it('a capture granted after a modal opens releases again without dismissing the menu', () => {
    const r = rig(true);
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    const resume = r.input.pushContext('modal', 'pause');
    r.setLock(true);
    expect(r.exits()).toBe(1);
    r.setLock(false);
    expect(r.input.context()).toBe('modal');
    expect(r.seen((i) => i.pressed('escape'))).toBe(false);
    resume();
    expect(r.locks()).toBe(2);
  });
  it('uncaptured play still lets Esc/Tab open menus, while dialogue and cards accept their own keys', () => {
    const r = rig(true);
    r.win.dispatchEvent(key('keydown', 'Escape'));
    r.win.dispatchEvent(key('keydown', 'Tab'));
    expect(r.seen((i) => [i.pressed('escape'), i.pressed('phone')])).toEqual([true, true]);
    for (const context of ['dialog', 'cutscene'] as const) {
      const close = r.input.pushContext(context, 'ui');
      r.win.dispatchEvent(key('keydown', 'Space'));
      expect(r.input.needsPointerLock()).toBe(false);
      expect(r.seen((i) => i.pressed('advance'))).toBe(true);
      r.win.dispatchEvent(key('keyup', 'Space'));
      close();
    }
  });
  it('touch and test mode keep unlocked keyboard and drag controls without capture requests', () => {
    const r = rig(false);
    r.input.pushContext('modal', 'phone')();
    r.win.dispatchEvent(key('keydown', 'KeyW'));
    r.canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    r.win.dispatchEvent(ev('mousemove', { movementX: 8, movementY: 3, buttons: 1 }));
    expect(r.input.needsPointerLock()).toBe(false);
    expect(r.locks()).toBe(0);
    expect(r.seen((i) => [i.move(), i.consumeLook(), i.pressed('shutter')])).toEqual([{ x: 0, y: 1 }, { dx: 8, dy: 3 }, true]);
  });
});
