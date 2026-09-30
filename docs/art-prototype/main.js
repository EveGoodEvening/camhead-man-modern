// REFERENCE PROTOTYPE for docs/ART_DIRECTION.md -- NOT production code. Validated in headless Chromium + SwiftShader (three r186.1).
// Run: cd docs/art-prototype && python3 -m http.server 8765, then open http://127.0.0.1:8765/index.html?mode=game|title|night|uncanny
// window.__result reports {ms, calls, triangles, errs} after 3 frames. Production code must follow the spec (TS, factory, chunking), not copy this file.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'game'; // game | title | night | uncanny
const PAL = {
  skyBase: '#65c1bc', skyCloud: '#9ae4d5', titleCloud: '#6dcac0', speck: '#7fd3c8',
  road: '#6f918f', paintWhite: '#f2f6ea', paintYellow: '#f0d055', sidewalk: '#a5a698', sidewalkTan: '#c5c3a3',
  concrete: '#96988d', plasterBeige: '#d4d3b3', plasterWhite: '#e8efdf', tilePink: '#d9b8a8', roofMauve: '#aea29c',
  steelGreen: '#62ac91', glassDark: '#333e42', metalRail: '#b8beb2', foliage: '#4ca177', grass: '#50a06a', trunk: '#8a7f73',
  sea: '#4aa9a8', seaShallow: '#7fd3c8', orange: '#d8944c', skin: '#e9cfc5', charcoal: '#333d40', navy: '#234457',
  clothWhite: '#f3f6ea', sage: '#6f8a7f', ink: '#2f3a3f', inkDeep: '#1f282d', inkSpirit: '#c8433a', bannerRed: '#c8433a',
  phoneBody: '#eef1e6', lensGlass: '#1b2a33', lensGlint: '#9ae4d5', flash: '#f7cf5e',
};
const R = 80, C = new THREE.Vector3(0, -R, 0), Y = new THREE.Vector3(0, 1, 0);
function flatToWorld(x, y, z, out = new THREE.Vector3()) {
  const r = Math.hypot(x, z); if (r < 1e-6) return out.set(x, y, z);
  const th = r / R, s = Math.sin(th), k = R + y;
  return out.set(k * s * x / r, k * Math.cos(th) - R, k * s * z / r);
}
function upAt(x, z, out = new THREE.Vector3()) {
  const r = Math.hypot(x, z); if (r < 1e-6) return out.copy(Y);
  const th = r / R, s = Math.sin(th); return out.set(s * x / r, Math.cos(th), s * z / r);
}
const _qT = new THREE.Quaternion(), _qY = new THREE.Quaternion(), _up = new THREE.Vector3();
function placeOnPlanet(o, x, z, yaw = 0, y = 0) {
  flatToWorld(x, y, z, o.position); _qT.setFromUnitVectors(Y, upAt(x, z, _up)); _qY.setFromAxisAngle(Y, yaw);
  o.quaternion.copy(_qT).multiply(_qY); o.updateMatrixWorld(true);
}
// --- noise texture (tileable value noise, 4 channels at different frequencies)
function makeNoiseTex() {
  const N = 128, data = new Uint8Array(N * N * 4), freqs = [8, 4, 12, 4];
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 4; c++) {
    const f = freqs[c], L = Array.from({ length: f * f }, rnd);
    const at = (i, j) => L[((j % f + f) % f) * f + ((i % f + f) % f)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N * f, v = y / N * f, i = Math.floor(u), j = Math.floor(v);
      let fx = u - i, fy = v - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
      data[(y * N + x) * 4 + c] = Math.round((a + (b - a) * fy) * 255);
    }
    // rank-equalize the channel -> uniform distribution, so step(t, n) covers exactly (1 - t) of the area
    const idx = Array.from({ length: N * N }, (_, k) => k).sort((p, q) => data[p * 4 + c] - data[q * 4 + c]);
    idx.forEach((k, r) => { data[k * 4 + c] = Math.round(r / (N * N - 1) * 255); });
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
const shared = {
  uPlanetCenter: { value: C.clone() }, uSunPole: { value: new THREE.Vector3(0, 1, 0) }, uSunAtPole: { value: new THREE.Vector3(0.55, 0.8, 0.25).normalize() },
  uTime: { value: 0 }, uNight: { value: MODE === 'night' ? 1 : 0 }, uUncanny: { value: MODE === 'uncanny' ? 1 : 0 },
  uLamps: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, tNoise: { value: makeNoiseTex() },
};
const VERT_COMMON = /* glsl */`#include <common>
attribute float aSurfaceId; uniform float uSurfaceId; uniform vec3 uPlanetCenter; uniform vec3 uSunPole; uniform vec3 uSunAtPole;
varying float vSurfaceId; varying vec3 vWorldPos; varying vec3 vSunView;
vec3 cmRotateBetween(vec3 v, vec3 a, vec3 b) {
  vec3 k = cross(a, b); float c = dot(a, b), s2 = dot(k, k);
  if (s2 < 1e-6) return v;
  return v * c + cross(k, v) + k * (dot(k, v) * (1.0 - c) / s2);
}`;
const VERT_MAIN = /* glsl */`#include <project_vertex>
vec4 cmW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  cmW = batchingMatrix * cmW;
#endif
#ifdef USE_INSTANCING
  cmW = instanceMatrix * cmW;
#endif
cmW = modelMatrix * cmW; vWorldPos = cmW.xyz;
vec3 cmUp = normalize(cmW.xyz - uPlanetCenter);
vSunView = normalize((viewMatrix * vec4(cmRotateBetween(uSunAtPole, uSunPole, cmUp), 0.0)).xyz);
vSurfaceId = aSurfaceId > 0.5 ? aSurfaceId : uSurfaceId;`;
const FRAG_COMMON = /* glsl */`#include <common>
layout(location = 1) out highp vec4 gInfo;
uniform sampler2D tNoise; uniform float uLineWeight, uUnlit, uSpiritImmune, uFlecks, uNight, uUncanny, uRim;
uniform vec4 uLamps[8];
varying float vSurfaceId; varying vec3 vWorldPos; varying vec3 vSunView;
vec3 cmToHsv(vec3 c) { vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy); vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
  float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.0*d + 1e-5)), d / (q.x + 1e-5), q.x); }
vec3 cmToRgb(vec3 h) { vec3 p = abs(fract(h.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return h.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), h.y); }
vec2 cmOct(vec3 n) { n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0); return e * 0.5 + 0.5; }
vec4 cmNoise(vec3 p, vec3 nW) { vec3 a = abs(nW);
  vec2 uv = (a.x > a.y && a.x > a.z) ? p.zy : (a.y > a.z ? p.xz : p.xy); return texture2D(tNoise, uv * (1.0 / 12.0)); }`;
const FRAG_SHADE = /* glsl */`
vec3 alb = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;
vec3 nW = (vec4(normal, 0.0) * viewMatrix).xyz;
vec4 nz = cmNoise(vWorldPos, nW);
alb *= 1.0 + 0.03 * (step(0.75, nz.g) - step(nz.g, 0.25));
if (uFlecks > 0.5) alb = mix(alb, alb * 0.62, step(0.74, cmNoise(vWorldPos * 5.0, nW).b));
float ndl = dot(normal, normalize(vSunView)) + (nz.r - 0.5) * 0.16;
float lit = step(0.06, ndl);
#ifdef USE_SHADOWMAP
  lit *= step(0.5, getShadowMask());
#endif
vec3 hsv = cmToHsv(alb);
vec3 shd = cmToRgb(vec3(fract(hsv.x - 0.025), min(1.0, hsv.y * 1.08), hsv.z * 0.74));
vec3 col = mix(shd, alb, lit);
if (uNight > 0.0) {
  vec3 nLit = alb * vec3(0.40, 0.50, 0.62) + vec3(0.03, 0.05, 0.08);
  vec3 nSh = alb * vec3(0.22, 0.29, 0.40) + vec3(0.03, 0.05, 0.08);
  float lamp = 0.0;
  for (int i = 0; i < 8; i++) { vec4 L = uLamps[i];
    if (L.w > 0.0) lamp = max(lamp, step(distance(vWorldPos, L.xyz) / L.w + (nz.r - 0.5) * 0.12, 1.0)); }
  vec3 nCol = mix(mix(nSh, nLit, lit), alb * vec3(1.0, 0.86, 0.62) + vec3(0.04, 0.02, 0.0), lamp);
  float rim = uRim * step(0.72, 1.0 - abs(dot(normal, normalize(vViewPosition))));
  nCol = mix(nCol, vec3(0.62, 0.72, 0.85), rim * 0.12);
  col = mix(col, nCol, uNight);
}
if (uUncanny > 0.0) {
  vec3 g = mix(alb, vec3(dot(alb, vec3(0.299, 0.587, 0.114))), 0.6);
  vec3 uCol = mix(g * vec3(0.36, 0.46, 0.44), g * vec3(0.74, 0.90, 0.84), lit);
  col = mix(col, uCol, uUncanny * (1.0 - uSpiritImmune));
}
col = mix(col, alb, uUnlit);
gl_FragColor = vec4(col, 1.0 - uUnlit);
float lw = uLineWeight * smoothstep(0.16, 0.26, nz.b) * (0.55 + 0.9 * nz.a);
gInfo = vec4(cmOct(normal), vSurfaceId / 255.0, clamp(lw, 0.0, 1.0));`;
function makeToonMaterial(o = {}) {
  const m = new THREE.MeshToonMaterial({ color: o.color ?? 0xffffff, vertexColors: !!o.vertexColors, map: o.map ?? null, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0 });
  const u = { uSurfaceId: { value: o.surfaceId ?? 1 }, uLineWeight: { value: o.lineWeight ?? 1 }, uUnlit: { value: o.unlit ? 1 : 0 },
    uSpiritImmune: { value: o.spiritImmune ? 1 : 0 }, uFlecks: { value: o.flecks ? 1 : 0 }, uRim: { value: o.rim ? 1 : 0 } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <project_vertex>', VERT_MAIN);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', FRAG_COMMON)
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
      .replace('#include <opaque_fragment>', FRAG_SHADE)
      .replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '').replace('#include <fog_fragment>', '');
  };
  m.customProgramCacheKey = () => 'cm-toon-v1';
  m.userData.mrt = true; return m;
}
// --- geometry helpers
const _c = new THREE.Color();
function paint(geo, hex, id) {
  geo = geo.index ? geo.toNonIndexed() : geo; const n = geo.attributes.position.count;
  _c.set(hex); const col = new Float32Array(n * 3), sid = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; sid[i] = id; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSurfaceId', new THREE.BufferAttribute(sid, 1));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
function wrapGeometry(geo) {
  const p = geo.attributes.position, nrm = geo.attributes.normal, v = new THREE.Vector3(), q = new THREE.Quaternion(), u = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); flatToWorld(x, y, z, v); p.setXYZ(i, v.x, v.y, v.z);
    q.setFromUnitVectors(Y, upAt(x, z, u)); v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyQuaternion(q); nrm.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = nrm.needsUpdate = true; geo.computeBoundingSphere(); return geo;
}
const dummy = new THREE.Object3D();
function placed(geo, x, z, yaw = 0, y = 0) { placeOnPlanet(dummy, x, z, yaw, y); return geo.applyMatrix4(dummy.matrixWorld); }
let idc = 1; const nid = () => (idc = (idc % 199) + 1);

