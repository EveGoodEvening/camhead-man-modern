// src/chars/hero/hero.ts — owner C. The protagonist controller (HeroApi, ARCH §3.C deliverable 1): rig + procedural
// animation driven by core.player and sim time, lens-eye expressions and blinks, back-screen HUD, LED/torch, detach.
import { Object3D, Quaternion, Vector3, type Material } from 'three';
import type { Core, HeroApi, HeroExpr, HeroScreen, LampHandle } from '../../contracts';
import type { SpeakerId } from '../../types';
import { LAYER, setLayerDeep } from '../../core/layers';
import { HumanAnimator, type AnimInput } from '../anim';
import { makeRig, rigidMesh, type Rig } from '../rig';
import {
  HEAD_BONES, HERO_SPEC, LENS_LOCAL, PHONE, buildHeroBody, buildHeroGlow, buildHeroHead, buildHeroScreen, buildPhotoHead,
} from './model';
import { ScreenCanvas, typed, viewKey, type ScreenView } from './screen';

/** Spare render layer for the first-person head (never enabled on the main camera or in captures). */
export const HERO_FP_LAYER = LAYER.HERO_FP;
const D = Math.PI / 180;
const TILT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), PHONE.tiltDeg * D);
const _v = new Vector3(), _w = new Vector3(), _u = new Vector3(), _c = new Vector3(), _q = new Quaternion();

const PUPIL: Record<HeroExpr, readonly [number, number, number, number, number]> = {
  // pupilL, pupilR, lidL, lidR, lower lids (ART §7.2 aperture scales; lids 0 = open, 1 = shut)
  calm: [0.55, 0.55, 0, 0, 0], happy: [0.62, 0.62, 0, 0, 0.52], puzzled: [0.3, 0.6, 0.05, 0.3, 0], surprised: [0.85, 0.85, 0, 0, 0],
  scared: [0.95, 0.95, 0, 0, 0.12], thinking: [0.4, 0.4, 0.38, 0.38, 0], found: [0.85, 0.85, 0, 0, 0],
};

interface Tween { from: number; to: number; t0: number; dur: number; done?: () => void }

export interface HeroMats { body: Material; screen: Material; glow: Material; photo: Material }

export class Hero implements HeroApi {
  readonly root = new Object3D();
  readonly head = new Object3D();
  /** Tudi sits here at night (left shoulder). */
  readonly shoulder = new Object3D();
  private readonly core: Core;
  private body!: Rig;
  private headRig!: Rig;
  private glow!: Rig;
  private photoHead!: Rig;
  private anim!: HumanAnimator;
  private screen!: ScreenCanvas;
  private readonly poses = new Map<string, number>();
  private readonly tweens = new Map<string, Tween>();
  private phase = 0;
  private moveW = 0;
  private lookYaw = 0; private lookPitch = 0;
  private yawOff = 0;
  private expr: HeroExpr = 'calm';
  private promptFound = false;
  private nextBlink = 2; private blinkT0 = -1;
  private sitHold = false;
  private detached = false;
  private fp = false;                       // viewfinder first person (lens)
  private nearHidden = false;               // P3-look L1: follow camera very close to the phone head (layer hide)
  private nearFade = 1;                     // P3-look L1: screen-door opacity of the whole hero (short follow boom)
  private fadeMats: Material[] = [];
  private detachDone: (() => void) | null = null;
  private detachT0 = -1; private readonly detachFrom = new Vector3(); private readonly detachFromQ = new Quaternion();
  private torch = false; private lamp: LampHandle | null = null; private lampScene = '';
  /** Torch lamp position, registered BY REFERENCE with render (it follows the hero without re-registering). */
  private readonly lampAt = new Vector3();
  private readonly ain: AnimInput = { phase: 0, move: 0, run: 0, t: 0, talk: 0, lookYaw: 0, lookPitch: 0, poses: new Map() };
  private ledFlashUntil = -1;
  // screen state
  private override: { mode: HeroScreen; until: number; t0: number; text?: string; photoIds?: readonly string[] } | null = null;
  private rec = false;
  private typing: { text: string; t0: number } | null = null;
  private showing: { ids: readonly string[]; until: number } | null = null;
  private flash: { kind: 'stranger' | 'self'; until: number } | null = null;
  private bars: 0 | 1 | 2 | 3 | 4 = 1;
  private spiritNear = false; private spiritCheckAt = 0;
  private lastKey = ''; private lastDraw = -1;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imageUrls = new Map<string, string>();
  private rngBlink: () => number;

