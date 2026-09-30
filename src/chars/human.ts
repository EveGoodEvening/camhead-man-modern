// src/chars/human.ts — owner C. Generic chunky humanoid (ART §7.1/§7.3): shaped lathe torso, tapered capsule limbs,
// 1.2× mitten hands, 1.3× shoes, a round head with a projected face decal. Builders add hair, hats and props on top.
import { Kit, P, xf } from './kit';
import { humanBones, boneIndex, type BodySpec, type BoneDef } from './rig';
import type { CellRect } from './atlasLayout';

export type Prof = readonly (readonly [number, number])[];   // (radius, absolute y), bottom → top

export interface HumanLook {
  spec: BodySpec;
  skin: string;
  /** Upper torso on `chest` (from `split` up), lower on `spine`; `depth` squashes z (0.62 = oval chest). */
  torso: { prof: Prof; color: string; sid: number; depth: number; split: number; lowerColor?: string; lowerSid?: number };
  pelvis?: { prof: Prof; color: string; sid: number; depth?: number };
  arm: { color: string; sid: number; r: readonly [number, number, number, number]; cuff?: { color: string; sid: number }; foreColor?: string; foreSid?: number };
  hand: { scale: number; color?: string; sid: number };
  leg: {
    color: string; sid: number; r: readonly [number, number, number, number];
    shinColor?: string; shinSid?: number; cuff?: { color: string; sid: number };
  } | null;
  /** Radial segments of limbs (default 6 lean / 8). */
  limbSeg?: number;
  shoe: { color: string; sid: number; w: number; h: number; d: number; sole?: { color: string; sid: number } } | null;
  head: { r: number; sx: number; sy: number; sz: number; face: CellRect; faceSid: number; neck?: number; faceColor?: string } | null;
  seg?: number;
  /** Low-poly limbs/hands/shoes (NPCs); the hero keeps rounded-box sneakers. */
  lean?: boolean;
}

export interface HumanBuild { kit: Kit; bones: BoneDef[]; bi: (n: string) => number; headCenter: readonly [number, number, number] }

/** Lathe torso part: profile swept round Y, z squashed by `depth`. */
function torsoPart(kit: Kit, prof: Prof, color: string, sid: number, bone: number, depth: number, seg: number): void {
  const g = P.lathe(prof.map(([r, y]) => [r, y] as const), seg);
  g.scale(1, 1, depth);
  kit.add(g, color, sid, bone);
}