// --- scene
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(1280, 720); document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene();
const envMat = makeToonMaterial({ vertexColors: true });
const leafMat = makeToonMaterial({ vertexColors: true, flecks: true });

// ground (flat → wrapped)
const flat = [];
const ground = new THREE.RingGeometry(0.01, 72, 96, 36).rotateX(-Math.PI / 2); flat.push(paint(ground, PAL.sidewalkTan, nid()));
const road = new THREE.PlaneGeometry(8, 130, 4, 65).rotateX(-Math.PI / 2).translate(0, 0.03, 0); flat.push(paint(road, PAL.road, nid()));
const cross = new THREE.PlaneGeometry(130, 7, 65, 4).rotateX(-Math.PI / 2).translate(0, 0.02, -20); flat.push(paint(cross, PAL.road, nid()));
for (const sx of [-1, 1]) flat.push(paint(new THREE.BoxGeometry(0.3, 0.15, 130, 1, 1, 65).translate(sx * 4.15, 0.075, 0), PAL.sidewalk, nid()));
for (let z = -60; z < 60; z += 4) flat.push(paint(new THREE.BoxGeometry(0.15, 0.02, 2).translate(0, 0.045, z), PAL.paintYellow, nid()));
for (const sx of [-1, 1]) flat.push(paint(new THREE.PlaneGeometry(2, 50, 1, 25).rotateX(-Math.PI / 2).translate(sx * 12, 0.025, 30), PAL.grass, nid()));
const groundMesh = new THREE.Mesh(wrapGeometry(mergeGeometries(flat)), envMat); groundMesh.receiveShadow = true; scene.add(groundMesh);

