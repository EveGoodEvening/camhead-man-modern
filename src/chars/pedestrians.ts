// src/chars/pedestrians.ts — owner C. Background walkers (GDD §5.7, ≤ 6, ONE draw call): day = 2 movers carrying boxes
// (lon 60°–140°) + a delivery rider on the ring road; dusk = the rider; night = 2 late walkers (lon 330°–60°,
// `transient`, so long exposures wait them out); dawn = none. All motion is a pure function of animT.
import { Vector3, type Material } from 'three';
import type { Core } from '../contracts';
import type { ChartPos, Phase } from '../types';
import { PAL } from '../art/palette';
import { DEG, arcDistance, chartToWorld, placeAt } from '../core/planet';
import { CELLS } from './atlasLayout';
import { Kit, P, xf } from './kit';
import { makeRig, type BoneDef, type Rig } from './rig';
import type { Bone } from 'three';

export const WALKERS = 5;
type Kind = 'mover' | 'rider' | 'walker';
interface Look { kind: Kind; top: string; bottom: string; hair: string; hat?: string; box?: string }
const LOOKS: readonly Look[] = [
  { kind: 'mover', top: '#46b0cd', bottom: PAL.navy, hair: PAL.hair, box: PAL.ochre },
  { kind: 'mover', top: '#46b0cd', bottom: PAL.charcoal, hair: '#4a4038', box: '#c9a45a' },
  { kind: 'rider', top: PAL.yellow, bottom: PAL.charcoal, hair: PAL.hair, hat: PAL.yellow, box: PAL.orange },
  { kind: 'walker', top: PAL.charcoal, bottom: PAL.navy, hair: PAL.hair },
  { kind: 'walker', top: PAL.teal, bottom: '#5d6461', hair: PAL.char.hairBrown },
];
const SID = { skin: 210, top: 212, bottom: 213, hair: 211, prop: 219, shoe: 214, bike: 220 } as const;

function bones(): BoneDef[] {
  const out: BoneDef[] = [{ name: 'origin', parent: null, at: [0, 0, 0] }];
  for (let i = 0; i < WALKERS; i++) {
    out.push({ name: `p${i}`, parent: 'origin', at: [0, 0, 0] });
    out.push({ name: `p${i}legL`, parent: `p${i}`, at: [0.09, 0.8, 0] }, { name: `p${i}legR`, parent: `p${i}`, at: [-0.09, 0.8, 0] });
    out.push({ name: `p${i}armL`, parent: `p${i}`, at: [0.22, 1.36, 0] }, { name: `p${i}armR`, parent: `p${i}`, at: [-0.22, 1.36, 0] });
  }
  return out;
}

export function buildWalkersGeometry(): { geo: ReturnType<Kit['build']>; defs: BoneDef[] } {
  const defs = bones();
  const idx = (n: string) => defs.findIndex((d) => d.name === n);
  const kit = new Kit();
  LOOKS.forEach((l, i) => {
    const b = idx(`p${i}`), lL = idx(`p${i}legL`), lR = idx(`p${i}legR`), aL = idx(`p${i}armL`), aR = idx(`p${i}armR`);
    const seat = l.kind === 'rider' ? 0.35 : 0;
    kit.add(P.lathe([[0, 0.78], [0.17, 0.8], [0.17, 1.05], [0.2, 1.3], [0.12, 1.42], [0, 1.43]], 8).scale(1, 1, 0.68), l.top, SID.top, b, xf([0, -seat, 0]));
    kit.add(P.cyl(0.04, 0.045, 0.1, 6), PAL.skin, SID.skin, b, xf([0, 1.45 - seat, 0]));
    kit.add(P.sphere(0.1, 8, 6), PAL.skin, SID.skin, b, xf([0, 1.58 - seat, 0]), { cell: CELLS.walker, halfW: 0.1, halfH: 0.1, center: [0, 1.58 - seat], minNz: 0.15 });
    kit.add(P.sphere(0.108, 8, 6), l.hat ?? l.hair, SID.hair, b, xf([0, 1.6 - seat + (l.hat ? 0.02 : 0.015), -0.025]));
    for (const [bone, sx] of [[lL, 1], [lR, -1]] as const) {
      if (l.kind === 'rider') kit.add(P.limb(0.07, 0.06, 0.4, 6), l.bottom, SID.bottom, bone, xf([sx * 0.09, 0.8 - seat, 0], [-80, 0, 0]));
      else {
        kit.add(P.limb(0.075, 0.06, 0.72, 6), l.bottom, SID.bottom, bone, xf([sx * 0.09, 0.8, 0]));
        kit.add(P.box(0.12, 0.09, 0.24, 0.035, 1), PAL.clothWhite, SID.shoe, bone, xf([sx * 0.09, 0.045, 0.05]));
      }
    }
    for (const [bone, sx] of [[aL, 1], [aR, -1]] as const) {
      const fwd = l.kind === 'mover' || l.kind === 'rider';
      kit.add(P.limb(0.06, 0.05, 0.5, 6), l.top, SID.top, bone, xf([sx * 0.22, 1.36 - seat, 0], fwd ? [-65, 0, sx * 6] : [0, 0, sx * 6]));
    }
    if (l.kind === 'mover' && l.box) kit.add(P.box(0.42, 0.34, 0.34, 0.02, 1), l.box, SID.prop, b, xf([0, 1.12, 0.36]));
    if (l.kind === 'rider') {
      kit.add(P.box(0.4, 0.4, 0.4, 0.03, 1), l.box ?? PAL.orange, SID.prop, b, xf([0, 1.05, -0.45]));
      for (const z of [0.55, -0.55]) kit.add(P.cyl(0.25, 0.25, 0.08, 10).rotateZ(Math.PI / 2), '#2b3436', SID.bike, b, xf([0, 0.25, z]));
      kit.add(P.box(0.18, 0.2, 1.1, 0.05, 1), PAL.steelGreen, SID.shoe, b, xf([0, 0.45, 0]));
      kit.add(P.cube(0.5, 0.05, 0.05), '#2b3436', SID.bike, b, xf([0, 1.0, 0.55]));
      kit.add(P.cube(0.05, 0.55, 0.05), '#2b3436', SID.bike, b, xf([0, 0.75, 0.55], [-15, 0, 0]));
    }
  });
  return { geo: kit.build(), defs };
}

