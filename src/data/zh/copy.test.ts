// src/data/zh/copy.test.ts — P3 text fixes (T1–T4): the story's setup is actually stated, names stay consistent, lines
// never claim a state the player may not be in, and narration / punctuation follow one convention.
import { describe, expect, it } from 'vitest';
import { CARDS, CREDITS, DLG, EPILOGUE, STR, WX_TEXT } from '../zh';
import { keyless } from './ui';
import { ITEMS } from '../items';

const lines = (id: string): string[] => ((DLG as Record<string, readonly (readonly [string, string])[]>)[id] ?? []).map((l) => l[1]);
const allText = (): string[] => [
  ...Object.values(STR),
  ...Object.values(DLG).flatMap((v) => (v ?? []).map((l) => l[1])),
  ...Object.values(WX_TEXT).flatMap((v) => v ?? []),
  ...Object.values(CARDS).flatMap((c) => [c.title, c.subtitle ?? '', c.body ?? '']),
];

describe('T1 the truth is told before the bus choice', () => {
  it('att.bus tells the truth once, in the attendant\'s announcement voice, then lets 我 react and states both stakes', () => {
    const bus = DLG['att.bus'] ?? [];
    const text = bus.map((l) => l[1]).join('');
    expect(text).toMatch(/末班车/);
    expect(text).toMatch(/睡眠状态/);
    expect(text).toMatch(/1%/);
    expect(text).not.toMatch(/昨晚|睡着呢/);                  // P3r2: no 土地 chat in his mouth, no 9/29-night timeline slip
    expect(bus[1]?.[0]).toBe('me');                           // 我 reacts right after the reveal
    expect(text).toMatch(/上了车，您就醒了/);                  // stake of 上车
    expect(text).toMatch(/土地/);                               // pull of 不上车: 土地 hands the place over
    expect(text).toMatch(/不会醒来/);                           // cost of 不上车
    expect(bus.filter(([who]) => who !== 'attendant' && who !== 'me')).toEqual([]);   // camera stays on the bus
    expect(bus.at(-1)?.[1]).toBe('上车吗？');           // the question sits right above the choices
  });
  it('wx_dawn only teases the bus (the reveal is not told twice); the darkroom says why he never came back', () => {
    const dawn = (WX_TEXT.wx_dawn ?? []).join('');
    expect(dawn).not.toMatch(/末班车|1%|魂/);
    expect(dawn).toMatch(/上不上，你自己定/);
    expect(WX_TEXT.wx_dawn?.at(-1)).toBe('这回，你站中间。');
    expect(lines('me.developed').join('')).toMatch(/外地读书/);
  });
  it('ending B closes the sleeping body and sets up the 土地（周） rename', () => {
    const b = EPILOGUE.B.join('');
    expect(b).toMatch(/末班车/);
    expect(b).toMatch(/1%/);
    expect(CARDS.zhong_B.body).toMatch(/末班车/);
    expect(CARDS.zhong_B.body).toMatch(/土地老矣/);
    expect(CARDS.zhong_A.body).not.toContain('遂去');     // 去 reads as "passed away"; A wakes on the bus
    expect(CARDS.zhong_A.body).toContain('醒');
  });
});

describe('T2 one name per place and object', () => {
  it('the store is 月亮湾便利店 and the lighthouse 望潮灯塔 everywhere', () => {
    const text = allText();
    expect(text.filter((s) => s.includes('望潮里便利店') || s.includes('望潮里灯塔'))).toEqual([]);
    expect(STR['kp.locker.brand']).toContain(STR['loc.store']);
    expect(STR['kp.lh.brand']).toContain(STR['sign.lighthouse']);
    expect(lines('sms.garbled')[0]).toContain(`${STR['loc.store']}柜`);
  });
  it('the plaque is a 铭牌, the roof lock is not a door, the milk slip is not drunk', () => {
    expect(lines('chen.dusk_pier').join('')).not.toContain('碑');
    expect(lines('chen.dusk_pier').join('')).toContain('铭牌');
    expect(lines('granny.dusk_coop').join('')).not.toContain('天台门');
    expect(STR['mb.403']).not.toContain('没喝完');
    expect(STR['mb.403']).toContain('2019 年的订奶单');
  });
});

describe('T3 lines stay true for the player\'s state', () => {
  it('the dot is still on the ground when 土地 mentions it (P8_done, maybe no dot_taken)', () => {
    expect(lines('tudi.night_zhe').join('')).not.toContain('你手里');
    expect((WX_TEXT.wx_zhe ?? []).join('')).not.toMatch(/你留着/);
    expect((WX_TEXT.wx_zhe ?? []).join('')).toMatch(/捡起来/);
  });
  it('卷一 also covers P2 route B (the 0815 code typed without climbing the bridge)', () => {
    expect(CARDS.juan1.body).toContain('天桥');
    expect(CARDS.juan1.body).toContain('船号');
  });
  it('the ghost-layer hint has a variant for before N is unlocked', () => {
    expect(STR['fail.layer']).toContain('夜景 N');
    expect(STR['fail.layer.locked']).toBeTruthy();
    expect(STR['fail.layer.locked']).not.toMatch(/N|夜景/);
  });
  it('the 2011 temple photo is a fair photo posted later (公众号 launched in 2012)', () => {
    expect((WX_TEXT.wx_after_scan ?? [])[0]).toMatch(/庙会上拍的，后来发在公众号上/);
  });
});

