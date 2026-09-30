// src/data/locations.ts — owner B (GDD §5.3–§5.5 and §3.10). B adjusts within ±2 m / ±3° (GDD §0.2).
// Interiors (world/interiors/plans.ts): studio x −5..5, z −3.5..6.5 (partition x 1.5, darkroom x > 1.5, z < 3.5);
// subway hall x −14..7, z −3..2 (stairs x < −10, gantry x −1, platform doors z 2, track pit beyond).
// † spots are recomputed at init by construction (GDD §9 P8, world/p8.ts; vp_temple_2011 by world/vp.ts): the values
// here are the ones those rules produced with the fallback glyph and are replaced by world.spot() after init.
// Temple (‡ review): the plateau is 12 m across, so the lions flank the path at r 5.4 (lon 133.5 / 156.5) and the
// donation box stands beside the shrine door (GDD's (3,150) sat inside the doorway).
import type { GateDef, LocationDef, SignalZone, SpotDef } from '../types';

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'bus_stop', nameKey: 'loc.bus_stop', center: { r: 38.5, lon: 0 }, radius: 8 },
  { id: 'footbridge', nameKey: 'loc.footbridge', center: { r: 34, lon: 30 }, radius: 10 },
  { id: 'store', nameKey: 'loc.store', center: { r: 30, lon: 60 }, radius: 8 },
  { id: 'alley', nameKey: 'loc.alley', center: { r: 23, lon: 100 }, radius: 7 },
  { id: 'studio', nameKey: 'loc.studio', center: { r: 17.5, lon: 104, h: 1.2 }, radius: 4, openWhen: { all: ['P2_done'] } },
  { id: 'estate', nameKey: 'loc.estate', center: { r: 22, lon: 142 }, radius: 12, openWhen: { all: ['P3_done'] } },
  { id: 'temple', nameKey: 'loc.temple', center: { r: 1.5, lon: 145, h: 4 }, radius: 8, openWhen: { all: ['ch2_started'] } },
  { id: 'market', nameKey: 'loc.market', center: { r: 45, lon: 210 }, radius: 12, openWhen: { all: ['ch2_started'] } },
  { id: 'site', nameKey: 'loc.site', center: { r: 44, lon: 255 }, radius: 16, openWhen: { all: ['ch2_started'] } },
  { id: 'pier', nameKey: 'loc.pier', center: { r: 56, lon: 322 }, radius: 10, openWhen: { all: ['ch2_started'] } },
  { id: 'lighthouse', nameKey: 'loc.lighthouse', center: { r: 68, lon: 326 }, radius: 5, openWhen: { all: ['ch2_started'] } },
];

