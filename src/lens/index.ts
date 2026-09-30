// src/lens/index.ts — owner D. createLens: the viewfinder, the single evalShot judge driving the live frame, photos,
// peeks, presets, the mirror / smoke / darkroom hooks and the ?dev=lens:targets walker (ARCHITECTURE §3.D).
import { Vector3 } from 'three';
import type { LensApi, ModuleFactory } from '../contracts';
import type { PhotoTarget, ShotCond, ShotResult, StrKey, TargetId, Zoom } from '../types';
import { t, has as hasStr } from '../data/zh';
import { keyless } from '../data/zh/ui';
import { createLensCtx } from './ctx';
import { createShots } from './capture';
import { createModes } from './modes';
import { createPresets } from './presets';
import { GUIDE_ROUTE, createTripod } from './tripod';
import { createExtras } from './extras';
import { createRephoto } from './rephoto';
import { createOverlay, type OverlayModel, type TripodGuide } from './overlay';
import { chartToWorld } from '../core/planet';
import { targetById } from './view';
import { checkTarget } from './evalShot';
import { runTargetWalk } from './devTargets';
import { TalkGate } from './talkGate';

const ZOOM_STEPS: readonly Zoom[] = [1, 3, 10];
const REATTACH_AFTER = 1.0;
/** P3 G3: Space/LMB are both `advance` and `shutter`; a press this soon (s) after a dialogue/card closed was meant
 *  for that box, not for the camera (it used to spend film on photos of nothing). */
export const SHUTTER_GUARD = 0.3;
/** P3r3: E mashed through a night talk must not reopen it — see talkGate.ts (TALK_GUARD, restarted by every E). */
export { TALK_GUARD } from './talkGate';
/** P3r3 G7: 「按 E 和纸妹交谈」 — the tag names who a night E would talk to (npc.* name; 拆 reads 折 after P8). */
export function talkTagText(who: string, p8: boolean): string {
  const key = (who === 'chai' && p8 ? 'npc.chai_zhe' : `npc.${who}`) as StrKey;
  return hasStr(key) ? t('vf.talkTag.who', { name: t(key) }) : t('vf.talkTag');
}
/** P3 round 2 (E): on a touch device (E's touch layer sets `ui-touch-device`) hints name the on-screen buttons, not keys. */
const onTouch = () => typeof document !== 'undefined' && document.documentElement.classList.contains('ui-touch-device');
const kl = (s: string): string => (onTouch() ? keyless(s) : s);

