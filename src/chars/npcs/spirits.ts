// src/chars/npcs/spirits.ts — owner C. The 怪 and 灵 of GDD §6.1 (ART §7.4: unlit, cinnabar ink ids 245–254, no shadow):
// 土地 (0.45 m, pipe + ash smoke), 纸妹 (extruded paper card, 6 fps), 站务员 (empty floating uniform), and the
// PHOTO_ONLY 老周 ghost for the finale photo.
import { Color } from 'three';
import { PAL } from '../../art/palette';
import { CELLS } from '../atlasLayout';
import { buildHuman, torsoProfile } from '../human';
import { Kit, P, xf } from '../kit';
import { boneIndex, type BodySpec, type BoneDef } from '../rig';
import { S, finish, hairShell, type NpcModel } from './humans';

export const SPIRIT = { tudiSkin: 245, tudiRobe: 246, tudiTrim: 247, paper: 248, paperRed: 249, paperHair: 250, attJacket: 251, attDark: 252, attWhite: 253, attCap: 254 } as const;

// --------------------------------------------------------------------------------------------------- 土地
export function buildTudi(): NpcModel {
  const spec: BodySpec = {
    hipY: 0.15, legX: 0.035, thigh: 0.075, shin: 0.065, chestY: 0.21, shoulderY: 0.29, shoulderX: 0.065,
    upperArm: 0.07, foreArm: 0.065, neckY: 0.3, headY: 0.31,
  };
  const hand = spec.shoulderY - spec.upperArm - spec.foreArm;
  const extra: BoneDef[] = [
    { name: 'pipe', parent: 'handR', at: [-spec.shoulderX, hand - 0.01, 0.02] },
    { name: 'puff1', parent: 'root', at: [-0.08, 0.3, 0.12] },
    { name: 'puff2', parent: 'root', at: [-0.08, 0.36, 0.12] },
    { name: 'puff3', parent: 'root', at: [-0.08, 0.42, 0.12] },
  ];
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: PAL.skin, seg: 8, limbSeg: 5,
    torso: { prof: [[0, 0.01], [0.11, 0.012], [0.1, 0.08], [0.085, 0.24], [0.06, 0.29], [0, 0.31]], color: PAL.roofMauve, sid: SPIRIT.tudiRobe, depth: 0.85, split: 0.0 },
    arm: { color: PAL.roofMauve, sid: SPIRIT.tudiRobe, r: [0.026, 0.028, 0.03, 0.036], cuff: { color: PAL.ochre, sid: SPIRIT.tudiTrim } },
    hand: { scale: 0.42, sid: SPIRIT.tudiSkin },
    leg: null,
    shoe: null,
    head: { r: 0.07, sx: 1, sy: 1, sz: 1, face: CELLS.tudi, faceSid: SPIRIT.tudiSkin, neck: 0.02 },
  }, extra);
  const head = bi('head'), chest = bi('chest');
  // long paper-white beard, white hair tufts, a little official's cap with side wings
  kit.add(P.lathe([[0, -0.15], [0.042, -0.05], [0.048, -0.01], [0.03, 0.0]], 7).scale(1, 1, 0.6), PAL.spiritPaper, SPIRIT.tudiTrim, head, xf([0, headCenter[1] - 0.035, 0.045], [8, 0, 0]));
  for (const sx of [1, -1]) kit.add(P.sphere(0.022, 4, 3), PAL.spiritPaper, SPIRIT.tudiTrim, head, xf([sx * 0.062, headCenter[1] + 0.005, -0.01]));
  kit.add(P.cyl(0.052, 0.058, 0.04, 8), '#4a4038', SPIRIT.tudiTrim, head, xf([0, headCenter[1] + 0.062, -0.01], [-8, 0, 0]));
  for (const sx of [1, -1]) kit.add(P.cube(0.05, 0.014, 0.008), '#4a4038', SPIRIT.tudiTrim, head, xf([sx * 0.075, headCenter[1] + 0.06, -0.03], [0, 0, sx * 12]));
  kit.add(P.cube(0.03, 0.03, 0.01), PAL.ochre, SPIRIT.tudiSkin, head, xf([0, headCenter[1] + 0.062, 0.05]));
  // belt
  kit.add(P.cyl(0.092, 0.092, 0.02, 8, true).scale(1, 1, 0.85), PAL.ochre, SPIRIT.tudiTrim, chest, xf([0, 0.2, 0]));
  // pipe (烟斗) + three ash puffs
  const [px, py, pz] = extra[0].at;
  kit.add(P.cyl(0.004, 0.004, 0.11, 3, true), PAL.trunk, SPIRIT.tudiTrim, bi('pipe'), xf([px, py + 0.04, pz + 0.03], [40, 0, 0]));
  kit.add(P.cyl(0.013, 0.01, 0.022, 5), '#4a4038', SPIRIT.tudiSkin, bi('pipe'), xf([px, py + 0.085, pz + 0.075]));
  for (const n of ['puff1', 'puff2', 'puff3'] as const) {
    const at = extra.find((e) => e.name === n)?.at ?? [0, 0, 0];
    kit.add(P.sphere(0.024, 5, 3), PAL.ash, SPIRIT.tudiTrim, bi(n), xf([at[0], at[1], at[2]]));
  }
  return finish(kit, bones, { size: 0.45 / 1.7, stride: 0.5, armOut: 18, breathe: 0.03, bob: 0.02 }, 0.46, CELLS.tudi);
}

