// src/world/colliders.ts — owner B. Planet colliders derived from the layout (GDD §5.5 gates, §5.6 boundary). Pure.
// Boxes on the chart; long walls/rails are split into ≤ 3.5 m boxes so the tangent-plane test stays accurate.
import type { ColliderDef } from '../contracts';
import type { GateId } from '../types';
import { DEG } from '../core/planet';
import { northStairH, southStairH } from './heights';
import {
  add, ch, degFor, dirAt, fl, headingOf, inLon, len, lerp2, lonSpan, norm360, rectPoint, sub, type P2, type Rect,
} from './geo';
import {
  ALLEY, B1_GATE, B2_GATE, BOAT, BRIDGE, BUS, ESTATE, LIGHTHOUSE, MIRROR, PIER, R, ROCK, SITE, STORE, STUDIO_FRONT, SUBWAY,
  TEMPLE, alleyDir, alleyWest, b1Point, b1Rect, b2Point, b2Rect, plan, props,
} from './layout';

export interface WorldCollider extends ColliderDef { gate?: GateId }
type HR = readonly [number, number];
/** Low shore walls stop the walker (h 0) but let the follow-camera boom (h ≥ 1.5) hang out over the sea. */
const LOW: HR = [-1, 1.3];
/** P3-look (L1): walker-only band for thin street props (poles, posts, bollards, < 0.3 m) and low furniture: they stop
 *  the walker (feet h ≤ 1.3, incl. the pier deck and the alley ramp) but not the follow-camera boom (pivot h 1.5), which
 *  used to hug every lamp post. What the boom then passes through is screen-door faded by render's see-through cone. */
const WALKER: HR = [-1, 1.3];
/** Rail tops: a rail blocks the boom only up to the rail top (walk surface + RAIL_TOP), not 60 m up (L1). */
const RAIL_TOP = 1.2;

export function rectBox(rc: Rect, tag: string, hRange?: HR): WorldCollider {
  return { scene: 'planet', shape: { kind: 'box', at: ch(rc.c), headingDeg: rc.hdg, halfW: rc.hw, halfD: rc.hd }, tag, hRange };
}
export function circle(p: P2, radius: number, tag: string, hRange?: HR): WorldCollider {
  return { scene: 'planet', shape: { kind: 'circle', at: ch(p), radius }, tag, hRange };
}
/** Straight wall a → b (flat), thickness t, split into ≤ maxSeg boxes. */
export function wallLine(a: P2, b: P2, t: number, tag: string, hRange?: HR, maxSeg = 3.5): WorldCollider[] {
  const L = len(sub(b, a));
  const n = Math.max(1, Math.ceil(L / maxSeg));
  const out: WorldCollider[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = lerp2(a, b, i / n), p1 = lerp2(a, b, (i + 1) / n), c = lerp2(p0, p1, 0.5);
    out.push({
      scene: 'planet', tag, hRange,
      shape: { kind: 'box', at: ch(c), headingDeg: headingOf(c, sub(p1, p0)), halfW: t / 2, halfD: len(sub(p1, p0)) / 2 + 0.05 },
    });
  }
  return out;
}
/** Arc wall at radius r from lon a eastward to lon b. */
export function wallArc(r: number, a: number, b: number, t: number, tag: string, hRange?: HR, seg = 3): WorldCollider[] {
  const span = lonSpan(a, b);
  const n = Math.max(1, Math.ceil((r * span * Math.PI) / 180 / seg));
  const out: WorldCollider[] = [];
  for (let i = 0; i < n; i++) out.push(...wallLine(fl(r, a + (span * i) / n), fl(r, a + (span * (i + 1)) / n), t, tag, hRange, 99));
  return out;
}
export function radialWall(lon: number, r0: number, r1: number, t: number, tag: string, hRange?: HR): WorldCollider[] {
  return wallLine(fl(r0, lon), fl(r1, lon), t, tag, hRange);
}
/** A stair side rail at radius r from lon a eastward to lon b, in ≤ 0.5 m pieces, each stopping at its own rail top
 *  (the mean stair surface under the piece + RAIL_TOP, i.e. 1.06–1.34 m over the treads beside it on the 0.55 slope:
 *  above the 1.0 m handrail, below the 1.5 m boom pivot of a player on the flight; `hAt(lon)` = stair height). */
