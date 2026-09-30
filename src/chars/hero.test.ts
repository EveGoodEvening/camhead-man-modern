// Hero regression tests (review pass): the viewfinder "raise" pose must never put the hands in front of the lens, and
// the back screen types his lines progressively (GDD §2.1).
import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { HumanAnimator, type AnimInput } from './anim';
import { buildHeroBody } from './hero/model';
import { typed, TYPE_CPS } from './hero/screen';
import { makeRig } from './rig';

/** Lens camera as D places it in first person: feet + 1.72 up + 0.05 forward, 55° vertical FOV at 16:9. */
function lensCamera(pitchDeg: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(55, 16 / 9, 0.05, 250);
  cam.position.set(0, 1.72, 0.05);
  const p = (pitchDeg * Math.PI) / 180;
  cam.lookAt(new Vector3(0, 1.72 + Math.sin(p), 0.05 + Math.cos(p)));
  cam.updateMatrixWorld(true);
  return cam;
}

describe('hero raise pose (viewfinder)', () => {
  const body = buildHeroBody();
  const rig = makeRig(body.bones, body.geo, new MeshBasicMaterial(), { center: [0, 0.95, 0], radius: 1.1 });
  const anim = new HumanAnimator(rig, { armOut: 8, elbow: 12 });
  const input: AnimInput = { phase: 0, move: 0, run: 0, t: 0, talk: 0, lookYaw: 0, lookPitch: 0, poses: new Map([['raise', 1]]) };
  anim.update(input);
  rig.mesh.updateMatrixWorld(true);
  const armBones = new Set(['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'].map((n) => body.bones.findIndex((b) => b.name === n)));
  const si = body.geo.getAttribute('skinIndex'), pos = body.geo.getAttribute('position');
  const armVerts: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (!armBones.has(si.getX(i))) continue;
    armVerts.push(rig.mesh.applyBoneTransform(i, new Vector3().fromBufferAttribute(pos, i)));
  }

  it('grips the phone head: hands end up beside the slab at head height', () => {
    const hl = rig.b.handL.getWorldPosition(new Vector3()), hr = rig.b.handR.getWorldPosition(new Vector3());
    expect(hl.y).toBeGreaterThan(1.46);
    expect(hr.y).toBeGreaterThan(1.46);
    expect(Math.abs(hl.x)).toBeGreaterThan(0.12);
    expect(hl.x).toBeCloseTo(-hr.x, 3);
  });

  for (const pitch of [-60, -30, 0, 20, 70]) {
    it(`no arm/hand vertex inside the first-person lens frustum at pitch ${pitch}°`, () => {
      const cam = lensCamera(pitch);
      const ndc = new Vector3();
      let inside = 0;
      for (const v of armVerts) {
        ndc.copy(v).project(cam);
        if (ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1) inside++;
      }
      expect(inside).toBe(0);
    });
  }
});

describe('back screen typing', () => {
  it('reveals his line character by character, then holds it', () => {
    const line = '……电量 1%。';
    expect(typed(line, 0)).toBe('');
    expect(typed(line, 1.5 / TYPE_CPS)).toBe('…');
    expect(typed(line, 3 / TYPE_CPS + 1e-6)).toBe('……电');
    expect(typed(line, 10)).toBe(line);
    expect(typed(line, -1)).toBe('');
  });
});
