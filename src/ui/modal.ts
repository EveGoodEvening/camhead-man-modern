// src/ui/modal.ts — owner E. The modal stack (phone, inputs, show picker, pause, settings, notes) and keyboard focus
// navigation. Keys in the core key map arrive as input actions on the next tick; keys outside it (digits 5–0, Enter,
// Backspace) and everything while the loop is paused arrive as DOM keydowns.
import type { Core, InputApi } from '../contracts';
import type { ModalKind } from '../types';

export interface ModalEntry {
  kind: ModalKind;
  el: HTMLElement;
  /** Per-tick input (context 'modal'). Return true when handled. */
  onTick?(i: InputApi): void;
  /** DOM keydown (always, even while paused). Return true to stop the event. */
  onKey?(e: KeyboardEvent): boolean;
  onClose?(): void;
}

export class ModalStack {
  private stack: { e: ModalEntry; pop: () => void }[] = [];
  private readonly core: Core;
  private readonly host: HTMLElement;
  constructor(core: Core, host: HTMLElement) {
    this.core = core; this.host = host;
    addEventListener('keydown', (ev) => {
      const top = this.stack[this.stack.length - 1];
      if (!top?.e.onKey) return;
      if (top.e.onKey(ev)) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  }
  get top(): ModalEntry | null { return this.stack[this.stack.length - 1]?.e ?? null; }
  get kind(): ModalKind | null { return this.top?.kind ?? null; }
  has(kind: ModalKind): boolean { return this.stack.some((s) => s.e.kind === kind); }
  push(e: ModalEntry): void {
    const pop = this.core.input.pushContext('modal', `ui:${e.kind}`);
    this.stack.push({ e, pop });
    this.host.append(e.el);
    this.core.bus.emit('modal', { kind: e.kind });
  }
  /** Close one entry (default: the top). */
  close(e?: ModalEntry): void {
    const i = e ? this.stack.findIndex((s) => s.e === e) : this.stack.length - 1;
    if (i < 0) return;
    const [rec] = this.stack.splice(i, 1);
    rec.pop();
    rec.e.el.remove();
    try { rec.e.onClose?.(); } catch (err) { this.core.log.warn('[ui] modal onClose threw', err); }
    this.core.bus.emit('modal', { kind: this.kind });
  }
  closeKind(kind: ModalKind): void { for (const s of [...this.stack]) if (s.e.kind === kind) this.close(s.e); }
  closeAll(): void { while (this.stack.length) this.close(); }
  tick(i: InputApi): void {
    if (i.context() !== 'modal') return;
    this.top?.onTick?.(i);
  }
}

// ---- where did this tick's `advance` come from? ----
// Core maps LMB on the canvas to `shutter` + `advance` (keymap MOUSEMAP), exactly like Space. Focus navigation must
// only react to KEYS: a stray click on the title planet used to press 「开机」 (P3 U1), and a click beside a modal
// pressed its focused button. Canvas left-button downs mark the next `advance` edge as a mouse one; a Space / E keydown
// (real or from the touch buttons) marks it as a key again, and `endAdvanceTick()` (UI late phase) clears the mark.
let mouseAdvance = false;
export function trackAdvanceSource(canvas: EventTarget, win: EventTarget): void {
  canvas.addEventListener('mousedown', (e) => { if ((e as MouseEvent).button === 0) mouseAdvance = true; }, true);
  win.addEventListener('keydown', (e) => { const c = (e as KeyboardEvent).code; if (c === 'Space' || c === 'KeyE') mouseAdvance = false; }, true);
}
export function endAdvanceTick(): void { mouseAdvance = false; }
/** `advance` pressed this tick by a key (E / Space), not by a canvas click. */
export function keyAdvance(i: InputApi): boolean { return i.pressed('advance') && !mouseAdvance; }

export interface FocusNavOpts {
  /** Widgets that the dialogue keys bleed into (keypads, name picker, milk boxes; P3 U2): nothing is focused, and
   *  E / Space activate nothing, until an arrow / WASD key first shows the focus. Digits, Enter, Backspace and clicks
   *  work at once. */
  armOnNav?: boolean;
}

/** Arrow/WASD focus navigation over a grid of buttons; E / Space activates (Tab is the phone key, so no native Tab). */
export class FocusNav {
  items: HTMLElement[] = [];
  cols = 1;
  index = 0;
  /** False while an `armOnNav` nav waits for its first arrow key. */
  armed = true;
  private readonly armOnNav: boolean;
  constructor(o: FocusNavOpts = {}) { this.armOnNav = !!o.armOnNav; }
  set(items: HTMLElement[], cols = 1, keep = true, index?: number): void {
    this.items = items.filter((x) => x.isConnected || true);
    this.cols = Math.max(1, cols);
    if (!keep) this.armed = !this.armOnNav;
    if (index !== undefined) this.index = index;
    else if (!keep) this.index = 0;
    if (this.index >= this.items.length || this.index < 0) this.index = 0;
    this.paint();
  }
  paint(): void {
    this.items.forEach((el, i) => el.classList.toggle('ui-sel', this.armed && i === this.index));
    const el = this.items[this.index];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!this.armed) {
      if (active && this.items.includes(active as HTMLElement)) (active as HTMLElement).blur();
      return;
    }
    if (el && active !== el) { try { el.focus({ preventScroll: false }); } catch { /* ignore */ } }
  }
  move(dx: number, dy: number): void {
    if (!this.items.length) return;
    if (!this.armed) { this.armed = true; this.paint(); return; }   // the first arrow only shows the focus
    const n = this.items.length;
    let i = this.index + dx + dy * this.cols;
    if (i < 0) i = dy !== 0 ? this.index % this.cols : 0;
    if (i >= n) i = dy !== 0 ? this.index : n - 1;
    this.index = Math.max(0, Math.min(n - 1, i));
    this.paint();
  }
  /** Click the focused item (only once armed). */
  activate(): boolean {
    if (!this.armed) return false;
    const el = this.items[this.index];
    if (!el) return false;
    el.click();
    return true;
  }
  /** Standard per-tick handling: arrows/WASD move, E/Space click (never a canvas click). Returns true if something happened. */
  tick(i: InputApi): boolean {
    if (i.pressed('left')) { this.move(-1, 0); return true; }
    if (i.pressed('right')) { this.move(1, 0); return true; }
    if (i.pressed('forward')) { this.move(0, -1); return true; }
    if (i.pressed('back')) { this.move(0, 1); return true; }
    if (keyAdvance(i)) return this.activate();
    return false;
  }
}
