// src/ui/p3ui.test.ts — owner E. P3 UI fixes: key-only focus activation (U1 title click, U2 keypad bleed), the touch
// button set (U3), toast dedupe (U6) and preset photo metadata (U7).
import { describe, expect, it } from 'vitest';
import type { InputAction, InputApi } from '../contracts';
import { PRESET_PHOTOS } from '../data/items';
import { has } from '../data/zh';
import { liveDuplicate } from './hud/toast';
import { endAdvanceTick, FocusNav, keyAdvance, trackAdvanceSource } from './modal';
import { presetMeta, stampDate } from './phone/presetMeta';
import { touchButtons, touchKey, type TouchState } from './touch';

const fakeInput = (pressed: readonly InputAction[]): InputApi => ({ pressed: (a: InputAction) => pressed.includes(a) } as unknown as InputApi);
const fakeBtn = () => {
  const b = { clicks: 0, sel: false, click() { b.clicks++; }, focus() { /* node */ }, blur() { /* node */ },
    classList: { toggle(_c: string, on: boolean) { b.sel = on; } } };
  return b;
};

describe('focus activation is key-only (U1, U2)', () => {
  it('a canvas left click is not a key advance; a Space / E keydown or the next tick clears it', () => {
    const canvas = new EventTarget(), win = new EventTarget();
    trackAdvanceSource(canvas, win);
    const adv = fakeInput(['advance', 'shutter']);
    expect(keyAdvance(adv)).toBe(true);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    expect(keyAdvance(adv)).toBe(false);
    win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space' }));
    expect(keyAdvance(adv)).toBe(true);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    endAdvanceTick();
    expect(keyAdvance(adv)).toBe(true);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 2 }));   // RMB never advances anyway
    expect(keyAdvance(adv)).toBe(true);
  });

  it('FocusNav: the title opens on 「继续」 when a save exists and a mouse advance clicks nothing', () => {
    const [start, cont, sett] = [fakeBtn(), fakeBtn(), fakeBtn()];
    const nav = new FocusNav();
    nav.set([start, cont, sett] as unknown as HTMLElement[], 1, false, 1);
    expect(nav.index).toBe(1);
    const canvas = new EventTarget();
    trackAdvanceSource(canvas, new EventTarget());
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    expect(nav.tick(fakeInput(['advance', 'shutter']))).toBe(false);
    expect(start.clicks + cont.clicks + sett.clicks).toBe(0);
    endAdvanceTick();
    nav.tick(fakeInput(['advance', 'interact']));
    expect(cont.clicks).toBe(1);
    expect(start.clicks).toBe(0);
  });

  it('armOnNav (keypads): E / Space type nothing until an arrow key shows the focus', () => {
    const keys = [fakeBtn(), fakeBtn(), fakeBtn()];
    const nav = new FocusNav({ armOnNav: true });
    nav.set(keys as unknown as HTMLElement[], 3, false);
    endAdvanceTick();
    for (let k = 0; k < 6; k++) nav.tick(fakeInput(['advance', k % 2 ? 'interact' : 'shutter']));
    expect(keys.map((b) => b.clicks)).toEqual([0, 0, 0]);
    expect(keys.some((b) => b.sel)).toBe(false);
    nav.tick(fakeInput(['right']));             // first arrow: shows the focus on key 1, does not move
    expect(nav.index).toBe(0);
    expect(keys[0].sel).toBe(true);
    nav.tick(fakeInput(['right']));
    nav.tick(fakeInput(['advance', 'interact']));
    expect(keys.map((b) => b.clicks)).toEqual([0, 1, 0]);
    nav.set(keys as unknown as HTMLElement[], 3, false);   // reopened: disarmed again
    nav.tick(fakeInput(['advance']));
    expect(keys.map((b) => b.clicks)).toEqual([0, 1, 0]);
  });
});

