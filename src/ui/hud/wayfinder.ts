// src/ui/hud/wayfinder.ts — P3 wayfinding (owner: implementer 'wayfinding'; wired by src/ui/index.ts). A small incense
// badge with an ink arrow at the screen edge in third-person play: it points along the same walkable route as 土地's
// smoke (StoryApi.smokeStep), so the player can orient on the tiny planet without opening the viewfinder. It fades
// out while the next stretch of the route is comfortably on screen, and near the target.
import { Vector3 } from 'three';
import type { SmokeStep } from '../../contracts';
import { SURFACES, flatToWorld } from '../../core/planet';
import { alongRoute } from '../../story/route';
import { plan } from '../../world/layout';
import { rectPoint } from '../../world/geo';
import { t } from '../../data/zh';
import type { UiCtx } from '../ctx';
import { h, stamp } from '../dom';
import './wayfinder.css';

/** Metres along the route the arrow aims at (the next stretch, not the far target round the planet). */
export const WAY_LOOK_AHEAD = 7;
/** Hide within this many metres (walked route length) of the target. */
export const WAY_NEAR = 3.5;
/** NDC box inside which the look-ahead point counts as "on screen" (the arrow fades out). */
export const WAY_ONSCREEN = 0.7;
export const WAY_OPACITY = 0.9;
/** P3r3 U2: while the next stretch is on screen the badge stays, dimmed, on the edge it points to (usually the top):
 *  a player walking the right way used to get no cue at all. */
export const WAY_AHEAD_OPACITY = 0.5;
/** P3r3 U2: the first time the badge shows, a bubble beside it says what it is (this many seconds on screen). */
export const WAY_INTRO_LIFE = 7;
export const WAY_INTRO_FLAG = 'seen:ui_way_intro' as const;

/** Screen insets of the badge centre (px) for a UI scale `u`: close to the edges, so it reads as HUD and never as a
 *  prop in the playfield (the old 94 px bottom inset put it beside the hero's feet). Pure. */
export function wayInsets(u: number): Insets {
  return { l: 44 * u + 24, r: 44 * u + 24, t: 96 * u + 28, b: 36 * u + 22 };
}

/** Which edge an edge point sits on (the label / intro bubble go on the opposite, inner side). Pure. */
export function wayEdge(p: { x: number; y: number }, w: number, hh: number, i: Insets): 'l' | 'r' | 't' | 'b' {
  if (p.x <= i.l + 0.5) return 'l';
  if (p.x >= w - i.r - 0.5) return 'r';
  return p.y < hh / 2 ? 't' : 'b';
}

/** 「烟 · 23m」: whole metres of walked route left. Pure. */
export function wayMetres(len: number): number {
  return Math.max(1, Math.round(len));
}

export interface Insets { l: number; r: number; t: number; b: number }

/** Where a bearing θ (radians, 0 = straight ahead = up on screen, clockwise positive) meets the inset screen edge. */
export function edgePoint(theta: number, w: number, hh: number, i: Insets): { x: number; y: number } {
  const cx = w / 2, cy = hh / 2, dx = Math.sin(theta), dy = -Math.cos(theta);
  let k = Infinity;
  if (dx > 1e-6) k = Math.min(k, (w - i.r - cx) / dx);
  if (dx < -1e-6) k = Math.min(k, (i.l - cx) / dx);
  if (dy > 1e-6) k = Math.min(k, (hh - i.b - cy) / dy);
  if (dy < -1e-6) k = Math.min(k, (i.t - cy) / dy);
  if (!Number.isFinite(k)) k = 0;
  return { x: cx + dx * k, y: cy + dy * k };
}

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Keep-out box around the hero on screen: his projected head-to-feet span, 0.45 × that span either side. */
export function heroScreenBox(xc: number, yTop: number, yFeet: number): Box {
  const hh = yFeet - yTop;
  return { x0: xc - hh * 0.45, y0: yTop - hh * 0.05, x1: xc + hh * 0.45, y1: yFeet + hh * 0.08 };
}

/** Slide an edge point along its edge (vertically on the side edges, horizontally on the top/bottom) out of the HUD
 *  boxes it would cover (tutorial bubbles, the objective chip, the phone status), keeping it inside [lo, hi]. */
