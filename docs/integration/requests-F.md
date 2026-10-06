# Requests from F (story) — for agent I

Status: Phase 1 done (2026-09-29). F implements ARCHITECTURE §3.F with no change to any frozen S file. The logic-level
golden path (`src/story/story.golden.test.ts`, GDD §19.3 row by row) and the other story tests pass (40 in all);
`dev/story.html` runs the same logic golden path in the browser (15/15 rows). Items 1 and 1b block the
**in-app** golden suite; the rest are small cross-module notes.

**Independent review (2026-09-29, F reviewer):** re-verified in the app on port 5176 with every agent's current code.
Plain `smoke --suite golden`: P1, P2, S_studio and P3 pass, then P4 fails and everything after it cascades. With item 1
emulated (`step(1)` before each `interact()`) and each failed row recovered through `solve()`, **every row except P4
passes on its own**: tudi, S_mirror, P5, P6, P7, P8, P9, darkroom, group and ending (`credits_done` → title).
P4 alone still fails because of item 1b (a screenshot confirms the 3× view points at the lanterns and the 土地庙 plaque above the idol).
C has resolved items 2 and 3 (see requests-C.md §3). Review fixes on F's side are listed in §7.

## 1. BLOCKING for `smoke --suite golden` — `__game.interact()` uses a stale pick (S: `src/debug.ts` / `core/interact.ts`)
`core/interact.ts` only picks inside `update()` (a tick, gameplay context). Every §19.3 row that does
`goto(X); interact()` in one `page.evaluate` therefore triggers whatever was picked at the *previous* position, or
nothing at all when that pick was `null` (`trigger()` returns early). Examples: P5 `goto('sp_fire_ladder'); interact()`
(the previous settle ran at `sp_mirror_stand`, pick = null → the ladder never opens), P5 `goto('sp_roof'); interact()`
(pick = null inside the `pk_coop` peek → frame ① is never picked up), `dk_bench` ×4, `sp_tripod` ×2.
**F workaround (partial):** every F interactable re-picks among F's own rows when it is triggered while the player is
no longer at it (`src/story/glue.ts` `fresh()`), which fixes stale-F-row cases but cannot help when core's pick is null.
**Request:** give `InteractImpl` a `repick()` = the picking half of `update()` without the `pressed('interact')` check,
and call it in `debug.ts interact()` before `core.interact.trigger()` (both in the plain branch and the `lh_door` branch).
Equivalent alternative: `player.goto`/`teleport` emits `teleported` → `interact` listens and re-picks immediately.

**Verified in-app** (dev server 5176, real modules of all agents as of 19:05): with one `step(1)` before each
`interact()` (emulating the re-pick) and P4 forced (item 1b), every §19.3 row from 土地 to the ending sets its flags,
including `developed`, `finale_started`, `group_photo_done`, `ending_A` and `credits_done` → back to the title.

## 1b. `vp_temple_2011` does not frame the idol (B / D)
§19.3 P4 `goto('vp_temple_2011'); setRef(...); zoom(3); lens({overlay:true}); shoot()` has no `aim`, so the spot's
yaw/pitch must point the 3× lens at the idol (GDD §5.4 † construction rule). Currently `evalShot()` there returns
white 「云 · 扁的」 (the lens looks over the idol into the sky), so `P4_done` is never set by the golden row.

## 2. ~~`NpcDef.talkRange` for 王阿婆 at her window (C)~~ — done by C (re-registers her with `talkRange: 12`)
GDD §11.3 `granny.window`: 「窗口节点的交互范围放宽到 12 m」 — she stands on the 4F gallery (`sp_estate_window`, h 9) at
night after P8. `NpcDef.talkRange` is static; please register her actor with `talkRange: 12` while her spot is
`sp_estate_window` (or re-register on `phaseChanged`/`stateLoaded`).

## 3. ~~The 拆 → 折 name tag (C / E)~~ — done (C key `npc.chai_zhe`, E picks it once `P8_done`)
DLG uses speaker `chai` for both 拆 and 折 lines (GDD §11.9 labels 「拆：」 before P8, 「折：」 after, e.g. `chai.after`,
`chai.dawn`). Please resolve the `chai` name tag to 「折」 once `P8_done` is set (C: `npc.chai` + a `npc.chai_zhe` key,
or E: pick the key by flag).

