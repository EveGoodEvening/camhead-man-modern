// src/ui/settings.ts — owner E. Settings (GDD §4): sensitivity, invert Y, volume, text speed; cmm.settings.v1. Also the
// door to 「操作说明」 (controls.ts), so the title's 「设置」 reaches it.
import type { Core } from '../contracts';
import type { Settings } from '../types';
import { t } from '../data/zh';
import { h } from './dom';
import type { ModalEntry, ModalStack } from './modal';

export const SETTINGS_KEY = 'cmm.settings.v1';
export const DEFAULT_SETTINGS: Settings = { sens: 1, invertY: false, volume: 0.8, textSpeed: 'mid' };

export function parseSettings(raw: string | null): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    if (typeof v.sens === 'number' && Number.isFinite(v.sens)) s.sens = Math.min(3, Math.max(0.2, v.sens));
    if (typeof v.invertY === 'boolean') s.invertY = v.invertY;
    if (typeof v.volume === 'number' && Number.isFinite(v.volume)) s.volume = Math.min(1, Math.max(0, v.volume));
    if (v.textSpeed === 'fast' || v.textSpeed === 'mid' || v.textSpeed === 'slow') s.textSpeed = v.textSpeed;
  } catch { /* corrupt: defaults */ }
  return s;
}

export function loadSettings(test: boolean): Settings {
  if (test) return { ...DEFAULT_SETTINGS };
  try { return parseSettings(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? null); } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Settings, test: boolean): void {
  if (test) return;
  try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage off */ }
}

/** Apply: the input system reads the `settings` event; audio gets the volume directly as well. */
export function applySettings(core: Core, s: Settings): void {
  core.bus.emit('settings', { ...s });
  try { core.services.audio.setVolume(s.volume); } catch { /* audio not ready */ }
}

/** The settings panel (modal). `onDone` runs after it closes. */
export function openSettings(modals: ModalStack, get: () => Settings, set: (s: Settings) => void, onDone?: () => void,
  controls?: (onDone: () => void) => void): void {
  if (modals.has('settings')) return;
  const wrap = h('div', 'ui-menu-wrap');
  const panel = h('div', 'ui-menu ui-slab ui-set ui-stamp', { testid: 'settings' });
  const title = h('h2', 'ui-extrude', { text: t('set.title'), attrs: { 'data-text': t('set.title') } });
  const rows: HTMLElement[] = [];
  const focusables: HTMLElement[] = [];

  const range = (label: string, key: 'sens' | 'volume', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const val = h('span', 'ui-val');
    const inp = h('input', 'ui-range', { testid: `set-${key}`, attrs: { type: 'range', min: String(min), max: String(max), step: String(step) } });
    inp.value = String(get()[key]);
    val.textContent = fmt(get()[key]);
    inp.addEventListener('input', () => { const s = { ...get(), [key]: Number(inp.value) }; set(s); val.textContent = fmt(s[key]); });
    rows.push(h('div', 'ui-set-row', {}, [h('span', '', { text: label }), inp, val]));
    focusables.push(inp);
    return inp;
  };
  const sens = range(t('ui.sens'), 'sens', 0.2, 3, 0.1, (v) => `${v.toFixed(1)}`);
  range(t('ui.volume'), 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);

  const seg = (label: string, opts: readonly { v: string; key: string }[], cur: () => string, pick: (v: string) => void, testid: string) => {
    const box = h('div', 'ui-seg');
    const btns = opts.map((o) => {
      const b = h('button', '', { text: t(o.key), testid: `${testid}-${o.v}` });
      b.addEventListener('click', () => { pick(o.v); paint(); });
      box.append(b);
      focusables.push(b);
      return { b, o };
    });
    const paint = () => btns.forEach(({ b, o }) => b.classList.toggle('ui-on', cur() === o.v));
    paint();
    rows.push(h('div', 'ui-set-row', {}, [h('span', '', { text: label }), box, h('span', '')]));
  };
  seg(t('ui.invertY'), [{ v: 'off', key: 'set.off' }, { v: 'on', key: 'set.on' }], () => (get().invertY ? 'on' : 'off'),
    (v) => set({ ...get(), invertY: v === 'on' }), 'set-invert');
  seg(t('ui.textSpeed'), [{ v: 'fast', key: 'ui.fast' }, { v: 'mid', key: 'ui.mid' }, { v: 'slow', key: 'ui.slow' }], () => get().textSpeed,
    (v) => set({ ...get(), textSpeed: v as Settings['textSpeed'] }), 'set-speed');

  // P3 round 2: the controls page is one step away from the title (设置 → 操作说明) and from pause
  const extra: HTMLElement[] = [];
  if (controls) {
    const ctl = h('button', 'ui-btn ui-white', { text: t('ui.controls'), testid: 'settings-controls' });
    ctl.addEventListener('click', () => controls(() => ctl.focus()));
    focusables.push(ctl);
    extra.push(ctl);
  }
  const done = h('button', 'ui-btn', { text: t('set.done'), testid: 'settings-done' });
  focusables.push(done);
  panel.append(title, ...rows, ...extra, done);
  wrap.append(panel);
  const entry: ModalEntry = {
    kind: 'settings', el: wrap,
    onKey(e) {
      if (e.code === 'Escape') { modals.close(entry); return true; }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const i = focusables.indexOf(document.activeElement as HTMLElement);
        const n = focusables.length;
        const j = e.code === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
        focusables[j].focus();
        return true;
      }
      // Space / Enter / E press the focused button (core input cancels Space's native button activation)
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
        const el = document.activeElement;
        if (el instanceof HTMLButtonElement && focusables.includes(el)) { el.click(); return true; }
      }
      return false;
    },
    onClose() { onDone?.(); },
  };
  done.addEventListener('click', () => modals.close(entry));
  modals.push(entry);
  sens.focus();
}
