// src/ui/logic.test.ts — owner E. Pure UI logic: node selection, typewriter, hints, gate verdicts, input stages, wx queue.
import { describe, expect, it } from 'vitest';
import type { Cond, DialogueNode, FlagId, InputDef, NodeId, ObjectiveDef, PuzzleDef, ShowFallbackRow, ShowReaction } from '../types';
import { autoNode, eligibleNodes, endAdvance, fillName, fixedOptions, pickNode, talkableByE, visibleChoices } from './dialog/engine';
import { clicks, duration, schedule, visibleCount } from './dialog/typewriter';
import { currentTarget, hintRequest, hintTargets, hintTick, newHintState, onProgress, progressed, tierFloor } from './hints';
import { findReaction, gateVerdict, maxPhotos, tagsOf } from './show/logic';
import { newSession, stageValues, submitStage } from './inputs/logic';
import { GAP_S, TYPING_S, WxQueue, type WxEvent } from './wxQueue';

// ---- a tiny cond evaluator over a flag set (the real one is core/rules) ----
function condFor(flags: Set<string>, o: { phase?: string; night?: boolean; tags?: string[] } = {}) {
  return (c: Cond | undefined): boolean => {
    if (!c) return true;
    if (c.phase && !c.phase.includes((o.phase ?? 'day') as never)) return false;
    if (c.all && !c.all.every((f) => flags.has(f))) return false;
    if (c.none && c.none.some((f) => flags.has(f))) return false;
    if (c.any && !c.any.some((f) => flags.has(f))) return false;
    if (c.tags && !c.tags.some((t) => (o.tags ?? []).includes(t))) return false;
    if (c.lens === 'night' && !o.night) return false;
    if (c.lens === 'plain' && o.night) return false;
    return true;
  };
}
const N = (o: Record<string, unknown> & { id: string; owner: string }): DialogueNode =>
  ({ when: {}, prio: 10, ...o } as unknown as DialogueNode);

const NODES: DialogueNode[] = [
  N({ id: 'xiaolin.first', owner: 'xiaolin', prio: 100, once: true, when: { phase: ['day', 'dusk', 'night'], none: ['met_xiaolin'] } }),
  N({ id: 'xiaolin.studio', owner: 'xiaolin', prio: 90, once: true, when: { phase: ['day'], all: ['studio_locked_seen'], none: ['locker_seen'] } }),
  N({ id: 'xiaolin.day_idle', owner: 'xiaolin', prio: 10, when: { phase: ['day'] } }),
  N({ id: 'xiaolin.dawn', owner: 'xiaolin', when: { phase: ['dawn'] } }),
  N({ id: 'tudi.after_p4', owner: 'tudi', prio: 100, once: true, when: { phase: ['dusk'], all: ['P4_done'], lens: 'night' } }),
  N({ id: 'meiqiu.plain', owner: 'meiqiu', prio: 1, when: { lens: 'plain' } }),
  N({ id: 'meiqiu.roof', owner: 'meiqiu', prio: 100, once: true, when: { phase: ['dusk'], lens: 'night' } }),
  N({ id: 'chai.night_first', owner: 'chai', auto: true, once: true, when: { phase: ['night'] } }),
];

