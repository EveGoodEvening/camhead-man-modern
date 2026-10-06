import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock, SimTimers } from './clock';
import { createInput } from './input';
import { createLog } from './log';
import { createLoop } from './loop';
import { parseParams } from './params';
import { createRng } from './rng';
import { cullVisible } from './scenes';

describe('rng', () => {
  it('is deterministic per seed; forks are label-keyed and independent of draws', () => {
    const a = createRng(1), b = createRng(1);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    const f1 = createRng(1).fork('world:trees'), f2 = a.fork('world:trees');
    expect(f1.next()).toBe(f2.next());
    expect(createRng(1).fork('x').next()).not.toBe(createRng(1).fork('y').next());
    const r = createRng(3);
    for (let i = 0; i < 100; i++) { const v = r.int(1, 3); expect(v >= 1 && v <= 3).toBe(true); }
  });
});

describe('params (GDD §19.1 + ARCHITECTURE §2.10)', () => {
  it('parses flags and validates ids', () => {
    const { params, warnings } = parseParams('?test&seed=5&skipTitle&chapter=ch3&phase=night&at=sw_gantry&flags=P8_done,bogus,seen:x&mute&lowfx=1&dpr=0.5&save=1&fly&debug&dev=world:walkcheck');
    expect(params).toMatchObject({ test: true, seed: 5, skipTitle: true, chapter: 'ch3', phase: 'night', at: 'sw_gantry',
      flags: ['P8_done', 'seen:x'], mute: true, lowfx: true, dpr: 0.5, save: true, fly: true, debug: true, dev: 'world:walkcheck' });
    expect(warnings).toEqual(['unknown flag bogus']);
    const d = parseParams('').params;
    expect(d).toMatchObject({ test: false, seed: 1, chapter: null, at: null, dpr: null, save: false });
    expect(parseParams('?at=nowhere&chapter=ch9').params).toMatchObject({ at: null, chapter: null });
  });
});

describe('loop', () => {
  it('runs systems in phase order, then renders once; pause stops ticks but not rendering', () => {
    const bus = new Bus(), clock = new MutableClock();
    const loop = createLoop({ clock, timers: new SimTimers(clock), input: createInput(clock, bus), bus, log: createLog(false) });
    const seq: string[] = [];
    loop.addSystem('late', 'late', () => seq.push('late'));
    loop.addSystem('in', 'input', () => seq.push('input'));
    loop.addSystem('cam', 'camera', () => seq.push('camera'));
    loop.setRenderer(() => seq.push('render'));
    loop.step(2, 1 / 60);
    expect(seq).toEqual(['input', 'camera', 'late', 'input', 'camera', 'late', 'render']);
    expect(clock.frame).toBe(2);
    seq.length = 0;
    loop.setPaused(true);
    loop.step(3, 1 / 60);
    expect(seq).toEqual(['render']);
    loop.setPaused(false);
    loop.advance(0.5);
    expect(clock.frame).toBe(32);
  });
  it('freeze stops animT but not t; sim timers resolve on t', async () => {
    const bus = new Bus(), clock = new MutableClock();
    const timers = new SimTimers(clock);
    const loop = createLoop({ clock, timers, input: createInput(clock, bus), bus, log: createLog(false) });
    clock.frozen = true;
    let done = false;
    void timers.after(0.5).then(() => { done = true; });
    loop.advance(0.6);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(clock.animT).toBe(0);
    expect(clock.t).toBeCloseTo(0.6, 9);
  });
});

describe('horizon culling', () => {
  it('hides detail objects beyond 45 m of arc or when the camera is > 60 m up', () => {
    expect(cullVisible(10, 1, 3, 1.5, true)).toBe(true);
    expect(cullVisible(50, 1, 30, 20, true)).toBe(false);
    expect(cullVisible(50, 1, 30, 20, false)).toBe(true);
    expect(cullVisible(10, 1, 3, 400, true)).toBe(false);
  });
});
