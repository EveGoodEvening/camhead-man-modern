// src/chars/npcs/humans.ts — owner C. The four living townsfolk (GDD §6.1, ART §7.3): 小林, 王阿婆, 老陈, 小刘.
// Chunky kit bodies, one accent each, canvas face decals; props on their own bones so they can be shown/hidden.
import { SphereGeometry } from 'three';
import { PAL } from '../../art/palette';
import { CELLS, photoCell } from '../atlasLayout';
import { adultSpec, buildHuman, torsoProfile } from '../human';
import { P, xf, type Kit } from '../kit';
import type { PoseDef, Style } from '../anim';
import type { BoneDef } from '../rig';
import type { BufferGeometry } from 'three';
import type { CellRect } from '../atlasLayout';

export const S = { skin: 210, hair: 211, top: 212, bottom: 213, shoe: 214, acc: 215, acc2: 216, apron: 217, hat: 218, prop: 219, prop2: 220, face: 221, sole: 222, trim: 223 } as const;

export interface NpcModel {
  geo: BufferGeometry;
  bones: BoneDef[];
  style: Partial<Style>;
  poses?: Readonly<Record<string, PoseDef>>;
  height: number;
  /** Face-decal vertex ranges (uv blink = shift one cell right) and the open cell. */
  face?: { ranges: readonly { start: number; count: number }[]; cell: CellRect };
  /** Named prop bones that start hidden (scale 0). */
  hidden?: readonly string[];
}

/** Hair as a slightly larger sphere pushed up/back: the face shows through in front, clean hairline for ink. */
export function hairShell(kit: Kit, c: readonly [number, number, number], r: number, color: string, bone: number, o: { up?: number; back?: number; scale?: number; sy?: number } = {}): void {
  const g = new SphereGeometry(r * (o.scale ?? 1.08), 10, 7).scale(1, o.sy ?? 1, 1);
  kit.add(g, color, S.hair, bone, xf([c[0], c[1] + (o.up ?? r * 0.18), c[2] - (o.back ?? r * 0.2)]));
}

export function finish(kit: Kit, bones: BoneDef[], style: Partial<Style>, height: number, cell: CellRect | null, extra: Partial<NpcModel> = {}): NpcModel {
  const geo = kit.build();
  const ranges = kit.ranges.get('face');
  return { geo, bones, style, height, face: cell && ranges ? { ranges, cell } : undefined, ...extra };
}

