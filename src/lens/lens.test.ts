// src/lens/lens.test.ts — owner D. Headless lens runs through the real core (testkit: store, rules, player, rig, loop)
// with fake render / chars / story / ui and GDD-nominal anchors: the golden-path lens rows P1, P3 (burst), P4 (scan +
// rephoto), P8 (lamp construction), night exposure, teleport-closes-viewfinder, peeks.
import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Object3D, SphereGeometry, Texture, Vector3 } from 'three';
import type { AnchorInfo, CharactersApi, Core, HeroApi, NpcHandle, RenderApi, Services, StoryApi, UiApi, WorldApi } from '../contracts';
import type { NpcId, SpotDef, SpotId } from '../types';
import { createTestCore, fakeWorld } from '../core/testkit';
import { posToWorld } from '../core/planet';
import { createLens } from './index';
import { blinkClosed } from './ctx';
import { NOMINAL } from './anchors';

const fakeCanvas = () => ({ width: 480, height: 270, getContext: () => null, toDataURL: () => 'data:image/jpeg;base64,AA' }) as unknown as HTMLCanvasElement;

function setup(o: { occluders?: Object3D[]; npcs?: Partial<Record<NpcId, SpotId>> } = {}) {
  const talked: string[] = [];
  const npcs = new Map<NpcId, { root: Object3D; head: Object3D; epoch: number }>();
  const hero: HeroApi = {
    root: new Object3D(), head: new Object3D(),
    lensPos: (out) => out, setFirstPerson: () => undefined, setExpression: () => undefined, flashFace: () => undefined,
    setScreen: () => undefined, detachHead: async () => undefined, setTorch: () => undefined, play: async () => undefined,
  };
  const chars = {
    hero, init: async () => undefined, faceState: () => 'mosaic', faceTexture: () => new Texture(),
    npc: (id: NpcId): NpcHandle | null => {
      const n = npcs.get(id);
      if (!n) return null;
      return {
        id, root: n.root, head: n.head, setSpot: () => undefined, lookAt: () => undefined, play: async () => undefined,
        startBlink: (e) => { n.epoch = e; }, eyesClosed: () => blinkClosed(core.clock.animT, n.epoch),
      };
    },
    busZero: { root: new Object3D(), arrive: async () => undefined, depart: async () => undefined },
  } as unknown as CharactersApi;
  const render = {
    init: async () => undefined, frame: () => undefined, capture: () => fakeCanvas(),
    createLiveView: () => ({ texture: new Texture(), render: () => undefined, dispose: () => undefined }),
    fxScene: () => undefined, setPalette: () => undefined, setViewfinder: () => undefined, registerLamp: () => ({ setOn: () => undefined, remove: () => undefined }),
    setSmoke: () => undefined, compile: async () => undefined, stats: () => ({ calls: 0, triangles: 0, programs: 0 }), uncanny: () => 0,
    timeRender: () => 0, snapshot: () => '',
  } as unknown as RenderApi;
  const w = fakeWorld();
  // GDD §5.4 vp_temple_2011 ≈ (7.6, 143.5, 3.1), facing the idol (1.5, 145, 5.2): B recomputes it from its own temple
  // model, so the test pins the GDD construction instead of B's current data.
  const vpTemple: SpotDef = { id: 'vp_temple_2011', scene: 'planet', pos: { r: 7.6, lon: 143.5, h: 3.1 }, yaw: 0.4, pitch: 3.5 };
  const spot = (id: SpotId): SpotDef => (id === 'vp_temple_2011' ? vpTemple : w.spot(id));
  const world: WorldApi = {
    ...w, spot, spotPos: (id, out = new Vector3()) => { const s = spot(id); return posToWorld(s.scene, s.pos, out); },
    occluders: () => o.occluders ?? [], anchor: () => undefined as unknown as AnchorInfo,   // no anchors → the lens uses the GDD nominal points
  };
  const story = { smokeTarget: () => null, currentBeat: () => null } as unknown as StoryApi;
  const ui = { talk: async (id: string) => { talked.push(id); }, busy: () => ({ dialogue: false, card: false, modal: null }) } as unknown as UiApi;
  const services: Partial<Services> = { render, chars, world, story, ui };
  const tc = createTestCore({ services });
  const core: Core = tc.core;
  // GDD §5.1 hill (the fake world has no walk surfaces): platform h 4 inside r 6, slope to r 13
  core.physics.registerWalkSurface({
    id: 'test:hill', scene: 'planet',
    heightAt: (x, z) => { const r = Math.hypot(x, z); return r <= 6 ? 4 : r < 13 ? (4 * (13 - r)) / 7 : null; },
  });
  for (const [id, spot] of Object.entries(o.npcs ?? {}) as [NpcId, SpotId][]) {
    const def = w.spot(spot);
    const root = new Object3D(), head = new Object3D();
    head.position.set(0, 1.4, 0);
    root.add(head);
    root.position.copy(posToWorld(def.scene, def.pos));
    root.lookAt(new Vector3(0, 0, 0));
    // stand upright on the sphere, facing +Z toward... the caller's approach rule only needs a facing
    root.up.copy(root.position).normalize();
    root.quaternion.identity();
    const up = root.position.clone().normalize();
    root.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    root.updateMatrixWorld(true);
    npcs.set(id, { root, head, epoch: 0 });
    core.actors.register({ id, scene: def.scene, root, head, layer: 'world', spot: () => spot });
  }
  const lens = createLens(core);
  (core.services as { lens: typeof lens }).lens = lens;
  return { core, lens, internals: tc.internals, bus: tc.bus, talked, npcs };
}

