// src/lens/evalShot.ts — owner D. The single GDD §3.4 judge: frame colour, recognition bar, shutter result and
// __game.evalShot() all call evalShot(). Pure: no three.js, no DOM; the caller measures the scene (ShotView).
import { SHOT_ORDER } from '../types';
import type {
  FlagId, PeekId, Phase, PhotoTarget, SceneId, ShotCond, ShotResult, StrKey, TargetId, Zoom,
} from '../types';

// ---------------------------------------------------------------------------------------------- defaults (GDD §8.1)
export const DEFAULTS = { zoom: [1, 3, 10] as readonly Zoom[], maxDist: 30, minFrac: 0.04, frameArea: 0.92 } as const;
/** Candidate window: anchor NDC |x|,|y| ≤ 0.92 and in front (GDD §3.4). */
export const CANDIDATE_NDC = 0.92;
/** `whole` points must fall inside NDC 0.9. */
export const WHOLE_NDC = 0.9;
/** More than this many of the 5 occlusion rays blocked = occluded. */
export const OCCLUDED_MAX = 2;
/** Fully evaluated candidates per call (ARCHITECTURE §5.1). */
export const MAX_FULL = 3;

export interface NdcPoint { x: number; y: number; front: boolean }
/** Cheap per-target projection (every available target, every frame). */
export interface Projection { anchor: NdcPoint; dist: number }
/** Full measurement (≤ MAX_FULL candidates per frame). */
export interface TargetView extends Projection {
  /** projected radius ÷ half screen height */
  frac: number;
  whole?: readonly NdcPoint[];
  /** angle between the object's facing and the direction to the lens (deg); null = unknown (passes) */
  facingDeg?: number | null;
  /** rays blocked out of the 5 occlusion rays (anchor + 4 bound points) */
  blocked: number;
  /** viewpoint errors against `viewpoint.spot` */
  vp?: { ePos: number; eYaw: number; ePitch: number; cone: number | null; dYaw?: number; dPitch?: number } | null;
  /** per mustBeHidden spot: true = hidden (occluded or out of frame) */
  hidden?: readonly boolean[];
  /** per mustContain target */
  contain?: readonly { id: TargetId; point: NdcPoint | null; occluded: boolean }[];
}
export interface ShotView {
  project(t: PhotoTarget): Projection | null;
  measure(t: PhotoTarget): TargetView | null;
}
export type TextFn = (key: StrKey, vars?: Readonly<Record<string, string | number>>) => string;

export interface ShotCtx {
  zoom: Zoom; night: boolean; flash: boolean; torch: boolean; overlay: boolean;
  peek: PeekId | null; scene: SceneId; phase: Phase;
  /** The 'night' verb is unlocked (P4). false → the `layer` hint must not tell the player to press N (it does nothing
   *  yet); omitted = unlocked. */
  nightVerb?: boolean;
  has(f: FlagId): boolean;
  /** Preset id (or photo id) of the album photo set as reference. */
  refPhoto: string | null;
  /** Exposure in progress and the lens moved (> 1.5°) or the body moved. */
  moved: boolean;
  /** Targets of the currently active puzzles (priority 1). */
  active: ReadonlySet<TargetId>;
  text: TextFn;
  /** {vars} for a target's label strings (eyes, face, eye). */
  vars?(t: PhotoTarget): Readonly<Record<string, string | number>> | undefined;
  /** granny_blink: eyes closed right now. */
  eyesClosed?(t: PhotoTarget): boolean;
  /** White frame: scenery / landmark / sky label under the crosshair. */
  fallback(): { label: string; confidence: number | null };
}

export interface CondCheck { cond: ShotCond; ok: boolean }
export interface Evaluation {
  target: PhotoTarget; view: TargetView; checks: CondCheck[]; failed: ShotCond | null; q: number;
}

// ---------------------------------------------------------------------------------------------- helpers
const inBox = (p: NdcPoint, lim: number): boolean => p.front && Math.abs(p.x) <= lim && Math.abs(p.y) <= lim;
export const zoomsOf = (t: PhotoTarget): readonly Zoom[] => t.zoom ?? DEFAULTS.zoom;
export const needsNightOf = (t: PhotoTarget): boolean => t.layer === 'ghost' || !!t.needsNight;