describe('dialogue node selection (GDD §11.0)', () => {
  it('picks the highest prio eligible node and respects once/seen', () => {
    const flags = new Set<string>();
    const seen = new Set<string>();
    const ev = condFor(flags);
    expect(pickNode(NODES, 'xiaolin', ev, (id) => seen.has(id))?.id).toBe('xiaolin.first');
    seen.add('xiaolin.first');
    expect(pickNode(NODES, 'xiaolin', ev, (id) => seen.has(id))?.id).toBe('xiaolin.day_idle');
    flags.add('studio_locked_seen');
    expect(pickNode(NODES, 'xiaolin', ev, (id) => seen.has(id))?.id).toBe('xiaolin.studio');
    flags.add('locker_seen');
    expect(pickNode(NODES, 'xiaolin', ev, (id) => seen.has(id))?.id).toBe('xiaolin.day_idle');
  });
  it('the phase matrix: day idle vs dawn', () => {
    const ev = condFor(new Set(['met_xiaolin']), { phase: 'dawn' });
    expect(eligibleNodes(NODES, 'xiaolin', ev, () => false).map((n) => n.id)).toEqual(['xiaolin.dawn']);
  });
  it('ties keep table order; missing prio = 10', () => {
    const nodes = [N({ id: 'a' as NodeId, owner: 'x' }), N({ id: 'b' as NodeId, owner: 'x', prio: 10 })];
    expect(eligibleNodes(nodes, 'x', () => true, () => false).map((n) => n.id)).toEqual(['a', 'b']);
  });
  it('lens gating: night nodes only in the night viewfinder; plain nodes only outside it', () => {
    const flags = new Set(['P4_done']);
    expect(pickNode(NODES, 'tudi', condFor(flags, { phase: 'dusk' }), () => false)).toBeNull();
    expect(pickNode(NODES, 'tudi', condFor(flags, { phase: 'dusk', night: true }), () => false)?.id).toBe('tudi.after_p4');
    expect(pickNode(NODES, 'meiqiu', condFor(flags, { phase: 'dusk' }), () => false)?.id).toBe('meiqiu.plain');
    expect(pickNode(NODES, 'meiqiu', condFor(flags, { phase: 'dusk', night: true }), () => false)?.id).toBe('meiqiu.roof');
    expect(talkableByE(NODES, 'tudi', condFor(flags, { phase: 'dusk' }), () => false)).toBe(false);
    expect(talkableByE(NODES, 'meiqiu', condFor(flags, { phase: 'dusk' }), () => false)).toBe(true);
  });
  it('auto nodes', () => {
    expect(autoNode(NODES, 'chai', condFor(new Set(), { phase: 'night' }), () => false)?.id).toBe('chai.night_first');
    expect(autoNode(NODES, 'chai', condFor(new Set(), { phase: 'night' }), () => true)).toBeNull();
    // best prio wins, ties keep table order; non-auto nodes never count (allocation-free scan, review fix)
    const auto = [
      N({ id: 'a.low', owner: 'a', auto: true, prio: 5 }), N({ id: 'a.hi1', owner: 'a', auto: true, prio: 20 }),
      N({ id: 'a.hi2', owner: 'a', auto: true, prio: 20 }), N({ id: 'a.talk', owner: 'a', prio: 99 }),
    ];
    expect(autoNode(auto, 'a', condFor(new Set()), () => false)?.id).toBe('a.hi1');
    // plain-E talkability skips spent once nodes and night-only nodes
    const once = [N({ id: 'b.once', owner: 'b', once: true }), N({ id: 'b.night', owner: 'b', when: { lens: 'night' } })];
    expect(talkableByE(once, 'b', condFor(new Set(), { night: true }), () => true)).toBe(false);
    expect(talkableByE(once, 'b', condFor(new Set()), () => false)).toBe(true);
  });
  it('fixed options, choices and advance()', () => {
    const n = N({ id: 'att.bus', owner: 'attendant', choices: [{ key: 'a' }, { key: 'b', when: { all: ['x' as FlagId] } }, { key: 'c' }] });
    expect(visibleChoices(n, condFor(new Set())).map((c) => c.index)).toEqual([0, 2]);
    expect(fixedOptions(n, 'attendant')).toEqual(['show', 'bye']);
    expect(fixedOptions(N({ id: 'me.p1', owner: 'me' }), null)).toEqual([]);
    expect(fixedOptions(N({ id: 'q', owner: 'xiaolin', noFixedOptions: true }), 'xiaolin')).toEqual([]);
    expect(endAdvance(0)).toBe('close');
    expect(endAdvance(2)).toBe('wait');
    expect(fillName('{name}？', '？？？')).toBe('？？？？');
  });
});