/** GDD §5.4. yaw = degrees clockwise from local north (0 = uphill, 90 = lon increasing, 180 = seaward). */
export const SPOTS: readonly SpotDef[] = [
  { id: 'sp_bus_bench', scene: 'planet', pos: { r: 38.5, lon: 0, h: 0 }, yaw: 90, loc: 'bus_stop' },
  { id: 'sp_slipway', scene: 'planet', pos: { r: 43, lon: 6, h: 0 }, yaw: 200, loc: 'bus_stop' },
  { id: 'vp_group_photo', scene: 'planet', pos: { r: 47.2, lon: 23, h: 0 }, yaw: 0, pitch: 8, loc: 'footbridge' },
  { id: 'sp_under_bridge', scene: 'planet', pos: { r: 34, lon: 30, h: 0 }, yaw: 0, loc: 'footbridge' },
  { id: 'sp_bridge_deck', scene: 'planet', pos: { r: 34, lon: 30, h: 5.5 }, yaw: 90, loc: 'footbridge' },
  { id: 'sp_stairs_x', scene: 'planet', pos: { r: 41, lon: 23, h: 2.75 }, yaw: 180, loc: 'footbridge' },
  { id: 'sp_store_door', scene: 'planet', pos: { r: 30, lon: 60, h: 0 }, yaw: 180, loc: 'store' },
  { id: 'sp_store_front', scene: 'planet', pos: { r: 31, lon: 63, h: 0 }, yaw: 200, loc: 'store' },
  { id: 'sp_locker', scene: 'planet', pos: { r: 31, lon: 55, h: 0 }, yaw: 0, loc: 'store' },
  { id: 'sp_manhole', scene: 'planet', pos: { r: 31.5, lon: 64, h: 0 }, stand: { r: 33.3, lon: 64, h: 0 }, loc: 'store' },
  { id: 'sp_mirror', scene: 'planet', pos: { r: 30, lon: 92, h: 2.4 }, yaw: 160, stand: { r: 31.8, lon: 92.5, h: 0 }, loc: 'alley' },
  { id: 'sp_mirror_stand', scene: 'planet', pos: { r: 33.5, lon: 93, h: 0 }, yaw: 340, loc: 'alley' },
  { id: 'sp_alley_mouth', scene: 'planet', pos: { r: 29, lon: 96, h: 0 }, yaw: 0, loc: 'alley' },
  { id: 'sp_studio_door', scene: 'planet', pos: { r: 17.5, lon: 104, h: 1.2 }, yaw: 0, loc: 'studio' },
  { id: 'sp_estate_gate', scene: 'planet', pos: { r: 29.5, lon: 140, h: 0 }, yaw: 0, loc: 'estate' },
  { id: 'sp_estate_gate_inner', scene: 'planet', pos: { r: 27.5, lon: 140, h: 0 }, yaw: 0, loc: 'estate' },
  { id: 'sp_estate_yard', scene: 'planet', pos: { r: 22, lon: 142, h: 0 }, yaw: 90, loc: 'estate' },
  { id: 'sp_estate_window', scene: 'planet', pos: { r: 23.1, lon: 153.6, h: 9 }, yaw: 260, loc: 'estate' },
  { id: 'vp_estate_doors', scene: 'planet', pos: { r: 23, lon: 133, h: 0 }, yaw: 80, loc: 'estate' },
  { id: 'sp_milkbox', scene: 'planet', pos: { r: 26.7, lon: 152.7, h: 0 }, yaw: 83, loc: 'estate' },
  { id: 'sp_fire_ladder', scene: 'planet', pos: { r: 16.4, lon: 145.0, h: 0 }, yaw: 77, loc: 'estate' },
  { id: 'sp_roof', scene: 'planet', pos: { r: 21, lon: 160, h: 18 }, yaw: 0, loc: 'estate' },
  { id: 'pk_coop', scene: 'planet', pos: { r: 19, lon: 161, h: 18 }, yaw: 0, loc: 'estate' },
  { id: 'sp_hill_gate', scene: 'planet', pos: { r: 15, lon: 145, h: 0 }, yaw: 0, loc: 'estate' },
  { id: 'sp_temple_idol', scene: 'planet', pos: { r: 1.5, lon: 145, h: 4 }, stand: { r: 3.65, lon: 145, h: 4 }, loc: 'temple' },
  { id: 'sp_donation_box', scene: 'planet', pos: { r: 3.1, lon: 166, h: 4 }, stand: { r: 4.8, lon: 167.5, h: 4 }, loc: 'temple' },
  { id: 'vp_temple_2011', scene: 'planet', pos: { r: 7.8, lon: 137.5, h: 2.971 }, yaw: 1.8, pitch: 2.1, loc: 'temple' },
  { id: 'sp_lion_left', scene: 'planet', pos: { r: 5.4, lon: 133.5, h: 4 }, yaw: 180, stand: { r: 7.3, lon: 133.5, h: 3.257 }, loc: 'temple' },
  { id: 'sp_roadwork', scene: 'planet', pos: { r: 34, lon: 175, h: 0 }, yaw: 0 },
  { id: 'sp_market_tank', scene: 'planet', pos: { r: 41, lon: 200, h: 0 }, stand: { r: 39.2, lon: 200, h: 0 }, loc: 'market' },
  { id: 'sp_paper_shop', scene: 'planet', pos: { r: 41.5, lon: 226, h: 0 }, yaw: 0, loc: 'market' },
  { id: 'sp_site_gate', scene: 'planet', pos: { r: 39.5, lon: 240, h: 0 }, yaw: 0, loc: 'site' },
  { id: 'sp_site_pipes', scene: 'planet', pos: { r: 48, lon: 276, h: 0.8 }, yaw: 60, loc: 'site' },
  // stand 1.9° west of the glyph axis: the constructed P8 lamp pole (≈ 38.7, 256.3) sits on the axis at r 38.7
  { id: 'sp_chai', scene: 'planet', pos: { r: 44, lon: 256, h: 3.2 }, yaw: 0, stand: { r: 39.2, lon: 254.1, h: 0 }, loc: 'site' },
  { id: 'sp_net_dot', scene: 'planet', pos: { r: 41, lon: 255.21, h: 2.38 }, stand: { r: 38.5, lon: 255.2, h: 0 }, loc: 'site' },
  { id: 'sp_dot_ground', scene: 'planet', pos: { r: 40.4, lon: 255.21, h: 0 }, yaw: 0, loc: 'site' },
  { id: 'vp_subway_top', scene: 'planet', pos: { r: 29.5, lon: 262, h: 0 }, yaw: 180, loc: 'site' },
  { id: 'sp_lamp_p8', scene: 'planet', pos: { r: 38.69, lon: 256.26, h: 0 }, stand: { r: 36.9, lon: 256.26, h: 0 }, loc: 'site' },
  { id: 'sp_subway_entry', scene: 'planet', pos: { r: 27.5, lon: 262, h: 0 }, yaw: 0, loc: 'site' },
  { id: 'sp_tide', scene: 'planet', pos: { r: 34, lon: 338, h: 0 }, yaw: 0 },
  { id: 'sp_pier_base', scene: 'planet', pos: { r: 48, lon: 322, h: 0 }, yaw: 180, loc: 'pier' },
  // P3r2 G6: 老陈 (dusk / night) fishes by the east rail, 0.88 m off the pier axis, so the walk (and 土地's smoke,
  // which runs down lon 322) passes him; at lon 322.5 he blocked the right half of the 2.5 m deck head-on
  { id: 'sp_pier_mid', scene: 'planet', pos: { r: 50.3, lon: 323.0, h: 0.6 }, yaw: 180, loc: 'pier' },
  { id: 'sp_bench', scene: 'planet', pos: { r: 52, lon: 322, h: 0.6 }, yaw: 163.3, loc: 'pier' },
  { id: 'sp_lighthouse_door', scene: 'planet', pos: { r: 66.5, lon: 325, h: 1.5 }, yaw: 141.5, loc: 'lighthouse' },
  {
    id: 'sp_seawall_zhimei', scene: 'planet', pos: { r: 47, lon: 316, h: 0 }, yaw: 160, loc: 'pier',
    approach: 'behind', approachDist: 3.0,
  },
  { id: 'sp_tripod', scene: 'planet', pos: { r: 47.2, lon: 23, h: 0 }, yaw: 0, pitch: 8, loc: 'footbridge' },
  { id: 'sp_bus_door', scene: 'planet', pos: { r: 38, lon: 2, h: 0 }, yaw: 0, loc: 'bus_stop' },
  // dawn lineup (P3r2 camera: a street group photo facing the 周记 tile's tripod, every yaw = heading to the tripod).
  // Front row standing on the pavement in front of the south stairs (r 42.9, h 0): g3 纸妹, g4 王阿婆 + 煤球, g8 老陈,
  // g1 小林; the stair tier around the chalk X (r 41.6, h on the 0.55 slope): g9 小刘, g7 站务员, g5 = the X (周远),
  // 老周's photo-only ghost at lon 24.2; g6 土地 on the sea-side rail post at lon 21.25; g2 = the bestiary reward spot.
  // P3r3 (look f): 土地 moved from the post at lon 19.5 (a small red smudge at the photo's left edge, against the pale
  // houses) to the next post up, between 小刘 and 站务员, above the rail against the sky; g9 / g7 step 0.4° / 0.5° apart
  // to make room for him.
  { id: 'g1', scene: 'planet', pos: { r: 42.9, lon: 25.8, h: 0 }, yaw: 208.5, loc: 'footbridge' },
  { id: 'g2', scene: 'planet', pos: { r: 43.0, lon: 27.1, h: 0 }, yaw: 219.6, loc: 'footbridge' },
  { id: 'g3', scene: 'planet', pos: { r: 42.9, lon: 21.9, h: 0 }, yaw: 168.1, loc: 'footbridge' },
  { id: 'g4', scene: 'planet', pos: { r: 42.9, lon: 23.2, h: 0 }, yaw: 182.2, loc: 'footbridge' },
  { id: 'g5', scene: 'planet', pos: { r: 41, lon: 23, h: 2.75 }, yaw: 180, loc: 'footbridge' },
  { id: 'g6', scene: 'planet', pos: { r: 42.25, lon: 21.25, h: 3.01 }, yaw: 163.7, loc: 'footbridge' },
  { id: 'g7', scene: 'planet', pos: { r: 41.6, lon: 22.1, h: 2.4 }, yaw: 172.5, loc: 'footbridge' },
  { id: 'g8', scene: 'planet', pos: { r: 42.9, lon: 24.5, h: 0 }, yaw: 196.1, loc: 'footbridge' },
  { id: 'g9', scene: 'planet', pos: { r: 41.6, lon: 20.0, h: 1.57 }, yaw: 156.0, loc: 'footbridge' },
  // zhimei's four hop spots inside the paper shop (within 3 m of sp_paper_shop)
  { id: 'zp1', scene: 'planet', pos: { r: 41.5, lon: 225, h: 0 }, yaw: 0, loc: 'market' },
  { id: 'zp2', scene: 'planet', pos: { r: 43, lon: 226.5, h: 0 }, yaw: 0, loc: 'market' },
  { id: 'zp3', scene: 'planet', pos: { r: 42, lon: 228, h: 0 }, yaw: 0, loc: 'market' },
  { id: 'zp4', scene: 'planet', pos: { r: 40.5, lon: 227, h: 0 }, yaw: 0, loc: 'market' },
  // studio_int (10×10 m: x −5..5, z −3.5..6.5; partition wall at x = 1.5 with a door gap; darkroom x > 1.5, z < 3.5)
  { id: 'st_entry', scene: 'studio_int', pos: { x: 0, y: 0, z: 2.4 }, yaw: 0 },
  { id: 'st_wall', scene: 'studio_int', pos: { x: -4.9, y: 1.6, z: -0.5 }, stand: { x: -3.1, y: 0, z: -0.5 } },
  { id: 'st_doorframe', scene: 'studio_int', pos: { x: 1.5, y: 1.3, z: 1.5 }, stand: { x: -0.3, y: 0, z: 1.5 } },
  { id: 'st_cabinet', scene: 'studio_int', pos: { x: -2, y: 0.8, z: -3.3 }, stand: { x: -2, y: 0, z: -1.5 } },
  { id: 'st_poster', scene: 'studio_int', pos: { x: 0.5, y: 1.6, z: -3.45 }, stand: { x: 0.5, y: 0, z: -1.7 } },
  { id: 'dk_bench', scene: 'studio_int', pos: { x: 3.5, y: 0.9, z: -3.0 }, stand: { x: 3.5, y: 0, z: -1.6 } },
  { id: 'dk_phone', scene: 'studio_int', pos: { x: 4.8, y: 0.9, z: 1.0 }, stand: { x: 3.2, y: 0, z: 1.0 } },
  { id: 'dk_line', scene: 'studio_int', pos: { x: 3.3, y: 2.0, z: -0.5 }, stand: { x: 3.3, y: 0, z: 0.9 } },
  // subway_int (hall x −14..7, z −3..2, stairs x < −10; gantry line at x = −1, anchor (−1, 1, 0); track pit beyond z = 2)
  { id: 'sw_entry', scene: 'subway_int', pos: { x: -5.8, y: 0, z: 0 }, yaw: 90 },
  // P3r3 G10: 1.6 m from it_sw_exit (x −10.2) / it_st_exit (z 6.2), facing them: where the 「离开」 prompt shows
  { id: 'sw_exit', scene: 'subway_int', pos: { x: -8.6, y: 0, z: 0 }, yaw: 270 },
  { id: 'st_exit', scene: 'studio_int', pos: { x: 0, y: 0, z: 4.6 }, yaw: 180 },
  // the attendant, 0.7 m west of the gantry line beside the lane (I-play, requests-F #4): a player talking to him stands
  // 1.8 m in front at (-3.5, -1.2), 2.4 m from it_gantry (ARCHITECTURE §2.8.15 ≤ 2.5 m; was 3.0 m from x = -2.2)
  { id: 'sw_gantry', scene: 'subway_int', pos: { x: -1.7, y: 0, z: -1.2 }, yaw: 270 },
  { id: 'sw_platform', scene: 'subway_int', pos: { x: 3.5, y: 0, z: 0 }, yaw: 90 },
  { id: 'pk_psd', scene: 'subway_int', pos: { x: 4.5, y: 0, z: 1.6 }, yaw: 180 },
  { id: 'sw_display', scene: 'subway_int', pos: { x: 0.5, y: 2.5, z: -2.9 }, stand: { x: 0.5, y: 0, z: -1.2 } },
];

