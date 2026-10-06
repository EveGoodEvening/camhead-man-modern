// src/data/zh/copy.p3r3.test.ts — Phase 3 round 3 text fixes (T1 repeats / order / exit verb, T2 聊斋 card digits).
import { describe, expect, it } from 'vitest';
import { CARDS, DLG, STR, WX_TEXT } from '../zh';
import { INTERACTS } from '../interacts';
import { NODES } from '../dialogue';
import { STORY_RULES } from '../story';
import { GATE_OUTCOMES } from '../show';

const lines = (id: string): string[] => ((DLG as Record<string, readonly (readonly [string, string])[]>)[id] ?? []).map((l) => l[1]);
const norm = (s: string) => s.replace(/[\s，。、…—「」【】！？：]/g, '');

describe('T1 no line is said twice in a row', () => {
  it('the doorframe marks are read once (narration / photo label), 我 only reacts', () => {
    const marks = /七岁|十二岁/;
    expect(lines('it.st_doorframe').join('')).toMatch(marks);
    expect(lines('me.height').join('')).not.toMatch(marks);
    expect(lines('me.height').join('')).toContain('十八岁以后');
  });
  it('S_zhe: 折 → 我 → 土地 wx → the night talks never repeat 「折起来的…带走」', () => {
    const key = /折起来的.{0,4}带走/;
    const who = {
      'chai.after': lines('chai.after').join(''),
      'wx_zhe': (WX_TEXT.wx_zhe ?? []).join(''),
      'liu.night_after': lines('liu.night_after').join(''),
      'tudi.night_zhe': lines('tudi.night_zhe').join(''),
    };
    expect(lines('me.zhe').join('')).toMatch(key);                                    // 我 keeps the line
    for (const [id, text] of Object.entries(who)) expect(text, id).not.toMatch(key);
    const me = new Set(lines('me.zhe').map(norm));
    for (const [id, text] of Object.entries(who)) expect(me.has(norm(text)), id).toBe(false);
    expect(norm(WX_TEXT.wx_zhe?.[0] ?? '')).not.toBe(norm(lines('tudi.night_zhe')[0] ?? ''));
  });
  it('P3: 「借你的脸」 follows the gate verdict (gate.pass close effect), not the P3_done fx that runs before it', () => {
    expect(GATE_OUTCOMES.pass.node).toBe('gate.pass');
    const pass = NODES.find((n) => n.id === 'gate.pass');
    expect(pass?.effects).toEqual([{ node: 'me.p3' }]);
    const p3 = STORY_RULES.find((r) => r.flag === 'seen:fx.P3_done');
    expect(p3).toBeTruthy();
    expect(JSON.stringify(p3?.effects)).not.toContain('me.p3');
    expect(lines('gate.pass')[0]).toMatch(/^活体检测通过/);
  });
  it('leaving the studio / the subway says 出去, never 进入, and the toast reads as leaving', () => {
    for (const id of ['it_st_exit', 'it_sw_exit']) {
      const defs = INTERACTS.filter((d) => d.id === id);
      expect(defs.length, id).toBeGreaterThan(0);
      for (const d of defs) {
        expect(d.promptKey, id).toBe('txt.prompt.exit');
        expect(STR[d.promptKey as keyof typeof STR]).not.toMatch(/进入/);
      }
    }
    expect(STR['sys.st_exit']).not.toMatch(/从里面看/);
    expect(STR['sys.st_exit']).toMatch(/回到/);
    expect(STR['sys.sw_exit']).toMatch(/回到/);
  });
});

describe('T2 聊斋 cards avoid glyphs the brush font lacks', () => {
  it('no 〇 in vertical card bodies (Ma Shan Zheng falls back to a 4 px-tall ring that overlaps the next glyph)', () => {
    for (const [id, c] of Object.entries(CARDS)) expect(c.body ?? '', id).not.toContain('〇');
    expect(CARDS.juan1.body).toContain('船号零八一五');
  });
});
