// src/world/interiors/build.ts — owner B. The two pocket interiors (GDD §5.3 #5 / #9; ≤ 5k tris, ≤ 10 calls each):
// 周记照相馆 (front room: portrait wall, height marks, pickup cabinet, jingle poster, blue backdrop + empty tripod,
// counter; darkroom: red safelight, three trays, enlarger, drying line, old phone) and 零号线 (hall + platform in one
// room: stairs, gantry, platform screen doors with the glowing gap, track pit, display, fluorescent tubes).
import { Matrix4, type BufferGeometry } from 'three';
import { PAL } from '../../art/palette';
import type { Core } from '../../contracts';
import { FONT } from '../../core/fonts';
import { posToWorld } from '../../core/planet';
import { t } from '../../data/zh';
import { Batch, type LayerKind } from '../kit/batch';
import { winTag } from '../kit/building';
import { bar, box, boxRot, cyl, quad, v3 } from '../kit/prims';
import type { Tex } from '../kit/tex';
import type { UvRect } from '../atlas';
import type { LabelId } from '../../types';
import { STUDIO, STUDIO_PROPS, SUBWAY_INT } from './plans';

type Add = (layer: LayerKind, g: BufferGeometry, hex: string, sid: number, uv?: UvRect | null, label?: LabelId, tag?: string) => void;

function adder(B: Batch, scene: 'studio_int' | 'subway_int'): Add {
  const o = posToWorld(scene, { x: 0, y: 0, z: 0 });
  const M = new Matrix4().makeTranslation(o.x, o.y, o.z);
  return (layer, g, hex, sid, uv = null, label, tag) => { B.add(layer, g, M, hex, sid, { uv, label, chunk: scene }, tag); };
}

export function buildInteriors(core: Core, T: Tex): Batch[] {
  const s = new Batch('studio_int'), w = new Batch('subway_int');
  studio(adder(s, 'studio_int'), T, core);
  subway(adder(w, 'subway_int'), T);
  return [s, w];
}

