// src/ui/inputs/logic.ts — owner E. Pure stage logic for the keypad / name picker / milk box (GDD §16.5, §18.4).
import type { InputDef, InputKind, StrKey } from '../../types';

export interface InputSession { kind: InputKind; stage: number; fails: number[]; complete: boolean }
export function newSession(kind: InputKind): InputSession { return { kind, stage: 0, fails: [], complete: false }; }

const DEFAULT_FAIL: Readonly<Record<InputKind, readonly StrKey[]>> = {
  locker: ['kp.locker.badSlot', 'kp.locker.badCode'],
  lighthouse: ['kp.lh.bad'],
  namepicker: ['np.bad'],
  milkbox: [],
};
const OK_KEY: Readonly<Record<InputKind, StrKey | null>> = { locker: 'kp.locker.ok', lighthouse: 'kp.lh.ok', namepicker: null, milkbox: null };
const DEFAULT_HINT: Partial<Record<InputKind, NonNullable<InputDef['hintAfter']>>> = {
  locker: { stage: 1, fails: 2, key: 'kp.locker.memo' },
};

export function stageCount(def: InputDef): number { return Math.max(1, def.answer.length); }
/** Digits per keypad stage (locker 2 + 4, lighthouse 4). */
export function stageLength(def: InputDef, stage: number): number { return [...(def.answer[stage] ?? '')].length || 4; }

/** Prompt key for the current stage. */
export function stagePrompt(kind: InputKind, stage: number): StrKey {
  if (kind === 'locker') return stage === 0 ? 'kp.locker.slot' : 'kp.locker.code';
  if (kind === 'lighthouse') return 'kp.lh.ask';
  if (kind === 'namepicker') return 'np.title';
  return 'mb.hint';
}

/** Milk-box cell text: InputDef.cells, else mb.<box> when that key exists, else mb.empty. */
export function cellKey(def: InputDef, box: string, has: (k: StrKey) => boolean): StrKey {
  const c = def.cells?.[box];
  if (c) return c;
  return has(`mb.${box}`) ? `mb.${box}` : 'mb.empty';
}

export interface StageResult {
  ok: boolean; complete: boolean;
  messageKey: StrKey | null;   // fail or success text (null = none)
  hintKey: StrKey | null;      // extra line after repeated fails (GDD P2: 寄件人备注)
}

/** Submit one stage value (namepicker: the joined picks; milkbox: the box id). Mutates the session. */
export function submitStage(def: InputDef, s: InputSession, value: string, has: (k: StrKey) => boolean): StageResult {
  if (s.complete) return { ok: true, complete: true, messageKey: null, hintKey: null };
  const want = def.answer[s.stage] ?? '';
  const ok = value === want;
  if (def.kind === 'milkbox') {
    const msg = cellKey(def, value, has);
    if (ok) s.complete = true;
    return { ok, complete: ok, messageKey: msg, hintKey: null };
  }
  if (ok) {
    s.stage++;
    if (s.stage >= stageCount(def)) { s.complete = true; return { ok: true, complete: true, messageKey: OK_KEY[def.kind], hintKey: null }; }
    return { ok: true, complete: false, messageKey: null, hintKey: null };
  }
  s.fails[s.stage] = (s.fails[s.stage] ?? 0) + 1;
  const failKey = def.failKeys?.[s.stage] ?? DEFAULT_FAIL[def.kind][s.stage] ?? DEFAULT_FAIL[def.kind][0] ?? null;
  const h = def.hintAfter ?? DEFAULT_HINT[def.kind];
  const hintKey = h && h.stage === s.stage && s.fails[s.stage] >= h.fails ? h.key : null;
  return { ok: false, complete: false, messageKey: failKey, hintKey };
}

/** Normalise a debug/API value into stage values: arrays are per stage (locker) or joined (namepicker, milkbox). */
export function stageValues(kind: InputKind, value: string | readonly string[]): string[] {
  if (typeof value === 'string') return [value];
  if (kind === 'namepicker' || kind === 'milkbox') return [value.join('')];
  return [...value];
}
