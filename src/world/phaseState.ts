// src/world/phaseState.ts — owner B. GDD §5.7 world state per phase/flags: gates (colliders + visuals + gateChanged),
// window lights, street lamps (render.registerLamp), lighthouse / crane lights, 拆 → 折 marks, flag-driven props.
import { Vector3, type Object3D } from 'three';
import type { Core, Handle, LampHandle } from '../contracts';
import type { FlagId, GateId, Phase } from '../types';
import { GATES } from '../data/locations';
import { SURFACES, flatToWorld } from '../core/planet';
import type { LightMode, WinLights } from './lights';
import type { ChaiHandle } from './chai';
import type { LampSpot } from './build/streets';

export interface WState {
  phase: Phase; gates: Partial<Record<GateId, boolean>>;
  marks: 'day' | 'dusk' | 'night' | 'zhe'; lights: LightMode; lamps: boolean; beacons: boolean;
  frame1: boolean; tripod: boolean; pigeons: boolean; lionSeaward: boolean; tv: boolean; lanterns: boolean; idolFace: boolean;
  zhe: boolean; dotTaken: boolean; faceNight: boolean;
}

/** Pure GDD §5.7 table (gates are evaluated by the caller). */
export function worldStateFor(phase: Phase, has: (f: FlagId) => boolean, gates: Partial<Record<GateId, boolean>>): WState {
  const zhe = has('P8_done');
  const lit = phase === 'dusk' || phase === 'night';
  return {
    phase, gates,
    marks: zhe || phase === 'dawn' ? 'zhe' : phase === 'night' ? 'night' : phase === 'dusk' ? 'dusk' : 'day',
    lights: phase === 'night' ? 'night' : phase === 'dusk' ? 'dusk' : 'off',
    lamps: lit, beacons: lit,
    frame1: has('pigeons_gone') && !has('frame_1'),
    pigeons: !has('pigeons_gone'),
    tripod: has('finale_started') || phase === 'dawn',
    lionSeaward: phase === 'night',
    tv: lit, lanterns: phase === 'night',
    idolFace: has('P4_done'),
    zhe, dotTaken: has('dot_taken'), faceNight: phase === 'night' && !zhe,
  };
}

export interface Dyn {
  /** named dynamic props from the place builders */
  objects: Record<string, Object3D>;
  /** tagged ranges in merged chunks (frame ①, tripod) */
  tags?: { show(key: string, on: boolean): void };
  /** mark switcher (拆 ↔ 折 per mark, visibility per phase) */
  marks?: { apply(mode: WState['marks'], cascade: boolean): void; update(dt: number): void };
  idol?: { setFace(k: number): void };
  beacons?: { set(lh: boolean, crane: boolean): void; update(t: number): void };
  gateAnim?: Partial<Record<GateId, (open: boolean, instant: boolean) => void>>;
}
export interface WorldState { state(): WState; refresh(instant: boolean): void }

