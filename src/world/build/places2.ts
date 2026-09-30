// src/world/build/places2.ts — owner B. GDD §5.3 locations 7–9 + gates: 土地庙 (shrine, idol with its face, burner,
// donation box, lions, lanterns), 菜市场 + fish tank, 纸扎铺, the metro site (hoarding, scaffold + dust net, P8 lamp,
// rubble, pipes, site office), 零号线 entrance, park kiosk, B1 roadwork / B2 tide, tripod, 拆 marks, warehouse.
import {
  CanvasTexture, Group, Mesh, PlaneGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Object3D,
} from 'three';
import { PAL } from '../../art/palette';
import type { Core } from '../../contracts';
import { mergePainted, paint } from '../../core/geom';
import { makeCanvas } from '../../core/canvas';
import { SURFACES, chartToWorld, frameAt, placeAt, placeMatrix, worldToFlat } from '../../core/planet';
import { createRng } from '../../core/rng';
import { FONT } from '../../core/fonts';
import { t } from '../../data/zh';
import { makeToonMaterial } from '../../render/index';
import { add, ch, degFor, dirAt, fl, headingOf, lerp2, sub, type P2 } from '../geo';
import {
  B1_GATE, B2_GATE, SITE, SUBWAY, TEMPLE, TILE, headingToward,
} from '../layout';
import { MARKET, MARKET_STALLS, PAPER, RUBBLE, kioskRect, shrineRect, warehouseRect } from '../colliders';
import { setUv } from '../kit/batch';
import { winTag, type BuildCtx } from '../kit/building';
import { bar, blob, box, boxRot, cyl, hipRoof, quad, sphere as sphereG, v3 } from '../kit/prims';
import { cable } from '../kit/props';
import type { P8Result } from '../p8';
import type { PlacesOut } from './places';
import { onP, onRect } from './places';
import { buildTrail } from '../trail';
import { LION_HEAD_H } from '../vp';

export function buildPlaces2(c: BuildCtx, core: Core, p8: P8Result, out: PlacesOut): void {
  temple(c, core, out);
  market(c, core, out);
  paperShop(c);
  site(c, p8, out);
  subway(c);
  park(c);
  gates(c);
  warehouse(c);
  tripod(c, core, out);
  marks(c);
  buildTrail(core, out);
}

// ------------------------------------------------------------------ 山顶土地庙 (GDD §5.3 #7, P4)
function temple(c: BuildCtx, core: Core, out: PlacesOut): void {
  const rc = shrineRect();
  const A = onRect(c, rc, 4);
  const W = rc.hw * 2, D = rc.hd * 2, zF = rc.hd;
  // red walls (back + sides + front piers around a 1.6 m doorway), plinth, hip roof with upturned corners
  A('solid', box(W + 0.3, 0.3, D + 0.3, 0, -0.2, 0), PAL.concrete, 145);
  A('solid', box(W, 2.6, 0.25, 0, 0, -zF + 0.12), PAL.bannerRed, 146);
  for (const s of [-1, 1]) A('solid', box(0.25, 2.6, D, s * (W / 2 - 0.12), 0, 0), PAL.bannerRed, 146);
  for (const s of [-1, 1]) A('solid', box(0.55, 2.6, 0.25, s * (W / 2 - 0.4), 0, zF - 0.12), PAL.bannerRed, 146);
  A('solid', box(W, 0.55, 0.25, 0, 2.05, zF - 0.12), PAL.bannerRed, 146);
  A('solid', hipRoof(W, D, 1.25, 2.6, 0.45, 0.35), PAL.roofMauve, 147);
  A('solid', box(W * 0.62, 0.18, 0.2, 0, 3.8, 0), PAL.charcoal, 148);
  // plaque 「土地庙」 and couplets (GDD: 红墙小庙)
  A('solid', quad(1.2, 0.42, 0, 2.3, zF + 0.01, 'z'), '#ffffff', 149, c.T.sign('sign.temple', 1.2, 0.42, PAL.charcoal, PAL.yellow, FONT.brush));
  for (const s of [-1, 1]) A('solid', quad(0.3, 1.7, s * (W / 2 - 0.4), 1.2, zF + 0.01, 'z'), '#ffffff', 150, c.T.vsign(s < 0 ? 'sign.couplet_r' : 'sign.couplet_l', 0.3, 1.7, PAL.bannerRed, PAL.inkDeep, FONT.brush));
  // altar + the idol (its face develops back after P4: faceFade, GDD P4)
  const idol = onP(c, fl(TEMPLE.idol.r, TEMPLE.idol.lon), 4, 180);
  idol('solid', box(1.3, 0.9, 0.7, 0, 0, -0.1), PAL.rust, 151);
  idol('solid', box(0.62, 0.55, 0.45, 0, 0.9, -0.15), PAL.trunk, 152);            // seated body
  idol('solid', box(0.72, 0.18, 0.5, 0, 0.9, -0.1), PAL.trunk, 153);
  idol('solid', blob(0.24, 0, 1.62, -0.12, createRng(5), 0.05, 1, 1.05), PAL.trunk, 154, null, 'incense');
  idol('solid', box(0.5, 0.12, 0.3, 0, 1.85, -0.12), PAL.charcoal, 155);           // cap
  idol('solid', quad(0.9, 0.35, 0, 2.2, -0.3, 'z'), '#ffffff', 156, c.T.sign('sign.temple_top', 0.9, 0.35, PAL.bannerRed, PAL.yellow, FONT.brush));
  out.dyn.idol = idolFace(core);
  // burner with incense sticks (label incense)
  const Bn = onP(c, fl(TEMPLE.burner.r, TEMPLE.burner.lon), 4, 180);
  Bn('solid', cyl(0.36, 0.3, 0.55, 10, 0, 0.25, 0), PAL.ochre, 157, null, 'incense');
  for (const [x, z] of [[0.22, 0.1], [-0.2, 0.12], [0, -0.22]]) Bn('solid', box(0.07, 0.3, 0.07, x, 0, z), PAL.charcoal, 158);
  Bn('solid', cyl(0.3, 0.3, 0.05, 10, 0, 0.78, 0), PAL.ash, 159, null, 'incense');
  for (let i = 0; i < 5; i++) Bn('detail', box(0.02, 0.4, 0.02, -0.12 + i * 0.06, 0.8, 0), PAL.bannerRed, 160, null, 'incense');
  // donation box + QR 「扫码随喜」 (GDD P4, T_temple_qr)
  const Db = onP(c, fl(TEMPLE.donation.r, TEMPLE.donation.lon), 4, 180);
  Db('interact', box(0.62, 0.55, 0.62, 0, 0, 0), PAL.bannerRed, 232, null, undefined);
  Db('interact', box(0.66, 0.06, 0.66, 0, 0.55, 0), PAL.ochre, 233);
  Db('interact', quad(0.2, 0.2, 0, 0.42, 0.315, 'z'), '#ffffff', 234, c.T.qrCode('temple'));
  Db('interact', quad(0.46, 0.14, 0, 0.16, 0.315, 'z'), '#ffffff', 235, c.T.sign('sign.donation', 0.46, 0.14, PAL.yellow, PAL.bannerRed, FONT.sign));
  // lions (GDD: 左 / 右 石狮; the left one turns seaward at night — bestiary ④)
  for (const [key, L] of [['L', TEMPLE.lionL], ['R', TEMPLE.lionR]] as const) {
    const Ln = onP(c, fl(L.r, L.lon), 4, 180);
    Ln('solid', box(0.7, 0.35, 1.0, 0, 0, 0), PAL.concrete, 161);
    Ln('solid', blob(0.34, 0, 0.62, -0.12, createRng(key === 'L' ? 1 : 2), 0.12, 1, 1.1), PAL.sidewalk, 162, null, 'lion');
    Ln('solid', box(0.18, 0.32, 0.18, -0.16, 0.35, 0.3), PAL.sidewalk, 163, null, 'lion');
    Ln('solid', box(0.18, 0.32, 0.18, 0.16, 0.35, 0.3), PAL.sidewalk, 163, null, 'lion');
    if (key === 'R') { Ln('solid', lionHeadGeo(), PAL.sidewalk, 164, null, 'lion'); }
  }
  out.dyn.objects.lionHead = lionHead(core);
  // lantern string (night) from the shrine eave to the banyan
  const a = add(rc.c, dirAt(rc.c, 180), zF + 0.3), b = fl(TEMPLE.banyan.r + 1.8, TEMPLE.banyan.lon - 30);
  const a2 = add(rc.c, dirAt(rc.c, 180), zF + 0.3);
  cable(c, add(a, dirAt(rc.c, 90), -1.6), 7.0, add(a2, dirAt(rc.c, 90), 1.6), 7.0, 0.05, 0.015);
  for (let i = 0; i < 5; i++) {
    const q = lerp2(add(a, dirAt(rc.c, 90), -1.5), add(a2, dirAt(rc.c, 90), 1.5), (i + 0.5) / 5);
    const La = onP(c, q, 6.25 - Math.sin(((i + 0.5) / 5) * Math.PI) * 0.12, 0);
    // GDD §5.3 #7 「夜里挂一串红灯笼」: shown (lit) only at night via the dyn:lanterns tag (phaseState)
    La('win', blob(0.2, 0, 0.2, 0, createRng(i), 0.04, 1, 1.15), PAL.neonRed, 240, null, undefined, 'dyn:lanterns');
    La('detail', box(0.3, 0.05, 0.3, 0, 0.45, 0), PAL.yellow, 176, null, undefined, 'dyn:lanterns');
  }
  void b;
}

