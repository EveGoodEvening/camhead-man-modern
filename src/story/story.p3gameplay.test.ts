// P3 gameplay fixes through the real core + story (fake E/D): G1 darkroom range/timeout, G2 chapter guards, G4 phase
// guards and the in-flight interact guard, G6 exit anchors, G7 zhimei's own photo after P9.
import { describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './testHarness';
import { DARKROOM_TIMEOUT } from './beats';
import { inDarkroomReach } from '../lens/extras';
import { TARGETS } from '../data/photoTargets';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const NIGHT = ['P6_lighthouse_1987', 'P7_line_zero', 'P8_chai_to_zhe', 'P9_paper_eye'] as const;
async function darkroomReady(): Promise<Harness> {
  const h = await createHarness({ chapter: 'ch3' });
  for (const p of NIGHT) h.story.solve(p);
  await h.settle();
  h.core.store.set('dk_hung');
  return h;
}
const studio = (h: Harness, x: number, z: number, yawDeg: number) =>
  h.core.player.teleport({ scene: 'studio_int', at: { x, y: 0, z }, yawDeg, pitchDeg: 0 });

describe('G1 S_darkroom: one range test, never a hung cutscene', () => {
  it('inDarkroomReach: darkroom side of the partition and ≤ 4 m of the line', () => {
    const line = { x: 3.3, z: -0.5 };
    expect(inDarkroomReach({ x: -0.74, z: -0.5 }, line)).toBe(false);        // the front room, 4.04 m
    expect(inDarkroomReach({ x: -0.68, z: -0.5 }, line)).toBe(false);        // 3.98 m but behind the partition
    expect(inDarkroomReach({ x: 1.6, z: -0.5 }, line)).toBe(true);
    expect(inDarkroomReach({ x: 3.3, z: 3.4 }, line)).toBe(true);
    expect(inDarkroomReach({ x: 3.3, z: 3.6 }, line)).toBe(false);
  });
  it('the beat does not start from the front room; it does from the darkroom', async () => {
    const h = await darkroomReady();
    studio(h, -0.68, -0.5, 270);
    h.core.services.lens.setViewfinder(true);
    h.step(3); await flush();
    expect(h.story.currentBeat()).toBeNull();
    studio(h, 2.0, -0.5, 90);
    h.core.services.lens.setViewfinder(true);
    h.step(3); await flush();
    expect(h.story.currentBeat()).toBe('S_darkroom');
    await h.settle();
    expect(h.has('developed')).toBe(true);
  });
  it('a reveal that never resolves times out: the print develops and the game goes on', async () => {
    const h = await darkroomReady();
    const lens = h.core.services.lens as { darkroomReveal: () => Promise<void> };
    lens.darkroomReveal = () => new Promise<void>(() => {});
    studio(h, 2.0, -0.5, 90);
    h.core.services.lens.setViewfinder(true);
    h.step(3); await flush();
    expect(h.story.currentBeat()).toBe('S_darkroom');
    const t0 = h.core.clock.t;
    for (let i = 0; i < 200 && !h.has('developed'); i++) { h.step(10); await flush(); }
    expect(h.has('developed')).toBe(true);
    expect(h.core.clock.t - t0).toBeGreaterThanOrEqual(DARKROOM_TIMEOUT - 0.2);
    expect(h.core.store.state.photos.some((p) => p.preset === 'ph_2023_stitched')).toBe(true);
  });
});

describe('G2 chapter guards (GDD §10.2 note: #5–#15 need ch1_started)', () => {
  it('the ch1 photo targets require ch1_started; P1 can no longer fire once 第二章 began', () => {
    for (const id of ['T_granny_face', 'T_locker17', 'T_studio_qr'] as const) {
      expect(TARGETS.find((t) => t.id === id)!.requires, id).toContain('ch1_started');
    }
    expect(TARGETS.find((t) => t.id === 'T_rephoto_2006')!.excludes).toContain('ch2_started');
  });
  it('prologue: the gate is under maintenance and P3_done alone does not start 第二章', async () => {
    const h = await createHarness({ start: 'skip' });
    await h.settle();
    expect(h.core.store.state.chapter).toBe('prologue');
    h.goto('sp_estate_gate');
    await h.interact('it_estate_gate');
    await h.settle();
    expect(h.rec.toasts).toContain('sys.gate_maint');
    expect(h.rec.nodes).not.toContain('gate.prompt');
    h.core.store.set('P3_done');
    h.goto('sp_estate_gate_inner');
    h.step(5); await h.settle();
    expect(h.has('ch2_started')).toBe(false);
    expect(h.core.store.state.chapter).toBe('prologue');
  });
});

describe('G4 phase guards', () => {
  it('ch2 dusk: the lighthouse keypad is dark (no keypad)', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    await h.settle();
    h.goto('sp_lighthouse_door');
    await h.interact('it_lh_door');
    await h.settle();
    expect(h.rec.toasts).toContain('sys.lh_dusk');
    expect(h.rec.ui).not.toContain('keypad_lighthouse');
  });
  it('ch3: a second E on the switch during its 2 s wait does nothing', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    await h.settle();
    h.core.store.set('lighthouse_open');
    h.goto('sp_lighthouse_door');
    await h.core.services.lens.enterPeek('lh_door');
    await h.interact('it_lh_switch');
    h.step(30);
    await h.interact('it_lh_switch');
    for (let i = 0; i < 30 && !h.has('frame_3'); i++) { h.step(10); await flush(); }
    expect(h.has('frame_3')).toBe(true);
    expect(h.rec.toasts.filter((x) => x === 'sys.lh_switch')).toHaveLength(1);
  });
  it('dawn: the subway gate is chained again', async () => {
    const h = await createHarness({ chapter: 'finale' });
    await h.settle();
    h.goto('sp_subway_entry');
    await h.interact('it_subway_gate');
    await h.settle();
    expect(h.core.player.scene).toBe('planet');
    expect(h.rec.nodes).toContain('it.subway_gate');
  });
});

describe('G6 exits are picked at the way out', () => {
  it('studio: facing the roller shutter near it shows the exit; the arrival spot does not', async () => {
    const h = await createHarness({ chapter: 'ch2' });
    await h.settle();
    studio(h, 0.3, 5.6, 180);
    h.step(1);
    expect(h.core.interact.current()?.id).toBe('it_st_exit');
    studio(h, 0, 2.4, 0);
    h.step(1);
    expect(h.core.interact.current()?.id).not.toBe('it_st_exit');
  });
  it('subway: walking back to the stairs shows the exit', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    await h.settle();
    h.core.player.teleport({ scene: 'subway_int', at: { x: -9, y: 0, z: 0.3 }, yawDeg: 270, pitchDeg: 0 });
    h.step(1);
    expect(h.core.interact.current()?.id).toBe('it_sw_exit');
  });
});

describe('G7 zhimei and her own sea photo after P9', () => {
  it('no 「不是这张」 fallback once frame ② is given', async () => {
    const h = await createHarness({ chapter: 'ch3' });
    await h.settle();
    h.story.solve('P9_paper_eye');
    await h.settle();
    const [p] = h.shoot('T_zhimei_sea');
    await h.show('zhimei', [p.id]);
    expect(h.rec.shows.at(-1)).toBe('zhimei.after');
  });
});
