// src/world/build/landmarks.ts — owner B. The four compass landmarks (GDD §5.1 口诀: 抬头找树，望海找灯；吊臂是工地，
// 绿桥是起点) + the bus stop, the boat, the pier and the lighthouse rock. Heights per GDD: banyan 18, lighthouse 18,
// crane 32, bridge deck 5.5.
import {
  AdditiveBlending, Color, ConeGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type BufferGeometry, type Object3D,
} from 'three';
import { PAL } from '../../art/palette';
import type { Core } from '../../contracts';
import type { WorldAnchorId } from '../../types';
import { DEG, SURFACES, chartToWorld, frameAt, placeMatrix, wrapGeometry } from '../../core/planet';
import { createRng } from '../../core/rng';
import { FONT } from '../../core/fonts';
import { add, ch, degFor, dirAt, fl, type P2 } from '../geo';
import {
  BOAT, BRIDGE, BUS, LIGHTHOUSE, PIER, ROCK, SITE, TEMPLE, TILE, headingToward,
} from '../layout';
import { flatMatrix, type LayerKind } from '../kit/batch';
import { winTag, type BuildCtx } from '../kit/building';
import { bar, blob, box, boxRot, cyl, cylX, quad, v3 } from '../kit/prims';
import { bench } from '../kit/props';
import type { Dyn } from '../phaseState';
import type { UvRect } from '../atlas';
import type { LabelId } from '../../types';

export interface LandmarksOut { anchorObjects: Partial<Record<WorldAnchorId, Object3D>>; objects: Record<string, Object3D>; beacons?: Dyn['beacons'] }

type Add = (layer: LayerKind, g: BufferGeometry, hex: string, sid: number, uv?: UvRect | null, label?: LabelId, tag?: string) => void;
function at(c: BuildCtx, r: number, lon: number, h: number, hdg: number, chunk?: string): Add {
  const M = placeMatrix('planet', { r, lon, h }, hdg);
  return (layer, g, hex, sid, uv = null, label, tag) => { c.B.add(layer, g, M, hex, sid, { uv, label, chunk: chunk ? `${chunk}:${layer}` : undefined }, tag); };
}
function atP(c: BuildCtx, p: P2, h: number, hdg: number): Add { const q = ch(p); return at(c, q.r, q.lon, h, hdg); }
/** Author in a local frame, then wrap per vertex onto the sphere (long pieces: deck, pier). */
function flat(c: BuildCtx, p: P2, hdg: number, h = 0): Add {
  const F = flatMatrix(p, hdg, h);
  return (layer, g, hex, sid, uv = null, label, tag) => { g.applyMatrix4(F); wrapGeometry(g); c.B.add(layer, g, null, hex, sid, { uv, label }, tag); };
}

export function buildLandmarks(c: BuildCtx, core: Core): LandmarksOut {
  const objects: Record<string, Object3D> = {};
  bridge(c);
  busStop(c);
  boat(c);
  pier(c);
  banyan(c);
  crane(c);
  lighthouse(c);
  tile(c);
  const beacons = beaconLights(core, objects);
  return { anchorObjects: {}, objects, beacons };
}

// ------------------------------------------------------------------ 绿天桥 (GDD §5.3 #2)
function bridge(c: BuildCtx): void {
  const G = PAL.steelGreen;
  const L = BRIDGE.lon, mid = (BRIDGE.deckR0 + BRIDGE.deckR1) / 2, len = BRIDGE.deckR1 - BRIDGE.deckR0 + 0.3;
  // deck: authored along its radial line (local +Z = outward), wrapped so the walk height stays exact
  const d = flat(c, fl(mid, L), 180, 0);
  d('solid', box(BRIDGE.halfW * 2, 0.15, len, 0, BRIDGE.deckH - 0.15, 0), PAL.concrete, 120, null, 'road');
  d('solid', box(BRIDGE.halfW * 2 + 0.2, 0.75, len, 0, BRIDGE.deckH - 0.9, 0), G, 121);
  for (const s of [-1, 1]) {
    // P3r2 (camera): rails / posts on the see-through 'thin' layer (the follow camera looks through them)
    d('thin', box(0.1, 0.12, len, s * (BRIDGE.halfW + 0.02), BRIDGE.deckH + 1.05, 0), G, 122);
    d('thin', box(0.06, 0.06, len, s * (BRIDGE.halfW + 0.02), BRIDGE.deckH + 0.55, 0), G, 122);
    d('solid', box(0.12, 0.78, len, s * (BRIDGE.halfW + 0.08), BRIDGE.deckH - 0.9, 0), G, 123);    // girder lip
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 1.45) d('thin', box(0.07, 1.05, 0.07, s * (BRIDGE.halfW + 0.02), BRIDGE.deckH, z), G, 122);
    // panels with the road name / slogan (both faces of the girder)
    const uv = c.T.sign(s < 0 ? 'sign.bridge' : 'sign.bridge_slogan', 4, 0.55, PAL.clothWhite, PAL.steelGreen, FONT.display);
    d('solid', quad(4, 0.55, s * (BRIDGE.halfW + 0.15), BRIDGE.deckH - 0.52, 0, s > 0 ? 'x' : '-x'), '#ffffff', 124, uv);
  }
  // pillars (GDD: under the deck on both sidewalks)
  for (const r of [28.8, 39.2]) for (const a of [-1.2, 1.2]) {
    const p = add(fl(r, L), dirAt(fl(r, L), 90), a);
    atP(c, p, 0, 0)('solid', cyl(0.18, 0.2, BRIDGE.deckH - 0.9, 8), G, 125);
  }
  // stairs: treads every 0.28 m of run, stringers, rails; landings
  stair(c, BRIDGE.north.r, BRIDGE.north.lonBot, BRIDGE.north.lonTop, BRIDGE.north.lon0, -1);
  stair(c, BRIDGE.south.r, BRIDGE.south.lonBot, BRIDGE.south.lonTop, BRIDGE.south.lon0, 1);
}

