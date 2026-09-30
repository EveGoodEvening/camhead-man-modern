// src/lens/labels.ts — owner D. Recognition-bar text when no target is framed (GDD §3.5, §8.2, §8.3):
// a ≤ 10 Hz centre raycast against world.pickables (+ actors) within 60 m → scenery label (per-triangle labels via
// core/geom labelOfHit); nothing labelled → a landmark near the centre; nothing hit → sky_day / sky_night.
import { Raycaster, Vector3, type Intersection, type Object3D } from 'three';
import type { Core } from '../contracts';
import type { LabelDef, LabelId, Phase, StrKey, Zoom } from '../types';
import { SCENERY_LABELS, LANDMARK_LABELS } from '../data/labels';
import { TARGETS } from '../data/photoTargets';
import { t } from '../data/zh';
import { hashString } from '../core/rng';
import { labelOfHit } from '../core/geom';
import { SURFACES, worldToFlat } from '../core/planet';
import { LAYER } from '../core/layers';
import { LANDMARK_ANCHORS, type Anchors } from './anchors';
import { tierKey } from './evalShot';
import type { LensPose, ViewBuilder } from './view';

export const LABEL_HZ = 10;
export const LABEL_RANGE = 60;
const BY_LABEL = new Map<LabelId, LabelDef>(SCENERY_LABELS.map((l) => [l.id, l]));
const LANDMARK_TARGETS = TARGETS.filter((x) => x.kind === 'landmark');
const HUMANS = new Set(['xiaolin', 'granny_wang', 'old_chen', 'xiaoliu']);

export interface Recog { label: string; confidence: number | null }

/** "骑楼 · 老的 94%" → label + 94 (GDD §8.3 fixes some confidences in the text). */
export function splitConfidence(text: string): { label: string; conf: number | null } {
  const m = /\s(\d{1,3})%$/.exec(text);
  return m ? { label: text.slice(0, m.index).trimEnd(), conf: Number(m[1]) } : { label: text, conf: null };
}
/** Deterministic 90–99 confidence for labels without a fixed one. */
export function hashConfidence(id: string, zoom: Zoom): number {
  return 90 + (hashString(`${id}@${zoom}`) % 10);
}
/** Key of the tier shown at `zoom`: the highest non-null tier ≤ zoom. */
export function sceneryKey(def: LabelDef, zoom: Zoom): StrKey {
  const [k1, k3, k10] = def.keys;
  if (zoom >= 10 && k10) return k10;
  if (zoom >= 3 && k3) return k3;
  return k1;
}
export function sceneryRecog(def: LabelDef, zoom: Zoom, text: (k: StrKey) => string = t): Recog {
  const s = splitConfidence(text(sceneryKey(def, zoom)));
  return { label: s.label, confidence: s.conf ?? def.confidence ?? hashConfidence(def.id, zoom) };
}
export function labelDef(id: LabelId): LabelDef | undefined { return BY_LABEL.get(id); }