/** Phase / flag / scene / peek filter (GDD §3.4 "当前可用的目标"). Landmarks never compete for the frame. */
export function isAvailable(t: PhotoTarget, c: Pick<ShotCtx, 'phase' | 'has' | 'scene' | 'peek'>): boolean {
  if (t.kind === 'landmark') return false;
  if ((t.scene ?? 'planet') !== c.scene) return false;
  if (t.onlyFrom && t.onlyFrom !== c.peek) return false;
  if (t.phases && !t.phases.includes(c.phase)) return false;
  if (t.requires && !t.requires.every((f) => c.has(f))) return false;
  if (t.excludes && t.excludes.some((f) => c.has(f))) return false;
  return true;
}

/** Candidate order: active puzzle first, then nearest the frame centre, then id (GDD §3.4). Within a tier a target
 *  inside its maxDist goes before one that is only there to say 「太远了」 (the far P6 trail plane vs 纸妹 at 3 m). */
export function candidateOrder(active: ReadonlySet<TargetId>) {
  const far = (x: { t: PhotoTarget; p: Projection }) => (x.p.dist > (x.t.maxDist ?? DEFAULTS.maxDist) ? 1 : 0);
  return (a: { t: PhotoTarget; p: Projection }, b: { t: PhotoTarget; p: Projection }): number => {
    const aa = active.has(a.t.id) ? 0 : 1, bb = active.has(b.t.id) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    const fa = far(a), fb = far(b);
    if (fa !== fb) return fa - fb;
    const da = Math.hypot(a.p.anchor.x, a.p.anchor.y), db = Math.hypot(b.p.anchor.x, b.p.anchor.y);
    if (Math.abs(da - db) > 1e-9) return da - db;
    return a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0;
  };
}

/** Tier label key: the highest `labels` zoom ≤ current, else the lowest tier (GDD §3.5). */
export function tierKey(t: PhotoTarget, zoom: Zoom): StrKey | null {
  let best: { zoom: Zoom; key: StrKey } | null = null, low: { zoom: Zoom; key: StrKey } | null = null;
  for (const l of t.labels) {
    if (l.zoom <= zoom && (!best || l.zoom > best.zoom)) best = l;
    if (!low || l.zoom < low.zoom) low = l;
  }
  return (best ?? low)?.key ?? null;
}

/** Deterministic success confidence: okConfidence ?? 90 + floor(9q), q = 1 − max(|x|,|y|)/0.92. */
export function okConfidence(t: PhotoTarget, anchor: NdcPoint): number {
  if (t.okConfidence !== undefined) return t.okConfidence;
  const q = Math.min(1, Math.max(0, 1 - Math.max(Math.abs(anchor.x), Math.abs(anchor.y)) / CANDIDATE_NDC));
  return 90 + Math.floor(9 * q);
}
/** Failing confidence: 30 + floor(50·satisfied/applicable). */
export function failConfidence(satisfied: number, applicable: number): number {
  return 30 + Math.floor((50 * satisfied) / Math.max(1, applicable));
}

/** Default fail hint for a zoom miss: the allowed zoom nearest to the current one. */
export function zoomHintKey(allowed: readonly Zoom[], cur: Zoom): StrKey {
  let best = allowed[0] ?? 1;
  for (const z of allowed) if (Math.abs(Math.log(z / cur)) < Math.abs(Math.log(best / cur))) best = z;
  return `fail.zoom.${best}`;
}