/** One flight: bottom lon → top lon along radius r, then a landing to lonEnd. dir = +1 if lon increases upward. */
function stair(c: BuildCtx, r: number, lonBot: number, lonTop: number, lonEnd: number, dir: number): void {
  const G = PAL.steelGreen, hw = BRIDGE.north.halfW;
  const run = r * Math.abs(lonTop - lonBot) * DEG, H = BRIDGE.deckH;
  const n = Math.round(run / 0.3);
  const hdg = dir > 0 ? 90 : 270;         // walking up = toward increasing (south) or decreasing (north) lon
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, lon = lonBot + (lonTop - lonBot) * t, h = H * (i + 1) / n;
    at(c, r, lon, 0, hdg)('solid', box(hw * 2, 0.08, run / n + 0.04, 0, h - 0.08, 0), PAL.concrete, 126 + (i % 2), null, 'road');
  }
  // stringers + rails as short rigid segments following the slope
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const l0 = lonBot + (lonTop - lonBot) * t0, l1 = lonBot + (lonTop - lonBot) * t1;
    for (const s of [-1, 1]) {
      const p0 = add(fl(r, l0), dirAt(fl(r, l0), 0), s * (hw + 0.05)), p1 = add(fl(r, l1), dirAt(fl(r, l1), 0), s * (hw + 0.05));
      const A = { ...ch(p0) }, B = { ...ch(p1) };
      const a3 = chartToWorld({ ...A, h: H * t0 - 0.35 }), b3 = chartToWorld({ ...B, h: H * t1 - 0.35 });
      c.B.add('solid', bar(a3, b3, 0.22), null, G, 128);
      c.B.add('thin', bar(chartToWorld({ ...A, h: H * t0 + 0.95 }), chartToWorld({ ...B, h: H * t1 + 0.95 }), 0.08), null, G, 129);
      c.B.add('detail', bar(chartToWorld({ ...A, h: H * t0 + 0.5 }), chartToWorld({ ...B, h: H * t1 + 0.5 }), 0.05), null, G, 129);
      c.B.add('thin', bar(chartToWorld({ ...A, h: H * t0 }), chartToWorld({ ...A, h: H * t0 + 0.95 }), 0.06), null, G, 129);
    }
    // support columns under the flight
    if (i % 3 === 1 && H * t1 > 1.5) atP(c, fl(r, l1), 0, 0)('solid', cyl(0.12, 0.14, H * t1 - 0.3, 6), G, 125);
  }
  // landing (h 5.5) from lonTop to lonEnd
  const lm = (lonTop + lonEnd) / 2, lw = r * Math.abs(lonEnd - lonTop) * DEG + 0.2;
  at(c, r, lm, 0, hdg)('solid', box(hw * 2 + 0.1, 0.35, lw, 0, H - 0.35, 0), G, 121);
  at(c, r, lm, 0, hdg)('solid', box(hw * 2, 0.06, lw, 0, H - 0.06, 0), PAL.concrete, 120);
  at(c, r, lonEnd, 0, hdg)('solid', box(hw * 2 + 0.1, 1.05, 0.08, 0, H, 0), G, 122);
  at(c, r, lm, 0, 0)('solid', cyl(0.16, 0.18, H - 0.35, 8), G, 125);
}