describe('typewriter (ART §8.2)', () => {
  it('25 ms per character with punctuation pauses', () => {
    const s = schedule('啊，好。', 'mid');
    expect(s[0]).toBeCloseTo(0.025);
    expect(s[1]).toBeCloseTo(0.05);
    expect(s[2]).toBeCloseTo(0.05 + 0.12 + 0.025);
    expect(s[3]).toBeCloseTo(0.195 + 0.025);
    expect(duration(s)).toBeCloseTo(0.22);
  });
  it('a run of … pauses 400 ms once; 。！？ 250 ms', () => {
    const s = schedule('……我', 'mid');
    expect(s[1] - s[0]).toBeCloseTo(0.025);
    expect(s[2] - s[1]).toBeCloseTo(0.425);
    const t = schedule('好！走', 'mid');
    expect(t[2] - t[1]).toBeCloseTo(0.275);
  });
  it('speed setting scales chars and pauses', () => {
    expect(schedule('一二', 'fast')[1]).toBeCloseTo(0.024);
    expect(schedule('一二', 'slow')[1]).toBeCloseTo(0.09);
  });
  it('visibleCount', () => {
    const s = schedule('一二三', 'mid');
    expect(visibleCount(s, 0)).toBe(0);
    expect(visibleCount(s, 0.025)).toBe(1);
    expect(visibleCount(s, 0.06)).toBe(2);
    expect(visibleCount(s, 10)).toBe(3);
    expect(clicks('，')).toBe(false);
    expect(clicks('我')).toBe(true);
  });
});

const PZ = (id: string, steps: string[], done: string, when: Cond = {}): PuzzleDef =>
  ({ id, chapter: 'ch1', titleKey: 't', availableWhen: when, steps, solvedFlag: done, targets: [], hints: [`hint.${id}.1`, `hint.${id}.2`, `hint.${id}.3`], clockAfter: '' } as unknown as PuzzleDef);