// planet body
const body = paint(new THREE.IcosahedronGeometry(R - 0.05, 4), PAL.sea, 2);
{ const p = body.attributes.position, c = body.attributes.color; const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i) / R; col.set(yy > 0.62 ? PAL.grass : yy > 0.5 ? PAL.seaShallow : PAL.sea); c.setXYZ(i, col.r, col.g, col.b); } }
const bodyMesh = new THREE.Mesh(body.translate(C.x, C.y, C.z), envMat); bodyMesh.receiveShadow = true; scene.add(bodyMesh);

// buildings (rigid)
const bparts = [];
function building(x, z, w, d, h, wall, yaw = 0) {
  const g = []; g.push(paint(new THREE.BoxGeometry(w, h + 0.3, d).translate(0, (h + 0.3) / 2 - 0.3, 0), wall, nid()));
  g.push(paint(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5).translate(0, h + 0.1, 0), PAL.roofMauve, nid()));
  const floors = Math.floor(h / 3), cols = Math.max(1, Math.floor(w / 2.4)); const gid = nid();
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const wx = -w / 2 + (c + 0.5) * (w / cols);
    g.push(paint(new THREE.BoxGeometry(1.1, 1.3, 0.12).translate(wx, f * 3 + 1.7, d / 2 + 0.02), PAL.glassDark, gid));
    if (f > 0 && (c + f) % 2 === 0) g.push(paint(new THREE.BoxGeometry(0.8, 0.5, 0.45).translate(wx + 0.9, f * 3 + 0.9, d / 2 + 0.22), PAL.metalRail, nid()));
  }
  bparts.push(placed(mergeGeometries(g), x, z, yaw));
}
building(-10, -2, 8, 7, 12, PAL.tilePink, Math.PI / 2);
building(-9.5, 10, 7, 6, 9, PAL.plasterBeige, Math.PI / 2);
building(10, 4, 9, 7, 15, PAL.plasterWhite, -Math.PI / 2);
building(9.5, -8, 7, 6, 6, PAL.concrete, -Math.PI / 2);
building(-10, -32, 9, 8, 18, PAL.plasterWhite, Math.PI / 2);
building(11, -34, 10, 8, 9, PAL.tilePink, -Math.PI / 2);
building(0, -48, 12, 8, 21, PAL.plasterBeige, 0);
building(-14, 22, 8, 8, 6, PAL.concrete, Math.PI / 2);
// green steel footbridge over the road
bparts.push(placed(mergeGeometries([paint(new THREE.BoxGeometry(22, 0.6, 2.4).translate(0, 5.5, 0), PAL.steelGreen, nid()),
  paint(new THREE.BoxGeometry(22, 1.0, 0.08).translate(0, 6.3, 1.15), PAL.steelGreen, nid()),
  paint(new THREE.BoxGeometry(0.5, 5.5, 0.5).translate(-6, 2.6, 0), PAL.steelGreen, nid()),
  paint(new THREE.BoxGeometry(0.5, 5.5, 0.5).translate(6, 2.6, 0), PAL.steelGreen, nid())]), 0, -6));
