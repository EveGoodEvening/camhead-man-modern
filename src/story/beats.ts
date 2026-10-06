// src/story/beats.ts — owner F. The scripted part of each beat (GDD §9, §15). State the game depends on is in
// data/story.ts BEATS[].end, which the runner applies after the script (also after skip()). Scripts only present:
// cameras, dialogue, cards, sfx/uncanny cues; mid-beat flags are set only where their timing is visible.
import { Vector3 } from 'three';
import type { Core, HeroExpr } from '../contracts';
import type { BeatId } from '../types';
import { DEG, SURFACES, dirToHeading, frameAt, headingToDir } from '../core/planet';
import { Director } from './director';
import { boardShots, BOARD_STAGE, clearShots, darkroomPrintCam, dolly, faceShots, orbit, pullBack, type Shot } from './cams';

export interface BeatEnv { core: Core; d: Director }
export type BeatScript = (e: BeatEnv) => Promise<void>;

// ---- small safe wrappers around other modules (never let a half-built module break a beat)
function tryDo(d: Director, what: string, fn: () => unknown): void {
  if (d.stopped) return;                         // the state this beat belonged to has been replaced
  const core = d.core;
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch((e: unknown) => core.log.warn(`[story] ${what}`, e));
  } catch (e) { core.log.warn(`[story] ${what} failed`, e); }
}
const expr = (d: Director, e: HeroExpr) => tryDo(d, 'expression', () => d.core.services.chars.hero.setExpression(e));
const lensOff = (d: Director) => tryDo(d, 'viewfinder off', () => { if (d.core.services.lens.state.active) d.core.services.lens.setViewfinder(false); });
const spotPos = (core: Core, id: Parameters<Core['services']['world']['spotPos']>[0]): Vector3 => {
  try { return core.services.world.spotPos(id, new Vector3()); } catch { return core.player.pos(); }
};
const anchorPos = (core: Core, id: Parameters<Core['services']['world']['anchor']>[0], fallback: Vector3): Vector3 => {
  try { return core.services.world.anchor(id).pos.clone(); } catch { return fallback.clone(); }
};

/** The current camera as a Shot (start of a pull-back). */
function currentShot(core: Core): Shot {
  const cam = core.cameraRig.camera;
  const dir = cam.getWorldDirection(new Vector3());
  return { pos: cam.position.clone(), look: cam.position.clone().addScaledVector(dir, 10), up: cam.up.clone(), fov: cam.fov };
}

