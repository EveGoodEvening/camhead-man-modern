// scripts/lib/suites.mjs — owner: S. Suite definitions for scripts/smoke.mjs (ARCHITECTURE §4.4, GDD §19.3 / §19.4).
import fs from 'node:fs';

export const Q = 'test&seed=1&mute';

/** GDD §19.3 golden path, one page (/?test&seed=1&mute&skipTitle). `calls` runs as a function body with `with (__game)`. */
export const GOLDEN = [
  { step: 'P1', calls: "goto('vp_group_photo'); setRef('ph_2006_group'); viewfinder(true); zoom(1); lens({overlay:true}); shoot()", flags: ['P1_done'] },
  { step: 'P2', calls: "goto('sp_locker'); step(10); goto('sp_bridge_deck'); step(10); goto('sp_locker'); input('locker',['17','0815'])", flags: ['locker_seen', 'sms_full', 'P2_done'] },
  { step: 'S_studio', calls: "goto('st_cabinet'); interact(); advance(9)", flags: ['film_at_tudi'] },
  { step: 'P3', calls: "goto('sp_store_front'); talk('granny_wang'); advance(9); viewfinder(true); aim('T_granny_face'); shoot({burst:true}); goto('sp_estate_gate'); const ps = state().photos; const o = ps.find(p=>p.tags.includes('granny_face_open')); const c = ps.find(p=>p.tags.includes('granny_face_closed')); show('gate',[o && o.id, c && c.id].filter(Boolean)); goto('sp_estate_gate_inner'); step(5)", flags: ['P3_done', 'ch2_started'] },
  { step: 'P4', calls: "goto('sp_donation_box'); viewfinder(true); aim('T_temple_qr'); step(40); goto('vp_temple_2011'); setRef('ph_temple_2011'); zoom(3); lens({overlay:true}); shoot()", flags: ['P4_done'] },
  { step: 'tudi', calls: "lens({night:true}); aim('T_tudi'); interact(); advance(12)", flags: ['tudi_met'] },
  { step: 'S_mirror', calls: "goto('sp_mirror_stand'); viewfinder(true); zoom(1); aim('T_mirror_self'); shoot()", flags: ['mirror_selfie'] },
  { step: 'P5', calls: "goto('sp_estate_yard'); talk('granny_wang'); advance(9); goto('sp_milkbox'); input('milkbox','403'); goto('sp_fire_ladder'); interact(); lens({night:true}); talk('meiqiu'); advance(9); detach('pk_coop'); lens({flash:true}); shoot(); goto('sp_roof'); interact()", flags: ['frame_1', 'ch3_started'] },
  { step: 'P6', calls: "goto('sp_bench'); interact(); viewfinder(true); lens({night:true}); aim('T_light_trail'); shoot(); goto('sp_lighthouse_door'); input('lighthouse','1987'); interact(); interact()", flags: ['trail_1987', 'frame_3'] },
  { step: 'P7', calls: "goto('sw_gantry'); talk('attendant'); advance(3); input('namepicker',['周','远']); advance(9); interact(); detach('pk_psd'); lens({flash:true}); shoot(); advance(9)", flags: ['name_known', 'frame_4'] },
  { step: 'P8', calls: "goto('vp_subway_top'); viewfinder(true); zoom(1); aim('T_chai'); shoot()", flags: ['P8_done'] },
  { step: 'P9', calls: "goto('sp_dot_ground'); interact(); goto('sp_paper_shop'); viewfinder(true); lens({night:true}); talk('zhimei'); choose(0); advance(9); goto('sp_seawall_zhimei'); viewfinder(true); lens({night:true}); zoom(1); aim('T_zhimei_sea'); shoot(); show('zhimei',[lastPhotoId()])", flags: ['zhimei_eye', 'frame_2', 'P9_done'] },
  { step: 'darkroom', calls: "goto('dk_bench'); interact(); interact(); interact(); interact(); viewfinder(true); advance(20)", flags: ['developed', 'finale_started'] },
  { step: 'group', calls: "goto('sp_tripod'); interact(); interact(); goto('sp_stairs_x'); step(660)", flags: ['group_photo_done'] },
  { step: 'ending', calls: "goto('sp_bus_bench'); talk('attendant'); choose(0); advance(40)", flags: ['ending_A', 'credits_done'] },
];