  constructor(core: Core) {
    this.core = core;
    const r = core.rng.fork('chars:hero:blink');
    this.rngBlink = () => r.next();
    this.root.name = 'hero';
    this.head.name = 'hero_head';
    this.root.userData.hideInPast = true;
    this.root.userData.actorId = 'hero';
  }

  build(m: HeroMats): void {
    this.fadeMats = [m.body, m.screen, m.glow];
    const bodyB = buildHeroBody();
    this.body = makeRig(bodyB.bones, bodyB.geo, m.body, { center: [0, 0.95, 0], radius: 1.1 });
    this.anim = new HumanAnimator(this.body, { armOut: 8, elbow: 12 });
    this.root.add(this.body.mesh);
    // phone head on the head bone (pivot = phone bottom centre, tilted back 4°)
    this.headRig = makeRig(HEAD_BONES, buildHeroHead(), m.body, { center: [0, 0.2, 0], radius: 0.3 });
    this.head.add(this.headRig.mesh);
    this.screen = new ScreenCanvas(this.core.rng);
    const scr = rigidMesh(buildHeroScreen(), m.screen, { center: [0, 0.2, 0], radius: 0.3 });
    (scr.mesh.material as Material & { map?: unknown }).map = this.screen.texture;
    scr.mesh.castShadow = false;
    this.head.add(scr.mesh);
    this.glow = rigidMesh(buildHeroGlow(), m.glow, { center: [0, 0.2, 0], radius: 0.3 });
    this.glow.mesh.castShadow = false;
    this.glow.mesh.visible = false;
    this.head.add(this.glow.mesh);
    this.head.quaternion.copy(TILT);
    this.body.b.head.add(this.head);
    // PHOTO_ONLY human face on the neck, shown in photos only while the phone head is detached (GDD §2.1)
    this.photoHead = rigidMesh(buildPhotoHead(), m.photo, { center: [0, 0.2, 0], radius: 0.3 });
    this.photoHead.mesh.castShadow = false;
    setLayerDeep(this.photoHead.mesh, LAYER.PHOTO_ONLY);
    this.photoHead.mesh.visible = false;
    this.body.b.neck.add(this.photoHead.mesh);
    this.shoulder.position.set(0.215, HERO_SPEC.shoulderY + 0.045 - HERO_SPEC.chestY, -0.02);
    this.body.b.chest.add(this.shoulder);
    this.core.player.object.add(this.root);
    this.drawScreen(true);
  }

