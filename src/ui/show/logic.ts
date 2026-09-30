// src/ui/show/logic.ts — owner E. Pure show logic: the P3 gate verdict (GDD §9 P3) and reaction lookup (GDD §12).
import type { Action, Cond, GateVerdict, NodeId, ReceiverId, ShowFallbackRow, ShowReaction } from '../../types';

export interface ShownPhoto { tags: readonly string[]; preset?: string }

const OPEN = 'granny_face_open', CLOSED = 'granny_face_closed';

/** GDD §9 P3 precedence: only granny_face_* photos count as her face; then npc:* (not granny) → other; else noface. */
export function gateVerdict(photos: readonly ShownPhoto[]): GateVerdict {
  const faces = photos.filter((p) => p.tags.includes(OPEN) || p.tags.includes(CLOSED));
  if (faces.length >= 2) {
    const [a, b] = faces;
    const ao = a.tags.includes(OPEN) && !a.tags.includes(CLOSED);
    const bo = b.tags.includes(OPEN) && !b.tags.includes(CLOSED);
    if (ao !== bo) return 'pass';
    return ao ? 'both_open' : 'both_closed';
  }
  if (faces.length === 1) return 'one';
  if (photos.some((p) => p.tags.some((t) => t.startsWith('npc:') && t !== 'npc:granny_wang'))) return 'other';
  return 'noface';
}

/** Every tag of the shown photos, plus preset ids (GDD §7.2: a preset carries a tag equal to its id). */
export function tagsOf(photos: readonly ShownPhoto[]): Set<string> {
  const s = new Set<string>();
  for (const p of photos) { for (const t of p.tags) s.add(t); if (p.preset) s.add(p.preset); }
  return s;
}

/** GDD §12: the receiver's rows in table order, first whose tag list hits; else its first fallback whose `when` holds. */
export function findReaction(
  receiver: ReceiverId, tags: ReadonlySet<string>, reactions: readonly ShowReaction[], fallback: readonly ShowFallbackRow[],
  evalCond: (c: Cond | undefined) => boolean,
): { node: NodeId; actions?: readonly Action[]; matched: boolean } | null {
  for (const r of reactions) {
    if (r.receiver !== receiver || !evalCond(r.when)) continue;
    if (r.tags.some((t) => tags.has(t))) return { node: r.node, actions: r.actions, matched: true };
  }
  for (const f of fallback) {
    if (f.receiver === receiver && evalCond(f.when)) return { node: f.node, matched: false };
  }
  return null;
}

/** Only the gate accepts two photos (GDD §3.9). */
export function maxPhotos(receiver: ReceiverId): 1 | 2 { return receiver === 'gate' ? 2 : 1; }
