// src/ui/phone/pages.ts — owner E. 微信 and 备忘录 pages (GDD §16.4, §11.12, §10.6, §14).
import type { Core } from '../../contracts';
import type { BestiaryId, StrKey } from '../../types';
import { BESTIARY } from '../../data/bestiary';
import { CLUES } from '../../data/items';
import { BESTIARY_IDS } from '../../core/params';
import { NPCS } from '../../data/npcs';
import { has, t } from '../../data/zh';
import { h, photoImg } from '../dom';
import { touchCapable } from '../touch';
import { objectiveText } from '../hud/hud';
import type { WxRuntime } from '../wx';

export function tudiName(core: Core): string {
  return t(core.store.has('ending_B') ? 'ui.wx.tudiZhou' : 'ui.wx.tudi');
}

/** The chat log: green bubbles (`wx-msg-<n>`), the typing indicator and 「求助（H）」. */
export function renderWx(core: Core, wx: WxRuntime, root: HTMLElement, onHelp: () => void): void {
  root.textContent = '';
  const page = h('div', 'ui-wx', { testid: 'wx-page' });
  const head = h('div', 'ui-wx-head', { text: tudiName(core) });
  const log = h('div', 'ui-wx-log', { testid: 'wx-log' });
  const tudiGlyph = [...t(NPCS.find((n) => n.id === 'tudi')?.nameKey ?? 'npc.tudi')][0] ?? '';
  const studioGlyph = [...t('ui.wx.studio')][0] ?? '';
  if (!wx.entries.length && !wx.typing) log.append(h('div', 'ui-empty', { text: t('ui.wx.empty') }));
  wx.entries.forEach((e, n) => {
    const msg = h('div', 'ui-msg', { testid: `wx-msg-${n}` });
    const ava = h('div', `ui-ava${e.sender === 'studio' ? ' ui-studio' : ''}`, { text: e.sender === 'studio' ? studioGlyph : tudiGlyph });
    const bub = h('div', `ui-bubble${e.kind === 'hint' ? ' ui-hint' : e.kind === 'voice' ? ' ui-voice' : ''}`);
    if (e.kind === 'voice') {
      bub.append(h('span', 'ui-vlabel', {}, [h('span', 'ui-vwave', { text: ')))' }), t('ui.wx.voice')]));
    }
    bub.append(e.text);
    msg.append(ava, bub);
    log.append(msg);
  });
  if (wx.typing) log.append(h('div', 'ui-typing', { testid: 'wx-typing', text: t('ui.typing') }));
  const help = h('button', 'ui-sbtn ui-slab ui-yellow', { text: t(touchCapable() ? 'ui.touch.wxHelp' : 'ui.wx.help'), testid: 'wx-help' });
  help.addEventListener('click', onHelp);
  const foot = h('div', 'ui-wx-foot', {}, [help]);
  page.append(head, log, foot);
  root.append(page);
  log.scrollTop = log.scrollHeight;
}

function clueText(id: string): string {
  const d = CLUES.find((c) => c.id === id);
  const key: StrKey = d?.textKey ?? `clue.${id}`;
  return has(key) ? t(key) : '';
}

interface BstRow { id: BestiaryId; name: string; where: string; body: string }
function bestiaryRows(): BstRow[] {
  const pick = (k: StrKey | undefined) => (k && has(k) ? t(k) : '');
  if (BESTIARY.length) return BESTIARY.map((b) => ({ id: b.id, name: pick(b.nameKey), where: pick(b.whereKey), body: pick(b.bodyKey) }));
  return BESTIARY_IDS.map((id) => ({ id, name: pick(`bst.${id}.name`), where: pick(`bst.${id}.where`), body: pick(`bst.${id}.body`) }));
}

/** 备忘录: objective, the three rules, frames ①②③④ with ✓, clues in order, 怪谈录 n/6 with thumbnails. */
export function renderMemo(core: Core, root: HTMLElement): void {
  const s = core.store.state;
  root.textContent = '';
  const page = h('div', 'ui-memo-body', { testid: 'memo-page' });
  const sec = (key: StrKey, vars?: Record<string, number>) => page.append(h('h4', '', { text: t(key, vars) }));
  sec('ui.memo.objective');
  page.append(h('p', 'ui-obj', { testid: 'memo-objective', text: objectiveText(s.objective) || t('ui.memo.noObjective') }));
  if (core.store.has('P1_done') || s.clues.includes('clue_rules')) {
    sec('ui.memo.rules');
    for (const k of ['ui.memo.rule1', 'ui.memo.rule2', 'ui.memo.rule3']) page.append(h('p', '', { text: t(k) }));
  }
  const frames = [1, 2, 3, 4] as const;
  if (core.store.has('ch3_started') || frames.some((n) => core.store.has(`frame_${n}`))) {
    sec('ui.memo.frames');
    const box = h('div', 'ui-frames', { testid: 'memo-frames' });
    for (const n of frames) {
      const got = core.store.has(`frame_${n}`);
      const p = h('p', got ? 'ui-got' : '', { text: t(`ui.memo.frame${n}`) });
      if (got) p.append(h('span', 'ui-check', { text: t('ui.memo.check') }));
      box.append(p);
    }
    page.append(box);
  }
  sec('ui.memo.clues');
  const clues = s.clues.filter((c) => c !== 'clue_rules').map(clueText).filter(Boolean);
  if (!clues.length) page.append(h('p', '', { text: t('ui.memo.noClues') }));
  for (const c of clues) page.append(h('p', 'ui-clue', { text: `\u00B7 ${c}` }));
  const rows = bestiaryRows();
  const n = s.bestiary.length;
  sec('ui.memo.bestiary', { n });
  const grid = h('div', 'ui-bst', { testid: 'memo-bestiary' });
  for (const r of rows) {
    const got = s.bestiary.includes(r.id);
    const cell = h('div', `ui-bst-cell${got ? ' ui-got' : ''}`, { testid: `bst-${r.id}` });
    const photo = got ? s.photos.find((p) => p.tags.includes(r.id) || p.tags.includes(`bst:${r.id}`)) : undefined;
    cell.append(photoImg(photo?.dataURL ?? '', 'ui-thumb', r.name, got ? r.name : t('ui.memo.unknown')));
    cell.append(h('div', 'ui-bname', { text: got ? r.name : t('ui.memo.unknown') }));
    cell.append(h('div', 'ui-bbody', { text: got ? r.body : r.where }));
    grid.append(cell);
  }
  page.append(grid);
  root.append(page);
}
