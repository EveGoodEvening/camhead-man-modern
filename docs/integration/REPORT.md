<!-- Phase 2 final integration gate report (2026-09-29). Saved by the orchestrator from the gate agent's output. -->
# I-gate report: ARCHITECTURE §4.3 checklist and known issues

18 of the 20 checklist items pass. The one failing item is frame time: 8 of the 14 checkpoints take more than 60 ms per frame in SwiftShader. The manual-only checks still need a person with a real GPU and speakers.

I did update `docs/integration/CHANGES.md` (rows C29–C33), `docs/integration/STATUS.md` (a "Final gate" section) and `AGENTS.md` (4 `[I-gate]` lessons). The dev server on :5177 is stopped and no browser slots are held.

Everything below comes from a clean `npm ci` and a full re-run after my fixes. Evidence is in `SP/gate/final/<suite>/`, where `SP=/tmp/claude-0/-root-github-com-EveGoodEvening-camhead-man-modern/26c900b3-e443-4fe6-9049-5dd641639339/scratchpad`.

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `npm ci` clean | ✅ | Lockfile md5 unchanged, 0 vulnerabilities, versions as pinned. |
| 2 | Build; bundle without three ≤ 1 MB | ✅ | Full build 1236.8 kB JS (377.9 kB gzipped). With three left out: **657 kB** JS + 37 kB CSS. |
| 3 | typecheck | ✅ | 0 errors. |
| 4 | vitest, incl. `crossref` and `no-cjk` | ✅ | 34 files, **353 tests** (I added 1). |
| 5 | `check:ids` | ✅ | OK. |
| 6 | Boot suite | ✅ | 12/12 with 0 errors on the dev server, and 12/12 on the production build served by `vite preview`. Boot to ready ≤ 2.9 s everywhere. |
| 7 | Golden path | ✅ | Ending A 15/15, ending B (`--ending B`) 15/15, 0 errors. |
| 8 | Endings A/B, credits back to title, `cleared` recorded | ✅ | Both endings return to the title and `state().cleared === true` (new check). |
| 9 | Checkpoints suite | ✅ | 14/14, 0 failures, all pixel rects filled. Screenshots reviewed by eye. |
| 10 | Triangles / draw calls / shader programs | ✅ | Worst is `dusk_temple`: 136.8k / 72 / 16. Golden peaks at 124.8k / 70 / 16. |
| 11 | `timeRender(8)` < 60 ms at every checkpoint | ❌ | 8 of 14 over (table below). The suite only warns on this. |
| 12 | Save round trip | ✅ | Chapter, phase, palette, clock, objective, scene, 35 flags, items and 7 photos restored. Position within 0.00 m, lens idle, 8 actors on the same spots and layers. |
| 13 | Every `?chapter=` and `?phase=` | ✅ | 5 chapters + 4 phases: not busy, correct phase, clock and HUD clock, has an objective, walks ≥ 3.15 m in 1 s. |
| 14 | No `⟦` in the DOM, no tofu | ✅ | Every page checks for `⟦`. All five Google fonts loaded. |
| 15 | Every GDD §19.2 testid present | ✅ | All 32 ids and patterns found (143 distinct testids seen). |
| 16 | `?lowfx=1` | ✅ | Playable, 0 errors. Day 48.8 ms, night 56.0 ms; blob shadows show. |
| 17 | `?mute` silent | ✅ | On a real-time page, no AudioContext is created even after clicks and keys. Without `?mute` one is created, which shows the probe works. |
| 18 | Esc / pause / settings / lock prompt | ✅ | Esc opens pause and the hero stops. Settings works and Esc returns to pause. Resume works. Esc in the viewfinder closes it without pausing. Pause → 「回到标题」 works. The 「点击画面开始」 lock hint shows. |
| 19 | Manual-only checks | ⏳ | Pending; list below. |
| 20 | Lessons in `AGENTS.md` | ✅ | 4 `[I-gate]` lines appended. |

## Fixes

1. **The `photo_card` checkpoint had been passing without ever showing the card.**
   - Its row called `__settle()` without waiting for it, so the ending call ran first and the settle then skipped the ending scene.
   - The wait loop also gave up silently and took the screenshot anyway.
   - Now each row's calls can `await __settle()`, the check fails if the card never appears, and the screenshot waits until the white flash has faded.
   - Files: `scripts/smoke.mjs`, `scripts/lib/suites.mjs` (C30, C31).
2. **The hero had no face in the ending group photo.**
   - The dawn 「折」 board hung at 3.6 m and covered the chalk X and his face. It now hangs below the step edge between `g4` and `g5` (`src/world/chai.ts`, C32).
   - Even with the board gone, the handrail crossed his face as seen from the tripod.
   - A real player who walks up the stairs would also be photographed from behind.
   - Now, when the self-timer photo succeeds, his body steps onto the lineup line and turns to face the tripod (`src/lens/tripod.ts`, C33).
   - A new test in `src/lens/lens.test.ts` fails without this fix.
3. **`cleared` could not be checked in the browser.** `__game.state()` now has an optional `cleared` field (`src/contracts.ts`, `src/debug.ts`, C29), and the golden suite checks it after both endings.
4. **The rest of §4.3 had no automated check.**
   - New `node scripts/smoke.mjs --suite ui`, also part of `--suite all`.
   - It covers testids, pause/settings, the lock hint, `?lowfx=1`, `?mute` and fonts.
   - Also new: `--only <checkpoint names>`.