// ------------------------------------------------------------------------------------------------ S_wake (GDD §9)
/** End state of S_wake, also after skip(): standing on sp_bus_bench facing the bridge, no lie/sit pose left over. */
export function wakeDone(d: Director): void {
  if (d.stopped) return;
  const core = d.core;
  if (core.player.scene !== 'planet') return;
  tryDo(d, 'wake end goto', () => core.player.goto('sp_bus_bench', { fade: false }));
  // P3r2 (camera): he gets up and takes a step away from the bench, and the follow camera looks down a little: the
  // over-the-shoulder view then passes over the bench back instead of through it (it hid him from the hips down, so
  // round 1 dithered it; the bench is solid again)
  tryDo(d, 'wake end step', () => wakeEndPose(core));
  tryDo(d, 'wake end stand', () => core.services.chars.hero.play('stand'));
}
/** Metres he steps forward from sp_bus_bench after waking, and the follow pitch then (deg, negative = from above). */
const WAKE_STEP = 1.0, WAKE_PITCH = -8;
/** The first playable pose (end of S_wake; also ?skipTitle): one step off the bench, follow camera slightly above. */
export function wakeEndPose(core: Core): void {
  const s = core.services.world.spot('sp_bus_bench');
  if (!('r' in s.pos)) return;
  core.player.teleport({ scene: 'planet', at: { r: s.pos.r, lon: s.pos.lon + WAKE_STEP / (s.pos.r * DEG) }, yawDeg: s.yaw ?? 90 });
  core.cameraRig.pitchDeg = WAKE_PITCH;
}
const S_wake: BeatScript = async ({ core, d }) => {
  const hero = core.services.chars.hero;
  // E's ink cards are the black screen here (the fade layer would sit on top of them)
  await d.card('chapter', 'epigraph');          // 昔者仓颉作书…（3 s）
  await d.card('chapter', 'prologue');          // 序章 · 醒 / 9月29日 06:10
  await d.fade(true, 0);                        // then the camera fades in on the bench
  // (C2/F7: B's wake bench sits across sp_bus_bench's yaw, seat 0.4 m behind the spot, as C's lie/sit poses assume;
  // skipped during the cards he never lies down: wakeDone() puts him straight on his feet)
  // low shot from in front of the bench: he lies there, then sits up (1.5 s)
  const P = core.player.pos(), F = core.player.facing();
  const [a, b] = clearShots(core, core.player.scene, P, F, [
    // P3-look L1: from the road side of the shelter's middle (side < 0): the old +0.6/+0.9 hugged the shelter's back
    // panel (a dark slab over the left third) and lined the bus-stop sign pole up beside his head; b stays short of the
    // shelter's bin (4.3 m out it filled the lower half)
    { back: -2.8, side: -0.6, height: 0.8, lookH: 0.7, fov: 42 },
    { back: -3.3, side: -0.7, height: 1.2, lookH: 1.05, fov: 44 },
  ]);
  const popCam = d.cam(dolly(a, b, d.t, 10, () => d.t));
  if (!d.aborted) tryDo(d, 'hero wake', () => hero.play('wake'));
  expr(d, 'calm');
  await d.fade(false, 1.2);
  await d.wait(0.6);
  expr(d, 'puzzled');
  await d.say('me.wake');
  // the phone buzzes: a friend request that accepts itself 1.5 s later (GDD S_wake step 6)
  void d.run([{ sfx: 'sfx_ping' }, { toast: 'sys.friend_request' }]);
  expr(d, 'surprised');
  await d.wait(1.5);
  await d.run([{ toast: 'sys.friend_added' }, { set: 'wx_tudi_added' }]);
  await d.wait(0.8);
  popCam();                                      // back to the over-the-shoulder camera: the back screen faces us
  wakeDone(d);                                   // stands up at the cut
  expr(d, 'calm');
  await d.wait(1.0);
  await d.run([{ uncanny: 'M_wake_face' }]);     // a stranger's smile on the back screen, 0.5 s
  await d.wait(0.8);
};

// ------------------------------------------------------------------------------------------------ S_mirror (中点)
const S_mirror: BeatScript = async ({ core, d }) => {
  lensOff(d);
  expr(d, 'surprised');
  const P = core.player.pos(), F = core.player.heading();
  // over the shoulder toward the mirror: only small swings, the mirror must stay ahead
  const [a, b] = clearShots(core, core.player.scene, P, F, [
    { back: 1.9, side: 0.5, height: 1.95, lookH: 1.7, lookFwd: 3.5, fov: 40 },
    { back: 1.5, side: 0.42, height: 1.85, lookH: 1.72, lookFwd: 3.5, fov: 36 },
  ], [0, 15, -15, 30, -30]);
  d.cam(dolly(a, b, d.t, 4, () => d.t));
  await d.wait(0.5);
  await d.run([{ uncanny: 'M_mirror_face' }]);   // his own face flashes on the back screen, 0.5 s
  await d.wait(0.9);
  expr(d, 'thinking');
  await d.say('me.mirror');
};