describe('lens through the core', () => {
  it('P1: goto vp_group_photo, reference, 1×, overlay → shoot → P1_done (golden row)', async () => {
    const { core, lens } = setup();
    await lens.init();
    core.store.set('wx_tudi_added');
    const ph = await lens.renderPreset('ph_2006_group');
    expect(ph.id).toBe('ph_2006_group');
    expect(ph.keep).toBe(true);
    void core.player.goto('vp_group_photo', { fade: false });
    core.store.setRefPhoto('ph_2006_group');
    lens.setViewfinder(true); lens.setZoom(1); lens.setLens({ overlay: true });
    const r = lens.shoot();
    expect(r.targetId).toBe('T_rephoto_2006');
    expect(r.frame).toBe('green');
    expect(r.overlayScore).toBeGreaterThanOrEqual(90);
    expect(core.store.has('P1_done')).toBe(true);
    const photo = core.store.photo(lens.lastPhotoId()!)!;
    expect(photo.tags).toContain('rephoto_2006');
    expect(photo.label).toBe('显影 · 二〇〇六 · 对位成功 100%');
    expect(photo.keep).toBe(true);
  });

  it('a goto closes the viewfinder (and night); the next aim reopens it', async () => {
    const { core, lens } = setup();
    await lens.init();
    lens.setLens({ night: true });
    expect(lens.state.active && lens.state.night && lens.isNightView()).toBe(true);
    void core.player.goto('sp_locker', { fade: false });
    expect(lens.state.active).toBe(false);
    expect(lens.isNightView()).toBe(false);
    core.store.set('ch1_started');
    lens.aim('T_locker17'); lens.setZoom(3);
    const r = lens.evalNow();
    expect(lens.state.active).toBe(true);
    expect(r).toMatchObject({ frame: 'green', targetId: 'T_locker17', label: '17 号格 · 滞留 1096 天', confidence: 96 });
  });

  it('P3: the granny burst holds one open and one closed face', async () => {
    const { core, lens } = setup({ npcs: { granny_wang: 'sp_store_front' } });
    await lens.init();
    core.store.set('ch1_started');                 // T_granny_face requires chapter 1 (P3 G2)
    void core.player.goto('sp_store_front', { fade: false });
    lens.setViewfinder(true);
    lens.aim('T_granny_face');
    const r0 = lens.evalNow();
    expect(r0.targetId).toBe('T_granny_face');
    const before = core.store.state.photos.length;
    const t0 = core.clock.t;
    lens.shoot({ burst: true });
    expect(core.clock.t - t0).toBeCloseTo(0.6, 5);
    const shots = core.store.state.photos.slice(before);
    expect(shots.length).toBe(3);
    const tags = shots.flatMap((p) => p.tags);
    expect(tags).toContain('granny_face_open');
    expect(tags).toContain('granny_face_closed');
    expect(shots.find((p) => p.tags.includes('granny_face_closed'))!.label).toMatch(/^人脸 · 王秀英 · 闭眼 9\d%$/);
  });

  it('P4: the temple QR scans after 0.5 s, then the 3× rephoto sets P4_done', async () => {
    const { core, lens, internals, bus } = setup();
    await lens.init();
    core.store.setPhase('dusk');
    core.store.set('ch2_started');
    const scanned: string[] = [];
    bus.on('scanned', (e) => scanned.push(e.target));
    void core.player.goto('sp_donation_box', { fade: false });
    lens.setViewfinder(true);
    lens.aim('T_temple_qr');
    expect(lens.evalNow()).toMatchObject({ targetId: 'T_temple_qr', frame: 'green' });
    for (let i = 0; i < 20; i++) internals.loop.tick(1 / 60);
    expect(scanned).toEqual([]);
    for (let i = 0; i < 20; i++) internals.loop.tick(1 / 60);
    expect(scanned).toEqual(['T_temple_qr']);
    await Promise.resolve(); await Promise.resolve();
    expect(core.store.has('idol_scanned')).toBe(true);
    expect(core.store.photo('ph_temple_2011')).not.toBeNull();
    void core.player.goto('vp_temple_2011', { fade: false });
    core.store.setRefPhoto('ph_temple_2011');
    lens.setViewfinder(true); lens.setZoom(3); lens.setLens({ overlay: true });
    const r = lens.shoot();
    expect([r.targetId, r.frame, r.failed]).toEqual(['T_rephoto_2011', 'green', null]);
    expect(core.store.has('P4_done')).toBe(true);
  });

  it('P8: from vp_subway_top the lamp shade (S = V + 0.8·(D − V), r 0.45) hides the dot → 折', async () => {
    const V = posToWorld('planet', { r: 29.5, lon: 262, h: 1.72 });
    const D = posToWorld('planet', NOMINAL.net_dot!.pos);
    const S = V.clone().lerp(D, 0.8);
    const shade = new Mesh(new SphereGeometry(0.45, 12, 8), new MeshBasicMaterial());
    shade.position.copy(S);
    shade.updateMatrixWorld(true);
    const night = async (occluders: Object3D[]) => {
      const s = setup({ occluders });
      await s.lens.init();
      s.core.store.setPhase('night');
      s.core.store.set('ch3_started');
      void s.core.player.goto('vp_subway_top', { fade: false });
      s.lens.setViewfinder(true); s.lens.setZoom(1);
      s.lens.aim('T_chai');
      return s;
    };
    const open = await night([]);
    const dual = open.lens.evalNow();
    expect(dual).toMatchObject({ targetId: 'T_chai', frame: 'yellow', failed: 'hidden', label: '拆 · 红圈喷漆', confidence: 97, tags: ['chai_photo'] });
    const p = open.lens.shoot();
    expect(p.tags).toContain('chai_photo');
    expect(open.core.store.has('P8_done')).toBe(false);
    const hidden = await night([shade]);
    const r = hidden.lens.evalNow();
    expect([r.targetId, r.frame, r.label, r.confidence]).toEqual(['T_chai', 'green', '折 · 红圈喷漆', 97]);
    hidden.lens.shoot();
    expect(hidden.core.store.has('P8_done')).toBe(true);
  });

  it('night shots expose for 2 s of sim time; moving aborts with 「糊了，别动」', async () => {
    const { core, lens, internals } = setup();
    await lens.init();
    core.store.setPhase('night');
    void core.player.goto('sp_bus_bench', { fade: false });
    lens.setLens({ night: true });
    const n0 = core.store.state.photos.length, t0 = core.clock.t;
    lens.shoot();
    expect(core.clock.t - t0).toBeCloseTo(2, 5);
    const ph = core.store.state.photos.slice(n0);
    expect(ph.length).toBe(1);
    expect(ph[0].night).toBe(true);
    // realtime path: press shutter, then walk → aborted, no photo
    internals.input.inject({ press: ['shutter'] });
    internals.loop.tick(1 / 60);
    expect(lens.state.exposing).toBe(true);
    for (let i = 0; i < 10; i++) { internals.input.inject({ move: { x: 0, y: 1 } }); internals.loop.tick(1 / 60); }
    expect(lens.state.exposing).toBe(false);
    expect(core.store.state.photos.length).toBe(n0 + 1);
  });

  it('peeks teleport first, stay open through their own teleport, and E/Esc leave them', async () => {
    const { core, lens, internals } = setup();
    await lens.init();
    core.store.set('on_roof_once');
    await lens.enterPeek('pk_coop');
    expect(lens.state).toMatchObject({ peek: 'pk_coop', active: true });
    expect(core.input.context()).toBe('peek');
    lens.setLens({ flash: true });
    const r = lens.shoot();
    expect([r.targetId, r.frame]).toEqual(['T_pigeons', 'green']);
    expect(core.store.has('pigeons_gone')).toBe(true);
    for (let i = 0; i < 70; i++) internals.loop.tick(1 / 60);     // auto reattach 1 s after the successful shot
    expect(lens.state.peek).toBe(null);
    expect(core.input.context()).toBe('gameplay');
    await lens.enterPeek('tripod');
    void core.player.goto('sp_stairs_x', { fade: false });       // the body walks; the head stays on the tripod
    expect(lens.state.peek).toBe('tripod');
    lens.startTripodTimer();
    for (let i = 0; i < 660; i++) internals.loop.tick(1 / 60);
    expect(core.store.has('group_photo_done')).toBe(true);
    for (let i = 0; i < 90; i++) internals.loop.tick(1 / 60);     // the head comes back 1.2 s after the photo
    const g = core.store.photo('ph_2026_group')!;
    expect(g.label).toBe('周远 · 人 100%');
    expect(lens.state.peek).toBe(null);
  });

  it('I-gate: the tripod shot squares the body up on the lineup, facing the camera (a face in ph_2026_group)', async () => {
    const { core, lens, internals } = setup();
    await lens.init();
    await lens.enterPeek('tripod');
    // a player walked up the stairs and stopped on the X facing up the stairs, away from the tripod
    core.player.teleport({ scene: 'planet', at: { r: 41.2, lon: 23.3, h: 0.393 * 7.3 }, yawDeg: 0 });
    expect(lens.state.peek).toBe('tripod');
    lens.startTripodTimer();
    for (let i = 0; i < 605; i++) internals.loop.tick(1 / 60);
    expect(core.store.has('group_photo_done')).toBe(true);
    const c = core.player.chart() as { r: number; lon: number };
    expect(c.r).toBeCloseTo(41.6, 1);
    expect(c.lon).toBeCloseTo(23, 1);
    expect(Math.abs(((core.player.yawDeg() % 360) + 360) % 360 - 180)).toBeLessThan(1);
  });
});