export function stairRail(r: number, a: number, b: number, tag: string, hAt: (lon: number) => number): WorldCollider[] {
  const span = lonSpan(a, b);
  const n = Math.max(1, Math.ceil((r * span * Math.PI) / 180 / 0.5));
  const out: WorldCollider[] = [];
  const piece = (l0: number, l1: number) => {
    const lo = Math.min(hAt(l0), hAt(l1));
    const top = (hAt(l0) + hAt(l1)) / 2 + RAIL_TOP;
    // P3r3 G3: where the flight is over head height the rail only keeps the walker ON the flight; people on the lawn
    // walk under it (a full-height rail there was an invisible wall across the obvious uphill route after P1)
    const bottom = lo >= STAIR_HEADROOM - 1e-3 ? lo - 1 : -1;
    out.push(...wallLine(fl(r, l0), fl(r, l1), 0.2, tag, [bottom, top], 99));
  };
  for (let i = 0; i < n; i++) {
    const l0 = a + (span * i) / n, l1 = a + (span * (i + 1)) / n;
    const h0 = hAt(l0) - STAIR_HEADROOM, h1 = hAt(l1) - STAIR_HEADROOM;
    if (h0 * h1 < 0) {
      // the piece where the flight reaches head height is split there, so the open part starts exactly at it
      let lo = l0, hi = l1;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if ((hAt(m) - STAIR_HEADROOM) * h0 > 0) lo = m; else hi = m; }
      piece(l0, (lo + hi) / 2); piece((lo + hi) / 2, l1);
    } else piece(l0, l1);
  }
  return out;
}
/** P3r3 G3: stair surface height above which a ground walker passes under a flight (side stringers ≈ 0.46 m lower, ≈ 2 m clear). */
export const STAIR_HEADROOM = 2.45;
/** Rect shrunk to its back part (arcade buildings: the enclosed shop box behind the arcade). */
export function backPart(rc: Rect, cut: number): Rect {
  const f = dirAt(rc.c, rc.hdg);
  return { c: add(rc.c, f, -cut / 2), hdg: rc.hdg, hw: rc.hw, hd: rc.hd - cut / 2 };
}