/** GDD §5.5 */
export const GATES: readonly GateDef[] = [
  { id: 'gate_roadwork', spot: 'sp_roadwork', openWhen: { all: ['roadwork_cleared'] } },
  { id: 'gate_tide', spot: 'sp_tide', openWhen: { all: ['tide_out'] } },
  { id: 'gate_studio', spot: 'sp_studio_door', openWhen: { all: ['P2_done'] } },
  { id: 'gate_estate', spot: 'sp_estate_gate', openWhen: { all: ['P3_done'] } },
  { id: 'gate_roof', spot: 'sp_fire_ladder', openWhen: { items: ['key_rooftop'] } },
  { id: 'gate_hill', spot: 'sp_hill_gate', openWhen: {} },
  { id: 'gate_subway', spot: 'sp_subway_entry', openWhen: { all: ['ch3_started'] } },
  { id: 'gate_gantry', spot: 'sw_gantry', openWhen: { all: ['gantry_open'] } },
  { id: 'gate_lighthouse', spot: 'sp_lighthouse_door', openWhen: { all: ['lighthouse_open'] } },
  { id: 'gate_darkroom', spot: 'dk_bench', openWhen: {} },
];

/** GDD §3.10. Highest prio among matching zones wins; no match = 1 bar outdoors, 0 in interiors. */
export const SIGNAL_ZONES: readonly SignalZone[] = [
  { bars: 4, scene: 'planet', prio: 40, circle: { at: { r: 34, lon: 30 }, radius: 3 }, minH: 5 },
  { bars: 3, scene: 'planet', prio: 30, ring: { rMin: 26, rMax: 42, lonFrom: 14, lonTo: 53 }, minH: 0.3 },
  { bars: 3, scene: 'planet', prio: 30, circle: { at: { r: 21, lon: 160 }, radius: 7 }, minH: 15 },
  { bars: 3, scene: 'planet', prio: 30, circle: { at: { r: 66.5, lon: 325 }, radius: 3 } },
  { bars: 0, scene: 'planet', prio: 50, ring: { rMin: 17, rMax: 28.5, lonFrom: 94, lonTo: 106 } },
  // 2 bars on the carriageway only (r 31–37): the store door / locker sidewalk keeps 1 bar (GDD P2 clue 2 「便利店门口 1 格，路上 2 格」)
  { bars: 2, scene: 'planet', prio: 20, ring: { rMin: 31.05, rMax: 37, lonFrom: 0, lonTo: 360 } },
  { bars: 2, scene: 'planet', prio: 20, ring: { rMin: 43, rMax: 47.5, lonFrom: 300, lonTo: 60 } },
  { bars: 2, scene: 'planet', prio: 20, ring: { rMin: 47.5, rMax: 64, lonFrom: 320.5, lonTo: 323.5 } },
];
