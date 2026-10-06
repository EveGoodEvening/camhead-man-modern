// src/ui/dialog/engine.ts — owner E. Pure dialogue logic (GDD §11.0, ARCHITECTURE §3.E item 2). No DOM.
import type { Cond, DialogueNode, NodeId, ReceiverId, StrKey } from '../../types';

export type EvalCond = (c: Cond | undefined) => boolean;
export type Seen = (id: NodeId) => boolean;

/** Nodes of `owner` whose `when` holds and that are not spent `once` nodes, best first (prio desc, table order). */
export function eligibleNodes(nodes: readonly DialogueNode[], owner: string, evalCond: EvalCond, seen: Seen): DialogueNode[] {
  const out: { n: DialogueNode; i: number }[] = [];
  nodes.forEach((n, i) => {
    if (n.owner !== owner) return;
    if (n.once && seen(n.id)) return;
    if (!evalCond(n.when)) return;
    out.push({ n, i });
  });
  out.sort((a, b) => (b.n.prio ?? 10) - (a.n.prio ?? 10) || a.i - b.i);
  return out.map((x) => x.n);
}

/** The node a talk() plays (GDD §11.0: highest prio among eligible ones). */
export function pickNode(nodes: readonly DialogueNode[], owner: string, evalCond: EvalCond, seen: Seen): DialogueNode | null {
  return eligibleNodes(nodes, owner, evalCond, seen)[0] ?? null;
}

/** Plain-E talkability (ARCHITECTURE §3.E): some eligible node without a night-lens requirement. Runs every tick for
 *  every talk interactable (core calls `enabled()` before its distance test), so it loops without allocating. */
export function talkableByE(nodes: readonly DialogueNode[], owner: string, evalCond: EvalCond, seen: Seen): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.owner !== owner || n.when.lens === 'night' || (n.once && seen(n.id))) continue;
    if (evalCond(n.when)) return true;
  }
  return false;
}

/** Eligible auto node for `owner` with the best prio (GDD §11.0 auto: plays by itself when the owner is in range).
 *  Polled from the update loop, so it does not allocate. */
export function autoNode(nodes: readonly DialogueNode[], owner: string, evalCond: EvalCond, seen: Seen): DialogueNode | null {
  let best: DialogueNode | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.auto || n.owner !== owner || (n.once && seen(n.id))) continue;
    if ((best && (n.prio ?? 10) <= (best.prio ?? 10)) || !evalCond(n.when)) continue;
    best = n;
  }
  return best;
}

/** `{name}` → 「？？？」 before name_known, 「周远」 after (GDD §11.0). */
export function fillName(text: string, name: string): string {
  return text.replace(/\{name\}/g, name);
}

export interface ChoiceView { key: StrKey; index: number }
/** Node-specific choices whose `when` holds, keeping their original index (for then/actions lookup). */
export function visibleChoices(node: DialogueNode | null, evalCond: EvalCond): ChoiceView[] {
  const out: ChoiceView[] = [];
  (node?.choices ?? []).forEach((c, index) => { if (evalCond(c.when)) out.push({ key: c.key, index }); });
  return out;
}

export type FixedOption = 'show' | 'bye';
/** GDD §11.0 fixed options: 「出示照片…」 needs a show receiver; both are dropped by `noFixedOptions`. */
export function fixedOptions(node: DialogueNode | null, receiver: ReceiverId | null): FixedOption[] {
  if (node?.noFixedOptions) return [];
  if (!receiver) return [];
  return ['show', 'bye'];
}

/** What advance() does once the last line is complete (ARCHITECTURE §2.7: only fixed options left = 「再见」). */
export function endAdvance(nodeChoices: number): 'close' | 'wait' {
  return nodeChoices > 0 ? 'wait' : 'close';
}
