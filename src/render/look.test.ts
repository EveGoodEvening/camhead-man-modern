// src/render/look.test.ts — P3-look fixes that can be checked without a GPU: the see-through / fade screen-door and
// its no-ink surface id, the composite's id-255 ink suppression, the lamp-pool gating, hi-res story signs, and the
// dialogue camera's hero-cover classification.
import { describe, expect, it } from 'vitest';
import { ShaderLib, Vector3 } from 'three';
import { patchToonShader, shared, makeToonMaterial } from './materials';
import { HI_RES_SIGNS, signPx } from '../world/kit/tex';
import { heroCover } from '../ui/dialog/camera';

const SOURCES = import.meta.glob('/src/render/composite.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('toon screen-door (L1 see-through, hero fade)', () => {
  const s = { vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToonShader(s);
  it('discards by an ordered dither against cmKeep, which starts at the per-material uFade', () => {
    expect(s.fragmentShader).toContain('float cmKeep = uFade;');
    expect(s.fragmentShader).toContain('if (cmBayer4(gl_FragCoord.xy) + 0.03 > cmKeep) discard;');
    expect(s.fragmentShader).toContain('uniform vec4 uSeeThru;');
  });
  it('writes surface id 255 for dithered fragments (no ink), the real id otherwise', () => {
    expect(s.fragmentShader).toContain('cmKeep < 0.999 ? 1.0 : vSurfaceId / 255.0');
  });
  it('the composite draws no ink where any tap carries id 255', () => {
    const comp = Object.values(SOURCES)[0];
    expect(comp).toContain('step(idMax, 254.5 / 255.0)');
  });
  it('a solid material can never discard (Bayer max 15/16 + 0.03 < 1)', () => {
    expect(15 / 16 + 0.03).toBeLessThan(1);
  });
  it('see-through is off by default and every material owns a uFade = 1', () => {
    expect(shared.uSeeThru.value.w).toBe(0);
    const m = makeToonMaterial({});
    expect((m.userData.toon as { uFade: { value: number } }).uFade.value).toBe(1);
    const c = m.clone();
    expect((c.userData.toon as { uFade: { value: number } }).uFade.value).toBe(1);
  });
});

describe('lamp pools (L8)', () => {
  it('only light up-facing surfaces or the pool foot, on the side facing the lamp', () => {
    const s = { vertexShader: ShaderLib.toon.vertexShader, fragmentShader: `#define CM_NIGHT 1\n#define CM_LAMPS 4\n${ShaderLib.toon.fragmentShader}` };
    patchToonShader(s);
    expect(s.fragmentShader).toContain('lFlat = step(0.6, dot(nW, lUp))');
    expect(s.fragmentShader).toContain('max(lFlat, step(0.62 * lr, lb)) * step(dot(nW, ld), 0.0)');
  });
});

describe('story signs are baked sharper (L6)', () => {
  it('128 px/m for the store fascia, the boat bow and the arcade signs; 52 px/m elsewhere', () => {
    for (const k of ['sign.store', 'sign.boat', 'sign.shop_shoes', 'sign.shop_hardware']) expect(HI_RES_SIGNS.has(k)).toBe(true);
    expect(signPx('sign.boat', 2.6, 0.5)).toEqual({ w: 2.6 * 128, h: 64 });
    expect(signPx('sign.shop_tea', 3, 0.75)).toEqual({ w: 3 * 52, h: 0.75 * 52 });
    expect(signPx('sign.store', 4.6, 0.8).w).toBeLessThanOrEqual(720);
  });
});

describe('dialogue camera hero cover (L2)', () => {
  const up = new Vector3(0, 1, 0);
  const cam = new Vector3(0, 1.6, 2.5), look = new Vector3(0, 1.3, 0);
  it('hero between camera and speaker = 2, at the frame edge = 1, out of frame / behind = 0', () => {
    expect(heroCover(cam, look, up, new Vector3(0.1, 1.75, 1.2), 2.5, 16 / 9)).toBe(2);
    expect(heroCover(cam, look, up, new Vector3(0.7, 1.75, 1.2), 2.5, 16 / 9)).toBe(1);
    expect(heroCover(cam, look, up, new Vector3(3.5, 1.75, 1.2), 2.5, 16 / 9)).toBe(0);
    expect(heroCover(cam, look, up, new Vector3(0, 1.75, 3.5), 2.5, 16 / 9)).toBe(0);
  });
  it('a hero standing behind the speaker is not "covering" (he is only at the edge or hidden by the speaker)', () => {
    expect(heroCover(cam, look, up, new Vector3(0.2, 1.75, -1.5), 2.5, 16 / 9)).toBe(1);
  });
});