describe('T4 conventions', () => {
  it('narration is never a parenthetical under a character tag', () => {
    const bad = Object.entries(DLG).flatMap(([id, ls]) => (ls ?? [])
      .filter(([who, s]) => who !== 'system' && who !== 'narr' && /（[^）]*）/.test(s) && !/^（打开/.test(s))
      .map(([, s]) => `${id}: ${s}`));
    expect(bad).toEqual([]);
  });
  it('the note nodes are captions only: the note card already shows the text', () => {
    for (const [node, item] of [['note.dad', 'note_dad'], ['note.envelope', 'envelope_dad']] as const) {
      const desc = STR[ITEMS.find((i) => i.id === item)!.descKey];
      const quote = /「[^」]+」/.exec(desc)![0];
      expect(lines(node).join(''), node).not.toContain(quote);
      expect(lines(node).length).toBe(1);
    }
  });
  it('quotes are 「」, never curly; the same hint is punctuated the same way', () => {
    expect(allText().filter((s) => /[“”]/.test(s))).toEqual([]);
    expect(STR['fail.still']).toBe(STR['fail.T_light_trail.still']);
    expect(STR['vf.blur']).toBe(STR['fail.still']);
    expect(STR['lbl.self_shoe.3']).toMatch(/？ \d+%$/);
  });
  it('the bag note is quoted and signed; the bus sign reads the same on the bus and in text', () => {
    for (const s of [...lines('it.st_cabinet'), ...lines('it.st_cabinet_again')].filter((x) => x.includes('胶卷暂存'))) {
      expect(s).toContain('「胶卷暂存土地爷处。——老周」');
    }
    expect(lines('it.bus_door').join('')).toContain(STR['scr.bus.sign']);
  });
  it('the credits name the team in Chinese', () => {
    expect(CREDITS.filter((l) => /camera-man/.test(l))).toEqual([]);
    expect(CREDITS).toContain('显影制作组');
  });
});

describe('P3r2 text: one name per feature, keyless without tautologies, narration untagged', () => {
  const strs = (): [string, string][] => [
    ...Object.entries(STR),
    ...Object.entries(DLG).flatMap(([id, v]) => (v ?? []).map((l, i) => [`${id}#${i}`, l[1]] as [string, string])),
    ...Object.entries(WX_TEXT).flatMap(([id, v]) => (v ?? []).map((l, i) => [`${id}#${i}`, l] as [string, string])),
  ];
  it('the R overlay is always 「叠上对照」 (never 打开对照 / 对齐 / 叠上旧照)', () => {
    const bad = strs().filter(([, s]) => /打开对照|按 ?R ?对齐|叠上旧照|打开叠加/.test(s));
    expect(bad).toEqual([]);
    const withR = strs().filter(([k, s]) => !k.startsWith('ui.ctl.') && /(^|[^A-Za-z])R [^\s]/.test(s) && !/^(lbl|scr|sign)\./.test(k));
    for (const [k, s] of withR) expect(s, k).toMatch(/R 叠上对照/);
  });
  it('keyless() never names a button and then the same thing again', () => {
    const btns = ['闪光', '夜景', '交互', '对照', '出示', '取景', '手机', '返回'];
    const bad: string[] = [];
    // tut.<id> bubbles have their own tut.touch.<id> text on touch, so keyless() never sees them
    for (const [k, s] of strs().filter(([k]) => !(k.startsWith('tut.tut_') && STR[`tut.touch.${k.slice(4)}`]))) {
      const out = keyless(s);
      for (const b of btns) {
        if (new RegExp(`${b}（点「${b}」）|点「${b}」[，,]?(就是|打开|开)?${b}`).test(out)) bad.push(`${k}: ${out}`);
      }
      if (/摇杆/.test(out)) bad.push(`${k}: ${out}`);    // the touch tutorial calls it 左半屏拖动
    }
    expect(bad).toEqual([]);
    expect(keyless(STR['hint.s_group.3'])).toContain('拖动左半屏');
    expect(keyless(STR['fail.T_light_trail.layer'])).toBe('写字要慢，看字要久——点「夜景」，别动。');
    expect(keyless(STR['fail.overlay'])).toBe('先点「对照」叠上去');
  });
  it('the paper shop is 纸扎铺 everywhere', () => {
    expect(strs().filter(([, s]) => s.includes('纸扎店'))).toEqual([]);
  });
  it('narration and object texts carry no 「系统」 tag; only machines speak as system', () => {
    for (const id of ['zhimei.dawn', 'meiqiu.dawn', 'zhimei.plain', 'it.bus_door', 'it.paper_phone', 'note.dad']) {
      expect((DLG[id as keyof typeof DLG] ?? []).some(([who]) => who === 'narr'), id).toBe(true);
      expect((DLG[id as keyof typeof DLG] ?? []).some(([who]) => who === 'system'), id).toBe(false);
    }
    for (const id of ['me.wake', 'gate.pass', 'sms.full', 'it.gantry']) {
      expect((DLG[id as keyof typeof DLG] ?? []).some(([who]) => who === 'system'), id).toBe(true);
    }
  });
  it('small polish: boat number, bus door, game title, credits lines fit the roll', () => {
    expect(CARDS.juan1.body).toContain('船号零八一五');           // P3r3 T2: 〇 has no proper glyph in the brush font
    expect(lines('it.bus_door').join('')).not.toMatch(/^0 路。/);
    expect(STR['ui.noWebgl']).toContain('《显影》');
    // the credits column is 40 % of the screen: keep every line short enough not to break mid-word at 1280 px
    for (const l of CREDITS) expect([...l].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.55 : 1), 0), l).toBeLessThanOrEqual(20);
  });
});
