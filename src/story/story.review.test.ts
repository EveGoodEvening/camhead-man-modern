// Review regressions (F): a skipped beat never leaves the fade layer black; beat cameras swing round colliders; the
// P2 SMS reaches the back screen; the director does not allocate per tick while waiting.
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import type { Core } from '../contracts';
import { SURFACES, frameAt, headingToDir, posToWorld } from '../core/planet';
import { Director } from './director';
import { clearShots, relShot } from './cams';
import { createHarness } from './testHarness';

function fakeCore(extra: Record<string, unknown> = {}): { core: Core; fades: [boolean, number][] } {
  const fades: [boolean, number][] = [];
  const core = {
    clock: { t: 0 },
    // a real-time fade that has not finished yet (never resolves by itself)
    fade: (toBlack: boolean, s: number) => { fades.push([toBlack, s]); return new Promise<void>(() => undefined); },
    cameraRig: { push: () => () => undefined },
    log: { warn: () => undefined },
    ...extra,
  } as unknown as Core;
  return { core, fades };
}

describe('director', () => {
  it('skip() in the middle of a fade to black lifts the fade when the beat ends (ending A: fade 0.4 s → skip)', async () => {
    const { core, fades } = fakeCore();
    const d = new Director(core);
    d.begin('beat:S_ending_A');
    const script = (async () => { await d.fade(true, 0.4); await d.fade(false, 0.4); await d.wait(5); })();
    d.abort();
    await script;
    d.end();
    expect(fades[0]).toEqual([true, 0.4]);
    expect(fades.at(-1)?.[0]).toBe(false);
  });
  it('a beat that fades back itself is left alone', async () => {
    const fades: [boolean, number][] = [];
    const core = { clock: { t: 0 }, fade: (b: boolean, s: number) => { fades.push([b, s]); return Promise.resolve(); }, cameraRig: { push: () => () => undefined } } as unknown as Core;
    const d = new Director(core);
    d.begin('beat:S_wake');
    await d.fade(true, 0);
    await d.fade(false, 1.2);
    d.end();
    expect(fades).toEqual([[true, 0], [false, 1.2]]);
  });
  it('waits resolve on sim time', async () => {
    const { core } = fakeCore();
    const clock = core.clock as { t: number };
    const d = new Director(core);
    d.begin('x');
    let done = false;
    void d.wait(1).then(() => { done = true; });
    for (let i = 0; i < 30; i++) { clock.t += 1 / 60; d.poll(); }
    await Promise.resolve();
    expect(done).toBe(false);
    for (let i = 0; i < 31; i++) { clock.t += 1 / 60; d.poll(); }
    await Promise.resolve();
    expect(done).toBe(true);
  });
});

describe('beat cameras', () => {
  const subject = posToWorld('planet', { r: 38.5, lon: 0, h: 0 }, new Vector3());
  const facing = headingToDir(frameAt(SURFACES.planet, subject), 90);
  const opts = [{ back: -3.1, side: 0.6, height: 0.75, lookH: 0.7, fov: 40 }, { back: -4.3, side: 0.9, height: 1.45, lookH: 1.15, fov: 44 }];

  it('keeps the designed framing when nothing is in the way', () => {
    const { core } = fakeCore({ physics: { blocked: () => false } });
    const [a] = clearShots(core, 'planet', subject, facing, opts);
    expect(a.pos.distanceTo(relShot('planet', subject, facing, opts[0]).pos)).toBeLessThan(1e-6);
  });
  it('swings round the subject when a wall stands where the designed camera would be (B\'s bus shelter)', () => {
    // a wall 1.5 m in front of the subject, across the whole front half-space
    const blocked = (_s: string, p: Vector3) => p.clone().sub(subject).dot(facing) > 1.5;
    const { core } = fakeCore({ physics: { blocked } });
    const shots = clearShots(core, 'planet', subject, facing, opts);
    for (const s of shots) expect(s.pos.clone().sub(subject).dot(facing)).toBeLessThanOrEqual(1.5);
    for (const s of shots) expect(s.pos.distanceTo(subject)).toBeGreaterThan(2);
  });
});

describe('P2 SMS', () => {
  it('the truncated and the full SMS appear on the back screen (GDD §9 P2: 背屏震动，收到一条短信)', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    const spy = vi.fn();
    h.core.services.chars.hero.setScreen = spy;
    h.core.store.set('locker_seen');
    await h.settle();
    expect(spy).toHaveBeenCalledWith('typing', expect.objectContaining({ text: expect.stringContaining('取件码08▢▢') }));
    h.core.store.set('sms_full');
    await h.settle();
    expect(spy).toHaveBeenLastCalledWith('typing', expect.objectContaining({ text: expect.stringContaining('取件码0815') }));
  });
});

describe('beats vs chapter boot', () => {
  it('bootChapter during a running beat: the beat neither applies its end nor its side effects to the new state', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    const titleMode = vi.fn();
    h.core.cameraRig.setTitleMode = titleMode;
    h.core.store.set('ending_A');                      // S_ending_A starts (guard G4 is not met in ch2: force it)
    void h.story.playBeat('S_ending_A');
    h.step(5);
    expect(h.story.currentBeat()).toBe('S_ending_A');
    h.story.bootChapter('ch1');
    await h.settle();
    h.step(30);
    await h.settle();
    expect(h.has('credits_done')).toBe(false);
    expect(titleMode.mock.calls.filter((c) => c[0] === true)).toEqual([]);
    expect(h.core.store.state.chapter).toBe('ch1');
  });
  it('skip() of an ending still reaches its end state (credits_done → title)', async () => {
    const h = await createHarness({ chapter: 'finale' });
    void h.story.playBeat('S_ending_B');
    h.step(5);
    expect(h.story.skip()).toBe(true);
    await h.settle();
    expect(h.has('credits_done')).toBe(true);
    expect(h.rec.titleShown).toBeGreaterThan(0);
  });
});
