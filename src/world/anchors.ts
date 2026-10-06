// src/world/anchors.ts — owner B. Static anchor table for world.anchor() (ARCHITECTURE §2.8.14 WORLD_ANCHOR_IDS).
// Façade anchors sit ≥ 0.1 m outside their building's occluder proxy (§3.B review constraint). Positions depending on
// the P8 construction (net_dot, lamp_p8, dot_ground) and live objects (fish7, tripod_head) are overridden at init.
import type { ChartPos, LocalPos, SceneId, WorldAnchorId } from '../types';
import { ch, dirAt, fl, add, type P2 } from './geo';
import {
  BOAT, BRIDGE, ESTATE, LIGHTHOUSE, MIRROR, SITE, STORE, TEMPLE, TILE, BUS, b1Point, headingToward,
} from './layout';
import { STUDIO, SUBWAY_INT } from './interiors/plans';
import { alleyDir, STUDIO_FRONT } from './layout';
import { headingOf } from './geo';
import { coopRect } from './colliders';

export interface AnchorDef {
  scene: SceneId; pos: ChartPos | LocalPos;
  /** facing heading (planet) of the surface normal, or a LocalPos normal for interiors */
  faceHdg?: number; normal?: LocalPos;
  radius?: number;
  /** plane half extents for corners (w across, h up) */
  plane?: { hw: number; hh: number };
}

const at = (p: P2, h: number): ChartPos => ({ ...ch(p), h });
const door = (unit: number, floor: number): AnchorDef => ({
  scene: 'planet', pos: at(b1Point(ESTATE.doorsR[unit], ESTATE.b1.w / 2 - ESTATE.b1.gallery + 0.1), ESTATE.doorFloorsH[floor]),
  faceHdg: 270, radius: 0.35, plane: { hw: 0.3, hh: 0.3 },
});
const studioQr = (() => { const p = add(STUDIO_FRONT, alleyDir, -0.12); return { p, hdg: headingOf(p, { x: -alleyDir.x, z: -alleyDir.z }) }; })();
const lhDoorHdg = headingToward(fl(LIGHTHOUSE.r, LIGHTHOUSE.lon), fl(LIGHTHOUSE.doorSpot.r, LIGHTHOUSE.doorSpot.lon));
const lhSurface = (dHdg: number, h: number): ChartPos => {
  const c = fl(LIGHTHOUSE.r, LIGHTHOUSE.lon);
  return at(add(c, dirAt(c, lhDoorHdg + dHdg), LIGHTHOUSE.baseR + 0.12), h);
};
const coop = coopRect();

