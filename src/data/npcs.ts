// src/data/npcs.ts — owner C (seeded by S from GDD §6.1 layer table and §6.2 schedule).
// Missing phase = not placed by schedule (tudi rides the hero's shoulder at night; chai's dawn sign is B's prop).
import type { NpcDef } from '../types';

export const NPCS: readonly NpcDef[] = [
  {
    id: 'xiaolin', nameKey: 'npc.xiaolin', tag: 'npc', layer: 'world',
    schedule: { day: 'sp_store_door', dusk: 'sp_store_door', night: 'sp_store_front', dawn: 'g1' },
  },
  {
    id: 'granny_wang', nameKey: 'npc.granny_wang', tag: 'npc', layer: 'world',
    schedule: { day: 'sp_store_front', dusk: 'sp_estate_yard', night: 'sp_estate_yard', dawn: 'g4' },
    overrides: [{ when: { phase: ['night'], all: ['P8_done'] }, spot: 'sp_estate_window' }],
  },
  {
    id: 'old_chen', nameKey: 'npc.old_chen', tag: 'npc', layer: 'world',
    schedule: { day: 'sp_slipway', dusk: 'sp_pier_mid', night: 'sp_pier_mid', dawn: 'g8' },
  },
  {
    id: 'xiaoliu', nameKey: 'npc.xiaoliu', tag: 'npc', layer: 'world',
    schedule: { day: 'sp_roadwork', dusk: 'sp_site_gate', night: 'sp_site_pipes', dawn: 'g9' },
  },
  {
    id: 'tudi', nameKey: 'npc.tudi', tag: 'spirit', layer: 'ghost', talkNeedsNight: true,
    schedule: { dusk: 'sp_donation_box', dawn: 'g6' },
  },
  {
    id: 'meiqiu', nameKey: 'npc.meiqiu', tag: 'npc', layer: 'world',
    schedule: { dusk: 'pk_coop', night: 'sp_estate_yard', dawn: 'g4' },
  },
  {
    id: 'zhimei', nameKey: 'npc.zhimei', tag: 'spirit', layer: 'world',
    schedule: { day: 'sp_paper_shop', dusk: 'sp_paper_shop', night: 'sp_paper_shop', dawn: 'g3' },
    overrides: [{ when: { phase: ['night'], all: ['zhimei_eye'] }, spot: 'sp_seawall_zhimei' }],
  },
  {
    id: 'chai', nameKey: 'npc.chai', tag: 'spirit', layer: 'world',
    schedule: { day: 'sp_chai', dusk: 'sp_chai', night: 'sp_chai' },
  },
  {
    id: 'attendant', nameKey: 'npc.attendant', tag: 'spirit', layer: 'world',
    schedule: { night: 'sw_gantry', dawn: 'g7' },
    overrides: [{ when: { phase: ['dawn'], all: ['bus_arrived'] }, spot: 'sp_bus_door' }],
  },
  { id: 'lao_zhou', nameKey: 'npc.lao_zhou', tag: 'npc', layer: 'photo_only', schedule: {} },
];
