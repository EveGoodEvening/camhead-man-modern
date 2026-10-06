// src/ui/inputs/widgets.ts — owner E. The keypad (locker 2 stages / lighthouse 4 digits), the name picker (2×6) and the
// milk-box wall (24 boxes) views (GDD §16.5). Stage logic lives in logic.ts; this file is DOM only.
import type { InputDef, InputKind, StrKey } from '../../types';
import { has, t } from '../../data/zh';
import { h, stamp } from '../dom';
import { touchCapable } from '../touch';
import { FocusNav, type ModalEntry } from '../modal';
import { stageLength, stagePrompt, type StageResult } from './logic';

export interface InputView {
  readonly entry: ModalEntry;
  result(r: StageResult, value: string, stage: number): void;
}
export interface ViewDeps {
  def: InputDef;
  stage(): number;
  submit(value: string): void;
  close(): void;
  sfx(): void;
}

/** The 「Esc 关闭」 line doubles as a close button (touch has no Esc key; P3 U3). */
function closeBtn(d: ViewDeps): HTMLElement {
  const b = h('button', 'ui-esc', { text: t(touchCapable() ? 'ui.close' : 'ui.escHint'), testid: 'input-close' });
  b.addEventListener('click', () => d.close());
  return b;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

export function keypadView(kind: 'locker' | 'lighthouse', d: ViewDeps): InputView {
  const nav = new FocusNav({ armOnNav: true });   // E / Space also advance dialogue: never type with them (P3 U2)
  const wrap = h('div', 'ui-input-wrap');
  const kp = h('div', `ui-kp${kind === 'lighthouse' ? ' ui-brass' : ''} ui-stamp`, { testid: `input-${kind}` });
  const brand = h('div', 'ui-kp-brand', { text: t(kind === 'locker' ? 'kp.locker.brand' : 'kp.lh.brand') });
  const screen = h('div', 'ui-kp-screen');
  const prompt = h('div', 'ui-kp-prompt');
  const digits = h('div', 'ui-kp-digits', { testid: 'kp-display' });
  const msg = h('div', 'ui-kp-msg', { testid: 'kp-msg' });
  const hint = h('div', 'ui-kp-hint');
  screen.append(prompt, digits, msg, hint);
  const keys = h('div', 'ui-kp-keys');
  let entered = '';
  const paint = () => {
    const st = d.stage();
    prompt.textContent = t(stagePrompt(kind, st));
    const len = stageLength(d.def, st);
    digits.textContent = '';
    for (let i = 0; i < len; i++) digits.append(h('span', '', { text: entered[i] ?? '' }));
  };
  const press = (k: string) => {
    d.sfx();
    const len = stageLength(d.def, d.stage());
    if (k === 'del') { entered = entered.slice(0, -1); msg.textContent = ''; paint(); return; }
    if (k === 'ok') { if (entered) { const v = entered; entered = ''; d.submit(v); } return; }
    if (entered.length >= len) return;
    entered += k;
    msg.textContent = ''; msg.classList.remove('ui-bad');
    paint();
    if (entered.length >= len) { const v = entered; entered = ''; d.submit(v); }
  };
  const btns = DIGITS.map((k) => {
    const label = k === 'del' ? t('kp.del') : k === 'ok' ? t('kp.ok') : k;
    const b = h('button', `ui-kp-key${k === 'ok' ? ' ui-ok' : ''}${k === 'del' || k === 'ok' ? ' ui-cn' : ''}`, { testid: `kp-${k}`, text: label });
    b.addEventListener('click', () => press(k));
    keys.append(b);
    return b;
  });
  kp.append(brand, screen, keys, closeBtn(d));
  wrap.append(kp);
  paint();
  nav.set(btns, 3, false);
  const flashKey = (k: string) => {
    const b = btns[DIGITS.indexOf(k as (typeof DIGITS)[number])];
    if (!b) return;
    b.classList.add('ui-press');
    setTimeout(() => b.classList.remove('ui-press'), 90);
  };
  const entry: ModalEntry = {
    kind: 'input', el: wrap,
    onTick(i) { if (i.pressed('escape')) { d.close(); return; } nav.tick(i); },
    onKey(e) {
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (m) { press(m[1]); flashKey(m[1]); return true; }
      if (e.code === 'Backspace') { press('del'); flashKey('del'); return true; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { press('ok'); flashKey('ok'); return true; }
      return false;
    },
  };
  return {
    entry,
    result(r) {
      entered = '';
      paint();
      msg.textContent = r.messageKey && has(r.messageKey) ? t(r.messageKey) : '';
      msg.classList.toggle('ui-bad', !r.ok);
      if (r.hintKey) hint.textContent = t(r.hintKey);
      if (!r.ok) stamp(msg);
    },
  };
}

export function namePickerView(d: ViewDeps): InputView {
  const nav = new FocusNav({ armOnNav: true });
  const want = [...(d.def.answer[0] ?? '')].length || 2;
  const grid = d.def.grid?.length ? [...d.def.grid] : [...t('np.grid')];
  const picks: string[] = [];
  const wrap = h('div', 'ui-input-wrap');
  const box = h('div', 'ui-np ui-stamp', { testid: 'input-namepicker' });
  const slotsRow = h('div', 'ui-np-slots');
  const slots = Array.from({ length: want }, () => h('span', ''));
  const msg = h('div', 'ui-kp-msg', { testid: 'np-msg' });
  slotsRow.append(...slots, msg);
  const g = h('div', 'ui-np-grid');
  const paint = () => {
    slots.forEach((s, i) => { s.textContent = picks[i] ?? ''; });
    keys.forEach((b) => b.classList.toggle('ui-on', picks.includes(b.dataset.ch ?? '')));
  };
  const keys = grid.map((ch) => {
    const b = h('button', 'ui-np-key', { testid: `np-${ch}`, text: ch });
    b.dataset.ch = ch;
    b.addEventListener('click', () => { d.sfx(); if (picks.length < want) picks.push(ch); msg.textContent = ''; paint(); });
    g.append(b);
    return b;
  });
  const confirm = h('button', 'ui-sbtn ui-slab ui-yellow', { testid: 'np-confirm', text: t('np.confirm') });
  const clear = h('button', 'ui-sbtn ui-slab', { testid: 'np-clear', text: t('np.clear') });
  confirm.addEventListener('click', () => { d.sfx(); if (picks.length) d.submit(picks.join('')); });
  clear.addEventListener('click', () => { d.sfx(); picks.length = 0; msg.textContent = ''; paint(); });
  box.append(h('div', 'ui-kp-brand', { text: t('np.brand') }), h('h3', '', { text: t('np.title') }), slotsRow, g,
    h('div', 'ui-np-row', {}, [clear, confirm]), closeBtn(d));
  wrap.append(box);
  nav.set([...keys, clear, confirm], 6, false);
  const entry: ModalEntry = {
    kind: 'input', el: wrap,
    onTick(i) { if (i.pressed('escape')) { d.close(); return; } nav.tick(i); },
    onKey(e) {
      if (e.code === 'Backspace') { picks.pop(); paint(); return true; }
      if (e.code === 'Enter') { confirm.click(); return true; }
      return false;
    },
  };
  return {
    entry,
    result(r) {
      picks.length = 0; paint();
      msg.textContent = !r.ok && r.messageKey && has(r.messageKey) ? t(r.messageKey) : '';
      if (!r.ok) stamp(msg);
    },
  };
}

/** Box ids 101–604 (6 floors × 4 flats) when INPUTS.milkbox.grid is absent. */
export function defaultBoxes(): string[] {
  const out: string[] = [];
  for (let f = 1; f <= 6; f++) for (let u = 1; u <= 4; u++) out.push(`${f}0${u}`);
  return out;
}

export function milkboxView(d: ViewDeps, cellText: (box: string) => StrKey): InputView {
  const nav = new FocusNav({ armOnNav: true });
  const boxes = d.def.grid?.length ? [...d.def.grid] : defaultBoxes();
  const wrap = h('div', 'ui-input-wrap');
  const panel = h('div', 'ui-mb ui-stamp', { testid: 'input-milkbox' });
  const say = h('div', 'ui-mb-say', { testid: 'mb-say', text: t('mb.hint') });
  const grid = h('div', 'ui-mb-grid');
  // top floor first, like the real wall
  const order = [...boxes].sort((a, b) => Number(b[0]) - Number(a[0]) || a.localeCompare(b));
  const btns = order.map((id) => {
    const sealed = has(cellText(id)) && cellText(id) === 'mb.604';
    const b = h('button', `ui-mb-box${sealed ? ' ui-mb-sealed' : ''}`, { testid: `mb-${id}`, text: id });
    b.addEventListener('click', () => { d.sfx(); d.submit(id); });
    grid.append(b);
    return b;
  });
  panel.append(h('h3', '', { text: t('mb.title') }), grid, say, closeBtn(d));
  wrap.append(panel);
  nav.set(btns, 4, false);
  const entry: ModalEntry = {
    kind: 'input', el: wrap,
    onTick(i) { if (i.pressed('escape')) { d.close(); return; } nav.tick(i); },
  };
  return {
    entry,
    result(r, value) {
      say.textContent = r.messageKey ? t(r.messageKey) : '';
      stamp(say);
      const b = btns[order.indexOf(value)];
      if (b && r.messageKey !== 'mb.604') b.classList.add('ui-open');
    },
  };
}

export type ViewFactory = (kind: InputKind, d: ViewDeps) => InputView;
