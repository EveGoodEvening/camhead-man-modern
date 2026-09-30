// src/story/p3r3gameplay.test.ts — P3r3 gameplay fixes through the real core + story (fake E/D): G1 stand-spot
// interacts are anchored on their object (the studio shutter prompt on the landing), G12 dialogue friction (王阿婆's
// photo request follows her first lines; a wrong name reopens the picker), G10 interior exits in reach.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createHarness } from './testHarness';
import { objectAnchor } from './glue';
import { INTERACTS } from '../data/interacts';
import { SPOTS } from '../data/locations';
import { SURFACES, frameAt, headingToDir, posToWorld } from '../core/planet';
import { pickInteractable } from '../core/interact';

describe('G1: stand-spot interacts sit on their object', () => {
  const door = SPOTS.find((s) => s.id === 'sp_studio_door')!;
  const def = INTERACTS.find((d) => d.id === 'it_studio_shutter' && d.prompt === 'enter')!;
  const anchor = objectAnchor('planet', door.pos, door.yaw ?? 0, def.ahead ?? 0, def.lift ?? 1);
  const pick = (r: number, h: number, yaw: number) => {
    const feet = posToWorld('planet', { r, lon: 104, h });
    const f = frameAt(SURFACES.planet, feet);
    return pickInteractable([{ pos: anchor, radius: def.range ?? 2.5, priority: 0, ignoreFacing: false }], feet, f.up, headingToDir(f, yaw));
  };
  it('the shutter anchor is ≈ 1.2 m past the stand spot, at chest height', () => {
    const feet = posToWorld('planet', door.pos);
    expect(anchor.distanceTo(feet)).toBeGreaterThan(1.4);
  });
  it('the prompt holds on the whole landing facing the shutter, and on the top of the stairs', () => {
    for (const r of [17.5, 17.34, 17.18, 17.07, 16.9]) for (const yaw of [-40, 0, 40]) expect(pick(r, 1.2, yaw), `r ${r} yaw ${yaw}`).toBe(0);
    expect(pick(18.58, 0.75, 0)).toBe(0);
    expect(pick(17.07, 1.2, 180)).toBe(-1);                          // back to it: nothing (the cone still applies)
  });
  it('in the real core the landing picks the shutter, anchored on the shutter', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.set('P2_done');
    h.core.player.teleport({ scene: 'planet', at: { r: 17.07, lon: 104, h: 1.2 }, yawDeg: 0, pitchDeg: 0 });
    h.core.interact.repick();
    const cur = h.core.interact.current();
    expect(cur?.id).toBe('it_studio_shutter');
    const feet = h.core.player.pos(new Vector3());
    expect(cur!.anchor.distanceTo(feet)).toBeGreaterThan(0.8);      // the label is drawn on the shutter, not his feet
  });
});

describe('G12: conversation friction', () => {
  it('王阿婆: her photo request follows her first lines when the temple film is known', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.set('film_at_tudi');
    h.goto('sp_store_front'); h.step(2);
    await h.talk('granny_wang');
    await h.settle();
    expect(h.rec.nodes.slice(-2)).toEqual(['granny.first', 'granny.ask_photo']);
    expect(h.has('granny_asked_photo')).toBe(true);
  });
  it('王阿婆 without the temple film: only her first lines', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    await h.talk('granny_wang');
    await h.settle();
    expect(h.rec.nodes).toContain('granny.first');
    expect(h.rec.nodes).not.toContain('granny.ask_photo');
  });
  it('站务员: a wrong name reopens the picker at once', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.goto('sw_gantry'); h.step(2);
    await h.talk('attendant');
    expect(h.rec.ui.filter((u) => u === 'namepicker').length).toBe(1);
    h.input('namepicker', ['王', '明']);
    await h.settle();
    expect(h.rec.nodes).toContain('att.wrong');
    expect(h.rec.ui.filter((u) => u === 'namepicker').length).toBe(2);
  });
});

describe('G10: interior exits are in reach of the smoke end', () => {
  it('st_exit / sw_exit pick the exit interact', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    h.core.player.teleport({ scene: 'studio_int', at: { x: 0, y: 0, z: 4.6 }, yawDeg: 180, pitchDeg: 0 });
    h.core.interact.repick();
    expect(h.core.interact.current()?.id).toBe('it_st_exit');
    h.core.store.set('subway_entered');
    h.core.player.teleport({ scene: 'subway_int', at: { x: -8.6, y: 0, z: 0 }, yawDeg: 270, pitchDeg: 0 });
    h.core.interact.repick();
    expect(h.core.interact.current()?.id).toBe('it_sw_exit');
  });
});