// ------------------------------------------------------------------ 周记照相馆
function studio(A: Add, T: Tex, core: Core): void {
  const S = STUDIO;
  const W = S.x1 - S.x0, D = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
  // shell: floor tiles, walls, ceiling, skirting
  A('solid', box(W, 0.1, D, cx, -0.1, cz), PAL.tileWhite, 20);
  A('solid', box(S.x1 - S.partX, 0.02, S.darkZ1 - S.z0, (S.partX + S.x1) / 2, 0.0, (S.z0 + S.darkZ1) / 2), '#46302f', 21);   // darkroom floor (safelight wash)
  A('solid', box(W + 0.4, 0.1, D + 0.4, cx, S.ceil, cz), PAL.plasterWhite, 22);
  A('solid', box(W + 0.4, S.ceil, 0.2, cx, 0, S.z0 - 0.1), PAL.plasterBeige, 23);
  A('solid', box(W + 0.4, S.ceil, 0.2, cx, 0, S.z1 + 0.1), PAL.plasterBeige, 23);
  A('solid', box(0.2, S.ceil, D, S.x0 - 0.1, 0, cz), PAL.plasterBeige, 24);
  A('solid', box(0.2, S.ceil, D, S.x1 + 0.1, 0, cz), PAL.plasterBeige, 24);
  A('solid', box(W, 0.9, 0.04, cx, 0, S.z0 + 0.02), PAL.teal, 25);
  A('solid', box(0.04, 0.9, D, S.x0 + 0.02, 0, cz), PAL.teal, 25);
  // partition + darkroom south wall (door gap z 1..2), door frame with the pencil height marks (GDD S_studio)
  A('solid', box(0.16, S.ceil, S.doorZ0 - S.z0, S.partX, 0, (S.z0 + S.doorZ0) / 2), PAL.plasterWhite, 26);
  A('solid', box(0.16, S.ceil, S.darkZ1 - S.doorZ1, S.partX, 0, (S.doorZ1 + S.darkZ1) / 2), PAL.plasterWhite, 26);
  A('solid', box(0.16, S.ceil - 2.2, S.doorZ1 - S.doorZ0, S.partX, 2.2, (S.doorZ0 + S.doorZ1) / 2), PAL.plasterWhite, 26);
  A('solid', box(S.x1 - S.partX, S.ceil, 0.16, (S.partX + S.x1) / 2, 0, S.darkZ1), PAL.plasterWhite, 26);
  for (const z of [S.doorZ0, S.doorZ1]) A('interact', box(0.22, 2.2, 0.08, S.partX, 0, z), PAL.ochre, 230);
  A('interact', box(0.22, 0.1, S.doorZ1 - S.doorZ0 + 0.08, S.partX, 2.2, (S.doorZ0 + S.doorZ1) / 2), PAL.ochre, 230);
  const marks = T.art('heightmarks', 24, 128, (g, w, h) => {
    g.fillStyle = PAL.ochre; g.fillRect(0, 0, w, h);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 1.5; g.fillStyle = PAL.inkDeep; g.font = `400 7px ${FONT.hand}`;
    for (const [y, age] of [[96, '7'], [70, '12'], [40, '18']] as const) { g.beginPath(); g.moveTo(2, y); g.lineTo(w - 2, y); g.stroke(); g.fillText(age, 3, y - 2); }
  });
  A('interact', quad(0.07, 2.1, S.partX - 0.115, 1.05, S.doorZ0 + 0.05, '-x'), '#ffffff', 231, marks);
  // portrait wall: 6 × 4 portraits (faces from chars.faceTexture), frames on the west wall (GDD S_studio)
  const P = S.portrait;
  A('solid', box(0.06, P.h + 0.3, P.w + 0.3, S.x0 + 0.03, P.y - P.h / 2 - 0.15, P.z), PAL.trunk, 27);
  portraits(core, P);
  // pickup cabinet (0815 slightly open), jingle poster, backdrop + tripod, counter, shutter door
  const C = S.cabinet;
  A('interact', box(C.w, C.h, C.d, C.x, 0, C.z + C.d / 2), PAL.trunk, 232);
  A('interact', quad(C.w - 0.1, C.h - 0.2, C.x, C.h / 2, C.z + C.d + 0.01, 'z'), '#ffffff', 233, T.panel('cubbies', PAL.ochre, 'grid'));
  A('interact', boxRot(0.2, 0.18, 0.02, C.x + 0.55, 1.2, C.z + C.d + 0.06, 0, 0.6), PAL.ochre, 234);
  const poster = T.art('jingle', 48, 72, (g, w, h) => {
    g.fillStyle = PAL.spiritPaper; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.inkDeep; g.font = `400 7px ${FONT.hand}`;
    for (let i = 0; i < 4; i++) g.fillRect(6, 12 + i * 14, w - 12 - (i % 2) * 8, 1.5);
    g.fillStyle = PAL.bannerRed; g.fillRect(w - 12, h - 12, 7, 7);
  });
  A('interact', quad(S.poster.w, S.poster.h, S.poster.x, S.poster.y, S.z0 + 0.03, 'z'), '#ffffff', 235, poster);
  A('solid', box(0.05, S.backdrop.h, S.backdrop.w, S.x0 + 0.05, 0.1, S.backdrop.z), PAL.skyBlue, 28);
  A('solid', cyl(0.05, 0.05, S.backdrop.w, 6, S.x0 + 0.1, S.backdrop.h + 0.1, S.backdrop.z), PAL.charcoal, 29);
  A('solid', box(0.45, 0.45, 0.45, S.x0 + 0.9, 0, S.backdrop.z), PAL.ochre, 30);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    A('solid', bar(v3(S.tripod.x + Math.sin(a) * 0.35, 0, S.tripod.z + Math.cos(a) * 0.35), v3(S.tripod.x, 1.35, S.tripod.z), 0.035), PAL.charcoal, 31);
  }
  A('solid', box(0.14, 0.08, 0.14, S.tripod.x, 1.35, S.tripod.z), PAL.charcoal, 31);
  A('solid', box(S.counter.w, 1.0, S.counter.d, S.counter.x, 0, S.counter.z), PAL.ochre, 32);
  A('solid', box(S.counter.w + 0.1, 0.06, S.counter.d + 0.1, S.counter.x, 1.0, S.counter.z), PAL.trunk, 33);
  A('solid', quad(S.shutter.w, S.shutter.h, S.shutter.x, S.shutter.h / 2, S.z1 - 0.02, '-z'), '#ffffff', 34, T.shutter(2));
  A('solid', quad(1.6, 0.5, S.shutter.x, S.shutter.h + 0.35, S.z1 - 0.03, '-z'), '#ffffff', 35, T.sign('sign.studio', 1.6, 0.5, PAL.blue, PAL.clothWhite, FONT.brush));
  // light fixtures (unlit), a hanging bulb over the counter
  for (const [x, z] of [[-2, 0], [-2, 4], [3, 5]] as const) A('win', box(0.9, 0.05, 0.2, x, S.ceil - 0.06, z), PAL.metalRail, 36, null, undefined, winTag('lamp'));
  studioDressing(A, T);
  // --- darkroom: red safelight, bench with 3 trays, enlarger, drying line, the old phone
  // I-look: no daylight reaches in here. Every darkroom surface is painted in the safelight's maroon wash (walls,
  // ceiling, floor, bench) so the room reads as lit by the red lamp, not as an unlit black box; the lamp itself is a
  // big unlit red box with a painted glow disc on the wall behind it (no transparent layers in the main pass).
  const DK = { wall: '#6a3a3c', ceil: '#4e2e31', bench: '#5b3a36' };
  A('win', cyl(0.14, 0.14, 0.18, 8, (S.partX + S.x1) / 2, S.ceil - 0.28, -1.2), PAL.bannerRed, 240, null, undefined, 'lantern:9001');
  const B0 = S.bench;
  A('interact', box(B0.w, B0.h, B0.d, B0.x, 0, B0.z), DK.bench, 236);
  const trays: [number, number, string][] = [[S.trays.brown.x, S.trays.brown.z, PAL.trunk], [S.trays.white.x, S.trays.white.z, PAL.clothWhite], [S.trays.blue.x, S.trays.blue.z, PAL.blue]];
  for (const [x, z, col] of trays) A('interact', box(0.62, 0.07, 0.46, x, B0.h, z), col, 237);
  A('solid', box(0.35, 0.1, 0.4, S.partX + 0.45, B0.h, B0.z), PAL.charcoal, 37);
  A('solid', box(0.08, 0.9, 0.08, S.partX + 0.45, B0.h + 0.1, B0.z - 0.1), PAL.metalRail, 38);
  A('solid', box(0.3, 0.3, 0.3, S.partX + 0.45, B0.h + 0.9, B0.z), PAL.charcoal, 37);
  A('detail', box(S.line.x1 - S.line.x0, 0.015, 0.015, (S.line.x0 + S.line.x1) / 2, S.line.y, S.line.z), PAL.cable, 39);
  for (let i = 0; i < 4; i++) A('detail', box(0.04, 0.08, 0.02, S.line.x0 + 0.5 + i * 0.7, S.line.y - 0.08, S.line.z), PAL.clothWhite, 40);
  A('interact', box(0.5, 0.9, 0.6, S.phone.x, 0, S.phone.z), PAL.trunk, 238);
  A('interact', box(0.16, 0.06, 0.28, S.phone.x - 0.05, 0.9, S.phone.z), PAL.charcoal, 239);
  A('win', quad(0.1, 0.07, S.phone.x - 0.05, 0.965, S.phone.z, 'y'), PAL.neonTeal, 239, null, undefined, 'neon:9002');
  // darkroom shell: blackout panels on all four walls, a lowered ceiling and the floor, in the safelight wash
  const dW = S.x1 - S.partX, dD = S.darkZ1 - S.z0, dcx = (S.partX + S.x1) / 2, dcz = (S.z0 + S.darkZ1) / 2;
  A('solid', box(0.03, S.ceil - 0.1, dD - 0.1, S.x1 - 0.02, 0, dcz), DK.wall, 41);
  A('solid', box(dW - 0.2, S.ceil - 0.1, 0.03, dcx, 0, S.z0 + 0.02), DK.wall, 41);
  A('solid', box(0.03, S.ceil - 0.1, S.doorZ0 - S.z0 - 0.1, S.partX + 0.1, 0, (S.z0 + S.doorZ0) / 2), DK.wall, 41);
  A('solid', box(0.03, S.ceil - 0.1, S.darkZ1 - S.doorZ1 - 0.1, S.partX + 0.1, 0, (S.doorZ1 + S.darkZ1) / 2), DK.wall, 41);
  A('solid', box(dW - 0.2, S.ceil - 0.1, 0.03, dcx, 0, S.darkZ1 - 0.1), DK.wall, 41);
  A('solid', box(dW - 0.1, 0.04, dD - 0.1, dcx, S.ceil - 0.1, dcz), DK.ceil, 45);
  // the safelight above the bench: the housing; its lens is world/darkroom.ts (dark until the bench's E switches it on,
  // P3r2 look L1: the painted concentric glow discs read as a flat bullseye decal — the red light is render's grade now)
  A('solid', box(0.62, 0.36, 0.2, B0.x, 2.15, S.z0 + 0.12), PAL.charcoal, 44);
}

