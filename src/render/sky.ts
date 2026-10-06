// src/render/sky.ts — owner A. ART §5.1 cloud map bake, once at boot: a 3D-noise field over the world direction sphere
// (r = domain-warped fbm clouds in long horizontal banks, g = streaks, b = per-cell speck hash). Baked into a cube map
// (no pole pinch, no seam) so the composite's sky costs one cube fetch instead of atan/asin per pixel on SwiftShader.
import {
  BackSide, BoxGeometry, CubeCamera, LinearFilter, Mesh, NoColorSpace, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, WebGLCubeRenderTarget, type WebGLRenderer,
} from 'three';

export const CLOUD_FACE = 320;   // ≈ 0.28° per texel, like the ART 1024×512 equirect map

const NOISE3 = /* glsl */ `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.1; a *= 0.5; } return s / 0.96875; }`;

const VERT = /* glsl */ `varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = NOISE3 + /* glsl */ `
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 p = dir * vec3(2.0, 4.5, 2.0);
  p += 0.45 * vec3(fbm(p * 1.7 + 11.0), fbm(p * 1.7 + 23.0), fbm(p * 1.7 + 37.0));
  gl_FragColor = vec4(fbm(p), fbm(dir * vec3(1.5, 9.0, 1.5) + 5.0), h3(floor(dir * 180.0)), 1.0);
}`;

/** Bake the cloud cube (≈ 1 frame). The bake material is disposed so its program does not count toward the cap. */
export function bakeClouds(renderer: WebGLRenderer): WebGLCubeRenderTarget {
  const rt = new WebGLCubeRenderTarget(CLOUD_FACE, {
    type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
    generateMipmaps: false, depthBuffer: false,
  });
  rt.texture.colorSpace = NoColorSpace;
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthTest: false, depthWrite: false });
  const geo = new BoxGeometry(2, 2, 2);
  const s = new Scene();
  const m = new Mesh(geo, mat);
  m.frustumCulled = false;
  s.add(m);
  const cam = new CubeCamera(0.1, 10, rt);
  const prev = renderer.getRenderTarget();
  cam.update(renderer, s);
  renderer.setRenderTarget(prev);
  mat.dispose();
  geo.dispose();
  return rt;
}
