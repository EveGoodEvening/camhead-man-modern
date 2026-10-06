// src/ui/hud/tutorial.ts — owner E. Tutorial bubbles (GDD §11.14): each appears once and disappears when the player
// does it. Done state persists as `seen:<tutId>` flags; the zoom and flash bubbles trigger on lensHint.
// P3 round 2 (onboarding): a bubble only SHOWS in its own context (viewfinder bubbles only while the viewfinder is
// open, the album one over the phone, 出示 next to someone who can be shown a photo…), at most two at once, ordered by
// TUT_ORDER; it still completes (and never comes back) whenever the player does the thing, visible or not. The prologue
// also teaches moving / looking, the shutter and where the controls page is.
import type { Core } from '../../contracts';
import type { PromptVerb, TutId } from '../../types';
import { TUT_IDS } from '../../data/ids/ui';
import { has, t } from '../../data/zh';
import { touchCapable } from '../touch';
import { h, showEl, stamp, withKeycaps } from '../dom';

export interface Tutorials {
  trigger(id: TutId): void;
  done(id: TutId): void;
  update(view: TutView, dt?: number): void;
  /** The primary bubble on screen (null when none fits the current context). */
  readonly current: TutId | null;
  /** Every triggered bubble that is not done yet, visible or not. */
  pending(): TutId[];
}

/** Where a bubble belongs. */
export type TutPlace = 'play' | 'vf' | 'phone' | 'showable' | 'detach' | 'lens';
export const TUT_PLACE: Readonly<Record<TutId, TutPlace>> = {
  tut_move: 'play', tut_phone: 'play', tut_view: 'play', tut_menu: 'play',
  tut_setref: 'phone',
  tut_shutter: 'vf', tut_overlay: 'vf', tut_zoom: 'vf', tut_burst: 'vf', tut_flash: 'vf', tut_night: 'vf',
  tut_show: 'showable', tut_detach: 'detach', tut_hint: 'lens',
};
/** Display priority (first = shown first / lowest on screen). */
export const TUT_ORDER: readonly TutId[] = [
  'tut_move', 'tut_phone', 'tut_setref', 'tut_view', 'tut_shutter', 'tut_overlay', 'tut_zoom', 'tut_burst', 'tut_flash',
  'tut_night', 'tut_show', 'tut_detach', 'tut_hint', 'tut_menu',
];
/** Bubbles with no action of their own fade after this many seconds ON SCREEN… */
export const TUT_LIFE: Partial<Readonly<Record<TutId, number>>> = { tut_hint: 8, tut_menu: 8 };
/** …or, P3r3, this many × their life after they first appeared, on screen or not: a bubble that was cut short by a
 *  dialogue or a beat does not come back minutes later (golden runs showed 「Esc 暂停」 from P1 to P5). */
export const TUT_LIFE_WALL = 3;
/** Pure: has a timed bubble had its time? `shown` = seconds on screen, `since` = sim seconds since it first showed. */
export function tutExpired(life: number, shown: number, since: number): boolean {
  return shown > life || since > life * TUT_LIFE_WALL;
}
export const MAX_TUTS = 2;

/** What the bubbles need to know about the moment. */
export interface TutView {
  /** gameplay / viewfinder / the phone modal; null = anything else (dialogue, cards, pause, peeks, cutscenes). */
  where: 'gameplay' | 'viewfinder' | 'phone' | null;
  /** The live interact prompt accepts 出示 (G). */
  showTarget: boolean;
  /** The live interact prompt's verb. */
  prompt: PromptVerb | null;
}

export function tutFits(id: TutId, v: TutView): boolean {
  switch (TUT_PLACE[id]) {
    case 'play': return v.where === 'gameplay';
    case 'vf': return v.where === 'viewfinder';
    case 'phone': return v.where === 'phone';
    case 'showable': return v.where === 'gameplay' && v.showTarget;
    case 'detach': return v.where === 'gameplay' && v.prompt === 'detach';
    case 'lens': return v.where === 'gameplay' || v.where === 'viewfinder';
  }
}

