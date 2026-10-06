# ART DIRECTION — "The Man With a Phone-Camera Head" (机头人 · 都市志怪)

Status: v1, the binding spec for all implementation agents. When another doc disagrees on a *visual* matter, this one wins.
Engine: three.js r186 `WebGLRenderer` (WebGL2), Vite, TypeScript. All art is procedural (primitives, BufferGeometry, canvas textures, GLSL).
Style target: the look of messenger.abeto.co (tiny-planet town, flat cel shading, wobbly ink lines, painted teal sky), re-staged in a **modern Chinese city** with a **志怪 (uncanny folk-tale)** undertone.

> Legal and ethics note: we study the reference's *look* and *techniques*. We never copy its code, shaders, textures, fonts, or text.
> Every shader in this doc was written for this project.

---

## 0. TL;DR — the numbers everybody needs

| Thing | Value |
|---|---|
| World unit | 1 unit = 1 m |
| Planet radius `PLANET_R` | **80 m** (final; GDD §0.2). **Production centers the planet at the world origin** with the town on the +Y pole (`src/core/planet.ts`, ARCH §2.8.1). The art prototype's `(0,−R,0)` center is prototype-only. Never hard-code either: import the constants. |
| Charts | The game uses **one** north-pole chart for the whole town (GDD §0.2: r ≤ 64 m ≈ 0.8 rad). The multi-chart wording below is general guidance that this project does not need. Unused sphere area is sea, rocks, and decorative dressing. |
| Authoring space | **Flat chart (x, z)** meters → sphere via the exponential map (= TECH_NOTES `expMap`). Props and buildings are placed rigidly; ground is wrapped per vertex. |
| Gameplay camera | vFOV **50°**, 3.6 m behind, eye **1.5 m** above ground, 0.5 m right shoulder, pitch ≈ 0° (level). Near 0.1, far 250. |
| Title camera | vFOV **30°**, 460 m from the planet center, near 250, far 600. The planet sphere fills about 66% of the screen height. |
| Shading | **2 bands** (lit / shade) plus an optional baked contact band. The shade is computed in HSV: `h−0.025, s×1.08, v×0.74` (sRGB space). |
| Outlines | Screen-space, one composite pass, over a **MRT info buffer** (normal, surface-ID, line-weight) plus a depth texture. 4-tap cross. World-anchored line breaks and thickness. |
| Ink | lines `#2f3a3f`, UI text `#1f282d`, spirit ink `#c8433a` (cinnabar) |
| Sky | computed in the composite where depth == 1. Two flat teal tones, `#65c1bc` base and `#9ae4d5` clouds, from a one-time baked 1024×512 cloud map. |
| Post chain | shadow → MRT scene → **single composite** (sky + fog + ink + grain [+ viewfinder]) → transparent FX forward pass → DOM UI |
| Budget | ≤ 150k triangles and ≤ 120 draw calls **per whole frame** (shadow + MRT + composite + FX, as `renderer.info` counts them; ARCH §5.1), one 1024² (test/low) or 2048² (high) `BasicShadowMap`, pixel ratio 1, no MSAA |
| Fonts | display **ZCOOL QingKe HuangYou**, body **ZCOOL KuaiLe**, handwriting **Long Cang**, brush **Ma Shan Zheng**, HUD Latin **Silkscreen** |

---

## 1. Reference teardown (what we saw, what we infer)

Screenshots studied: title (`ref-20000.png`, `ref-enter.png`), gameplay (`game-1.png`), dialog (`game-walk.png`, `game-2/3.png`), and extra walk and dialog captures (`x-*.png`, `y-*.png`). These were session-scratchpad captures and are deliberately **not committed**, because they are third-party imagery. Our own renders are in `docs/art-prototype/`.

**Observed**
1. **Tiny planet.** On the title screen the whole town is a ball floating on a flat teal field, with a scatter of tiny specks. In gameplay the road visibly **crests about 15 m ahead** and buildings sink behind the curve. Vertical elements fan out radially.
2. **Palette.** Muted and slightly green-grey: slate-teal road, grey/beige/white plaster, mauve-grey eaves. Saturated accents take small areas only: ochre door, orange life-ring, ship blue, painted-steel green bridge. The sky is **exactly two flat teal tones**.
3. **Cel shading.** Surfaces show **2 flat tones**: lit, plus shade at about 0.74× value with a small hue shift toward red. We measured six lit/shade pairs (table in §2), and they fit the formula in §3 within about 5/255. Cast shadows use the same shade tone. There are no gradients, no specular, and no ambient-occlusion blur.
4. **Ink lines.** They are dark slate (`#26343a`–`#333e42`), about 2–3 px at 720p, and aliased (no AA). Lines **break** irregularly (dashed gaps), **vary in thickness**, sometimes sit 1 px off the color edge, and appear on **silhouettes, creases, and material boundaries**: curb vs road, poster vs wall. Fine interior detail (panel seams, vents, signage) is painted into textures with the same ink.
5. **Painterly mottling.** Large flat areas have subtle posterized blotches of ±3% value. Shading terminators are slightly jagged, never ruler-straight.
6. **Sky.** Big torn-paper cloud shapes with crunchy, slightly pixel-stepped edges, a few streaks, and small floating flecks. There is no gradient and no sun disk.
7. **UI.** A white slab dialog box with a dark outline and a hard offset shadow, slightly skewed. A blue blocky name tag overlaps its top-left corner. A white "next" square holds a blue triangle. Body text is all-caps handwriting. The title uses blocky extruded white letters (face `#edf2e4`, side `#9baa9e`) with an ink outline, above a yellow slab BEGIN button with a darker bevel.

**Inferred from their public bundle (technique only, described in our own words)**
- Each opaque material writes **two render targets at once**. The first holds color, with a per-surface id in alpha. The second is an "info" buffer holding depth, an encoded normal, and a per-pixel "outline allowed" mask.
- The **per-pixel mask comes from a world-anchored (triplanar) noise texture**. That is why line breaks stick to surfaces and do not swim.
- **One fullscreen pass** then finds discontinuities in id, depth, and normal on a small cross kernel. It mixes in a fixed ink color and fades lines with distance. A color-grading LUT runs in the same pass.
- Base colors come from a small **palette atlas sampled with nearest filtering**, so colors are exact and flat. Shade is derived from the base color in HSV space (value cut, small hue shift) and gated by the shadow map.
- The world is **real spherical geometry**: shading code uses the fragment's distance from the planet center.
- Our design keeps these *ideas* but uses different encodings, kernels, and noise sources, chosen for SwiftShader cost and for procedural authoring.

---

## 2. (a) Palette

All hex values are **sRGB, display-referred**. The pipeline (§3) is built so that a palette hex **appears on screen exactly** in the lit band. That holds on the neutral mottle step, which is 50% of the area, to within ±3 of film grain; the other half is ±3% mottled. Screenshot tests can therefore assert pixel colors (Appendix A).

### 2.1 Day palette ("日常") — sampled from the reference and extended for a Chinese city

| Token | Lit | Shade (formula) | Source / use |
|---|---|---|---|
| `sky.base` | `#65c1bc` | — | sampled: the sky's dark tone and the title background |
| `sky.cloud` | `#9ae4d5` | — | sampled: flat cloud shapes |
| `sky.titleCloud` | `#6dcac0` | — | sampled: faint blotches on the title background |
| `sky.speck` | `#7fd3c8` | — | floating flecks (title and sky) |
| `road` | `#6f918f` | `#506b66` | sampled asphalt (measured cast shadow `#496565`) |
| `road.far` | `#5f7f80` | — | sampled: slightly darker road variant for lanes and patches |
| `road.paintWhite` | `#f2f6ea` | `#b4b6ac` | edge lines, zebra crossings |
| `road.paintYellow` | `#f0d055` | `#b28536` | **Chinese center line**, curb-no-parking |
| `sidewalk` | `#a5a698` | `#7b7a70` | sampled curb and pavement |
| `sidewalk.tan` | `#c5c3a3` | `#928c77` | sampled tan pavement and plazas |
| `concrete` | `#96988d` | `#707068` | sampled (measured shade `#73736d`) |
| `plaster.beige` | `#d4d3b3` | `#9d9883` | sampled (measured shade `#9c9883`) |
| `plaster.white` | `#e8efdf` | `#adb1a4` | sampled (measured shade `#afb6aa`) |
| `tile.pink` | `#d9b8a8` | `#a18079` | 老小区 pink-beige façade tile |
| `tile.white` | `#e6e4d6` | `#aaa79d` | 白瓷砖 façade |
| `roof.mauve` | `#aea29c` | `#817572` | sampled eaves and roofs (measured shade `#7a7070`) |
| `steel.green` | `#62ac91` | `#447f61` | sampled painted steel: bridges, railings, 共享单车 |
| `glass.dark` | `#333e42` | — | sampled windows (flat, unshaded, same family as ink) |
| `glass.glint` | `#aeb4a8` | — | one diagonal highlight stripe on some panes |
| `metal.rail` | `#b8beb2` | `#898d83` | sampled guardrails, AC units, phone frame alt |
| `cable` | `#3f4a4e` | — | overhead wires (no outline) |
| `sign.slate` | `#435654` | `#30403c` | sampled traffic-sign backs and poles |
| `foliage` | `#4ca177` | `#33774b` | sampled tree canopy lit (measured shade `#337150`) |
| `foliage.deep` | `#296045` | — | sampled speckle marks inside canopies |
| `grass` | `#50a06a` | `#367642` | sampled verges (planet green) |
| `grass.dark` | `#326d42` | — | sampled title-planet dark green |
| `trunk` | `#8a7f73` | `#665b54` | tree trunks, wooden poles |
| `accent.ochre` | `#bd8a44` | `#8c552b` | sampled doors, crates |
| `accent.orange` | `#d8944c` | `#a05930` | sampled cone, life-ring (measured shade `#9c5735`), protagonist trim |
| `accent.yellow` | `#f7cf5e` | `#b7843d` | sampled shirt trim; flash LED |
| `accent.red` | `#a95948` | `#7d3130` | sampled rusty red (ship hull, old shutters) |
| `accent.redLight` | `#e69869` | `#aa5d46` | sampled light rust |
| `accent.blue` | `#2a8595` | `#196e6e` | sampled boat/lamp blue |
| `accent.skyBlue` | `#46b0cd` | `#2c9198` | sampled light blue (backpack, shop awning) |
| `banner.red` | `#c8433a` | `#94232c` | 红横幅, lanterns, 春联 (keep small) |
| `sea` | `#4aa9a8` | — | planet sea (darker than `sky.base` so the planet disk reads) |
| `sea.shallow` | `#7fd3c8` | — | shoreline band |
| `foam` | `#f2f6ea` | — | shoreline foam strokes |
| `skin` | `#e9cfc5` | `#ac9390` | sampled (measured shade `#af9795`) |
| `hair.slate` | `#3c4e54` | `#2b3c3e` | sampled hair (dark slate, never pure black) |
| `cloth.charcoal` | `#333d40` | `#252f2f` | sampled dark clothing |
| `cloth.navy` | `#234457` | `#173740` | sampled trousers |
| `cloth.teal` | `#456d75` | `#305657` | sampled skirt |
| `cloth.sage` | `#6f8a7f` | `#51665a` | bag straps, NPC jackets |
| `cloth.white` | `#f3f6ea` | `#b5b6ac` | sampled white tee; sneakers |

