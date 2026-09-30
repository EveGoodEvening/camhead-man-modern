// src/world/build/places.ts — owner B. GDD §5.3 locations 3–6: 月亮湾便利店 + 邻里柜, 猫耳巷 + 凸面镜, 周记照相馆
// (exterior), 红旗新村 (1/2号楼, galleries, 福 doors, milk boxes, fire ladder, roof coop / TV, face gate). Other
// locations are in places2.ts. Dynamic dressing is tagged `dyn:*` (kit/mutables.ts) or returned as objects.
import { CanvasTexture, Group, Mesh, SRGBColorSpace, SphereGeometry, type BufferGeometry, type Object3D, type Texture } from 'three';
import { PAL } from '../../art/palette';
import type { Core } from '../../contracts';
import type { LabelId, WorldAnchorId } from '../../types';
import { placeMatrix, placeAt, SURFACES, frameAt } from '../../core/planet';
import { mergePainted, paint } from '../../core/geom';
import { makeCanvas } from '../../core/canvas';
import { createRng } from '../../core/rng';
import { FONT } from '../../core/fonts';
import { t } from '../../data/zh';
import { makeToonMaterial } from '../../render/index';
import { add, ch, dirAt, fl, headingOf, lerp2, len, sub, type P2, type Rect } from '../geo';
import {
  ALLEY, ESTATE, MIRROR, STORE, STUDIO_FRONT, alleyDir, alleyWest, b1Point, b1Rect, b2Rect, type Bldg,
} from '../layout';
import { alleyEastWall, alleyFlanks, coopRect, fireLadderRect, guardBoothRect, storeRect, studioRect } from '../colliders';
import { flatMatrix, setUv, type LayerKind } from '../kit/batch';
import { SID, buildBuilding, winTag, type BuildCtx } from '../kit/building';
import { bar, blob, box, boxOpen, boxRot, cyl, frameRing, quad, v3 } from '../kit/prims';
import { cable } from '../kit/props';
import type { UvRect } from '../atlas';
import type { P8Result } from '../p8';
import type { Dyn } from '../phaseState';
import { buildPlaces2 } from './places2';

export interface PlacesOut {
  anchorObjects: Partial<Record<WorldAnchorId, Object3D>>;
  canvases: Partial<Record<WorldAnchorId, HTMLCanvasElement>>;
  faceHdg: Partial<Record<WorldAnchorId, number>>;
  dyn: Dyn;
  mirror: { setTexture(t: Texture | null): void } | null;
  lamps: { p: P2; h: number }[];
}
export type Add = (layer: LayerKind, g: BufferGeometry, hex: string, sid: number, uv?: UvRect | null, label?: LabelId, tag?: string) => void;
export function onRect(c: BuildCtx, rc: Rect, h = 0): Add {
  const M = placeMatrix('planet', { ...ch(rc.c), h }, rc.hdg);
  return (layer, g, hex, sid, uv = null, label, tag) => { c.B.add(layer, g, M, hex, sid, { uv, label }, tag); };
}
export function onP(c: BuildCtx, p: P2, h: number, hdg: number): Add { return onRect(c, { c: p, hdg, hw: 0, hd: 0 }, h); }

export function buildPlaces(c: BuildCtx, core: Core, p8: P8Result): PlacesOut {
  const out: PlacesOut = { anchorObjects: {}, canvases: {}, faceHdg: {}, dyn: { objects: {} }, mirror: null, lamps: [] };
  store(c);
  alley(c);
  out.mirror = mirror(core);
  estate(c, core, out);
  buildPlaces2(c, core, p8, out);
  return out;
}