interface Pose { visible: boolean; r: number; lon: number; heading: number; speed: number }
/** Back and forth between lon a and b at v m/s on radius r (no allocation: called per walker per tick). */
function ping(out: Pose, t: number, a: number, b: number, v: number, r: number, off: number): void {
  const L = ((b - a) * DEG) * r, T = (2 * L) / v, k = (((t + off * T) % T) + T) % T;
  const fw = k < T / 2, d = fw ? (k / (T / 2)) : 2 - k / (T / 2);
  out.lon = a + (b - a) * d; out.heading = fw ? 90 : 270; out.r = r; out.speed = v; out.visible = true;
}
/** Pure path functions (lon in degrees; sidewalk / lane radii per GDD §5.1). */
export function walkerPose(i: number, phase: Phase, t: number, out: Pose): Pose {
  out.visible = false; out.speed = 0;
  const kind = LOOKS[i]?.kind;
  if (phase === 'day' && kind === 'mover') ping(out, t, 62, 138, 1.1, i === 0 ? 38.3 : 29.8, i * 0.37);
  else if ((phase === 'day' || phase === 'dusk') && kind === 'rider') {
    if (phase === 'day') ping(out, t, -18, 170, 5, 32.6, 0.1);
    else { const L = 2 * Math.PI * 35.5; out.lon = (((t * 5) / L) * 360) % 360; out.heading = 90; out.r = 35.5; out.speed = 5; out.visible = true; }
    if (out.heading === 270) out.r = 32.6; else out.r = 35.5;
  } else if (phase === 'night' && kind === 'walker') ping(out, t, -30, 60, 1.25, i === 3 ? 38.3 : 29.8, i * 0.29);
  if (out.lon < 0) out.lon += 360;
  return out;
}

export class Pedestrians {
  private rig!: Rig;
  private readonly core: Core;
  private readonly pose: Pose = { visible: false, r: 0, lon: 0, heading: 0, speed: 0 };
  private readonly at: ChartPos = { r: 0, lon: 0, h: 0 };
  private readonly w = new Vector3();
  private readonly u = new Vector3();
  /** Per-walker bones, resolved once (no per-frame name lookups). */
  private refs: { b: Bone; legL: Bone; legR: Bone; armL: Bone; armR: Bone }[] = [];
  constructor(core: Core) { this.core = core; }
  build(mat: Material): void {
    const { geo, defs } = buildWalkersGeometry();
    this.rig = makeRig(defs, geo, mat, { center: [0, 0, 0], radius: 400 });
    this.rig.mesh.frustumCulled = false;
    this.rig.mesh.castShadow = false;               // small and mostly far: keep them out of the ≤ 35k shadow pass
    this.rig.mesh.userData.hideInPast = true;
    this.rig.mesh.name = 'pedestrians';
    const b = this.rig.b;
    this.refs = Array.from({ length: WALKERS }, (_, i) => ({
      b: b[`p${i}`], legL: b[`p${i}legL`], legR: b[`p${i}legR`], armL: b[`p${i}armL`], armR: b[`p${i}armR`],
    }));
    this.core.scenes.get('planet').add(this.rig.mesh);
  }
  update(): void {
    const core = this.core, phase = core.store.state.phase, t = core.clock.animT;
    const planet = core.scenes.active === 'planet';
    this.rig.mesh.visible = planet;
    this.rig.mesh.userData.transient = phase === 'night';
    if (!planet) return;
    const cam = core.cameraRig.camera.position;
    let shown = 0;
    for (let i = 0; i < WALKERS; i++) {
      const r = this.refs[i], b = r.b;
      const p = walkerPose(i, phase, t, this.pose);
      if (!p.visible) { b.scale.setScalar(1e-4); continue; }
      this.at.r = p.r; this.at.lon = p.lon;
      if (arcDistance(chartToWorld(this.at, this.w), cam) > 48) { b.scale.setScalar(1e-4); continue; }
      b.scale.setScalar(1);
      shown++;
      placeAt(b, 'planet', this.at, p.heading);
      const ph = (t * p.speed) / 1.5 * Math.PI * 2 + i;
      const kind = LOOKS[i].kind;
      const legA = kind === 'rider' ? 0 : 0.45 * Math.sin(ph);
      r.legL.rotation.x = -legA; r.legR.rotation.x = legA;
      const armA = kind === 'walker' ? 0.4 * Math.sin(ph) : 0.05 * Math.sin(ph * 2);
      r.armL.rotation.x = armA; r.armR.rotation.x = -armA;
      b.position.addScaledVector(this.u.copy(this.w).normalize(), kind === 'rider' ? 0 : 0.02 * Math.abs(Math.cos(ph)));
    }
    this.rig.mesh.visible = shown > 0;               // no draw call (and no 3.4k degenerate tris) when nobody is near
  }
}