**Ink and outline**

| Token | Hex | Use |
|---|---|---|
| `ink.line` | `#2f3a3f` | world outlines (sampled range `#1f282d`–`#333e42`), UI borders |
| `ink.deep` | `#1f282d` | UI body text, darkest texture details, window grilles |
| `ink.uiShadow` | `#405157` | hard offset drop-shadow under UI slabs (sampled) |
| `ink.spirit` | `#c8433a` | outlines of uncanny entities (§4.3) |

**Accent budget:** saturated accents (`accent.*`, `banner.red`, `road.paintYellow`) should cover **≤ 10% of any frame**. The city stays grey-green-beige so the accents and the protagonist pop.

**Chinese city vocabulary → tokens**
- 老小区 residential block: `tile.pink` or `tile.white` walls, `glass.dark` windows with `ink.deep` 防盗窗 cages painted in the texture, `metal.rail` AC units.
- Street shop: `plaster.white` + awning `accent.skyBlue`/`steel.green` + sign board `ink.deep` or `accent.blue`, with white 黑体-style characters in the canvas texture.
- 便利店: `plaster.white` with a stripe band of `steel.green` + `accent.orange`.
- 土地庙/小神龛: `banner.red` doors, `roof.mauve` tiles, incense `foam`.
- Bus stop: `steel.green` frame, `sign.slate` panel.
- 共享单车: `steel.green` or `accent.orange` frames.
- Utility poles and **lots of cables**: `concrete` poles, `cable` wires. This is a signature of both the reference and Chinese streets.

### 2.2 Night palette ("夜") — the default for 志怪 chapters

Apply it as a **mood transform** in the material (§3.4), not as new albedos.
The values below are the **GDD §10.3/§10.4 readability-raised** ones (the review found the first draft too dark: its lit walls sat near luma 0.35). They are binding; `src/art/palette.ts` and the §3.4 GLSL use them.

| Element | Rule / Hex |
|---|---|
| Moonlit band | `alb × (0.55, 0.66, 0.78) + (0.05, 0.07, 0.10)` |
| Night shade band | `alb × (0.30, 0.38, 0.50) + (0.04, 0.06, 0.09)` |
| Ambient floor | every night-band channel ≥ 0.12 (`max(col, vec3(0.12))`) |
| Lamp-pool band (sodium) | `alb × (1.00, 0.86, 0.62) + (0.04, 0.02, 0.00)` |
| `sky.night.base` | `#22365a` |
| `sky.night.cloud` | `#34507a` |
| `sky.night.star` | `#cfe8dc` (specks) |
| `moon` | `#f3ecd2` disk with a 1-px `ink.line` ring |
| Windows lit (unlit material) | warm `#ffd27a`, TV-blue `#9fe8ff`; 40% of windows lit at night, 20% at dusk (GDD §5.7) |
| Neon/sign emissive | `#ff6b5e`, `#58e0c8`, `#ffd24a` (small areas only; the convenience-store sign is the brightest thing at night) |
| Fog color | `#22365a`, max 0.45 |
| `ink.line` at night | `#141b20`; on dark silhouettes (pixel luma < 0.18) use the **halo ink** `#6d8fb0` instead (§4.4) |

Examples (lit → moonlit / night-shade / lamp-lit; luma = Rec.601 of the sRGB value). Lit walls must reach luma ≥ 0.45 (GDD §19.4 `night_store`):

| | moonlit (luma) | night shade (luma) | lamp-lit |
|---|---|---|---|
| road | `#4a7289` (0.41) | `#2c465e` (0.26) | `#798259` |
| plaster.white | `#8cb0c7` (0.66) | `#506a86` (0.40) | `#f2d38a` |
| plaster.beige | `#819da5` (0.59) | `#4a5f70` (0.36) | `#debb6f` |
| tile.pink | `#848b9d` (0.55) | `#4b556b` (0.33) | `#e3a368` |
| skin | `#8d9ab3` (0.60) | `#505e79` (0.37) | `#f3b77a` |

### 2.3 Uncanny palette ("异象") — overlay while a 怪 manifests or in the spirit layer

Transform: desaturate 60%, then lit `× (0.74, 0.90, 0.84)` and shade `× (0.36, 0.46, 0.44)`.
The result is a celadon-ghost-green world, with the only saturated color being cinnabar.

**Weights (binding).** `uUncanny` is the raw 0..1 value driven by GDD §5.9. The night **baseline 0.15 must only make lines tremble**, so grading and sky use a shifted weight:
- grade / sky weight `uUncW = clamp((uUncanny − 0.15) / 0.85, 0, 1)` (0 at the baseline; 0.18 for the zhimei pulse 0.3; 0.41 at 0.5; 0.53 in the subway at 0.6; 1 at 1);
- line boil `uBoil = uUncanny <= 0.0 ? 0.0 : mix(0.3, 1.0, smoothstep(0.15, 0.6, uUncanny))` (0.3 = a faint tremble at the baseline; always 0 in `?test`).
Without this shift the baseline would tint the night sky 15% toward `#16262b` and fail the GDD §19.4 sky check.

| Element | Hex |
|---|---|
| `sky.uncanny.base` | `#16262b` |
| `sky.uncanny.cloud` | `#3d6b62` |
| `moon.blood` (血月) | `#d0453b` |
| `ink.line` (uncanny) | `#10181a`, lines boil (§4.5) |
| `spirit.cinnabar` 朱砂 | `#c8433a` (immune to grading) |
| `spirit.paper` 纸白 | `#efe9d8` (immune) |
| `spirit.ghostfire` 鬼火青 | `#7ef0c8` (FX, additive) |
| `spirit.talisman` 符纸黄 | `#f2d15a` (immune) |
| `spirit.ash` 香灰 | `#8d8a86` |

Examples (lit → uncanny lit / uncanny shade): road `#5d7d74`/`#2d403d`; plaster.white `#add5c1`/`#546d65`; skin `#a4beae`/`#50615b`; banner.red `#6a5149`/`#342a26`. Note that ordinary red turns muddy, so only *spirit* red survives.

### 2.4 UI palette

| Token | Hex |
|---|---|
| `ui.paper` (dialog bg) | `#f8f8f6` |
| `ui.text` | `#1f282d` |
| `ui.border` | `#2f3a3f` (3 px) |
| `ui.shadow` | `#405157` (hard 4×5 px offset) |
| `ui.tag` (protagonist) | `#66bde6`, text `#ffffff`, text-shadow `#2f6f8f` |
| `ui.tagNpc` | `#f0d055`, text `#1f282d` |
| `ui.tagSpirit` | `#c8433a`, text `#efe9d8` |
| `ui.button` | face `#f0d055`, bevel `#bf8838` |
| `ui.titleFace` / `ui.titleSide` | `#edf2e4` / `#9baa9e` |
| `ui.notebook` | paper `#f3efe2`, grid `#d9d3bf`, tape `#e9dca6` |

### 2.5 Paste-ready TS (single source of truth → `src/art/palette.ts`)

```ts
export const PAL = {
  sky: { base: '#65c1bc', cloud: '#9ae4d5', titleCloud: '#6dcac0', speck: '#7fd3c8' },
  skyNight: { base: '#22365a', cloud: '#34507a', star: '#cfe8dc', moon: '#f3ecd2' },   // GDD §10.3 (raised)
  skyUncanny: { base: '#16262b', cloud: '#3d6b62', moon: '#d0453b' },
  road: '#6f918f', roadFar: '#5f7f80', paintWhite: '#f2f6ea', paintYellow: '#f0d055',
  sidewalk: '#a5a698', sidewalkTan: '#c5c3a3', concrete: '#96988d',
  plasterBeige: '#d4d3b3', plasterWhite: '#e8efdf', tilePink: '#d9b8a8', tileWhite: '#e6e4d6',
  roofMauve: '#aea29c', steelGreen: '#62ac91', glassDark: '#333e42', glassGlint: '#aeb4a8',
  metalRail: '#b8beb2', cable: '#3f4a4e', signSlate: '#435654',
  foliage: '#4ca177', foliageDeep: '#296045', grass: '#50a06a', grassDark: '#326d42', trunk: '#8a7f73',
  sea: '#4aa9a8', seaShallow: '#7fd3c8', foam: '#f2f6ea',
  ochre: '#bd8a44', orange: '#d8944c', yellow: '#f7cf5e', rust: '#a95948', rustLight: '#e69869',
  blue: '#2a8595', skyBlue: '#46b0cd', bannerRed: '#c8433a',
  skin: '#e9cfc5', hair: '#3c4e54', charcoal: '#333d40', navy: '#234457', teal: '#456d75',
  sage: '#6f8a7f', clothWhite: '#f3f6ea',
  ink: '#2f3a3f', inkDeep: '#1f282d', inkUiShadow: '#405157', inkSpirit: '#c8433a',
  inkNight: '#141b20', inkHalo: '#6d8fb0', inkUncanny: '#10181a',
  winWarm: '#ffd27a', winTv: '#9fe8ff', neonRed: '#ff6b5e', neonTeal: '#58e0c8', neonYellow: '#ffd24a',
  spiritPaper: '#efe9d8', ghostfire: '#7ef0c8', talisman: '#f2d15a', ash: '#8d8a86',
  char: { phoneBody: '#eef1e6', phoneFrame: '#d8944c', bump: '#333d40', lensRing: '#b8beb2',
          lensGlass: '#1b2a33', lensGlint: '#9ae4d5', flash: '#f7cf5e', screenBezel: '#1b2327',
          screenBg: '#1f282d', screenGlyph: '#9ae4d5', hairBrown: '#6b5a52', hairGrey: '#8d8a86',
          nightRim: '#9fb8d8' },
  ui: { paper: '#f8f8f6', text: '#1f282d', border: '#2f3a3f', shadow: '#405157',
        tag: '#66bde6', tagShadow: '#2f6f8f', tagNpc: '#f0d055', tagSpirit: '#c8433a',
        button: '#f0d055', buttonSide: '#bf8838', titleFace: '#edf2e4', titleSide: '#9baa9e',
        notebook: '#f3efe2', grid: '#d9d3bf', tape: '#e9dca6' },
} as const;
```

---

## 3. (b) Cel / toon lighting model

