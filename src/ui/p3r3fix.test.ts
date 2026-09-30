// src/ui/p3r3fix.test.ts — owner E. Phase 3 round 3 UI fixes: U1 objective steps at the gate / locker, U2 incense badge
// placement + label, U3 note card split + toast hold, U4 card key gating (a Space masher cannot skip the story cards).
import { describe, expect, it } from 'vitest';
import { CARD_GRACE, CARD_READ, cardKeyAccepted } from './cards/cards';
import { splitNote, NOTE_SMUDGE } from './cards/views';
import { holdExpiry } from './hud/toast';
import { edgePoint, wayEdge, wayInsets, wayMetres, wayOpacity, WAY_AHEAD_OPACITY, WAY_OPACITY } from './hud/wayfinder';
import { STR as STORY } from '../data/zh/story';
import { STR as UI } from '../data/zh/ui';
import { t } from '../data/zh';
import { createHarness } from '../story/testHarness';

/** Simulate a player pressing a key every `every` s from the moment a card shows; the card reveals by itself at
 *  `autoFull` s (or on the first accepted press). Returns [time of the first press that closes, seconds the whole text
 *  was on screen before that]. */
function mash(kind: Parameters<typeof cardKeyAccepted>[0], every: number, autoFull: number): [number, number] {
  let full = -1;
  for (let k = 1; k < 200; k++) {
    const now = k * every;
    if (full < 0 && now >= autoFull) full = autoFull;
    if (!cardKeyAccepted(kind, now, full < 0 ? -1 : now - full)) continue;
    if (full < 0) { full = now; continue; }                 // this press completed the reveal
    return [now, now - full];
  }
  return [Infinity, 0];
}

describe('U4: story cards survive a Space masher', () => {
  it('ignores every key in the first second', () => {
    for (const k of ['chapter', 'liaozhai', 'epilogue', 'photo', 'note'] as const) {
      expect(CARD_GRACE[k]).toBeGreaterThanOrEqual(1);
      expect(cardKeyAccepted(k, 0.5, 0.5)).toBe(false);
      expect(cardKeyAccepted(k, 0.9, -1)).toBe(false);
    }
  });
  it('a press after the grace completes a reveal, a close needs the whole text on screen for READ seconds', () => {
    expect(cardKeyAccepted('liaozhai', 1.1, -1)).toBe(true);
    expect(cardKeyAccepted('liaozhai', 2, 0.9)).toBe(false);
    expect(cardKeyAccepted('liaozhai', 4, CARD_READ.liaozhai)).toBe(true);
  });
  it('0.9 s / 1.3 s mashers leave 序卷 fully on screen for ≥ 2.5 s (was 0.9 s)', () => {
    for (const every of [0.9, 1.3, 0.5]) {
      const [, shown] = mash('liaozhai', every, 4);
      expect(shown).toBeGreaterThanOrEqual(CARD_READ.liaozhai);
    }
  });
  it('a chapter card (stamped at 1.1 s) cannot close before 2.3 s', () => {
    const [closeAt] = mash('chapter', 0.9, 1.1);
    expect(closeAt).toBeGreaterThanOrEqual(2.3);
  });
  it('credits keep their own rule (Esc only; no gate)', () => {
    expect(cardKeyAccepted('credits', 0, 0)).toBe(true);
  });
});

describe('U3: the note card', () => {
  it('splits the letter from the narration after its closing bracket', () => {
    const body = STORY['item.note_dad.desc'];
    const { letter, caption } = splitNote(body);
    expect(letter.startsWith('「')).toBe(true);
    expect(letter.endsWith('」')).toBe(true);
    expect(letter).toContain(NOTE_SMUDGE);
    expect(caption.length).toBeGreaterThan(4);
    expect(caption.endsWith('。')).toBe(true);
    expect(letter + caption).toBe(body);
  });
  it('a letter with nothing after it has no caption (envelope)', () => {
    const body = STORY['item.envelope_dad.desc'];
    expect(splitNote(body)).toEqual({ letter: body, caption: '' });
    expect(splitNote('plain')).toEqual({ letter: 'plain', caption: '' });
  });
  it('held toasts keep their remaining life', () => {
    expect(holdExpiry([5, 7], 2)).toEqual([7, 9]);
    expect(holdExpiry([5], -1)).toEqual([5]);
  });
});

describe('U2: incense badge', () => {
  it('hugs the screen edges (bottom inset well below the hero’s feet)', () => {
    const i = wayInsets(1);
    expect(i.b).toBeLessThanOrEqual(60);
    const back = edgePoint(Math.PI, 1280, 720, i);
    expect(back.y).toBeGreaterThanOrEqual(660);
  });
  it('names its edge so the label sits on the inner side', () => {
    const i = wayInsets(1);
    expect(wayEdge(edgePoint(0, 1280, 720, i), 1280, 720, i)).toBe('t');
    expect(wayEdge(edgePoint(Math.PI, 1280, 720, i), 1280, 720, i)).toBe('b');
    expect(wayEdge(edgePoint(Math.PI / 2, 1280, 720, i), 1280, 720, i)).toBe('r');
    expect(wayEdge(edgePoint(-Math.PI / 2, 1280, 720, i), 1280, 720, i)).toBe('l');
  });
  it('shows the walked distance and stays (dimmed) while the way ahead is on screen', () => {
    expect(wayMetres(22.6)).toBe(23);
    expect(wayMetres(0.2)).toBe(1);
    expect(t('ui.way.dist', { m: 23 })).toContain('23m');
    expect(UI['ui.way.intro'].length).toBeGreaterThan(4);
    expect(wayOpacity({ onScreen: true, remaining: 30, allowed: true })).toBe(WAY_AHEAD_OPACITY);
    expect(wayOpacity({ onScreen: false, remaining: 30, allowed: true })).toBe(WAY_OPACITY);
  });
});

describe('U1: the objective chip keeps the thread', () => {
  it('after the gate opens (P3_done, no ch2 yet) the step leads through it', async () => {
    const h = await createHarness({ chapter: 'ch1' });
    h.core.store.setObjective('obj_gate');
    h.goto('sp_estate_gate');
    h.core.store.set('P3_done');
    const s = h.story.smokeStep?.();
    expect(s?.textKey).toBe('obj.step.gate_through');
    expect(s?.spot).toBe('sp_estate_gate_inner');
    expect(t('obj.step.gate_through')).not.toBe(t('obj.step.gate_show'));
  });
  it('the SMS steps keep the studio in view (first the parcel, then the studio)', () => {
    expect(STORY['obj.step.sms_signal']).toContain('周记');        // 周记
    expect(STORY['obj.step.sms_full']).toContain('照相馆');     // 照相馆
  });
});
