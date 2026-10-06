// src/world/kit/building.ts — owner B. The 骑楼 / house kit (ART §9): boxes + 0.15 m ink-worthy steps, arcades, shop
// fronts, unlit window panes (tagged for phase lighting), AC units, pipes, signs, awnings, roof clutter.
import { Matrix4, type BufferGeometry } from 'three';
import type { LabelId } from '../../types';
import type { UvRect } from '../atlas';
import { PAL } from '../../art/palette';
import type { Rng } from '../../contracts';
import { createRng } from '../../core/rng';
import { FONT } from '../../core/fonts';
import { placeMatrix } from '../../core/planet';
import { ch } from '../geo';
import type { Bldg } from '../layout';
import type { Batch, LayerKind } from './batch';
import { box, boxRot, cyl, frameRing, gable, quad, blob } from './prims';
import type { Tex } from './tex';

/** Surface-id helpers (ART §4.3: adjacent parts must differ; 1–189 environment). */
export const SID = {
  grass: 2, grassDark: 3, road: 4, sidewalk: 5, curb: 6, paint: 7, shallow: 8, foam: 9, promenade: 10, plaza: 11,
  hill: 12, sand: 13, rock: 14, seawall: 15, planet: 1,
  wall: (s: number) => 20 + (s % 28), band: (s: number) => 50 + (s % 8), roof: (s: number) => 60 + (s % 8),
  column: 70, frame: 72, pane: 80, shop: 82, sign: (s: number) => 86 + (s % 6), awning: 94, ac: 96, pipe: 98, tank: 100,
  parapet: (s: number) => 102 + (s % 4), laundry: 108, plant: 110, balcony: 112, door: 114, poster: 116, cable: 118,
} as const;

export type Tag = 'home' | 'shop' | 'lamp' | 'neon' | 'stair' | 'lantern';
let winSeq = 0;
/** Tag for a lit element: kind + a stable per-element number (phase lighting picks by it). */
export function winTag(kind: Tag): string { return `${kind}:${winSeq++}`; }

export interface BuildCtx { B: Batch; T: Tex; rng: Rng }


