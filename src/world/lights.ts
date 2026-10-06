// src/world/lights.ts — owner B. Phase lighting of the unlit 'win' chunks (GDD §5.7 window lights 0 / 20 / 40 %,
// lamps lit at dusk and night, shop fronts, lanterns) by rewriting vertex colours of tagged ranges; labels follow.
import { Color, type BufferAttribute, type Mesh } from 'three';
import { PAL } from '../art/palette';
import type { LabelId } from '../types';
import type { BuiltChunk } from './kit/batch';

export type LightMode = 'off' | 'dusk' | 'night';
interface Item { mesh: Mesh; start: number; count: number; kind: string; n: number }

const hash = (n: number) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const C = (hex: string) => new Color(hex);
const COL = {
  glass: C(PAL.glassDark), warm: C(PAL.winWarm), tv: C(PAL.winTv), lampOff: C(PAL.metalRail), white: C('#ffffff'),
  lanternDay: C(PAL.bannerRed), lanternOn: C(PAL.neonRed), dim: C('#3a454a'),
};

export class WinLights {
  private items: Item[] = [];
  mode: LightMode = 'off';
  private lastKey = '';
  constructor(chunks: readonly BuiltChunk[]) {
    for (const ch of chunks) {
      if (ch.layer !== 'win') continue;
      for (const [tag, ranges] of ch.ranges) {
        const [kind, num] = tag.split(':');
        if (!['home', 'shop', 'lamp', 'neon', 'lantern', 'stair'].includes(kind)) continue;
        for (const r of ranges) this.items.push({ mesh: ch.mesh, start: r.start, count: r.count, kind, n: Number(num) });
      }
      const geo = ch.mesh.geometry;
      const table = (geo.userData.labelTable ?? []) as LabelId[];
      if (!table.includes('window_lit')) table.push('window_lit');
      geo.userData.labelTable = table;
    }
  }
  /** Lamps/lanterns switch with dusk/night; windows light 20 % (dusk) / 40 % (night) by a stable per-window hash. */
  apply(mode: LightMode, o: { blackout?: boolean } = {}): void {
    // refresh() runs on every flagSet: only rewrite (and re-upload) the colour attributes when the look changes
    const key = `${mode}|${!!o.blackout}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.mode = mode;
    const touched = new Set<Mesh>();
    for (const it of this.items) {
      let col = COL.glass, lit = false;
      const h = hash(it.n);
      switch (it.kind) {
        case 'home': {
          const frac = mode === 'night' ? 0.4 : mode === 'dusk' ? 0.2 : 0;
          lit = h < frac && !o.blackout;
          col = lit ? (h < frac * 0.22 ? COL.tv : COL.warm) : COL.glass;
          break;
        }
        case 'shop': {
          const frac = mode === 'night' ? 0.55 : mode === 'dusk' ? 0.7 : 0;
          lit = h < frac && !o.blackout;
          col = lit ? COL.warm : COL.glass;
          break;
        }
        case 'lamp': lit = mode !== 'off' && !o.blackout; col = lit ? COL.warm : COL.lampOff; break;
        case 'neon': col = mode === 'off' ? COL.white : COL.white; lit = mode !== 'off'; break;
        case 'lantern': lit = mode !== 'off'; col = lit ? COL.lanternOn : COL.lanternDay; break;
        case 'stair': lit = mode === 'night' && h < 0.7; col = lit ? COL.warm : COL.dim; break;
        default: continue;
      }
      const attr = it.mesh.geometry.getAttribute('color') as BufferAttribute;
      for (let i = it.start; i < it.start + it.count; i++) attr.setXYZ(i, col.r, col.g, col.b);
      const tri = it.mesh.geometry.userData.triLabels as Uint16Array | undefined;
      const table = it.mesh.geometry.userData.labelTable as LabelId[] | undefined;
      if (tri && table && (it.kind === 'home' || it.kind === 'shop')) {
        const li = table.indexOf(lit ? 'window_lit' : 'window');
        if (li >= 0) for (let t = it.start / 3; t < (it.start + it.count) / 3; t++) tri[t] = li;
      }
      touched.add(it.mesh);
    }
    for (const m of touched) (m.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }
  count(): number { return this.items.length; }
}
