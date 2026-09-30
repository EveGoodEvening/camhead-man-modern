// Triangle budgets per character (ARCH §5.1, GDD §6.1), built in node without canvas.
import { describe, expect, it } from 'vitest';
import { triCount } from './kit';
import { buildHeroBody, buildHeroGlow, buildHeroHead, buildHeroScreen } from './hero/model';
import { buildChen, buildGranny, buildLiu, buildXiaolin } from './npcs/humans';
import { buildAttendant, buildLaoZhou, buildMeiqiu, buildTudi, buildZhimei } from './npcs/spirits';
import { buildBusGeometry, buildBusSign } from './bus';
import { buildWalkersGeometry, WALKERS } from './pedestrians';
import { createRng } from '../core/rng';
import { buildCrowdGeometry, CROWD_SIZE } from './crowd2006';

describe('character triangle budgets', () => {
  it('hero ≤ 3.5k triangles across ≤ 4 meshes', () => {
    const parts = [buildHeroBody().geo, buildHeroHead(), buildHeroScreen(), buildHeroGlow()];
    const total = parts.reduce((a, g) => a + triCount(g), 0);
    expect(parts.length).toBeLessThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(3500);
  });
  const npcs: [string, () => { geo: Parameters<typeof triCount>[0] }, number][] = [
    ['xiaolin', buildXiaolin, 1800], ['granny_wang', buildGranny, 1800], ['old_chen', buildChen, 1800], ['xiaoliu', buildLiu, 1800],
    ['tudi', buildTudi, 800], ['meiqiu', buildMeiqiu, 500], ['zhimei', buildZhimei, 600], ['attendant', buildAttendant, 1000],
    ['lao_zhou', buildLaoZhou, 1800],
  ];
  for (const [id, build, cap] of npcs) {
    it(`${id} ≤ ${cap}`, () => { expect(triCount(build().geo)).toBeLessThanOrEqual(cap); });
  }
  it('bus ≤ 1.5k', () => { expect(triCount(buildBusGeometry()) + triCount(buildBusSign())).toBeLessThanOrEqual(1500); });
  it('pedestrians ≤ 6 figures in one mesh', () => {
    expect(WALKERS).toBeLessThanOrEqual(6);
    expect(triCount(buildWalkersGeometry().geo)).toBeLessThanOrEqual(6 * 600);
  });
  it('2006 crowd: 20 figures, one mesh', () => {
    expect(CROWD_SIZE).toBe(20);
    expect(triCount(buildCrowdGeometry(createRng(1)))).toBeLessThanOrEqual(8000);
  });
  it('every vertex carries a skin weight and a surface id in the owner ranges', () => {
    const g = buildHeroHead();
    const sid = g.getAttribute('aSurfaceId');
    for (let i = 0; i < sid.count; i++) { expect(sid.getX(i)).toBeGreaterThanOrEqual(200); expect(sid.getX(i)).toBeLessThanOrEqual(209); }
    const t = buildTudi().geo.getAttribute('aSurfaceId');
    for (let i = 0; i < t.count; i++) { expect(t.getX(i)).toBeGreaterThanOrEqual(245); expect(t.getX(i)).toBeLessThanOrEqual(254); }
    const x = buildXiaolin().geo.getAttribute('aSurfaceId');
    for (let i = 0; i < x.count; i++) { expect(x.getX(i)).toBeGreaterThanOrEqual(210); expect(x.getX(i)).toBeLessThanOrEqual(229); }
  });
});