### 3.1 Rules
- **Two bands.** `lit = albedo exactly` and `shade = hsv(h − 0.025, min(1, s·1.08), v·0.74)`. Compute both in **sRGB space**. The formula matches the reference's measured pairs (concrete `#96988d→#707068`, measured `#73736d`; beige `#d4d3b3→#9d9883`, measured `#9c9883`; orange `#d8944d→#a05931`, measured `#9c5735`).
- **Band test:** `lit = step(0.06, N·L + jitter) × shadowMask`, where `jitter = (noise.r − 0.5) × 0.16` (world-anchored) gives painterly, slightly ragged terminators. Use hard `step`, not smoothstep. The aliasing is part of the look.
- **Cast shadows use the same shade tone** as form shadows. No separate shadow color, no ambient term, no specular, no environment map.
- **Optional contact band:** geometry builders may bake a vertex-color darkening (×0.88) on the bottom 0.3 m of walls, under eaves, and inside window recesses. Never use SSAO.
- **Mottling:** `alb *= 1 + 0.03·(step(0.75,n.g) − step(n.g,0.25))`. These are three posterized value steps from a world-anchored, rank-equalized noise: 25% of the area at −3%, 50% exact, 25% at +3%. Never smooth.
- **Rim light:** none on the environment. Characters get an **optional night rim**: where `1−N·V > 0.72`, add `+12%` toward `#9fb8d8`. Use it only for the protagonist and entities at night, for readability.
- **Emissive / unlit surfaces** (phone screen, lit windows, neon, spirit paper) output albedo unchanged. They are immune to mood grading and fog.
- **Sun direction:** defined in a *local* tangent frame as `SUN_LOCAL = normalize(east 0.55, up 0.80, south 0.25)` (elevation ≈ 53°). East and south come from the geographic frame (TECH_NOTES `northAt`), **never from the player's heading**: a heading-relative sun would flip walls between lit and shade whenever the player turns.
  Two uniforms drive it:
  - `uSunPole` is the planet-up where the sun is defined: the player's up in gameplay, the center→camera direction on the title.
  - `uSunAtPole` is that sun direction in world space.
  
  The vertex shader carries it to every vertex by the minimal rotation `uSunPole → vertexUp`. The planet is therefore lit evenly everywhere, as in the reference title, with no night side. The rotation's singular point is the pole's antipode, which is never visible.
- **Shadow map:** one `DirectionalLight`, `renderer.shadowMap.type = THREE.BasicShadowMap` (hard, cheap; note `PCFSoftShadowMap` is deprecated in r186) under `?test` / `?lowfx`; realtime uses `PCFShadowMap`, whose filtered mask the toon's `step(0.5, mask)` cuts into the same hard cel edge without the Basic map's texel staircase (P3-look L8). Settings:
  - `mapSize` 1024 (test/low) or 2048 (high).
  - Ortho frustum ±22 m, near 1, far 90.
  - Placed at `playerWorld + uSunAtPole × 45` (in gameplay the pole is the player).
  - Snap the light target to shadow-texel increments to stop shimmer.
  - `bias = -0.0008`, `normalBias = 0.03`.
  - Beyond 22 m nothing casts shadows. That is fine, because those surfaces are fog-faded and sinking behind the horizon.

### 3.2 Color-space contract (important)
- Palette hex → `THREE.Color` (three converts to linear) → vertex colors or `color`. Canvas textures use `texture.colorSpace = THREE.SRGBColorSpace`.
- In the fragment shader we convert `diffuseColor.rgb` **back to sRGB** (`sRGBTransferOETF`) and do all palette math there. We then write **sRGB-encoded values** into an **RGBA8** color target.
- The composite writes that value to the canvas **without any further conversion**. It is a raw `ShaderMaterial` and never includes `colorspace_fragment`.
- Result: a lit surface of `#d4d3b3` shows as `#d4d3b3` on screen.
- The transparent FX pass renders *after* the composite straight to the canvas with built-in materials. three's normal output conversion applies there, so FX hex values also display correctly.

### 3.3 Material factory contract (every opaque main-pass object MUST use it)

`src/render/materials.ts` exports:

```ts
makeToonMaterial(opts: {
  color?: ColorRepresentation;  // or vertexColors: true (preferred for merged geometry)
  vertexColors?: boolean;
  map?: Texture;                // canvas texture (sRGB), multiplies color
  surfaceId?: number;           // 1..255, fallback when geometry has no aSurfaceId attribute
  lineWeight?: number;          // 0 = no ink lines on this material, 1 = normal, 1.4 = interactable
  unlit?: boolean;              // screens, lit windows, neon, spirit paper
  spiritImmune?: boolean;       // ignore night/uncanny grading (cinnabar, talisman)
  flecks?: boolean;             // foliage speckles
  rim?: boolean;                // night rim (protagonist, entities)
  side?: Side; alphaTest?: number;
}): MeshToonMaterial
```

- It is built on `MeshToonMaterial` plus `onBeforeCompile`. It keeps three's instancing, batching, skinning, shadow and clipping chunks for free.
- `material.customProgramCacheKey = () => 'cm-toon-v1'`. The injected code is identical for all instances; three adds defines for map and vertexColors itself.
- `material.userData.mrt = true`. A dev-only check traverses the scene each second and `console.error`s any main-pass mesh whose material lacks it. **A material that does not write location 1 leaves garbage in the info buffer**, which shows up as phantom ink.
- **No `transparent: true` materials in the main pass.** Blending would corrupt the info buffer. Use `alphaTest` cutouts (foliage cards, fences, paper entities) or move the object to the FX pass.
- **Do not use `scene.background`.** three draws it with a shader that does not write location 1. The sky is drawn in the composite.
- Shared uniforms: one module-level `shared` object whose `{value}` holders are referenced by every material, so one update per frame drives all of them:
  `uPlanetCenter, uSunPole, uSunAtPole, uTime, uNight, uUncanny (holds the shifted grade weight uUncW, §2.3), uLamps[8] (vec4 xyz = world pos, w = radius; w = 0 means off), uFlash (vec4 xyz = flash world pos, w = radius; w = 0 outside photo captures), tNoise`.

### 3.4 GLSL (injected; written for this project)

`tNoise` is a **128×128 RGBA8 tileable value-noise texture generated at boot** (`DataTexture`, `RepeatWrapping`, `LinearFilter`, no mipmaps, `NoColorSpace`). Lattice cells per tile per channel: r = 8 (brush jitter), g = 4 (mottling), b = 12 (line breaks), a = 4 (line thickness).
**Rank-equalize every channel after generation** (sort the texels, replace each value with `rank / (N² − 1)`). Low-frequency value noise with few lattice points is heavily biased: the prototype's unequalized 3-cell mottle channel sat in the "dark" step 3× more often than the "light" step. After equalization, `step(t, n)` covers exactly `1 − t` of the area, so every threshold in this doc is an area fraction.
One fetch per fragment gives all four values, which is much cheaper on SwiftShader than evaluating 3D noise in the shader.

**Vertex** — replace `#include <common>`:
```glsl
#include <common>
attribute float aSurfaceId;          // optional per-vertex / per-instance id (0 if absent)
uniform float uSurfaceId;
uniform vec3  uPlanetCenter;
uniform vec3  uSunPole;              // unit planet-up where the sun is defined (player up / title: center→camera)
uniform vec3  uSunAtPole;            // unit world sun direction as seen at uSunPole
varying float vSurfaceId;
varying vec3  vWorldPos;
varying vec3  vSunView;
// minimal rotation taking unit a to unit b, applied to v (Rodrigues with k = cross(a, b))
vec3 cmRotateBetween(vec3 v, vec3 a, vec3 b) {
  vec3 k = cross(a, b);
  float c = dot(a, b), s2 = dot(k, k);
  if (s2 < 1e-6) return v;           // same point, or the (never visible) antipode
  return v * c + cross(k, v) + k * (dot(k, v) * (1.0 - c) / s2);
}
```
Vertex — append after `#include <project_vertex>`:
```glsl
vec4 cmW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  cmW = batchingMatrix * cmW;
#endif
#ifdef USE_INSTANCING
  cmW = instanceMatrix * cmW;
#endif
cmW = modelMatrix * cmW;
vWorldPos  = cmW.xyz;
vec3 cmUp  = normalize(cmW.xyz - uPlanetCenter);
vSunView   = normalize((viewMatrix * vec4(cmRotateBetween(uSunAtPole, uSunPole, cmUp), 0.0)).xyz);
vSurfaceId = aSurfaceId > 0.5 ? aSurfaceId : uSurfaceId;
```

**Fragment** — replace `#include <common>`:
```glsl
#include <common>
layout(location = 1) out highp vec4 gInfo;   // location 0 is three's pc_fragColor
uniform sampler2D tNoise;
uniform float uLineWeight, uUnlit, uSpiritImmune, uFlecks, uNight, uUncanny, uRim;
uniform vec4  uLamps[8];
uniform vec4  uFlash;                 // photo flash: xyz = lens world pos, w = radius (10 m); w = 0 → off
varying float vSurfaceId;
varying vec3  vWorldPos;
varying vec3  vSunView;
vec3 cmToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
  vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0*d + 1e-5)), d / (q.x + 1e-5), q.x);
}
vec3 cmToRgb(vec3 h) {
  vec3 p = abs(fract(h.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return h.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), h.y);
}
vec2 cmOct(vec3 n) {                  // octahedral normal encode → [0,1]^2
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
vec4 cmNoise(vec3 p, vec3 nW) {       // single-fetch "dominant-axis planar" projection, 12 m tile
  vec3 a = abs(nW);
  vec2 uv = (a.x > a.y && a.x > a.z) ? p.zy : (a.y > a.z ? p.xz : p.xy);
  return texture2D(tNoise, uv * (1.0 / 12.0));
}
```
Fragment — after `#include <shadowmap_pars_fragment>` add `#include <shadowmask_pars_fragment>`. This provides `getShadowMask()`, which MeshToon does not include by default.

