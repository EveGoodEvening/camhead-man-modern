import { describe, expect, it } from 'vitest';
import { Bus } from '../events';
import { MutableClock } from './clock';
import { createInput } from './input';
import { KEYMAP, actionsForKey, actionsForMouse, actionsForWheel, moveVector } from './keymap';

describe('keymap (GDD §4)', () => {
  it('maps the table', () => {
    expect(actionsForKey('KeyE')).toEqual(['interact', 'advance']);
    expect(actionsForKey('Space')).toEqual(['shutter', 'advance']);
    expect(actionsForKey('Digit2')).toEqual(['zoom3', 'choice2']);
    expect(actionsForKey('Digit4')).toEqual(['choice4']);
    expect(actionsForKey('Tab')).toEqual(['phone']);
    expect(actionsForKey('KeyJ')).toEqual(['memo']);
    expect(actionsForKey('KeyN')).toEqual(['night']);
    expect(actionsForKey('KeyQ')).toEqual(['flash']);
    expect(actionsForKey('KeyR')).toEqual(['overlay']);
    expect(actionsForKey('KeyG')).toEqual(['show']);
    expect(actionsForKey('KeyH')).toEqual(['hint']);
    expect(actionsForKey('KeyF')).toEqual(['aimToggle']);
    expect(actionsForKey('Escape')).toEqual(['escape']);
    expect(actionsForKey('ShiftLeft')).toEqual(['run']);
    expect(actionsForKey('KeyZ')).toEqual([]);
    expect(actionsForMouse(0)).toEqual(['shutter', 'advance']);
    expect(actionsForMouse(2)).toEqual(['aimHold']);
    expect(actionsForWheel(-1)).toEqual(['zoomIn']);
    expect(actionsForWheel(1)).toEqual(['zoomOut']);
    expect(Object.keys(KEYMAP)).toContain('KeyW');
  });
  it('moveVector normalises diagonals', () => {
    const v = moveVector((a) => a === 'forward' || a === 'right');
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    expect(moveVector(() => false)).toEqual({ x: 0, y: 0 });
  });
});

describe('input: edges, context stack, injection', () => {
  it('inject() feeds exactly the next tick', () => {
    const inp = createInput(new MutableClock(), new Bus());
    inp.inject({ move: { x: 0, y: 1 }, press: ['interact'] });
    inp.begin();
    expect(inp.move()).toEqual({ x: 0, y: 1 });
    expect(inp.pressed('interact')).toBe(true);
    inp.end();
    inp.begin();
    expect(inp.move()).toEqual({ x: 0, y: 0 });
    expect(inp.pressed('interact')).toBe(false);
    inp.end();
  });
  it('context stack: top wins; pops are order-independent', () => {
    const inp = createInput(new MutableClock(), new Bus());
    expect(inp.context()).toBe('gameplay');
    const popA = inp.pushContext('viewfinder', 'D');
    const popB = inp.pushContext('dialog', 'E');
    expect(inp.context()).toBe('dialog');
    popA();
    expect(inp.context()).toBe('dialog');
    popB();
    expect(inp.context()).toBe('gameplay');
  });
  it('look uses sensitivity and invertY from the settings event', () => {
    const bus = new Bus();
    const inp = createInput(new MutableClock(), bus);
    bus.emit('settings', { sens: 2, invertY: true, volume: 1, textSpeed: 'mid' });
    inp.inject({ look: { dx: 3, dy: 4 } });
    inp.begin();
    expect(inp.consumeLook()).toEqual({ dx: 6, dy: -8 });
    expect(inp.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });
});
