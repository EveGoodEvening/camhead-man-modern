// src/render/render.test.ts — owner A. ARCHITECTURE §3.A self-tests: noise equalization, palette table, tweens,
// lamp packing, uncanny envelopes, shader patch anchors (three r186 chunk names), sun frame.
import { describe, expect, it } from 'vitest';
import { ShaderLib, Vector3, Vector4 } from 'three';
import { NOISE_CELLS, NOISE_SIZE, generateNoise } from './noise';
import { PALETTES, SKY_STYLE, UNCANNY_SKY } from '../data/phases';
import { PaletteTween, applyUncanny, hexToRgb, lerpVals, resolvePalette, steppedK } from './grade';
import { UncannyEnvelope, boilOf, uncW, uncannyBase } from './uncanny';
import { dirInFrame, packLamps, snapToTexels, sunFromFrame, type LampRec } from './lights';
import { patchToonShader } from './materials';
import { RenderScaler } from './scale';
import type { PaletteKey } from '../types';

const rgbNear = (a: readonly number[], hex: string) => { const b = hexToRgb(hex); for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 6); };
const KEYS: PaletteKey[] = ['title', 'morning', 'day', 'dusk', 'night', 'dawn'];
const HEX = /^#[0-9a-f]{6}$/i;

describe('noise (ART §3.4)', () => {
  const d = generateNoise();
  it('is 128² RGBA with the ART lattice sizes', () => {
    expect(d.length).toBe(NOISE_SIZE * NOISE_SIZE * 4);
    expect([...NOISE_CELLS]).toEqual([8, 4, 12, 4]);
  });
  it('rank-equalizes every channel: step(t, n) covers 1 − t of the area within ±1 %', () => {
    const n = NOISE_SIZE * NOISE_SIZE;
    for (let c = 0; c < 4; c++) {
      for (const t of [0.16, 0.25, 0.5, 0.74, 0.75]) {
        let k = 0;
        for (let i = 0; i < n; i++) if (d[i * 4 + c] / 255 >= t) k++;
        expect(Math.abs(k / n - (1 - t))).toBeLessThan(0.01);
      }
    }
  });
  it('is deterministic and tiles (edge texels continue across the seam)', () => {
    expect(generateNoise()).toEqual(d);
    let maxJump = 0;
    for (let y = 0; y < NOISE_SIZE; y++) {
      const a = d[(y * NOISE_SIZE + NOISE_SIZE - 1) * 4 + 1], b = d[(y * NOISE_SIZE) * 4 + 1];
      maxJump = Math.max(maxJump, Math.abs(a - b));
    }
    expect(maxJump).toBeLessThan(40);
  });
});

describe('palettes (GDD §10.3, ART §5.2)', () => {
  it('has every PaletteKey with valid hex colours', () => {
    for (const k of KEYS) {
      const p = PALETTES[k];
      expect(p.key).toBe(k);
      for (const c of [p.skyBase, p.skyCloud, p.ink, p.speck, p.moon, p.inkHalo, p.fog?.color]) if (c !== null && c !== undefined) expect(c).toMatch(HEX);
      expect(p.grade).toHaveLength(3);
      expect(p.lineFade).toHaveLength(3);
      expect(SKY_STYLE[k]).toBeDefined();
    }
    for (const c of [UNCANNY_SKY.skyBase, UNCANNY_SKY.skyCloud, UNCANNY_SKY.moon, UNCANNY_SKY.ink]) expect(c).toMatch(HEX);
  });
  it('matches the GDD §10.3 table', () => {
    expect([PALETTES.day.skyBase, PALETTES.day.skyCloud, PALETTES.day.cloudCut]).toEqual(['#65c1bc', '#9ae4d5', 0.52]);
    expect([PALETTES.morning.skyCloud, PALETTES.morning.cloudCut, [...PALETTES.morning.grade]]).toEqual(['#f2cfc2', 0.55, [1.02, 0.98, 0.96]]);
    expect([PALETTES.dusk.skyBase, PALETTES.dusk.skyCloud, PALETTES.dusk.ink, [...PALETTES.dusk.grade]]).toEqual(['#c98a74', '#efc193', '#2f3040', [1, 0.9, 0.82]]);
    expect([PALETTES.night.skyBase, PALETTES.night.skyCloud, PALETTES.night.ink, PALETTES.night.inkHalo, PALETTES.night.moon, PALETTES.night.moonSize])
      .toEqual(['#22365a', '#34507a', '#141b20', '#6d8fb0', '#f3ecd2', 0.035]);
    expect(PALETTES.night.night).toBe(true);
    expect([PALETTES.dawn.skyBase, PALETTES.dawn.skyCloud, [...PALETTES.dawn.grade]]).toEqual(['#9ec9c8', '#f4d6c8', [1.03, 0.98, 0.95]]);
    expect([PALETTES.title.skyCloud, PALETTES.title.cloudCut, PALETTES.title.fog]).toEqual(['#6dcac0', 0.6, null]);
    expect(UNCANNY_SKY).toMatchObject({ skyBase: '#16262b', skyCloud: '#3d6b62', moon: '#d0453b', ink: '#10181a', cloudCut: 0.5 });
  });
});