export const ANCHOR_DEFS: Readonly<Record<WorldAnchorId, AnchorDef>> = {
  // QR codes and fixtures
  studio_qr: { scene: 'planet', pos: at(studioQr.p, 2.65), faceHdg: studioQr.hdg, radius: 0.15, plane: { hw: 0.12, hh: 0.12 } },
  bus_qr: { scene: 'planet', pos: { r: 38.05, lon: 354.2, h: 1.5 }, faceHdg: 0, radius: 0.15, plane: { hw: 0.1, hh: 0.1 } },
  bike_qr: { scene: 'planet', pos: { r: 28.2, lon: 98.6, h: 0.95 }, faceHdg: 0, radius: 0.1 },
  temple_qr: { scene: 'planet', pos: { r: TEMPLE.donation.r + 0.33, lon: TEMPLE.donation.lon, h: 4.42 }, faceHdg: 180, radius: 0.15, plane: { hw: 0.1, hh: 0.1 } },
  locker17: { scene: 'planet', pos: { r: STORE.locker.r + 0.02, lon: STORE.locker.lon, h: STORE.locker.h }, faceHdg: 180, radius: 0.3, plane: { hw: 0.2, hh: 0.15 } },
  portrait_wall: { scene: 'studio_int', pos: { x: STUDIO.portrait.x + 0.08, y: STUDIO.portrait.y, z: STUDIO.portrait.z }, normal: { x: 1, y: 0, z: 0 }, radius: 1.6, plane: { hw: STUDIO.portrait.w / 2, hh: STUDIO.portrait.h / 2 } },
  doorframe: { scene: 'studio_int', pos: { x: STUDIO.doorframe.x - 0.12, y: STUDIO.doorframe.y, z: STUDIO.doorframe.z - 0.45 }, normal: { x: -1, y: 0, z: 0 }, radius: 0.5 },
  idol: { scene: 'planet', pos: { r: TEMPLE.idol.r, lon: TEMPLE.idol.lon, h: TEMPLE.idol.h }, faceHdg: 180, radius: 0.8 },
  mirror: { scene: 'planet', pos: { r: MIRROR.r, lon: MIRROR.lon, h: MIRROR.h }, faceHdg: MIRROR.yaw, radius: MIRROR.radius, plane: { hw: MIRROR.radius, hh: MIRROR.radius } },
  // estate doors (GDD §9 P5): 0.1 m outside the door face, h 4.5 / 7.5 / 10.5
  door_201: door(0, 0), door_202: door(1, 0), door_203: door(2, 0), door_204: door(3, 0),
  door_301: door(0, 1), door_302: door(1, 1), door_303: door(2, 1), door_304: door(3, 1),
  door_401: door(0, 2), door_402: door(1, 2), door_403: door(2, 2), door_404: door(3, 2),
  // puzzle points
  coop_inside: { scene: 'planet', pos: at(coop.c, 18.45), faceHdg: 180, radius: 0.3 },
  coop_door: { scene: 'planet', pos: at(add(coop.c, dirAt(coop.c, 180), coop.hd + 0.05), 18.4), faceHdg: 180, radius: 0.15 },
  frame1_drop: { scene: 'planet', pos: { r: 20, lon: 160.5, h: 18.02 }, radius: 0.15 },
  plaque: { scene: 'planet', pos: lhSurface(-38, 2.55), faceHdg: lhDoorHdg - 38, radius: 0.25, plane: { hw: 0.25, hh: 0.12 } },
  trail_plane: { scene: 'planet', pos: { r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: 13 }, faceHdg: 0, radius: 4, plane: { hw: 4, hh: 1.5 } },
  lh_lamp: { scene: 'planet', pos: { r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: LIGHTHOUSE.lampH + 0.9 }, radius: 0.3 },
  lh_switch: { scene: 'planet', pos: lhSurface(40, 2.7), faceHdg: lhDoorHdg + 40, radius: 0.2 },
  pit: { scene: 'subway_int', pos: { x: SUBWAY_INT.psdGapX, y: SUBWAY_INT.pitY + 0.12, z: 2.9 }, normal: { x: 0, y: 1, z: 0 }, radius: 0.2 },
  chai: { scene: 'planet', pos: { r: SITE.chai.r, lon: SITE.chai.lon, h: SITE.chai.h }, faceHdg: 0, radius: 1.8, plane: { hw: 1.8, hh: 1.8 } },
  net_dot: { scene: 'planet', pos: { r: 41, lon: 257.5, h: 4.2 }, faceHdg: 0, radius: 0.15 },
  lamp_p8: { scene: 'planet', pos: { r: 38.4, lon: 258.7, h: 3.7 }, radius: 0.28 },
  dot_ground: { scene: 'planet', pos: { r: 40.4, lon: 257.5, h: 0.02 }, radius: 0.12 },
  sea_point: { scene: 'planet', pos: { r: 60, lon: 318, h: 0 }, radius: 3 },
  // bestiary and darkroom props
  lion_left_head: { scene: 'planet', pos: { r: TEMPLE.lionL.r, lon: TEMPLE.lionL.lon, h: 4.8 }, faceHdg: 180, radius: 0.3 },
  roof_tv: { scene: 'planet', pos: at(b1Point(23.4, 2.4), 18.55), faceHdg: 0, radius: 0.3 },
  fish7: { scene: 'planet', pos: { r: 41.35, lon: 200, h: 1.12 }, faceHdg: 0, radius: 0.05 },
  dk_line: { scene: 'studio_int', pos: { x: (STUDIO.line.x0 + STUDIO.line.x1) / 2, y: STUDIO.line.y - 0.2, z: STUDIO.line.z }, normal: { x: 0, y: 0, z: 1 }, radius: 1.2, plane: { hw: 1.4, hh: 0.2 } },
  dk_tray_brown: { scene: 'studio_int', pos: { x: STUDIO.trays.brown.x, y: STUDIO.bench.h + 0.05, z: STUDIO.trays.brown.z }, radius: 0.2 },
  dk_tray_white: { scene: 'studio_int', pos: { x: STUDIO.trays.white.x, y: STUDIO.bench.h + 0.05, z: STUDIO.trays.white.z }, radius: 0.2 },
  dk_tray_blue: { scene: 'studio_int', pos: { x: STUDIO.trays.blue.x, y: STUDIO.bench.h + 0.05, z: STUDIO.trays.blue.z }, radius: 0.2 },
  tripod_head: { scene: 'planet', pos: { r: TILE.r, lon: TILE.lon, h: 2.2 }, faceHdg: 0, radius: 0.1 },   // = places2 TRIPOD_HEAD_H (P3r2)
  // landmarks (GDD §8.2 lm:* tags)
  'lm:banyan': { scene: 'planet', pos: { r: 1.5, lon: TEMPLE.banyan.lon, h: 12 }, radius: 7 },
  'lm:footbridge': { scene: 'planet', pos: { r: 34, lon: BRIDGE.lon, h: 5 }, radius: 6 },
  'lm:boat': { scene: 'planet', pos: { r: BOAT.r, lon: BOAT.lon, h: 1.8 }, radius: 3.5 },
  'lm:crane': { scene: 'planet', pos: { r: SITE.crane.r, lon: SITE.crane.lon, h: 22 }, radius: 10 },
  'lm:lighthouse': { scene: 'planet', pos: { r: LIGHTHOUSE.r, lon: LIGHTHOUSE.lon, h: 9 }, radius: 4 },
  'lm:bus_stop': { scene: 'planet', pos: { r: BUS.r, lon: 0, h: 1.4 }, radius: 3 },
  'lm:store': { scene: 'planet', pos: { r: 29.3, lon: 60, h: 3.4 }, radius: 3 },
  'lm:studio': { scene: 'planet', pos: at(STUDIO_FRONT, 3.4), radius: 2.5 },
  'lm:hoarding': { scene: 'planet', pos: { r: SITE.hoardR - 0.2, lon: 255, h: 2.8 }, radius: 8 },
};
