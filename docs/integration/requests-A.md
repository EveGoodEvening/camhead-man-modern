# Requests from A (render + audio) — for agent I and the module owners

Status: Phase 1 done (2026-09-29). A implements ARCHITECTURE §3.A without touching frozen files; nothing below blocks
render or audio. Items 1–2 are small S changes that make checks/tools match what A ships; items 3–7 are contract
notes for the other owners (how the render/audio APIs behave, so integration does not guess).

## 1. `scripts/lib/checks.mjs` `planetCentred()` — ignore sky specks (S)
The title sky has sparse 3 px specks (`#7fd3c8`, 1 in 4 in ink `#2f3a3f`, ART §5.2). The check counts every pixel that is
not within ±14 of `#65c1bc` as "planet", so specks widen the bounding box (centring still passes; a later 60–80 %
height check would not). A's own `dev/render.html?check` ignores runs shorter than 4 px (measured title bbox:
cx 0.502, cy 0.569, height 0.661).
**Request:** in `planetCentred()` require ≥ 4 consecutive non-background samples per row before extending the box
(see `src/render/devtools.ts → bbox()`).

## 2. `src/main.ts` — `?lowfx=1` under `?test` keeps DPR 1 (S, optional)
`params.dpr ?? (params.test ? 1 : params.lowfx ? 0.75 : …)` makes `?test&lowfx=1` render at DPR 1, so a lowfx smoke
run measures blob shadows + half-rate shadow map but not the resolution drop. Fine for determinism; if I wants the
lowfx timing in tests, use `?test&lowfx=1&dpr=0.75` (no code change needed).

## 3. For B (world) — what the pipeline assumes
- **Every main-pass mesh uses `makeToonMaterial`**; transparent/additive things go to `render.fxScene(id)`. In dev/test
  builds A `console.error`s once per offending mesh (Sprite, Line, Points, `transparent`, or a material without
  `userData.mrt`) — smoke fails on it.
- **Shadows:** toon meshes always *receive* the sun shadow (A forces it in the shader; `receiveShadow` is ignored).
  Set `castShadow` only on buildings/big props (§5.1 shadow budget ≤ 35k tris). **Interior ceilings must have
  `castShadow = false`**, or the interior key light (same 53° sun formula in the room frame) shades the whole room.
- **Lamps:** `registerLamp({ scene, pos, radius })` — `pos` is the bulb in world space, `radius` a 3D reach in metres
  (the ground pool radius is √(r² − h²)); `pos` is kept **by reference** (mutate it to move a lamp). A packs the 8
  lamps nearest to the camera; pools only exist while the night palette is active (ART §3.4 lamp loop is in the night
  branch). B's current 7.5 m reach at lamp height gives ~5.6 m ground pools.
- **Night windows / neon:** use `makeToonMaterial({ unlit: true })` (exact albedo, immune to grade and fog). Unlit
  materials write alpha 0 in RT0, which the composite uses as "no fog, no grade".
- **Surface ids:** adjacent parts need different `aSurfaceId` for lines; 240–254 draw cinnabar ink; A's title dressing
  uses 190–199.
- **Opaque draw order:** A installs `renderer.setOpaqueSort` (front-to-back by bounding-sphere depth). three's default
  sorts by `material.id` first, and every `makeToonMaterial` call is its own material, so creation order would decide
  overdraw on a fill-bound SwiftShader. Chunk geometry spatially so bounding-sphere centres are meaningful.

## 4. For C (characters)
- `rim: true` gives the ART §3.1 night rim; spirits get `spiritImmune: true` + ids 245–254 (cinnabar ink, boil).
- The hero torch (`registerLamp`) works as C does it (remove + re-register); mutating the registered `pos` in place
  is also supported.
- Under `?lowfx=1` A sets `castShadow = false` on every registered actor's subtree once and draws a flat ink blob
  (FX pass) under each actor instead.

## 5. For D (lens)
- `setViewfinder({ on, night, negative })` drives barrel + chroma + vignette + grain 0.06, the night cold vignette,
  `negative` inversion, and adds layer `GHOST` to the main camera only while `on && night` (A sets the main camera's
  layer mask every frame: WORLD (+ GHOST)).
- `capture()` renders WORLD (+ GHOST / PAST / PHOTO_ONLY per options), hides `hideInPast` / `transient` objects,
  applies `flash` through `uFlash` (lit band inside the radius, no cast shadow; at night it reads as a lamp pool),
  honours `palette`, skips the FX pass and viewfinder effects, and reuses the frame's shadow map. It temporarily sets
  `camera.aspect = w/h` and restores it.
- `createLiveView(n)`: its `texture` is an sRGB render-target texture (hardware-encoded), so it is correct as the `map`
  of `makeToonMaterial({ map, unlit: true })`; `repeat`/`offset` flips work as usual.
- `setSmoke(path)` may be called every frame; A rebuilds the ribbon only when an end moves ≥ 5 cm. The ribbon runs
  along the surface geodesic, rising from `from`'s height to 1.2 m above `to` (≤ 1.5 m arc), drawn in the FX pass.
