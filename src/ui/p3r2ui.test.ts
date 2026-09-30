// src/ui/p3r2ui.test.ts — owner E. Phase 3 round 2 UI fixes: the two-line objective chip + toasts that drop below it
// (U1), phone-size cards and 「点击继续」 (U2), the incense badge keep-out boxes (U3), Space/E at node choices (U4) and
// the phone / controls copy + vertical punctuation (U5).
import { describe, expect, it } from 'vitest';
import { PRESET_PHOTOS } from '../data/items';
import { has, t } from '../data/zh';
import { advanceAtChoice, CHOICE_ARM } from './dialog/controller';
import { toastTop } from './hud/toast';
import { avoidBoxes, heroScreenBox } from './hud/wayfinder';
import { continueKey, LZ_PUNCT } from './cards/views';
import { gridCaption } from './phone/album';

// (vitest stubs CSS modules, even `?raw`, to '': the CSS halves of these fixes are checked with screenshots)
const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

describe('U1 objective chip', () => {
  it('centred toasts drop below the chip when they share columns, and stay put otherwise', () => {
    const chip = rect(12, 9, 323, 70);
    expect(toastTop(rect(261, 11, 582, 46), chip, 5)).toBe(75);          // the phone wx toast (was under the chip)
    expect(toastTop(rect(345, 11, 900, 46), chip, 5)).toBeNull();        // clear of it on desktop
    expect(toastTop(rect(261, 11, 582, 46), null, 5)).toBeNull();
    expect(toastTop(rect(261, 11, 582, 46), rect(0, 0, 0, 0), 5)).toBeNull();   // hidden chip
  });
});

describe('U2 cards on touch', () => {
  it('touch players are told to tap, keyboard players to press a key', () => {
    expect(continueKey(true)).toBe('ui.card.continueTouch');
    expect(continueKey(false)).toBe('ui.card.continue');
    expect(t('ui.card.continueTouch')).toBe('点击继续');
  });
});

describe('U3 incense badge keep-out', () => {
  it('the hero box covers his screen span with some margin', () => {
    const b = heroScreenBox(640, 300, 640);
    expect(b.x0).toBeLessThan(640 - 100);
    expect(b.x1).toBeGreaterThan(640 + 100);
    expect(b.y0).toBeLessThan(300);
    expect(b.y1).toBeGreaterThan(640);
  });
  it('a bottom-edge point on the hero\'s legs slides clear of him and of the prompt', () => {
    const hero = heroScreenBox(640, 300, 650);
    const prompt = { x0: 510, y0: 576, x1: 635, y1: 617 };
    const p = avoidBoxes({ x: 556, y: 626 }, false, 50, 1230, [hero, prompt], 12);
    expect(p.y).toBe(626);
    expect(p.x < hero.x0 - 12 || p.x > hero.x1 + 12).toBe(true);
  });
  it('touch buttons are separate boxes, so a free spot exists between them', () => {
    const back = { x0: 9, y0: 82, x1: 73, y1: 122 }, phone = { x0: 767, y0: 281, x1: 831, y1: 325 };
    const p = avoidBoxes({ x: 796, y: 300 }, true, 60, 330, [back, phone], 10);
    expect(p.y < phone.y0 - 10 || p.y > phone.y1 + 10).toBe(true);
  });
});

describe('U4 Space / E at node choices', () => {
  it('the first press highlights option 1, never picks it', () => {
    expect(advanceAtChoice(2, -1, -1, 10, true)).toBe('highlight');
  });
  it('a press inside the arm pause waits; a key press after it confirms; a click never confirms a Space highlight', () => {
    expect(advanceAtChoice(2, 0, 10, 10 + CHOICE_ARM / 2, true)).toBe('wait');
    expect(advanceAtChoice(2, 0, 10, 10 + CHOICE_ARM + 0.01, true)).toBe('pass');
    expect(advanceAtChoice(2, 0, 10, 12, false)).toBe('wait');
  });
  it('arrow highlights and lines without node choices keep the old behaviour', () => {
    expect(advanceAtChoice(2, 1, -1, 10, false)).toBe('pass');
    expect(advanceAtChoice(0, -1, -1, 10, true)).toBe('pass');
  });
});

describe('U5 phone / controls copy and vertical punctuation', () => {
  it('the controls page names 微信 for keyboard players and 拾取 for touch players', () => {
    expect(t('ui.ctl.kb.phone.d')).toContain('微信');
    expect(t('ui.phoneKeys')).toContain('微信');
    expect(t('ui.ctl.touch.use.d')).toContain('拾取');
    expect(t('ui.ctl.kb.talk.d')).not.toContain('选选');
  });
  it('story photos carry no dev tag and get a short grid caption', () => {
    expect(t('ui.album.preset')).not.toBe('预设');
    for (const p of PRESET_PHOTOS) {
      expect(has(`ui.album.short.${p.id}`)).toBe(true);
      expect([...gridCaption({ label: 'x', preset: p.id })].length).toBeLessThanOrEqual(9);
    }
    expect(gridCaption({ label: '我拍的', preset: undefined })).toBe('我拍的');
  });
  it('liaozhai punctuation is marked for the vertical position', () => {
    expect([...'，。、；：！？'].every((c) => LZ_PUNCT.test(c))).toBe(true);
    expect(LZ_PUNCT.test('客')).toBe(false);
  });
});