Fragment — replace `#include <opaque_fragment>` with the block below, and replace `#include <tonemapping_fragment>`, `#include <colorspace_fragment>`, and `#include <fog_fragment>` with nothing:
```glsl
vec3 alb = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;          // palette math in sRGB
vec3 nW  = (vec4(normal, 0.0) * viewMatrix).xyz;                         // view → world normal
vec4 nz  = cmNoise(vWorldPos, nW);
alb *= 1.0 + 0.03 * (step(0.75, nz.g) - step(nz.g, 0.25));               // mottling: 25% −3%, 50% exact, 25% +3%
if (uFlecks > 0.5) alb = mix(alb, alb * 0.62, step(0.74, cmNoise(vWorldPos * 5.0, nW).b)); // small leaf speckles (2nd fetch, foliage only)
float ndl = dot(normal, normalize(vSunView)) + (nz.r - 0.5) * 0.16;
float lit = step(0.06, ndl);
#ifdef USE_SHADOWMAP
  lit *= step(0.5, getShadowMask());
#endif
float flashed = uFlash.w > 0.0 ? step(distance(vWorldPos, uFlash.xyz), uFlash.w) : 0.0;  // GDD §3.7
lit = max(lit, flashed);                                                 // flash: lit band, cast shadows gone
vec3 hsv  = cmToHsv(alb);
vec3 shd  = cmToRgb(vec3(fract(hsv.x - 0.025), min(1.0, hsv.y * 1.08), hsv.z * 0.74));
vec3 col  = mix(shd, alb, lit);
if (uNight > 0.0) {                                                      // uniform branch: coherent
  vec3 nLit = max(alb * vec3(0.55, 0.66, 0.78) + vec3(0.05, 0.07, 0.10), vec3(0.12));   // GDD §10.4
  vec3 nSh  = max(alb * vec3(0.30, 0.38, 0.50) + vec3(0.04, 0.06, 0.09), vec3(0.12));
  float lamp = flashed;                                                  // at night a flash reads as a lamp pool
  for (int i = 0; i < 8; i++) {
    vec4 L = uLamps[i];
    if (L.w > 0.0) lamp = max(lamp, step(distance(vWorldPos, L.xyz) / L.w + (nz.r - 0.5) * 0.12, 1.0));
  }
  vec3 nCol = mix(mix(nSh, nLit, lit), alb * vec3(1.0, 0.86, 0.62) + vec3(0.04, 0.02, 0.0), lamp);
  float rim = uRim * step(0.72, 1.0 - abs(dot(normal, normalize(vViewPosition))));
  nCol = mix(nCol, vec3(0.62, 0.72, 0.85), rim * 0.12);
  col = mix(col, nCol, uNight);
}
if (uUncanny > 0.0) {                                                    // uUncanny here = shifted weight uUncW (§2.3)
  vec3 g = mix(alb, vec3(dot(alb, vec3(0.299, 0.587, 0.114))), 0.6);
  vec3 uCol = mix(g * vec3(0.36, 0.46, 0.44), g * vec3(0.74, 0.90, 0.84), lit);
  col = mix(col, uCol, uUncanny * (1.0 - uSpiritImmune));
}
col = mix(col, alb, uUnlit);                                             // emissive: exact albedo
gl_FragColor = vec4(col, 1.0 - uUnlit);                                  // a = fog mask for composite
float lw = uLineWeight * smoothstep(0.16, 0.26, nz.b) * (0.55 + 0.9 * nz.a);
gInfo = vec4(cmOct(normal), vSurfaceId / 255.0, clamp(lw, 0.0, 1.0));
```
Notes:
- `normal` and `vViewPosition` are three's view-space names inside MeshToon (r186).
- `sRGBTransferOETF` comes from `colorspace_pars_fragment` and is always present.
- The lamp loop only runs at night.
- The contact band (baked vertex color) needs no shader code.

---

## 4. (c) Outlines — screen-space ink from an MRT info buffer

### 4.1 Decision and justification
**Use screen-space edge detection on (depth, normal, surface-ID) in one composite pass.** Do **not** use inverted-hull outlines, because:
- The reference's defining traits are **interior creases and material-boundary lines**: curb vs road, poster vs wall, window frames on the same plane. A hull only draws silhouettes.
- A hull doubles triangles and draw calls (≈ 2×150k tris on SwiftShader). The screen pass is a fixed cost of about 11 texture fetches per pixel, independent of scene complexity.
- Wobble, breaks, distance fade, spirit-colored ink, and boil for uncanny moments are all trivial to do in one shader.
- Merged, vertex-colored chunks keep internal part boundaries via the `aSurfaceId` attribute. A hull cannot express those.

### 4.2 Buffers and pass structure

```
[1] Shadow map (three, automatic)       DirectionalLight, BasicShadowMap
[2] Main pass → mrt (WebGLRenderTarget, count: 2, RGBA8, Nearest, depthTexture)
      textures[0]  RGBA8  rgb = shaded color (sRGB-encoded), a = fog/grade mask (0 for unlit)
      textures[1]  RGBA8  rg = octahedral view normal, b = surfaceId/255, a = line weight 0..1
      depthTexture DepthTexture (UnsignedIntType)
      clear color (0,0,0,0): sky pixels have depth 1, id 0, weight 0
[3] Composite → canvas (fullscreen triangle, ShaderMaterial, depthTest ON with depthFunc = AlwaysDepth, depthWrite on;
      WebGL only writes depth while the depth test is enabled)
      sky (depth == 1) | fog | ink | grain | [viewfinder: barrel + chroma + vignette]
      writes gl_FragDepth = scene depth, so [4] can depth-test
[4] FX forward pass → canvas (renderer.autoClear = false)
      transparent / additive only: ghost-fire, dust, lamp glow sprites, flash; no ink
[5] DOM UI overlay
```

```ts
const mrt = new THREE.WebGLRenderTarget(w, h, {
  count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  depthBuffer: true, samples: 0,
});
mrt.depthTexture = new THREE.DepthTexture(w, h);
// per frame
renderer.setRenderTarget(mrt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
renderer.setRenderTarget(null); renderer.render(compositeScene, orthoCam);   // clears canvas, writes color + depth
renderer.autoClear = false; renderer.render(fxScene, camera); renderer.autoClear = true;  // FX depth-tests vs scene
```
Do not clear between [3] and [4]. FX materials use `depthWrite: false` and `depthTest: true`.

### 4.3 Surface-ID allocation (8-bit, `gInfo.b × 255`)
| Range | Meaning |
|---|---|
| 0 | sky / nothing |
| 1–199 | environment. Adjacent parts only need *different* ids; builders use `1 + (hash(partIndex) % 199)`. Road, sidewalk, curb, wall, trim, and window frame must differ. |
| 200–209 | protagonist parts (body, phone slab, bump, lenses, screen) |
| 210–229 | NPCs |
| 230–239 | interactables (clues). Material also uses `lineWeight 1.4`. |
| 240–254 | **spirit / uncanny**. Ink color is `ink.spirit` (cinnabar) and lines boil. |
| 255 | reserved |

### 4.4 Composite shader (pseudo-GLSL, project-original)
```glsl
uniform sampler2D tColor, tInfo, tDepth, tCloud;
uniform vec2  uTexel;                 // 1 / drawing-buffer size
uniform float uNear, uFar;
uniform mat4  uInvProj, uCamWorld;    // camera.projectionMatrixInverse, camera.matrixWorld
uniform float uLinePx;                // 1.0 × (bufferHeight / 720), clamped 0.75..2.0
uniform vec3  uInk, uInkSpirit, uInkHalo;   // uInkHalo = #6d8fb0
uniform float uHalo;                  // 1 in the night palette, else 0
uniform vec3  uLineFade;              // (startDepth, endDepth, minStrength)
uniform vec3  uFogColor; uniform vec3 uFog;   // (near, far, max)
uniform float uGrain, uBoil, uTime, uViewfinder;
varying vec2 vUv;

float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
vec3  octDec(vec2 e) { e = e * 2.0 - 1.0; vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
                       float t = max(-n.z, 0.0); n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
                       return normalize(n); }
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  if (uViewfinder > 0.0) { vec2 c = uv - 0.5; uv += c * dot(c, c) * 0.08 * uViewfinder; }   // barrel
  // boil: jitter ALL edge taps (center included) by the same vector. Jittering only the neighbours
  // breaks the plane-invariance of the 1/z Laplacian and speckles grazing ground (seen in the prototype).
  vec2  jit = uBoil * (vec2(h12(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 8.0)),
                            h12(floor(gl_FragCoord.xy / 3.0) + 17.0 + floor(uTime * 8.0))) - 0.5) * 1.5 * uTexel;
  vec2  ev  = uv + jit;                 // edge-sampling position; color is still sampled at uv
  vec4  iC  = texture2D(tInfo, ev);
  float dC  = viewDepth(ev);
  bool  sky = texture2D(tDepth, ev).x >= 0.99999;

  // thickness from world-anchored weight (center if geometry, else default)
  float wC  = sky ? 0.6 : iC.a;
  vec2  o   = uTexel * uLinePx * mix(0.7, 1.5, wC);
  vec2  T[4] = vec2[4](vec2(-o.x, 0.0), vec2(o.x, 0.0), vec2(0.0, -o.y), vec2(0.0, o.y));

  float izC = 1.0 / dC, lap = 0.0, nd = 0.0, idE = 0.0, wMax = iC.a, dMin = dC, idMax = iC.b;
  float izs[4];
  vec3  nC = octDec(iC.rg);
  for (int k = 0; k < 4; k++) {
    vec2 q  = ev + T[k];
    vec4 i  = texture2D(tInfo, q);
    float d = viewDepth(q);
    izs[k]  = 1.0 / d;
    dMin    = min(dMin, d);
    wMax    = max(wMax, i.a);
    idMax   = max(idMax, i.b);
    idE     = max(idE, step(0.5 / 255.0, abs(i.b - iC.b)));
    if (!sky && i.b > 0.0) nd = max(nd, 1.0 - dot(nC, octDec(i.rg)));
  }
  // Laplacian of 1/z is ~0 on any plane → no false edges on grazing ground
  lap = abs(izs[0] + izs[1] - 2.0 * izC) + abs(izs[2] + izs[3] - 2.0 * izC);
  float eDepth  = smoothstep(0.015, 0.04, lap / max(izC, 1e-4));
  float eNormal = smoothstep(0.25, 0.45, nd);                 // ≈ 40–55° creases
  float edge    = max(max(eDepth, eNormal), idE);
  edge *= step(0.02, wMax);                                    // world-anchored breaks
  edge *= mix(1.0, uLineFade.z, smoothstep(uLineFade.x, uLineFade.y, dMin));

  bool  skyP = texture2D(tDepth, uv).x >= 0.99999;   // un-jittered pixel for color, sky and fog
  float dP   = viewDepth(uv);
  vec3 col; float fogMask;
  if (skyP) { col = skyColor(uv); fogMask = 0.0; }             // §5
  else { vec4 c = texture2D(tColor, uv); col = c.rgb; fogMask = c.a; }
  col = mix(col, uFogColor, uFog.z * smoothstep(uFog.x, uFog.y, dP) * fogMask);

  float idx = idMax * 255.0;
  vec3 ink = (idx > 239.5 && idx < 254.5) ? uInkSpirit : uInk;
  // GDD §10.4: at night a line over a dark silhouette uses the light halo ink instead (1 extra ALU, no fetch)
  if (uHalo > 0.5 && !skyP && dot(col, vec3(0.299, 0.587, 0.114)) < 0.18) ink = uInkHalo;
  col = mix(col, ink, edge);

  col += (h12(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5) * uGrain;      // paper grain
  if (uViewfinder > 0.0) {
    vec2 c = uv - 0.5;
    col *= 1.0 - uViewfinder * smoothstep(0.35, 0.75, length(c * vec2(1.6, 1.0))) * 0.35;
  }
  gl_FragColor = vec4(col, 1.0);
  gl_FragDepth = texture2D(tDepth, uv).x;
}
```
Rules:
- Lines appear on both sides of a discontinuity, so they are about 2 px at 1 px offset. Thickness range: 1.4–3.0 px at 720p.
- Silhouettes against the sky use `wMax` from the object side, so a line break on the object also breaks its silhouette. This is intended and matches the reference's broken silhouettes.
- `uLineFade`: gameplay `(30, 110, 0.35)`, title `(1e4, 2e4, 1.0)` (off), dialog close-ups `(30, 110, 0.35)`.
- `uFog`: gameplay day `(40, 120, 0.30)` toward `#9ae4d5`; night `(25, 100, 0.45)` toward `#22365a`; title off.
- `uGrain`: 0.018 by default, 0.035 at night, 0.06 in viewfinder mode.
- The interactable affordance is the thicker line (ids 230–239, `lineWeight 1.4`) plus the DOM prompt (§8.2). `uBoil` stays global and is reserved for uncanny moments.

