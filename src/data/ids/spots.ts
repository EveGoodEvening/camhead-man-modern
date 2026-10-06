// src/data/ids/spots.ts — owner B (seeded by S from GDD §5.4). Append-only: never rename or delete an id.
export const SPOT_IDS = [
  // planet (GDD §5.4)
  'sp_bus_bench', 'sp_slipway', 'vp_group_photo', 'sp_under_bridge', 'sp_bridge_deck', 'sp_stairs_x',
  'sp_store_door', 'sp_store_front', 'sp_locker', 'sp_manhole', 'sp_mirror', 'sp_mirror_stand', 'sp_alley_mouth',
  'sp_studio_door', 'sp_estate_gate', 'sp_estate_gate_inner', 'sp_estate_yard', 'sp_estate_window',
  'vp_estate_doors', 'sp_milkbox', 'sp_fire_ladder', 'sp_roof', 'pk_coop', 'sp_hill_gate', 'sp_temple_idol',
  'sp_donation_box', 'vp_temple_2011', 'sp_lion_left', 'sp_roadwork', 'sp_market_tank', 'sp_paper_shop',
  'sp_site_gate', 'sp_site_pipes', 'sp_chai', 'sp_net_dot', 'sp_dot_ground', 'vp_subway_top', 'sp_lamp_p8',
  'sp_subway_entry', 'sp_tide', 'sp_pier_base', 'sp_pier_mid', 'sp_bench', 'sp_lighthouse_door',
  'sp_seawall_zhimei', 'sp_tripod', 'sp_bus_door',
  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9',
  'zp1', 'zp2', 'zp3', 'zp4',
  // studio_int
  'st_entry', 'st_wall', 'st_doorframe', 'st_cabinet', 'st_poster', 'dk_bench', 'dk_phone', 'dk_line',
  // subway_int
  'sw_entry', 'sw_gantry', 'sw_platform', 'pk_psd', 'sw_display',
  // P3r3 G10: in reach of the exit interacts (smoke / arrow targets for leaving an interior)
  'st_exit', 'sw_exit',
] as const;
export type SpotId = (typeof SPOT_IDS)[number];

/** Geometry-dependent anchors resolved by world.anchor() (ARCHITECTURE §2.8.14). B may append. */
export const WORLD_ANCHOR_IDS = [
  // QR codes and fixtures
  'studio_qr', 'bus_qr', 'bike_qr', 'temple_qr', 'locker17', 'portrait_wall', 'doorframe', 'idol', 'mirror',
  // estate doors
  'door_201', 'door_202', 'door_203', 'door_204', 'door_301', 'door_302', 'door_303', 'door_304',
  'door_401', 'door_402', 'door_403', 'door_404',
  // puzzle points
  'coop_inside', 'coop_door', 'frame1_drop', 'plaque', 'trail_plane', 'lh_lamp', 'lh_switch', 'pit', 'chai',
  'net_dot', 'lamp_p8', 'dot_ground', 'sea_point',
  // bestiary and darkroom props
  'lion_left_head', 'roof_tv', 'fish7', 'dk_line', 'dk_tray_brown', 'dk_tray_white', 'dk_tray_blue', 'tripod_head',
  // landmarks
  'lm:banyan', 'lm:footbridge', 'lm:boat', 'lm:crane', 'lm:lighthouse', 'lm:bus_stop', 'lm:store', 'lm:studio',
  'lm:hoarding',
] as const;
export type WorldAnchorId = (typeof WORLD_ANCHOR_IDS)[number];
