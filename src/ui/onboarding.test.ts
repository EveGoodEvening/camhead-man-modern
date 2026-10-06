// src/ui/onboarding.test.ts — owner E. P3 round 2 onboarding: tutorial bubbles only in their own context (at most two,
// in teaching order), the first-minute move coach, the controls page rows and touch copy that never names a key.
import { describe, expect, it } from 'vitest';
import type { TutId } from '../types';
import { TUT_IDS } from '../data/ids/ui';
import { has, STR, t } from '../data/zh';
import { keyless } from '../data/zh/ui';
import { CONTROL_ROWS, keyTokens } from './controls';
import { MAX_TUTS, MOVE_DONE, MoveCoach, TUT_ORDER, TUT_PLACE, tutFits, visibleTuts, type TutView } from './hud/tutorial';
import { touchButtons, touchKey, type TouchState } from './touch';

const play: TutView = { where: 'gameplay', showTarget: false, prompt: null };
const vf: TutView = { where: 'viewfinder', showTarget: false, prompt: null };
const phone: TutView = { where: 'phone', showTarget: false, prompt: null };
const other: TutView = { where: null, showTarget: false, prompt: null };
const KEYISH = /(^|[^A-Za-z])(Tab|Esc|Shift|WASD|[A-Z])(?![A-Za-z])|左键|右键|滚轮|鼠标|空格/;

describe('tutorial bubbles show only in their context (P3 round 2)', () => {
  it('every tutorial id has a place, an order slot and copy for keyboard and touch', () => {
    for (const id of TUT_IDS) {
      expect(TUT_PLACE[id], id).toBeDefined();
      expect(TUT_ORDER, id).toContain(id);
      expect(has(`tut.${id}`), id).toBe(true);
      if (id !== 'tut_setref') expect(has(`tut.touch.${id}`), id).toBe(true);
    }
    expect(new Set(TUT_ORDER).size).toBe(TUT_ORDER.length);
  });
  it('viewfinder bubbles never show while walking, walking bubbles never in the viewfinder', () => {
    for (const id of ['tut_shutter', 'tut_overlay', 'tut_zoom', 'tut_burst', 'tut_flash', 'tut_night'] as TutId[]) {
      expect(tutFits(id, vf), id).toBe(true);
      expect(tutFits(id, play), id).toBe(false);
    }
    for (const id of ['tut_move', 'tut_phone', 'tut_view', 'tut_menu'] as TutId[]) {
      expect(tutFits(id, play), id).toBe(true);
      expect(tutFits(id, vf), id).toBe(false);
    }
    expect(tutFits('tut_setref', phone)).toBe(true);
    expect(tutFits('tut_setref', play)).toBe(false);
    for (const id of TUT_IDS) expect(tutFits(id, other), id).toBe(false);   // dialogue, cards, pause, cutscenes
  });
  it('出示 only next to someone who takes a photo; 摘头 only at a peek spot', () => {
    expect(tutFits('tut_show', play)).toBe(false);
    expect(tutFits('tut_show', { ...play, showTarget: true })).toBe(true);
    expect(tutFits('tut_detach', play)).toBe(false);
    expect(tutFits('tut_detach', { ...play, prompt: 'detach' })).toBe(true);
    expect(tutFits('tut_hint', play) && tutFits('tut_hint', vf)).toBe(true);
  });
  it('at most two at once, in teaching order; out-of-context ones wait without blocking the rest', () => {
    const pending: TutId[] = ['tut_show', 'tut_phone', 'tut_overlay', 'tut_move', 'tut_view'];
    expect(visibleTuts(pending, play)).toEqual(['tut_move', 'tut_phone']);
    expect(visibleTuts(pending, vf)).toEqual(['tut_overlay']);
    expect(visibleTuts(['tut_view', 'tut_shutter', 'tut_overlay', 'tut_zoom'], vf)).toEqual(['tut_shutter', 'tut_overlay']);
    expect(visibleTuts(pending, other)).toEqual([]);
    expect(MAX_TUTS).toBe(2);
  });
});

describe('the move coach (tut_move)', () => {
  it('needs walking AND looking, or a long walk; teleports and cuts do not count', () => {
    const c = new MoveCoach();
    for (let i = 0; i < 60; i++) c.add(0.1, 0);           // 6 m straight ahead
    expect(c.done).toBe(false);
    for (let i = 0; i < 10; i++) c.add(0, 4);             // turns the view 40°
    expect(c.done).toBe(true);
    const d = new MoveCoach();
    d.add(30, 0); d.add(0, 170);                          // a teleport and a camera cut
    expect(d.walked + d.looked).toBe(0);
    for (let i = 0; i < MOVE_DONE.walkAlone * 10; i++) d.add(0.1, 0);
    expect(d.done).toBe(true);
  });
});