describe('review fixes', () => {
  it('the exposure turn accumulates: turning away and back (net 0°, 2.3° in total) still blurs', async () => {
    const { core, lens, internals } = setup();
    await lens.init();
    core.store.setPhase('night');
    void core.player.goto('sp_bus_bench', { fade: false });
    lens.setLens({ night: true });
    internals.input.inject({ press: ['shutter'] });
    internals.loop.tick(1 / 60);
    expect(lens.state.exposing).toBe(true);
    internals.input.inject({ look: { dx: 8, dy: 0 } }); internals.loop.tick(1 / 60);
    expect(lens.state.exposing).toBe(true);                 // 1.15° so far
    internals.input.inject({ look: { dx: -8, dy: 0 } }); internals.loop.tick(1 / 60);
    expect(lens.state.exposing).toBe(false);                // back where it started, but 2.3° of turn in total
  });

  it('a save load during a peek puts the head back on the body', async () => {
    const { core, lens, bus } = setup();
    await lens.init();
    const mounts: (Object3D | null)[] = [];
    (core.services.chars.hero as { detachHead: HeroApi['detachHead'] }).detachHead = async (m) => { mounts.push(m); };
    core.store.set('on_roof_once');
    await lens.enterPeek('pk_coop');
    expect(mounts.length).toBe(1);
    expect(mounts[0]).not.toBe(null);
    bus.emit('stateLoaded', { slot: 0 } as never);
    await Promise.resolve();
    expect(lens.state.peek).toBe(null);
    expect(mounts[mounts.length - 1]).toBe(null);
  });

  it('flash straight into the convex mirror gives the white photo even when T_mirror_self is not available', async () => {
    const { core, lens } = setup();
    await lens.init();
    void core.player.goto('sp_mirror_stand', { fade: false });   // no tudi_met: the mirror target does not compete
    lens.setViewfinder(true);
    lens.setLens({ flash: true });
    lens.aim('T_mirror_self');                                    // aim still points at the mirror centre
    expect(lens.evalNow().targetId).not.toBe('T_mirror_self');
    const r = lens.shoot();
    expect(r.label).toBe('反光 · 一片白');
    expect(r.tags).toEqual([]);
  });

  it('T_zhimei_sea is anchored on 纸妹\'s chest (h 0.8), T_zhimei on her head', async () => {
    const { core, lens } = setup({ npcs: { zhimei: 'sp_seawall_zhimei' } });
    await lens.init();
    const npc = core.services.chars.npc('zhimei')!;
    const feet = npc.root.getWorldPosition(new Vector3());
    const head = npc.head.getWorldPosition(new Vector3());
    const { TARGETS } = await import('../data/photoTargets');
    const { createAnchors } = await import('./anchors');
    const a = createAnchors(core);
    const sea = a.targetPos(TARGETS.find((t) => t.id === 'T_zhimei_sea')!, new Vector3())!;
    const face = a.targetPos(TARGETS.find((t) => t.id === 'T_zhimei')!, new Vector3())!;
    expect(sea.distanceTo(feet)).toBeCloseTo(0.8, 5);
    expect(face.distanceTo(head)).toBeCloseTo(0, 5);
  });

  it('the temple QR leaves wx_after_scan to the story rules (no double push)', async () => {
    const { TARGETS } = await import('../data/photoTargets');
    const acts = TARGETS.find((t) => t.id === 'T_temple_qr')!.onShot!.actions ?? [];
    expect(acts.some((a) => 'wx' in a)).toBe(false);
    expect(acts).toEqual(expect.arrayContaining([{ photo: 'ph_temple_2011' }, { set: 'idol_scanned' }]));
  });
});

