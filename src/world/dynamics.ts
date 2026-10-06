// src/world/dynamics.ts — owner B. Gate visuals (GDD §5.5) and the town's 拆 → 折 marks (GDD §5.7, §9 P8 cascade on
// M_zhe) over the tagged ranges of the merged chunks (kit/mutables.ts: no extra draw calls).
import type { GateId } from '../types';
import type { Core } from '../contracts';
import type { Mutables } from './kit/mutables';
import type { Tex } from './kit/tex';
import type { Dyn, WState } from './phaseState';
import { MARKS } from './build/places2';

export function gateAnims(core: Core, mut: Mutables): Partial<Record<GateId, (open: boolean, instant: boolean) => void>> {
  let tideAnim: (() => void) | null = null;
  return {
    gate_roadwork: (open) => mut.show('b1', !open),
    gate_tide: (open, instant) => {
      tideAnim?.();
      if (!open) { mut.show('b2', true); return; }
      if (instant) { mut.show('b2', false); return; }
      // the water drains over 0.4 s (GDD §5.5), then the barriers go
      let t = 0;
      tideAnim = core.loop.addSystem('world:tide', 'world', (dt) => {
        t += dt;
        mut.lift('b2', -0.5 * Math.min(1, t / 0.4));
        if (t >= 0.4) { mut.show('b2', false); tideAnim?.(); tideAnim = null; }
      });
    },
    gate_subway: (open) => mut.lift('grille', open ? 2.35 : 0),
    gate_studio: (open) => mut.lift('shutter', open ? 1.55 : 0),
    gate_estate: (open) => mut.show('arms', !open),
    gate_roof: (open) => mut.show('roofdoor', !open),
    gate_lighthouse: (open) => mut.show('lhdoor', !open),
    gate_gantry: (open) => mut.show('gantry', !open),
  };
}

/** 拆 marks: which are present per phase, and the 1 s 拆 → 折 cascade. */
export function marksController(mut: Mutables, T: Tex): NonNullable<Dyn['marks']> {
  const chai = T.mark(false), zhe = T.mark(true);
  const all = mut.keys().filter((k) => k.startsWith('mark:')).map((k) => k.slice(5));
  const from = new Map<string, 'day' | 'dusk' | 'night'>(MARKS.map((m) => [m.key, m.from]));
  const rank = { day: 0, dusk: 1, night: 2 } as const;
  const isZhe = new Map<string, boolean>();
  let cascade: { t: number; order: string[] } | null = null;
  const setZhe = (k: string, z: boolean) => {
    if (isZhe.get(k) === z) return;
    isZhe.set(k, z);
    mut.swapUv(`mark:${k}`, chai, z ? zhe : chai);
  };
  return {
    apply(mode: WState['marks'], anim: boolean) {
      const lvl = mode === 'zhe' ? 3 : rank[mode];
      for (const k of all) {
        const f = from.get(k) ?? 'day';
        mut.show(`mark:${k}`, mode === 'zhe' || rank[f] <= lvl);
      }
      if (mode !== 'zhe') { cascade = null; for (const k of all) setZhe(k, false); return; }
      if (anim) cascade = { t: 0, order: [...all] };
      else { cascade = null; for (const k of all) setZhe(k, true); }
    },
    update(dt: number) {
      if (!cascade) return;
      cascade.t += dt;
      const n = cascade.order.length;
      cascade.order.forEach((k, i) => { if (cascade && cascade.t >= (i / Math.max(1, n)) * 1.0) setZhe(k, true); });
      if (cascade.t >= 1.0) cascade = null;
    },
  };
}
