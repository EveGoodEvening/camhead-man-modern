// P3r3 (open-play c): chapter boots start with the tutorials a real run has finished by then.
import { describe, expect, it } from 'vitest';
import { TUT_IDS } from '../data/ids/ui';
import { chapterSeenFlags } from './bootTuts';
import { TUT_LIFE, tutExpired } from '../ui/hud/tutorial';

describe('chapterSeenFlags', () => {
  it('a fresh game (prologue) teaches everything; every later chapter already knows E', () => {
    expect(chapterSeenFlags('prologue')).toEqual([]);
    for (const c of ['ch1', 'ch2', 'ch3', 'finale'] as const) expect(chapterSeenFlags(c)).toContain('seen:tut_interact');
  });
  it('is cumulative and only names real tutorial ids', () => {
    const ch1 = chapterSeenFlags('ch1'), ch2 = chapterSeenFlags('ch2'), ch3 = chapterSeenFlags('ch3');
    for (const f of ch1) expect(ch2).toContain(f);
    for (const f of ch2) expect(ch3).toContain(f);
    expect(ch1).not.toContain('seen:tut_menu');           // ch1 itself shows 「Esc 暂停」 at its start
    expect(ch2).toContain('seen:tut_menu');
    expect(ch3).toContain('seen:tut_night');
    for (const f of ch3) if (f !== 'seen:tut_interact' && f !== 'seen:ui_way_intro') expect(TUT_IDS as readonly string[]).toContain(f.slice(5));
    expect(new Set(ch3).size).toBe(ch3.length);
  });
});

describe('timed tutorial bubbles (tut_menu 「Esc 暂停」)', () => {
  const life = TUT_LIFE.tut_menu ?? 0;
  it('fade after their life on screen', () => {
    expect(life).toBeGreaterThan(0);
    expect(tutExpired(life, life - 0.1, life)).toBe(false);
    expect(tutExpired(life, life + 0.1, life + 0.1)).toBe(true);
  });
  it('do not come back long after a dialogue / beat cut them short', () => {
    expect(tutExpired(life, 1, life * 2)).toBe(false);
    expect(tutExpired(life, 1, life * 3 + 0.1)).toBe(true);
  });
});