// ------------------------------------------------------------------ 望潮里站 (GDD §5.3 #1)
function busStop(c: BuildCtx): void {
  const A = at(c, BUS.r, BUS.shelterLon, 0, 0);          // faces the road (north)
  const w = BUS.r * BUS.halfDeg * 2 * DEG;
  A('solid', box(w, 0.1, 1.9, 0, 2.55, 0.05), PAL.steelGreen, 130);
  A('solid', box(w + 0.2, 0.18, 2.1, 0, 2.62, 0.05), PAL.steelGreen, 131);
  A('solid', box(w - 0.2, 2.2, 0.08, 0, 0.3, -0.85), PAL.signSlate, 132);
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) { A('thin', box(0.12, 2.55, 0.12, x, 0, 0.8), PAL.steelGreen, 130); A('thin', box(0.12, 2.55, 0.12, x, 0, -0.85), PAL.steelGreen, 130); }
  // panel: route map + notice (GDD: 「本站将于 9 月 30 日起撤销」)
  const map = c.T.art('busmap', 160, 96, (g, W, H) => {
    g.fillStyle = PAL.clothWhite; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.steelGreen; g.fillRect(0, 0, W, 22);
    g.fillStyle = PAL.clothWhite; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 16px ${FONT.display}`; g.fillText(STR_T('sign.bus_stop'), W / 2, 11);
    g.strokeStyle = PAL.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(12, 55); g.lineTo(W - 12, 55); g.stroke();
    for (let i = 0; i < 7; i++) { g.fillStyle = i === 3 ? PAL.bannerRed : PAL.ink; g.beginPath(); g.arc(18 + i * ((W - 36) / 6), 55, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = PAL.inkDeep; g.font = `700 12px ${FONT.sign}`; g.fillText(STR_T('sign.bus_routes'), W / 2, 80);
  });
  A('solid', quad(2.2, 1.3, -w / 4, 1.45, -0.8, 'z'), '#ffffff', 133, map);
  const notice = c.T.art('busnotice', 64, 80, (g, W, H) => {
    g.fillStyle = '#efe9d8'; g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.bannerRed; g.font = `700 13px ${FONT.sign}`; g.textAlign = 'center'; g.fillText(STR_T('sign.bus_notice_t'), W / 2, 14);
    g.fillStyle = PAL.inkDeep; g.font = `400 7px ${FONT.sign}`;
    const s = STR_T('sign.bus_notice'); const half = Math.ceil([...s].length / 2);
    g.fillText([...s].slice(0, half).join(''), W / 2, 34); g.fillText([...s].slice(half).join(''), W / 2, 46);
    g.fillStyle = PAL.bannerRed; g.beginPath(); g.arc(W - 14, H - 14, 8, 0, Math.PI * 2); g.fill();
  });
  A('solid', quad(0.55, 0.7, w / 4, 1.5, -0.8, 'z'), '#ffffff', 134, notice);
  A('solid', box(w * 0.78, 0.06, 0.42, 0, 0.45, -0.36), PAL.metalRail, 135, null, 'bench');
  A('solid', box(w * 0.78, 0.45, 0.06, 0, 0.0, -0.2), PAL.metalRail, 136, null, 'bench');
  A('solid', boxRot(w * 0.78, 0.35, 0.05, 0, 0.75, -0.58, -0.15), PAL.metalRail, 135, null, 'bench');
  // the wake bench (S_wake / sp_bus_bench, yaw 90): long axis across the yaw, seat centre BUS.benchBack behind the spot
  const sp = fl(BUS.r, 0);
  bench(c, add(sp, dirAt(sp, 90), -BUS.benchBack), 90, 1.7);
  // stop sign pole with the route plate and QR (GDD T_bus_qr)
  const S = at(c, 38.2, 354.2, 0, 0);
  S('solid', cyl(0.05, 0.05, 2.9, 6), PAL.signSlate, 137);
  S('solid', box(0.7, 1.0, 0.06, 0, 1.95, 0), PAL.steelGreen, 138);
  S('solid', quad(0.62, 0.9, 0, 2.45, 0.035, 'z'), '#ffffff', 139, c.T.vsign('sign.bus_stop', 0.62, 0.9, PAL.clothWhite, PAL.steelGreen));
  S('solid', quad(0.24, 0.24, 0, 1.5, 0.05, 'z'), '#ffffff', 139, c.T.qrCode('bus'));
  S('solid', box(0.3, 0.3, 0.03, 0, 1.35, 0.02), PAL.clothWhite, 140);
}
const STR_T = (k: string) => tt(k);
import { t as tt } from '../../data/zh';
import { buildHull, hullDecal } from '../kit/hull';

// ------------------------------------------------------------------ 闽望渔 0815 on its cradle (GDD §5.3 #1)
function boat(c: BuildCtx): void {
  const A = at(c, BOAT.r, BOAT.lon, 0.9, 90);        // bow toward +lon
  const L = BOAT.len, Bm = BOAT.beam;
  // lofted hull: blue bottom, rust boot stripe, white topsides, raked bow (reference boat: rounded, two-tone)
  const hull = buildHull({ len: L, beam: Bm });
  A('solid', hull.lower, PAL.blue, 141, null, undefined);
  A('solid', hull.band, PAL.rust, 143);
  A('solid', hull.upper, PAL.clothWhite, 142);
  A('solid', hull.transom, PAL.clothWhite, 142);
  A('solid', hull.deck, PAL.sidewalkTan, 140);
  A('solid', box(Bm * 0.8, 1.5, 2.0, 0, 1.6, -L * 0.2), PAL.clothWhite, 144);            // wheelhouse
  A('win', quad(1.6, 0.5, 0, 2.7, -L * 0.2 + 1.01, 'z'), PAL.glassDark, 80, c.T.pane(0), 'window', winTag('home'));
  A('solid', box(Bm * 0.85, 0.12, 2.3, 0, 3.1, -L * 0.2), PAL.bannerRed, 143);
  A('solid', box(0.08, 2.4, 0.08, 0, 3.1, -L * 0.2 + 0.4), PAL.metalRail, 145);
  // name on both bows (GDD: 船头漆着「闽望渔 0815」)
  const name = c.T.sign('sign.boat', 2.6, 0.5, PAL.clothWhite, PAL.inkDeep, FONT.sign);
  for (const sd of [1, -1]) A('solid', hullDecal({ len: L, beam: Bm }, sd, 0.5, 0.86, 0.12, 0.92), '#ffffff', 146, name);
  // cradle
  for (const z of [-L * 0.35, 0, L * 0.3]) A('solid', box(Bm + 0.4, 0.95, 0.3, 0, -0.9, z), PAL.trunk, 147);
  // slipway ramp into the sea at lon 5.5
  const S = at(c, 48.5, BOAT.lon, 0, 180);
  S('solid', boxRot(3.2, 0.2, 3.6, 0, -0.55, 0.6, 0.28), PAL.concrete, 148);
}

// ------------------------------------------------------------------ pier + bench + rock + steps (GDD §5.3 #10–11)
function pier(c: BuildCtx): void {
  const len = PIER.r1 - PIER.rampR;
  const mid = (PIER.r1 + PIER.rampR) / 2;
  const d = flat(c, fl(mid, PIER.lon), 180, 0);
  d('solid', box(PIER.halfW * 2, 0.18, len, 0, PIER.deckH - 0.18, 0), PAL.ochre, 150, null, 'bench');
  for (let z = -len / 2 + 0.3; z < len / 2; z += 0.55) d('detail', box(PIER.halfW * 2 + 0.02, 0.02, 0.05, 0, PIER.deckH, z), PAL.trunk, 151);
  for (const s of [-1, 1]) {
    d('solid', box(0.08, 0.08, len, s * (PIER.halfW + 0.1), PIER.deckH + 0.55, 0), PAL.trunk, 152);
    for (let z = -len / 2; z <= len / 2; z += 2.2) {
      d('solid', box(0.1, 0.6, 0.1, s * (PIER.halfW + 0.1), PIER.deckH, z), PAL.trunk, 152);
      d('solid', box(0.22, 1.6, 0.22, s * (PIER.halfW - 0.1), -1.2, z), PAL.trunk, 153);
    }
  }
  // ramp
  const rp = flat(c, fl((PIER.r0 + PIER.rampR) / 2, PIER.lon), 180, 0);
  rp('solid', boxRot(PIER.halfW * 2, 0.16, 2.1, 0, PIER.deckH / 2 - 0.08, 0, Math.atan2(PIER.deckH, 2)), PAL.ochre, 150);
  // bench bulge + the lighthouse bench (GDD sp_bench: faces the lighthouse)
  const B = PIER.bench, bl = B.r1 - B.r0;
  const bb = flat(c, fl((B.r0 + B.r1) / 2, PIER.lon), 180, 0);
  bb('solid', box(B.bulgeHalfW * 2, 0.18, bl, 0, PIER.deckH - 0.18, 0), PAL.ochre, 150);
  for (const s of [-1, 1]) bb('solid', box(0.08, 0.08, bl, s * (B.bulgeHalfW + 0.1), PIER.deckH + 0.55, 0), PAL.trunk, 152);
  const benchHdg = headingToward(fl(B.r, B.lon), fl(LIGHTHOUSE.r, LIGHTHOUSE.lon));
  const bp = add(fl(B.r, B.lon), dirAt(fl(B.r, B.lon), benchHdg), -0.18);
  const Mb = placeMatrix('planet', { ...ch(bp), h: PIER.deckH }, benchHdg);
  c.B.add('interact', box(1.5, 0.08, 0.45, 0, 0.44, 0), Mb, PAL.ochre, 237, { label: 'bench' });
  c.B.add('interact', boxRot(1.5, 0.35, 0.06, 0, 0.72, -0.22, -0.2), Mb, PAL.ochre, 237, { label: 'bench' });
  for (const x of [-0.6, 0.6]) c.B.add('interact', box(0.08, 0.44, 0.4, x, 0, 0), Mb, PAL.charcoal, 236, { label: 'bench' });
  const carve = c.T.art('bench_zhou', 32, 24, (g, W, H) => { g.fillStyle = PAL.ochre; g.fillRect(0, 0, W, H); g.fillStyle = PAL.inkDeep; g.font = `400 16px ${FONT.hand}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tt('sign.tile').slice(0, 1), W / 2, H / 2); });
  c.B.add('interact', quad(0.22, 0.16, 0.45, 0.72, -0.19, 'z'), Mb, '#ffffff', 235, { uv: carve, label: 'bench' });
  // stone steps up to the rock (1.6 m) and the platform
  const st = ROCK.stepR1 - ROCK.stepR0;
  for (let i = 0; i < 6; i++) {
    const r = ROCK.stepR0 + (st * (i + 0.5)) / 6;
    at(c, r, PIER.lon, 0, 180)('solid', box(PIER.halfW * 2, PIER.deckH + (ROCK.h - PIER.deckH) * ((i + 1) / 6) + 0.6, st / 6 + 0.02, 0, -0.6, 0), PAL.concrete, 154 + (i % 2));
  }
  const plat = (lon0: number, lon1: number) => {
    const a = annulusFlat(ROCK.r0, ROCK.r1, lon0, lon1, ROCK.h);
    c.B.add('solid', a, null, PAL.sidewalk, 156, { label: 'rubble' });
  };
  plat(ROCK.lon0, ROCK.lon1);
  // rock skirt under the platform and loose rocks
  const rng = createRng(0x70c4);
  for (let i = 0; i < 18; i++) {
    const lon = ROCK.lon0 + rng.range(-1.5, ROCK.lon1 - ROCK.lon0 + 1.5), r = rng.range(ROCK.r0 - 0.5, ROCK.r1 + 1.5);
    if (Math.abs(lon - PIER.lon) < 1.9 && r < 65.8) continue;
    at(c, r, lon, 0, rng.range(0, 360))('solid', blob(rng.range(1.0, 1.9), 0, rng.range(-0.4, 0.6), 0, rng, 0.25, -1, 0.75), rng.pick([PAL.concrete, PAL.sidewalk, '#8b8f86']), 157);
  }
  // platform rail
  for (let lon = ROCK.lon0; lon <= ROCK.lon1; lon += 1.6) at(c, ROCK.r1 - 0.15, lon, ROCK.h, 0)('detail', cyl(0.035, 0.035, 0.9, 5), PAL.metalRail, 158);
}

