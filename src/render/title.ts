// src/render/title.ts — owner A. ART §6.3 title dressing: 6–10 islands with ~60 trees, rocks and tiny houses, plus a
// few boats, scattered over the far side (θ 0.8–2.4 rad from the town pole) so the ball reads inhabited all round.
// Static, merged into 2 meshes (body + foliage, same toon program), surface ids 190–199, no shadow casting.
// Visible only in wide views (camera > 25 m up: title orbit, ending pull-back); gameplay never draws it.
import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Matrix4, Mesh, Quaternion, Vector3,
  type BufferGeometry,
} from 'three';
import type { Rng } from '../contracts';
import { PAL } from '../art/palette';
import { paint, mergePainted } from '../core/geom';
import { PLANET_R, latLonToDir, orientationFromUpForward } from '../core/planet';
import { makeToonMaterial } from './materials';

const SID = (i: number) => 190 + (i % 10);           // A's title range 190–199 (ARCH §2.3)
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(1, 1, 1);
const _up = new Vector3(), _fw = new Vector3(), _ref = new Vector3(), _col = new Color();

/** Transform a Y-up local geometry to a point on the planet (lat/lon degrees, height above sea level, spin). */
function placeGeo(g: BufferGeometry, lat: number, lon: number, alt: number, spin: number, scale = 1): BufferGeometry {
  latLonToDir(lat, lon, _up);
  _ref.set(Math.cos(spin), 0.3, Math.sin(spin));
  _fw.copy(_ref).addScaledVector(_up, -_ref.dot(_up));
  if (_fw.lengthSq() < 1e-6) _fw.set(1, 0, 0).addScaledVector(_up, -_up.x);
  _fw.normalize();
  orientationFromUpForward(_up, _fw, _q);
  _p.copy(_up).multiplyScalar(PLANET_R + alt);
  _s.setScalar(scale);
  return g.applyMatrix4(_m.compose(_p, _q, _s));
}

function tree(rng: Rng, lid: number): { trunk: BufferGeometry; leaves: BufferGeometry[] } {
  const h = rng.range(1.6, 2.6);
  const trunk = paint(new CylinderGeometry(0.12, 0.2, h, 5).translate(0, h / 2 - 0.2, 0), PAL.trunk, SID(lid));
  const leaves: BufferGeometry[] = [];
  const blobs = rng.int(3, 5);
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2 + rng.range(0, 1), r = rng.range(0.35, 0.8);
    const g = new IcosahedronGeometry(rng.range(0.8, 1.2), 0)
      .translate(Math.cos(a) * r, h + rng.range(-0.2, 0.7), Math.sin(a) * r);
    leaves.push(paint(g, k % 3 === 0 ? PAL.grassDark : PAL.foliage, SID(lid + 1)));
  }
  return { trunk, leaves };
}

function house(rng: Rng, lid: number): BufferGeometry[] {
  const w = rng.range(2.2, 3.4), d = rng.range(2.0, 3.0), h = rng.range(2.0, 3.6);
  const wall = rng.pick([PAL.plasterWhite, PAL.tilePink, PAL.plasterBeige, PAL.tileWhite]);
  const roof = rng.pick([PAL.roofMauve, PAL.rust, PAL.blue]);
  const out = [paint(new BoxGeometry(w, h + 0.4, d).translate(0, (h + 0.4) / 2 - 0.4, 0), wall, SID(lid))];
  // pitched roof: a 4-sided cone squashed into a hip roof
  out.push(paint(new ConeGeometry(Math.max(w, d) * 0.78, 1.1, 4, 1).rotateY(Math.PI / 4).scale(w / Math.max(w, d), 1, d / Math.max(w, d))
    .translate(0, h + 0.55, 0), roof, SID(lid + 3)));
  out.push(paint(new BoxGeometry(0.7, 1.2, 0.08).translate(rng.range(-w / 4, w / 4), 0.6, d / 2 + 0.03), PAL.glassDark, SID(lid + 5)));
  return out;
}

function rock(rng: Rng, lid: number): BufferGeometry {
  const s = rng.range(0.8, 2.2);
  return paint(new IcosahedronGeometry(s, 0).scale(1, rng.range(0.5, 0.9), 1).translate(0, s * 0.2, 0), PAL.concrete, SID(lid));
}

function boat(rng: Rng, lid: number): BufferGeometry[] {
  const hull = rng.pick([PAL.rust, PAL.blue, PAL.clothWhite]);
  return [
    paint(new BoxGeometry(1.4, 0.7, 4.2).translate(0, 0.1, 0), hull, SID(lid)),
    paint(new BoxGeometry(1.0, 0.8, 1.4).translate(0, 0.8, -0.5), PAL.clothWhite, SID(lid + 2)),
    paint(new BoxGeometry(1.05, 0.12, 1.45).translate(0, 1.26, -0.5), PAL.orange, SID(lid + 4)),
  ];
}

