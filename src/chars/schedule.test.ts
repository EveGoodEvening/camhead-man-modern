// Schedule resolution for every phase × the key flags (GDD §6.1 layers, §6.2 schedule, ARCH §3.C).
import { describe, expect, it } from 'vitest';
import type { Cond, FlagId, NpcDef, NpcId, Phase } from '../types';
import { NPCS } from '../data/npcs';
import { SPOTS } from '../data/locations';
import { TUDI_DUSK, resolvePlacement, type ScheduleState } from './schedule';
import { chartToFlat } from '../core/planet';
import { TEMPLE } from '../world/layout';

function state(phase: Phase, flags: readonly FlagId[] = [], zhimeiSpot: 0 | 1 | 2 | 3 = 0): ScheduleState {
  const has = (f: FlagId) => flags.includes(f);
  const evalCond = (c: Cond) =>
    (!c.phase || c.phase.includes(phase)) && (c.all ?? []).every(has) && !(c.none ?? []).some(has) && (!c.any || c.any.some(has));
  return { phase, has, evalCond, zhimeiSpot };
}
const def = (id: NpcId): NpcDef => {
  const d = NPCS.find((n) => n.id === id);
  if (!d) throw new Error(id);
  return d;
};
const where = (id: NpcId, s: ScheduleState) => resolvePlacement(def(id), s, undefined);

describe('GDD §6.2 schedule', () => {
  const table: Record<string, Partial<Record<Phase, string | null>>> = {
    xiaolin: { day: 'sp_store_door', dusk: 'sp_store_door', night: 'sp_store_front', dawn: 'g1' },
    granny_wang: { day: 'sp_store_front', dusk: 'sp_estate_yard', night: 'sp_estate_yard', dawn: 'g4' },
    old_chen: { day: 'sp_slipway', dusk: 'sp_pier_mid', night: 'sp_pier_mid', dawn: 'g8' },
    xiaoliu: { day: 'sp_roadwork', dusk: 'sp_site_gate', night: 'sp_site_pipes', dawn: 'g9' },
    meiqiu: { day: null, dusk: 'pk_coop', night: 'sp_estate_yard', dawn: 'g4' },
    zhimei: { day: 'sp_paper_shop', dusk: 'sp_paper_shop', night: 'sp_paper_shop', dawn: 'g3' },
    attendant: { day: null, dusk: null, night: 'sw_gantry', dawn: 'g7' },
  };
  for (const [id, row] of Object.entries(table)) {
    for (const [phase, spot] of Object.entries(row)) {
      it(`${id} @ ${phase} → ${spot}`, () => {
        const p = where(id as NpcId, state(phase as Phase, ['P4_done']));
        expect(p.spot).toBe(spot);
        expect(p.mode).toBe(spot ? (id === 'meiqiu' && phase === 'dawn' ? 'arms' : 'spot') : 'hidden');
      });
    }
  }
  it('every schedule / override spot exists in SPOTS', () => {
    const ids = new Set(SPOTS.map((s) => s.id));
    for (const n of NPCS) {
      for (const s of Object.values(n.schedule)) expect(ids.has(s as never)).toBe(true);
      for (const o of n.overrides ?? []) expect(ids.has(o.spot)).toBe(true);
    }
  });
});