describe('touch buttons (U3)', () => {
  const base: TouchState = {
    mode: 'gameplay', peek: null, zoom: 1, night: false, flash: false, overlay: false,
    verbs: { night: false, show: false }, hasRef: false, showTarget: false, prompt: false, dark: false, torch: false,
  };
  it('every context has 返回 (Esc); the lh_door peek can be left', () => {
    for (const s of [base, { ...base, mode: 'viewfinder' as const }, { ...base, mode: 'peek' as const, peek: 'pk_coop' },
      { ...base, peek: 'lh_door' }]) {
      expect(touchButtons(s)).toContain('back');
      expect(touchKey('back', s)).toBe('Escape');
    }
    expect(touchButtons({ ...base, peek: 'lh_door' })).not.toContain('view');
  });
  it('lens tools only in the viewfinder, night / overlay / show once available', () => {
    expect(touchButtons(base)).toEqual(['back', 'phone', 'view', 'use']);
    const vf = { ...base, mode: 'viewfinder' as const };
    expect(touchButtons(vf)).toEqual(['back', 'view', 'use', 'shutter', 'zoom', 'flash']);
    expect(touchButtons({ ...vf, verbs: { night: true, show: true }, hasRef: true })).toEqual(
      ['back', 'view', 'use', 'shutter', 'zoom', 'flash', 'night', 'overlay']);
    expect(touchButtons({ ...base, verbs: { night: true, show: true }, showTarget: true })).toContain('show');
    expect(touchButtons({ ...base, verbs: { night: true, show: true }, showTarget: false })).not.toContain('show');
  });
  it('keys: zoom cycles 1 → 3 → 10 → 1, the rest map to the keyboard', () => {
    expect([1, 3, 10].map((z) => touchKey('zoom', { ...base, zoom: z as 1 | 3 | 10 }))).toEqual(['Digit2', 'Digit3', 'Digit1']);
    expect(['night', 'flash', 'overlay', 'show', 'shutter', 'use', 'view', 'phone'].map((b) => touchKey(b as never, base)))
      .toEqual(['KeyN', 'KeyQ', 'KeyR', 'KeyG', 'Space', 'KeyE', 'KeyF', 'Tab']);
  });
  it('every tutorial has touch copy that names no keyboard key', () => {
    for (const id of ['tut_phone', 'tut_view', 'tut_overlay', 'tut_zoom', 'tut_burst', 'tut_show', 'tut_night', 'tut_flash', 'tut_detach', 'tut_hint']) {
      expect(has(`tut.touch.${id}`)).toBe(true);
    }
  });
});

describe('toasts (U6)', () => {
  it('an identical visible toast is refreshed, not stacked', () => {
    const live = [{ sig: 'wx|土地正在输入…' }, { sig: 'item|获得：钥匙' }];
    expect(liveDuplicate(live, 'wx|土地正在输入…')).toBe(0);
    expect(liveDuplicate(live, 'plain|土地正在输入…')).toBe(-1);
  });
});

describe('preset photo metadata (U7)', () => {
  const def = (id: string) => PRESET_PHOTOS.find((p) => p.id === id);
  it('old prints show their own date and 翻拍 · 旧照, never the current clock or lens settings', () => {
    expect(stampDate("'06 8 15")).toBe('2006.08.15');
    expect(stampDate('bogus')).toBeNull();
    expect(presetMeta(def('ph_2006_group'))).toEqual({ caption: '2006.08.15', row: [{ key: 'ui.album.oldPhoto' }, { text: '2006.08.15' }] });
    expect(presetMeta(def('ph_temple_2011'))?.row).toEqual([{ key: 'ui.album.oldPhoto' }]);
    expect(presetMeta(def('ph_2023_stitched'))?.row).toEqual([{ key: 'ui.album.stitched' }]);
    expect(presetMeta(def('ph_2026_group'))).toBeNull();   // the tripod really took it now
    expect(presetMeta(undefined)).toBeNull();
    for (const k of ['ui.album.oldPhoto', 'ui.album.stitched']) expect(has(k)).toBe(true);
  });
});
