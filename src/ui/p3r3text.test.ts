// src/ui/p3r3text.test.ts — Phase 3 round 3 text fixes on the UI side: 聊斋 card kinsoku runs (T2) and the controls
// page showing one input family (T3). CSS halves are checked with screenshots (vitest stubs CSS modules to '').
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/zh';
import { lzRuns } from './cards/views';
import { controlsFamily } from './controls';
import { orphaned } from './dialog/box';

const CLOSE = /^[，。、；：！？」』）》…—]/;   // ，。、；：！？」』）》…—
const OPEN = /[「『（《]$/;                                                       // 「『（《

describe('T2 聊斋 card kinsoku', () => {
  it('closing marks join the glyph before them, opening brackets the glyph after them', () => {
    expect(lzRuns('屏曰：「请眨眼。」客')).toEqual(['屏', '曰：', '「请', '眨', '眼。」', '客']);
    expect(lzRuns('甲，乙')).toEqual(['甲，', '乙']);
    expect(lzRuns('——')).toEqual(['——']);
  });
  it('every card body: no run starts with a closing mark or ends with an opening one, and no glyph is lost', () => {
    for (const [id, c] of Object.entries(CARDS)) {
      for (const p of (c.body ?? '').split('\n')) {
        const runs = lzRuns(p);
        expect(runs.join(''), id).toBe(p);
        for (const r of runs) {
          expect(CLOSE.test(r), `${id} ${r}`).toBe(false);
          expect(OPEN.test(r), `${id} ${r}`).toBe(false);
          expect([...r].length, `${id} ${r}`).toBeLessThanOrEqual(5);     // a no-wrap run never outgrows a column
        }
      }
    }
  });
});

describe('T3 dialogue orphans', () => {
  it('balances only when a wrapped line leaves a short last row', () => {
    expect(orphaned([528, 48], 568)).toBe(true);           // 老陈: 「了。」 alone on row 2
    expect(orphaned([528, 300], 568)).toBe(false);
    expect(orphaned([400], 568)).toBe(false);               // one row
    expect(orphaned([560, 560, 60], 568)).toBe(true);
    expect(orphaned([], 0)).toBe(false);                    // not laid out (hidden box / no DOM)
  });
});

describe('T3 controls page', () => {
  it('shows the family of the device first (the other one behind a tab)', () => {
    expect(controlsFamily(false)).toBe('kb');
    expect(controlsFamily(true)).toBe('touch');
  });
});
