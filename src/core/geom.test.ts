import { describe, expect, it } from 'vitest';
import { BoxGeometry, IcosahedronGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { contactBand, labelOfHit, mergePainted, paint } from './geom';

describe('geom', () => {
  it('paint writes color + aSurfaceId; mergePainted normalises inputs and builds triLabels', () => {
    const a = paint(new BoxGeometry(1, 1, 1), '#ff0000', 3, 'qilou');       // indexed, 12 tris
    const b = paint(new IcosahedronGeometry(1, 0), '#00ff00', 4);             // non-indexed, 20 tris
    const c = paint(new PlaneGeometry(1, 1).translate(5, 0, 0), '#0000ff', 5, 'window');
    const m = mergePainted([a, b, c]);
    expect(m.index).toBeNull();
    expect(m.getAttribute('position').count).toBe((12 + 20 + 2) * 3);
    expect(m.getAttribute('uv')).toBeDefined();                               // all three have uv
    expect(m.getAttribute('aSurfaceId').getX(0)).toBe(3);
    const tri = m.userData.triLabels as Uint16Array;
    expect(m.userData.labelTable).toEqual(['qilou', 'window']);
    expect(tri[0]).toBe(0); expect(tri[12]).toBe(0xffff); expect(tri[33]).toBe(1);
  });
  it('drops uv unless every input has it', () => {
    const a = paint(new BoxGeometry(1, 1, 1), '#ffffff', 1);
    const b = paint(new BoxGeometry(1, 1, 1), '#ffffff', 1);
    b.deleteAttribute('uv');
    expect(mergePainted([a, b]).getAttribute('uv')).toBeUndefined();
  });
  it('labelOfHit reads the per-triangle label', () => {
    const m = mergePainted([paint(new PlaneGeometry(2, 2), '#ffffff', 1, 'road'), paint(new PlaneGeometry(2, 2).translate(5, 0, 0), '#ffffff', 1)]);
    const mesh = new Mesh(m, new MeshBasicMaterial());
    const rc = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const hits = rc.intersectObject(mesh);
    expect(labelOfHit(hits[0])).toBe('road');
    const rc2 = new Raycaster(new Vector3(5, 0, 5), new Vector3(0, 0, -1));
    expect(labelOfHit(rc2.intersectObject(mesh)[0])).toBeNull();
  });
  it('contactBand darkens only the bottom band', () => {
    const g = paint(new BoxGeometry(1, 2, 1), '#ffffff', 1);
    contactBand(g, 0.3, 0.5);
    const col = g.getAttribute('color'), pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(col.getX(i)).toBeCloseTo(pos.getY(i) < -0.7 ? 0.5 : 1, 6);
  });
});
