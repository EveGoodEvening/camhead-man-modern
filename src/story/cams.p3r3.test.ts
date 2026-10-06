// src/story/cams.p3r3.test.ts — P3r3 look L3: ending A's boarding shot is staged in the parked bus's own frame.
import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BUS, STOP_LON } from '../chars/bus';
import { placeAt, SURFACES, frameAt, worldToFlat, chartToFlat } from '../core/planet';
import { BOARD_STAGE, BUS_DOOR_Z, boardShots } from './cams';

describe('ending A boarding shot (P3r3 L3)', () => {
  const bus = new Object3D();
  placeAt(bus, 'planet', { r: BUS.lane, lon: STOP_LON, h: 0 }, 90);
  bus.updateMatrixWorld(true);
  const s = boardShots(bus);
  const door = new Vector3(-1.26, 1.2, BUS.doorZ).applyMatrix4(bus.matrixWorld);
  it('uses the real door position', () => { expect(BUS_DOOR_Z).toBe(BUS.doorZ); });
  it('stands him on the kerb in front of the open door, facing it (toward the pole)', () => {
    const f = chartToFlat(s.stand), df = worldToFlat(SURFACES.planet, door);
    const d = Math.hypot(f.x - df.x, f.z - df.z);
    expect(d).toBeGreaterThan(0.8); expect(d).toBeLessThan(1.1);
    expect(Math.abs(s.stand.lon - 2)).toBeLessThan(0.3);                 // the door lines up with sp_bus_door (lon 2)
    expect(Math.min(s.yawDeg, 360 - s.yawDeg)).toBeLessThan(8);            // bus lies toward the pole (its axis is straight: ≈ 6° off the local north at the door)
    expect(BOARD_STAGE.walk).toBeGreaterThan(Math.abs(BOARD_STAGE.stand[0]) - 1.25);   // he ends up past the body side
  });
  it('the camera is ahead of the bus on the kerb side, looking back at the doorway with him in frame', () => {
    const local = s.a.pos.clone().applyMatrix4(bus.matrixWorld.clone().invert());
    expect(local.x).toBeLessThan(-1.6);                    // kerb side, off the body
    expect(local.z).toBeGreaterThan(BUS.len / 2);          // ahead of the nose
    const up = frameAt(SURFACES.planet, s.a.pos).up;
    const h = s.a.pos.clone().sub(door).dot(up);
    expect(h).toBeGreaterThan(0.2); expect(h).toBeLessThan(1.2);
    const view = s.a.look.clone().sub(s.a.pos).normalize();
    const toDoor = door.clone().sub(s.a.pos).normalize();
    expect(view.dot(toDoor)).toBeGreaterThan(Math.cos((BOARD_STAGE.fov / 2) * Math.PI / 180));
  });
});
