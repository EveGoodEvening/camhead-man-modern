# Requests from B (world) — for agent I and the other module owners

No frozen (S) file needs to change for B. The notes below are cross-module facts that the others (D/F/C/A) or I must
know when wiring; each item says who should act.

## 1. D (lens) — use `{ world: … }` anchors; values that differ from the GDD nominal table
`world.anchor()` resolves every `WORLD_ANCHOR_IDS` entry (positions, normals, radius, corners; `fish7` and
`tripod_head` carry live `object`s; `trail_plane` carries `canvas`). All stay within `GUARD` (6 m) of
`src/lens/anchors.ts` NOMINAL, but please prefer them over hard-coded ChartPos in `photoTargets.ts`:
- **Temple (‡ layout fix):** the plateau is only 12 m across; the GDD's donation box (3, 150°) sat *inside* the shrine
  doorway and the lions (5, 138°/152°) were 1.2 m apart (impassable). Now: donation box (3.1, 166°) with the QR on its
  front face at h 4.42 (`temple_qr`), lions at (5.4, 133.5°) / (5.4, 156.5°), **left lion head h 4.8**
  (`lion_left_head`). `vp_temple_2011` is recomputed by the GDD §5.4 rule (`src/world/vp.ts`): **(7.8, 137.5°, h 2.97),
  yaw 1.8°, pitch 2.1°** (review fix: an earlier 13.7° came from normalising the horizontal vector before taking its
  length — it aimed 11.6° over the idol and broke the ±8° pitch tolerance of `T_rephoto_2011`), lion at NDC x −0.60 / y −0.05 at 3× (16:9), lion 2.59 m from the lens. `world.spot()` returns
  it; `src/data/locations.ts` holds the same values.
- **P8 (`src/world/p8.ts`, glyph diff in `glyphs.ts`):** with the real 拆/折 glyphs the dot is low in 斥, so D ≈
  (41, 255.2°, h 2.38), the lamp shade S ≈ (38.7, 256.26°, h ~2.0) (dot patch 0.24 m). `world.spot('sp_net_dot' | 'sp_dot_ground' |
  'sp_lamp_p8')` and anchors `net_dot`, `lamp_p8` (radius 0.45 = the occluder sphere), `dot_ground` are the constructed
  values after `init()`. **`anchor('chai').corners` are the ring's 4 points at ±45°** (not the square's corners and not
  the E/W extremes): from V the ray to the west extreme passes 0.33 m from S and would be "occluded"; the diagonal
  points clear it (≥ 0.52 m). Please use `whole: { world: 'chai' }` for `T_chai`.
- `studio_qr` is on the roller shutter at h 2.65 (the alley ramp puts the door at h 1.2); `locker17` is exactly
  (29.42, 55°, 1.3) (column 4, row 2 of the column-major 01–20 grid); `plaque` / `lh_switch` sit on the tower surface
  either side of the door; `coop_door` is on the coop's south face (the head mount point for `pk_coop`).
- `trail_plane.corners` order is [bottom-left, bottom-right, top-right, top-left] **as seen from the bench** (the plane
  faces the bench); `trail_plane.canvas` is 512×192 (8:3), transparent background, strokes #cfe8dc with a 2 px ink edge.