### 4.5 "Hand-drawn" behavior summary
- **Breaks and thickness** are world-anchored (from `tNoise` b/a in the material), so they are stable when the camera moves, with no shower-door effect.
- **Boil** (line jitter re-seeded at 8 fps) is **off by default**. It turns on with `uUncanny`, using the §2.3 mapping `uBoil = uUncanny <= 0 ? 0 : mix(0.3, 1.0, smoothstep(0.15, 0.6, uUncanny))`, so the night baseline 0.15 already gives the faint tremble GDD §5.7 asks for. Lines trembling means something 怪 is near. Test mode forces it to 0.
- Fine interior detail lines (seams, vents, posters, window grilles, sign glyphs) are **painted into canvas textures** in `ink.line`/`ink.deep`: 2–3 px strokes at 64 px/m, with ±0.5 px random jitter per stroke. They are never drawn by the post pass.

### 4.6 SwiftShader performance notes
- Cost per pixel: 5 info + 5 depth + 1 color fetches, 2 octahedral decodes per tap, no loops over lights. Everything is 8-bit and nearest-filtered. Use a single fullscreen **triangle** (not a quad).
- The MRT (one geometry pass) is preferred over a second "normals" render with `overrideMaterial`, because SwiftShader does vertex work on the CPU.
- `antialias: false`, `stencil: false`, `powerPreference: 'high-performance'`, `renderer.setPixelRatio(1)` for tests (default `min(devicePixelRatio, 1.5)`). Low preset: pixel ratio 0.75 and shadow map updated every 2nd frame.
- No EffectComposer. Its extra copy passes and HalfFloat targets cost more than they give here.
- **Measured** (reference prototype, headless Chromium + SwiftShader, 1280×720, about 26k tris, 11 draw calls, 1024² BasicShadowMap): **29–47 ms per frame** including shadow, MRT, and composite. Scale from there. The 150k-triangle ceiling is roughly the limit for about 10 fps screenshot runs.
- Sky noise is **baked once** (§5). The composite does one sky fetch.
- `?test=1`: fixed timestep, seeded RNG, `uBoil = 0`, cloud drift frozen, `uGrain` seeded by a constant frame index. This makes screenshots reproducible.

---

## 5. (d) Painted sky

### 5.1 Cloud map bake (once at boot, GPU, about 1 frame)
Render a fullscreen pass into a **1024×512 RGBA8** target (`LinearFilter`, **no mipmaps**, `wrapS = RepeatWrapping`, `wrapT = ClampToEdge`). Treat it as an equirectangular map over the *world* direction sphere:
```glsl
float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
vec3 dir = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
vec3 p = dir * vec3(2.0, 4.5, 2.0);                       // squash vertically → long horizontal banks
p += 0.45 * vec3(fbm(p * 1.7 + 11.0), fbm(p * 1.7 + 23.0), fbm(p * 1.7 + 37.0));  // domain warp → torn edges
float cloud  = fbm(p);                                    // 5 octaves, lacunarity 2.1, gain 0.5
float streak = fbm(dir * vec3(1.5, 9.0, 1.5) + 5.0);      // thin streak layer (optional 3rd tone)
float speck  = hash(floor(dir * 180.0));                  // tiny flecks / stars
gl_FragColor = vec4(cloud, streak, speck, 1.0);
```
3D noise over `dir` means there is no pole pinch and no seam.

### 5.2 Sky in the composite (only where depth == 1)
```glsl
vec3 skyColor(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0); v /= v.w;
  vec3 dir = normalize(mat3(uCamWorld) * v.xyz);
  dir = uSkyRot * dir;                                   // mat3: slow drift about world Y (0.004 rad/s)
  vec2 eq = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec4 m = texture2D(tCloud, eq);
  vec3 col = mix(uSkyBase, uSkyCloud, step(uCloudCut, m.r));
  col = mix(col, uSkyCloud, step(uStreakCut, m.g) * uStreakOn);      // optional streaks
  col = mix(col, uSpeck, step(uSpeckCut, m.b));
  float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));             // moon (night/uncanny)
  col = mix(col, uMoonColor, step(md, uMoonSize) * uMoonOn);
  col = mix(col, uInk, (step(md, uMoonSize + 0.004) - step(md, uMoonSize)) * uMoonOn);
  return col;
}
```

| Preset | `uSkyBase` | `uSkyCloud` | `uCloudCut` | Specks | Moon |
|---|---|---|---|---|---|
| Day (gameplay) | `#65c1bc` | `#9ae4d5` | 0.52 (≈ 40–45% cloud) | `#9ae4d5`, cut 0.992 | off |
| Title ("space") | `#65c1bc` | `#6dcac0` | 0.60 (faint blotches) | `#7fd3c8` at 0.990, plus 1 in 4 specks in `ink.line` | off |
| Night | `#22365a` | `#34507a` | 0.56 | `#cfe8dc` stars, cut 0.985 | `#f3ecd2`, size 0.035 rad |
| Uncanny | `#16262b` | `#3d6b62` | 0.50 | `#3d6b62` | `#d0453b` blood moon, size 0.06 rad |

The morning, dusk and dawn presets and the per-palette ink/grade values are in GDD §10.3 (they win over this table). The uncanny preset is blended in with the **shifted** weight `uUncW` (§2.3), never with raw `uUncanny`.

- Edges are hard `step()` on a linearly filtered field, so they stay crisp at any zoom. The slight torn jaggedness comes from the domain warp plus 5 octaves.
- **Never** use a vertical gradient in the sky, and never use a sun disk.
- Birds: 3–6 flat dark `ink.line`-colored "V" meshes (4 tris each) circling slowly high above the player. These live in the FX pass or main pass (with lineWeight 0).
- Mood changes lerp the uniforms over 1.5 s. Cloud cut changes are stepped: they tween in 3 discrete jumps, so the sky "repaints" rather than dissolving.

---

## 6. (e) Tiny-planet presentation

### 6.1 Why and how
- Levels are **authored in flat charts**: local (x, z) meters around a chart pole on the sphere.
- A chart maps to the sphere with the **exponential map** (azimuthal-equidistant). This is exactly TECH_NOTES `expMap`/`logMap`, so gameplay can keep TECH_NOTES' sphere walker and chart collisions.
- The mapping is baked once for static geometry and applied per frame for dynamic objects.
- There is no vertex-shader bend. Therefore shadows, raycasts, frustum culling, and the depth pass work natively.
- **Radius (art decision):** `PLANET_R = 80`.
  - At a 1.5 m eye height the horizon is 15.5 m away and the road crest sits at about 68% of screen height. A 30 m landmark stays visible across a whole 64 m chart.
  - R = 40 (TECH_NOTES' prototype) puts the horizon 11 m away and the crest at about 80%, which is too cramped to spot clues and landmarks in a city.
  - Acceptance range: **R 65–110**. Every file reads the constant.

### 6.2 Math (TS; GLSL counterpart in §3.4)
The general chart form: pole `n` (unit) with tangent basis `e1` (flat +x) and `e2 = e1 × n` (flat +z).
```ts
export interface Chart { n: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3 }
export function chartToWorld(ch: Chart, x: number, y: number, z: number, out = new THREE.Vector3()) {
  const r = Math.hypot(x, z), k = PLANET_R + y;
  if (r < 1e-6) return out.copy(ch.n).multiplyScalar(k).add(PLANET_CENTER);
  const th = r / PLANET_R, s = Math.sin(th) / r;
  return out.copy(ch.n).multiplyScalar(Math.cos(th)).addScaledVector(ch.e1, s * x).addScaledVector(ch.e2, s * z)
            .multiplyScalar(k).add(PLANET_CENTER);
}
// rigid placement: q = minimalRotation(n → up) · basis(e1, n, e2) · yaw(about local up)
```
The special case below is the single north-pole chart (`n = +Y`, `e1 = +X`, `e2 = +Z`) with `PLANET_CENTER = (0, −R, 0)`, as used by the art prototype. **Production code does not use this snippet**: it uses `src/core/planet.ts` (ARCH §2.8.1), which centers the planet at the origin. Headings there are clockwise from local north, so `placeOnPlanet`'s `yaw` about +Y below (counter-clockwise) must not be copied either.
```ts
export const PLANET_R = 80;
export const PLANET_CENTER = new THREE.Vector3(0, -PLANET_R, 0);   // prototype convention only
const Y = new THREE.Vector3(0, 1, 0);

/** flat (x, z) + height y above ground → world position */
export function flatToWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
  const r = Math.hypot(x, z);
  if (r < 1e-6) return out.set(x, y, z);
  const th = r / PLANET_R, s = Math.sin(th), k = PLANET_R + y;
  return out.set((k * s * x) / r, k * Math.cos(th) - PLANET_R, (k * s * z) / r);
}
/** local "up" (planet normal) at flat (x, z) */
export function upAt(x: number, z: number, out = new THREE.Vector3()) {
  const r = Math.hypot(x, z);
  if (r < 1e-6) return out.copy(Y);
  const th = r / PLANET_R, s = Math.sin(th);
  return out.set((s * x) / r, Math.cos(th), (s * z) / r);
}
/** rigid placement: position + orientation (minimal rotation Y→up, then yaw about local up) */
const qT = new THREE.Quaternion(), qY = new THREE.Quaternion(), up = new THREE.Vector3();
export function placeOnPlanet(o: THREE.Object3D, x: number, z: number, yaw = 0, y = 0) {
  flatToWorld(x, y, z, o.position);
  qT.setFromUnitVectors(Y, upAt(x, z, up));
  qY.setFromAxisAngle(Y, yaw);
  o.quaternion.copy(qT).multiply(qY);
}
/** sun uniforms: uSunPole = player up; uSunAtPole from the geographic tangent frame (not the heading) */
export function sunAt(up: THREE.Vector3, east: THREE.Vector3, south: THREE.Vector3, out = new THREE.Vector3()) {
  return out.copy(up).multiplyScalar(0.80).addScaledVector(east, 0.55).addScaledVector(south, 0.25).normalize();
}
```
The minimal rotation maps a flat heading exactly onto the sphere's tangent heading (radial → radial, tangential → tangential). A yaw chosen in flat space therefore stays correct on the planet.

### 6.3 Authoring rules
- **Ground, roads, sidewalks, plazas, long walls or rails (> 10 m), cables:** build in flat space, tessellated at **≤ 2 m** (sagitta error < 1 cm), merge per chunk, then **wrap per vertex** with `flatToWorld`. Rotate normals by the minimal rotation at each vertex.
- The **base ground is a tessellated disc**, e.g. `RingGeometry(0.01, 72, 96, 36)` rotated flat, never a square (square corners wrap into a diamond on the ball). Never use a `CircleGeometry` fan either: its 72 m triangles cannot follow the curvature. Past 64 m, blend into the planet body's `grass`, then `sea.shallow` and `sea` bands.
- **Buildings, props, trees, characters:** build in local space and **place rigidly** (`placeOnPlanet`) at their footprint center. Sink the base 0.3 m (a skirt) so curvature gaps never show. The sagitta under a 10 m footprint is 0.16 m.
- **Chunking:** merge static geometry per **16 × 16 m flat chunk** and per material. Each chunk is one `Mesh` with vertex colors and `aSurfaceId`, placed or wrapped as above.
- **Horizon culling** (CPU, per chunk or object, per frame): with `a` = arc distance from the player, `b` = bounding radius, and `H` = height, visible iff `a − b < sqrt(2R·(h_cam + 0.5)) + sqrt(2R·H) + 5`. Half the planet is always hidden, so this cuts about 40–60% of draw calls.
- **Planet body:** `IcosahedronGeometry(R − 0.05, 4)` (5,120 tris). Vertex colors: `grass` on the cap ring beyond the town, `sea.shallow` band, and `sea` elsewhere. It has its own surface id, so it gets a silhouette line against the sky.
- **Title dressing:** the prototype's bare planet read as empty. Scatter about 60 instanced low-poly trees, rocks, and tiny houses over the decorative ring and far side (θ 0.8–2.4 rad), plus 6–10 island blobs, so the ball looks inhabited all around like the reference. Horizon culling hides them in gameplay at no cost.
- **Landmark:** place one 25–30 m vertical landmark (TV/water tower, pagoda-roofed temple, or giant billboard frame). It is visible above the horizon from anywhere within about 85 m of arc (`sqrt(2·80·1.5) + sqrt(2·80·30) ≈ 15 + 69 m`) and is the player's compass. Use one landmark per chart if there are several districts.
- **Scale:** streets 6–8 m, alleys 2.5–4 m, sidewalks 2 m, storeys 3 m, buildings 2–6 storeys, doors 2.1 m.
- **Area:** if the design needs more, add charts (districts) around the sphere or raise `PLANET_R` up to 110 (horizon 18 m) rather than flattening. Keep every chart at ≤ 0.8 rad from its pole.

### 6.4 Cameras
| Mode | Setup |
|---|---|
| **Gameplay** | vFOV 50°. Built in the player's local frame (`up = upAt(px, pz)`): `camPos = playerWorld + up·1.5 + back·3.6 + right·0.5`; `lookAt(playerWorld + up·1.5 + fwd·6)`; **`camera.up.copy(up)`**. Mouse orbit yaw free, pitch −30°..+20°. When pitching up, the boom lowers toward 0.9 m eye height to show more sky. Critically damped follow (ω ≈ 8/s). Pull the camera in on collision. |
| **Dialog** | vFOV 38°. Camera 2.5 m out from the speaker, 0.05 m above the speaker's **head**, looking 0.28 m below the head (≤ 30 % of the head height for small speakers), so the face lands at ≈ 35 % of the frame height, above the dialog box (P3-look L2; the old fixed 1.1 m eye / 1.45 m look point hid short speakers' faces under the box). 3/4 angles that keep the hero out of frame win; NPCs that cannot turn to the hero are framed from their own front. Cut, don't lerp, between speakers. P3r2: the hand-over from the follow camera **eases** in (0.7 s) and back out (0.55 s) through `cameraRig.blend()` (smoothstep on position / orientation / fov, sim time). **Object inspects** (an `it.*` / gate node started by E on an interactable) get the same treatment: vFOV 40°, 2.3 m out from the object toward the hero at a 3/4 swing, 0.55 m above it, the object framed at ≈ 36 % from the top (above the box). |
| **Title** | vFOV 30°. `camPos = PLANET_CENTER + 460·(cos35°·(sin φ, 0, cos φ) + sin35°·Y)`, i.e. 35° above the planet's equator, so the town cap tilts toward the viewer and sea fills the lower part. φ advances 0.05 rad/s. `camera.up = +Y`; `lookAt(PLANET_CENTER + (0, 20, 0))`. Near 250, far 600. Shadows off, fog off, line fade off. |
| **Viewfinder (取景)** | First-person from the lens position (head height 1.72 m, 0.05 m forward). vFOV lerps 50° → 55° over 0.35 s. `uViewfinder = 1` turns on the barrel/vignette/grain look. The spirit layer (`GHOST` = layer 2) is enabled **only while night mode (N) is on** (GDD §3.2 rule ①), not by the viewfinder alone. |

