// src/ui/dev.ts — owner E. ?dev=ui:<state>[:<id>] puts one UI component into a given state for screenshots and for the
// dev/ui.html gallery. Uses only real data; never throws.
import type { Core } from '../contracts';
import type { CardKind, InputKind, TutId } from '../types';
import { NODES } from '../data/dialogue';
import { WX_IDS } from '../data/ids/story';
import { DLG } from '../data/zh';
import type { UiInternals } from './index';
import { itemIcon, itemName } from './phone/album';
import { wxLines } from './wx';

export const DEV_STATES = [
  'title', 'dialog', 'choices', 'phone', 'album-detail', 'phone-wx', 'phone-memo', 'keypad', 'lighthouse', 'namepicker',
  'milkbox', 'show', 'chapter', 'liaozhai', 'photo', 'epilogue', 'credits', 'pause', 'settings', 'toasts', 'tutorial', 'note',
  'controls',
] as const;

/** Applied on a later tick, once boot cards / queued dialogue are cleared (they would cover the state). */
export function runDevHook(core: Core, ui: UiInternals, raw: string): void {
  let tries = 0;
  const off = core.loop.addSystem('ui:dev', 'late', () => {
    tries++;
    if (tries < 120 && (tries < 12 || ui.cards.busy() || ui.dialogue.busy())) { ui.cards.skip(); ui.dialogue.closeCurrent(); return; }
    off();
    apply(core, ui, raw);
  });
}

function apply(core: Core, ui: UiInternals, raw: string): void {
  const [state, arg = ''] = raw.split(',');
  try {
    switch (state) {
      case 'title': core.cameraRig.setTitleMode(true); ui.showTitle(); break;
      case 'dialog': case 'choices': {
        const owner = arg || 'xiaolin';
        const node = NODES.find((n) => n.owner === owner && DLG[n.id]) ?? NODES.find((n) => DLG[n.id]);
        if (!node) break;
        void ui.dialogue.startNode(node.id, { viaTalk: true });
        if (state === 'choices') ui.dialogue.advance(Math.max(0, (DLG[node.id]?.length ?? 1) - 1)), ui.dialogue.completeTyping();
        break;
      }
      case 'phone': ui.phone.open('album'); break;
      case 'album-detail': {
        ui.phone.open('album');
        const p = core.store.state.photos[0];
        if (p) (document.querySelector(`[data-testid="album-item-${p.id}"]`) as HTMLElement | null)?.click();
        break;
      }
      case 'phone-wx': {
        const ids = arg ? arg.split('+') : ['wx_intro', 'wx_rules'];
        for (const id of ids) if ((WX_IDS as readonly string[]).includes(id)) ui.wx.push(id as (typeof WX_IDS)[number], true);
        ui.wx.pushHint('ui.hint.none');
        ui.phone.open('wx');
        break;
      }
      case 'phone-memo': ui.phone.open('memo'); break;
      case 'keypad': void ui.inputs.open('locker'); break;
      case 'lighthouse': case 'namepicker': case 'milkbox': void ui.inputs.open(state as InputKind); break;
      case 'show': void ui.show.openShow('gate'); break;
      case 'chapter': case 'liaozhai': case 'photo': case 'epilogue': case 'credits': {
        const def: Record<string, string> = { chapter: 'ch1', liaozhai: 'juan1', photo: 'ph_2006_group', epilogue: 'A', credits: 'credits' };
        void ui.cards.show(state as CardKind, arg || def[state]);
        break;
      }
      case 'pause': ui.pause.open(); break;
      case 'settings': ui.settings(); break;
      case 'controls': ui.controls(); break;
      case 'toasts':
        ui.toasts.push('ui.toast.item', { name: itemName(arg || 'key_ring') }, 'item', itemIcon(arg || 'key_ring'));
        ui.toasts.push('ui.toast.bestiary', undefined, 'bst');
        ui.toasts.push('ui.toast.wx', { preview: wxLines('wx_intro').lines[0]?.text ?? '' }, 'wx');
        break;
      case 'tutorial': ui.tuts.trigger((arg || 'tut_phone') as TutId); break;
      case 'note': void ui.cards.note(arg || 'note', arg || 'note'); break;
      default: core.log.warn(`[ui] devHook: unknown state ${state}; try ${DEV_STATES.join(' ')}`);
    }
  } catch (e) { core.log.warn('[ui] devHook failed', e); }
}
