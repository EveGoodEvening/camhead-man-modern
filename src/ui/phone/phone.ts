// src/ui/phone/phone.ts — owner E. The phone overlay (Tab / J; GDD §16.4, ART §8.2): an ink-slab phone with three tabs
// 相册 / 微信 / 备忘录 (`phone-tab-*`). Keys: Tab album/close, J memo/close, 1 2 3 switch, arrows + E navigate, Esc back/close.
import type { UiCtx } from '../ctx';
import { h } from '../dom';
import { barsEl } from '../hud/hud';
import { touchCapable } from '../touch';
import type { ModalEntry, ModalStack } from '../modal';
import type { WxRuntime } from '../wx';
import { t } from '../../data/zh';
import { createAlbum } from './album';
import { renderMemo, renderWx } from './pages';

export type PhoneTab = 'album' | 'wx' | 'memo';
export interface Phone {
  open(tab?: PhoneTab): void;
  close(): void;
  readonly isOpen: boolean;
  readonly tab: PhoneTab;
}

const TABS: readonly PhoneTab[] = ['album', 'wx', 'memo'];

export function createPhone(ctx: UiCtx, modals: ModalStack, wx: WxRuntime, requestHint: () => void): Phone {
  const { core } = ctx;
  const album = createAlbum(ctx);
  let tab: PhoneTab = 'album';
  let entry: ModalEntry | null = null;
  let bars = 1;
  core.bus.on('signalChanged', (e) => { bars = e.bars; });

  const wrap = h('div', 'ui-phone-wrap');
  const phone = h('div', 'ui-phone ui-stamp', { testid: 'phone' });
  const bar = h('div', 'ui-phone-bar');
  const barTime = h('span', '');
  const sig = barsEl();
  bar.append(barTime, h('span', 'ui-right', {}, [sig.el, h('span', 'ui-batt'), h('span', '', { text: t('ui.battery') })]));
  const tabs = h('div', 'ui-tabs');
  const tabBtns = TABS.map((k) => {
    const b = h('button', 'ui-tab', { testid: `phone-tab-${k}`, text: t(`ui.phone.${k}`) });
    b.addEventListener('click', () => select(k));
    tabs.append(b);
    return b;
  });
  const page = h('div', 'ui-page');
  const scroll = h('div', 'ui-scroll');
  page.append(scroll);
  const keys = h('div', 'ui-phone-keys', { text: t(touchCapable() ? 'ui.touch.phoneKeys' : 'ui.phoneKeys') });
  phone.append(bar, tabs, page, keys);
  wrap.append(phone);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) api.close(); });

  const render = () => {
    barTime.textContent = core.store.state.clock;
    sig.set(bars);
    tabBtns.forEach((b, i) => {
      b.classList.toggle('ui-on', TABS[i] === tab);
      b.querySelector('.ui-dot')?.remove();
      if (TABS[i] === 'wx' && wx.unread > 0 && tab !== 'wx') b.append(h('span', 'ui-dot'));
    });
    page.className = `ui-page${tab === 'memo' ? ' ui-memo' : ''}`;
    scroll.style.padding = tab === 'wx' ? '0' : '';
    if (tab === 'album') album.render(scroll);
    else if (tab === 'wx') { wx.markRead(); renderWx(core, wx, scroll, requestHint); }
    else renderMemo(core, scroll);
  };
  const select = (k: PhoneTab) => {
    if (k !== tab) { tab = k; album.reset(); scroll.scrollTop = 0; ctx.sfx('sfx_click'); }
    render();
  };
  const rerender = () => { if (entry) render(); };
  wx.onChange(rerender);
  for (const ev of ['photoTaken', 'photoRemoved', 'refPhotoChanged', 'itemGained', 'clueAdded', 'objectiveChanged', 'bestiaryAdded', 'stateLoaded', 'flagSet'] as const) {
    core.bus.on(ev, rerender);
  }

  const api: Phone = {
    get isOpen() { return entry !== null; },
    get tab() { return tab; },
    open(k = 'album') {
      if (!core.store.hasVerb('phone')) return;
      tab = k;
      album.reset();
      if (!entry) {
        entry = {
          kind: 'phone', el: wrap,
          onTick(i) {
            if (i.pressed('phone')) { if (tab === 'album') api.close(); else select('album'); return; }
            if (i.pressed('memo')) { if (tab === 'memo') api.close(); else select('memo'); return; }
            if (i.pressed('choice1')) { select('album'); return; }
            if (i.pressed('choice2')) { select('wx'); return; }
            if (i.pressed('choice3')) { select('memo'); return; }
            if (i.pressed('hint') && tab === 'wx') { requestHint(); return; }
            if (tab === 'album') {
              const r = album.tick(i);
              if (r !== 'pass') return;
            } else if (i.pressed('forward') || i.pressed('back')) {
              scroll.scrollTop += i.pressed('back') ? 80 : -80;
              const log = scroll.querySelector('.ui-wx-log');
              if (log) log.scrollTop += i.pressed('back') ? 80 : -80;
              return;
            } else if (tab === 'wx' && i.pressed('advance')) { requestHint(); return; }
            if (i.pressed('escape')) api.close();
          },
          onClose() { entry = null; },
        };
        modals.push(entry);
        ctx.sfx('sfx_click');
      }
      render();
    },
    close() { if (entry) modals.close(entry); },
  };
  return api;
}
