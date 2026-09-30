# TECH_NOTES: three.js r186 (WebGL) + Vite 8 + TypeScript

Project: **头上长手机摄像头的男人**, a tiny-planet urban 志怪 mystery game about a man whose head is a phone camera.
Audience: the implementation agents. Everything below was **checked on this machine on 2026-09-29**, either
against the r186 source in `node_modules/three`, against npm registry metadata, or by running a throwaway
prototype in headless Chromium + SwiftShader. The prototype produced every number and screenshot quoted here.
It lives at `/tmp/claude-0/-root-github-com-EveGoodEvening-camera-man-modern/26c900b3-e443-4fe6-9049-5dd641639339/scratchpad/tech/proj`
(it is ephemeral, so the code you need is copied into this file).

> **Superseded values — read this first.** This file was written in parallel with the other docs, and its *API facts* (r186 signatures, toolchain pins, SwiftShader measurements, gotchas) remain authoritative. Its *prototype design values* are **not**. Where it disagrees, the other docs win:
>
> | Topic here | Binding value | Source |
> |---|---|---|
> | Planet R = 40 (§0, §3, §3.4, §7.4 test `- 40`) | `PLANET_R = 80`, origin-centered, town on the +Y pole, one chart | GDD §0.2, ARCH §2.8.1 |
> | Budget ≤ 60 draw calls / ≤ 100k tris (§0, §4, §7.4 test `< 60`) | ≤ 120 calls / ≤ 150k tris per whole frame (hard caps), targets 80 / 110k | ARCH §5.1 |
> | 3-band `toonRamp` + `HemisphereLight` + `patchForGBuffer` (§2.3) | 2 bands via the ART §3.3 `makeToonMaterial` factory (the only main-pass material); `paint()` writes `aSurfaceId`, not `inkId` | ART §3, ARCH §5.2 |
> | Ink pass: gradient sky, `#1d2326` ink, always-on 6 Hz boil, screen-space breaks, `depthTest:false` (§2.2) | ART §4.4 composite: flat 2-tone baked sky, `#2f3a3f` ink, world-anchored breaks, boil only for uncanny, writes `gl_FragDepth` with `AlwaysDepth` | ART §4–§5 |
> | G-buffer RT0 `SRGBColorSpace` + `colorspace_fragment` in the ink pass (§0, §2.1 rule 3, §2.2) | plain RGBA8 `NoColorSpace` + manual OETF in the material, no conversion in the composite | ART §3.2, §12 |
> | Sun follows the player **heading** (§2.3) | fixed azimuth in the geographic frame (`sunAt`) | ART §3.1 |
> | Shadow box ±14 m (§0, §4) | ±22 m, texel-snapped | ART §3.1 |
> | Blob shadows as transparent main-pass meshes (§4 rule 4) | no transparent main-pass materials; blobs only under `?lowfx=1`, drawn in the FX pass | ART §3.3, ARCH §3.A |
> | Follow camera `distance 6.5, height 1.8, pitch 0.28` (§3.2) | vFOV 50°, 3.6 m behind, eye 1.5 m, 0.5 m right shoulder | ART §6.4 |
> | `placeMatrix` yaw **counter-clockwise** from north (§3.1) | headings are **clockwise** from local north; place only via `core/planet` | GDD §0.2, ARCH §2.3 |
> | Spirit layer = 1, enabled by phone mode (§3.3, §7.4) | `GHOST` = layer 2, enabled only in **night** viewfinder mode | GDD §3.2, ARCH §2.3 |
> | Phone lens at `up*1.98 + facing*0.12` (§3.3) | head height 1.72 m, 0.05 m forward | GDD §3.3 |
> | Hero screen 128×192 (§2.3) | 128×256 | GDD §2.1, ART §7.2 |
> | Body font Noto Sans SC (§5) | ZCOOL KuaiLe body; full stack in ART §8.3 | ART §8.3 |
> | `__game` shape: `setFlags`, `skipTo`, `?poi=`, `?skipIntro` (§7.3) | `GameDebug` in ARCH §2.7 / §2.9; URL params GDD §19.1 (`?skipTitle`, `?at=`, `?chapter=`) | GDD §19, ARCH §2.9–§2.10 |
> | `@playwright/test` config as the main runner (§7.2) | `scripts/smoke.mjs` / `scripts/shot.mjs` with a 2-slot browser semaphore; `@playwright/test` optional | ARCH §4.4 |

Legend: ✅ = verified by running it here · 🔎 = verified by reading r186 / package source · 💡 = recommendation.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Versions | `three@0.186.1`, `@types/three@0.186.0`, `vite@8.3.1`, `typescript@~6.0.3`, `vitest@5.0.2`, `@playwright/test@1.63.0` (§1) |
| Renderer | `WebGLRenderer({ antialias:false })`, `outputColorSpace = SRGBColorSpace`, **`toneMapping = NoToneMapping`** (§2.1) |
| Post | **No EffectComposer.** One scene pass into a 2-attachment MRT G-buffer (color + normal/inkId, with a depth texture), then **one** fullscreen "ink" `ShaderMaterial` that does outlines, sky, paper grain, and linear→sRGB (§2.2) ✅ |
| G-buffer format | **`UnsignedByteType`, with `textures[0].colorSpace = SRGBColorSpace`** (hardware SRGB8_ALPHA8). HalfFloat is about 2× slower on SwiftShader ✅ |
| Materials | `MeshToonMaterial` + 3-texel `gradientMap` (NearestFilter) + `patchForGBuffer()` (onBeforeCompile). Flat colors are baked as vertex colors so merged meshes stay one draw call (§2.3) ✅ |
| Lights | 1 `HemisphereLight` + 1 `DirectionalLight` that **follows the player**. Keep sun+ambient ≈ π so the lit band shows the authored color (§2.3) ✅ |
| Shadows | **One directional shadow map, `BasicShadowMap`, 1024², ±14 m ortho box around the player** (crisp and cheap). Don't use PCFSoftShadowMap: it was removed in r186 (§4) ✅ |
| Planet | Centered at the origin, R ≈ 40 m in the prototype (**production: R = 80**, see the banner). Movement uses a parallel-transported tangent frame. Collisions are 2D in the log-map chart. Horizon culling is free (§3) ✅ (12 vitest cases) |
| Budget (SwiftShader, 1280×720) | Prototype aim: ≤ 60 draw calls and ≤ 100k triangles *rendered* (the shadow pass counts too), 1 shadow map, 1 fullscreen pass. Measured at ~40 ms per frame, ~29 fps realtime (§4) ✅. **Production caps: 120 calls / 150k tris, targets 80 / 110k (ARCH §5.1).** |
| Text | 2D UI and dialogue are **DOM/CSS** overlays. In-world text uses a `CanvasTexture` drawn after `document.fonts.load(font, exactText)` (§5) ✅ |
| Audio | Procedural WebAudio, one `AudioContext` unlocked on the first gesture. It can be tested with `OfflineAudioContext` (§6) ✅ |
| Tests | `vitest` for pure logic (`src/**/*.test.ts`) and `@playwright/test` against `vite preview` with the SwiftShader flags. `?test` mode pauses the rAF loop, and tests drive `window.__game.step()` for deterministic screenshots (§7) ✅ |

---

## 1. Toolchain and versions

### 1.1 Pins (npm registry, 2026-09-29)

| Package | Pin | Notes |
|---|---|---|
| `three` | `0.186.1` | 🔎 `REVISION = '186'`. Exports `"."`, `"./addons/*"` → `examples/jsm/*`, `"./webgpu"`, `"./tsl"` |
| `@types/three` | `0.186.0` | Latest. `typeScriptVersion: 5.6`, dist-tags up to `ts6.0` |
| `vite` | `8.3.1` | Rolldown-based (`rolldown ~1.2.9`). Node `^20.19 \|\| >=22.12` (this machine has Node 24.18) |
| `typescript` | `~6.0.3` | 💡 `latest` is now **7.0.2** (the native Go port, whose JS API only ships `./unstable/*`). create-vite 9.2.1's `template-vanilla-ts` pins `~6.0.2`. ✅ Both 6.0.3 and 7.0.2 typecheck the prototype cleanly. Stay on 6 for ecosystem compatibility. TS 7 is fine if you only need `tsc --noEmit` |
| `vitest` | `5.0.2` | Peer `vite ^6.4 \|\| ^7 \|\| ^8`. Node `^22.12 \|\| ^24 \|\| >=26` |
| `@playwright/test` | `1.63.0` | Depends on `playwright@1.63.0`. Don't install another Playwright version |

