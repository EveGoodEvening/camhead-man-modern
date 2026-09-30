// src/chars/index.ts — owner C. The cast (ARCHITECTURE §3.C): 周远 (hero), every NPC of GDD §6 with schedules, faces
// and FaceState, 纸妹's hop, the 2006 crowd, pedestrians, apparitions and 0 路. Public entry: createCharacters.
import { Object3D, Vector3, type Material, type Texture } from 'three';
import type { CharactersApi, HeroExpr, ModuleFactory, NpcHandle } from '../contracts';
import type { FaceState, NpcDef, NpcId, SpotId } from '../types';
import { NPCS } from '../data/npcs';
import { LAYER, setLayerDeep } from '../core/layers';
import { chartToFlat, flatDirToHeading, placeAt } from '../core/planet';
import { makeToonMaterial } from '../render/index';
import { HumanAnimator } from './anim';
import { ManholeEye, SecondShadow, buildBestiarySilhouettes, buildQueue } from './apparitions';
import { createAtlas, type Atlas } from './atlas';
import { BusZero } from './bus';
import { buildCrowd, stairH } from './crowd2006';
import { deriveFaceState, faceLook, lookKey, FACE_ANIM_SECONDS } from './faces';
import { Hero } from './hero/hero';
import { buildChen, buildGranny, buildLiu, buildXiaolin, type NpcModel } from './npcs/humans';
import { Npc } from './npcs/npc';
import { buildAttendant, buildLaoZhou, buildMeiqiu, buildTudi, buildZhimei } from './npcs/spirits';
import { Pedestrians } from './pedestrians';
import { makeRig, type Rig } from './rig';
import { resolvePlacement, type Placement, type ScheduleState } from './schedule';
import { hopStep, type HopState } from './zhimei';

export { blinkClosed } from './faces';

const BUILDERS: Partial<Record<NpcId, () => NpcModel>> = {
  xiaolin: buildXiaolin, granny_wang: buildGranny, old_chen: buildChen, xiaoliu: buildLiu,
  tudi: buildTudi, meiqiu: buildMeiqiu, zhimei: buildZhimei, attendant: buildAttendant,
};
const SPIRIT_MAT: ReadonlySet<NpcId> = new Set<NpcId>(['tudi', 'zhimei', 'attendant']);
/** Follow-camera distance to the phone head below which the hero fades / the head hides, and above which they come back (m). */
// P3r2 look L5: the 50 % screen-door phone head still covered a third of the frame at 1.2–1.8 m (lighthouse doorway,
// subway platform): fade from 1.5 m and take the head off the main camera altogether below 1.15 m
export const NEAR_HIDE_ON = 1.5, NEAR_HIDE_OFF = 1.7, NEAR_FADE = 0.45, NEAR_HEAD_ON = 1.15, NEAR_HEAD_OFF = 1.35;
/** P3r3 look L4: the lens this far (m) above his lens height = the follow crane; no near fade / head hide then. */
export const CRANE_ABOVE = 0.3;
const ZHIMEI_PLAIN_INK: Readonly<Record<number, number>> = { 248: 215, 249: 216, 250: 211 };