function lionHeadGeo(): BufferGeometry { const g = blob(0.24, 0, 0, 0, createRng(9), 0.12, 1, 1); g.translate(0, LION_HEAD_H - 4, 0.12); return g; }
function lionHead(core: Core): Object3D {
  const geo = lionHeadGeo();
  paint(geo, PAL.sidewalk, 164); setUv(geo, null);
  const mane = blob(0.3, 0, LION_HEAD_H - 4 - 0.05, -0.02, createRng(11), 0.18, 0, 0.9);
  paint(mane, PAL.concrete, 165); setUv(mane, null);
  const eye = paint(box(0.05, 0.05, 0.02, 0, LION_HEAD_H - 4 + 0.04, 0.33), PAL.inkDeep, 166); setUv(eye, null);
  const head = new Mesh(mergePainted([geo, mane, eye]), makeToonMaterial({ vertexColors: true }));
  head.castShadow = true;
  placeAt(head, 'planet', { r: TEMPLE.lionL.r, lon: TEMPLE.lionL.lon, h: 4 }, 180);
  head.name = 'world:lion_left_head';
  core.scenes.get('planet').add(head);
  core.scenes.registerCullable(head, { radius: 0.6, height: 5.5, detail: true });
  return head;
}

/** The idol's face canvas: blank (smoked flat) → developed (GDD P4 faceFade 0 → 1 over 1.5 s). */
function idolFace(core: Core): { setFace(k: number): void } {
  const { canvas, ctx: g } = makeCanvas(64, 64);
  const tex = new CanvasTexture(canvas); tex.colorSpace = SRGBColorSpace;
  const draw = (k: number) => {
    g.fillStyle = '#6f5f52'; g.fillRect(0, 0, 64, 64);
    const steps = Math.round(k * 5) / 5;              // posterised fade (no transparency in the main pass)
    if (steps > 0) {
      g.globalAlpha = steps;
      g.fillStyle = PAL.skin; g.beginPath(); g.ellipse(32, 34, 22, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.inkDeep; g.lineWidth = 3; g.strokeStyle = PAL.inkDeep;
      g.beginPath(); g.moveTo(18, 27); g.quadraticCurveTo(24, 22, 29, 27); g.moveTo(35, 27); g.quadraticCurveTo(40, 22, 46, 27); g.stroke();
      g.beginPath(); g.moveTo(22, 44); g.quadraticCurveTo(32, 52, 42, 44); g.stroke();
      g.fillStyle = PAL.clothWhite; g.beginPath(); g.moveTo(16, 48); g.quadraticCurveTo(32, 76, 48, 48); g.quadraticCurveTo(32, 58, 16, 48); g.fill();
      g.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  };
  draw(0);
  const geo = paint(new PlaneGeometry(0.34, 0.36), '#ffffff', 167);
  const face = new Mesh(geo, makeToonMaterial({ vertexColors: true, map: tex, surfaceId: 167 }));
  face.name = 'world:idol_face';
  placeAt(face, 'planet', { r: TEMPLE.idol.r, lon: TEMPLE.idol.lon, h: 4 + 1.62 }, 180);
  face.translateZ(0.12);
  core.scenes.get('planet').add(face);
  core.scenes.registerCullable(face, { radius: 0.4, height: 6, detail: true });
  let last = -1;
  return { setFace(k) { const q = Math.round(k * 5); if (q !== last) { last = q; draw(k); } } };
}

// ------------------------------------------------------------------ 望潮菜市场 (GDD §5.3 #8)
function market(c: BuildCtx, core: Core, out: PlacesOut): void {
  const rng = createRng(0x3a4e);
  const M0 = MARKET;
  for (const lon of M0.colsLon) for (const r of [M0.r0 + 0.3, 45, M0.r1 - 0.3]) onP(c, fl(r, lon), 0, 0)('solid', box(0.2, 4.2, 0.2, 0, 0, 0), PAL.steelGreen, 168);
  // corrugated roof in 5° segments, slightly pitched toward the road
  for (let lon = M0.lon0; lon < M0.lon1 - 0.01; lon += 2.55) {
    const A = onP(c, fl((M0.r0 + M0.r1) / 2, lon + 1.275), 0, 0);
    A('solid', boxRot(degLen((M0.r0 + M0.r1) / 2, 2.6) + 0.1, 0.12, M0.r1 - M0.r0 + 1.2, 0, 4.45, 0, 0.09), PAL.roofMauve, 169);
    A('detail', boxRot(degLen((M0.r0 + M0.r1) / 2, 2.6) + 0.1, 0.02, M0.r1 - M0.r0 + 1.2, 0, 4.53, 0, 0.09), PAL.concrete, 170);
  }
  // back wall + fascia sign
  for (let lon = M0.lon0; lon < M0.lon1 - 0.01; lon += 2.55) onP(c, fl(M0.r1, lon + 1.275), 0, 0)('solid', box(degLen(M0.r1, 2.6) + 0.05, 3.6, 0.2, 0, 0, 0), PAL.concrete, 171);
  const S = onP(c, fl(M0.r0 - 0.6, 207.5), 0, 0);
  S('solid', box(6.2, 0.9, 0.15, 0, 3.75, 0), PAL.steelGreen, 172);
  S('solid', quad(6.0, 0.8, 0, 4.2, 0.08, 'z'), '#ffffff', 173, c.T.sign('sign.market', 6, 0.8, PAL.steelGreen, PAL.clothWhite, FONT.display));
  // stalls: tables, crates of veg / fish, hanging preserved meat, umbrellas, scales; some already cleared
  const goods = [PAL.foliage, PAL.orange, PAL.yellow, PAL.bannerRed, PAL.clothWhite, PAL.grass];
  for (const [r, lon, hw, hd] of MARKET_STALLS) {
    const A = onP(c, fl(r, lon), 0, 0);
    A('solid', box(hw * 2, 0.8, hd * 2, 0, 0, 0), PAL.clothWhite, 174);
    for (let k = 0; k < Math.round(hw * 2 / 0.6); k++) {
      if (rng.next() < 0.3) continue;
      A('detail', box(0.5, 0.18, 0.4, -hw + 0.3 + k * 0.6, 0.8, rng.range(-0.08, 0.08)), rng.pick([PAL.skyBlue, PAL.orange, PAL.ochre]), 175, null, 'boxes');
      A('detail', blob(0.13, -hw + 0.3 + k * 0.6, 1.05, 0, rng, 0.2, 0, 0.8), rng.pick(goods), 176);
    }
    A('detail', quad(0.4, 0.5, 0, 0.55, hd + 0.01, 'z'), '#ffffff', 177, c.T.poster(rng.pick(['sign.poster_clear', 'sign.market_veg', 'sign.market_fish']) as string, PAL.yellow));
  }
  const rack = onP(c, fl(46, 213), 0, 90);
  rack('solid', box(3, 0.06, 0.06, 0, 2.4, 0), PAL.trunk, 178);
  for (let k = 0; k < 7; k++) rack('detail', box(0.12, 0.5, 0.05, -1.3 + k * 0.42, 1.85, 0), rng.pick([PAL.rust, '#8c4a38']), 179, null, 'boxes');
  rack('solid', quad(1.0, 0.3, 0, 2.7, 0.05, 'z'), '#ffffff', 180, c.T.sign('sign.market_meat', 1, 0.3, PAL.bannerRed, PAL.clothWhite));
  const umb = onP(c, fl(42.2, 216), 0, 0);
  umb('detail', cyl(0.03, 0.03, 2.3, 5), PAL.metalRail, 181);
  umb('solid', coneG(1.3, 0.45, 2.1), PAL.bannerRed, 182);
  // fish tank at (41, 200): frame, water back panel, 6 swimming fish + the 7th that watches (bestiary ⑥)
  const tk = onP(c, fl(41.6, 200), 0, 0);
  tk('solid', box(1.8, 0.8, 0.8, 0, 0, 0), PAL.metalRail, 183);
  tk('solid', box(1.8, 0.7, 0.05, 0, 0.8, -0.35), PAL.seaShallow, 184);
  tk('solid', box(1.8, 0.04, 0.7, 0, 0.83, 0), PAL.sea, 185);
  for (const [x, z] of [[-0.9, 0.4], [0.9, 0.4], [-0.9, -0.4], [0.9, -0.4]]) tk('solid', box(0.05, 0.7, 0.05, x, 0.8, z), PAL.charcoal, 186);
  tk('solid', box(1.85, 0.05, 0.85, 0, 1.5, 0), PAL.charcoal, 186);
  tk('solid', quad(1.2, 0.26, 0, 1.75, 0.2, 'z'), '#ffffff', 187, c.T.sign('sign.market_fish', 1.2, 0.26, PAL.blue, PAL.clothWhite));
  const fish = fishTank(core);
  out.anchorObjects.fish7 = fish.seventh;
  out.dyn.objects.fish = fish.group;
  void out;
}
function degLen(r: number, deg: number): number { return (r * deg * Math.PI) / 180; }
function coneG(r: number, h: number, y: number): BufferGeometry { const g = new ConeGeo(r, h, 8, 1, true); g.translate(0, y + h / 2, 0); return g; }
import { ConeGeometry as ConeGeo } from 'three';

function fishTank(core: Core): { group: Group; seventh: Object3D } {
  const group = new Group();
  group.name = 'world:fish';
  placeAt(group, 'planet', { r: 41.6, lon: 200, h: 0 }, 0);
  const mat = makeToonMaterial({ vertexColors: true, lineWeight: 0.6 });
  const fishGeo = (hex: string) => { const g = box(0.16, 0.08, 0.05, 0, -0.04, 0); g.translate(0, 0, 0); paint(g, hex, 188); setUv(g, null); return g; };
  const rng = createRng(0xf15);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = fishGeo(rng.pick([PAL.orange, PAL.yellow, PAL.clothWhite, PAL.rustLight]));
    g.translate(rng.range(-0.5, 0.5), 1.0 + rng.range(-0.15, 0.2), rng.range(-0.2, 0.2));
    parts.push(g);
  }
  const swim = new Mesh(mergePainted(parts), mat);
  const seventh = new Mesh(fishGeo(PAL.orange), mat);
  seventh.name = 'fish7';
  seventh.position.set(0.1, 1.12, 0.26);
  seventh.rotation.y = -Math.PI / 2;                 // faces out of the tank, at the viewer
  const eye = paint(box(0.02, 0.02, 0.01, 0, -0.02, 0), PAL.inkDeep, 189); setUv(eye, null);
  const eyeM = new Mesh(eye, mat); eyeM.position.set(0.05, 0, 0.03); seventh.add(eyeM);
  group.add(swim, seventh);
  core.scenes.get('planet').add(group);
  core.scenes.registerCullable(group, { radius: 1, height: 1.5, detail: true });
  core.loop.addSystem('world:fish', 'world', () => {
    const t0 = core.clock.animT;
    swim.position.x = Math.sin(t0 * 0.45) * 0.18;
    swim.scale.x = Math.cos(t0 * 0.45) > 0 ? 1 : -1;
  });
  return { group, seventh };
}

// ------------------------------------------------------------------ 纸扎铺 (GDD §5.3 #8, P9)
function paperShop(c: BuildCtx): void {
  const rng = createRng(0x9a9e);
  const P = PAPER, rm = (P.r0 + P.r1) / 2, lm = (P.lon0 + P.lon1) / 2;
  const w = degLen(P.r1, P.lon1 - P.lon0) + 0.1, d = P.r1 - P.r0;
  const A = onP(c, fl(rm, lm), 0, 0);             // front (+Z) faces the road (north)
  A('solid', box(w, 6.4, 0.3, 0, -0.4, -d / 2), PAL.plasterBeige, 190 - 5);
  for (const s of [-1, 1]) A('solid', box(0.3, 6.4, d, s * (w / 2 - 0.15), -0.4, 0), PAL.plasterBeige, 190 - 5);
  A('solid', box(w, 3.2, d, 0, 3.0, 0), PAL.plasterBeige, 190 - 6);
  A('solid', box(w + 0.1, 0.6, d + 0.1, 0, 6.2, 0), PAL.roofMauve, 190 - 7);
  A('solid', box(w - 0.6, 0.1, d - 0.4, 0, 0.0, 0), PAL.sidewalk, 190 - 8);
  const sign = c.T.sign('sign.paper_shop', 3.4, 0.7, PAL.bannerRed, PAL.yellow, FONT.brush);
  A('solid', box(3.6, 0.85, 0.12, 0, 3.0, d / 2 + 0.06), PAL.charcoal, 190 - 9);
  A('solid', quad(3.4, 0.7, 0, 3.42, d / 2 + 0.13, 'z'), '#ffffff', 190 - 10, sign);
  c.B.add('win', quad(1.3, 1.1, -0.9, 4.6, d / 2 + 0.03, 'z'), placeMatrix('planet', { r: rm, lon: lm, h: 0 }, 0), PAL.glassDark, 80, { uv: c.T.pane(2), label: 'window' }, winTag('home'));
  // the rule on the inner back wall: 「纸人莫点睛，点睛魂上身」
  const rule = c.T.art('paper_rule', 256, 40, (g, W, H) => {
    g.fillStyle = PAL.plasterBeige; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.bannerRed; g.font = `400 26px ${FONT.brush}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t('sign.paper_rule'), W / 2, H / 2 + 1);
  });
  A('solid', quad(2.8, 0.44, 0, 2.3, -d / 2 + 0.16, 'z'), '#ffffff', 190 - 11, rule);
  // paper horse, paper villa (3 floors + pool), paper phone (1%), 3 still paper figures, hanging paper money
  const paper = PAL.spiritPaper;
  const hs = onP(c, fl(40.4, 229), 0, 270);
  hs('solid', box(0.28, 0.35, 0.9, 0, 0.5, 0), paper, 190 - 12, null, 'paper_horse');
  for (const [x, z] of [[-0.1, 0.35], [0.1, 0.35], [-0.1, -0.35], [0.1, -0.35]]) hs('solid', box(0.06, 0.5, 0.06, x, 0, z), paper, 190 - 12, null, 'paper_horse');
  hs('solid', boxRot(0.2, 0.45, 0.22, 0, 1.0, 0.48, 0.5), paper, 190 - 12, null, 'paper_horse');
  hs('detail', box(0.3, 0.05, 0.5, 0, 0.87, 0), PAL.bannerRed, 190 - 13, null, 'paper_horse');
  const vl = onP(c, fl(44.2, 224.2), 0, 0);
  vl('solid', box(0.8, 0.5, 0.7, 0, 0, 0), paper, 190 - 14, null, 'paper_villa');
  vl('solid', box(0.7, 0.4, 0.6, 0, 0.5, 0), PAL.tilePink, 190 - 15, null, 'paper_villa');
  vl('solid', box(0.6, 0.35, 0.5, 0, 0.9, 0), paper, 190 - 14, null, 'paper_villa');
  vl('solid', hipRoof(0.6, 0.5, 0.25, 1.25, 0.08, 0.06), PAL.yellow, 190 - 16, null, 'paper_villa');
  vl('solid', box(0.5, 0.04, 0.3, 0, 0.02, 0.5), PAL.skyBlue, 190 - 17, null, 'paper_villa');
  const ph = onP(c, fl(43.6, 227.6), 0, 0);
  ph('solid', box(0.45, 0.7, 0.45, 0, 0, 0), PAL.trunk, 190 - 18);
  ph('solid', boxRot(0.22, 0.4, 0.04, 0, 0.9, 0, -0.2), paper, 190 - 12, null, 'paper_phone');
  ph('solid', quad(0.18, 0.32, 0, 0.92, 0.03, 'z'), '#ffffff', 190 - 19, c.T.art('paper_phone', 32, 56, (g, W, H) => {
    g.fillStyle = PAL.glassDark; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.bannerRed; g.font = `700 12px ${FONT.hud}`; g.textAlign = 'center'; g.fillText(t('sign.paper_phone'), W / 2, H / 2 + 4);
  }), 'paper_phone');
  for (let i = 0; i < 3; i++) {
    const q = fl(44.4, 225.6 + i * 1.3);
    const f = onP(c, q, 0, 0);
    f('solid', box(0.42, 1.2, 0.03, 0, 0, 0), paper, 190 - 20 - (i % 2));
    f('solid', box(0.3, 0.3, 0.03, 0, 1.2, 0), paper, 190 - 20 - (i % 2));
    f('detail', box(0.06, 0.06, 0.01, -0.07, 1.36, 0.02), PAL.inkDeep, 190 - 22);
    f('detail', box(0.06, 0.06, 0.01, 0.07, 1.36, 0.02), PAL.inkDeep, 190 - 22);
    f('detail', box(0.08, 0.05, 0.01, -0.1, 1.28, 0.02), PAL.bannerRed, 190 - 23);
    f('detail', box(0.08, 0.05, 0.01, 0.1, 1.28, 0.02), PAL.bannerRed, 190 - 23);
  }
  for (let k = 0; k < 6; k++) A('detail', box(0.2, 0.3, 0.01, -w / 2 + 0.6 + k * 0.6, 2.2, d / 2 - 0.5), rng.pick([PAL.yellow, PAL.spiritPaper, PAL.bannerRed]), 190 - 24);
}

// ------------------------------------------------------------------ 地铁工地 (GDD §5.3 #9, P8)
function site(c: BuildCtx, p8: P8Result, out: PlacesOut): void {
  const rng = createRng(0x5173);
  const S = SITE;
  // hoarding: 3 m panels, blue with a white top band; slogans away from the chai (GDD: 蓝色围挡)
  const slogans: [number, string][] = [[243.5, 'sign.site'], [248, 'sign.site_home'], [264.5, 'sign.site_civil'], [268, 'sign.site_safety']];
  for (let lon = S.hoardLon0; lon < S.hoardLon1 - 0.01; lon += 2.5) {
    const A = onP(c, fl(S.hoardR, lon + 1.25), 0, 0);
    const w = degLen(S.hoardR, 2.5) + 0.04;
    A('solid', box(w, S.hoardH, 0.25, 0, -0.3, 0), PAL.blue, 190 - 25);
    A('solid', box(w, 0.45, 0.28, 0, S.hoardH - 0.75, 0), PAL.clothWhite, 190 - 26);
    A('solid', box(0.12, S.hoardH + 0.1, 0.34, w / 2 - 0.05, -0.3, 0), PAL.steelGreen, 190 - 27);
  }
  for (const [lon, key] of slogans) {
    const A = onP(c, fl(S.hoardR - 0.14, lon), 0, 0);
    A('solid', quad(3.0, 0.8, 0, 3.2, 0, 'z'), '#ffffff', 190 - 28, c.T.sign(key, 3, 0.8, PAL.blue, PAL.clothWhite, FONT.display));
  }
  // site gate panel
  const G = onP(c, fl(S.hoardR - 0.15, 241.3), 0, 0);
  G('solid', quad(2.0, 2.4, 0, 1.2, 0, 'z'), '#ffffff', 190 - 29, c.T.panel('sitegate', PAL.metalRail, 'vent'));
  G('solid', quad(1.6, 0.4, 0, 2.2, 0.01, 'z'), '#ffffff', 190 - 30, c.T.sign('sign.site_gate', 1.6, 0.4, PAL.yellow, PAL.inkDeep, FONT.sign));
  // side fences (corrugated iron) r 44 → 62 at lon 240 / 270
  for (const lon of [S.hoardLon0, S.hoardLon1]) {
    for (let r = S.hoardR; r < 62; r += 3) onP(c, fl(r + 1.5, lon), 0, 90)('solid', box(0.1, 2.6, 3.05, 0, -0.2, 0), PAL.metalRail, 190 - 31);
  }
  // scaffold (poles every 3.2°, tubes) + the dust net (alpha-cut, not an occluder)
  for (let lon = S.netLon0; lon <= S.netLon1 + 0.01; lon += 3.2) onP(c, fl(S.netR, lon), 0, 0)('solid', cyl(0.05, 0.05, S.netH1 + 0.4, 5), PAL.metalRail, 190 - 32);
  for (const h of [S.netH0, 4.1, S.netH1]) {
    for (let lon = S.netLon0; lon < S.netLon1 - 0.01; lon += 3.2) {
      const a = fl(S.netR, lon), b = fl(S.netR, lon + 3.2);
      c.B.add('detail', bar(chartToWorld({ ...ch(a), h }), chartToWorld({ ...ch(b), h }), 0.06), null, PAL.metalRail, 190 - 33);
    }
  }
  const netUv = c.T.art('net', 64, 64, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#3f7a5a'; g.lineWidth = 3;
    g.beginPath(); for (let x = 2; x <= W; x += 16) { g.moveTo(x, 0); g.lineTo(x, H); } for (let y = 2; y <= H; y += 16) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke();
  });
  for (let lon = S.netLon0; lon < S.netLon1 - 0.01; lon += 1.6) {
    const A = onP(c, fl(S.netR, lon + 0.8), 0, 0);
    const n = 4, hh = (S.netH1 - S.netH0) / n;          // square-ish tiles so the atlas cell keeps its aspect
    for (let k = 0; k < n; k++) {
      const g = new PlaneGeometry(degLen(S.netR, 1.6) + 0.02, hh);
      g.translate(0, S.netH0 + hh * (k + 0.5), 0);
      A('net', g, '#ffffff', 190 - 34, netUv, 'net');
    }
  }
  // P8 street lamp (pole under S, shade centred at S: GDD §9 P8 step 4)
  const foot = p8.lampFoot;
  const sH = worldToFlat(SURFACES.planet, p8.S).h;
  const L = onP(c, fl(foot.r, foot.lon), 0, 0);
  L('solid', cyl(0.06, 0.09, sH - 0.1, 7), PAL.signSlate, 190 - 35, null, 'street_lamp');
  // the shade: a closed dome centred on S (radius 0.28, GDD §9 P8 step 4) + hat; it must be solid from below
  const shade = sphereG(p8.shadeRadius, 0, sH, 0); shade.scale(1, 0.72, 1); shade.translate(0, sH * 0.28, 0);
  L('solid', shade, PAL.signSlate, 190 - 36, null, 'street_lamp');
  const hat = new ConeGeo(p8.shadeRadius * 1.25, 0.22, 10); hat.translate(0, sH + 0.24, 0);
  L('solid', hat, PAL.signSlate, 190 - 36, null, 'street_lamp');
  L('win', cyl(0.1, 0.1, 0.06, 8, 0, sH - 0.23, 0), PAL.metalRail, 190 - 37, null, 'street_lamp', winTag('lamp'));
  out.lamps.push({ p: fl(foot.r, foot.lon), h: sH - 0.1 });
  // rubble, bricks, cement pipes (xiaoliu's seat), site office containers, cones
  for (const [r, lon, rad] of RUBBLE) {
    const A = onP(c, fl(r, lon), 0, rng.range(0, 360));
    A('solid', blob(rad, 0, -rad * 0.35, 0, rng, 0.3, 0, 0.55), PAL.concrete, 190 - 38, null, 'rubble');
    for (let k = 0; k < 5; k++) A('detail', box(0.24, 0.12, 0.12, rng.range(-rad, rad), rng.range(0, rad * 0.4), rng.range(-rad, rad), rng.range(0, 3)), rng.pick([PAL.rust, PAL.rustLight, PAL.concrete]), 190 - 39, null, 'rubble');
  }
  const pp = onP(c, fl(S.pipes.r, S.pipes.lon), 0, 90);
  for (const [x, y, z] of [[0, 0, -0.55], [0, 0, 0.55], [0, 0.85, 0]] as const) {
    const g = cyl(0.45, 0.45, 2.2, 10, 0, 0, 0, true); g.rotateZ(Math.PI / 2); g.translate(x, y + 0.45 - 0.45 + 0.45, z);
    pp('solid', g, PAL.concrete, 190 - 40, null, 'pipe');
  }
  const off = onP(c, fl(58, 277), 0, 0);
  for (const y of [0, 2.6]) {
    off('solid', box(6, 2.55, 2.4, 0, y, 0), PAL.clothWhite, 190 - 41 - (y > 0 ? 1 : 0));
    off('solid', box(6.1, 0.12, 2.5, 0, y + 2.55, 0), PAL.blue, 190 - 43);
    for (const x of [-1.8, 0, 1.8]) c.B.add('win', quad(1.1, 0.9, x, y + 1.5, 1.22, 'z'), placeMatrix('planet', { r: 58, lon: 277, h: 0 }, 0), PAL.glassDark, 80, { uv: c.T.pane(3), label: 'window' }, winTag('home'));
  }
  off('solid', boxRot(0.8, 0.08, 3.4, 3.4, 1.4, 0, -0.75, Math.PI / 2), PAL.metalRail, 190 - 44);
  for (const [r, lon] of [[40, 278], [40.4, 282], [39.8, 247], [39.8, 263.5]] as const) {
    onP(c, fl(r, lon), 0, 0)('detail', cyl(0.03, 0.2, 0.7, 6), PAL.orange, 176, null, 'cone');
  }
}

// ------------------------------------------------------------------ 零号线 entrance (GDD §5.3 #9, P7)
function subway(c: BuildCtx): void {
  const lon = SUBWAY.lon, hw = SUBWAY.halfW;
  const rm = (SUBWAY.stairR1 + SUBWAY.landR1) / 2, len = SUBWAY.landR1 - SUBWAY.stairR1;
  const A = onP(c, fl(rm, lon), 0, 180);          // +Z = outward (toward the road)
  // side balustrades (dark glass) and the canopy
  for (const s of [-1, 1]) {
    A('solid', box(0.3, 1.1, len, s * (hw + 0.15), 0, 0), PAL.concrete, 190 - 45);
    c.B.add('win', quad(len - 0.4, 0.7, s * (hw + 0.31), 0.6, 0, s > 0 ? 'x' : '-x'), placeMatrix('planet', { r: rm, lon, h: 0 }, 180), PAL.glassDark, 80, { uv: c.T.pane(3) }, winTag('stair'));
    for (const z of [-len / 2 + 0.2, 0, len / 2 - 0.2]) A('solid', box(0.14, 2.9, 0.14, s * (hw + 0.15), 0, z), PAL.charcoal, 190 - 46);
  }
  A('solid', box(hw * 2 + 0.8, 0.18, len + 0.4, 0, 2.9, 0), PAL.charcoal, 190 - 47);
  A('solid', box(hw * 2 + 0.6, 0.06, len + 0.2, 0, 3.08, 0), PAL.glassGlint, 190 - 48);
  const sign = c.T.sign('sign.subway', 3.4, 0.55, PAL.charcoal, PAL.clothWhite, FONT.sign, 'sign.line0');
  const Msw = placeMatrix('planet', { r: rm, lon, h: 0 }, 180);
  c.B.add('solid', box(3.6, 0.7, 0.12, 0, 2.2, len / 2 + 0.1), Msw, PAL.charcoal, 190 - 49, { chunk: 'hp:subway:solid' });
  c.B.add('win', quad(3.4, 0.55, 0, 2.55, len / 2 + 0.17, 'z'), Msw, '#ffffff', 190 - 50, { uv: sign, chunk: 'hp:subway:win' }, winTag('neon'));
  const logo = c.T.art('line0', 48, 48, (g, W, H) => {
    g.fillStyle = PAL.charcoal; g.fillRect(0, 0, W, H);
    g.strokeStyle = PAL.bannerRed; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, H / 2, 18, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PAL.clothWhite; g.font = `700 22px ${FONT.hud}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t('sign.line0_num'), W / 2, H / 2 + 1);
  });
  A('win', quad(0.55, 0.55, -hw - 0.6, 2.6, len / 2 + 0.17, 'z'), '#ffffff', 190 - 51, logo, undefined, winTag('neon'));
  // stairs going down (the pit is visual only; entry is the fade teleport)
  const land = SUBWAY.landR1 - SUBWAY.landR0;
  const stairLen = SUBWAY.landR0 - SUBWAY.stairR1;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const z = len / 2 - land - (stairLen * (i + 0.5)) / n;
    A('solid', box(hw * 2, 0.2, stairLen / n + 0.02, 0, -(i + 1) * 0.22, z), i % 2 ? PAL.tileWhite : PAL.sidewalk, 190 - 52 - (i % 2));
  }
  A('solid', box(hw * 2 + 0.2, 3.4, 0.2, 0, -3.3, -len / 2 + 0.1), PAL.glassDark, 190 - 54);
  for (const s of [-1, 1]) A('solid', box(0.2, 3.4, stairLen, s * (hw + 0.05), -3.3, len / 2 - land - stairLen / 2), PAL.tileWhite, 190 - 55);
  c.B.add('win', box(hw * 1.6, 0.05, 0.4, 0, 2.82, 0), placeMatrix('planet', { r: rm, lon, h: 0 }, 180), PAL.metalRail, 190 - 56, {}, winTag('stair'));
  // the grille (dyn:grille — rolls up at night) with a chain
  const gz = len / 2 - (SUBWAY.landR1 - SUBWAY.grilleR);
  A('solid', quad(hw * 2, 2.6, 0, 1.3, gz, 'z'), '#ffffff', 190 - 57, c.T.panel('grille', PAL.metalRail, 'grid'), undefined, 'dyn:grille');
  A('solid', quad(hw * 2, 2.6, 0, 1.3, gz, '-z'), '#ffffff', 190 - 57, c.T.panel('grille', PAL.metalRail, 'grid'), undefined, 'dyn:grille');
  A('detail', box(0.6, 0.08, 0.06, 0.3, 1.1, gz + 0.05), PAL.charcoal, 190 - 58, null, undefined, 'dyn:grille');
}

