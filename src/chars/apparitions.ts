// src/chars/apparitions.ts — owner C. Small 怪 that are not actors (GDD §14, ART §7.4): the second shadow under the
// bridge (WORLD, ink decal, no caster, edge boils at 8 fps), the queue shadows at the bus stop (GHOST, night), the
// manhole eye (GHOST, dusk/night), and the six bestiary silhouettes for the finale photo (PHOTO_ONLY, 6/6).
import { BufferGeometry, Float32BufferAttribute, type BufferAttribute, type Material, type Object3D } from 'three';
import type { Core } from '../contracts';
import type { ChartPos } from '../types';
import { PAL } from '../art/palette';
import { LAYER, setLayerDeep } from '../core/layers';
import { chartToFlat, flatDirToHeading, placeAt, placeMatrix } from '../core/planet';
import { Kit, P, xf } from './kit';
import { makeRig, rigidMesh, type Rig } from './rig';

// P3r2 look L8: the daytime second shadow is plain environment ink (id < 240): with the spirit id 245 the street around
// it drew a cinnabar outline, which read as the hero's own red shadow and gave the secret away before the flash photo
const SID = { shadow: 245, second: 196, ink: 252, paper: 248, red: 249, dark: 250, screen: 253 } as const;

// ------------------------------------------------------------------------------------------------ second shadow
/** Outline of a long cast human shadow in ground space (x = side, y = along the shadow), fanned from (0, 0.8). */
const SHADOW_OUTLINE: readonly (readonly [number, number])[] = [
  [0.13, 0], [0.19, 0.28], [0.21, 0.58], [0.3, 0.78], [0.33, 1.08], [0.25, 1.12], [0.21, 1.27], [0.12, 1.36], [0.16, 1.46],
  [0.14, 1.63], [0.06, 1.71], [-0.06, 1.71], [-0.14, 1.63], [-0.16, 1.46], [-0.12, 1.36], [-0.21, 1.27], [-0.25, 1.12],
  [-0.33, 1.08], [-0.3, 0.78], [-0.21, 0.58], [-0.19, 0.28], [-0.13, 0], [-0.03, 0.03], [0.03, 0.03],
];
const STRETCH = 1.35;
function fan(): BufferGeometry {
  const n = SHADOW_OUTLINE.length, pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = SHADOW_OUTLINE[i], b = SHADOW_OUTLINE[(i + 1) % n];
    pos.push(0, 0, 0.8 * STRETCH, b[0], 0, b[1] * STRETCH, a[0], 0, a[1] * STRETCH);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

export class SecondShadow {
  readonly rig: Rig;
  private readonly base: Float32Array;
  private frame = -1;
  constructor(mat: Material) {
    const kit = new Kit();
    kit.add(fan(), PAL.inkDeep, SID.second, 0);
    this.rig = rigidMesh(kit.build(), mat, { center: [0, 0, 1], radius: 1.6 });
    this.rig.mesh.castShadow = false; this.rig.mesh.receiveShadow = false;
    this.rig.mesh.name = 'ghost_shadow';
    this.base = Float32Array.from((this.rig.mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array);
  }
  /** GDD §14 ①: beside the four real pillar shadows under the deck; 2 cm above the ground, no caster. */
  place(core: Core, at: ChartPos = { r: 32.2, lon: 30.9, h: 0.02 }, heading = 205): void {
    core.scenes.get('planet').add(this.rig.mesh);
    placeAt(this.rig.mesh, 'planet', at, heading);
    this.rig.mesh.updateMatrixWorld(true);
  }
  /** Edge boil at 8 fps (ART §7.4): outline points jitter; the fan centre stays. */
  update(animT: number): void {
    const f = Math.floor(animT * 8);
    if (f === this.frame) return;
    this.frame = f;
    const a = this.rig.mesh.geometry.getAttribute('position') as BufferAttribute;
    const arr = a.array as Float32Array;
    for (let v = 0; v < a.count; v++) {
      if (v % 3 === 0) continue;
      const bx = this.base[v * 3], bz = this.base[v * 3 + 2];
      const h = Math.sin(bx * 91.7 + bz * 47.3 + f * 12.9898) * 43758.5453;
      const j = (h - Math.floor(h) - 0.5) * 0.045;
      arr[v * 3] = bx + j; arr[v * 3 + 2] = bz + j * 0.6;
    }
    a.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------------ silhouettes
function person(h: number, w = 1): readonly (readonly [number, number])[] {
  const k = h / 1.7;
  return [
    [0.12, 0], [0.16, 0.8], [0.2, 0.85], [0.24 * w, 1.35], [0.13, 1.42], [0.06, 1.44], [0.1, 1.5], [0.11, 1.62], [0.05, 1.7],
    [-0.05, 1.7], [-0.11, 1.62], [-0.1, 1.5], [-0.06, 1.44], [-0.13, 1.42], [-0.24 * w, 1.35], [-0.2, 0.85], [-0.16, 0.8], [-0.12, 0],
  ].map(([x, y]) => [x * k, y * k] as const);
}

/** Queue of three shadows waiting for the last bus (GHOST, night; GDD §14 ③). */
export function buildQueue(mat: Material): Object3D {
  const kit = new Kit();
  for (let i = 0; i < 3; i++) {
    const m = placeMatrix('planet', { r: 39.1, lon: 356.2 - i * 1.25, h: 0 }, 90);
    kit.add(P.card(person(1.62 + i * 0.07, 1 + i * 0.1), 0.03), PAL.inkDeep, SID.ink, 0, m);
  }
  const r = rigidMesh(kit.build(), mat, { center: [0, 0, 0], radius: 200 });
  r.mesh.frustumCulled = false; r.mesh.castShadow = false; r.mesh.name = 'queue_shadows';
  setLayerDeep(r.mesh, LAYER.GHOST);
  return r.mesh;
}

/** The manhole that opens an eye (GHOST, dusk/night; GDD §14 ②). Bones: root, iris, lid. */
export class ManholeEye {
  readonly rig: Rig;
  constructor(mat: Material) {
    const kit = new Kit();
    const almond = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return [0.3 * Math.cos(a), 0.15 * Math.sin(a) * (1 - 0.3 * Math.cos(a) ** 2)] as const; });
    kit.add(P.card(almond, 0.006).rotateX(-Math.PI / 2), PAL.spiritPaper, SID.paper, 1, xf([0, 0.006, 0]));
    kit.add(P.disc(0.1, 12).rotateX(-Math.PI / 2), PAL.bannerRed, SID.red, 2, xf([0, 0.011, 0]));
    kit.add(P.disc(0.05, 10).rotateX(-Math.PI / 2), PAL.inkDeep, SID.dark, 2, xf([0, 0.013, 0]));
    kit.add(P.disc(0.018, 6).rotateX(-Math.PI / 2), PAL.spiritPaper, SID.paper, 2, xf([-0.03, 0.015, -0.03]));
    this.rig = makeRig([
      { name: 'root', parent: null, at: [0, 0, 0] }, { name: 'lid', parent: 'root', at: [0, 0, 0] }, { name: 'iris', parent: 'lid', at: [0, 0.01, 0] },
    ], kit.build(), mat, { center: [0, 0, 0], radius: 0.4 });
    this.rig.mesh.castShadow = false; this.rig.mesh.name = 'manhole_eye';
    setLayerDeep(this.rig.mesh, LAYER.GHOST);
  }
  place(core: Core, at: ChartPos = { r: 31.5, lon: 64, h: 0.02 }): void {
    core.scenes.get('planet').add(this.rig.mesh);
    placeAt(this.rig.mesh, 'planet', at, 20);
  }
  update(animT: number): void {
    const b = this.rig.b;
    const blink = animT % 5.2 < 0.25 ? 0.12 : 1;
    b.lid.scale.set(1, 1, blink);
    b.iris.position.set(0.09 * Math.sin(animT * 0.6), 0.01, 0.03 * Math.sin(animT * 0.9));
  }
}

/** Six bestiary silhouettes around g2 for the dawn group photo (PHOTO_ONLY, only at 6/6; GDD §14 reward). */
export function buildBestiarySilhouettes(mat: Material): Object3D {
  const kit = new Kit();
  const cam = chartToFlat({ r: 47.2, lon: 23 });
  const face = (r: number, lon: number) => { const f = chartToFlat({ r, lon }); return flatDirToHeading(f.x, f.z, cam.x - f.x, cam.z - f.z); };
  const at = (r: number, lon: number, h: number) => placeMatrix('planet', { r, lon, h }, face(r, lon));
  const hStair = (lon: number) => Math.max(0, 0.393 * (lon - 16));
  // P3r2 (camera): g2 is the front row's right end now (r 43.0, lon 27.1, on the pavement); the others gather round it
  kit.add(P.card(person(1.7), 0.03), PAL.inkDeep, SID.ink, 0, at(43.0, 27.1, 0));                                   // ① second shadow at g2
  kit.add(P.card(person(1.55, 1.1), 0.03), PAL.inkDeep, SID.ink, 0, at(42.5, 28.0, 0));                             // ③ queue shadows
  kit.add(P.card(person(1.6, 0.9), 0.03), PAL.inkDeep, SID.ink, 0, at(42.4, 28.9, 0));
  const eye = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [0.32 * Math.cos(a), 0.32 * Math.sin(a)] as const; });
  kit.add(P.card(eye, 0.03), PAL.inkDeep, SID.ink, 0, at(44.2, 19.6, 0).multiply(xf([0, 0.35, 0])));               // ② manhole eye
  kit.add(P.disc(0.12, 10), PAL.spiritPaper, SID.paper, 0, at(44.2, 19.6, 0).multiply(xf([0, 0.35, 0.02])));
  kit.add(P.disc(0.06, 8), PAL.bannerRed, SID.red, 0, at(44.2, 19.6, 0).multiply(xf([0, 0.35, 0.03])));
  const lion = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2, r = i % 2 ? 0.3 : 0.36; return [r * Math.cos(a), 0.36 + r * Math.sin(a)] as const; });
  kit.add(P.card(lion, 0.04), PAL.inkDeep, SID.ink, 0, at(42.3, 17.75, hStair(17.75) + 0.95));                     // ④ lion head on a post
  kit.add(P.box(0.55, 0.42, 0.34, 0.03, 1), PAL.inkDeep, SID.ink, 0, at(43.7, 28.2, 0).multiply(xf([0, 0.21, 0])));  // ⑤ TV
  kit.add(P.cube(0.4, 0.28, 0.02), PAL.skyBlue, SID.screen, 0, at(43.7, 28.2, 0).multiply(xf([0, 0.22, 0.17])));
  const fish = [[0.3, 0], [0.12, 0.12], [-0.12, 0.1], [-0.25, 0.02], [-0.38, 0.14], [-0.34, 0], [-0.38, -0.14], [-0.25, -0.02], [-0.12, -0.1], [0.12, -0.12]] as const;
  kit.add(P.card(fish, 0.03), PAL.inkDeep, SID.ink, 0, at(42.0, 26.0, hStair(26.0) + 0.3));                         // ⑥ the watching fish
  kit.add(P.disc(0.03, 6), PAL.spiritPaper, SID.paper, 0, at(42.0, 26.0, hStair(26.0) + 0.3).multiply(xf([0.18, 0.02, 0.02])));
  const r = rigidMesh(kit.build(), mat, { center: [0, 0, 0], radius: 200 });
  r.mesh.frustumCulled = false; r.mesh.castShadow = false; r.mesh.name = 'bestiary_silhouettes';
  setLayerDeep(r.mesh, LAYER.PHOTO_ONLY);
  return r.mesh;
}