**Playwright browser compatibility** ✅: `playwright-core@1.63.0/browsers.json` lists `chromium` and `chromium-headless-shell` **revision 1243**
(Chrome for Testing 153.0.8010.12). `~/.cache/ms-playwright/` already has `chromium-1243` and `chromium_headless_shell-1243`
(plus the older `-1223`), so **don't run `npx playwright install`**. Nothing needs downloading. Firefox and WebKit are not cached; test Chromium only.

### 1.2 `package.json` (repo root)

```json
{
  "name": "camera-man-modern",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test",
    "e2e:update": "playwright test --update-snapshots"
  },
  "dependencies": { "three": "0.186.1" },
  "devDependencies": {
    "@types/three": "0.186.0",
    "@playwright/test": "1.63.0",
    "typescript": "~6.0.3",
    "vite": "8.3.1",
    "vitest": "5.0.2"
  }
}
```

### 1.3 `tsconfig.json` ✅ (typechecks with TS 6.0.3 and 7.0.2)

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

Gotchas from the template flags:
- `erasableSyntaxOnly` rejects TS **parameter properties** (`constructor(private r: X)`), `enum`, and `namespace`. Declare fields explicitly and use `as const` objects instead of enums. ✅ (I hit this)
- `verbatimModuleSyntax` requires `import { type Foo }` for type-only imports.
- `three/addons/...` imports resolve with types under `moduleResolution: bundler` ✅.

### 1.4 `vite.config.ts` ✅

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                                    // relative URLs: dist/ works from any static server / subpath
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 }, // three alone is ~560 kB min (144 kB gz)
  test: {
    include: ['src/**/*.test.ts'],               // REQUIRED: otherwise vitest also runs e2e/*.spec.ts and fails ✅
    environment: 'node',                         // three's math classes work in node; no jsdom needed
  },
});
```

Vite 8 notes 🔎: `build.rollupOptions` is now a deprecated alias of **`build.rolldownOptions`**, and `worker.rollupOptions` becomes `worker.rolldownOptions`.
Top-level `await` in `main.ts` builds fine ✅.

---

## 2. Rendering pipeline (the "abeto" look)

The target look is flat 2–3-band cel shading, wobbly dark ink outlines (silhouettes, **interior creases**, and part
boundaries), a painted teal sky with flat clouds, and paper grain. Sampled from the reference screenshots:
sky `#65C1BC`, cloud `#A0E6D6`, road `#6F908F`, ink `#1E262B`, title background `#65C1BC`. ART_DIRECTION owns the palette.

### 2.1 Renderer setup and color management ✅

```ts
import { WebGLRenderer, SRGBColorSpace, NoToneMapping, BasicShadowMap } from 'three';

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));  // tests force 1
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;   // default; only applies when rendering to the canvas (target null)
renderer.toneMapping = NoToneMapping;         // flat palette: ACES/AgX/Neutral would shift every authored color
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = BasicShadowMap;
renderer.info.autoReset = false;              // we call render() several times per frame; reset manually
```

Color rules (🔎 r186 `ColorManagement.enabled === true`, working space = `LinearSRGBColorSpace`):
1. **Author colors as sRGB hex through `new Color('#e8a33c')` / `material.color.set(...)`.** They get converted to linear.
   The same applies to vertex colors and to `ShaderMaterial` uniforms: fill them from a `Color`, never from raw `hex/255` numbers,
   or everything comes out washed-out after output encoding.
2. **Every `CanvasTexture` / `DataTexture` that holds color must set `tex.colorSpace = SRGBColorSpace`.** Data textures
   such as `gradientMap`, noise, and normals keep the default `NoColorSpace`.
3. Built-in materials apply tone mapping and `linearToOutputTexel` **only when rendering to the canvas** (🔎 `WebGLPrograms`:
   `toneMapping` is used only if `currentRenderTarget === null`; `outputColorSpace` = working space inside render targets).
   So everything written into the G-buffer is linear, and the final ink `ShaderMaterial` does the sRGB encode with
   `#include <colorspace_fragment>` because it draws to the canvas. **If you ever render the ink pass into an RT, you
   must add `OutputPass` (or your own `sRGBTransferOETF`) at the end.**
4. With `ShaderMaterial`, three still prepends `colorspace_pars_fragment` and defines `linearToOutputTexel()` 🔎. To get the
   same output handling as built-ins, end your shader with `#include <tonemapping_fragment>` / `#include <colorspace_fragment>`.
   `RawShaderMaterial` gets none of this.
5. WebGL1 is gone (r163+). Every non-raw material is compiled as `#version 300 es`. `gl_FragColor` still works through
   `#define gl_FragColor pc_fragColor`. With `glslVersion: GLSL3` you must declare your own `out` variables 🔎.

### 2.2 G-buffer (MRT) + single ink pass ✅

Why this design: an outline needs depth and normals. You could get normals with a second geometry pass
(`scene.overrideMaterial = MeshNormalMaterial`, the approach `RenderPixelatedPass` uses), but that measured **+6 ms/frame** at 720p on SwiftShader ✅.
MRT gets normals, depth, and a per-part **ink id** in the same pass for almost nothing. The ink id is what draws the
"interior" lines between coplanar parts, such as windows on a wall or road vs sidewalk, which normal edges miss.

🔎 r186 API: `new WebGLRenderTarget(w, h, { count, type, depthTexture, minFilter, magFilter, samples, ... })`.
Attachments are `rt.textures[i]` (`rt.texture === rt.textures[0]`). `WebGLMultipleRenderTargets` **no longer exists**.
`DepthTexture(width, height, type = UnsignedIntType, ...)`. `FullScreenQuad` is exported from
`three/addons/postprocessing/Pass.js`.

**Contract:** every material drawn into the G-buffer must write attachment 1. A fragment shader that doesn't write an
enabled draw buffer leaves undefined data there, which shows up as garbage outlines. Wrap every scene material in
`patchForGBuffer()`, which works for Toon, Lambert, Phong, Standard, Physical, Matcap, and Basic because all of them end with `#include <dithering_fragment>` 🔎.
Materials without `normal_fragment_begin` (Basic) write a camera-facing normal.

```ts
// src/render/inkPipeline.ts: verified prototype code (UnsignedByte + sRGB defaults)
import {
  Color, DepthTexture, Matrix4, NearestFilter, SRGBColorSpace, ShaderMaterial, UnsignedByteType,
  Vector2, Vector3, WebGLRenderTarget,
  type Material, type PerspectiveCamera, type Scene, type TextureDataType, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Make any built-in material also write view-space normal + ink id to G-buffer attachment 1. */
export function patchForGBuffer<T extends Material>(mat: T, inkBase = 0): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.inkBase = { value: inkBase };           // per-material uniform (onBeforeCompile runs per material)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float inkId;\nvarying float vInkId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkId = inkId;'); // missing attribute reads 0
    const hasNormal = /#include <normal_fragment_begin>/.test(shader.fragmentShader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nlayout(location = 1) out highp vec4 gNormalId;\nvarying float vInkId;\nuniform float inkBase;')
      .replace('#include <dithering_fragment>',
        `#include <dithering_fragment>\ngNormalId = vec4(${hasNormal ? 'normalize(normal)' : 'vec3(0.0, 0.0, 1.0)'} * 0.5 + 0.5, fract((vInkId + inkBase) * 0.618034));`);
  };
  mat.customProgramCacheKey = () => 'gbuf-v1'; // identical patch everywhere -> programs are shared; bump if the patch changes
  return mat;
}

export interface InkOptions { gbufferType?: TextureDataType; lineWidthPx?: number; srgbColor?: boolean }

export class InkPipeline {
  readonly gbuffer: WebGLRenderTarget;
  readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly size = new Vector2();
  private readonly renderer: WebGLRenderer;                  // (no parameter properties: erasableSyntaxOnly)