// poles
for (const [x, z] of [[-5, 2], [5, -14], [-5, -26], [5, 16]]) bparts.push(placed(paint(new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 3.8, 0), PAL.concrete, nid()), x, z));
const bMesh = new THREE.Mesh(mergeGeometries(bparts), envMat); bMesh.castShadow = bMesh.receiveShadow = true; scene.add(bMesh);
// cables (wrapped tubes)
{ const cg = []; const pts = [[-5, 2], [5, -14], [-5, -26]];
  for (let i = 0; i < pts.length - 1; i++) for (const off of [7.6, 7.2]) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const cv = [];
    for (let t = 0; t <= 16; t++) { const s = t / 16; cv.push(new THREE.Vector3(x0 + (x1 - x0) * s, off - Math.sin(Math.PI * s) * 0.7, z0 + (z1 - z0) * s)); }
    cg.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cv), 32, 0.025, 4), '#3f4a4e', nid()));
  }
  scene.add(new THREE.Mesh(wrapGeometry(mergeGeometries(cg)), makeToonMaterial({ vertexColors: true, lineWeight: 0 })));
}
// trees
const tparts = [];
for (const [x, z] of [[-6.5, 18], [7, 24], [-7, -14], [16, -18], [-16, 6]]) {
  const g = [paint(new THREE.CylinderGeometry(0.12, 0.2, 3, 5).translate(0, 1.4, 0), PAL.trunk, nid())]; const lid = nid();
  for (let k = 0; k < 6; k++) { const a = k * 2.1; g.push(paint(new THREE.IcosahedronGeometry(1.1 + (k % 3) * 0.25, 1).translate(Math.cos(a) * 0.9, 3.4 + (k % 2) * 0.8, Math.sin(a) * 0.9), PAL.foliage, lid)); }
  tparts.push(placed(mergeGeometries(g), x, z));
}
const tMesh = new THREE.Mesh(mergeGeometries(tparts), leafMat); tMesh.castShadow = tMesh.receiveShadow = true; scene.add(tMesh);

