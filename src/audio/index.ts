// src/audio/index.ts — owner A. AudioApi (ARCHITECTURE §3.A item 7, GDD §17, TECH §6): one AudioContext created/resumed
// on the first pointer or key event; master gain → compressor; every SfxId synthesized; `sfx` bus events play; beds
// for waves / hum / wind / tunnel / insects / drone driven by the player and uUncanny; footsteps from player speed;
// `sfx_memo` = three low 嘟 (sent by E as an `sfx`); ?mute and settings.volume. Nothing is created while muted (tests never touch WebAudio).
import { Vector3 } from 'three';
import type { AudioApi, ModuleFactory } from '../contracts';
import type { SfxId } from '../types';
import { SFX, makeNoise, type Synth } from './synth';
import { Ambience } from './ambience';
import { CountdownPitch, RateLimit, StepCadence, droneGain, humGain, waveGain, windGain } from './logic';

const KEYPAD_NOTES = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319];
const MASTER = 0.7;

export const createAudio: ModuleFactory<AudioApi> = (core) => {
  let ctx: AudioContext | null = null;
  let synth: Synth | null = null;
  let master: GainNode | null = null;
  let amb: Ambience | null = null;
  let muted = false;
  let volume = 1;
  let paused = false;
  let unlocking: Promise<void> | null = null;
  let keyIdx = 0;
  let stepIdx = 0;
  const typeLimit = new RateLimit(30);
  const countdown = new CountdownPitch(10);
  const steps = new StepCadence();
  const camPos = new Vector3(), camRight = new Vector3(), tmp = new Vector3();
  const rng = core.rng.fork('audio:beds');

  const applyMaster = () => {
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(muted ? 0 : MASTER * volume, ctx.currentTime, 0.03);
  };

  const build = (): void => {
    if (ctx) return;
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER * volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    synth = { ctx, out: master, noise: makeNoise(ctx) };
    try { amb = new Ambience(synth, rng); } catch (e) { core.log.warn('[audio] ambience failed', e); }
  };

  /** Positional gain + pan relative to the camera (simple, cheap; no PannerNode HRTF). */
  const spatial = (at: Vector3 | undefined): { gain: number; pan: number } => {
    if (!at) return { gain: 1, pan: 0 };
    const cam = core.cameraRig.camera;
    camPos.setFromMatrixPosition(cam.matrixWorld);
    camRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    tmp.copy(at).sub(camPos);
    const d = tmp.length();
    return { gain: 1 / (1 + Math.max(0, d - 2) / 6), pan: d > 1e-3 ? Math.max(-0.8, Math.min(0.8, tmp.dot(camRight) / d)) : 0 };
  };

  const api: AudioApi = {
    async init() {
      const onGesture = () => { void api.unlock(); };
      window.addEventListener('pointerdown', onGesture, { capture: true });
      window.addEventListener('keydown', onGesture, { capture: true });
      // P3 G9: a hidden tab stops the sim (rAF) but WebAudio kept playing the last ambience; suspend while hidden
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!ctx) return;
          if (document.visibilityState === 'hidden') { if (ctx.state === 'running') void ctx.suspend().catch(() => undefined); }
          else if (!muted) void ctx.resume().catch(() => undefined);
        });
      }
      core.bus.on('sfx', (e) => api.play(e.id, { at: e.at ? new Vector3(e.at[0], e.at[1], e.at[2]) : undefined, vol: e.vol }));
      // P3r3 L6: the memo chime is played by E's `memo` action (ctx.sfx, skipped on quiet boots); the `memo` bus event is
      // data only. Playing it here too started two voices at the same instant (+6 dB, one chime at double amplitude).
      // camera sounds (GDD §17): nobody else emits these. A burst sends one `shutter` per frame (0.3 s apart in sim
      // time, or all at once from shoot({burst})): the first frame plays sfx_burst (3 clicks), the rest are covered.
      let burstUntil = -1;
      core.bus.on('shutter', (e) => {
        const t = core.clock.t;
        if (e.burst) {
          if (t < burstUntil) return;
          burstUntil = t + 0.75;
          api.play('sfx_burst');
        } else api.play('sfx_shutter');
      });
      let flashArmed = false;
      core.bus.on('lensChanged', (e) => {             // sfx_flash = the flash charging when it is switched on
        if (e.flash && !flashArmed) api.play('sfx_flash', { vol: 0.8 });
        flashArmed = e.flash;
      });
      core.bus.on('flagSet', (e) => {                 // P5: the flash scatters the pigeons out of the roof coop
        if (e.flag !== 'pigeons_gone') return;
        let at: Vector3 | undefined;
        try { at = core.services.world.anchor('coop_door')?.pos; } catch { at = undefined; }
        api.play('sfx_pigeons', { at });
      });
      core.bus.on('settings', (s) => api.setVolume(s.volume));
      core.bus.on('paused', (e) => { paused = e.on; });
      core.loop.addSystem('audio:late', 'late', (dt) => {
        if (!ctx || !amb || muted) return;
        const scene = core.player.scene, f = core.player.flat(), r = Math.hypot(f.x, f.z);
        const phase = core.store.state.phase;
        let unc = 0;
        try { unc = core.services.render.uncanny(); } catch { unc = 0; }
        amb.set({
          waves: waveGain(r, scene), hum: humGain(phase, scene), wind: windGain(r, f.h, scene),
          rumble: scene === 'subway_int' ? 0.09 : 0, drone: droneGain(unc),
          insects: scene === 'planet' && phase === 'night' ? 0.012 : 0,
        }, paused ? 0.3 : 1);
        const n = paused ? 0 : steps.tick(dt, core.player.speed());
        for (let i = 0; i < n; i++) api.play('sfx_step', { vol: 0.55 });
      });
    },
    unlock() {
      if (muted) return Promise.resolve();
      if (unlocking) return unlocking;
      // the IIFE may finish synchronously (context already running), so clear the slot from outside it — a `finally`
      // inside would run before the assignment and leave a stale resolved promise that never resumes again
      const p = (async () => {
        try {
          build();
          if (ctx && ctx.state !== 'running') await ctx.resume();
        } catch (e) { core.log.warn('[audio] unlock failed', e); }
      })();
      unlocking = p;
      void p.then(() => { if (unlocking === p) unlocking = null; });
      return p;
    },
    play(id: SfxId, o) {
      if (muted || !ctx || !synth || ctx.state !== 'running') return;
      const fn = SFX[id];
      if (!fn) { core.log.warn(`[audio] unknown sfx ${id}`); return; }
      const now = ctx.currentTime;
      if (id === 'sfx_type' && !typeLimit.allow(now)) return;
      const blip = id === 'sfx_countdown' ? countdown.next(now) : 'low';
      if (blip === 'skip') return;
      const sp = spatial(o?.at);
      const vol = Math.max(0, o?.vol ?? 1) * sp.gain;
      if (vol < 0.01) return;
      let out: AudioNode = master as GainNode;
      if (sp.pan !== 0) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; p.connect(out); out = p; }
      const high = blip === 'high';
      const pitch = id === 'sfx_keypad' ? KEYPAD_NOTES[keyIdx++ % KEYPAD_NOTES.length] : id === 'sfx_step' ? (stepIdx++ % 7) : undefined;
      try { fn({ ...synth, out }, now + 0.005, { vol, high, pitch }); } catch (e) { core.log.warn(`[audio] ${id} failed`, e); }
    },
    setMuted(m) { muted = m; applyMaster(); if (m && ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined); else if (!m && ctx) void ctx.resume().catch(() => undefined); },
    setVolume(v) {
      const x = Number.isFinite(v) ? (v > 1 ? v / 100 : v) : 1;          // accepts 0..1 or 0..100
      volume = Math.max(0, Math.min(1, x));
      applyMaster();
    },
  };
  return api;
};
