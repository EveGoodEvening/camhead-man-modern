// src/chars/bus.ts — owner C. 0 路 (GDD §6.1 / §9 S_group_photo / §15): a vintage two-tone bus (≤ 1.5k tris) with the
// glowing 「0 路 · 往：昨天」 sign; drives along the ring road's outer lane and stops with its door at sp_bus_door.
import { Object3D, PlaneGeometry, type BufferGeometry, type Material } from 'three';
import type { Core, Handle } from '../contracts';
import type { ChartPos } from '../types';
import { PAL } from '../art/palette';
import { DEG, placeAt } from '../core/planet';
import { CELLS } from './atlasLayout';
import { Kit, P, xf } from './kit';
import { boneIndex, makeRig, type BoneDef, type Rig } from './rig';

// P3r3 look L3: the door moved ahead of the front wheel (z 2.9 → 3.8: it sat over the wheel arch) and opens fully onto a
// dark doorway, so ending A's 「主角上车」 reads as stepping in instead of walking into a teal wall.
export const BUS = { len: 9, w: 2.5, h: 3.0, lane: 35.5, doorZ: 3.8 } as const;
/** How far the folding door slides back (−z) when open: the whole 1 m doorway shows. */
export const DOOR_OPEN = -0.95;
/** Bus centre longitude when its front door lines up with sp_bus_door (lon 2°). */
export const STOP_LON = 2 - (BUS.doorZ / BUS.lane) / DEG;
const FROM_LON = STOP_LON - 75, TO_LON = STOP_LON + 80;
const SID = { body: 216, glass: 217, roof: 218, trim: 219, wheel: 220, door: 221, light: 222 } as const;

const BONES: BoneDef[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'wheelF', parent: 'root', at: [0, 0.45, 2.9] },
  { name: 'wheelB', parent: 'root', at: [0, 0.45, -2.9] },
  { name: 'door', parent: 'root', at: [-1.26, 1.2, BUS.doorZ] },
];

export function buildBusGeometry(): BufferGeometry {
  const kit = new Kit(), bi = boneIndex(BONES), L = BUS.len, W = BUS.w;
  kit.add(P.box(W, 1.25, L, 0.12, 1), PAL.teal, SID.body, 0, xf([0, 0.95, 0]));
  kit.add(P.cube(W + 0.02, 0.12, L + 0.02), PAL.orange, SID.trim, 0, xf([0, 1.55, 0]));
  kit.add(P.cube(W - 0.04, 0.85, L - 0.3), PAL.glassDark, SID.glass, 0, xf([0, 2.02, -0.05]));
  kit.add(P.box(W, 0.5, L, 0.18, 1), '#e8efdf', SID.roof, 0, xf([0, 2.66, 0]));
  for (let i = 0; i < 7; i++) {
    const z = -L / 2 + 0.55 + i * 1.3;
    kit.add(P.cube(W + 0.03, 0.85, 0.14), '#e8efdf', SID.roof, 0, xf([0, 2.02, z]));
  }
  // front: windscreen, pillars, bumper, headlights; back: tail lights
  kit.add(P.cube(W - 0.3, 0.95, 0.06), PAL.glassDark, SID.glass, 0, xf([0, 1.98, L / 2 + 0.005]));
  kit.add(P.cube(W + 0.04, 0.22, 0.2), '#2b3436', SID.trim, 0, xf([0, 0.42, L / 2 + 0.02]));
  kit.add(P.cube(W + 0.04, 0.22, 0.2), '#2b3436', SID.trim, 0, xf([0, 0.42, -L / 2 - 0.02]));
  for (const sx of [1, -1]) {
    kit.add(P.cyl(0.13, 0.13, 0.06, 10).rotateX(Math.PI / 2), PAL.yellow, SID.light, 0, xf([sx * 0.85, 0.85, L / 2 + 0.03]));
    kit.add(P.cube(0.25, 0.3, 0.06), PAL.bannerRed, SID.light, 0, xf([sx * 0.95, 1.0, -L / 2 - 0.02]));
    // side mirrors on stalks
    kit.add(P.cube(0.05, 0.05, 0.45), '#2b3436', SID.trim, 0, xf([sx * 1.35, 2.2, L / 2 - 0.1], [0, sx * 30, 0]));
    kit.add(P.cube(0.08, 0.35, 0.18), '#2b3436', SID.trim, 0, xf([sx * 1.5, 2.0, L / 2 + 0.1]));
  }
  // wheels on axle bones (spin), with metal hubs
  for (const [bone, z] of [['wheelF', 2.9], ['wheelB', -2.9]] as const) {
    for (const sx of [1, -1]) {
      kit.add(P.cyl(0.45, 0.45, 0.32, 12).rotateZ(Math.PI / 2), '#2b3436', SID.wheel, bi(bone), xf([sx * 1.1, 0.45, z]));
      kit.add(P.cyl(0.2, 0.2, 0.34, 6).rotateZ(Math.PI / 2), PAL.metalRail, SID.trim, bi(bone), xf([sx * 1.1, 0.45, z]));
    }
  }
  // folding door on the kerb side (the bus's right = −X), sign box over the windscreen
  kit.add(P.cube(0.06, 1.95, 1.0), '#35565d', SID.door, bi('door'), xf([-1.265, 1.35, BUS.doorZ]));
  kit.add(P.cube(0.07, 0.05, 1.0), PAL.orange, SID.trim, bi('door'), xf([-1.27, 1.55, BUS.doorZ]));
  // the dark doorway the door slides off (just proud of the body side; the closed door covers it)
  kit.add(P.cube(0.012, 1.9, 0.96), '#162022', SID.glass, 0, xf([-1.256, 1.35, BUS.doorZ]));
  kit.add(P.cube(2.0, 0.42, 0.12), '#2b3436', SID.trim, 0, xf([0, 2.66, L / 2 + 0.02]));
  // a small route plate by the door
  kit.add(P.cube(0.02, 0.4, 0.3), '#e8efdf', SID.roof, 0, xf([-1.27, 2.0, BUS.doorZ - 1.75]));
  return kit.build();
}
export function buildBusSign(): BufferGeometry {
  const kit = new Kit();
  kit.add(new PlaneGeometry(1.9, 0.36), '#ffffff', SID.light, 0, xf([0, 2.66, BUS.len / 2 + 0.085]),
    { cell: CELLS.busSign, halfW: 0.95, halfH: 0.18, center: [0, 2.66] });
  return kit.build();
}