function annulusFlat(r0: number, r1: number, lon0: number, lon1: number, h: number): BufferGeometry {
  // reuse ground's annulus lazily to avoid a cycle
  return groundAnnulus(r0, r1, lon0, lon1, h);
}
import { annulus as groundAnnulus } from './ground';

// ------------------------------------------------------------------ 大榕树 (GDD §5.3 #7: crown r 7, top h 18)
function banyan(c: BuildCtx): void {
  const rng = createRng(0xba9);
  const T = TEMPLE.banyan;
  const base = { r: T.r, lon: T.lon, h: 4 };
  const M = placeMatrix('planet', base, 0);
  const add2 = (layer: LayerKind, g: BufferGeometry, hex: string, sid: number) => c.B.add(layer, g, M, hex, sid, { label: 'tree' });
  add2('solid', cyl(0.75, 1.15, 7.5, 9), PAL.trunk, 160);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    add2('solid', bar(v3(0, 5.5 + i * 0.3, 0), v3(Math.cos(a) * 3.8, 8.6 + rng.range(-0.4, 0.6), Math.sin(a) * 3.8), 0.55), PAL.trunk, 160);
    add2('solid', blob(0.9, Math.cos(a) * 0.9, 0.3, Math.sin(a) * 0.9, rng, 0.2, 0, 0.7), PAL.trunk, 161);
  }
  // aerial roots (气根) hanging like a curtain
  for (let i = 0; i < 22; i++) {
    const a = rng.range(0, Math.PI * 2), rr = rng.range(1.6, 5.8);
    const top = rng.range(8.8, 10.5), bot = rng.range(2.5, 7.5);
    add2(i % 2 ? 'solid' : 'detail', box(0.07, top - bot, 0.07, Math.cos(a) * rr, bot, Math.sin(a) * rr), '#9a8f82', 162);
  }
  // crown: many blobs to r 7, top 18 (h 14 above the plateau)
  const crown = [[0, 12.3, 0, 3.6], [3.2, 11.2, 1.5, 2.8], [-3.1, 11.4, 1.2, 2.9], [1.2, 11.0, -3.4, 2.8], [-1.4, 11.2, 3.3, 2.7],
    [4.3, 10.2, -1.8, 2.3], [-4.2, 10.3, -1.5, 2.4], [2.4, 13.6, 1.3, 2.6], [-2.2, 13.5, -1.2, 2.6], [0.5, 14.8, 0.2, 2.2],
    [5.0, 9.8, 2.2, 2.0], [-4.8, 9.6, 2.6, 2.0], [2.0, 9.9, 4.6, 2.1], [-1.8, 9.8, -4.6, 2.1]] as const;
  // −2.5: the top blob (14.8 + 2.2·0.8) then peaks at h 18.06 on the h 4 plateau (GDD §5.1 banyan top 18 m)
  crown.forEach(([x, y, z, r], i) => add2('foliage', blob(r, x, y - 2.5, z, rng, 0.14, 1, 0.8), i % 4 === 3 ? PAL.foliageDeep : PAL.foliage, 163 + (i % 2)));
  // red ribbons on the lower branches
  for (let i = 0; i < 6; i++) { const a = rng.range(0, 6.28); add2('detail', box(0.06, 0.9, 0.02, Math.cos(a) * 2.6, 7.6, Math.sin(a) * 2.6), PAL.bannerRed, 165); }
}

