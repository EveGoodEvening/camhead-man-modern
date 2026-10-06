// src/lens/presets.ts — owner D. The four preset photos (GDD §7.2) rendered from the world, never image assets:
// ph_2006_group (PAST, sepia, date stamp; re-rendered on faceState), ph_temple_2011 (PAST, 3×, "3×" watermark),
// ph_2023_stitched (the darkroom's four panels) and ph_2026_group (PHOTO_ONLY, from the tripod). Preset photo ids equal
// their PresetPhotoId, so __game.setRef('ph_2006_group') works (GDD §19.3 P1).
import { PerspectiveCamera, Vector3 } from 'three';
import type { Photo, PresetPhotoDef, PresetPhotoId, SceneId, SpotId, Zoom } from '../types';
import { PRESET_PHOTOS } from '../data/items';
import { t } from '../data/zh';
import { DEG, SURFACES, dirToHeading, frameAt, headingToDir, type SurfaceFrame } from '../core/planet';
import { ZOOM_FOV, EYE } from './pose';
import { border, chalkX, cropCenter, sepia, stamp, stitch, toJpeg } from './photoFx';
import type { LensCtx } from './ctx';
import type { Shots } from './capture';
import { groupAim, groupPhotoFov } from './tripod';

/** GDD §7.2 defaults (F's PRESET_PHOTOS rows win when present). */
export const DEFAULT_PRESETS: Readonly<Record<PresetPhotoId, PresetPhotoDef>> = {
  ph_2006_group: { id: 'ph_2006_group', titleKey: 'lbl.ph_2006_group', from: 'vp_group_photo', zoom: 1, past: true, sepia: true, dateStamp: "'06 8 15", tags: ['ph_2006_group'] },
  ph_temple_2011: { id: 'ph_temple_2011', titleKey: 'lbl.ph_temple_2011', from: 'vp_temple_2011', zoom: 3, past: true, sepia: true, tags: ['ph_temple_2011'] },
  ph_2023_stitched: { id: 'ph_2023_stitched', titleKey: 'lbl.ph_2023_stitched', from: 'vp_group_photo', zoom: 1, tags: ['ph_2023_stitched'] },
  ph_2026_group: { id: 'ph_2026_group', titleKey: 'lbl.ph_2026_group', from: 'sp_tripod', zoom: 1, photoOnly: true, tags: ['ph_2026_group'] },
};
/** GDD §7.2 stitched panels, left → right (P3r2): ④ fishing boat + lighthouse │ ③ lower stairs + chalk X │ ② upper stairs
 *  + bridge │ ① the north pier and the corner tree. Headings from the 周记 tile (47.2, 23). P3r2 look L1: four DISTINCT
 *  frames, each aimed at its own subject (the old 26°-apart panorama read as one continuous shot of the stairs); ③ / ②
 *  put the chalk X on the ③|② seam (the middle of the print), where it is chalked over the seam. The bus stop and the
 *  store the GDD first listed cannot be seen from the tile (a tree and the bridge's north piers stand in front). */
export const STITCH_PANELS: readonly { label: string; aim: 'boat' | 'x_low' | 'x_high' | 'tree' }[] = [
  { label: '④', aim: 'boat' }, { label: '③', aim: 'x_low' }, { label: '②', aim: 'x_high' }, { label: '①', aim: 'tree' },
];
const PANEL_W = 240;
/** Horizontal field of each panel (deg) and the vFOV giving it as the centre PANEL_W columns of a 480×270 capture. */
const PANEL_HFOV = 30;
const PANEL_VFOV = 2 * Math.atan(Math.tan(PANEL_HFOV * DEG) / (16 / 9)) / DEG;
/** Chalk X on the print: at least this many px across (L1: 「拍照的人，不在照片里」 must have something to point at). */
export const STITCH_X_PX = 56;

export function presetDef(id: PresetPhotoId): PresetPhotoDef {
  return PRESET_PHOTOS.find((p) => p.id === id) ?? DEFAULT_PRESETS[id];
}