export function avoidBoxes(p: { x: number; y: number }, vertical: boolean, lo: number, hi: number, boxes: readonly Box[], pad: number): { x: number; y: number } {
  const hit = (x: number, y: number) => boxes.some((b) => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad);
  if (!hit(p.x, p.y)) return p;
  for (let d = 8; d < 2000; d += 8) {
    for (const sgn of [-1, 1]) {
      const v = (vertical ? p.y : p.x) + sgn * d;
      if (v < lo || v > hi) continue;
      const q = vertical ? { x: p.x, y: v } : { x: v, y: p.y };
      if (!hit(q.x, q.y)) return q;
    }
  }
  return p;
}

/** Does point p (± pad) fall inside any of the boxes? */
export function hitsBox(p: { x: number; y: number }, boxes: readonly Box[], pad: number): boolean {
  return boxes.some((b) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - pad && p.y < b.y1 + pad);
}

/** P3r3: place the badge clear of the HUD (`hard`: chips, bubbles, prompts, buttons, the hero — always, as before)
 *  and, where it can, of what the player reads in the world (`soft`: shop signs, the store / studio boards). A soft
 *  box only moves it within `maxSoft` px of its ideal point along the edge (further, the badge would misstate the
 *  direction), and never onto a hard box. */
export function placeBadge(p: { x: number; y: number }, vertical: boolean, lo: number, hi: number, hard: readonly Box[], soft: readonly Box[], pad: number, maxSoft: number): { x: number; y: number } {
  if (soft.length && hitsBox(p, soft, pad)) {
    const q = avoidBoxes(p, vertical, lo, hi, [...hard, ...soft], pad);
    if (Math.hypot(q.x - p.x, q.y - p.y) <= maxSoft && !hitsBox(q, hard, pad) && !hitsBox(q, soft, pad)) return q;
  }
  return avoidBoxes(p, vertical, lo, hi, hard, pad);
}

/** Target opacity: visible only when the next stretch is off screen (or behind) and the target is not close. */
export function wayOpacity(o: { onScreen: boolean; remaining: number; allowed: boolean }): number {
  if (!o.allowed || o.remaining < WAY_NEAR) return 0;
  return o.onScreen ? WAY_AHEAD_OPACITY : WAY_OPACITY;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(viewBox: string, inner: string): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.innerHTML = inner;
  return s;
}

export interface Wayfinder { update(allowed: boolean): void; el: HTMLElement }

