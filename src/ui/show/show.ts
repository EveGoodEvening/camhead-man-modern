// src/ui/show/show.ts — owner E. The show engine (GDD §3.9, §12; ARCHITECTURE §3.E item 7): the album picker
// (`show-picker`, two photos only for the gate), reaction lookup, the gate verdict, hero back-screen, show/showResult.
import type { Photo, ReceiverId } from '../../types';
import { GATE_OUTCOMES, SHOW_FALLBACK, SHOW_REACTIONS } from '../../data/show';
import { t } from '../../data/zh';
import type { UiCtx } from '../ctx';
import { h, photoImg, tiltOf } from '../dom';
import { FocusNav, type ModalEntry, type ModalStack } from '../modal';
import { findReaction, gateVerdict, maxPhotos, tagsOf } from './logic';

export interface ShowEngine {
  openShow(receiver: ReceiverId): Promise<void>;
  show(receiver: ReceiverId, photoIds: readonly string[]): Promise<void>;
}

export function photoTitle(p: Photo): string {
  return p.label || t('ui.album.noImage');
}

export function createShow(ctx: UiCtx, modals: ModalStack, startNode: (id: Photo['id']) => Promise<void>): ShowEngine {
  const { core } = ctx;

  const api: ShowEngine = {
    openShow(receiver) {
      if (modals.has('show')) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const max = maxPhotos(receiver);
        const picked: string[] = [];
        const nav = new FocusNav();
        const wrap = h('div', 'ui-picker-wrap');
        const panel = h('div', 'ui-picker ui-slab ui-stamp', { testid: 'show-picker' });
        const title = h('h3', '', { text: t('ui.show.title') });
        const sub = h('div', 'ui-sub', { text: t(max === 2 ? 'ui.show.pickTwo' : 'ui.show.pickOne') });
        const grid = h('div', 'ui-picker-grid');
        const ok = h('button', 'ui-sbtn ui-slab ui-yellow', { text: t('ui.show.confirm'), testid: 'show-confirm' });
        const cancel = h('button', 'ui-sbtn ui-slab', { text: t('ui.show.cancel'), testid: 'show-cancel' });
        const photos = [...core.store.state.photos].sort((a, b) => b.seq - a.seq);
        const cells = photos.map((p) => {
          const c = h('button', 'ui-polaroid', { testid: `show-item-${p.id}` });
          c.style.rotate = `${tiltOf(p.id, -4, 4).toFixed(2)}deg`;
          c.append(photoImg(p.dataURL, 'ui-thumb', p.label, photoTitle(p)), h('span', 'ui-cap', { text: p.label }));
          c.addEventListener('click', () => {
            const k = picked.indexOf(p.id);
            if (k >= 0) picked.splice(k, 1);
            else { if (picked.length >= max) picked.shift(); picked.push(p.id); }
            paint();
          });
          grid.append(c);
          return { c, p };
        });
        const paint = () => {
          for (const { c, p } of cells) {
            const k = picked.indexOf(p.id);
            c.querySelector('.ui-badge')?.remove();
            if (k >= 0) c.append(h('span', 'ui-badge', { text: String(k + 1) }));
          }
          ok.disabled = picked.length === 0;
        };
        if (!photos.length) grid.append(h('div', 'ui-empty', { text: t('ui.show.empty') }));
        panel.append(title, sub, grid, h('div', 'ui-picker-row', {}, [cancel, ok]));
        wrap.append(panel);
        const entry: ModalEntry = {
          kind: 'show', el: wrap,
          onTick(i) {
            if (i.pressed('escape') || i.pressed('show')) { modals.close(entry); return; }
            nav.tick(i);
          },
          onClose: () => resolve(),
        };
        ok.addEventListener('click', () => {
          if (!picked.length) return;
          const ids = [...picked];
          modals.close(entry);
          void api.show(receiver, ids);
        });
        cancel.addEventListener('click', () => modals.close(entry));
        modals.push(entry);
        nav.set([...cells.map((x) => x.c as HTMLElement), cancel, ok], 4, false);
        paint();
      });
    },

    show(receiver, photoIds) {
      const photos = photoIds.map((id) => core.store.photo(id)).filter((p): p is Photo => !!p);
      if (!photos.length) { core.log.warn(`[ui] show: no such photos ${photoIds.join(',')}`); return Promise.resolve(); }
      const ids = photos.map((p) => p.id);
      modals.closeKind('show');
      core.bus.emit('show', { receiver, photoIds: ids });
      try { core.services.chars.hero.setScreen('show', { photoIds: ids, seconds: 3 }); } catch { /* chars not ready */ }
      let node: string | null = null;
      let actions: readonly import('../../types').Action[] | undefined;
      if (receiver === 'gate') {
        const out = GATE_OUTCOMES[gateVerdict(photos)];
        node = out?.node ?? null; actions = out?.actions;
      } else {
        const r = findReaction(receiver, tagsOf(photos), SHOW_REACTIONS, SHOW_FALLBACK, core.rules.evalCond);
        node = r?.node ?? null; actions = r?.actions;
      }
      // state first, synchronously (a following goto in the same debug evaluate depends on it: GDD §19.3 P3)
      if (actions?.length) void core.rules.run(actions, `show:${receiver}`);
      core.bus.emit('showResult', { receiver, node: (node as never) ?? null });
      return node ? startNode(node) : Promise.resolve();
    },
  };
  return api;
}