### 6.5 How the curvature must read (check in screenshots)
- At a 1.5 m eye height the ground horizon is `sqrt(2·80·1.5) ≈ 15.5 m` away, and it dips `sqrt(2h/R) ≈ 11°` below eye level. With pitch 0 the road visibly **crests at about 68% of the screen height from the top**; the prototype measured 68.3%.
- The sky occupies about **45–55% of the gameplay frame**. The protagonist's phone head sits **above** the horizon line, against the sky.
- Looking down a street, far buildings **sink and fan outward**. A 9 m building 40 m away shows only its upper ~70%.
- On the title screen the town sits on top of a ball. Sea wraps the lower half. The whole silhouette is inked.

---

## 7. (f) Characters

### 7.1 General rules (all characters)
- They are built from primitives: `CapsuleGeometry`, `RoundedBoxGeometry` (from `three/addons`), cylinders, and spheres. They use **vertex colors from `PAL`**, one toon material per character (plus one unlit material for screens), and `aSurfaceId` per part.
- Budget: protagonist ≤ 3.5k tris and ≤ 4 draw calls; NPC ≤ 1.8k tris and ≤ 2 draw calls; ≤ 8 NPCs on screen.
- **Chunky, readable proportions.** Hands are 1.2× and shoes 1.3× oversized. Limbs are simple tapered capsules. There are no fingers (mitten + thumb). Silhouettes must read at 60 px tall.
- **Rig:** an `Object3D` hierarchy with procedural animation. No skinning is required.
  - Walk cycle: 1.8 Hz at 3.2 m/s, vertical bob 3 cm, arm swing ±25°, a slight torso counter-twist.
  - Idle: breathing scale 1.5% at 0.3 Hz.
  - Motion is smooth, but **expression changes are instant cuts** (UI-like).
- No pure black anywhere (darkest is `ink.deep`). No skin shading beyond the 2 bands. Faces never get specular.

### 7.2 Protagonist — the phone-camera-head man (机头人)
Total height **1.86 m** to the top of the phone.

| Part | Spec |
|---|---|
| **Phone head (slab)** | `RoundedBoxGeometry(0.24 w, 0.40 h, 0.075 d, 4, 0.035)`, portrait. Bottom at 1.46 m, tilted back 4°. It is slightly thicker than a real phone so it reads from the side. |
| Face side (forward, `+fwd`) = phone back | matte `plaster.white`-family `#eef1e6`. The **side frame band** is `accent.orange` `#d8944c`, a 0.012 m inset band around the rim, which gives an orange silhouette edge from behind. |
| **Camera bump ("the face")** | A rounded square island, 0.17 × 0.17 × 0.018 m, `cloth.charcoal` `#333d40`. It is centered horizontally with its top 0.03 m below the phone top, so the face sits in the upper half. |
| Lenses = eyes | **Two main lenses side by side** (Ø 0.062, 0.085 m apart), each built as: silver ring `metal.rail` → black-teal glass `#1b2a33` → aperture disk `ink.deep` (pupil, scaled for expressions) → one hard glint dot `#9ae4d5` at upper-left. |
| Third lens = mouth/nose | A smaller lens (Ø 0.038) centered below the eyes. It can "open" (scale) when talking. |
| Flash LED | Ø 0.018, `accent.yellow` `#f7cf5e`, lower right of the bump. It is unlit/emissive when the flash or night torch is on, and blinks for "surprise". |
| Mic hole, side buttons | A mic pinhole (`ink.deep` dot) lower left. Volume rocker plus power button on the frame sides, reading as "ears". |
| **Screen (back of head)** — faces the gameplay camera | A black glass border `#1b2327` 0.012 m around a screen plane with the **unlit** material, driven by a `CanvasTexture` of 128×256 that is redrawn only on state change. The background is `ink.deep` `#1f282d`. Glyphs are thick 6 px `#9ae4d5` line-art with a tiny status bar at the top (time in Silkscreen, battery). |
| Neck | Cylinder r 0.055, `skin`. It plugs into the phone's bottom edge where the charging port would be, with a tiny `metal.rail` collar. |
| Torso | A boxy work jacket: rounded box 0.44 × 0.56 × 0.25, `cloth.charcoal` `#333d40`. The collar, cuffs, and a zipper stripe are `accent.orange`. |
| Arms / hands | Capsules r 0.055 in charcoal sleeves; `skin` mitten hands at 1.2×. |
| Legs | `cloth.navy` `#234457` tapered capsules, hip at 0.82 m. |
| Shoes | Chunky `cloth.white` `#f3f6ea` sneakers at 1.3×, with an `accent.orange` sole stripe. |
| Bag | A crossbody strap in `cloth.sage` `#6f8a7f` with an `accent.ochre` buckle and a small boxy pouch on the hip. |

**Expression sets**
- **Lenses (seen in dialog shots and the front view):**
  - aperture pupil scale: calm 0.55, surprised 0.85, suspicious 0.30, scared 0.95 + shake
  - "eyelids": bump-colored half-disks slide over the lenses (shutter blink every 3–6 s over 120 ms, squint = half-closed)
  - flash LED blink = "!"
- **Screen (seen from behind in gameplay):** these are emoji-like glyphs drawn in canvas, not font emoji.
  `平静 (· ·)`, `开心 (^ ^)`, `疑惑 (? ·)`, `惊讶 (O O)`, `害怕 (> <)`, `思考 (…)`, `发现线索 (!)` (blinks at 2 Hz when within 4 m of a clue), `低电量 (battery icon)`, `录像 (● REC)` in viewfinder, `信号干扰 (static noise pattern)` when an uncanny entity is within 10 m.
  **Signature 志怪 beat:** during manifestations, the screen shows a face that is *not his* (a wide, too-calm smile) for 0.5 s.
- The screen and flash are unlit, so at night the protagonist carries his own glow. This is a readability asset.

### 7.3 NPC style (ordinary townsfolk)
- Same kit, with heads as rounded blobs in `skin`. Faces are a small canvas decal: two `ink.deep` dot eyes, short brow strokes, an optional tiny mouth, and no nose line. Hair is chunky merged blobs in `hair.slate` or muted colors (`#6b5a52`, `#8d8a86` for elderly).
- Body archetypes for silhouette variety: 大妈 (stout, `cloth.sage` + `tile.pink` scarf), 外卖小哥 (`accent.skyBlue` or `accent.ochre` jacket + helmet), elderly man with a folding stool (`roof.mauve` jacket, bent spine 12°), a schoolkid (`cloth.white` + `cloth.navy` uniform), 保安 (`cloth.navy` + `accent.yellow` badge), shopkeeper (apron `steel.green`).
- Colors come from environment families with **at most one small accent** each. NPCs must never out-contrast the protagonist.
- **Deadpan rule:** no NPC reacts to the phone head. That is the running joke and the unease.
- **Suspicious NPCs** (secretly 怪) get *one* subtle rule-break: no cast shadow (`castShadow = false`), eyes that never blink, standing exactly still between frames, or a lagging screen reflection.

### 7.4 Uncanny entities (志怪) — "if it breaks the art rules, it is 怪"

