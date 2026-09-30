// src/lens/extras.ts — owner D. Small viewfinder-driven systems (ARCHITECTURE §3.D):
// mirror  — the convex mirror's 256² LiveView, rendered only while the viewfinder is on and the player is ≤ 8 m away,
//           hero head visible, horizontally flipped; fed to world.setMirrorTexture (GDD §9 S_mirror).
// smoke   — 0.12 s into the viewfinder: render.setSmoke(lens → story.smokeStep().route → target) (GDD §3.12, P3).
// talk    — E in the night viewfinder: the actor under the crosshair (any layer) → ui.talk; fallback tudi (GDD §6.1).
// darkroom— darkroomReveal(): viewfinder on in studio_int within 4 m of dk_line → negative view, stitched positive.
import { PerspectiveCamera, Raycaster, Vector3, type Intersection, type Object3D } from 'three';
import type { LiveView as LensLiveView, SmokeStep } from '../contracts';
import { t } from '../data/zh';
import { LAYER } from '../core/layers';
import { SURFACES, flatToWorld, frameAt, headingToDir, worldToFlat, type SurfaceFrame } from '../core/planet';
import { STUDIO } from '../world/interiors/plans';
import { alongRoute } from '../story/route';
import type { LensCtx } from './ctx';
import type { Modes } from './modes';
import type { Presets } from './presets';

export const MIRROR_RANGE = 8;
// P3r3 (look g, L10): the mirror used to look down the street at 78° into a 256² view: the selfie showed a 15 px
// figure (phone head and 周记 sticker unreadable, GDD §2.3 「手机 97% · 人 3%」 is the midpoint reveal). It now turns to
// the viewer (a convex mirror always shows whoever looks into it, just smaller) with a 36° field, at 384².
export const MIRROR_SIZE = 384;
export const MIRROR_FOV = 36;
/** How far the mirror view turns from its own normal toward the viewer (0 = the normal, 1 = straight at him). */
export const MIRROR_AIM = 0.85;
/** Render the mirror every Nth lens tick (≈ 20 Hz at 60 Hz ticks; SwiftShader budget, ARCHITECTURE §5.1). */
export const MIRROR_EVERY = 3;
/** Seconds the mirror keeps rendering after the viewfinder closes (the S_mirror beat runs with it shut). */
export const MIRROR_HOLD = 8;
/** P3 wayfinding: the smoke shows within ~0.3 s of opening the viewfinder (was 1.0 s: first-time players had already
 *  closed it again). */
export const SMOKE_AFTER = 0.12;
/** Re-route / rebuild period while the viewfinder stays open (s). */
export const SMOKE_EVERY = 0.2;
/** Route height above the street / floor, m: just under the lens (eye 1.72), so the thread ahead reads like a path
 *  drawn along the street instead of a ceiling over the player. */
export const SMOKE_ALT = 1.3;
export const SMOKE_ALT_IN = 1.2;
/** Route points closer than this to the feet are skipped (the thread already starts at the lens). */
export const SMOKE_SKIP = 2;
/** P3r3 G11: within this walked distance (m) of the step's target the thread is gone — the player has arrived, and a
 *  ribbon drawn across the frame there (the rephoto at vp_group_photo) only gets in the way. */
export const SMOKE_ARRIVED = 3.5;
/** P3r3 G11: pure — is the smoke wanted? Not while the reference overlay (R) is up, not once arrived. */
export function smokeWanted(o: { overlay: boolean; remaining: number }): boolean {
  return !o.overlay && o.remaining > SMOKE_ARRIVED;
}
export const TALK_RANGE = 15;
export const DARKROOM_RANGE = 4;
export const REVEAL_SECONDS = 1.6;

/** P3 G1: the ONE "close enough to the hung negatives" test. Story glue starts S_darkroom with it and the lens starts
 *  the reveal with it (they used to measure feet vs lens, so backing up to the line started the beat but never the
 *  reveal: a soft-lock in `cutscene`). Interior-local x/z (x east): the player must stand in the darkroom itself
 *  (x ≥ STUDIO.partX; the partition blocks the front room) within DARKROOM_RANGE m of the line, horizontally. */
