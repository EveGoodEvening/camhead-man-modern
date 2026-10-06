// src/lens/tripod.ts — owner D. The finale self-timer (GDD §9 S_group_photo, §16.6, §18.4 tripodTimer):
// head on the tripod, E arms the timer, the 10 s Silkscreen countdown (sim time) starts when the body steps onto the
// stair treads (P3r2 G2), the headless body must reach the chalk X
// (sp_stairs_x) within 1.0 m. Success → PHOTO_ONLY ph_2026_group 「周远 · 人 100%」 + group_photo_done, head back.
// Failure → xiaolin.group_retry, the body fades back beside the tripod; retry as often as needed.
import { Vector3 } from 'three';
import { t } from '../data/zh';
import { SURFACES, chartToFlat, chartToWorld, flatDirToHeading, worldToFlat } from '../core/planet';
import type { LensCtx } from './ctx';
import type { Modes } from './modes';
import type { Presets } from './presets';

export const TIMER_SECONDS = 10;
export const X_RADIUS = 1.0;
const EXIT_AFTER = 1.2;
/** G2: the armed timer starts counting once the feet are this high on a tread, within this flat distance of the X. */
export const ON_STAIRS_H = 0.15;
export const ON_STAIRS_R = 8;
/** Where the body stands in ph_2026_group: the X's lon on the lineup radius, on the tread (stair h = 0.393·(lon − 16)). */
const SHOT_AT = { r: 41.6, lon: 23, h: 0.393 * (23 - 16) };
/** The tripod (the 周记 tile, GDD vp_group_photo) in chart coordinates. */
export const TRIPOD_AT = { r: 47.2, lon: 23 } as const;
/** Heading (deg) from a chart point toward the tripod: everyone in the photo squares up to the lens. */
export function headingToTripod(p: { r: number; lon: number }): number {
  const f = chartToFlat({ r: p.r, lon: p.lon }), c = chartToFlat(TRIPOD_AT);
  return flatDirToHeading(f.x, f.z, c.x - f.x, c.z - f.z);
}
/** P3r2 G2: the walk from the tile to the chalk X, in chart coordinates. The X sits on a tread (h 2.75) behind the
 *  stair's sea-side rail, so the only way up is round the stair foot at lon ≈ 16 (by the 折 board): tile → pavement
 *  corner → stair foot → up the treads (r 40.9, clear of the stair tier at r 41.6) → X. Walk-tested against the real
 *  colliders in tripod.guide.test.ts; drawn as a chalk line over the tripod view (the X is invisible from the lens). */
export const STAIR_H = (lon: number): number => Math.max(0, 0.393 * (lon - 16));
export const GUIDE_ROUTE: readonly { r: number; lon: number; h: number }[] = [
  { r: 45.6, lon: 21.4, h: 0 }, { r: 43.0, lon: 15.0, h: 0 }, { r: 40.9, lon: 15.5, h: 0 },
  ...[16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.4].map((lon) => ({ r: 40.9, lon, h: STAIR_H(lon) })),
  { r: 41, lon: 23, h: STAIR_H(23) },
];
/** P3r2 (camera) ph_2026_group composition: a street group photo, two tiers — the front row standing on the pavement
 *  in front of the south stairs (g1 g3 g4 g8, r 42.9) and the stair tier around the chalk X (g9 g7 X 老周, r 41.6),
 *  土地 on a rail post. The frame must hold the band from the front row's shins (`low`) to the top of 老周's head
 *  (`high`); the lens aims at the angular middle of that band. */
// P3r2 look L3: `low` is the front row's feet (their shoes were cut off at the bottom edge of ph_2026_group); 老周 now
// stands on 周远's own tread beside him (chars/index.ts LAO_ZHOU_AT), so `high` is his head there
export const GROUP_FRAME = { low: { r: 42.9, lon: 22.9, h: -0.05 }, high: { r: 41.0, lon: 22.9, h: 4.9 } } as const;
const _lo = new Vector3(), _hi = new Vector3();
/** Look point (10 m out) for a camera at `from` that centres GROUP_FRAME (pure). */
export function groupAim(from: Vector3, out: Vector3): Vector3 {
  chartToWorld(GROUP_FRAME.low, _lo).sub(from).normalize();
  chartToWorld(GROUP_FRAME.high, _hi).sub(from).normalize();
  return out.copy(_lo).add(_hi).normalize().multiplyScalar(10).add(from);
}

/** P3r3 (look f): ph_2026_group is framed tighter than the 1× tripod view (55°, which left the band at ≈ 80 % of the
 *  frame height and a strip of road under the front row): the vertical FOV that fits the band with PHOTO_MARGIN of the
 *  frame height left above and below. The stair row, 老周 and 土地 come out ≈ 15 % larger. Pure. */
export const PHOTO_MARGIN = 0.035;
const _fw = new Vector3(), _up = new Vector3();
export function groupPhotoFov(from: Vector3, maxFov = 55): number {
  const aim = groupAim(from, new Vector3());
  _fw.copy(aim).sub(from).normalize();
  _up.copy(from).normalize();                             // the planet centre is the origin
  _up.addScaledVector(_fw, -_up.dot(_fw)).normalize();    // camera up (perpendicular to the view)
  const ang = (p: { r: number; lon: number; h: number }) => {
    const d = chartToWorld(p, new Vector3()).sub(from);
    return Math.atan2(d.dot(_up), d.dot(_fw));
  };
  const half = Math.max(Math.abs(ang(GROUP_FRAME.low)), Math.abs(ang(GROUP_FRAME.high)));
  // tan-space: the band's edge sits at (1 − 2·margin) of the half height
  const fov = (2 * Math.atan(Math.tan(half) / (1 - 2 * PHOTO_MARGIN)) * 180) / Math.PI;
  return Math.min(maxFov, fov);
}

