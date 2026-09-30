// P3r3 (open-play b): the night-talk E gate.
import { describe, expect, it } from 'vitest';
import { TALK_GUARD, TalkGate } from './talkGate';

/** Simulate ticks at 60 Hz: dialogue open until `closeAt`, E pressed (held 4 ticks) at each time in `presses`. */
function run(closeAt: number, presses: readonly number[], until: number): number[] {
  const g = new TalkGate();
  const opened: number[] = [];
  let heldLeft = 0;
  let open = true;
  for (let f = 0; f * (1 / 60) <= until; f++) {
    const t = f / 60;
    if (open && t >= closeAt) open = false;
    const down = presses.some((p) => Math.abs(p - t) < 0.5 / 60);
    if (down) heldLeft = 4;
    if (open) g.busy(t);
    g.tick(heldLeft > 0);
    if (down && !open && g.press(t)) { opened.push(+t.toFixed(2)); open = true; closeAt = Infinity; }
    if (heldLeft > 0) heldLeft--;
  }
  return opened;
}

describe('TalkGate', () => {
  it('the E that closed the box never reopens it, even if the key is still held', () => {
    expect(run(1, [1], 3)).toEqual([]);
  });
  it('mashing through the end at any cadence below the guard never reopens the talk', () => {
    for (const cadence of [0.15, 0.4, 0.6, 0.7, 0.9]) {
      const presses = Array.from({ length: 12 }, (_, i) => 1 + i * cadence);
      expect(run(1, presses, 1 + 12 * cadence), `cadence ${cadence}`).toEqual([]);
    }
  });
  it('a deliberate E after a quiet pause opens a new talk', () => {
    expect(run(1, [1, 1.4, 1.4 + TALK_GUARD + 0.1], 4)).toEqual([+(1.4 + TALK_GUARD + 0.1).toFixed(2)]);
    expect(run(1, [1 + TALK_GUARD + 0.05], 4).length).toBe(1);
  });
  it('before any dialogue the gate is open', () => {
    const g = new TalkGate();
    g.tick(false);
    expect(g.press(0)).toBe(true);
  });
});
