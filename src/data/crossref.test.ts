// src/data/crossref.test.ts — owner: S. ARCHITECTURE §4.3: every id and key referenced in data exists; zh key prefixes
// are unique per section; id lists have no duplicates.
import { describe, expect, it } from 'vitest';
import type { Action, Cond, StrKey } from '../types';
import { STR as UI } from './zh/ui';
import { STR as LENS } from './zh/lens';
import { STR as WORLD } from './zh/world';
import { STR as CHARS } from './zh/chars';
import { STR as STORY } from './zh/story';
import { DLG, WX_TEXT, has } from './zh';
import { SPOT_IDS, WORLD_ANCHOR_IDS } from './ids/spots';
import { LABEL_IDS, TARGET_IDS } from './ids/lens';
import { CLUE_IDS, FLAG_IDS, INTERACT_IDS, NODE_IDS, OBJECTIVE_IDS, WX_IDS } from './ids/story';
import { TUT_IDS } from './ids/ui';
import { GATES, LOCATIONS, SIGNAL_ZONES, SPOTS } from './locations';
import { NPCS } from './npcs';
import { PALETTES } from './phases';
import { TARGETS } from './photoTargets';
import { LANDMARK_LABELS, SCENERY_LABELS } from './labels';
import { BESTIARY } from './bestiary';
import { BEATS, CHAPTER_BOOT, CHAPTERS, OBJECTIVES, STORY_RULES, ZONES } from './story';
import { NODES } from './dialogue';
import { CLUES, ITEMS, PRESET_PHOTOS } from './items';
import { BEAT_HINTS, INPUTS, PUZZLES } from './puzzles';
import { WX } from './wx';
import { GATE_OUTCOMES, SHOW_FALLBACK, SHOW_REACTIONS } from './show';
import { INTERACTS } from './interacts';

const SECTIONS: Record<string, { str: Readonly<Record<string, string>>; prefixes: readonly string[] }> = {
  ui: { str: UI, prefixes: ['ui.', 'kp.', 'np.', 'mb.', 'tut.', 'set.'] },
  lens: { str: LENS, prefixes: ['vf.', 'lbl.', 'fail.', 'bst.', 'tp.'] },
  world: { str: WORLD, prefixes: ['sign.', 'loc.', 'world.'] },
  chars: { str: CHARS, prefixes: ['npc.', 'scr.'] },
  story: { str: STORY, prefixes: ['txt.', 'item.', 'clue.', 'obj.', 'pz.', 'hint.', 'ch.', 'sys.'] },
};
const spotSet = new Set<string>(SPOT_IDS);

function dup(list: readonly string[]): string[] { return list.filter((x, i) => list.indexOf(x) !== i); }
function keysOfActions(acts: readonly Action[] | undefined, out: StrKey[]): void {
  for (const a of acts ?? []) if ('toast' in a) out.push(a.toast);
}
function flagsOfCond(c: Cond | undefined): string[] { return [...(c?.all ?? []), ...(c?.none ?? []), ...(c?.any ?? [])]; }

describe('zh sections', () => {
  it('use only their own prefixes and never collide', () => {
    const bad: string[] = [];
    const seen = new Map<string, string>();
    for (const [name, s] of Object.entries(SECTIONS)) {
      for (const k of Object.keys(s.str)) {
        if (!s.prefixes.some((p) => k.startsWith(p))) bad.push(`${name}:${k}`);
        if (seen.has(k)) bad.push(`dup ${k} in ${seen.get(k)} and ${name}`);
        seen.set(k, name);
      }
    }
    expect(bad).toEqual([]);
  });
  it('DLG lines belong to known nodes and speakers', () => {
    const speakers = new Set(['me', 'system', 'narr', ...NPCS.map((n) => n.id)]);
    for (const [node, lines] of Object.entries(DLG)) {
      expect((NODE_IDS as readonly string[]).includes(node)).toBe(true);
      for (const [sp] of lines ?? []) expect(speakers.has(sp)).toBe(true);
    }
  });
});

describe('id lists', () => {
  it('have no duplicates', () => {
    for (const l of [SPOT_IDS, WORLD_ANCHOR_IDS, TARGET_IDS, LABEL_IDS, FLAG_IDS, NODE_IDS, WX_IDS, CLUE_IDS, OBJECTIVE_IDS, INTERACT_IDS, TUT_IDS]) {
      expect(dup(l as readonly string[])).toEqual([]);
    }
  });
});