// ------------------------------------------------------------------ tower crane (GDD: 32 m, red light 1 Hz)
function crane(c: BuildCtx): void {
  const Y = PAL.yellow, H = 29;
  const A = at(c, SITE.crane.r, SITE.crane.lon, 0, 0, 'hp:crane');   // not in the 2006 / 2011 photos
  A('solid', box(3.2, 1.2, 3.2, 0, -0.2, 0), PAL.concrete, 166);
  const w = 1.5;
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]]) A('solid', box(0.14, H, 0.14, x, 0, z), Y, 167, null, undefined);
  // lattice bracing (X pattern) every 2.5 m on each face
  for (let y = 1; y < H - 1; y += 2.5) {
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      const p0 = v3((a[0] * w) / 2, y, (a[1] * w) / 2), p1 = v3((b[0] * w) / 2, y + 2.5, (b[1] * w) / 2);
      A('detail', bar(p0, p1, 0.06), Y, 168);
      A('solid', bar(v3((a[0] * w) / 2, y, (a[1] * w) / 2), v3((b[0] * w) / 2, y, (b[1] * w) / 2), 0.07), Y, 168);
    }
  }
  // slewing unit, cab, apex, jib toward the site (outward) and counter-jib
  A('solid', box(2.0, 1.0, 2.0, 0, H, 0), PAL.charcoal, 169);
  A('solid', box(1.4, 1.5, 1.6, 1.1, H + 1.0, 0.6), PAL.clothWhite, 170);
  A('win', quad(1.2, 0.8, 1.1, H + 1.9, 1.42, 'z'), PAL.glassDark, 80, c.T.pane(0), 'window', winTag('home'));
  A('solid', box(0.3, 3.4, 0.3, 0, H + 1.0, 0), Y, 167);
  const jibL = 26, cjL = 9;
  for (const s of [-1, 1]) {
    A('solid', box(0.12, 0.12, jibL, s * 0.45, H + 1.1, jibL / 2 + 1), Y, 171);
    A('solid', box(0.12, 0.12, cjL, s * 0.45, H + 1.1, -cjL / 2 - 1), Y, 171);
  }
  A('solid', box(0.1, 0.1, jibL, 0, H + 2.1, jibL / 2 + 1), Y, 171);
  for (let z = 1; z < jibL; z += 1.8) A('detail', bar(v3(-0.45, H + 1.1, z), v3(0, H + 2.1, z + 0.9), 0.05), Y, 172);
  A('solid', bar(v3(0, H + 4.3, 0), v3(0, H + 2.1, jibL * 0.7), 0.05), PAL.cable, 173);
  A('solid', bar(v3(0, H + 4.3, 0), v3(0, H + 1.4, -cjL), 0.05), PAL.cable, 173);
  A('solid', box(1.5, 1.4, 2.2, 0, H + 0.3, -cjL + 0.8), PAL.concrete, 174);
  // hook line + hook block
  A('detail', box(0.03, 12, 0.03, 0, H - 11, 17), PAL.cable, 173);
  A('solid', box(0.5, 0.6, 0.4, 0, H - 11.6, 17), PAL.orange, 175);
  // banner on the mast
  A('solid', quad(1.4, 2.6, 0, 8, w / 2 + 0.1, 'z'), '#ffffff', 176, c.T.vsign('sign.site_safety', 1.4, 2.6, PAL.bannerRed, PAL.clothWhite));
}