// ------------------------------------------------------------------ park (lon 350–10): kiosk
function park(c: BuildCtx): void {
  const rc = kioskRect();
  const A = onRect(c, rc);
  A('solid', box(2.2, 2.5, 1.8, 0, 0, 0), PAL.steelGreen, 190 - 59);
  A('solid', box(2.6, 0.18, 2.3, 0, 2.5, 0.15), PAL.steelGreen, 190 - 60);
  A('solid', quad(1.6, 0.4, 0, 2.2, 0.91, 'z'), '#ffffff', 190 - 61, c.T.sign('sign.kiosk', 1.6, 0.4, PAL.clothWhite, PAL.steelGreen));
  A('solid', quad(1.8, 1.0, 0, 1.15, 0.91, 'z'), '#ffffff', 190 - 62, c.T.art('magazines', 64, 40, (g, W, H, r) => {
    g.fillStyle = PAL.glassDark; g.fillRect(0, 0, W, H);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { g.fillStyle = r.pick([PAL.bannerRed, PAL.yellow, PAL.skyBlue, PAL.clothWhite, PAL.orange]); g.fillRect(3 + x * 10, 3 + y * 12, 8, 10); }
  }));
}

// ------------------------------------------------------------------ gates B1 / B2 (GDD §5.5)
function gates(c: BuildCtx): void {
  // B1: construction fence across r 28.8 → 39.4 at lon 176, cones, a lit barrier; site iron wall r 47 → 62
  const G1 = B1_GATE;
  // P3r3 (look c): heading 0, not 90 — the 2.02 m boards are laid END TO END along r, i.e. one continuous fence across
  // the road on the collider line (radialWall at B1_GATE.lon). At heading 90 they stood as separate slabs
  // parallel to the road, 2 m apart: the signs faced the pavements, and 小刘 (sp_roadwork, 0.6 m west of the line)
  // stood hidden in the corridor between two of them — every dialogue shot from the approach side filmed a board.
  for (let r = 28.8; r < 39.4; r += 2) {
    const A = onP(c, fl(r + 1, G1.lon), 0, 0);
    A('solid', box(0.12, 1.9, 2.02, 0, 0, 0), PAL.clothWhite, 190 - 63, null, 'cone', 'dyn:b1');
    A('solid', quad(1.9, 1.4, 0.07, 1.0, 0, 'x'), '#ffffff', 190 - 64, c.T.sign('sign.roadwork', 1.9, 1.4, PAL.blue, PAL.clothWhite, FONT.display), 'cone', 'dyn:b1');
    A('solid', quad(1.9, 1.4, -0.07, 1.0, 0, '-x'), '#ffffff', 190 - 64, c.T.stripes(PAL.bannerRed, PAL.clothWhite, 8), 'cone', 'dyn:b1');
  }
  for (const r of [30.5, 33, 35.5, 38]) onP(c, fl(r, G1.lon - 1.4), 0, 0)('detail', cyl(0.03, 0.2, 0.7, 6), PAL.orange, 176, null, 'cone', 'dyn:b1');
  for (let r = 47.4; r < 62; r += 2.5) onP(c, fl(r + 1.25, G1.lon), 0, 90)('solid', box(0.1, 2.6, 2.55, 0, -0.2, 0), PAL.metalRail, 190 - 65, null, undefined, 'dyn:b1');
  // B2: the tide over the road (lon 329 → 337.4, r 29 → 48.2), water barriers and a sign (dyn:b2)
  const G2 = B2_GATE;
  const water = annulusW(29, 48.25, G2.waterLon0, G2.waterLon1, 0.09);
  c.B.add('ground', water, null, PAL.seaShallow, 8, { label: 'sea' }, 'dyn:b2');
  const foam = annulusW(29, 48.25, G2.waterLon1 - 0.25, G2.waterLon1, 0.1);
  c.B.add('ground', foam, null, PAL.foam, 9, {}, 'dyn:b2');
  for (let r = 29.4; r < 48; r += 1.6) {
    const A = onP(c, fl(r, G2.lon + 0.2), 0, 90);
    A('solid', box(0.55, 0.8, 1.45, 0, 0, 0), PAL.orange, 190 - 66, null, 'cone', 'dyn:b2');
    A('solid', box(0.57, 0.2, 1.47, 0, 0.45, 0), PAL.clothWhite, 190 - 67, null, 'cone', 'dyn:b2');
  }
  const Sg = onP(c, fl(38.6, G2.lon + 0.9), 0, 90);
  Sg('solid', cyl(0.04, 0.04, 1.6, 5, 0, 0, 0), PAL.metalRail, 190 - 68, null, undefined, 'dyn:b2');
  Sg('solid', quad(1.2, 0.5, 0, 1.55, 0.05, 'z'), '#ffffff', 190 - 69, c.T.sign('sign.tide', 1.2, 0.5, PAL.yellow, PAL.bannerRed, FONT.display), undefined, 'dyn:b2');
  Sg('solid', quad(1.2, 0.5, 0, 1.55, -0.05, '-z'), '#ffffff', 190 - 69, c.T.sign('sign.tide', 1.2, 0.5, PAL.yellow, PAL.bannerRed, FONT.display), undefined, 'dyn:b2');
}
function annulusW(r0: number, r1: number, lon0: number, lon1: number, h: number): BufferGeometry {
  const g = annulus(r0, r1, lon0, lon1, h, 2.5, 6);
  paint(g, '#ffffff', 8); setUv(g, null);
  return wrapG(g);
}
import { annulus } from './ground';
import { wrapGeometry as wrapG } from '../../core/planet';