// ------------------------------------------------------------------------------------------------ S_sunset (天台日落)
const S_sunset: BeatScript = async ({ core, d }) => {
  lensOff(d);
  expr(d, 'found');
  const f = frameAt(SURFACES.planet, core.player.pos());
  const center = core.player.pos().addScaledVector(f.up, 1.2);
  const fc = frameAt(SURFACES.planet, center);
  const headingTo = (p: Vector3) => dirToHeading(fc, p.clone().sub(center));
  const lighthouse = anchorPos(core, 'lm:lighthouse', spotPos(core, 'sp_lighthouse_door'));
  const crane = anchorPos(core, 'lm:crane', spotPos(core, 'sp_site_gate'));
  const chai = anchorPos(core, 'chai', spotPos(core, 'sp_chai'));
  // the camera stands opposite a landmark when that landmark is behind the hero in frame
  const cL = headingTo(lighthouse) + 180, cC = headingTo(crane) + 180, cZ = headingTo(chai) + 180;
  const sign = (((cC - cL + 540) % 360) - 180) >= 0 ? 1 : -1;       // swing from the lighthouse toward the crane
  const start = cL - 50 * sign;
  const seconds = 8;
  // the sky sinks toward night while the camera circles (the chapter card then makes it official)
  tryDo(d, 'palette', () => core.services.render.setPalette('night', seconds));
  // I-look: 7 m above the roof and ≈ 38° down — from 20 m up the planet's horizon dips ≈ 45°, so the old ≈ 15° look
  // saw only the parapet and the sky; this orbit puts the whole town around the roof in frame (GDD §5.8 reveal)
  d.cam(orbit(center, 'planet', start, 360 * sign, 9, 7, d.t, seconds, () => d.t, 55, 1.5));
  const at = (h: number) => ((((h - start) * sign) % 360) + 360) % 360 / 360 * seconds;
  const cues = [
    { t: at(cL), a: { sfx: 'sfx_chime' as const } },              // 灯塔亮起
    { t: at(cC), a: { sfx: 'sfx_ping' as const } },               // 塔吊红灯开始闪
    { t: at(cZ), a: { sfx: 'sfx_notice' as const } },             // 「拆」动了一下
  ].sort((x, y) => x.t - y.t);
  let elapsed = 0;
  for (const c of cues) {
    await d.wait(c.t - elapsed);
    elapsed = c.t;
    void d.run([c.a]);
  }
  await d.wait(seconds - elapsed + 0.3);
};

// ------------------------------------------------------------------------------------------------ S_zhe (P8 success)
const S_zhe: BeatScript = async ({ core, d }) => {
  lensOff(d);
  expr(d, 'surprised');
  await d.wait(0.9);                                              // the dot drips off the net (B, on P8_done)
  await d.run([{ uncanny: 'M_zhe' }, { sfx: 'sfx_notice' }]);    // 折; uUncanny 1 → 0 over 2 s
  await d.wait(1.2);                                              // every 拆 on the planet turns into 折
  await d.run([{ set: 'faces_restored' }]);                       // faces: blank → mosaic → clear in 1.5 s (C)
  await d.wait(1.6);
  // 3 s cut to 403: granny at her gallery door with the frame
  const W = spotPos(core, 'sp_estate_window');
  const fw = frameAt(SURFACES.planet, W);
  let yaw = 260;
  try { yaw = core.services.world.spot('sp_estate_window').yaw ?? 260; } catch { /* keep 260 */ }
  const facing = headingToDir(fw, yaw);
  // P3r2 look L2: her face and the restored photo in her hands, front-on at her eye height (the old high shot hid her
  // face under the hat and never showed the photo)
  // (she stands in the 4th-floor gallery: a long lens from across the courtyard, face at the top, the photo below it)
  const face = faceShots(core, 'granny_wang', [{ dist: 4.6, side: 0.6, eyeOver: 0.15, lookDrop: 0.5, fov: 22 }, { dist: 4.3, side: 0.55, eyeOver: 0.15, lookDrop: 0.5, fov: 20 }], [], facing);
  const [a, b] = face ?? clearShots(core, 'planet', W, facing, [
    { back: -4.6, side: 1.1, height: 2.1, lookH: 0.75, fov: 42 },
    { back: -4.0, side: 0.9, height: 2.0, lookH: 0.8, fov: 38 },
  ]);
  const pop = d.cam(dolly(a, b, d.t, 3.5, () => d.t));
  await d.wait(0.5);
  await d.say('granny.window_cut');
  await d.wait(0.5);
  pop();
  await d.wait(0.3);
  await d.say('chai.after');
  expr(d, 'calm');
  await d.say('me.zhe');
};