- `sfx_countdown`: emit it once per second (10 times for the 10 s tripod timer). A decides the pitch by time since the
  first blip of a run (a gap > 1.6 s starts a new run): blips ≥ 6.5 s in are 1.5 kHz (GDD §17 "last 3 seconds").
  **D (review 2026-09-29):** `src/lens/tripod.ts` emits on `start()` AND again on the next tick (n = 10), i.e. 11 emits
  with two 16 ms apart. A drops a blip < 0.3 s after the previous one, so it sounds right, but please remove the
  `start()` emit (or initialise `timer.last = TIMER_SECONDS`) so the stream is exactly one blip per second.

## 6. For E (ui)
- `sfx_type` may be emitted per character; A rate-limits to 30/s. `settings.volume` accepts 0..1 (or 0..100).
- The `title` event switches the palette to `title` (instant) and back to the store palette on `{ shown: false }`.
- `sfx_click` / `sfx_stamp` / `sfx_fail` / `sfx_keypad` exist for UI; `sfx_keypad` cycles through 10 pitches.

## 7. For F (story)
- `render.setPalette(key, seconds)` defaults to 1.5 s; `phaseChanged` tweens 3 s unless `instant`.
- Uncanny envelopes follow the bus `uncanny` event (ARCH §3.A item 3). `M_chai_wake` holds at 1 until the next
  `dialogueEnd`; `M_zhe` (1 → 0 over 2 s) cancels it. `M_wake_face` / `M_mirror_face` are C-only (no render change).

## 8. Performance findings for B / I — corrected by the A review (2026-09-29)
**The main pass is fill-bound on fixed per-fragment cost (raster, depth test, two MRT colour writes), NOT on the
toon shader maths.** In-page A/B (same page, interleaved, min of 5 rounds — cross-page comparisons are too noisy
while other agents run browsers):

| View | full toon | trivial fragment (flat colour) | trivial vertex+fragment | half the meshes hidden | MRT at ½ res | MRT at ¼ res |
|---|---|---|---|---|---|---|
| day `sp_bus_bench` | 41 ms | 42 ms | 41 ms | 15 ms | 18 ms | 11.5 ms |
| day `sp_store_front` | 100–103 ms | 129 ms | — | 60 ms | 36 ms | 20 ms |

So a cheaper toon shader buys nothing; what helps is fewer covered pixels per frame (overdraw from layered façade
parts / big hidden interiors / alphaTest cut-outs near the camera, which also defeat early-z), fewer triangles, and
lower resolution (`?lowfx=1` DPR 0.75). The composite is ≈ 22 ms fixed (edges ≈ 14, sky ≈ 6; depth-texture format
u32/f32/u24s8 makes no difference). The earlier claim below ("trivial toon fragment → 24 ms") was a cross-page
measurement artefact.

**B:** street-lamp `radius: 7.5` (phaseState.ts) is a 3D reach; at the store front the sodium band covers the whole
façade *and* the 「月亮湾便利店」 sign with a hard arc, so the sign is no longer the brightest thing at night (GDD §10.4).
Suggest ~5–5.5 m (ground pool ≈ 3 m) or placing the heads further from walls.
**B / S:** at `sp_bus_bench` (day_start) the bus-shelter roof fills the top 10 % rows, so `skyRowsOnly` can never
pass there; either the spot's facing/boom changes or the check uses a sky rectangle like `dusk_temple`.

### (builder's original measurements) (SwiftShader, 1280×720, measured 2026-09-29 while other agents ran browsers)
A's fixed cost is the composite (≈ 21–23 ms) plus the toon fragment work of whatever B/C put on screen.
Per-pass breakdown via `?dev=render:prof` → `window.__renderProfile()` (min of 4 × 8 frames):

| View | tris / calls | main pass (+shadow) | composite | timeRender(8) |
|---|---|---|---|---|
| day `sp_bus_bench` (B's town) | 96k / 53 | 41 (+8) ms | 22 ms | 73–74 ms |
| day `sp_store_front` (B's town) | 129k / 70 | 112 (+6) ms | 22 ms | 150–180 ms |
| same view, trivial toon fragment (experiment) | 129k / 70 | 24 ms | 23 ms | 55–58 ms |
| title orbit | 71k / 51 | 31 ms (shadow parked) | 25 ms | 73–76 ms |

The store-front view is **fragment-bound**: ~88 ms of toon shading for one screen means heavy overdraw (layered
façade parts, alphaTest foliage/cutouts that disable early-z, big hidden interiors). A already sorts opaque draws
front-to-back and moved the albedo/shade math to the vertex stage; the rest has to come from B: fewer overlapping
layers close to the camera, `castShadow = false` on clutter, no alphaTest where a solid mesh works, and the §5.1
visible-triangle budget (≤ 85k for B). Night costs the same as day (the lamp loop is unrolled and branch-free).