// --------------------------------------------------------------------------------------------------- 小林
export function buildXiaolin(): NpcModel {
  const h = 1.68, k = h / 1.7;
  const spec = adultSpec(h, { shoulderX: 0.19 * k });
  const extra: BoneDef[] = [{ name: 'cup', parent: 'handR', at: [-spec.shoulderX, spec.shoulderY - spec.upperArm - spec.foreArm - 0.06, 0.03] }];
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: PAL.skin,
    torso: { prof: torsoProfile(0.84 * k, 1.42 * k, { hem: 0.17, waist: 0.16, chest: 0.18, shoulder: 0.185, neck: 0.06 }), color: PAL.clothWhite, sid: S.top, depth: 0.66, split: 1.02 * k },
    pelvis: { prof: [[0, 0.74 * k], [0.14, 0.75 * k], [0.16, 0.82 * k], [0.16, 0.9 * k], [0, 0.93 * k]], color: '#34495a', sid: S.bottom },
    arm: { color: PAL.clothWhite, sid: S.top, r: [0.06, 0.05, 0.045, 0.04], foreColor: PAL.skin, foreSid: S.skin },
    hand: { scale: 1.15, sid: S.skin },
    leg: { color: '#34495a', sid: S.bottom, r: [0.075, 0.065, 0.063, 0.056] },
    shoe: { color: PAL.clothWhite, sid: S.shoe, w: 0.12, h: 0.1, d: 0.26, sole: { color: PAL.steelGreen, sid: S.sole } },
    head: { r: 0.132, sx: 0.95, sy: 1.05, sz: 1, face: CELLS.xiaolin, faceSid: S.face, neck: 0.045 },
  }, extra);
  const chest = bi('chest'), hips = bi('hips'), head = bi('head');
  // short sleeves: cuff ring on the upper arm
  for (const sx of [1, -1]) kit.add(P.cyl(0.062, 0.066, 0.05, 7, true), PAL.clothWhite, S.acc2, bi(sx > 0 ? 'armL' : 'armR'), xf([sx * spec.shoulderX, spec.shoulderY - 0.13, 0]));
  // steel-green apron: bib + skirt, neck strap
  kit.add(P.cube(0.27, 0.34, 0.025), PAL.steelGreen, S.apron, chest, xf([0, 1.13 * k, 0.118]));
  kit.add(P.cube(0.33, 0.36, 0.025), PAL.steelGreen, S.apron, hips, xf([0, 0.78 * k, 0.13], [-4, 0, 0]));
  kit.add(P.cube(0.2, 0.06, 0.03), '#4f8f77', S.acc, hips, xf([0, 0.78 * k, 0.15]));   // pocket
  // big white headphones round the neck, orange ear cups (GDD §6.1)
  kit.add(P.lathe([[0.09, 1.38 * k], [0.1, 1.39 * k], [0.1, 1.41 * k], [0.09, 1.42 * k]], 10).scale(1, 1, 0.9), '#e8efdf', S.acc2, chest);
  for (const sx of [1, -1]) kit.add(P.cyl(0.042, 0.042, 0.035, 8).rotateZ(Math.PI / 2), PAL.orange, S.acc, chest, xf([sx * 0.085, 1.37 * k, 0.07], [0, sx * 30, 0]));
  // slate hair with a sky-blue streak over the forehead
  hairShell(kit, headCenter, 0.132, PAL.hair, head, { up: 0.027, back: 0.022 });
  for (const [x, rz] of [[-0.06, 20], [-0.018, 5], [0.03, -12]] as const) kit.add(P.cyl(0, 0.03, 0.09, 5), PAL.hair, S.hair, head, xf([x, headCenter[1] + 0.104, 0.085], [60, 0, rz]));
  kit.add(P.cyl(0, 0.024, 0.08, 5), PAL.skyBlue, S.acc2, head, xf([0.067, headCenter[1] + 0.086, 0.095], [70, 0, -25]));
  // night: a cup of 关东煮 (hidden by day)
  kit.add(P.cyl(0.038, 0.03, 0.09, 7), '#e8efdf', S.prop, bi('cup'), xf([extra[0].at[0], extra[0].at[1] + 0.02, extra[0].at[2]]));
  kit.add(P.cyl(0.004, 0.004, 0.16, 4), PAL.trunk, S.prop2, bi('cup'), xf([extra[0].at[0] + 0.015, extra[0].at[1] + 0.1, extra[0].at[2]], [0, 0, 12]));
  return finish(kit, bones, { armOut: 6 }, h, CELLS.xiaolin, { hidden: ['cup'] });
}