// ------------------------------------------------------------------------------------------------ S_darkroom (tail)
/** P3r2 look L1: where he stands for the developed print (studio-local; the print hangs on dk_line, x 2.1–4.5, z −0.5). */
const DK_PRINT_MARK = { x: 4.55, y: 0, z: 0.45, yaw: 305 } as const;
/** Seconds S_darkroom waits for the lens reveal (1.6 s nominal) before developing the print anyway. */
export const DARKROOM_TIMEOUT = 6;
const S_darkroom: BeatScript = async ({ core, d }) => {
  // step 4: the viewfinder turns negative → positive and the stitched print develops (D); the beat covers it so the
  // game reads busy (and skip() works) while it runs
  // P3 G1: never hold the cutscene on the lens forever (a closed viewfinder or a reveal that cannot start): after
  // DARKROOM_TIMEOUT s of sim time the print is developed without the negative view
  try { await Promise.race([d.hold(core.services.lens.darkroomReveal()), d.wait(DARKROOM_TIMEOUT)]); }
  catch (e) { core.log.warn('[story] darkroomReveal failed', e); }
  if (!d.aborted && !core.store.photo('ph_2023_stitched')) {
    try { await d.hold(core.services.lens.renderPreset('ph_2023_stitched')); } catch (e) { core.log.warn('[story] stitched print', e); }
  }
  await d.wait(1.6);                                              // the stitched positive stays on screen a moment
  lensOff(d);
  // P3r2 look L1: the developed print now hangs on the drying line (world/darkroom.ts): he stands beside it and the
  // camera frames the print — the empty chalk X in its middle — and him, for the envelope and 「拍照的人，不在照片里」
  if (!d.aborted && core.player.scene === 'studio_int') {
    tryDo(d, 'darkroom mark', () => core.player.teleport({ scene: 'studio_int', at: DK_PRINT_MARK, yawDeg: DK_PRINT_MARK.yaw }));
    d.cam(darkroomPrintCam());
  }
  await d.run([{ sfx: 'sfx_paper' }, { give: 'envelope_dad' }]);
  await d.say('note.envelope');
  expr(d, 'found');
  await d.say('me.developed');
};

// ------------------------------------------------------------------------------------------------ S_group_photo (intro)
const S_group_photo: BeatScript = async ({ core, d }) => {
  lensOff(d);
  const T = spotPos(core, 'sp_tripod'), G = spotPos(core, 'sp_stairs_x');
  const ft = frameAt(SURFACES.planet, T);
  const up = ft.up.clone();
  // P3r2 look L2: a street group photo seen from just in front of the tripod at eye height: both rows whole (the old
  // tripod-height shot looked at the stairs and cut the front row off at the bottom edge)
  const toG = G.clone().sub(T); toG.addScaledVector(up, -toG.dot(up));
  const mid = T.clone().addScaledVector(toG, 0.78);    // between the pavement row and the stair tier, at street level
  toG.normalize();
  const a: Shot = { pos: T.clone().addScaledVector(toG, 0.4).addScaledVector(up, 1.7), look: mid.clone().addScaledVector(up, 2.1), up, fov: 60 };
  const b: Shot = { pos: T.clone().addScaledVector(toG, 0.8).addScaledVector(up, 1.65), look: mid.clone().addScaledVector(up, 2.05), up, fov: 60 };
  const wide = d.cam(dolly(a, b, d.t, 4, () => d.t));
  await d.wait(1.8);
  // 小林 front-on above the dialogue box for her line
  const xl = faceShots(core, 'xiaolin', [{ dist: 1.9, side: 0, fov: 30 }]);
  const pop = xl ? d.cam(dolly(xl[0], xl[0], d.t, 1, () => d.t)) : null;
  await d.say('xiaolin.group_start');
  pop?.();
  wide();
  // his back screen types the answer, the lineup beyond him
  const P = core.player.pos(), F = core.player.heading();
  // (high enough that the seawall rail behind the tile passes under the frame / behind the dialogue box)
  const [m] = clearShots(core, 'planet', P, F, [{ back: 1.7, side: -0.6, height: 2.45, lookH: 1.35, lookFwd: 1.8, fov: 55 }], [0, 15, -15, 30, -30]);
  d.cam(dolly(m, m, d.t, 1, () => d.t));
  expr(d, 'happy');
  await d.say('me.group_ready');
};

