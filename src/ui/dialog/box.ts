// src/ui/dialog/box.ts — owner E. The messenger-style dialog box (ART §8.2): white skewed slab, blue blocky name tag,
// typewriter text, blue-triangle next button, stacked choice slabs above the box.
import { t } from '../../data/zh';
import { h, icon, showEl, stamp } from '../dom';

export type TagVariant = 'me' | 'npc' | 'spirit' | 'system' | 'narr';
export interface ChoiceItem { label: string; fixed: boolean; testid: string; pick(): void }

export interface DialogBox {
  readonly el: HTMLElement;
  show(on: boolean): void;
  setSpeaker(name: string, variant: TagVariant, speakerId: string, sub?: string): void;
  setText(text: string, shown: number): void;
  setNext(state: 'typing' | 'ready' | 'hidden'): void;
  setChoices(items: readonly ChoiceItem[]): void;
  highlight(i: number): void;
}

/** P3r3 T3: a wrapped line whose last row is shorter than this share of the box is an orphan (「了。」 alone). */
export const ORPHAN_FRAC = 0.25;
/** Line widths (px, top to bottom) → should the box balance this text? (pure; unit-tested) */
export function orphaned(lineWidths: readonly number[], boxWidth: number): boolean {
  return lineWidths.length >= 2 && boxWidth > 0 && (lineWidths.at(-1) ?? 0) < boxWidth * ORPHAN_FRAC;
}
/** Widths of the laid-out rows of an element's text: the extent of the client rects sharing a top edge (a range
 *  reports each span AND its text node, so rects overlap and must not be summed). */
function rowWidths(el: HTMLElement): number[] {
  const r = document.createRange();
  r.selectNodeContents(el);
  const rows = new Map<number, [number, number]>();
  for (const q of r.getClientRects()) {
    if (q.width <= 0) continue;
    const k = Math.round(q.top), e = rows.get(k);
    rows.set(k, e ? [Math.min(e[0], q.left), Math.max(e[1], q.right)] : [q.left, q.right]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, [l, rt]]) => rt - l);
}

export function createDialogBox(host: HTMLElement, onNext: () => void): DialogBox {
  const el = h('div', 'ui-dlg ui-hidden', { testid: 'dialog-box' });
  const name = h('div', 'ui-name', { testid: 'dialog-name' });
  const text = h('div', 'ui-dlg-text', { testid: 'dialog-text' });
  const vis = h('span', 'ui-vis');
  const ghost = h('span', 'ui-ghost');
  text.append(vis, ghost);
  const next = h('button', 'ui-next', { testid: 'dialog-next', attrs: { 'aria-label': 'next' } }, [icon('next')]);
  const choices = h('div', 'ui-choices ui-hidden', { testid: 'dialog-choices' });
  el.append(choices, name, text, next);
  host.append(el);
  next.addEventListener('click', (e) => { e.stopPropagation(); onNext(); });
  el.addEventListener('click', () => onNext());
  let full = '', chars: string[] = [], lastShown = -1;
  let balanced: boolean | null = null;             // null = not measured yet for this line
  let buttons: HTMLButtonElement[] = [];

  return {
    el,
    show(on) { if (on && el.classList.contains('ui-hidden')) stamp(el); showEl(el, on); },
    setSpeaker(n, variant, speakerId, sub) {
      name.textContent = n;
      name.className = `ui-name${variant === 'me' ? '' : ` ui-${variant}`}${sub ? ' ui-voice' : ''}`;
      if (sub) name.dataset.sub = sub; else delete name.dataset.sub;
      el.dataset.speaker = speakerId;
      name.style.rotate = `${speakerId.length % 2 ? -1 : -1.6}deg`;
    },
    setText(s, shown) {
      if (s !== full) { full = s; chars = [...s]; lastShown = -1; balanced = null; text.classList.remove('ui-bal'); }
      const n = Math.min(shown, chars.length);
      if (n === lastShown && balanced !== null) return;
      lastShown = n;
      vis.textContent = chars.slice(0, n).join('');
      ghost.textContent = chars.slice(n).join('');
      // P3r3 T3: the ghost keeps the whole line laid out, so its rows are known from the first glyph on; if the last
      // row would be a 1–3 glyph orphan, balance the rows (Chrome's text-wrap: pretty leaves two-row paragraphs alone).
      // Measured on the first call that has a layout (the box may still be display:none on the very first one).
      if (balanced === null) {
        try {
          const rows = rowWidths(text);
          if (rows.length && text.clientWidth > 0) { balanced = orphaned(rows, text.clientWidth); text.classList.toggle('ui-bal', balanced); }
        } catch { /* no layout */ }
      }
    },
    setNext(state) {
      showEl(next, state !== 'hidden');
      next.classList.toggle('ui-wait', state === 'typing');
      next.classList.toggle('ui-ready', state === 'ready');
    },
    setChoices(items) {
      choices.textContent = '';
      buttons = items.map((it, i) => {
        const b = h('button', `ui-choice ui-slab${it.fixed ? ' ui-fixed' : ''}`, { testid: it.testid });
        b.append(h('span', 'ui-key', { text: String(i + 1) }), h('span', '', { text: it.label }));
        b.addEventListener('click', (e) => { e.stopPropagation(); it.pick(); });
        choices.append(b);
        return b;
      });
      showEl(choices, items.length > 0);
      if (items.length) stamp(choices);
    },
    highlight(i) { buttons.forEach((b, k) => b.classList.toggle('ui-sel', k === i)); },
  };
}

export const fixedLabel = (k: 'show' | 'bye'): string => t(k === 'show' ? 'ui.choice.show' : 'ui.choice.bye');