/** Island blob: squashed icosphere, grass cap over a sand rim; its top sits ~0.8 m above the sea surface. */
function island(radius: number, lid: number): BufferGeometry {
  const g0 = new IcosahedronGeometry(radius, 2).scale(1, 0.22, 1);
  const g = g0.index ? g0.toNonIndexed() : g0;       // already non-indexed in r186 (P3r3 L7)
  const pos = g.getAttribute('position');
  const top = radius * 0.22;
  for (let i = 0; i < pos.count; i++) {                    // lumpy coastline
    const x = pos.getX(i), z = pos.getZ(i), k = 1 + 0.12 * Math.sin(x * 1.3 + lid) * Math.cos(z * 1.7 - lid);
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  g.computeVertexNormals();
  paint(g, PAL.grass, SID(lid));
  const col = g.getAttribute('color'), c = _col;
  for (let i = 0; i < pos.count; i += 3) {                  // per-face: rim faces sand, top faces grass
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const hex = y > top * 0.55 ? PAL.grass : y > top * 0.1 ? PAL.sidewalkTan : PAL.seaShallow;
    c.set(hex);
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
  }
  return g.translate(0, 0.8 - top, 0);
}

export function buildTitleDressing(rng: Rng): Group {
  const body: BufferGeometry[] = [], leaves: BufferGeometry[] = [];
  const nIsl = rng.int(9, 11);                            // ART §6.3: 6–10 islands (+ a spare for the far side)
  let lid = 0;
  for (let i = 0; i < nIsl; i++) {
    const R = rng.range(11, 18);
    // rad from the town pole (ART θ 0.8–2.4); the island's rim stays ≥ 72 m of arc out, clear of B's town/pier (r ≤ 71)
    const theta = rng.range(Math.max(0.95, (72 + R * 1.1) / PLANET_R), 2.3);
    const lat = 90 - (theta * 180) / Math.PI, lon = (i / nIsl) * 360 + rng.range(-15, 15);
    body.push(placeGeo(island(R, lid), lat, lon, 0, rng.range(0, 6.28)));
    const dLat = (R / PLANET_R) * (180 / Math.PI);
    const items = rng.int(9, 14);
    for (let k = 0; k < items; k++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(0.1, 0.62) * dLat;
      const pl = lat + Math.cos(a) * rr, plo = lon + (Math.sin(a) * rr) / Math.max(0.2, Math.cos((pl * Math.PI) / 180));
      const kind = rng.next();
      if (kind < 0.58) {
        const t = tree(rng, lid + 2);
        const spin = rng.range(0, 6.28), sc = rng.range(1.7, 2.5);
        body.push(placeGeo(t.trunk, pl, plo, 0.6, spin, sc));
        for (const l of t.leaves) leaves.push(placeGeo(l, pl, plo, 0.6, spin, sc));
      } else if (kind < 0.85) {
        { const sp = rng.range(0, 6.28), sc = rng.range(1.5, 2.1); for (const g of house(rng, lid + 4)) body.push(placeGeo(g, pl, plo, 0.6, sp, sc)); }
      } else body.push(placeGeo(rock(rng, lid + 6), pl, plo, 0.5, rng.range(0, 6.28), 1.6));
    }
    lid += 1;
  }
  for (let i = 0; i < 16; i++) {                            // sea stacks
    const theta = rng.range(0.9, 2.4), lat = 90 - (theta * 180) / Math.PI, lon = rng.range(0, 360);
    body.push(placeGeo(rock(rng, i + 3), lat, lon, -0.3, rng.range(0, 6.28), rng.range(0.8, 1.6)));
  }
  for (let i = 0; i < 7; i++) {                             // fishing boats
    const theta = rng.range(0.95, 2.2), lat = 90 - (theta * 180) / Math.PI, lon = rng.range(0, 360);
    { const sp = rng.range(0, 6.28); for (const g of boat(rng, i)) body.push(placeGeo(g, lat, lon, 0, sp, 1.8)); }
  }
  const grp = new Group();
  grp.name = 'render:titleDressing';
  const bodyMesh = new Mesh(mergePainted(body), makeToonMaterial({ vertexColors: true }));
  const leafMesh = new Mesh(mergePainted(leaves), makeToonMaterial({ vertexColors: true, flecks: true }));
  for (const m of [bodyMesh, leafMesh]) {
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    grp.add(m);
  }
  grp.visible = false;
  return grp;
}