// ------------------------------------------------------------------------------------------------ endings (GDD §15)
async function outro(env: BeatEnv, ending: 'A' | 'B'): Promise<void> {
  const { core, d } = env;
  const s = currentShot(core);
  d.cam(pullBack(s.pos, s.look, s.up, d.t, 5, () => d.t, () => core.clock.animT));
  await d.wait(5);
  // the pull-back ends on the title orbit's own pose; hand over to it under the photo card's white flash
  // (E's photo card opens full white 0.3 s, fades 1.2 s, holds 4 s — GDD §15 白闪 → 照片卡)
  tryDo(d, 'title orbit', () => core.cameraRig.setTitleMode(true));
  await d.card('photo', 'ph_2026_group');
  await d.card('epilogue', ending);                               // 文字尾声
  if (ending === 'A') await d.run([{ wx: 'wx_endA' }]);
  await d.card('liaozhai', ending === 'A' ? 'zhong_A' : 'zhong_B');
  await d.card('credits', 'credits');                             // F keeps the orbit + palette behind E's column
}

/** P3r3 look L3: seconds of the boarding steps (ending A); metres = BOARD_STAGE.walk. */
const BOARD_S = 1.5;
const S_ending_A: BeatScript = async (env) => {
  const { core, d } = env;
  lensOff(d);
  // P3r3 look L3: he boards the bus in one fixed shot from the kerb ahead of it (GDD §15.1 「主角上车，车门关上」): put on
  // the kerb in front of the open door, the uniform floats back inside, he steps into the doorway and is gone, the door
  // slides shut (sfx_door), then 0 路 pulls away and the camera rises. The old framing was built from wherever he stood
  // (the shelter bench, a flat bus side, him walking toward the footbridge).
  const hero = core.services.chars.hero;
  const bus = core.services.chars.busZero;
  if (!d.aborted) {
    const st = boardShots(bus.root);
    tryDo(d, 'board stand', () => { core.player.teleport({ scene: 'planet', at: st.stand, yawDeg: st.yawDeg }); hero.root.position.set(0, 0, 0); });
    d.cam(dolly(st.a, st.b, d.t, BOARD_S + 2.4, () => d.t));
    tryDo(d, 'attendant in', () => bus.board?.(0.9));   // the uniform makes room, then he steps in
    await d.wait(0.55);
    const t0 = d.t;
    tryDo(d, 'walk', () => hero.scriptWalk?.(BOARD_STAGE.walk / BOARD_S));
    const stop = d.tick(() => {
      const k = Math.min(1, (d.t - t0) / BOARD_S);
      hero.root.position.set(0, 0, k * BOARD_STAGE.walk);   // the root is his feet frame's child: +Z = his facing
    });
    await d.wait(BOARD_S);
    stop();
    tryDo(d, 'walk end', () => hero.scriptWalk?.(null));
  }
  tryDo(d, 'hero hide', () => { hero.root.visible = false; hero.root.position.set(0, 0, 0); hero.scriptWalk?.(null); });
  void d.run([{ sfx: 'sfx_door' }]);
  tryDo(d, 'door', () => bus.closeDoor?.(0.5));
  await d.wait(1.1);
  tryDo(d, 'bus depart', () => core.services.chars.busZero.depart(7));
  tryDo(d, 'palette', () => core.services.render.setPalette('dawn', 2));
  await d.wait(1.2);
  await outro(env, 'A');
};

const S_ending_B: BeatScript = async (env) => {
  const { core, d } = env;
  lensOff(d);
  expr(d, 'calm');
  await d.wait(3);                                                // the bus waits 3 s, then the door closes
  void d.run([{ sfx: 'sfx_door' }]);
  tryDo(d, 'bus depart', () => core.services.chars.busZero.depart(6));
  await d.wait(3.5);                                              // he watches it drop behind the horizon
  tryDo(d, 'palette', () => core.services.render.setPalette('day', 3));
  await outro(env, 'B');
};

const S_studio: BeatScript = async () => { /* free investigation: hints only (BEAT_HINTS), no script */ };

export const BEAT_SCRIPTS: Readonly<Record<BeatId, BeatScript>> = {
  S_wake, S_studio, S_mirror, S_sunset, S_zhe, S_darkroom, S_group_photo, S_ending_A, S_ending_B,
};