/** Build one building from its plan entry. */
export function buildBuilding(b: Bldg, c: BuildCtx): void {
  const rng = createRng(b.seed);
  const M = placeMatrix('planet', { ...ch(b.rect.c), h: b.base }, b.rect.hdg);
  const W = b.rect.hw * 2, D = b.rect.hd * 2, fh = b.fh, H = b.floors * fh;
  const s = b.seed;
  const add = (layer: LayerKind, g: BufferGeometry, hex: string, sid: number, uv: UvRect | null = null, label?: LabelId, tag?: string) =>
    c.B.add(b.far && layer === 'solid' ? 'far' : layer, g, M, hex, sid, { uv, label }, tag);
  const zF = D / 2;                       // front face
  const far = b.far;

  // ---- mass
  if (b.arcade > 0) {
    add('solid', box(W, fh + 0.4, D - b.arcade, 0, -0.4, -b.arcade / 2), b.wall, SID.wall(s + 3), null, 'qilou');
    add('solid', box(W, H - fh + 0.02, D, 0, fh - 0.02, 0), b.wall, SID.wall(s), null, 'qilou');
    const n = Math.max(2, Math.round(W / 3) + 1);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.25 + ((W - 0.5) * i) / (n - 1);
      add('solid', box(0.38, fh, 0.38, x, 0, zF - 0.3), b.trim, SID.column, null, 'qilou');
    }
  } else {
    add('solid', box(W, H + 0.4, D, 0, -0.4, 0), b.wall, SID.wall(s), null, far ? undefined : 'qilou');
  }
  // floor bands (ink steps) and plinth
  for (let f = 1; f < b.floors; f++) add('solid', box(W + 0.14, 0.2, D + 0.14, 0, f * fh - 0.1, 0), b.trim, SID.band(s));
  if (!far) add('solid', box(W + 0.06, 0.35, D + 0.06, 0, -0.05, 0), PAL.concrete, SID.band(s + 4));
  // roof
  if (b.roof === 'gable') {
    add('solid', gable(W, D, Math.min(2.2, D * 0.28), H, 0.35), b.roofColor, SID.roof(s));
  } else {
    add('solid', box(W + 0.1, 0.75, D + 0.1, 0, H, 0), b.trim, SID.parapet(s));
    if (!far) add('solid', box(W - 0.35, 0.05, D - 0.35, 0, H + 0.72, 0), PAL.concrete, SID.roof(s));
  }

  // ---- windows (upper floors; ground floor too for houses)
  const bays = Math.max(1, Math.round(W / (far ? 3.2 : 2.5)));
  const firstFloor = b.shop === 'none' && b.arcade === 0 ? 0 : 1;
  const paneKind = rng.int(0, 3);
  for (let f = firstFloor; f < b.floors; f++) {
    for (let i = 0; i < bays; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / bays;
      const y = f * fh + 1.55;
      const pw = far ? 1.0 : rng.range(0.95, 1.25), ph = far ? 1.1 : 1.35;
      const tag = winTag('home');
      const kind = rng.next() < 0.35 ? 1 : (rng.next() < 0.5 ? paneKind : rng.int(0, 3));
      c.B.add('win', quad(pw, ph, x, y, zF + 0.03, 'z'), M, PAL.glassDark, SID.pane, { uv: c.T.pane(kind), label: 'window' }, tag);
      if (!far) {
        // P3-look L6: floor-1 AC units, cages and laundry hung in front of the arcade shop sign (fh+0.25…1.0), so
        // 「兴隆五金」 read 「兴隆力主」: they are left out there. The rng draws stay, so nothing else in the town moves.
        const keep = !(f === 1 && b.arcade > 0 && !!b.signKey);
        const addK = (...a: Parameters<typeof add>): void => { if (keep) add(...a); };
        // frame as a 0.12 m ring (4 strips), not a full quad behind the pane: one layer less of rasterised facade
        const fcol = rng.pick([PAL.plasterWhite, b.trim, PAL.concrete]);
        for (const g of frameRing(pw + 0.24, ph + 0.24, 0.12, x, y, zF + 0.015)) add('solid', g, fcol, SID.frame);
        add('solid', box(pw + 0.3, 0.08, 0.2, x, y - ph / 2 - 0.16, zF + 0.06), b.trim, SID.band(s + 1));
        // AC unit + drip pipe (detail)
        if (rng.next() < 0.42) {
          const ax = x + (rng.next() < 0.5 ? -1 : 1) * (pw / 2 + 0.55);
          if (Math.abs(ax) < W / 2 - 0.45) {
            addK('detail', box(0.78, 0.52, 0.32, ax, y - 0.75, zF + 0.16), PAL.metalRail, SID.ac, null, 'ac_unit');
            addK('detail', quad(0.74, 0.48, ax, y - 0.49, zF + 0.325, 'z'), '#ffffff', SID.ac + 1, c.T.ac(), 'ac_unit');
            addK('detail', box(0.1, 0.1, 0.25, ax - 0.3, y - 0.95, zF + 0.1), PAL.metalRail, SID.ac);
          }
        }
        // security cage (防盗窗): a shallow open box in front
        if (rng.next() < 0.18) {
          addK('detail', box(pw + 0.2, 0.06, 0.45, x, y - ph / 2 - 0.12, zF + 0.22), PAL.metalRail, SID.balcony);
          addK('detail', box(pw + 0.2, 0.06, 0.45, x, y + ph / 2 + 0.06, zF + 0.22), PAL.metalRail, SID.balcony);
          for (const sx of [-1, 1]) addK('detail', box(0.05, ph + 0.18, 0.05, x + sx * (pw / 2 + 0.08), y - ph / 2 - 0.12, zF + 0.43), PAL.metalRail, SID.balcony);
          // potted plant on the cage
          if (rng.next() < 0.6) addK('detail', blob(0.22, x + rng.range(-0.3, 0.3), y - ph / 2 + 0.1, zF + 0.25, rng, 0.2, 0), PAL.foliage, SID.plant);
        }
        // laundry pole with clothes
        if (rng.next() < 0.14) {
          addK('detail', box(pw + 0.8, 0.04, 0.04, x, y + ph / 2 - 0.05, zF + 0.7), PAL.metalRail, SID.laundry);
          const cols = [PAL.skyBlue, PAL.clothWhite, PAL.tilePink, PAL.yellow, PAL.sage, PAL.orange];
          for (let k = 0; k < 3; k++) {
            const cx = x - pw / 2 + 0.1 + k * (pw / 2.4), hh = rng.range(0.45, 0.75);
            addK('detail', box(0.36, hh, 0.02, cx, y + ph / 2 - 0.08 - hh, zF + 0.7), rng.pick(cols), SID.laundry + (k % 2), null, 'laundry');
          }
        }
      }
    }
    // back windows (seen from the hill / roofs)
    if (!far || f < b.floors) {
      for (let i = 0; i < Math.max(1, bays - 1); i++) {
        const x = -W / 2 + (W * (i + 0.5)) / Math.max(1, bays - 1);
        c.B.add('win', quad(0.9, 1.1, x, f * fh + 1.55, -zF - 0.03, '-z'), M, PAL.glassDark, SID.pane, { uv: c.T.pane(rng.int(0, 3)), label: 'window' }, winTag('home'));
      }
    }
  }

  // ---- ground floor front
  if (!far && b.shop !== 'none') {
    const zShop = b.arcade > 0 ? zF - b.arcade + 0.02 : zF + 0.02;
    const shopBays = Math.max(1, Math.round(W / 3));
    for (let i = 0; i < shopBays; i++) {
      const bw = W / shopBays - 0.3, x = -W / 2 + (W * (i + 0.5)) / shopBays;
      const kind = b.shop === 'wall' ? 'wall' : (i === 0 ? b.shop : rng.pick(['shutter', 'glass', b.shop] as const));
      if (kind === 'glass' || kind === 'open') {
        c.B.add('win', quad(bw, 2.35, x, 1.25, zShop + 0.01, 'z'), M, PAL.glassDark, SID.shop, { uv: kind === 'glass' ? c.T.shopGlass(rng.int(0, 3)) : c.T.pane(3), label: 'window' }, winTag('shop'));
        if (kind === 'open') for (let k = 0; k < 3; k++) {
          add('detail', box(rng.range(0.4, 0.7), rng.range(0.3, 0.6), 0.45, x + rng.range(-bw / 3, bw / 3), 0, zShop + 0.35), rng.pick([PAL.ochre, PAL.sidewalkTan, PAL.clothWhite]), SID.shop + 1, null, 'boxes');
        }
      } else if (kind === 'shutter') {
        add('solid', quad(bw, 2.4, x, 1.2, zShop + 0.01, 'z'), '#ffffff', SID.shop + 2, c.T.shutter(rng.int(0, 5)));
      } else {
        add('solid', quad(0.95, 2.1, x, 1.05, zShop + 0.01, 'z'), '#ffffff', SID.door, c.T.panel('door', rng.pick([PAL.ochre, PAL.steelGreen, PAL.rust, PAL.teal]), 'door'));
      }
    }
    // posters on the columns / walls
    if (rng.next() < 0.7) {
      const pk = rng.pick(['sign.poster_rent', 'sign.poster_lock', 'sign.poster_drain', 'sign.poster_missing', 'sign.poster_demolish', 'sign.poster_clear', 'sign.poster_transfer', 'sign.poster_moving']);
      const px = rng.range(-W / 2 + 0.4, W / 2 - 0.4);
      add('solid', quad(0.42, 0.6, px, 1.55, (b.arcade > 0 ? zF - b.arcade : zF) + 0.035, 'z'), '#ffffff', SID.poster, c.T.poster(pk));
    }
    // shop sign board
    if (b.signKey) {
      const sw = Math.min(W - 0.4, rng.range(2.4, 4.2)), sh = 0.75;
      const y = b.arcade > 0 ? fh + 0.25 : fh - 0.95;
      const z = zF + (b.arcade > 0 ? 0.14 : 0.08);        // arcade: in front of the floor-1 sill band (to zF+0.16), L6
      const sx = rng.range(-(W - sw) / 2 + 0.1, (W - sw) / 2 - 0.1);
      add('solid', box(sw + 0.14, sh + 0.14, 0.12, sx, y - 0.07, z - 0.02), PAL.charcoal, SID.sign(s + 1));
      const g = quad(sw, sh, sx, y + sh / 2, z + 0.05, 'z');       // the face sits on its board (it was always at x 0)
      add('solid', g, '#ffffff', SID.sign(s), c.T.sign(b.signKey, sw, sh, b.signBg, b.signInk));
    }
    // awning over non-arcade shops
    if (b.arcade === 0 && b.shop !== 'wall' && rng.next() < 0.55) {
      const aw = W - 0.5, col = rng.pick([PAL.skyBlue, PAL.steelGreen, PAL.orange, PAL.blue, PAL.bannerRed]);
      add('solid', boxRot(aw, 0.06, 1.2, 0, fh - 1.35, zF + 0.55, 0.38), '#ffffff', SID.awning, c.T.stripes(PAL.clothWhite, col));
    }
    // vertical sign at the corner
    if (b.vSignKey) {
      const vx = (rng.next() < 0.5 ? -1 : 1) * (W / 2 - 0.25);
      add('solid', box(0.12, 2.3, 0.62, vx, fh + 0.35, zF + 0.4), PAL.charcoal, SID.sign(s + 2));
      const col = rng.pick([PAL.bannerRed, PAL.blue, PAL.yellow, PAL.plasterWhite]);
      const uv = c.T.vsign(b.vSignKey, 0.55, 2.2, col, col === PAL.yellow || col === PAL.plasterWhite ? PAL.inkDeep : PAL.clothWhite);
      add('solid', quad(0.56, 2.2, vx + 0.065, fh + 1.5, zF + 0.4, 'x'), '#ffffff', SID.sign(s + 3), uv);
      add('solid', quad(0.56, 2.2, vx - 0.065, fh + 1.5, zF + 0.4, '-x'), '#ffffff', SID.sign(s + 3), uv);
    }
  }
  if (far) return;
  // ---- drain pipe + roof clutter (detail)
  const px = (rng.next() < 0.5 ? -1 : 1) * (W / 2 - 0.12);
  add('detail', box(0.12, H + 0.5, 0.12, px, 0, zF + 0.08), rng.pick([PAL.metalRail, PAL.concrete, PAL.steelGreen]), SID.pipe, null, 'pipe');
  if (b.roof !== 'gable') {
    if (rng.next() < 0.6) {
      const tx = rng.range(-W / 2 + 0.8, W / 2 - 0.8), tz = rng.range(-D / 2 + 0.8, 0);
      add('detail', cyl(0.5, 0.5, 1.1, 8, tx, H + 0.75, tz), rng.pick([PAL.clothWhite, PAL.metalRail, PAL.skyBlue]), SID.tank, null, 'water_tank');
      add('detail', box(1.0, 0.35, 0.9, tx, H + 0.75, tz), PAL.metalRail, SID.tank + 1);
    }
    if (rng.next() < 0.45) {
      const ax = rng.range(-W / 2 + 0.5, W / 2 - 0.5);
      add('detail', box(0.05, 2.0, 0.05, ax, H + 0.75, -D / 4), PAL.metalRail, SID.pipe + 1, null, 'antenna');
      add('detail', box(1.1, 0.04, 0.04, ax, H + 2.2, -D / 4), PAL.metalRail, SID.pipe + 1, null, 'antenna');
      add('detail', box(0.8, 0.04, 0.04, ax, H + 2.5, -D / 4), PAL.metalRail, SID.pipe + 1, null, 'antenna');
    }
    if (rng.next() < 0.5) {   // solar water heater
      const sx = rng.range(-W / 2 + 1, W / 2 - 1);
      add('detail', boxRot(1.5, 0.08, 1.0, sx, H + 1.3, D / 4, -0.6), PAL.glassDark, SID.tank + 2);
      add('detail', boxRot(1.5, 0.22, 0.22, sx, H + 1.6, D / 4 - 0.35, 0), PAL.clothWhite, SID.tank + 3);
    }
    if (b.roof === 'terrace' || rng.next() < 0.3) {
      for (let k = 0; k < 3; k++) {
        const bx = rng.range(-W / 2 + 0.5, W / 2 - 0.5), bz = rng.range(-D / 2 + 0.5, D / 2 - 0.5);
        add('detail', cyl(0.2, 0.15, 0.3, 6, bx, H + 0.75, bz), PAL.roofMauve, SID.plant + 1);
        add('detail', blob(0.3, bx, H + 1.2, bz, rng, 0.25, 0), rng.pick([PAL.foliage, PAL.foliageDeep, PAL.grass]), SID.plant);
      }
    }
    // roof stair hut
    if (rng.next() < 0.35 && W > 4) add('solid', box(1.8, 2.2, 1.6, W / 2 - 1.2, H + 0.7, -D / 2 + 1.1), b.wall, SID.wall(s + 7));
  }
  // side windows on corners of rows (a couple, to break flat gables)
  for (const sx of [-1, 1]) {
    if (rng.next() < 0.5) continue;
    for (let f = 1; f < b.floors; f++) {
      c.B.add('win', quad(0.8, 1.0, sx * (W / 2 + 0.03), f * fh + 1.6, rng.range(-D / 4, D / 4), sx > 0 ? 'x' : '-x'), M, PAL.glassDark, SID.pane, { uv: c.T.pane(0), label: 'window' }, winTag('home'));
    }
  }
}

/** Sign text fonts used by the kit (for ensureFont before baking). */
export const KIT_FONTS = [FONT.display, FONT.brush, FONT.sign, FONT.hud] as const;
export { Matrix4 };