describe('controls page 「操作说明」', () => {
  it('every row has keys and a description in Chinese, keyboard and touch', () => {
    for (const kind of ['kb', 'touch'] as const) {
      for (const id of CONTROL_ROWS[kind]) {
        expect(has(`ui.ctl.${kind}.${id}.k`), `${kind}.${id}`).toBe(true);
        expect(t(`ui.ctl.${kind}.${id}.d`), `${kind}.${id}`).toMatch(/[一-鿿]/);
      }
    }
    for (const k of ['ui.controls', 'ui.ctl.title', 'ui.ctl.kb', 'ui.ctl.touch', 'ui.ctl.done']) expect(has(k), k).toBe(true);
    // every GDD §4 key is listed
    const kb = CONTROL_ROWS.kb.map((id) => t(`ui.ctl.kb.${id}.k`)).join(' ');
    for (const k of ['W', 'E', 'F', 'R', 'Q', 'N', 'G', 'Tab', 'J', 'H', 'Esc', '右键', '左键', '空格', '滚轮', '鼠标']) expect(kb, k).toContain(k);
    // touch rows name no keyboard key
    for (const id of CONTROL_ROWS.touch) expect(t(`ui.ctl.touch.${id}.k`) + t(`ui.ctl.touch.${id}.d`), id).not.toMatch(KEYISH);
  });
  it('key cells split into caps', () => {
    expect(keyTokens('W A S D')).toEqual(['W', 'A', 'S', 'D']);
    expect(keyTokens('右键 / F')).toEqual(['右键', 'F']);
    expect(keyTokens('滚轮 / 1 2 3')).toEqual(['滚轮', '1', '2', '3']);
    expect(keyTokens('Tab / J')).toEqual(['Tab', 'J']);
    expect(keyTokens('变焦 / 闪光')).toEqual(['变焦', '闪光']);
  });
});

describe('touch copy never names a key', () => {
  it('touch tutorials', () => {
    for (const id of TUT_IDS) if (has(`tut.touch.${id}`)) expect(t(`tut.touch.${id}`), id).not.toMatch(KEYISH);
  });
  it('keyless() rewrites every lens / tripod / peek / hint text that names a key', () => {
    const keyed = Object.entries(STR).filter(([k, v]) => /^(fail|vf|tp|hint)\./.test(k) && KEYISH.test(v) && !/^vf\.(rec|bottomBar|stamp)/.test(k));
    expect(keyed.length).toBeGreaterThan(8);
    for (const [k, v] of keyed) expect(keyless(v), k).not.toMatch(KEYISH);
    expect(keyless('这里好像有东西……（夜景 N）')).toBe('这里好像有东西……（点「夜景」）');
    expect(keyless('E / Esc 装回')).toBe('点「返回」装回');
    expect(keyless('Esc 退出')).toBe('点「返回」退出');
    expect(keyless('按 E 定时 10 秒')).toBe('点「交互」定时 10 秒');
    expect(keyless('先按 R 叠上对照')).toBe('先点「对照」叠上去');
    expect(keyless('试试闪光（Q）')).toBe('试试点「闪光」');
    expect(keyless('给王阿婆按住左键连拍')).toBe('给王阿婆按住「快门」连拍');
    // numbers, zooms, percentages and QR stay
    expect(keyless('试试 3× · 重合度到 90% · 二维码 QR')).toBe('试试 3× · 重合度到 90% · 二维码 QR');
  });
  it('the headlamp button shows at night / underground outside the lens and sends Q', () => {
    const base: TouchState = {
      mode: 'gameplay', peek: null, zoom: 1, night: false, flash: false, overlay: false,
      verbs: { night: false, show: false }, hasRef: false, showTarget: false, prompt: false, dark: false, torch: false,
    };
    expect(touchButtons(base)).not.toContain('torch');
    expect(touchButtons({ ...base, dark: true })).toContain('torch');
    expect(touchButtons({ ...base, torch: true })).toContain('torch');                    // can always switch it off
    expect(touchButtons({ ...base, dark: true, mode: 'viewfinder' })).not.toContain('torch');  // Q = flash there
    expect(touchKey('torch', base)).toBe('KeyQ');
    expect(has('ui.touch.torch')).toBe(true);
  });
});