/** Every planet collider, with gate-controlled ones marked. */
export function planetColliders(): WorldCollider[] {
  const out: WorldCollider[] = [];
  const P = (...c: WorldCollider[]) => out.push(...c);

  // ---- buildings (rows)
  for (const b of plan().bldgs) {
    if (!b.collide) continue;
    if (b.arcade > 0) {
      P(rectBox(backPart(b.rect, b.arcade), `bldg:${b.id}`));
      const n = Math.max(2, Math.round((b.rect.hw * 2) / 3) + 1);
      for (let i = 0; i < n; i++) {
        const x = -b.rect.hw + 0.25 + ((b.rect.hw * 2 - 0.5) * i) / (n - 1);
        P(circle(rectPoint(b.rect, x, b.rect.hd - 0.3), 0.2, `col:${b.id}`, WALKER));
      }
    } else P(rectBox(b.rect, `bldg:${b.id}`));
  }
  // ---- back ring behind the inner rows (seals the back alley r 13–22; the park railing is part of it)
  P(...wallArc(R.backRing, 176, 97.2, 0.4, 'ring:back'));
  P(...wallArc(R.backRing, 104.9, 112.6, 0.4, 'ring:back2'));
  // ---- retaining wall r 13 with the hill-path gap at lon 145 (GDD §5.6)
  P(...wallArc(R.hill, 149.4, 140.6, 0.5, 'wall:hill'));

  // ---- store + locker (flush front at r 29, locker face at r 29.4)
  P(rectBox(storeRect(), 'bldg:store'));
  P(...wallArc(29.15, STORE.lonA + 0.4, 57.4, 0.5, 'locker', [-1, 2.3]));      // L1: the boom may pass over it
  // ---- cat-ear alley: flank buildings and the studio (GDD §5.3 #4–5)
  for (const rc of alleyFlanks()) P(rectBox(rc, 'bldg:alley'));
  P(...wallLine(...alleyEastWall(), 0.3, 'alley:wall'));
  P(rectBox(studioRect(), 'bldg:studio'));
  P(circle(fl(MIRROR.r, MIRROR.lon), 0.1, 'mirror'));

  // ---- estate (GDD §5.3 #6)
  P(rectBox(b2Rect(), 'bldg:b2'));
  P(rectBox(b1UnitRect(), 'bldg:b1', [-1, 17]));
  for (const r of [15.8, 19, 22.1, 25.2, 27.9]) P(circle(b1Point(r, 3.38), 0.16, 'b1:col', WALKER));
  P(rectBox(fireLadderRect(), 'b1:ladder', [-1, 17]));
  P(...wallLine(b2Point(12.6, -3.1), b2Point(29.0, -3.1), 0.3, 'estate:west'));
  P(...wallLine(b1Point(12.6, -3.6), b1Point(29.0, -3.6), 0.3, 'estate:east'));
  const gl = ESTATE.gateLon, gh = ESTATE.gateHalfDeg;
  const westEnd = norm360((Math.atan2(b2Point(ESTATE.frontR, -3.1).x, b2Point(ESTATE.frontR, -3.1).z) * 180) / Math.PI);
  const eastEnd = norm360((Math.atan2(b1Point(ESTATE.frontR, -3.6).x, b1Point(ESTATE.frontR, -3.6).z) * 180) / Math.PI);
  P(...wallArc(ESTATE.frontR, westEnd - 0.5, gl - gh, 0.3, 'estate:front'));
  P(...wallArc(ESTATE.frontR, gl + gh, eastEnd + 0.5, 0.3, 'estate:front'));
  for (const c of wallArc(ESTATE.frontR, gl - gh, gl + gh, 0.4, 'gate:estate')) P({ ...c, gate: 'gate_estate' });
  P(rectBox(guardBoothRect(), 'estate:booth'));
  // B1 roof: parapet ring (only while up there) + coop / water tank
  const rc = b1Rect();
  const corner = (x: number, z: number) => rectPoint(rc, x, z);
  const hw = rc.hw - 0.15, hd = rc.hd - 0.15, roofHR: HR = [16.5, 22];
  P(...wallLine(corner(-hw, -hd), corner(hw, -hd), 0.3, 'roof:edge', roofHR));
  P(...wallLine(corner(hw, -hd), corner(hw, hd), 0.3, 'roof:edge', roofHR));
  P(...wallLine(corner(hw, hd), corner(-hw, hd), 0.3, 'roof:edge', roofHR));
  P(...wallLine(corner(-hw, hd), corner(-hw, -hd), 0.3, 'roof:edge', roofHR));
  P(rectBox(coopRect(), 'roof:coop', roofHR));
  P(circle(b1Point(25.6, -1.2), 0.85, 'roof:tank', roofHR));

  // ---- hilltop temple (colliders only up on the plateau)
  const up: HR = [2.5, 60];
  P(rectBox(shrineRect(), 'temple:shrine', up));
  P(rectBox({ c: fl(TEMPLE.lionL.r, TEMPLE.lionL.lon), hdg: 180, hw: 0.45, hd: 0.7 }, 'temple:lion', up));
  P(rectBox({ c: fl(TEMPLE.lionR.r, TEMPLE.lionR.lon), hdg: 180, hw: 0.45, hd: 0.7 }, 'temple:lion', up));
  P(circle(fl(TEMPLE.donation.r, TEMPLE.donation.lon), 0.4, 'temple:box', up));
  P(circle(fl(TEMPLE.burner.r, TEMPLE.burner.lon), 0.34, 'temple:burner', up));
  P(circle(fl(TEMPLE.banyan.r, TEMPLE.banyan.lon), 1.1, 'banyan', up));

  // ---- footbridge (GDD §5.6): pillars under, rails up, blockers under the stairs
  const L = BRIDGE.lon, deckRail: HR = [4, BRIDGE.deckH + RAIL_TOP];
  const across = (r: number, a: number) => add(fl(r, L), dirAt(fl(r, L), 90), a);
  for (const r of [28.8, 39.2]) for (const a of [-1.2, 1.2]) P(circle(across(r, a), 0.22, 'bridge:pillar', WALKER));
  P(...wallLine(across(BRIDGE.deckR0, -BRIDGE.halfW), across(BRIDGE.deckR1, -BRIDGE.halfW), 0.2, 'bridge:rail', deckRail));
  P(...wallLine(across(BRIDGE.deckR0, BRIDGE.halfW), across(BRIDGE.deckR1, BRIDGE.halfW), 0.2, 'bridge:rail', deckRail));
  P(...wallLine(across(BRIDGE.deckR0 - 0.1, 0.2), across(BRIDGE.deckR0 - 0.1, BRIDGE.halfW), 0.2, 'bridge:rail', deckRail));
  P(...wallLine(across(BRIDGE.deckR1 + 0.1, -BRIDGE.halfW), across(BRIDGE.deckR1 + 0.1, -0.2), 0.2, 'bridge:rail', deckRail));
  const N = BRIDGE.north, S = BRIDGE.south;
  // stair side rails: from where the stair is ≥ 0.45 m up (below that you may step on/off sideways); they block the
  // ground too while the flight is low, and only the flight itself once it is over head height (G3 below).
  const nBot = N.lonBot - (0.45 / BRIDGE.deckH) * (N.lonBot - N.lonTop);
  const sBot = S.lonBot + (0.45 / BRIDGE.deckH) * (S.lonTop - S.lonBot);
  // L1: each ≤ 1 m rail piece stops at its own rail top (stair surface + RAIL_TOP, following the slope), so the camera
  // boom can swing over a rail instead of collapsing onto the phone head (they used to be 60 m tall walls).
  const nH = (lon: number) => northStairH(fl(N.r, lon).x, fl(N.r, lon).z) ?? 0;
  const sH = (lon: number) => southStairH(fl(S.r, lon).x, fl(S.r, lon).z) ?? 0;
  P(...stairRail(N.r - N.halfW - 0.1, N.lon0, nBot, 'stairN:rail', nH));
  P(...stairRail(N.r + N.halfW + 0.1, N.lonTop + 0.15, nBot, 'stairN:rail', nH));
  // P3r3 G3: the landing end walls start at the landing (5.5 m up), and the ground cross walls under the flights are
  // gone — the space under a flight is open lawn; its support columns (landmarks.ts stair()) are what stops a walker
  const landing: HR = [BRIDGE.deckH - 1, BRIDGE.deckH + RAIL_TOP];
  P(...radialWall(N.lon0, N.r - N.halfW - 0.1, N.r + N.halfW + 0.1, 0.2, 'stairN:end', landing));
  P(...stairRail(S.r - S.halfW - 0.1, sBot, S.lonTop - 0.15, 'stairS:rail', sH));
  P(...stairRail(S.r + S.halfW + 0.1, sBot, S.lon0, 'stairS:rail', sH));
  P(...radialWall(S.lon0, S.r - S.halfW - 0.1, S.r + S.halfW + 0.1, 0.2, 'stairS:end', landing));
  for (const s of [N, S]) {
    // the columns under each flight (3 of every 8 segments where the flight is > 1.5 m up) and the landing column
    for (let i = 1; i < 8; i += 3) {
      const t1 = (i + 1) / 8;
      if (BRIDGE.deckH * t1 > 1.5) P(circle(fl(s.r, s.lonBot + (s.lonTop - s.lonBot) * t1), 0.2, 'stair:col', WALKER));
    }
    P(circle(fl(s.r, (s.lonTop + s.lon0) / 2), 0.24, 'stair:col', WALKER));
  }

  // ---- gates B1 / B2 (GDD §5.5)
  for (const c of radialWall(B1_GATE.lon, 27.0, 39.6, 0.3, 'gate:roadwork')) P({ ...c, gate: 'gate_roadwork' });
  for (const c of radialWall(B2_GATE.lon, B2_GATE.r0, B2_GATE.r1, 0.4, 'gate:tide')) P({ ...c, gate: 'gate_tide' });

  // ---- shoreline boundary (GDD §5.6): seawall rail r 48 (pier gap), wave wall r 62, joins
  const gap = degFor(R.seawall, PIER.halfW + 0.05);
  P(...wallArc(R.seawall, 300, PIER.lon - gap, 0.6, 'seawall', LOW));
  P(...wallArc(R.seawall, PIER.lon + gap, 60, 0.6, 'seawall', LOW));
  P(...wallArc(R.wave + 0.2, 60, 300, 0.6, 'wavewall', LOW));
  P(...radialWall(300, R.seawall, R.wave + 0.2, 0.5, 'shore:join'));
  P(...radialWall(61.5, 42.4, R.wave + 0.2, 0.5, 'shore:join'));
  // outer backs and the site enclosure
  P(...wallArc(47.6, 61.5, 195, 0.4, 'back:outer'));
  P(...wallArc(50.4, 195, 220.5, 0.4, 'back:market'));
  P(...wallArc(45.4, 220.5, SITE.hoardLon0, 0.4, 'back:paper'));
  P(...radialWall(195, 47.2, 50.7, 0.4, 'back:join'));
  P(...radialWall(220.5, 44.9, 50.7, 0.4, 'back:join'));
  P(...radialWall(SITE.hoardLon0, 44, R.wave + 0.2, 0.4, 'site:fence'));
  P(...wallArc(SITE.hoardR, SITE.hoardLon0, SITE.hoardLon1, 0.35, 'site:hoarding'));
  P(...radialWall(SITE.hoardLon1, SITE.hoardR, R.wave + 0.2, 0.4, 'site:fence'));
  P(rectBox(warehouseRect(), 'bldg:warehouse'));
  // market shed columns + stalls, paper shop displays
  for (const c of marketColliders()) P(c);
  // net poles (not at the dot's lon: the pickup point is under the net)
  for (let lon = SITE.netLon0; lon <= SITE.netLon1 + 0.01; lon += 3.2) if (Math.abs(lon - 257.5) > 1.2) P(circle(fl(SITE.netR, lon), 0.1, 'net:pole', WALKER));
  // L2: the whole 2.2 × 2 m stack up to the pipe top (1.75 m): the old r 0.95 circle below 0.5 m let the dialogue camera
  // sit inside/behind the pipes while filming 小刘
  P(rectBox({ c: fl(SITE.pipes.r, SITE.pipes.lon), hdg: 90, hw: 1.15, hd: 1.0 }, 'site:pipes', [-1, 1.85]));
  for (const [r, lon, rad] of RUBBLE) P(circle(fl(r, lon), rad * 0.8, 'site:rubble'));
  P(circle(fl(SITE.crane.r, SITE.crane.lon), 1.2, 'crane'));
  // subway entrance: side walls of the landing + the grille line (the stairs are a pit; entry is by interact)
  const sw = (off: number, r: number) => add(fl(r, SUBWAY.lon), dirAt(fl(r, SUBWAY.lon), 90), off);
  P(...wallLine(sw(-SUBWAY.halfW - 0.15, SUBWAY.stairR1), sw(-SUBWAY.halfW - 0.15, SUBWAY.landR1 - 0.2), 0.3, 'subway:side'));
  P(...wallLine(sw(SUBWAY.halfW + 0.15, SUBWAY.stairR1), sw(SUBWAY.halfW + 0.15, SUBWAY.landR1 - 0.2), 0.3, 'subway:side'));
  P(...wallLine(sw(-SUBWAY.halfW - 0.2, SUBWAY.grilleR), sw(SUBWAY.halfW + 0.2, SUBWAY.grilleR), 0.3, 'subway:grille'));

  // ---- pier, rock platform, lighthouse (GDD §5.6)
  const LOWP: HR = [-1, 1.9];                       // pier deck h 0.6: rails block the walker, not the camera boom
  const pa = (r: number, a: number) => add(fl(r, PIER.lon), dirAt(fl(r, PIER.lon), 90), a);
  const B = PIER.bench;
  for (const s of [-1, 1]) {
    P(...wallLine(pa(PIER.r0 + 0.35, s * (PIER.halfW + 0.12)), pa(B.r0, s * (PIER.halfW + 0.12)), 0.2, 'pier:rail', LOWP));
    P(...wallLine(pa(B.r0, s * (PIER.halfW + 0.12)), pa(B.r0, s * (B.bulgeHalfW + 0.12)), 0.2, 'pier:rail', LOWP));
    P(...wallLine(pa(B.r0, s * (B.bulgeHalfW + 0.12)), pa(B.r1, s * (B.bulgeHalfW + 0.12)), 0.2, 'pier:rail', LOWP));
    P(...wallLine(pa(B.r1, s * (B.bulgeHalfW + 0.12)), pa(B.r1, s * (PIER.halfW + 0.12)), 0.2, 'pier:rail', LOWP));
    P(...wallLine(pa(B.r1, s * (PIER.halfW + 0.12)), pa(ROCK.r0 + 0.1, s * (PIER.halfW + 0.12)), 0.2, 'pier:rail', LOWP));
  }
  const stepGap = degFor(ROCK.r0, PIER.halfW + 0.1);
  const ROCKR: HR = [-1, 2.8];
  P(...wallArc(ROCK.r1 - 0.15, ROCK.lon0, ROCK.lon1, 0.3, 'rock:rail', ROCKR));
  P(...radialWall(ROCK.lon0, ROCK.r0, ROCK.r1, 0.3, 'rock:rail', ROCKR));
  P(...radialWall(ROCK.lon1, ROCK.r0, ROCK.r1, 0.3, 'rock:rail', ROCKR));
  P(...wallArc(ROCK.r0, PIER.lon + stepGap, ROCK.lon1, 0.3, 'rock:rail', [1, 2.8]));
  P(...wallArc(ROCK.r0, ROCK.lon0, PIER.lon - stepGap, 0.3, 'rock:rail', [1, 2.8]));
  P(circle(fl(LIGHTHOUSE.r, LIGHTHOUSE.lon), LIGHTHOUSE.baseR + 0.05, 'lighthouse'));

  // ---- bus stop, boat
  P(...wallArc(BUS.r + 0.85, BUS.shelterLon - BUS.halfDeg, BUS.shelterLon + BUS.halfDeg, 0.15, 'bus:panel', [-1, 2.9]));
  for (const lon of [BUS.shelterLon - BUS.halfDeg + 0.4, BUS.shelterLon + BUS.halfDeg - 0.4]) P(circle(fl(BUS.r - 0.8, lon), 0.08, 'bus:post', WALKER));
  P(circle(fl(38.2, 354.2), 0.1, 'bus:sign', WALKER));
  // P3r2 look L5: the shelter roof slab (h 2.55–2.8, landmarks.ts busStop) is a ceiling for the follow boom: the lifted
  // boom used to pass through it and park the camera ON the roof in the first seconds of play (hero hidden under it)
  P(rectBox({ c: fl(BUS.r, BUS.shelterLon), hdg: 90, hw: 1.1, hd: (BUS.r * BUS.halfDeg * 2 * DEG) / 2 + 0.15 }, 'bus:roof', [2.3, 3.1]));
  P(rectBox(boatRect(), 'boat'));

  // ---- street furniture
  for (const pr of props()) {
    // L1: thin posts and low furniture are walker-only (WALKER); tall boxes stop the boom only up to their top
    if (pr.kind === 'lamp' || pr.kind === 'pole' || pr.kind === 'hydrant' || pr.kind === 'bollard' || pr.kind === 'mailbox') P(circle(pr.p, 0.14, pr.kind, WALKER));
    else if (pr.kind === 'tree') P(circle(pr.p, 0.3 * (pr.s ?? 1), 'tree'));
    else if (pr.kind === 'vending' || pr.kind === 'phonebox') P(rectBox({ c: pr.p, hdg: pr.hdg, hw: 0.55, hd: 0.45 }, pr.kind, [-1, 2.4]));
    else if (pr.kind === 'bin' || pr.kind === 'planter') P(circle(pr.p, 0.35, pr.kind, WALKER));
    else if (pr.kind === 'bike' || pr.kind === 'scooter') P(rectBox({ c: pr.p, hdg: pr.hdg + 90, hw: 0.2, hd: 0.8 }, pr.kind, WALKER));
    else if (pr.kind === 'netrack' || pr.kind === 'crate') P(circle(pr.p, 0.45, pr.kind, [-1, 2]));
    else if (pr.kind === 'rock' && Math.hypot(pr.p.x, pr.p.z) < 62 && inLon(norm360((Math.atan2(pr.p.x, pr.p.z) * 180) / Math.PI), 300, 60)) P(circle(pr.p, 0.8, 'rock'));
  }
  // park kiosk
  P(rectBox(kioskRect(), 'kiosk'));
  return out;
}

