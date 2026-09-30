// src/core/testkit.ts — owner: S. FROZEN. Headless core for vitest (node, no DOM/WebGL): real store, rules, physics,
// player, rig and loop with fake services. Also usable by F's story.golden.test.ts.
import { Vector3, type WebGLRenderer } from 'three';
import { Bus } from '../events';
import type { Core, Services, WorldApi } from '../contracts';
import type { SpotDef } from '../types';
import { SPOTS } from '../data/locations';
import { createCore, type CoreInternals } from './boot';
import { parseParams } from './params';
import { posToWorld } from './planet';
import { MemoryStorage, type StorageLike } from './save';

/** Minimal world: spot()/spotPos() from the SPOTS table; everything else inert. */
export function fakeWorld(): WorldApi {
  const fallback = SPOTS[0];
  const spot = (id: string): SpotDef => SPOTS.find((s) => s.id === id) ?? fallback;
  return {
    init: async () => undefined,
    spot,
    spotPos: (id, out = new Vector3()) => { const s = spot(id); return posToWorld(s.scene, s.pos, out); },
    anchor: () => ({ scene: 'planet', pos: new Vector3() }),
    signalAt: () => 1,
    occluders: () => [],
    pickables: () => [],
    gateOpen: () => false,
    setMirrorTexture: () => undefined,
  };
}

export interface TestCore { core: Core; internals: CoreInternals; bus: Bus; storage: StorageLike }

export function createTestCore(o: { search?: string; services?: Partial<Services>; storage?: StorageLike } = {}): TestCore {
  const bus = new Bus();
  const storage = o.storage ?? new MemoryStorage();
  const { params } = parseParams(o.search ?? '?test&seed=1');
  const { core, internals } = createCore({
    renderer: {} as WebGLRenderer, canvas: {} as HTMLCanvasElement, uiRoot: {} as HTMLElement, fadeEl: null,
    params, bus, storage,
  });
  const s = core.services as Partial<Services> & Record<string, unknown>;
  s.world = fakeWorld();
  Object.assign(s, o.services ?? {});
  return { core, internals, bus, storage };
}
