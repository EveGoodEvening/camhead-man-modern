// src/chars/npcs/npc.ts — owner C. One NPC at runtime: rig + animator, placement (spot / shoulder / arms / bus), actor and
// collider registration, horizon culling, look-at, face-decal blinks (GDD P3 formula for granny), named anims.
import { Object3D, Vector3, type BufferAttribute, type Material } from 'three';
import type { ActorDef, Core, Handle } from '../../contracts';
import type { ActorLayer, NpcDef, NpcId, SceneId, SpotId } from '../../types';
import { LAYER, setLayerDeep } from '../../core/layers';
import { DEG, SURFACES, flatToChart, placeAt, worldToFlat } from '../../core/planet';
import { HumanAnimator, type AnimInput } from '../anim';
import { BLINK_DU } from '../atlasLayout';
import { blinkClosed } from '../faces';
import { makeRig, type Rig } from '../rig';
import type { Placement } from '../schedule';
import { NPC_POSES, idle, type IdleOut } from './behaviour';
import type { NpcModel } from './humans';

const _v = new Vector3(), _w = new Vector3();
const SPIRIT_IDS: ReadonlySet<NpcId> = new Set<NpcId>(['tudi', 'zhimei', 'attendant']);
const PUFFS = ['puff1', 'puff2', 'puff3'] as const;

export interface Parents { shoulder: Object3D; arms: Object3D | null; bus: Object3D }

export class Npc {
  readonly def: NpcDef;
  readonly root = new Object3D();
  readonly visual = new Object3D();
  readonly rig: Rig;
  readonly head: Object3D;
  placement: Placement | null = null;
  forced: SpotId | null | undefined = undefined;
  lookTarget: Vector3 | null = null;
  /** P3r2 (camera): where to look when nobody talks to it (the dawn lineup looks into the tripod's lens). */
  idleLook: Vector3 | null = null;
  talking = false;
  scene: SceneId = 'planet';
  private readonly core: Core;
  private readonly model: NpcModel;
  private readonly anim: HumanAnimator | null;
  private readonly out: IdleOut = { poses: new Map(), lookPitch: 0, lookYaw: 0, talk: 0, props: new Map() };
  private readonly ain: AnimInput = { phase: 0, move: 0, run: 0, t: 0, talk: 0, lookYaw: 0, lookPitch: 0, poses: new Map() };
  private actor: Handle | null = null;
  private actorKey = '';
  private collider: Handle | null = null;
  private uncull: (() => void) | null = null;
  private lookYaw = 0; private lookPitch = 0;
  private baseYaw = 0; private bodyTurn = 0;       // P3-look L2: the body eases toward the hero while talking
  private blinkNext = 1; private blinkT0 = -1;
  private forcedBlink: number | null = null;
  private eyeShift = 0;
  private readonly uvBase: Float32Array | null = null;
  private secondEye = false;
  private playUntil = -1; private playName = ''; private playDone: (() => void) | null = null;
  private readonly rnd: () => number;
  private readonly tOff: number;

  constructor(core: Core, def: NpcDef, model: NpcModel, mat: Material) {
    this.core = core;
    this.def = def;
    this.model = model;
    this.rig = makeRig(model.bones, model.geo, mat, { center: [0, model.height * 0.55, 0], radius: Math.max(0.5, model.height * 0.75) });
    this.rig.mesh.castShadow = !SPIRIT_IDS.has(def.id);
    this.head = this.rig.b.head ?? this.rig.b.root;
    const humanoid = !!this.rig.b.hips;
    this.anim = humanoid ? new HumanAnimator(this.rig, model.style, NPC_POSES[def.id] ?? model.poses ?? {}) : null;
    for (const n of model.hidden ?? []) this.rig.b[n]?.scale.setScalar(1e-4);
    this.root.name = `npc_${def.id}`;
    this.root.userData.actorId = def.id;
    this.root.userData.hideInPast = true;
    this.visual.add(this.rig.mesh);
    this.root.add(this.visual);
    if (model.face) {
      const uv = model.geo.getAttribute('uv') as BufferAttribute;
      const base = new Float32Array(uv.count);
      for (const r of model.face.ranges) for (let i = r.start; i < r.start + r.count; i++) base[i] = uv.getX(i);
      this.uvBase = base;
    }
    const r = core.rng.fork(`chars:npc:${def.id}`);
    this.rnd = () => r.next();
    this.blinkNext = 1 + 3 * this.rnd();
    this.tOff = 10 * this.rnd();
  }

