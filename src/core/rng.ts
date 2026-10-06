// src/core/rng.ts — owner: S. FROZEN. mulberry32 with label-keyed forks (ARCHITECTURE §2.8.12, GDD §19.1).
import type { Rng } from '../contracts';

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG. fork(label) is independent of how many numbers the parent has drawn. */
export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, bInclusive) => a + Math.floor(next() * (bInclusive - a + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    fork: (label) => createRng((hashString(label) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0),
  };
  return rng;
}
