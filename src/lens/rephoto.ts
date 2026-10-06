// src/lens/rephoto.ts — owner D. Reference overlay (GDD §3.8): the album photo set as reference shows at 50 % over
// the viewfinder (R), with 「重合度 n%」. Presets score against their rephoto target's viewpoint (or their own spot);
// photos from this session against the pose they were taken from. A green rephoto shot turns the overlay from sepia to
// colour in 0.6 s, then it fades away.
import { Vector3 } from 'three';
import type { PhotoTarget, SpotId, Zoom } from '../types';
import { TARGETS } from '../data/photoTargets';
import { SURFACES, worldToFlat } from '../core/planet';
import { rephotoScore } from './evalShot';
import { angleDiff } from './view';
import { presetDef } from './presets';
import type { LensCtx } from './ctx';
import type { Presets } from './presets';

export const OVERLAY_OPACITY = 0.5;
export const REVEAL_COLOUR = 0.6, REVEAL_FADE = 0.3;
const DEFAULT_TOL = { pos: 1.5, yaw: 10, pitch: 10 };
/** Preset → the rephoto target that uses it as reference (score against that target's viewpoint). */
const BY_REF = new Map<string, PhotoTarget>(
  TARGETS.filter((x) => x.kind === 'rephoto' && x.refPhoto).map((x) => [x.refPhoto as string, x]),
);

export function createRephoto(lc: LensCtx, presets: Presets) {
  const { core, state } = lc;
  const tmp = new Vector3();
  let success: { t0: number; src: string | null; ref: string } | null = null;

  const errorsTo = (scene: string, at: Vector3, yaw: number | undefined, pitch: number | undefined) => {
    const p = lc.pose.pose;
    if (p.scene !== scene) return null;
    const s = SURFACES[p.scene];
    const a = worldToFlat(s, p.pos), b = worldToFlat(s, at);
    return {
      ePos: Math.hypot(a.x - b.x, a.z - b.z),
      eYaw: yaw === undefined ? 0 : angleDiff(p.yaw, yaw),
      ePitch: Math.abs(p.pitch - (pitch ?? 0)),
    };
  };
  const spotScore = (spot: SpotId, tol: { pos: number; yaw?: number; pitch?: number }, zoomOk: boolean): number | null => {
    try {
      const d = core.services.world.spot(spot);
      const e = errorsTo(d.scene, core.services.world.spotPos(spot, tmp), d.yaw, d.pitch);
      return e ? rephotoScore(e, tol, zoomOk) : 0;
    } catch { return null; }
  };

  /** The reveal is over: the overlay switches itself off (GDD §3.8 「然后消失」). */
  const finish = () => {
    success = null;
    if (state.overlay) { state.overlay = false; core.bus.emit('lensChanged', { zoom: state.zoom, night: state.night, flash: state.flash, overlay: false, torch: state.torch }); }
  };

  const api = {
    /** Per tick (lens phase): expire the reveal even while a dialogue camera hides the viewfinder chrome (Phase 2, I:
     *  the expiry used to live only in view(), so a night talk right after P4 left the overlay on for every later
     *  viewfinder — golden-09-P6 showed the 2011 temple over the lh_door view). */
    tick() {
      if (success && (core.clock.t - success.t0 >= REVEAL_COLOUR + REVEAL_FADE || !state.active)) finish();
    },
    /** Live 「重合度」 for the current reference (null = nothing to compare with). */
    score(): number | null {
      const id = core.store.state.refPhotoId;
      const ref = id ? core.store.photo(id) : null;
      if (!ref) return null;
      if (ref.preset) {
        const tg: PhotoTarget | undefined = BY_REF.get(ref.preset);
        if (tg?.viewpoint) {
          const zs: readonly Zoom[] = tg.zoom ?? [1, 3, 10];
          return spotScore(tg.viewpoint.spot, { pos: tg.viewpoint.posTol, yaw: tg.viewpoint.yawTol, pitch: tg.viewpoint.pitchTol }, zs.includes(state.zoom));
        }
        const def = presetDef(ref.preset);
        return def.from ? spotScore(def.from, DEFAULT_TOL, state.zoom === def.zoom) : null;
      }
      const pp = lc.photoPose.get(ref.id);
      if (!pp) return null;
      const e = errorsTo(pp.scene, pp.pos, pp.yaw, pp.pitch);
      return e ? rephotoScore(e, DEFAULT_TOL, state.zoom === pp.zoom) : 0;
    },
    onGreen(tg: PhotoTarget) {
      if (tg.kind !== 'rephoto') return;
      const ref = core.store.state.refPhotoId ?? '';
      success = { t0: core.clock.t, src: tg.refPhoto ? presets.colour.get(tg.refPhoto) ?? null : null, ref };
    },
    /** Overlay layers for this frame. */
    view(): { src: string | null; opacity: number; colour: { src: string; k: number } | null } {
      const id = core.store.state.refPhotoId;
      const ref = id ? core.store.photo(id) : null;
      if (success) {
        const age = core.clock.t - success.t0;
        if (age >= REVEAL_COLOUR + REVEAL_FADE || !state.active) { finish(); return { src: null, opacity: 0, colour: null }; }
        const fade = age > REVEAL_COLOUR ? 1 - (age - REVEAL_COLOUR) / REVEAL_FADE : 1;
        const k = Math.min(1, age / REVEAL_COLOUR);
        return {
          src: ref?.dataURL || null, opacity: OVERLAY_OPACITY * fade,
          colour: success.src ? { src: success.src, k } : null,
        };
      }
      if (!state.active || !state.overlay || !ref?.dataURL) return { src: null, opacity: 0, colour: null };
      return { src: ref.dataURL, opacity: OVERLAY_OPACITY, colour: null };
    },
    reset() { if (success) finish(); },
  };
  return api;
}
export type Rephoto = ReturnType<typeof createRephoto>;