// --------------------------------------------------------------------------------------------------- 王阿婆
export function buildGranny(): NpcModel {
  const h = 1.52, k = h / 1.7;
  const spec = adultSpec(h, { shoulderX: 0.225 * k, legX: 0.1 * k });
  const hand = spec.shoulderY - spec.upperArm - spec.foreArm;
  const extra: BoneDef[] = [
    { name: 'cart', parent: 'root', at: [-0.42, 0, 0.12] },
    { name: 'frame', parent: 'chest', at: [0, 1.0 * k, 0.28] },
  ];
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: PAL.skin,
    torso: { prof: torsoProfile(0.7 * k, 1.42 * k, { hem: 0.235, waist: 0.235, chest: 0.24, shoulder: 0.22, neck: 0.07 }), color: PAL.sage, sid: S.top, depth: 0.78, split: 1.0 * k },
    pelvis: { prof: [[0, 0.62 * k], [0.16, 0.63 * k], [0.18, 0.72 * k], [0, 0.8 * k]], color: PAL.charcoal, sid: S.bottom, depth: 0.7 },
    arm: { color: PAL.sage, sid: S.top, r: [0.07, 0.062, 0.06, 0.052], cuff: { color: '#5c7569', sid: S.acc2 } },
    hand: { scale: 1.2, sid: S.skin },
    leg: { color: PAL.charcoal, sid: S.bottom, r: [0.085, 0.072, 0.07, 0.06] },
    shoe: { color: '#3a4448', sid: S.shoe, w: 0.12, h: 0.08, d: 0.24, sole: { color: '#c5c3a3', sid: S.sole } },
    head: { r: 0.125, sx: 1, sy: 1, sz: 1, face: CELLS.granny, faceSid: S.face, neck: 0.04 },
  }, extra);
  const chest = bi('chest'), head = bi('head');
  // tile-pink scarf with a hanging tail
  kit.add(P.lathe([[0.09, 1.33 * k], [0.12, 1.35 * k], [0.11, 1.42 * k], [0.075, 1.44 * k]], 9).scale(1, 1, 0.9), PAL.tilePink, S.acc, chest);
  kit.add(P.cube(0.05, 0.14, 0.025), PAL.tilePink, S.acc, chest, xf([0.06, 1.27 * k, 0.165], [12, 0, 12]));
  // jacket buttons
  for (const y of [0.95, 1.12]) kit.add(P.sphere(0.013, 4, 3), PAL.ochre, S.acc2, chest, xf([0, y * k, 0.19]));
  // grey hair with a bun
  hairShell(kit, headCenter, 0.125, PAL.char.hairGrey, head, { up: 0.031, back: 0.025 });
  kit.add(P.sphere(0.07, 7, 5), PAL.char.hairGrey, S.hair, head, xf([0, headCenter[1] + 0.1, -0.088]));
  // ochre shopping cart, merged (GDD §6.1): basket, frame, two wheels, handle
  const cart = bi('cart'), cx = extra[0].at[0], cz = extra[0].at[2];
  kit.add(P.box(0.3, 0.42, 0.24, 0.03, 1), PAL.ochre, S.prop, cart, xf([cx, 0.42, cz]));
  kit.add(P.cube(0.31, 0.04, 0.25), '#8c552b', S.prop2, cart, xf([cx, 0.62, cz]));
  for (const sx of [1, -1]) {
    kit.add(P.cyl(0.075, 0.075, 0.035, 8).rotateZ(Math.PI / 2), '#3a4448', S.trim, cart, xf([cx + sx * 0.16, 0.075, cz - 0.05]));
    kit.add(P.cyl(0.012, 0.012, 0.95, 4, true), PAL.metalRail, S.trim, cart, xf([cx + sx * 0.12, 0.6, cz - 0.14], [-12, 0, 0]));
  }
  kit.add(P.cyl(0.018, 0.018, 0.3, 5).rotateZ(Math.PI / 2), '#3a4448', S.acc2, cart, xf([cx, 1.06, cz - 0.24]));
  // framed family photo (the S_zhe window cut): wooden frame + the husband's portrait (follows faceState)
  const fr = bi('frame'), [fx, fy, fz] = extra[1].at;
  kit.add(P.cube(0.2, 0.25, 0.022), PAL.rust, S.prop, fr, xf([fx, fy, fz]));
  kit.add(P.cube(0.16, 0.21, 0.004), '#ffffff', S.prop2, fr, xf([fx, fy, fz + 0.012]),
    { cell: photoCell(39), halfW: 0.08, halfH: 0.105, center: [fx, fy], inner: [0.08, 0.02, 0.92, 0.98] });
  void hand;
  return finish(kit, bones, { hunch: 12, armOut: 10, stride: 1.2, legAmp: 18, armAmp: 12, size: k }, h, CELLS.granny, { hidden: ['frame'] });
}

