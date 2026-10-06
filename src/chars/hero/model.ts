// src/chars/hero/model.ts — owner C. 周远's geometry (GDD §2.1, ART §7.2): a chunky work-jacket body with orange trim,
// sage crossbody bag and big white sneakers, plus the phone head (orange frame, camera-bump face, sticker, back screen).
// Pure geometry (node-safe). Surface ids 200–209.
import { PlaneGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { PAL } from '../../art/palette';
import { CELLS } from '../atlasLayout';
import { buildHuman, type Prof } from '../human';
import { Kit, P, xf } from '../kit';
import type { BodySpec, BoneDef } from '../rig';

export const SID = { jacket: 200, trousers: 201, skin: 202, shoe: 203, bag: 204, trim: 205, phone: 206, frame: 207, bump: 208, lens: 209 } as const;

export const HERO_SPEC: BodySpec = {
  hipY: 0.84, legX: 0.1, thigh: 0.39, shin: 0.35, chestY: 1.1, shoulderY: 1.315, shoulderX: 0.232,
  upperArm: 0.27, foreArm: 0.25, neckY: 1.37, headY: 1.46,
};
/** Phone slab (ART §7.2): 0.24 × 0.40 × 0.075, bottom at 1.46 m, tilted back 4°. */
export const PHONE = { w: 0.24, h: 0.4, d: 0.075, bottom: 1.46, tiltDeg: -4 } as const;
/** Camera-bump layout in head-local space (pivot = bottom centre of the phone, +Z = face). */
/** Back screen quad (1:2 like its 128×256 canvas) inside an 8 mm black glass border. I-look: the screen is a bit
 *  smaller than ART's 0.174 so a ≥ 30 mm orange rim reads around it from behind at gameplay distance (the rim is
 *  inked on its outer edge only: the bezel shares the frame's surface id, so no id line eats the rim). */
export const SCREEN = { w: 0.16, h: 0.32 } as const;
export const BUMP = { w: 0.17, h: 0.17, d: 0.018, cy: PHONE.h - 0.03 - 0.085 } as const;
export const EYE = { x: 0.0425, y: BUMP.cy + 0.022, ring: 0.031, glass: 0.025, pupil: 0.021 } as const;
export const MOUTH = { y: BUMP.cy - 0.048, ring: 0.02, glass: 0.015, pupil: 0.013 } as const;
export const LED = { x: 0.058, y: BUMP.cy - 0.055, r: 0.009 } as const;
const FRONT = PHONE.d / 2 + 0.002;             // face plate surface
const BZ = FRONT + BUMP.d;                     // bump front surface
/** Lens (eye) centre in head-local space — used by lensPos while the head is detached. */
export const LENS_LOCAL = [0, EYE.y, BZ + 0.006] as const;

const JACKET: Prof = [
  [0, 0.765], [0.19, 0.77], [0.197, 0.79], [0.185, 0.9], [0.182, 1.0], [0.198, 1.12], [0.21, 1.22], [0.207, 1.29],
  [0.175, 1.35], [0.1, 1.4], [0, 1.405],
];
function radiusAt(prof: Prof, y: number): number {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0;
}
const DEPTH = 0.64;
function surfZ(x: number, y: number, side: 1 | -1, lift = 0.008): number {
  const r = radiusAt(JACKET, y);
  return side * (DEPTH * Math.sqrt(Math.max(0, r * r - x * x)) + lift);
}

/** A strip of small boxes hugging the jacket surface from a to b (bag strap, zip). */
function strap(kit: Kit, a: readonly [number, number], b: readonly [number, number], side: 1 | -1, w: number, color: string, sid: number, bone: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = a[0] + (b[0] - a[0]) * t0, y0 = a[1] + (b[1] - a[1]) * t0;
    const x1 = a[0] + (b[0] - a[0]) * t1, y1 = a[1] + (b[1] - a[1]) * t1;
    const z0 = surfZ(x0, y0, side), z1 = surfZ(x1, y1, side);
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    const rz = (Math.atan2(-dx, dy) * 180) / Math.PI, rx = (Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI;
    kit.add(P.cube(w, len + 0.01, 0.012), color, sid, bone, xf([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [-rx * side, 0, rz]));
  }
}

export interface HeroBodyBuild { geo: BufferGeometry; bones: BoneDef[] }

export function buildHeroBody(): HeroBodyBuild {
  const s = HERO_SPEC;
  const { kit, bones, bi } = buildHuman({
    spec: s, skin: PAL.skin, seg: 10, lean: false,
    torso: { prof: JACKET, color: PAL.charcoal, sid: SID.jacket, depth: DEPTH, split: 1.0 },
    pelvis: { prof: [[0, 0.7], [0.15, 0.705], [0.182, 0.75], [0.19, 0.82], [0.17, 0.9], [0, 0.92]], color: PAL.navy, sid: SID.trousers, depth: 0.72 },
    arm: { color: PAL.charcoal, sid: SID.jacket, r: [0.064, 0.058, 0.057, 0.051], cuff: { color: PAL.orange, sid: SID.trim } },
    hand: { scale: 1.2, sid: SID.skin },
    leg: { color: PAL.navy, sid: SID.trousers, r: [0.09, 0.077, 0.076, 0.068], cuff: { color: '#2b4f63', sid: SID.bag } },
    shoe: { color: PAL.clothWhite, sid: SID.shoe, w: 0.15, h: 0.115, d: 0.3, sole: { color: PAL.orange, sid: SID.trim } },
    head: null,
  });
  const chest = bi('chest'), spine = bi('spine'), neck = bi('neck');
  // neck with the USB-C plug that normally hides inside the phone (GDD §2.1 摘头)
  kit.add(P.cyl(0.052, 0.056, 0.13, 10, true), PAL.skin, SID.skin, neck, xf([0, 1.405, 0]));
  kit.add(P.cyl(0.058, 0.058, 0.018, 10, true), PAL.metalRail, SID.lens, neck, xf([0, 1.462, 0]));
  kit.add(P.cube(0.03, 0.03, 0.011), PAL.metalRail, SID.phone, neck, xf([0, 1.485, 0]));
  // orange stand collar, zip stripe, pocket flaps
  kit.add(P.lathe([[0.085, 1.34], [0.112, 1.36], [0.108, 1.42], [0.084, 1.435], [0.08, 1.4]], 12).scale(1, 1, 0.86), PAL.orange, SID.trim, chest);
  strap(kit, [0, 0.8], [0, 1.0], 1, 0.022, PAL.orange, SID.trim, spine, 2);
  strap(kit, [0, 1.0], [0, 1.33], 1, 0.022, PAL.orange, SID.trim, chest, 3);
  for (const sx of [1, -1]) kit.add(P.cube(0.1, 0.018, 0.03), '#2b3436', SID.bag, spine, xf([sx * 0.1, 0.92, surfZ(sx * 0.1, 0.92, 1, 0.004)], [8, sx * 18, 0]));
  // shoulder epaulette seams (orange piping) make the jacket read from behind
  for (const sx of [1, -1]) kit.add(P.cube(0.09, 0.016, 0.1), PAL.orange, SID.trim, chest, xf([sx * 0.155, 1.335, 0], [0, 0, -sx * 26]));
  // sage crossbody strap: left shoulder → right hip (front and back), pouch on the right hip, ochre buckle
  strap(kit, [0.13, 1.33], [-0.16, 0.9], 1, 0.05, PAL.sage, SID.bag, chest, 5);
  strap(kit, [0.13, 1.33], [-0.16, 0.92], -1, 0.05, PAL.sage, SID.bag, chest, 5);
  kit.add(P.cube(0.08, 0.03, 0.2), PAL.sage, SID.bag, chest, xf([0.135, 1.36, 0], [0, 0, -30]));
  kit.add(P.cube(0.05, 0.05, 0.02), PAL.ochre, SID.trim, chest, xf([0.02, 1.15, surfZ(0.02, 1.15, 1, 0.016)], [0, 0, 44]));
  kit.add(P.box(0.17, 0.13, 0.075, 0.025, 1), PAL.sage, SID.bag, spine, xf([-0.215, 0.85, 0.05], [0, -25, 0]));
  kit.add(P.cube(0.172, 0.05, 0.08), '#5a7268', SID.lens, spine, xf([-0.215, 0.905, 0.052], [0, -25, 0]));
  return { geo: kit.build(), bones };
}

// ----------------------------------------------------------------------------------------------- phone head
export const HEAD_BONES: BoneDef[] = [
  { name: 'root', parent: null, at: [0, 0, 0] },
  { name: 'pupilL', parent: 'root', at: [EYE.x, EYE.y, BZ + 0.0035] },
  { name: 'pupilR', parent: 'root', at: [-EYE.x, EYE.y, BZ + 0.0035] },
  { name: 'lidL', parent: 'root', at: [EYE.x, EYE.y + EYE.glass + 0.001, BZ + 0.0058] },
  { name: 'lidR', parent: 'root', at: [-EYE.x, EYE.y + EYE.glass + 0.001, BZ + 0.0058] },
  { name: 'mouth', parent: 'root', at: [0, MOUTH.y, BZ + 0.0035] },
  { name: 'lowL', parent: 'root', at: [EYE.x, EYE.y - EYE.glass - 0.001, BZ + 0.0056] },
  { name: 'lowR', parent: 'root', at: [-EYE.x, EYE.y - EYE.glass - 0.001, BZ + 0.0056] },
];

function lensRing(r0: number, r1: number, h: number): BufferGeometry {
  return P.lathe([[r0, -0.001], [r1, -0.001], [r1, h], [r0, h]], 12).rotateX(Math.PI / 2);
}
/** Rounded-rectangle plate (x/y), `d` thick along z, centred. */
function plate(w: number, h: number, d: number, r: number): BufferGeometry {
  const pts: [number, number][] = [];
  const c = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]] as const;
  for (const [cx, cy, q] of c) for (let i = 0; i <= 3; i++) { const a = (q + i / 3) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return P.card(pts, d);
}

export function buildHeroHead(): BufferGeometry {
  const kit = new Kit();
  const cy = PHONE.h / 2;
  // slab: orange frame body, white face plate (phone back) and dark bezel on the screen side
  kit.add(P.box(PHONE.w, PHONE.h, PHONE.d, 0.03, 2), PAL.char.phoneFrame, SID.frame, 0, xf([0, cy, 0]));
  kit.add(plate(PHONE.w - 0.024, PHONE.h - 0.024, 0.012, 0.022), PAL.char.phoneBody, SID.phone, 0, xf([0, cy, FRONT - 0.006]));
  // back bezel leaves a ≈ 32 mm orange rim so the frame reads as an orange outline from behind (GDD §2.1)
  kit.add(plate(SCREEN.w + 0.016, SCREEN.h + 0.016, 0.012, 0.014), PAL.char.screenBezel, SID.frame, 0, xf([0, cy, -FRONT + 0.006]));
  // side buttons ("ears"): volume rocker on the left, power on the right
  kit.add(P.cube(0.008, 0.06, 0.022), PAL.metalRail, SID.lens, 0, xf([PHONE.w / 2 + 0.002, 0.29, 0]));
  kit.add(P.cube(0.008, 0.035, 0.022), PAL.metalRail, SID.lens, 0, xf([-PHONE.w / 2 - 0.002, 0.3, 0]));
  // camera bump = the face
  kit.add(plate(BUMP.w, BUMP.h, BUMP.d + 0.004, 0.026), PAL.char.bump, SID.bump, 0, xf([0, BUMP.cy, FRONT + BUMP.d / 2 - 0.002]));
  for (const sx of [1, -1]) {
    const L = sx === 1 ? 'L' : 'R';
    const ex = sx * EYE.x;
    kit.add(lensRing(EYE.glass, EYE.ring, 0.008), PAL.char.lensRing, SID.lens, 0, xf([ex, EYE.y, BZ - 0.001]));
    kit.add(P.disc(EYE.glass + 0.001, 14), '#26434e', SID.phone, 0, xf([ex, EYE.y, BZ + 0.003]));
    // aperture blades: a hexagon pupil (bone scale = expression)
    kit.add(P.disc(EYE.pupil, 6).rotateZ(Math.PI / 6), PAL.inkDeep, SID.frame, HEAD_BONES.findIndex((b) => b.name === `pupil${L}`), xf([ex, EYE.y, BZ + 0.0035]));
    kit.add(P.disc(0.0052, 6), PAL.char.lensGlint, SID.trim, 0, xf([ex - 0.011, EYE.y + 0.011, BZ + 0.0046]));
    // eyelid: a bump-coloured disc hinged at the lens top (scale.y 0 = open, 1 = shut)
    kit.add(P.disc(EYE.glass + 0.002, 14), PAL.char.bump, SID.skin, HEAD_BONES.findIndex((b) => b.name === `lid${L}`), xf([ex, EYE.y, BZ + 0.0058]));
    // lower lid (smiling eyes ^ ^): hinged at the lens bottom
    kit.add(P.disc(EYE.glass + 0.002, 14), PAL.char.bump, SID.skin, HEAD_BONES.findIndex((b) => b.name === `low${L}`), xf([ex, EYE.y, BZ + 0.0056]));
  }
  kit.add(lensRing(MOUTH.glass, MOUTH.ring, 0.007), PAL.char.lensRing, SID.lens, 0, xf([0, MOUTH.y, BZ - 0.001]));
  kit.add(P.disc(MOUTH.glass + 0.001, 12), '#26434e', SID.phone, 0, xf([0, MOUTH.y, BZ + 0.003]));
  kit.add(P.disc(MOUTH.pupil, 6).rotateZ(Math.PI / 6), PAL.inkDeep, SID.frame, 5, xf([0, MOUTH.y, BZ + 0.0035]));
  // flash LED (lower right as you look at him) + mic pinhole
  kit.add(P.cyl(LED.r, LED.r, 0.004, 10).rotateX(Math.PI / 2), PAL.char.flash, SID.trim, 0, xf([LED.x, LED.y, BZ + 0.001]));
  kit.add(P.disc(0.0045, 6), PAL.inkDeep, SID.frame, 0, xf([-LED.x, LED.y, BZ + 0.0005]));
  // 「周记照相馆」 sticker under the module (GDD §2.1): canvas cell in the atlas
  const st = P.disc(0.025, 14);
  kit.add(st, '#ffffff', SID.lens, 0, xf([0, BUMP.cy - BUMP.h / 2 - 0.036, FRONT + 0.0008]), { cell: CELLS.sticker, halfW: 0.025, halfH: 0.025, center: [0, BUMP.cy - BUMP.h / 2 - 0.036] });
  return kit.build();
}

/** Back screen quad (unlit, 128×256 canvas), facing −Z (toward the over-the-shoulder camera). */
export function buildHeroScreen(): BufferGeometry {
  const kit = new Kit();
  const g = new PlaneGeometry(SCREEN.w, SCREEN.h).rotateY(Math.PI);
  kit.add(g, '#ffffff', SID.lens, 0, xf([0, PHONE.h / 2, -FRONT - 0.0012]), { cell: { u0: 0, v0: 0, u1: 1, v1: 1, x: 0, y: 0, w: 1, h: 1 }, halfW: 1, halfH: 1, own: true });
  return kit.build();
}

/** Emissive LED + torch glow (unlit; visible only while lit). */
export function buildHeroGlow(): BufferGeometry {
  const kit = new Kit();
  kit.add(P.cyl(LED.r * 1.05, LED.r * 1.05, 0.004, 10).rotateX(Math.PI / 2), '#fff3b8', SID.trim, 0, xf([LED.x, LED.y, BZ + 0.0016]));
  return kit.build();
}

/** PHOTO_ONLY human head (GDD §2.1: brows like 老周, short hair #3c4e54), in neck-bone local space. */
export function buildPhotoHead(): BufferGeometry {
  const kit = new Kit();
  const y = PHONE.bottom - HERO_SPEC.neckY + 0.1;
  const face = P.sphere(0.105, 12, 9).scale(0.95, 1.1, 1);
  kit.add(face, PAL.skin, SID.skin, 0, xf([0, y, 0.005]), { cell: CELLS.heroFace, halfW: 0.105, halfH: 0.116, center: [0, y], minNz: 0.12 });
  const hair = new SphereGeometry(0.114, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(1, 0.95, 1.05);
  kit.add(hair, PAL.hair, SID.bag, 0, xf([0, y + 0.012, -0.01], [-16, 0, 0]));
  for (const sx of [1, -1]) kit.add(P.sphere(0.024, 6, 5).scale(0.6, 1, 1), PAL.skin, SID.skin, 0, xf([sx * 0.1, y - 0.005, 0]));
  return kit.build();
}
