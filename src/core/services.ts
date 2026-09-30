// src/core/services.ts — owner: S. FROZEN. The services registry + module boot order (ARCHITECTURE §2.1 steps 4–5).
import type { Core, ModuleApi, ModuleFactory, Services } from '../contracts';

export const MODULE_ORDER: readonly (keyof Services)[] = ['render', 'audio', 'world', 'chars', 'lens', 'ui', 'story'];

/** An empty registry. main.ts fills every slot before any init() runs; never call services inside a factory. */
export function createServices(): Services {
  return {} as Services;
}

export type Factories = { [K in keyof Services]: ModuleFactory<Services[K]> };

/** Step 4: create every module (factories only capture `core`). */
export function createModules(core: Core, f: Factories): void {
  const s = core.services as { -readonly [K in keyof Services]: Services[K] };
  s.render = f.render(core);
  s.audio = f.audio(core);
  s.world = f.world(core);
  s.chars = f.chars(core);
  s.lens = f.lens(core);
  s.ui = f.ui(core);
  s.story = f.story(core);
}

/** Step 5: initialise in order; a failing init is logged (warn) and boot continues. */
export async function initModules(core: Core): Promise<void> {
  for (const k of MODULE_ORDER) {
    const m: ModuleApi = core.services[k];
    try { await m.init(); } catch (e) { core.log.warn(`[boot] ${k}.init() failed`, e); }
  }
}
