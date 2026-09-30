// P3r3 (open-play a, f): walkers slide round round colliders instead of stopping dead, and the collider grid index
// answers blocked()/resolve() exactly like the full scan.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Bus } from '../events';
import { SURFACES, chartToWorld, flatToChart, flatToWorld, worldToFlat } from './planet';
import { createPhysics, shapeOf } from './physics';
import { expMap, insideShape, walkOnSurface, projectOnTangent, upAt } from './sphere';
import type { ColliderDef, Handle } from '../contracts';
import { createTestCore } from './testkit';

const P = SURFACES.planet;

/** Walk from `start` toward `goal` (chart points) for `ticks` at 3.2 m/s with slide + resolve, like player.update. */
function walk(ph: ReturnType<typeof createPhysics>, start: { r: number; lon: number }, goal: { r: number; lon: number }, ticks: number, slide = true) {
  const pos = chartToWorld(start), g = chartToWorld(goal), prev = new Vector3(), dir = new Vector3();
  for (let i = 0; i < ticks; i++) {
    prev.copy(pos);
    projectOnTangent(dir.copy(g).sub(pos), upAt(P, pos), dir);
    walkOnSurface(P, pos, dir, 3.2 / 60);
    if (slide) ph.slide('planet', prev, pos, 0);
    ph.resolve('planet', pos, 0);
  }
  return flatToChart(worldToFlat(P, pos));
}

describe('P3r3 slide round circles', () => {
  it('a head-on walker passes an NPC-sized circle instead of stopping at its rim', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 40, lon: 60 }, radius: 0.35 }, tag: 'npc:x' });
    // dead centre: from r 44 straight through the collider at r 40 toward r 36
    const stopped = walk(ph, { r: 44, lon: 60 }, { r: 36, lon: 60 }, 180, false);
    expect(stopped.r).toBeGreaterThan(40.6);                    // the old behaviour: pinned on the rim
    const passed = walk(ph, { r: 44, lon: 60 }, { r: 36, lon: 60 }, 180);
    expect(passed.r).toBeLessThan(38.5);                        // went round it and on
  });
  it('slightly off-centre it slides at ≥ half speed toward its own side', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 40, lon: 60 }, radius: 0.35 } });
    const a = walk(ph, { r: 44, lon: 60.05 }, { r: 36, lon: 60.05 }, 150);
    expect(a.r).toBeLessThan(38.5);
  });
  it('when one side is walled off, it goes round the other side (never pinned)', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 40, lon: 60 }, radius: 0.35 } });
    // walls hugging the circle on either side in turn (a 0.7 m gap on the open side)
    for (const side of [1, -1]) {
      const ph2 = createPhysics(new Bus());
      ph2.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: 40, lon: 60 }, radius: 0.35 } });
      const c = chartToWorld({ r: 40, lon: 60 }), f = worldToFlat(P, c);
      // east/west of the circle along the chart's lon direction
      const e = new Vector3(Math.cos((60 * Math.PI) / 180), 0, -Math.sin((60 * Math.PI) / 180));
      const w = flatToWorld(P, { x: f.x + e.x * side * 1.4, z: f.z + e.z * side * 1.4, h: 0 });
      ph2.registerCollider({ scene: 'planet', shape: { kind: 'box', at: flatToChart(worldToFlat(P, w)), headingDeg: 0, halfW: 0.6, halfD: 3 } });
      const out = walk(ph2, { r: 44, lon: 60 }, { r: 36, lon: 60 }, 240);
      expect(out.r).toBeLessThan(38.5);
    }
    expect(ph.colliderCount('planet')).toBe(1);
  });
  it('the real player (createTestCore) walks round an NPC collider he runs into head-on', () => {
    const t = createTestCore();
    const at = { r: 40, lon: 200 };
    t.internals.physics.registerCollider({ scene: 'planet', shape: { kind: 'circle', at, radius: 0.35 }, tag: 'npc:test' });
    t.core.player.teleport({ scene: 'planet', at: { r: 43, lon: 200 }, yawDeg: 0 });   // heading 0 = toward the pole = −r
    for (let i = 0; i < 150; i++) { t.core.input.inject({ move: { x: 0, y: 1 } }); t.internals.loop.tick(1 / 60); }
    const c = t.core.player.chart() as { r: number; lon: number };
    expect(c.r).toBeLessThan(39);
  });
});

describe('P3r3 collider grid index', () => {
  it('blocked() agrees with a brute-force scan over random colliders (incl. removed ones)', () => {
    const ph = createPhysics(new Bus());
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const defs: ColliderDef[] = [], handles: Handle[] = [];
    for (let i = 0; i < 300; i++) {
      const at = { r: 5 + rnd() * 60, lon: rnd() * 360 };
      const d: ColliderDef = rnd() < 0.5
        ? { scene: 'planet', shape: { kind: 'circle', at, radius: 0.1 + rnd() * 2 } }
        : { scene: 'planet', shape: { kind: 'box', at, headingDeg: rnd() * 360, halfW: 0.1 + rnd() * 6, halfD: 0.1 + rnd() * 1 } };
      defs.push(d); handles.push(ph.registerCollider(d));
    }
    const live = new Set(defs);
    for (let i = 0; i < 100; i += 3) { handles[i].remove(); live.delete(defs[i]); }
    const shapes = [...live].map(shapeOf);
    let hits = 0;
    for (let i = 0; i < 5000; i++) {
      const p = chartToWorld({ r: 4 + rnd() * 62, lon: rnd() * 360 });
      for (const rad of [0.01, 0.25, 0.35]) {
        const brute = shapes.some((s) => insideShape(P, p, rad, s));
        expect(ph.blocked('planet', p, rad)).toBe(brute);
        if (brute) hits++;
      }
    }
    expect(hits).toBeGreaterThan(100);
  });
  it('interiors (5 km sphere) are indexed too: a studio collider blocks, its neighbour cell does not', () => {
    const ph = createPhysics(new Bus());
    ph.registerCollider({ scene: 'studio_int', shape: { kind: 'circle', at: { x: 1, y: 0, z: -2 }, radius: 0.5 } });
    const S = SURFACES.studio_int;
    expect(ph.blocked('studio_int', flatToWorld(S, { x: 1.3, z: -2, h: 0.5 }), 0.25)).toBe(true);
    expect(ph.blocked('studio_int', flatToWorld(S, { x: 5, z: -2, h: 0.5 }), 0.25)).toBe(false);
    expect(ph.blocked('planet', flatToWorld(SURFACES.planet, { x: 1.3, z: -2, h: 0 }), 0.25)).toBe(false);
  });
  it('a long thin wall spanning several cells is found along its whole length', () => {
    const ph = createPhysics(new Bus());
    const def: ColliderDef = { scene: 'planet', shape: { kind: 'box', at: { r: 30, lon: 10 }, headingDeg: 30, halfW: 9, halfD: 0.2 } };
    const h = ph.registerCollider(def);
    const sh = shapeOf(def);
    if (sh.kind !== 'box') throw new Error('box');
    const right = new Vector3().crossVectors(sh.n, sh.forward).normalize();
    for (let k = -8.8; k <= 8.8; k += 0.4) {
      const p = expMap(sh.n, right.clone().multiplyScalar(k / P.radius), new Vector3()).multiplyScalar(P.radius);
      expect(ph.blocked('planet', p, 0.05)).toBe(true);
    }
    h.remove();
    expect(ph.blocked('planet', chartToWorld({ r: 30, lon: 10 }), 0.3)).toBe(false);
  });
});