// ------------------------------------------------------------------ 月亮湾便利店 + 邻里柜 (GDD §5.3 #3, P2)
function store(c: BuildCtx): void {
  const rc = storeRect();
  const A = onRect(c, rc);
  const W = rc.hw * 2, D = rc.hd * 2, zF = rc.hd;
  A('solid', box(W, 6.4, D, 0, -0.4, 0), PAL.plasterWhite, 30, null, 'qilou');
  A('solid', box(W + 0.1, 0.7, D + 0.1, 0, 6.0, 0), PAL.concrete, 51);
  A('solid', box(W + 0.14, 0.2, D + 0.14, 0, 2.95, 0), PAL.plasterWhite, 52);
  // green + orange stripe band (ART §2.1 便利店)
  A('solid', box(W + 0.06, 0.36, 0.1, 0, 2.55, zF + 0.02), PAL.steelGreen, 88);
  A('solid', box(W + 0.06, 0.14, 0.1, 0, 2.42, zF + 0.02), PAL.orange, 89);
  // glowing sign (unlit, the brightest thing at night — ART §2.2)
  const sign = c.T.sign('sign.store', 4.6, 0.8, PAL.clothWhite, PAL.steelGreen, FONT.display, 'sign.store_24');
  const Mst = placeMatrix('planet', { ...ch(rc.c), h: 0 }, rc.hdg);
  c.B.add('solid', box(4.9, 0.95, 0.16, -0.4, 3.12, zF + 0.05), Mst, PAL.steelGreen, 90, { chunk: 'hp:store:solid' });
  c.B.add('win', quad(4.7, 0.82, -0.4, 3.6, zF + 0.14, 'z'), Mst, '#ffffff', 91, { uv: sign, chunk: 'hp:store:win' }, winTag('neon'));
  // shop glazing (lit dusk + night: 24 h) and the door at lon 60
  const glass = c.T.shopGlass(7);
  for (const x of [-2.2, 1.2, 2.7]) A('win', quad(x === -2.2 ? 1.6 : 1.3, 2.1, x, 1.15, zF + 0.03, 'z'), PAL.glassDark, 82, glass, 'window', winTag('lamp'));
  A('win', quad(1.1, 2.15, -0.35, 1.1, zF + 0.03, 'z'), PAL.glassDark, 82, c.T.pane(0), 'window', winTag('lamp'));
  A('solid', quad(1.3, 2.35, -0.35, 1.18, zF + 0.015, 'z'), PAL.steelGreen, 72);
  // storeroom shutter at the east end (a 拆 mark appears here at dusk, GDD §5.7)
  A('solid', quad(1.2, 2.3, W / 2 - 0.75, 1.15, zF + 0.02, 'z'), '#ffffff', 84, c.T.shutter(4));
  // upper floor windows + AC
  for (const x of [-2.4, -0.4, 1.6]) {
    c.B.add('win', quad(1.1, 1.2, x, 4.55, zF + 0.03, 'z'), placeMatrix('planet', { ...ch(rc.c), h: 0 }, rc.hdg), PAL.glassDark, 80, { uv: c.T.pane(1), label: 'window' }, winTag('home'));
    for (const g of frameRing(1.3, 1.4, 0.1, x, 4.55, zF + 0.015)) A('solid', g, PAL.concrete, 72);   // ring, not a quad behind the pane
  }
  A('detail', box(0.8, 0.5, 0.32, 0.6, 3.95, zF + 0.16), PAL.metalRail, 96, null, 'ac_unit');
  A('detail', quad(0.76, 0.46, 0.6, 4.2, zF + 0.33, 'z'), '#ffffff', 97, c.T.ac(), 'ac_unit');
  // oden counter by the door (GDD: 关东煮冒着热气)
  const O = onP(c, fl(29.55, 62.9), 0, 180);
  O('solid', box(1.0, 0.95, 0.55, 0, 0, 0), PAL.clothWhite, 176);
  O('solid', box(0.8, 0.22, 0.4, 0, 0.95, 0), PAL.metalRail, 177, null, 'oden');
  O('detail', blob(0.2, -0.15, 1.3, 0, c.rng, 0.3, 0), PAL.clothWhite, 178, null, 'oden');
  O('detail', blob(0.16, 0.18, 1.42, 0.05, c.rng, 0.3, 0), PAL.clothWhite, 178, null, 'oden');
  O('solid', quad(0.9, 0.3, 0, 0.62, 0.28, 'z'), '#ffffff', 179, c.T.sign('sign.oden', 0.9, 0.3, PAL.orange, PAL.clothWhite));
  // 邻里柜: 4 × 5 column-major, #17 at (29.4, 55, 1.3) (GDD §5.4 sp_locker ‡)
  const lockerW = 1.9, lockerH = 2.0, u17 = 109 / 160;
  const lc = ch(fl(29.2, STORE.locker.lon));
  const shift = -(u17 - 0.5) * lockerW;             // quad centre so that column 4 sits on lon 55
  const L = onP(c, add(fl(29.2, STORE.locker.lon), dirAt(fl(29.2, STORE.locker.lon), 90), shift), 0, 180);
  // cabinet body without its front face (the printed door quad covers it) + a thin front rim for the green border
  L('interact', boxOpen(lockerW + 0.08, lockerH + 0.1, 0.36, 0, 0.05, 0, ['pz', 'ny']), PAL.steelGreen, 230, null, 'boxes');
  for (const g of frameRing(lockerW + 0.08, lockerH + 0.1, 0.045, 0, 0.05 + (lockerH + 0.1) / 2, 0.18)) L('interact', g, PAL.steelGreen, 230, null, 'boxes');
  L('interact', quad(lockerW, lockerH, 0, 0.1 + lockerH / 2, 0.19, 'z'), '#ffffff', 231, c.T.locker(), 'boxes');
  void lc;
}