/** Evaluate every applicable condition in SHOT_ORDER (all of them, for the confidence formula). */
export function checkTarget(t: PhotoTarget, v: TargetView, c: ShotCtx): CondCheck[] {
  const out: CondCheck[] = [];
  const add = (cond: ShotCond, ok: boolean): void => { out.push({ cond, ok }); };   // ≤ 3 targets per frame
  const frameArea = t.frameArea ?? DEFAULTS.frameArea;
  for (const cond of SHOT_ORDER) {
    switch (cond) {
      case 'layer': if (needsNightOf(t)) add(cond, c.night); break;
      case 'zoom': add(cond, zoomsOf(t).includes(c.zoom)); break;
      case 'dist': add(cond, v.dist <= (t.maxDist ?? DEFAULTS.maxDist) && v.dist >= (t.minDist ?? 0)); break;
      case 'size': add(cond, v.frac >= (t.minFrac ?? DEFAULTS.minFrac)); break;
      case 'center': add(cond, inBox(v.anchor, frameArea)); break;
      case 'whole': if (t.whole) add(cond, !!v.whole && v.whole.length > 0 && v.whole.every((p) => inBox(p, WHOLE_NDC))); break;
      case 'facing': if (t.facing) add(cond, v.facingDeg === null || v.facingDeg === undefined || v.facingDeg <= t.facing.maxAngle); break;
      case 'dark': if (t.needsLight) add(cond, c.flash || c.torch); break;
      case 'occluded': add(cond, v.blocked <= OCCLUDED_MAX); break;
      case 'flash': if (t.flash) add(cond, t.flash === 'required' ? c.flash : !c.flash); break;
      case 'viewpoint': if (t.viewpoint) add(cond, viewpointOk(t, v)); break;
      case 'overlay': if (t.kind === 'rephoto') add(cond, c.overlay && refMatches(t, c.refPhoto)); break;
      case 'hidden': if (t.mustBeHidden?.length) add(cond, !!v.hidden && v.hidden.length > 0 && v.hidden.every(Boolean)); break;
      case 'contain': if (t.mustContain?.length) add(cond, containOk(t, v)); break;
      case 'still': if (t.still) add(cond, !c.moved); break;
    }
  }
  return out;
}

function viewpointOk(t: PhotoTarget, v: TargetView): boolean {
  return viewpointMiss(t, v) === null;
}
/** P3r3 G2: which part of the viewpoint is off, in the order the player should fix it (stand there, then turn, then
 *  tilt). `pos` / `cone` = somewhere else; `left` / `right` = turn that way; `up` / `down` = tilt the lens that way. */
export type ViewpointMiss = 'pos' | 'cone' | 'left' | 'right' | 'up' | 'down';
export function viewpointMiss(t: PhotoTarget, v: TargetView): ViewpointMiss | null {
  const vp = t.viewpoint;
  if (!vp) return null;
  const e = v.vp;
  if (!e) return 'pos';
  if (e.ePos > vp.posTol) return 'pos';
  if (vp.coneDeg !== undefined && (e.cone === null || e.cone > vp.coneDeg)) return 'cone';
  // dYaw / dPitch = lens − reference (yaw clockwise, pitch up); unknown sign → the target's own position hint
  if (vp.yawTol !== undefined && e.eYaw > vp.yawTol) return e.dYaw === undefined ? 'pos' : e.dYaw > 0 ? 'left' : 'right';
  if (vp.pitchTol !== undefined && e.ePitch > vp.pitchTol) return e.dPitch === undefined ? 'pos' : e.dPitch > 0 ? 'down' : 'up';
  return null;
}
function refMatches(t: PhotoTarget, ref: string | null): boolean {
  return ref !== null && (t.refPhoto === undefined || ref === t.refPhoto);
}
function containOk(t: PhotoTarget, v: TargetView): boolean {
  const lim = t.frameArea ?? DEFAULTS.frameArea;
  const need = t.mustContain ?? [];
  return need.every((id) => {
    const c = v.contain?.find((x) => x.id === id);
    return !!c && !!c.point && inBox(c.point, lim) && !c.occluded;
  });
}
/** The first contained target that fails (for 「还缺：{name}」). */
export function missingContain(t: PhotoTarget, v: TargetView): TargetId | null {
  const lim = t.frameArea ?? DEFAULTS.frameArea;
  for (const id of t.mustContain ?? []) {
    const c = v.contain?.find((x) => x.id === id);
    if (!c || !c.point || !inBox(c.point, lim) || c.occluded) return id;
  }
  return null;
}