// protagonist
const player = new THREE.Group();
{ const g = [];
  g.push(paint(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8).translate(-0.11, 0.42, 0), PAL.navy, 201));
  g.push(paint(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8).translate(0.11, 0.42, 0), PAL.navy, 201));
  g.push(paint(new RoundedBoxGeometry(0.16, 0.12, 0.3, 2, 0.04).translate(-0.11, 0.06, -0.03), PAL.clothWhite, 202));
  g.push(paint(new RoundedBoxGeometry(0.16, 0.12, 0.3, 2, 0.04).translate(0.11, 0.06, -0.03), PAL.clothWhite, 202));
  g.push(paint(new RoundedBoxGeometry(0.44, 0.56, 0.25, 2, 0.06).translate(0, 1.12, 0), PAL.charcoal, 203));
  g.push(paint(new THREE.BoxGeometry(0.46, 0.06, 0.27).translate(0, 1.37, 0), PAL.orange, 204));
  for (const sx of [-1, 1]) {
    g.push(paint(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8).translate(sx * 0.28, 1.05, 0), PAL.charcoal, 203));
    g.push(paint(new THREE.SphereGeometry(0.075, 8, 6).translate(sx * 0.29, 0.74, 0), PAL.skin, 205));
  }
  g.push(paint(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 8).translate(0, 1.43, 0), PAL.skin, 205));
  const head = paint(new RoundedBoxGeometry(0.24, 0.40, 0.075, 3, 0.035).translate(0, 1.66, 0), PAL.phoneBody, 206);
  g.push(head);
  g.push(paint(new RoundedBoxGeometry(0.17, 0.17, 0.02, 2, 0.02).translate(0, 1.73, -0.045), PAL.charcoal, 207));
  for (const sx of [-1, 1]) {
    g.push(paint(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 12).rotateX(Math.PI / 2).translate(sx * 0.0425, 1.76, -0.06), PAL.metalRail, 208));
    g.push(paint(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateX(Math.PI / 2).translate(sx * 0.0425, 1.76, -0.064), PAL.lensGlass, 209));
  }
  g.push(paint(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10).rotateX(Math.PI / 2).translate(0, 1.695, -0.06), PAL.metalRail, 208));
  g.push(paint(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8).rotateX(Math.PI / 2).translate(0.06, 1.67, -0.058), PAL.flash, 204));
  const pm = new THREE.Mesh(mergeGeometries(g), makeToonMaterial({ vertexColors: true, rim: true })); pm.castShadow = true; pm.receiveShadow = true; player.add(pm);
  // back screen (unlit canvas)
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const x = cv.getContext('2d');
  x.fillStyle = '#1f282d'; x.fillRect(0, 0, 128, 256); x.strokeStyle = '#9ae4d5'; x.fillStyle = '#9ae4d5'; x.lineWidth = 6; x.lineCap = 'round';
  x.beginPath(); x.arc(40, 110, 7, 0, 7); x.fill(); x.beginPath(); x.arc(88, 110, 7, 0, 7); x.fill();
  x.beginPath(); x.moveTo(46, 150); x.quadraticCurveTo(64, 164, 82, 150); x.stroke(); x.fillRect(10, 10, 30, 6);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.36), makeToonMaterial({ map: tex, unlit: true, surfaceId: 209 }));
  scr.position.set(0, 1.66, 0.039); player.add(scr);
}
const PX = 0, PZ = 12; placeOnPlanet(player, PX, PZ, 0); scene.add(player);
// an uncanny paper effigy (spirit id, cinnabar ink, unlit)
const effigy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.02).translate(0, 0.8, 0), makeToonMaterial({ color: '#efe9d8', unlit: true, spiritImmune: true, surfaceId: 241 }));
placeOnPlanet(effigy, 2.8, 4, 0.3); scene.add(effigy);

