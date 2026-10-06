// src/render/fx.ts — owner A. The transparent forward pass after the composite (ART §4.2 [4]): one FX scene per SceneId,
// 土地的烟 smoke ribbon along the walkable route (GDD §3.12, P3 wayfinding), and 3–6 ink "V" birds circling above the player
// (ART §5.2). FX materials write sRGB directly (the canvas holds the composite's sRGB bytes) and never write depth.
import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, Scene, ShaderMaterial, Vector3,
} from 'three';
import type { Rng } from '../contracts';
import type { SceneId } from '../types';
import { SURFACES } from '../core/planet';
import { hexToRgb } from './grade';

const FLAT_VERT = /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAT_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor, uOpacity); }`;

/** Flat colour FX material (one shared program for birds and lowfx blob shadows). `hex` is sRGB. */
export function flatFxMaterial(hex: string, opacity: number): ShaderMaterial {
  const [r, g, b] = hexToRgb(hex);
  return new ShaderMaterial({
    name: 'render:flatfx',
    uniforms: { uColor: { value: new Vector3(r, g, b) }, uOpacity: { value: opacity } },
    vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG,
    transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
  });
}

// ---------------------------------------------------------------- smoke
// P3 wayfinding: an ink incense thread along the WALKABLE route (lens: start beside the lens, arc up, follow the route
// ~2.4 m above the street, dip onto the target). Dark ink core + paper halo by day, a pale glow with a soft halo at
// night; never thinner than SMOKE_MIN_PX on screen (so it never shrinks to a dot seen end-on), forward-pointing
// chevrons drift toward the target, and it unfurls from the lens in SMOKE_GROW s whenever it (re)appears.
export const SMOKE_MIN_PX = 4;          // half-width floor in device pixels
export const SMOKE_MAX_PX = 11;         // half-width ceiling in device pixels
export const SMOKE_GROW = 0.45;         // seconds to unfurl the first SMOKE_GROW_LEN metres
const SMOKE_GROW_LEN = 60;
const SMOKE_VERT = /* glsl */ `
attribute float aSide;
attribute float aS;
attribute vec3 aTan;
attribute vec3 aUp;
uniform float uTime, uLen, uWidth, uPxK, uPxMax;
varying float vS, vSide;
void main() {
  float s = aS * uLen;
  vec3 side = normalize(cross(aTan, aUp));
  // pinned at the lens and calm near the camera (a sway 1 m away fills the frame), swaying gently further out
  float near = -(modelViewMatrix * vec4(position, 1.0)).z;
  float calm = smoothstep(0.0, 3.0, s) * smoothstep(2.0, 9.0, near);
  vec3 p = position + (side * sin(s * 0.45 - uTime * 1.3) * 0.22 + aUp * sin(s * 0.7 - uTime * 1.7) * 0.12) * calm;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = normalize((modelViewMatrix * vec4(aTan, 0.0)).xyz);
  vec3 bill = cross(tv, normalize(mv.xyz));
  bill = dot(bill, bill) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(bill);
  // a thread of SMOKE_MIN_PX..SMOKE_MAX_PX half-width on screen: never a dot far away, never a wall up close
  float z = max(0.05, -mv.z);
  float w = clamp(uWidth, uPxK * z, uPxK * uPxMax * z);
  mv.xyz += bill * aSide * w;
  gl_Position = projectionMatrix * mv;
  vS = s; vSide = aSide;
}`;
const SMOKE_FRAG = /* glsl */ `
uniform vec3 uCore, uHalo;
uniform float uTime, uOpacity, uLen, uGrow, uHaloA;
varying float vS, vSide;
void main() {
  float lead = uGrow;
  if (vS > lead) discard;
  float a = abs(vSide);
  // slow puffs travelling toward the target: the core swells and thins, the halo stays
  float puff = 0.5 + 0.5 * sin(vS * 1.6 - uTime * 3.2);
  float coreW = 0.34 + 0.16 * puff;
  if (vS > lead - 1.2) coreW *= (lead - vS) / 1.2;     // pointed leading tip while unfurling
  // forward-pointing chevrons (tip ahead of the edges), drifting toward the target
  float ch = fract(vS / 3.0 - uTime * 0.8 + 0.45 * a);
  bool mark = ch < 0.24 && a < coreW + 0.1;
  // P3r3 G11: fades in over the first 2.2 m (no hard black stroke at the lens), soft core and a halo that thins out
  // toward its edge — smoke, not a cable; the chevron gaps are wider so the drift toward the target reads
  float ends = smoothstep(0.0, 2.2, vS) * (1.0 - smoothstep(uLen - 2.5, uLen, vS));
  if (a > 0.98) discard;
  float coreK = (1.0 - smoothstep(coreW - 0.14, coreW + 0.04, a)) * (mark ? 0.12 : 1.0);
  float edge = 1.0 - smoothstep(0.5, 0.98, a);
  vec3 col = mix(uHalo, uCore, coreK);
  float al = mix(uHaloA * edge, 0.88, coreK);
  gl_FragColor = vec4(col, uOpacity * al * ends);
}`;

/** Smoke colours per palette: [core, halo, haloAlpha] (sRGB hex). Day/dusk/dawn: ink on paper; night: pale glow. */
export const SMOKE_DAY = { core: '#2b2522', halo: '#fff8e8', haloA: 0.72 } as const;   // P3r3 G11: 0.92 read as a cable
export const SMOKE_NIGHT = { core: '#fff6d6', halo: '#ffd98a', haloA: 0.45 } as const;

export class Smoke {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly geo = new BufferGeometry();
  private readonly segs = 160;
  private readonly pos: Float32Array;
  private readonly tan: Float32Array;
  private readonly up: Float32Array;
  private growT0 = -1;          // animT the unfurl started (−1: start at the next update)
  private lastEnd = new Vector3(1e9, 0, 0);
  private dense: Vector3[] = [];
  private cum: number[] = [];
  constructor() {
    const n = this.segs + 1;
    this.pos = new Float32Array(n * 2 * 3);
    this.tan = new Float32Array(n * 2 * 3);
    this.up = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2), s = new Float32Array(n * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      side[i * 2] = -1; side[i * 2 + 1] = 1;
      s[i * 2] = s[i * 2 + 1] = i / this.segs;
      if (i < this.segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const dyn = (arr: Float32Array, k: number) => new BufferAttribute(arr, k).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('aTan', dyn(this.tan, 3));
    this.geo.setAttribute('aUp', dyn(this.up, 3));
    this.geo.setAttribute('aSide', new BufferAttribute(side, 1));
    this.geo.setAttribute('aS', new BufferAttribute(s, 1));
    this.geo.setIndex(idx);
    this.mat = new ShaderMaterial({
      name: 'render:smoke',
      uniforms: {
        uCore: { value: new Vector3() }, uHalo: { value: new Vector3() }, uHaloA: { value: 1 }, uTime: { value: 0 },
        uOpacity: { value: 0.96 }, uLen: { value: 1 }, uWidth: { value: 0.12 }, uPxK: { value: 0.003 }, uPxMax: { value: SMOKE_MAX_PX / SMOKE_MIN_PX },
        uGrow: { value: 1e4 },
      },
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
    });
    this.setNight(0);
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'render:smoke';
    this.mesh.renderOrder = 10;
  }
  /** Legacy two-point path (render devtools): along the surface geodesic, lifted into a gentle arc. */
  setPath(scene: SceneId, from: Vector3, to: Vector3, t = -1): void {
    const s = SURFACES[scene], c = s.center;
    const a = _a.copy(from).sub(c), b = _b.copy(to).sub(c);
    const hA = a.length() - s.radius, hB = b.length() - s.radius;
    a.normalize(); b.normalize();
    const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    const pts: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      slerpDir(a, b, ang, t, _d);
      const h = hA + (hB + 1.2 - hA) * t + Math.sin(Math.PI * t) * Math.min(3, 0.08 * ang * s.radius);
      pts.push(_d.clone().multiplyScalar(s.radius + h).add(c));
    }
    this.setPoints(scene, pts, t);
  }
  /** Rebuild through world points (Catmull-Rom, resampled evenly by length). `t` = animT now (the unfurl starts
   *  then, not at the next rendered frame). */
  setPoints(scene: SceneId, pts: readonly Vector3[], t = -1): void {
    if (pts.length < 2) { this.hide(); return; }
    const c = SURFACES[scene].center;
    // dense Catmull-Rom samples
    const dense = this.dense, cum = this.cum;
    let nd = 0;
    const put = (v: Vector3) => { (dense[nd] ??= new Vector3()).copy(v); nd++; };
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const k = Math.max(2, Math.min(24, Math.ceil(p1.distanceTo(p2) / 0.5)));
      for (let j = 0; j < k; j++) put(catmull(p0, p1, p2, p3, j / k, _p));
    }
    put(pts[pts.length - 1]);
    cum.length = nd; cum[0] = 0;
    for (let i = 1; i < nd; i++) cum[i] = cum[i - 1] + dense[i].distanceTo(dense[i - 1]);
    const len = Math.max(0.5, cum[nd - 1]);
    const n = this.segs;
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const target = (i / n) * len;
      while (j < nd - 2 && cum[j + 1] < target) j++;
      const span = Math.max(1e-6, cum[j + 1] - cum[j]);
      const t = Math.min(1, Math.max(0, (target - cum[j]) / span));
      _p.copy(dense[j]).lerp(dense[j + 1], t);
      _tn.copy(dense[j + 1]).sub(dense[j]);
      _d.copy(_p).sub(c).normalize();
      if (_tn.lengthSq() < 1e-12) _tn.set(1, 0, 0);
      _tn.normalize();
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        this.pos[o] = _p.x; this.pos[o + 1] = _p.y; this.pos[o + 2] = _p.z;
        this.tan[o] = _tn.x; this.tan[o + 1] = _tn.y; this.tan[o + 2] = _tn.z;
        this.up[o] = _d.x; this.up[o + 1] = _d.y; this.up[o + 2] = _d.z;
      }
    }
    for (const k of ['position', 'aTan', 'aUp']) this.geo.getAttribute(k).needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.mat.uniforms.uLen.value = len;
    // unfurl again when it (re)appears or now leads somewhere else
    const end = pts[pts.length - 1];
    if (!this.mesh.visible || end.distanceTo(this.lastEnd) > 2) this.growT0 = t;
    this.lastEnd.copy(end);
    this.mesh.visible = true;
  }
  hide(): void { this.mesh.visible = false; }
  private night: boolean | null = null;
  setNight(k: number): void {
    if (this.night === k > 0.5) return;
    this.night = k > 0.5;
    const u = this.mat.uniforms, pal = this.night ? SMOKE_NIGHT : SMOKE_DAY;
    const [r, g, b] = hexToRgb(pal.core), [hr, hg, hb] = hexToRgb(pal.halo);
    (u.uCore.value as Vector3).set(r, g, b); (u.uHalo.value as Vector3).set(hr, hg, hb);
    u.uHaloA.value = pal.haloA;
  }
  /** t = animT; night = palette night factor; pxK = view-space metres per device pixel per metre of depth. */
  update(t: number, night = 0, pxK = 0): void {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    if (this.growT0 < 0) this.growT0 = t;
    const g = Math.min(1, Math.max(0, (t - this.growT0) / SMOKE_GROW));
    u.uGrow.value = g >= 1 ? 1e4 : 0.3 + (1 - (1 - g) * (1 - g)) * SMOKE_GROW_LEN;
    if (pxK > 0) u.uPxK.value = pxK * SMOKE_MIN_PX;
    this.setNight(night);
  }
}
const _a = new Vector3(), _b = new Vector3(), _d = new Vector3(), _p = new Vector3(), _tn = new Vector3();
function catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3): Vector3 {
  const t2 = t * t, t3 = t2 * t;
  const f0 = -0.5 * t3 + t2 - 0.5 * t, f1 = 1.5 * t3 - 2.5 * t2 + 1, f2 = -1.5 * t3 + 2 * t2 + 0.5 * t, f3 = 0.5 * t3 - 0.5 * t2;
  return out.set(
    p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3,
    p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3,
    p0.z * f0 + p1.z * f1 + p2.z * f2 + p3.z * f3,
  );
}
function slerpDir(a: Vector3, b: Vector3, ang: number, t: number, out: Vector3): Vector3 {
  if (ang < 1e-6) return out.copy(a).lerp(b, t).normalize();   // interiors (R = 5000) and tiny spans: plain lerp
  const s = Math.sin(ang);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * ang) / s).addScaledVector(b, Math.sin(t * ang) / s);
}

// ---------------------------------------------------------------- birds
interface Bird { radius: number; height: number; speed: number; phase: number; flap: number; span: number }

export class Birds {
  readonly mesh: Mesh;
  private readonly birds: Bird[];
  private readonly pos: Float32Array;
  private readonly geo = new BufferGeometry();
  constructor(rng: Rng) {
    const n = rng.int(4, 6);
    this.birds = Array.from({ length: n }, () => ({
      // "high above the player" (ART §5.2): ≥ 26° above a level gameplay frame's 25° top edge even from the camera
      // 3.6 m behind, so they never land in the GDD §19.4 top-10 %-rows sky checks; seen when looking up / in the lens
      radius: rng.range(20, 30), height: rng.range(20, 27), speed: rng.range(0.05, 0.09) * (rng.next() < 0.5 ? -1 : 1),
      phase: rng.range(0, Math.PI * 2), flap: rng.range(2.4, 3.4), span: rng.range(0.5, 0.7),
    }));
    this.pos = new Float32Array(n * 4 * 3 * 3);           // 4 triangles per bird
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.mesh = new Mesh(this.geo, flatFxMaterial('#2f3a3f', 1));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'render:birds';
  }
  /** Circle above `center` in its local frame (up, north, east); animT drives wings and orbit. */
  update(t: number, center: Vector3, up: Vector3, north: Vector3, east: Vector3): void {
    let o = 0;
    const pos = this.pos;
    for (const b of this.birds) {
      const ang = b.phase + t * b.speed;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      _bc.copy(center).addScaledVector(up, b.height + Math.sin(t * 0.4 + b.phase) * 1.5)
        .addScaledVector(north, ca * b.radius).addScaledVector(east, sa * b.radius);
      _bf.copy(north).multiplyScalar(-sa).addScaledVector(east, ca).multiplyScalar(Math.sign(b.speed));   // tangent
      _br.crossVectors(_bf, up).normalize();
      const fl = Math.sin(t * b.flap * Math.PI * 2 * 0.5 + b.phase) * 0.55;
      for (let side = -1; side <= 1; side += 2) {           // no per-frame arrays/closures (ARCH §5.1)
        _bw.copy(_br).multiplyScalar(side * Math.cos(fl)).addScaledVector(up, Math.sin(fl) + 0.25);
        _r0.copy(_bc).addScaledVector(_bf, 0.08);
        _r1.copy(_bc).addScaledVector(_bf, -0.1);
        _el.copy(_bc).addScaledVector(_bw, b.span * 0.5).addScaledVector(up, 0.06).addScaledVector(_bf, 0.02);
        _tp.copy(_bc).addScaledVector(_bw, b.span).addScaledVector(_bf, -0.14);
        o = put3(pos, o, _r0); o = put3(pos, o, _r1); o = put3(pos, o, _el);
        o = put3(pos, o, _el); o = put3(pos, o, _r1); o = put3(pos, o, _tp);
      }
    }
    this.geo.getAttribute('position').needsUpdate = true;
  }
}
function put3(a: Float32Array, o: number, v: Vector3): number { a[o] = v.x; a[o + 1] = v.y; a[o + 2] = v.z; return o + 3; }
const _bc = new Vector3(), _bf = new Vector3(), _br = new Vector3(), _bw = new Vector3();
const _r0 = new Vector3(), _r1 = new Vector3(), _el = new Vector3(), _tp = new Vector3();

export function createFxScenes(): Record<SceneId, Scene> {
  const mk = (n: string) => { const s = new Scene(); s.name = `fx:${n}`; return s; };
  return { planet: mk('planet'), studio_int: mk('studio_int'), subway_int: mk('subway_int') };
}
