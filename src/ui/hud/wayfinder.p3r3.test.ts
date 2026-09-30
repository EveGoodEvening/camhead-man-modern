// P3r3 (open-play e): the incense badge keeps off shop signs where it can, never at the price of a HUD box.
import { describe, expect, it } from 'vitest';
import { hitsBox, placeBadge, type Box } from './wayfinder';

describe('placeBadge', () => {
  const lo = 100, hi = 620;          // a side edge: the badge slides vertically at x = 60
  it('slides off a sign board that sits on its ideal point', () => {
    const sign: Box = { x0: 0, y0: 300, x1: 200, y1: 380 };
    const q = placeBadge({ x: 60, y: 340 }, true, lo, hi, [], [sign], 20, 200);
    expect(hitsBox(q, [sign], 20)).toBe(false);
    expect(Math.abs(q.y - 340)).toBeLessThanOrEqual(200);
  });
  it('does not wander further than maxSoft for a sign (the direction would lie)', () => {
    const sign: Box = { x0: 0, y0: 120, x1: 200, y1: 600 };
    const q = placeBadge({ x: 60, y: 340 }, true, lo, hi, [], [sign], 20, 100);
    expect(q).toEqual({ x: 60, y: 340 });
  });
  it('never moves onto a HUD box to dodge a sign; HUD boxes are always avoided', () => {
    const sign: Box = { x0: 0, y0: 300, x1: 200, y1: 380 };
    const hud: Box = { x0: 0, y0: 200, x1: 200, y1: 299 };
    const q = placeBadge({ x: 60, y: 340 }, true, lo, hi, [hud], [sign], 20, 300);
    expect(hitsBox(q, [hud], 20)).toBe(false);
    const r = placeBadge({ x: 60, y: 250 }, true, lo, hi, [hud], [], 20, 300);
    expect(hitsBox(r, [hud], 20)).toBe(false);
  });
  it('leaves a free point alone', () => {
    expect(placeBadge({ x: 60, y: 500 }, true, lo, hi, [{ x0: 0, y0: 0, x1: 10, y1: 10 }], [{ x0: 300, y0: 0, x1: 400, y1: 10 }], 20, 200)).toEqual({ x: 60, y: 500 });
  });
});
