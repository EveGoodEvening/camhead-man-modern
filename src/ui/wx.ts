// src/ui/wx.ts — owner E. WeChat runtime (GDD §11.12, §13): pushWx queue with the typing indicator on sim time, the
// chat log (rebuilt from store.wxLog on stateLoaded), hint messages, voice memos, toasts and pings.
import type { StrKey, WxId } from '../types';
import { WX } from '../data/wx';
import { DLG, WX_TEXT, has, t } from '../data/zh';
import { keyless } from '../data/zh/ui';
import { touchCapable } from './touch';
import type { UiCtx } from './ctx';
import { WxQueue, type WxBatch, type WxEvent, type WxLine } from './wxQueue';

export interface ChatEntry { kind: 'msg' | 'hint' | 'voice'; sender: 'tudi' | 'studio'; text: string }

export interface WxRuntime {
  readonly entries: readonly ChatEntry[];
  readonly typing: boolean;
  readonly unread: number;
  push(id: WxId, quiet?: boolean): void;
  pushHint(key: StrKey): void;
  update(): void;
  flush(): boolean;
  markRead(): void;
  onChange(fn: () => void): void;
}

const PREVIEW = 16;
/** P3r3: a cut preview never ends on a comma / stop before its ellipsis (the wrapped toast left 「，…」 on a line of its own). */
export const cutPreview = (s: string): string => s.replace(/[\uFF0C\u3002\u3001\uFF1B\uFF1A,.;:\s]+$/u, '');

function memoText(n: number): string {
  const lines = DLG[`memo_${n}` as keyof typeof DLG];
  return lines?.map((l) => l[1]).join('') ?? '';
}

/** Lines of one WxId: WX_TEXT, else the WxDef keys; a WxDef memo adds a voice-to-text bubble. */
export function wxLines(id: WxId): { sender: 'tudi' | 'studio'; lines: WxLine[] } {
  const def = WX.find((w) => w.id === id);
  const raw = WX_TEXT[id] ?? def?.keys.filter((k) => has(k)).map((k) => t(k)) ?? [];
  // touch devices: 「按 N」 → 「点「夜景」」 (P3 round 2: never name a key the player does not have)
  const touch = touchCapable();
  const lines: WxLine[] = raw.map((text) => ({ text: touch ? keyless(text) : text }));
  if (def?.memo) { const m = memoText(def.memo); if (m) lines.push({ text: m, voice: true }); }
  return { sender: def?.sender ?? (id === 'wx_auto_studio' ? 'studio' : 'tudi'), lines };
}

export function createWx(ctx: UiCtx): WxRuntime {
  const { core } = ctx;
  const q = new WxQueue();
  const entries: ChatEntry[] = [];
  const listeners: (() => void)[] = [];
  let typing = false;
  let unread = 0;
  const changed = () => { for (const f of listeners) f(); };
  const events: WxEvent[] = [];

  const apply = (evs: WxEvent[], quiet: boolean) => {
    let any = false;
    for (const e of evs) {
      if (e.kind === 'typing') { typing = e.on; any = true; continue; }
      const kind: ChatEntry['kind'] = e.line.voice ? 'voice' : e.batch.tag === 'hint' ? 'hint' : 'msg';
      entries.push({ kind, sender: e.batch.sender, text: e.line.text });
      unread++;
      any = true;
      if (quiet || e.batch.quiet) continue;
      ctx.sfx(e.line.voice ? 'sfx_memo' : 'sfx_ping');
      if (e.first && !ctx.phoneOnWx()) {
        const chars = [...e.line.text];
        const preview = chars.length > PREVIEW ? `${cutPreview(chars.slice(0, PREVIEW).join(''))}\u2026` : e.line.text;
        ctx.toast(e.batch.sender === 'studio' ? 'ui.toast.wxStudio' : 'ui.toast.wx', { preview }, 'wx');
      }
    }
    evs.length = 0;
    if (any) changed();
  };

  // Chat history = store.wxLog. Other modules may log wx without going through push() (F's bootChapter logs the
  // chapter's history AFTER store.replace, i.e. after stateLoaded), so the log is re-synced whenever it grows.
  const known = new Set<string>();   // wx ids already in `entries` or queued for delivery
  let synced = 0;                    // wxLog entries already reconciled
  const sync = (): boolean => {
    const log = core.store.state.wxLog;
    if (log.length === synced) return false;
    if (log.length < synced) synced = 0;
    let any = false;
    for (; synced < log.length; synced++) {
      const id = log[synced].id;
      if (known.has(id)) continue;
      known.add(id);
      const { sender, lines } = wxLines(id);
      for (const l of lines) entries.push({ kind: l.voice ? 'voice' : 'msg', sender, text: l.text });
      any = true;
    }
    return any;
  };
  const rebuild = () => {
    entries.length = 0; typing = false; unread = 0;
    known.clear(); synced = 0;
    const out: WxEvent[] = [];
    q.flush(out);
    out.length = 0;
    sync();
    changed();
  };
  core.bus.on('stateLoaded', rebuild);
  rebuild();

  return {
    get entries() { return entries; },
    get typing() { return typing; },
    get unread() { return unread; },
    push(id, quiet = false) {
      if (known.has(id) || core.store.state.wxLog.some((w) => w.id === id)) { if (sync()) changed(); return; }   // one-shot (AGENTS.md [F])
      known.add(id);
      core.store.logWx(id, core.store.state.clock);
      core.bus.emit('wx', { id });
      const { sender, lines } = wxLines(id);
      if (!lines.length) { core.log.warn(`[ui] wx ${id} has no text`); return; }
      const b: WxBatch = { sender, lines, tag: id, quiet };
      q.push(b, events);
      apply(events, quiet);
    },
    pushHint(key) {
      if (!has(key)) { core.log.warn(`[ui] hint key ${key} missing`); return; }
      q.push({ sender: 'tudi', lines: [{ text: touchCapable() ? keyless(t(key)) : t(key) }], tag: 'hint' }, events);
      apply(events, false);
    },
    update() {
      if (core.store.state.wxLog.length !== synced && sync()) changed();
      if (!q.busy && !typing) return;
      q.update(core.clock.t, events);
      apply(events, false);
    },
    flush() {
      if (!q.busy) return false;
      q.flush(events);
      apply(events, false);
      return true;
    },
    markRead() { if (unread) { unread = 0; changed(); } },
    onChange(fn) { listeners.push(fn); },
  };
}