// --------------------------------------------------------------------------------------------------- 纸妹
const ZHIMEI_BONES: BoneDef[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.05, 0] },
  { name: 'head', parent: 'body', at: [0, 1.0, 0] },
  { name: 'armL', parent: 'body', at: [0.13, 0.93, 0] },
  { name: 'armR', parent: 'body', at: [-0.13, 0.93, 0] },
];
export function buildZhimei(): NpcModel {
  const kit = new Kit();
  const bi = boneIndex(ZHIMEI_BONES);
  const body = bi('body'), head = bi('head'), D = 0.012;
  // robe (trapezoid with a collar), red hem band, pink sash, red collar V, split-pin dots
  kit.add(P.card([[-0.23, 0.02], [0.23, 0.02], [0.17, 0.5], [0.14, 0.92], [0.06, 1.0], [-0.06, 1.0], [-0.14, 0.92], [-0.17, 0.5]], D), PAL.spiritPaper, SPIRIT.paper, body);
  kit.add(P.card([[-0.225, 0.1], [0.225, 0.1], [0.215, 0.16], [-0.215, 0.16]], 0.004), PAL.bannerRed, SPIRIT.paperRed, body, xf([0, 0, D / 2 + 0.002]));
  kit.add(P.card([[-0.165, 0.56], [0.165, 0.56], [0.16, 0.62], [-0.16, 0.62]], 0.004), PAL.tilePink, SPIRIT.paperRed, body, xf([0, 0, D / 2 + 0.002]));
  kit.add(P.card([[-0.07, 0.99], [0, 0.86], [0.07, 0.99], [0.045, 0.99], [0, 0.9], [-0.045, 0.99]], 0.004), PAL.bannerRed, SPIRIT.paperRed, body, xf([0, 0, D / 2 + 0.002]));
  for (const sx of [1, -1]) kit.add(P.disc(0.012, 6), PAL.inkDeep, SPIRIT.paperHair, bi(sx > 0 ? 'armL' : 'armR'), xf([sx * 0.13, 0.93, D / 2 + 0.003]));
  // sleeves (arms) with red cuffs, paper hands
  for (const sx of [1, -1]) {
    const b = bi(sx > 0 ? 'armL' : 'armR');
    kit.add(P.card([[0, 0.02], [sx * 0.07, 0.0], [sx * 0.11, -0.38], [sx * 0.02, -0.4]].map(([x, y]) => [x + sx * 0.12, y + 0.93] as const), D), PAL.spiritPaper, SPIRIT.paper, b, xf([0, 0, 0.002]));
    kit.add(P.card([[sx * 0.215, 0.555], [sx * 0.235, 0.515], [sx * 0.135, 0.505], [sx * 0.14, 0.55]], 0.004), PAL.bannerRed, SPIRIT.paperRed, b, xf([0, 0, D / 2 + 0.004]));
    kit.add(P.disc(0.035, 8), PAL.spiritPaper, SPIRIT.paperRed, b, xf([sx * 0.19, 0.47, 0.004]));
  }
  // hair (buns) behind the head, round head card with the face decal, bangs, paper flower
  const hy = 1.16;
  const circle = (cx: number, cy: number, r: number, n = 12) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as const);
  kit.add(P.card(circle(0, hy + 0.01, 0.145, 14), D), PAL.inkDeep, SPIRIT.paperHair, head, xf([0, 0, -0.006]));
  for (const sx of [1, -1]) kit.add(P.card(circle(sx * 0.1, hy + 0.14, 0.062, 10), D), PAL.inkDeep, SPIRIT.paperHair, head, xf([0, 0, -0.004]));
  kit.add(P.card(circle(0, hy, 0.125, 14), D), '#ffffff', SPIRIT.paper, head, undefined,
    { cell: CELLS.zhimei1, halfW: 0.125, halfH: 0.125, center: [0, hy], minNz: 0.5 }, 'face');
  kit.add(P.card([[-0.125, hy + 0.02], [-0.09, hy + 0.1], [0, hy + 0.13], [0.09, hy + 0.1], [0.125, hy + 0.02], [0.06, hy + 0.06], [0, hy + 0.045], [-0.06, hy + 0.06]], 0.004), PAL.inkDeep, SPIRIT.paperHair, head, xf([0, 0, D / 2 + 0.003]));
  const petals = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.02 : 0.045; return [0.14 + r * Math.cos(a), hy + 0.19 + r * Math.sin(a)] as const; });
  kit.add(P.card(petals, 0.006), PAL.tilePink, SPIRIT.paperRed, head, xf([0, 0, 0.01]));
  kit.add(P.disc(0.014, 6), PAL.bannerRed, SPIRIT.paper, head, xf([0.14, hy + 0.19, 0.015]));
  // paper base the effigy stands on
  kit.add(P.box(0.4, 0.02, 0.16, 0.005, 1), '#d8cfb8', SPIRIT.paperRed, 0, xf([0, 0.01, 0]));
  return finish(kit, ZHIMEI_BONES, {}, 1.3, CELLS.zhimei1);
}