// --------------------------------------------------------------------------------------------------- 老陈
export function buildChen(): NpcModel {
  const h = 1.72, k = h / 1.7;
  const spec = adultSpec(h, { shoulderX: 0.215 * k });
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: '#dcbba8',
    torso: { prof: torsoProfile(0.8 * k, 1.42 * k, { hem: 0.2, waist: 0.19, chest: 0.21, shoulder: 0.21, neck: 0.07 }), color: PAL.navy, sid: S.top, depth: 0.68, split: 1.02 * k },
    pelvis: { prof: [[0, 0.72 * k], [0.15, 0.73 * k], [0.18, 0.8 * k], [0.18, 0.9 * k], [0, 0.93 * k]], color: '#5d6461', sid: S.bottom },
    arm: { color: PAL.navy, sid: S.top, r: [0.07, 0.062, 0.06, 0.054], cuff: { color: '#1b3442', sid: S.acc2 } },
    hand: { scale: 1.25, sid: S.skin },
    leg: { color: '#5d6461', sid: S.bottom, r: [0.085, 0.074, 0.08, 0.074], shinColor: PAL.yellow, shinSid: S.acc },
    shoe: { color: PAL.yellow, sid: S.acc, w: 0.14, h: 0.1, d: 0.28, sole: { color: '#3a4448', sid: S.sole } },
    head: { r: 0.13, sx: 1, sy: 1.02, sz: 1, face: CELLS.chen, faceSid: S.face, neck: 0.05 },
  });
  const head = bi('head'), hips = bi('hips');
  // rain-boot tops
  for (const sx of [1, -1]) kit.add(P.cyl(0.092, 0.088, 0.05, 7, true), PAL.yellow, S.trim, bi(sx > 0 ? 'shinL' : 'shinR'), xf([sx * spec.legX, spec.hipY - spec.thigh - 0.06, 0]));
  // straw hat: wide brim + crown + dark band
  const hr = 0.13;
  hairShell(kit, headCenter, hr, '#8d8a86', head, { up: 0.0, back: 0.035, scale: 1.04 });
  kit.add(P.cyl(0.29, 0.29, 0.018, 16), PAL.sidewalkTan, S.hat, head, xf([0, headCenter[1] + hr * 0.62, 0], [-6, 0, 0]));
  kit.add(P.cyl(0.12, 0.145, 0.12, 12), PAL.sidewalkTan, S.hat, head, xf([0, headCenter[1] + hr * 1.08, -0.006], [-6, 0, 0]));
  kit.add(P.cyl(0.146, 0.146, 0.03, 12), PAL.rust, S.acc2, head, xf([0, headCenter[1] + hr * 0.8, -0.004], [-6, 0, 0]));
  // net shuttle (补网梭) hanging at the left hip
  kit.add(P.card([[0, 0.1], [0.025, 0.05], [0.025, -0.08], [-0.025, -0.08], [-0.025, 0.05]], 0.015), PAL.ochre, S.prop, hips, xf([0.2 * k, 0.8 * k, 0.05], [0, 60, 8]));
  kit.add(P.cyl(0.006, 0.006, 0.1, 3, true), PAL.sidewalkTan, S.prop2, hips, xf([0.19 * k, 0.9 * k, 0.05]));
  return finish(kit, bones, { armOut: 9 }, h, CELLS.chen);
}