/** GOLDEN with the ending choice: 'A' = 【上车】 (choose 0), 'B' = 【不上车】 (choose 1). */
export function goldenRows(ending = 'A') {
  if (ending === 'A') return GOLDEN;
  return GOLDEN.map((r) => (r.step === 'ending'
    ? { step: 'ending_B', calls: "goto('sp_bus_bench'); talk('attendant'); choose(1); advance(40)", flags: ['ending_B', 'credits_done'] }
    : r));
}

/** ?chapter= / ?phase= boots (ARCHITECTURE §4.3): expected phase and HUD clock. */
export const CHAPTER_BOOTS = [
  { name: 'ch-prologue', q: '&chapter=prologue', chapter: 'prologue', phase: 'day', clock: '06:10' },
  { name: 'ch-ch1', q: '&chapter=ch1', chapter: 'ch1', phase: 'day', clock: '10:00' },
  { name: 'ch-ch2', q: '&chapter=ch2', chapter: 'ch2', phase: 'dusk', clock: '17:40' },
  { name: 'ch-ch3', q: '&chapter=ch3', chapter: 'ch3', phase: 'night', clock: '22:00' },
  { name: 'ch-finale', q: '&chapter=finale', chapter: 'finale', phase: 'dawn', clock: '05:40' },
];
export const PHASE_BOOTS = [
  { name: 'ph-day', q: '&phase=day', phase: 'day', clock: '06:10' },
  { name: 'ph-dusk', q: '&phase=dusk', phase: 'dusk', clock: '17:40' },
  { name: 'ph-night', q: '&phase=night', phase: 'night', clock: '22:00' },
  { name: 'ph-dawn', q: '&phase=dawn', phase: 'dawn', clock: '05:40' },
];
/** The save round trip plays the golden path into chapter 2 (through P4, so a real photo is in the album). */
export const SAVE_ROWS = GOLDEN.slice(0, GOLDEN.findIndex((r) => r.step === 'P4') + 1);

/** The g* lineup positions, parsed from src/data/locations.ts (chart → world, planet at the origin, R = 80). */
export function lineupSpots() {
  const src = fs.readFileSync('src/data/locations.ts', 'utf8');
  const out = {};
  for (const m of src.matchAll(/id: '(g\d)', scene: 'planet', pos: \{ r: ([\d.]+), lon: ([\d.]+), h: ([\d.]+) \}/g)) {
    const r = Number(m[2]), lon = (Number(m[3]) * Math.PI) / 180, h = Number(m[4]);
    const th = r / 80, k = 80 + h, x = r * Math.sin(lon), z = r * Math.cos(lon), sn = Math.sin(th) / r;
    out[m[1]] = [sn * x * k, Math.cos(th) * k, sn * z * k];
  }
  return out;
}

export function checkpointRects() {
  try { return JSON.parse(fs.readFileSync('scripts/checkpoints.json', 'utf8')); } catch { return {}; }
}

/**
 * GDD §19.4 checkpoints. `calls` run after load; `settle: false` = 「截图前不 settle」; `until` = repeat step(30) until
 * the selector is visible. `checks(ctx)` runs in node with helpers from smoke.mjs and returns [{ name, ok, warn?, value }].
 */
