// P3r2 look fixer (L1–L9): pure pieces of the camera / render / smoke fixes.
import { describe, expect, it } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { unkink } from '../lens/extras';
import { routeFlag } from '../story/smoke';
import { DARKROOM, darkroomGrade, titleViewWindow } from '../render/index';
import { actorsBlock, actorsCrowd, type ActorCapsule } from '../ui/dialog/camera';
import { darkroomBenchShot, darkroomLineShot } from '../story/cams';
import { printTray } from '../world/darkroom';
import { SecondShadow } from '../chars/apparitions';
import { makeToonMaterial } from '../render/materials';
import { BOOM_SWINGS } from './cameraRig';
import { NEAR_HEAD_ON, NEAR_HIDE_ON } from '../chars/index';

describe('L7 smoke', () => {
  it('unkink drops points where the route turns back on itself, keeps the ends', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 0.2, z: 0.5 }, { x: 5, z: 0.6 }];
    const out = unkink(pts);
    expect(out[0]).toBe(pts[0]);
    expect(out[out.length - 1]).toBe(pts[3]);
    expect(out).not.toContain(pts[1]);
    const straight = [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 1.5 }, { x: 3, z: 3 }];
    expect(unkink(straight)).toEqual(straight);
  });
  it('seen:* bookkeeping flags never reset the cached routes', () => {
    expect(routeFlag('seen:tut_interact')).toBe(false);
    expect(routeFlag('seen:beat.S_wake')).toBe(false);
    expect(routeFlag('P3_done')).toBe(true);
    expect(routeFlag('roadwork_cleared')).toBe(true);
  });
});

describe('L1 darkroom', () => {
  it('the room is dim before the safelight and red once it is on', () => {
    const off = darkroomGrade(-1, [0, 0, 0]), on = darkroomGrade(DARKROOM.rampS + 1, [0, 0, 0]);
    expect(Math.max(...off)).toBeLessThan(0.6);
    expect(on[0]).toBeGreaterThan(1);
    expect(on[0]).toBeGreaterThan(on[1] * 1.6);
    expect(on[0]).toBeGreaterThan(on[2] * 1.6);
  });
  it('the print sits in the tray of the latest step and leaves the bench once the negatives hang', () => {
    const f = (...set: string[]) => (x: string) => set.includes(x);
    expect(printTray(f('dk_lit'))).toBeNull();
    expect(printTray(f('dk_lit', 'dk_tray_1'))).toBe('brown');
    expect(printTray(f('dk_lit', 'dk_tray_1', 'dk_tray_2'))).toBe('white');
    expect(printTray(f('dk_lit', 'dk_tray_1', 'dk_tray_2', 'dk_tray_3'))).toBe('blue');
    expect(printTray(f('dk_lit', 'dk_tray_1', 'dk_tray_2', 'dk_tray_3', 'dk_hung'))).toBeNull();
  });
  it('the bench camera stands in the darkroom (x ≥ partition, inside the walls) and looks at bench height', () => {
    for (const tray of [null, { x: 2.7, z: -3.05 }, { x: 4.3, z: -3.05 }]) {
      const s = darkroomBenchShot(tray, { x: 3.5, z: -1.6 });
      expect(s.pos[0]).toBeGreaterThan(1.6);
      expect(s.pos[2]).toBeGreaterThan(-3.4);
      expect(s.look[1]).toBeLessThan(s.pos[1] + 0.3);
    }
    const l = darkroomLineShot();
    expect(l.pos[1]).toBeLessThan(3.1);                  // under the darkroom's lowered ceiling
  });
});

describe('L2 dialogue camera: other people are occluders', () => {
  const up = new Vector3(0, 1, 0);
  const cap = (x: number, z: number): ActorCapsule => ({ feet: new Vector3(x, 0, z), up, top: 1.9 });
  it('a person on the sight line blocks it; one beside it does not', () => {
    const face = new Vector3(0, 1.6, 0), cam = new Vector3(0, 1.65, 3);
    expect(actorsBlock(face, cam, [cap(0, 1.5)])).toBe(true);
    expect(actorsBlock(face, cam, [cap(1.2, 1.5)])).toBe(false);
    expect(actorsBlock(face, cam, [])).toBe(false);
  });
  it('a person right next to the lens crowds the frame', () => {
    expect(actorsCrowd(new Vector3(0, 1.6, 0), [cap(0.6, 0.2)])).toBe(true);
    expect(actorsCrowd(new Vector3(0, 1.6, 0), [cap(2, 0)])).toBe(false);
  });
});

describe('L5 follow boom', () => {
  it('tries the other shoulder first, then small swings; the hero fades early and loses the head when very close', () => {
    expect(BOOM_SWINGS[0]).toBe(-1);
    expect(Math.max(...BOOM_SWINGS.map(Math.abs).filter((x) => x !== 1))).toBeLessThanOrEqual(45);
    expect(NEAR_HIDE_ON).toBeGreaterThanOrEqual(1.5);
    expect(NEAR_HEAD_ON).toBeGreaterThanOrEqual(1.1);
  });
});

describe('L8 second shadow', () => {
  it('is plain environment ink (surface id < 240: no cinnabar spirit outline)', () => {
    const s = new SecondShadow(makeToonMaterial({ vertexColors: true, lineWeight: 0 }));
    const ids = s.rig.mesh.geometry.getAttribute('aSurfaceId') as BufferAttribute;
    for (let i = 0; i < ids.count; i++) expect(ids.getX(i)).toBeLessThan(240);
  });
});

describe('L9 title / credits framing', () => {
  it('credits shift the picture right of the 40 % column; portrait titles zoom in; 16:9 titles are untouched', () => {
    expect(titleViewWindow({ credits: true, title: false, aspect: 16 / 9, py: 0.5 })).toEqual([-0.2, 0, 1, 1]);
    expect(titleViewWindow({ credits: false, title: true, aspect: 16 / 9, py: 0.6 })).toBeNull();
    const p = titleViewWindow({ credits: false, title: true, aspect: 390 / 844, py: 0.6 });
    expect(p).not.toBeNull();
    expect(p![2]).toBeLessThan(0.7);                    // ≥ 1.4× zoom
    expect(titleViewWindow({ credits: false, title: false, aspect: 0.5, py: 0.5 })).toBeNull();
  });
});