/** GDD §3.8: clamp(round(100 − 10·r), 0, 100), r = max(ePos/tolPos, eYaw/tolYaw, ePitch/tolPitch); wrong zoom caps
 *  at 60. P3r3 G2: while one ratio is over its tolerance (score < 90), the other two add 0.3·min(1, ratio) each, so
 *  walking or turning still moves the number when the tilt is what is wrong (it used to sit at exactly 82 %). */
export function rephotoScore(
  e: { ePos: number; eYaw: number; ePitch: number },
  tol: { pos: number; yaw?: number; pitch?: number }, zoomOk: boolean,
): number {
  const rs = [e.ePos / tol.pos, tol.yaw ? e.eYaw / tol.yaw : 0, tol.pitch ? e.ePitch / tol.pitch : 0];
  const max = Math.max(rs[0], rs[1], rs[2]);
  let r = max;
  if (max > 1) {
    let rest = 0, skipped = false;
    for (const x of rs) { if (!skipped && x === max) { skipped = true; continue; } rest += Math.min(1, x); }
    r += 0.3 * rest;
  }
  const s = Math.max(0, Math.min(100, Math.round(100 - 10 * r)));
  return zoomOk ? s : Math.min(s, 60);
}

/** Hint text for a failed condition: the target's override, else the GDD §3.4 default. */
export function hintFor(t: PhotoTarget, cond: ShotCond, v: TargetView, c: ShotCtx): string {
  if (cond === 'viewpoint') {
    const m = viewpointMiss(t, v);
    if (m && m !== 'pos' && m !== 'cone') return c.text(`fail.viewpoint.${m}`);
  }
  const own = t.failKeys?.[cond];
  if (own) return c.text(own);
  switch (cond) {
    case 'zoom': return c.text(zoomHintKey(zoomsOf(t), c.zoom));
    case 'dist': return c.text(v.dist > (t.maxDist ?? DEFAULTS.maxDist) ? 'fail.dist.far' : 'fail.dist.near');
    case 'flash': return c.text(t.flash === 'required' ? 'fail.flash.required' : 'fail.flash.forbidden');
    case 'layer': return c.text(c.nightVerb === false ? 'fail.layer.locked' : 'fail.layer');
    case 'contain': {
      const id = missingContain(t, v);
      return c.text('fail.contain', { name: id ? c.text(`lbl.${id}.name`) : '' });
    }
    default: return c.text(`fail.${cond}`);
  }
}

type Cand = { t: PhotoTarget; p: Projection };
const CANDS: Cand[] = [];
const POOL: Cand[] = [];
const ORDERS = new WeakMap<ReadonlySet<TargetId>, (a: Cand, b: Cand) => number>();

const BY_ID = new WeakMap<readonly PhotoTarget[], Map<TargetId, PhotoTarget>>();
/** P3r3 G6: `yieldsTo` target present and available right now. */
function yielded(id: TargetId, targets: readonly PhotoTarget[], c: ShotCtx): boolean {
  let m = BY_ID.get(targets);
  if (!m) { m = new Map(targets.map((x) => [x.id, x])); BY_ID.set(targets, m); }
  const o = m.get(id);
  return !!o && isAvailable(o, c);
}