describe('flag overrides and special placements', () => {
  it('granny moves to the 403 window after P8 (night)', () => {
    expect(where('granny_wang', state('night', ['P8_done'])).spot).toBe('sp_estate_window');
    expect(where('granny_wang', state('night', [])).spot).toBe('sp_estate_yard');
  });
  it('zhimei hops between zp1–zp4 but keeps sp_paper_shop as her logical spot; seawall after 点睛', () => {
    for (const i of [0, 1, 2, 3] as const) {
      const p = where('zhimei', state('night', [], i));
      expect(p.spot).toBe('sp_paper_shop');
      expect(p.at).toBe(`zp${i + 1}`);
    }
    expect(where('zhimei', state('night', ['zhimei_eye'])).spot).toBe('sp_seawall_zhimei');
  });
  it('tudi: absent before P4, burner at dusk, shoulder at night (GHOST), g6 at dawn (WORLD)', () => {
    expect(where('tudi', state('dusk', [])).mode).toBe('hidden');
    const dusk = where('tudi', state('dusk', ['P4_done']));
    expect(dusk.mode).toBe('spot'); expect(dusk.spot).toBe('sp_donation_box'); expect(dusk.layer).toBe('ghost');
    const night = where('tudi', state('night', ['P4_done']));
    expect(night.mode).toBe('shoulder'); expect(night.layer).toBe('ghost'); expect(night.spot).toBeNull();
    const dawn = where('tudi', state('dawn', []));
    expect(dawn.spot).toBe('g6'); expect(dawn.layer).toBe('world');
    expect(where('tudi', state('day', ['P4_done'])).mode).toBe('hidden');
  });
  it('P3r3 L1: at dusk 土地 stands on the burner lid, on the side facing vp_temple_2011 (not hidden behind it)', () => {
    const dusk = where('tudi', state('dusk', ['P4_done']));
    expect(dusk.chart).toEqual(TUDI_DUSK);
    const b = chartToFlat({ ...TEMPLE.burner, h: 0 }), t = chartToFlat(TUDI_DUSK);
    const vp = SPOTS.find((s) => s.id === 'vp_temple_2011')!.pos as { r: number; lon: number; h: number };
    const v = chartToFlat(vp);
    expect(Math.hypot(t.x - b.x, t.z - b.z)).toBeLessThan(0.3);                  // on the 0.3 m lid
    expect(TUDI_DUSK.h).toBeGreaterThanOrEqual(4 + 0.8);                          // feet on the lid top
    expect(Math.hypot(t.x - v.x, t.z - v.z)).toBeLessThan(Math.hypot(b.x - v.x, b.z - v.z));   // front edge
  });
  it('attendant rides the bus after bus_arrived; spot() is sp_bus_door', () => {
    const p = where('attendant', state('dawn', ['bus_arrived']));
    expect(p.mode).toBe('bus'); expect(p.spot).toBe('sp_bus_door');
  });
  it('forced setSpot wins over the schedule; null placement hides', () => {
    expect(resolvePlacement(def('xiaolin'), state('day'), 'g2').spot).toBe('g2');
    expect(resolvePlacement(def('xiaolin'), state('day'), null).mode).toBe('hidden');
  });
  it('layers per GDD §6.1: zhimei, meiqiu and the attendant are WORLD all along', () => {
    for (const ph of ['day', 'dusk', 'night', 'dawn'] as const) {
      for (const id of ['zhimei', 'meiqiu', 'attendant'] as const) expect(where(id, state(ph, ['P4_done'])).layer).toBe('world');
    }
  });
  it('living NPCs collide except at dawn; spirits never, except the attendant at his gantry (P3r3 L2)', () => {
    expect(where('xiaolin', state('day')).collide).toBe(true);
    expect(where('xiaolin', state('dawn')).collide).toBe(false);
    for (const ph of ['dusk', 'night', 'dawn'] as const) {
      for (const id of ['zhimei', 'tudi'] as const) expect(where(id, state(ph, ['P4_done'])).collide).toBe(false);
    }
    expect(where('attendant', state('night')).at).toBe('sw_gantry');
    expect(where('attendant', state('night')).collide).toBe(true);
    expect(where('attendant', state('dawn')).collide).toBe(false);
    expect(where('attendant', state('dawn', ['bus_arrived'])).collide).toBe(false);
  });
  it('dawn lineup on g1–g9 (tudi visual offset keeps the root on g6)', () => {
    const s = state('dawn', ['P8_done']);
    const g: Partial<Record<NpcId, string>> = { xiaolin: 'g1', zhimei: 'g3', granny_wang: 'g4', tudi: 'g6', attendant: 'g7', old_chen: 'g8', xiaoliu: 'g9' };
    for (const [id, spot] of Object.entries(g)) expect(where(id as NpcId, s).at).toBe(spot);
    const t = where('tudi', s);
    expect(Math.hypot(t.offset?.fwd ?? 0, t.offset?.up ?? 0)).toBeLessThan(1);
  });
});
