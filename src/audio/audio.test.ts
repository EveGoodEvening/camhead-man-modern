// src/audio/audio.test.ts — owner A. Pure audio logic: footstep cadence (GDD §17 1.8 Hz, ×1.4 running), bed gains,
// the sfx_type 30/s limit, countdown pitch, and SFX table completeness against the SfxId union.
import { describe, expect, it } from 'vitest';
import { CountdownPitch, RateLimit, StepCadence, droneGain, humGain, waveGain, windGain } from './logic';
import { SFX_IDS } from './synth';
import type { SfxId } from '../types';

const ALL: Record<SfxId, 1> = {
  sfx_shutter: 1, sfx_burst: 1, sfx_flash: 1, sfx_scan: 1, sfx_step: 1, sfx_waves: 1, sfx_ping: 1, sfx_type: 1, sfx_paper: 1,
  sfx_drone: 1, sfx_notice: 1, sfx_chime: 1, sfx_pigeons: 1, sfx_countdown: 1, sfx_horn: 1, sfx_keypad: 1, sfx_memo: 1,
  sfx_click: 1, sfx_stamp: 1, sfx_door: 1, sfx_fail: 1,
};

describe('audio logic', () => {
  it('synthesizes every SfxId', () => {
    expect([...SFX_IDS].sort()).toEqual(Object.keys(ALL).sort());
  });
  it('steps at 1.8 Hz walking and 2.52 Hz running, none when still', () => {
    const count = (speed: number) => { const c = new StepCadence(); let n = 0; for (let i = 0; i < 600; i++) n += c.tick(1 / 60, speed); return n; };
    expect(count(3.2)).toBe(18);
    expect(count(5.5)).toBe(25);
    expect(count(0)).toBe(0);
  });
  it('waves grow toward the sea and are silent indoors', () => {
    expect(waveGain(0, 'planet')).toBeLessThan(waveGain(30, 'planet'));
    expect(waveGain(43, 'planet')).toBeCloseTo(waveGain(60, 'planet'), 6);
    expect(waveGain(50, 'studio_int')).toBe(0);
    expect(windGain(34, 18, 'planet')).toBeGreaterThan(windGain(34, 0, 'planet'));
    expect(humGain('night', 'planet')).toBeLessThan(humGain('day', 'planet'));
    expect(droneGain(0)).toBe(0);
    expect(droneGain(1)).toBeGreaterThan(droneGain(0.15));
  });
  it('limits sfx_type to 30 per second', () => {
    const r = new RateLimit(30);
    let n = 0;
    for (let i = 0; i < 1000; i++) if (r.allow(i / 1000)) n++;
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(31);
  });
  it('raises the blips of the last 3 seconds of a 10 s run, whatever the emitter sends', () => {
    const c = new CountdownPitch(10);
    const hi = Array.from({ length: 10 }, (_, i) => c.next(100 + i));
    expect(hi).toEqual(['low', 'low', 'low', 'low', 'low', 'low', 'low', 'high', 'high', 'high']);
    expect(c.next(200)).toBe('low');                       // a new run starts after a gap
    // D's tripod: a blip on start, then one per whole second 10..1 (the first lands the next tick) — 11 emits
    const d = new CountdownPitch(10), t0 = 300;
    const emits = [t0, t0 + 1 / 60, ...Array.from({ length: 9 }, (_, i) => t0 + i + 1)];
    expect(emits.map((t) => d.next(t))).toEqual(['low', 'skip', 'low', 'low', 'low', 'low', 'low', 'low', 'high', 'high', 'high']);
  });
});

// P3r3 L6 / L7: one chime per voice memo, and no THREE "already non-indexed" warning storm on load.
const SRC = import.meta.glob(['/src/audio/index.ts', '/src/ui/index.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('audio ownership', () => {
  it('plays sfx_memo from exactly one place (E\'s memo action), not again on the memo bus event', () => {
    const audio = SRC['/src/audio/index.ts'], ui = SRC['/src/ui/index.ts'];
    expect(audio).toBeTruthy();
    expect(/bus\.on\(\s*'memo'/.test(audio)).toBe(false);
    expect(/onAction\('memo'[\s\S]{0,200}sfx_memo/.test(ui)).toBe(true);
  });
});