## 4. Positions F chose for props without a world anchor (B, please confirm or move them to the real mesh)
Chart `(r, lon, h)` unless noted; interact radius is measured from the player's chest (feet + 1 m):
`it_cathole (23.5, 101, 0.6)` · `it_banyan (1.4, 300, 5)` ·
`it_paper_rule (43.2, 227.5, 1.6)` · `it_paper_phone (42.6, 224.6, 1.0)` · `it_pipes (48.6, 278.5, 0.8)` ·
`it_roof_ladder (16.1, 149.7, 18.6)` (review: moved onto the top of B's ladder cage, B1 tail 2.9 m west of the
lon-160 axis; ≈ 6.7 m from `frame1_drop`, so the frame ① pickup still wins there) · `it_water_tank (26.2, 156.9, 19)`
(review: moved onto B's tank at `b1Point(26.2, 1.4)`) ·
studio `it_st_backdrop {x:-4.2, y:1.3, z:2.9}` · subway `it_gantry {x:-1.3, y:1, z:-0.2}` (west face of B's gate lane,
reach 3.6 m: B moved `sw_gantry` to x −2.2, so a player 1.8 m in front of the attendant stands at x −4.0, 3.0 m from
the gantry line — ARCHITECTURE §2.8.15's "≤ 2.5 m" no longer holds; please keep the attendant ≤ 1.2 m from the lane or
add a `gantry` world anchor).
Anchored interacts read `world.anchor()` once after `world.init()`: `bus_qr lm:boat locker17 mirror roof_tv coop_door
frame1_drop idol lion_left_head chai plaque lh_switch portrait_wall doorframe dk_tray_brown dk_tray_white dk_tray_blue
tripod_head`. If B adds dedicated anchors for the props above, F switches to them (append-only ids).

## 5. Deliberate deviations from the GDD text (for review)
- `me.group_ready` (「站中间。」「爸来拍。」) plays at the end of the `S_group_photo` intro, right after
  `xiaolin.group_start`, instead of on the tripod E press (§10.2 note): §19.3 presses E twice in one call
  (`interact(); interact()` = mount head, start timer) and a dialogue box would swallow the second E.
- The two P2 SMS (truncated / full) are toasts + memo clues (`sys.sms_garbled` / `sys.sms_full`), not dialogue boxes:
  `sp_store_door` lies inside the GDD's 6 m locker zone, so a dialogue would cut into 小林's first line (it broke the
  §19.4 `dialog` checkpoint). The `sms.*` nodes stay in the tables, unused.
- Short object texts inside chained flows are toasts, not dialogue boxes (`sys.*`: shutter/ladder/subway/exit doors,
  the pier bench, the tripod, the main switch, frame ① / the dot pickups, the darkroom trays) for the same reason.
- `chai.day` is split into `chai.day` (day) and `chai.dusk` (dusk adds 「……它刚才动了一下？」, GDD's 〔黄昏时加一句〕).
- `chen.night_bench` also records `clue_chen_bench` (the night-only player otherwise never gets the bench clue).
- New ids (append-only): flag `dk_lit` (darkroom safelight on), clue `clue_granny_name` (§12 「追加「王阿婆：周远」」),
  nodes `gate.prompt sms.* note.* chai.dusk it.* show.*`.

## 6. Notes for I
- `story.bootChapter()` marks every rule the boot state satisfies as fired (no cards / beats / wx replay on `?chapter=`),
  and back-fills `wxLog` with the wx those rules would have sent (E's request #2 is resolved).
- `solve()` is fully quiet and synchronous: story rules are unloaded while it runs and F fires the condition rules
  itself (`src/story/quiet.ts`); a later `__game` call in the same evaluate sees the result.
- The darkroom reveal is F's trigger: while the viewfinder is on in `studio_int` within 4 m (horizontal) of `dk_line`
  with `dk_hung && !developed`, F plays `S_darkroom`, whose first step awaits `lens.darkroomReveal()` — so
  `busy.beat` covers D's multi-second reveal and smoke's `settle()` does not stop in the middle of it (a logic-phase
  poll, so it also fires when `dk_hung` arrives after the viewfinder opened — the tray-3 `memo` takes a moment).
- The endings hand the camera to the title orbit (`cameraRig.setTitleMode(true)`) at the start of the photo card, under E's built-in white flash (GDD §15 白闪 → 照片卡); F draws no DOM of its own.

## 7. Review findings (2026-09-29): fixed in F, plus notes for others
Fixed in F's files (regression tests are in `src/story/story.review.test.ts`):
- **Skip mid-fade left the game black.** Director steps become no-ops after `skip()`. When a skip landed during
  ending A's 0.4 s fade to black, the matching `fade(false)` never ran, so the photo card, the credits and the title all
  stayed black (real-time only; `?test` fades are instant). `Director.end()` now lifts any fade the beat left down.
- **Chapter boot / new game during a beat.** `stopBeats()` aborted the script, but the runner still applied the
  aborted beat's `end` (for example `ch3_started`) to the new state, and the script's ungated side effects still ran
  (`setTitleMode(true)`, `busZero.depart`, palettes). Now a generation guard skips the stale end, and a hard-stop flag
  (`Director.stopped`) turns off the script's remaining side effects.
- **Beat cameras inside walls.** B's new bus shelter put the S_wake "3 m in front of the bench" camera inside the
  shelter's end panel, so the frame was all grey planes. Beat framings now go through `clearShots()`: the pivot → camera
  segment is tested with `physics.blocked` (the camera boom's test), and the framing swings round the subject until the
  view is clear. This applies to S_wake, S_mirror (small swings) and the S_zhe window cut.
- **S_sunset framing.** Since the roof grew, the −31° orbit looked down onto the roof slab. The orbit now looks
  through the hero at about −18°, so the crane and skyline sit over his shoulder.
- **P2 SMS on the back screen.** The complete GDD SMS text (`DLG['sms.garbled' | 'sms.full']`) now types onto the
  hero's back screen for 9 s (`hero.setScreen('typing')`, GDD 「背屏震动，收到…短信」). The toast and the memo clue stay.
- Smaller fixes: `Director.poll()` no longer allocates every tick while waits are pending. Registering interacts
  and zones can no longer throw out of `init()`. Roof props moved (§4).

For others:
- **B/C — S_wake bench.** `sp_bus_bench` (yaw 90) seats the hero in the middle of the shelter floor, and B's bench runs
  along the shelter's back wall, so in the sit-up shot he sits on air (`test-results/F-review/wake-dlg2.png`). Please
  move either the spot onto the bench seat (≈ 0.4 m in front of it, facing away from the wall) or the bench under the
  spot. Per GDD §5.8 he faces east toward the bridge, so a bench rotated to face east also works.
- **E — long toasts.** `.ui-toast-txt` is `nowrap` + ellipsis at 560 px, so the SMS toast is cut after about 30
  characters. The back screen now carries the full text. If E wraps toasts to two lines, nothing changes on F's side.
- **D (cosmetic)** — during S_mirror the viewfinder is closed, so the mirror decal shows its blank grey (the LiveView
  runs only while the viewfinder is open). Keeping the last LiveView frame on the decal for a few seconds after
  closing would keep the selfie visible during the beat.