// --------------------------------------------------------------------------------------------------- 站务员
export function buildAttendant(): NpcModel {
  const h = 1.75, k = h / 1.7;
  const spec: BodySpec = {
    hipY: 0.9 * k, legX: 0.095 * k, thigh: 0.4 * k, shin: 0.34 * k, chestY: 1.12 * k, shoulderY: 1.37 * k, shoulderX: 0.215 * k,
    upperArm: 0.28 * k, foreArm: 0.25 * k, neckY: 1.44 * k, headY: 1.5 * k,
  };
  const wy = spec.shoulderY - spec.upperArm - spec.foreArm;
  const extra: BoneDef[] = [
    { name: 'gloveL', parent: 'foreL', at: [spec.shoulderX, wy - 0.07, 0] },
    { name: 'gloveR', parent: 'foreR', at: [-spec.shoulderX, wy - 0.07, 0] },
  ];
  const { kit, bones, bi } = buildHuman({
    spec, skin: PAL.navy, limbSeg: 6,
    torso: { prof: torsoProfile(0.82 * k, 1.45 * k, { hem: 0.2, waist: 0.19, chest: 0.215, shoulder: 0.22, neck: 0.09 }), color: PAL.navy, sid: SPIRIT.attJacket, depth: 0.66, split: 1.04 * k },
    pelvis: { prof: [[0, 0.74 * k], [0.15, 0.75 * k], [0.18, 0.84 * k], [0, 0.92 * k]], color: '#1b3442', sid: SPIRIT.attDark },
    arm: { color: PAL.navy, sid: SPIRIT.attJacket, r: [0.068, 0.06, 0.06, 0.056], cuff: { color: '#c9a45a', sid: SPIRIT.attCap } },
    hand: { scale: 0, sid: SPIRIT.attWhite },
    leg: { color: '#1b3442', sid: SPIRIT.attDark, r: [0.085, 0.075, 0.074, 0.07] },
    shoe: null, head: null,
  }, extra);
  const chest = bi('chest'), head = bi('head');
  // empty collar: white shirt V, the dark hollow where a neck should be
  kit.add(P.lathe([[0.09, 1.4 * k], [0.11, 1.42 * k], [0.105, 1.47 * k], [0.09, 1.475 * k]], 9).scale(1, 1, 0.85), PAL.clothWhite, SPIRIT.attWhite, chest);
  kit.add(P.disc(0.088, 9).rotateX(-Math.PI / 2).scale(1, 1, 0.85), PAL.inkDeep, SPIRIT.attDark, chest, xf([0, 1.465 * k, 0]));
  kit.add(P.card([[-0.03, 0], [0.03, 0], [0.015, -0.2], [0, -0.23], [-0.015, -0.2]], 0.01), '#1b3442', SPIRIT.attDark, chest, xf([0, 1.4 * k, 0.15]));
  // hollow trouser ends, floating white gloves
  for (const sx of [1, -1]) {
    kit.add(P.disc(0.066, 6).rotateX(Math.PI / 2), PAL.inkDeep, SPIRIT.attJacket, bi(sx > 0 ? 'shinL' : 'shinR'), xf([sx * spec.legX, spec.hipY - spec.thigh - spec.shin * 0.9 - 0.03, 0]));
    const g = bi(sx > 0 ? 'gloveL' : 'gloveR');
    kit.add(P.sphere(0.05, 6, 5), PAL.clothWhite, SPIRIT.attWhite, g, xf([sx * spec.shoulderX, wy - 0.1, 0.005], [0, 0, 0], [0.95, 1.3, 0.8]));
    kit.add(P.sphere(0.022, 4, 3).scale(1, 1.6, 1), PAL.clothWhite, SPIRIT.attWhite, g, xf([sx * (spec.shoulderX - 0.012), wy - 0.085, 0.045], [-35, 0, sx * 20]));
    kit.add(P.cyl(0.05, 0.055, 0.035, 6, true), PAL.clothWhite, SPIRIT.attWhite, g, xf([sx * spec.shoulderX, wy - 0.05, 0]));
  }
  // peaked cap hovering above the collar, gold badge; 零号线 name plate on the chest
  const cy = 1.66 * k;
  kit.add(P.cyl(0.125, 0.105, 0.085, 10), PAL.navy, SPIRIT.attCap, head, xf([0, cy, -0.01], [-6, 0, 0]));
  kit.add(P.cyl(0.126, 0.126, 0.025, 10, true), '#1b2327', SPIRIT.attDark, head, xf([0, cy - 0.035, -0.008], [-6, 0, 0]));
  kit.add(P.cyl(0.1, 0.1, 0.01, 8).scale(1, 1, 0.6), '#1b2327', SPIRIT.attDark, head, xf([0, cy - 0.052, 0.09], [-14, 0, 0]));
  kit.add(P.sphere(0.02, 5, 3).scale(1, 1, 0.4), PAL.yellow, SPIRIT.attWhite, head, xf([0, cy + 0.005, 0.118]));
  kit.add(P.cube(0.1, 0.045, 0.006), '#ffffff', SPIRIT.attCap, chest, xf([0.1, 1.28 * k, 0.15], [0, 14, 0]),
    { cell: CELLS.badge, halfW: 0.05, halfH: 0.0225, center: [0.1, 1.28 * k], inner: [0.06, 0.3, 0.94, 0.7] });
  for (const y of [1.0, 1.14, 1.28]) kit.add(P.cube(0.022, 0.022, 0.012), '#c9a45a', SPIRIT.attCap, chest, xf([-0.02, y * k, 0.15]));
  return finish(kit, bones, { armOut: 6, legAmp: 6, armAmp: 6, bob: 0 }, h, null);
}