export function createPresets(lc: LensCtx, shots: Shots) {
  const { core } = lc;
  const cam = new PerspectiveCamera(55, 16 / 9, 0.05, 250);
  cam.name = 'lens:preset';
  const fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
  const tmp = new Vector3();
  /** Unsepia'd colour versions (the rephoto success crossfade, GDD §3.8). */
  const colour = new Map<string, string>();
  const rng = core.rng.fork('lens:preset');

  /** Pose `cam` at a spot's eye point with a yaw/pitch override. */
  const poseAt = (spot: SpotId, fovDeg: number, yawOverride?: number, pitchOverride?: number, eye = EYE): SceneId => {
    const def = core.services.world.spot(spot);
    const pos = core.services.world.spotPos(spot, new Vector3());
    const s = SURFACES[def.scene];
    frameAt(s, pos, fr);
    pos.addScaledVector(fr.up, eye);
    const yaw = yawOverride ?? def.yaw ?? 0, pitch = pitchOverride ?? def.pitch ?? 0;
    const dir = headingToDir(fr, yaw, tmp).multiplyScalar(Math.cos(pitch * DEG)).addScaledVector(fr.up, Math.sin(pitch * DEG));
    cam.position.copy(pos);
    cam.up.copy(fr.up);
    cam.lookAt(dir.add(pos));
    cam.fov = fovDeg;
    cam.aspect = 16 / 9;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return def.scene;
  };

  const upsert = (id: PresetPhotoId, dataURL: string, label: string, zoom: Zoom, extraTags: readonly string[] = []): Photo => {
    const def = presetDef(id);
    const tags = [...new Set([id, ...def.tags, ...extraTags])];
    const existing = core.store.photo(id);
    if (existing) {
      // refresh in place (faceState change, reload without image data); the album re-reads photos on open
      const p = existing as Photo;
      p.dataURL = dataURL; p.label = label; p.tags = tags; p.keep = true;
      return p;
    }
    return shots.store({
      id, preset: id, dataURL, tags, label, zoom, night: false, flash: false, emitShutter: false,
      result: { frame: 'green', targetId: null, label, confidence: null, failed: null, hint: null, tags },
    });
  };

  const title = (id: PresetPhotoId) => t(presetDef(id).titleKey);

  /** Standard preset: one PAST/PHOTO_ONLY capture from its spot, sepia + border + stamp. */
  const renderSimple = (id: PresetPhotoId): Photo => {
    const def = presetDef(id);
    const scene = poseAt(def.from ?? 'vp_group_photo', ZOOM_FOV[def.zoom]);
    // old photos were taken in daylight whatever the time is now (GDD §7.2)
    const canvas = shots.capture({ camera: cam, scene, past: !!def.past, photoOnly: !!def.photoOnly, palette: 'day' });
    let url = '';
    if (canvas) {
      colour.set(id, toJpeg(canvas));
      if (def.sepia) { sepia(canvas, rng); border(canvas); }
      if (def.dateStamp) stamp(canvas, def.dateStamp, 'br');
      if (id === 'ph_temple_2011') stamp(canvas, t('vf.stamp.2011'), 'bl', '#f3f6ea');
      url = toJpeg(canvas);
    }
    return upsert(id, url, title(id), def.zoom);
  };

  /** GDD §7.2 / §9 S_darkroom: four panels from the 周记 tile, stitched left → right. */
  const renderStitched = (): { photo: Photo; url: string } => {
    const panels: HTMLCanvasElement[] = [];
    // heading / pitch from the tile's eye to a world point
    const eye = core.services.world.spotPos('vp_group_photo', new Vector3());
    frameAt(SURFACES.planet, eye, fr);
    eye.addScaledVector(fr.up, EYE);
    const aimAt = (p: Vector3) => {
      const d = tmp.copy(p).sub(eye);
      const v = d.dot(fr.up);
      d.addScaledVector(fr.up, -v);
      return { yaw: dirToHeading(fr, d), pitch: Math.atan2(v, d.length()) / DEG };
    };
    const xAt = core.services.world.spotPos('sp_stairs_x', new Vector3());
    let boatAt = xAt;
    try { boatAt = core.services.world.anchor('lm:boat').pos.clone(); } catch { /* fake world */ }
    const x = aimAt(xAt), boat = aimAt(boatAt);
    const poses: Record<(typeof STITCH_PANELS)[number]['aim'], { yaw: number; pitch: number }> = {
      boat: { yaw: boat.yaw - 3, pitch: 3 },                              // the boat's bow, the lighthouse behind it
      x_low: { yaw: x.yaw - PANEL_HFOV / 2, pitch: x.pitch - 3 },          // the X at the right edge, lower stairs
      x_high: { yaw: x.yaw + PANEL_HFOV / 2, pitch: x.pitch + 12 },        // the X at the left edge, upper stairs + bridge
      tree: { yaw: x.yaw + 46, pitch: 5 },                                // the north pier and the corner tree
    };
    let xPy = 0.5;
    for (const p of STITCH_PANELS) {
      const o = poses[p.aim];
      const scene = poseAt('vp_group_photo', PANEL_VFOV, o.yaw, o.pitch);
      if (p.aim === 'x_low') { const n = xAt.clone().project(cam); xPy = Math.min(0.85, Math.max(0.15, 0.5 - n.y * 0.5)); }
      const c = shots.capture({ camera: cam, scene, palette: 'day' });   // dad shot the four frames in 2023 daylight
      if (c) panels.push(cropCenter(c, PANEL_W));
    }
    let url = '';
    if (panels.length === STITCH_PANELS.length) {
      const strip = stitch(panels, STITCH_PANELS.map((p) => p.label));
      // the chalk X dad left for his son, on the ③|② seam where it lies on the tread (GDD §7.2 「正中间是粉笔叉」)
      chalkX(strip, strip.width / 2, 22 + xPy * (strip.height - 44), STITCH_X_PX, rng);
      url = toJpeg(strip);
    }
    return { photo: upsert('ph_2023_stitched', url, title('ph_2023_stitched'), 1), url };
  };

  /** GDD §9 S_group_photo: PHOTO_ONLY capture from the tripod; the recognition reads 「周远 · 人 100%」. */
  const renderGroup = (camera0: PerspectiveCamera, scene: SceneId): Photo => {
    // P3r3 (look f): tighter than the 1× tripod view — aimed at the band's angular middle, fov fitted to it (tripod.ts)
    const camera = camera0.clone();
    camera.fov = groupPhotoFov(camera.position, camera0.fov);
    camera.aspect = 16 / 9;
    camera.lookAt(groupAim(camera.position, new Vector3()));
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    // P3-look L3: the game's payoff image is shown full-card: render it at 960 × 540, not the 480 × 270 lens default
    const canvas = shots.capture({ camera, scene, photoOnly: true, ghost: false, flash: { pos: camera.position.clone(), radius: 10 }, width: 960, height: 540 });
    const label = t('vf.photoLabel', { label: t('lbl.ph_2026_group.ok'), conf: 100 });
    return upsert('ph_2026_group', canvas ? toJpeg(canvas) : '', label, 1);
  };

  const api = {
    colour,
    poseAt,
    async render(id: PresetPhotoId): Promise<Photo> {
      try {
        if (id === 'ph_2023_stitched') return renderStitched().photo;
        if (id === 'ph_2026_group') {
          const scene = poseAt('sp_tripod', ZOOM_FOV[1], undefined, undefined, 1.5);
          return renderGroup(cam, scene);
        }
        return renderSimple(id);
      } catch (e) {
        core.log.warn(`[lens] renderPreset ${id} failed`, e);
        return upsert(id, '', title(id), presetDef(id).zoom);
      }
    },
    renderStitched,
    renderGroup,
    /** Re-render presets whose image is missing (save reload keeps metadata only) or whose faces changed. */
    refresh(which: 'missing' | 'faces') {
      for (const p of core.store.state.photos) {
        if (!p.preset) continue;
        if (which === 'missing' && p.dataURL) continue;
        if (which === 'faces' && p.preset !== 'ph_2006_group') continue;
        void api.render(p.preset);
      }
    },
  };
  return api;
}
export type Presets = ReturnType<typeof createPresets>;