export function inDarkroomReach(feet: { x: number; z: number }, line: { x: number; z: number }): boolean {
  if (!(feet.x >= STUDIO.partX)) return false;
  return Math.hypot(feet.x - line.x, feet.z - line.z) <= DARKROOM_RANGE;
}

/** P3r2 look L7: drop route points where the path turns back on itself (> 140°): a thread that goes 2 m ahead and
 *  then hooks back past its own start read as a knot, not a direction. Keeps the first and last point (pure). */
export function unkink<T extends { x: number; z: number }>(pts: readonly T[], maxTurnDeg = 140): T[] {
  const out = pts.slice();
  const cosMax = Math.cos((maxTurnDeg * Math.PI) / 180);
  for (let guard = 0; guard < 64 && out.length > 2; guard++) {
    let cut = -1;
    for (let i = 1; i < out.length - 1; i++) {
      const ax = out[i].x - out[i - 1].x, az = out[i].z - out[i - 1].z, bx = out[i + 1].x - out[i].x, bz = out[i + 1].z - out[i].z;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) { cut = i; break; }
      if ((ax * bx + az * bz) / (la * lb) < cosMax) { cut = i; break; }
    }
    if (cut < 0) break;
    out.splice(cut, 1);
  }
  return out;
}

export function createExtras(lc: LensCtx, modes: Modes, presets: Presets) {
  const { core, state } = lc;
  const fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  const tmp = new Vector3(), tmp2 = new Vector3();
  // ------------------------------------------------------------------ mirror
  let live: LensLiveView | null = null;
  let mirrorCam: PerspectiveCamera | null = null;
  let mirrorTick = 0;
  let mirrorOnAt = -1e9;
  const mirror = () => {
    // I-look (F7 D): keep the convex mirror live for MIRROR_HOLD s after the viewfinder closes, so the S_mirror beat
    // (played with the viewfinder shut) shows the selfie instead of the blank glint
    const vfOn = state.active && !state.peek;
    if (vfOn) mirrorOnAt = core.clock.t;
    if ((!vfOn && core.clock.t - mirrorOnAt > MIRROR_HOLD) || state.peek || core.player.scene !== 'planet') return;
    const a = lc.anchors.world('mirror');
    if (!a || a.scene !== 'planet') return;
    if (core.player.pos(tmp).distanceTo(a.pos) > MIRROR_RANGE) return;
    if (live && mirrorTick++ % MIRROR_EVERY !== 0) return;          // 20 Hz is plenty for a 256² convex mirror
    if (!live) {
      try {
        live = core.services.render.createLiveView(MIRROR_SIZE);
        // mirror image: flip u (the LiveView renders an ordinary camera)
        live.texture.repeat.set(-1, 1); live.texture.offset.set(1, 0);
        live.texture.needsUpdate = true;
        core.services.world.setMirrorTexture(live.texture);
      } catch (e) { core.log.warn('[lens] mirror LiveView unavailable', e); live = null; return; }
      mirrorCam = new PerspectiveCamera(MIRROR_FOV, 1, 0.05, 120);
      mirrorCam.name = 'lens:mirror';
    }
    const cam = mirrorCam as PerspectiveCamera;
    frameAt(SURFACES.planet, a.pos, fr);
    const n = a.normal ? tmp2.copy(a.normal) : headingToDir(fr, 160, tmp2);
    n.addScaledVector(fr.up, -n.dot(fr.up) * 0.5).normalize();   // convex: look slightly down the street
    cam.position.copy(a.pos).addScaledVector(n, 0.12);
    cam.up.copy(fr.up);
    // toward the viewer's head and chest (the phone head sits in the upper half of the round mirror)
    core.player.pos(tmp).addScaledVector(fr.up, 1.35).sub(cam.position).normalize();
    if (tmp.dot(n) > 0.2) n.lerp(tmp, MIRROR_AIM).normalize();
    cam.lookAt(tmp.copy(cam.position).add(n));
    cam.updateMatrixWorld(true);
    const hero = core.services.chars.hero;
    try {
      if (vfOn) hero.setFirstPerson(false);            // the head is only hidden (layer 5) while the viewfinder is open
      live.render(cam, { scene: 'planet', ghost: false });
    } catch (e) { core.log.warn('[lens] mirror render failed', e); }
    finally { if (vfOn) hero.setFirstPerson(true); }
  };

  // ------------------------------------------------------------------ smoke
  // P3 wayfinding: story.smokeStep() gives the walkable route; the thread starts at the lower right of the frame
  // (never end-on: a dot), rises and bends toward the route, then follows it SMOKE_ALT above the street.
  let smokeOn = false, smokeNext = 0, smokeTarget: string | null = null;
  const smokeFrom = new Vector3(), smokeTo = new Vector3(), sUp = new Vector3(), sRight = new Vector3(), sFwd = new Vector3();
  const smokeVia: Vector3[] = [];
  const smokeOff = () => { if (smokeOn) { smokeOn = false; smokeTarget = null; try { core.services.render.setSmoke(null); } catch { /* A */ } } };
  const smoke = () => {
    // P3r2 look L4: only while the lens itself owns the camera (a night talk filmed over the viewfinder showed the
    // ribbon coming out of the hero's head)
    const want = state.active && !state.peek && core.cameraRig.top() === 'lens' && core.clock.t - modes.since >= SMOKE_AFTER - 1e-6;
    if (!want) { smokeOff(); return; }
    if (core.clock.t < smokeNext && smokeOn) return;
    smokeNext = core.clock.t + SMOKE_EVERY;
    let step: SmokeStep | null = null;
    try { step = core.services.story.smokeStep?.() ?? null; } catch { step = null; }
    const p = lc.pose.pose;
    if (!step || step.scene !== p.scene || step.route.length < 2) { smokeOff(); return; }
    if (!smokeWanted({ overlay: state.overlay, remaining: alongRoute(step.route, 0).len })) { smokeOff(); return; }
    try {
      const s = SURFACES[p.scene], alt = p.scene === 'planet' ? SMOKE_ALT : SMOKE_ALT_IN;
      frameAt(s, p.pos, fr);
      sUp.copy(fr.up);
      sFwd.copy(p.dir).addScaledVector(sUp, -p.dir.dot(sUp));
      if (sFwd.lengthSq() < 1e-6) sFwd.copy(fr.north);
      sFwd.normalize();
      sRight.crossVectors(sFwd, sUp).normalize();
      // start: lower right of the frame, 1.1 m out (the incense rises from beside the lens)
      smokeFrom.copy(p.pos).addScaledVector(p.dir, 1.1).addScaledVector(sRight, 0.42).addScaledVector(sUp, -0.2);
      // route points (skip the ones at the player's feet), lifted above the street
      let n = 0;
      const feet = step.route[0];
      const put = (x: number, z: number, h: number) => { flatToWorld(s, { x, z, h }, (smokeVia[n] ??= new Vector3())); n++; };
      let firstDir: Vector3 | null = null;
      const route = unkink(step.route);
      for (let i = 1; i < route.length; i++) {
        const q = route[i];
        if (Math.hypot(q.x - feet.x, q.z - feet.z) < SMOKE_SKIP && i < route.length - 1) continue;
        if (!firstDir) {
          // rise: up and a little forward, already bending toward the first route point
          firstDir = flatToWorld(s, { x: q.x, z: q.z, h: feet.h }, tmp2).sub(p.pos);
          firstDir.addScaledVector(sUp, -firstDir.dot(sUp));
          if (firstDir.lengthSq() > 1e-6) firstDir.normalize(); else firstDir.copy(sFwd);
          const ahead = firstDir.dot(sFwd);
          const v = (smokeVia[n++] ??= new Vector3()).copy(smokeFrom).addScaledVector(sUp, 0.55);
          // P3r2 look L7: a way that lies behind or beside the lens used to rise 0.8 m forward and hook back past its
          // own start (an 'A'-shaped knot); it now bends out of the frame on the side to turn to
          if (ahead > 0.5) v.addScaledVector(sFwd, 0.8).addScaledVector(firstDir, 1.0);
          else v.addScaledVector(sRight, firstDir.dot(sRight) >= 0 ? 1.3 : -1.3).addScaledVector(sFwd, 0.5 + 0.5 * Math.max(0, ahead)).addScaledVector(firstDir, 0.4);
        }
        put(q.x, q.z, q.h + alt);
      }
      if (!firstDir) { smokeOff(); return; }
      // end: just above the spot itself (a prop may sit above its stand point)
      const e = step.end;
      flatToWorld(s, { x: e.x, z: e.z, h: e.h + 0.9 }, smokeTo);
      core.services.render.setSmoke({ from: smokeFrom, to: smokeTo, via: smokeVia.slice(0, n) });
      smokeOn = true; smokeTarget = step.spot;
    } catch (e) { core.log.warn('[lens] setSmoke failed', e); }
  };

  // ------------------------------------------------------------------ night talk
  const ray = new Raycaster();
  const hits: Intersection[] = [];
  /** P3r2 look L4: the actor whose head is nearest the frame centre (within TALK_NDC), else 土地's night fallback. Also
   *  drives the 「按 E 交谈」 tag on the crosshair (cheap: no raycast). */
  const TALK_NDC = 0.3;
  const FRAME_NDC = 0.92;
  const nearHead = (p: { pos: Vector3 }, actors: readonly { id: string; head: Object3D }[]): string | null => {
    let best = TALK_NDC, id: string | null = null;
    for (const a of actors) {
      const hp = a.head.getWorldPosition(tmp);
      if (hp.distanceTo(p.pos) > 12) continue;
      const n = lc.view.ndc(hp);
      const d = Math.hypot(n.x, n.y);
      if (n.front && d < best && !lc.view.blocked(hp)) { best = d; id = a.id; }
    }
    return id;
  };
  const talkActors = (scene: string) => core.actors.list(scene as never).filter((a) => a.id !== 'hero' && a.root.visible && a.layer !== 'photo_only');
  const tudiFallback = (): string | null =>
    (core.store.state.phase === 'night' && core.store.has('P4_done') && core.actors.get('tudi') ? 'tudi' : null);
  /** P3r3 G7: the character the recognition bar names (「纸人 · 双眼 88%」) — the frame is about them even when the head
   *  sits low in the frame. */
  const recognised = (actors: readonly { id: string }[]): string | null => {
    try {
      const ev = lc.evaluate().ev;
      const a = ev?.target.anchor;
      const npc = a && 'npc' in a ? a.npc : null;
      return npc && actors.some((x) => x.id === npc) ? npc : null;
    } catch { return null; }
  };
  /** P3r3 G7: any unblocked head inside the frame (NDC 0.92), nearest the centre — a visible character always beats the
   *  invisible 土地 on the shoulder. */
  const inFrame = (p: { pos: Vector3 }, actors: readonly { id: string; head: Object3D }[]): string | null => {
    let best = Infinity, id: string | null = null;
    for (const a of actors) {
      if (a.id === 'tudi') continue;
      const hp = a.head.getWorldPosition(tmp);
      if (hp.distanceTo(p.pos) > 12) continue;
      const n = lc.view.ndc(hp);
      const d = Math.max(Math.abs(n.x), Math.abs(n.y));
      if (n.front && d <= FRAME_NDC && d < best && !lc.view.blocked(hp)) { best = d; id = a.id; }
    }
    return id;
  };
  /** Who a night E talks to without a centre-ray hit: centre head → recognised → any head in frame → 土地. */
  const talkTarget = (p: { pos: Vector3 }, actors: readonly { id: string; head: Object3D }[]): string | null =>
    nearHead(p, actors) ?? recognised(actors) ?? inFrame(p, actors) ?? tudiFallback();
  let tagAt = -1, tagWho: string | null = null;
  /** The speaker the 「按 E 和…交谈」 tag names (null = no tag). */
  const talkWho = (): string | null => {
    if (!state.active || state.peek || !state.night) return null;
    if (core.clock.frame - tagAt < 6 && tagAt >= 0) return tagWho;
    tagAt = core.clock.frame;
    const p = lc.pose.pose;
    tagWho = talkTarget(p, talkActors(p.scene));
    return tagWho;
  };
  const talkTag = (): boolean => talkWho() !== null;
  const talk = (): boolean => {
    const p = lc.updatePose();
    const actors = core.actors.list(p.scene).filter((a) => a.id !== 'hero' && a.root.visible && a.layer !== 'photo_only');
    ray.layers.set(LAYER.WORLD); ray.layers.enable(LAYER.GHOST);
    ray.set(p.pos, p.dir); ray.near = 0.1; ray.far = TALK_RANGE;
    hits.length = 0;
    ray.intersectObjects(actors.map((a) => a.root) as Object3D[], true, hits);
    let id: string | null = null;
    for (const h of hits) {
      for (let o: Object3D | null = h.object; o; o = o.parent) {
        if (typeof o.userData.actorId === 'string') { id = o.userData.actorId as string; break; }
      }
      if (id) break;
      const a = actors.find((x) => { let hit = false; x.root.traverse((c) => { if (c === h.object) hit = true; }); return hit; });
      if (a) { id = a.id; break; }
    }
    hits.length = 0;
    if (!id) id = talkTarget(p, actors);
    if (!id) return false;
    tagAt = -1;
    try { void core.services.ui.talk(id as never); } catch (e) { core.log.warn('[lens] ui.talk failed', e); }
    return true;
  };

  // ------------------------------------------------------------------ darkroom
  let revealing: { t0: number; url: string } | null = null;
  const waiters: (() => void)[] = [];
  const hasStitched = () => !!core.store.photo('ph_2023_stitched');
  const resolveAll = () => { for (const w of waiters.splice(0)) w(); };
  /** Player feet vs the dk_line anchor through inDarkroomReach (shared with story glue via LensApi.darkroomInRange). */
  const darkroomInRange = (): boolean => {
    if (core.player.scene !== 'studio_int') return false;
    const line = lc.anchors.world('dk_line');
    if (!line || line.scene !== 'studio_int') return false;
    const s = SURFACES.studio_int;
    return inDarkroomReach(worldToFlat(s, core.player.pos(tmp)), worldToFlat(s, line.pos));
  };
  const canReveal = () => state.active && !state.peek && core.player.scene === 'studio_int' && core.store.has('dk_hung') && !hasStitched();
  const darkroom = () => {
    if (revealing) {
      if (core.clock.t - revealing.t0 >= REVEAL_SECONDS) {
        revealing = { ...revealing, t0: -1e9 }; resolveAll();
        // P3r2 look L1: the recognition names the print (it read 「看不清 40%」 over the positive)
        lc.say(t('lbl.ph_2023_stitched'), 4);
      }
      if (!state.active) { revealing = null; resolveAll(); }
      return;
    }
    if (!canReveal() || !darkroomInRange()) return;
    startReveal();
  };
  const startReveal = () => {
    modes.setNegative(true);
    const r = presets.renderStitched();
    revealing = { t0: core.clock.t, url: r.url };
    lc.say(t('vf.developing'), REVEAL_SECONDS);
    core.bus.emit('sfx', { id: 'sfx_paper' });
  };

  return {
    tick() {
      try { mirror(); } catch (e) { core.log.warn('[lens] mirror', e); }
      smoke();
      darkroom();
    },
    talk,
    talkTag,
    talkWho,
    get smokeTarget() { return smokeTarget; },
    darkroomInRange,
    /** LensApi.darkroomReveal: resolves once the stitched positive has appeared. The S_darkroom beat only starts when
     *  darkroomInRange() holds with the viewfinder on, so if the reveal is not running yet it starts here (never wait
     *  on a range check made from a different point). */
    darkroomReveal(): Promise<void> {
      if (hasStitched() && !revealing) return Promise.resolve();
      const p = new Promise<void>((res) => { waiters.push(res); });
      if (!revealing && canReveal()) startReveal();
      return p;
    },
    /** Strip overlay: the stitched positive fading in over the negative view. */
    strip(): { src: string | null; k: number } {
      if (!revealing || !state.active) return { src: null, k: 0 };
      const k = revealing.t0 < -1e8 ? 1 : Math.min(1, (core.clock.t - revealing.t0) / REVEAL_SECONDS);
      return { src: revealing.url || null, k };
    },
    resetReveal() { revealing = null; resolveAll(); },
  };
}
export type Extras = ReturnType<typeof createExtras>;