## Performance per checkpoint (final run; machine load average 2–4.6, so about ±15 % noise)

| Checkpoint | Triangles | Calls | Programs | ms | < 60 ms |
|---|---:|---:|---:|---:|:-:|
| title | 76 201 | 54 | 14 | 43.8 | ✅ |
| day_start | 76 234 | 39 | 16 | 51.1 | ✅ |
| day_viewfinder | 78 196 | 41 | 16 | 80.0 | ❌ |
| dialog | 79 442 | 48 | 16 | 77.9 | ❌ |
| dusk_temple | 136 758 | 72 | 16 | 69.6 | ❌ |
| mirror | 83 110 | 49 | 16 | 79.1 | ❌ |
| night_store | 81 958 | 49 | 16 | 89.7 | ❌ |
| night_chai | 75 748 | 40 | 16 | 60.6 | ❌ (borderline) |
| subway | 8 150 | 13 | 16 | 39.8 | ✅ |
| after_zhe | 70 468 | 40 | 16 | 72.6 | ❌ |
| darkroom | 5 143 | 8 | 13 | 42.4 | ✅ |
| dawn_group | 85 873 | 54 | 16 | 64.3 | ❌ |
| roof_view | 96 497 | 45 | 16 | 50.2 | ✅ |
| photo_card | 71 029 | 51 | 16 | 42.4 | ✅ |

- **Roof orbit** (the S_sunset camera: 7 m above the roof, 9 m out, 4 directions): **106–145.8k triangles**, 53–86 calls. 70–80 ms at dusk, 90–104 ms at night.
- **Production build, boot suite:** dusk 69.0 ms, night 90.1 ms, dawn 59.4 ms.
- **Where `night_store`'s time goes:** main pass about 60 ms (plus 10–15 ms for shadows), final composite about 36 ms.

## Manual-only checks still pending (real GPU and speakers)

- Ink lines and breaks look hand-drawn.
- The hero reads as a silhouette at 60 px tall.
- Every `sfx_*` sounds right, including the unlock on the first click or key.
- Real pointer lock, and Esc → pause → the hint comes back.
- Touch controls.
- Fonts render correctly on a real display.
- Real-GPU frame rate, especially the roof orbit and the night store.
- The GDD §19.4 eyeball items. From the headless screenshots:
  - title: no tofu ✅
  - mirror: the hero is in it ✅
  - after_zhe: 「折」 on the hoarding ✅
  - darkroom: the negative shows as a positive ✅
  - dawn_group: the chalk X is now visible but small
  - photo_card: the hero has a face ✅, but the photo is only 480×270, so confirm by eye
  - day_start: whether the lighthouse tip shows is unclear

## Known issues

1. **Frame time in SwiftShader.** 8 of 14 checkpoints are over 60 ms. SwiftShader shades hidden pixels too, and street views have about 4 hidden layers per visible pixel. The fix would be finer building chunks with a real occlusion test. On a real GPU most of this cost disappears, and the adaptive render scale covers slow devices.
2. **The roof orbit is at 97 % of the triangle cap** (145.8k of 150k). The GDD `roof_view` checkpoint (`look(200, 5)`) can't catch this: from 9 m up it sees only the parapet and sky. An orbit checkpoint would need a camera hook in `__game`.
3. **The golden P7 screenshot is white.** It is taken 0.08 s after a flash photo. Cosmetic; the row passes.
4. **「继续」 restores where the player was at the last flag or phase change,** not where they walked afterwards, because autosave runs only on those changes.
5. **The `tut_show` tutorial bubble stays up from P1 through P2.** This matches the GDD; it is a UX nit.
6. **Testids `choice-2` and `choice-3` never appear,** because no dialogue node has more than 2 choices. The fixed options are `choice-show` / `choice-bye`, not numbered.
7. **老周's ghost in the photo renders solid.** The GDD says 半透明, but the main render pass allows no transparent materials; a dithered material would fix it.
8. **Debug-only clock quirks.** `__game.setPhase()` doesn't update the HUD clock, and `?chapter=ch3&phase=dusk` shows the chapter's clock with the dusk colours. Players can't reach either.
9. **The dawn board now hangs below the stair step** rather than literally 「挂在栏杆上」. The GDD wording could become 「挂在南梯外侧」.

## Phase 3 round 1 (regression gate, 2026-09-30)

The gate ran on the tree after all four area fixers (gameplay, look, ui, text) had finished. It found **no functional regressions and made no source changes**. It did find one measured perf cost, which is listed under "Still open" below. Evidence is in `SP/p3/gate1/`, where `SP` is the scratchpad directory defined at the top of this report.

### Issues fixed in this round (by the area fixers; the gate re-verified them)

