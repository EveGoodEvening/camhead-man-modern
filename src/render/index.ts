// src/render/index.ts — owner A. RenderApi (ARCHITECTURE §3.A): the ART pipeline (MRT toon → single composite → FX),
// palettes + tweens, uncanny envelopes, sun/shadow follow, lamps, captures, LiveViews, smoke, birds, title dressing,
// lowfx blobs, the MRT compliance check and dev tooling. B/C/D import only `makeToonMaterial` from here.
import {
  BackSide, Frustum, Matrix4, MeshBasicMaterial, PCFShadowMap, Sphere, Vector3, type Material, type Mesh, type Object3D, type PerspectiveCamera, type Texture,
  type WebGLRenderTarget,
} from 'three';
import type { LampHandle, LiveView, ModuleFactory, RenderApi } from '../contracts';
import type { PaletteKey, SceneId } from '../types';
import { LAYER } from '../core/layers';
import { SURFACES, worldToFlat } from '../core/planet';
import { PAL } from '../art/palette';
import { setToonNight, shared } from './materials';
import { createComposite, type Composite } from './composite';
import { bakeClouds } from './sky';
import { Pipeline, makeColorRt } from './pipeline';
import { PaletteTween, applyUncanny, hexToRgb, resolvePalette, type PaletteVals } from './grade';
import { UncannyEnvelope, boilOf, uncW, uncannyBase } from './uncanny';
import { SunRig, dirInFrame, packLamps, type LampRec } from './lights';
import { Birds, Smoke, createFxScenes } from './fx';
import { buildTitleDressing } from './title';
import { BlobShadows } from './lowfx';
import { MrtCheck } from './devcheck';
import { runDevHook } from './devtools';
import { RenderScaler } from './scale';

export { makeToonMaterial } from './materials';

const SCENES: readonly SceneId[] = ['planet', 'studio_int', 'subway_int'];
const INTERIOR_SKY = hexToRgb(PAL.inkDeep);
/** Follow-view see-through cone (L1): aimed at feet + up·torso, `radius` m at the hero's depth (1.7:1 tall ellipse). */
export const SEE_THRU = { torso: 1.0, radius: 1.05, maxDist: 8 } as const;
/** P3r2 look L3: outline width (m, along the normal) of translucent capture ghosts (老周 in ph_2026_group). */
export const GHOST_INK = 0.028;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** P3r2 look L9: view window (fractions of the full frame: x, y, w, h) for the title / credits framing, or null.
 *  Credits: the ink column covers the left 40 %, so the picture shifts right by 20 % (the planet centred in the free
 *  60 %). Portrait title: the planet (a 20° disc, ≈ 55 % of the width under fitFov) is zoomed to ≈ 85 % of the width and
 *  sits in the lower middle, under the logo. `py` = the planet centre's height in the plain frame (0 top … 1 bottom). */
export function titleViewWindow(o: { credits: boolean; title: boolean; aspect: number; py: number }): [number, number, number, number] | null {
  if (o.credits) return [-0.2, 0, 1, 1];
  if (o.title && o.aspect < 1) {
    const z = 1.55, w = 1 / z, h = 1 / z;
    return [(1 - w) / 2, o.py - 0.6 * h, w, h];
  }
  return null;
}
/** P3r2 look L1: the darkroom's light. Before the safelight is on the room is dim; once the bench's E switches it on
 *  (flag dk_lit) the whole view warms up to a deep safelight red over DARKROOM.rampS (a quick double flicker first).
 *  Applied as a grade multiplier (emissive surfaces — the lamp lens, the phone screen — keep their own colour). */