/** P3r3 (look g, L10): set dressing for the front room, which read as an empty box (bare partition wall, empty south
 *  wall, nothing behind the counter): two umbrella lights at the backdrop, sample portraits on the partition, a wall
 *  clock and a 2006 calendar, a waiting bench, a plant, a film shelf and a camera vitrine behind the counter, a door
 *  mat. Visual only, all inside STUDIO_PROPS (colliders in plans.ts); no text (the no-CJK rule), ≈ 700 triangles. */
function studioDressing(A: Add, T: Tex): void {
  const S = STUDIO, D = STUDIO_PROPS;
  // umbrella lights on stands, turned toward the stool at the backdrop
  for (const [x, z] of D.lights) {
    A('detail', cyl(0.025, 0.03, 1.75, 5, x, 0, z), PAL.charcoal, 60);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      A('detail', bar(v3(x + Math.sin(a) * 0.28, 0, z + Math.cos(a) * 0.28), v3(x, 0.45, z), 0.025), PAL.charcoal, 60);
    }
    const dz = S.backdrop.z - z, dx = S.x0 + 0.9 - x, yaw = Math.atan2(dx, dz);
    const um = cyl(0.04, 0.42, 0.3, 8, 0, 0, 0);
    um.rotateX(Math.PI / 2 + 0.35);                   // open side toward the stool, tilted down a little
    um.rotateY(yaw);
    um.translate(x, 1.75, z);
    A('solid', um, PAL.clothWhite, 61);
    A('detail', box(0.12, 0.12, 0.16, x, 1.7, z), PAL.charcoal, 60);
  }
  // sample portraits on the partition's west face (a couple, a child), in ochre frames
  const couple = T.art('st_sample_couple', 40, 52, (g, w, h) => {
    g.fillStyle = '#cfd9d6'; g.fillRect(0, 0, w, h);
    for (const [cx, col] of [[13, PAL.navy], [27, PAL.clothWhite]] as const) {
      g.fillStyle = col; g.fillRect(cx - 7, 26, 14, 26);
      g.fillStyle = PAL.skin; g.beginPath(); g.arc(cx, 19, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.hair; g.fillRect(cx - 6, 11, 12, 5);
    }
    g.fillStyle = PAL.bannerRed; g.fillRect(24, 30, 6, 3);
  });
  const child = T.art('st_sample_child', 32, 40, (g, w, h) => {
    g.fillStyle = '#f0d9a8'; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.bannerRed; g.fillRect(9, 24, 14, 16);
    g.fillStyle = PAL.skin; g.beginPath(); g.arc(16, 17, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.hair; g.fillRect(10, 9, 12, 4);
  });
  for (const f of D.frames) {
    const x = S.partX - 0.09;
    A('solid', box(0.04, f.h + 0.12, f.w + 0.12, x, f.y - (f.h + 0.12) / 2, f.z), PAL.ochre, 62);
    A('solid', quad(f.w, f.h, x - 0.025, f.y, f.z, '-x'), '#ffffff', 63, f.kind === 'couple' ? couple : child);
  }
  // wall clock and a 2006 calendar on the south wall (inner face z1)
  const zS = S.z1 - 0.03;
  const clock = cyl(0.2, 0.2, 0.05, 12, 0, 0, 0); clock.rotateX(Math.PI / 2); clock.translate(D.clock.x, D.clock.y, zS - 0.03);
  A('solid', clock, PAL.clothWhite, 64);
  A('detail', box(0.02, 0.15, 0.01, D.clock.x, D.clock.y, zS - 0.06), PAL.inkDeep, 65);
  A('detail', boxRot(0.02, 0.11, 0.01, D.clock.x + 0.04, D.clock.y, zS - 0.06, 0, 0, -1.1), PAL.inkDeep, 65);
  const cal = T.art('st_calendar', 36, 48, (g, w, h) => {
    g.fillStyle = PAL.clothWhite; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.bannerRed; g.fillRect(0, 0, w, 11);
    g.fillStyle = PAL.clothWhite; g.font = `700 9px ${FONT.hud}`; g.textAlign = 'center'; g.fillText('2006', w / 2, 9);
    g.fillStyle = PAL.inkDeep; g.font = `700 16px ${FONT.hud}`; g.fillText('9', w / 2, 27);
    g.fillStyle = PAL.metalRail;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) g.fillRect(3 + c * 5, 32 + r * 5, 3, 3);
    g.fillStyle = PAL.bannerRed; g.fillRect(3 + 5 * 5, 32 + 2 * 5, 3, 3);   // the 30th
  });
  A('solid', quad(0.36, 0.48, D.calendar.x, D.calendar.y, zS - 0.01, '-z'), '#ffffff', 66, cal);
  // waiting bench against the south wall, a potted plant in the corner, a door mat inside the shutter
  const Bn = D.bench;
  A('solid', box(Bn.w, 0.06, Bn.d, Bn.x, 0.42, Bn.z), PAL.trunk, 67);
  A('solid', box(Bn.w, 0.4, 0.05, Bn.x, 0.48, Bn.z + Bn.d / 2 - 0.03), PAL.trunk, 67);
  for (const sx of [-1, 1]) A('detail', box(0.06, 0.42, Bn.d - 0.06, Bn.x + sx * (Bn.w / 2 - 0.08), 0, Bn.z), PAL.charcoal, 68);
  const Pl = D.plant;
  A('solid', cyl(0.2, 0.15, 0.4, 8, Pl.x, 0, Pl.z), PAL.rust, 69);
  for (const [dx, dy, dz, r] of [[0, 0.75, 0, 0.3], [0.15, 1.0, 0.08, 0.22], [-0.12, 0.95, -0.1, 0.2]] as const) {
    A('solid', cyl(r * 0.2, r, r * 1.3, 6, Pl.x + dx, 0.4 + dy - r, Pl.z + dz), PAL.foliage, 70);
  }
  A('solid', box(1.6, 0.015, 0.9, D.mat.x, 0.0, D.mat.z), PAL.bannerRed, 71);
  // behind the counter: a shelf of film boxes on the east wall and a glass camera vitrine on the counter
  const Sh = D.shelf;
  for (const y of [1.25, 1.75]) {
    A('solid', box(0.3, 0.04, Sh.w, S.x1 - 0.16, y, Sh.z), PAL.trunk, 72);
    for (let i = 0; i < 6; i++) {
      const col = [PAL.yellow, PAL.yellow, '#3e8f5a', PAL.yellow, '#3e8f5a', PAL.bannerRed][(i + (y > 1.5 ? 2 : 0)) % 6];
      A('detail', box(0.16, 0.2, 0.12, S.x1 - 0.18, y + 0.04, Sh.z - Sh.w / 2 + 0.15 + i * (Sh.w - 0.3) / 5), col, 73);
    }
  }
  const V = D.vitrine, top = 1.06;
  A('solid', box(V.w, 0.05, V.d, V.x, top, V.z), PAL.trunk, 74);
  A('solid', box(V.w, 0.04, V.d, V.x, top + V.h, V.z), PAL.trunk, 74);
  for (const sx of [-1, 1]) A('detail', box(0.03, V.h, V.d, V.x + sx * (V.w / 2 - 0.015), top + 0.05, V.z), PAL.trunk, 74);
  A('win', quad(V.w - 0.06, V.h - 0.05, V.x, top + 0.05 + (V.h - 0.05) / 2, V.z - V.d / 2 - 0.005, 'z'), PAL.glassGlint, 75, null, undefined, winTag('home'));
  for (const [dx, col] of [[-0.22, PAL.charcoal], [0.02, PAL.inkDeep], [0.25, PAL.charcoal]] as const) {
    A('detail', box(0.16, 0.1, 0.08, V.x + dx, top + 0.06, V.z), col, 76);
    A('detail', cyl(0.03, 0.03, 0.04, 6, V.x + dx, top + 0.1, V.z - 0.06), PAL.metalRail, 76);
  }
}

