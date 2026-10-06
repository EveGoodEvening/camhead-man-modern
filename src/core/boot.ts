// src/core/boot.ts — owner: S. FROZEN. Builds the core objects and registers core systems (ARCHITECTURE §2.1 step 2).
import type { WebGLRenderer } from 'three';
import type { Bus } from '../events';
import type { Core, UrlParams } from '../contracts';
import type { GameState } from '../types';
import { createActors } from './actors';
import { createCameraRig, type CameraRigImpl } from './cameraRig';
import { MutableClock, SimTimers } from './clock';
import { registerCoreActions } from './coreActions';
import { createFade, type FadeImpl } from './fade';
import { createInput, type InputImpl } from './input';
import { createInteract, type InteractImpl } from './interact';
import { createLog } from './log';
import { createLoop, type LoopImpl } from './loop';
import { createPhysics, type PhysicsImpl } from './physics';
import { createPlayer, type PlayerImpl } from './player';
import { createRng } from './rng';
import { createRules, type RulesImpl } from './rules';
import { MemoryStorage, browserStorage, createSaveManager, type SaveManager, type StorageLike } from './save';
import { createScenes, type ScenesImpl } from './scenes';
import { createServices } from './services';
import { createStore, type StoreImpl } from './state';

export interface CoreInternals {
  clock: MutableClock; timers: SimTimers; input: InputImpl; loop: LoopImpl; store: StoreImpl; save: SaveManager;
  rules: RulesImpl; scenes: ScenesImpl; physics: PhysicsImpl; player: PlayerImpl; rig: CameraRigImpl;
  interact: InteractImpl; fade: FadeImpl;
}

export interface CoreOpts {
  renderer: WebGLRenderer; canvas: HTMLCanvasElement; uiRoot: HTMLElement; fadeEl: HTMLElement | null;
  params: UrlParams; bus: Bus; storage?: StorageLike;
}

type MutableCore = { -readonly [K in keyof Core]: Core[K] };

export function createCore(o: CoreOpts): { core: Core; internals: CoreInternals } {
  const { params, bus } = o;
  const log = createLog(params.debug);
  const clock = new MutableClock();
  const timers = new SimTimers(clock);
  const input = createInput(clock, bus);
  const loop = createLoop({ clock, timers, input, bus, log });
  const store = createStore(bus, params.seed);
  const scenes = createScenes(bus);
  const physics = createPhysics(bus);
  const actors = createActors();
  const fade = createFade(o.fadeEl, clock, params.test);
  const core = {
    renderer: o.renderer, canvas: o.canvas, uiRoot: o.uiRoot, params, clock, rng: createRng(params.seed), log, bus,
    input, loop, store, scenes, physics, actors,
    fade: (toBlack: boolean, seconds?: number) => fade.fade(toBlack, seconds),
    services: createServices(),
  } as Partial<MutableCore> as MutableCore;
  const rules = createRules({
    store, bus, log,
    activeScene: () => scenes.active,
    nightView: () => {
      const lens = core.services.lens as Core['services']['lens'] | undefined;
      try { return lens ? lens.isNightView() : false; } catch { return false; }
    },
  });
  core.rules = rules;
  const player = createPlayer(core, physics, scenes);
  core.player = player;
  const rig = createCameraRig(core, player, physics);
  core.cameraRig = rig;
  const interact = createInteract(core, player, physics);
  core.interact = interact;

  physics.setSpotResolver((id) => {
    try { const s = core.services.world.spot(id); return { scene: s.scene, pos: s.pos }; } catch { return null; }
  });

  const storage = o.storage ?? (params.test && !params.save ? new MemoryStorage() : browserStorage());
  const save = createSaveManager({
    store, bus, clock, storage, log,
    isBusy: () => {
      try {
        const s = core.services;
        return (s.story?.currentBeat() ?? null) !== null || (s.ui?.busy().card ?? false) || rules.pending() > 0;
      } catch { return rules.pending() > 0; }
    },
    snapshotPlayer: (s: GameState) => {
      const p = player.pos(), h = player.heading();
      s.player = { scene: player.scene, pos: [p.x, p.y, p.z], heading: [h.x, h.y, h.z] };
    },
    // P3 G8: periodic saves only from plain walking (no viewfinder/peek/dialogue/modal/fade)
    canAutosave: () => input.context() === 'gameplay' && player.pose !== 'sit',
    notify: (e) => {
      try { core.services.ui.toast(e === 'saved' ? 'ui.saved' : 'ui.saveFull'); } catch { /* E not ready */ }
    },
  });
  store.setPersistence(save);
  registerCoreActions(core, timers);

  // core systems (§2.2 table)
  loop.addSystem('core:player', 'player', (dt) => player.update(dt));
  loop.addSystem('core:interact', 'player', () => interact.update());
  loop.addSystem('core:camera', 'camera', (dt) => rig.update(dt));
  loop.addSystem('core:cull', 'late', () => scenes.cull(rig.camera.position));
  loop.addSystem('core:fade', 'late', () => fade.update());
  loop.addSystem('core:save', 'late', () => save.update());

  return { core, internals: { clock, timers, input, loop, store, save, rules, scenes, physics, player, rig, interact, fade } };
}