export function createState(core: Core, w: { lights: WinLights; gateHandles: Map<GateId, Handle[]>; chai: ChaiHandle | null },
  o: { lamps: LampSpot[]; dyn: Dyn }): WorldState {
  const lampHandles: LampHandle[] = [];
  for (const l of o.lamps) {
    try {
      lampHandles.push(core.services.render.registerLamp({ scene: 'planet', pos: flatToWorld(SURFACES.planet, { x: l.p.x, z: l.p.z, h: l.h }, new Vector3()), radius: 5.5, on: false }));   // 3D reach; ≈ 3 m ground pool (requests-A #8: 7.5 washed the store sign)
    } catch (e) { core.log.warn('[world] registerLamp failed', e); break; }
  }
  let cur: WState | null = null;
  let blackoutUntil = -1;
  // GDD §9 P8 / ARCH §3.B: the town's 拆 marks turn into 折 in a 1 s cascade on `uncanny: M_zhe`, which S_zhe emits
  // ~0.9 s after P8_done; until then (or a 3 s fallback when no beat runs) the marks keep their pre-P8 state
  let marksShown: WState['marks'] | null = null;
  let zheDue = -1;
  const showMarks = (m: WState['marks'], cascade: boolean) => { marksShown = m; zheDue = -1; o.dyn.marks?.apply(m, cascade); };
  let faceT = -1;
  const has = (f: FlagId) => core.store.has(f);

  const evalGates = (): Partial<Record<GateId, boolean>> => {
    const g: Partial<Record<GateId, boolean>> = {};
    for (const d of GATES) g[d.id] = core.rules.evalCond(d.openWhen);
    return g;
  };

  const apply = (s: WState, instant: boolean) => {
    const prev = cur;
    cur = s;
    // gates: colliders + visuals + event
    for (const d of GATES) {
      const open = !!s.gates[d.id];
      for (const h of w.gateHandles.get(d.id) ?? []) h.enabled = !open;
      if (!prev || prev.gates[d.id] !== open) {
        o.dyn.gateAnim?.[d.id]?.(open, instant || !prev);
        if (prev) core.bus.emit('gateChanged', { gate: d.id, open });
      }
    }
    const blackout = core.clock.animT < blackoutUntil;
    w.lights.apply(s.lights, { blackout: false });
    for (const h of lampHandles) h.setOn(s.lamps);
    o.dyn.beacons?.set(s.beacons && !blackout, s.beacons);
    if (s.marks === 'zhe' && marksShown !== null && marksShown !== 'zhe' && !instant && s.phase !== 'dawn') {
      if (zheDue < 0) zheDue = core.clock.animT + 3;                 // wait for M_zhe
    } else if (s.marks !== marksShown || instant) showMarks(s.marks, false);
    const ob = o.dyn.objects;
    o.dyn.tags?.show('frame1', s.frame1);
    o.dyn.tags?.show('tripod', s.tripod);
    o.dyn.tags?.show('pigeons', s.pigeons);
    o.dyn.tags?.show('lanterns', s.lanterns);
    o.dyn.tags?.show('frame4', !has('frame4_registered'));   // negative ④ in the subway pit (GDD P7)
    o.dyn.tags?.show('frame3', !has('frame_3'));             // negative ③ on the lighthouse lamp hatch (GDD P6)
    if (ob.tv) ob.tv.visible = s.tv;
    if (ob.lanterns) ob.lanterns.visible = s.lanterns;
    if (ob.lionHead) ob.lionHead.rotation.y = s.lionSeaward ? Math.PI * 0.55 : 0;
    if (o.dyn.idol) {
      if (s.idolFace && prev && !prev.idolFace && !instant) faceT = 0;
      else if (faceT < 0) o.dyn.idol.setFace(s.idolFace ? 1 : 0);
    }
    w.chai?.setPhase({ phase: s.phase, zhe: s.zhe, dotTaken: s.dotTaken, instant });
  };
  const refresh = (instant: boolean) => apply(worldStateFor(core.store.state.phase, has, evalGates()), instant);

  core.bus.on('phaseChanged', (e) => refresh(e.instant));
  core.bus.on('flagSet', () => refresh(false));
  core.bus.on('itemGained', () => refresh(false));
  core.bus.on('itemLost', () => refresh(false));
  core.bus.on('stateLoaded', () => refresh(true));
  core.bus.on('uncanny', (e) => {
    if (e.id === 'M_lighthouse_off') { blackoutUntil = core.clock.animT + 4; o.dyn.beacons?.set(false, cur?.beacons ?? false); }
    if (e.id === 'M_zhe' && cur?.marks === 'zhe' && marksShown !== 'zhe') showMarks('zhe', true);
  });
  let wasBlack = false;
  core.loop.addSystem('world:state', 'world', (dt) => {
    if (zheDue >= 0 && core.clock.animT >= zheDue && cur?.marks === 'zhe') showMarks('zhe', true);
    o.dyn.marks?.update(dt);
    o.dyn.beacons?.update(core.clock.animT);
    const black = core.clock.animT < blackoutUntil;
    if (wasBlack && !black && cur) o.dyn.beacons?.set(cur.beacons, cur.beacons);
    wasBlack = black;
    if (faceT >= 0 && o.dyn.idol) {
      faceT += dt;
      o.dyn.idol.setFace(Math.min(1, faceT / 1.5));
      if (faceT >= 1.5) faceT = -1;
    }
  });
  refresh(true);
  return { state: () => cur as WState, refresh };
}
