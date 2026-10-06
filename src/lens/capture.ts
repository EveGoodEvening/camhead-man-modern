// src/lens/capture.ts — owner D. Shutter → Photo (ARCHITECTURE §3.D "Photo creation", GDD §3.4–§3.7, §3.13, §8.1):
// single / burst (3 × 0.3 s) / night long exposure (2 s still, transient pedestrians hidden, GHOST in), flash
// (10 m lit band), the white mirror photo, light-trail composite, auto npc:/lm: tags, onShot actions, bestiary awards,
// QR scanning (0.5 s dwell) and the granny blink epoch.
import { Vector3, type PerspectiveCamera } from 'three';
import type { CaptureOpts } from '../contracts';
import type { Photo, PhotoTarget, SceneId, ShotResult, TargetId, Zoom } from '../types';
import { TARGETS } from '../data/photoTargets';
import { BESTIARY } from '../data/bestiary';
import { t } from '../data/zh';
import { MAX_ALBUM } from '../core/state';
import { LAYER } from '../core/layers';
import { LANDMARK_ANCHORS } from './anchors';
import { drawQuad, drawTrail, toJpeg, toPixels, whiteOut } from './photoFx';
import type { Evaluation } from './evalShot';
import type { LensCtx } from './ctx';

export const BURST_N = 3, BURST_GAP = 0.3, BURST_HOLD = 0.3;
/** P3r3 G8: the burst decision — still held, or the real (wall-clock) hold reached BURST_HOLD. A capture that froze the
 *  page for 1.5 s used to advance the sim only 1/20 s, so a 1.2 s hold read as a click and never burst. */
export function burstHeld(held: boolean, holdWallMs: number | null | undefined): boolean {
  return held || (holdWallMs ?? 0) >= BURST_HOLD * 1000;
}
export const EXPOSURE = 2, STILL_DEG = 1.5;
export const QR_DWELL = 0.5;
export const AUTO_TAG_FRAC = 0.05;
export const FLASH_RANGE = 10;
export const GRANNY_RANGE = 6;
const NPC_RADIUS = 0.9;

/** Every tag a PhotoTarget / special can write: a photo with one of them is a story photo (never evicted, GDD §3.13). */
export const STORY_TAGS: ReadonlySet<string> = new Set<string>([
  ...TARGETS.filter((x) => x.kind !== 'landmark').flatMap((x) => x.onShot?.tags ?? []),
  'granny_face_open', 'granny_face_closed', 'chai_photo',
]);

/** P3 G8: a photo is `keep` (never evicted, not counted in n/40) only if it carries a story tag that no kept photo
 *  has yet — the first good shot of each story subject. Repeats and burst duplicates are ordinary album photos, so
 *  they can be evicted and dropped from a full save first instead of piling up (~44 KB each) until the quota fallback
 *  throws away every photo (and the P9 sea photo with them). */
export function keepFor(tags: readonly string[], album: readonly { keep: boolean; tags: readonly string[] }[]): boolean {
  return tags.some((x) => STORY_TAGS.has(x) && !album.some((p) => p.keep && p.tags.includes(x)));
}