export const createCharacters: ModuleFactory<CharactersApi> = (core) => {
  const hero = new Hero(core);
  const bus = new BusZero(core);
  const walkers = new Pedestrians(core);
  const npcs = new Map<NpcId, Npc>();
  const armsAnchor = new Object3D();
  const hop: HopState = { seen: false, outSince: null };
  let atlasObj: Atlas | null = null;
  const getAtlas = (): Atlas => (atlasObj ??= createAtlas(core.rng));
  let face: FaceState = 'mosaic';
  let faceAnimT0: number | null = null;
  let faceLookKey = '';
  let shadow: SecondShadow | null = null;
  let eye: ManholeEye | null = null;
  let queue: Object3D | null = null;
  let bestiary: Object3D | null = null;
  let crowd: Object3D | null = null;
  let laoZhou: Rig | null = null;
  let lineup = false;
  let exprUntil = -1;
  let heroActor: { remove(): void } | null = null;
  const heroPos = new Vector3(), tmp = new Vector3(), ndc = new Vector3();

  const sched = (): ScheduleState => ({
    phase: core.store.state.phase, has: (f) => core.store.has(f), evalCond: (c) => core.rules.evalCond(c),
    zhimeiSpot: core.store.state.zhimeiSpot,
  });
  const same = (a: Placement | null, b: Placement) => !!a && JSON.stringify(a) === JSON.stringify(b);

  const placeAll = (force = false) => {
    if (lineup) return;
    const s = sched();
    const parents = { shoulder: hero.shoulder, arms: armsAnchor, bus: bus.driverSeat };
    for (const n of npcs.values()) {
      const pl = resolvePlacement(n.def, s, n.forced);
      if (force || !same(n.placement, pl)) n.apply(pl, parents);
    }
    const z = npcs.get('zhimei');
    if (z) { const on = core.store.has('zhimei_eye'); z.setSecondEye(on); z.setSurfaceRemap(on ? ZHIMEI_PLAIN_INK : null); }
    syncExtras();
  };

  const syncExtras = () => {
    const st = core.store.state, ph = st.phase;
    if (queue) queue.visible = ph === 'night';
    if (eye) eye.rig.mesh.visible = ph === 'dusk' || ph === 'night';
    if (bestiary) bestiary.visible = ph === 'dawn' && st.bestiary.length >= 6;
    if (laoZhou) laoZhou.mesh.visible = ph === 'dawn';
  };

  const syncBus = () => {
    const has = (f: 'bus_arrived' | 'ending_A' | 'ending_B') => core.store.has(f);
    if (core.store.state.phase === 'dawn' && has('bus_arrived') && !has('ending_A') && !has('ending_B')) bus.park(); else bus.hide();
  };

  const syncFaces = (animate: boolean) => {
    const next = deriveFaceState(core.store.state.phase, (f) => core.store.has(f));
    if (next === face && faceLookKey) return;
    const anim = animate && next === 'clear' && face !== 'clear';
    face = next;
    faceAnimT0 = anim ? core.clock.t : null;
    if (!anim) applyFaceLook();
    core.bus.emit('faceState', { state: face, animate: anim });
  };
  const applyFaceLook = () => {
    const atlas = atlasObj;
    if (!atlas) return;
    const el = faceAnimT0 === null ? null : core.clock.t - faceAnimT0;
    const look = faceLook(face, el);
    const key = lookKey(look);
    if (el !== null && el >= FACE_ANIM_SECONDS) faceAnimT0 = null;
    if (key === faceLookKey) return;
    faceLookKey = key;
    atlas.setPhotoLook(look);
  };

  const registerHero = () => {
    heroActor?.remove();
    heroActor = core.actors.register({ id: 'hero', scene: core.player.scene, root: hero.root, head: hero.head, layer: 'world', spot: () => null });
  };

  /** P3r2 (camera): the dawn lineup looks into the tripod's lens (GDD §9 S_group_photo), not at the hero walking by. */
  const lensAt = new Vector3();
  const dawnLens = (): Vector3 | null => {
    if (core.store.state.phase !== 'dawn' || lineup) return null;
    try { return lensAt.copy(core.services.world.anchor('tripod_head').pos); } catch { return null; }
  };

  // ------------------------------------------------------------------------------------------------ per tick
  const update = (dt: number) => {
    hero.update(dt);
    nearHideHead();
    if (exprUntil > 0 && core.clock.t > exprUntil) { exprUntil = -1; hero.setExpression('calm'); }
    core.player.pos(heroPos);
    const active = core.scenes.active;
    const t = core.clock.t;
    const lens = dawnLens();
    for (const n of npcs.values()) {
      n.idleLook = lens && n.placement?.spot?.startsWith('g') ? lens : null;
      n.tickPlay(t);
      if (n.scene === active || n.placement?.mode === 'shoulder') n.update(dt, heroPos);
    }
    if (active === 'planet') {
      zhimeiHop();
      bus.update();
      walkers.update();
      const at = core.clock.animT;
      shadow?.update(at);
      if (eye?.rig.mesh.visible) eye.update(at);
    } else walkers.update();
    applyFaceLook();
  };

  /** P3-look (L1): a follow boom pulled in close (walls, interiors) put the back of the phone head across the whole frame:
   *  hide the head from the main camera below ~1.2 m (hysteresis 1.4 m). Follow camera only (no override / title). */
  const _hd = new Vector3(), _up = new Vector3();
  const nearHideHead = () => {
    const rig = core.cameraRig;
    const top = rig.top();
    hero.setFpSuspended(top !== null && top !== 'lens');  // P3r2: a dialogue camera over the viewfinder sees his head
    // P3r2 look L2: dialogue / story cameras close to him (over-the-shoulder shots, their eased hand-over from the follow
    // boom) fade him the same way; only the viewfinder (first person) is left alone
    if (top === 'lens') { hero.setNearHidden(false); hero.setNearFade(1); return; }
    core.player.pos(_hd).addScaledVector(core.player.up(_up), 1.72);
    let d = rig.camera.position.distanceTo(_hd);
    // P3r3 look L4: a follow camera craned up over his head (a wall right behind him) looks DOWN past the head, which
    // then sits at the bottom of the frame: keep him solid there (the screen door / hidden head read as a ghost)
    if (top === null && rig.camera.position.clone().sub(_hd).dot(_up) > CRANE_ABOVE) d = Math.max(d, NEAR_HIDE_OFF + 0.01);
    // 1.2–1.4 m: the whole hero goes screen-door (a see-through figure instead of a black slab over the frame);
    // below 0.75 m the phone head is taken off the main camera altogether (the lens is practically inside it)
    const fading = hero.nearFadeValue < 1;
    hero.setNearFade(d < (fading ? NEAR_HIDE_OFF : NEAR_HIDE_ON) ? NEAR_FADE : 1);
    hero.setNearHidden(d < (hero.headNearHidden ? NEAR_HEAD_OFF : NEAR_HEAD_ON));
  };

  const zhimeiHop = () => {
    const z = npcs.get('zhimei');
    if (!z || !z.placement || lineup) return;
    const cam = core.cameraRig.camera;
    z.head.getWorldPosition(tmp);
    const dist = tmp.distanceTo(heroPos);
    ndc.copy(tmp).project(cam);
    const inView = ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && tmp.sub(cam.position).dot(cam.getWorldDirection(ndc)) > 0;
    const go = hopStep(hop, {
      t: core.clock.t, phase: core.store.state.phase, eye: core.store.has('zhimei_eye'),
      atShop: z.placement.spot === 'sp_paper_shop' && z.forced === undefined, inView, dist,
    });
    if (!go) return;
    const next = ((core.store.state.zhimeiSpot + 1) % 4) as 0 | 1 | 2 | 3;
    core.store.setZhimeiSpot(next);
    placeAll();
    const p = z.root.getWorldPosition(new Vector3());
    core.bus.emit('uncanny', { id: 'M_zhimei_move' });
    core.bus.emit('sfx', { id: 'sfx_paper', at: [p.x, p.y, p.z] });
  };

  // ------------------------------------------------------------------------------------------------ dev
  const devLineup = (arg: string) => {
    lineup = true;
    const order: NpcId[] = ['xiaolin', 'granny_wang', 'old_chen', 'xiaoliu', 'tudi', 'meiqiu', 'zhimei', 'attendant'];
    order.forEach((id, i) => {
      const n = npcs.get(id);
      if (!n) return;
      n.apply({ spot: null, at: null, mode: 'hidden', offset: null, layer: 'world', collide: false }, { shoulder: hero.shoulder, arms: null, bus: bus.driverSeat });
      n.root.visible = true;
      core.scenes.get('planet').add(n.root);
      placeAt(n.root, 'planet', { r: 36.2, lon: 3.2 + i * 1.25, h: 0 }, 0);
      setLayerDeep(n.root, LAYER.WORLD);
      n.scene = 'planet';
    });
    if (arg === 'bus') bus.park();
    const exprs: HeroExpr[] = ['calm', 'happy', 'puzzled', 'surprised', 'scared', 'thinking', 'found'];
    let k = 0;
    core.loop.addSystem('chars:dev', 'actors', () => {
      const i = Math.floor(core.clock.animT / 1.5) % exprs.length;
      if (i !== k) { k = i; hero.setExpression(exprs[i]); }
    });
    const mount = new Object3D();
    (globalThis as Record<string, unknown>).__chars = api;
    (globalThis as Record<string, unknown>).__charsDev = {
      /** Detach the phone head onto a mount 1.4 m in front of the player at 1.35 m (tripod stand-in). */
      detachFront: () => {
        const p = core.player;
        core.scenes.get(p.scene).add(mount);
        mount.position.copy(p.pos(new Vector3())).addScaledVector(p.facing(new Vector3()), 1.4).addScaledVector(p.up(new Vector3()), 1.35);
        mount.quaternion.copy(p.object.quaternion);
        mount.rotateY(Math.PI);
        mount.updateMatrixWorld(true);
        return hero.detachHead(mount);
      },
      reattach: () => hero.detachHead(null),
      npcs: () => [...npcs.values()].map((n) => ({ id: n.def.id, spot: n.placement?.spot ?? null, mode: n.placement?.mode, scene: n.scene, visible: n.root.visible })),
    };
  };

  // ------------------------------------------------------------------------------------------------ api
  const handle = (n: Npc): NpcHandle => ({
    id: n.def.id, root: n.root, head: n.head,
    setSpot(spot: SpotId | null) { n.forced = spot === null ? undefined : spot; n.placement = null; placeAll(); },
    lookAt(target) { n.lookTarget = target ? target.clone() : null; },
    startBlink(epoch) { n.startBlink(epoch); },
    eyesClosed: () => n.eyesClosed(),
    play: (anim) => n.play(anim),
  });

  const api: CharactersApi & { devHook(arg: string): void } = {
    hero,
    async init() {
      const atlas = getAtlas();
      try { await atlas.refreshText(); } catch (e) { core.log.warn('[chars] atlas text fonts', e); }
      const map = atlas.texture;
      // P3r2 (camera): every character material carries the see-through / fade variant (the hero fades on a short
      // boom); characters are small on screen, and the whole cast still shares one lit + one unlit program
      const heroMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 200, rim: true, seeThru: true });
      const npcMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 210, seeThru: true });
      const spiritMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 245, unlit: true, rim: true, spiritImmune: true, seeThru: true });
      const photoMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 212, unlit: true, seeThru: true });
      const screenMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 209, unlit: true, lineWeight: 0.6, seeThru: true });
      const glowMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 205, unlit: true, lineWeight: 0, seeThru: true });
      // P3r3 (program headroom): FrontSide — the second shadow is a ground decal wound to face up (DoubleSide cost a program)
      const shadowMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 245, unlit: true, lineWeight: 0, spiritImmune: true, seeThru: true });
      const signMat = makeToonMaterial({ vertexColors: true, map, surfaceId: 222, unlit: true, lineWeight: 0.5, seeThru: true });
      hero.build({ body: heroMat, screen: screenMat, glow: glowMat, photo: heroMat });
      for (const def of NPCS) {
        const b = BUILDERS[def.id];
        if (!b) continue;                                  // chai = B's actor; lao_zhou lives only in photos
        try {
          const n = new Npc(core, def as NpcDef, b(), (SPIRIT_MAT.has(def.id) ? spiritMat : npcMat) as Material);
          npcs.set(def.id, n);
        } catch (e) { core.log.warn(`[chars] failed to build ${def.id}`, e); }
      }
      const granny = npcs.get('granny_wang');
      if (granny) { armsAnchor.position.set(0, -0.12, 0.2); granny.rig.b.chest.add(armsAnchor); }
      bus.build(npcMat, signMat);
      walkers.build(npcMat);
      // PHOTO_ONLY 老周 beside the chalk cross, holding his twin-lens reflex (GDD §6.1, §9 S_group_photo)
      try {
        const lz = buildLaoZhou();
        laoZhou = makeRig(lz.bones, lz.geo, photoMat, { center: [0, 0.9, 0], radius: 1.2 });
        laoZhou.mesh.castShadow = false;
        // P3-look L3: drawn translucent by render.capture (GDD §15); P3r2 0.5 → 0.62 → 0.8 + render's ink outline (look L3:
        // a pale grey smudge against the dawn sky at card size)
        laoZhou.mesh.userData.cmGhost = 0.8;
        const a = new HumanAnimator(laoZhou, lz.style, lz.poses);
        a.update({ phase: 0, move: 0, run: 0, t: 0, talk: 0, lookYaw: 0, lookPitch: 0, poses: new Map([['tlr', 1]]) });
        // P3r2 look L3: on 周远's own tread, just behind his right shoulder (hill side): one step up he was a small figure
        // behind the rail against the sky, at the very top of the frame
        const pos = { r: 41.0, lon: 23.75, h: stairH(23.75) };
        const f = chartToFlat(pos), cam = chartToFlat({ r: 47.2, lon: 23 });
        core.scenes.get('planet').add(laoZhou.mesh);
        placeAt(laoZhou.mesh, 'planet', pos, flatDirToHeading(f.x, f.z, cam.x - f.x, cam.z - f.z));
        setLayerDeep(laoZhou.mesh, LAYER.PHOTO_ONLY);
      } catch (e) { core.log.warn('[chars] lao_zhou', e); }
      try {
        crowd = buildCrowd(core.rng, npcMat as Material);
        core.scenes.get('planet').add(crowd);
        shadow = new SecondShadow(shadowMat); shadow.place(core);
        eye = new ManholeEye(spiritMat); eye.place(core);
        queue = buildQueue(spiritMat); core.scenes.get('planet').add(queue);
        bestiary = buildBestiarySilhouettes(spiritMat); core.scenes.get('planet').add(bestiary);
      } catch (e) { core.log.warn('[chars] extras', e); }
      registerHero();
      syncFaces(false);
      placeAll(true);
      syncBus();

      const bus_ = core.bus;
      bus_.on('phaseChanged', (e) => { placeAll(); syncBus(); syncFaces(!e.instant); });
      bus_.on('stateLoaded', () => { hop.seen = false; hero.clearImages(); placeAll(true); syncBus(); syncFaces(false); });
      bus_.on('photoRemoved', (e) => hero.clearImages(e.id));
      bus_.on('flagSet', (e) => { placeAll(); syncFaces(e.flag === 'P8_done' || e.flag === 'faces_restored'); });
      bus_.on('bestiaryAdded', () => syncExtras());
      bus_.on('sceneChanged', (e) => { registerHero(); for (const n of npcs.values()) n.followScene(e.to); });
      bus_.on('teleported', () => hero.onTeleported());
      bus_.on('viewfinder', (e) => { hero.onViewfinder(e.on); if (!e.on) npcs.get('granny_wang')?.stopBlink(); });
      bus_.on('lensChanged', (e) => { hero.setTorch(e.torch); });
      bus_.on('shutter', (e) => hero.onShutter(e.flash));
      bus_.on('signalChanged', (e) => hero.onSignal(e.bars));
      bus_.on('promptChanged', (e) => hero.onPrompt(e.verb));
      bus_.on('interact', () => hero.onInteract());
      bus_.on('dialogueLine', (e) => {
        hero.onLine(e.speaker, e.text);
        for (const n of npcs.values()) n.talking = n.def.id === e.speaker;
      });
      bus_.on('dialogueEnd', () => { hero.onDialogueEnd(); for (const n of npcs.values()) n.talking = false; });
      bus_.on('show', (e) => hero.onShow(e.photoIds));
      bus_.on('showResult', () => hero.onShowResult());
      bus_.on('uncanny', (e) => {
        if (e.id === 'M_wake_face') hero.flashFace('stranger');
        else if (e.id === 'M_mirror_face') hero.flashFace('self');
        else if (e.id === 'M_chai_wake' || e.id === 'M_lighthouse_off') { hero.setExpression('surprised'); exprUntil = core.clock.t + 2.5; }
        else if (e.id === 'M_zhe') { hero.setExpression('happy'); exprUntil = core.clock.t + 3; }
      });
      core.loop.addSystem('chars', 'actors', update);
    },
    npc(id) {
      const n = npcs.get(id);
      return n ? handle(n) : null;
    },
    faceState: () => face,
    faceTexture(seed): Texture {
      const a = getAtlas();
      if (!faceLookKey) { face = deriveFaceState(core.store.state.phase, (f) => core.store.has(f)); applyFaceLook(); }
      return a.faceTexture(seed);
    },
    busZero: {
      get root() { return bus.root; },
      arrive: (s) => bus.arrive(s),
      depart: (s) => bus.depart(s),
      board: (s) => bus.board(s),
      closeDoor: (s) => bus.closeDoor(s),
    },
    devHook(arg) { devLineup(arg); },
  };
  return api;
};
