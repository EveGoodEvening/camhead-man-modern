// src/render/noise.ts — owner A. ART §3.4 tNoise: 128² RGBA8 tileable value noise, rank-equalized per channel.
// Lattice cells per tile: r = 8 (brush jitter), g = 4 (mottling), b = 12 (line breaks), a = 4 (line thickness).
import { DataTexture, LinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';

export const NOISE_SIZE = 128;
export const NOISE_CELLS = [8, 4, 12, 4] as const;

/** Deterministic Park–Miller generator (the noise must be identical in every run, independent of ?seed). */
function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Pure generator (vitest-able): RGBA bytes, each channel uniform after rank equalization. */
export function generateNoise(n = NOISE_SIZE, cells: readonly number[] = NOISE_CELLS, seed = 1337): Uint8Array {
  const data = new Uint8Array(n * n * 4);
  const rnd = lcg(seed);
  const vals = new Float32Array(n * n);
  const order = new Uint32Array(n * n);
  for (let c = 0; c < 4; c++) {
    const f = cells[c];
    const lat = new Float32Array(f * f);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const at = (i: number, j: number) => lat[(((j % f) + f) % f) * f + (((i % f) + f) % f)];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = (x / n) * f, v = (y / n) * f, i = Math.floor(u), j = Math.floor(v);
        let fx = u - i, fy = v - j;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
        const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
        vals[y * n + x] = a + (b - a) * fy;
      }
    }
    // rank-equalize: step(t, n) then covers exactly (1 − t) of the area (AGENTS.md lesson)
    for (let k = 0; k < order.length; k++) order[k] = k;
    order.sort((p, q) => vals[p] - vals[q] || p - q);
    const last = n * n - 1;
    for (let r = 0; r < order.length; r++) data[order[r] * 4 + c] = Math.round((r / last) * 255);
  }
  return data;
}

let cached: DataTexture | null = null;
/** The shared noise texture (created once, lazily; data texture → NoColorSpace). */
export function noiseTexture(): DataTexture {
  if (cached) return cached;
  const t = new DataTexture(generateNoise(), NOISE_SIZE, NOISE_SIZE, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  cached = t;
  return t;
}
