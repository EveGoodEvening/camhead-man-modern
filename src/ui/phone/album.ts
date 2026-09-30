// src/ui/phone/album.ts — owner E. 相册 (GDD §16.4, §3.13): the items row, the polaroid grid (`album-item-<id>`), the
// detail view (label · time · zoom · 普通/夜景 · 闪光), 「设为对照」 (`album-setref`), 「删除」 (not presets), and after
// P1_done the back of ph_2006_group (clue_photo_back, GDD P1 success).
import type { InputApi } from '../../contracts';
import type { Photo } from '../../types';
import { CLUES, ITEMS, PRESET_PHOTOS } from '../../data/items';
import { has, t } from '../../data/zh';
import type { UiCtx } from '../ctx';
import { h, icon, photoImg, tiltOf } from '../dom';
import { FocusNav } from '../modal';
import { presetMeta } from './presetMeta';

export interface AlbumPage {
  render(host: HTMLElement): void;
  tick(i: InputApi): 'close' | 'handled' | 'pass';
  reset(): void;
}

/** P3r2 U5: the grid caption. Story photos get a short 「2011 庙会」 (their full titles are cut under a polaroid);
 *  the detail view keeps the full label. */
export function gridCaption(p: Pick<Photo, 'label' | 'preset'>): string {
  const k = p.preset ? `ui.album.short.${p.preset}` : '';
  return k && has(k) ? t(k) : p.label;
}

export function itemName(id: string): string {
  const d = ITEMS.find((x) => x.id === id);
  return d && has(d.nameKey) ? t(d.nameKey) : has(`item.${id}`) ? t(`item.${id}`) : id;
}
export function itemDesc(id: string): string {
  const d = ITEMS.find((x) => x.id === id);
  return d && has(d.descKey) ? t(d.descKey) : has(`item.${id}.desc`) ? t(`item.${id}.desc`) : '';
}
export function itemIcon(id: string) {
  const d = ITEMS.find((x) => x.id === id);
  if (d) return icon(d.icon);
  return icon(id.startsWith('frame') ? 'negative' : id.startsWith('key') ? 'key' : id === 'cinnabar_dot' ? 'dot' : id === 'envelope_dad' ? 'envelope' : 'note');
}
function clueText(id: string): string {
  const d = CLUES.find((c) => c.id === id);
  return d && has(d.textKey) ? t(d.textKey) : has(`clue.${id}`) ? t(`clue.${id}`) : '';
}
/** 'ph_2006_group' back text after P1 (GDD P1 success): the text after the clue's 「：」 prefix. */
function backText(): string {
  const s = clueText('clue_photo_back');
  const k = s.indexOf('\uFF1A');
  return k >= 0 ? s.slice(k + 1) : s;
}