// ---------------------------------------------------------------- shared rects (meshes and colliders agree)
export function storeRect(): Rect {
  const a = STORE.lonA, b = STORE.lonB, mid = (a + b) / 2;
  const w = ((29 * (b - a)) * Math.PI) / 180;
  return { c: fl(25.5, mid), hdg: 180, hw: w / 2 + 0.05, hd: 3.5 };
}
/** The two flank buildings of the alley (west, east), long sides on the alley walls. */
export function alleyFlanks(): Rect[] {
  return [alongAlley(-0.12, 1.12, 1, 5.2), alongAlley(-0.1, 0.6, -1, 2.8)];
}
/** A rect beside the alley from t0 → t1 (0 = mouth, 1 = studio door), on side s (+1 west, −1 east), `depth` deep. */
export function alongAlley(t0: number, t1: number, s: number, depth: number): Rect {
  const Lm = len(sub(ALLEY.end, ALLEY.mouth));
  const mid = lerp2(ALLEY.mouth, ALLEY.end, (t0 + t1) / 2);
  const c = add(mid, alleyWest, s * (ALLEY.halfW + depth / 2));
  const inward = { x: -alleyWest.x * s, z: -alleyWest.z * s };
  return { c, hdg: headingOf(c, inward), hw: (Lm * (t1 - t0)) / 2, hd: depth / 2 };
}
/** The garden wall on the alley's east side beyond the east flank (t 0.55 → 1.15). */
export function alleyEastWall(): [P2, P2] {
  const Lm = len(sub(ALLEY.end, ALLEY.mouth));
  const a = add(add(ALLEY.mouth, alleyDir, Lm * 0.55), alleyWest, -(ALLEY.halfW + 0.15));
  const b = add(add(ALLEY.mouth, alleyDir, Lm * 1.15), alleyWest, -(ALLEY.halfW + 0.15));
  return [a, b];
}
export function studioRect(): Rect {
  const c = add(STUDIO_FRONT, alleyDir, 1.5);
  return { c, hdg: headingOf(c, { x: -alleyDir.x, z: -alleyDir.z }), hw: 3.2, hd: 1.5 };
}
export function b1UnitRect(): Rect {
  const rc = b1Rect();
  const f = dirAt(rc.c, rc.hdg);
  const front = rc.hd - ESTATE.b1.gallery;               // door wall offset from the centreline
  return { c: add(rc.c, f, (front - rc.hd) / 2), hdg: rc.hdg, hw: rc.hw, hd: (front + rc.hd) / 2 };
}
/** Fire ladder cage at B1's tail, inside the gallery footprint (GDD sp_fire_ladder). */
export function fireLadderRect(): Rect {
  const c = b1Point(ESTATE.b1.r0 + 0.45, ESTATE.b1.w / 2 - 0.6);
  return { c, hdg: 270, hw: 0.45, hd: 0.55 };
}
export function coopRect(): Rect { const c = b1Point(17.6, 0.6); return { c, hdg: 0, hw: 1.0, hd: 0.7 }; }
export function guardBoothRect(): Rect { return { c: fl(27.0, ESTATE.gateLon + 5.2), hdg: 180, hw: 0.9, hd: 0.9 }; }
export function shrineRect(): Rect {
  const s = TEMPLE.shrine;
  const front = fl(s.frontR, s.lon), c = add(front, dirAt(front, 0), s.d / 2);
  return { c, hdg: 180, hw: s.w / 2, hd: s.d / 2 };
}
export function warehouseRect(): Rect { return { c: fl(50, 292), hdg: 0, hw: 5.2, hd: 5.5 }; }
export function kioskRect(): Rect { return { c: fl(26.2, 353.5), hdg: 180, hw: 1.1, hd: 0.9 }; }
export function boatRect(): Rect { return { c: fl(BOAT.r, BOAT.lon), hdg: 90, hw: BOAT.beam / 2, hd: BOAT.len / 2 }; }
export const RUBBLE: readonly [number, number, number][] = [
  [52, 276, 1.4], [55, 281, 1.8], [44.5, 281, 1.1], [57, 272, 1.5], [50.5, 284, 1.2], [58.5, 283, 1.4],
];
export const MARKET = { lon0: 195, lon1: 220.5, r0: 39.6, r1: 50.2, colsLon: [196, 202.5, 208.5, 214.5, 219.8] } as const;
export const PAPER = { lon0: 223, lon1: 229.5, r0: 39.3, r1: 44.9 } as const;
function marketColliders(): WorldCollider[] {
  const out: WorldCollider[] = [];
  for (const lon of MARKET.colsLon) for (const r of [MARKET.r0 + 0.3, 45, MARKET.r1 - 0.3]) out.push(circle(fl(r, lon), 0.15, 'market:col', WALKER));
  // stall tables (leave the tank stand-point at (39.2, 200) free)
  for (const [r, lon, hw, hd] of MARKET_STALLS) out.push(rectBox({ c: fl(r, lon), hdg: 0, hw, hd }, 'market:stall'));
  out.push(rectBox({ c: fl(41.6, 200), hdg: 0, hw: 0.9, hd: 0.4 }, 'market:tank'));
  // paper shop: side walls + displays kept clear of zp1–zp4
  out.push(rectBox({ c: fl(44.2, 224.2), hdg: 0, hw: 0.6, hd: 0.5 }, 'paper:villa'));
  out.push(rectBox({ c: fl(40.4, 229), hdg: 0, hw: 0.35, hd: 0.6 }, 'paper:horse'));
  return out;
}
export const MARKET_STALLS: readonly [number, number, number, number][] = [
  [43.5, 205.5, 1.4, 0.55], [43.5, 211.5, 1.4, 0.55], [47.2, 203.5, 1.6, 0.5], [47.2, 210, 1.6, 0.5], [47.2, 216.5, 1.3, 0.5],
  [43.5, 217.2, 1.1, 0.55],
];
export { B2_GATE };