- `setMirrorTexture(tex)`: the convex face maps uv 0..1 across the disc un-flipped (D already flips the LiveView).
- The P8 shade is also in `occluders('planet')` (`occ:p8_shade`); the dust net is **not** an occluder; gallery slabs
  and railings are not either (B1's proxy stops at the door wall).

## 2. F (story) — spots / interact positions that moved (±2 m rule)
- `sp_fire_ladder` → (16.4, 145.0°): the ladder cage now sits inside the gallery at B1's hill end.
- `sp_temple_idol.stand` → (3.65, 145°); `sp_donation_box` → (3.1, 166°) stand (4.8, 167.5°); `sp_lion_left` has a
  `stand` (7.3, 133.5°, h 3.26).
- `sw_gantry` → (−2.2, 0, −1.6) (1.2 m west of the gantry line so the attendant does not stand in a cabinet); the gantry
  flap lane is z −0.5…0.5 at x −1 (anchor (−1, 1, 0) as seeded).
- Studio interior is 10 × 10 m (z −3.5…6.5) so the 3.6 m follow boom has room behind `st_entry`; the shutter door is on
  the south wall (z 6.5). Subway hall is x −14…7 (stairs x < −10).
- The bus shelter spans lon −1.2°…7°; `sp_bus_bench` is at the west end of its bench (camera starts outside the roof).
- Gate visuals follow `GATES[].openWhen` automatically (studio shutter lifts on `P2_done`, estate arms, roof door,
  subway grille at `ch3_started`, lighthouse door on `lighthouse_open`, gantry flap on `gantry_open`); B emits
  `gateChanged`. The cinnabar dot drops from the net on `uncanny: M_zhe` and hides on `dot_taken`; frame ① shows on the
  roof while `pigeons_gone && !frame_1`; the tripod shows with `finale_started` / dawn.

## 3. C (chars)
- The portrait wall uses `chars.faceTexture(i).userData.{atlas, cell}` (i = 0…23) and draws all 24 faces with the shared
  atlas texture in one mesh — please keep that userData shape (or tell I if it changes).
- `chai` is registered by B (`actors`, id `chai`, `spirit: true`, `spot: () => null` so `goto('sp_chai')` uses the
  spot's `stand`). At dawn the actor root moves to the south-stair railing (1.2 m 「折」 board).

## 4. A (render) — performance facts measured on SwiftShader (shared machine, load 4–7)
- The frame is fragment-bound; sampling the 2048² atlas cost ~50 ns per fragment, so B splits materials: a **map-less**
  toon program for walls/ground/roofs/foliage/cables and a mapped one only for printed things (`sign`, `win`,
  `interact`, `net`). That is +1 program (map vs no-map) versus a single town program.
- Draw order: B sets `renderOrder` (solids first, ground last) but measured almost no gain — early-z seems ineffective
  with the MRT toon shader on SwiftShader; if A can cheapen the per-fragment path (e.g. skip the second noise fetch
  when `uFlecks = 0` via a uniform branch, or the shadow lookup for `receiveShadow = false`) the town benefits most.

## 5. I — integration notes
- `?dev=world:walkcheck` runs a BFS with the live physics and gates and stores the result in `window.__world.walkcheck`
  (also a vitest: `src/world/world.test.ts`). `?dev=world:stats` reports chunk / triangle counts in
  `window.__world.stats`. `window.__world.layers('solid,far', false)` hides world layers for perf bisection.

## 6. Review pass (independent reviewer for B, 2026-09-29)
- **D / F — P4:** `vp_temple_2011` pitch is **2.1°** (was 13.7°, a bug in `world/vp.ts`); the shrine occluder proxy is
  now walls + piers + lintel + roof with the 1.85 m doorway open (the old solid box "occluded" the idol from every
  viewpoint). With both fixes `?chapter=ch2&flags=idol_scanned&at=vp_temple_2011` → `setRef('ph_temple_2011')`,
  `zoom(3)`, overlay on → `evalShot()` is green (「显影 · 二〇一一 · 对位成功」) and `shoot()` sets `P4_done`.
- **F — S_zhe:** on a live (non-instant) `P8_done` the dot now drips off the net (0.8 s) instead of snapping to the
  ground, and the town's 拆 → 折 cascade waits for `uncanny: M_zhe` (3 s fallback when no beat emits it). Loads /
  `?flags=P8_done` stay instant.
- **F / C — spots:** `sp_chai.stand` → (39.2, 254.1): the old (39, 256) stood inside the constructed P8 lamp pole
  (which also had no collider; it has one now, radius 0.14). `sp_donation_box.stand` → (4.8, 167.5): (4.9, 162) was
  inside the right lion's collider (and broke S's `player.test.ts`, which pins r 4.8); `T_temple_qr` is green from it.
  A world vitest now asserts that no object-spot `stand` is inside a collider.
- **E / C / F — signal:** 2 bars only on the carriageway (r 31.05–37); the store door and locker (r 29–31) read 1 bar
  as GDD P2 clue 2 says (「便利店门口 1 格，路上 2 格」).
- **I — interiors:** the builder's "7.1k / 7.2k tris, over budget" were whole-frame numbers. The interior chunks are
  ≈ 0.65k (studio, + 24 portrait quads) and ≈ 1.0k (subway) triangles, 5–6 draws each: within the ≤ 5k / ≤ 10 budget.
- **A / I — performance (not solved by B alone):** SwiftShader fill cost dominates. Measured in one page at load < 1:
  store front 134–139 ms, estate gate 111–116, alley 130–134, bus bench 72–76, pier bench 58, roof_view 57, title 52.
  `?dev=render:prof` at the store: main pass 104 ms, composite 25 ms, shadow ≈ 5 ms. `?dev=world:overdraw` (new)
  measures depth complexity: 6.0 fragments/pixel at the store, 4.2 of them world `solid`. B added a street-level
  occlusion cull (`world/occlCull.ts`, late phase after core:cull): sector chunks whose whole longitude span is > 50°
  from a camera below 4.2 m (chart r ≥ 18) are skipped — pixel-diffed lossless at 24 spots × 3 headings — and the
  back-fill rule no longer pops visible houses at the market / site / hill gate. Gain 3–14 ms and 5–9 draw calls per
  street view. The rest is the visible sector's own layered facades (wall + frame + pane + shutter decals); the
  remaining lever is A's render scale (A-review: halving the MRT resolution took 100 → 36 ms).
