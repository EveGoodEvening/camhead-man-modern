// src/render/materials.ts — owner A. ART §3.3–§3.4: the one toon material factory for every main-pass (MRT) mesh.
// MeshToonMaterial + onBeforeCompile: two hard bands (HSV shade), mottling, world-anchored line breaks/weights,
// GDD §10.4 night bands, lamp pools, flash, uncanny grade; writes MRT location 1 (gInfo) — never skip the factory.
import {
  FrontSide, MeshToonMaterial, Vector3, Vector4, type IUniform, type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';
import type { MakeToonMaterial, ToonOpts } from '../contracts';
import { noiseTexture } from './noise';

/** Shared uniform holders referenced by every toon material: one update per frame drives them all (ART §3.3). */
export const shared = {
  uPlanetCenter: { value: new Vector3() },
  uSunPole: { value: new Vector3(0, 1, 0) },
  uSunAtPole: { value: new Vector3(0.55, 0.8, 0.25).normalize() },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uUncanny: { value: 0 },          // holds the SHIFTED grade weight uUncW (ART §2.3), not the raw uUncanny
  uLamps: { value: Array.from({ length: 8 }, () => new Vector4()) },
  uFlash: { value: new Vector4() }, // captures only (GDD §3.7)
  tNoise: { value: null as Texture | null },
  // P3-look (L1): follow-camera see-through. xyz = the hero's torso in VIEW space, w = cone radius (m) at that depth
  // (0 = off: captures, overrides, viewfinder). Anything in the camera→hero cone and ≥ 0.6 m in front of him, and
  // anything within ~0.45 m of the lens, is screen-door faded and written with surface id 255 (the composite draws no
  // ink next to id 255, so the dither pattern never speckles).
  uSeeThru: { value: new Vector4(0, 0, 0, 0) },
};

const HSV = /* glsl */ `vec3 cmToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
  vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-5)), d / (q.x + 1e-5), q.x);
}
vec3 cmToRgb(vec3 h) {
  vec3 p = abs(fract(h.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return h.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), h.y);
}`;

const VERT_COMMON = /* glsl */ `#include <common>
attribute float aSurfaceId;
uniform float uSurfaceId;
uniform vec3 uPlanetCenter;
uniform vec3 uSunPole;
uniform vec3 uSunAtPole;
varying float vSurfaceId;
varying vec3 vWorldPos;
varying vec3 vSunView;
#ifndef USE_MAP
uniform vec3 diffuse;
varying vec3 vAlbS;                  // lit band (sRGB), per vertex: flat-painted parts are constant per part
varying vec3 vShdS;                  // shade band, ART §3.1 HSV formula
vec3 cmOETF(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
${HSV}
#endif
vec3 cmRotateBetween(vec3 v, vec3 a, vec3 b) {
  vec3 k = cross(a, b);
  float c = dot(a, b), s2 = dot(k, k);
  if (s2 < 1e-6) return v;
  return v * c + cross(k, v) + k * (dot(k, v) * (1.0 - c) / s2);
}`;

const VERT_MAIN = /* glsl */ `#include <project_vertex>
vec4 cmW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  cmW = batchingMatrix * cmW;
#endif
#ifdef USE_INSTANCING
  cmW = instanceMatrix * cmW;
#endif
cmW = modelMatrix * cmW;
vWorldPos = cmW.xyz;
vec3 cmUp = normalize(cmW.xyz - uPlanetCenter);
vSunView = normalize((viewMatrix * vec4(cmRotateBetween(uSunAtPole, uSunPole, cmUp), 0.0)).xyz);
vSurfaceId = aSurfaceId > 0.5 ? aSurfaceId : uSurfaceId;
#ifndef USE_MAP
  vec3 cmLin = diffuse;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    cmLin *= vColor.rgb;
  #endif
  vAlbS = cmOETF(cmLin);
  vec3 cmHsv = cmToHsv(vAlbS);
  vShdS = cmToRgb(vec3(fract(cmHsv.x - 0.025), min(1.0, cmHsv.y * 1.08), cmHsv.z * 0.74));
#endif`;

const FRAG_COMMON = /* glsl */ `#include <common>
layout(location = 1) out highp vec4 gInfo;
uniform sampler2D tNoise;
uniform float uLineWeight, uUnlit, uSpiritImmune, uFlecks, uNight, uUncanny, uRim, uFade;
uniform vec3 uPlanetCenter;                  // also declared in the vertex stage (same type/precision)
uniform vec4 uLamps[8];
uniform vec4 uFlash;
uniform vec4 uSeeThru;
varying float vSurfaceId;
varying vec3 vWorldPos;
varying vec3 vSunView;
#ifdef USE_MAP
${HSV}
#else
varying vec3 vAlbS;
varying vec3 vShdS;
#endif
float cmBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float cmBayer4(vec2 a) { return cmBayer2(0.5 * a) * 0.25 + cmBayer2(a); }
vec2 cmOct(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
vec4 cmNoise(vec3 p, vec3 nW) {
  vec3 a = abs(nW);
  vec2 uv = (a.x > a.y && a.x > a.z) ? p.zy : (a.y > a.z ? p.xz : p.xy);
  return texture2D(tNoise, uv * (1.0 / 12.0));
}`;

// Every toon mesh receives the sun shadow (cast shadows = the shade band, ART §3.1), whatever object.receiveShadow says.
const FRAG_SHADOWMASK = /* glsl */ `#include <shadowmap_pars_fragment>
#define receiveShadow true
#include <shadowmask_pars_fragment>`;

// squared distances (no sqrt per lamp): d² ≤ (r·lj)²
// A street lamp throws a downward cone (half-angle 60°) clipped by its reach sphere: a ~3 m pool on the ground and a
// patch BELOW the head on a nearby wall, never a disc across the façade above it (the store sign must stay the
// brightest thing at night, GDD §10.4). ld·up < 0 below the head; (ld·up)² ≥ ¼|ld|² ⇔ within 60° of straight down.
// P3-look (L8): the cone still painted a hard disc from the ground to ≈ 3.7 m on any wall next to a lamp (a yellow
// wedge over a third of the night frame at sp_milkbox). Walls now only take the pool's foot: a fragment is lit if it
// faces up (ground, sills, tops) or lies in the lowest part of the reach (≥ 0.62·r below the head, ≈ 1.2 m above the
// ground under a 4.6 m street lamp), and only on the side facing the lamp (N·(L − P) > 0).
const lampLine = (i: number) => `ld = vWorldPos - uLamps[${i}].xyz; lr = uLamps[${i}].w * lj; lb = -dot(ld, lUp); lq = dot(ld, ld); lamp = max(lamp, step(lq, lr * lr) * step(0.0, lb) * step(0.25 * lq, lb * lb) * max(lFlat, step(0.62 * lr, lb)) * step(dot(nW, ld), 0.0));`;
const LAMPS = `${[0, 1, 2, 3].map(lampLine).join('\n  ')}
  #if CM_LAMPS > 4
  ${[4, 5, 6, 7].map(lampLine).join('\n  ')}
  #endif`;

const FRAG_SHADE = /* glsl */ `
#ifdef CM_SEETHRU
// P3r2 (camera): compile-time variant — only occluder candidates (world 'thin' / 'detail' layers, lamp poles) and the
// characters (hero fade) carry it; SwiftShader paid this block + the discard on EVERY toon fragment (+12–17 %)
float cmKeep = uFade;
if (uSeeThru.w > 0.0) {                          // P3-look L1 see-through (off in captures: w = 0)
  vec3 vp = -vViewPosition;                      // view space, z < 0 in front of the camera
  float k = vp.z / uSeeThru.z;                   // 0 at the lens … 1 at the hero's depth
  vec2 dxy = (vp.xy - uSeeThru.xy * k) * vec2(1.7, 1.0);
  // P3r3 (look e): the fade ramps over the outer 2/3 of the ellipse (was the outer 0.3): a long rail crossing the patch
  // thins out gradually instead of ending in hard dither edges, which read as a grey rectangle round the hero
  float cone = (1.0 - smoothstep(0.3, 1.0, length(dxy) / max(uSeeThru.w * k, 1e-3))) * step(uSeeThru.z + 0.6, vp.z);
  float nearF = 1.0 - smoothstep(0.2, 0.45, -vp.z);
  cmKeep = min(cmKeep, min(1.0 - 0.62 * cone, 1.0 - nearF));
}
if (cmBayer4(gl_FragCoord.xy) + 0.03 > cmKeep) discard;     // bayer + 0.03 < 1: a solid material never discards
#endif
#ifdef USE_MAP
  vec3 alb = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;               // palette math in sRGB
  #ifndef CM_UNLIT
  vec3 hsv = cmToHsv(alb);
  vec3 shd = cmToRgb(vec3(fract(hsv.x - 0.025), min(1.0, hsv.y * 1.08), hsv.z * 0.74));
  #endif
#else
  vec3 alb = vAlbS, shd = vShdS;                  // shade(k·alb) = k·shade(alb): value scaling keeps h and s
#endif
vec3 nW = (vec4(normal, 0.0) * viewMatrix).xyz;
vec4 nz = cmNoise(vWorldPos, nW);
float mott = 1.0 + 0.03 * (step(0.75, nz.g) - step(nz.g, 0.25));   // 25% −3%, 50% exact, 25% +3%
#ifdef CM_FLECKS
// compile-time (made with { flecks: true }): a uniform branch still paid for this second noise fetch everywhere
if (uFlecks > 0.5) mott *= mix(1.0, 0.62, step(0.74, cmNoise(vWorldPos * 5.0, nW).b));
#endif
alb *= mott;
#ifdef CM_UNLIT
// compile-time unlit variant (made with { unlit: true }): emissive = exact (mottled) albedo; no bands, shadow, night
vec3 col = alb;
#else
shd *= mott;
float ndl = dot(normal, normalize(vSunView)) + (nz.r - 0.5) * 0.16;
float lit = step(0.06, ndl);
#ifdef USE_SHADOWMAP
  lit *= step(0.5, getShadowMask());
#endif
float flashed = 0.0;
if (uFlash.w > 0.0) flashed = step(distance(vWorldPos, uFlash.xyz), uFlash.w);
lit = max(lit, flashed);
vec3 col = mix(shd, alb, lit);
#ifdef CM_NIGHT
// compile-time variant (see setToonNight): SwiftShader pays for this block even when uNight == 0 (≈ 40 % of the main pass)
if (uNight > 0.0) {
  vec3 nLit = max(alb * vec3(0.55, 0.66, 0.78) + vec3(0.05, 0.07, 0.10), vec3(0.12));
  vec3 nSh = max(alb * vec3(0.30, 0.38, 0.50) + vec3(0.04, 0.06, 0.09), vec3(0.12));
  float lamp = flashed, lj = 1.0 - (nz.r - 0.5) * 0.12, lr;      // ragged pool edge (world-anchored)
  vec3 ld, lUp = normalize(vWorldPos - uPlanetCenter);
  float lb, lq, lFlat = step(0.6, dot(nW, lUp));
  // unrolled, branch-free: a lamp with w = 0 never passes (d ≤ 0); SwiftShader pays dearly for dynamic loops
  ${LAMPS}
  vec3 nCol = mix(mix(nSh, nLit, lit), alb * vec3(1.0, 0.86, 0.62) + vec3(0.04, 0.02, 0.0), lamp);
  float rim = uRim * step(0.72, 1.0 - abs(dot(normal, normalize(vViewPosition))));
  nCol = mix(nCol, vec3(0.62, 0.72, 0.85), rim * 0.12);
  col = mix(col, nCol, uNight);
}
#endif
if (uUncanny > 0.0) {
  vec3 g = mix(alb, vec3(dot(alb, vec3(0.299, 0.587, 0.114))), 0.6);
  vec3 uCol = mix(g * vec3(0.36, 0.46, 0.44), g * vec3(0.74, 0.90, 0.84), lit);
  col = mix(col, uCol, uUncanny * (1.0 - uSpiritImmune));
}
#endif
col = mix(col, alb, uUnlit);
gl_FragColor = vec4(col, 1.0 - uUnlit);
float lw = uLineWeight * smoothstep(0.16, 0.26, nz.b) * (0.55 + 0.9 * nz.a);
#ifdef CM_SEETHRU
gInfo = vec4(cmOct(normal), cmKeep < 0.999 ? 1.0 : vSurfaceId / 255.0, clamp(lw, 0.0, 1.0));
#else
gInfo = vec4(cmOct(normal), vSurfaceId / 255.0, clamp(lw, 0.0, 1.0));
#endif`;

/** Patch a MeshToon shader in place (exported for the source test). */
export function patchToonShader(s: { vertexShader: string; fragmentShader: string }): void {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', VERT_COMMON)
    .replace('#include <project_vertex>', VERT_MAIN);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', FRAG_COMMON)
    .replace('#include <shadowmap_pars_fragment>', FRAG_SHADOWMASK)
    .replace('#include <opaque_fragment>', FRAG_SHADE)
    // MeshToon's own lighting is dead code here (the bands come from vSunView + getShadowMask): strip it so
    // SwiftShader does not pay for a second shadow fetch and the light loop.
    .replace('#include <lights_toon_fragment>', '')
    .replace('#include <lights_fragment_begin>', '')
    .replace('#include <lights_fragment_maps>', '')
    .replace('#include <lights_fragment_end>', '')
    .replace('#include <aomap_fragment>', '')
    .replace('#include <tonemapping_fragment>', '')
    .replace('#include <colorspace_fragment>', '')
    .replace('#include <fog_fragment>', '');
}

/** Per-material uniforms (also exposed on material.userData.toon so owners can flip e.g. `uUnlit` at runtime). */
export interface ToonUniforms {
  uSurfaceId: IUniform<number>; uLineWeight: IUniform<number>; uUnlit: IUniform<number>;
  uSpiritImmune: IUniform<number>; uFlecks: IUniform<number>; uRim: IUniform<number>;
  /** P3-look: screen-door opacity of this material (1 = solid); C fades the hero while the follow boom is short. */
  uFade: IUniform<number>;
}

export const TOON_CACHE_KEY = 'cm-toon-v1';

/** Compile-time night variant: the GDD §10.4 night bands + lamp pools are only compiled in while a night-ish palette is
 *  up (render flips it; every toon material then rebuilds its program once). Captures that need night turn it on too. */
const features = { night: false, lamps: 4 };   // lamps: slots compiled in (the nearest lamps IN VIEW fill them first)
const registry = new Set<MeshToonMaterial>();
export function toonNight(): boolean { return features.night; }
/** Returns true when the variant changed (all toon materials are flagged for a program rebuild). */
export function setToonNight(on: boolean): boolean {
  if (features.night === on) return false;
  features.night = on;
  rebuildAll();
  return true;
}
/** Dev/perf: number of lamp slots compiled into the night variant (4 or 8). */
export function setToonLamps(n: 4 | 8): void {
  if (features.lamps === n) return;
  features.lamps = n;
  if (features.night) rebuildAll();
}
let rebuilding = false;
/** three keeps every program a material ever used in that material's own cache until it is disposed, so a plain
 *  needsUpdate would leave the day AND night programs alive (golden: 21 > 20 programs). dispose() releases the old
 *  program (the material stays usable and recompiles on its next draw). */
function rebuildAll(): void {
  rebuilding = true;
  try { for (const m of registry) { m.dispose(); m.needsUpdate = true; } } finally { rebuilding = false; }
}
const cacheKey = (o: ToonOpts) => () =>
  `${TOON_CACHE_KEY}${features.night && !o.unlit ? `-n${features.lamps}` : ''}${o.unlit ? '-u' : ''}${o.flecks ? '-f' : ''}${o.seeThru ? '-s' : ''}`;
const defineVariant = (s: WebGLProgramParametersWithUniforms, o: ToonOpts) => {
  if (o.seeThru) s.fragmentShader = `#define CM_SEETHRU 1\n${s.fragmentShader}`;
  if (o.flecks) s.fragmentShader = `#define CM_FLECKS 1\n${s.fragmentShader}`;
  if (o.unlit) s.fragmentShader = `#define CM_UNLIT 1\n${s.fragmentShader}`;
  else if (features.night) s.fragmentShader = `#define CM_NIGHT 1\n#define CM_LAMPS ${features.lamps}\n${s.fragmentShader}`;
};
const track = (m: MeshToonMaterial) => { registry.add(m); m.addEventListener('dispose', () => { if (!rebuilding) registry.delete(m); }); };

export const makeToonMaterial: MakeToonMaterial = (o: ToonOpts = {}) => {
  if (!shared.tNoise.value) shared.tNoise.value = noiseTexture();
  const m = new MeshToonMaterial({
    color: o.color ?? 0xffffff, vertexColors: !!o.vertexColors, map: o.map ?? null,
    side: o.side ?? FrontSide, alphaTest: o.alphaTest ?? 0,
  });
  const own: ToonUniforms = {
    uSurfaceId: { value: o.surfaceId ?? 1 }, uLineWeight: { value: o.lineWeight ?? 1 },
    uUnlit: { value: o.unlit ? 1 : 0 }, uSpiritImmune: { value: o.spiritImmune ? 1 : 0 },
    uFlecks: { value: o.flecks ? 1 : 0 }, uRim: { value: o.rim ? 1 : 0 }, uFade: { value: 1 },
  };
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    Object.assign(s.uniforms, shared, own);
    patchToonShader(s);
    defineVariant(s, o);
  };
  m.customProgramCacheKey = cacheKey(o);
  if (!o.unlit) track(m);                         // the unlit variant never changes with night
  m.userData.mrt = true;
  m.userData.toon = own;
  // Material.copy() drops onBeforeCompile but keeps userData.mrt: a plain clone would silently write no gInfo.
  m.clone = () => {
    const c = makeToonMaterial(o);
    MeshToonMaterial.prototype.copy.call(c, m);
    const co: ToonUniforms = {
      uSurfaceId: { value: own.uSurfaceId.value }, uLineWeight: { value: own.uLineWeight.value },
      uUnlit: { value: own.uUnlit.value }, uSpiritImmune: { value: own.uSpiritImmune.value },
      uFlecks: { value: own.uFlecks.value }, uRim: { value: own.uRim.value }, uFade: { value: own.uFade.value },
    };
    c.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => { Object.assign(s.uniforms, shared, co); patchToonShader(s); defineVariant(s, o); };
    c.userData = { ...m.userData, mrt: true, toon: co };
    return c;
  };
  return m;
};
