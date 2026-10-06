// src/ui/pause.ts — owner E. Pause menu (GDD §4 Esc): 继续 / 设置 / 操作说明 / 第三方许可 / 回到标题 (with a confirm). The loop is paused, so all
// keys arrive as DOM keydowns; rendering continues underneath.
import type { Core } from '../contracts';
import { t } from '../data/zh';
import { h } from './dom';
import type { ModalEntry, ModalStack } from './modal';

export interface Pause { open(): void; close(): void; readonly isOpen: boolean }

export function createPause(core: Core, modals: ModalStack, o: { settings(onDone: () => void): void; controls(onDone: () => void): void; notices(onDone: () => void): void; toTitle(): void }): Pause {
  let entry: ModalEntry | null = null;
  const focusables: HTMLElement[] = [];

  const build = (): ModalEntry => {
    const wrap = h('div', 'ui-menu-wrap');
    const menu = h('div', 'ui-menu ui-slab ui-stamp', { testid: 'pause-menu' });
    const resume = h('button', 'ui-btn', { text: t('ui.resume'), testid: 'pause-resume' });
    const sett = h('button', 'ui-btn ui-white', { text: t('ui.settings'), testid: 'pause-settings' });
    const ctl = h('button', 'ui-btn ui-white', { text: t('ui.controls'), testid: 'pause-controls' });
    const notices = h('button', 'ui-btn ui-white', { text: t('ui.notices'), testid: 'pause-notices' });
    const back = h('button', 'ui-btn ui-white', { text: t('ui.backToTitle'), testid: 'pause-title' });
    const confirm = h('div', 'ui-hidden');
    const yes = h('button', 'ui-btn', { text: t('ui.yes'), testid: 'pause-confirm-yes' });
    const no = h('button', 'ui-btn ui-white', { text: t('ui.no'), testid: 'pause-confirm-no' });
    confirm.append(h('p', '', { text: t('ui.confirmBack') }), h('div', 'ui-title-sub', {}, [no, yes]));
    confirm.style.display = 'flex'; confirm.style.flexDirection = 'column'; confirm.style.gap = 'calc(16 * var(--px))'; confirm.style.alignItems = 'center';
    const main = h('div', '', {}, [resume, sett, ctl, notices, back]);
    main.style.display = 'flex'; main.style.flexDirection = 'column'; main.style.gap = 'calc(20 * var(--px))';
    menu.append(h('h2', 'ui-extrude', { text: t('ui.pause'), attrs: { 'data-text': t('ui.pause') } }), main, confirm);
    wrap.append(menu);
    const setFocus = (list: HTMLElement[]) => { focusables.length = 0; focusables.push(...list); list[0]?.focus(); };
    const showConfirm = (on: boolean) => {
      confirm.classList.toggle('ui-hidden', !on); main.classList.toggle('ui-hidden', on);
      setFocus(on ? [no, yes] : [resume, sett, ctl, notices, back]);
    };
    // back from a sub-page: focus the button that opened it (keyboard players keep their place)
    const refocus = (b: HTMLElement) => () => { if (entry) b.focus(); };
    resume.addEventListener('click', () => api.close());
    sett.addEventListener('click', () => o.settings(refocus(sett)));
    ctl.addEventListener('click', () => o.controls(refocus(ctl)));
    notices.addEventListener('click', () => o.notices(refocus(notices)));
    back.addEventListener('click', () => showConfirm(true));
    no.addEventListener('click', () => showConfirm(false));
    yes.addEventListener('click', () => { api.close(); o.toTitle(); });
    const e: ModalEntry = {
      kind: 'pause', el: wrap,
      onKey(ev) {
        if (ev.code === 'Escape') { if (!confirm.classList.contains('ui-hidden')) showConfirm(false); else api.close(); return true; }
        if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp' || ev.code === 'ArrowLeft' || ev.code === 'ArrowRight' || ev.code === 'KeyW' || ev.code === 'KeyS') {
          const i = focusables.indexOf(document.activeElement as HTMLElement);
          const d = ev.code === 'ArrowDown' || ev.code === 'ArrowRight' || ev.code === 'KeyS' ? 1 : -1;
          focusables[(i + d + focusables.length) % focusables.length]?.focus();
          return true;
        }
        if (ev.code === 'Space' || ev.code === 'KeyE') { (document.activeElement as HTMLElement | null)?.click(); return true; }
        return false;
      },
      onClose() { entry = null; core.loop.setPaused(false); },
    };
    setTimeout(() => setFocus([resume, sett, ctl, notices, back]), 0);
    return e;
  };

  const api: Pause = {
    get isOpen() { return entry !== null; },
    open() {
      if (entry) return;
      entry = build();
      modals.push(entry);
      core.loop.setPaused(true);
    },
    close() { if (entry) modals.close(entry); },
  };
  return api;
}