/** The bubbles on screen for a context: pending ones that fit, in TUT_ORDER, at most `max` (pure; unit-tested). */
export function visibleTuts(pending: readonly TutId[], v: TutView, max = MAX_TUTS): TutId[] {
  return TUT_ORDER.filter((id) => pending.includes(id) && tutFits(id, v)).slice(0, max);
}

/** tut_move completes once he has walked AND looked around a little (or clearly found his way anyway). */
export const MOVE_DONE = { walk: 4, look: 35, walkAlone: 20 } as const;
export class MoveCoach {
  walked = 0;
  looked = 0;
  /** Per tick: metres walked and degrees turned (jumps from teleports / cuts are ignored). */
  add(dist: number, turnDeg: number): void {
    if (dist > 0 && dist < 1) this.walked += dist;
    if (turnDeg > 0 && turnDeg < 45) this.looked += turnDeg;
  }
  get done(): boolean {
    return (this.walked >= MOVE_DONE.walk && this.looked >= MOVE_DONE.look) || this.walked >= MOVE_DONE.walkAlone;
  }
}

/** Bubbles that explain the phone UI: shown over the phone modal (I-play: tut_setref used to be hidden behind it). */
export const PHONE_TUTS: readonly TutId[] = TUT_IDS.filter((id) => TUT_PLACE[id] === 'phone');
export const overPhone = (cur: TutId | null, inPhone: boolean): boolean => inPhone && !!cur && PHONE_TUTS.includes(cur);

