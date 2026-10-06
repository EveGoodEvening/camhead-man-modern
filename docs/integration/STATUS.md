# Integration status — Phase 2, agent I (2026-09-29)

Every item from `docs/integration/requests-{A..F}.md`. Decision: **done** (applied, files listed), **info** (a note
with nothing to change, checked), **rejected** (with the reason), **open → lane** (handed to a follow-up lane:
*gameplay* = golden path / lens rows / chapters / save, *look* = visuals / perf). Contract changes: `CHANGES.md`.

## Requests

| Request | Decision | Files touched / evidence |
|---|---|---|
| A1 `planetCentred()` ignores sky specks | done | `scripts/lib/checks.mjs` (run of ≥ 4 samples, like A's `bbox()`; also reports `hFrac`) |
| A2 `?test&lowfx=1` keeps DPR 1 | rejected | No change needed: DPR 1 under `?test` is deliberate (determinism); lowfx timing runs use `&dpr=0.75` |
| A3 notes for B (toon-only main pass, shadows, lamps, unlit, surface ids, draw order) | info | Boot, golden and checkpoint suites log 0 console errors, so no non-toon mesh reaches the main pass |
| A4 notes for C (rim, spirit ids, lowfx blobs) | info | — |
| A5 D: `sfx_countdown` emitted 11× (start + first tick) | done | `src/lens/tripod.ts` (`timer.last = TIMER_SECONDS`: the start blip is "10", then 9…1) |
| A6 notes for E / A7 notes for F | info | — |
| A8a B: street-lamp reach 7.5 m washes the store sign at night | done | `src/world/phaseState.ts` radius 7.5 → 5.5. **Look lane:** confirm by eye on `cp-night_store` |
| A8b B/S: `sp_bus_bench` roof fills the top 10 % rows | open → look | `cp day_start` fails `top 10% rows only` (12795/23040 bad). Change the spot facing or the check's rect |
| A8c perf: fill-bound main pass | open → look | `timeRender(8)`: day 78, dusk 83–91, night 137–141, dawn 106–116, viewfinder 176 ms (SwiftShader) |
| B1 D: prefer `{ world }` anchors; P4/P8 values | info | D reads `world.anchor()` behind a 6 m guard; golden P4 and P8 are green in the app |
| B2 F: moved spots / interact positions | info | F reads `world.spot/anchor`; the golden path passes |
| B3 C: portrait-wall `faceTexture().userData` shape | info | Kept by C |
| B4 A: skip the second noise fetch / shadow lookup per fragment | rejected | The A review measured that a flat-colour fragment shader is no faster (41 vs 42 ms): the cost is raster × overdraw, not shader maths |
| B5 notes for I (walkcheck / stats / layers) | info | `npx vitest run src/world` green (walkcheck BFS) |
| B6 review notes (P4 pitch, shrine proxy, spots, signal, interiors) | info | Verified: golden P4 row sets `P4_done` |
| C1 name layer 5 `HERO_FP` | done | `src/core/layers.ts` (`LAYER.HERO_FP = 5`), `src/chars/hero/hero.ts` (alias) |
| C2 bench / perch geometry | open → look + gameplay | `02-wake.png` / `03-day-start.png`: after `S_wake` the hero lies on the shelter floor beside the bench, not on it. The bench runs along the back wall, parallel to the spot yaw 90. C wants its long axis across the yaw, seat ≈ 0.4 m behind the spot |
| C3 / C4 contract + review notes | info | — |
| D1 `pushContext()` kills hold-to-aim | done | `src/contracts.ts`, `src/core/input.ts` (`keep`), `src/lens/modes.ts` (`keep: ['aimHold','shutter']`), `src/lens/index.ts` (`released('aimHold')`, window listener kept as the fallback for a dialogue pushed over the viewfinder). Test: `src/core/integration.test.ts` |
| D2 no pick outside `gameplay` | done | `src/core/interact.ts` (`PICK_CONTEXTS` = gameplay + peek, `repick()`), `src/lens/modes.ts` (`lh_door` pushes `peek`; `core.interact.repick()` replaces the `update()` cast), `src/ui/index.ts` (no `npc:*` talk during a peek). Verified in the app: `detach('lh_door')` → prompt `it_lh_switch`; `interact()` ×2 gives `frame_3` |
| D3 Esc in the `lh_door` view also opens pause | done | Structural (D2: Esc in `peek` belongs to D) + guard in `src/ui/index.ts` (no pause while `lens.state.peek`) |
| D4 `__game.look()` pitch in the viewfinder | done | `src/contracts.ts` (`LensApi.look?`), `src/lens/pose.ts` (`lookAbs`), `src/lens/index.ts`, `src/debug.ts` |
| D5 B: lens findings (shrine / b1 proxies, `lh_door` view) | partly done / open → gameplay + look | Shrine proxy fixed by B (P4 green). **Gameplay:** re-run `?dev=lens:targets` for `T_meiqiu` / `T_bst_tv_still_on` (b1 proxy). **Look:** the `lh_door` view shows only the lamp room's underside on the night sky (no inner shaft) |
| D6 E: HUD stays in the `lh_door` view | done | `src/ui/index.ts` (HUD visible in the `peek` context when the peek is `lh_door`). **Gameplay:** the 「拉下总闸」 prompt is projected at the switch anchor, which is off-screen while the view looks up the tower, so it does not show |
| D7 C: viewfinder `raise` pose in frame | info | Fixed by C (review §4, `hero.test.ts`) |
| D8 notes for F | info | — |
| D9 B: `pk_coop` hollow, pigeons, negative ① | done by B | In-app: `detach('pk_coop'); lens({flash:true}); shoot()` → green 「鸽子 · 受惊」 99; golden P5 green |
| D9 B: `pk_psd` pit has no negative ④ | open → look | `anchor('pit')` is the bare pit floor; add the frame-④ card (hide on `frame4_registered`) |
| D9 F: `T_temple_qr` wx / I: tripod recognition bar | info / accepted | — |
| E1 warm Long Cang | done | `src/core/fonts.ts` (`handText()`) |
| E2 `dialog` checkpoint shows the SMS node | done by F | SMS are toasts now; boot `06`: `dialog-name` 「小林」 |
| E3 wx history after `bootChapter` | info | E re-syncs from `wxLog` |
| F1 `__game.interact()` stale pick (BLOCKING golden) | done | `src/core/interact.ts` (`repick`), `src/debug.ts`; plus C7/C10/C11 in `CHANGES.md` (zones on teleport, E context pops, `onShot` order): **`--suite golden` passes 15/15 through `credits_done`** |
| F1b `vp_temple_2011` does not frame the idol | done | B's `vp.ts` pitch fix + C11 (`idol_scanned` set synchronously) |
| F2 / F3 talkRange 12 / 拆→折 tag | done by C / E | — |
| F4 B: confirm F's prop positions; gantry ≤ 2.5 m | open → gameplay | Golden P7 passes (`it_gantry` reach 3.6 m); B should still add a `gantry` anchor or move the attendant ≤ 1.2 m from the lane |
| F5 deliberate deviations | accepted | Toasts instead of boxes inside chained flows; `me.group_ready` at the intro; new append-only ids |
| F6 notes for I | info | — |
| F7 B/C: S_wake bench | open → look + gameplay | Same as C2 |
| F7 E: long toasts cut | info (already fine) | Story toasts use kind `plain`, which wraps (`.ui-t-plain .ui-toast-txt { white-space: normal }`) |
| F7 D: mirror decal blank after the viewfinder closes (S_mirror) | open → look | Cosmetic: keep the last LiveView frame for a few seconds |

## Extra integration fixes (found by I)

| Fix | Files | Evidence |
|---|---|---|
| X1 `onShot` puts `{ set }` before async actions | `src/data/photoTargets.ts` | Golden P4 failed with `missing flags P4_done`, then passed |
| X2 zones evaluated on teleport | `src/core/player.ts` | Golden P5 `T_pigeons` needs `on_roof_once` in the same row |
| X3 E context pops apply at once outside a tick, late phase inside | `src/ui/index.ts`, `src/ui/ctx.ts` | Golden P5…ending failed (`dialog` context still pushed after `advance(9)`), then 15/15 passed |
| X4 rephoto reveal expires per tick / on close | `src/lens/rephoto.ts`, `src/lens/index.ts` | `golden-09-P6.png` showed the 2011 temple photo with 「重合度 0%」 over the `lh_door` view |

## §4.1 interaction map — wiring check

Every rules action kind has a handler: core (`set give take verb clue objective teleport chapter sfx uncanny wait
pose setClock`), D (`photo detach`), E (`card node wx ui toast memo`), F (`beat`). Bus flows by grep plus the in-app
golden suite:

| Flow | Producer → consumer | Status |
|---|---|---|
| E key → F interact | core `interact` → F `glue.ts` registrations | ok (S_studio, ladder, lighthouse, darkroom rows) |
| NPC talk | E `npc:<id>` from `core.actors` (C NPCs, B `chai`) | ok (prompt `npc:granny_wang` in the app) |
| Night-viewfinder talk | D `extras.talk` → `ui.talk` | ok (golden `tudi`) |
| Photo → story | D `rules.run(onShot)` + `photoTaken` → F rules | ok (P1…P9) |
| Story → presentation | `rules.run` → E / F / D / bus | ok |
| Signal | B `signalChanged` → C, E, F rule `sms_full` | ok (golden P2) |
| Zones | F `registerZone` → core `enterZone` → F rules | ok (`locker_seen`, `ch2_started`, `on_roof_once`); now also fires on teleport |
| Faces | C `faceState` → D presets; `faceTexture` → B wall | ok (grep); P3 green |
| Mirror | D LiveView → `world.setMirrorTexture` | ok (grep; S_mirror green) |
| Smoke | D `extras` + `story.smokeTarget()` → `render.setSmoke` | wired (grep); not asserted by any suite |
| Sound | `sfx` → A | wired; manual check only (headless audio) |
| Save / continue / chapter boot | `stateLoaded` → A B C D E | wired; **gameplay:** the §4.3 save round trip is not run yet |
| Title | main → `ui.showTitle` + `setTitleMode`; A palette on `title` | ok (boot 01; the golden ending returns to the title) |
| Endings / credits | E choice → F beat → `credits_done` → core save reset → title | ok (golden `ending`) |
| Uncanny | F / C → A B C | wired (grep) |

## Final check outputs (this pass)

- `npm ci`: lockfile unchanged (`cmp` equal), 0 vulnerabilities.
- `npm run typecheck`: 0 errors.
- `npm test`: 33 files / 337 tests pass (incl. `crossref`, `no-cjk`, `determinism`, new `core/integration.test.ts`).
- `node scripts/check-gdd-ids.mjs`: OK.
- Boot smoke, dev server :5177: PASSED 12/12, 0 console/page errors (4 perf warnings).
- Production build (`vite build --outDir .build/I`) + `vite preview` + boot smoke: PASSED 12/12, 0 errors; bundle
  1227 kB (647 kB without three, ≤ 1 MB); `.build/I` deleted.
- Golden suite: PASSED 15/15 (was 4/15 at the start of Phase 2).
- Checkpoints suite: 3 failures (`day_start` sky rows, `mirror` has 42 `#000000` pixels, `night_store` sky rows), 2
  missing rects (`dusk_temple.sky`, `night_store.litWall`), `timeRender` warnings on every checkpoint → look lane.

## Gameplay lane (I-play, 2026-09-29)

| Item | Status | Evidence / files |
|---|---|---|
| Golden path, ending A | pass 15/15 → `credits_done`, back on the title | `node scripts/smoke.mjs --suite golden --base …:5178` |
| Golden path, ending B | pass 15/15 (`ending_B`, `credits_done`, title) | `--suite golden --ending B` (new `goldenRows('B')` in `scripts/lib/suites.mjs`); headless: `story.puzzles.test.ts` endings B |
| Lens rows vs the real world | 39/39 green (was 37/39) | `?dev=lens:targets`; `T_meiqiu` / `T_bst_tv_still_on`: C16 (b1 proxy lid); test `src/world/occluders.test.ts` |
| `?chapter=` × 5, `?phase=` × 4 | all playable: not busy after settle, objective, phase, clock + HUD clock, walks ≥ 3 m/s, 0 errors | new `--suite chapters` |
| Save round trip (ARCH §4.3) | pass: ch2 via `__game` on `?test&save=1`, reload `/?save=1` (realtime), 「继续」 restores chapter/phase/palette/clock/objective/scene/35 flags/items/7 photos/position (0.00 m), lens idle, actor spots + visibility match | new `--suite save` |
| Play feel, prologue + P1 + P2, REAL input only | pass: Space through S_wake, Tab/album click/设为对照, walk (W + middle-drag) following the smoke, hold RMB, R, Space, walk to the studio, locker SMS, climb the bridge (sms_full), back to the locker, E, keypad clicks 17/0815 → P2_done; F, wheel, 1/3, left-click shutter, Esc, J, H (土地 answers), Esc pause | new `scripts/playfeel.mjs` (all 4 tutorial bubbles now seen) |
| C2/F7 S_wake bench | fixed with the look lane: B's radial wake bench at `sp_bus_bench` (look lane) + the stand-up end state after a skip (C19) | tests in `story.puzzles.test.ts` |
| D6 lh_door 「拉下总闸」 prompt | fixed (docks at the lower centre) | C20; test `ui/logic.test.ts` |
| `?phase=night` clock | fixed | C18; test `story.data.test.ts` |
| F4 attendant / gantry | fixed (2.4 m) | C15; test `story.data.test.ts` |
| ch1 / finale boot camera in the head | fixed | C14; tests `core/feel.test.ts` |

**Still open (look lane / content):** no visible negative ④ mesh at `anchor('pit')` (the pk_psd view recognises 「底片 · 第④格」 on bare
sleepers); no negative ③ / inner shaft in the `lh_door` view (10× shows a flat underside); `tut_show` 「对话里选「出示照片…」，或按 G」
appears right after P1 (GDD: first story-tagged photo) and stays up through all of P2 until the player shows a photo.

## Look & perf lane (I-look, 2026-09-29)

Checkpoints suite (`node scripts/smoke.mjs --suite checkpoints --base …:5179`): **PASSED 14/14, 0 failures** (was 3
failures + 2 missing rects), 0 console errors, programs ≤ 16 (≤ 20). Golden 15/15 unchanged. Rects filled in
`scripts/checkpoints.json`; check changes in CHANGES C25.

| Item | Status | Evidence / files |
|---|---|---|
| A8b `day_start` sky rows | fixed | shelter moved to lon 5.0 (`world/layout.ts BUS`), `in_a` row 2 storeys, check uses the `morning` palette (C25) |
| C2/F7 S_wake bench | fixed (with I-play C19) | radial wake bench, seat centre 0.4 m behind `sp_bus_bench` (`build/landmarks.ts`); side views: sit and lie land on the seat |
| `night_store` sky / lit wall | fixed | sky rect + `litWall` rect (median luma 0.57) |
| `mirror` 42 `#000` pixels | fixed | composite floor 4/255 (grain under a dark vignette clipped to 0) |
| A8a store sign vs lamp pools | fixed | downward lamp cones (C22): pools on the ground / below the head, the sign is the brightest thing |
| Temple lanterns | night only | `dyn:lanterns` (GDD §5.3 #7), `world/phaseState.ts` |
| Darkroom too dark / tiny safelight | fixed | maroon safelight wash on every darkroom surface, big lit lamp + painted glow (`interiors/build.ts`) |
| S_sunset shows no town | fixed | orbit 7 m up, ≈ 38° down (C28) |
| Hero back screen / orange rim | fixed | lit screen with glyph glow (`chars/hero/screen.ts`), 32 mm orange rim, bezel shares the frame id (no inner ink line) |
| D9 pit negative ④ | done | `dyn:frame4` film strip at `anchor('pit')`, hidden on `frame4_registered` |
| D5 `lh_door` inner shaft | done | inside-out shaft, cantilevered spiral treads, glowing hatch + negative ③ (`dyn:frame3`, hidden on `frame_3`); `T_frame3_lamp` still green 94 at 10× |
| F7 D mirror decal blank | done | mirror keeps rendering 8 s after the viewfinder closes (C27) |
| P7 golden frame white | explained | capture lands 0.08 s after a flash shot (vf-flash 80 ms + 250 ms fade); flash/polaroid now also fade while a dialogue camera hides the chrome (C27) |
| Audio emitters | fixed | `sfx_shutter` / `sfx_burst` / `sfx_flash` / `sfx_pigeons` had no emitter; `audio/index.ts` plays them from `shutter`, `lensChanged`, `flagSet pigeons_gone` |
| A8c perf | improved, still > 60 ms at night / viewfinder | see below |

`timeRender(8)` ms, SwiftShader 1280×720 (before = `cp-look-0` at the start of this pass → after = `cp-look-2`):
title 70.9 → 43.6 · day_start 151.4 → 51.5 · day_viewfinder 280.4 → 85.1 · dialog 223.5 → 75.0 · dusk_temple 160.0 → 64.5 ·
mirror 124.0 → 75.4 · night_store 135.5 → 96.8 · night_chai 66.1 → 61.0 · subway 56.9 → 38.4 · after_zhe 84.6 → 67.9 ·
darkroom 90.6 → 45.6 · dawn_group 146.4 → 62.1 · roof_view 54.6 → 60.7 · photo_card 102.7 → 60.0. (The "before" run
had other agents' browsers on the machine; in-page A/B numbers are in the lessons.) Levers: compile-time shader
variants (C21, C24), 4 lamps in view (C22), the occlusion cull that never ran (C26), no hidden locker / frame / ground
faces (`kit/prims.ts boxOpen, frameRing`, `build/ground.ts cullUnderBuildings`), adaptive render scale in realtime
(C23; no quality entry in Settings, the UI has none). Remaining cost is hidden fragments (≈ 4 per visible one at
street level, SwiftShader has no early-z) and the night lamp/band ALU.

## Final gate (I-gate, 2026-09-29)

Full ARCH §4.3 run from a clean `npm ci`; the checklist, perf table and pending manual checks were returned to the
orchestrator as the gate's report (the subagent harness refused to write `docs/integration/REPORT.md` itself). Fixes in this pass (contract/tooling rows C29–C33 in `CHANGES.md`):
- `photo_card` checkpoint never showed the card (smoke ran `__settle()` after the row's calls and skipped the ending
  beat; the `until` loop timed out silently) → async row bodies, `until` must pass, capture after the flash.
- Group photo: the dawn 「折」 board hid the X and the hero's face; the rail crossed the face at r 41, and a real player
  was shot from behind → board below the tread, body squares up to the tripod for the shot.
- `cleared` exposed in `__game.state()` and asserted after both endings.
- New `--suite ui` for the rest of §4.3 (testids, Esc/pause/settings, lock hint, lowfx, mute, fonts).