describe('P3r2 G1: one real E on a 「摘头」 prompt', () => {
  const keyEv = (type: 'keydown' | 'keyup') => {
    const e = new Event(type, { cancelable: true });
    for (const [k, v] of Object.entries({ code: 'KeyE', repeat: false, timeStamp: 1 })) Object.defineProperty(e, k, { value: v });
    return e;
  };
  /** A real KeyE through core input (DOM events) on an interactable whose action is `{detach: id}`, like F's glue. */
  const mountByKey = async (id: 'pk_coop' | 'pk_psd' | 'tripod') => {
    const s = setup();
    const { core, lens, internals, bus } = s;
    await lens.init();
    const win = new EventTarget();
    internals.input.attach(win, Object.assign(new EventTarget(), {}) as never,
      { pointerLock: false, doc: Object.assign(new EventTarget(), { pointerLockElement: null }) as never });
    core.interact.registerInteractable({
      id: `it_${id}`, scene: 'planet', at: () => core.player.pos(new Vector3()), prompt: 'detach', ignoreFacing: true,
      enabled: () => lens.state.peek === null, onInteract: () => { void lens.enterPeek(id); },
    });
    const peeks: (string | null)[] = [], sfx: string[] = [];
    bus.on('peek', (e) => peeks.push(e.id));
    bus.on('sfx', (e) => sfx.push(e.id));
    internals.loop.tick(1 / 60);                                   // pick the prompt
    expect(core.interact.current()?.id).toBe(`it_${id}`);
    const tap = () => {
      win.dispatchEvent(keyEv('keydown'));
      internals.loop.tick(1 / 60);
      win.dispatchEvent(keyEv('keyup'));
      for (let i = 0; i < 5; i++) internals.loop.tick(1 / 60);
    };
    tap();
    return { ...s, peeks, sfx, tap };
  };

  it('coop / PSD: the press that mounts the head does not also take it off; the next E does', async () => {
    for (const id of ['pk_coop', 'pk_psd'] as const) {
      const { lens, peeks, tap } = await mountByKey(id);
      expect(peeks).toEqual([id]);
      expect(lens.state.peek).toBe(id);
      tap();
      expect(peeks).toEqual([id, null]);
      expect(lens.state.peek).toBe(null);
    }
  });

  it('tripod: mounting shows the 「按 E 定时」 state; only the next E sets the timer', async () => {
    const { lens, peeks, sfx, tap } = await mountByKey('tripod');
    expect(peeks).toEqual(['tripod']);
    expect(sfx.filter((x) => x === 'sfx_countdown' || x === 'sfx_click')).toEqual([]);
    tap();
    expect(sfx.filter((x) => x === 'sfx_countdown' || x === 'sfx_click')).toEqual(['sfx_click']);   // armed (G2)
    expect(lens.state.peek).toBe('tripod');
  });

  it('G2: the armed timer waits for the body on the stair treads, then counts 10 s to the photo', async () => {
    const { core, lens, internals, sfx, tap } = await mountByKey('tripod');
    tap();                                                         // arm
    for (let i = 0; i < 1200; i++) internals.loop.tick(1 / 60);   // 20 s on the pavement: no count, no shot, no retry
    expect(sfx.filter((x) => x === 'sfx_countdown')).toEqual([]);
    expect(core.store.has('group_photo_done')).toBe(false);
    expect(lens.state.peek).toBe('tripod');
    // up the stairs to the X (h 2.75): the count starts on the first tread tick and fires 10 s later
    core.player.teleport({ scene: 'planet', at: { r: 40.9, lon: 18, h: 0.393 * 2 }, yawDeg: 90 });
    internals.loop.tick(1 / 60);
    expect(sfx.filter((x) => x === 'sfx_countdown')).toEqual(['sfx_countdown']);
    core.player.teleport({ scene: 'planet', at: { r: 41, lon: 23, h: 2.75 }, yawDeg: 180 });
    for (let i = 0; i < 598; i++) internals.loop.tick(1 / 60);
    expect(core.store.has('group_photo_done')).toBe(false);
    for (let i = 0; i < 4; i++) internals.loop.tick(1 / 60);
    expect(core.store.has('group_photo_done')).toBe(true);
  });
});