describe('hints (GDD §13)', () => {
  const puzzles = [
    PZ('P1_rephoto_bridge', [], 'P1_done'),
    PZ('P2_signal_locker', ['studio_locked_seen', 'locker_seen', 'sms_full'], 'P2_done'),
    PZ('P6_lighthouse_1987', ['trail_1987', 'lighthouse_open'], 'P6_done', { all: ['ch3_started'] }),
    PZ('P7_line_zero', ['name_known'], 'P7_done', { all: ['ch3_started'] }),
    PZ('P8_chai_to_zhe', [], 'P8_done', { all: ['ch3_started'] }),
    PZ('P9_paper_eye', ['dot_taken'], 'P9_done', { all: ['P8_done'] }),
  ];
  const targets = hintTargets(puzzles, []);
  const objectives = [
    { id: 'obj_locker', textKey: 'x', smoke: [], hintFor: 'P2_signal_locker' },
    { id: 'obj_frames', textKey: 'y', smoke: [] },
  ] as unknown as ObjectiveDef[];

  it('target: recent progress > objective hintFor > night hub order', () => {
    const flags = new Set<string>(['ch3_started']);
    const ctx = { has: (f: FlagId) => flags.has(f), evalCond: condFor(flags), objectives, recent: null as string | null, night: true, objective: 'obj_frames' as const };
    expect(currentTarget(targets, ctx)?.id).toBe('P6_lighthouse_1987');
    flags.add('P6_done');
    expect(currentTarget(targets, ctx)?.id).toBe('P7_line_zero');
    expect(progressed(targets, 'dot_taken', (f) => flags.has(f))?.id).toBe('P9_paper_eye');
    expect(currentTarget(targets, { ...ctx, recent: 'P9_paper_eye' })?.id).toBe('P9_paper_eye');
    expect(currentTarget(targets, { ...ctx, night: false, objective: 'obj_locker' as never })?.id).toBe('P2_signal_locker');
  });

  it('tiers at 90/180/300 s of unpaused idle time; progress resets', () => {
    const s = newHintState();
    const sent: number[] = [];
    let now = 0;
    const run = (secs: number, paused = false) => {
      for (let i = 0; i < secs * 10; i++) { now += 0.1; const r = hintTick(s, { dt: 0.1, paused, now, target: 'P2' }); if (r) sent.push(r.tier); }
    };
    run(89); expect(sent).toEqual([]);
    run(50, true); expect(sent).toEqual([]);            // paused during dialogue / beats / cards
    run(2); expect(sent).toEqual([1]);
    run(90); expect(sent).toEqual([1, 2]);
    onProgress(s);
    run(89.5); expect(sent).toEqual([1, 2]);
    run(1); expect(sent).toEqual([1, 2, 1]);
  });

  it('H: next tier now, ≥ 20 s apart (P3r3 G5: an early H is answered, not queued), T3 repeats', () => {
    const s = newHintState();
    hintTick(s, { dt: 0, paused: false, now: 0, target: 'P2' });
    expect(hintRequest(s, 100)).toEqual({ send: 1 });
    expect(hintRequest(s, 105)).toBe('wait');
    expect(hintRequest(s, 106)).toBe('wait');
    expect(hintTick(s, { dt: 0.1, paused: false, now: 119.9, target: 'P2' })).toBeNull();
    expect(hintTick(s, { dt: 0.1, paused: false, now: 120, target: 'P2' })).toBeNull();   // nothing was queued
    expect(hintRequest(s, 120)).toEqual({ send: 2 });
    expect(hintRequest(s, 141)).toEqual({ send: 3 });
    expect(hintRequest(s, 170)).toEqual({ send: 3 });
    expect(hintRequest(newHintState(), 0)).toBe('none');
  });

  it('P3r3 G5: a step already done lifts the first tier; the night hub follows the smoke', () => {
    const withFloor = hintTargets([{ ...puzzles[1], hintFloor: { locker_seen: 2, sms_full: 3 } } as PuzzleDef], []);
    const flags = new Set<string>(['sms_full']);
    const has = (f: FlagId) => flags.has(f);
    expect(tierFloor(withFloor[0], has)).toBe(3);
    flags.delete('sms_full'); flags.add('locker_seen');
    expect(tierFloor(withFloor[0], has)).toBe(2);
    expect(tierFloor(targets[1], has)).toBe(1);
    // H after progress: the floor tier first, then T3
    const s = newHintState();
    hintTick(s, { dt: 0, paused: false, now: 0, target: 'P2', floor: 2 });
    expect(hintRequest(s, 30)).toEqual({ send: 2 });
    // auto tiers shift by the floor: 90 s idle → T3 at floor 3
    const a = newHintState();
    let got: unknown = null;
    for (let t = 0; t < 91 && !got; t += 0.5) got = hintTick(a, { dt: 0.5, paused: false, now: t, target: 'P2', floor: 3 });
    expect(got).toEqual({ tier: 3, auto: true });
    // chapter 3: smoke on P7 wins over the fixed P6 → P9 order and over recent progress elsewhere
    const f3 = new Set<string>(['ch3_started']);
    const ctx = { has: (f: FlagId) => f3.has(f), evalCond: condFor(f3), objectives, recent: 'P6_lighthouse_1987' as string | null, night: true, objective: 'obj_frames' as const, smoke: 'P7_line_zero' };
    expect(currentTarget(targets, ctx)?.id).toBe('P7_line_zero');
    f3.add('P7_done');
    expect(currentTarget(targets, ctx)?.id).toBe('P6_lighthouse_1987');
  });

  it('a new target restarts tiers', () => {
    const s = newHintState();
    hintTick(s, { dt: 0, paused: false, now: 0, target: 'A' });
    hintRequest(s, 50);
    expect(s.tier).toBe(1);
    hintTick(s, { dt: 0.1, paused: false, now: 51, target: 'B' });
    expect(s.tier).toBe(0);
  });
});

