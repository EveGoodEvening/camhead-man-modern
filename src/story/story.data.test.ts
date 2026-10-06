// ARCHITECTURE §3.F consistency tests: nodes ↔ lines, wx text, interact coverage, referenced ids and keys, chapter
// boot sufficiency — and the text itself checked against docs/GDD.md (§11 dialogue, §11.12 wx, §10.5 cards, §12, §15).
import { describe, expect, it } from 'vitest';
import type { Action, Cond } from '../types';
import { CARDS, CREDITS, DLG, EPILOGUE, STR, WX_TEXT, has } from '../data/zh';
import { CLUE_IDS, FLAG_IDS, INTERACT_IDS, NODE_IDS, OBJECTIVE_IDS, WX_IDS } from '../data/ids/story';
import { SPOT_IDS } from '../data/ids/spots';
import { TARGET_IDS } from '../data/ids/lens';
import { NODES } from '../data/dialogue';
import { WX } from '../data/wx';
import { INTERACTS } from '../data/interacts';
import { BEAT_HINTS, INPUTS, PUZZLES, SOLVE_REWARDS } from '../data/puzzles';
import { GATE_OUTCOMES, SHOW_FALLBACK, SHOW_REACTIONS } from '../data/show';
import { BEATS, CHAPTERS, CHAPTER_BOOT, OBJECTIVES, SMOKE_ELIGIBLE, STORY_RULES, ZONES } from '../data/story';
import { CLUES, ITEMS, PRESET_PHOTOS } from '../data/items';
import { SHOTS } from './testHarness';

const GDD = Object.values(import.meta.glob('/docs/GDD.md', { query: '?raw', import: 'default', eager: true }))[0] as string;
const section = (from: string, to: string) => GDD.slice(GDD.indexOf(from), GDD.indexOf(to, GDD.indexOf(from) + 1));

const SPEAKER: Record<string, string> = {
  我: 'me', 系统: 'system', 旁白: 'narr', 小林: 'xiaolin', 王阿婆: 'granny_wang', 老陈: 'old_chen', 小刘: 'xiaoliu', 土地: 'tudi',
  煤球: 'meiqiu', 纸妹: 'zhimei', 拆: 'chai', 折: 'chai', 站务员: 'attendant', 老周: 'lao_zhou',
};

function allActions(): Action[] {
  return [
    ...STORY_RULES.flatMap((r) => r.effects), ...BEATS.flatMap((b) => b.end),
    ...NODES.flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.actions ?? [])]),
    ...Object.values(INPUTS).flatMap((d) => [...d.onOk, ...(d.onFail ?? [])]),
    ...SHOW_REACTIONS.flatMap((r) => r.actions ?? []), ...Object.values(GATE_OUTCOMES).flatMap((g) => g.actions ?? []),
    ...INTERACTS.flatMap((i) => i.actions ?? []), ...Object.values(SOLVE_REWARDS).flat(),
  ];
}
function condFlags(c: Cond | undefined): string[] { return [...(c?.all ?? []), ...(c?.none ?? []), ...(c?.any ?? [])]; }