  constructor(renderer: WebGLRenderer, opts: InkOptions = {}) {
    this.renderer = renderer;
    renderer.getDrawingBufferSize(this.size);
    const { x: w, y: h } = this.size;
    this.gbuffer = new WebGLRenderTarget(w, h, {
      count: 2,                                   // [0] lit color, [1] normal*0.5+0.5 + hashed ink id
      type: opts.gbufferType ?? UnsignedByteType, // HalfFloatType measured ~2x slower on SwiftShader
      minFilter: NearestFilter, magFilter: NearestFilter,
      depthTexture: new DepthTexture(w, h),
    });
    if (opts.srgbColor ?? true) this.gbuffer.textures[0].colorSpace = SRGBColorSpace; // SRGB8_ALPHA8: no dark banding
    this.material = new ShaderMaterial({
      name: 'InkPass',
      uniforms: {
        tColor: { value: this.gbuffer.textures[0] }, tNormalId: { value: this.gbuffer.textures[1] },
        tDepth: { value: this.gbuffer.depthTexture },
        resolution: { value: this.size.clone() }, cameraNear: { value: 0.1 }, cameraFar: { value: 200 },
        projInv: { value: new Matrix4() }, camWorld: { value: new Matrix4() }, localUp: { value: new Vector3(0, 1, 0) },
        time: { value: 0 }, lineWidth: { value: opts.lineWidthPx ?? 1.25 },
        inkColor: { value: new Color('#1d2326') }, skyTop: { value: new Color('#4fb3b0') },
        skyHorizon: { value: new Color('#9ee0d4') }, cloudColor: { value: new Color('#d9f2ea') },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tColor, tNormalId, tDepth;
        uniform vec2 resolution;
        uniform float cameraNear, cameraFar, time, lineWidth;
        uniform mat4 projInv, camWorld;
        uniform vec3 localUp, inkColor, skyTop, skyHorizon, cloudColor;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float vnoise3(vec3 p) { return 0.5 * (vnoise(p.xy + p.z * 1.7) + vnoise(p.zx * 1.3 - p.y)); }
        float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p *= 2.03; a *= 0.5; } return s; }
        float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
        vec3 sky(vec2 uv) {                                   // world-direction sky: stable while the camera turns
          vec4 v = projInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
          vec3 dir = normalize((camWorld * vec4(v.xyz / v.w, 0.0)).xyz);
          float h = clamp(dot(dir, localUp), 0.0, 1.0);
          vec3 base = mix(skyHorizon, skyTop, smoothstep(0.0, 0.6, h));
          float n = fbm3(dir * 2.2 + vec3(time * 0.01, 0.0, 0.0));
          float cloud = step(0.56, n);
          float edge = 1.0 - smoothstep(0.0, fwidth(n) * 1.2, abs(n - 0.56));
          vec3 c = mix(base, cloudColor, cloud * 0.85);
          return mix(c, mix(c, inkColor, 0.35), edge);
        }
        void main() {
          vec2 px = 1.0 / resolution;
          float t = floor(time * 6.0);                                      // line "boil" at 6 Hz
          vec2 wob = vec2(vnoise(vUv * 11.0 + t * 1.7), vnoise(vUv * 11.0 + 17.0 - t * 1.3)) - 0.5;
          vec2 uv = vUv + wob * px * 3.0;                                   // wobble only the LINES, not the fills
          vec3 col;
          if (texture2D(tDepth, uv).x >= 0.99999) {
            col = sky(vUv);
          } else {
            col = texture2D(tColor, vUv).rgb;
            float dc = viewDepth(uv);
            vec4 nc = texture2D(tNormalId, uv);
            float lw = lineWidth * mix(1.0, 0.55, smoothstep(8.0, 60.0, dc));
            float edge = 0.0;
            vec2 offs[4] = vec2[](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1));
            for (int i = 0; i < 4; i++) {
              vec2 suv = uv + offs[i] * px * lw;
              float ds = viewDepth(suv);
              vec4 ns = texture2D(tNormalId, suv);
              edge = max(edge, step(0.06 * dc + 0.05, ds - dc));                              // silhouette, near side only
              edge = max(edge, step(0.45, 1.0 - dot(nc.xyz * 2.0 - 1.0, ns.xyz * 2.0 - 1.0)));  // crease > ~57 deg
              edge = max(edge, step(0.02, abs(nc.w - ns.w)) * step(ds, dc + 0.5));             // part boundary (ink id)
            }
            edge *= step(0.18, vnoise(vUv * resolution * 0.08 + t));        // dry-brush breaks
            col = mix(col, inkColor, edge * 0.92);
          }
          col *= 0.97 + 0.06 * hash(floor(vUv * resolution * 0.5));        // paper grain
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number): void {
    const pr = this.renderer.getPixelRatio();
    const w = Math.floor(width * pr), h = Math.floor(height * pr);
    this.gbuffer.setSize(w, h);                                   // also resizes the depthTexture
    this.material.uniforms.resolution.value.set(w, h);
  }

  render(scene: Scene, camera: PerspectiveCamera, time: number, localUp: Vector3): void {
    const u = this.material.uniforms;
    u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
    u.projInv.value.copy(camera.projectionMatrixInverse); u.camWorld.value.copy(camera.matrixWorld);
    u.localUp.value.copy(localUp); u.time.value = time;
    this.renderScene(scene, camera);
    this.renderInk();
  }

  renderScene(scene: Scene, camera: PerspectiveCamera): void {          // split out so tests can time each half
    const r = this.renderer;
    r.setRenderTarget(this.gbuffer); r.clear(); r.render(scene, camera);   // shadow map renders inside this call
  }

  renderInk(): void {
    this.renderer.setRenderTarget(null); this.quad.render(this.renderer); // -> canvas, sRGB encoded
  }

  dispose(): void { this.gbuffer.depthTexture?.dispose(); this.gbuffer.dispose(); this.material.dispose(); this.quad.dispose(); }
}
```

Tuning notes:
- **Ink ids** are hashed into [0,1) (`fract(id*0.618)`), so an 8-bit target can still tell parts apart. Give each *visually
  distinct part* its own small integer id, via the `inkId` vertex attribute for merged meshes or `inkBase` per material.
  Two adjacent parts with the same id get no line between them.
- `lineWidth` is in *device* pixels. Multiply it by `renderer.getPixelRatio()` if the DPR changes. Use 1.25–2 for 720p.
- **Sky cost:** the procedural fbm sky costs **~8.5 ms** at 720p on SwiftShader ✅ (ink pass 23 ms → 14 ms with a flat gradient).
  💡 Replace the fbm with 1–2 lookups into a pre-painted cloud `CanvasTexture` (equirect by `dir`), or cut it to 2 octaves.
- **Title screen** (planet floating on a flat teal background): in the sky branch output a flat color plus speckles (add a `uniform float skyMode`),
  and frame the whole planet with the same pipeline.
- **Lines on the sky/cloud edge** come from the depth test (sky depth = 1 → the near side gets a silhouette line) ✅.
- If a later agent really needs extra passes (bloom for a "haunted" glow, say), keep G-buffer → ink, but render the ink into an
  `UnsignedByteType` RT and chain `ShaderPass`es, then finish with `OutputPass`. Don't use EffectComposer's default RT:
  it's `HalfFloatType` 🔎 (slow here). Pass your own `new WebGLRenderTarget(w,h,{type: UnsignedByteType})` to `new EffectComposer(renderer, rt)`.

**Things not to use:**
- `OutlinePass` is for selection highlights (multiple extra passes, soft glow). It's the wrong look and expensive.
- The r186 `new WebGLRenderer({ outputBufferType: HalfFloatType })` + `renderer.setEffects([...])` built-in chain is new (🔎 `WebGLOutput.js`).
  It requires HalfFloat, which is slow on SwiftShader, and provides no MRT, so don't use it.
- WebGPU/TSL (`three/webgpu`) is off-limits because the constraint says WebGLRenderer.

### 2.3 Materials, geometry baking, lights

```ts
import { DataTexture, RedFormat, NearestFilter, MeshToonMaterial, BufferAttribute, Color, BufferGeometry } from 'three';

/** 3-band toon ramp. NearestFilter is mandatory or the bands blur. ✅ RedFormat + Uint8Array works in r186. */
export function toonRamp(levels = [0.45, 0.72, 1.0]): DataTexture {
  const tex = new DataTexture(new Uint8Array(levels.map((l) => Math.round(l * 255))), levels.length, 1, RedFormat);
  tex.minFilter = tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Bake flat color + ink id into a geometry so many differently-colored parts merge into ONE draw call. */
export function paint(geo: BufferGeometry, hex: string, inkId: number): BufferGeometry {
  const n = geo.getAttribute('position').count;
  const c = new Color(hex);                         // sRGB hex -> linear, correct for vertex colors
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('inkId', new BufferAttribute(new Float32Array(n).fill(inkId), 1));
  return geo;
}

const ramp = toonRamp();
const townMat = patchForGBuffer(new MeshToonMaterial({ gradientMap: ramp, vertexColors: true }));
```

**Light intensity calibration** ✅ (measured: white `MeshToonMaterial`, light straight on, linear readback).
`DirectionalLight` intensity **π → 1.0** and intensity 1 → 0.318. `AmbientLight` is the same, and `HemisphereLight` follows the same rule.
In r155+ (the `useLegacyLights` path was removed in r165), lit value = albedo × (ramp × I_sun + I_ambient) / π.
💡 Keep `I_sun + I_hemi ≈ π` so the top band shows exactly the authored palette color. Example: sun 2.0 plus hemisphere 1.1
(sky `#cfe9ea`, ground `#6b7f86`, which gives the bluish shadows from the reference).

**Sun that follows the player** (on a tiny planet a fixed world light would leave half the planet at night):
```ts
const sun = new DirectionalLight('#fff4e0', 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);                       // target must be in the scene so its matrixWorld updates
// every frame, in the hero's local frame (up, heading):
const right = new Vector3().crossVectors(heading, up);
sunDir.copy(up).multiplyScalar(0.8).addScaledVector(heading, -0.35).addScaledVector(right, 0.45).normalize();
sun.target.position.copy(heroPos);
sun.position.copy(heroPos).addScaledVector(sunDir, 30);
```
Snap the shadow camera position to shadow-texel increments if shadow edges swim while walking.

**Geometry rules** 🔎:
- `mergeGeometries(geos, useGroups = false)` from `three/addons/utils/BufferGeometryUtils.js` (renamed from
  `mergeBufferGeometries` in r151, which is **gone**). It **returns `null`** (and logs) unless **all inputs are indexed or all
  are non-indexed** and have **exactly the same attribute set**. Primitives differ: `Box/Cylinder/Capsule/Plane` are indexed, and
  `Icosahedron/Polyhedron` are non-indexed. Normalize with `.toNonIndexed()`, and `paint()` everything so `color` and `inkId` exist everywhere.
- `CapsuleGeometry(radius, height, capSegments = 4, radialSegments = 8, heightSegments = 1)` in r186.
- `InstancedMesh`: after `setMatrixAt` calls, set `instanceMatrix.needsUpdate = true` **and call `computeBoundingSphere()`**.
  The bounding sphere is computed lazily once and then cached, so moved instances get wrongly frustum-culled. Raycast hits give `instanceId`.
- Merge static geometry **per spatial chunk** (e.g. 12 longitude sectors, or district cells), not into one mesh for the whole planet.
  Chunked meshes still get frustum and horizon culling (§3.6).
- Author models **Y-up and facing +Z**, the `Object3D.lookAt` convention. `orientationFromUpForward()` in §3 assumes this.

**Phone-head hero:** the lens faces +Z (forward), so from the over-the-shoulder camera the player sees the **phone screen on the back of the head**.
That screen can be a small `CanvasTexture` (128×192) redrawn at 2–4 Hz with emoji-like "expressions" or clue UI. Set `tex.needsUpdate = true` after each redraw.

### 2.4 Verified import paths (r186)

```ts
import { /* core */ WebGLRenderer, WebGLRenderTarget, DepthTexture, Timer, Raycaster, Layers, InstancedMesh,
  BatchedMesh, MeshToonMaterial, ShaderMaterial, CanvasTexture, DataTexture, SRGBColorSpace, NoToneMapping,
  BasicShadowMap, PCFShadowMap, VSMShadowMap, UnsignedByteType, HalfFloatType, RedFormat, NearestFilter } from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';     // (scene, camera, overrideMaterial?, clearColor?, clearAlpha?)
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';     // (shader, textureID = 'tDiffuse')
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';     // tone map + color space from renderer
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';         // new wrapper; must come AFTER OutputPass
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js'; // reference for normal/depth edges
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
```
`Timer` is core (🔎 `Clock` is **deprecated since r183** and warns): `timer.connect(document)` (pauses across hidden tabs), then call
`timer.update(timestamp)` every frame and read `timer.getDelta()`. `EffectComposer` itself now uses `Timer`.

### 2.5 Breaking changes / deprecations r150 → r186 that bite old snippets

| Change | Since | Status in r186 |
|---|---|---|
| `mergeBufferGeometries` → `mergeGeometries` | r151 | old name absent 🔎 |
| `texture.encoding` / `renderer.outputEncoding` / `sRGBEncoding` → `colorSpace` / `outputColorSpace` / `SRGBColorSpace` | r152 (old removed r162) | old names absent from the build 🔎 |
| Color management on by default | r152 | `ColorManagement.enabled = true` 🔎 |
| Physically-correct light units (`useLegacyLights` removed) | r155 / r165 | ✅ intensity π = full albedo |
| WebGL1 removed; all shaders GLSL ES 3.00 | r163 | 🔎 |
| `WebGLMultipleRenderTargets` removed → `new WebGLRenderTarget(w,h,{count})` + `.textures[]` | r162–r172 | absent 🔎 |
| `ColorManagement.fromWorkingColorSpace/toWorkingColorSpace` → `workingToColorSpace/colorSpaceToWorking` | r177 | old names warn 🔎 |
| `Clock` → `Timer` (core) | r183 | `Clock` warns 🔎 |
| WebGPU `PostProcessing` → `RenderPipeline` (irrelevant for WebGL) | r183 | 🔎 |
| `Matrix3.scale/rotate/translate` → `makeScale/makeRotation/makeTranslation` | r185 | warn 🔎 |
| GLSL chunk fn `inverseTransformDirection` → `transformDirectionByInverseViewMatrix` (alias kept) | r185 | 🔎 matters for `onBeforeCompile` string replaces |
| `PCFSoftShadowMap` deprecated; WebGLShadowMap warns and **uses PCFShadowMap** | r186 | 🔎 PCF is now 5-tap Vogel disk + interleaved-gradient-noise rotation, which gives per-pixel grain |
| `Source` → `TextureSource` | r186 | warn 🔎 |
| New `RenderTarget` options `resolveDepthBuffer`, `multiview`, `useArrayDepthTexture`; `readRenderTargetPixels(..., textureIndex)` for MRT readback | r16x–r186 | 🔎 |

---

## 3. Tiny-planet gameplay math ✅

The planet is centered at the world origin with radius `R` (the prototype uses **R = 40 m** with 1 unit = 1 m. It reads as a clearly curved horizon, and the hero is 1.8 m tall).
Local up = `normalize(pos)`. The walker has a **camera heading** tangent vector (mouse X rotates it) and a **facing** tangent
vector (the model turns toward the move direction). Each step **rotates position and both tangents by the same quaternion**
(parallel transport), so there are no pole singularities, no drift, and no Euler angles. After a full lap the heading comes back exactly ✅.

Collision is 2D in the **log-map (azimuthal equidistant) chart** centered on each collider. Circles are exact geodesic.
Boxes are exact up to about (size/R)².

The whole module below is pure (no DOM) and covered by **12 passing vitest cases** (full lap, pole crossing, log/exp round trip,
orientation basis, circle and box push-out, wall sliding, follow camera framing, interactable picking, and horizon culling).

```ts
// src/world/sphere.ts
import { Matrix4, Quaternion, Vector3, type Camera } from 'three';

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _m = new Matrix4();

export function upAt(pos: Vector3, out = new Vector3()): Vector3 { return out.copy(pos).normalize(); }

/** Project v onto the tangent plane of unit `up` and normalize. Never NaN. */
export function projectOnTangent(v: Vector3, up: Vector3, out = new Vector3()): Vector3 {
  out.copy(v).addScaledVector(up, -v.dot(up));
  if (out.lengthSq() < 1e-12) {
    out.set(1, 0, 0);
    if (Math.abs(up.x) > 0.9) out.set(0, 0, 1);
    out.addScaledVector(up, -out.dot(up));
  }
  return out.normalize();
}

/** Walk `dist` along the great circle from `pos` toward tangent `dir`. Mutates pos (|pos| kept).
 *  Returns the applied rotation so callers can parallel-transport other tangents. */
export function walkOnSphere(pos: Vector3, dir: Vector3, dist: number, outRot = new Quaternion()): Quaternion {
  const r = pos.length();
  const axis = _a.crossVectors(pos, dir);
  const len = axis.length();
  if (len < 1e-9 || dist === 0 || r === 0) return outRot.identity();
  outRot.setFromAxisAngle(axis.divideScalar(len), dist / r);
  pos.applyQuaternion(outRot).setLength(r);
  return outRot;
}

/** Unit-sphere log map: tangent at `from` pointing to `to`, |v| = angle (rad). */
export function logMap(from: Vector3, to: Vector3, out = new Vector3()): Vector3 {
  const c = Math.min(1, Math.max(-1, from.dot(to)));
  out.copy(to).addScaledVector(from, -c);
  const l = out.length();
  if (l < 1e-12) return out.set(0, 0, 0);
  return out.multiplyScalar(Math.acos(c) / l);
}

/** Unit-sphere exp map: follow tangent `v` (|v| = angle) from `from`. */
export function expMap(from: Vector3, v: Vector3, out = new Vector3()): Vector3 {
  const ang = v.length();
  if (ang < 1e-12) return out.copy(from);
  const s = Math.sin(ang) / ang, c = Math.cos(ang);
  return out.set(from.x * c + v.x * s, from.y * c + v.y * s, from.z * c + v.z * s).normalize();
}

export function arcDistance(a: Vector3, b: Vector3, r: number): number {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b) / (a.length() * b.length())))) * r;
}

/** Orientation for a model authored Y-up, facing +Z: basis (right = up × fwd, up, fwd). */
export function orientationFromUpForward(up: Vector3, forward: Vector3, out = new Quaternion()): Quaternion {
  const f = projectOnTangent(forward, up, _c);
  const right = _a.crossVectors(up, f).normalize();
  const fwd = _b.crossVectors(right, up).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(right, up, fwd));
}

/** Stable "north" tangent at unit `up` (for authoring placements with a yaw). */
export function northAt(up: Vector3, out = new Vector3()): Vector3 {
  const ref = Math.abs(up.y) < 0.99 ? _c.set(0, 1, 0) : _c.set(0, 0, -1);
  return projectOnTangent(ref, up, out);
}

/** lat 0 = equator, lon 0 = +Z, lon increases toward +X. */
export function dirFromLatLon(lat: number, lon: number, out = new Vector3()): Vector3 {
  return out.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

// ---- collision --------------------------------------------------------------------------
export interface CircleCollider { kind: 'circle'; n: Vector3; r: number }                  // n = unit center dir
export interface BoxCollider { kind: 'box'; n: Vector3; forward: Vector3; halfW: number; halfD: number } // in metres
export type Collider = CircleCollider | BoxCollider;

const _pn = new Vector3(), _v = new Vector3(), _right = new Vector3();

export function resolveCollider(pos: Vector3, playerR: number, col: Collider, planetR: number): boolean {
  _pn.copy(pos).normalize();
  const bound = col.kind === 'circle' ? col.r : Math.hypot(col.halfW, col.halfD);
  if (_pn.dot(col.n) < Math.cos(Math.min(Math.PI, (bound + playerR) / planetR))) return false; // broad phase
  const v = logMap(col.n, _pn, _v).multiplyScalar(planetR);   // local 2D offset (metres) in collider chart
  if (col.kind === 'circle') {
    const d = v.length(), minD = col.r + playerR;
    if (d >= minD) return false;
    if (d < 1e-6) projectOnTangent(_a.set(1, 0.3, 0.2), col.n, v);
    v.setLength(minD / planetR);
  } else {
    _right.crossVectors(col.n, col.forward).normalize();
    const x = v.dot(_right), z = v.dot(col.forward);
    const cx = Math.min(col.halfW, Math.max(-col.halfW, x)), cz = Math.min(col.halfD, Math.max(-col.halfD, z));
    let dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    let nx: number, nz: number;
    if (d < 1e-9) {                                      // center inside: leave through the nearest face
      if (col.halfW - Math.abs(x) < col.halfD - Math.abs(z)) { nx = Math.sign(x || 1) * (col.halfW + playerR); nz = z; }
      else { nx = x; nz = Math.sign(z || 1) * (col.halfD + playerR); }
    } else {
      if (d >= playerR) return false;
      dx /= d; dz /= d;
      nx = cx + dx * playerR; nz = cz + dz * playerR;
    }
    v.copy(_right).multiplyScalar(nx).addScaledVector(col.forward, nz).divideScalar(planetR);
  }
  expMap(col.n, v, pos).multiplyScalar(planetR);
  return true;
}

export function resolveAll(pos: Vector3, playerR: number, cols: readonly Collider[], planetR: number, iterations = 2): void {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of cols) moved = resolveCollider(pos, playerR, c, planetR) || moved;
    if (!moved) break;
  }
}

// ---- walker -----------------------------------------------------------------------------
export interface MoveInput { x: number; y: number }   // x = strafe right, y = forward, each in [-1, 1]

export class SphereWalker {
  readonly pos: Vector3;
  readonly heading = new Vector3();   // camera heading (tangent). mouse-X rotates it; walking transports it
  readonly facing = new Vector3();    // character facing (tangent). model faces +Z
  readonly quaternion = new Quaternion();
  speed = 4;                          // m/s
  turnRate = 12;                      // 1/s, exponential smoothing
  private readonly _up = new Vector3();
  private readonly _move = new Vector3();
  private readonly _rot = new Quaternion();

  constructor(start: Vector3, heading: Vector3) {
    this.pos = start.clone();
    const up = upAt(this.pos, this._up);
    projectOnTangent(heading, up, this.heading);
    this.facing.copy(this.heading);
    orientationFromUpForward(up, this.facing, this.quaternion);
  }
  get up(): Vector3 { return upAt(this.pos, this._up); }
  /** +rad = turn left (CCW seen from above). Mouse: walker.yaw(-e.movementX * 0.005). */
  yaw(rad: number): void { this.heading.applyAxisAngle(this.up, rad); }

  update(input: MoveInput, dt: number, colliders: readonly Collider[] = [], playerR = 0.4): void {
    const up = this.up;
    const right = _a.crossVectors(this.heading, up);   // screen-right for a camera looking along heading
    const move = this._move.copy(this.heading).multiplyScalar(input.y).addScaledVector(right, input.x);
    const mag = Math.min(1, move.length());
    if (mag > 1e-4) {
      move.normalize();
      const r = this.pos.length();
      const rot = walkOnSphere(this.pos, move, this.speed * mag * dt, this._rot);
      if (colliders.length) resolveAll(this.pos, playerR, colliders, r);
      const newUp = upAt(this.pos, this._up);
      projectOnTangent(this.heading.applyQuaternion(rot), newUp, this.heading);
      move.applyQuaternion(rot);
      projectOnTangent(this.facing.applyQuaternion(rot), newUp, this.facing);
      const k = 1 - Math.exp(-this.turnRate * dt);
      if (this.facing.dot(move) < -0.99) this.facing.addScaledVector(_b.crossVectors(newUp, move), 0.1); // avoid 180° degeneracy
      this.facing.lerp(move, k);
      projectOnTangent(this.facing, newUp, this.facing);
    } else {
      projectOnTangent(this.heading, up, this.heading);
      projectOnTangent(this.facing, up, this.facing);
    }
    orientationFromUpForward(this.up, this.facing, this.quaternion);
  }
}

/** Third-person camera: behind `heading`, raised by `pitch`, local up. */
export function placeFollowCamera(camera: Camera, walker: SphereWalker,
  opts: { distance: number; height: number; pitch: number; lookHeight: number }): void {
  const up = walker.up;
  const offset = _a.copy(walker.heading).negate().multiplyScalar(Math.cos(opts.pitch))
    .addScaledVector(up, Math.sin(opts.pitch)).multiplyScalar(opts.distance);
  camera.position.copy(walker.pos).addScaledVector(up, opts.height).add(offset);
  camera.up.copy(up);                         // lookAt() uses camera.up: on a planet it MUST be the local up
  camera.lookAt(_b.copy(walker.pos).addScaledVector(up, opts.lookHeight));
  camera.updateMatrixWorld();
}

// ---- interaction / viewfinder -----------------------------------------------------------
export interface Interactable { pos: Vector3; range: number }

/** Best interactable within range and inside a facing cone (default ±60°). -1 if none. */
export function pickInteractable(walker: SphereWalker, items: readonly Interactable[], coneCos = Math.cos(Math.PI / 3)): number {
  let best = -1, bestScore = Infinity;
  const up = walker.up, r = walker.pos.length();
  for (let i = 0; i < items.length; i++) {
    const d = arcDistance(walker.pos, items[i].pos, r);
    if (d > items[i].range) continue;
    const cos = d < 0.3 ? 1 : projectOnTangent(_a.subVectors(items[i].pos, walker.pos), up, _b).dot(walker.facing);
    if (cos < coneCos) continue;
    const score = d * (2 - cos);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** 0..1: how centered a world point is in the phone viewfinder (0 = outside the frame / behind). No occlusion test. */
export function viewfinderScore(camera: Camera, world: Vector3, frameX = 0.7, frameY = 0.7): number {
  if (_a.copy(world).applyMatrix4(camera.matrixWorldInverse).z >= 0) return 0; // behind camera
  const ndc = _b.copy(world).project(camera);
  if (ndc.z > 1) return 0;
  const f = Math.max(Math.abs(ndc.x) / frameX, Math.abs(ndc.y) / frameY);
  return f >= 1 ? 0 : 1 - f;
}

// ---- horizon culling --------------------------------------------------------------------
/** Max angular separation at which an object of height hObj is still visible from eye height hEye. */
export function horizonAngle(r: number, hEye: number, hObj: number): number {
  return Math.acos(r / (r + Math.max(0, hEye))) + Math.acos(r / (r + Math.max(0, hObj)));
}
export function isBeyondHorizon(eye: Vector3, chunkDir: Vector3, chunkAngRadius: number, chunkMaxHeight: number, r: number): boolean {
  const eyeLen = eye.length();
  const ang = Math.acos(Math.min(1, Math.max(-1, eye.dot(chunkDir) / eyeLen)));
  return ang - chunkAngRadius > horizonAngle(r, eyeLen - r, chunkMaxHeight);
}
```

### 3.1 Placing things on the planet

```ts
function placeMatrix(dir: Vector3, yawRad: number, lift: number, R: number, out = new Matrix4()): Matrix4 {
  const up = dir.clone().normalize();
  const fwd = northAt(up).applyAxisAngle(up, yawRad);          // yaw CCW from local north
  return out.compose(up.clone().multiplyScalar(R + lift), orientationFromUpForward(up, fwd), new Vector3(1, 1, 1));
}
// static: geometry.applyMatrix4(placeMatrix(...)) then merge per chunk; instanced: mesh.setMatrixAt(i, placeMatrix(...))
// collider for a building placed that way:
colliders.push({ kind: 'box', n: dir.clone().normalize(), forward: northAt(dir).applyAxisAngle(dir, yaw), halfW: w / 2, halfD: d / 2 });
```
Heads-up ✅: at the equator, `northAt((0,0,1)) = (0,1,0)`, and yaw +90° points the object's +Z **west** (−X). A `PlaneGeometry` sign faces +Z,
so rotate it to face the approaching player.

### 3.2 Per-frame wiring

```ts
walker.update(input, dt, colliders);                  // dt clamped to <= 1/20 s
hero.position.copy(walker.pos); hero.quaternion.copy(walker.quaternion);
placeFollowCamera(camera, walker, { distance: 6.5, height: 1.8, pitch: 0.28, lookHeight: 1.5 }); // ✅ framing test
```
- **Roads:** don't color roads per triangle on an icosphere. The edges come out zig-zag ✅ (seen in the prototype). Build road/sidewalk
  ribbons as separate strips along great-circle or lat/lon paths, lift them 2–5 cm, and give them their own `inkId`. The outline
  pass then draws crisp curb lines for free.
- **Interiors (if the GDD has them):** use a separate `Scene`. `SphereWalker` with R = 5000 behaves as practically flat
  (float32 precision at 5 km is about 0.5 mm), so the same controller and collision code can be reused.
- **Camera occlusion:** raycast from the head to the desired camera position against **invisible proxy boxes** kept in a plain array.
  🔎 `Raycaster` only checks `object.layers`, not `visible`. Proxies outside the scene need `updateMatrixWorld()` once.
  Pull the camera to `hit.distance - 0.3`.

### 3.3 Raycasting for interaction and photos (🔎 r186 signatures)

```ts
const raycaster = new Raycaster();
raycaster.setFromCamera(ndc /* Vector2 in [-1,1] */, camera);   // setFromCamera(coords, camera)
raycaster.layers.enableAll();                                    // default tests ONLY layer 0
const hits = raycaster.intersectObjects(pickables, false);       // (objects, recursive = true, target = [])
// hits[0].object, .point, .distance, .instanceId (InstancedMesh)

// photo occlusion test: is the target visible from the phone lens?
function visibleFrom(eye: Vector3, target: Vector3, occluders: Object3D[]): boolean {
  const dir = target.clone().sub(eye); const dist = dir.length();
  raycaster.set(eye, dir.divideScalar(dist)); raycaster.near = 0; raycaster.far = dist - 0.2;
  return raycaster.intersectObjects(occluders, false).length === 0;
}
```
**Phone-camera mechanic (✅ prototyped; production uses layer 2 `GHOST`, enabled only in night mode — see the banner):** put the "spirit layer" objects on `layers.set(1)`. In phone view, call `camera.layers.enable(1)`,
place the camera at the lens (`pos + up*1.98 + facing*0.12`), and have `lookAt` use the facing direction. A "photo" succeeds when
`viewfinderScore(camera, target) > threshold && visibleFrom(lens, target, occluders)`. To keep a photo as an album image:
call `renderer.domElement.toDataURL()` **in the same task right after rendering** ✅ (returns a real image without `preserveDrawingBuffer`),
or render into a small RT and read it back with `renderer.readRenderTargetPixels(rt, x, y, w, h, buf, undefined, textureIndex)`.

### 3.4 Horizon culling (free performance) ✅
Behind the horizon, the planet itself hides everything. With R = 40, an eye 4 m up can see a 10 m building only up to
about 58° of arc away, so **~75% of the planet can be skipped**. Once per frame, for each chunk: `mesh.visible = !isBeyondHorizon(camera.position, chunk.dir, chunk.angRadius, chunk.maxHeight, R)`.
Frustum culling still runs on whatever remains.

---

## 4. Performance on headless Chromium + SwiftShader ✅

Environment: Chrome for Testing 153 headless shell, `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`, 8 cores.
WebGL2 extensions: `EXT_color_buffer_float/half_float` ✅, `WEBGL_multi_draw` ✅ (so `BatchedMesh` works), `EXT_clip_control` ✅,
`MAX_DRAW_BUFFERS = 8`, `MAX_SAMPLES = 4`, `MAX_TEXTURE_SIZE = 8192`, and **no `KHR_parallel_shader_compile`** (shader compiles block).
(Without flags, headless Chromium here also falls back to SwiftShader. Keep the flags explicit anyway.)

Prototype scene: planet icosphere at 33.6k triangles, 160 buildings merged into 12 sector meshes, 120 instanced lamp posts,
the hero, a sign, and 1 directional shadow. Viewport 1280×720, DPR 1. Timing is synchronous (render + `readPixels` flush), averaged over 8 frames:

| Variant | Draw calls | Triangles | Frame ms | Scene+shadow pass | Ink pass |
|---|---|---|---|---|---|
| HalfFloat G-buffer, BasicShadowMap | 26 | 54.8k | 65 | 32 | 23 |
| UnsignedByte G-buffer | 26 | 54.8k | 38 | 16 | 22 |
| **UnsignedByte + sRGB color attachment (recommended)** | 26 | 54.8k | **40–42** | 18 | 23 |
| ↳ with a flat sky instead of fbm clouds | 26 | 54.8k | 33 | 17 | 14 |
| ↳ shadows off | 12 | 42.6k | 35 | 12 | 22 |
| ↳ DPR 0.75 | 26 | 54.8k | 28 | 15 | 14 |
| HalfFloat + PCFShadowMap (vs Basic: +5 ms) | 26 | 54.8k | 70 | – | – |
| 600 buildings, merged per sector | 28 | 92.6k | 50 | 27 | 24 |
| 600 buildings, one mesh each (culled) | 172 | 50.7k | 50 | 31 | 23 |
| Extra `overrideMaterial` normal pass (non-MRT alternative) | +12 | – | **+6** | – | – |

Realtime rAF loop while holding W: **29 fps** at 1280×720 (sRGB byte), 38 fps at DPR 0.75 or 960×540, and 21 fps with a HalfFloat G-buffer.
Shaders compile once per material type/define set. The prototype needed 8 programs (9 in phone mode).

**Budget and rules for this project (💡 derived from the numbers above):**
1. Every render target uses `UnsignedByteType`, and color targets set `colorSpace = SRGBColorSpace`. **No HalfFloat anywhere.**
2. ≤ 60 draw calls and ≤ 100k rendered triangles per frame, counting the shadow pass (`renderer.info.render` after a manual `info.reset()`).
   Per-draw overhead is about 0.1 ms, and fill rate dominates. A frame budget of about 45 ms at 720p in SwiftShader keeps
   real GPUs at 60 fps with a big margin.
3. Static town: `paint()` + `mergeGeometries` **per chunk** (12–20 chunks). Repeated props: `InstancedMesh` (one call per prop type).
   Many *different* small meshes: `BatchedMesh` (multi-draw is supported) or merging.
4. **Shadows: one `DirectionalLight` shadow, `BasicShadowMap`, 1024², a ±14 m box that follows the player.** It gives crisp cel-style
   cast shadows like the reference and costs about 6 ms here. Only buildings, big props, and the hero set `castShadow`. Small clutter gets
   a **fake blob shadow** instead: a dark ellipse `Mesh` 2 cm above the ground, `MeshBasicMaterial` with `transparent` + `depthWrite:false`
   (it still needs `patchForGBuffer`). Don't use PCF: it's +5 ms, adds IGN grain, and looks soft/off-style. Don't use VSM.
5. One fullscreen pass (the ink pass). Keep its texture reads ≤ 12 per pixel and swap the procedural sky for a texture lookup.
6. No MSAA (`antialias:false`, `samples:0`). The wobbling ink lines hide aliasing. If needed, add `FXAAPass` *after* the output
   step (it expects sRGB input 🔎).
7. `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))` in the game. Tests use DPR 1.
8. Precompile during the title screen with `renderer.compile(scene, camera)` (or `compileAsync`), so opening phone mode or a new area doesn't stall.
9. Horizon culling (§3.4) and chunked frustum culling. Don't build a single planet-wide mesh.

---

## 5. Canvas textures and Chinese text ✅

- Fonts: Google Fonts is reachable from this machine ✅. CJK families are split into **~90–200 `unicode-range` slices**
  (checked: ZCOOL QingKe HuangYou 92 faces, ZCOOL KuaiLe 93, Ma Shan Zheng 92, Zhi Mang Xing 92, Noto Sans SC 400+700 202, Noto Serif SC 202, LXGW WenKai TC 115).
  Candidates: **ZCOOL QingKe HuangYou** (blocky display lettering, the closest match to the reference title ✅ renders well on
  a sign), **Noto Sans SC** (body/dialogue), **Ma Shan Zheng** / **Zhi Mang Xing** (brush style for 志怪 notes and talismans).
- System fallback installed here: **WenQuanYi Zen Hei** (`fc-list`). Always list it in font stacks so offline runs still render Chinese.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+QingKe+HuangYou&family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet" />
```

```ts
export const FONT_DISPLAY = '"ZCOOL QingKe HuangYou", "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
export const FONT_BODY = '"Noto Sans SC", "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

/** document.fonts.load(font, text) downloads ONLY the unicode-range slices covering `text`:
 *  pass the EXACT string you will draw. Never throws; false on timeout/offline (fallback font is used). */
export async function ensureFont(font: string, text: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const faces = await Promise.race([
      document.fonts.load(font, text),
      new Promise<FontFace[]>((res) => setTimeout(() => res([]), timeoutMs)),
    ]);
    return faces.length > 0;
  } catch { return false; }
}

export function makeSignTexture(text: string, w = 512, h = 256, bg = '#e8a33c', ink = '#1d2326'): CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = ink; g.lineWidth = Math.max(4, w / 90); g.strokeRect(8, 8, w - 16, h - 16); // jitter points for a hand-drawn border
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = h * 0.55; g.font = `${size}px ${FONT_DISPLAY}`;
  const tw = g.measureText(text).width;
  if (tw > w * 0.85) { size *= (w * 0.85) / tw; g.font = `${size}px ${FONT_DISPLAY}`; }
  g.fillText(text, w / 2, h / 2);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;        // REQUIRED for color canvases
  tex.anisotropy = 4;                     // signs are seen at grazing angles
  return tex;
}
// usage (✅ rendered "回魂照相馆" correctly in ZCOOL QingKe HuangYou):
await ensureFont(`96px ${FONT_DISPLAY}`, '回魂照相馆');
const tex = makeSignTexture('回魂照相馆');
```
- **Vertical signage** (common on Chinese shopfronts): draw `[...text]` one character per row. Split with the spread operator, not `split('')`, so surrogate pairs stay intact.
- Redrawn canvas: set `tex.needsUpdate = true`. Keep dynamic canvases small, because each update re-uploads the texture.
- If a font finishes loading *after* the timeout, redraw on `document.fonts.addEventListener('loadingdone', ...)`.
- **UI (dialogue box, name tag, inventory, phone UI, subtitles) = DOM/CSS overlay** above the canvas: crisp CJK text, easy
  styling (white box, dark outline, blue blocky name tag, blue triangle "next" button), and Playwright screenshots include it.
  Use `pointer-events:none` on passive overlays. Wait for `document.fonts.ready` before setting `__game.ready`.

---

## 6. Procedural WebAudio ✅

One `AudioContext`, created or resumed inside the first `pointerdown`/`keydown` handler (autoplay policy). Note that **headless
Chromium starts contexts as `running` without a gesture** ✅, so tests can't catch a missing unlock. Code it anyway.
Sounds are oscillators plus one reusable seeded white-noise buffer, envelopes via `exponentialRampToValueAtTime` (never ramp to 0; use 0.0001),
all into a master `GainNode → DynamicsCompressorNode → destination`.

```ts
export class Sfx {
  readonly ctx: BaseAudioContext; readonly master: GainNode; private noiseBuf: AudioBuffer;
  constructor(ctx?: BaseAudioContext) {                     // pass an OfflineAudioContext in tests
    this.ctx = ctx ?? new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6;
    this.master.connect(this.ctx.createDynamicsCompressor()).connect(this.ctx.destination);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); let s = 1234567;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  }
  async unlock() { if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') await this.ctx.resume(); }
  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  tone(freq: number, at = this.ctx.currentTime, dur = 0.08, type: OscillatorType = 'triangle', vol = 0.2) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    const g = this.ctx.createGain(); this.env(g, at, 0.005, vol, dur);
    o.connect(g).connect(this.master); o.start(at); o.stop(at + dur + 0.05);
  }
  shutter(at = this.ctx.currentTime) {                      // phone-camera shutter: band-passed noise click + blip
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
    const g = this.ctx.createGain(); this.env(g, at, 0.002, 0.8, 0.07);
    n.connect(bp).connect(g).connect(this.master); n.start(at, 0.25, 0.12);
    this.tone(1760, at + 0.05, 0.05, 'square', 0.08);
  }
  step(at = this.ctx.currentTime) {                         // footstep: low-passed noise thump
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = this.ctx.createGain(); this.env(g, at, 0.003, 0.25, 0.06);
    n.connect(lp).connect(g).connect(this.master); n.start(at, 0.4, 0.1);
  }
  drone(baseHz = 55): () => void {                          // 志怪 ambience: detuned stack + LFO'd low-pass. returns stop()
    const t = this.ctx.currentTime, out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.15, t + 2);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 300; lfo.connect(lfoGain).connect(lp.frequency);
    const oscs = [1, 1.498, 2.013].map((m, i) => { const o = this.ctx.createOscillator();
      o.type = i ? 'triangle' : 'sine'; o.frequency.value = baseHz * m; o.detune.value = (i - 1) * 7; o.connect(lp); o.start(t); return o; });
    lp.connect(out).connect(this.master); lfo.start(t);
    return () => { const now = this.ctx.currentTime; out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now); out.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      [...oscs, lfo].forEach((o) => o.stop(now + 1.6)); };
  }
}
```
✅ Offline self-test (1 s `OfflineAudioContext`, RMS): shutter 0.0043, step 0.0005, tone 0.0025, drone 0.0014. All are non-silent.
Other ideas: rain = low-passed noise loop; city hum = 50 Hz and 100 Hz sines at very low gain; "spirit presence" = a detuned drone whose gain is
driven by distance to the nearest spirit-layer object; radio static = band-passed noise with random gain spikes.
Respect a mute flag (`?mute` in tests).

---

## 7. Headless testing ✅

### 7.1 Launch flags (verified on this machine)
```
--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist
```
The result is WebGL2 on SwiftShader with every extension used here. Plain `node` scripts can use `import { chromium } from 'playwright'`
(Playwright is also installed at `/tmp/node_modules/playwright`), but the project uses `@playwright/test`.

### 7.2 `playwright.config.ts` ✅

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  workers: 2,                                           // SwiftShader is CPU-bound; >2 WebGL pages contend
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2 } },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4174 --strictPort', // test the production bundle
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

### 7.3 Debug hook contract (`window.__game`)
Expose it in **production builds too** (tests run against `vite preview`). Put the typing in `src/debug.ts`:

```ts
declare global { interface Window { __game: typeof api } }
const api = {
  ready: false,                          // true after fonts settled + first frame rendered + assets generated
  step(frames = 1, dt = 1 / 60, input: MoveInput | null = null) { /* tick N fixed steps, then render once */ return api.state(); },
  teleport(lat: number, lon: number, headingDeg = 0) { /* place walker; heading clockwise from local north */ },
  goto(poiId: string) { /* teleport next to a named point of interest */ },
  interact() { /* same as pressing E */ },
  setPhoneMode(on: boolean) { /* first-person lens view + spirit layer */ },
  setFlags(flags: Record<string, unknown>) { /* story/quest flags */ }, skipTo(chapterId: string) {},
  state() { return { pos: walker.pos.toArray(), heading: walker.heading.toArray(), phoneMode, chapter, flags,
    dialogue: currentLine /* {speaker, text} | null */, prompt: currentPrompt, inventory,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length ?? 0 }; },
  timeRender(n = 10) { /* ms per full render incl. GPU flush (readPixels) */ },
  snapshot() { render(); return renderer.domElement.toDataURL('image/png'); },
};
window.__game = api;
```
`typeof api` inside `declare global` works, and spec files get the types if `e2e/` is in the tsconfig `include` ✅.
In an object literal typed this way, call `api.state()` rather than `this.state()`: TS types `this` as `{}` there ✅ (I hit this).

**URL flags:** `?test` = **no rAF loop**; time only advances through `__game.step()`, which makes the line boil, clouds, and NPCs deterministic.
Also `?seed=N`, `?dpr=`, `?mute`, `?chapter=`/`?poi=`, and `?skipIntro`. Use a seeded PRNG (mulberry32) for all world generation, never
`Math.random()` in anything visible. `renderer.info.autoReset = false` plus `info.reset()` at the start of each frame gives stats for the whole frame.
(Alternative: Playwright's `page.clock.install()` fakes `requestAnimationFrame` and `performance` too 🔎, but the explicit step API is simpler and more robust.)

### 7.4 Example spec ✅ (passes; 3 tests in ~4 s — prototype values: R = 40, 60-call budget, layer-1 spirits; production asserts `|pos| ≈ 80`, calls ≤ 120, night-mode spirits)

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test');
  await page.waitForFunction(() => window.__game?.ready === true);
  expect(errors).toEqual([]);
});

test('renders the street within budget', async ({ page }) => {
  const s = await page.evaluate(() => window.__game.step(1));
  expect(s.calls).toBeLessThan(60);
  expect(s.triangles).toBeLessThan(150_000);
  await expect(page).toHaveScreenshot('street.png');
});

test('walking keeps the hero on the planet', async ({ page }) => {
  const s = await page.evaluate(() => window.__game.step(120, 1 / 60, { x: 0, y: 1 }));
  expect(Math.abs(Math.hypot(...s.pos) - 40)).toBeLessThan(1e-6);
});

test('spirit only appears through the phone', async ({ page }) => {
  await page.evaluate(() => { window.__game.teleport(0.02, 0.12, 90); window.__game.setPhoneMode(true); });
  await expect(page).toHaveScreenshot('phone-ghost.png');
});
```