describe('show (GDD §9 P3, §12)', () => {
  const open = { tags: ['granny_face_open', 'npc:granny_wang'] };
  const closed = { tags: ['granny_face_closed', 'npc:granny_wang'] };
  it('gate verdict table', () => {
    expect(gateVerdict([open, closed])).toBe('pass');
    expect(gateVerdict([closed, open])).toBe('pass');
    expect(gateVerdict([open, open])).toBe('both_open');
    expect(gateVerdict([closed, closed])).toBe('both_closed');
    expect(gateVerdict([open])).toBe('one');
    expect(gateVerdict([open, { tags: ['portrait_wall'] }])).toBe('one');
    expect(gateVerdict([{ tags: ['npc:xiaolin'] }])).toBe('other');
    expect(gateVerdict([{ tags: ['npc:granny_wang'] }])).toBe('noface');       // side view / distant: not her face
    expect(gateVerdict([{ tags: ['portrait_wall'] }])).toBe('noface');
    expect(gateVerdict([])).toBe('noface');
    expect(maxPhotos('gate')).toBe(2);
    expect(maxPhotos('xiaolin')).toBe(1);
  });
  it('reaction rows in order, then fallback by when', () => {
    const R = [
      { receiver: 'granny_wang', tags: ['height_marks'], node: 'granny.a' },
      { receiver: 'granny_wang', tags: ['ph_2006_group'], when: { none: ['P8_done'] }, node: 'granny.b' },
      { receiver: 'granny_wang', tags: ['ph_2006_group'], when: { all: ['P8_done'] }, node: 'granny.c' },
      { receiver: 'zhimei', tags: ['zhimei_sea'], node: 'zhimei.done', actions: [{ give: 'frame_2' }] },
    ] as unknown as ShowReaction[];
    const F = [
      { receiver: 'zhimei', when: { none: ['zhimei_eye'] }, node: 'zhimei.f1' },
      { receiver: 'zhimei', node: 'zhimei.f2' },
    ] as unknown as ShowFallbackRow[];
    const flags = new Set<string>();
    const ev = condFor(flags);
    expect(findReaction('granny_wang', tagsOf([{ tags: [], preset: 'ph_2006_group' }]), R, F, ev)?.node).toBe('granny.b');
    flags.add('P8_done');
    expect(findReaction('granny_wang', tagsOf([{ tags: [], preset: 'ph_2006_group' }]), R, F, ev)?.node).toBe('granny.c');
    expect(findReaction('zhimei', tagsOf([{ tags: ['zhimei_sea'] }]), R, F, ev)).toMatchObject({ node: 'zhimei.done', matched: true });
    expect(findReaction('zhimei', tagsOf([{ tags: [] }]), R, F, ev)?.node).toBe('zhimei.f1');
    flags.add('zhimei_eye');
    expect(findReaction('zhimei', tagsOf([{ tags: [] }]), R, F, ev)?.node).toBe('zhimei.f2');
    expect(findReaction('xiaoliu', tagsOf([{ tags: [] }]), R, F, ev)).toBeNull();
  });
});

describe('inputs (GDD §16.5)', () => {
  const has = (k: string) => ['mb.101', 'mb.403'].includes(k);
  const locker = { kind: 'locker', answer: ['17', '0815'], onOk: [] } as unknown as InputDef;
  it('locker: two stages, fail keys, memo hint after 2 code failures', () => {
    const s = newSession('locker');
    expect(submitStage(locker, s, '18', has)).toMatchObject({ ok: false, messageKey: 'kp.locker.badSlot', hintKey: null });
    expect(submitStage(locker, s, '17', has)).toMatchObject({ ok: true, complete: false });
    expect(submitStage(locker, s, '0816', has)).toMatchObject({ ok: false, messageKey: 'kp.locker.badCode', hintKey: null });
    expect(submitStage(locker, s, '0817', has)).toMatchObject({ ok: false, hintKey: 'kp.locker.memo' });
    expect(submitStage(locker, s, '0815', has)).toMatchObject({ ok: true, complete: true, messageKey: 'kp.locker.ok' });
  });
  it('lighthouse, namepicker and milkbox', () => {
    const lh = { kind: 'lighthouse', answer: ['1987'], onOk: [] } as unknown as InputDef;
    expect(submitStage(lh, newSession('lighthouse'), '1986', has)).toMatchObject({ ok: false, messageKey: 'kp.lh.bad' });
    expect(submitStage(lh, newSession('lighthouse'), '1987', has)).toMatchObject({ ok: true, complete: true });
    const np = { kind: 'namepicker', answer: ['周远'], onOk: [] } as unknown as InputDef;
    expect(stageValues('namepicker', ['周', '远'])).toEqual(['周远']);
    expect(submitStage(np, newSession('namepicker'), '周望', has)).toMatchObject({ ok: false, messageKey: 'np.bad' });
    expect(submitStage(np, newSession('namepicker'), '周远', has).complete).toBe(true);
    const mb = { kind: 'milkbox', answer: ['403'], onOk: [] } as unknown as InputDef;
    expect(submitStage(mb, newSession('milkbox'), '101', has)).toMatchObject({ ok: false, messageKey: 'mb.101' });
    expect(submitStage(mb, newSession('milkbox'), '202', has)).toMatchObject({ ok: false, messageKey: 'mb.empty' });
    expect(submitStage(mb, newSession('milkbox'), '403', has)).toMatchObject({ ok: true, complete: true, messageKey: 'mb.403' });
    expect(stageValues('locker', ['17', '0815'])).toEqual(['17', '0815']);
  });
});