  // ------------------------------------------------------------------------------------------ placement
  apply(pl: Placement, parents: Parents): void {
    this.placement = pl;
    const core = this.core;
    const ghost = pl.layer === 'ghost';
    this.uncull?.(); this.uncull = null;
    this.collider?.remove(); this.collider = null;
    this.visual.position.set(0, 0, 0); this.visual.rotation.set(0, 0, 0);
    this.baseYaw = 0; this.bodyTurn = 0;
    this.root.userData.facingObject = this.visual;
    if (pl.mode === 'hidden') {
      this.root.visible = false;
      this.registerActor(this.scene, pl.layer, false);
      return;
    }
    this.root.visible = true;
    let scene: SceneId = core.player.scene;
    if (pl.mode === 'shoulder') { parents.shoulder.add(this.root); this.root.position.set(0, 0, 0); this.root.quaternion.identity(); }
    else if (pl.mode === 'arms' && parents.arms) { parents.arms.add(this.root); this.root.position.set(0, 0, 0); this.root.quaternion.identity(); scene = 'planet'; }
    else if (pl.mode === 'bus') { parents.bus.add(this.root); this.root.position.set(0, 0, 0); this.root.quaternion.identity(); scene = 'planet'; }
    else if (pl.at) {
      let sd;
      try { sd = core.services.world.spot(pl.at); } catch { sd = null; }
      if (!sd) { this.root.visible = false; core.log.warn(`[chars] no spot ${pl.at} for ${this.def.id}`); return; }
      scene = sd.scene;
      core.scenes.get(scene).add(this.root);
      placeAt(this.root, scene, pl.chart ?? sd.pos, pl.chartYaw ?? sd.yaw ?? 0);
      const o = pl.offset;
      if (o) {
        this.visual.position.set(-o.side, o.up, o.fwd);
        this.baseYaw = -o.yaw * DEG;
        this.visual.rotation.y = this.baseYaw;
      }
      this.root.updateMatrixWorld(true);
      if (pl.collide) {
        const wp = this.root.getWorldPosition(_v);
        const f = worldToFlat(SURFACES[scene], wp);
        const at = scene === 'planet' ? flatToChart(f) : { x: f.x, y: 0, z: f.z };
        // P3r3 look L2: walker-only height (like thin props): the follow boom (pivot 1.5 m) passes an NPC's shoulders
        // (characters are screen-door faded by render's see-through cone) instead of collapsing into the hero's head
        // when he stands with his back to someone (the subway attendant); the dialogue camera re-tests 1 m up anyway
        this.collider = core.physics.registerCollider({ scene, shape: { kind: 'circle', at, radius: 0.35 }, hRange: [f.h - 1, f.h + 1.3], tag: `npc:${this.def.id}` });
      }
      if (scene === 'planet') this.uncull = core.scenes.registerCullable(this.visual, { radius: 1, height: Math.max(0.5, this.model.height) });
    }
    this.scene = scene;
    setLayerDeep(this.root, ghost ? LAYER.GHOST : LAYER.WORLD);
    this.registerActor(scene, pl.layer, true);
  }

  private registerActor(scene: SceneId, layer: ActorLayer, present: boolean): void {
    const tnn = this.def.talkNeedsNight === true && this.core.store.state.phase !== 'dawn';
    // GDD §6.1 / NpcDef: granny talks from her 4th-floor gallery (talkRange 12); elsewhere the default range
    const range = this.def.id === 'granny_wang' && this.placement?.at === 'sp_estate_window' ? 12 : this.def.talkRange;
    const key = `${present}|${scene}|${layer}|${tnn}|${range}`;
    if (key === this.actorKey && this.actor) return;
    this.actorKey = key;
    this.actor?.remove(); this.actor = null;
    if (!present) return;
    const a: ActorDef = {
      id: this.def.id, scene, root: this.root, head: this.head, layer, talkRange: range,
      talkNeedsNight: tnn, spirit: this.def.tag === 'spirit', spot: () => this.placement?.spot ?? null,
    };
    this.actor = this.core.actors.register(a);
  }
  /** Re-sync the actor scene when the hero carries this NPC into another scene (tudi on the shoulder). */
  followScene(scene: SceneId): void {
    if (this.placement?.mode === 'shoulder' && scene !== this.scene) { this.scene = scene; this.registerActor(scene, this.placement.layer, true); }
  }