// ------------------------------------------------------------------ 猫耳巷 + 周记照相馆 exterior (GDD §5.3 #4–5)
function alley(c: BuildCtx): void {
  const rng = createRng(0xa11e);
  const [west, east] = alleyFlanks();
  const mk = (id: string, rc: Rect, floors: number, wall: string, shop: Bldg['shop'], signKey: string | null): Bldg => ({
    id, rect: rc, floors, fh: 3, base: 0, wall, trim: PAL.roofMauve, roofColor: PAL.roofMauve, roof: 'flat', arcade: 0, shop,
    signKey, signBg: PAL.plasterWhite, signInk: PAL.inkDeep, vSignKey: null, far: false, collide: true, proxy: true,
    seed: rng.int(0, 1e9), kind: 'qilou',
  });
  buildBuilding(mk('alley_w', west, 2, PAL.tileWhite, 'wall', null), c);
  buildBuilding(mk('alley_e', east, 2, PAL.plasterBeige, 'wall', 'sign.shop_bike'), c);
  // alley floor: a paved ramp h 0 → 1.2 (GDD §5.6), authored along the alley axis and wrapped
  const Lm = len(sub(ALLEY.end, ALLEY.mouth));
  const mid = lerp2(ALLEY.mouth, ALLEY.end, 0.5);
  const hdg = headingOf(mid, alleyDir);
  const F = flatMatrix(mid, hdg, 0);
  const ramp = boxRot(ALLEY.halfW * 2 + 0.2, 0.2, Lm + 0.3, 0, ALLEY.topH / 2 - 0.1, 0, -Math.atan2(ALLEY.topH, Lm));
  ramp.applyMatrix4(F);
  c.B.put('ground', wrapPaint(ramp, PAL.sidewalk, 12));
  const top = box(ALLEY.halfW * 2 + 0.2, 0.2, 2.2, 0, ALLEY.topH - 0.2, Lm / 2 + 1.0);
  top.applyMatrix4(F);
  c.B.put('ground', wrapPaint(top, PAL.sidewalk, 12));
  // steps painted across the ramp (ink every 0.6 m)
  for (let s = 0.6; s < Lm; s += 0.9) {
    const g = box(ALLEY.halfW * 2, 0.02, 0.1, 0, (ALLEY.topH * s) / Lm + 0.005, s - Lm / 2);
    g.applyMatrix4(F);
    c.B.put('detail', wrapPaint(g, PAL.concrete, 13));
  }
  // east garden wall + studio
  const [a, b] = alleyEastWall();
  const wm = lerp2(a, b, 0.5), wl = len(sub(b, a));
  onP(c, wm, 0, headingOf(wm, sub(b, a)))('solid', box(0.3, 2.9, wl, 0, -0.2, 0), PAL.concrete, 44);
  onP(c, wm, 0, headingOf(wm, sub(b, a)))('detail', box(0.36, 0.15, wl, 0, 2.7, 0), PAL.roofMauve, 45);
  studio(c);
  // alley dressing: laundry lines across, AC units, bikes, a cat hole, the alley name plate
  for (let i = 0; i < 4; i++) {
    const s = 0.15 + i * 0.22;
    const p = add(ALLEY.mouth, alleyDir, Lm * s);
    const pa = add(p, alleyWest, ALLEY.halfW + 0.05), pb = add(p, alleyWest, -ALLEY.halfW - 0.05);
    const h = 4.2 + (i % 2) * 1.3;
    cable(c, pa, h, pb, h + 0.1, 0.05, 0.015);
    const cols = [PAL.skyBlue, PAL.clothWhite, PAL.tilePink, PAL.yellow, PAL.sage, PAL.bannerRed];
    for (let k = 0; k < 4; k++) {
      const q = lerp2(pa, pb, 0.15 + k * 0.22);
      const hh = rng.range(0.4, 0.8);
      onP(c, q, h - 0.05 - hh, headingOf(q, alleyDir))('detail', box(0.4, hh, 0.02, 0, 0, 0), rng.pick(cols), SID.laundry + (k % 2), null, 'laundry');
    }
  }
  const plate = c.T.sign('sign.alley', 0.9, 0.35, PAL.blue, PAL.clothWhite, FONT.sign);
  const pm = add(add(ALLEY.mouth, alleyWest, ALLEY.halfW + 0.02), alleyDir, 0.4);
  onP(c, pm, 0, headingOf(pm, { x: -alleyWest.x, z: -alleyWest.z }))('solid', quad(0.9, 0.35, 0, 2.6, 0.01, 'z'), '#ffffff', 115, plate);
  // cat hole at the foot of the west wall
  const ch0 = add(add(ALLEY.mouth, alleyDir, Lm * 0.5), alleyWest, ALLEY.halfW + 0.01);
  onP(c, ch0, (ALLEY.topH * 0.5), headingOf(ch0, { x: -alleyWest.x, z: -alleyWest.z }))('solid', quad(0.32, 0.26, 0, 0.13, 0.01, 'z'), PAL.inkDeep, 116);
}

function wrapPaint(g: BufferGeometry, hex: string, sid: number): BufferGeometry {
  paint(g, hex, sid);
  setUv(g, null);
  return wrapGeo(g);
}
import { wrapGeometry as wrapGeo } from '../../core/planet';