export function buildHuman(look: HumanLook, extraBones: readonly BoneDef[] = []): HumanBuild {
  const s = look.spec, seg = look.seg ?? 8;
  const bones = [...humanBones(s), ...extraBones];
  const bi = boneIndex(bones);
  const kit = new Kit();
  const t = look.torso;
  const lower = t.prof.filter(([, y]) => y <= t.split + 0.03);
  const upper: (readonly [number, number])[] = t.prof.filter(([, y]) => y >= t.split - 0.03);
  if (upper.length && upper[0][0] > 0) upper.unshift([upper[0][0] * 0.97, upper[0][1] - 0.06]);   // overlap hides the seam
  if (lower.length >= 2) torsoPart(kit, lower, t.lowerColor ?? t.color, t.lowerSid ?? t.sid, bi('spine'), t.depth, seg);
  torsoPart(kit, upper, t.color, t.sid, bi('chest'), t.depth, seg);
  if (look.pelvis) torsoPart(kit, look.pelvis.prof, look.pelvis.color, look.pelvis.sid, bi('hips'), look.pelvis.depth ?? t.depth * 1.05, seg);

  // arms: tapered sleeve limbs, optional cuff, mitten + thumb (1.2×)
  const lean = look.lean ?? true;
  const a = look.arm, ls = look.limbSeg ?? (lean ? 6 : 8);
  for (const side of [1, -1] as const) {
    const L = side === 1 ? 'L' : 'R';
    const sx = side * s.shoulderX, sy = s.shoulderY;
    kit.add(P.limb(a.r[0], a.r[1], s.upperArm, ls), a.color, a.sid, bi(`arm${L}`), xf([sx, sy, 0]));
    kit.add(P.limb(a.r[2], a.r[3], s.foreArm * 0.92, ls), a.foreColor ?? a.color, a.foreSid ?? a.sid, bi(`fore${L}`), xf([sx, sy - s.upperArm, 0]));
    const wy = sy - s.upperArm - s.foreArm;
    if (a.cuff) kit.add(P.cyl(a.r[3] * 1.18, a.r[3] * 1.22, 0.045, 8), a.cuff.color, a.cuff.sid, bi(`fore${L}`), xf([sx, wy + 0.04, 0]));
    const hs = look.hand.scale, hc = look.hand.color ?? look.skin;
    if (hs <= 0) continue;
    const small = hs < 0.6;
    kit.add(P.sphere(0.046, small ? 5 : lean ? 7 : 8, small ? 4 : lean ? 5 : 6), hc, look.hand.sid, bi(`hand${L}`), xf([sx, wy - 0.045 * hs, 0.005], [0, 0, 0], [0.95 * hs, 1.25 * hs, 0.78 * hs]));
    kit.add(P.sphere(0.019 * hs, 4, 3).scale(1, 1.5, 1), hc, look.hand.sid, bi(`hand${L}`), xf([sx - side * 0.012 * hs, wy - 0.03 * hs, 0.034 * hs], [-35, 0, side * 20]));
  }

  // legs: thigh + shin, optional boot colour, rolled cuff, chunky shoe with sole stripe
  const l = look.leg;
  for (const side of l ? [1, -1] as const : []) {
    if (!l) break;
    const L = side === 1 ? 'L' : 'R';
    const lx = side * s.legX;
    kit.add(P.limb(l.r[0], l.r[1], s.thigh + 0.02, ls), l.color, l.sid, bi(`leg${L}`), xf([lx, s.hipY, 0]));
    kit.add(P.limb(l.r[2], l.r[3], s.shin * 0.9, ls), l.shinColor ?? l.color, l.shinSid ?? l.sid, bi(`shin${L}`), xf([lx, s.hipY - s.thigh, 0]));
    const ay = s.hipY - s.thigh - s.shin;
    if (l.cuff) kit.add(P.cyl(l.r[3] * 1.25, l.r[3] * 1.3, 0.06, 7, true), l.cuff.color, l.cuff.sid, bi(`shin${L}`), xf([lx, ay + 0.09, 0]));
    const sh = look.shoe;
    if (sh && lean) {
      kit.add(P.shoe(sh.w, sh.h, sh.d), sh.color, sh.sid, bi(`foot${L}`), xf([lx, sh.h / 2 + 0.01, sh.d * 0.2]));
      if (sh.sole) kit.add(P.cube(sh.w * 0.96, sh.h * 0.28, sh.d * 0.94), sh.sole.color, sh.sole.sid, bi(`foot${L}`), xf([lx, sh.h * 0.14, sh.d * 0.2]));
    } else if (sh) {
      kit.add(P.box(sh.w, sh.h, sh.d, Math.min(sh.h, sh.w) * 0.42, 1), sh.color, sh.sid, bi(`foot${L}`), xf([lx, sh.h / 2 + 0.004, sh.d * 0.22]));
      if (sh.sole) kit.add(P.box(sh.w * 1.04, sh.h * 0.3, sh.d * 1.02, 0.012, 1), sh.sole.color, sh.sole.sid, bi(`foot${L}`), xf([lx, sh.h * 0.15, sh.d * 0.22]));
    }
  }

  // head + neck
  let headCenter: readonly [number, number, number] = [0, s.headY, 0];
  const h = look.head;
  if (h) {
    const hy = s.headY + h.r * h.sy * 0.92;
    headCenter = [0, hy, 0];
    if (h.neck) kit.add(P.cyl(h.neck, h.neck * 1.1, s.headY - s.neckY + 0.06, 6, true), look.skin, look.hand.sid, bi('neck'), xf([0, (s.neckY + s.headY) / 2, 0]));
    const g = lean ? P.sphere(h.r, 10, 8) : P.sphere(h.r, 12, 9);
    g.scale(h.sx, h.sy, h.sz);
    kit.add(g, h.faceColor ?? look.skin, h.faceSid, bi('head'), xf([0, hy, 0]),
      { cell: h.face, halfW: h.r * h.sx * 1.05, halfH: h.r * h.sy * 1.05, center: [0, hy], minNz: 0.12 }, 'face');
  }
  return { kit, bones, bi, headCenter };
}

/** Standard adult proportions scaled to a total height (≈ top of head). */
export function adultSpec(height: number, o: Partial<BodySpec> = {}): BodySpec {
  const k = height / 1.7;
  return {
    hipY: 0.86 * k, legX: 0.095 * k, thigh: 0.4 * k, shin: 0.37 * k,
    chestY: 1.1 * k, shoulderY: 1.345 * k, shoulderX: 0.205 * k, upperArm: 0.27 * k, foreArm: 0.25 * k,
    neckY: 1.42 * k, headY: 1.47 * k, ...o,
  };
}

/** Torso profile helper: hem → waist → chest → shoulder → neck (absolute y), with widths scaled. */
export function torsoProfile(hem: number, top: number, w: { hem: number; waist: number; chest: number; shoulder: number; neck: number }): Prof {
  const h = top - hem;
  return [
    [0, hem - 0.01], [w.hem * 0.96, hem - 0.005], [w.hem, hem + 0.02], [w.waist, hem + h * 0.33], [w.chest, hem + h * 0.62],
    [w.shoulder, hem + h * 0.86], [w.shoulder * 0.82, hem + h * 0.96], [w.neck, top], [0, top + 0.005],
  ];
}