describe('palette tweens (ART §5.2: 3 s, cloud cut in 3 jumps)', () => {
  it('steps the cloud cut in thirds and lerps colours', () => {
    expect([0, 0.2, 0.34, 0.5, 0.67, 0.99, 1].map(steppedK)).toEqual([0, 0, 1 / 3, 1 / 3, 2 / 3, 2 / 3, 1]);
    const tw = new PaletteTween('day');
    tw.set('night', 10, 3);
    rgbNear(tw.value(10).skyBase, '#65c1bc');
    const mid = tw.value(11.5);
    expect(mid.night).toBeCloseTo(0.5, 5);
    expect(mid.cloudCut).toBeCloseTo(0.52 + (0.56 - 0.52) / 3, 6);
    expect(mid.skyBase[2]).toBeCloseTo((hexToRgb('#65c1bc')[2] + hexToRgb('#22365a')[2]) / 2, 5);
    rgbNear(tw.value(13).skyBase, '#22365a');
    expect(tw.value(99).halo).toBe(1);
  });
  it('instant switches have no tween and retargeting starts from the current value', () => {
    const tw = new PaletteTween('day');
    tw.set('dusk', 0, 0);
    rgbNear(tw.value(0).skyBase, '#c98a74');
    tw.set('night', 0, 2);
    tw.set('dawn', 1, 2);                               // mid-tween retarget
    const v = tw.value(1);
    expect(v.skyBase[0]).toBeCloseTo((hexToRgb('#c98a74')[0] + hexToRgb('#22365a')[0]) / 2, 5);
  });
  it('fog/moon/specks fade instead of popping when one side has none', () => {
    const a = resolvePalette('title'), b = resolvePalette('night');
    const out = resolvePalette('day');
    lerpVals(a, b, 0.5, out);
    expect(out.fogMax).toBeCloseTo(0.225, 5);
    expect(out.moonSize).toBeCloseTo(0.0175, 5);
    rgbNear(out.fogColor, '#22365a');
  });
  it('uncanny overlay: w = 0 leaves the night sky untouched; w = 1 is the GDD uncanny preset', () => {
    const n = resolvePalette('night'), out = resolvePalette('day');
    applyUncanny(n, 0, out);
    rgbNear(out.skyBase, '#22365a');
    applyUncanny(n, 1, out);
    rgbNear(out.skyBase, '#16262b');
    rgbNear(out.ink, '#10181a');
    rgbNear(out.moon, '#d0453b');
    expect(out.moonSize).toBeCloseTo(0.06, 6);
  });
});

describe('uncanny (ARCH §3.A item 3, ART §2.3)', () => {
  it('derives uUncW and uBoil', () => {
    expect(uncW(0.15)).toBe(0);
    expect(uncW(0.3)).toBeCloseTo(0.176, 3);
    expect(uncW(0.6)).toBeCloseTo(0.529, 3);
    expect(uncW(1)).toBe(1);
    expect(boilOf(0)).toBe(0);
    expect(boilOf(0.15)).toBeCloseTo(0.3, 6);
    expect(boilOf(0.6)).toBeCloseTo(1, 6);
  });
  it('baselines: night before P8 0.15, subway 0.6, day 0', () => {
    expect(uncannyBase({ phase: 'night', p8Done: false, scene: 'planet' })).toBe(0.15);
    expect(uncannyBase({ phase: 'night', p8Done: true, scene: 'planet' })).toBe(0);
    expect(uncannyBase({ phase: 'day', p8Done: false, scene: 'planet' })).toBe(0);
    expect(uncannyBase({ phase: 'night', p8Done: false, scene: 'subway_int' })).toBe(0.6);
  });
  it('M_chai_wake rises to 1 over 1.2 s, holds until dialogueEnd, then returns to the baseline', () => {
    const e = new UncannyEnvelope();
    e.trigger('M_chai_wake', 10);
    expect(e.value(10.6, 0.15)).toBeCloseTo(0.575, 5);
    expect(e.value(11.2, 0.15)).toBeCloseTo(1, 6);
    expect(e.value(30, 0.15)).toBeCloseTo(1, 6);
    e.dialogueEnd(30);
    expect(e.value(30.5, 0.15)).toBeCloseTo(0.575, 5);
    expect(e.value(31.5, 0.15)).toBeCloseTo(0.15, 6);
  });
  it('M_zhimei_move pulses 0.3 for 0.6 s; M_lighthouse_off 0.5 for 4 s', () => {
    const e = new UncannyEnvelope();
    e.trigger('M_zhimei_move', 5);
    expect(e.value(5.3, 0.15)).toBe(0.3);
    expect(e.value(5.61, 0.15)).toBe(0.15);
    e.trigger('M_lighthouse_off', 6);
    expect(e.value(9.9, 0)).toBe(0.5);
    expect(e.value(10.1, 0)).toBe(0);
  });
  it('M_zhe falls 1 → 0 over 2 s, overriding the baseline and cancelling the chai hold', () => {
    const e = new UncannyEnvelope();
    e.trigger('M_chai_wake', 0);
    e.trigger('M_zhe', 3);
    expect(e.value(3, 0.15)).toBe(1);
    expect(e.value(4, 0.15)).toBeCloseTo(0.5, 6);
    expect(e.value(5.5, 0)).toBe(0);
  });
});

