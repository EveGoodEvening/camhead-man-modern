// src/core/actors.ts — owner: S. FROZEN. Actor registry (ARCHITECTURE §2.7 ActorsApi).
import type { ActorDef, ActorsApi, Handle } from '../contracts';

export function createActors(): ActorsApi {
  const map = new Map<string, { def: ActorDef; handle: Handle }>();
  return {
    register(def) {
      const prev = map.get(def.id);
      if (prev) prev.handle.enabled = false;
      const rec = {
        def,
        handle: {
          enabled: true,
          remove: () => { if (map.get(def.id) === rec) map.delete(def.id); },
        } as Handle,
      };
      map.set(def.id, rec);
      return rec.handle;
    },
    get: (id) => {
      const r = map.get(id);
      return r && r.handle.enabled ? r.def : null;
    },
    list: (scene) => [...map.values()].filter((r) => r.handle.enabled && (!scene || r.def.scene === scene)).map((r) => r.def),
  };
}