describe('data cross references', () => {
  it('SPOTS has exactly one def per SpotId with a pos matching its scene', () => {
    expect(dup(SPOTS.map((s) => s.id))).toEqual([]);
    expect(SPOTS.map((s) => s.id).sort()).toEqual([...SPOT_IDS].sort());
    for (const s of SPOTS) {
      expect('r' in s.pos).toBe(s.scene === 'planet');
      if (s.stand) expect('r' in s.stand).toBe(s.scene === 'planet');
    }
  });
  it('every referenced spot exists', () => {
    const refs: string[] = [
      ...GATES.map((g) => g.spot), ...Object.values(CHAPTER_BOOT).map((b) => b.spot),
      ...NPCS.flatMap((n) => [...Object.values(n.schedule), ...(n.overrides ?? []).map((o) => o.spot)]),
      ...TARGETS.flatMap((t) => [...(t.viewpoint ? [t.viewpoint.spot] : []), ...(t.mustBeHidden ?? [])]),
      ...PRESET_PHOTOS.flatMap((p) => (p.from ? [p.from] : [])),
      ...ZONES.flatMap((z) => (typeof z.at === 'string' ? [z.at] : [])),
    ];
    expect(refs.filter((r) => !spotSet.has(r))).toEqual([]);
  });
  it('every referenced string key exists', () => {
    const keys: StrKey[] = [
      ...LOCATIONS.map((l) => l.nameKey), ...NPCS.map((n) => n.nameKey),
      ...TARGETS.flatMap((t) => [...t.labels.map((l) => l.key), ...(t.okKey ? [t.okKey] : []), ...Object.values(t.failKeys ?? {})]),
      ...SCENERY_LABELS.flatMap((l) => l.keys.filter((k): k is string => k !== null)), ...Object.values(LANDMARK_LABELS),
      ...BESTIARY.flatMap((b) => [b.nameKey, b.whereKey, b.bodyKey]),
      ...OBJECTIVES.map((o) => o.textKey), ...ITEMS.flatMap((i) => [i.nameKey, i.descKey]), ...CLUES.map((c) => c.textKey),
      ...PRESET_PHOTOS.map((p) => p.titleKey), ...PUZZLES.flatMap((p) => [p.titleKey, ...p.hints]),
      ...BEAT_HINTS.flatMap((b) => b.hints), ...WX.flatMap((w) => w.keys),
      ...INTERACTS.flatMap((i) => (i.promptKey ? [i.promptKey] : [])),
      ...NODES.flatMap((n) => (n.choices ?? []).map((c) => c.key)),
      ...Object.values(INPUTS).flatMap((d) => [...(d.failKeys ?? []), ...Object.values(d.cells ?? {}), ...(d.hintAfter ? [d.hintAfter.key] : [])]),
    ];
    const actions: Action[] = [
      ...STORY_RULES.flatMap((r) => r.effects), ...BEATS.flatMap((b) => b.end), ...NODES.flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.actions ?? [])]),
      ...TARGETS.flatMap((t) => t.onShot?.actions ?? []), ...Object.values(INPUTS).flatMap((d) => [...d.onOk, ...(d.onFail ?? [])]),
      ...SHOW_REACTIONS.flatMap((r) => r.actions ?? []), ...Object.values(GATE_OUTCOMES).flatMap((g) => g.actions ?? []),
      ...INTERACTS.flatMap((i) => i.actions ?? []),
    ];
    keysOfActions(actions, keys);
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });
  it('every referenced dialogue node and wx exists, with text', () => {
    const acts: Action[] = [
      ...STORY_RULES.flatMap((r) => r.effects), ...BEATS.flatMap((b) => b.end),
      ...NODES.flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.actions ?? [])]),
      ...TARGETS.flatMap((t) => t.onShot?.actions ?? []), ...Object.values(INPUTS).flatMap((d) => [...d.onOk, ...(d.onFail ?? [])]),
      ...SHOW_REACTIONS.flatMap((r) => r.actions ?? []), ...Object.values(GATE_OUTCOMES).flatMap((g) => g.actions ?? []),
      ...INTERACTS.flatMap((i) => i.actions ?? []),
    ];
    const nodeIds = new Set<string>(NODES.map((n) => n.id));
    const nodeRefs = [
      ...acts.flatMap((a) => ('node' in a ? [a.node] : [])),
      ...NODES.flatMap((n) => (n.choices ?? []).flatMap((c) => (c.then ? [c.then] : []))),
    ];
    expect(nodeRefs.filter((id) => !nodeIds.has(id))).toEqual([]);
    expect(NODES.filter((n) => !(DLG[n.id]?.length)).map((n) => n.id)).toEqual([]);
    const wxIds = new Set<string>(WX.map((w) => w.id));
    const wxRefs = acts.flatMap((a) => ('wx' in a ? [a.wx] : []));
    expect(wxRefs.filter((id) => !wxIds.has(id))).toEqual([]);
    expect(WX.filter((w) => !w.keys.length && !(WX_TEXT[w.id]?.length)).map((w) => w.id)).toEqual([]);
  });
  it('flags used in conditions are known flags', () => {
    const known = new Set<string>([...FLAG_IDS, 'bst_second_shadow', 'bst_manhole_eye', 'bst_queue_shadows', 'bst_lion_turns', 'bst_tv_still_on', 'bst_fish_watching']);
    const conds: (Cond | undefined)[] = [
      ...LOCATIONS.map((l) => l.openWhen), ...GATES.map((g) => g.openWhen), ...NPCS.flatMap((n) => (n.overrides ?? []).map((o) => o.when)),
      ...NODES.map((n) => n.when), ...STORY_RULES.map((r) => r.guard), ...INTERACTS.map((i) => i.when),
      ...PUZZLES.map((p) => p.availableWhen), ...SHOW_REACTIONS.map((r) => r.when), ...SHOW_FALLBACK.map((r) => r.when),
    ];
    const bad = conds.flatMap(flagsOfCond).filter((f) => !known.has(f) && !f.startsWith('seen:'));
    expect(bad).toEqual([]);
  });
  it('palettes cover every key with valid hex colours; signal zones and chapters are sane', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const [k, p] of Object.entries(PALETTES)) {
      expect(p.key).toBe(k);
      for (const c of [p.skyBase, p.skyCloud, p.ink, p.speck, p.moon, p.inkHalo, p.fog?.color]) if (c) expect(c).toMatch(hex);
    }
    for (const z of SIGNAL_ZONES) expect(!!z.circle || !!z.ring).toBe(true);
    expect(CHAPTERS.map((c) => c.id)).toEqual(['prologue', 'ch1', 'ch2', 'ch3', 'finale']);
  });
});