  // ---------------------------------------------------------------------------------------------- HeroApi
  lensPos(out: Vector3): Vector3 {
    if (!this.detached) {
      const p = this.core.player;
      p.pos(out);
      return out.addScaledVector(p.up(_w), 1.72).addScaledVector(p.heading(_v), 0.05);
    }
    this.head.updateWorldMatrix(true, false);
    return this.head.localToWorld(out.set(LENS_LOCAL[0], LENS_LOCAL[1], LENS_LOCAL[2]));
  }
  setFirstPerson(on: boolean): void { this.fp = on; if (!on) this.nearHidden = false; this.applyHeadLayer(); }
  /** P3-look (L1): hide the phone head from the main camera while a pulled-in follow boom would fill the frame with it
   *  (same layer as first person: only the mirror LiveView still sees it). Never while the head is on the tripod. */
  setNearHidden(on: boolean): void {
    const v = on && !this.detached;
    if (v === this.nearHidden) return;
    this.nearHidden = v;
    this.applyHeadLayer();
  }
  get headNearHidden(): boolean { return this.nearHidden; }
  /** P3-look (L1): screen-door fade of the hero's own materials (body, screen, glow); 1 = solid. The dithered pixels
   *  carry surface id 255, so the composite draws no ink over the pattern. */
  setNearFade(opacity: number): void {
    const v = Math.max(0, Math.min(1, opacity));
    if (v === this.nearFade) return;
    this.nearFade = v;
    for (const mat of this.fadeMats) {
      const u = (mat.userData.toon as { uFade?: { value: number } } | undefined)?.uFade;
      if (u) u.value = v;
    }
  }
  get nearFadeValue(): number { return this.nearFade; }
  /** P3r2 (camera): a dialogue camera pushed over the viewfinder (土地 on the shoulder, night talk) films the hero from
   *  outside: the first-person head hide is suspended while another owner has the camera. */
  setFpSuspended(on: boolean): void { if (on !== this.fpSuspended) { this.fpSuspended = on; this.applyHeadLayer(); } }
  private fpSuspended = false;
  private applyHeadLayer(): void { setLayerDeep(this.head, (this.fp && !this.fpSuspended) || this.nearHidden ? HERO_FP_LAYER : LAYER.WORLD); }
  setExpression(e: HeroExpr): void { this.expr = e; }
  flashFace(kind: 'stranger' | 'self'): void { this.flash = { kind, until: this.core.clock.t + 0.5 }; this.lastDraw = -1; this.nextView = 0; }
  setScreen(mode: HeroScreen, o?: { text?: string; photoIds?: readonly string[]; seconds?: number }): void {
    if (mode === 'status' && !o?.seconds) { this.override = null; return; }
    const now = this.core.clock.t;
    this.override = { mode, until: o?.seconds ? now + o.seconds : Infinity, t0: now, text: o?.text, photoIds: o?.photoIds };
    if (o?.photoIds) for (const id of o.photoIds) this.image(id);
  }
  detachHead(mount: Object3D | null): Promise<void> {
    const wasDetached = this.detached;
    if (!mount && !wasDetached) return Promise.resolve();
    this.detachDone?.();
    this.head.updateWorldMatrix(true, false);
    if (mount) mount.attach(this.head); else this.body.b.head.attach(this.head);
    this.detached = !!mount;
    this.photoHead.mesh.visible = this.detached;
    if (this.detached && this.nearHidden) { this.nearHidden = false; this.applyHeadLayer(); }
    this.detachFrom.copy(this.head.position); this.detachFromQ.copy(this.head.quaternion);
    if (this.core.params.test) { this.snapHead(); return Promise.resolve(); }
    this.detachT0 = this.core.clock.t;
    this.tween('reach', 1, 0.15);
    return new Promise((res) => { this.detachDone = () => { this.detachDone = null; res(); }; });
  }
  setTorch(on: boolean): void {
    this.torch = on;
    if (!on && this.lamp) { this.lamp.remove(); this.lamp = null; this.lampScene = ''; }
  }
  play(anim: 'wake' | 'sit' | 'stand' | 'turn_back' | 'idle'): Promise<void> {
    switch (anim) {
      case 'wake':
        this.poses.set('lie', 1); this.poses.set('sit', 0); this.sitHold = true;
        this.tween('sit', 1, 1.5);
        return this.tween('lie', 0, 1.5);
      case 'sit': this.sitHold = true; return this.tween('sit', 1, 0.4);
      case 'stand': this.sitHold = false; this.tween('lie', 0, 0.3); return this.tween('sit', 0, 0.4);
      case 'turn_back': return this.tween('yaw', Math.PI, 0.5);
      default:
        this.sitHold = false; this.tween('lie', 0, 0.2); this.tween('sit', 0, 0.3);
        return this.tween('yaw', 0, 0.3);
    }
  }

  // ---------------------------------------------------------------------------------------------- events
  onViewfinder(on: boolean): void { this.rec = on; }
  /** Any teleport stands the body up and cancels turn-arounds (core stands the player too). */
  onTeleported(): void {
    if (this.tweens.has('lie') || this.tweens.has('sit')) return;          // a wake/sit in progress (beats teleport first)
    for (const tw of this.tweens.values()) tw.done?.();
    this.tweens.clear();
    this.sitHold = false; this.poses.set('sit', 0); this.poses.set('lie', 0); this.yawOff = 0;
  }
  onLine(speaker: SpeakerId, text: string): void {
    if (speaker === 'me') this.typing = { text, t0: this.core.clock.t };
  }
  onDialogueEnd(): void { this.typing = null; if (this.showing) this.showing.until = Math.min(this.showing.until, this.core.clock.t + 0.5); }
  onShow(ids: readonly string[]): void {
    this.showing = { ids, until: Infinity };
    for (const id of ids) this.image(id);
    void this.tween('yaw', Math.PI, 0.45);
  }
  onShowResult(): void { if (this.showing) this.showing.until = this.core.clock.t + 2.5; }
  onSignal(bars: 0 | 1 | 2 | 3 | 4): void { this.bars = bars; }
  onPrompt(verb: string | null): void { this.promptFound = verb === 'inspect' || verb === 'pickup' || verb === 'use'; }
  onInteract(): void { if (this.promptFound) { this.poses.set('point', 0); this.tween('point', 1, 0.15); this.pointUntil = this.core.clock.t + 0.9; } }
  onShutter(flash: boolean): void { if (flash) this.ledFlashUntil = this.core.clock.t + 0.08; }
  private pointUntil = -1;
  private scriptMps: number | null = null;
  scriptWalk(mps: number | null): void { this.scriptMps = mps; }