/** Pick the candidate (GDD §3.4 priority) and evaluate it. Returns null when the frame has no candidate. */
export function evaluate(view: ShotView, targets: readonly PhotoTarget[], c: ShotCtx): Evaluation | null {
  // pooled candidate entries + a comparator cached per active-puzzle set (ARCHITECTURE §5.1: no per-frame closures)
  const cands = CANDS;
  cands.length = 0;
  for (const t of targets) {
    if (!isAvailable(t, c)) continue;
    if (t.yieldsTo && yielded(t.yieldsTo, targets, c)) continue;
    const p = view.project(t);
    if (!p || !inBox(p.anchor, CANDIDATE_NDC)) continue;
    const e = POOL[cands.length] ?? (POOL[cands.length] = { t, p });
    e.t = t; e.p = p;
    cands.push(e);
  }
  if (cands.length === 0) return null;
  let order = ORDERS.get(c.active);
  if (!order) { order = candidateOrder(c.active); ORDERS.set(c.active, order); }
  cands.sort(order);
  // The top MAX_FULL candidates are measured in priority order (ARCHITECTURE §5.1). Within the top candidate's tier
  // (active puzzle / not) a passing one wins — the most demanding one (most applicable conditions) when several pass,
  // e.g. T_zhimei_sea over T_zhimei on the same head; if none passes, the top one reports its first failure. (So a big, far-off target of another open puzzle — the light-trail plane behind 纸妹 — never masks the
  // shot the player has framed, and an idle target never hides an active puzzle's hint.)
  let first: Evaluation | null = null, green: Evaluation | null = null;
  for (let i = 0, n = 0; i < cands.length && n < MAX_FULL; i++) {
    const t = cands[i].t;
    // never let an idle target mask an active puzzle's verdict
    if (first && c.active.has(t.id) !== c.active.has(first.target.id)) break;
    const v = view.measure(t);
    if (!v) continue;
    n++;
    const checks = checkTarget(t, v, c);
    let failed: ShotCond | null = null;
    for (const k of checks) if (!k.ok) { failed = k.cond; break; }
    const q = Math.min(1, Math.max(0, 1 - Math.max(Math.abs(v.anchor.x), Math.abs(v.anchor.y)) / CANDIDATE_NDC));
    const ev: Evaluation = { target: t, view: v, checks, failed, q };
    if (!failed && (!green || checks.length > green.checks.length)) green = ev;
    first = first ?? ev;
  }
  return green ?? first;
}

/** GDD §3.4 / §3.5 / §18.4: the ShotResult for the current view. */
export function evalShot(view: ShotView, targets: readonly PhotoTarget[], c: ShotCtx): ShotResult {
  const ev = evaluate(view, targets, c);
  return resultOf(ev, c);
}

export function resultOf(ev: Evaluation | null, c: ShotCtx): ShotResult {
  if (!ev) {
    const f = c.fallback();
    return { frame: 'white', targetId: null, label: f.label, confidence: f.confidence, failed: null, hint: null, tags: [] };
  }
  const { target: t, view: v, checks, failed } = ev;
  const vars = c.vars?.(t);
  const tier = tierKey(t, c.zoom);
  const tierLabel = tier ? c.text(tier, vars) : t.id;
  const res: ShotResult = {
    frame: failed ? 'yellow' : 'green', targetId: t.id, label: tierLabel, confidence: null,
    failed, hint: null, tags: [],
  };
  if (t.kind === 'rephoto' && t.viewpoint && v.vp) {
    res.overlayScore = rephotoScore(v.vp, { pos: t.viewpoint.posTol, yaw: t.viewpoint.yawTol, pitch: t.viewpoint.pitchTol },
      zoomsOf(t).includes(c.zoom));
  }
  if (failed) {
    const sat = checks.filter((k) => k.ok).length;
    res.confidence = failConfidence(sat, checks.length);
    res.hint = hintFor(t, failed, v, c);
    // GDD §18.4 chai_dual: only `hidden` fails → the photo still counts as 「拆」 (tag chai_photo, 97%), frame yellow.
    if (t.special === 'chai_dual' && failed === 'hidden' && checks.every((k) => k.ok || k.cond === 'hidden')) {
      res.label = c.text(`lbl.${t.id}.dual`, vars);
      res.confidence = t.okConfidence ?? 97;
      res.tags = ['chai_photo'];
    }
    return res;
  }
  res.label = t.okKey ? c.text(t.okKey, vars) : tierLabel;
  res.confidence = t.showConfidence === false ? null : okConfidence(t, v.anchor);
  const tags = [...(t.onShot?.tags ?? [])];
  if (t.special === 'granny_blink') tags.push(c.eyesClosed?.(t) ? 'granny_face_closed' : 'granny_face_open');
  res.tags = tags;
  return res;
}