export function createAlbum(ctx: UiCtx): AlbumPage {
  const { core } = ctx;
  let detail: string | null = null;
  let flipped = false;
  let confirmDel = false;
  let itemInfo = '';
  const nav = new FocusNav();
  let host: HTMLElement | null = null;
  let deleting = false;
  core.bus.on('photoRemoved', (e) => { if (detail === e.id) detail = null; if (!deleting && host?.isConnected) api.render(host); });

  const meta = (p: Photo) => {
    const row = h('div', 'ui-row');
    const pm = presetMeta(PRESET_PHOTOS.find((d) => d.id === p.preset));
    if (pm) {   // old prints / the darkroom stitch: never today's clock and lens settings (P3 U7)
      for (const x of pm.row) row.append(h('span', '', { text: 'key' in x ? t(x.key) : x.text }));
      return row;
    }
    row.append(h('span', '', { text: p.clock }), h('span', '', { text: t('ui.album.zoom', { z: p.zoom }) }),
      h('span', '', { text: t(p.night ? 'ui.album.night' : 'ui.album.normal') }), h('span', '', { text: t(p.flash ? 'ui.album.flashOn' : 'ui.album.flashOff') }));
    return row;
  };

  const renderGrid = (root: HTMLElement) => {
    const s = core.store.state;
    const items = h('div', 'ui-items', { testid: 'album-items' }, [h('span', 'ui-lbl', { text: t('ui.album.items') })]);
    if (!s.items.length) items.append(h('span', 'ui-empty-inline', { text: t('ui.album.noItems') }));
    const focus: HTMLElement[] = [];
    for (const id of s.items) {
      const b = h('button', 'ui-item', { testid: `album-itemicon-${id}`, title: itemName(id) }, [itemIcon(id)]);
      b.addEventListener('click', () => { itemInfo = `${itemName(id)}${itemDesc(id) ? `\uFF1A${itemDesc(id)}` : ''}`; api.render(root); });
      items.append(b);
    }
    root.append(items);
    if (itemInfo) root.append(h('div', 'ui-meta', { text: itemInfo }));
    const photos = [...s.photos].sort((a, b) => b.seq - a.seq);
    const nonKeep = s.photos.filter((p) => !p.keep).length;
    root.append(h('div', 'ui-album-head', {}, [h('span', '', { text: t('ui.phone.album') }), h('span', '', { text: t('ui.album.count', { n: nonKeep }) })]));
    if (!photos.length) { root.append(h('div', 'ui-empty', { text: t('ui.album.empty') })); nav.set([], 3); return; }
    const grid = h('div', 'ui-grid');
    for (const p of photos) {
      const c = h('button', 'ui-polaroid', { testid: `album-item-${p.id}` });
      c.style.rotate = `${tiltOf(p.id, -4, 4).toFixed(2)}deg`;
      c.append(photoImg(p.dataURL, 'ui-thumb', p.label, p.label || t('ui.album.noImage')), h('span', 'ui-cap', { text: gridCaption(p) }));
      c.title = p.label;
      if (s.refPhotoId === p.id) c.append(h('span', 'ui-badge', { text: t('ui.album.isref') }));
      else if (p.preset) c.append(h('span', 'ui-badge ui-keep', { text: t('ui.album.preset') }));
      c.addEventListener('click', () => { detail = p.id; flipped = false; confirmDel = false; api.render(root); });
      grid.append(c);
      focus.push(c);
    }
    root.append(grid);
    nav.set(focus, 3);
  };

  const renderDetail = (root: HTMLElement, p: Photo) => {
    const s = core.store.state;
    const wrap = h('div', 'ui-detail', { testid: 'album-detail' });
    const big = h('div', 'ui-big');
    const canFlip = p.preset === 'ph_2006_group' && core.store.has('P1_done') && !!backText();
    if (flipped && canFlip) big.append(h('div', 'ui-back-side', { testid: 'album-back-text', text: backText() }));
    else big.append(photoImg(p.dataURL, 'ui-thumb', p.label, p.label || t('ui.album.noImage')));
    const pm = presetMeta(PRESET_PHOTOS.find((d) => d.id === p.preset));
    const cap = pm ? pm.caption : p.clock;
    if (cap) big.append(h('span', 'ui-cap', { text: cap }));
    const m = h('div', 'ui-meta');
    m.append(h('div', 'ui-label', { text: p.label }), meta(p));
    if (p.tags.includes('mirror_selfie')) m.append(h('div', '', { text: t('ui.album.sticker') }));
    const acts = h('div', 'ui-actions');
    const focus: HTMLElement[] = [];
    const isRef = s.refPhotoId === p.id;
    const setref = h('button', 'ui-sbtn ui-slab ui-yellow', { text: t(isRef ? 'ui.album.isref' : 'ui.album.setref'), testid: 'album-setref' });
    setref.addEventListener('click', () => { core.store.setRefPhoto(p.id); ctx.sfx('sfx_click'); api.render(root); });
    acts.append(setref); focus.push(setref);
    if (canFlip) {
      const flip = h('button', 'ui-sbtn ui-slab', { text: t(flipped ? 'ui.album.front' : 'ui.album.flip'), testid: 'album-flip' });
      flip.addEventListener('click', () => { flipped = !flipped; ctx.sfx('sfx_paper'); api.render(root); });
      acts.append(flip); focus.push(flip);
    }
    if (!p.preset) {
      const del = h('button', 'ui-sbtn ui-slab ui-red', { text: t(confirmDel ? 'ui.album.confirmDelete' : 'ui.album.delete'), testid: 'album-delete' });
      del.addEventListener('click', () => {
        if (!confirmDel) { confirmDel = true; api.render(root); return; }
        deleting = true;
        core.store.removePhoto(p.id);
        deleting = false;
        detail = null; confirmDel = false; api.render(root);
      });
      acts.append(del); focus.push(del);
    }
    const back = h('button', 'ui-sbtn ui-slab', { text: t('ui.album.back'), testid: 'album-back' });
    back.addEventListener('click', () => { detail = null; api.render(root); });
    acts.append(back); focus.push(back);
    wrap.append(big, m, acts);
    root.append(wrap);
    nav.set(focus, focus.length, false);
  };

  const api: AlbumPage = {
    reset() { detail = null; flipped = false; confirmDel = false; itemInfo = ''; },
    render(root) {
      host = root;
      const keepScroll = root.scrollTop;
      root.textContent = '';
      const p = detail ? core.store.photo(detail) : null;
      if (p) renderDetail(root, p); else { detail = null; renderGrid(root); }
      root.scrollTop = p ? 0 : keepScroll;
    },
    tick(i) {
      if (detail && i.pressed('escape')) { detail = null; if (host) api.render(host); return 'handled'; }
      return nav.tick(i) ? 'handled' : 'pass';
    },
  };
  return api;
}
