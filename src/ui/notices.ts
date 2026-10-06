// Third-party notices share the settings modal context; the public file is the single source of text.
import { t } from '../data/zh';
import { h } from './dom';
import type { ModalEntry, ModalStack } from './modal';

export function openNotices(modals: ModalStack, onDone: () => void): void {
  if (modals.top?.el.dataset.testid === 'notices-wrap') return;
  const wrap = h('div', 'ui-menu-wrap', { testid: 'notices-wrap' });
  const panel = h('div', 'ui-menu ui-slab ui-notices ui-stamp', {
    testid: 'notices', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'notices-title' },
  });
  const title = h('h2', 'ui-extrude', { text: t('ui.notices'), attrs: { id: 'notices-title', 'data-text': t('ui.notices') } });
  const text = h('pre', 'ui-notices-text', {
    text: t('ui.notices.loading'), testid: 'notices-text',
    attrs: { tabindex: '0', 'aria-labelledby': 'notices-title', 'aria-busy': 'true' },
  });
  const done = h('button', 'ui-btn', { text: t('ui.back'), testid: 'notices-done' });
  panel.append(title, text, done);
  wrap.append(panel);
  const controller = new AbortController();
  const entry: ModalEntry = {
    kind: 'settings', el: wrap,
    onKey(e) {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyE' || (e.code === 'Space' && document.activeElement === done)) {
        modals.close(entry);
        return true;
      }
      if (e.code === 'Tab') {
        (document.activeElement === text ? done : text).focus();
        return true;
      }
      // Core consumes navigation keys, so scroll explicitly, including while the game loop is paused.
      switch (e.code) {
        case 'ArrowDown': case 'KeyS': text.scrollTop += 48; return true;
        case 'ArrowUp': case 'KeyW': text.scrollTop -= 48; return true;
        case 'PageDown': text.scrollTop += text.clientHeight * 0.9; return true;
        case 'PageUp': text.scrollTop -= text.clientHeight * 0.9; return true;
        case 'Space': text.scrollTop += text.clientHeight * 0.9 * (e.shiftKey ? -1 : 1); return true;
        case 'Home': text.scrollTop = 0; return true;
        case 'End': text.scrollTop = text.scrollHeight; return true;
      }
      return false;
    },
    onClose() { controller.abort(); onDone(); },
  };
  done.addEventListener('click', () => modals.close(entry));
  modals.push(entry);
  text.focus();
  void fetch(`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Third-party notices: HTTP ${response.status}`);
      text.textContent = await response.text();
    })
    .catch(() => { if (!controller.signal.aborted) text.textContent = t('ui.notices.error'); })
    .finally(() => text.removeAttribute('aria-busy'));
}