// ------------------------------------------------------------------ cold-storage warehouse (fill, lon 286–298)
function warehouse(c: BuildCtx): void {
  const rc = warehouseRect();
  const A = onRect(c, rc);
  A('solid', box(rc.hw * 2, 6, rc.hd * 2, 0, -0.3, 0), PAL.plasterWhite, 190 - 70, null, 'qilou');
  A('solid', box(rc.hw * 2 + 0.3, 0.5, rc.hd * 2 + 0.3, 0, 5.7, 0), PAL.steelGreen, 190 - 71);
  for (const x of [-2.6, 2.6]) A('solid', quad(3.0, 3.2, x, 1.6, rc.hd + 0.02, 'z'), '#ffffff', 190 - 72, c.T.shutter(1));
  A('solid', quad(4.2, 0.7, 0, 4.3, rc.hd + 0.03, 'z'), '#ffffff', 190 - 73, c.T.sign('sign.shop_warehouse', 4.2, 0.7, PAL.blue, PAL.clothWhite));
  for (let i = 0; i < 5; i++) A('detail', box(0.7, 0.4, 0.5, -3 + i * 1.4, 0, rc.hd + 0.6), i % 2 ? PAL.blue : PAL.orange, 177, null, 'boxes');
}

// ------------------------------------------------------------------ the finale tripod on the 周记 tile (dyn:tripod)
/** Tripod head (lens) height above the tile (m). */
export const TRIPOD_HEAD_H = 2.2;   // P3r2 (camera): eye-level-ish over the front row, centred on the two-tier lineup
function tripod(c: BuildCtx, core: Core, out: PlacesOut): void {
  const A = onP(c, fl(TILE.r, TILE.lon), 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    A('interact', bar(v3(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45), v3(0, 1.42, 0), 0.04), PAL.charcoal, 236, null, undefined, 'dyn:tripod');
  }
  A('interact', box(0.2, 0.1, 0.2, 0, 1.42, 0), PAL.charcoal, 237, null, undefined, 'dyn:tripod');
  // P3-look L3: the centre column is racked up to TRIPOD_HEAD_H — from the old 1.55 m head the group photo was a low
  // angle up the underside of the south stairs, with the stair's handrail across every face in the lineup
  A('interact', cyl(0.035, 0.035, TRIPOD_HEAD_H - 1.42 - 0.12, 6, 0, 1.47, 0), PAL.charcoal, 236, null, undefined, 'dyn:tripod');
  A('interact', box(0.16, 0.08, 0.16, 0, TRIPOD_HEAD_H - 0.12, 0), PAL.charcoal, 237, null, undefined, 'dyn:tripod');
  const head = new Group();
  head.name = 'tripod_head';
  placeAt(head, 'planet', { r: TILE.r, lon: TILE.lon, h: TRIPOD_HEAD_H }, 0);
  core.scenes.get('planet').add(head);
  head.updateMatrixWorld(true);
  out.anchorObjects.tripod_head = head;
}