  // ---------------------------------------------------------------------------------------------- update
  update(dt: number): void {
    const core = this.core, t = core.clock.t, at = core.clock.animT, p = core.player;
    this.runTweens(t);
    // locomotion
    const spd = this.scriptMps ?? p.speed();
    const run = Math.min(1, Math.max(0, (spd - 3.3) / 2.1));
    const stride = 1.78 + 0.42 * run;
    this.phase += (spd * dt) / stride;
    const target = Math.min(1, spd / 1.1);
    this.moveW += (target - this.moveW) * Math.min(1, dt * 10);
    if (spd > 0.4) {
      if (this.sitHold) { this.sitHold = false; this.tween('sit', 0, 0.3); this.tween('lie', 0, 0.3); }
      if (this.yawOff !== 0 && !this.tweens.has('yaw') && !this.showing) void this.tween('yaw', 0, 0.3);
    }
    if (this.pointUntil > 0 && t > this.pointUntil) { this.pointUntil = -1; this.tween('point', 0, 0.3); }
    // poses from player state / viewfinder
    const sitting = p.pose === 'sit' || this.sitHold;
    if (p.pose === 'sit' && !this.tweens.has('sit')) this.poses.set('sit', Math.min(1, (this.poses.get('sit') ?? 0) + dt * 3));
    if (!sitting && !this.tweens.has('sit') && (this.poses.get('sit') ?? 0) > 0) this.poses.set('sit', Math.max(0, (this.poses.get('sit') ?? 0) - dt * 3));
    const raiseT = this.rec && !this.detached ? 1 : 0;
    const rc = this.poses.get('raise') ?? 0;
    this.poses.set('raise', rc + (raiseT - rc) * Math.min(1, dt * 8));
    // look: head follows the camera heading within ±45°, pitch with the orbit
    const fwd = p.facing(_v), hd = p.heading(_w), up = p.up(_u);
    const yawTo = Math.atan2(_c.crossVectors(fwd, hd).dot(up), fwd.dot(hd));
    const wantYaw = this.detached ? 0 : Math.max(-0.8, Math.min(0.8, yawTo)) * 0.6;
    const wantPitch = this.detached ? 0 : Math.max(-0.12, Math.min(0.12, core.cameraRig.pitchDeg * D * 0.3)) + (this.expr === 'thinking' ? 0.12 : 0);
    this.lookYaw += (wantYaw - this.lookYaw) * Math.min(1, dt * 6);
    this.lookPitch += (wantPitch - this.lookPitch) * Math.min(1, dt * 6);
    const talk = this.typing && t - this.typing.t0 < this.typing.text.length / 20 + 0.6 ? 1 : 0;
    const ai = this.ain;
    ai.phase = this.phase; ai.move = sitting ? 0 : this.moveW; ai.run = run; ai.t = at; ai.talk = talk * (1 - raiseT) * 0.8;
    ai.lookYaw = this.lookYaw; ai.lookPitch = this.lookPitch; ai.poses = this.poses;
    this.anim.update(ai);
    this.root.rotation.set(0, this.yawOff, 0);
    this.updateFace(t, at, talk > 0);
    this.updateDetach(t);
    this.updateTorch();
    this.updateScreen(t, at);
  }

