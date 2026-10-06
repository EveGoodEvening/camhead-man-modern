// src/ui/inputs/inputs.ts — owner E. Input widgets engine (GDD §16.5, ARCHITECTURE §3.E item 8): answers and outcomes
// from INPUTS (F); every submit emits inputResult; state changes (onOk / onFail) apply synchronously.
import type { Action, InputKind } from '../../types';
import { INPUTS } from '../../data/puzzles';
import { has } from '../../data/zh';
import type { UiCtx } from '../ctx';
import type { ModalStack } from '../modal';
import { cellKey, newSession, stageValues, submitStage, type InputSession } from './logic';
import { keypadView, milkboxView, namePickerView, type InputView } from './widgets';

export interface Inputs {
  open(kind: InputKind): Promise<void>;
  submit(kind: InputKind, value: string | readonly string[]): void;
  readonly openKind: InputKind | null;
}

const presents = (acts: readonly Action[] | undefined) => (acts ?? []).some((a) => 'node' in a || 'card' in a || 'beat' in a || 'ui' in a);

export function createInputs(ctx: UiCtx, modals: ModalStack): Inputs {
  const { core } = ctx;
  const sessions = new Map<InputKind, InputSession>();
  let view: { kind: InputKind; v: InputView; resolve: () => void } | null = null;
  const session = (k: InputKind) => { let s = sessions.get(k); if (!s || s.complete) { s = newSession(k); sessions.set(k, s); } return s; };
  const closeView = () => { if (view) modals.close(view.v.entry); };
  core.bus.on('stateLoaded', () => { closeView(); sessions.clear(); });   // a load/boot restarts every widget at stage 0

  const api: Inputs = {
    get openKind() { return view?.kind ?? null; },
    open(kind) {
      const def = INPUTS[kind];
      if (!def) { core.log.warn(`[ui] no INPUTS.${kind}`); return Promise.resolve(); }
      if (view) closeView();
      const s = session(kind);
      s.stage = 0;
      return new Promise<void>((resolve) => {
        const deps = { def, stage: () => s.stage, submit: (v: string) => api.submit(kind, v), close: closeView, sfx: () => ctx.sfx('sfx_keypad') };
        const v = kind === 'namepicker' ? namePickerView(deps)
          : kind === 'milkbox' ? milkboxView(deps, (box) => cellKey(def, box, has))
          : keypadView(kind, deps);
        const prevClose = v.entry.onClose;
        v.entry.onClose = () => { prevClose?.(); if (view?.v === v) view = null; resolve(); };
        view = { kind, v, resolve };
        modals.push(v.entry);
      });
    },
    submit(kind, value) {
      const def = INPUTS[kind];
      if (!def) { core.log.warn(`[ui] submitInput: no INPUTS.${kind}`); return; }
      const s = session(kind);
      const vals = stageValues(kind, value);
      for (const v of vals) {
        const st = s.stage;
        const r = submitStage(def, s, v, has);
        const shown = view?.kind === kind ? view.v : null;
        if (!r.ok) {
          ctx.sfx(kind === 'milkbox' ? 'sfx_click' : 'sfx_fail');
          if (kind !== 'milkbox' && presents(def.onFail)) closeView(); else shown?.result(r, v, st);
          core.bus.emit('inputResult', { kind, ok: false, value: v });
          if (def.onFail?.length) void core.rules.run(def.onFail, `input:${kind}:fail`);
          return;
        }
        if (!r.complete) { shown?.result(r, v, st); continue; }
        ctx.sfx(kind === 'milkbox' ? 'sfx_door' : 'sfx_scan');
        if (kind === 'milkbox') shown?.result(r, v, st);
        else { closeView(); if (r.messageKey) ctx.toast(r.messageKey); }
        core.bus.emit('inputResult', { kind, ok: true, value: vals.join('') });
        void core.rules.run(def.onOk, `input:${kind}:ok`);
        return;
      }
    },
  };
  return api;
}
