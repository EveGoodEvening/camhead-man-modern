// src/data/interacts.ts — owner F. GDD §11.13 objects + the ARCHITECTURE §2.8.14 studio/darkroom objects.
// One id may have several rows with mutually exclusive `when` (locked / open states). A row plays `node` first, then
// `ui.talk(talkAs)`, then runs `actions`. Rows inside timed or chained flows show their text as a toast instead of a
// dialogue box, so consecutive E presses (GDD §19.3) are never swallowed by an open dialogue.
import type { Cond, InteractDef } from '../types';

const CH2: Cond = { all: ['ch2_started'] };

export const INTERACTS: readonly InteractDef[] = [
  // ---------------------------------------------------------------- 望潮里站 / 天桥
  // P3r3 G1: rows on a STAND spot carry `ahead` (metres along the spot's yaw to the object, measured against B's colliders)
  // so the reach, the facing cone and the prompt label sit on the door / box / bench, not on the hero's feet.
  { id: 'it_bus_sign', spot: { world: 'bus_qr' }, range: 3, prompt: 'inspect', node: 'it.bus_sign' },
  { id: 'it_bench', spot: 'sp_bus_bench', ahead: -0.4, lift: 0.5, range: 1.8, prompt: 'inspect', node: 'it.bench', when: { none: ['bus_arrived'] } },
  { id: 'it_boat', spot: { world: 'lm:boat' }, range: 5, prompt: 'inspect', node: 'it.boat' },
  { id: 'it_zhouji_tile', spot: 'vp_group_photo', range: 1.8, prompt: 'inspect', node: 'it.zhouji_tile',
    when: { none: ['finale_started'] } },
  { id: 'it_tide', spot: 'sp_tide', ahead: 1.9, range: 5, prompt: 'inspect', node: 'it.tide', when: { none: ['tide_out'] } },

  // ---------------------------------------------------------------- 便利店 · 邻里柜 (GDD §9 P2)
  { id: 'it_locker', spot: { world: 'locker17' }, prompt: 'inspect', node: 'it.locker', when: { none: ['ch1_started'] } },
  // first E in ch1 = the truncated SMS (rule locker_seen); afterwards the keypad
  { id: 'it_locker', spot: { world: 'locker17' }, prompt: 'use', promptKey: 'txt.prompt.keypad',
    when: { all: ['ch1_started'], none: ['locker_seen', 'P2_done'] }, actions: [{ set: 'locker_seen' }] },
  { id: 'it_locker', spot: { world: 'locker17' }, prompt: 'use', promptKey: 'txt.prompt.keypad', node: 'it.locker',
    when: { all: ['locker_seen'], none: ['P2_done'] }, actions: [{ ui: 'keypad_locker' }] },
  { id: 'it_locker', spot: { world: 'locker17' }, prompt: 'inspect', node: 'it.locker_empty', when: { all: ['P2_done'] } },
  { id: 'it_manhole', spot: 'sp_manhole', range: 2, prompt: 'inspect', node: 'it.manhole_day', when: { phase: ['day', 'dawn'] } },
  { id: 'it_manhole', spot: 'sp_manhole', range: 2, prompt: 'inspect', node: 'it.manhole_night', when: { phase: ['dusk', 'night'] } },

  // ---------------------------------------------------------------- 猫耳巷 · 照相馆
  { id: 'it_mirror', spot: { world: 'mirror' }, range: 3.2, prompt: 'inspect', node: 'it.mirror' },
  { id: 'it_cathole', spot: { r: 23.5, lon: 101, h: 0.6 }, range: 2, prompt: 'inspect', node: 'it.cathole' },
  { id: 'it_studio_shutter', spot: 'sp_studio_door', ahead: 1.2, range: 3, prompt: 'inspect', node: 'it.studio_shutter',
    when: { none: ['ch1_started', 'P2_done'] } },
  { id: 'it_studio_shutter', spot: 'sp_studio_door', ahead: 1.2, range: 3, prompt: 'inspect', node: 'it.studio_shutter',
    when: { all: ['ch1_started'], none: ['P2_done'] }, actions: [{ set: 'studio_locked_seen' }] },
  { id: 'it_studio_shutter', spot: 'sp_studio_door', ahead: 1.2, range: 3, prompt: 'enter', when: { all: ['P2_done'] },
    actions: [{ toast: 'sys.shutter_open' }, { sfx: 'sfx_door' }, { teleport: 'st_entry' }] },

  // ---------------------------------------------------------------- 红旗新村 (GDD §9 P3, P5)
  // GDD §10.2 note: #5–#15 and their interactables are guarded by ch1_started (P3 G2: the prologue gate let P3 skip ch1)
  { id: 'it_estate_gate', spot: 'sp_estate_gate', ahead: 0.7, prompt: 'inspect', when: { none: ['ch1_started', 'P3_done'] },
    actions: [{ toast: 'sys.gate_maint' }] },
  { id: 'it_estate_gate', spot: 'sp_estate_gate', ahead: 0.7, prompt: 'show', node: 'gate.prompt', when: { all: ['ch1_started'], none: ['P3_done'] } },
  { id: 'it_milkbox', spot: 'sp_milkbox', ahead: 1.1, prompt: 'inspect', node: 'it.milkbox_locked', when: { none: ['P5_started'] } },
  { id: 'it_milkbox', spot: 'sp_milkbox', ahead: 1.1, prompt: 'use', node: 'it.milkbox', when: { all: ['P5_started'], none: ['key_rooftop'] },
    actions: [{ ui: 'milkbox' }] },
  { id: 'it_fire_ladder', spot: 'sp_fire_ladder', ahead: 0.7, prompt: 'inspect', node: 'it.fire_ladder', when: { none: ['key_rooftop'] } },
  { id: 'it_fire_ladder', spot: 'sp_fire_ladder', ahead: 0.7, prompt: 'climb', when: { all: ['key_rooftop'] },
    actions: [{ toast: 'sys.ladder_open' }, { sfx: 'sfx_door' }, { teleport: 'sp_roof' }] },
  // top of B's ladder cage (B1 tail, 2.9 m west of the lon-160 axis → ≈ lon 149.7), ≈ 6.7 m from frame1_drop
  { id: 'it_roof_ladder', spot: { r: 16.1, lon: 149.7, h: 18.6 }, range: 2, prompt: 'climb',
    actions: [{ toast: 'sys.roof_ladder' }, { teleport: 'sp_fire_ladder' }] },
  { id: 'it_roof_tv', spot: { world: 'roof_tv' }, prompt: 'inspect', node: 'it.roof_tv' },
  // B's tank stands at b1Point(26.2, 1.4) ≈ (26.2, 156.9) on the h-18 roof (1.4 × 2 m plinth, r 0.8 drum)
  { id: 'it_water_tank', spot: { r: 26.2, lon: 156.9, h: 19 }, range: 2.4, prompt: 'inspect', node: 'it.water_tank' },
  { id: 'it_coop', spot: { world: 'coop_door' }, prompt: 'inspect', node: 'it.coop_small', when: { none: ['meiqiu_talked'] } },
  { id: 'it_coop', spot: { world: 'coop_door' }, prompt: 'detach', when: { all: ['meiqiu_talked'], none: ['pigeons_gone'] },
    actions: [{ detach: 'pk_coop' }] },
  { id: 'it_coop', spot: { world: 'coop_door' }, prompt: 'inspect', node: 'it.coop_empty', when: { all: ['pigeons_gone'] } },
  { id: 'it_frame1', spot: { world: 'frame1_drop' }, range: 2.2, priority: 5, prompt: 'pickup',
    when: { all: ['pigeons_gone'], none: ['frame_1'] }, actions: [{ toast: 'sys.frame1' }, { give: 'frame_1' }] },

  // ---------------------------------------------------------------- 山顶土地庙 (GDD §9 P4; wx_idol = rule on the interact event)
  { id: 'it_temple_idol', spot: { world: 'idol' }, range: 3, prompt: 'inspect', node: 'it.temple_idol', when: { none: ['P4_done'] } },
  { id: 'it_temple_idol', spot: { world: 'idol' }, range: 3, prompt: 'inspect', node: 'it.temple_idol_face', when: { all: ['P4_done'] } },
  { id: 'it_lion', spot: { world: 'lion_left_head' }, range: 3, prompt: 'inspect', node: 'it.lion' },
  { id: 'it_banyan', spot: { r: 1.4, lon: 300, h: 5 }, range: 3.2, prompt: 'inspect', node: 'it.banyan' },

  // ---------------------------------------------------------------- 路障 · 菜市场 · 纸扎铺 · 工地
  { id: 'it_roadwork', spot: 'sp_roadwork', range: 3, prompt: 'inspect', node: 'it.roadwork', when: { none: ['roadwork_cleared'] } },
  { id: 'it_fish_tank', spot: 'sp_market_tank', prompt: 'inspect', node: 'it.fish_tank' },
  { id: 'it_paper_rule', spot: { r: 43.2, lon: 227.5, h: 1.6 }, prompt: 'inspect', node: 'it.paper_rule' },
  { id: 'it_paper_phone', spot: { r: 42.6, lon: 224.6, h: 1 }, prompt: 'inspect', node: 'it.paper_phone' },
  { id: 'it_hoarding', spot: { world: 'chai' }, range: 6.5, prompt: 'inspect', talkAs: 'chai' },
  { id: 'it_pipes', spot: { r: 48.6, lon: 278.5, h: 0.8 }, prompt: 'inspect', node: 'it.pipes' },
  { id: 'it_dot', spot: 'sp_dot_ground', range: 2.2, priority: 5, prompt: 'pickup', when: { all: ['P8_done'], none: ['dot_taken'] },
    actions: [{ toast: 'sys.dot' }, { give: 'cinnabar_dot' }, { set: 'dot_taken' }] },
  { id: 'it_subway_gate', spot: 'sp_subway_entry', ahead: 0.45, prompt: 'inspect', node: 'it.subway_gate', when: { none: ['ch3_started'] } },
  // P3 G4: at dawn the chain is back on (subway_int has nobody in it after the night)
  { id: 'it_subway_gate', spot: 'sp_subway_entry', ahead: 0.45, prompt: 'inspect', node: 'it.subway_gate', when: { all: ['finale_started'] } },
  { id: 'it_subway_gate', spot: 'sp_subway_entry', ahead: 0.45, prompt: 'enter', when: { all: ['ch3_started'], none: ['finale_started'] },
    actions: [{ toast: 'sys.subway_open' }, { sfx: 'sfx_chime' }, { teleport: 'sw_entry' }] },

  // ---------------------------------------------------------------- 码头 · 灯塔 (GDD §9 P6)
  { id: 'it_bench_pier', spot: 'sp_bench', range: 2, prompt: 'sit', when: CH2,
    actions: [{ toast: 'sys.bench_pier' }, { teleport: 'sp_bench' }, { pose: 'sit' }] },
  { id: 'it_plaque', spot: { world: 'plaque' }, prompt: 'inspect', node: 'it.plaque' },
  // GDD §9 P6 is a ch3/night puzzle (「黄昏起就能走到这里」 = reachable, not solvable; §10.2 #32 is guarded by ch3_started)
  { id: 'it_lh_door', spot: 'sp_lighthouse_door', prompt: 'inspect', node: 'it.lh_door',
    when: { all: ['ch2_started'], none: ['ch3_started', 'lighthouse_open'] }, actions: [{ toast: 'sys.lh_dusk' }] },
  { id: 'it_lh_door', spot: 'sp_lighthouse_door', prompt: 'use', promptKey: 'txt.prompt.keypad', node: 'it.lh_door',
    when: { all: ['ch3_started'], none: ['lighthouse_open'] }, actions: [{ ui: 'keypad_lighthouse' }] },
  { id: 'it_lh_door', spot: 'sp_lighthouse_door', prompt: 'enter', when: { all: ['lighthouse_open'] },
    actions: [{ detach: 'lh_door' }] },
  // live only in the lh_door look-up view (its peek); the lamp dies 4 s and frame ③ drops (M_lighthouse_off)
  { id: 'it_lh_switch', spot: { world: 'lh_switch' }, range: 3, prompt: 'use', promptKey: 'txt.prompt.switch', peek: 'lh_door',
    when: { all: ['lighthouse_open'], none: ['frame_3'] },
    actions: [{ toast: 'sys.lh_switch' }, { sfx: 'sfx_click' }, { uncanny: 'M_lighthouse_off' }, { wait: 2 }, { give: 'frame_3' }] },

  // ---------------------------------------------------------------- 零号线 (GDD §9 P7; the named gantry is glue code)
  // anchored on the gate lane's west face; 3.6 m reach covers a player standing 1.8 m in front of the attendant
  { id: 'it_gantry', spot: { x: -1.3, y: 1, z: -0.2 }, scene: 'subway_int', range: 3.6, prompt: 'use', node: 'it.gantry',
    when: { none: ['name_known'] } },
  { id: 'it_gantry', spot: { x: -1.3, y: 1, z: -0.2 }, scene: 'subway_int', range: 3.6, prompt: 'use', priority: 10,
    when: { all: ['name_known'], none: ['gantry_open'] } },
  { id: 'it_psd', spot: 'pk_psd', prompt: 'detach', when: { all: ['gantry_open'], none: ['frame4_registered'] },
    actions: [{ toast: 'sys.psd' }, { detach: 'pk_psd' }] },
  // P3 G6: anchored on the foot of the stairs (STUDIO/SUBWAY_INT plans), not on the arrival spot: walking back to the
  // way out now shows the prompt while facing it
  { id: 'it_sw_exit', spot: { x: -10.2, y: 1, z: 0 }, scene: 'subway_int', range: 2.4, prompt: 'enter', promptKey: 'txt.prompt.exit',
    actions: [{ toast: 'sys.sw_exit' }, { teleport: 'sp_subway_entry' }] },

  // ---------------------------------------------------------------- 周记照相馆 studio_int (GDD S_studio, S_darkroom)
  { id: 'it_st_exit', spot: { x: 0, y: 1, z: 6.2 }, scene: 'studio_int', range: 2.4, prompt: 'enter', promptKey: 'txt.prompt.exit',
    actions: [{ toast: 'sys.st_exit' }, { sfx: 'sfx_door' }, { teleport: 'sp_studio_door' }] },
  { id: 'it_st_wall', spot: { world: 'portrait_wall' }, range: 3, prompt: 'inspect', node: 'it.st_wall',
    when: { phase: ['day', 'dusk', 'dawn'], none: ['faces_restored'] } },
  { id: 'it_st_wall', spot: { world: 'portrait_wall' }, range: 3, prompt: 'inspect', node: 'it.st_wall_night',
    when: { phase: ['night'], none: ['faces_restored'] } },
  { id: 'it_st_wall', spot: { world: 'portrait_wall' }, range: 3, prompt: 'inspect', node: 'it.st_wall_after',
    when: { all: ['faces_restored'] } },
  { id: 'it_st_doorframe', spot: { world: 'doorframe' }, prompt: 'inspect', node: 'it.st_doorframe',
    actions: [{ set: 'height_marks_seen' }] },
  { id: 'it_st_cabinet', spot: 'st_cabinet', prompt: 'inspect', node: 'it.st_cabinet', when: { none: ['film_at_tudi'] },
    actions: [{ set: 'film_at_tudi' }] },
  { id: 'it_st_cabinet', spot: 'st_cabinet', prompt: 'inspect', node: 'it.st_cabinet_again', when: { all: ['film_at_tudi'] } },
  { id: 'it_st_poster', spot: 'st_poster', prompt: 'inspect', node: 'it.st_poster', actions: [{ clue: 'clue_jingle' }] },
  { id: 'it_st_backdrop', spot: { x: -4.2, y: 1.3, z: 2.9 }, scene: 'studio_int', prompt: 'inspect', node: 'it.st_backdrop' },
  { id: 'it_dk_phone', spot: 'dk_phone', prompt: 'use', node: 'it.dk_phone', when: { none: ['memo_1_heard'] },
    actions: [{ memo: 1 }, { set: 'memo_1_heard' }] },
  { id: 'it_dk_phone', spot: 'dk_phone', prompt: 'use', node: 'it.dk_phone_again', when: { all: ['memo_1_heard'] },
    actions: [{ memo: 1 }] },
  // the bench: nothing to develop until all four frames and 折; then E switches the safelight on (GDD S_darkroom 1)
  { id: 'it_dk_bench', spot: 'dk_bench', prompt: 'inspect', node: 'it.dk_bench', when: { none: ['all_frames'] } },
  { id: 'it_dk_bench', spot: 'dk_bench', prompt: 'inspect', node: 'it.dk_bench', when: { all: ['all_frames'], none: ['P8_done'] } },
  { id: 'it_dk_bench', spot: 'dk_bench', prompt: 'use', when: { all: ['all_frames', 'P8_done'], none: ['dk_lit'] },
    actions: [{ set: 'dk_lit' }, { sfx: 'sfx_click' }, { toast: 'sys.dk.lit' }] },
  { id: 'it_dk_bench', spot: 'dk_bench', prompt: 'inspect', node: 'it.dk_bench_done', when: { all: ['developed'] } },
  // the three trays light up in order; only the lit one is live, so it can't go wrong (GDD S_darkroom 2–4)
  { id: 'it_dk_tray_brown', spot: { world: 'dk_tray_brown' }, priority: 3, prompt: 'use', promptKey: 'txt.prompt.tray',
    when: { all: ['dk_lit'], none: ['dk_tray_1'] },
    actions: [{ sfx: 'sfx_paper' }, { toast: 'sys.dk.1' }, { set: 'dk_tray_1' }] },
  { id: 'it_dk_tray_white', spot: { world: 'dk_tray_white' }, priority: 3, prompt: 'use', promptKey: 'txt.prompt.tray',
    when: { all: ['dk_tray_1'], none: ['dk_tray_2'] },
    actions: [{ sfx: 'sfx_paper' }, { toast: 'sys.dk.2' }, { set: 'dk_tray_2' }] },
  { id: 'it_dk_tray_blue', spot: { world: 'dk_tray_blue' }, priority: 3, prompt: 'use', promptKey: 'txt.prompt.tray',
    when: { all: ['dk_tray_2'], none: ['dk_tray_3'] },
    actions: [
      // the negatives hang at once and 老周's memo_3 plays over the development (the voice is a dialogue in E, so
      // hanging first keeps the viewfinder reveal from waiting on it)
      { sfx: 'sfx_paper' }, { toast: 'sys.dk.3' }, { set: 'dk_tray_3' }, { set: 'dk_hung' }, { toast: 'sys.dk.look' },
      { memo: 3 }, { set: 'memo_3_heard' },
    ] },

  // ---------------------------------------------------------------- 终章 (GDD S_group_photo)
  { id: 'it_tripod', spot: { world: 'tripod_head' }, prompt: 'detach', promptKey: 'txt.prompt.tripod',
    // P3r2 G2: no 「云台上没有相机」 toast on the mount itself (it contradicted the head the player had just mounted)
    when: { all: ['finale_started'], none: ['group_photo_done'] }, actions: [{ detach: 'tripod' }] },
  { id: 'it_bus_door', spot: 'sp_bus_door', prompt: 'enter', node: 'it.bus_door', talkAs: 'attendant',
    when: { all: ['bus_arrived'], none: ['ending_A', 'ending_B'] } },
];