// ------------------------------------------------------------------ 拆 marks (GDD §5.7 distribution; 折 after P8)
export interface MarkDef { key: string; at: P2; h: number; hdg: number; size: number; from: 'day' | 'dusk' | 'night' }
export const MARKS: MarkDef[] = [
  { key: 'site1', at: fl(SITE.hoardR - 0.16, 244.6), h: 1.6, hdg: 0, size: 0.8, from: 'day' },
  { key: 'site2', at: fl(SITE.hoardR - 0.16, 266.8), h: 1.5, hdg: 0, size: 0.9, from: 'day' },
  { key: 'site3', at: fl(56.74, 276), h: 1.2, hdg: 0, size: 0.7, from: 'day' },
  { key: 'market1', at: fl(MARKET.r1 - 0.12, 198), h: 1.8, hdg: 0, size: 0.8, from: 'day' },
  { key: 'market2', at: fl(MARKET.r1 - 0.12, 218), h: 1.5, hdg: 0, size: 0.7, from: 'day' },
  { key: 'store', at: fl(29.04, 66.1), h: 1.4, hdg: 180, size: 0.6, from: 'dusk' },
];
function marks(c: BuildCtx): void {
  for (const m of MARKS) {
    const A = onP(c, m.at, m.h, m.hdg);
    A('solid', quad(m.size, m.size, 0, 0, 0.02, 'z'), '#ffffff', 242, c.T.mark(false), undefined, `dyn:mark:${m.key}`);
  }
  // the studio shutter gets one at night (GDD §5.7): on the shutter plane, lifts with it
  const sfr = studioShutterMark();
  const A = onP(c, sfr.p, sfr.h, sfr.hdg);
  A('solid', quad(0.55, 0.55, 0, 0, 0.05, 'z'), '#ffffff', 242, c.T.mark(false), undefined, 'dyn:mark:studio');
  if (!MARKS.some((m) => m.key === 'studio')) MARKS.push({ key: 'studio', at: sfr.p, h: sfr.h, hdg: sfr.hdg, size: 0.55, from: 'night' });
}
function studioShutterMark(): { p: P2; h: number; hdg: number } {
  const d = dirOf();
  const p = add(add(STUDIO_F(), d, -0.04), alleyWest, 1.75);
  return { p, h: 1.2 + 1.0, hdg: headingOf(p, { x: -d.x, z: -d.z }) };
}
import { STUDIO_FRONT, alleyDir, alleyWest } from '../layout';
function STUDIO_F(): P2 { return add(STUDIO_FRONT, { x: 0, z: 0 }, 0); }
function dirOf(): P2 { return alleyDir; }
export { frameAt, Vector3, sub, degFor, headingToward };