### 7.5 Screenshot strategy
- Baselines live in `e2e/__screenshots__/…`. Create or refresh them with `npm run e2e:update`, **then look at them**
  (read the PNG) before committing. `toHaveScreenshot` waits for two identical consecutive captures, which is why the scene must be paused (`?test`).
- Determinism measured ✅: two fresh runs of the same frame differed in **11 of 921,600 pixels** (a shadow edge), well inside `maxDiffPixelRatio 0.002`.
- Also run **style smoke checks** that don't depend on exact pixels: e.g., the share of "ink" pixels (luminance < 0.15)
  stays in about 0.5–4% (reference frames: 0.3% and 1.6%; prototype: 1.3%), and the mean sky color near the top stays teal. These catch
  "outlines vanished", "all black", and "color space wrong" regressions after a baseline refresh.
- Fonts: CI with network loads Google Fonts. Without network, WenQuanYi Zen Hei is used and baselines change. Either keep
  network on consistently or block fonts in every test via `page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())`.
  Pick one and document it in the spec file.
- For visual iteration, save extra `page.screenshot({ path: 'test-results/…png' })` shots at key POIs, and compare them *by eye* with the
  reference captures in the scratchpad (`ref-enter.png`, `game-1.png`, `game-walk.png`). Pixel-diffing against the reference is meaningless.