type Motion = { from: number; to: number; t0: number; dur: number; ease: 'out' | 'in'; done: () => void } | null;
/** A timed 0→1 tween of one bus part (P3r3 look L3: the ending's boarding). */
type Tween = { t0: number; dur: number; apply: (k: number) => void; done: () => void };
/** P3r3 look L3: where the uniform floats to when he boards (bus-local x; inside the body, hidden by the side). */
export const BOARD_IN_X = -0.55;

export class BusZero {
  readonly root = new Object3D();
  /** The attendant's anchor after bus_arrived: in the driver seat (left-hand drive) while the bus moves; P3-look L2: in
   *  the open front doorway while it stands at the stop, facing the kerb — the body is a solid block with no interior, so
   *  the ending's 「上车吗？」 used to be filmed at a teal wall with the attendant hidden inside it. */
  readonly driverSeat = new Object3D();
  private col: Handle | null = null;
  private readonly core: Core;
  private rig!: Rig;
  private lon = FROM_LON;
  private motion: Motion = null;
  private readonly at: ChartPos = { r: BUS.lane, lon: FROM_LON, h: 0 };
  private readonly tweens: Tween[] = [];

  constructor(core: Core) {
    this.core = core;
    this.root.name = 'bus_zero';
    this.root.userData.hideInPast = true;
    this.root.userData.actorId = 'bus_zero';
    this.root.visible = false;
  }
  build(body: Material, sign: Material): void {
    this.rig = makeRig(BONES, buildBusGeometry(), body, { center: [0, 1.5, 0], radius: 5.2 });
    this.root.add(this.rig.mesh);
    const s = makeRig([{ name: 'root', parent: null, at: [0, 0, 0] }], buildBusSign(), sign, { center: [0, 2.6, 4.5], radius: 1.2 });
    s.mesh.castShadow = false;
    this.root.add(s.mesh);
    this.seat(false);
    this.root.add(this.driverSeat);
    this.core.scenes.get('planet').add(this.root);
  }
  /** Parked at the stop (bus_arrived after a load). */
  park(): void {
    this.dropTweens();
    this.motion?.done(); this.motion = null; this.lon = STOP_LON; this.root.visible = true;
    if (this.rig) this.rig.b.door.position.z = this.rig.rest.door.z + DOOR_OPEN;
    this.place(); this.stopped(true);
  }
  hide(): void { this.dropTweens(); this.motion?.done(); this.motion = null; this.root.visible = false; this.stopped(false); }
  /** Standing at the stop: attendant in the doorway, and a collider box so the walker and the camera booms (follow,
   *  dialogue) stay out of the body. Moving: attendant back in the driver seat, no collider. */
  private stopped(on: boolean): void {
    this.seat(on);
    this.col?.remove(); this.col = null;
    if (on) {
      try {
        this.col = this.core.physics.registerCollider({
          scene: 'planet', shape: { kind: 'box', at: { ...this.at }, headingDeg: 90, halfW: BUS.w / 2, halfD: BUS.len / 2 },
          hRange: [-1, BUS.h + 0.1], tag: 'bus:zero',
        });
      } catch { this.col = null; }
    }
  }
  private seat(door: boolean): void {
    if (door) { this.driverSeat.position.set(-1.5, 0, BUS.doorZ + 0.05); this.driverSeat.rotation.set(0, -Math.PI / 2, 0); }
    else { this.driverSeat.position.set(0.62, 0.55, 3.3); this.driverSeat.rotation.set(0, 0, 0); }
    this.driverSeat.userData.atDoor = door;
    this.driverSeat.updateMatrixWorld(true);
  }
  /** P3r3 look L3 (ending A): the uniform in the doorway floats back into the bus, making room for him. */
  board(seconds: number): Promise<void> {
    if (!this.driverSeat.userData.atDoor) return Promise.resolve();
    const x0 = this.driverSeat.position.x;
    return this.tween(seconds, (k) => { this.driverSeat.position.x = x0 + (BOARD_IN_X - x0) * k; this.driverSeat.updateMatrixWorld(true); });
  }
  /** P3r3 look L3 (ending A): the folding door slides shut (GDD §15.1 「车门关上」). */
  closeDoor(seconds: number): Promise<void> {
    if (!this.rig) return Promise.resolve();
    const door = this.rig.b.door, z0 = door.position.z, z1 = this.rig.rest.door.z;
    return this.tween(seconds, (k) => { door.position.z = z0 + (z1 - z0) * k * k * (3 - 2 * k); });
  }
  /** A new motion / park / hide re-seats the attendant and the door: pending tweens end there (resolved, not applied). */
  private dropTweens(): void { for (const w of this.tweens.splice(0)) w.done(); }
  private tween(seconds: number, apply: (k: number) => void): Promise<void> {
    if (!(seconds > 0)) { apply(1); return Promise.resolve(); }
    return new Promise((res) => { this.tweens.push({ t0: this.core.clock.t, dur: seconds, apply, done: res }); });
  }
  arrive(seconds: number): Promise<void> { return this.move(FROM_LON, STOP_LON, seconds, 'out', true); }
  depart(seconds: number): Promise<void> { return this.move(STOP_LON, TO_LON, seconds, 'in', false); }

