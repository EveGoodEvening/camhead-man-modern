// src/ui/wxQueue.ts — owner E. Pure WeChat delivery schedule on sim time (GDD §11.12 / §13):
// 「土地正在输入…」 for 1.2 s before a batch, then its lines 0.8 s apart. Quiet batches arrive at once.

export const TYPING_S = 1.2;
export const GAP_S = 0.8;

export interface WxLine { text: string; voice?: boolean }
export interface WxBatch { sender: 'tudi' | 'studio'; lines: readonly WxLine[]; tag: string; quiet?: boolean }
export type WxEvent =
  | { kind: 'typing'; on: boolean; sender: 'tudi' | 'studio' }
  | { kind: 'line'; batch: WxBatch; index: number; line: WxLine; first: boolean };

export class WxQueue {
  private queue: WxBatch[] = [];
  private cur: WxBatch | null = null;
  private index = 0;
  private nextAt = 0;
  private typing = false;
  private carryAt: number | null = null;

  get busy(): boolean { return this.cur !== null || this.queue.length > 0; }
  get isTyping(): boolean { return this.typing; }

  push(b: WxBatch, out: WxEvent[]): void {
    if (b.quiet) { b.lines.forEach((line, index) => out.push({ kind: 'line', batch: b, index, line, first: index === 0 })); return; }
    this.queue.push(b);
  }

  /** Advance to sim time `now`; appends what happened to `out`. */
  update(now: number, out: WxEvent[]): void {
    for (let guard = 0; guard < 64; guard++) {
      if (!this.cur) {
        const b = this.queue.shift();
        if (!b) return;
        if (b.lines.length === 0) continue;
        const base = this.carryAt ?? now; this.carryAt = null;
        this.cur = b; this.index = 0; this.nextAt = base + TYPING_S;
        if (!this.typing) { this.typing = true; out.push({ kind: 'typing', on: true, sender: b.sender }); }
      }
      if (now + 1e-9 < this.nextAt) return;
      const b = this.cur;
      const at = this.nextAt;
      out.push({ kind: 'line', batch: b, index: this.index, line: b.lines[this.index], first: this.index === 0 });
      this.index++;
      if (this.index < b.lines.length) { this.nextAt = at + GAP_S; continue; }
      this.cur = null;
      if (this.queue.length === 0) { this.typing = false; out.push({ kind: 'typing', on: false, sender: b.sender }); return; }
      this.carryAt = at;   // next batch starts typing right away
    }
  }

  /** Deliver everything now (skip()). */
  flush(out: WxEvent[]): void {
    const rest = this.cur ? [{ ...this.cur, lines: this.cur.lines.slice(this.index) }, ...this.queue] : [...this.queue];
    this.cur = null; this.queue = [];
    for (const b of rest) b.lines.forEach((line, index) => out.push({ kind: 'line', batch: b, index, line, first: false }));
    if (this.typing) { this.typing = false; out.push({ kind: 'typing', on: false, sender: 'tudi' }); }
  }
}
