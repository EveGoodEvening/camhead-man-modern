// src/lens/ctx.ts — owner D. Shared lens runtime: state, pose, anchors, the ShotCtx for evalShot and the per-tick
// evaluation cache. Every sub-module (shots, peek, presets, extras, dev) receives this object.
import { Vector3 } from 'three';
import type { Core, LensState, Rng } from '../contracts';
import type { PhotoTarget, PuzzleId, ShotResult, TargetId } from '../types';
import { TARGETS } from '../data/photoTargets';
import { PUZZLES } from '../data/puzzles';
import { t } from '../data/zh';
import { createAnchors, type Anchors } from './anchors';
import { evaluate, resultOf, type Evaluation, type ShotCtx } from './evalShot';
import { createLabelProbe, type LabelProbe } from './labels';
import { PHOTO_ASPECT, createPose, type Pose } from './pose';
import { createViewBuilder, type LensPose, type ViewBuilder } from './view';
import type { Overlay } from './overlay';

/** GDD §9: puzzle → lens targets, used for candidate priority while F's PUZZLES table is empty. */
const FALLBACK_PUZZLES: readonly { id: PuzzleId; solved: string; targets: readonly TargetId[] }[] = [
  { id: 'P1_rephoto_bridge', solved: 'P1_done', targets: ['T_rephoto_2006'] },
  { id: 'P2_signal_locker', solved: 'P2_done', targets: ['T_locker17'] },
  { id: 'P3_face_gate', solved: 'P3_done', targets: ['T_granny_face'] },
  { id: 'P4_tudi_face', solved: 'P4_done', targets: ['T_temple_qr', 'T_rephoto_2011'] },
  {
    id: 'P5_rooftop_coop', solved: 'P5_done',
    targets: ['T_door_201', 'T_door_202', 'T_door_203', 'T_door_204', 'T_door_301', 'T_door_302', 'T_door_303', 'T_door_304',
      'T_door_401', 'T_door_402', 'T_door_403', 'T_door_404', 'T_pigeons'],
  },
  { id: 'P6_lighthouse_1987', solved: 'P6_done', targets: ['T_light_trail', 'T_plaque', 'T_frame3_lamp'] },
  { id: 'P7_line_zero', solved: 'P7_done', targets: ['T_frame4_pit'] },
  { id: 'P8_chai_to_zhe', solved: 'P8_done', targets: ['T_chai'] },
  { id: 'P9_paper_eye', solved: 'P9_done', targets: ['T_zhimei_sea'] },
];

/** GDD §9 P3 blink function: closed while ((t − t0) mod 0.8) ≥ 0.48. */
export function blinkClosed(t: number, epoch: number): boolean {
  const p = (((t - epoch) % 0.8) + 0.8) % 0.8;
  return p >= 0.48 - 1e-9;
}

export interface Fx {
  flashAt: number; flashStrength: number;
  polaSrc: string | null; polaAt: number;
  msg: { text: string; until: number } | null;      // "已识别" / "糊了，别动" etc. in the recognition bar
}

