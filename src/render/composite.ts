// src/render/composite.ts — owner A. ART §4.4 + §5.2: the single fullscreen pass — painted sky (depth == 1), fog,
// grade, ink from the MRT info buffer (1/z Laplacian, normal creases, surface ids, world-anchored breaks/weights,
// boil), night halo ink, grain, viewfinder barrel/chroma/vignette, night cold vignette, negative. Writes gl_FragDepth.
import {
  AlwaysDepth, BufferAttribute, type CubeTexture, BufferGeometry, Matrix3, Matrix4, GLSL3, Mesh, OrthographicCamera, RawShaderMaterial, Scene,
  Vector2, Vector3, Vector4, type Texture,
} from 'three';

export const FS_VERT = /* glsl */ `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Composite vertex: the world-space view ray is linear across the far plane, so it is interpolated, not recomputed. */
const COMP_VERT = /* glsl */ `precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
out vec3 vDir;
uniform mat4 uInvProj, uCamWorld;
void main() {
  vUv = uv;
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = mat3(uCamWorld) * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** One fullscreen triangle (not a quad, ART §4.6). */
export function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

const FRAG = /* glsl */ `precision highp float;
precision highp sampler2D;
precision highp samplerCube;
#define texture2D texture
#define textureCube texture
out highp vec4 fragColor;
uniform sampler2D tColor, tInfo, tDepth;
uniform samplerCube tCloud;
uniform vec2 uTexel;
uniform float uIzA, uIzB;                    // 1/viewZ = uIzA − uIzB·depth (linear in the depth-buffer value)
uniform float uLinePx;
uniform vec3 uInk, uInkSpirit, uInkHalo;
uniform float uHalo;
uniform vec3 uLineFade, uFogColor, uFog, uGrade;
uniform float uGrain, uGrainSeed, uBoil, uBoilT;
uniform float uViewfinder, uVfNight, uNegative, uLinearOut;
uniform vec3 uSkyBase, uSkyCloud, uSpeck, uSkyPole;
uniform float uCloudCut, uCloudFade, uSpeckCut, uSpeckInk, uStarMinEl;
uniform mat3 uSkyRot;
uniform float uMoonCos, uMoonRingCos;
uniform vec3 uMoonDir, uMoonColor;
uniform vec4 uSkyFlat;
in vec2 vUv;
in vec3 vDir;

vec3 cmEOTF(vec3 c) { return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }
float h12(vec2 p) {                           // cheap sin-free hash (SwiftShader: sin is slow)
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 octDec(vec2 e) {
  e = e * 2.0 - 1.0;
  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return n * inversesqrt(dot(n, n));
}

vec3 skyColor() {
  if (uSkyFlat.a > 0.5) return uSkyFlat.rgb;
  vec3 dirW = normalize(vDir);
  vec3 dr = uSkyRot * dirW;
  vec4 m = textureCube(tCloud, dr);
  float el = dot(dirW, uSkyPole);                          // sine of the elevation above the local horizon
  float cl = m.r - uCloudFade * smoothstep(0.08, 0.30, el) * 0.6;
  vec3 col = mix(uSkyBase, uSkyCloud, step(uCloudCut, cl));
  if (uSpeckCut < 1.5) {                                   // uniform branch: morning/dusk/dawn have no specks
    vec3 q3 = fract(floor(dr * 420.0) * vec3(0.1031, 0.1030, 0.0973));   // crisp pixel-stepped specks / stars (0.14° cells)
    q3 += dot(q3, q3.yxz + 33.33);
    float sh = fract((q3.x + q3.y) * q3.z);
    vec3 spc = (uSpeckInk > 0.5 && fract(sh * 173.0) < 0.25) ? uInk : uSpeck;
    col = mix(col, spc, step(uSpeckCut, sh) * step(uStarMinEl, el));
  }
  if (uMoonCos < 1.5) {                                    // uniform branch: the moon exists only at night / uncanny
    float md = dot(dirW, uMoonDir);
    col = mix(col, uMoonColor, step(uMoonCos, md));
    col = mix(col, uInk, step(uMoonRingCos, md) - step(uMoonCos, md));
  }
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
#ifdef CM_VF
  uv += cc * dot(cc, cc) * 0.08 * uViewfinder;                                  // barrel
#endif
  vec2 ev = uv;
  if (uBoil > 0.0) {
    // boil: jitter ALL edge taps (centre included) by one vector, so planes stay edge-free (AGENTS.md lesson)
    vec2 cell = floor(gl_FragCoord.xy / 3.0);
    ev += uBoil * (vec2(h12(cell + uBoilT), h12(cell + 17.0 + uBoilT)) - 0.5) * 1.5 * uTexel;
  }
  vec4 iC = texture2D(tInfo, ev);
  float dCr = texture2D(tDepth, ev).x;
  bool sky = dCr >= 0.99999;
  float izC = uIzA - uIzB * dCr;

  float wC = sky ? 0.6 : iC.a;
  vec2 o = uTexel * uLinePx * mix(0.7, 1.5, wC);
  vec4 i0 = texture2D(tInfo, ev - vec2(o.x, 0.0)), i1 = texture2D(tInfo, ev + vec2(o.x, 0.0));
  vec4 i2 = texture2D(tInfo, ev - vec2(0.0, o.y)), i3 = texture2D(tInfo, ev + vec2(0.0, o.y));
  vec4 iz = uIzA - uIzB * vec4(texture2D(tDepth, ev - vec2(o.x, 0.0)).x, texture2D(tDepth, ev + vec2(o.x, 0.0)).x,
                              texture2D(tDepth, ev - vec2(0.0, o.y)).x, texture2D(tDepth, ev + vec2(0.0, o.y)).x);
  float wMax = max(max(max(iC.a, i0.a), max(i1.a, i2.a)), i3.a);
  float idMax = max(max(max(iC.b, i0.b), max(i1.b, i2.b)), i3.b);
  vec4 idd = abs(vec4(i0.b, i1.b, i2.b, i3.b) - iC.b);
  float idE = step(0.5 / 255.0, max(max(idd.x, idd.y), max(idd.z, idd.w)));
  float nd = 0.0;
  if (!sky) {
    vec3 nC = octDec(iC.rg);
    vec4 dn = vec4(dot(nC, octDec(i0.rg)), dot(nC, octDec(i1.rg)), dot(nC, octDec(i2.rg)), dot(nC, octDec(i3.rg)));
    dn = mix(vec4(1.0), dn, step(vec4(0.5 / 255.0), vec4(i0.b, i1.b, i2.b, i3.b)));   // sky neighbours: no crease
    nd = 1.0 - min(min(dn.x, dn.y), min(dn.z, dn.w));
  }
  float lap = abs(iz.x + iz.y - 2.0 * izC) + abs(iz.z + iz.w - 2.0 * izC);
  float eDepth = smoothstep(0.015, 0.04, lap / max(izC, 1e-4));
  float eNormal = smoothstep(0.25, 0.45, nd);
  float edge = max(max(eDepth, eNormal), idE);
  edge *= step(0.02, wMax) * step(idMax, 254.5 / 255.0);   // id 255 = screen-door faded (see-through): no ink
  float dMin = 1.0 / max(max(max(izC, iz.x), max(iz.y, iz.z)), iz.w);
  edge *= mix(1.0, uLineFade.z, smoothstep(uLineFade.x, uLineFade.y, dMin));

#ifdef CM_VF
  float dRaw = texture2D(tDepth, uv).x;
#else
  float dRaw = uBoil > 0.0 ? texture2D(tDepth, uv).x : dCr;
#endif
  bool skyP = dRaw >= 0.99999;
  vec3 col;
  float fogMask;
  if (skyP) { col = skyColor(); fogMask = 0.0; }
  else {
    vec4 c = texture2D(tColor, uv);
    col = c.rgb;
    fogMask = c.a;
#ifdef CM_VF
    {                                                                            // lens chroma
      vec2 co = cc * 0.006 * uViewfinder;
      if (texture2D(tDepth, uv + co).x < 0.99999) col.r = texture2D(tColor, uv + co).r;
      if (texture2D(tDepth, uv - co).x < 0.99999) col.b = texture2D(tColor, uv - co).b;
    }
#endif
    col *= mix(vec3(1.0), uGrade, fogMask);                                      // GDD §10.3 uGrade (not on emissives)
    float dP = 1.0 / (uIzA - uIzB * dRaw);
    col = mix(col, uFogColor, uFog.z * smoothstep(uFog.x, uFog.y, dP) * fogMask);
  }

  float idx = idMax * 255.0;
  vec3 ink = (idx > 239.5 && idx < 254.5) ? uInkSpirit : uInk;
  // GDD §10.4: at night a line over a dark silhouette uses the light halo ink
  if (uHalo > 0.5 && !skyP && dot(col, vec3(0.299, 0.587, 0.114)) < 0.18) ink = uInkHalo;
  col = mix(col, ink, edge);

#ifdef CM_VF
  if (uVfNight > 0.0) {                                                           // GDD §3.6 cold dark vignette
    float vg = smoothstep(0.25, 0.8, length(cc * vec2(1.6, 1.0)));
    col = mix(col, col * vec3(0.78, 0.9, 1.06), 0.35 * uVfNight);
    col *= 1.0 - uVfNight * vg * 0.45;
  }
  if (uViewfinder > 0.0) col *= 1.0 - uViewfinder * smoothstep(0.35, 0.75, length(cc * vec2(1.6, 1.0))) * 0.35;
  if (uNegative > 0.5) col = vec3(1.0) - col;
#endif
  col += (h12(gl_FragCoord.xy + uGrainSeed) - 0.5) * uGrain;                     // paper grain
  col = clamp(col, 4.0 / 255.0, 1.0);                                            // never crushed to #000 (ART App. A)
  if (uLinearOut > 0.5) col = cmEOTF(col);              // sRGB render target (LiveView/capture)
  fragColor = vec4(col, 1.0);
  gl_FragDepth = dRaw;
}`;

export interface CompositeUniforms {
  tColor: { value: Texture | null }; tInfo: { value: Texture | null }; tDepth: { value: Texture | null };
  tCloud: { value: CubeTexture | Texture | null };
  uTexel: { value: Vector2 }; uIzA: { value: number }; uIzB: { value: number };
  uInvProj: { value: Matrix4 }; uCamWorld: { value: Matrix4 }; uLinePx: { value: number };
  uInk: { value: Vector3 }; uInkSpirit: { value: Vector3 }; uInkHalo: { value: Vector3 }; uHalo: { value: number };
  uLineFade: { value: Vector3 }; uFogColor: { value: Vector3 }; uFog: { value: Vector3 }; uGrade: { value: Vector3 };
  uGrain: { value: number }; uGrainSeed: { value: number }; uBoil: { value: number }; uBoilT: { value: number };
  uViewfinder: { value: number }; uVfNight: { value: number }; uNegative: { value: number }; uLinearOut: { value: number };
  uSkyBase: { value: Vector3 }; uSkyCloud: { value: Vector3 }; uSpeck: { value: Vector3 }; uSkyPole: { value: Vector3 };
  uCloudCut: { value: number }; uCloudFade: { value: number }; uSpeckCut: { value: number }; uSpeckInk: { value: number };
  uStarMinEl: { value: number }; uSkyRot: { value: Matrix3 };
  uMoonCos: { value: number }; uMoonRingCos: { value: number }; uMoonDir: { value: Vector3 }; uMoonColor: { value: Vector3 };
  uSkyFlat: { value: Vector4 };
}

export interface Composite {
  scene: Scene; camera: OrthographicCamera; material: RawShaderMaterial; materialVf: RawShaderMaterial;
  mesh: Mesh; u: CompositeUniforms;
}

export function createComposite(cloud: Texture): Composite {
  const u: CompositeUniforms = {
    tColor: { value: null }, tInfo: { value: null }, tDepth: { value: null }, tCloud: { value: cloud },
    uTexel: { value: new Vector2(1 / 1280, 1 / 720) }, uIzA: { value: 10 }, uIzB: { value: 9.996 },
    uInvProj: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() }, uLinePx: { value: 1 },
    uInk: { value: new Vector3() }, uInkSpirit: { value: new Vector3(0xc8 / 255, 0x43 / 255, 0x3a / 255) },
    uInkHalo: { value: new Vector3() }, uHalo: { value: 0 },
    uLineFade: { value: new Vector3(30, 110, 0.35) }, uFogColor: { value: new Vector3() }, uFog: { value: new Vector3(40, 120, 0) },
    uGrade: { value: new Vector3(1, 1, 1) },
    uGrain: { value: 0.018 }, uGrainSeed: { value: 0 }, uBoil: { value: 0 }, uBoilT: { value: 0 },
    uViewfinder: { value: 0 }, uVfNight: { value: 0 }, uNegative: { value: 0 }, uLinearOut: { value: 0 },
    uSkyBase: { value: new Vector3() }, uSkyCloud: { value: new Vector3() }, uSpeck: { value: new Vector3() },
    uSkyPole: { value: new Vector3(0, 1, 0) },
    uCloudCut: { value: 0.52 }, uCloudFade: { value: 0 }, uSpeckCut: { value: 2 }, uSpeckInk: { value: 0 },
    uStarMinEl: { value: -1 }, uSkyRot: { value: new Matrix3() },
    uMoonCos: { value: 2 }, uMoonRingCos: { value: 2 }, uMoonDir: { value: new Vector3(0, 0.3, -1).normalize() }, uMoonColor: { value: new Vector3(1, 1, 1) },
    uSkyFlat: { value: new Vector4(0, 0, 0, 0) },
  };
  // Raw GLSL3: the program key then ignores the output colour space, so canvas and render-target composites share it
  // two programs: gameplay (no lens code) and viewfinder (#define CM_VF: barrel, chroma, vignettes, negative) —
  // SwiftShader pays for uniform-branched code in every pixel, so the lens work is compiled out of normal frames
  const mk = (vf: boolean) => new RawShaderMaterial({
    glslVersion: GLSL3,
    name: vf ? 'render:composite:vf' : 'render:composite',
    uniforms: u as unknown as Record<string, { value: unknown }>,
    vertexShader: COMP_VERT, fragmentShader: vf ? `#define CM_VF 1\n${FRAG}` : FRAG,
    depthTest: true, depthFunc: AlwaysDepth, depthWrite: true,   // WebGL writes depth only with the test enabled
  });
  const material = mk(false), materialVf = mk(true);
  const scene = new Scene();
  const mesh = new Mesh(fullscreenTriangle(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { scene, camera, material, materialVf, mesh, u };
}