// --------------------------------------------------------------------------------------------------- 老周 (PHOTO_ONLY)
export function buildLaoZhou(): NpcModel {
  const h = 1.68, k = h / 1.7;
  const spec: BodySpec = {
    hipY: 0.85 * k, legX: 0.095 * k, thigh: 0.4 * k, shin: 0.36 * k, chestY: 1.1 * k, shoulderY: 1.34 * k, shoulderX: 0.2 * k,
    upperArm: 0.28 * k, foreArm: 0.26 * k, neckY: 1.41 * k, headY: 1.46 * k,
  };
  const pale = (hex: string) => `#${new Color(hex).lerp(new Color('#e6f2ee'), 0.35).getHexString()}`;
  const { kit, bones, bi, headCenter } = buildHuman({
    spec, skin: pale(PAL.skin),
    torso: { prof: torsoProfile(0.8 * k, 1.41 * k, { hem: 0.2, waist: 0.2, chest: 0.21, shoulder: 0.2, neck: 0.07 }), color: pale('#b9a07a'), sid: S.top, depth: 0.68, split: 1.02 * k },
    pelvis: { prof: [[0, 0.73 * k], [0.15, 0.74 * k], [0.17, 0.84 * k], [0, 0.92 * k]], color: pale('#6d7478'), sid: S.bottom },
    arm: { color: pale('#b9a07a'), sid: S.top, r: [0.066, 0.058, 0.056, 0.05] },
    hand: { scale: 1.15, sid: S.skin },
    leg: { color: pale('#6d7478'), sid: S.bottom, r: [0.078, 0.068, 0.066, 0.058] },
    shoe: { color: pale('#4a4038'), sid: S.shoe, w: 0.12, h: 0.08, d: 0.25 },
    head: { r: 0.102, sx: 1, sy: 1.03, sz: 1, face: CELLS.laoZhou, faceSid: S.face, neck: 0.045 },
  });
  const chest = bi('chest'), head = bi('head');
  hairShell(kit, headCenter, 0.102, pale(PAL.char.hairGrey), head, { up: 0.03, back: 0.028 });
  // shirt V and a twin-lens reflex on a strap at the chest
  kit.add(P.card([[-0.06, 0], [0.06, 0], [0, -0.12]], 0.01), pale(PAL.clothWhite), S.acc2, chest, xf([0, 1.4 * k, 0.13]));
  kit.add(P.cube(0.09, 0.13, 0.09), pale('#2b3436'), S.prop, chest, xf([0, 1.1 * k, 0.2]));
  for (const y of [0.03, -0.03]) kit.add(P.cyl(0.022, 0.022, 0.02, 10).rotateX(Math.PI / 2), pale(PAL.metalRail), S.prop2, chest, xf([0, 1.1 * k + y, 0.25]));
  kit.add(P.cube(0.02, 0.36, 0.01), pale('#4a4038'), S.acc, chest, xf([0.07, 1.27 * k, 0.15], [0, 0, 22]));
  return finish(kit, bones, { armOut: 7 }, h, CELLS.laoZhou, {
    poses: { tlr: { rot: { armL: [-40, 0, 14], armR: [-40, 0, -14], foreL: [-70, -20, 0], foreR: [-70, 20, 0] } } },
  });
}