export function createShots(lc: LensCtx) {
  const { core, state, pose, view, anchors } = lc;
  const tmp = new Vector3(), tmp2 = new Vector3(), startDir = new Vector3();
  let turned = 0;   // accumulated lens turn during the current exposure (deg)
  let expo: { t0: number; burst: false } | null = null;
  let expoResult: ShotResult | null = null;
  let burst: { left: number; nextAt: number } | null = null;
  let dwell: { id: TargetId; t: number } | null = null;
  const scanned = new Set<TargetId>();
  let grannyInFrame = false;
  let trailCanvas: HTMLCanvasElement | null = null;
  const expoView = { t0: 0, k: 0 };

  const bumpSeq = () => {
    const max = core.store.state.photos.reduce((m, p) => Math.max(m, p.seq), 0);
    lc.seq = Math.max(lc.seq, max) + 1;
    return lc.seq;
  };

  /** render.capture wrapper: never throws; the camera's layers are restored. */
  const capture = (o: CaptureOpts): HTMLCanvasElement | null => {
    const cam = o.camera;
    const mask = cam.layers.mask;
    cam.layers.set(LAYER.WORLD);
    if (o.ghost) cam.layers.enable(LAYER.GHOST);
    try { return core.services.render.capture({ width: 480, height: 270, ...o }); }
    catch (e) { core.log.warn('[lens] capture failed', e); return null; }
    finally { cam.layers.mask = mask; }
  };

  /** GDD §3.4: npc:<id> / lm:<id> for everything framed with projected size ≥ 0.05 and not occluded. */
  const autoTags = (night: boolean): string[] => {
    const out: string[] = [];
    const p = pose.pose;
    for (const a of core.actors.list(p.scene)) {
      if (a.id === 'hero' || !a.root.visible || a.layer === 'photo_only' || (a.layer === 'ghost' && !night)) continue;
      const hp = a.head.getWorldPosition(tmp);
      const n = view.ndc(hp);
      if (!n.front || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) continue;
      if (view.frac(hp, NPC_RADIUS) < AUTO_TAG_FRAC || view.blocked(hp)) continue;
      out.push(`npc:${a.id}`);
    }
    if (p.scene === 'planet') {
      for (const id of LANDMARK_ANCHORS) {
        const r = anchors.world(id);
        if (!r || r.scene !== p.scene) continue;
        const n = view.ndc(r.pos);
        if (!n.front || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) continue;
        if (view.frac(r.pos, r.radius ?? 3) < AUTO_TAG_FRAC || view.blocked(r.pos, (r.radius ?? 3) * 0.9)) continue;
        out.push(id);
      }
      for (const lt of TARGETS) {
        if (lt.kind !== 'landmark') continue;
        const q = anchors.targetPos(lt, tmp2);
        if (!q) continue;
        const n = view.ndc(q);
        if (!n.front || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) continue;
        if (view.frac(q, lt.radius) < AUTO_TAG_FRAC || view.blocked(q, lt.radius * 0.9)) continue;
        out.push(...(lt.onShot?.tags ?? []));
      }
    }
    return out;
  };

  /** GDD §3.7: flash straight into the convex mirror (whatever the story state) bounces back as a white photo. */
  const mirrorInFlash = (): boolean => {
    const m = anchors.world('mirror');
    const p = pose.pose;
    if (!m || m.scene !== p.scene || m.pos.distanceTo(p.pos) > FLASH_RANGE) return false;
    if (m.normal && tmp2.copy(p.pos).sub(m.pos).dot(m.normal) <= 0) return false;      // behind the mirror
    const n = view.ndc(m.pos);
    return n.front && Math.abs(n.x) <= 0.6 && Math.abs(n.y) <= 0.6 && !view.blocked(m.pos, 0.2);
  };

  /** GDD §18.4 light_trail: project the 「1987」 canvas onto the writing plane's corners in the photo. */
  const compositeTrail = (canvas: HTMLCanvasElement, tg: PhotoTarget) => {
    const a = 'world' in tg.anchor ? anchors.world(tg.anchor.world) : null;
    const corners = a?.corners;
    if (!corners || corners.length !== 4) return;
    let src = a?.info?.canvas ?? null;
    if (!src) { trailCanvas = trailCanvas ?? drawTrail(512, 192, core.rng.fork('lens:trail')); src = trailCanvas; }
    const cam = pose.cam;
    // corners are TL? order them TL, TR, BR, BL on screen
    const px = toPixels(corners, (p) => tmp.copy(p).project(cam), canvas.width, canvas.height);
    const cx = px.reduce((s, q) => s + q[0], 0) / 4, cy = px.reduce((s, q) => s + q[1], 0) / 4;
    const ang = (q: [number, number]) => Math.atan2(q[1] - cy, q[0] - cx);
    const sorted = [...px].sort((p1, p2) => ang(p1) - ang(p2));    // clockwise from the left-top in screen space
    const tl = sorted.reduce((b, q) => (q[0] + q[1] < b[0] + b[1] ? q : b));
    const k = sorted.indexOf(tl);
    const quad = [0, 1, 2, 3].map((i) => sorted[(k + i) % 4]);
    drawQuad(canvas, src, quad);
  };

  /** Store a Photo (+ photoTaken/shutter events). */
  const store = (o: {
    dataURL: string; tags: string[]; label: string; zoom: Zoom; night: boolean; flash: boolean; result: ShotResult;
    preset?: Photo['preset']; id?: string; burst?: boolean; emitShutter?: boolean;
  }): Photo => {
    const seq = bumpSeq();
    const keep = !!o.preset || keepFor(o.tags, core.store.state.photos);
    const photo: Photo = {
      id: o.id ?? `p${seq}`, dataURL: o.dataURL, tags: [...new Set(o.tags)], label: o.label, clock: core.store.state.clock,
      zoom: o.zoom, night: o.night, flash: o.flash, keep, seq, ...(o.preset ? { preset: o.preset } : {}),
    };
    core.store.addPhoto(photo);            // an eviction emits photoRemoved (index.ts prunes photoPose there)
    lc.lastPhotoId = photo.id;
    const p = pose.pose;
    lc.photoPose.set(photo.id, { scene: p.scene, pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch, zoom: o.zoom });
    if (o.emitShutter !== false) core.bus.emit('shutter', { burst: !!o.burst, night: o.night, flash: o.flash, zoom: o.zoom });
    core.bus.emit('photoTaken', { photo, result: o.result });
    if (o.emitShutter !== false) { lc.fx.polaSrc = photo.dataURL || null; lc.fx.polaAt = core.clock.t; }
    return photo;
  };

  const labelOf = (r: ShotResult): string => (r.confidence === null ? r.label : t('vf.photoLabel', { label: r.label, conf: r.confidence }));

  /** One exposure → one photo (the current evaluation is the verdict). */
  const takeOne = (o: { burst?: boolean; night: boolean } = { night: false }): ShotResult => {
    lc.invalidate();
    const { res, ev } = lc.evaluate(true);
    const p = pose.pose;
    const green = res.frame === 'green' && ev !== null;
    const tg = ev?.target ?? null;
    const flashOn = state.flash;
    const white = flashOn && ((tg?.id === 'T_mirror_self' && ev?.failed === 'flash') || mirrorInFlash());
    const canvas = capture({
      camera: pose.cam as PerspectiveCamera, scene: p.scene, ghost: o.night, hideTransient: o.night,
      flash: flashOn ? { pos: p.pos.clone(), radius: FLASH_RANGE } : null,
      // P3r3 (look g): the mirror selfie is the midpoint reveal (phone head + 周记 sticker): full-card size like ph_2026_group
      ...(green && tg?.id === 'T_mirror_self' ? { width: 960, height: 540 } : {}),
    });
    if (canvas && green && tg?.special === 'light_trail') compositeTrail(canvas, tg);
    if (canvas && white) whiteOut(canvas);
    const tags = white ? [] : [...res.tags, ...autoTags(o.night)];
    const label = white ? t('vf.whiteLabel') : labelOf(res);
    const result: ShotResult = white ? { ...res, label: t('vf.whiteLabel'), confidence: null, tags: [] } : { ...res, tags };
    const photo = store({
      dataURL: canvas ? toJpeg(canvas) : '', tags, label, zoom: state.zoom, night: o.night, flash: flashOn, result,
      burst: o.burst,
    });
    lc.fx.flashAt = core.clock.t; lc.fx.flashStrength = flashOn ? 1 : 0.45;
    if (green && tg) afterGreen(tg, photo, ev);
    return result;
  };

  /** onShot actions, bestiary award, peek auto-reattach (GDD §3.11), rephoto reveal. */
  const afterGreen = (tg: PhotoTarget, photo: Photo, ev: Evaluation | null) => {
    void ev;
    const acts = tg.onShot?.actions ?? [];
    if (acts.length) void core.rules.run(acts, `lens:${tg.id}`);
    const b = BESTIARY.find((x) => x.target === tg.id);
    if (b) core.store.addBestiary(b.id);
    hooks.onGreen(tg, photo);
    lc.dirty();
  };
  const hooks = { onGreen: (_tg: PhotoTarget, _p: Photo): void => undefined };

  /** Night long exposure: 2 s of sim time, aborted by motion (GDD §3.6). */
  const startExposure = () => {
    expo = { t0: core.clock.t, burst: false };
    expoResult = null;
    state.exposing = true;
    lc.moved = false;
    lc.updatePose();
    startDir.copy(pose.pose.dir);
    turned = 0;
  };
  const endExposure = () => { expo = null; state.exposing = false; lc.moved = false; };
  const abortExposure = (): ShotResult => {
    const r = lc.evaluate(true).res;
    endExposure();
    lc.say(t('vf.blur'));
    core.bus.emit('sfx', { id: 'sfx_fail' });
    return { ...r, frame: r.targetId ? 'yellow' : r.frame, failed: 'still', hint: t('vf.blur') };
  };

  const api = {
    hooks, capture, store, labelOf, autoTags, STORY_TAGS,
    get exposure(): { t0: number; k: number } | null {
      if (!expo) return null;
      expoView.t0 = expo.t0; expoView.k = Math.min(1, (core.clock.t - expo.t0) / EXPOSURE);
      return expoView;
    },
    /** Shutter press (keyboard/mouse): burst continues while held (GDD §3.3). */
    press() {
      if (expo) return;
      if (state.active && state.night) { startExposure(); return; }
      takeOne();
      burst = { left: BURST_N - 1, nextAt: core.clock.t + BURST_HOLD };
    },
    /** LensApi.shoot: synchronous; advances sim time for burst / night exposure. */
    shoot(o?: { burst?: boolean }): ShotResult {
      if (expo) return lc.evaluate(true).res;
      api.trackGranny();
      if (state.active && state.night) {
        startExposure();
        api.busy = true;
        try { core.loop.advance(EXPOSURE); } finally { api.busy = false; }
        if (expo) api.tick(0);          // finish if the last tick landed a hair short
        return expoResult ?? abortExposure();
      }
      if (o?.burst) {
        let best: ShotResult | null = null;
        for (let i = 0; i < BURST_N; i++) {
          if (i > 0) { api.busy = true; try { core.loop.advance(BURST_GAP); } finally { api.busy = false; } }
          const r = takeOne({ burst: true, night: false });
          if (!best || (r.frame === 'green' && best.frame !== 'green')) best = r;
        }
        return best as ShotResult;
      }
      return takeOne();
    },
    /** True while shoot() is advancing time (the lens system must not re-enter). */
    busy: false,
    cancel() { burst = null; if (expo) endExposure(); },
    /** Per tick: exposure motion + completion, burst continuation, QR dwell. */
    tick(dt: number) {
      if (expo) {
        const p = lc.updatePose();
        const sitting = core.player.pose === 'sit';
        const mv = core.input.move();
        // GDD §3.6 「镜头累计转角」: the turn accumulates tick by tick (turning away and back still blurs)
        turned += Math.acos(Math.max(-1, Math.min(1, startDir.dot(p.dir)))) * (180 / Math.PI);
        startDir.copy(p.dir);
        if (!sitting && (Math.abs(mv.x) + Math.abs(mv.y) > 1e-3 || turned > STILL_DEG)) {
          lc.moved = true;
          expoResult = abortExposure();
          return;
        }
        if (core.clock.t - expo.t0 >= EXPOSURE - 1e-6) {
          endExposure();
          expoResult = takeOne({ night: true });
        }
        return;
      }
      if (burst && !api.busy) {
        if (core.clock.t >= burst.nextAt) {
          if (burst.left === BURST_N - 1 && !burstHeld(core.input.held('shutter'), core.input.holdWallMs?.('shutter'))) burst = null;
          else {
            takeOne({ burst: true, night: false });
            burst.left--; burst.nextAt += BURST_GAP;
            if (burst.left <= 0) burst = null;
          }
        }
      }
      void dt;
    },
    /** GDD §8.1 kind=qr: centre 20 %, ≤ 2.5 m, held 0.5 s → scanned (no shutter). */
    scan(res: ShotResult, dt: number) {
      if (!res.targetId || res.frame !== 'green') { dwell = null; return; }
      const tg = TARGETS.find((x) => x.id === res.targetId);
      if (!tg || tg.kind !== 'qr' || scanned.has(tg.id)) { dwell = null; return; }
      if (!dwell || dwell.id !== tg.id) dwell = { id: tg.id, t: 0 };
      dwell.t += dt;
      if (dwell.t + 1e-6 < QR_DWELL) return;
      dwell = null;
      scanned.add(tg.id);
      core.bus.emit('scanned', { target: tg.id });
      core.bus.emit('sfx', { id: 'sfx_scan' });
      lc.say(t('vf.scanned'));
      const acts = tg.onShot?.actions ?? [];
      if (acts.length) void core.rules.run(acts, `lens:${tg.id}`);
      lc.dirty();
    },
    isScanned: (id: TargetId) => scanned.has(id),
    /** GDD §9 P3: t0 = first time granny is framed within 6 m during this viewfinder session. */
    trackGranny() {
      if (!state.active || grannyInFrame) return;
      const n = core.services.chars.npc('granny_wang');
      if (!n || !n.root.visible) return;
      const p = lc.updatePose();
      const hp = n.head.getWorldPosition(tmp);
      if (hp.distanceTo(p.pos) > GRANNY_RANGE) return;
      const q = view.ndc(hp);
      if (!q.front || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return;
      grannyInFrame = true;
      lc.grannyEpoch = core.clock.animT;
      try { n.startBlink(core.clock.animT); } catch { /* C not ready */ }
    },
    /** New viewfinder session. */
    reset() { scanned.clear(); dwell = null; grannyInFrame = false; lc.grannyEpoch = null; api.cancel(); },
    counter(): number {
      let n = 0;
      for (const p of core.store.state.photos) if (!p.keep) n++;
      return Math.min(MAX_ALBUM, n);
    },
    sceneOf(): SceneId { return pose.pose.scene; },
  };
  return api;
}
export type Shots = ReturnType<typeof createShots>;