// ------------------------------------------------------------------ 灯塔 (GDD §5.3 #11: red/white, 18 m, lamp at 15 m)
function lighthouse(c: BuildCtx): void {
  const Lh = LIGHTHOUSE, base = ROCK.h;
  const doorHdg = headingToward(fl(Lh.r, Lh.lon), fl(Lh.doorSpot.r, Lh.doorSpot.lon));
  const A = at(c, Lh.r, Lh.lon, base, doorHdg);           // +Z faces the door spot
  const bands = 6, hTower = Lh.lampH - 0.6;
  for (let i = 0; i < bands; i++) {
    const y0 = (hTower * i) / bands, y1 = (hTower * (i + 1)) / bands;
    const r0 = Lh.baseR + (Lh.topR - Lh.baseR) * (y0 / hTower), r1 = Lh.baseR + (Lh.topR - Lh.baseR) * (y1 / hTower);
    A('solid', cylSeg(r1, r0, y1 - y0, 14, y0), i % 2 ? PAL.clothWhite : PAL.bannerRed, 177 + (i % 2), null, undefined);
  }
  A('solid', cyl(Lh.baseR + 0.3, Lh.baseR + 0.4, 0.5, 14, 0, -0.1, 0), PAL.concrete, 179);
  // gallery, lantern room, roof, vent ball
  A('solid', cyl(1.5, 1.5, 0.18, 14, 0, hTower, 0), PAL.charcoal, 180);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; A('detail', box(0.04, 0.9, 0.04, Math.cos(a) * 1.45, hTower + 0.18, Math.sin(a) * 1.45), PAL.charcoal, 181); }
  A('solid', cylSeg(1.48, 1.48, 0.06, 14, hTower + 1.05), PAL.charcoal, 181);
  A('solid', cyl(0.85, 0.85, 0.4, 10, 0, hTower + 0.18, 0), PAL.charcoal, 182);
  A('win', cyl(0.8, 0.8, 1.5, 10, 0, hTower + 0.58, 0, true), PAL.glassDark, 183, c.T.pane(3), undefined, winTag('lamp'));
  A('solid', coneAt(1.05, 1.5, hTower + 2.08), PAL.bannerRed, 184);
  A('solid', cyl(0.12, 0.12, 0.35, 6, 0, hTower + 3.55, 0), PAL.charcoal, 185);
  // door, plaque, main switch box (GDD P6)
  A('solid', quad(0.9, 2.0, 0, 1.1, Lh.baseR + 0.01, 'z'), PAL.inkDeep, 187);
  A('interact', box(0.95, 2.0, 0.12, 0, 0.1, Lh.baseR - 0.03), PAL.teal, 234, null, undefined, 'dyn:lhdoor');
  A('interact', quad(0.85, 1.9, 0, 1.1, Lh.baseR + 0.035, 'z'), '#ffffff', 233, c.T.panel('lhdoor', PAL.teal, 'door'), undefined, 'dyn:lhdoor');
  const plaque = c.T.art('plaque', 128, 48, (g, W, H) => {
    g.fillStyle = PAL.ochre; g.fillRect(0, 0, W, H);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 3; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = PAL.inkDeep; g.font = `700 17px ${FONT.sign}`; g.textBaseline = 'middle';
    const a = tt('sign.plaque_a'), b = tt('sign.plaque_b');
    const wa = g.measureText(a).width, wb = g.measureText(b).width, cw = 18;
    const x0 = (W - (wa + cw + wb)) / 2;
    g.textAlign = 'left'; g.fillText(a, x0, H / 2); g.fillText(b, x0 + wa + cw, H / 2);
    // the last digit is covered by a small red 拆 circle (GDD P6)
    g.strokeStyle = PAL.bannerRed; g.lineWidth = 2.5; g.beginPath(); g.arc(x0 + wa + cw / 2, H / 2, 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PAL.bannerRed; g.font = `700 12px ${FONT.sign}`; g.textAlign = 'center'; g.fillText(tt('sign.chai'), x0 + wa + cw / 2, H / 2 + 1);
  });
  const face = (dh: number, y: number, w: number, h: number, uv: UvRect, sid: number, hex = '#ffffff') => {
    const Ab = at(c, Lh.r, Lh.lon, base, doorHdg + dh);
    Ab('interact', quad(w, h, 0, y, Lh.baseR + 0.07, 'z'), hex, sid, uv);
  };
  face(-38, 1.05, 0.62, 0.24, plaque, 232);
  const sw = c.T.art('switch', 40, 56, (g, W, H) => {
    g.fillStyle = PAL.metalRail; g.fillRect(0, 0, W, H); g.strokeStyle = PAL.inkDeep; g.lineWidth = 2.5; g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = PAL.yellow; g.beginPath(); g.moveTo(W / 2, 8); g.lineTo(W - 8, 24); g.lineTo(8, 24); g.closePath(); g.fill();
    g.fillStyle = PAL.inkDeep; g.font = `700 10px ${FONT.sign}`; g.textAlign = 'center'; g.fillText(tt('sign.switch'), W / 2, 38);
    g.fillStyle = PAL.bannerRed; g.fillRect(W / 2 - 3, 42, 6, 10);
  });
  const Asw = at(c, Lh.r, Lh.lon, base, doorHdg + 40);
  Asw('interact', box(0.4, 0.55, 0.16, 0, 0.95, Lh.baseR + 0.02), PAL.metalRail, 231);
  Asw('interact', quad(0.36, 0.5, 0, 1.22, Lh.baseR + 0.105, 'z'), '#ffffff', 230, sw);
  // inner shaft (the lh_door look-up view, GDD P6): the tower is an open tube, so from inside its walls were culled and
  // the view showed the night sky. Inside-out wall, a spiral stair round a newel post, the lamp-room hatch glowing.
  for (let i = 0; i < bands; i++) {
    const y0 = (hTower * i) / bands, y1 = (hTower * (i + 1)) / bands;
    const r0 = Lh.baseR - 0.1 + (Lh.topR - Lh.baseR) * (y0 / hTower), r1 = Lh.baseR - 0.1 + (Lh.topR - Lh.baseR) * (y1 / hTower);
    A('solid', insideOut(cylSeg(r1, r0, y1 - y0, 14, y0)), i % 2 ? PAL.plasterBeige : PAL.plasterWhite, 188, null, undefined);
  }
  // cantilevered treads hug the wall (no newel post): the middle stays open so the lamp room (T_frame3_lamp, 10×)
  // is still framed straight up the shaft
  const steps = Math.floor((hTower - 2.2) / 0.3);
  for (let k = 0; k < steps; k++) {
    const a = k * (Math.PI * 2 / 12), y = 2.2 + 0.3 * k, rr = Lh.baseR - 0.1 + (Lh.topR - Lh.baseR) * (y / hTower);
    const g = box(0.42, 0.06, 0.3, rr - 0.21, y, 0);
    g.rotateY(-a);
    A('solid', g, k % 2 ? PAL.concrete : PAL.metalRail, 190);
  }
  A('win', cyl(0.55, 0.55, 0.02, 12, 0, hTower - 0.04, 0), PAL.winWarm, 191, null, undefined, winTag('lamp'));
  // negative ③ caught across the lamp hatch (GDD P6 「卡在灯罩上」, T_frame3_lamp at 10×); gone once frame_3 is taken
  const neg3 = c.T.art('neg3', 96, 40, (g, W, H) => {
    g.fillStyle = '#4a3322'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9c49a';
    for (let x = 4; x < W - 4; x += 8) { g.fillRect(x, 3, 4, 4); g.fillRect(x, H - 7, 4, 4); }
    g.fillStyle = '#b9d6d2'; g.fillRect(14, 11, W - 28, H - 22);
    g.fillStyle = '#6f8f8c'; g.fillRect(22, 15, 22, H - 30); g.fillRect(52, 19, 22, H - 34);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  });
  const Nf = at(c, Lh.r, Lh.lon, base, doorHdg + 25);
  Nf('sign', quad(0.5, 0.21, 0.08, hTower - 0.065, 0.05, '-y'), '#ffffff', 192, neg3, undefined, 'dyn:frame3');
  // name plate high on the tower
  const An = at(c, Lh.r, Lh.lon, base, 0);
  An('solid', quad(0.5, 1.6, 0, 6.3, Lh.baseR - 0.2, 'z'), '#ffffff', 186, c.T.vsign('sign.lighthouse', 0.5, 1.6, PAL.clothWhite, PAL.inkDeep));
}
function cylSeg(rTop: number, rBot: number, h: number, seg: number, y0: number): BufferGeometry { return cyl(rTop, rBot, h, seg, 0, y0, 0, true); }
/** Flip a geometry to face inward (winding + normals), for surfaces seen from inside (the lighthouse shaft). */
function insideOut(g: BufferGeometry): BufferGeometry {
  const idx = g.getIndex();
  if (idx) { const a = idx.array as ArrayLike<number> & { [i: number]: number }; for (let i = 0; i < idx.count; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } idx.needsUpdate = true; }
  const n = g.getAttribute('normal');
  if (n) { for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); n.needsUpdate = true; }
  return g;
}
function coneAt(r: number, h: number, y: number): BufferGeometry { const g = new ConeGeometry(r, h, 12); g.translate(0, y + h / 2, 0); return g; }