/** 24 portraits from C's shared face atlas (faceTexture(seed).userData.atlas / cell), one mesh (GDD §4.1 Faces). */
function portraits(core: Core, P: typeof STUDIO.portrait): void {
  let atlasTex: unknown = null;
  const cells: { u0: number; v0: number; u1: number; v1: number }[] = [];
  try {
    for (let i = 0; i < P.cols * P.rows; i++) {
      const tx = core.services.chars.faceTexture(i);
      const ud = tx.userData as { atlas?: unknown; cell?: { u0: number; v0: number; u1: number; v1: number } };
      if (ud?.atlas && ud.cell) { atlasTex = ud.atlas; cells.push(ud.cell); } else { atlasTex = tx; cells.push({ u0: 0, v0: 0, u1: 1, v1: 1 }); }
    }
  } catch { atlasTex = null; }
  buildPortraitMesh(core, P, atlasTex, cells);
}
import { Mesh, type Texture } from 'three';
import { mergePainted, paint } from '../../core/geom';
import { makeToonMaterial } from '../../render/index';
function buildPortraitMesh(core: Core, P: typeof STUDIO.portrait, tex: unknown, cells: { u0: number; v0: number; u1: number; v1: number }[]): void {
  const parts: BufferGeometry[] = [], frames: BufferGeometry[] = [];
  const cw = P.w / P.cols, chh = P.h / P.rows;
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const i = r * P.cols + c;
    const z = P.z - P.w / 2 + cw * (c + 0.5), y = P.y + P.h / 2 - chh * (r + 0.5);
    const fr = box(0.03, chh * 0.86, cw * 0.84, STUDIO.x0 + 0.075, y - chh * 0.43, z);
    paint(fr, i % 3 ? PAL.clothWhite : PAL.ochre, 42); setUv0(fr);
    frames.push(fr);
    const q = quad(cw * 0.66, chh * 0.7, STUDIO.x0 + 0.095, y, z, 'x');
    paint(q, '#ffffff', 43);
    const cell = cells[i] ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
    const uv = q.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + (cell.u1 - cell.u0) * uv.getX(k), cell.v0 + (cell.v1 - cell.v0) * uv.getY(k));
    parts.push(q);
  }
  const o = posToWorld('studio_int', { x: 0, y: 0, z: 0 });
  const scene = core.scenes.get('studio_int');
  const fm = new Mesh(mergePainted(frames), makeToonMaterial({ vertexColors: true }));
  fm.position.copy(o);
  scene.add(fm);
  if (tex) {
    const faces = new Mesh(mergePainted(parts), makeToonMaterial({ vertexColors: true, map: tex as Texture }));
    faces.position.copy(o);
    faces.name = 'world:portraits';
    scene.add(faces);
  }
}
function setUv0(g: BufferGeometry): void { setUvW(g, null); }
import { setUv as setUvW } from '../kit/batch';