// --------------------------------------------------------------------------------------------------- 小刘
export function buildLiu(): NpcModel {
  const h = 1.76, k = h / 1.7;
  const spec = adultSpec(h, { shoulderX: 0.2 * k });
  const hand = spec.shoulderY - spec.upperArm - spec.foreArm;
  const extra: BoneDef[] = [
    { name: 'board', parent: 'handL', at: [spec.shoulderX, hand - 0.05, 0.06] },
    { name: 'horn', parent: 'handR', at: [-spec.shoulderX, hand - 0.05, 0.04] },
  ];
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: PAL.skin,
    torso: { prof: torsoProfile(0.82 * k, 1.42 * k, { hem: 0.19, waist: 0.18, chest: 0.2, shoulder: 0.2, neck: 0.065 }), color: PAL.navy, sid: S.top, depth: 0.66, split: 1.02 * k },
    pelvis: { prof: [[0, 0.74 * k], [0.14, 0.75 * k], [0.17, 0.82 * k], [0.17, 0.9 * k], [0, 0.93 * k]], color: PAL.charcoal, sid: S.bottom },
    arm: { color: PAL.navy, sid: S.top, r: [0.066, 0.058, 0.056, 0.05] },
    hand: { scale: 1.2, sid: S.skin },
    leg: { color: PAL.charcoal, sid: S.bottom, r: [0.08, 0.07, 0.068, 0.06] },
    shoe: { color: '#4a4038', sid: S.shoe, w: 0.13, h: 0.09, d: 0.27, sole: { color: '#2b3436', sid: S.sole } },
    head: { r: 0.13, sx: 0.97, sy: 1.04, sz: 1, face: CELLS.liu, faceSid: S.face, neck: 0.047 },
  }, extra);
  const chest = bi('chest'), spine = bi('spine'), head = bi('head');
  // orange reflective vest with two white bands (over the navy jacket)
  const vest = torsoProfile(0.86 * k, 1.38 * k, { hem: 0.205, waist: 0.195, chest: 0.215, shoulder: 0.2, neck: 0.1 });
  kit.add(P.lathe(vest.filter(([, y]) => y <= 1.05 * k), 8).scale(1, 1, 0.7), PAL.orange, S.acc, spine);
  kit.add(P.lathe(vest.filter(([, y]) => y >= 0.98 * k), 8).scale(1, 1, 0.7), PAL.orange, S.acc, chest);
  for (const y of [0.98, 1.2]) kit.add(P.cyl(0.212, 0.212, 0.035, 8, true).scale(1, 1, 0.71), PAL.clothWhite, S.acc2, y < 1.05 ? spine : chest, xf([0, y * k, 0]));
  // white safety helmet with a brim
  hairShell(kit, headCenter, 0.13, PAL.hair, head, { up: 0.015, back: 0.03, scale: 1.03 });
  kit.add(new SphereGeometry(0.152, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), PAL.clothWhite, S.hat, head, xf([0, headCenter[1] + 0.042, -0.006], [-8, 0, 0]));
  kit.add(P.cyl(0.158, 0.158, 0.014, 10).scale(1, 1, 1.15), '#e8efdf', S.trim, head, xf([0, headCenter[1] + 0.042, 0.024], [-8, 0, 0]));
  // clipboard (left hand) and a yellow hand loudspeaker (right hand)
  const [bx, by, bz] = extra[0].at;
  kit.add(P.cube(0.21, 0.28, 0.014), PAL.ochre, S.prop, bi('board'), xf([bx - 0.05, by + 0.02, bz + 0.04], [0, 0, 0]));
  kit.add(P.cube(0.18, 0.23, 0.006), PAL.clothWhite, S.prop2, bi('board'), xf([bx - 0.05, by + 0.01, bz + 0.05], [0, 0, 0]));
  const [hx, hy, hz] = extra[1].at;
  kit.add(P.lathe([[0.03, 0], [0.035, 0.05], [0.085, 0.16], [0.08, 0.165]], 8).rotateX(Math.PI / 2), PAL.yellow, S.prop, bi('horn'), xf([hx, hy + 0.02, hz - 0.02]));
  kit.add(P.cyl(0.018, 0.018, 0.08, 5, true), '#3a4448', S.prop2, bi('horn'), xf([hx, hy - 0.02, hz]));
  return finish(kit, bones, { armOut: 8 }, h, CELLS.liu);
}