export const DARKROOM = { off: [0.52, 0.46, 0.5] as const, on: [1.18, 0.6, 0.55] as const, rampS: 0.7, partX: 1.5 } as const;
/** Pure: the darkroom grade multiplier `s` seconds after dk_lit (s < 0: not lit), written into `out`. */
export function darkroomGrade(s: number, out: [number, number, number]): [number, number, number] {
  let k = s < 0 ? 0 : s >= DARKROOM.rampS ? 1 : s / DARKROOM.rampS;
  if (s >= 0 && s < 0.25) k = s < 0.07 || (s > 0.13 && s < 0.18) ? 0.8 : 0.15;       // the bulb catching
  for (let i = 0; i < 3; i++) out[i] = DARKROOM.off[i] + (DARKROOM.on[i] - DARKROOM.off[i]) * k;
  return out;
}

interface UpdateOpts { capture: boolean; palette?: PaletteKey }

export const createRender: ModuleFactory<RenderApi> = (core) => {
  const fx = createFxScenes();
  const tween = new PaletteTween(core.store.state.palette);
  const env = new UncannyEnvelope();
  const lamps = new Set<LampRec>();
  const vf = { on: false, night: false, negative: false };
  const check = new MrtCheck();
  const devBuild = import.meta.env.DEV || core.params.test;
  let pipe: Pipeline | null = null;
  let comp: Composite | null = null;
  let sun: SunRig | null = null;
  let smoke: Smoke | null = null;
  let birds: Birds | null = null;
  let blobs: BlobShadows | null = null;
  let dressing: ReturnType<typeof buildTitleDressing> | null = null;
  let capOut: WebGLRenderTarget | null = null;
  let rawUnc = 0;
  // P3r2 look L1: when the safelight came on (sim time; a load / boot starts it lit)
  let dkLitAt = -1e9;
  const dkGrade: [number, number, number] = [1, 1, 1];
  core.bus.on('flagSet', (e) => { if (e.flag === 'dk_lit') dkLitAt = core.clock.t; });
  core.bus.on('stateLoaded', () => { dkLitAt = -1e9; });
  let lostContext = false;
  let frameNo = 0;
  const last = { calls: 0, triangles: 0, programs: 0 };
  let smokeKey = '';
  const scratch: PaletteVals = resolvePalette('day');
  const tmp = new Vector3(), feet = new Vector3(), pole = new Vector3(), fr = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  const lampFrustum = new Frustum(), lampMat = new Matrix4(), lampSphere = new Sphere();
  const lampVisible = (pos: Vector3, radius: number) => lampFrustum.intersectsSphere(lampSphere.set(pos, radius));

  /** Recompute every shared/composite uniform for rendering `sid` through `cam` (pure function of state + clock). */
  const update = (sid: SceneId, cam: PerspectiveCamera, o: UpdateOpts): void => {
    if (!comp || !sun) return;
    const t = core.clock.t, at = core.clock.animT, test = core.params.test, u = comp.u;
    const s = core.store.state;
    rawUnc = env.value(t, uncannyBase({ phase: s.phase, p8Done: core.store.has('P8_done'), scene: sid }));
    const w = uncW(rawUnc);
    const base = o.palette ? resolvePalette(o.palette) : tween.value(t);
    const pv = applyUncanny(base, w, scratch);
    const surf = core.scenes.surface(sid), interior = sid !== 'planet';
    const camAlt = cam.position.distanceTo(surf.center) - surf.radius;
    const wide = !interior && camAlt > 60;

    // sun pole: the player's up in gameplay; blends to centre→camera for wide views (ART §3.1 title rule)
    const playerHere = core.player.scene === sid;
    if (playerHere) core.player.pos(feet); else feet.copy(cam.position);
    const k = interior ? 0 : playerHere ? smooth(25, 60, camAlt) : 1;
    pole.copy(feet).sub(surf.center).normalize().lerp(tmp.copy(cam.position).sub(surf.center).normalize(), k)
      .normalize().multiplyScalar(surf.radius).add(surf.center);
    sun.frameAt(sid, pole);
    const sf = sun;
    fr.up.copy(sf.frame.up); fr.north.copy(sf.frame.north); fr.east.copy(sf.frame.east);
    shared.uPlanetCenter.value.copy(surf.center);
    shared.uSunPole.value.copy(fr.up);
    shared.uSunAtPole.value.copy(sf.sun);
    shared.uTime.value = at;
    shared.uNight.value = interior ? 0 : pv.night;
    // night variant of the toon programs: follows the main frame; a capture that needs night switches it on
    const needNight = shared.uNight.value > 0.001;
    if (!o.capture || needNight) setToonNight(needNight);
    shared.uUncanny.value = w;
    // the night variant compiles only the first CM_LAMPS slots (4): fill them with the nearest lamps whose pool is in view
    cam.updateMatrixWorld();
    lampFrustum.setFromProjectionMatrix(lampMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    packLamps(lamps, sid, cam.position, shared.uLamps.value, lampVisible);
    if (!o.capture) sun.follow(sid, feet, sf.sun, fr.north, wide || k > 0.5);

    u.uSkyBase.value.fromArray(pv.skyBase); u.uSkyCloud.value.fromArray(pv.skyCloud);
    u.uCloudCut.value = pv.cloudCut; u.uCloudFade.value = pv.cloudFade;
    u.uSpeck.value.fromArray(pv.speck); u.uSpeckCut.value = pv.speckCut; u.uSpeckInk.value = pv.speckInk;
    u.uStarMinEl.value = pv.starMinEl;
    u.uSkyPole.value.copy(fr.up);
    u.uMoonCos.value = pv.moonSize > 0.002 ? Math.cos(pv.moonSize) : 2;
    u.uMoonRingCos.value = pv.moonSize > 0.002 ? Math.cos(pv.moonSize + 0.004) : 2;
    u.uMoonColor.value.fromArray(pv.moon);
    dirInFrame(fr, pv.moonEl, pv.moonAz, u.uMoonDir.value);
    u.uSkyRot.value.makeRotation(0);
    if (!test) { const a = at * 0.004, c = Math.cos(a), sn = Math.sin(a); u.uSkyRot.value.set(c, 0, sn, 0, 1, 0, -sn, 0, c); }
    u.uSkyFlat.value.set(INTERIOR_SKY[0], INTERIOR_SKY[1], INTERIOR_SKY[2], interior ? 1 : 0);
    u.uInk.value.fromArray(pv.ink); u.uInkHalo.value.fromArray(pv.inkHalo); u.uHalo.value = pv.halo;
    if (wide) u.uLineFade.value.set(1e4, 2e4, 1); else u.uLineFade.value.fromArray(pv.lineFade);
    u.uFogColor.value.fromArray(pv.fogColor);
    u.uFog.value.set(pv.fogNear, pv.fogFar, wide || interior ? 0 : pv.fogMax);
    u.uGrade.value.fromArray(pv.grade);
    if (sid === 'studio_int') {
      // the darkroom (x ≥ partition) seen from inside it: dim before the safelight, red once it is on
      const inDark = worldToFlat(SURFACES.studio_int, cam.position).x > DARKROOM.partX - 0.05;
      if (inDark) {
        const lit = core.store.has('dk_lit');
        darkroomGrade(lit ? core.clock.t - dkLitAt : -1, dkGrade);
        u.uGrade.value.set(u.uGrade.value.x * dkGrade[0], u.uGrade.value.y * dkGrade[1], u.uGrade.value.z * dkGrade[2]);
      }
    }
    // P3r2 (camera): a dialogue camera pushed over the viewfinder (土地 on the shoulder at night) films from outside the
    // lens: no barrel / vignette / grain then; the night view's GHOST layer stays on (setLayers) so the spirit shows
    const lensOwnsCam = core.cameraRig.top() === 'lens' || core.cameraRig.top() === null;
    const vfOn = vf.on && !o.capture && lensOwnsCam;
    u.uGrain.value = vfOn ? 0.06 : pv.grain;
    u.uGrainSeed.value = test ? 0 : Math.floor(at * 12) % 997;
    u.uBoil.value = test ? 0 : boilOf(rawUnc);
    u.uBoilT.value = Math.floor(at * 8) % 1000;
    u.uViewfinder.value = vfOn ? 1 : 0;
    u.uVfNight.value = vfOn && vf.night ? 1 : 0;
    u.uNegative.value = vfOn && vf.negative ? 1 : 0;
    shared.uFlash.value.set(0, 0, 0, 0);
    shared.uSeeThru.value.set(0, 0, 0, 0);          // photos show the world as it is; frame() turns it on for follow

    if (o.capture) return;
    // per-frame decorations
    const title = tween.key === 'title';
    if (dressing) dressing.visible = !interior && camAlt > 25;
    if (birds) {
      birds.mesh.visible = !interior && !title && camAlt < 25 && pv.night < 0.5 && w < 0.3;
      if (birds.mesh.visible) birds.update(at, feet, fr.up, fr.north, fr.east);
    }
    // P3 wayfinding: palette-aware colours and a pixel-width floor (metres per device pixel per metre of depth)
    if (smoke) smoke.update(at, interior ? 0 : pv.night, (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, core.canvas.height));
    if (blobs) blobs.update();
  };

  const setLayers = (cam: PerspectiveCamera, o: { ghost?: boolean; past?: boolean; photoOnly?: boolean }) => {
    cam.layers.set(LAYER.WORLD);
    if (o.ghost) cam.layers.enable(LAYER.GHOST);
    if (o.past) cam.layers.enable(LAYER.PAST);
    if (o.photoOnly) cam.layers.enable(LAYER.PHOTO_ONLY);
  };
  /** P3-look (L4): captures and LiveViews used whatever `visible` the last tick's culling left for the MAIN camera (core
   *  horizon cull + B's lon-sector cull), so a preset re-rendered at the chai site lost the footbridge and the stairs and
   *  the darkroom print (rendered inside studio_int) its buildings. Re-cull the planet for the capture camera; the
   *  returned function restores the main camera's flags. */
  const cullForCapture = (sid: SceneId, pos: Vector3): (() => void) | null => {
    if (sid !== 'planet') return null;
    const s = core.scenes as unknown as { cullFor?: (p: Vector3) => () => void };
    try { return s.cullFor ? s.cullFor(pos) : null; } catch { return null; }
  };
  /** P3-look (L3): translucent capture-only figures (GDD §15 「半透明地站着」 老周). A mesh with `userData.cmGhost =
   *  opacity` is left out of the MRT pass (which cannot blend) and drawn AFTER the composite into the capture target,
   *  depth-tested against the composite's depth: a depth-only pass first, so it shows as one clean translucent layer. */
  // P3r3 (program headroom): the depth-only pass reuses the colour material with colour writes off (same program),
  // so a ghost costs two programs (colour + inverted-hull ink) instead of three.
  const ghostMats = new Map<Material, { color: MeshBasicMaterial; ink: MeshBasicMaterial }>();
  const ghostMatsFor = (src: Material, opacity: number) => {
    let g = ghostMats.get(src);
    if (!g) {
      const s = src as Material & { map?: Texture | null; vertexColors?: boolean };
      const base = { map: s.map ?? null, vertexColors: !!s.vertexColors, side: src.side };
      // P3r2 look L3: a warm paper-white tint and an inked silhouette (inverted hull, GHOST_INK m) so the figure reads
      // as a person at photo-card size (the cool 0xe6eeff tint melted into the dawn sky)
      const ink = new MeshBasicMaterial({ color: 0x2f3a3f, transparent: true, depthWrite: false, side: BackSide });
      ink.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normal * ${GHOST_INK.toFixed(3)};`); };
      ink.customProgramCacheKey = () => 'cm-ghost-ink';
      g = { color: new MeshBasicMaterial({ ...base, color: 0xfff1dc, transparent: true, depthWrite: false }), ink };
      ghostMats.set(src, g);
    }
    g.color.opacity = opacity;
    g.ink.opacity = Math.min(1, opacity + 0.1);
    return g;
  };
  const collectGhosts = (root: Object3D, cam: PerspectiveCamera): Mesh[] => {
    const out: Mesh[] = [];
    root.traverseVisible((x) => {
      if (typeof x.userData.cmGhost === 'number' && (x as Mesh).isMesh && x.layers.test(cam.layers)) out.push(x as Mesh);
    });
    for (const m of out) m.visible = false;
    return out;
  };
  const drawGhosts = (ghosts: readonly Mesh[], cam: PerspectiveCamera, target: WebGLRenderTarget): void => {
    if (!ghosts.length) return;
    const r = core.renderer, ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    try {
      for (const m of ghosts) {
        const src = m.material as Material, g = ghostMatsFor(src, m.userData.cmGhost as number);
        m.visible = true;
        m.material = g.color;
        g.color.colorWrite = false; g.color.depthWrite = true;     // depth-only pass (GL state only: same program)
        r.render(m, cam);
        g.color.colorWrite = true; g.color.depthWrite = false;
        m.material = g.ink; r.render(m, cam);          // only the rim outside the front faces survives the depth test
        m.material = g.color; r.render(m, cam);
        m.material = src;
      }
    } finally { r.autoClear = ac; }
  };
  /** Render the main pass without refreshing the shadow map (captures/LiveViews reuse this frame's map). */
  const withFrozenShadow = (fn: () => void) => {
    const sm = core.renderer.shadowMap, au = sm.autoUpdate, nu = sm.needsUpdate;
    sm.autoUpdate = false; sm.needsUpdate = false;
    try { fn(); } finally { sm.autoUpdate = au; sm.needsUpdate = nu; }
  };

  // Adaptive render scale (realtime only: never under ?test or an explicit ?dpr, so captures stay deterministic)
  const scaler = core.params.test || core.params.dpr !== null ? null : new RenderScaler();
  let baseDpr = 0;
  const adapt = (dt: number | undefined): void => {
    if (!scaler || dt === undefined) return;
    if (!baseDpr) baseDpr = core.renderer.getPixelRatio();
    if (scaler.update(dt * 1000)) core.renderer.setPixelRatio(baseDpr * scaler.scale);   // setSize keeps the CSS size
  };

  /** P3-look (L1): in the plain follow view, screen-door fade whatever stands between the lens and the hero (rails,
   *  the wake bench, posts the boom now passes) — see `shared.uSeeThru`. */
  const seeTmp = new Vector3(), seeUp = new Vector3();
  const seeThrough = (sid: SceneId, cam: PerspectiveCamera): void => {
    const u = shared.uSeeThru.value;
    u.set(0, 0, 0, 0);
    if (vf.on || core.cameraRig.top() !== null || core.player.scene !== sid) return;
    core.player.pos(seeTmp).addScaledVector(core.player.up(seeUp), SEE_THRU.torso);
    if (seeTmp.distanceTo(cam.position) > SEE_THRU.maxDist) return;      // title orbit / wide shots
    seeTmp.applyMatrix4(cam.matrixWorldInverse);
    if (seeTmp.z > -0.3) return;
    u.set(seeTmp.x, seeTmp.y, seeTmp.z, SEE_THRU.radius);
  };

  // P3r2 look L9: title / credits view window (setViewOffset on the main camera; captures use their own cameras)
  let creditsUp = false, vwOn = false;
  const planetNdc = new Vector3();
  const applyViewWindow = (cam: PerspectiveCamera) => {
    const W = Math.max(1, core.canvas.width), H = Math.max(1, core.canvas.height);
    const title = tween.key === 'title';
    if (vwOn) { cam.clearViewOffset(); vwOn = false; }
    let py = 0.5;
    if (title && W < H) { cam.updateMatrixWorld(); planetNdc.set(0, 0, 0).project(cam); py = 0.5 - planetNdc.y * 0.5; }
    const v = titleViewWindow({ credits: creditsUp, title, aspect: W / H, py });
    if (!v) return;
    cam.setViewOffset(W, H, v[0] * W, v[1] * H, v[2] * W, v[3] * H);
    vwOn = true;
  };
  const frame = (): void => {
    const r = core.renderer;
    r.info.reset();
    if (lostContext) return;                                  // nothing can be drawn until webglcontextrestored
    if (!pipe) { r.setRenderTarget(null); r.setClearColor(0x65c1bc, 1); r.clear(); return; }
    const sid = core.scenes.active, scene = core.scenes.get(sid), cam = core.cameraRig.camera;
    frameNo++;
    applyViewWindow(cam);
    update(sid, cam, { capture: false });
    seeThrough(sid, cam);
    setLayers(cam, { ghost: vf.on && vf.night });
    if (core.params.lowfx) { r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = frameNo % 2 === 1; }
    const sz = pipe.drawingSize();
    const mrt = pipe.mrtFor(Math.max(1, sz.x), Math.max(1, sz.y), true);
    pipe.geometry(mrt, scene, cam);
    pipe.composite(mrt, cam, null, false);
    pipe.fx(fx[sid], cam);
    last.calls = r.info.render.calls; last.triangles = r.info.render.triangles; last.programs = r.info.programs?.length ?? 0;
    if (devBuild && frameNo % 60 === 1) check.run(scene);
  };

  /** Dev-only pass breakdown (ms per pass, flushed with readPixels); timeRender covers the whole frame. */
  const profile = (n: number, time: (fn: () => void) => number): Record<string, number> => {
    if (!pipe) return {};
    const p = pipe, r = core.renderer, sid = core.scenes.active, scene = core.scenes.get(sid), cam = core.cameraRig.camera;
    const sz = p.drawingSize(), mrt = p.mrtFor(sz.x, sz.y, true);
    update(sid, cam, { capture: false });
    const res: Record<string, number> = {};
    res.geometryWithShadow = time(() => { for (let i = 0; i < n; i++) p.geometry(mrt, scene, cam); }) / n;
    res.geometryOnly = time(() => withFrozenShadow(() => { for (let i = 0; i < n; i++) p.geometry(mrt, scene, cam); })) / n;
    res.composite = time(() => { for (let i = 0; i < n; i++) p.composite(mrt, cam, null, false); }) / n;
    res.fx = time(() => { for (let i = 0; i < n; i++) p.fx(fx[sid], cam); }) / n;
    r.setRenderTarget(null);
    return res;
  };

  const api: RenderApi = {
    async init() {
      const r = core.renderer;
      // Front-to-back for opaque draws (three sorts by material id first): SwiftShader is fill-bound and every toon
      // material is a separate Material instance, so creation order would otherwise decide the overdraw.
      r.setOpaqueSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.z - b.z || a.id - b.id);
      comp = createComposite(bakeClouds(r).texture);
      pipe = new Pipeline(r, comp);
      // P3-look (L5): three restores a lost context by itself (it already preventDefault()s webglcontextlost) and
      // re-uploads data/canvas textures, but a render target comes back EMPTY: the baked cloud cube left a flat teal
      // sky for good after a GPU switch / driver reset. Re-bake it on restore.
      core.canvas.addEventListener('webglcontextrestored', () => {
        if (!comp) return;
        try { comp.u.tCloud.value = bakeClouds(r).texture; r.setRenderTarget(null); } catch (e) { core.log.warn('[render] cloud re-bake failed', e); }
        lostContext = false;
      });
      core.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lostContext = true; });
      const scenes = { planet: core.scenes.get('planet'), studio_int: core.scenes.get('studio_int'), subway_int: core.scenes.get('subway_int') };
      sun = new SunRig(scenes, core.params.test || core.params.lowfx ? 1024 : 2048);
      // P3-look (L8): BasicShadowMap edges are texel staircases (10–15 cm teeth under sills, awnings, the store fascia).
      // With PCF the toon's step(0.5, shadowMask) cuts the bilinearly filtered mask at sub-texel precision: still one
      // hard cel edge, but a straight one. ?test / ?lowfx keep the 1-tap Basic map (SwiftShader budget, determinism).
      if (!core.params.test && !core.params.lowfx) r.shadowMap.type = PCFShadowMap;
      smoke = new Smoke();
      fx.planet.add(smoke.mesh);
      birds = new Birds(core.rng.fork('render:birds'));
      fx.planet.add(birds.mesh);
      if (core.params.lowfx) { blobs = new BlobShadows(core); fx.planet.add(blobs.mesh); }
      try {
        dressing = buildTitleDressing(core.rng.fork('render:title'));
        scenes.planet.add(dressing);
      } catch (e) { core.log.warn('[render] title dressing failed', e); }
      const bus = core.bus, t = () => core.clock.t;
      tween.set(core.store.state.palette, t(), 0);
      // While the title screen is up it keeps the title palette; state changes behind it (continue/boot) apply on hide.
      let titleUp = false;
      bus.on('phaseChanged', (e) => { if (!titleUp) tween.set(e.palette, t(), e.instant ? 0 : 3); });
      bus.on('stateLoaded', () => { if (!titleUp) tween.set(core.store.state.palette, t(), 0); env.reset(); });
      bus.on('title', (e) => { titleUp = e.shown; tween.set(e.shown ? 'title' : core.store.state.palette, t(), 0); });
      bus.on('cardShown', (e) => { if (e.kind === 'credits') creditsUp = true; });
      bus.on('cardClosed', (e) => { if (e.kind === 'credits') creditsUp = false; });
      bus.on('stateLoaded', () => { creditsUp = false; });
      bus.on('uncanny', (e) => env.trigger(e.id, t()));
      bus.on('dialogueEnd', () => env.dialogueEnd(t()));
      bus.on('viewfinder', (e) => { if (!e.on) { vf.on = false; vf.negative = false; } });
      bus.on('lensChanged', (e) => { if (vf.on) vf.night = e.night; });
      bus.on('sceneChanged', () => { smoke?.hide(); smokeKey = ''; });
    },
    frame: (dt?: number) => { adapt(dt); frame(); },
    capture(o) {
      const w = Math.max(1, Math.round(o.width ?? 480)), h = Math.max(1, Math.round(o.height ?? 270));
      if (!pipe) return document.createElement('canvas');
      const sid = o.scene ?? core.scenes.active, scene = core.scenes.get(sid), cam = o.camera;
      const aspect = cam.aspect, mask = cam.layers.mask;
      if (Math.abs(aspect - w / h) > 1e-6) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      setLayers(cam, o);
      const uncull = cullForCapture(sid, cam.getWorldPosition(tmp));
      const hidden: { visible: boolean }[] = [];
      const ghosts = o.photoOnly || o.ghost ? collectGhosts(scene, cam) : [];
      if (o.past || o.hideTransient) {
        scene.traverse((x) => {
          if (x.visible && ((o.past && x.userData.hideInPast) || (o.hideTransient && x.userData.transient))) { x.visible = false; hidden.push(x); }
        });
      }
      try {
        update(sid, cam, { capture: true, palette: o.palette });
        if (o.flash) shared.uFlash.value.set(o.flash.pos.x, o.flash.pos.y, o.flash.pos.z, o.flash.radius);
        if (!capOut || capOut.width !== w || capOut.height !== h) { capOut?.dispose(); capOut = makeColorRt(w, h, true); }
        const out = capOut, p = pipe;
        withFrozenShadow(() => {
          const mrt = p.mrtFor(w, h, false);
          p.geometry(mrt, scene, cam);
          p.composite(mrt, cam, out, true);
          drawGhosts(ghosts, cam, out);
        });
        return pipe.readCanvas(out, w, h);
      } finally {
        shared.uFlash.value.set(0, 0, 0, 0);
        for (const x of hidden) x.visible = true;
        for (const m of ghosts) m.visible = true;
        uncull?.();
        cam.layers.mask = mask;
        if (cam.aspect !== aspect) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
        core.renderer.setRenderTarget(null);
      }
    },
    createLiveView(size): LiveView {
      const n = Math.max(8, Math.round(size));
      const out = makeColorRt(n, n, true);
      return {
        texture: out.texture,
        render(camera, o) {
          if (!pipe) return;
          const sid = o?.scene ?? core.scenes.active, scene = core.scenes.get(sid), mask = camera.layers.mask, p = pipe;
          camera.updateMatrixWorld();
          setLayers(camera, { ghost: o?.ghost });
          const uncull = cullForCapture(sid, camera.getWorldPosition(tmp));
          try {
            update(sid, camera, { capture: true });
            withFrozenShadow(() => {
              const mrt = p.mrtFor(n, n, false);
              p.geometry(mrt, scene, camera);
              p.composite(mrt, camera, out, true);
            });
          } finally { uncull?.(); camera.layers.mask = mask; core.renderer.setRenderTarget(null); }
        },
        dispose: () => out.dispose(),
      };
    },
    fxScene: (id) => fx[id],
    setPalette(key, seconds = 1.5) { tween.set(key, core.clock.t, seconds); },
    setViewfinder(o) { vf.on = o.on; vf.night = o.on && o.night; vf.negative = o.on && !!o.negative; },
    registerLamp(o): LampHandle {
      // pos is kept BY REFERENCE: the owner may mutate it to move the lamp (e.g. C's hero torch); radius = 3D reach (m)
      const rec: LampRec = { scene: o.scene, pos: o.pos, radius: o.radius, on: o.on ?? true };
      lamps.add(rec);
      return { setOn: (on) => { rec.on = on; }, remove: () => { lamps.delete(rec); } };
    },
    setSmoke(path) {
      if (!smoke) return;
      if (!path) { smoke.hide(); smokeKey = ''; return; }
      const sid = core.scenes.active;
      const pts = path.via?.length ? [path.from, ...path.via, path.to] : null;
      const key = `${sid}:${(pts ?? [path.from, path.to]).map((p) => `${Math.round(p.x * 20)},${Math.round(p.y * 20)},${Math.round(p.z * 20)}`).join(';')}`;
      if (key === smokeKey && smoke.mesh.visible) return;
      smokeKey = key;
      if (smoke.mesh.parent !== fx[sid]) fx[sid].add(smoke.mesh);
      if (pts) smoke.setPoints(sid, pts, core.clock.animT); else smoke.setPath(sid, path.from, path.to, core.clock.animT);
    },
    async compile() {
      if (!pipe) return;
      const r = core.renderer, cam = core.cameraRig.camera;
      try {
        update(core.scenes.active, cam, { capture: false });   // uniforms + the night variant as the first frame will use them
        const sz = pipe.drawingSize();
        const mrt = pipe.mrtFor(Math.max(1, sz.x), Math.max(1, sz.y), true);
        for (const id of SCENES) {
          r.setRenderTarget(mrt);                // main-pass programs are keyed by the MRT's colour space
          await r.compileAsync(core.scenes.get(id), cam);
        }
        r.setRenderTarget(null);
        if (comp) {                                              // both composite programs (gameplay + viewfinder)
          const c = comp;
          for (const m of [c.materialVf, c.material]) { c.mesh.material = m; await r.compileAsync(c.scene, c.camera); }
        }
        for (const id of SCENES) if (fx[id].children.length) await r.compileAsync(fx[id], cam);
      } catch (e) { core.log.warn('[render] compile failed', e); }
      finally { r.setRenderTarget(null); }
    },
    stats: () => ({ ...last }),
    uncanny: () => rawUnc,
    timeRender(frames) {
      const gl = core.renderer.getContext();
      const px = new Uint8Array(4);
      const n = Math.max(1, Math.floor(frames));
      frame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { frame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return (performance.now() - t0) / n;
    },
    snapshot() {
      frame();
      return core.canvas.toDataURL('image/png');
    },
    devHook(arg) {
      try { runDevHook(core, api, arg, { profile, composite: () => comp }); } catch (e) { core.log.warn('[render] devHook failed', e); }
    },
  };
  return api;
};