export function createLensCtx(core: Core) {
  const state: LensState = {
    active: false, zoom: 1, night: false, flash: false, overlay: false, torch: false, peek: null, exposing: false, frame: 'white',
  };
  const pose: Pose = createPose(core);
  const anchors: Anchors = createAnchors(core);
  const view: ViewBuilder = createViewBuilder(core, anchors);
  const probe: LabelProbe = createLabelProbe(core, anchors, view);
  const rng: Rng = core.rng.fork('lens:photo');
  const fx: Fx = { flashAt: -1e9, flashStrength: 0, polaSrc: null, polaAt: -1e9, msg: null };
  let active: Set<TargetId> | null = null;
  let grannyEpoch: number | null = null;
  let moved = false;
  let cache: { frame: number; res: ShotResult; ev: Evaluation | null } | null = null;

  const activeTargets = (): ReadonlySet<TargetId> => {
    if (active) return active;
    const s = new Set<TargetId>();
    if (PUZZLES.length) {
      for (const p of PUZZLES) {
        if (core.store.has(p.solvedFlag)) continue;
        let ok = false;
        try { ok = core.rules.evalCond(p.availableWhen); } catch { ok = false; }
        if (ok) for (const id of p.targets) s.add(id);
      }
    } else {
      for (const p of FALLBACK_PUZZLES) if (!core.store.has(p.solved as never)) for (const id of p.targets) s.add(id);
    }
    active = s;
    return s;
  };

  const refPhoto = (): string | null => {
    const id = core.store.state.refPhotoId;
    if (!id) return null;
    const p = core.store.photo(id);
    return p ? p.preset ?? p.id : null;
  };

  const eyesClosed = (): boolean => {
    const n = core.services.chars.npc('granny_wang');
    if (n) { try { return n.eyesClosed(); } catch { /* fall through */ } }
    return grannyEpoch !== null && blinkClosed(core.clock.animT, grannyEpoch);
  };

  const vars = (tg: PhotoTarget): Readonly<Record<string, string>> | undefined => {
    switch (tg.id) {
      case 'T_granny_face': return { eyes: t(eyesClosed() ? 'lbl.eyes.closed' : 'lbl.eyes.open') };
      case 'T_portrait_wall': {
        let f = 'mosaic';
        try { f = core.services.chars.faceState(); } catch { /* default */ }
        return { face: t(`lbl.face.${f}`) };
      }
      case 'T_zhimei': return { eye: t(core.store.has('zhimei_eye') ? 'lbl.eye.two' : 'lbl.eye.one') };
      default: return undefined;
    }
  };

  // One persistent ShotCtx, refreshed in place every evaluation (ARCHITECTURE §5.1: no per-frame closures).
  const has = (f: Parameters<ShotCtx['has']>[0]) => core.store.has(f);
  const fallback = () => probe.current(state.zoom);
  const sc: ShotCtx = {
    zoom: 1, night: false, flash: false, torch: false, overlay: false, peek: null, scene: 'planet', phase: 'day',
    has, refPhoto: null, moved: false, active: new Set<TargetId>(), text: t, vars, eyesClosed, fallback,
  };
  const shotCtx = (): ShotCtx => {
    sc.zoom = state.zoom; sc.night = state.active && state.night; sc.flash = state.flash; sc.torch = state.torch;
    sc.overlay = state.overlay; sc.peek = state.peek; sc.scene = pose.pose.scene; sc.phase = core.store.state.phase;
    sc.refPhoto = refPhoto(); sc.moved = moved; sc.active = activeTargets(); sc.nightVerb = core.store.hasVerb('night');
    return sc;
  };

  // P3 G10: judge at the photo's aspect (captures are 480×270), never the window's: a target green at the edge of a
  // 21:9 window used to be cropped out of the stored photo
  const aspect = (): number => PHOTO_ASPECT;

  const lc = {
    core, state, pose, anchors, view, probe, rng, fx,
    overlay: null as Overlay | null,
    /** Teleports D starts itself (peeks) must not close the viewfinder. */
    selfTeleport: 0,
    seq: 0,
    lastPhotoId: null as string | null,
    /** Where each photo of this session was taken (rephoto score against non-preset references). */
    photoPose: new Map<string, { scene: string; pos: Vector3; yaw: number; pitch: number; zoom: number }>(),
    get moved() { return moved; },
    set moved(v: boolean) { moved = v; cache = null; },
    get grannyEpoch() { return grannyEpoch; },
    set grannyEpoch(v: number | null) { grannyEpoch = v; },
    /** Invalidate the active-puzzle set (flags changed). */
    dirty() { active = null; cache = null; },
    /** Fresh lens pose (+ camera matrices). */
    updatePose(): LensPose { return pose.update(state.zoom, aspect()); },
    /** The one evalShot of this tick (cached per frame unless `force`). */
    evaluate(force = false): { res: ShotResult; ev: Evaluation | null } {
      if (!force && cache && cache.frame === core.clock.frame) return cache;
      const p = lc.updatePose();
      probe.update(p, state.active && state.night, force);
      const sv = view.bind(pose.cam, p);
      const c = shotCtx();
      let ev: Evaluation | null = null;
      // the tripod view frames the group photo only (GDD §9 S_group_photo): no target competes there
      try { ev = state.peek === 'tripod' ? null : evaluate(sv, TARGETS, c); } catch (e) { core.log.warn('[lens] evalShot failed', e); }
      const res = resultOf(ev, c);
      cache = { frame: core.clock.frame, res, ev };
      return cache;
    },
    invalidate() { cache = null; },
    shotCtx,
    say(text: string, seconds = 1.5) { fx.msg = { text, until: core.clock.t + seconds }; },
  };
  return lc;
}
export type LensCtx = ReturnType<typeof createLensCtx>;
