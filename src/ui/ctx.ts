// src/ui/ctx.ts — owner E. The shared UI context passed to every component (no module state lives in globals).
import type { Core } from '../contracts';
import type { ModalKind, NpcId, Settings, SfxId, SpeakerId, StrKey } from '../types';
import { NPCS } from '../data/npcs';
import { t } from '../data/zh';
import { h } from './dom';

export interface Layers {
  hud: HTMLElement; world: HTMLElement; tut: HTMLElement; dialog: HTMLElement; modal: HTMLElement;
  toast: HTMLElement; card: HTMLElement; top: HTMLElement;
}

export type ToastKind = 'item' | 'clue' | 'wx' | 'photoFull' | 'bst' | 'plain';

export interface UiCtx {
  readonly core: Core;
  readonly root: HTMLElement;
  readonly layers: Layers;
  settings: Settings;
  /** Speaker display name (GDD §0.1: the protagonist is 「？？？」 until name_known). */
  nameOf(s: SpeakerId): string;
  meName(): string;
  sfx(id: SfxId): void;
  toast(key: StrKey, vars?: Readonly<Record<string, string | number>>, kind?: ToastKind): void;
  /** Modal bookkeeping for busy(): set by the modal stack. */
  modalKind(): ModalKind | null;
  /** The phone is open on the 微信 tab (wx toasts would only repeat the chat). */
  phoneOnWx(): boolean;
  /** Inside a tick (from its input phase on): run in that tick's `late` phase, after every input consumer, so the E /
   *  Space that closed a dialogue or card is not also read as `interact` / shutter / movement in the same tick.
   *  Outside a tick (__game calls, promise continuations): run at once (Phase 2, I). */
  nextTick(fn: () => void): void;
  /** True while the loop runs in ?test (deterministic, no CSS motion). */
  readonly test: boolean;
}

export function isNpc(id: string): id is NpcId { return NPCS.some((n) => n.id === id); }

export function makeLayers(): { root: HTMLElement; layers: Layers } {
  const root = h('div', 'ui-root');
  const layer = (name: string) => { const e = h('div', `ui-layer ui-l-${name}`); root.append(e); return e; };
  const layers: Layers = {
    hud: layer('hud'), world: layer('world'), tut: layer('tut'), dialog: layer('dialog'), modal: layer('modal'),
    toast: layer('toast'), card: layer('card'), top: layer('top'),
  };
  return { root, layers };
}

export function speakerName(core: Core, s: SpeakerId): string {
  if (s === 'me') return core.store.has('name_known') ? t('ui.name.me') : t('ui.name.unknown');
  if (s === 'system') return t('ui.name.system');
  if (s === 'narr') return '';                     // narration: no name tag (P3r2 text)
  const n = NPCS.find((x) => x.id === s);
  return n ? t(n.nameKey) : String(s);
}