// ------------------------------------------------------------------ 周记 floor tile + chalk X (GDD P1, §9 S_group_photo)
function tile(c: BuildCtx): void {
  const T = at(c, TILE.r, TILE.lon, 0.025, 0);
  const uv = c.T.art('tile', 96, 96, (g, W, H) => {
    g.fillStyle = PAL.sidewalk; g.fillRect(0, 0, W, H);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 3; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = '#7f8076'; g.font = `400 40px ${FONT.brush}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(tt('sign.tile'), W / 2, H / 2 + 2);
  });
  T('interact', quad(0.9, 0.9, 0, 0, 0, 'y'), '#ffffff', 236, uv);
  // chalk X on the south stair (sp_stairs_x, lon 23 at h 2.75)
  const X = at(c, BRIDGE.south.r, 23, 2.75 + 0.012, 0);
  const cx = c.T.art('chalkx', 48, 48, (g, W, H) => {
    g.fillStyle = PAL.concrete; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#eef1e6'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, 9); g.lineTo(W - 9, H - 8); g.moveTo(W - 8, 10); g.lineTo(9, H - 9); g.stroke();
  });
  X('solid', quad(0.6, 0.6, 0, 0, 0, 'y'), '#ffffff', 127, cx);
}

// ------------------------------------------------------------------ lighthouse lamp + crane light (FX glow)
function beaconLights(core: Core, objects: Record<string, Object3D>): Dyn['beacons'] {
  let fx;
  try { fx = core.services.render.fxScene('planet'); } catch { return undefined; }
  const glow = (hex: string, r: number, op: number) => new Mesh(new SphereGeometry(r, 12, 8), new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false }));
  const lh = new Group();
  lh.position.copy(chartToWorld({ r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: ROCK.h + LIGHTHOUSE.lampH - 0.6 + 0.9 }));
  const core1 = glow('#ffe9a8', 0.75, 0.9), halo = glow('#ffd27a', 2.2, 0.28);
  lh.add(core1, halo);
  // rotating beam: a long thin cone lying along the tangent plane
  const beamGeo = new ConeGeometry(2.6, 26, 16, 1, true);
  beamGeo.translate(0, -13, 0);
  beamGeo.rotateX(Math.PI / 2);
  const beam = new Mesh(beamGeo, new MeshBasicMaterial({ color: new Color('#ffe9a8'), transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false }));
  const pivot = new Group();
  const fr = frameAt(SURFACES.planet, lh.position);
  pivot.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), fr.up);
  pivot.add(beam);
  lh.add(pivot);
  fx.add(lh);
  const cr = new Group();
  cr.position.copy(chartToWorld({ r: SITE.crane.r, lon: SITE.crane.lon, h: 29 + 4.5 }));
  const red = glow('#ff6b5e', 0.35, 1), redHalo = glow('#ff6b5e', 1.3, 0.3);
  cr.add(red, redHalo);
  fx.add(cr);
  lh.visible = false; cr.visible = false;
  objects.lh_light = lh; objects.crane_light = cr;
  let craneOn = false;
  const Y_UP = new Vector3(0, 1, 0);        // hoisted: update() runs every tick (ARCH §5.1 no per-frame allocation)
  return {
    set(lhOn, craneLit) { lh.visible = lhOn; craneOn = craneLit; cr.visible = craneLit; },
    update(t) {
      beam.rotation.set(0, 0, 0);
      pivot.rotation.set(0, 0, 0);
      pivot.quaternion.setFromUnitVectors(Y_UP, fr.up);
      pivot.rotateY(t * 0.9);
      if (craneOn) cr.visible = (t % 1) < 0.5;          // 1 Hz blink (GDD §5.7)
    },
  };
}
export { cylX, bench, degFor };