describe('wx queue (GDD §11.12)', () => {
  it('typing 1.2 s, then lines 0.8 s apart; batches chain', () => {
    const q = new WxQueue();
    const ev: WxEvent[] = [];
    q.push({ sender: 'tudi', tag: 'a', lines: [{ text: '1' }, { text: '2' }] }, ev);
    q.push({ sender: 'tudi', tag: 'b', lines: [{ text: '3' }] }, ev);
    const at: [number, string][] = [];
    for (let t = 0; t <= 6; t += 0.05) {
      const out: WxEvent[] = [];
      q.update(t, out);
      for (const e of out) if (e.kind === 'line') at.push([Math.round(t * 100) / 100, e.line.text]);
    }
    expect(at[0]).toEqual([TYPING_S, '1']);
    expect(at[1][0]).toBeCloseTo(TYPING_S + GAP_S, 1);
    expect(at[2][0]).toBeCloseTo(TYPING_S * 2 + GAP_S, 1);
    expect(q.busy).toBe(false);
  });
  it('quiet batches and flush deliver at once', () => {
    const q = new WxQueue();
    const ev: WxEvent[] = [];
    q.push({ sender: 'tudi', tag: 'q', quiet: true, lines: [{ text: 'x' }] }, ev);
    expect(ev.length).toBe(1);
    q.push({ sender: 'tudi', tag: 'a', lines: [{ text: '1' }, { text: '2' }] }, ev);
    const out: WxEvent[] = [];
    q.flush(out);
    expect(out.filter((e) => e.kind === 'line').length).toBe(2);
  });
});

// ---- I-play (Phase 2): prompt placement ----
import { PROMPT_DOCK_Y, promptScreenPos } from './hud/promptPos';
describe('prompt placement (I-play)', () => {
  it('on screen: follows the anchor, clamped to the margins', () => {
    expect(promptScreenPos({ x: 0, y: 0, z: 0.5 }, 1280, 720)).toEqual({ x: 640, y: 360, docked: false });
    expect(promptScreenPos({ x: 1.0, y: -1.0, z: 0.5 }, 1280, 720)).toEqual({ x: 1200, y: 680, docked: false });
  });
  it('behind the camera or far off screen (lh_door looking up): docked at the lower centre, never hidden', () => {
    const dock = { x: 640, y: Math.round(720 * PROMPT_DOCK_Y), docked: true };
    expect(promptScreenPos({ x: 0.2, y: 0.1, z: 1.3 }, 1280, 720)).toEqual(dock);
    expect(promptScreenPos({ x: 0.1, y: -4.0, z: 0.9 }, 1280, 720)).toEqual(dock);
    expect(promptScreenPos({ x: NaN, y: 0, z: 0.5 }, 1280, 720)).toEqual(dock);
  });
});

import { overPhone } from './hud/tutorial';
describe('tutorial bubbles over the phone (I-play)', () => {
  it('tut_setref shows over the phone modal; gameplay bubbles do not', () => {
    expect(overPhone('tut_setref', true)).toBe(true);
    expect(overPhone('tut_setref', false)).toBe(false);
    expect(overPhone('tut_view', true)).toBe(false);
    expect(overPhone(null, true)).toBe(false);
  });
});