export function createLabelProbe(core: Core, anchors: Anchors, view: ViewBuilder) {
  const ray = new Raycaster();
  const hits: Intersection[] = [];
  const targets: Object3D[] = [];
  const tmp = new Vector3();
  let nextAt = -1;
  let cached: { kind: 'label'; id: LabelId } | { kind: 'npc'; spirit: boolean } | { kind: 'lm'; key: StrKey; id: string }
    | { kind: 'lmt'; id: string } | { kind: 'sky' } | { kind: 'unknown' } = { kind: 'sky' };
  const sphereHit = new Vector3();

  /** Unlabelled surface under the crosshair: the planet's ground reads as road or sea (GDD §5.1 zones). */
  const ground = (pose: LensPose): typeof cached | null => {
    if (pose.scene !== 'planet') return { kind: 'unknown' };
    const c = SURFACES.planet.center, R = SURFACES.planet.radius;
    // ray / sphere: |o + t·d − c| = R
    const oc = sphereHit.copy(pose.pos).sub(c);
    const b = oc.dot(pose.dir), cc = oc.lengthSq() - R * R, disc = b * b - cc;
    if (disc < 0) return null;
    const tt = -b - Math.sqrt(disc);
    if (tt < 0 || tt > LABEL_RANGE) return null;
    const hit = sphereHit.copy(pose.pos).addScaledVector(pose.dir, tt);
    const f = worldToFlat(SURFACES.planet, hit);
    const r = Math.hypot(f.x, f.z), lon = ((Math.atan2(f.x, f.z) * 180) / Math.PI + 360) % 360;
    const seaside = lon >= 300 || lon <= 60;
    return { kind: 'label', id: r > 62 || (seaside && r > 48) ? 'sea' : 'road' };
  };

  const actorOf = (o: Object3D | null): string | null => {
    for (let n: Object3D | null = o; n; n = n.parent) if (typeof n.userData.actorId === 'string') return n.userData.actorId as string;
    return null;
  };

  const landmark = (pose: LensPose): typeof cached | null => {
    let best: typeof cached | null = null, bestD = 0.35;
    for (const lt of LANDMARK_TARGETS) {
      const p = anchors.targetPos(lt, tmp);
      if (!p || p.distanceTo(pose.pos) > (lt.maxDist ?? 60)) continue;
      const n = view.ndc(p);
      const dd = Math.hypot(n.x, n.y);
      if (n.front && dd < bestD && !view.blocked(p, lt.radius * 0.9)) { bestD = dd; best = { kind: 'lmt', id: lt.id }; }
    }
    for (const id of LANDMARK_ANCHORS) {
      const r = anchors.world(id);
      if (!r || r.scene !== pose.scene || r.pos.distanceTo(pose.pos) > 90) continue;
      const n = view.ndc(r.pos);
      const dd = Math.hypot(n.x, n.y);
      const key = LANDMARK_LABELS[id];
      if (key && n.front && dd < bestD && !view.blocked(r.pos, (r.radius ?? 3) * 0.9)) { bestD = dd; best = { kind: 'lm', key, id }; }
    }
    return best;
  };

  const probe = (pose: LensPose, night: boolean) => {
    targets.length = 0;
    try { targets.push(...core.services.world.pickables(pose.scene)); } catch { /* none */ }
    for (const a of core.actors.list(pose.scene)) if (a.id !== 'hero' && a.root.visible) targets.push(a.root);
    ray.layers.set(LAYER.WORLD);
    if (night) ray.layers.enable(LAYER.GHOST);
    ray.set(pose.pos, pose.dir);
    ray.near = 0.2; ray.far = LABEL_RANGE;
    hits.length = 0;
    ray.intersectObjects(targets, true, hits);
    const hit = hits.find((h) => h.object.visible) ?? null;
    hits.length = 0;
    if (!hit) { cached = landmark(pose) ?? ground(pose) ?? { kind: 'sky' }; return; }
    const actor = actorOf(hit.object);
    if (actor && actor !== 'chai') { cached = { kind: 'npc', spirit: !HUMANS.has(actor) }; return; }
    const id = labelOfHit(hit);
    if (id && BY_LABEL.has(id)) { cached = { kind: 'label', id }; return; }
    cached = landmark(pose) ?? { kind: 'unknown' };
  };

  return {
    /** Refresh at ≤ 10 Hz (sim time); `force` for synchronous API calls (aim → evalNow). */
    update(pose: LensPose, night: boolean, force = false) {
      const now = core.clock.t;
      if (!force && now < nextAt) return;
      nextAt = now + 1 / LABEL_HZ;
      try { probe(pose, night); } catch (e) { core.log.warn('[lens] label probe failed', e); cached = { kind: 'sky' }; }
    },
    current(zoom: Zoom): Recog {
      const phase = core.store.state.phase, night = phase === 'night';
      switch (cached.kind) {
        case 'label': { const d = BY_LABEL.get(cached.id); return d ? sceneryRecog(d, zoom) : sky(phase, zoom); }
        case 'npc': {
          if (cached.spirit) return { label: t('lbl.npc.spirit'), confidence: hashConfidence('spirit', zoom) };
          const d = BY_LABEL.get(night ? 'person_night' : 'person');
          return d ? sceneryRecog(d, zoom) : sky(phase, zoom);
        }
        case 'lm': { const s = splitConfidence(t(cached.key)); return { label: s.label, confidence: s.conf ?? hashConfidence(cached.id, zoom) }; }
        case 'lmt': {
          const lt = LANDMARK_TARGETS.find((x) => x.id === (cached as { id: string }).id);
          const k = lt ? tierKey(lt, zoom) : null;
          return k ? { label: t(k), confidence: hashConfidence(lt!.id, zoom) } : sky(phase, zoom);
        }
        case 'unknown': return { label: t('lbl.unknown'), confidence: hashConfidence('unknown', zoom) - 50 };
        default: return sky(phase, zoom);
      }
    },
    reset() { nextAt = -1; cached = { kind: 'sky' }; },
  };
}
export type LabelProbe = ReturnType<typeof createLabelProbe>;

/** P3r3 look L5: the sky label follows the phase (a pink dusk sky read 「天空 · 青色 99%」). */
export const SKY_LABEL: Readonly<Record<Phase, LabelId>> = { day: 'sky_day', dusk: 'sky_dusk', night: 'sky_night', dawn: 'sky_dawn' };
function sky(phase: Phase, zoom: Zoom): Recog {
  const d = BY_LABEL.get(SKY_LABEL[phase] ?? 'sky_day');
  return d ? sceneryRecog(d, zoom) : { label: '', confidence: null };
}
