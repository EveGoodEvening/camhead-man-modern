// src/core/crane.p3r3.test.ts — P3r3 look L4: with a wall right behind him the follow camera cranes up and tilts down,
// so his head sits in the lower part of the frame instead of filling it.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { CRANE, FOLLOW, cranePose, craneRise } from './cameraRig';

describe('follow crane (P3r3 L4)', () => {
  const up = new Vector3(0, 1, 0), fwd = new Vector3(0, 0, -1), back = new Vector3(0, 0, 1);
  const feet = new Vector3(0, 0, 0), pivot = feet.clone().addScaledVector(up, FOLLOW.eye);
  for (const room of [0.3, 0.64, 1.0, 1.4]) {
    it(`room ${room} m: head in the lower frame, camera clear of the head, pitch ≤ ${CRANE.maxPitch}°`, () => {
      const pos = new Vector3(), tgt = new Vector3();
      const rise = craneRise(room, false);
      const pitch = cranePose(pivot, up, back, fwd, room, rise, FOLLOW.fov, pos, tgt);
      expect(pitch).toBeGreaterThan(10);
      expect(pitch).toBeLessThanOrEqual(CRANE.maxPitch);
      const cam = new PerspectiveCamera(FOLLOW.fov, 16 / 9, 0.1, 100);
      cam.position.copy(pos); cam.up.copy(up); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const head = feet.clone().addScaledVector(up, CRANE.head);
      const n = head.clone().project(cam);
      expect(n.z).toBeLessThan(1);
      expect(n.y).toBeLessThan(-0.2);                 // below the centre
      expect(n.y).toBeGreaterThan(-1.05);             // (the top of) the head stays in frame
      expect(Math.abs(n.x)).toBeLessThan(0.3);
      expect(pos.clone().sub(feet).dot(up)).toBeGreaterThan(CRANE.head + 0.3);   // above his head
    });
  }
  it('interiors stay under the ceiling', () => {
    expect(FOLLOW.eye + craneRise(5, true)).toBeLessThanOrEqual(CRANE.interiorTop + 1e-9);
  });
});
