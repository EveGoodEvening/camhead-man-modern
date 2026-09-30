// src/main.ts — owner: S. FROZEN. Boot sequence (ARCHITECTURE §2.1).
import { BasicShadowMap, NoToneMapping, SRGBColorSpace, Timer, WebGLRenderer } from 'three';
import { bus } from './events';
import { createCore } from './core/boot';
import { enableFly } from './core/fly';
import { warmFonts } from './core/fonts';
import { parseParams } from './core/params';
import { createModules, initModules } from './core/services';
import { installDebug } from './debug';
import { phaseClock } from './data/story';
import { t } from './data/zh';
import { createRender } from './render/index';
import { createAudio } from './audio/index';
import { createWorld } from './world/index';
import { createCharacters } from './chars/index';
import { createLens } from './lens/index';
import { createUi } from './ui/index';
import { createStory } from './story/index';
import type { Services } from './contracts';

async function boot(): Promise<void> {
  // 1. params + renderer (TECH §2.1, ART §4.6)
  const { params, warnings } = parseParams(location.search);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const fadeEl = document.getElementById('fade');
  if (params.test) document.body.classList.add('test-mode');
  const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap;
  renderer.info.autoReset = false;
  renderer.setPixelRatio(params.dpr ?? (params.test ? 1 : params.lowfx ? 0.75 : Math.min(devicePixelRatio, 1.5)));
  renderer.setSize(innerWidth, innerHeight, false);

  // 2. core objects + core action handlers
  const { core, internals } = createCore({ renderer, canvas, uiRoot, fadeEl, params, bus });
  for (const w of warnings) core.log.warn(`[params] ${w}`);
  internals.input.attach(window, canvas, { pointerLock: !params.test });
  const debug = installDebug(core, internals);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    core.cameraRig.camera.aspect = innerWidth / Math.max(1, innerHeight);
    core.cameraRig.camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  // P3 G8: leaving the page saves the current position (autosave otherwise waits for a flag change or a 10 s walk)
  const flushSave = () => { try { internals.save.flush(); } catch (e) { core.log.warn('[save] flush failed', e); } };
  addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

  // 3. fonts (≤ 3 s, never throws)
  await warmFonts();

  // 4–5. create, then initialise modules in order
  const factories: { [K in keyof Services]: (c: typeof core) => Services[K] } = {
    render: createRender, audio: createAudio, world: createWorld, chars: createCharacters,
    lens: createLens, ui: createUi, story: createStory,
  };
  createModules(core, factories);
  internals.loop.setRenderer((dt) => core.services.render.frame(dt));
  await initModules(core);
  if (params.mute || params.test) core.services.audio.setMuted(true);   // ?test also mutes (§2.10)
  if (params.fly) enableFly(core);

  // 6. game state
  if (params.chapter) core.services.story.bootChapter(params.chapter);
  else if (params.skipTitle || params.at || params.phase) await core.services.story.startGame({ skipIntro: true });
  else { core.services.ui.showTitle(); core.cameraRig.setTitleMode(true); }

  // 7. remaining URL state
  if (params.phase) {
    core.store.setPhase(params.phase, undefined, true);
    if (!params.chapter) core.store.setClock(phaseClock(params.phase));   // I-play: ?phase=night read 06:10
  }
  if (params.flags.length) {
    for (const f of params.flags) core.store.set(f);
    core.bus.emit('stateLoaded', { reason: 'debug' });
  }
  if (params.at) await core.player.goto(params.at, { fade: false });
  if (params.dev) {
    const [mod, arg = ''] = params.dev.split(':');
    const m = (core.services as unknown as Record<string, { devHook?: (a: string) => void } | undefined>)[mod];
    if (m?.devHook) m.devHook(arg); else core.log.warn(`[boot] no devHook for ${mod}`);
  }

  // 8. compile, then one frame (one tick so the camera/culling settle)
  await core.services.render.compile();
  internals.loop.step(1, 1 / 60);

  // 9. ready; realtime mode starts the loop (?test never does)
  try { await document.fonts.ready; } catch { /* ignore */ }
  debug.ready = true;
  if (!params.test) {
    const timer = new Timer();
    timer.connect(document);
    renderer.setAnimationLoop((ts) => {
      timer.update(ts);
      internals.loop.frame(Math.min(timer.getDelta(), 1 / 20));
    });
  }
}

/** P3-look (L5): a failed boot (no WebGL2 → `new WebGLRenderer` throws) used to leave a blank teal page. */
function showBootError(e: unknown): void {
  console.error('[boot] failed', e);
  let gl2 = false;
  try { gl2 = !!document.createElement('canvas').getContext('webgl2'); } catch { gl2 = false; }
  const el = document.getElementById('ui') ?? document.body;
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.dataset.testid = 'boot-error';
  box.setAttribute('role', 'alert');
  box.textContent = t(gl2 ? 'ui.bootFailed' : 'ui.noWebgl');
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;'
    + 'text-align:center;font:600 22px/1.5 system-ui,sans-serif;color:#26343a;background:#65c1bc;pointer-events:auto;z-index:99';
  el.appendChild(box);
}

boot().catch(showBootError);