| Entity | Look | Rule it breaks |
|---|---|---|
| **纸人 Paper effigy** | Flat extruded card bodies (0.01 m thick, `alphaTest` cutout silhouettes) in `spirit.paper` `#efe9d8`. Round `spirit.cinnabar` rouge cheeks and brushed ink eyes are painted in canvas. Joints are split-pin dots. | **Unlit** (no bands), **cinnabar ink** (id 240+), and its motion is "paper-stepped" at 6 fps. |
| **无面人 Faceless commuter** | An ordinary NPC body; the head is a smooth egg in `skin` with no features. | No shadow. In the viewfinder, the face shows animated static (canvas noise). |
| **影鬼 Walking shadow** | A flat `ink.deep` decal on the ground (a wrapped mesh 2 cm above the ground, lineWeight 0) that moves on its own, sometimes detached from its owner. | It is a shadow without a caster, and its edge boils (its own mesh edge noise-displaced at 8 fps). |
| **鬼火 Ghost-fire / 灯笼鬼** | Teal flames `spirit.ghostfire` `#7ef0c8`, 3-layer additive teardrops in the FX pass. The lantern body is `banner.red` paper, unlit. | Additive light in a world with no glow, and no ink lines. |
| **镜中人 The screen-self** | The protagonist's own head screen shows another face. | UI lying to the player. |

- Visibility layers: layer 0 = world, **layer 2 = spirit / `GHOST`** (visible only in the **night** viewfinder, in night-mode photos, and at dawn when GDD §5.7 moves every spirit to layer 0). Layers 3 (`PAST`) and 4 (`PHOTO_ONLY`) render only inside photo captures (ARCH §2.3). Which character sits on which layer is fixed by GDD §6.1 (e.g. 纸妹 is a physical paper effigy on layer 0 that only *talks* in night view).
- A manifestation ramps `uUncanny` 0 → 1 over 1.2 s. It is accompanied by `uBoil` rising, sky preset → Uncanny, and ink → `#10181a`.

---

## 8. (g) UI style

### 8.1 Global rules
- Everything is a **slab**: a flat fill, a 3 px `ui.border` border, and a hard offset shadow `4px 5px 0 ui.shadow`. There are no gradients, no blur, no glass, and no rounded corners over 3 px. Each element has a slight tilt of −1.5°..+1°, fixed per element.
- Sizing: design at 1280×720 and scale with `--u: calc(min(100vw / 1280, 100vh / 720))`, applied as `calc(26 * var(--u) * 1px)` etc. Minimum body size is 18 px.
- Motion: things "stamp" in. Scale 0.94→1 plus rotation settle over 140 ms `cubic-bezier(.34,1.56,.64,1)`. Dismiss is 90 ms scale → 0.97 and fade. There are no slow fades except chapter cards.
- The DOM overlay sits above the canvas and uses `pointer-events` only on interactive elements.

### 8.2 Components (720p metrics)
| Component | Spec |
|---|---|
| **Dialog box** | 680 × 120 (auto-height up to 3 lines), bottom-center, top edge at y ≈ 470. Background `ui.paper` `#f8f8f6`, border 3 px ink, shadow `4px 5px 0 #405157`, `transform: skewX(-1.5deg) rotate(-0.3deg)`. Padding 28 px 56 px. Text: `ui.text`, body font 26 px, line-height 1.45. |
| Typewriter | 25 ms per CJK char. Pauses: `，、` 120 ms; `。！？` 250 ms; `……` 400 ms. Click, Space, or E completes the line, then advances. |
| **Name tag** | Overlaps the dialog's top-left (offset −30, −50), rotated −1°. Background `ui.tag` `#66bde6`, border 3 px ink, shadow `3px 4px 0 ink`. Display font 30 px, white text with `2px 2px 0 #2f6f8f`. Variants: NPC `#f0d055` with ink text; spirit `#c8433a` with `#efe9d8` text; system lines use a grey `#8d8a86` tag with ink text. Names come from GDD §6.1 (spirits show their real names: 土地, 纸妹, 拆/折, 站务员). Only the protagonist's own tag reads `？？？` until `name_known`, then `周远` (GDD §0.1). |
| **Next button** | A 56 × 56 `ui.paper` slab at the dialog's bottom-right, holding a `ui.tag` blue right-triangle (24 × 30) outlined in ink. It bobs 2 px at 1.2 Hz once the line is complete. |
| **Choices** | Stacked white slabs (min-width 280), body font 22 px, 10 px gap, right-aligned above the dialog. Hover or focus: fill `ui.button` `#f0d055`, translate (−2, −2), shadow grows to 6 × 7. |
| **Interaction prompt** | World-anchored (projected 0.3 m above the object): a small white slab with a key cap and a verb. The key cap is a mini yellow slab (`E`, Silkscreen 14 px). Verbs are the GDD §16.2 set: `交谈`, `调查`, `拾取`, `使用`, `坐下`, `爬梯`, `摘头`, `进入`, `出示` (there is no `拍照` prompt; shooting happens in the viewfinder). Body font 18 px. Pops in within 2.5 m; which one shows is decided by the core picker (priority, then distance; ARCH §2.8.6). |
| **Objective chip** (HUD) | Top-left, 18 px body font, white slab, one line, e.g. `找到周记照相馆（猫耳巷）` (texts: GDD §10.6). |
| **Phone status** (HUD) | Top-right, a tiny ink slab showing signal bars (0–4, GDD §3.10) and the battery (always 1%) drawn in CSS, plus time in Silkscreen 14 px `21:07`. |
| **Phone 手机** (Tab / J; GDD §16.4) | A full-screen phone overlay with three tabs `相册` / `微信` / `备忘录` (there is **no** separate clue notebook and no drag-and-drop clue board: GDD §21.1 cut 7). Style: the phone body is an ink slab; the 备忘录 page uses the notebook look: paper `#f3efe2` with a 24 px grid in `#d9d3bf`, 3 px ink page border, handwriting font 22 px in `ink.line`, cinnabar `#c8433a` check marks for frames ①–④ and bestiary entries. Album thumbnails are **polaroids**: `#f8f8f6` frames with a 3 px ink border, rotated ±4°, held by solid `#e9dca6` tape strips. |
| **Buttons (menu)** | Yellow slab `#f0d055` with a 3 px ink border and bevel `box-shadow: 0 5px 0 #bf8838, 0 8px 0 ink`. Label: display font 28 px, `#fffbe8`, with a `2px 2px 0 ink` text-shadow. Hover lifts 2 px; active presses down 3 px (the bevel shrinks). |
| **Title lettering** | Two stacked lines centered over the planet, display font 132 px, letter-spacing 6 px. Face `#edf2e4`; `-webkit-text-stroke: 3px ink; paint-order: stroke fill`; extrusion `text-shadow: 0 7px 0 #9baa9e, 0 9px 0 ink`. Each character gets fixed random jitter (rotate ±2°, y ±3 px). Characters stamp in one by one (60 ms stagger). The game title comes from the GDD. |
| **Start button** | `开机` (GDD §1; not `开始`) in the menu button style, 150 × 44, centered below the planet. Secondary items `继续` (only with a save) and `设置` are smaller white slabs. |
| **Chapter card 志怪 moments** | Fade to `ink.deep` over 600 ms. Brush font 64 px in `spirit.paper`, e.g. `第一章 · 无脸`, with a body-font subtitle (`9月29日 10:00`) and a **cinnabar seal stamp** (a square `#c8433a` with an inset border, `spirit.paper` brush glyph — per chapter 醒 / 脸 / 眼 / 影 / 合, GDD §10.1 — rotated −6°) that stamps in with a 1.15 → 1 scale and a 2 px screen shake. The 聊斋卡 (GDD §10.5) uses the same ink ground with the seal 「显影」. |
| **Viewfinder overlay 取景** | Four corner brackets (`#f8f8f6`, 3 px, with 1 px ink outline) inset 40 px. A center focus square 60 px that snaps smaller when a target is framed; its colour follows the frame state white / `#f0d055` yellow / `#62ac91` green (GDD §3.4). Top-left `● REC` (cinnabar dot blinking at 1 Hz, Silkscreen). Top-right battery, flash icon and `重合度 n%`. Bottom-centre the recognition bar `识别：…`; bottom `ISO 800  1/60  F1.8` plus the `{n}/40` counter. The shutter flash is a white overlay: 80 ms full, then a 250 ms fade. The captured frame then slides toward the phone icon as a polaroid (0.5 s). |