  private move(from: number, to: number, seconds: number, ease: 'out' | 'in', stayVisible: boolean): Promise<void> {
    this.dropTweens();
    this.motion?.done();
    this.root.visible = true;
    this.stopped(false);
    this.lon = from; this.place();
    const end = () => { if (!stayVisible) this.root.visible = false; else if (ease === 'out') this.stopped(true); };
    if (!(seconds > 0)) {
      this.lon = to; this.place();
      if (ease === 'out' && this.rig) this.rig.b.door.position.z = this.rig.rest.door.z + DOOR_OPEN;
      end(); return Promise.resolve();
    }
    return new Promise((res) => {
      this.motion = { from, to, t0: this.core.clock.t, dur: seconds, ease, done: () => { this.motion = null; end(); res(); } };
    });
  }
  update(): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const w = this.tweens[i], k = Math.min(1, (this.core.clock.t - w.t0) / w.dur);
      w.apply(k);
      if (k >= 1) { this.tweens.splice(i, 1); w.done(); }
    }
    const m = this.motion;
    if (!m) return;
    const k = Math.min(1, (this.core.clock.t - m.t0) / m.dur);
    const e = m.ease === 'out' ? 1 - (1 - k) * (1 - k) : k * k;
    const prev = this.lon;
    this.lon = m.from + (m.to - m.from) * e;
    const dist = (this.lon - prev) * DEG * BUS.lane;
    this.rig.b.wheelF.rotation.x += dist / 0.45;
    this.rig.b.wheelB.rotation.x += dist / 0.45;
    this.rig.b.door.position.z = this.rig.rest.door.z + (k > 0.97 && m.ease === 'out' ? DOOR_OPEN : 0);
    this.place();
    if (k >= 1) m.done();
  }
  private place(): void {
    this.at.lon = this.lon;
    placeAt(this.root, 'planet', this.at, 90);
    this.root.updateMatrixWorld(true);
  }
}