describe('lights', () => {
  it('packs the 8 nearest lit lamps of the scene; the rest are off', () => {
    const lamps: LampRec[] = [];
    for (let i = 0; i < 12; i++) lamps.push({ scene: 'planet', pos: new Vector3(i, 0, 0), radius: 5, on: i !== 2 });
    lamps.push({ scene: 'studio_int', pos: new Vector3(0.1, 0, 0), radius: 5, on: true });
    const out = Array.from({ length: 8 }, () => new Vector4(9, 9, 9, 9));
    expect(packLamps(lamps, 'planet', new Vector3(0, 0, 0), out)).toBe(8);
    expect(out.map((v) => v.x)).toEqual([0, 1, 3, 4, 5, 6, 7, 8]);
    expect(out.every((v) => v.w === 5)).toBe(true);
    expect(packLamps(lamps, 'subway_int', new Vector3(), out)).toBe(0);
    expect(out.every((v) => v.w === 0)).toBe(true);
  });
  it('sun = normalize(east 0.55, up 0.8, south 0.25) in the geographic frame', () => {
    const f = { up: new Vector3(0, 1, 0), north: new Vector3(0, 0, -1), east: new Vector3(1, 0, 0) };
    const s = sunFromFrame(f, new Vector3());
    const k = Math.hypot(0.55, 0.8, 0.25);
    expect(s.x).toBeCloseTo(0.55 / k, 6); expect(s.y).toBeCloseTo(0.8 / k, 6); expect(s.z).toBeCloseTo(0.25 / k, 6);
    const m = dirInFrame(f, 0, 90, new Vector3());
    expect(m.x).toBeCloseTo(1, 6);
  });
  it('texel snapping moves the focus by less than one texel diagonal and is idempotent', () => {
    const dir = new Vector3(0.3, 0.8, 0.2).normalize(), up = new Vector3(0, 0, -1), off = new Vector3();
    const p = new Vector3(3.217, 70.1, 12.345);
    snapToTexels(p, dir, up, 0.043, off);
    expect(off.length()).toBeLessThan(0.043);
    const q = p.clone().add(off);
    snapToTexels(q, dir, up, 0.043, off);
    expect(off.length()).toBeLessThan(1e-6);
  });
});

describe('toon shader patch (ART §3.4 on three r186 MeshToon)', () => {
  it('finds every anchor and injects MRT location 1 + the shadow mask', () => {
    const s = { vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
    patchToonShader(s);
    expect(s.vertexShader).toContain('vSunView = normalize(');
    expect(s.vertexShader).toContain('#include <project_vertex>');
    expect(s.fragmentShader).toContain('layout(location = 1) out highp vec4 gInfo;');
    expect(s.fragmentShader).toContain('#include <shadowmask_pars_fragment>');
    expect(s.fragmentShader).toContain('gInfo = vec4(cmOct(normal)');
    for (const gone of ['<opaque_fragment>', '<tonemapping_fragment>', '<colorspace_fragment>', '<fog_fragment>', '<lights_fragment_begin>']) {
      expect(s.fragmentShader).not.toContain(gone);
    }
  });
});

describe('adaptive render scale', () => {
  const run = (s: RenderScaler, ms: number, seconds: number) => { for (let t = 0; t < seconds * 1000; t += ms) s.update(ms); };
  it('stays at full scale while frames meet 60 Hz', () => {
    const s = new RenderScaler();
    run(s, 16.7, 10);
    expect(s.scale).toBe(1);
  });
  it('shrinks to the floor when fill-bound, and never below it', () => {
    const s = new RenderScaler();
    run(s, 40, 10);
    expect(s.scale).toBe(0.6);
  });
  it('grows back after sustained fast frames, ignoring hitches', () => {
    const s = new RenderScaler();
    run(s, 25, 3);
    const low = s.scale;
    expect(low).toBeLessThan(1);
    s.update(1000);                       // a tab switch / compile hitch is ignored
    expect(s.scale).toBe(low);
    run(s, 12, 30);
    expect(s.scale).toBe(1);
  });
  it('does not oscillate: a level that fails right after a step up is avoided for a while', () => {
    const s = new RenderScaler();
    // cost model: 16.7 ms at 0.8, too slow above it
    let changes = 0;
    for (let t = 0; t < 15000; t += 16) { if (s.update(s.scale > 0.81 ? 24 : 15)) changes++; }
    expect(s.scale).toBeLessThanOrEqual(0.8);
    expect(changes).toBeLessThan(8);
  });
});