/** In the prologue, 「举起镜头」 is taught at the latest after this much free play (the smoke only shows in the lens). */
const VIEW_AFTER = 30;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function createTutorials(core: Core, host: HTMLElement, overHost: HTMLElement = host): Tutorials {
  const box = h('div', 'ui-tuts');
  const els = [0, 1].map((k) => h('div', 'ui-tut ui-slab ui-hidden', { testid: k === 0 ? 'tutorial' : 'tutorial-2' }));
  box.append(...els);
  host.append(box);
  const pend: TutId[] = [];
  const shownFor = new Map<TutId, number>();
  const firstShown = new Map<TutId, number>();
  let cur: TutId | null = null;
  const onScreen: (TutId | null)[] = [null, null];
  const seen = (id: TutId) => core.store.has(`seen:${id}`);
  const touch = touchCapable();
  const coach = new MoveCoach();
  const pos = core.player.pos();
  const last = { x: pos.x, y: pos.y, z: pos.z, yaw: NaN, pitch: NaN, ok: false };
  let playT = 0;

  const text = (id: TutId) => t(touch && has(`tut.touch.${id}`) ? `tut.touch.${id}` : `tut.${id}`);
  const paint = (k: number, id: TutId | null) => {
    const el = els[k];
    if (onScreen[k] === id) return;
    onScreen[k] = id;
    showEl(el, !!id);
    if (!id) { delete el.dataset.tut; return; }
    el.textContent = '';
    el.append(withKeycaps(text(id)));
    el.dataset.tut = id;
    stamp(el);
  };

  const api: Tutorials = {
    get current() { return cur; },
    pending: () => [...pend],
    trigger(id) {
      if (!TUT_IDS.includes(id) || seen(id) || pend.includes(id)) return;
      pend.push(id);
    },
    done(id) {
      const qi = pend.indexOf(id);
      if (qi >= 0) pend.splice(qi, 1);
      shownFor.delete(id);
      firstShown.delete(id);
      if (!seen(id)) core.store.set(`seen:${id}`);
    },
    update(view, dt = 0) {
      for (let i = pend.length - 1; i >= 0; i--) if (seen(pend[i])) pend.splice(i, 1);
      // tut_move: measured in plain gameplay only (beats and teleports move him too)
      core.player.pos(pos);
      const yaw = core.player.yawDeg(), pitch = core.cameraRig.pitchDeg;
      if (view.where === 'gameplay' && last.ok && pend.includes('tut_move')) {
        const d = Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z);
        coach.add(d, Math.abs(wrap180(yaw - last.yaw)) + Math.abs(pitch - last.pitch));
        if (coach.done) api.done('tut_move');
      }
      last.x = pos.x; last.y = pos.y; last.z = pos.z; last.yaw = yaw; last.pitch = pitch; last.ok = view.where === 'gameplay';
      // the prologue: teach raising the lens after a while even if he never opens the album
      if (view.where === 'gameplay' && !core.store.has('P1_done') && core.store.has('wx_tudi_added')) {
        playT += dt;
        if (playT >= VIEW_AFTER) api.trigger('tut_view');
      }
      const vis = visibleTuts(pend, view);
      const now = core.clock.t;
      for (const id of vis) {
        if (TUT_LIFE[id] === undefined) continue;
        shownFor.set(id, (shownFor.get(id) ?? 0) + dt);
        if (!firstShown.has(id)) firstShown.set(id, now);
      }
      for (const [id, t0] of [...firstShown]) {
        const life = TUT_LIFE[id];
        if (life !== undefined && tutExpired(life, shownFor.get(id) ?? 0, now - t0)) api.done(id);
      }
      const live = vis.filter((id) => !seen(id));
      cur = live[0] ?? null;
      const parent = view.where === 'phone' ? overHost : host;
      if (box.parentElement !== parent) parent.append(box);
      paint(0, live[0] ?? null);
      paint(1, live[1] ?? null);
    },
  };

  // ---- triggers and completions (GDD §11.14) ----
  const b = core.bus;
  const prologue = () => core.store.has('wx_tudi_added') && !core.store.has('P1_done');
  b.on('flagSet', (e) => {
    if (e.flag === 'wx_tudi_added' && !core.store.has('P1_done')) { api.trigger('tut_move'); api.trigger('tut_phone'); }
    else if (e.flag === 'granny_asked_photo') api.trigger('tut_burst');
    else if (e.flag === 'P3_done') api.done('tut_burst');      // P3r3 G8: the burst was for 王阿婆's blink — no nag in ch2
    else if (e.flag === 'P4_done') api.trigger('tut_night');
    else if (e.flag === 'meiqiu_talked') api.trigger('tut_detach');
    else if (e.flag === 'ch1_started') api.trigger('tut_menu');
    else if (e.flag === 'P1_done') {
      for (const id of ['tut_overlay', 'tut_view', 'tut_setref', 'tut_phone', 'tut_move'] as const) api.done(id);
    }
  });
  b.on('modal', (e) => {
    if (e.kind === 'phone') {
      api.done('tut_phone');
      if (!core.store.has('P1_done')) { api.trigger('tut_setref'); api.trigger('tut_view'); }
    }
  });
  b.on('refPhotoChanged', (e) => { if (e.id) { api.done('tut_setref'); if (!core.store.has('P1_done')) api.trigger('tut_view'); } });
  b.on('viewfinder', (e) => {
    if (!e.on) return;
    api.done('tut_view');
    api.trigger('tut_shutter');
    if (core.store.state.refPhotoId && !core.store.has('P1_done')) api.trigger('tut_overlay');
  });
  let lastZoom = 1;
  b.on('lensChanged', (e) => {
    if (e.zoom !== lastZoom) { api.done('tut_zoom'); lastZoom = e.zoom; }
    if (e.night) api.done('tut_night');
    if (e.flash) api.done('tut_flash');
  });
  b.on('lensHint', (e) => {
    if (e.cond === 'zoom') api.trigger('tut_zoom');
    else if (e.cond === 'flash' || e.cond === 'dark') api.trigger('tut_flash');
  });
  b.on('shutter', (e) => { api.done('tut_shutter'); if (e.burst) api.done('tut_burst'); });
  b.on('photoTaken', (e) => { if (!e.photo.preset && e.result.frame === 'green' && e.result.tags.length) api.trigger('tut_show'); });
  b.on('show', () => api.done('tut_show'));
  b.on('peek', (e) => { if (e.id) api.done('tut_detach'); });
  b.on('paused', (e) => { if (e.on) api.done('tut_menu'); });
  b.on('stateLoaded', () => {
    pend.length = 0; cur = null; shownFor.clear(); firstShown.clear(); playT = 0; last.ok = false;
    coach.walked = 0; coach.looked = 0;
    // a prologue save / reload: the first-minute bubbles that are still to do come back
    if (prologue()) {
      api.trigger('tut_move'); api.trigger('tut_phone');
      if (core.store.state.refPhotoId) api.trigger('tut_view');
    }
  });
  return api;
}