// light (follows player frame)
const sunLight = new THREE.DirectionalLight(0xffffff, 1); sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024); Object.assign(sunLight.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
sunLight.shadow.bias = -0.0008; sunLight.shadow.normalBias = 0.03; scene.add(sunLight, sunLight.target);
{ const pw = flatToWorld(PX, 0, PZ), pu = upAt(PX, PZ); const qp = new THREE.Quaternion().setFromUnitVectors(Y, pu);
  const east = new THREE.Vector3(1, 0, 0).applyQuaternion(qp), south = new THREE.Vector3(0, 0, 1).applyQuaternion(qp);
  const sw = pu.clone().multiplyScalar(0.80).addScaledVector(east, 0.55).addScaledVector(south, 0.25).normalize();  // sunAt()
  shared.uSunPole.value.copy(pu); shared.uSunAtPole.value.copy(sw);
  sunLight.position.copy(pw).addScaledVector(sw, 45); sunLight.target.position.copy(pw); sunLight.target.updateMatrixWorld(); }
if (MODE === 'night') { const lw = flatToWorld(-4.5, 0, 6); shared.uLamps.value[0].set(lw.x, lw.y, lw.z, 5); const lw2 = flatToWorld(4.5, 0, -8); shared.uLamps.value[1].set(lw2.x, lw2.y, lw2.z, 5); }

// camera
const camera = new THREE.PerspectiveCamera(50, 1280 / 720, 0.1, 250);
if (MODE === 'title') {
  camera.fov = 30; camera.near = 250; camera.far = 600; camera.updateProjectionMatrix();
  const phi = 0.6, el = 35 * Math.PI / 180;
  camera.position.copy(C).add(new THREE.Vector3(Math.cos(el) * Math.sin(phi), Math.sin(el), Math.cos(el) * Math.cos(phi)).multiplyScalar(460));
  camera.up.copy(Y); camera.lookAt(C.clone().add(new THREE.Vector3(0, 20, 0)));
  const cp = camera.position.clone().sub(C).normalize(); const qc = new THREE.Quaternion().setFromUnitVectors(Y, cp);   // title: pole faces the camera
  shared.uSunPole.value.copy(cp); shared.uSunAtPole.value.set(0.55, 0.8, 0.25).normalize().applyQuaternion(qc);
} else {
  const pw = flatToWorld(PX, 0, PZ), up = upAt(PX, PZ); const q = new THREE.Quaternion().setFromUnitVectors(Y, up);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  camera.position.copy(pw).addScaledVector(up, 1.5).addScaledVector(back, 3.6).addScaledVector(right, 0.5);
  camera.up.copy(up); camera.lookAt(pw.clone().addScaledVector(up, 1.5).addScaledVector(back, -6));
}
camera.updateMatrixWorld();

// MRT
const mrt = new THREE.WebGLRenderTarget(1280, 720, { count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, samples: 0 });
mrt.depthTexture = new THREE.DepthTexture(1280, 720);

// cloud bake
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const NOISE3 = `float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.1; a *= 0.5; } return s / 0.96875; }`;
const cloudRT = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
cloudRT.texture.wrapS = THREE.RepeatWrapping;
{ const bm = new THREE.ShaderMaterial({ vertexShader: FS_VERT, depthTest: false, depthWrite: false, fragmentShader: NOISE3 + `
  varying vec2 vUv;
  void main(){ float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
    vec3 dir = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 p = dir * vec3(2.0, 4.5, 2.0);
    p += 0.45 * vec3(fbm(p * 1.7 + 11.0), fbm(p * 1.7 + 23.0), fbm(p * 1.7 + 37.0));
    gl_FragColor = vec4(fbm(p), fbm(dir * vec3(1.5, 9.0, 1.5) + 5.0), h3(floor(dir * 180.0)), 1.0); }` });
  const s = new THREE.Scene(); const m = new THREE.Mesh(tri, bm); m.frustumCulled = false; s.add(m);
  renderer.setRenderTarget(cloudRT); renderer.render(s, new THREE.Camera()); renderer.setRenderTarget(null); }

// composite
function srgb(h) { const c = new THREE.Color(); c.setStyle(h, THREE.SRGBColorSpace); return new THREE.Vector3(...c.getRGB(new THREE.Color(), THREE.SRGBColorSpace).toArray()); }
const skyPreset = { game: [PAL.skyBase, PAL.skyCloud, 0.52], title: [PAL.skyBase, PAL.titleCloud, 0.60], night: ['#1d3442', '#2d5561', 0.56], uncanny: ['#16262b', '#3d6b62', 0.50] }[MODE];
const comp = new THREE.ShaderMaterial({
  depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true,
  uniforms: {
    tColor: { value: mrt.textures[0] }, tInfo: { value: mrt.textures[1] }, tDepth: { value: mrt.depthTexture }, tCloud: { value: cloudRT.texture },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uNear: { value: camera.near }, uFar: { value: camera.far },
    uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld }, uLinePx: { value: 1.0 },
    uInk: { value: srgb(MODE === 'night' ? '#141b20' : MODE === 'uncanny' ? '#10181a' : PAL.ink) }, uInkSpirit: { value: srgb(PAL.inkSpirit) },
    uLineFade: { value: MODE === 'title' ? new THREE.Vector3(1e4, 2e4, 1) : new THREE.Vector3(30, 110, 0.35) },
    uFogColor: { value: srgb(MODE === 'night' ? '#1d3442' : PAL.skyCloud) },
    uFog: { value: MODE === 'title' ? new THREE.Vector3(1e4, 2e4, 0) : MODE === 'night' ? new THREE.Vector3(25, 100, 0.45) : new THREE.Vector3(40, 120, 0.30) },
    uGrain: { value: MODE === 'night' ? 0.035 : 0.018 }, uBoil: { value: MODE === 'uncanny' ? 1 : 0 }, uTime: { value: 0 }, uViewfinder: { value: 0 },
    uSkyBase: { value: srgb(skyPreset[0]) }, uSkyCloud: { value: srgb(skyPreset[1]) }, uCloudCut: { value: skyPreset[2] },
    uSpeck: { value: srgb(MODE === 'night' ? '#cfe8dc' : PAL.speck) }, uSpeckCut: { value: MODE === 'night' ? 0.985 : 0.992 },
    uSkyRot: { value: new THREE.Matrix3() },
    uMoonOn: { value: MODE === 'night' || MODE === 'uncanny' ? 1 : 0 }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.35, -1).normalize() },
    uMoonSize: { value: MODE === 'uncanny' ? 0.06 : 0.035 }, uMoonColor: { value: srgb(MODE === 'uncanny' ? '#d0453b' : '#f3ecd2') },
  },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`
#include <packing>
uniform sampler2D tColor, tInfo, tDepth, tCloud;
uniform vec2 uTexel; uniform float uNear, uFar; uniform mat4 uInvProj, uCamWorld; uniform float uLinePx;
uniform vec3 uInk, uInkSpirit, uLineFade, uFogColor, uFog; uniform float uGrain, uBoil, uTime, uViewfinder;
uniform vec3 uSkyBase, uSkyCloud, uSpeck; uniform float uCloudCut, uSpeckCut; uniform mat3 uSkyRot;
uniform float uMoonOn, uMoonSize; uniform vec3 uMoonDir, uMoonColor;
varying vec2 vUv;
float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
vec3 octDec(vec2 e) { e = e * 2.0 - 1.0; vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0); n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t); return normalize(n); }
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 skyColor(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0); v /= v.w;
  vec3 dir = normalize(mat3(uCamWorld) * v.xyz); dir = uSkyRot * dir;
  vec2 eq = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec4 m = texture2D(tCloud, eq);
  vec3 col = mix(uSkyBase, uSkyCloud, step(uCloudCut, m.r));
  col = mix(col, uSpeck, step(uSpeckCut, m.b));
  float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
  col = mix(col, uMoonColor, step(md, uMoonSize) * uMoonOn);
  col = mix(col, uInk, (step(md, uMoonSize + 0.004) - step(md, uMoonSize)) * uMoonOn);
  return col;
}
void main() {
  vec2 uv = vUv;
  if (uViewfinder > 0.0) { vec2 c = uv - 0.5; uv += c * dot(c, c) * 0.08 * uViewfinder; }
  vec2 jit = uBoil * (vec2(h12(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 8.0)), h12(floor(gl_FragCoord.xy / 3.0) + 17.0 + floor(uTime * 8.0))) - 0.5) * 1.5 * uTexel;
  vec2 ev = uv + jit;   // ALL edge taps (center included) share the jitter -> planes stay edge-free
  vec4 iC = texture2D(tInfo, ev); float dC = viewDepth(ev); bool sky = texture2D(tDepth, ev).x >= 0.99999;
  float wC = sky ? 0.6 : iC.a;
  vec2 o = uTexel * uLinePx * mix(0.7, 1.5, wC);
  vec2 T[4] = vec2[4](vec2(-o.x, 0.0), vec2(o.x, 0.0), vec2(0.0, -o.y), vec2(0.0, o.y));
  float izC = 1.0 / dC, nd = 0.0, idE = 0.0, wMax = iC.a, dMin = dC, idMax = iC.b; float izs[4]; vec3 nC = octDec(iC.rg);
  for (int k = 0; k < 4; k++) {
    vec2 q = ev + T[k]; vec4 i = texture2D(tInfo, q); float d = viewDepth(q);
    izs[k] = 1.0 / d; dMin = min(dMin, d); wMax = max(wMax, i.a); idMax = max(idMax, i.b);
    idE = max(idE, step(0.5 / 255.0, abs(i.b - iC.b)));
    if (!sky && i.b > 0.0) nd = max(nd, 1.0 - dot(nC, octDec(i.rg)));
  }
  float lap = abs(izs[0] + izs[1] - 2.0 * izC) + abs(izs[2] + izs[3] - 2.0 * izC);
  float eDepth = smoothstep(0.015, 0.04, lap / max(izC, 1e-4)); float eNormal = smoothstep(0.25, 0.45, nd);
  float edge = max(max(eDepth, eNormal), idE);
  edge *= step(0.02, wMax); edge *= mix(1.0, uLineFade.z, smoothstep(uLineFade.x, uLineFade.y, dMin));
  bool skyP = texture2D(tDepth, uv).x >= 0.99999; float dP = viewDepth(uv);   // color uses the un-jittered pixel
  vec3 col; float fogMask;
  if (skyP) { col = skyColor(uv); fogMask = 0.0; } else { vec4 c = texture2D(tColor, uv); col = c.rgb; fogMask = c.a; }
  col = mix(col, uFogColor, uFog.z * smoothstep(uFog.x, uFog.y, dP) * fogMask);
  float idx = idMax * 255.0; vec3 ink = (idx > 239.5 && idx < 254.5) ? uInkSpirit : uInk;
  col = mix(col, ink, edge);
  col += (h12(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0); gl_FragDepth = texture2D(tDepth, uv).x;
}` });
const compScene = new THREE.Scene(); const compMesh = new THREE.Mesh(tri, comp); compMesh.frustumCulled = false; compScene.add(compMesh);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// render
const errs = [];
renderer.debug.onShaderError = (gl, prog, vs, fs) => { errs.push(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(prog)); };
const t0 = performance.now();
for (let i = 0; i < 3; i++) {
  renderer.setRenderTarget(mrt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  var info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  renderer.setRenderTarget(null); renderer.render(compScene, orthoCam);
}
const gl = renderer.getContext(); gl.finish();
window.__result = { mode: MODE, ms: Math.round((performance.now() - t0) / 3), ...info, errs };
window.__done = true;