| Id | Fix |
|---|---|
| G1 | S_darkroom uses one range test (`inDarkroomReach`: the feet, the darkroom side of `partX`, ≤ 4 m) and a 6 s timeout, so it can no longer hang in `cutscene`. |
| G2 | Prologue sequence break closed: the estate gate shows a maintenance toast, `ch2_started` needs `ch1_started`, and T_granny_face / T_locker17 / T_studio_qr need `ch1_started`. |
| G3 | The viewfinder closes when a story card appears, and there is a 0.3 s shutter guard after a dialogue or card, so no more stray photos. |
| G4 | The lighthouse keypad works only in ch3. Switch rows can't be re-triggered while their run is still going. The subway `enter` row is closed after the finale. |
| G6 | The studio and subway exit prompts are anchored at the roller shutter and at the foot of the stairs. |
| G7 | Showing 纸妹 her sea photo again after P9 plays `zhimei.dawn` / `zhimei.after`, not 「不是这张」. |
| G8 | Saves are validated (an unknown chapter, phase, palette or scene falls back safely). A full storage has fallbacks. Only the first photo per story tag is `keep`. Autosave now also runs every 10 s / 2 m and on pagehide or when the tab is hidden. |
| G9 | Esc while seated stands up. Losing the pointer lock in a dialogue or cutscene counts as Esc when the window still has focus. Audio is suspended while the tab is hidden. |
| G10 | `fitFov` fits the FOV for portrait and ultrawide windows. The lens judges shots at 16:9 with a matte, matching the capture. |
| L1 | The follow camera no longer collides with rails or thin props. What lies between the camera and the hero is drawn as a dither pattern, and the hero fades on a short boom. |
| L2 (partial) | The dialogue camera aims at the speaker's head. NPCs turn their body to face the hero. The attendant waits in the bus door. Object inspects are still open. |
| L3 (partial) | The ghost in the group photo is translucent, the photo renders at 960×540, the tripod head is at 2.7 m and the 折 board has moved. The shot is still low-angle. |
| L4 | Captures re-cull the planet for their own camera. The hero's photo cache is keyed on the image data. |
| L5 | A WebGL or boot failure shows a message. The clouds are baked again after a context restore. |
| L6 | Arcade-sign floors have no clutter in front of the sign. Signs sit on their backing board. Nine story signs render at 128 px/m. |
| L8 | The gallery z-fighting is gone. Lamps no longer paint wedges on walls. Real play uses PCF shadows. |
| U1 | A mouse click on the title no longer starts a new game. With a save, focus starts on 「继续」. |
| U2 | E and Space no longer type into keypads, the name picker or the milk boxes (`armOnNav`). |
| U3 | Touch buttons send virtual keys (返回, zoom, flash, night, overlay, show). The touch prompts no longer show key caps. |
| U6 | A toast with the same text refreshes the one on screen instead of stacking (for example 「土地正在输入…」). The hint tier reset is kept, per the GDD. |
| U7 | Preset photos in the album show their own date and 「翻拍 · 旧照」 or 「暗房冲洗 · 接片」. |
| T1 | The truth (his body is asleep on last night's bus, and his soul arrived first) is now said in `att.bus`, `wx_dawn` and `me.developed`, and foreshadowed in `wx_mirror`. |
| T2 | Store, lighthouse and plaque names are consistent. The rooftop key and the milk-box lines are fixed. |
| T3 | `juan1` covers both routes. The zhe lines are true whether or not the dot has been picked up. Before P4 the ghost-layer hint no longer names N. The 公众号 line is dated correctly. |
| T4 | Narration moved onto its own 系统 lines. The note and envelope are shown once. Punctuation and quotes fixed. Credits read 「显影制作组」. |

Refuted in verification, so not changed: G5, L7, U4, U5.

### Final check results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm test` (vitest) | ✅ 40 files, **411 tests** |
| `node scripts/check-gdd-ids.mjs` | ✅ OK |
| `smoke --suite all` (boot, golden A, checkpoints, chapters, save, ui) on the dev server :5177 | ✅ 65 shots, 0 failures, 0 console or page errors. 13 perf warnings, all frame time > 60 ms. |
| `smoke --suite golden --ending B` | ✅ 15 shots, 0 failures, 0 errors. The game returns to the title and `cleared` is recorded. |
| `smoke --suite checkpoints`, run alone for timings | ✅ 14/14 with 0 failures. |
| `smoke --suite boot`, run alone | ✅ 12/12. |
| Production build (`vite build --outDir .build/gate`, deleted afterwards) | ✅ 1255.1 kB JS (384.3 kB gzip) and 37.7 kB CSS. |
| Programs / triangles | Peak 18 programs (golden `ending`, `photo_card`), cap 20. Worst checkpoint is `dusk_temple` at 135.7k triangles / 72 calls. |

**Visual review.** Every checkpoint PNG was compared with `SP/cp-look-2/`, and the golden A shots with `SP/gate/final/goldA/`. Title, viewfinder, dialog, dusk_temple, subway, darkroom and roof_view are identical. The differences are all intended fixes:
- The bench and rail near the camera are drawn as a dither pattern (L1).
- The 五金 and 牙科 signs are sharp and uncovered (L6).
- There is no yellow lamp wedge on the night walls, and the hero at `after_zhe` is no longer lamp-tinted (L8).
- The 折 board is off-centre at dawn (L3).
- `photo_card` now really shows the card: the old baseline had caught the bus view instead.
- Golden P1 ends in gameplay rather than the viewfinder (G3).

No visual regression needed a fix.

### Perf (SwiftShader 1280×720, `timeRender(8)`; checkpoints suite run alone, load average 2–5)

| Checkpoint | Triangles | Calls | Programs | ms now | ms baseline (`cp-look-2`) |
|---|---:|---:|---:|---:|---:|
| title | 76 213 | 54 | 14 | 51.0 | 43.6 |
| day_start | 75 582 | 39 | 16 | 59.0 | 51.5 |
| day_viewfinder | 77 876 | 41 | 16 | 97.1 | 85.1 |
| dialog | 79 122 | 48 | 16 | 92.1 | 75.0 |
| dusk_temple | 135 654 | 72 | 16 | 90.8 | 64.5 |
| mirror | 82 790 | 49 | 16 | 85.5 | 75.4 |
| night_store | 81 638 | 49 | 16 | 114.9 | 96.8 |
| night_chai | 74 940 | 40 | 16 | 69.6 | 61.0 |
| subway | 8 150 | 13 | 16 | 40.1 | 38.4 |
| after_zhe | 69 660 | 40 | 16 | 76.3 | 67.9 |
| darkroom | 5 143 | 8 | 13 | 50.4 | 45.6 |
| dawn_group | 85 221 | 54 | 16 | 65.8 | 62.1 |
| roof_view | 96 021 | 45 | 16 | 56.7 | 60.7 |
| photo_card | 71 041 | 51 | 18 | 46.7 | 60.0 |

- The boot suite run alone gave dusk 72.4 ms, night 113.2 ms and dawn 65.0 ms. The Phase 2 final run gave 89.3, 123.9 and 86.9 ms.
- The `--suite all` run overlapped with the ending-B run. Its 179 ms night boot was CPU contention and is not a real number.
- The comparisons across pages above swing about ±30 %. The in-page A/B below is the number to trust.

**In-page A/B of the L1 see-through / fade shader block** (`SP/p3/gate1/ab.mjs`):
- Method: every toon material recompiled with the block stripped (`cmKeep = 1`, no discard), interleaved with the unchanged shader in the same page, minimum of 4–6 rounds.

| Spot | With the block | Stripped | Cost |
|---|---:|---:|---:|
| night `sp_store_front` | 109–112 ms | 92–95 ms | about +17 % |
| day `sp_store_front` | 75–83 ms | 66–73 ms | about +12 % |
| dusk `sp_temple` | 79–83 ms | 70–71 ms | about +12 % |

- The discard alone and the cone maths alone each account for only part of it.
- A branch-free rewrite with linear ramps recovered nothing measurable (night 110 vs 112 ms, day 77 vs 76 ms), so it was not applied.

### Still open

1. **The see-through / fade block costs about 12–17 % of the frame in SwiftShader**, even when it is off (w = 0). SwiftShader runs both sides of every branch, and every toon fragment now has a dynamic keep value and a discard.
   - Real GPUs should pay little for the uniform branch.
   - The options are a compile-time variant or per-chunk material swaps. Both cost extra programs (the cap is 20, the peak is 18) or recompile hitches, so this is a design call for the render owner, not a gate fix.
2. **Frame time is still over 60 ms at 8 of 14 checkpoints** in SwiftShader (known issue 1).
3. **Look:**
   - The dither patch around the hero reads as a rectangular block when a long rail crosses it (`dawn_group`, golden P1).
   - The tripod prompt 「E 摘头装上」 now floats at head height + 0.3 m (3.0 m), and can overlap the top-centre toast stack (golden `darkroom` shot).
   - Both are minor.
4. **Carried over from the fixer reports:**
   - L2: the object-inspect camera; the 周记 tile box still covers the tile.
   - L3: the tripod shot is still low-angle, which the GDD geometry forces.
   - The portrait viewfinder at 117° is distorted in its matte.
   - The follow camera sits very close on the subway stairs.
   - After leaving the studio the hero faces the shutter with 「E 进入」 showing (per the GDD).
   - Two `interact()` calls on the same id inside one sync evaluate hit the in-flight guard.
   - Touch: lens texts still name keys (「（Q）」「（夜景 N）」「Esc 退出」), and there is no headlamp button.
   - Pause does not save or show a toast.
   - A blurred but visible window does not pause.
   - Dialogue choices were not audited for canvas clicks.
   - The title in portrait.
5. **Known issues from Phase 2:** 1, 2, 3, 5, 6, 8 and 9 still stand. 4 (「继续」 position) is improved by the G8 periodic autosave, and 7 (solid ghost) is fixed by L3.

## Phase 3 round 2 (regression gate, 2026-09-30)

The gate ran on the tree after the three design implementers (wayfinding, onboarding, camera) and the five area fixers (gameplay, look, ui, text) had finished. It found **one functional regression and one stale-HUD bug, fixed both** (GT1, GT2 in `CHANGES.md`), and changed two smoke captures that were taken mid camera-ease (GT3). Evidence is in `SP/p3r2/gate/` (`all/` = first run, `final/` + `finalB/` = final runs, `cp3/` = checkpoints alone, `*.png` contact sheets against `SP/p3/gate1/`).

### Design changes this round

| Area | What the player gets | GDD / CHANGES |
|---|---|---|
| Wayfinding | 土地's smoke appears 0.12 s after the lens opens and follows a walkable, collider-checked route (hand-authored street graph, `story/route.ts`); ink thread by day, glowing at night, 4–11 px wide on screen. An incense badge at the screen edge points along the same route in third person. The objective chip names the current **step** (「短信没收全——找个信号好的高处」…), read from the same `StoryApi.smokeStep()` as the smoke and the badge. | §3.12, §10.6; W1–W5 |
| Onboarding | Context-bound tutorial bubbles (max 2, bottom-left): move/look/run + Tab after S_wake, 设为对照 in the phone, raise-the-lens after the reference is set (or 30 s), shutter/overlay in the viewfinder, Esc/操作说明 at ch1. The first prompts read 「按 [E] 调查」 until the first E. New 「操作说明」 page (pause and settings). Touch copy names buttons (`keyless()`), new 头灯 button. | §4, S_wake 7, §11.14, §16.1; O1–O6 |
| Camera | Dialogue camera eases in 0.7 s / out 0.55 s and frames the speaker front-on above the box; object inspects get a camera; 土地 on the shoulder is framed at night; 拆 fits. Two-row payoff group photo with a level tripod shot. See-through/fade shader compiled only into thin/detail/character meshes (−8 to −17 % frame time). Hero wakes one step off the bench. | §19.4, S_wake 4/8, S_group_photo 1, ART §6.4; K1–K7 |
| Gameplay fixes | G1 one E no longer mounts + triggers the lens (coop/PSD peeks, tripod); G2 tripod: E arms the timer, the 10 s count starts on the first stair tread, chalk route + X marker + edge marker, clutter removed; G4 no interacts through interior walls; G5 the light trail's live label no longer gives away 1987; G6 老陈 moved off the pier axis. | S_group_photo 4–5, §4 reach rule; G1–G7 |
| Look fixes | L1 darkroom staged (bench camera, lamp, print, four-frame strip with the chalk X); L2 (partial) story lines front-on; L3 老周 readable in the photo, 折 board out of frame; L4 night talk over the lens cuts back cleanly, 「按 E 交谈」 tag; L5 camera stays under the shelter roof, other-shoulder swing; L6 (partial) inspects over the shoulder; L7 no route recompute on `seen:*` flags; L8 plain shadow outline; L9 title/credits outside 16:9. L10 not done. | §5.4, §7.2, §11.6; look L1–L10 |
| UI fixes | U1 two-line objective chip, toasts below it; U2 epilogue rolls up on phones, 「点击继续」 on touch; U3 badge avoids prompt/buttons/hero; U4 first Space/E at a choice only highlights; U5 controls/phone copy, 珍藏 badge, vertical punctuation. | §4, §10.5, §10.6, §15; UI1–UI6 |
| Text fixes | T1 bus-door reveal rewritten (stakes of 不上车 stated, 土地 succession relayed), ending B / 终卷 match; T2 overlay always 「叠上对照」, `keyless()` tautologies gone; T3 narration speaker `narr` (no tag), wording and credit line breaks. | §2.3, §11, §15; X1–X5 |

### Issues the gate fixed

| Id | Regression | Fix |
|---|---|---|
| GT1 | **Golden `S_studio` captured an all-dark studio** (`all/golden-03-S_studio.png`); golden P5 filmed a wall from the ground. `goto('st_cabinet'); interact()` started the inspect camera's 0.7 s ease from the last *planet* pose, so the camera sat 80 m outside the room. Any beat or door that teleports right after a dialogue closes hit the same sweep. | `core/cameraRig.ts`: a teleport or scene switch cancels a running blend, and a `blend()` asked for before the camera has been shown at the new place is a cut. New test in `camera.p3r2.test.ts`. Verified: `final/golden-03`, `golden-08` show the hero at the cabinet and at the ladder. |
| GT2 | Objective chip stale for up to 10 frames after a scene switch: the subway checkpoint said 「去码头长凳坐坐，夜景里看灯塔」 inside the subway, the roof checkpoint 「去码头…」 instead of 「先从天台梯子下去」. | `ui/hud/hud.ts` re-reads the step on the next frame after `sceneChanged` / `teleported` / `flagSet`. Verified in `cp3/cp-subway.png` (「闸机边的站务员——跟他说说话」) and `cp3/cp-roof_view.png`. |
| GT3 | Boot `06-dialog` (step 30) and `ui-choices` (step 5) captured the dialogue ease-in half-way (the bus-door shot showed the footbridge). | `scripts/smoke.mjs` steps 60 ticks. |

### Final check results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm test` (vitest) | ✅ 48 files, **486 tests** |
| `node scripts/check-gdd-ids.mjs` | ✅ OK |
| `smoke --suite all` on the dev server :5177 (final run, after the gate fixes) | ✅ 65 shots, 0 failures, 0 console or page errors; 11 perf warnings, all frame time > 60 ms. The first run (before the fixes) also passed 65/0 — GT1 only showed on the screenshots. |
| `smoke --suite golden --ending B` | ✅ 15 shots, 0 failures, 0 errors; back on the title, `cleared` recorded. |
| `smoke --suite golden` (A) and `--suite checkpoints`, re-run alone after the fixes | ✅ 15/15 and 14/14, 0 failures. |
| Production build (`vite build --outDir .build/gate`, deleted afterwards) | ✅ 1311.0 kB JS (405.6 kB gzip), 42.1 kB CSS (round 1: 1255.1 / 384.3 / 37.7). |
| Programs / triangles | **Peak 20 programs = the cap** (golden `ending`, `photo_card`; 19 at golden `group`). Round 1 peak was 18. Worst checkpoint `dusk_temple` 135.0k triangles / 82 calls. |

**Visual review** (every checkpoint vs `SP/p3/gate1/cp2/`, golden A/B, boot, chapter and ui shots vs `SP/p3/gate1/all|goldB/`):
- `cp-dialog` now frames 小林 front-on, head in the upper half, clearly above the dialog box (the old capture showed the follow camera and an empty box).
- `cp-photo_card` is a good group photo: front row 纸妹 / 王阿婆 with 煤球 / 老陈 / 小林 on the pavement with faces and feet readable, stair row 小刘 / 站务员 / 周远 on the X / 老周 (warm, outlined), 土地 on a post; no 折 board. A dark strip of road fills the bottom ~8 % of the frame.
- `cp-day_start`: full body one step off the bench, bench not dithered. `cp-darkroom`: four separate frames with the chalk X. Chips everywhere show step texts; tutorial bubbles appear where expected.
- Identical: title, viewfinder, mirror, night_chai (plus the smoke ribbon), after_zhe, subway.
- No other visual regression found.

### Perf (SwiftShader 1280×720, `timeRender(8)`; checkpoints suite run alone, load average 2–2.5)

| Checkpoint | Triangles | Calls | Programs | ms now | ms round 1 |
|---|---:|---:|---:|---:|---:|
| title | 76 213 | 62 | 15 | 46.2 | 51.0 |
| day_start | 75 554 | 46 | 17 | 53.6 | 59.0 |
| day_viewfinder | 76 700 | 45 | 17 | 95.6 | 97.1 |
| dialog | 80 860 | 50 | 17 | 85.3 | 92.1 |
| dusk_temple | 134 982 | 82 | 17 | 68.0 | 90.8 |
| mirror | 82 598 | 55 | 17 | 81.1 | 85.5 |
| night_store | 81 638 | 55 | 17 | 100.1 | 114.9 |
| night_chai | 74 684 | 44 | 17 | 66.6 | 69.6 |
| subway | 8 150 | 13 | 17 | 40.9 | 40.1 |
| after_zhe | 69 084 | 43 | 17 | 74.4 | 76.3 |
| darkroom | 5 291 | 12 | 14 | 49.6 | 50.4 |
| dawn_group | 85 221 | 60 | 17 | 64.0 | 65.8 |
| roof_view | 95 637 | 52 | 17 | 53.0 | 56.7 |
| photo_card | 71 041 | 59 | 20 | 43.1 | 46.7 |

- Every checkpoint is equal or faster; the biggest gains (dusk −25 %, night −13 %) match the camera implementer's in-page A/B for the compile-time see-through variant (−8 to −17 %), which closes round 1's "still open" item 1.
- Boot suite (final all-run): day 57.9, dusk 66.7, night 102.2, dawn 63.9 ms.
- Each checkpoint compiles one more program than in round 1 (the see-through variant). 7 of 14 checkpoints are still over 60 ms.

### Still open

1. **Program headroom is gone:** golden `ending` and `photo_card` compile exactly 20 programs (the cap enforced by smoke). The next material variant fails the gate.
2. **Frame time over 60 ms at 7 of 14 checkpoints** in SwiftShader (worst night_store 100 ms). Smoke route cold cost 4–9 ms (only after a real flag / 1.5 m move).
3. **Camera:**
   - Eased hand-overs are straight lines: after a skipped/ended beat the camera can travel ~12 m in 0.5 s past props (golden P8 caught it beside the hoarding pole, 30 ticks later it is on the boom).
   - The dialogue camera ignores visual-only props (小刘's roadwork boards); the ending-choice shot is close, the attendant's torso sits behind the box, a shelter post at the frame edge.
   - The dither patch around the hero still reads as a rectangle over the seawall rail (dawn_group); the stair row in the group photo is small and crossed by rails; 土地 on his post is hard to read.
   - Inspect of the bench (L6 partial); 王阿婆's 「老周要是看见」 still has 纸妹 at the left edge (L2 partial).
4. **Gameplay:** the tripod 1× view does not show the stair foot (chalk line + edge marker compensate); the coop peek is mostly floor; a walker hitting a round NPC collider head-on stops instead of sliding; mashing E slower than 0.6 s can reopen a night talk.
5. **UI / onboarding:** `__game.interact()` never sets `seen:tut_interact`, so golden/chapter captures show 「按 [E] …」 and linger on the 8 s 「Esc 暂停」 bubble (real play is fine); a standing player who ignores Tab delays the 30 s raise-the-lens bubble; the incense badge can cover world signs; wx toast previews are cut on phones; 「按任意键继续」 only reacts to Space/E/Esc/click.
6. **Look:** L10 not done (mirror photo resolution, roof look-out, studio set dressing); the drying-line print hides the hero's body after the negatives are hung.
7. **Not verified anywhere:** real GPU frame rate, real pointer lock, real touch devices, audio (ARCH §4.3 manual checks, unchanged since Phase 2).

## Phase 3 round 3 (regression gate, 2026-09-30)

The gate ran from a clean `npm ci` on the tree left by the two open-item fixers (open-look, open-play) and the four area fixers (gameplay G1–G12, look L1–L7, ui U1–U4, text T1–T3). **It found no functional or visual regression and changed no code.** Evidence is in `SP/p3r3/gate/` (`all/`, `goldB/`, `cp/` = checkpoints alone, `prod/` = boot suite on the production build; `a*/c*/h*/u*/gB*/gA.png` = old | new contact sheets against `SP/p3r2/gate/final|finalB/`; `goldprobe.mjs` + `probe1.log` = golden toast timeline).

### Fixed this round (by the fixers; the gate re-checked the captures)

| Area | What the player gets | CHANGES |
|---|---|---|
| Open look | Shader programs peak at 17 (was 20): the construction net and the second-shadow decal are single-sided, and the group-photo ghost uses 2 programs instead of 3. Eased camera hand-overs try a straight line, then a lifted arc, then side swings, each tested against the hero, colliders and rendered geometry; otherwise they cut (golden P8 now shows the hero, not the hoarding pole). The dialogue camera scores rendered clutter; the roadwork fence is one continuous fence (it was six slabs 90° off); 煤球 fills the frame. Ending choice 「上车吗？」 is at eye level with a 46° lens. The see-through fade ramps over two-thirds of the ellipse (no grey block on the seawall rail). Group photo fitted to the group, 土地 on a higher post (spots g6/g7/g9, GDD §5.4). Mirror follows the viewer (36°, 384²; the saved selfie is 960×540), the follow camera tips down at a roof edge, the studio is dressed (1 520 triangles, 6 calls). | OL1–OL10 |
| Open play | The hero slides round NPCs, posts and trunks instead of stopping. The E that closes a night talk cannot reopen it. `__game` verbs and chapter boots set the `seen:tut_*` flags a real run has (captures show 「E 调查」), and the Esc bubble ends 24 s after it first appears. The tripod view is 1.3× wider with a frame marking the photo; the coop peek looks down at the pigeons. The incense badge avoids shop boards, and wx previews wrap to 3 lines. Wall checks use a 4 m grid (27.8 → 0.43 µs; route after a teleport 4.7 → 0.3–1.4 ms). | OP1–OP7 |
| Gameplay | G1 prompts stay on the object (studio shutter, gate, milk boxes, ladder, subway gate, tide barrier, bench). G2 a failed viewpoint names position, then turn, then tilt, and walking changes the score. G3 the lawn under the high stair flights is walkable. G4 smoke routes out of the hill pocket (`direct:true` meant the router failed). G5 the hint follows the step the chip and smoke show; H in the cooldown answers at once. G6 the generic 纸妹 portrait no longer steals the sea photo (「还缺：灯塔」). G7 night E talks to the character in frame, 土地 last. G8 burst uses the real hold length (event timestamps). G9 after the ending the title offers 「重温结局」. G10 the exit and seawall smoke ends where the prompts are. G11 (partial) softer ribbon, hidden near the target. G12 (partial) 王阿婆 asks for the photo right after her first lines; a wrong name reopens the picker. | GDD §1, §3.4–§3.12, §4–§6.1, §8.1, §10.2 #49, §10.6, §11, §13, §16 |
| Look | L1 土地 stands on the incense-burner lid in front of the idol (night 1× view: green, E talks). L2 the subway attendant has a walker-height collider; after 「嘀——」 the hero turns back to the platform. L3 ending A is one fixed kerb shot of him boarding: open door, dark doorway, door slides shut, bus leaves (door moved to `doorZ` 3.8). L4 a boom under 1.5 m cranes over his head; inspects score rendered props (boat). L5 occlusion is checked before facing; dusk/dawn sky and grass labels. L6 one memo chime. L7 no `toNonIndexed` warnings (was 504 per load). | LK1–LK7 |
| UI | U1 the chip says 「门开了——穿过闸机上山」 after the gate, and the locker SMS names 周记. U2 the badge is 44 px with 「烟 · 76m」, stays dimmed at the edge when the way is ahead, and introduces itself once. U3 the note card: ink blot for ▢, the narration on its own line, toasts held while a card is up. U4 cards ignore keys for 1 s and need the whole text on screen for 1.2–2.5 s; the epilogue no longer closes itself. | UI1–UI4 |
| Text | T1 the doorframe marks are read once, 「折起来的，还能带走」 is said once, 我's P3 line follows the gate verdict, the exits say 「出去」. T2 聊斋 card: 零八一五, no column starts with punctuation. T3 dialogue lines are balanced when the last row is under 25 %; the controls page shows one device with tabs. | TX1–TX8 |

### Final check results

| Check | Result |
|---|---|
| `npm ci` → `npm run typecheck` | ✅ 0 errors |
| `npm test` (vitest) | ✅ 64 files, **581 tests** (round 2: 48 / 486) |
| `node scripts/check-gdd-ids.mjs` | ✅ OK |
| `smoke --suite all` on the dev server :5177 | ✅ 65 shots, 0 failures, 0 console or page errors; 14 perf warnings (frame time > 60 ms, run in parallel with golden B, so boot numbers are inflated) |
| `smoke --suite golden --ending B` | ✅ 15 shots, 0 failures, 0 errors, 0 warnings; back on the title, `cleared` recorded |
| `smoke --suite checkpoints`, run alone | ✅ 14/14, 0 failures, 9 perf warnings |
| Production build (`vite build --outDir .build/gate`, deleted afterwards) + `smoke --suite boot` on `vite preview` :4174 | ✅ 12 shots, 0 failures, 0 errors, 3 perf warnings. 1343.3 kB JS (417.1 kB gzip), 45.3 kB CSS (round 2: 1311.0 / 405.6 / 42.1) |
| Programs / triangles | **Peak 17 programs** (golden `group` and `ending`, checkpoint `photo_card`); every other capture 13–15. Round 2 peak was 20 (the cap). Worst checkpoint is still `dusk_temple`: 135.0k triangles / 82 calls. |
| Repo layout | `git status` lists only the ARCHITECTURE §1.4 layout (root config files, `src/`, `scripts/`, `dev/`, `docs/`, `AGENTS.md`, `README.md`); no PNG, log or `zz_*` test anywhere in tracked paths. The gitignored output dirs `test-results/`, `.smoke/` and `dist/` are from Phases 1–2 and were left alone. |

**Visual review** (all 65 captures and golden B against round 2's final run):
- Better, as intended: golden P7 and P8 now show the hero in the subway and at the hoarding (round 2 had a white flash frame and a pole), `cp-photo_card` has a larger stair row with 土地 on a higher post, `cp-dawn_group`'s dither thins out along the rail, the studio has its new set dressing, prompts read 「E 调查」 after the first E, `save-1-before` recognises 土地 on the burner.
- Changed but not regressions:
  - `cp-night_chai` no longer shows the smoke ribbon. The player stands on the step's own target (`vp_subway_top`), and G11 hides the ribbon within 3.5 m of it (`SMOKE_ARRIVED`).
  - `08-night` (boot, 2 ticks after load) shows the badge half behind the Tab bubble. The badge re-reads the HUD boxes every 10 frames; after 30 ticks it sits clear above the bubble.
  - Golden toasts show stale 土地 wx previews (golden `darkroom` shows 「好！按 N，看香炉上。」). The whole golden path runs in about 12 s of sim time, and wx delivers each batch after 1.2 s of typing plus 0.8 s per line, one batch at a time. This is a harness effect; real play leaves minutes between wx.
  - Golden `tudi` / `P9`: the 「按 E 和土地交谈」 tag is behind the post-shot preview card for the 1–2 s the card is on screen.
- The rest is identical: title, wake, dialog, keypad, name picker, pause, settings, phone, subway, darkroom, mirror, after_zhe.

### Perf (SwiftShader 1280×720, `timeRender(8)`; checkpoints suite run alone, load average 0.8–2.4)

| Checkpoint | Triangles | Calls | Programs | ms now | ms round 2 |
|---|---:|---:|---:|---:|---:|
| title | 76 277 | 62 | 13 | 47.3 | 46.2 |
| day_start | 75 554 | 46 | 15 | 60.5 | 53.6 |
| day_viewfinder | 76 700 | 45 | 15 | 88.5 | 95.6 |
| dialog | 80 860 | 50 | 15 | 86.6 | 85.3 |
| dusk_temple | 134 982 | 82 | 15 | 68.1 | 68.0 |
| mirror | 82 598 | 55 | 15 | 77.5 | 81.1 |
| night_store | 81 638 | 55 | 15 | 105.8 | 100.1 |
| night_chai | 74 428 | 43 | 15 | 64.5 | 66.6 |
| subway | 8 150 | 13 | 15 | 38.7 | 40.9 |
| after_zhe | 69 148 | 43 | 15 | 70.2 | 74.4 |
| darkroom | 6 091 | 12 | 14 | 48.6 | 49.6 |
| dawn_group | 85 221 | 60 | 15 | 67.0 | 64.0 |
| roof_view | 95 637 | 52 | 15 | 53.1 | 53.0 |
| photo_card | 71 105 | 59 | 17 | 44.2 | 43.1 |

- Frame times are within ±10 % of round 2 (noise at this load); two fewer programs per checkpoint. 9 of 14 checkpoints are over 60 ms (day_start sits on the line).
- Boot suite on the production build (run alone): day 56.6, dusk 68.5, night 100.8, dawn 66.3 ms.
- Not measured in-page: the mirror's larger render (only with the viewfinder open within 8 m of it) and the ~2 ms rendered-geometry gathers (lens occlusion, crane, inspect scoring, eased hand-overs), which run only when they trigger.

### Still open

1. **Perf:** frame time over 60 ms at 9 of 14 checkpoints in SwiftShader (worst night_store 106 ms). Real-GPU numbers are still unknown. The first capture after normal frames stalls 1.5–2.9 s in realtime SwiftShader (G8 only fixed the hold length).
2. **Camera / look:**
   - 小刘 at night stands against a slab that hides the edge of his head from every angle, and a talk across the fence shows his back.
   - In tight corners the crane camera shows the phone head large at the bottom of the frame.
   - The ending-choice shot (`ui-choices`) still has the dark bus side and doorway filling the left ~40 % of the frame.
   - In the group photo 土地 is small and a rail crosses the stair row. The mirror sticker's text is about 6 px.
   - The `roof_view` checkpoint is mid-roof (parapet and sky); the town shows only at a roof edge.
3. **Wayfinding:**
   - The smoke ribbon is not lowered near the hero, and it bends out of frame at the start of a leg (G11 partial).
   - When the router finds no route, the smoke falls back to a straight line (now rare).
   - The badge's distance label is not placed clear of other HUD, the dimmed top-edge badge can sit over roofs or signs, and sign boxes are estimated from façade widths.
4. **Gameplay:**
   - After Esc on the name picker, talking to the attendant again replays his three intro lines (G12 partial).
   - The space under the high north stair flight is walkable now but was not reviewed visually, and rails that start 1 m below the treads can pull the follow camera in.
   - The hint cooldown reply is a toast, not a 微信 message.
5. **UI / text:**
   - The phone's item page still shows the ▢ glyph in the note.
   - 「」 have no vertical form in the 聊斋 brush font.
   - At 844×390 the controls panel is 8 px taller than the screen.
   - `?chapter=` / `?dev=ui:epilogue` runs need `skip()` or a key to leave the epilogue (golden uses `skip()`).
   - 土地's new night 折 line is covered by data tests only.
6. **Not verified anywhere:** real GPU frame rate, real pointer lock, real touch devices, audio (ARCH §4.3 manual checks, unchanged since Phase 2).