export const createLens: ModuleFactory<LensApi> = (core) => {
  const lc = createLensCtx(core);
  const { state, pose } = lc;
  const shots = createShots(lc);
  const modes = createModes(lc, shots);
  const presets = createPresets(lc, shots);
  const tripod = createTripod(lc, modes, presets);
  const extras = createExtras(lc, modes, presets);
  const rephoto = createRephoto(lc, presets);
  let holdMode = false, rmbUp = false;
  let reattachAt: number | null = null;
  let uiBusyAt = -1e9;
  const talkGate = new TalkGate();
  let lastHint: { cond: ShotCond | null; target: TargetId | null } = { cond: null, target: null };
  // draw(): one reused overlay model + the recognition string rebuilt only when its inputs change (§5.1)
  const model: OverlayModel = {
    on: false, state: 'white', recog: '', hint: null, zoom: 1, night: false, flash: false, torch: false, score: null, counter: 0,
    clock: '', recBlink: true, exposure: null, peek: null, peekExit: '', compact: false, talk: false, tripodView: false,
  };
  const expoModel = { left: 2, k: 0 };
  let recogKey = '';

  shots.hooks.onGreen = (tg: PhotoTarget) => {
    rephoto.onGreen(tg);
    if ((state.peek === 'pk_coop' || state.peek === 'pk_psd') && tg.onlyFrom === state.peek) reattachAt = core.clock.t + REATTACH_AFTER;
  };
  modes.onChange((on) => { if (!on) { tripod.cancel(); reattachAt = null; rephoto.reset(); } });

  const setZoom = (z: Zoom) => {
    if (state.peek === 'tripod' || state.zoom === z) return;
    state.zoom = z;
    lc.invalidate();
    modes.emitLens();
  };
  const setTorch = (on: boolean) => {
    state.torch = on;
    try { core.services.chars.hero.setTorch(on); } catch { /* C not ready */ }
  };

  /** GDD §19.3 aim: the normalised mean of the unit directions to the anchor, every `whole` point and every
   *  `mustContain` anchor (never `mustBeHidden`). P8 fallback: the bisector of the glyph centre and V→D. */
  const aim = (id: TargetId) => {
    const tg = targetById(id);
    if (!tg) { core.log.warn(`[lens] aim: unknown target ${id}`); return; }
    if (!state.active) modes.open();
    const p = lc.updatePose();
    const from = p.pos.clone();
    const a = lc.anchors.targetPos(tg, new Vector3());
    if (!a) { core.log.warn(`[lens] aim: ${id} has no resolvable anchor here`); return; }
    const sum = a.clone().sub(from).normalize();
    for (const w of lc.anchors.wholeOf(tg) ?? []) sum.add(w.clone().sub(from).normalize());
    for (const cid of tg.mustContain ?? []) {
      const ct = targetById(cid);
      const q = ct ? lc.anchors.targetPos(ct, new Vector3()) : null;
      if (q) sum.add(q.sub(from).normalize());
    }
    pose.aimDir(sum.normalize());
    lc.invalidate();
    if (tg.special === 'chai_dual') {
      const r = lc.evaluate(true);
      if (r.res.targetId === id && r.res.failed === 'hidden') {
        const dot = lc.anchors.spotPoint('sp_net_dot', new Vector3());
        if (dot) {
          const bis = a.clone().sub(from).normalize().add(dot.sub(from).normalize()).normalize();
          pose.aimDir(bis);
          lc.invalidate();
          const r2 = lc.evaluate(true);
          if (r2.res.frame !== 'green') { pose.aimDir(sum); lc.invalidate(); }
        }
      }
    }
  };

  const api: LensApi = {
    state,
    async init() {
      if (typeof document !== 'undefined' && typeof (core.uiRoot as { appendChild?: unknown }).appendChild === 'function') {
        lc.overlay = createOverlay(core.uiRoot);
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        // the viewfinder push keeps aimHold (Phase 2), so input's released('aimHold') ends hold-to-aim; this window
        // listener stays as a fallback for a dialog pushed over the viewfinder (that push releases the source)
        window.addEventListener('mouseup', (e) => { if (e.button === 2) rmbUp = true; });
        window.addEventListener('blur', () => { rmbUp = true; });
      }
      core.rules.onAction('photo', (a) => presets.render(a.photo).then(() => undefined));
      core.rules.onAction('detach', (a) => modes.enterPeek(a.detach));
      core.bus.on('teleported', () => {
        if (lc.selfTeleport > 0 || state.peek === 'tripod') return;   // the headless body walks while the head stays
        if (state.peek) void modes.exitPeek();
        else if (state.active) modes.close();
      });
      core.bus.on('stateLoaded', () => {
        // a load in a peek must also put the head back (exitPeek reattaches; exitPeekSync alone left it on the mount)
        if (state.peek) void modes.exitPeek(); else if (state.active) modes.close();
        lc.anchors.reset();
        lc.photoPose.clear();
        extras.resetReveal();
        lc.dirty();
        presets.refresh('missing');
      });
      for (const ev of ['flagSet', 'itemGained', 'phaseChanged', 'photoTaken', 'refPhotoChanged'] as const) core.bus.on(ev, () => lc.dirty());
      // P3 G3: a story card (序卷, chapter cards, epilogues…) takes over the screen: put the phone head down so the
      // Space presses that skip the card cannot reach the shutter. Peeks (the tripod's photo card) keep their view.
      core.bus.on('cardShown', () => { uiBusyAt = core.clock.t; talkGate.busy(uiBusyAt); if (state.active && !state.peek) modes.close(); });
      core.bus.on('faceState', () => presets.refresh('faces'));
      core.bus.on('photoRemoved', (e) => { lc.photoPose.delete(e.id); });
      core.loop.addSystem('lens:main', 'lens', (dt) => update(dt));
      core.loop.addSystem('lens:overlay', 'ui', () => draw());
    },
    devHook(arg) {
      installProbe();
      if (arg === 'targets' || arg === '') runTargetWalk(core, api, lc);
      else if (arg !== 'probe') core.log.warn(`[lens] unknown dev hook ${arg}`);
    },
    setViewfinder(on) { if (on) modes.open(); else modes.close(); },
    setZoom,
    setLens(o) {
      if (o.night === true && !state.active) modes.open();
      if (o.night !== undefined) state.night = o.night && state.active;
      if (o.flash !== undefined) state.flash = o.flash;
      if (o.overlay !== undefined) state.overlay = o.overlay;
      if (o.torch !== undefined) setTorch(o.torch);
      lc.invalidate();
      modes.syncRender();
      modes.emitLens();
    },
    aim,
    evalNow(): ShotResult {
      const r = lc.evaluate(true).res;
      if (state.active) state.frame = r.frame;
      return r;
    },
    shoot(o) {
      if (!state.active) modes.open();
      return shots.shoot(o);
    },
    enterPeek: (id) => modes.enterPeek(id),
    exitPeek: () => modes.exitPeek(),
    startTripodTimer() { tripod.start(); },
    renderPreset: (id) => presets.render(id),
    darkroomReveal: () => extras.darkroomReveal(),
    darkroomInRange: () => extras.darkroomInRange(),
    lastPhotoId: () => lc.lastPhotoId,
    isNightView: () => state.active && state.night,
    nightTalk: () => state.active && state.night && !state.peek && extras.talk(),
    look(yawDeg, pitchDeg) {
      if (!state.active) { core.cameraRig.look(yawDeg, pitchDeg); return; }
      if (state.peek === 'tripod') return;   // the tripod camera is fixed (GDD §9 S_group_photo)
      pose.lookAbs(yawDeg, pitchDeg);
      lc.invalidate();
    },
  };

  /** ?dev=lens:probe — window.__lens for poking at anchors and the pose from Playwright. */
  const installProbe = () => {
    const w = window as unknown as { __lens?: unknown };
    const v = (x: Vector3 | null | undefined) => (x ? [+x.x.toFixed(3), +x.y.toFixed(3), +x.z.toFixed(3)] : null);
    w.__lens = {
      anchor: (id: string) => {
        const r = lc.anchors.world(id as never);
        return r ? { scene: r.scene, pos: v(r.pos), normal: v(r.normal), radius: r.radius, corners: r.corners?.map(v) ?? null, fromWorld: !!r.info } : null;
      },
      target: (id: TargetId) => { const tg = targetById(id); const p = tg ? lc.anchors.targetPos(tg, new Vector3()) : null; return v(p); },
      pose: () => { const p = lc.updatePose(); return { pos: v(p.pos), dir: v(p.dir), yaw: p.yaw, pitch: p.pitch, scene: p.scene }; },
      eval: () => { const r = lc.evaluate(true); return { res: r.res, view: r.ev ? { ...r.ev.view } : null, checks: r.ev?.checks ?? null }; },
      occluders: () => { try { return core.services.world.occluders(lc.pose.pose.scene).length; } catch { return -1; } },
      check: (id: TargetId) => {
        const tg = targetById(id);
        if (!tg) return null;
        lc.evaluate(true);
        const v = lc.view.bind(lc.pose.cam, lc.pose.pose).measure(tg);
        return v ? { view: v, checks: checkTarget(tg, v, lc.shotCtx()) } : null;
      },
      rays: (id: TargetId) => { const tg = targetById(id); if (!tg) return null; lc.evaluate(true); return lc.view.debugRays(tg); },
    };
  };

  // ------------------------------------------------------------------------------------------------ per tick
  const input = () => {
    const i = core.input;
    const ctx = i.context();
    if (ctx === 'gameplay' && !state.active) {
      if (i.pressed('aimToggle')) { holdMode = false; modes.open(); }
      else if (i.pressed('aimHold')) { holdMode = true; rmbUp = false; modes.open(); }
      if (i.pressed('flash')) { setTorch(!state.torch); modes.emitLens(); }
      return;
    }
    const lensCtx = ctx === 'viewfinder' || ctx === 'peek' || (ctx === 'gameplay' && state.peek === 'lh_door');
    if (!lensCtx || !state.active) return;
    const look = i.consumeLook();
    if ((look.dx || look.dy) && state.peek !== 'tripod') { pose.look(look.dx, look.dy, state.zoom, !state.peek); lc.invalidate(); }
    if (i.pressed('escape')) {
      if (state.exposing) shots.cancel(); else modes.close();
      return;
    }
    if (holdMode && i.released('aimHold')) rmbUp = true;
    if (!state.peek && (i.pressed('aimToggle') || (holdMode && rmbUp))) { holdMode = false; modes.close(); return; }
    // G1: the E that mounted the head this very tick (core interact → {detach}) is not also an exit / timer press
    if (i.pressed('interact') && !modes.justEntered) {
      if (state.peek === 'pk_coop' || state.peek === 'pk_psd') { void modes.exitPeek(); return; }
      if (state.peek === 'tripod') tripod.start();
      // P3r3: the E that closed a dialogue, and every E inside the quiet window after it, never reopens a night talk
      else if (!state.peek && state.night && talkGate.press(core.clock.t)) extras.talk();
    }
    if (state.peek !== 'tripod') {
      if (i.pressed('zoom1')) setZoom(1);
      if (i.pressed('zoom3')) setZoom(3);
      if (i.pressed('zoom10')) setZoom(10);
      const k = ZOOM_STEPS.indexOf(state.zoom);
      if (i.pressed('zoomIn') && k < 2) setZoom(ZOOM_STEPS[k + 1]);
      if (i.pressed('zoomOut') && k > 0) setZoom(ZOOM_STEPS[k - 1]);
      if (i.pressed('night') && core.store.hasVerb('night')) api.setLens({ night: !state.night });
      if (i.pressed('flash')) api.setLens({ flash: !state.flash });
      if (i.pressed('overlay')) api.setLens({ overlay: !state.overlay });
      if (i.pressed('shutter') && core.clock.t - uiBusyAt >= SHUTTER_GUARD) shots.press();
    }
  };

  const update = (dt: number) => {
    try { const b = core.services.ui.busy(); if (b.dialogue || b.card) { uiBusyAt = core.clock.t; talkGate.busy(uiBusyAt); } } catch { /* E not ready */ }
    talkGate.tick(core.input.held('interact'));
    if (shots.busy) { shots.tick(dt); tripod.tick(); return; }
    input();
    if (state.active) {
      const { res } = lc.evaluate();
      state.frame = res.frame;
      if (res.failed !== lastHint.cond || res.targetId !== lastHint.target) {
        lastHint = { cond: res.failed, target: res.targetId };
        core.bus.emit('lensHint', lastHint);
      }
      if (!state.exposing) { shots.trackGranny(); shots.scan(res, dt); }
    }
    shots.tick(dt);
    tripod.tick();
    extras.tick();
    rephoto.tick();
    if (reattachAt !== null && core.clock.t >= reattachAt) { reattachAt = null; void modes.exitPeek(); }
  };

  // G2: project the tripod route onto the overlay (the displayed camera = the lens override's)
  const guideWorld = GUIDE_ROUTE.map((p) => chartToWorld(p));
  const gv = new Vector3();
  const guidePts: [number, number][] = [];
  const guidePool: [number, number][] = GUIDE_ROUTE.map(() => [0, 0]);   // no per-frame arrays
  const guideOut: TripodGuide = { pts: guidePts, x: null, ok: false, bob: 0, scale: 1, body: null };
  const bodyMark = { x: 0, y: 0, deg: 0 };
  const bodyUp = new Vector3(), toBody = new Vector3();
  const guideModel = (): TripodGuide | null => {
    const g = tripod.guide();
    if (!g.on) return null;
    const cam = core.cameraRig.camera;
    cam.updateMatrixWorld();
    const w = lc.overlay?.el.clientWidth || 1280, h = lc.overlay?.el.clientHeight || 720;
    guidePts.length = 0;
    let xs: [number, number] | null = null;
    for (let i = 0; i < guideWorld.length; i++) {
      gv.copy(guideWorld[i]).project(cam);
      if (gv.z > 1 || gv.z < -1) continue;                 // behind the lens
      const sp = guidePool[i];
      sp[0] = (gv.x * 0.5 + 0.5) * w; sp[1] = (0.5 - gv.y * 0.5) * h;
      guidePts.push(sp);
      if (i === guideWorld.length - 1) xs = sp;
    }
    guideOut.x = xs; guideOut.ok = g.atX;
    guideOut.bob = Math.sin(core.clock.animT * 5) * 5;
    guideOut.scale = Math.min(w / 1280, h / 720);
    // the body out of frame: a marker on the frame edge pointing at it (chest height)
    guideOut.body = null;
    core.player.pos(gv).addScaledVector(core.player.up(bodyUp), 1.0);
    toBody.copy(gv).applyMatrix4(cam.matrixWorldInverse);   // view space: the lens looks down −z
    gv.project(cam);
    const ahead = toBody.z < -0.05;
    if (!ahead || Math.abs(gv.x) > 1 || Math.abs(gv.y) > 1) {
      // off frame (or beside / under the lens): head from the centre toward the body's view-space direction
      let nx = ahead ? gv.x : toBody.x, ny = ahead ? gv.y : toBody.y * cam.aspect;
      if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) ny = -1;
      const k = 1 / Math.max(Math.abs(nx), Math.abs(ny));
      nx *= k; ny *= k;
      const m = 56 * guideOut.scale;
      bodyMark.x = Math.min(w - m, Math.max(m, (nx * 0.5 + 0.5) * w));
      bodyMark.y = Math.min(h - m, Math.max(m, (0.5 - ny * 0.5) * h));
      bodyMark.deg = Math.atan2(-ny, nx) / (Math.PI / 180);
      guideOut.body = bodyMark;
    }
    return guideOut;
  };

  const draw = () => {
    const ov = lc.overlay;
    if (!ov) return;
    // the shutter flash / polaroid fade on sim time even while a dialogue camera hides our chrome (I-look, P7: the
    // attendant's beep line right after a flash shot froze the white flash layer at full opacity over the whole screen)
    ov.flash(core.clock.t - lc.fx.flashAt, lc.fx.flashStrength);
    ov.polaroid(lc.fx.polaSrc, core.clock.t - lc.fx.polaAt);
    // a dialogue / beat camera pushed over ours (night talk, cutscenes) hides the viewfinder chrome
    const on = state.active && core.cameraRig.top() === 'lens';
    const m = model;
    m.on = on; m.hint = null; m.state = 'white';
    if (on) {
      const { res } = lc.evaluate();
      m.state = res.frame;
      const msg = lc.fx.msg && core.clock.t < lc.fx.msg.until ? lc.fx.msg.text : null;
      // G5: a green target whose answer only the photo may show (P6 「1987」) reads its live line instead of okKey
      const liveKey = res.frame === 'green' && res.targetId ? targetById(res.targetId)?.liveKey : undefined;
      const live = liveKey ? t(liveKey) : null;
      const key = msg !== null ? `m${msg}` : live !== null ? `l${live}` : `${res.confidence ?? ''}|${res.label}`;
      if (key !== recogKey) {
        recogKey = key;
        m.recog = msg !== null ? t('vf.recogFixed', { label: msg }) : live !== null ? t('vf.recogFixed', { label: live })
          : res.confidence === null ? t('vf.recogFixed', { label: res.label }) : t('vf.recog', { label: res.label, conf: res.confidence });
      }
      m.hint = res.frame === 'yellow' && !state.exposing && !msg && res.hint ? kl(res.hint) : null;
      const who = state.exposing ? null : extras.talkWho();
      m.talkTag = who ? kl(talkTagText(who, core.store.has('P8_done'))) : null;
    } else m.talkTag = null;
    if (!on && !ov.el.classList.contains('vf-on')) return;   // closed and already hidden: nothing to write
    const expo = shots.exposure;
    let talk = false;
    try { const b = core.services.ui.busy(); talk = b.dialogue || b.card; } catch { talk = false; }
    m.zoom = state.zoom; m.night = state.night; m.flash = state.flash; m.torch = state.torch;
    m.score = on && state.overlay ? rephoto.score() : null;
    m.counter = shots.counter(); m.clock = core.store.state.clock;
    m.recBlink = Math.floor(core.clock.t * 2) % 2 === 0;
    if (expo) { expoModel.left = Math.max(1, Math.ceil(2 - expo.k * 2 - 1e-9)); expoModel.k = expo.k; m.exposure = expoModel; }
    else m.exposure = null;
    m.peek = modes.label(); m.peekExit = kl(t(modes.exitKey())); m.compact = state.peek === 'lh_door'; m.talk = talk;
    m.tripodView = state.peek === 'tripod';
    ov.update(m);
    if (!on) return;
    const r = rephoto.view();
    ov.reference(r.src, r.opacity, r.colour);
    const tp = tripod.view();
    ov.tripod(tp.n, kl(tp.text));
    ov.tripodGuide(guideModel());
    const s = extras.strip();
    ov.strip(s.src, s.k, t('lbl.ph_2023_stitched'));
  };

  return api;
};
