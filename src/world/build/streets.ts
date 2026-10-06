// src/world/build/streets.ts — owner B. Street furniture from layout.props(), overhead cables (lots of them: a
// signature of the reference and of Chinese streets, ART §2.1), manholes and drains.
import { PAL } from '../../art/palette';
import { placeMatrix } from '../../core/planet';
import { createRng } from '../../core/rng';
import { add, ch, dirAt, fl, inLon, type P2 } from '../geo';
import { props } from '../layout';
import { SID, type BuildCtx } from '../kit/building';
import { cable, propInstance, type PoleTop } from '../kit/props';
import { box, cyl, quad } from '../kit/prims';

export interface LampSpot { p: P2; h: number }

export function buildStreets(c: BuildCtx): LampSpot[] {
  const lamps: LampSpot[] = [];
  const poles: PoleTop[] = [];
  for (const pr of props()) {
    const top = propInstance(c, pr, lamps);
    if (top) poles.push(top);
  }
  // cables: pole → next pole along the inner sidewalk (2 wires), plus drops to the inner façades and across the road
  const rng = createRng(0xcab1e);
  poles.sort((a, b) => lonOf(a.p) - lonOf(b.p));
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i], b = poles[(i + 1) % poles.length];
    const gap = ((lonOf(b.p) - lonOf(a.p)) + 360) % 360;
    if (gap < 25) {
      for (const off of [-0.7, 0.7]) cable(c, add(a.p, a.arm, off), a.h, add(b.p, b.arm, off), b.h, rng.range(0.03, 0.06));
    }
    // a drop to the building behind (r 29, inner façade at h ~6)
    const l = lonOf(a.p);
    if (!inLon(l, 113, 168)) cable(c, a.p, a.h - 0.3, fl(28.95, l + rng.range(-4, 4)), rng.range(5.2, 6.6), 0.05, 0.022);
    // across the road to the outer row (not over the bridge deck / the sea side)
    if (inLon(l, 62, 236) && rng.next() < 0.7) cable(c, a.p, a.h, fl(39.3, l + rng.range(-5, 5)), rng.range(5.5, 7), rng.range(0.04, 0.07), 0.022);
    if (inLon(l, 62, 236) && rng.next() < 0.4) cable(c, add(a.p, a.arm, 0.7), a.h, fl(39.3, l + rng.range(-8, 8)), rng.range(6, 7.2), 0.06, 0.02);
  }
  // manholes + drains (road dressing)
  for (let lon = 7; lon < 360; lon += 23) {
    const M = placeMatrix('planet', { r: 35.2, lon, h: 0.012 }, 0);
    c.B.add('detail', quad(0.75, 0.75, 0, 0, 0, 'y'), M, '#ffffff', SID.paint + 3, {
      uv: c.T.art('manhole', 48, 48, (g, w, h) => {
        g.fillStyle = PAL.road; g.fillRect(0, 0, w, h);
        g.fillStyle = PAL.roadFar; g.beginPath(); g.arc(w / 2, h / 2, w * 0.45, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2f3a3f'; g.lineWidth = 2.5; g.stroke();
        g.lineWidth = 1.2; g.beginPath(); for (let k = -3; k <= 3; k++) { g.moveTo(w / 2 + k * 5, 8); g.lineTo(w / 2 + k * 5, h - 8); } g.stroke();
      }),
      label: 'road',
    });
  }
  for (let lon = 3; lon < 360; lon += 13) {
    for (const r of [31.25, 36.75]) {
      const M = placeMatrix('planet', { r, lon, h: 0.1 }, 0);
      c.B.add('detail', quad(0.3, 0.6, 0, 0, 0, 'y'), M, '#ffffff', SID.paint + 4, { uv: c.T.panel('drain', PAL.cable, 'grid') });
    }
  }
  // a few fire hydrant-ish bollards along the park railing
  for (let lon = 351; lon < 369; lon += 3) {
    const l = lon % 360;
    const M = placeMatrix('planet', { r: 22.1, lon: l, h: 0 }, 0);
    c.B.add('solid', cyl(0.05, 0.05, 1.05, 5), M, PAL.steelGreen, 182, { label: 'bollard' });
  }
  for (let lon = 350; lon < 369; lon += 3) {
    const M = placeMatrix('planet', { r: 22.1, lon: (lon + 1.5) % 360, h: 0 }, 90);
    const len = 22.1 * 3 * Math.PI / 180 + 0.05;
    c.B.add('detail', box(0.05, 0.05, len, 0, 1.0, 0), M, PAL.steelGreen, 183);
    c.B.add('detail', box(0.04, 0.04, len, 0, 0.5, 0), M, PAL.steelGreen, 183);
    void dirAt; void ch; void quad;
  }
  return lamps;
}

function lonOf(p: P2): number { return ((Math.atan2(p.x, p.z) * 180) / Math.PI + 360) % 360; }