export function createTripod(lc: LensCtx, modes: Modes, presets: Presets) {
  const { core, state } = lc;
  const tmp = new Vector3(), xs = new Vector3();
  let timer: { t0: number; last: number } | null = null;
  let exitAt: number | null = null;
  /** P3r2 G2: E arms the self-timer; the 10 s count starts when the body sets foot on the stair treads. The stair foot
   *  is at the left edge of the tripod view (the body walks out of frame to get there), and a count running from the
   *  tile made almost every first attempt fail on the approach, not on the stairs. */
  let armed = false;

  const bodyAtX = (): boolean => {
    try {
      core.services.world.spotPos('sp_stairs_x', xs);
      const a = worldToFlat(SURFACES.planet, core.player.pos(tmp)), b = worldToFlat(SURFACES.planet, xs);
      return core.player.scene === 'planet' && Math.hypot(a.x - b.x, a.z - b.z) <= X_RADIUS;
    } catch { return false; }
  };

  /** On a stair tread (h ≥ 0.15 m) within the stair's reach of the X. */
  const bodyOnStairs = (): boolean => {
    try {
      if (core.player.scene !== 'planet' || core.player.flat().h < ON_STAIRS_H) return false;
      core.services.world.spotPos('sp_stairs_x', xs);
      const a = worldToFlat(SURFACES.planet, core.player.pos(tmp)), b = worldToFlat(SURFACES.planet, xs);
      return Math.hypot(a.x - b.x, a.z - b.z) <= ON_STAIRS_R;
    } catch { return false; }
  };
  const beginCount = () => {
    armed = false;
    // the start blip is the "10": tick() emits only 9…1, exactly one blip per second (requests-A #5)
    timer = { t0: core.clock.animT, last: TIMER_SECONDS };
    core.bus.emit('sfx', { id: 'sfx_countdown' });
  };

  const fire = () => {
    timer = null;
    lc.fx.flashAt = core.clock.t; lc.fx.flashStrength = 1;
    core.bus.emit('shutter', { burst: false, night: false, flash: true, zoom: 1 });
    if (bodyAtX()) {
      // everyone squares up for the shot (I-gate): the body steps onto the lineup (r 41.6, like g1–g9) and faces the
      // tripod. At the X's own r 41 (stair centre) the sea-side top rail crossed his face from the 1.5 m tripod head,
      // and a player who walked up the stairs was photographed from behind (GDD §9 「照片里周远有脸」, §19.4 photo_card).
      lc.selfTeleport++;
      try { core.player.teleport({ scene: 'planet', at: SHOT_AT, yawDeg: headingToTripod(SHOT_AT) }); } finally { lc.selfTeleport--; }
      const p = lc.updatePose();
      const photo = presets.renderGroup(lc.pose.cam, p.scene);
      lc.fx.polaSrc = photo.dataURL || null; lc.fx.polaAt = core.clock.t;
      lc.say(t('vf.photoLabel', { label: t('lbl.ph_2026_group.ok'), conf: 100 }), EXIT_AFTER + 0.5);
      void core.rules.run([{ set: 'group_photo_done' }], 'lens:tripod');
      exitAt = core.clock.t + EXIT_AFTER;
    } else {
      void core.rules.run([{ node: 'xiaolin.group_retry' }], 'lens:tripod');
      // the body fades back beside the tripod (GDD §9 step 6)
      const back = () => {
        lc.selfTeleport++;
        try { core.player.teleport({ scene: 'planet', at: { r: 47.2, lon: 24.6 }, yawDeg: 0 }); } finally { lc.selfTeleport--; }
      };
      if (core.params.test) back();
      else void core.fade(true, 0.3).then(() => { back(); return core.fade(false, 0.3); });
    }
  };

  return {
    start() {
      if (state.peek !== 'tripod' || timer || armed || exitAt !== null) return;
      if (bodyOnStairs()) { beginCount(); return; }
      armed = true;
      core.bus.emit('sfx', { id: 'sfx_click' });
    },
    cancel() { timer = null; exitAt = null; armed = false; },
    tick() {
      if (exitAt !== null && core.clock.t >= exitAt) { exitAt = null; void modes.exitPeek(); return; }
      if (armed && state.peek === 'tripod' && bodyOnStairs()) beginCount();
      if (!timer) return;
      const el = core.clock.animT - timer.t0;
      const n = Math.ceil(TIMER_SECONDS - el - 1e-9);
      if (n !== timer.last && n > 0) { timer.last = n; core.bus.emit('sfx', { id: 'sfx_countdown' }); }
      if (el >= TIMER_SECONDS - 1e-6) fire();
    },
    /** G2: the chalk route + X marker are shown while the head is on the tripod and no photo is being taken. */
    guide(): { on: boolean; atX: boolean } {
      return { on: state.peek === 'tripod' && exitAt === null, atX: state.peek === 'tripod' && bodyAtX() };
    },
    /** Overlay: countdown number + line. */
    view(): { n: number | null; text: string } {
      if (state.peek !== 'tripod') return { n: null, text: '' };
      if (timer) return { n: Math.max(1, Math.ceil(TIMER_SECONDS - (core.clock.animT - timer.t0) - 1e-9)), text: t('tp.walk') };
      if (armed) return { n: TIMER_SECONDS, text: t('tp.armed') };
      if (exitAt !== null) return { n: null, text: '' };
      return { n: null, text: `${t('tp.detach')} · ${t('tp.timer')}` };
    },
    get running() { return timer !== null; },
    get armed() { return armed; },
  };
}
export type Tripod = ReturnType<typeof createTripod>;