- Performance guard: `await page.evaluate(() => __game.timeRender(8))` < ~60 ms at 1280×720 (currently about 40).

### 7.6 Vitest (pure logic)
Collisions, sphere math, quest/flag state machines, the dialogue script parser, puzzle solvers, and save/load serialization all belong in
`src/**/*.test.ts`. They run under `environment: 'node'`, and `three` math classes import fine ✅. Anything touching `document`, canvas, or WebGL
belongs in Playwright, not vitest. Keep game logic free of DOM/three-renderer imports so it stays testable.

---

## 8. Gotcha checklist (all hit or verified while prototyping)

1. Camera on a planet: **set `camera.up` to the local up before every `lookAt`**. Otherwise the view rolls or flips near the "poles".
2. The G-buffer only works if **every** scene material is patched (`patchForGBuffer`). New material types, including blob shadows and sprites, need it too.
3. `mergeGeometries` returns `null` when inputs mix indexed and non-indexed geometry or have different attributes.
4. `InstancedMesh.computeBoundingSphere()` after moving instances, or they vanish at screen edges.
5. `DataTexture` gradient maps need `NearestFilter`. `CanvasTexture` color needs `SRGBColorSpace`.
6. `toneMapping` stays `NoToneMapping`. Keep light intensities summing to about π.
7. HalfFloat render targets roughly double frame time on SwiftShader. EffectComposer defaults to HalfFloat.
8. `PCFSoftShadowMap` is gone in r186 (warns and falls back). Use `BasicShadowMap`.
9. `Clock` is deprecated; use `Timer` (`timer.update(t)` in `setAnimationLoop`).
10. Vitest will pick up Playwright specs unless `test.include` is set.
11. `erasableSyntaxOnly` forbids parameter properties and enums.
12. `document.fonts.load(font, text)` must be given the exact CJK text, because only the covering unicode-range slices get loaded.
13. Tone mapping and sRGB encoding are skipped for render-target output. The last pass to the canvas must encode sRGB (`#include <colorspace_fragment>`).
14. `Raycaster` tests only layer 0 by default (`raycaster.layers.enableAll()` for spirit-layer picking). It ignores `visible`.
15. `DirectionalLight.target` must be added to the scene (or have its matrix updated manually), or the shadow and light direction freeze.
16. Headless audio contexts start `running`, so a missing gesture unlock won't show up in tests.
17. Any continuous animation (line boil, clouds) must read the **simulation** time that `__game.step` advances, not `performance.now()`.