function studio(c: BuildCtx): void {
  const rc = studioRect();
  const A = onRect(c, rc, ALLEY.topH);
  const W = rc.hw * 2, D = rc.hd * 2, zF = rc.hd;
  A('solid', box(W, 7.2, D, 0, -1.6, 0), PAL.tileWhite, 36, null, 'qilou');
  A('solid', box(W + 0.14, 0.2, D + 0.14, 0, 2.9, 0), PAL.roofMauve, 53);
  A('solid', gableG(W, D), PAL.roofMauve, 61);
  // blue sign 「周记照相馆 · 证件照 冲印 婚纱」 (GDD §5.3 #5)
  const sign = c.T.sign('sign.studio', 3.6, 0.9, PAL.blue, PAL.clothWhite, FONT.brush, 'sign.studio_sub');
  A('solid', box(3.8, 1.05, 0.14, 0, 2.95, zF + 0.05), PAL.blue, 92);
  A('solid', quad(3.6, 0.92, 0, 3.47, zF + 0.13, 'z'), '#ffffff', 93, sign);
  // roller shutter (raised after P2: dyn:shutter), notice + QR on it (GDD P2)
  A('solid', box(2.8, 0.35, 0.3, 0, 2.5, zF + 0.1), PAL.metalRail, 94);
  A('solid', quad(2.6, 2.5, 0, 1.25, zF + 0.03, 'z'), '#ffffff', 84, c.T.shutter(6), undefined, 'dyn:shutter');
  const notice = c.T.art('studio_notice', 80, 56, (g, w, h) => {
    g.fillStyle = PAL.spiritPaper; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.bannerRed; g.font = `700 9px ${FONT.sign}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const s = t('sign.studio_notice'), parts = s.split(' · ');
    g.fillText(parts[0] ?? s, w / 2, 16); g.fillStyle = PAL.inkDeep; g.fillText(parts[1] ?? '', w / 2, 34);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 1.5; g.strokeRect(2, 2, w - 4, h - 4);
  });
  A('solid', quad(0.62, 0.44, -0.55, 1.62, zF + 0.05, 'z'), '#ffffff', 95, notice, undefined, 'dyn:shutter');
  A('solid', quad(0.26, 0.26, 0, 1.45, zF + 0.05, 'z'), '#ffffff', 95, c.T.qrCode('studio'), undefined, 'dyn:shutter');
  // upper floor window with the display of old photos
  c.B.add('win', quad(2.2, 1.1, 0, 4.6, zF + 0.03, 'z'), placeMatrix('planet', { ...ch(rc.c), h: ALLEY.topH }, rc.hdg), PAL.glassDark, 80, { uv: c.T.pane(1), label: 'window' }, winTag('home'));
  A('solid', quad(2.4, 1.3, 0, 4.6, zF + 0.015, 'z'), PAL.blue, 72);
  // a stuck-on 拆 mark on the shutter from night on (GDD §5.7)
  void STUDIO_FRONT;
}
function gableG(W: number, D: number): BufferGeometry { return gableRoof(W, D, 1.4, 5.6, 0.35); }
import { gable as gableRoof } from '../kit/prims';

// ------------------------------------------------------------------ 凸面镜 (GDD §5.3 #4, S_mirror)
function mirror(core: Core): { setTexture(t: Texture | null): void } {
  const scene = core.scenes.get('planet');
  const g = new Group();
  g.name = 'world:mirror';
  const { canvas, ctx } = makeCanvas(8, 8);
  ctx.fillStyle = PAL.glassGlint; ctx.fillRect(0, 0, 8, 8);
  const fallback = new CanvasTexture(canvas); fallback.colorSpace = SRGBColorSpace;
  // orange pole + back housing + rim merged in one mesh (vertex-coloured town program)
  const poleMat = makeToonMaterial({ vertexColors: true, seeThru: true });   // P3r2: poles are looked through (= the 'thin' program)
  // convex face: a shallow sphere cap facing +Z, unlit, mapped with D's LiveView (or a flat glint)
  const cap = new SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, 0.48);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, -0.9 * Math.cos(0.48) + 0.12);
  paint(cap, '#ffffff', 234);
  // planar uv from x/y so the image is centred
  const pos = cap.getAttribute('position'), uv = cap.getAttribute('uv');
  const rr = 0.9 * Math.sin(0.48);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * rr), 0.5 + pos.getY(i) / (2 * rr));
  const faceMat = makeToonMaterial({ vertexColors: true, map: fallback, unlit: true, lineWeight: 1.2 });
  const face = new Mesh(cap, faceMat);
  face.position.set(0, MIRROR.h, 0.02);
  g.add(face);
  const rim = paint(ringGeo(rr), PAL.orange, 233); rim.translate(0, MIRROR.h, 0.05);
  const housing = paint(boxHousing(), PAL.orange, 233); housing.translate(0, MIRROR.h, 0);
  const pole = paint(cyl(0.05, 0.06, MIRROR.h + 0.2, 7), PAL.orange, 232);
  for (const x of [rim, housing, pole]) setUv(x, null);
  g.add(new Mesh(mergePainted([pole, housing, rim]), poleMat));
  placeAt(g, 'planet', { r: MIRROR.r, lon: MIRROR.lon, h: 0 }, MIRROR.yaw);
  scene.add(g);
  g.traverse((o) => { o.castShadow = o !== face; o.receiveShadow = true; });
  core.scenes.registerCullable(g, { radius: 1.5, height: 3.2 });
  void frameAt; void SURFACES;
  return {
    setTexture(tex) {
      faceMat.map = tex ?? fallback;
      faceMat.needsUpdate = false;
    },
  };
}
function boxHousing(): BufferGeometry { return box(0.95, 0.95, 0.16, 0, -0.475, -0.1); }
function ringGeo(r: number): BufferGeometry {
  const g = new TorusGeo(r, 0.05, 5, 24);
  return g;
}
import { TorusGeometry as TorusGeo } from 'three';

// ------------------------------------------------------------------ 红旗新村 (GDD §5.3 #6, P3, P5)
function estate(c: BuildCtx, core: Core, out: PlacesOut): void {
  const rng = createRng(0xe57a7e);
  galleryBlock(c, b1Rect(), ESTATE.b1.floors, ESTATE.b1.gallery, true, rng, core, out);
  galleryBlock(c, b2Rect(), ESTATE.b2.floors, 1.2, false, rng, core, out);
  // compound walls (front arc with the gate, side walls hugging the blocks)
  const wallSeg = (a: P2, b: P2, h: number, hex: string) => {
    const m = lerp2(a, b, 0.5), L = len(sub(b, a));
    const A = onP(c, m, 0, headingOf(m, sub(b, a)));
    A('solid', box(0.28, h, L + 0.02, 0, -0.3, 0), hex, 40);
    A('solid', box(0.36, 0.14, L + 0.02, 0, h - 0.3, 0), PAL.roofMauve, 41);
  };
  const arc = (r: number, a: number, b: number, h: number) => {
    const n = Math.max(1, Math.ceil((r * (b - a) * Math.PI) / 180 / 2.2));
    for (let i = 0; i < n; i++) wallSeg(fl(r, a + ((b - a) * i) / n), fl(r, a + ((b - a) * (i + 1)) / n), h, PAL.plasterBeige);
  };
  const westEnd = b2PointFront(), eastEnd = b1PointFront();
  arc(ESTATE.frontR, westEnd, ESTATE.gateLon - ESTATE.gateHalfDeg, 2.4);
  arc(ESTATE.frontR, ESTATE.gateLon + ESTATE.gateHalfDeg, eastEnd, 2.4);
  // gate arch 「红旗新村」 + turnstile arms (dyn:arms) + face terminal + guard booth
  const gl = ESTATE.gateLon, gw = ESTATE.frontR * ESTATE.gateHalfDeg * 2 * Math.PI / 180;
  const G = onP(c, fl(ESTATE.frontR, gl), 0, 180);
  for (const s of [-1, 1]) G('solid', box(0.45, 3.6, 0.45, s * (gw / 2 + 0.2), -0.2, 0), PAL.tilePink, 42);
  G('solid', box(gw + 0.9, 0.7, 0.4, 0, 3.4, 0), PAL.bannerRed, 43);
  G('solid', quad(gw + 0.6, 0.6, 0, 3.75, 0.21, 'z'), '#ffffff', 46, c.T.sign('sign.estate', gw + 0.6, 0.6, PAL.bannerRed, PAL.yellow, FONT.brush));
  for (const x of [-0.6, 0.6]) G('interact', box(0.22, 1.0, 0.5, x, 0, 0), PAL.metalRail, 238);
  G('interact', box(1.0, 0.06, 0.06, 0, 0.85, 0), PAL.yellow, 239, null, undefined, 'dyn:arms');
  G('interact', box(1.0, 0.06, 0.06, 0, 0.5, 0), PAL.yellow, 239, null, undefined, 'dyn:arms');
  const scr = c.T.art('gate_screen', 72, 96, (g, w, h) => {
    g.fillStyle = PAL.glassDark; g.fillRect(0, 0, w, h);
    g.strokeStyle = PAL.neonTeal; g.lineWidth = 2; g.beginPath(); g.ellipse(w / 2, h * 0.36, 16, 20, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PAL.neonTeal; g.font = `700 8px ${FONT.sign}`; g.textAlign = 'center'; g.fillText(t('sign.gate_screen'), w / 2, h * 0.72);
    g.font = `400 5px ${FONT.sign}`; g.fillText(t('sign.gate_screen_sub'), w / 2, h * 0.86);
  });
  const T = onP(c, add(fl(ESTATE.frontR + 0.35, gl), dirAt(fl(ESTATE.frontR, gl), 90), -gw / 2 + 0.1), 0, 180);
  T('interact', box(0.4, 1.45, 0.25, 0, 0, 0), PAL.charcoal, 238);
  T('win', quad(0.32, 0.42, 0, 1.2, 0.13, 'z'), '#ffffff', 237, scr, undefined, winTag('neon'));
  const Bo = onRect(c, guardBoothRect());
  Bo('solid', box(1.8, 2.4, 1.8, 0, 0, 0), PAL.plasterWhite, 47);
  Bo('solid', box(2.1, 0.2, 2.1, 0, 2.4, 0), PAL.steelGreen, 48);
  c.B.add('win', quad(1.2, 0.8, 0, 1.45, 0.92, 'z'), placeMatrix('planet', { ...ch(guardBoothRect().c), h: 0 }, 180), PAL.glassDark, 80, { uv: c.T.pane(0), label: 'window' }, winTag('shop'));
  // yard dressing: laundry lines between the blocks, bikes, planters
  for (const [r, h] of [[19, 4.3], [23.5, 3.8], [26, 7.2]] as const) {
    const a = b2Point(r, 3.1), b = b1Point(r, ESTATE.b1.w / 2 + 0.05);
    cable(c, a, h, b, h, 0.06, 0.015);
    for (let k = 0; k < 5; k++) {
      const q = lerp2(a, b, 0.12 + k * 0.17), hh = rng.range(0.45, 0.85);
      onP(c, q, h - 0.1 - hh, headingOf(q, sub(b, a)))('detail', box(0.02, hh, 0.45, 0, 0, 0), rng.pick([PAL.skyBlue, PAL.clothWhite, PAL.tilePink, PAL.yellow, PAL.orange]), SID.laundry + (k % 2), null, 'laundry');
    }
  }
  for (const [r, lon] of [[25, 136], [25.4, 137.2], [18.5, 150]] as const) {
    const M = onP(c, fl(r, lon), 0, 90 + rng.range(-20, 20));
    M('detail', box(0.06, 0.6, 1.6, 0, 0.3, 0), PAL.steelGreen, 185, null, 'bike');
    M('detail', cylAx(0.33, 0, 0.33, -0.55), PAL.charcoal, 184, null, 'bike');
    M('detail', cylAx(0.33, 0, 0.33, 0.55), PAL.charcoal, 184, null, 'bike');
  }
}
function cylAx(r: number, x: number, y: number, z: number): BufferGeometry { const g = cyl(r, r, 0.05, 8); g.rotateZ(Math.PI / 2); g.translate(x, y - 0.025, z); return g; }
function b2PointFront(): number { const p = b2Point(ESTATE.frontR, -3.1); return ((Math.atan2(p.x, p.z) * 180) / Math.PI + 360) % 360; }
function b1PointFront(): number { const p = b1Point(ESTATE.frontR, -3.6); return ((Math.atan2(p.x, p.z) * 180) / Math.PI + 360) % 360; }
function b2Point(r: number, off: number): P2 { const base = fl(r, ESTATE.b2.lon); return add(base, dirAt(fl(21, ESTATE.b2.lon), 90), off); }

/** 外廊式老公房: units behind, an open gallery on the front (+Z) side with thin slabs, see-through rails, doors. */
function galleryBlock(c: BuildCtx, rc: Rect, floors: number, gal: number, isB1: boolean, rng: ReturnType<typeof createRng>, core: Core, out: PlacesOut): void {
  const A = onRect(c, rc);
  const M = placeMatrix('planet', { ...ch(rc.c), h: 0 }, rc.hdg);
  const L = rc.hw * 2, W = rc.hd * 2, H = floors * 3;
  const zDoor = rc.hd - gal;                      // door wall
  const unitD = W - gal;
  const wall = isB1 ? PAL.tilePink : PAL.tileWhite;
  A('solid', box(L, H + 0.4, unitD, 0, -0.4, -gal / 2), wall, isB1 ? 24 : 25, null, 'qilou');
  // walkable roof (B1: sp_roof, h 18): slab + a parapet ring, not a solid block
  A('solid', box(L + 0.3, 0.14, W + 0.3, 0, H - 0.12, 0), PAL.sidewalk, 55);
  for (const sx of [-1, 1]) A('solid', box(0.18, 0.95, W + 0.3, sx * (L / 2 + 0.06), H, 0), PAL.concrete, 54);
  for (const sz of [-1, 1]) A('solid', box(L + 0.3, 0.95, 0.18, 0, H, sz * (W / 2 + 0.06)), PAL.concrete, 54);
  // gallery slabs (thin) + edge beams + columns + see-through railings (GDD P5: not occluders)
  const colN = Math.round(L / 3.1) + 1;
  for (let f = 1; f <= floors; f++) {
    const y = f * 3;
    // L8: the slab stops at the edge beam's back face: it used to share the beam's top and front planes (ids 56 / 57),
    // which z-fought into a band of ink ticks along every gallery edge
    A('solid', box(L, 0.14, gal - 0.12, 0, y - 0.14, zDoor + (gal - 0.12) / 2), PAL.clothWhite, 56);
    A('solid', box(L, 0.22, 0.12, 0, y - 0.22, rc.hd - 0.06), PAL.plasterWhite, 57);
    if (f < floors + 1) {
      A('detail', box(L, 0.06, 0.06, 0, y + 0.95, rc.hd - 0.06), PAL.metalRail, 58);
      A('detail', box(L, 0.05, 0.05, 0, y + 0.5, rc.hd - 0.06), PAL.metalRail, 58);
      for (let i = 0; i <= Math.round(L / 0.8); i++) A('detail', box(0.035, 0.95, 0.035, -L / 2 + (L * i) / Math.round(L / 0.8), y, rc.hd - 0.06), PAL.metalRail, 58);
    }
  }
  for (let i = 0; i < colN; i++) A('solid', box(0.3, H, 0.3, -L / 2 + 0.15 + ((L - 0.3) * i) / (colN - 1), 0, rc.hd - 0.15), PAL.plasterWhite, 59);
  // units: doors, 福, plates, kitchen windows on the gallery wall; windows, AC, cages on the back wall
  const uxs = isB1 ? ESTATE.doorsR.map((r) => r - (ESTATE.b1.r0 + ESTATE.b1.r1) / 2) : [-4.5, -1.5, 1.5, 4.5];
  // local +X runs outward (increasing r) at heading 270 (B1); B2 faces 90 so +X runs inward
  const xs = isB1 ? uxs : uxs.map((x) => -x);
  const FU: Record<string, number> = { '201': 0, '202': 3, '203': 0, '204': 1, '301': 0, '302': 0, '303': 1, '304': 3, '401': 0, '402': 0, '403': 2, '404': 0 };
  for (let f = 0; f < floors; f++) {
    for (let u = 0; u < 4; u++) {
      const x = xs[u], y = f * 3;
      const no = `${f + 1}0${u + 1}`;
      const doorCol = rng.pick([PAL.ochre, PAL.steelGreen, PAL.teal, PAL.rust, PAL.signSlate]);
      A('solid', quad(0.95, 2.05, x, y + 1.03, zDoor + 0.02, 'z'), '#ffffff', 114, c.T.panel(`d${doorCol}`, doorCol, 'door'));
      A('solid', quad(0.3, 0.14, x + 0.72, y + 2.2, zDoor + 0.025, 'z'), '#ffffff', 113, c.T.plate(no, PAL.blue));
      if (f >= 4) {
        // 5–6F moved out: seals + 拆 (GDD P5)
        A('solid', boxRot(1.1, 0.12, 0.01, x, y + 1.2, zDoor + 0.04, 0, 0, 0.6), PAL.spiritPaper, 112);
        A('solid', boxRot(1.1, 0.12, 0.01, x, y + 1.2, zDoor + 0.045, 0, 0, -0.6), PAL.spiritPaper, 112);
        if (isB1 && (u === 1 || u === 3)) A('solid', quad(0.55, 0.55, x, y + 1.55, zDoor + 0.05, 'z'), '#ffffff', 242, c.T.mark(false), undefined, `dyn:mark:b1_${no}`);
      } else {
        const state = isB1 ? FU[no] ?? 0 : 0;
        A('solid', quad(0.52, 0.52, x, y + 1.5, zDoor + 0.04, 'z'), '#ffffff', 111, c.T.fu(state), 'fu');
      }
      c.B.add('win', quad(0.9, 0.9, x + 1.25 * (u === 3 ? -1 : 1), y + 1.65, zDoor + 0.03, 'z'), M, PAL.glassDark, 80, { uv: c.T.pane(rng.int(1, 3)), label: 'window' }, winTag('home'));
      // back windows (two per unit) + AC + cages
      for (const dx of [-0.8, 0.8]) {
        c.B.add('win', quad(1.0, 1.25, x + dx, y + 1.6, -rc.hd - 0.03, '-z'), M, PAL.glassDark, 80, { uv: c.T.pane(rng.int(0, 3)), label: 'window' }, winTag('home'));
        A('solid', quad(1.2, 1.45, x + dx, y + 1.6, -rc.hd - 0.015, '-z'), PAL.clothWhite, 72);
      }
      if (rng.next() < 0.5) {
        A('detail', box(0.78, 0.52, 0.32, x, y + 0.55, -rc.hd - 0.16), PAL.metalRail, 96, null, 'ac_unit');
        A('detail', quad(0.74, 0.48, x, y + 0.81, -rc.hd - 0.325, '-z'), '#ffffff', 97, c.T.ac(), 'ac_unit');
      }
      if (rng.next() < 0.35 && f > 0) {
        A('detail', box(2.4, 0.06, 0.55, x, y + 0.72, -rc.hd - 0.28), PAL.metalRail, 112);
        A('detail', box(2.4, 1.2, 0.04, x, y + 0.78, -rc.hd - 0.55), PAL.metalRail, 112);
        A('detail', blob(0.25, x - 0.6, y + 1.05, -rc.hd - 0.3, rng, 0.2, 0), PAL.foliage, 110);
      }
    }
    // end-wall windows (front end faces the road for B1)
    for (const s of [-1, 1]) c.B.add('win', quad(1.0, 1.2, s * (L / 2 + 0.03), f * 3 + 1.6, -gal / 2, s > 0 ? 'x' : '-x'), M, PAL.glassDark, 80, { uv: c.T.pane(1), label: 'window' }, winTag('home'));
  }
  // block number on the road end
  const endX = isB1 ? L / 2 + 0.04 : -L / 2 - 0.04;
  A('solid', quad(1.4, 0.7, endX, H - 1.1, -gal / 2, isB1 ? 'x' : '-x'), '#ffffff', 98, c.T.sign(isB1 ? 'sign.estate_b1' : 'sign.estate_b2', 1.4, 0.7, PAL.bannerRed, PAL.clothWhite, FONT.display));
  if (!isB1) return;
  // milk-box wall on the ground-floor gallery wall near the road end (GDD P5, sp_milkbox)
  const mx = ESTATE.milkbox.r - (ESTATE.b1.r0 + ESTATE.b1.r1) / 2;
  A('interact', box(1.3, 1.85, 0.2, mx, ESTATE.milkbox.h0, zDoor + 0.1), PAL.metalRail, 232, null, 'boxes');
  A('interact', quad(1.2, 1.78, mx, ESTATE.milkbox.h0 + 0.93, zDoor + 0.205, 'z'), '#ffffff', 233, c.T.milkbox(), 'boxes');
  // fire ladder cage at the tail (GDD P5: 消防梯 + padlocked door 「天台 · 王」)
  const fr = fireLadderRect();
  const Fx = (ESTATE.b1.r0 + 0.45) - (ESTATE.b1.r0 + ESTATE.b1.r1) / 2;
  const fz = ESTATE.b1.w / 2 - 0.6;
  for (const dx of [-0.35, 0.35]) A('solid', box(0.06, H + 1.1, 0.06, Fx + dx, 0, fz + 0.1), PAL.charcoal, 60);
  for (let y = 0.3; y < H + 1; y += 0.4) A('detail', box(0.7, 0.04, 0.04, Fx, y, fz + 0.1), PAL.charcoal, 60);
  for (let y = 2.4; y < H + 1; y += 1.2) A('detail', box(0.9, 0.05, 0.9, Fx, y, fz), PAL.charcoal, 61);
  A('interact', box(0.9, 2.1, 0.06, Fx, 0, fz + 0.52), PAL.charcoal, 234, null, undefined, 'dyn:roofdoor');
  A('interact', quad(0.34, 0.2, Fx, 1.2, fz + 0.56, 'z'), '#ffffff', 235, c.T.sign('sign.roof_lock', 0.34, 0.2, PAL.spiritPaper, PAL.bannerRed, FONT.hand), undefined, 'dyn:roofdoor');
  void fr;
  // roof: water tank, TV antenna, coop, old TV, frame ① (GDD P5, bestiary ⑤)
  const R = (p: P2, hdg: number) => onP(c, p, H, hdg);
  const tank = R(b1Point(26.2, 1.4), 0);
  tank('solid', box(2.0, 0.5, 1.4, 0, 0, 0), PAL.concrete, 100);
  tank('solid', cyl(0.8, 0.8, 1.5, 10, 0, 0.5, 0), PAL.clothWhite, 101, null, 'water_tank');
  tank('detail', bar(v3(0.8, 0.5, 0), v3(0.8, 2.3, 0.3), 0.05), PAL.metalRail, 102);
  const ant = R(b1Point(24.5, -2.2), 0);
  ant('detail', box(0.06, 3.2, 0.06, 0, 0, 0), PAL.metalRail, 103, null, 'antenna');
  for (const [y, w] of [[2.2, 1.6], [2.6, 1.2], [3.0, 0.8]] as const) ant('detail', box(w, 0.04, 0.04, 0, y, 0), PAL.metalRail, 103, null, 'antenna');
  const cr = coopRect();
  const coop = R(cr.c, 180);
  // hollow coop (the pk_coop head view looks inside): floor on legs, back/sides, roof, a wire front with the small
  // door, and 4 pigeons on a glowing negative (dyn:pigeons, gone after the flash photo)
  for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) coop('solid', box(0.07, 0.3, 0.07, x, 0, z), PAL.trunk, 104);
  coop('interact', box(2.0, 0.06, 1.4, 0, 0.3, 0), PAL.trunk, 235);
  coop('interact', box(2.0, 1.1, 0.05, 0, 0.36, -0.68), PAL.trunk, 236);
  for (const sx of [-1, 1]) coop('interact', box(0.05, 1.1, 1.4, sx * 0.98, 0.36, 0), PAL.trunk, 236);
  coop('interact', gableRoof(2.0, 1.4, 0.5, 1.46, 0.15), PAL.roofMauve, 237);
  for (const y of [0.36, 1.42]) coop('interact', box(2.0, 0.06, 0.06, 0, y, 0.68), PAL.trunk, 238);
  for (const x of [-0.98, -0.2, 0.25, 0.65, 0.98]) coop('interact', box(0.05, 1.1, 0.05, x, 0.36, 0.68), PAL.trunk, 238);
  const wire = c.T.art('coopwire', 64, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#6f675e'; g.lineWidth = 2;
    g.beginPath(); for (let x = 1; x <= w; x += 6) { g.moveTo(x, 0); g.lineTo(x, h); } for (let y = 1; y <= h; y += 6) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
  });
  coop('sign', quad(1.15, 1.0, -0.6, 0.9, 0.69, 'z'), '#ffffff', 239, wire);
  coop('sign', quad(0.3, 1.0, 0.82, 0.9, 0.69, 'z'), '#ffffff', 239, wire);
  const neg = c.T.panel('negative', PAL.ochre, 'grid');
  coop('win', quad(0.6, 0.45, 0, 0.37, -0.1, 'y'), '#ffffff', 240, neg, undefined, 'dyn:pigeons');
  const prng = createRng(0x9e0);
  for (let i = 0; i < 4; i++) {
    const x = -0.24 + (i % 2) * 0.46, z = -0.25 + Math.floor(i / 2) * 0.3;
    coop('detail', blob(0.13, x, 0.5, z - 0.1, prng, 0.1, 1, 0.8), i === 2 ? PAL.clothWhite : PAL.metalRail, 241, null, undefined, 'dyn:pigeons');
    coop('detail', blob(0.07, x, 0.66, z + 0.02, prng, 0.1, 0), PAL.metalRail, 242, null, undefined, 'dyn:pigeons');
  }
  coop('detail', box(2.2, 0.08, 0.6, 0, 1.2, -1.0), PAL.trunk, 104);
  const tv = R(b1Point(22.5, -1.0), 0);
  tv('solid', box(0.9, 0.4, 0.6, 0, 0, 0), PAL.ochre, 105, null, 'boxes');
  tv('solid', box(0.62, 0.5, 0.5, 0, 0.4, 0), PAL.charcoal, 106);
  tv('solid', quad(0.44, 0.34, 0, 0.66, 0.255, 'z'), PAL.glassDark, 107);
  // chairs / pots / laundry on the roof
  const pots = R(b1Point(19.8, 2.2), 0);
  for (let i = 0; i < 4; i++) { pots('detail', cyl(0.22, 0.16, 0.35, 6, i * 0.6 - 0.9, 0, 0), PAL.roofMauve, 108); pots('detail', blob(0.3, i * 0.6 - 0.9, 0.55, 0, rng, 0.25, 0), PAL.foliage, 109, null, 'plant'); }
  cable(c, b1Point(24, 2.9), H + 1.8, b1Point(27.5, 2.9), H + 1.8, 0.04, 0.015);
  // frame ① lying on the roof after the pigeons (dyn:frame1), 1 m in front of sp_roof
  const fd = R(fl(20, 160.5), 0);
  fd('interact', box(0.36, 0.02, 0.26, 0, 0.02, 0), PAL.charcoal, 239, null, undefined, 'dyn:frame1');
  fd('interact', quad(0.3, 0.2, 0, 0.045, 0, 'y'), '#ffffff', 239, c.T.panel('negative', PAL.ochre, 'grid'), undefined, 'dyn:frame1');
  // the TV "still on" in the GHOST layer (bestiary ⑤): only the night viewfinder sees it
  out.dyn.objects.tv = ghostTv(core);
}

function ghostTv(core: Core): Object3D {
  const { canvas, ctx: g } = makeCanvas(64, 48);
  g.fillStyle = '#9fe8ff'; g.fillRect(0, 0, 64, 48);
  g.fillStyle = '#c8433a'; g.fillRect(0, 30, 64, 18);
  g.fillStyle = '#ffd24a'; g.font = `700 10px ${FONT.hud}`; g.textAlign = 'center'; g.fillText('1997', 32, 42);
  g.fillStyle = '#f3f6ea'; for (let i = 0; i < 5; i++) g.fillRect(10 + i * 10, 12, 5, 12);
  const tex = new CanvasTexture(canvas); tex.colorSpace = SRGBColorSpace;
  const geo = paint(quad(0.44, 0.34, 0, 0, 0, 'z'), '#ffffff', 244);
  const m = new Mesh(geo, makeToonMaterial({ vertexColors: true, map: tex, unlit: true, surfaceId: 244, spiritImmune: true }));
  m.name = 'world:ghost_tv';
  m.layers.set(2);
  const p = b1Point(22.5, -1.0);
  placeAt(m, 'planet', { ...ch(p), h: ESTATE.b1.floors * 3 + 0.66 }, 0);
  m.translateZ(0.262);
  m.userData.hideInPast = true;
  core.scenes.get('planet').add(m);
  core.scenes.registerCullable(m, { radius: 0.5, height: 20, detail: true });
  return m;
}