  private updateFace(t: number, at: number, talking: boolean): void {
    const b = this.headRig.b;
    const e: HeroExpr = this.promptFound && this.expr === 'calm' ? 'found' : this.expr;
    const [pl, pr, ll, lr, lo] = PUPIL[e];
    b.lowL.scale.set(1, Math.max(0.001, lo), 1); b.lowR.scale.set(1, Math.max(0.001, lo), 1);
    const shake = e === 'scared' ? 0.0012 * Math.sin(at * 55) : 0;
    b.pupilL.scale.setScalar(pl); b.pupilR.scale.setScalar(pr);
    b.pupilL.position.x = HEAD_BONES[1].at[0] + shake; b.pupilR.position.x = HEAD_BONES[2].at[0] - shake;
    // shutter blink every 3–6 s over 120 ms (ART §7.2)
    if (at >= this.nextBlink && this.blinkT0 < 0) this.blinkT0 = at;
    let blink = 0;
    if (this.blinkT0 >= 0) {
      const k = (at - this.blinkT0) / 0.12;
      if (k >= 1) { this.blinkT0 = -1; this.nextBlink = at + 3 + 3 * this.rngBlink(); } else blink = 1 - Math.abs(k * 2 - 1);
    }
    b.lidL.scale.set(1, Math.max(0.001, Math.max(ll, blink)), 1);
    b.lidR.scale.set(1, Math.max(0.001, Math.max(lr, blink)), 1);
    const open = talking ? (Math.floor(at * 9) % 2 ? 1.0 : 0.35) : e === 'surprised' || e === 'scared' ? 0.9 : 0.5;
    b.mouth.scale.setScalar(open);
    const ledBlink = (e === 'found' || e === 'surprised') && Math.floor(at * 4) % 2 === 0;
    this.glow.mesh.visible = this.torch || ledBlink || t < this.ledFlashUntil;
  }

  private updateDetach(t: number): void {
    if (this.detachT0 < 0) return;
    const k = Math.min(1, (t - this.detachT0) / 0.4);
    const s = k * k * (3 - 2 * k);
    this.head.position.copy(this.detachFrom).multiplyScalar(1 - s);
    this.head.position.y += Math.sin(k * Math.PI) * 0.12 * (this.detached ? 1 : -1) * (this.detachFrom.length() > 0.05 ? 1 : 0);
    this.head.quaternion.copy(this.detachFromQ).slerp(this.detached ? _q.identity() : TILT, s);
    if (k >= 1) { this.detachT0 = -1; this.snapHead(); this.tween('reach', 0, 0.25); this.detachDone?.(); }
  }
  private snapHead(): void {
    this.head.position.set(0, 0, 0);
    this.head.quaternion.copy(this.detached ? _q.identity() : TILT);
  }

  /** Head torch: one lamp 2.2 m ahead of the body, moved in place every tick (render keeps `pos` by reference). */
  private updateTorch(): void {
    if (!this.torch) return;
    const p = this.core.player;
    p.pos(this.lampAt).addScaledVector(p.facing(_w), 2.2).addScaledVector(p.up(_u), 0.3);
    if (this.lamp && this.lampScene === p.scene) return;
    try {
      this.lamp?.remove();
      this.lamp = this.core.services.render.registerLamp({ scene: p.scene, pos: this.lampAt, radius: 4.5, on: true });
      this.lampScene = p.scene;
    } catch { this.lamp = null; this.lampScene = ''; }
  }

  // ---------------------------------------------------------------------------------------------- screen
  /** P3-look (L4): decoded back-screen photos, keyed by the photo's CURRENT dataURL: presets.upsert re-renders
   *  ph_2006_group in place (same id) when the faces come back, and the old id-keyed cache kept showing the old faces.
   *  Entries of removed photos / a loaded state are dropped (see clearImages). */
  private image(id: string): HTMLImageElement | null {
    const ph = this.core.store.photo(id);
    if (!ph || typeof Image === 'undefined') { this.images.delete(id); return null; }
    const cached = this.images.get(id);
    if (cached && this.imageUrls.get(id) === ph.dataURL) return cached;
    const img = new Image();
    img.onload = () => { this.lastDraw = -1; };
    img.src = ph.dataURL;
    this.images.set(id, img);
    this.imageUrls.set(id, ph.dataURL);
    return img;
  }
  /** Forget decoded photos: one id (photoRemoved) or all (stateLoaded). */
  clearImages(id?: string): void {
    if (id === undefined) { this.images.clear(); this.imageUrls.clear(); } else { this.images.delete(id); this.imageUrls.delete(id); }
    this.lastDraw = -1;
  }