export function createWayfinder(ctx: UiCtx): Wayfinder {
  const { core, layers } = ctx;
  const el = h('div', 'ui-way', { testid: 'way-arrow' });
  // incense stick in a tiny burner, with a curl of smoke (upright), and the ink arrow that orbits the badge
  const badge = h('div', 'ui-way-badge');
  badge.append(svg('0 0 28 28',
    '<path class="ui-way-ink ui-way-smoke" d="M14 14 C11 11 17 9 14 6 C12 4 15 3 14 1.5" fill="none" stroke="#2f3a3f" stroke-width="1.8" stroke-linecap="round"/>'
    + '<line class="ui-way-ink" x1="14" y1="14" x2="14" y2="21" stroke="#2f3a3f" stroke-width="2" stroke-linecap="round"/>'
    + '<circle class="ui-way-ember" cx="14" cy="14" r="1.8" fill="#c8433a"/>'
    + '<path class="ui-way-ink" d="M8.5 21 H19.5 L18 24.5 H10 Z" fill="none" stroke="#2f3a3f" stroke-width="1.8" stroke-linejoin="round"/>'));
  const arrow = h('div', 'ui-way-arrow');
  arrow.append(svg('0 0 22 16',
    '<path d="M11 1 L21 13 L11 9.5 L1 13 Z" fill="#2f3a3f" stroke="#f8f8f6" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/>'));
  // P3r3 U2: what the badge is and how far: 「烟 · 23m」 on its inner side, and once a bubble introducing it
  const label = h('div', 'ui-way-label ui-slab', { testid: 'way-label' });
  const tip = h('div', 'ui-way-tip ui-slab', { testid: 'way-intro', text: t('ui.way.intro') });
  el.append(badge, arrow, label, tip);
  layers.hud.append(el);
  let metres = -1, edge = '', introT = 0, tipOn = false;
  const setTip = (on: boolean) => {
    if (on === tipOn) return;
    tipOn = on;
    el.classList.toggle('ui-way-intro', on);
    if (on) stamp(tip);
  };

  const cam = new Vector3(), fwd = new Vector3(), right = new Vector3(), up = new Vector3(), feet = new Vector3();
  const look = new Vector3(), d = new Vector3(), d2 = new Vector3(), ndc = new Vector3(), camDir = new Vector3();
  let op = 0, lastT = -1, frame = 0, step: SmokeStep | null = null, night = false;
  let lastX = NaN, lastY = NaN, lastRot = NaN, lastOp = NaN;
  let boxes: Box[] | null = null;
  const hp = new Vector3(), hq = new Vector3();
  let signs: Box[] = [];
  // P3r3: world-space sign panels (shop boards along the rows + the store / studio boards), built once (pure layout)
  let panels: { c: Vector3; pts: Vector3[]; n: Vector3 | null }[] | null = null;
  const signPanels = () => {
    if (panels) return panels;
    panels = [];
    const S = SURFACES.planet;
    try {
      for (const b of plan().bldgs) {
        if (b.far || !b.signKey) continue;
        // the board band of world/kit/building.ts (arcade: above the arcade, else over the shop front), whole width
        const l = rectPoint(b.rect, -b.rect.hw, b.rect.hd), r = rectPoint(b.rect, b.rect.hw, b.rect.hd);
        const h0 = b.base + (b.arcade > 0 ? b.fh + 0.15 : b.fh - 1.05), h1 = h0 + 0.95;
        const pts = [flatToWorld(S, { ...l, h: h0 }), flatToWorld(S, { ...r, h: h0 }), flatToWorld(S, { ...l, h: h1 }), flatToWorld(S, { ...r, h: h1 })];
        const back = rectPoint(b.rect, 0, 0), front = rectPoint(b.rect, 0, b.rect.hd);
        const n = flatToWorld(S, { ...front, h: h0 }).sub(flatToWorld(S, { ...back, h: h0 })).normalize();
        panels.push({ c: pts[0].clone().add(pts[3]).multiplyScalar(0.5), pts, n });
      }
    } catch { /* no layout */ }
    for (const id of ['lm:store', 'lm:studio'] as const) {
      try {
        const a = core.services.world.anchor(id);
        if (!a || a.scene !== 'planet') continue;
        const upv = a.pos.clone().normalize(), rad = (a.radius ?? 2.5) * 0.8;
        const side = new Vector3(0, 1, 0).cross(upv).normalize().multiplyScalar(rad);
        const ext = side.lengthSq() > 0 ? side : new Vector3(rad, 0, 0);
        const lo = a.pos.clone().addScaledVector(upv, -0.9), hi = a.pos.clone().addScaledVector(upv, 0.9);
        const pts = [lo.clone().sub(ext), lo.clone().add(ext), hi.clone().sub(ext), hi.clone().add(ext)];
        // the board faces the street: also span the perpendicular direction so any view angle is covered
        const ext2 = upv.clone().cross(ext);
        pts.push(lo.clone().sub(ext2), lo.clone().add(ext2), hi.clone().sub(ext2), hi.clone().add(ext2));
        panels.push({ c: a.pos.clone(), pts, n: null });
      } catch { /* no anchor */ }
    }
    return panels;
  };
  const sp = new Vector3(), sv = new Vector3();
  /** Screen boxes of the sign panels within 35 m in front of the camera (third person, planet only). */
  const signBoxes = (): Box[] => {
    const out: Box[] = [];
    if (core.player.scene !== 'planet') return out;
    const camera = core.cameraRig.camera;
    camera.getWorldPosition(cam); camera.getWorldDirection(camDir);
    const W = innerWidth, H = innerHeight;
    for (const pn of signPanels()) {
      if (pn.c.distanceTo(cam) > 35) continue;
      if (pn.n && sv.copy(cam).sub(pn.c).dot(pn.n) <= 0) continue;          // seen from behind: the board faces away
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
      for (const q of pn.pts) {
        if (sv.copy(q).sub(cam).dot(camDir) < 0.2) { ok = false; break; }
        sp.copy(q).project(camera);
        const x = (sp.x + 1) * W / 2, y = (1 - sp.y) * H / 2;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (!ok || x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      out.push({ x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W, x1), y1: Math.min(H, y1) });
    }
    return out;
  };
  /** Visible HUD boxes the badge must not cover: tutorial bubbles, the objective chip / phone status, toasts, the
   *  world prompt (「按 E 调查」), each touch button, and the hero himself (P3r2 U3). */
  const hudBoxes = (): Box[] => {
    const out: Box[] = [];
    const add = (e: Element) => {
      if (e.classList.contains('ui-hidden')) return;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    };
    for (const c of Array.from(layers.tut.children)) add(c);
    for (const c of Array.from(layers.toast.children)) for (const t of Array.from(c.children)) add(t);
    for (const c of Array.from(layers.world.children)) if ((c as HTMLElement).style.visibility !== 'hidden') add(c);
    for (const c of Array.from(layers.hud.children)) {
      if (c === el || c.classList.contains('ui-hidden')) continue;
      // the touch layer covers the whole screen (inset 0): only its buttons / stick count, or nothing would be free
      if (c.classList.contains('ui-touch')) { for (const b of Array.from(c.querySelectorAll('.ui-tbtn, .ui-stick'))) add(b); continue; }
      add(c);
    }
    const hb = heroBox();
    if (hb) out.push(hb);
    return out;
  };
  /** The hero's screen box (feet to the top of the phone head), from the third-person camera; null when off screen. */
  const heroBox = (): Box | null => {
    try {
      const camera = core.cameraRig.camera;
      core.player.pos(hp);
      core.player.up(up);
      hq.copy(hp).addScaledVector(up, 1.9);
      hp.project(camera); hq.project(camera);
      if (hp.z > 1 || hq.z > 1) return null;
      const W = innerWidth, H = innerHeight;
      const yFeet = (1 - hp.y) * H / 2, yHead = (1 - hq.y) * H / 2, xc = (hp.x + hq.x + 2) * W / 4;
      const hh = Math.abs(yFeet - yHead);
      if (!(hh > 4)) return null;
      return heroScreenBox(xc, Math.min(yFeet, yHead), Math.max(yFeet, yHead));
    } catch { return null; }
  };

  const apply = (x: number, y: number, rot: number) => {
    const o = Math.round(op * 100) / 100;
    if (o !== lastOp) { el.style.opacity = String(o); el.style.visibility = o > 0.01 ? 'visible' : 'hidden'; lastOp = o; }
    if (o <= 0.01) return;
    const rx = Math.round(x), ry = Math.round(y), rr = Math.round(rot);
    if (rx !== lastX || ry !== lastY) { el.style.transform = `translate(${rx}px, ${ry}px)`; lastX = rx; lastY = ry; }
    if (rr !== lastRot) {
      // the arrow sits on the badge rim, on the side it points to
      arrow.style.transform = `rotate(${rr}deg) translateY(calc(-36 * var(--px)))`;
      lastRot = rr;
    }
  };

  return {
    el,
    update(allowed) {
      const now = core.clock.t, dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, now - lastT));
      lastT = now;
      if (allowed && (frame++ % 3 === 0 || !step)) {
        try { step = core.services.story.smokeStep?.() ?? null; } catch { step = null; }
        const n = core.store.state.phase === 'night';
        if (n !== night) { night = n; el.classList.toggle('ui-way-night', n); }
      }
      let target = 0, x = lastX, y = lastY, rot = lastRot, len = -1;
      const scene = core.player.scene;
      if (allowed && step && step.scene === scene && step.route.length >= 2) {
        const s = SURFACES[scene];
        const a = alongRoute(step.route, WAY_LOOK_AHEAD), p = a.p;
        len = a.len;
        flatToWorld(s, { x: p.x, z: p.z, h: p.h + 1.0 }, look);
        const camera = core.cameraRig.camera;
        camera.getWorldPosition(cam);
        camera.getWorldDirection(camDir);
        fwd.copy(camDir);
        core.player.up(up);
        core.player.pos(feet);
        // bearing on the player's tangent plane, relative to the camera's heading
        d.copy(look).sub(feet); d.addScaledVector(up, -d.dot(up));
        fwd.addScaledVector(up, -fwd.dot(up));
        if (fwd.lengthSq() < 1e-8) core.player.heading(fwd);
        fwd.normalize();
        right.crossVectors(fwd, up).normalize();
        const theta = Math.atan2(d.dot(right), d.dot(fwd));
        ndc.copy(look).project(camera);
        const inFront = d2.copy(look).sub(cam).dot(camDir) > 0;
        const onScreen = inFront && Math.abs(ndc.x) < WAY_ONSCREEN && Math.abs(ndc.y) < WAY_ONSCREEN;
        target = wayOpacity({ onScreen, remaining: len, allowed });
        const W = innerWidth, H = innerHeight, u = Math.min(W / 1280, H / 720);
        const ins = wayInsets(u);
        let e = edgePoint(theta, W, H, ins);
        if (frame % 10 === 1 || !boxes) { boxes = hudBoxes(); signs = signBoxes(); }
        const side = e.x <= ins.l + 0.5 || e.x >= W - ins.r - 0.5;
        const lo = side ? ins.t : ins.l, hi = side ? H - ins.b : W - ins.r;
        const ideal = e;
        e = placeBadge(e, side, lo, hi, boxes, signs, 30 * u, (hi - lo) * 0.3);
        // probes (smoke / scratch runs): how many sign boxes were live, and whether one of them moved the badge
        const dodged = signs.length > 0 && hitsBox(ideal, signs, 30 * u) && !hitsBox(e, signs, 30 * u) ? '1' : '0';
        if (el.dataset.dodged !== dodged) el.dataset.dodged = dodged;
        if (dodged === '1') el.dataset.ideal = `${Math.round(ideal.x)},${Math.round(ideal.y)}`;
        x = e.x; y = e.y; rot = (theta * 180) / Math.PI;
        // on the top / bottom edge the label goes beside the badge, toward the screen centre (never into the playfield)
        const e0 = wayEdge(e, W, H, ins);
        const ed = e0 + (e0 === 't' || e0 === 'b' ? (e.x < W / 2 ? ' ui-way-hr' : ' ui-way-hl') : '');
        if (ed !== edge) {
          const cls = (x: string) => x.split(' ').map((c, i) => (i === 0 ? `ui-way-e${c}` : c));
          if (edge) el.classList.remove(...cls(edge));
          el.classList.add(...cls(ed)); edge = ed;
        }
        // the intro bubble must stay on screen when it sits above / below a badge near a corner
        if (tipOn && (ed[0] === 't' || ed[0] === 'b')) {
          const tw = tip.offsetWidth, m = 12 * u;
          const shift = Math.max(m + tw / 2 - x, Math.min(W - m - tw / 2 - x, 0));
          tip.style.setProperty('--tip-dx', `${Math.round(shift)}px`);
        } else if (tipOn) tip.style.setProperty('--tip-dx', '0px');
      }
      const mm = len >= 0 ? wayMetres(len) : metres;
      if (mm !== metres && mm > 0) { metres = mm; label.textContent = t('ui.way.dist', { m: mm }); }
      // the intro: counts only while the badge is on screen, once per save (flag)
      // (it waits while a tutorial bubble is up: both sit low on the screen, and the bubbles teach first)
      const intro = allowed && target > 0 && op > 0.3 && !core.store.has(WAY_INTRO_FLAG) && !layers.tut.querySelector('.ui-tut:not(.ui-hidden)');
      if (intro) {
        introT += dt;
        if (introT >= WAY_INTRO_LIFE) { core.store.set(WAY_INTRO_FLAG); setTip(false); } else setTip(true);
      } else setTip(false);
      op += (target - op) * (ctx.test ? 1 : Math.min(1, dt * 6));
      if (op < 0.01 && target === 0) op = 0;
      apply(x, y, rot);
    },
  };
}
