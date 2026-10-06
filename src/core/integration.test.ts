// Phase 2 (I): core contract additions from docs/integration/requests-*.md (see docs/integration/STATUS.md).
import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock } from './clock';
import { createInput } from './input';
import { createTestCore } from './testkit';

describe('input.pushContext keep (requests-D #1)', () => {
  it('a kept action stays held across the push; the rest are released', () => {
    const clock = new MutableClock();
    const inp = createInput(clock, new Bus());
    const win = new EventTarget(), canvas = new EventTarget();
    inp.attach(win, canvas, { pointerLock: false, doc: Object.assign(new EventTarget(), { pointerLockElement: null }) });
    const mouse = (type: string, button: number) => {
      const e = new Event(type); Object.defineProperty(e, 'button', { value: button }); return e;
    };
    canvas.dispatchEvent(mouse('mousedown', 2));      // aimHold
    canvas.dispatchEvent(mouse('mousedown', 0));      // shutter + advance
    inp.begin(); inp.end();
    inp.pushContext('viewfinder', 'lens', { keep: ['aimHold', 'shutter'] });
    inp.begin();
    expect([inp.held('aimHold'), inp.released('aimHold'), inp.held('shutter'), inp.held('advance'), inp.released('advance')])
      .toEqual([true, false, true, false, true]);
    inp.end();
    win.dispatchEvent(mouse('mouseup', 2));           // the real release still arrives
    inp.begin();
    expect([inp.held('aimHold'), inp.released('aimHold')]).toEqual([false, true]);
    inp.end();
  });
});

describe('interact picking outside gameplay + repick (requests-D #2, requests-F #1)', () => {
  it('repick() picks at the new position without a tick; peek context picks, dialog does not', () => {
    const t = createTestCore();
    const { core } = t;
    let hits = 0;
    void core.player.goto('sp_bus_bench', { fade: false });
    t.internals.loop.tick(1 / 60);
    core.interact.registerInteractable({
      id: 'probe', scene: 'planet', at: () => core.player.pos().clone(), radius: 3, prompt: 'inspect', ignoreFacing: true,
      onInteract: () => { hits++; },
    });
    expect(core.interact.current()).toBeNull();       // not picked until a tick or repick
    core.interact.repick();
    expect(core.interact.current()?.id).toBe('probe');
    const pop = core.input.pushContext('peek', 'lens');
    core.interact.repick();
    expect(core.interact.current()?.id).toBe('probe');
    core.input.inject({ press: ['interact'] });
    t.internals.loop.tick(1 / 60);
    expect(hits).toBe(1);                             // E in the peek context triggers the pick
    pop();
    const popD = core.input.pushContext('dialog', 'E');
    core.interact.repick();
    expect(core.interact.current()).toBeNull();
    popD();
  });
});
