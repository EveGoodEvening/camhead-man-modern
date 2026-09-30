# Requests from D (lens) — for agent I

Status: Phase 1 done (2026-09-29). D implements ARCHITECTURE §3.D with local workarounds; nothing below blocks the
lens, but items 1–3 are real core/UI gaps that a player can hit.

## 1. `src/core/input.ts` — `pushContext()` kills hold-to-aim (S)
`pushContext()` calls `releaseAll()`, which clears the source set of every held action **without the key/button
ever being released**. Opening the viewfinder with a held right mouse button (`aimHold`, GDD §4 「按住右键 取景」)
pushes the `viewfinder` context, so the lens immediately sees `released('aimHold')` on the next tick and the later
real `mouseup` is dropped (`release()` returns early: the source is gone).
**Workaround (D):** `src/lens/index.ts` listens to `window` `mouseup` (button 2) / `blur` itself while in hold mode.
**Request:** keep `aimHold` (and `shutter`, for the burst "held ≥ 0.3 s") across a context push, e.g.
`pushContext(c, owner, { keep?: readonly InputAction[] })`, or only release sources whose actions the new context
does not consume.

## 2. `src/core/interact.ts` — no pick outside the `gameplay` context (S)
ARCHITECTURE §2.8.6 says "D's `lh_door` peek calls `interact.trigger()`", but `update()` sets `current = null` in any
non-`gameplay` context, so `trigger()` is a no-op inside a pushed `peek` context.
**Workaround (D):** the `lh_door` peek keeps the `gameplay` context (movement is locked through `player.lock`); core
interact therefore keeps picking the peek-bound `it_lh_switch` (F's `enabled()` + stale-pick guard handle the rest).
**Request:** let `update()` also pick in the `peek` context (only interacts whose `InteractDef.peek` matches are
enabled there anyway), then D can push `peek` for `lh_door` too.

## 3. Esc during the `lh_door` view opens the pause menu (E)
Because of item 2 the `lh_door` view runs in the `gameplay` context, where E's global hotkeys map Esc → pause. D also
exits the view on the same Esc, so the player gets "view closed + pause menu".
**Request (E, `src/ui/index.ts` gameplay branch):** skip `u.pause.open()` while `core.services.lens.state.peek !== null`.
(Goes away if item 2 is applied and D switches `lh_door` to the `peek` context.)

## 4. `src/debug.ts` — `__game.look()` while the viewfinder is open (S)
`look(yaw, pitch)` → `cameraRig.look()` clamps pitch to the follow range −30..+20°. The lens adopts the rig's new pitch
(`pose.ts`), so `look(0, 45)` in the viewfinder gives 20°, not 45° (the viewfinder range is −60..+70°, GDD §3.3).
**Request:** route `look()` to the lens when `lens.state.active` — e.g. a small `LensApi.look?(yaw, pitch)` addition, or
`debug.ts` setting `player.setYaw(yaw)` and leaving pitch to `lens.aim`-style code. Not needed by any §19.3 row.

## 5. Notes for B (world) — what the lens reads
- `world.anchor()` for every id in `src/lens/anchors.ts → NOMINAL` (QRs, locker17, portrait_wall, doorframe, idol, mirror,
  door_201…404, coop_inside, coop_door, plaque, trail_plane, lh_lamp, pit, chai, net_dot, sea_point, lion_left_head,
  roof_tv, fish7, dk_line, tripod_head, lm:*). A world anchor more than 6 m (or more than max(1 m, radius/2) in height)
  from its GDD value is treated as broken: D warns once and uses the GDD value. The S stub (anchors = spot positions at
  ground level) trips this guard on purpose; `src/world/anchors.ts` values all pass it.
- `corners` (4 points) for `trail_plane` and `chai` (`whole` = the corners); `normal` for mirror (the mirror camera looks
  along it; else heading 160°), QRs and the plaque (used by `?dev=lens:targets` to stand in front).
- `occluders(scene)` must contain the P8 lamp-shade sphere (≥ 0.45 m, GDD §9 P8 step 4) and must **not** contain the
  dust net, estate galleries/railings or the coop mesh (they are see-through; GDD §9 P5/P8). Anchors ≥ 0.1 m outside
  their own proxy.
- `setMirrorTexture(tex)`: the lens flips the LiveView horizontally through `tex.repeat = (-1, 1)`, `tex.offset = (1, 0)`,
  so the mirror material must use the texture's UV transform (MeshToonMaterial `map` does).
- `pickables(scene)`: meshes with `userData.labelId` or merged `triLabels` (GDD §8.3); unlabelled hits read 「看不清」.
- **Findings against the live world (2026-09-29, `?dev=lens:targets` 35/39 green):**
  - `T_rephoto_2011` from `vp_temple_2011`: all 5 rays hit the `shrine` proxy ~1.1 m before the `idol` anchor (the idol
    sits inside the shrine box). The P4 photo looks through the open door: leave the doorway out of the proxy (or drop
    the shrine from `occluders`). The left lion also sits near the frame centre at 3×, GDD wants it at NDC x ≈ −0.6.
  - `T_meiqiu` / `T_bst_tv_still_on` from `sp_roof`: every ray hits the `b1` proxy ~1.8 m out, i.e. the block-1 box
    reaches above the roof walking surface (h 18). Clip it at the roof, so roof props (coop, TV, cat) stay visible.
  - `lh_door`: the lens stands 1.4 m inside the doorway on the tower axis and looks up at `lh_lamp`; from there the
    view shows the lamp room's underside. Please hang the stuck negative ③ where it reads from below (and consider a
    DoubleSide inner shaft). The ray test passes (proxies are single-sided).
  - `T_chai` from `vp_subway_top` is green at 1× through `aim` (the shade hides the dot, 2/5 rays clipped) — P8 holds.
