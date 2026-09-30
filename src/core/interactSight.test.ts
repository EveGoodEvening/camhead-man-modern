// P3r2 G4: interact picking does not reach through interior walls / partitions (the darkroom bench from the studio).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createTestCore } from './testkit';
import { posToWorld } from './planet';
import { studioColliders } from '../world/interiors/plans';

function studio() {
  const { core, internals } = createTestCore();
  for (const c of studioColliders()) core.physics.registerCollider(c);
  // the darkroom bench (dk_bench) and the brown tray on it
  const bench = { x: 3.5, y: 0.9, z: -3.0 }, tray = { x: 2.9, y: 0.95, z: -3.0 };
  for (const [id, at] of [['it_dk_bench', bench], ['it_dk_tray_brown', tray]] as const) {
    core.interact.registerInteractable({ id, scene: 'studio_int', at, prompt: 'use', onInteract: () => undefined });
  }
  const standAt = (x: number, z: number, yawDeg: number) => {
    core.player.teleport({ scene: 'studio_int', at: { x, y: 0, z }, yawDeg });
    internals.loop.tick(1 / 60);
    return core.interact.current()?.id ?? null;
  };
  return { core, standAt };
}

describe('G4 interact reach vs walls', () => {
  it('facing the partition from the main room: no darkroom prompt (it used to light the bench through the wall)', () => {
    const { standAt } = studio();
    expect(standAt(1.07, -2.6, 90)).toBe(null);
    expect(standAt(1.2, -2.2, 110)).toBe(null);
  });
  it('inside the darkroom the same bench / tray are picked', () => {
    const { standAt } = studio();
    expect(standAt(3.4, -1.6, 0)).not.toBe(null);            // yaw 0 = −z (fixed interior north)
    expect(['it_dk_bench', 'it_dk_tray_brown']).toContain(standAt(2.4, -1.9, 340));
  });
  it('sightBlocked only counts the given tags and the segment itself', () => {
    const { core } = studio();
    const ph = core.physics as unknown as { sightBlocked: (s: 'studio_int', a: Vector3, b: Vector3, t: ReadonlySet<string>) => boolean };
    const a = posToWorld('studio_int', { x: 1.0, y: 1, z: -2.6 }), b = posToWorld('studio_int', { x: 2.5, y: 1, z: -2.6 });
    expect(ph.sightBlocked('studio_int', a, b, new Set(['part']))).toBe(true);
    expect(ph.sightBlocked('studio_int', a, b, new Set(['wall']))).toBe(false);
    const c = posToWorld('studio_int', { x: 1.0, y: 1, z: 1.5 }), d = posToWorld('studio_int', { x: 2.5, y: 1, z: 1.5 });   // the door gap
    expect(ph.sightBlocked('studio_int', c, d, new Set(['part']))).toBe(false);
  });
});