// ------------------------------------------------------------------ 零号线 (hall + platform)
function subway(A: Add, T: Tex): void {
  const S = SUBWAY_INT;
  const W = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2, D = S.z1 - S.z0, cz = (S.z0 + S.z1) / 2;
  A('solid', box(W, 0.1, D, cx, -0.1, cz), PAL.sidewalk, 50);
  for (let x = S.x0 + 1; x < S.x1; x += 2) A('detail', box(0.04, 0.012, D, x, 0, cz), PAL.concrete, 51);
  A('solid', box(W, 0.12, 0.3, cx, 0, S.z1 - 0.15), PAL.yellow, 52);                     // platform edge
  A('solid', box(W + 0.4, 0.15, S.pitZ1 - S.z0 + 0.4, cx, S.ceil, (S.z0 + S.pitZ1) / 2), PAL.concrete, 53);
  A('solid', box(W + 0.4, S.ceil, 0.2, cx, 0, S.z0 - 0.1), PAL.tileWhite, 54);
  for (const x of [S.x0 - 0.1, S.x1 + 0.1]) A('solid', box(0.2, S.ceil - S.pitY, S.pitZ1 - S.z0, x, S.pitY, (S.z0 + S.pitZ1) / 2), PAL.tileWhite, 55);
  A('solid', box(W, 1.0, 0.03, cx, 0, S.z0 + 0.02), PAL.teal, 56);
  // stairs up at the west end
  const n = 12;
  for (let i = 0; i < n; i++) A('solid', box(S.stairX - S.x0, 0.25 * (i + 1), D / n + 0.01, (S.x0 + S.stairX) / 2, 0, S.z0 + (D * (i + 0.5)) / n), PAL.concrete, 57 + (i % 2));
  // gantry: cabinets + the flap lane (dyn:gantry, GDD P7), with the green arrows
  for (const z of [-2.6, -1.6, -0.6, 0.6, 1.6]) {
    A('solid', box(0.35, 1.0, 0.18, S.gantryX, 0, z), PAL.metalRail, 59);
    A('win', quad(0.18, 0.1, S.gantryX - 0.18, 0.9, z, '-x'), PAL.neonTeal, 60, null, undefined, 'neon:9101');
  }
  A('interact', box(0.08, 0.6, 1.0, S.gantryX, 0.35, 0), PAL.bannerRed, 238, null, undefined, 'dyn:gantry');
  // platform screen doors (z 2) with the glowing gap at x 4.5 (pk_psd)
  for (let x = -0.4; x < S.x1 - 0.2; x += 1.6) {
    A('solid', box(0.18, 2.4, 0.16, x, 0, S.psdZ + 0.05), PAL.metalRail, 61);
    if (Math.abs(x + 0.8 - S.psdGapX) > 0.6) A('win', quad(1.4, 2.0, x + 0.8, 1.1, S.psdZ + 0.05, '-z'), PAL.glassDark, 62, T.pane(0), undefined, 'glass:1');
  }
  A('solid', box(S.x1 + 0.5, 0.35, 0.2, (S.x1 - 0.5) / 2, 2.4, S.psdZ + 0.05), PAL.charcoal, 63);
  A('win', quad(0.62, 2.0, S.psdGapX - 0.34, 1.1, S.psdZ + 0.05, '-z'), PAL.glassDark, 62, T.pane(0), undefined, 'glass:1');
  A('win', quad(0.62, 2.0, S.psdGapX + 0.34, 1.1, S.psdZ + 0.05, '-z'), PAL.glassDark, 62, T.pane(0), undefined, 'glass:1');
  A('win', box(0.12, 2.0, 0.06, S.psdGapX, 0.1, S.psdZ + 0.05), PAL.ghostfire, 244, null, undefined, 'neon:9105');
  // the track pit beyond the doors: floor, rails, sleepers, tunnel wall
  A('solid', box(W, 0.1, S.pitZ1 - S.psdZ, cx, S.pitY - 0.1, (S.psdZ + S.pitZ1) / 2), PAL.charcoal, 64);
  for (const z of [2.6, 3.3]) A('solid', box(W, 0.12, 0.08, cx, S.pitY, z), PAL.metalRail, 65);
  for (let x = S.x0 + 0.5; x < S.x1; x += 0.8) A('detail', box(0.25, 0.06, 1.1, x, S.pitY, 2.95), PAL.trunk, 66);
  A('solid', box(W, S.ceil - S.pitY, 0.2, cx, S.pitY, S.pitZ1 + 0.1), PAL.concrete, 67);
  A('solid', box(W, 0.12, 0.2, cx, 0 - 0.12, S.psdZ + 0.1), PAL.concrete, 68);
  // negative ④ lying between two sleepers at the pit anchor (GDD P7, T_frame4_pit); gone once it is registered
  // (dyn:frame4, world/phaseState). A curled strip: frame + sprocket rows, amber base, a faint inverted image.
  const neg = T.art('neg4', 96, 40, (g, w, h) => {
    g.fillStyle = '#4a3322'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9c49a';
    for (let x = 4; x < w - 4; x += 8) { g.fillRect(x, 3, 4, 4); g.fillRect(x, h - 7, 4, 4); }
    g.fillStyle = '#b9d6d2'; g.fillRect(14, 11, w - 28, h - 22);
    g.fillStyle = '#6f8f8c'; g.fillRect(20, 16, 18, h - 30); g.fillRect(44, 20, 30, h - 34);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
  A('sign', quad(0.4, 0.17, S.psdGapX, S.pitY + 0.006, 2.92, 'y'), '#ffffff', 72, neg, undefined, 'dyn:frame4');
  // display 「下一班 即将进站（已等待 3650 天）」 + line-0 roundel + posters
  const disp = T.art('sw_display', 256, 56, (g, w, h) => {
    g.fillStyle = PAL.inkDeep; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.neonYellow; g.font = `700 17px ${FONT.sign}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t('sign.sw_display'), w / 2, h / 2 + 1);
  });
  const Dp = S.display;
  A('solid', box(Dp.w + 0.1, Dp.h + 0.1, 0.12, Dp.x, Dp.y - Dp.h / 2 - 0.05, S.z0 + 0.06), PAL.charcoal, 69);
  A('win', quad(Dp.w, Dp.h, Dp.x, Dp.y, S.z0 + 0.13, 'z'), '#ffffff', 70, disp, undefined, 'neon:9106');
  A('solid', quad(1.8, 0.5, -6, 2.4, S.z0 + 0.03, 'z'), '#ffffff', 71, T.sign('sign.line0', 1.8, 0.5, PAL.charcoal, PAL.clothWhite, FONT.sign, 'sign.subway'));
  A('solid', quad(0.6, 0.9, -3.8, 1.5, S.z0 + 0.03, 'z'), '#ffffff', 72, T.poster('sign.poster_missing'));
  // fluorescent tubes + pillars + a bench
  for (let x = S.x0 + 2; x < S.x1; x += 3) A('win', box(1.2, 0.06, 0.12, x, S.ceil - 0.1, -0.5), PAL.clothWhite, 73, null, undefined, 'neon:9107');
  for (const x of [-6.5, 2.2]) A('solid', box(0.6, S.ceil, 0.6, x, 0, -0.6), PAL.tileWhite, 74);
  A('solid', box(1.6, 0.45, 0.45, 5, 0, -2.5), PAL.metalRail, 75, null, 'bench');
}
export { cyl, boxRot };