// --------------------------------------------------------------------------------------------------- 煤球
const CAT_BONES: BoneDef[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.05, 0] },
  { name: 'head', parent: 'body', at: [0, 0.2, 0.05] },
  { name: 'earL', parent: 'head', at: [0.045, 0.3, 0.05] },
  { name: 'tail1', parent: 'body', at: [0, 0.03, -0.1] },
  { name: 'tail2', parent: 'tail1', at: [0.07, 0.02, -0.14] },
  { name: 'tail3', parent: 'tail2', at: [0.15, 0.02, -0.12] },
];
export function buildMeiqiu(): NpcModel {
  const kit = new Kit();
  const bi = boneIndex(CAT_BONES);
  const fur = PAL.inkDeep, body = bi('body'), head = bi('head');
  const C = { fur: 224, face: 225, collar: 226, bell: 227, ear: 228 };
  // sitting loaf: pear-shaped lathe, front paws
  kit.add(P.lathe([[0, 0.0], [0.075, 0.006], [0.085, 0.05], [0.07, 0.13], [0.042, 0.2], [0, 0.21]], 8).scale(1, 1, 1.25), fur, C.fur, body, xf([0, 0, -0.02]));
  for (const sx of [1, -1]) kit.add(P.capsule(0.018, 0.08, 1, 4), fur, C.ear, body, xf([sx * 0.035, 0.05, 0.075], [8, 0, 0]));
  // head with the cat face decal (vertex white: the cell carries the fur colour)
  const hy = 0.255;
  kit.add(P.sphere(0.058, 9, 7).scale(1.08, 0.95, 1), '#ffffff', C.face, head, xf([0, hy, 0.06]),
    { cell: CELLS.meiqiu, halfW: 0.062, halfH: 0.055, center: [0, hy], minNz: 0.1 }, 'face');
  // ears: right ear whole, left ear with its notch (GDD §6.1 左耳缺一角)
  kit.add(P.cyl(0.0, 0.026, 0.05, 6), fur, C.ear, head, xf([-0.035, hy + 0.058, 0.055], [0, 0, 12]));
  kit.add(P.cyl(0.009, 0.026, 0.032, 6), fur, C.ear, bi('earL'), xf([0.035, hy + 0.052, 0.055], [0, 0, -18]));
  // red collar and bell
  kit.add(P.lathe([[0.045, 0.185], [0.05, 0.19], [0.05, 0.205], [0.043, 0.21]], 8).scale(1, 1, 1.1), PAL.bannerRed, C.collar, body, xf([0, 0, 0.03]));
  kit.add(P.sphere(0.013, 4, 3), PAL.yellow, C.bell, body, xf([0, 0.182, 0.087]));
  // tail in three segments (swish)
  kit.add(P.capsule(0.017, 0.12, 1, 5), fur, C.fur, bi('tail1'), xf([0.035, 0.025, -0.12], [90, 0, -30]));
  kit.add(P.capsule(0.016, 0.12, 1, 5), fur, C.fur, bi('tail2'), xf([0.11, 0.025, -0.13], [90, 0, 70]));
  kit.add(P.capsule(0.015, 0.08, 1, 5), fur, C.ear, bi('tail3'), xf([0.18, 0.025, -0.08], [90, 0, 140]));
  return finish(kit, CAT_BONES, {}, 0.3, CELLS.meiqiu);
}
