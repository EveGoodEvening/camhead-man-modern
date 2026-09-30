// src/ui/hud/toast.ts — owner E. Toasts (ARCHITECTURE §3.E item 5): item, clue, wx, photoFull, bestiary; sim-time expiry.
import type { Core } from '../../contracts';
import type { StrKey } from '../../types';
import { t } from '../../data/zh';
import type { ToastKind } from '../ctx';
import { h, icon, stamp } from '../dom';

const LIFE = 3.2;      // seconds of sim time
const MAX = 3;

export interface Toasts {
  push(key: StrKey, vars?: Readonly<Record<string, string | number>>, kind?: ToastKind, ic?: SVGSVGElement): void;
  update(): void;
  clear(): void;
  /** Move to the right edge while a modal (phone, keypad…) covers the centre top of the screen. */
  setLow(on: boolean): void;
  /** P3r2 U1: an element (the objective chip) the centred toast column must not cover: when they share columns
   *  (always on phones), the toasts drop below it. */
  setAvoid(el: HTMLElement | null): void;
  /** P3r3 U3: while a card is up the toasts are held (hidden, their clocks stopped) and show when it closes (the
   *  locker's 「取件成功…」 used to peek out behind the note card and expire unread). */
  setHeld(on: boolean): void;
}

/** Pure: expiry times after `dt` seconds on hold (a held toast keeps its remaining life). */
export function holdExpiry(untils: readonly number[], dt: number): number[] {
  return untils.map((u) => u + Math.max(0, dt));
}

export interface Rect { left: number; right: number; top: number; bottom: number; width: number; height: number }

/** Top (px) for the centred toast column so it clears `avoid` (null = keep the CSS top). Horizontal overlap only:
 *  moving the column down does not change its x extent, so this never oscillates. */
export function toastTop(box: Rect, avoid: Rect | null, gap: number): number | null {
  if (!avoid || avoid.width <= 0 || avoid.height <= 0 || box.width <= 0) return null;
  if (box.left >= avoid.right + gap || box.right <= avoid.left - gap) return null;
  return Math.round(avoid.bottom + gap);
}

/** A toast with the same kind and text as one still on screen refreshes that one instead of stacking a copy (P3 U6:
 *  four early H presses stacked three 「土地正在输入…」). Returns the index of the live duplicate, or -1. */
export function liveDuplicate(live: readonly { sig: string }[], sig: string): number {
  return live.findIndex((x) => x.sig === sig);
}

export function createToasts(core: Core, host: HTMLElement): Toasts {
  const box = h('div', 'ui-toasts');
  host.append(box);
  const live: { el: HTMLElement; until: number; sig: string }[] = [];
  let avoid: HTMLElement | null = null, low = false, lastTop = '', held = false, lastNow = core.clock.t;
  const place = () => {
    let top = '';
    if (!low && live.length && avoid && !avoid.classList.contains('ui-hidden')) {
      const u = Math.max(0.4, Math.min(innerWidth / 1280, innerHeight / 720));   // dom.ts trackScale
      const y = toastTop(box.getBoundingClientRect(), avoid.getBoundingClientRect(), 10 * u);
      if (y !== null) top = `${y}px`;
    }
    if (top !== lastTop) { box.style.top = top; lastTop = top; }
  };
  const iconFor = (k: ToastKind) =>
    k === 'item' ? icon('key') : k === 'clue' ? icon('clue') : k === 'wx' ? icon('wx') : k === 'bst' ? icon('bst') : k === 'photoFull' ? icon('photo') : null;
  return {
    push(key, vars, kind = 'plain', ic) {
      const text = t(key, vars);
      const sig = `${kind}|${text}`;
      const d = liveDuplicate(live, sig);
      if (d >= 0) {
        const [x] = live.splice(d, 1);
        x.until = Math.max(x.until, core.clock.t + LIFE);
        live.push(x);
        box.append(x.el);   // newest last, like a fresh toast
        stamp(x.el);
        return;
      }
      const el = h('div', `ui-toast ui-slab ui-t-${kind}`, { testid: 'toast' });
      el.style.rotate = `${(live.length % 2 ? 0.8 : -0.9)}deg`;
      const svgIc = ic ?? iconFor(kind);
      if (svgIc) el.append(svgIc);
      el.append(h('span', 'ui-toast-txt', { text }));
      box.append(el);
      stamp(el);
      const len = [...(el.textContent ?? '')].length;
      live.push({ el, sig, until: core.clock.t + Math.min(7, LIFE + Math.max(0, len - 14) * 0.08) });   // long system lines stay longer
      while (live.length > MAX) live.shift()?.el.remove();
      place();
    },
    update() {
      const now = core.clock.t, dt = now - lastNow;
      lastNow = now;
      if (held) {
        const u = holdExpiry(live.map((x) => x.until), dt);
        live.forEach((x, i) => { x.until = u[i]; });
        return;
      }
      for (let i = live.length - 1; i >= 0; i--) {
        if (now >= live[i].until) { live[i].el.remove(); live.splice(i, 1); }
      }
      place();
    },
    clear() { for (const x of live.splice(0)) x.el.remove(); },
    setHeld(on) {
      if (on === held) return;
      held = on;
      lastNow = core.clock.t;
      box.classList.toggle('ui-held', on);
      if (!on) { for (const x of live) stamp(x.el); place(); }
    },
    setLow(on) { if (on !== low) { low = on; box.classList.toggle('ui-low', on); } },
    setAvoid(el) { avoid = el; },
  };
}