  // ------------------------------------------------------------------------------------------ runtime api
  startBlink(epoch: number): void { this.forcedBlink = epoch; }
  stopBlink(): void { this.forcedBlink = null; }
  eyesClosed(): boolean {
    if (this.forcedBlink !== null) {
      // keep the rendered decal in step with the answer (the lens may ask before this tick's update ran)
      this.updateEyes(this.core.clock.animT);
      return blinkClosed(this.core.clock.animT, this.forcedBlink);
    }
    return this.eyeShift === 1 && !this.secondEye;
  }
  setSecondEye(on: boolean): void { this.secondEye = on; }
  play(name: string, seconds = 1.6): Promise<void> {
    this.playDone?.();
    this.playName = name; this.playUntil = this.core.clock.t + seconds;
    return new Promise((res) => { this.playDone = () => { this.playDone = null; this.playName = ''; res(); }; });
  }

  /** Resolve a finished play() even while this NPC is hidden or in another scene (beats await it). */
  tickPlay(t: number): void { if (this.playDone && t >= this.playUntil) this.playDone(); }

  update(dt: number, heroPos: Vector3): void {
    if (!this.root.visible || !this.placement) return;
    const core = this.core, at = core.clock.animT;
    this.turnBody(dt);
    // look at: explicit target, else the hero within 4 m
    let wantYaw = 0, wantPitch = 0;
    const auto = this.placement.mode === 'spot' && this.root.getWorldPosition(_v).distanceToSquared(heroPos) < 16;
    const target = this.lookTarget ?? this.idleLook ?? (auto ? _w.copy(heroPos).addScaledVector(core.player.up(_v), 1.55) : null);
    if (target) {
      const loc = this.visual.worldToLocal(_v.copy(target));
      this.head.getWorldPosition(_w);
      const hy = this.visual.worldToLocal(_w).y;
      wantYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(loc.x, loc.z)));
      if (Math.abs(Math.atan2(loc.x, loc.z)) > 2.2) wantYaw = 0;
      wantPitch = Math.max(-0.4, Math.min(0.4, Math.atan2(loc.y - hy, Math.hypot(loc.x, loc.z))));
    }
    this.lookYaw += (wantYaw - this.lookYaw) * Math.min(1, dt * 4);
    this.lookPitch += (wantPitch - this.lookPitch) * Math.min(1, dt * 4);
    const id = this.def.id;
    const talking = this.talking || this.playName === 'talk';
    idle(id, { t: at, phase: core.store.state.phase, at: this.placement.at, talking, atDoor: this.root.parent?.userData.atDoor === true }, this.out);
    for (const [bone, on] of this.out.props) this.rig.b[bone]?.scale.setScalar(on ? 1 : 1e-4);
    if (this.playName && this.playName !== 'talk') this.out.poses.set(this.playName, 1);
    if (this.anim) {
      const ai = this.ain;
      ai.t = at + this.tOff; ai.talk = this.out.talk; ai.poses = this.out.poses;
      ai.lookYaw = this.lookYaw + this.out.lookYaw; ai.lookPitch = this.lookPitch + this.out.lookPitch;
      this.anim.update(ai);
      if (this.playName) this.out.poses.delete(this.playName);
    } else if (id === 'zhimei') this.paperStep(at);
    else if (id === 'meiqiu') this.cat(at);
    if (id === 'tudi') this.puffs(at);
    if (id === 'attendant') this.visual.position.y = (this.placement.mode === 'bus' ? 0 : 0.1) + 0.04 * Math.sin(at * Math.PI);
    this.updateEyes(at);
  }

  /** P3-look (L2): NPCs used to turn only their head (±1.2 rad), so a talk started from behind filmed the back of 老陈 /
   *  小刘. While a dialogue look target is set, a standing NPC on its spot eases its whole body toward it (the head does
   *  the last ≈ 0.3 rad) and eases back afterwards. Seated / perched / driving / window poses keep their facing and are
   *  marked `root.userData.fixedFacing`, which the dialogue camera films from their own front. */
  private turnBody(dt: number): void {
    const pl = this.placement;
    const p = this.out.poses;
    const seated = (p.get('perch') ?? 0) > 0.5 || (p.get('sit') ?? 0) > 0.5 || (p.get('crouch') ?? 0) > 0.5 || (p.get('drive') ?? 0) > 0.5;
    // P3r2 look L2: the dawn lineup (g1–g9) keeps squaring up to the tripod while it talks, so the dialogue camera films
    // it from the tripod side (front-on) — facing the hero behind the front row filmed profiles and backs
    const lineup = !!pl && this.core.store.state.phase === 'dawn' && /^g\d$/.test(pl.spot ?? '');
    const fixed = !pl || pl.mode !== 'spot' || pl.at === 'sp_estate_window' || seated || lineup;
    this.root.userData.fixedFacing = fixed;
    this.root.userData.seated = seated;                 // sits on / against a prop (the dialogue camera films from above)
    let want = 0;
    if (!fixed && this.lookTarget) {
      const loc = this.root.worldToLocal(_v.copy(this.lookTarget));
      let ang = Math.atan2(loc.x, loc.z) - this.baseYaw;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      want = Math.sign(ang) * Math.max(0, Math.abs(ang) - 0.3);
    }
    const k = this.core.params.test ? 1 : Math.min(1, dt * 5);
    this.bodyTurn += (want - this.bodyTurn) * k;
    if (Math.abs(this.bodyTurn) < 1e-4 && want === 0) this.bodyTurn = 0;
    this.visual.rotation.y = this.baseYaw + this.bodyTurn;
  }

  private paperStep(at: number): void {
    const q = Math.floor(at * 6) / 6;   // 6 fps paper motion (GDD §6.1)
    const b = this.rig.b;
    b.body.rotation.set(0, 0, 0.04 * Math.sin(q * 1.3));
    b.head.rotation.set(0.05 * Math.sin(q * 0.7) + (this.talking ? 0.06 * Math.sin(q * 9) : 0), this.lookYaw * 0.6, 0.08 * Math.sin(q * 0.9 + 1));
    b.armL.rotation.set(0, 0, 0.06 * Math.sin(q * 1.1));
    b.armR.rotation.set(0, 0, -0.06 * Math.sin(q * 1.1 + 0.5));
  }
  private cat(at: number): void {
    const b = this.rig.b, w = at * 1.7;
    b.tail1.rotation.set(0, 0.35 * Math.sin(w), 0);
    b.tail2.rotation.set(0, 0.45 * Math.sin(w - 0.7), 0);
    b.tail3.rotation.set(0, 0.55 * Math.sin(w - 1.4), 0);
    b.head.rotation.set(-this.lookPitch * 0.8, this.lookYaw, 0.08 * Math.sin(at * 0.5));
    const flick = (at % 4.3) < 0.18 ? 0.5 : 0;
    b.earL.rotation.set(0, 0, -flick);
    const k = 1 + 0.02 * Math.sin(at * Math.PI * 2 * 0.4);
    b.body.scale.set(k, 1 + (k - 1) * 0.5, k);
  }
  private puffs(at: number): void {
    const b = this.rig.b, rest = this.rig.rest;
    for (let i = 0; i < PUFFS.length; i++) {
      const n = PUFFS[i], k = (at * 0.45 + i / 3) % 1;
      const bone = b[n];
      if (!bone) continue;
      bone.position.set(rest[n].x + 0.03 * Math.sin(k * 6 + i), rest[n].y - 0.06 * i + k * 0.18, rest[n].z);
      bone.scale.setScalar(0.35 + 0.9 * k * (1 - k) * 4 * 0.5);
    }
  }

  /** Face decal: open ↔ closed cell (u + 1 cell); granny follows the P3 formula once startBlink ran. */
  private updateEyes(at: number): void {
    if (!this.uvBase || !this.model.face) return;
    let shift = 0;
    if (this.def.id === 'zhimei') shift = this.secondEye ? 1 : 0;
    else if (this.forcedBlink !== null) shift = blinkClosed(at, this.forcedBlink) ? 1 : 0;
    else {
      if (at >= this.blinkNext && this.blinkT0 < 0) this.blinkT0 = at;
      if (this.blinkT0 >= 0) {
        if (at - this.blinkT0 < 0.14) shift = 1;
        else { this.blinkT0 = -1; this.blinkNext = at + 2.5 + 3 * this.rnd(); }
      }
    }
    if (shift === this.eyeShift) return;
    this.eyeShift = shift;
    const uv = this.model.geo.getAttribute('uv') as BufferAttribute;
    for (const r of this.model.face.ranges) for (let i = r.start; i < r.start + r.count; i++) uv.setX(i, this.uvBase[i] + shift * BLINK_DU);
    uv.needsUpdate = true;
  }

  /** After 点睛 zhimei's ink turns ordinary (her lines stop being spirit-cinnabar): remap ids 248–250 → NPC range. */
  private remapped: Readonly<Record<number, number>> | null = null;
  setSurfaceRemap(map: Readonly<Record<number, number>> | null): void {
    if (map === this.remapped) return;
    this.remapped = map;
    const a = this.model.geo.getAttribute('aSurfaceId') as BufferAttribute;
    const orig = (this.model.geo.userData.sidOrig as Float32Array | undefined) ?? Float32Array.from(a.array as Float32Array);
    this.model.geo.userData.sidOrig = orig;
    for (let i = 0; i < a.count; i++) a.setX(i, map ? (map[orig[i]] ?? orig[i]) : orig[i]);
    a.needsUpdate = true;
  }
}
