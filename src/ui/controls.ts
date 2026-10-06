// src/ui/controls.ts — owner E. The 「操作说明」 page (P3 round 2 onboarding): every control on one card, keyboard +
// mouse OR touch (P3r3 T3: only the family this device uses, the other one behind a tab). Opened from the pause menu and from 设置 (so the title
// reaches it too). Modal kind 'settings' (ModalKind is frozen); Esc / E / Space / 知道了 close it.
import type { StrKey } from '../types';
import { t } from '../data/zh';
import { h } from './dom';
import type { ModalEntry, ModalStack } from './modal';
import { touchCapable } from './touch';

/** Row ids; the copy is `ui.ctl.<kb|touch>.<id>.k` (keys) / `.d` (what they do) in zh/ui.ts. */
export const CONTROL_ROWS = {
  kb: ['move', 'look', 'use', 'view', 'shutter', 'zoom', 'overlay', 'flash', 'night', 'phone', 'show', 'hint', 'talk', 'esc'],
  touch: ['move', 'look', 'use', 'view', 'shutter', 'tools', 'phone', 'torch', 'show', 'back', 'talk'],
} as const;

/** Split a key cell into caps: 「W A S D」 → 4 caps, 「右键 / F」 → 2, 「1 2 3」 → 3 (pure; unit-tested). */
export function keyTokens(cell: string): string[] {
  return cell.split(' / ').flatMap((part) => (/^([A-Z0-9] )+[A-Z0-9]$/.test(part) ? part.split(' ') : [part]));
}

export type ControlFamily = keyof typeof CONTROL_ROWS;
/** The family shown first: touch on a touch device, else keyboard + mouse (pure; unit-tested). */
export function controlsFamily(touch: boolean): ControlFamily { return touch ? 'touch' : 'kb'; }

function column(kind: ControlFamily): HTMLElement {
  const col = h('div', `ui-ctl-col ui-ctl-${kind}`, { testid: `controls-${kind}` });
  const list = h('dl', 'ui-ctl-list');
  for (const id of CONTROL_ROWS[kind]) {
    const keys = h('dt', 'ui-ctl-keys');
    for (const k of keyTokens(t(`ui.ctl.${kind}.${id}.k` as StrKey))) keys.append(h('span', kind === 'kb' ? 'ui-key' : 'ui-ctl-btn', { text: k }));
    list.append(keys, h('dd', 'ui-ctl-desc', { text: t(`ui.ctl.${kind}.${id}.d` as StrKey) }));
  }
  col.append(list);
  return col;
}

export function openControls(modals: ModalStack, onDone?: () => void): void {
  if (modals.top?.el.dataset.testid === 'controls-wrap') return;
  const wrap = h('div', 'ui-menu-wrap', { testid: 'controls-wrap' });
  const panel = h('div', 'ui-menu ui-slab ui-ctl ui-stamp', { testid: 'controls' });
  const title = h('h2', 'ui-extrude', { text: t('ui.ctl.title'), attrs: { 'data-text': t('ui.ctl.title') } });
  const cols = h('div', 'ui-ctl-cols');
  // P3r3 T3: one column at a time (both side by side doubled the reading on desktop); the tabs switch families
  const col = { kb: column('kb'), touch: column('touch') };
  const tab = {
    kb: h('button', 'ui-ctl-head ui-ctl-tab', { text: t('ui.ctl.kb'), testid: 'controls-tab-kb' }),
    touch: h('button', 'ui-ctl-head ui-ctl-tab', { text: t('ui.ctl.touch'), testid: 'controls-tab-touch' }),
  };
  let shown: ControlFamily = controlsFamily(touchCapable());
  const pick = (f: ControlFamily) => {
    shown = f;
    for (const k of ['kb', 'touch'] as const) { col[k].hidden = k !== f; tab[k].classList.toggle('ui-on', k === f); }
  };
  const first = controlsFamily(touchCapable()), second: ControlFamily = first === 'kb' ? 'touch' : 'kb';
  const tabs = h('div', 'ui-ctl-tabs', {}, [tab[first], tab[second]]);
  for (const k of ['kb', 'touch'] as const) tab[k].addEventListener('click', () => pick(k));
  cols.append(col.kb, col.touch);
  pick(shown);
  const done = h('button', 'ui-btn', { text: t('ui.ctl.done'), testid: 'controls-done' });
  panel.append(title, tabs, cols, done);
  wrap.append(panel);
  const entry: ModalEntry = {
    kind: 'settings', el: wrap,
    onKey(e) {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { modals.close(entry); return true; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { pick(shown === 'kb' ? 'touch' : 'kb'); return true; }
      return false;
    },
    onClose() { onDone?.(); },
  };
  done.addEventListener('click', () => modals.close(entry));
  modals.push(entry);
  setTimeout(() => done.focus(), 0);
}