- `vp_temple_2011` / `sp_net_dot` / `sp_lamp_p8` are yours to construct; `?dev=lens:targets` (or `dev/lens.html`) prints
  the verdict for every target row with a thumbnail — please run it after moving anything.

## 6. Note for E — HUD in the `lh_door` view
The `lh_door` view runs in the `gameplay` context (item 2), so E's HUD stays up (good: the 「拉下总闸」 prompt is
needed). The lens drops its own REC / clock / battery chips there to avoid doubling E's objective chip and phone status.

## 7. Notes for C (chars)
- The lens computes its own lens point (player feet + up·1.72 (1.7 seated) + heading·0.05) for determinism; it does not
  call `hero.lensPos()`. In peeks it uses the mount position.
- `T_granny_face.facing` reads the head's local +Z; `startBlink(epoch)` / `eyesClosed()` must use `clock.animT`.
- During the mirror LiveView render the lens calls `hero.setFirstPerson(false)` then `true` (same tick).
- `detachHead(mount)` may receive the lens's own empty `Object3D` ("lens:mount") when B's anchor has no `object`.
- The viewfinder `raise` pose puts the hero's upper arms/hands into the lower corners of the 55° lens frustum
  (smoke `05-viewfinder.png`), so they also appear in every photo. Keep them outside the frustum or move the arms to
  `HERO_FP_LAYER` together with the head while `setFirstPerson(true)`.

## 8. Notes for F (story)
- Preset photo ids equal their `PresetPhotoId` (`setRef('ph_2006_group')`). Until `PRESET_PHOTOS` has rows the lens uses
  its GDD §7.2 defaults (`src/lens/presets.ts DEFAULT_PRESETS`, titles `lbl.ph_*`).
- Candidate priority uses `PUZZLES[].targets` (available + unsolved); while `PUZZLES` is empty a GDD fallback table in
  `src/lens/ctx.ts` is used.
- The tripod success sets `group_photo_done` (+ the `ph_2026_group` photo, label 「周远 · 人 100%」); failure runs
  `{ node: 'xiaolin.group_retry' }`. Pigeons / pit shots reattach the head 1 s after the green shot.

## 9. Review pass (independent D reviewer, 2026-09-29)
Verified against the live world with `?dev=lens:targets` (36/39 green; the 3 yellow rows are the B proxies of item 5,
re-confirmed with `__lens.rays`: `T_rephoto_2011` → all 5 rays `occ:shrine@5.5/6.6`; `T_meiqiu` / `T_bst_tv_still_on`
→ `occ:b1@1.8/3.5`). New findings for other owners:
- **B — `pk_coop` shows nothing.** The coop (`src/world/build/places.ts` roof block) is a solid 2.0 × 1.3 × 1.4 box with a
  quad door; there is no interior, no 4 pigeons and no glowing negative ① (GDD §9 P5 step 5 「头的视角里，4 只鸽子蹲在一格
  发光的底片上」). The lens now puts the head 0.15 m past `coop_door` toward `coop_inside` (i.e. 0.1 m inside the box
  face, `src/lens/modes.ts COOP_IN`). Please make the coop hollow (inward-facing walls/roof, an open small door or a
  cut-out) and put the pigeons (+ their fly-out) and the negative at `coop_inside`.
- **B — `pk_psd`: the pit has no negative ④.** `anchor('pit')` is on the bare pit floor between the sleepers
  (`src/world/interiors/build.ts` track pit); the 10×/1× peek frames nothing that reads as 「底片」. Please add the
  frame-④ card at `pit` (hidden once `frame4_registered`).
- **F — `T_temple_qr.onShot` no longer carries `{ wx: 'wx_after_scan' }`** (your `fx('idol_scanned', …)` rule already
  sends it; the [F] lesson asks D to keep only set/give/photo). `{ photo: 'ph_temple_2011' }` stays (GDD §8.1), so the
  preset renders twice on a scan — harmless (the second render refreshes in place). `T_studio_qr` still sends
  `wx_auto_studio` because no story rule does.
- **I — tripod view recognition bar:** with no target competing there the bar shows the centre-ray scenery label
  (usually 「看不清」); GDD only fixes the success text 「周远 · 人 100%」 (shown after the shot). Fine to leave.
