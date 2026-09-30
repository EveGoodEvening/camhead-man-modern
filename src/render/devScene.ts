// src/render/devScene.ts — owner A. DEV ONLY (`?dev=render:scene`): a representative street around the bus stop so the
// look can be judged before B's town lands (buildings with façade detail, green footbridge, poles + cables, trees,
// street lamps, night windows, a paper effigy in spirit ink). Everything goes through makeToonMaterial + core/planet.
import {
  BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, IcosahedronGeometry, Matrix4, Mesh, PlaneGeometry,
  TubeGeometry, Vector3, type BufferGeometry,
} from 'three';
import type { Core, RenderApi } from '../contracts';
import type { ChartPos } from '../types';
import { PAL } from '../art/palette';
import { mergePainted, paint, contactBand } from '../core/geom';
import { placeMatrix, posToWorld, wrapGeometry } from '../core/planet';
import { makeToonMaterial } from './materials';

let sidN = 20;
const nid = () => { sidN = (sidN % 180) + 20; return sidN; };
const M = new Matrix4();
const at = (g: BufferGeometry, p: ChartPos, heading = 0) => g.applyMatrix4(placeMatrix('planet', p, heading, M));

interface Parts { body: BufferGeometry[]; leaves: BufferGeometry[]; panes: BufferGeometry[]; night: BufferGeometry[] }

function building(P: Parts, p: ChartPos, heading: number, w: number, d: number, h: number, wall: string, rng: () => number) {
  const g: BufferGeometry[] = [];
  g.push(contactBand(paint(new BoxGeometry(w, h + 0.3, d).translate(0, (h + 0.3) / 2 - 0.3, 0), wall, nid())));
  g.push(paint(new BoxGeometry(w + 0.5, 0.35, d + 0.5).translate(0, h + 0.1, 0), PAL.roofMauve, nid()));
  g.push(paint(new BoxGeometry(w + 0.12, 0.25, d + 0.12).translate(0, 3, 0), PAL.concrete, nid()));   // floor band
  const floors = Math.floor(h / 3), cols = Math.max(1, Math.floor(w / 2.4));
  const paneId = nid(), frameId = nid();
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = -w / 2 + (c + 0.5) * (w / cols), wy = f * 3 + 1.7;
      if (f === 0 && c === Math.floor(cols / 2)) {
        g.push(paint(new BoxGeometry(1.2, 2.2, 0.1).translate(wx, 1.1, d / 2 + 0.02), rng() < 0.5 ? PAL.ochre : PAL.blue, nid()));
        continue;
      }
      g.push(paint(new BoxGeometry(1.3, 1.5, 0.1).translate(wx, wy, d / 2 + 0.01), PAL.metalRail, frameId));
      const pane = paint(new BoxGeometry(1.1, 1.3, 0.1).translate(wx, wy, d / 2 + 0.04), PAL.glassDark, paneId);
      P.panes.push(at(pane, p, heading));
      const lit = rng();
      if (lit < 0.4) P.night.push(at(paint(new PlaneGeometry(1.1, 1.3).translate(wx, wy, d / 2 + 0.1), lit < 0.3 ? PAL.winWarm : PAL.winTv, 150), p, heading));
      if (f > 0 && (c + f) % 2 === 0) {
        g.push(paint(new BoxGeometry(0.8, 0.5, 0.45).translate(wx + 0.9, wy - 0.8, d / 2 + 0.22), PAL.metalRail, nid()));
      }
    }
  }
  P.body.push(at(mergePainted(g), p, heading));
}

function tree(P: Parts, p: ChartPos, s: number) {
  P.body.push(at(paint(new CylinderGeometry(0.14 * s, 0.22 * s, 3.2 * s, 6).translate(0, 1.5 * s, 0), PAL.trunk, nid()), p));
  const id = nid();
  for (let k = 0; k < 6; k++) {
    const a = k * 2.1;
    const g = new IcosahedronGeometry((1.1 + (k % 3) * 0.3) * s, 1)
      .translate(Math.cos(a) * 0.9 * s, (3.4 + (k % 2) * 0.9) * s, Math.sin(a) * 0.9 * s);
    P.leaves.push(at(paint(g, k % 4 === 0 ? PAL.foliageDeep : PAL.foliage, id), p));
  }
}

