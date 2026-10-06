# Requests from C (chars) — for agent I

Status: Phase 1 done (2026-09-29). C implements ARCHITECTURE §3.C without touching any frozen S file. Nothing below
blocks the cast; items 1–3 are small placement/contract notes other owners should apply or confirm.

## 1. `src/core/layers.ts` — name layer 5 (S)
`hero.setFirstPerson(true)` moves the phone-head subtree to render layer **5** (`HERO_FP_LAYER` in
`src/chars/hero/hero.ts`), so the main camera and every capture skip it while the mirror can still see it.
**Request:** add `HERO_FP: 5` to `LAYER` (documentation only; nobody else may use layer 5, and neither the main camera
nor `render.capture()` may ever enable it). D already calls `setFirstPerson(false)` → mirror render → `true`.

## 2. Bench and perch geometry (B)
C's poses assume where the seat is, relative to the spot (the feet point):
- **Sitting** (`sp_bench`, `sp_bus_bench` after `play('wake')` / `play('sit')`): hips 0.38 m **behind** the spot
  (opposite its yaw), seat top ≈ 0.47 m above the spot ground. Please put the bench seat centre ≈ 0.4 m behind the spot,
  long axis across the yaw. The `S_wake` lie pose lies along that long axis (head to the character's right).
- **小刘 at night** (`sp_site_pipes`, h 0.8): he perches with his hips ≈ 0.1 m above the spot height, legs hanging in
  front (+yaw). The pipe top should be at h ≈ 0.8 under the spot.
- **土地 at dusk** stands on the temple platform at chart (2.6, 141.5, 4) beside the burner (the donation-box spot is an
  object position). Move `TUDI_DUSK` in `src/chars/schedule.ts` if the burner mesh ends up there.
- **王阿婆 after P8** stands on `sp_estate_window` (h 9, the 4F gallery floor) facing yaw 260.

## 3. Contract notes (D, E, F)
- `detachHead(mount)` re-parents the phone head to `mount` with an identity local transform: the head pivot is the
  phone's bottom centre, the face/lens side is `mount` +Z, +Y is up. `lensPos()` after a detach =
  `mount.localToWorld(0, 0.307, 0.064)`. The state switch is immediate; the promise resolves after the 0.4 s tween
  (instant in `?test`). `detachHead(null)` re-attaches.
- `HeroApi.play()` resolves on sim time: `wake` 1.5 s (lie → sit, then stays seated until the player moves or
  `play('stand')`), `sit`/`stand` 0.4 s, `turn_back` 0.5 s (turns the body 180°, undone by walking), `idle` resets.
- `NpcHandle.play(name)` (1.6 s) accepts `'talk'` and pose names: `point hold akimbo sit crouch raise reach` plus
  per-NPC `eat cupHold` (小林) `cart` (王阿婆) `mend behind` (老陈) `board horn perch` (小刘) `puff` (土地) `drive` (站务员).
- The hero screen reacts to bus events by itself (`viewfinder` → REC, `dialogueLine` speaker `me` → typing, `show` →
  the photos at 2 Hz and a 180° turn, `signalChanged`, `clockChanged`, `promptChanged` inspect/pickup/use → 「!」,
  `uncanny` M_wake_face / M_mirror_face → 0.5 s faces). `setScreen(mode, {seconds})` overrides all of it.
- Static bursts on the back screen fire for any registered actor with `spirit: true` within 10 m at dusk/night (and
  always in `subway_int`), except 土地. B: register `chai` with `spirit: true` if the 拆 should jam the screen too.
- `faceTexture(seed)` works before `chars.init()` (the atlas is built synchronously): it returns a clone of the shared
  512² atlas with `offset/repeat` on cell `seed mod 40`; `texture.userData = { atlas, cell: {u0,v0,u1,v1} }` lets B merge
  the whole portrait wall into one material by writing the cell UVs itself. C re-uploads every clone on FaceState changes.
- Name tag after P8 (F request #3): key `npc.chai_zhe` = 「折」 exists in `src/data/zh/chars.ts`; E picks it when
  `P8_done` is set.
- 王阿婆's actor is re-registered with `talkRange: 12` while she stands on `sp_estate_window` (F request #2).

## 4. Review pass (2026-09-29, independent reviewer acting as C)
- **Viewfinder pose (D, info):** while `viewfinder` is on, the hero body plays `raise`. The hands now hold the sides of the
  phone slab *behind* the lens plane. Before this fix both mitts filled the edges of every first-person frame and photo.
  `src/chars/hero.test.ts` checks the skinned arm vertices against D's lens frustum (feet + 1.72 up + 0.05 forward, 55°,
  pitch −60…70). If D changes `EYE`/`FORWARD`/`ZOOM_FOV[1]`, re-run `npx vitest run src/chars`.
- **Back-screen typing (E, info):** `setScreen('typing', { text })` now reveals `text` at 24 characters/s from the call,
  like the `dialogueLine` path. E can keep passing the whole line.
- **Torch (A, info):** the head torch registers ONE lamp and moves it by mutating the `pos` it passed in. It
  re-registers only after a scene change.
- **NpcHandle.play() (F, info):** the promise now resolves after its duration even while the NPC is hidden or in
  another scene. Before this fix it could hang a beat.
