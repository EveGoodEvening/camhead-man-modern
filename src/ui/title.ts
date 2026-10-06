// src/ui/title.ts — owner E. The title screen (GDD §1, ART §8.2): 「显影」 blocky extruded lettering over the planet,
// 「望潮里志怪」 below, yellow 「开机」, white 「继续」 (only with a save), 「设置」 and 「第三方许可」.
import type { InputApi } from '../contracts';
import { t } from '../data/zh';
import type { UiCtx } from './ctx';
import { h, showEl, tiltOf } from './dom';
import { FocusNav, keyAdvance } from './modal';

export interface TitleView {
  readonly el: HTMLElement;
  show(hasSave: boolean, replay?: boolean): void;
  hide(): void;
  readonly shown: boolean;
  tick(i: InputApi): void;
}

function lettering(text: string, cls: string, delay0: number): HTMLElement {
  const row = h('div', cls);
  [...text].forEach((ch, i) => {
    const g = h('span', 'ui-glyph', { text: ch, attrs: { 'data-text': ch } });
    const rot = tiltOf(`${ch}${i}r`, -2, 2), dy = tiltOf(`${ch}${i}y`, -3, 3);
    g.style.transform = `translateY(calc(${dy.toFixed(2)} * var(--px))) rotate(${rot.toFixed(2)}deg)`;
    g.style.animationDelay = `${delay0 + i * 60}ms`;
    row.append(g);
  });
  return row;
}

export function createTitle(ctx: UiCtx, o: { start(): void; cont(): void; settings(): void; notices(onDone: () => void): void }): TitleView {
  const el = h('div', 'ui-title ui-hidden', { testid: 'title' });
  const logo = h('div', 'ui-logo');
  const main = lettering(t('ui.title'), 'ui-logo-main', 0);
  const sub = lettering(t('ui.subtitle'), 'ui-logo-sub', 180);
  logo.append(main, sub);
  const start = h('button', 'ui-btn', { text: t('ui.start'), testid: 'title-start' });
  const cont = h('button', 'ui-btn ui-white', { text: t('ui.continue'), testid: 'title-continue' });
  const sett = h('button', 'ui-btn ui-white', { text: t('ui.settings'), testid: 'title-settings' });
  const notices = h('button', 'ui-btn ui-white', { text: t('ui.notices'), testid: 'title-notices' });
  const subRow = h('div', 'ui-title-sub', {}, [cont, sett, notices]);
  const menu = h('div', 'ui-title-menu', {}, [start, subRow]);
  el.append(logo, menu);
  start.addEventListener('click', () => o.start());
  cont.addEventListener('click', () => o.cont());
  sett.addEventListener('click', () => o.settings());
  notices.addEventListener('click', () => {
    nav.index = nav.items.indexOf(notices);
    nav.paint();
    o.notices(() => { if (shown) nav.paint(); });
  });
  const nav = new FocusNav();
  let shown = false;

  return {
    el,
    get shown() { return shown; },
    show(hasSave, replay = false) {
      shown = true;
      showEl(cont, hasSave);
      // P3r3 G9: after the credits the save is the bus-door checkpoint — 「重温结局」 instead of 「继续」
      cont.textContent = t(replay ? 'ui.replayEnding' : 'ui.continue');
      showEl(el, true);
      for (const g of el.querySelectorAll<HTMLElement>('.ui-glyph')) { g.classList.remove('ui-in'); void g.offsetWidth; g.classList.add('ui-in'); }
      // with a save, the default focus is 「继续」: a stray E / Space must never start over a saved game (P3 U1)
      nav.set(hasSave ? [start, cont, sett, notices] : [start, sett, notices], 1, false, hasSave ? 1 : 0);
      if (ctx.test) nav.items[nav.index]?.blur();
    },
    hide() { shown = false; showEl(el, false); },
    tick(i) {
      if (!shown || i.context() !== 'title') return;
      if (i.pressed('left') || i.pressed('forward')) nav.move(-1, 0);
      else if (i.pressed('right') || i.pressed('back')) nav.move(1, 0);
      // keys only: the title layer lets clicks through to the planet, and a canvas LMB is also `advance` (P3 U1)
      else if (keyAdvance(i)) nav.activate();
    },
  };
}