  private checkSpirits(t: number): void {
    if (t < this.spiritCheckAt) return;
    this.spiritCheckAt = t + 0.25;
    const core = this.core, st = core.store.state;
    const awake = st.phase === 'night' || st.phase === 'dusk' || core.player.scene === 'subway_int';
    this.spiritNear = false;
    if (!awake) return;
    const me = core.player.pos(_v);
    for (const a of core.actors.list(core.player.scene)) {
      if (!a.spirit || a.id === 'tudi' || a.id === 'hero' || !a.root.visible) continue;
      if (a.root.getWorldPosition(_w).distanceToSquared(me) < 100) { this.spiritNear = true; return; }
    }
  }

  private view(t: number, at: number): ScreenView {
    const st = this.core.store.state;
    const v: ScreenView = {
      mode: 'status', expr: this.promptFound && this.expr === 'calm' ? 'found' : this.expr, blinkOn: Math.floor(at * 4) % 2 === 0,
      bars: this.bars, clock: st.clock, text: '', photo: null, photoCount: 0, photoIndex: 0, noise: 0,
    };
    if (this.flash && t < this.flash.until) { v.mode = this.flash.kind === 'self' ? 'flash_self' : 'flash_stranger'; return v; }
    this.flash = null;
    if (this.override && t >= this.override.until) this.override = null;
    const ov = this.override;
    const photos = (ids: readonly string[]) => {
      v.photoCount = ids.length;
      v.photoIndex = ids.length > 1 ? Math.floor(at * 2) % ids.length : 0;     // 2 Hz alternation (GDD §3.9)
      v.photo = ids.length ? this.image(ids[v.photoIndex]) : null;
    };
    if (ov) {
      v.mode = ov.mode;
      if (ov.mode === 'typing') v.text = typed(ov.text ?? '', t - ov.t0);
      if (ov.mode === 'show') photos(ov.photoIds ?? []);
      if (ov.mode === 'static') v.noise = Math.floor(at * 4);
      return v;
    }
    if (this.showing && t >= this.showing.until) { this.showing = null; void this.tween('yaw', 0, 0.4); }
    if (this.showing) { v.mode = 'show'; photos(this.showing.ids); return v; }
    if (this.typing) {
      v.mode = 'typing';
      v.text = typed(this.typing.text, t - this.typing.t0);
      return v;
    }
    if (this.rec) { v.mode = 'rec'; return v; }
    if (this.spiritNear && at % 1.6 < 0.3) { v.mode = 'static'; v.noise = Math.floor(at * 4); return v; }
    return v;
  }

  private nextView = 0;
  private updateScreen(t: number, at: number): void {
    this.checkSpirits(t);
    const flashing = this.flash !== null;
    if (t < this.nextView && !flashing && this.lastDraw >= 0) return;   // content sampled at 8 Hz, redrawn ≤ 4 Hz
    this.nextView = t + 0.125;
    const v = this.view(t, at);
    const key = viewKey(v);
    if (key === this.lastKey) return;
    if (this.lastDraw >= 0 && t - this.lastDraw < 0.25 && !v.mode.startsWith('flash')) return;   // ≤ 4 Hz (ARCH §5.1)
    this.lastKey = key; this.lastDraw = t;
    this.screen.draw(v);
  }
  private drawScreen(force: boolean): void {
    const v = this.view(this.core.clock.t, this.core.clock.animT);
    if (force) { this.lastKey = viewKey(v); this.screen.draw(v); }
  }

  // ---------------------------------------------------------------------------------------------- tweens
  private tween(name: string, to: number, dur: number): Promise<void> {
    const prev = this.tweens.get(name);
    prev?.done?.();
    const from = name === 'yaw' ? this.yawOff : this.poses.get(name) ?? 0;
    return new Promise((res) => {
      this.tweens.set(name, { from, to, t0: this.core.clock.t, dur: Math.max(1e-3, dur), done: res });
      if (this.core.params.test && dur <= 0) this.runTweens(this.core.clock.t);
    });
  }
  private runTweens(t: number): void {
    for (const [name, tw] of this.tweens) {
      const k = Math.min(1, (t - tw.t0) / tw.dur);
      const s = k * k * (3 - 2 * k);
      const val = tw.from + (tw.to - tw.from) * s;
      if (name === 'yaw') this.yawOff = val; else this.poses.set(name, val);
      if (k >= 1) { this.tweens.delete(name); tw.done?.(); }
    }
  }
}