export const CHECKPOINTS = [
  { name: 'title', url: `/?${Q}`, calls: '', checks: async (c) => [await c.planetCentred(), await c.fontsLoaded()] },
  // P3r2: no `&at=sp_bus_bench` — ?skipTitle already lands on S_wake's end pose (one step off the bench, camera slightly
  // above); the `at` boot re-placed him on the spot with the bench back between the follow camera and him
  { name: 'day_start', url: `/?${Q}&skipTitle`, calls: '', checks: async (c) => [await c.rectColours('day_start', 'sky', ['#65c1bc', '#f2cfc2'], 3)] },   // prologue = `morning` palette (GDD §10.3); sky rect: the shelter roof reaches the top rows now
  {
    name: 'day_viewfinder', url: `/?${Q}&chapter=ch1&at=sp_locker`, calls: "zoom(3); aim('T_locker17')",
    checks: async (c) => [await c.evalShot({ frame: 'green', targetId: 'T_locker17' }), await c.text('vf-recog', '识别：17 号格 · 滞留 1096 天 96%')],
  },
  {
    // P3r2: with settle:false and no tick after talk(), the capture showed the LAST follow frame (camera not yet
    // switched, empty box, HUD chips still up). Step past the dialogue camera's 0.7 s ease-in and the typewriter.
    name: 'dialog', url: `/?${Q}&chapter=ch1&at=sp_store_door`, calls: "talk('xiaolin'); step(90)", settle: false,
    checks: async (c) => [await c.centrePixel('dialog-box', '#f8f8f6', 3), await c.bgColor('dialog-name', '#f0d055')],
  },
  { name: 'dusk_temple', url: `/?${Q}&chapter=ch2&at=vp_temple_2011`, calls: '', checks: async (c) => [await c.rectColours('dusk_temple', 'sky', ['#c98a74', '#efc193'], 3)] },
  {
    name: 'mirror', url: `/?${Q}&chapter=ch2&flags=P4_done,tudi_met&at=sp_mirror_stand`, calls: "viewfinder(true); aim('T_mirror_self')",
    checks: async (c) => [await c.evalShot({ frame: 'green', targetId: 'T_mirror_self' })],
  },
  {
    name: 'night_store', url: `/?${Q}&chapter=ch3&at=sp_store_front`, calls: '',
    checks: async (c) => [await c.nonSkyLuma(0.28, ['#22365a', '#34507a']), await c.rectMedianLuma('night_store', 'litWall', 0.45), await c.inkRatio(0.02), await c.rectColours('night_store', 'sky', ['#22365a'], 6)],   // the arcade store fills the top rows here (like dusk_temple): sky rect
  },
  {
    name: 'night_chai', url: `/?${Q}&chapter=ch3&at=vp_subway_top`, calls: "viewfinder(true); zoom(1); aim('T_chai')",
    checks: async (c) => [await c.evalShot({ frame: 'green' }), await c.text('vf-recog', '识别：折 · 红圈喷漆 97%')],
  },
  { name: 'subway', url: `/?${Q}&chapter=ch3&at=sw_gantry`, calls: '', checks: async (c) => [await c.stateIs('scene', 'subway_int'), await c.timeRenderBelow(60)] },
  { name: 'after_zhe', url: `/?${Q}&chapter=ch3&flags=P8_done&at=sp_chai`, calls: '', checks: async (c) => [await c.stateIs('faceState', 'clear')] },
  {
    name: 'darkroom', url: `/?${Q}&chapter=ch3`, settle: false,
    calls: "solve('P6_lighthouse_1987'); solve('P7_line_zero'); solve('P8_chai_to_zhe'); solve('P9_paper_eye'); setFlag('dk_hung'); goto('dk_line'); viewfinder(true); step(30)",
    checks: async (c) => [await c.hasPhoto((p) => p.id.includes('ph_2023_stitched') || p.tags.includes('ph_2023_stitched'), 'ph_2023_stitched')],
  },
  { name: 'dawn_group', url: `/?${Q}&chapter=finale&at=sp_tripod`, calls: '', checks: async (c) => [await c.lineup()] },
  { name: 'roof_view', url: `/?${Q}&chapter=ch3&at=sp_roof`, calls: 'look(200, 5)', checks: async () => [] },
  {
    // afterUntil: the card opens with the GDD §15 white flash (0.3 s + 1.2 s fade); capture once it has faded (I-gate)
    name: 'photo_card', url: `/?${Q}&chapter=finale`, settle: false, until: '[data-testid=photo-card]', afterUntil: 'step(96)',
    calls: "goto('sp_tripod'); interact(); interact(); goto('sp_stairs_x'); step(660); await __settle(); goto('sp_bus_bench'); talk('attendant'); choose(0)",
    checks: async (c) => [await c.hasPhoto((p) => p.tags.includes('ph_2026_group') && p.label === '周远 · 人 100%', 'ph_2026_group label')],
  },
];