### 8.3 Fonts (Google Fonts; all verified to serve on 2026-09-29)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+QingKe+HuangYou&family=ZCOOL+KuaiLe&family=Long+Cang&family=Ma+Shan+Zheng&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">
```
```css
:root {
  --font-display: "ZCOOL QingKe HuangYou", "WenQuanYi Zen Hei", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif; /* blocky: title, name tags, buttons */
  --font-body:    "ZCOOL KuaiLe", "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;                          /* dialog, prompts */
  --font-hand:    "Long Cang", "ZCOOL KuaiLe", "Kaiti SC", "STKaiti", "KaiTi", cursive;                                                         /* notebook notes, in-world scribbles */
  --font-brush:   "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif;                                                                       /* 志怪 chapter cards, talismans, seals */
  --font-hud:     "Silkscreen", "Courier New", monospace;                                                                                        /* Latin/digits: REC, ISO, time */
}
```
- The test container has **WenQuanYi Zen Hei** installed, so fallbacks render real glyphs, not tofu.
- Google serves CJK fonts as unicode-range slices. At boot, warm them with
  `await Promise.race([Promise.all([document.fonts.load('26px "ZCOOL KuaiLe"', ALL_DIALOGUE_TEXT), document.fonts.load('132px "ZCOOL QingKe HuangYou"', TITLE_TEXT)]), sleep(3000)])`.
- **Canvas-baked text** (shop signs, posters, screen glyph labels) must be generated **after** that promise settles. Otherwise the fallback font gets baked in.
- Never rely on exact glyph metrics. Measure (`ctx.measureText` or the DOM) and wrap.
- In-world signage in canvas uses bold system 黑体 (`"WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", sans-serif`, weight 700), because real Chinese street signs are 黑体. Use `--font-brush` for temple and 志怪 signage.

---

## 9. World kit (environment builders)

- **Buildings:** boxes plus bevel trims (`ExtrudeGeometry` for eaves and cornices), 0.15 m ink-worthy steps between wall planes so the normal and id lines fire, and a slight 1–2° random lean on old buildings.
- **Façade textures** are `CanvasTexture`s at 64 px/m: flat fills from `PAL`, window grids (`glass.dark` panes, `ink.deep` frames, 防盗窗 bars), AC units, pipes, stains (flat blotches ±6% value), posters (`寻人启事`, `开锁 换锁`, `通下水道`, `房屋出租` with fake numbers), shop signs. Strokes are 2–3 px with jitter. **No gradients, no photo noise, no normal maps.**
- **Windows at night:** separate merged pane meshes with the unlit material. Swap the color per mood: day `glass.dark`; night `winWarm`/`winTv`/dark chosen by seeded random.
- **Cables:** `TubeGeometry` with 4 radial segments, r 0.02, catenary sag 3–6%, `cable` color, lineWeight 0, wrapped per vertex. Lots of them.
- **Trees:** 4–8 merged `IcosahedronGeometry(r, 1)` blobs with vertex noise displacement (±12%), `foliage` with `flecks: true`. Trunk: a tapered cylinder in `trunk`. ≤ 400 tris per tree; instance where possible.
- **Ground dressing:** manhole disks (ink ring painted into the texture), drain grates, road paint as separate thin meshes with their own id (so they get lines, as in the reference), and grass verges with dark `grass.dark` fleck decals.
- **Props** are instanced with a per-instance `aSurfaceId`: traffic cones (`accent.orange`/`cloth.white`), shared bikes, crates, plant pots (`roof.mauve`), bollards, a 红灯笼 pair at the temple.

---

## 10. Performance budget & quality presets

| Item | Test / Low | High |
|---|---|---|
| Pixel ratio | 1.0 (test) / 0.75 (low) | `min(dpr, 1.5)` |
| Shadow map | 1024², every frame (test) / every 2nd frame (low) | 2048² |
| Triangles (visible) | ≤ 150k | ≤ 150k |
| Draw calls (whole frame, all passes) | ≤ 120 | ≤ 120 |
| Composite fetches per pixel | 11 (+1 sky) | same |
| Noise textures | `tNoise` 128² RGBA8, `tCloud` 1024×512 RGBA8 | same |
| MRT format | RGBA8 ×2 + Depth24 | same |

Check `renderer.info.render.{calls,triangles}` in tests and log them with each screenshot.

---

## 11. (h) Do / Don't

**Do**
- Use `PAL` tokens only. Lit surfaces must display the exact palette hex.
- Keep 2 hard shading bands. Cast shadows use the same shade tone.
- Give every adjacent part a different `aSurfaceId`, because lines come from those boundaries.
- Paint fine detail (seams, grilles, signage) into canvas textures with ink strokes.
- Keep the camera low and let the sky take half the frame. Show the planet curve.
- Keep accents small (≤ 10% of the frame) and make the protagonist the highest-contrast thing on screen.
- Break the art rules **only** for 怪: unlit, cinnabar ink, no shadow, boiling lines, wrong palette.
- Stamp UI in quickly. Use the slab + ink + hard shadow for every UI element.
- Author gameplay in flat space and render on the sphere through `flatToWorld` / `placeOnPlanet`.
- Wait for fonts before baking canvas text. Keep test mode deterministic.

**Don't**
- No PBR (`MeshStandardMaterial`), no specular, no env maps, no bloom, no SSAO, no tone mapping, no MSAA/FXAA. The aliasing is part of the look.
- No `transparent` materials, `scene.background`, `Sprite`, or `LineBasicMaterial` in the main MRT pass. They break the info buffer. Put them in the FX pass or use the factory.
- No gradients in the sky or UI, no sun disk, no lens flares, no drop-shadow blur.
- No pure black `#000` or pure white `#fff` surfaces. The darkest is `ink.deep`; the whitest world surface is `#f3f6ea`. The pure-white exception is name-tag text only.
- No screen-space-anchored noise on lines while the camera moves (the shower-door effect). Boil is only for uncanny moments.
- No vertex-shader world bending. Wrap or place geometry instead, or shadows and raycasts will drift.
- No copying of messenger.abeto.co assets, shaders, code, fonts, or text.
- No font emoji on the phone screen. Draw the glyphs.
- No more than 3 saturated accents in one view, and no neon in daytime.

---

## 12. Reconciliation with `docs/TECH_NOTES.md` (written in parallel)

TECH_NOTES and this doc agree on the pipeline shape:
- MRT G-buffer plus a single fullscreen ink pass, no EffectComposer
- `BasicShadowMap`, `antialias: false`, `NoToneMapping`
- RGBA8 targets, chunked static geometry, horizon culling, sphere-walker gameplay

Where TECH_NOTES' prototype code differs on something **visual**, this doc wins:

| Topic | TECH_NOTES prototype | ART (binding) | Why |
|---|---|---|---|
| Sky | vertical gradient `skyHorizon→skyTop` + clouds `#d9f2ea` with inked edges | exactly 2 flat tones `#65c1bc` / `#9ae4d5`, no gradient, no cloud ink (§5) | measured from the reference |
| Ink color | `#1d2326`, mixed at 0.92 | `#2f3a3f`, full strength (§2.1) | measured from the reference |
| Line breaks / wobble | screen-space noise and **always-on 6 Hz boil** | world-anchored breaks and thickness from the material (`gInfo.a`). Boil **only** for uncanny moments (§4.5) | screen noise swims when the camera moves; boil is our "怪 is near" signal |
| G-buffer attachment 1 | `normal*0.5+0.5` (rgb) + hashed ink id (a) | oct-normal (rg) + surface id (b) + **line weight (a)** (§4.2). The id is an allocated range, not a hash, because 240–254 = spirit ink (§4.3). | needs the weight channel and the id ranges |
| Depth edge test | `ds − dc > 0.06·dc + 0.05` (near side only) | 1/z Laplacian (§4.4). Either is acceptable if grazing ground shows no false lines. | — |
| Toon bands | `toonRamp([0.45, 0.72, 1.0])`, 3 levels | 2 bands, shade = HSV formula (§3.1), optional baked contact band | fits the measured lit/shade pairs within 5/255 |
| Sun | follows player *heading* (`−heading·0.35 + right·0.45`) | follows the player's *position* only, fixed azimuth in the geographic frame (`sunAt`, §3.1) | a heading-relative sun flips every wall's band when the player turns |
| Planet radius | R = 40 | R = 80 (acceptance 65–110) (§6.1) | horizon 11 m vs 15.5 m; the city needs sightlines for clues and landmarks |
| Planet center / math | origin-centered, sphere walker, `expMap`/`logMap` charts | **origin-centered** (decided in GDD §0.2 / ARCH §2.8.1; the art prototype's `(0,−R,0)` is prototype-only). Art rules are chart ≤ 0.8 rad, rigid vs wrapped, disc ground (§6.3) | same math (the art prototype is the north-pole chart) |
| Spirit layer | layer 1, enabled by phone mode | layer 2 (`GHOST`), enabled only by **night** mode (§6.4, GDD §3.2) | GDD rule ① |
| Color storage | RT0 `SRGBColorSpace` (SRGB8_ALPHA8), composite does `colorspace_fragment` | **Pinned for production (ARCH §3.A): plain RGBA8 `NoColorSpace` RT0, the manual OETF in the material, no conversion in the composite** (the validated art-prototype route; captures then read back display-ready sRGB bytes). TECH's SRGB-RT0 route is the documented alternative only: it needs `col = sRGBTransferEOTF(vec4(col, 1.0)).rgb` at the end of §3.4. Never mix the two. | the requirement is only that palette hex shows exactly |
| Composite depth | `depthTest: false, depthWrite: false` | if the FX pass (§4.2 [4]) exists, the composite must write `gl_FragDepth` with `depthTest: true, depthFunc: AlwaysDepth` | FX must be occluded by the scene |
| Shadow box | ±14 m | ±14–22 m is fine | performance-dependent |

## Appendix A — Screenshot QA checklist (automated, 1280×720, `?test=1`)
1. **Sky pixels** (top 10% rows, where no geometry is present) are only `#65c1bc` or `#9ae4d5` (±3 per channel, which covers the grain) in day mode.
2. **Ink present:** ≥ 3% of pixels are within ±10 of `#2f3a3f` in a gameplay frame (the prototype measured 8.5%). There is an ink ring around the protagonist's silhouette.
3. **Palette fidelity and two bands:** in a lit wall region, ≥ 40% of pixels are the exact palette hex ±3 (the prototype measured 51–59%). At least one building shows both its lit hex and its derived shade hex (±3).
4. **No `#000000`** pixels, and no `#ffffff` pixels outside DOM UI (name-tag text). Night emissives such as `#ffd27a` are the only world colors with a channel at 255.
5. **Horizon:** in the default gameplay pose, the road crest lies between 60% and 74% of the screen height from the top, and the phone head is above it.
6. **Title:** the planet's bounding box spans 60–80% of the screen height and is centered horizontally. The background is `#65c1bc` / `#6dcac0` / specks only.
7. **Budget:** `renderer.info.render.triangles` ≤ 150k and `calls` ≤ 120 for the whole frame (info reset at frame start, so shadow + MRT + composite + FX all count; ARCH §5.1), logged per shot.
8. **Chinese text renders** in the dialog (no tofu). Dialog box pixels at its center are `#f8f8f6`.

## Appendix B — r186 gotchas verified against the package source
- `new WebGLRenderTarget(w, h, { count: 2 })` → `rt.textures[0..1]`. `rt.texture` is `textures[0]`.
- Built-in materials get `layout(location = 0) out highp vec4 pc_fragColor; #define gl_FragColor pc_fragColor` from three's prefix (unless `glslVersion === GLSL3`). Inject **only** the `layout(location = 1)` declaration.
- `getShadowMask()` lives in `shadowmask_pars_fragment`. MeshToon does not include it, so inject it after `shadowmap_pars_fragment`. It needs `receiveShadow` (declared in `lights_pars_begin`, which MeshToon includes).
- `PCFSoftShadowMap` is **deprecated in r186**. Use `BasicShadowMap` (our choice) or `PCFShadowMap`.
- Render targets are always written in the working (linear) color space, and `outputColorSpace` affects only the canvas. Hence the manual `sRGBTransferOETF` in our material, and no conversion in the composite.
- `perspectiveDepthToViewZ(depth, near, far)` is available via `#include <packing>` in the composite `ShaderMaterial`.

## Appendix C — Validated reference prototype (`docs/art-prototype/`)
- `index.html` and `main.js` are a single-file, non-production implementation of this spec. They include:
  - the §3.4 material injection
  - MRT with a depth texture
  - the §4.4 composite with the boil fix
  - the §5 cloud bake and sky
  - the §6.2 planet math, including per-vertex ground wrap and rigid placement
  - the phone-head protagonist blockout with a canvas screen face
  - a cinnabar-inked paper effigy
- It uses the single north-pole chart with `PLANET_CENTER = (0, −R, 0)`, `R = 80`, and the `uSunPole`/`uSunAtPole` sun from §3.4, so its GLSL is exactly the doc's.
- Run it with `cd docs/art-prototype && python3 -m http.server 8765`, then open `http://127.0.0.1:8765/index.html?mode=game|title|night|uncanny`. It imports three **0.186.1** from unpkg. `window.__result` reports `{ms, calls, triangles, errs}`.
- Renders: `shot-game.png`, `shot-title.png`, `shot-night.png`, `shot-uncanny.png`. **This is the minimum bar.** Production scenes should look at least this close to the reference, with far richer dressing.
- Issues the prototype caught, already folded into this doc:
  1. Boil jitter must move the center tap too (§4.4).
  2. Noise channels must be rank-equalized (§3.4).
  3. The ground must be a tessellated disc, not a square or fan (§6.3).
  4. The crest sits at about 68% of screen height, not 55% (§6.5).
  5. The title distance is 460 m (§6.4).
- Production code must be TypeScript under the architecture's module layout: the §3.3 factory, §6.3 chunking, and `PAL` from §2.5. Do not import from `docs/`.
