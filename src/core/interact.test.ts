import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SURFACES, frameAt, posToWorld } from './planet';
import { pickInteractable, type PickItem } from './interact';

describe('interaction picking (ARCHITECTURE §2.8.6)', () => {
  const S = SURFACES.subway_int;
  const feet = posToWorld('subway_int', { x: -2.8, y: 0, z: -1.5 });
  const f = frameAt(S, feet);
  const facing = new Vector3(1, 0, 0);                        // east, toward the attendant
  const item = (x: number, y: number, z: number, priority = 0, radius = 2.5): PickItem =>
    ({ pos: posToWorld('subway_int', { x, y, z }), radius, priority, ignoreFacing: false });
  it('priority beats distance (it_gantry over the attendant 1.8 m away)', () => {
    const attendant = item(-1, 0, -1.5);
    const gantry = item(-1, 1, 0, 10);
    expect(pickInteractable([attendant, gantry], feet, f.up, facing)).toBe(1);
    expect(pickInteractable([attendant, { ...gantry, priority: 0 }], feet, f.up, facing)).toBe(0);
  });
  it('respects the ±60° cone and the radius', () => {
    expect(pickInteractable([item(-4.8, 1, -1.5)], feet, f.up, facing)).toBe(-1);            // behind
    expect(pickInteractable([{ ...item(-4.8, 1, -1.5), ignoreFacing: true }], feet, f.up, facing)).toBe(0);
    expect(pickInteractable([item(1, 1, -1.5)], feet, f.up, facing)).toBe(-1);               // 3.8 m away
  });
  it('prefers the more central of two equal-priority items', () => {
    const a = item(-1.3, 1, -0.4), b = item(-1.3, 1, -1.5);
    expect(pickInteractable([a, b], feet, f.up, facing)).toBe(1);
  });
});