describe('story data ↔ text', () => {
  it('every node has lines and every line block has a node', () => {
    const ids = new Set<string>(NODES.map((n) => n.id));
    expect(NODES.filter((n) => !(DLG[n.id]?.length)).map((n) => n.id)).toEqual([]);
    expect(Object.keys(DLG).filter((k) => !ids.has(k))).toEqual([]);
    expect(NODE_IDS.filter((id) => !ids.has(id))).toEqual([]);
    expect(NODES.map((n) => n.id).filter((x, i, a) => a.indexOf(x) !== i)).toEqual([]);
  });
  it('every wx id has a def and text; keys stay empty (WX_TEXT is the source)', () => {
    expect(WX.map((w) => w.id).sort()).toEqual([...WX_IDS].sort());
    for (const w of WX) { expect(w.keys).toEqual([]); expect(WX_TEXT[w.id]?.length, w.id).toBeGreaterThan(0); }
  });
  it('every InteractId has a def; every clue/objective/item has text', () => {
    const defd = new Set(INTERACTS.map((i) => i.id));
    expect(INTERACT_IDS.filter((id) => !defd.has(id))).toEqual([]);
    expect(CLUES.map((c) => c.id).sort()).toEqual([...CLUE_IDS].sort());
    expect(OBJECTIVES.map((o) => o.id).sort()).toEqual([...OBJECTIVE_IDS].sort());
    const keys = [
      ...CLUES.map((c) => c.textKey), ...OBJECTIVES.map((o) => o.textKey), ...ITEMS.flatMap((i) => [i.nameKey, i.descKey]),
      ...PRESET_PHOTOS.map((p) => p.titleKey), ...PUZZLES.flatMap((p) => [p.titleKey, ...p.hints]),
      ...BEAT_HINTS.flatMap((b) => b.hints), ...INTERACTS.flatMap((i) => (i.promptKey ? [i.promptKey] : [])),
      ...NODES.flatMap((n) => (n.choices ?? []).map((c) => c.key)), ...allActions().flatMap((a) => ('toast' in a ? [a.toast] : [])),
      ...Object.values(INPUTS).flatMap((d) => [...(d.failKeys ?? []), ...Object.values(d.cells ?? {}), ...(d.hintAfter ? [d.hintAfter.key] : [])]),
      'sys.credits.full', 'txt.rule.1', 'txt.rule.2', 'txt.rule.3', 'txt.frame.1', 'txt.frame.2', 'txt.frame.3', 'txt.frame.4',
    ];
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });
  it('card ids used by the story all exist', () => {
    const ids = [
      ...CHAPTERS.map((c) => c.cardId), 'epigraph', 'xu', 'juan1', 'juan2', 'juan3', 'zhong_A', 'zhong_B', 'ph_2026_group',
      ...allActions().flatMap((a) => ('card' in a && a.card !== 'epilogue' && a.card !== 'credits' ? [a.id] : [])),
    ];
    expect(ids.filter((id) => !CARDS[id])).toEqual([]);
    expect(CHAPTERS.map((c) => CARDS[c.cardId].seal)).toEqual(['醒', '脸', '眼', '影', '合']);
  });
  it('referenced spots, targets, nodes and wx exist', () => {
    const spots = new Set<string>(SPOT_IDS), targets = new Set<string>(TARGET_IDS), nodes = new Set<string>(NODES.map((n) => n.id));
    const spotRefs = [
      ...INTERACTS.flatMap((i) => (typeof i.spot === 'string' ? [i.spot] : [])), ...ZONES.flatMap((z) => (typeof z.at === 'string' ? [z.at] : [])),
      ...OBJECTIVES.flatMap((o) => o.smoke.flatMap((s) => ('spot' in s ? [s.spot] : 'nearest' in s ? [...s.nearest] : []))),
      ...Object.keys(SMOKE_ELIGIBLE), ...Object.values(CHAPTER_BOOT).map((b) => b.spot),
      ...allActions().flatMap((a) => ('teleport' in a ? [a.teleport] : [])),
    ];
    expect(spotRefs.filter((s) => !spots.has(s))).toEqual([]);
    expect(PUZZLES.flatMap((p) => p.targets).filter((t) => !targets.has(t))).toEqual([]);
    const nodeRefs = [
      ...allActions().flatMap((a) => ('node' in a ? [a.node] : [])), ...SHOW_REACTIONS.map((r) => r.node), ...SHOW_FALLBACK.map((r) => r.node),
      ...Object.values(GATE_OUTCOMES).map((g) => g.node), ...INTERACTS.flatMap((i) => (i.node ? [i.node] : [])),
      ...NODES.flatMap((n) => (n.choices ?? []).flatMap((c) => (c.then ? [c.then] : []))),
    ];
    expect(nodeRefs.filter((n) => !nodes.has(n))).toEqual([]);
    const wx = new Set<string>(WX_IDS);
    expect(allActions().flatMap((a) => ('wx' in a ? [a.wx] : [])).filter((w) => !wx.has(w))).toEqual([]);
  });
  it('flags in conditions are known; every story flag is set by something', () => {
    const known = new Set<string>([...FLAG_IDS, 'bst_second_shadow', 'bst_manhole_eye', 'bst_queue_shadows', 'bst_lion_turns', 'bst_tv_still_on', 'bst_fish_watching']);
    const conds = [
      ...NODES.map((n) => n.when), ...STORY_RULES.flatMap((r) => [r.guard, 'event' in r.when ? undefined : r.when]),
      ...INTERACTS.map((i) => i.when), ...PUZZLES.map((p) => p.availableWhen), ...BEAT_HINTS.map((b) => b.availableWhen),
      ...SHOW_REACTIONS.map((r) => r.when), ...SHOW_FALLBACK.map((r) => r.when), ...Object.values(SMOKE_ELIGIBLE),
      ...OBJECTIVES.flatMap((o) => o.smoke.map((s) => s.when)),
    ];
    expect(conds.flatMap(condFlags).filter((f) => !known.has(f) && !f.startsWith('seen:'))).toEqual([]);
    // who sets each flag: actions (set / same-named give), rules, D's §8.1 onShot (the harness SHOTS table)
    const setters = new Set<string>([
      ...allActions().flatMap((a) => ('set' in a ? [a.set] : 'give' in a ? [a.give] : [])),
      ...STORY_RULES.map((r) => r.flag),
      ...Object.values(SHOTS).flatMap((s) => (s?.actions ?? []).flatMap((a) => ('set' in a ? [a.set] : []))),
      'group_photo_done',   // D: tripod success
      'gantry_open',        // glue: the gantry special case
    ]);
    expect(FLAG_IDS.filter((f) => !setters.has(f))).toEqual([]);
  });
  it('CHAPTER_BOOT[c] holds what chapter c needs', () => {
    const first: Record<string, string> = { prologue: 'P1_rephoto_bridge', ch1: 'P2_signal_locker', ch2: 'P4_tudi_face', ch3: 'P6_lighthouse_1987' };
    for (const [c, p] of Object.entries(first)) {
      const need = PUZZLES.find((x) => x.id === p)!.availableWhen.all ?? [];
      const boot = CHAPTER_BOOT[c as keyof typeof CHAPTER_BOOT];
      expect(need.filter((f) => !boot.flags.includes(f)), c).toEqual([]);
      expect(CHAPTERS.find((x) => x.id === c)!.clock).toBe(boot.clock);
    }
    // ch3's hub: P7 needs detach (meiqiu_talked) and the verbs; the finale needs finale_started + all frames
    expect(CHAPTER_BOOT.ch3.flags).toContain('meiqiu_talked');
    expect(CHAPTER_BOOT.ch3.verbs).toEqual(expect.arrayContaining(['night', 'detach']));
    expect(CHAPTER_BOOT.finale.flags).toEqual(expect.arrayContaining(['finale_started', 'all_frames', 'developed']));
    expect(CHAPTER_BOOT.finale.items).toEqual(expect.arrayContaining(['frame_1', 'frame_2', 'frame_3', 'frame_4', 'envelope_dad']));
  });
  it('STORY_RULES keeps the §10.2 order of the numbered flags', () => {
    const order = ['wx_tudi_added', 'P1_done', 'ch1_started', 'studio_locked_seen', 'locker_seen', 'sms_full', 'P2_done',
      'film_at_tudi', 'P3_done', 'ch2_started', 'idol_scanned', 'P4_done', 'tudi_met', 'mirror_selfie', 'meiqiu_talked',
      'frame_1', 'P5_done', 'ch3_started', 'plaque_read', 'frame_3', 'subway_entered', 'name_known', 'frame4_registered',
      'frame_4', 'P8_done', 'zhimei_eye', 'frame_2', 'all_frames', 'developed', 'finale_started', 'group_photo_done',
      'bus_arrived', 'ending_A', 'ending_B'];
    const idx = order.map((f) => STORY_RULES.findIndex((r) => r.flag === f || r.flag === `seen:fx.${f}`));
    expect(idx.every((x) => x >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe('story text = GDD', () => {
  it('§11 dialogue lines match word for word', () => {
    const s = section('## 11. 对白脚本', '## 12.');
    const expected = new Map<string, [string, string][]>();
    let cur: string | null = null;
    for (const raw of s.split('\n')) {
      const line = raw.trim();
      const head = /^\*\*`([\w.]+)`\*\*/.exec(line);
      if (head) { cur = head[1]; expected.set(cur, []); continue; }
      const memo = /^- \*\*`(memo_\d)`\*\*：(.+?)：(.+)$/.exec(line);
      if (memo) { expected.set(memo[1], [[SPEAKER[memo[2]], memo[3]]]); continue; }
      if (line.startsWith('#') || line.startsWith('|')) { cur = null; continue; }
      const m = /^- ([^：]+)：(.+)$/.exec(line);
      if (cur && m && !m[1].startsWith('选项') && SPEAKER[m[1]]) expected.get(cur)!.push([SPEAKER[m[1]], m[2]]);
    }
    expect(expected.size).toBeGreaterThan(90);
    const diffs: string[] = [];
    for (const [id, lines] of expected) {
      if (id === 'chai.day') continue;                   // split into chai.day / chai.dusk (checked below)
      const got = (DLG as Record<string, readonly (readonly [string, string])[]>)[id];
      if (!got) { diffs.push(`${id}: missing`); continue; }
      if (JSON.stringify(got) !== JSON.stringify(lines)) diffs.push(`${id}: ${JSON.stringify(got)} ≠ ${JSON.stringify(lines)}`);
    }
    expect(diffs).toEqual([]);
    expect(DLG['chai.dusk']?.[1][1]).toBe('……它刚才动了一下？');
  });
  it('§11.12 wx text matches', () => {
    const s = section('### 11.12', '### 11.13');
    const diffs: string[] = [];
    for (const m of s.matchAll(/^\| `(wx_\w+)` \| [^|]+ \| (.+) \|$/gm)) {
      if (m[1] === 'wx_hint_') continue;
      const want = m[2].replace(/^（发送人：[^）]+）/, '').split(' / ').filter((x) => !x.startsWith('〔语音'));   // sender = WxDef.sender
      if (JSON.stringify(WX_TEXT[m[1] as keyof typeof WX_TEXT]) !== JSON.stringify(want)) diffs.push(m[1]);
    }
    expect(diffs).toEqual([]);
  });
  it('§10.5 聊斋卡, §15 epilogues and §12 reactions match', () => {
    const lz = section('### 10.5', '### 10.6');
    for (const id of ['xu', 'juan1', 'juan2', 'juan3', 'zhong_A', 'zhong_B']) {
      for (const para of CARDS[id].body!.split('\n')) expect(lz, id).toContain(`> ${para}`);
      expect(lz).toContain(`**${CARDS[id].title}**`);
    }
    const ep = section('## 15.', '### 15.3');
    for (const l of [...EPILOGUE.A, ...EPILOGUE.B]) expect(ep).toContain(`> ${l}`);
    const credits = section('### 15.3', '## 16.');
    for (const l of CREDITS.filter((x) => x && !x.includes('{n}'))) expect(credits).toContain(l);
    const show = section('## 12.', '## 13.');
    const lines = new Set(Object.entries(DLG).filter(([k]) => k.startsWith('show.')).flatMap(([, v]) => (v ?? []).map((x) => x[1])));
    for (const m of show.matchAll(/^\| `\w+` \| [^|]+ \| ([^|（]+?) \|/gm)) {
      const text = m[1].trim();
      if (text === '见 P3') continue;
      expect([...lines].some((l) => l.startsWith(text.replace(/^点睛前：|^点睛后：/, '').split('点睛后：')[0].trim())), text).toBe(true);
    }
  });
  it('§9 hints are the puzzles\' T1–T3 verbatim; clues and items match §7', () => {
    const s9 = section('## 9.', '## 10.');
    for (const k of [...PUZZLES.flatMap((p) => p.hints), ...BEAT_HINTS.flatMap((b) => b.hints)]) {
      const tier = k.slice(-1);
      expect(s9, k).toContain(`T${tier}：${STR[k]}`);
    }
    const s7 = section('## 7.', '## 8.');
    for (const c of CLUES.filter((x) => x.id !== 'clue_rules' && x.id !== 'clue_granny_name')) expect(s7, c.id).toContain(`| ${STR[c.textKey]} |`);
    for (const i of ITEMS) expect(s7, i.id).toContain(`| ${STR[i.nameKey]} | ${STR[i.descKey]} |`);
    for (const p of PRESET_PHOTOS) expect(s7, p.id).toContain(`| ${STR[p.titleKey]} |`);
  });
});

describe('phaseClock (I-play: ?phase= sets a matching HUD clock)', () => {
  it('maps each phase to its first chapter clock', async () => {
    const { phaseClock } = await import('../data/story');
    expect(phaseClock('day')).toBe('06:10');
    expect(phaseClock('dusk')).toBe('17:40');
    expect(phaseClock('night')).toBe('22:00');
    expect(phaseClock('dawn')).toBe('05:40');
  });
});

describe('subway talk spot (I-play, requests-F #4 / ARCHITECTURE §2.8.15)', () => {
  it('a player 1.8 m in front of the attendant is ≤ 2.5 m from it_gantry and within its ±60° cone', async () => {
    const { SPOTS } = await import('../data/locations');
    const s = SPOTS.find((x) => x.id === 'sw_gantry')!;
    const p = s.pos as { x: number; z: number };
    const yaw = ((s.yaw ?? 0) * Math.PI) / 180;                  // interiors: heading 0 = +z, 90 = +x
    const stand = { x: p.x + Math.sin(yaw) * 1.8, z: p.z + Math.cos(yaw) * 1.8 };
    const g = INTERACTS.filter((i) => i.id === 'it_gantry').map((i) => i.spot as { x: number; z: number });
    expect(g.length).toBeGreaterThan(0);
    for (const a of g) {
      const d = Math.hypot(a.x - stand.x, a.z - stand.z);
      expect(d).toBeLessThanOrEqual(2.5);
      // the player faces the attendant (back along yaw): the gantry must be within ±60° of that facing
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const cos = ((a.x - stand.x) * fx + (a.z - stand.z) * fz) / d;
      expect(cos).toBeGreaterThan(Math.cos(Math.PI / 3));
    }
  });
});