export function buildDevScene(core: Core, render: RenderApi): Group {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const P: Parts = { body: [], leaves: [], panes: [], night: [] };
  // inner row (fronts face seaward, heading 180) and outer row (fronts face uphill, heading 0)
  const inner: [number, number, number, number, string][] = [
    [12, 8, 7, 12, PAL.tilePink], [20, 7, 6, 9, PAL.plasterBeige], [58, 9, 7, 15, PAL.plasterWhite], [70, 8, 6, 9, PAL.tileWhite],
    [82, 7, 7, 12, PAL.concrete], [342, 8, 6, 6, PAL.plasterWhite],
  ];
  for (const [lon, w, d, h, c] of inner) building(P, { r: 25.5, lon }, 180, w, d, h, c, rng);
  const outer: [number, number, number, number, string][] = [
    [66, 9, 7, 9, PAL.plasterWhite], [78, 8, 7, 12, PAL.tilePink], [90, 9, 7, 6, PAL.plasterBeige], [102, 8, 6, 15, PAL.tileWhite],
  ];
  for (const [lon, w, d, h, c] of outer) building(P, { r: 43, lon }, 0, w, d, h, c, rng);
  // bus shelter (steel green frame + slate panel) and bench
  const sh: BufferGeometry[] = [];
  for (const x of [-1.6, 1.6]) sh.push(paint(new BoxGeometry(0.12, 2.4, 0.12).translate(x, 1.2, -0.6), PAL.steelGreen, 60));
  sh.push(paint(new BoxGeometry(3.6, 0.12, 1.6).translate(0, 2.45, 0), PAL.steelGreen, 61));
  sh.push(paint(new BoxGeometry(3.4, 1.6, 0.06).translate(0, 1.4, -0.7), PAL.signSlate, 62));
  sh.push(paint(new BoxGeometry(2.4, 0.1, 0.45).translate(0, 0.48, -0.35), PAL.ochre, 63));
  P.body.push(at(mergePainted(sh), { r: 40.3, lon: 358 }, 0));
  // boat on the slipway
  const boat = [paint(new BoxGeometry(2.6, 1.6, 7).translate(0, 1.4, 0), PAL.clothWhite, 70),
    paint(new BoxGeometry(2.62, 0.7, 7.02).translate(0, 0.75, 0), PAL.skyBlue, 71),
    paint(new BoxGeometry(2, 1.4, 2.4).translate(0, 2.9, -1), PAL.plasterWhite, 72),
    paint(new BoxGeometry(2.05, 0.2, 2.45).translate(0, 3.7, -1), PAL.orange, 73)];
  P.body.push(at(mergePainted(boat), { r: 44.5, lon: 6 }, 200));
  // footbridge at lon 30 (deck h 5.5, radial r 28 → 40)
  const br: BufferGeometry[] = [
    paint(new BoxGeometry(2.4, 0.6, 13).translate(0, 5.3, 0), PAL.steelGreen, 80),
    paint(new BoxGeometry(0.08, 1.0, 13).translate(1.15, 6.1, 0), PAL.steelGreen, 81),
    paint(new BoxGeometry(0.08, 1.0, 13).translate(-1.15, 6.1, 0), PAL.steelGreen, 81),
  ];
  for (const z of [-5.5, 5.5]) for (const x of [-0.9, 0.9]) br.push(paint(new BoxGeometry(0.4, 5.1, 0.4).translate(x, 2.5, z), PAL.steelGreen, 82));
  P.body.push(at(mergePainted(br), { r: 34, lon: 30 }, 0));
  // poles, cables and lamps along both sidewalks
  const cables: BufferGeometry[] = [];
  const poles: { r: number; lon: number }[] = [];
  for (let lon = -20; lon <= 110; lon += 11) for (const r of [30.2, 38.2]) poles.push({ r, lon: (lon + 360) % 360 });
  for (const p of poles) P.body.push(at(paint(new CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 3.8, 0), PAL.concrete, nid()), p));
  for (const r of [30.2, 38.2]) {
    const row = poles.filter((p) => p.r === r);
    for (let i = 0; i + 1 < row.length; i++) {
      for (const hh of [7.5, 7.1]) {
        const pts: Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const s = k / 12, lon = row[i].lon + ((((row[i + 1].lon - row[i].lon) + 540) % 360) - 180) * s;
          const l = (lon * Math.PI) / 180;
          pts.push(new Vector3(r * Math.sin(l), hh - Math.sin(Math.PI * s) * 0.6, r * Math.cos(l)));
        }
        cables.push(paint(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.025, 4), PAL.cable, 90));
      }
    }
  }
  for (let lon = -15; lon <= 105; lon += 15) {
    for (const r of [((lon + 15) / 15) % 2 ? 29.6 : 38.6]) {
      const p = { r, lon: (lon + 360) % 360 };
      const head = r < 34 ? 180 : 0;
      P.body.push(at(mergePainted([
        paint(new CylinderGeometry(0.07, 0.09, 4.6, 6).translate(0, 2.3, 0), PAL.signSlate, 95),
        paint(new BoxGeometry(0.12, 0.12, 1.2).translate(0, 4.6, 0.55), PAL.signSlate, 95),
        paint(new BoxGeometry(0.35, 0.18, 0.5).translate(0, 4.5, 1.1), PAL.metalRail, 96),
      ]), p, head));
      const lampAt = posToWorld('planet', { r: r + (r < 34 ? 1.1 : -1.1), lon: p.lon, h: 4.2 });
      render.registerLamp({ scene: 'planet', pos: lampAt, radius: 4.9, on: true });
    }
  }
  // trees in the pocket park and along the road
  for (const [r, lon, s] of [[26, 352, 1.1], [24, 2, 1.25], [27, 8, 0.9], [30.5, 45, 0.8], [41, 40, 1.0]] as const) tree(P, { r, lon }, s);
  // traffic cones + crates
  for (const [r, lon] of [[36.6, 14], [36.8, 15.2], [37.1, 16.5]] as const) {
    P.body.push(at(mergePainted([paint(new CylinderGeometry(0.05, 0.22, 0.7, 8).translate(0, 0.35, 0), PAL.orange, 100),
      paint(new CylinderGeometry(0.1, 0.13, 0.12, 8).translate(0, 0.42, 0), PAL.clothWhite, 101)]), { r, lon }));
  }
  const grp = new Group();
  grp.name = 'render:devScene';
  const body = new Mesh(mergePainted(P.body), makeToonMaterial({ vertexColors: true }));
  const leaves = new Mesh(mergePainted(P.leaves), makeToonMaterial({ vertexColors: true, flecks: true }));
  const panes = new Mesh(mergePainted(P.panes), makeToonMaterial({ vertexColors: true, lineWeight: 0.6 }));
  const cab = new Mesh(wrapGeometry(mergePainted(cables)), makeToonMaterial({ vertexColors: true, lineWeight: 0 }));
  const night = new Mesh(mergePainted(P.night), makeToonMaterial({ vertexColors: true, unlit: true, lineWeight: 0 }));
  night.name = 'render:devNightWindows';
  for (const m of [body, leaves, panes]) { m.castShadow = true; m.receiveShadow = true; }
  grp.add(body, leaves, panes, cab, night);
  // paper effigy (spirit ink, unlit paper, cinnabar cheeks)
  const eff = new Mesh(mergePainted([
    paint(new BoxGeometry(0.55, 1.1, 0.03).translate(0, 0.75, 0), PAL.spiritPaper, 241),
    paint(new BoxGeometry(0.42, 0.42, 0.03).translate(0, 1.55, 0), PAL.spiritPaper, 242),
    paint(new BoxGeometry(0.08, 0.06, 0.04).translate(-0.1, 1.5, 0.01), PAL.bannerRed, 243),
    paint(new BoxGeometry(0.08, 0.06, 0.04).translate(0.1, 1.5, 0.01), PAL.bannerRed, 243),
  ]), makeToonMaterial({ vertexColors: true, unlit: true, spiritImmune: true }));
  eff.applyMatrix4(placeMatrix('planet', { r: 37.8, lon: 4.5 }, 250, new Matrix4()));
  eff.castShadow = true;
  grp.add(eff);
  core.scenes.get('planet').add(grp);
  const syncNight = () => { night.visible = core.store.state.phase === 'night' || core.store.state.phase === 'dusk'; };
  syncNight();
  core.bus.on('phaseChanged', syncNight);
  core.bus.on('stateLoaded', syncNight);
  return grp;
}
