// src/world/kit/prims.test.ts — P3r3 L7: r186 polyhedron geometries are already non-indexed; an unguarded
// toNonIndexed() logged ~500 THREE warnings per load.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blob } from './prims';

describe('prims.blob', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('builds jittered blobs without THREE warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rng = { range: (a: number, b: number) => (a + b) / 2 } as unknown as Parameters<typeof blob>[4];
    const a = blob(1, 0, 0, 0, rng, 0.1, 1), b = blob(1, 0, 0, 0, rng, 0.1, -1);
    expect(a.index).toBeNull();
    expect(a.getAttribute('position').count).toBeGreaterThan(0);
    expect(b.getAttribute('position').count).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
