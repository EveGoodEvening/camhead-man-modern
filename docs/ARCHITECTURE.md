# ARCHITECTURE — 《显影 · 望潮里志怪》 implementation blueprint

> Status: **v1, binding for implementation** (2026-09-29). Readers: the scaffold agent (S), the six parallel module agents (A–F) and the integration agent (I).
> Precedence: gameplay, content and ids → `docs/GDD.md`; visuals → `docs/ART_DIRECTION.md`; r186 and tooling facts → `docs/TECH_NOTES.md`; **code structure, file ownership, APIs and process → this document**. Where this document amends a GDD code contract (GDD §18.1 layout, §18.2 types, §18.3 events, §20.1 split), this document wins. §2.4 lists every amendment.
> The frozen TypeScript in §2.5–§2.8 was typechecked against `three@0.186.1` + `typescript@6.0.3` with the §1.3 tsconfig (re-verified after the consistency-review amendments in §2.4 item 15). The coordinate conventions in §2.3 were verified numerically. Known risks and their mitigations are in §6.

---

## 0. The plan on one page

```
Phase 0  S   scaffold: tooling, frozen contracts, full core runtime, id + data seeds, working stubs for A–F, test scripts
             └─ orchestrator commits "scaffold"
Phase 1  A render+audio │ B world │ C characters │ D lens │ E ui │ F story        (parallel, same working tree)
Phase 2  I   integration: typecheck → tests → crossref → smoke boot → golden path → checkpoints → perf → polish loop
```

| Id | Agent name | Module | Owns (summary; full table §1.4) |
|---|---|---|---|
| S | `scaffold` | core runtime + tooling | configs, `scripts/**`, `src/main.ts`, `src/types.ts`, `src/events.ts`, `src/contracts.ts`, `src/debug.ts`, `src/core/**`, `src/art/**`, `src/data/zh.ts` |
| A | `render` | look & sound | `src/render/**`, `src/audio/**`, `src/data/phases.ts` |
| B | `world` | the tiny-planet town | `src/world/**`, `src/data/locations.ts`, `src/data/ids/spots.ts`, `src/data/zh/world.ts` |
| C | `chars` | the cast | `src/chars/**`, `src/data/npcs.ts`, `src/data/zh/chars.ts` |
| D | `lens` | camera mechanics and shot logic | `src/lens/**`, `src/data/{photoTargets,labels,bestiary}.ts`, `src/data/ids/lens.ts`, `src/data/zh/lens.ts` |
| E | `ui` | DOM UI and its engines | `src/ui/**`, `src/data/ids/ui.ts`, `src/data/zh/ui.ts` |
| F | `story` | narrative content and direction | `src/story/**`, `src/data/{story,dialogue,items,puzzles,wx,show,interacts}.ts`, `src/data/ids/story.ts`, `src/data/zh/{story,dlg,wx,cards}.ts` |
| I | `integrator` | Phase 2 only | may edit anything |

**Why this differs from GDD §20.1:** the scaffold now owns the whole core (GDD's agent A), so the six parallel slots were rebalanced. Audio moves in with render, because both are fully specified by ART and TECH and both are light. GDD's "F 渲染与内容" data-entry job is split by domain, so each data file has exactly one owner, and that owner also owns either its consumer or its text.

### 0.1 Parallel-phase rules (every Phase-1 agent)
1. **Edit only files you own** (§1.4). The scaffold puts a stub in every file you own. The stub is yours to replace completely.
2. **Frozen files are read-only in Phase 1.** That means every file S owns. If you need a change in one, keep a local workaround and write the exact change in `docs/integration/requests-<your id>.md`, a file you own. Agent I applies it.
3. **Ids are append-only** (AGENTS.md lesson). Never rename or delete an id that the GDD defines.
4. **No git write commands** (`commit`, `checkout`, `switch`, `stash`, `reset`, `clean`, `rebase`, `merge`, `restore`). **No dependency changes** (`npm install/uninstall/update`, or edits to `package.json`, the lockfile, `tsconfig.json` or `vite.config.ts`). Other agents' uncommitted work lives in the same tree.
5. **Keep the tree compiling.** Write whole files, never leave half-finished edits, and run `node scripts/tsc-scope.mjs <your paths>` after each batch. Errors in paths owned by others are not yours to fix. Ignore them.
6. **Run one dev server on your own port** (§1.6). Never build into `dist/`. If you need a production bundle, use `npx vite build --outDir .build/<id> --emptyOutDir`.
7. **Use the browser only through `scripts/shot.mjs` and `scripts/smoke.mjs`.** They share a 2-slot semaphore for the whole machine: the user runs at most 2 browser-heavy agents at once, and SwiftShader is CPU-bound. Keep browser runs short.
8. **Lessons:** append one line to `AGENTS.md` under `## Lessons`, prefixed with your id (`- [B] …`). Append with Edit and never rewrite the file.
9. **Cross-module calls go through `core.services.*` at runtime.** Static imports are limited to §1.5.

---

## 1. Stack, versions, scripts, layout

### 1.1 Versions (npm registry, verified 2026-09-29; TECH §1.1, AGENTS.md)
| Package | Pin | Role |
|---|---|---|
| `three` | `0.186.1` | `WebGLRenderer` only (no `three/webgpu`, no TSL) |
| `@types/three` | `0.186.0` | |
| `vite` | `8.3.1` | Rolldown-based; `build.rolldownOptions`, not `rollupOptions` |
| `typescript` | `~6.0.3` | not 7.x (npm `latest` is 7.0.2) |
| `vitest` | `5.0.2` | node environment, `src/**/*.test.ts` only |
| `playwright` | `1.63.0` | used by `scripts/*.mjs` (`import { chromium } from 'playwright'`) |
| `@playwright/test` | `1.63.0` | optional spec runner for later pixel baselines in `e2e/` |

- Node ≥ 22.12 (this machine runs 24.18).
- Chromium 1243 is already cached in `~/.cache/ms-playwright`. Never run `npx playwright install`.
- No other runtime or dev dependency may be added.

### 1.2 `package.json`
```json
{
  "name": "camera-man-modern", "private": true, "version": "0.1.0", "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "node scripts/smoke.mjs",
    "e2e:golden": "node scripts/smoke.mjs --suite golden",
    "e2e:all": "node scripts/smoke.mjs --suite all",
    "shot": "node scripts/shot.mjs",
    "check:ids": "node scripts/check-gdd-ids.mjs"
  },
  "dependencies": { "three": "0.186.1" },
  "devDependencies": {
    "@types/three": "0.186.0", "typescript": "~6.0.3", "vite": "8.3.1", "vitest": "5.0.2",
    "playwright": "1.63.0", "@playwright/test": "1.63.0"
  }
}
```

### 1.3 Config files
- **`tsconfig.json`:** TECH §1.3 verbatim (`strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `moduleResolution: bundler`). Set `"include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]`.
- **`vite.config.ts`:** TECH §1.4 (`base: './'`, `build.target es2022`, vitest `include: ['src/**/*.test.ts']`, `environment: 'node'`), plus `server: { host: '127.0.0.1' }`. `index.html` is the only build input. The dev server serves `dev/*.html` pages, but they are never built.
- **`.gitignore`:** `node_modules/ dist/ .build/ .smoke/ test-results/ playwright-report/`.
- **`index.html`:** contains
  - `<canvas id="game" data-testid="game-canvas">`, `<div id="ui">` and `<div id="fade">`;
  - the Google Fonts `<link>` from ART §8.3, plus the GDD §1 title-subset link (`&text=显影望潮里志怪开机继续设置`);
  - `<script type="module" src="/src/main.ts">`;
  - the style `html, body { margin:0; overflow:hidden; background:#65c1bc }`.

### 1.4 Directory layout and ownership (authoritative)
```
/                                   S  index.html package.json package-lock.json tsconfig.json vite.config.ts
                                       playwright.config.ts .gitignore
scripts/                            S  smoke.mjs shot.mjs tsc-scope.mjs check-gdd-ids.mjs lib/browser.mjs owners.json
e2e/                                S  (optional @playwright/test specs, Phase 2)
dev/<mod>.html                      owner of <mod>: optional self-test pages → src/<mod>/dev.ts
docs/                               read-only · docs/integration/requests-<id>.md: one file per agent, own file only
AGENTS.md                           shared, append-only "## Lessons" lines
src/
  main.ts  debug.ts                 S
  types.ts events.ts contracts.ts   S  FROZEN
  core/**                           S  FROZEN (file list §2.8)
  art/palette.ts                    S  FROZEN (ART §2.5 PAL verbatim)
  render/**  audio/**               A
  world/**                          B
  chars/**                          C
  lens/**                           D
  ui/**                             E
  story/**                          F
  data/
    zh.ts                           S  FROZEN barrel over the section files below
    zh/ui.ts                        E  keys ui.* kp.* np.* mb.* tut.* set.*
    zh/lens.ts                      D  keys vf.* lbl.* fail.* bst.* tp.*
    zh/world.ts                     B  keys sign.* loc.* world.*
    zh/chars.ts                     C  keys npc.* scr.*
    zh/story.ts                     F  keys txt.* item.* clue.* obj.* pz.* hint.* ch.* sys.*
    zh/dlg.ts zh/wx.ts zh/cards.ts  F  DLG · WX_TEXT · CARDS / EPILOGUE / CREDITS
    ids/spots.ts                    B  SPOT_IDS, WORLD_ANCHOR_IDS
    ids/lens.ts                     D  TARGET_IDS, LABEL_IDS
    ids/story.ts                    F  FLAG_IDS, NODE_IDS, WX_IDS, CLUE_IDS, OBJECTIVE_IDS, INTERACT_IDS
    ids/ui.ts                       E  TUT_IDS
    locations.ts                    B  LOCATIONS, SPOTS, GATES, SIGNAL_ZONES          (GDD §5)
    npcs.ts                         C  NPCS                                            (GDD §6)
    photoTargets.ts labels.ts bestiary.ts                               D              (GDD §8, §14)
    phases.ts                       A  PALETTES                                        (GDD §10.3 + ART §5.2)
    story.ts dialogue.ts items.ts puzzles.ts wx.ts show.ts interacts.ts F              (GDD §7, §9–§13, §15)
    crossref.test.ts no-cjk.test.ts S  integration checks (§4.3)
```
`scripts/owners.json` holds the same table in machine-readable form (glob → owner id). The appendix gives its content.

### 1.5 Allowed static imports
| Importer | May import statically |
|---|---|
| any module | `src/types.ts`, `src/events.ts`, `src/contracts.ts` (types), `src/core/**`, `src/art/palette.ts`, `src/data/**` (read-only) |
| B, C, D (they build meshes) | additionally `makeToonMaterial` from `src/render/index.ts` |
| everything else | at runtime through `core.services.<x>`, resolved inside `init()` or an update, **never inside the factory body** |

- No module imports another module's internal files.
- Data files import only `types.ts`, **type-only** imports from `contracts.ts` (e.g. `ZoneDef` for `ZONES`), and `data/ids/*`. Never code.

### 1.6 Ports and self-check commands per agent
| Agent | Dev server | Scoped typecheck (`node scripts/tsc-scope.mjs …`) | Tests |
|---|---|---|---|
| S | 5170 | whole repo: `npm run typecheck` | `npx vitest run src/core src/data` |
| A | 5171 | `src/render src/audio src/data/phases.ts` | `npx vitest run src/render src/audio` |
| B | 5172 | `src/world src/data/locations.ts src/data/ids/spots.ts src/data/zh/world.ts` | `npx vitest run src/world` |
| C | 5173 | `src/chars src/data/npcs.ts src/data/zh/chars.ts` | `npx vitest run src/chars` |
| D | 5174 | `src/lens src/data/photoTargets.ts src/data/labels.ts src/data/bestiary.ts src/data/ids/lens.ts src/data/zh/lens.ts` | `npx vitest run src/lens` |
| E | 5175 | `src/ui src/data/ids/ui.ts src/data/zh/ui.ts` | `npx vitest run src/ui` |
| F | 5176 | `src/story src/data/story.ts src/data/dialogue.ts src/data/items.ts src/data/puzzles.ts src/data/wx.ts src/data/show.ts src/data/interacts.ts src/data/ids/story.ts src/data/zh/story.ts src/data/zh/dlg.ts src/data/zh/wx.ts src/data/zh/cards.ts` | `npx vitest run src/story` |
| I | 5177, plus preview on 4174 | `npm run typecheck` | `npm test` |

Start your server with `npx vite --port 517X --strictPort` (in the background). Take screenshots like this:
`node scripts/shot.mjs --base http://127.0.0.1:517X --url '/?test&skipTitle&at=vp_subway_top&chapter=ch3' --do "viewfinder(true)" --do "aim('T_chai')" --steps 3 --out test-results/<id>/chai.png`

---

## 2. Core runtime (owner S, built first)

### 2.1 Boot sequence (`src/main.ts`)
1. `params = parseParams(location.search)` (§2.10). Create the `WebGLRenderer` per TECH §2.1 and ART §4.6:
   - `antialias:false`, `stencil:false`, `powerPreference:'high-performance'`;
   - `NoToneMapping`, `outputColorSpace = SRGBColorSpace`;
   - `shadowMap.enabled`, `BasicShadowMap`, `info.autoReset = false`;
   - pixel ratio = `params.dpr ?? (test ? 1 : lowfx ? 0.75 : min(devicePixelRatio, 1.5))`.
2. Build the core objects: clock, rng (mulberry32 of `seed`), log, bus, input, loop, store, rules, scenes, physics, player, cameraRig, interact, actors, fade. Register the core action handlers (§2.8.9).
3. `await warmFonts()` (§2.8.11). It takes at most 3 s and never throws.
4. **Create** the modules. Factories only capture `core`, with no side effects. Order: `services.render = createRender(core)`, then `audio`, `world`, `chars`, `lens`, `ui`, `story`.
5. **Initialise** in order: render → audio → world → chars → lens → ui → story. Each step awaits `init()`.
   - World comes before chars because actors stand on spots.
   - Lens comes after both because preset photos render the world and the cast.
   - Story is last because it registers interacts, zones and rules over everything.
6. Enter the game state:
   - `?chapter=c`: `story.bootChapter(c)`.
   - otherwise `?skipTitle`, `?at` or `?phase`: `await story.startGame({ skipIntro: true })`.
   - otherwise: `ui.showTitle()` and `cameraRig.setTitleMode(true)`.
7. Apply the remaining URL state:
   - `?phase` → `store.setPhase(p, undefined, true)`;
   - `?flags` → `store.set()` for each flag, then `stateLoaded{reason:'debug'}`;
   - `?at` → `player.goto(at, { fade:false })`;
   - `?dev` → `services[mod].devHook?.(arg)`.
8. `await render.compile()`, then render one frame.
9. `await document.fonts.ready`, then set `window.__game.ready = true`. Realtime mode starts `renderer.setAnimationLoop`. **`?test` never starts the rAF loop.**

### 2.2 Frame loop (`src/core/loop.ts`)
One tick runs `input.begin()`, then the systems in phase order, then `input.end()`. After the tick(s), `render.frame(dt)` runs once.

| Phase | Systems (registered by) |
|---|---|
| `input` | core: pointer lock and keys → actions; E: global hotkeys (Tab / J / H / Esc / G) |
| `logic` | core: story-rule evaluation; E: typewriter, wx queue, hints, tutorials; F: beat sequencer |
| `player` | core: walker, collisions, walk surfaces, zones, interaction picking |
| `actors` | C: schedules, animation, hero screen, zhimei mover |
| `world` | B: signal, dynamic props, trail dot, chai animation; core: horizon culling |
| `lens` | D: viewfinder, per-frame `evalShot`, exposure, timers |
| `camera` | core: rig (follow, title, or top override) |
| `ui` | E: HUD and prompt projection; D: viewfinder overlay |
| `late` | A: sun and shadow follow, lamps, uniforms, audio listener and ambience |

**Timing**
- Realtime: `dt = min(timer.getDelta(), 1/20)`, using `Timer` from three core (`Clock` is deprecated).
- `?test`: a fixed `1/60`, unless `step(n, dt)` passes another value.
- At the start of each tick: `clock.t += dt`, and `if (!clock.frozen) clock.animT += dt`.
- **Every gameplay and decorative timer reads `clock`.** Never use `performance.now()` or `Date.now()` for them; A's `timeRender` is the only exception.
- `loop.setPaused(true)` stops ticks. Rendering continues, so the UI can still draw. It emits `paused`.

### 2.3 Frozen conventions
**Coordinates** (GDD §0.2; verified numerically for this document)
- The planet is centered at the origin, `PLANET_R = 80`, and the town sits on the +Y pole.
- `ChartPos (r, lon, h)` maps to flat coordinates `x = r·sin lon`, `z = r·cos lon`, then through the exponential map at +Y. lon 0 = +Z; lon 90 = +X.
- **Heading / yaw** = degrees clockwise from local north, seen from outside the planet:
  - north = toward the pole (uphill);
  - east = the direction of increasing lon;
  - 180 = seaward.
  - Example: at `sp_bus_bench` (38.5, 0°), east = +X and north = (0, 0.46, −0.89).
- **Models** are authored Y-up and facing +Z. Place them only with `placeAt`, `placeMatrix` or `placeOnSphere`. Never use `rotateY` for headings: three's +Y rotation runs counter-clockwise.
- **Interiors** are separate `Scene`s on a sphere of R = 5000 centered at (0, −5000, 0), so they are flat to within 1 cm.
  - Positions use `LocalPos {x, y (height), z}`.
  - North = −Z; east = +X.

**Layers** (`src/core/layers.ts`)
| Layer | Id | Rendered by the main camera |
|---|---|---|
| `WORLD` | 0 | always |
| `GHOST` | 2 (ART's "spirit" layer) | only while D's night viewfinder is on |
| `PAST` | 3 | only inside `render.capture` |
| `PHOTO_ONLY` | 4 | only inside `render.capture` |

Raycasters must call `layers.enableAll()` or set the layers they need explicitly (TECH §3.3).

**Surface ids** (ART §4.3), by owner
| Range | Owner | Use |
|---|---|---|
| 1–199 | B | environment; A's title dressing uses 190–199 |
| 200–209 | C | hero |
| 210–229 | C | NPCs |
| 230–239 | B | interactables (`lineWeight` 1.4) |
| 240–244 | B | spirit world objects (the chai glyph, ghost-lit props) |
| 245–254 | C | spirit characters |
| 0 and 255 | — | reserved |

**userData contract** (B and C write it; A and D read it)
| Key | Set on | Meaning |
|---|---|---|
| `mrt: true` | Material | set by `makeToonMaterial`; A's dev check reports main-pass meshes without it |
| `transient: true` | Object3D | hidden in night long exposures (pedestrians) |
| `hideInPast: true` | Object3D | hidden in PAST captures (crane, chai, new signage, current NPCs, hero) |
| `labelId: LabelId` | Mesh | scenery label for the whole mesh |
| `geometry.userData.triLabels: Uint16Array` + `labelTable: LabelId[]` | merged BufferGeometry | per-triangle label: an index into `labelTable`, `0xffff` = none; written by `mergePainted` |
| `actorId: string` | actor root | maps a raycast hit to its actor |
| `detail: true` | Object3D | culled while the camera is more than 60 m above the ground (title, ending pull-backs) |

**Randomness:** use `core.rng.fork('<module>:<purpose>')` everywhere. `Math.random` is banned in `src/`, because test mode must be deterministic (GDD §19.1).

**Text**
- Player-facing strings live only in `src/data/**`. Code calls `t(key, vars)` from `src/data/zh.ts`.
- Bake canvas text only after `warmFonts()`, using the `core/canvas.ts` helpers.

### 2.4 Amendments to the GDD code contracts (all applied in §2.5–§2.7)
1. **Id unions are data.** They are typed, append-only, and owned by the owner of the matching data file. `types.ts` re-exports them, so every reference is compile-checked.
   | Ids | File | Owner |
   |---|---|---|
   | `SpotId`, `WorldAnchorId` (new) | `ids/spots.ts` | B |
   | `TargetId`, `LabelId` (new) | `ids/lens.ts` | D |
   | story `FlagId`s, `NodeId`, `WxId`, `ClueId`, `ObjectiveId`, `InteractId` (new, `it_*`) | `ids/story.ts` | F |
   | `TutId` (new) | `ids/ui.ts` | E |
2. **New shared unions:**
   - `GateId`, `PeekId` (`pk_coop | pk_psd | tripod | lh_door`), `PromptVerb`, `InputKind`, `CardKind`, `ModalKind`, `UncannyId`;
   - `SfxId`: GDD §17 plus `sfx_memo | sfx_click | sfx_stamp | sfx_door | sfx_fail`;
   - `GateVerdict`, `ActorLayer`, `Settings`, `SmokeRule`.
3. **`Action`** adds `{sfx}`, `{wait}`, `{toast}`, `{pose}`, `{detach}` and `{setClock}`. `card` is widened to `CardKind`, and `objective` accepts `null`.
4. **`StoryRule.guard?: Cond`** replaces the implicit "puzzle `availableWhen`" check in GDD §18.5.
5. **`DialogueNode`:** `owner` also accepts an `InteractId`; new field `noFixedOptions`.
6. **`PhotoTarget`:**
   - `anchor` accepts `{ world: WorldAnchorId }`;
   - `whole` accepts `{ world }`, meaning the anchor's corners;
   - `onlyFrom` is a `PeekId`.
7. **`InteractDef`** gains `promptKey`, `talkAs`, and `spot: … | { world }`.
8. **`SpotDef`** gains `approach` (see the `goto` rule in §2.8.4).
9. **`WxDef` has no trigger.** Only `{wx}` actions push wx (from story rules, nodes and beats). One mechanism means no double sends.
10. **New shared content definitions:**
    - `InputDef`: keypad, namepicker and milkbox answers and outcomes (GDD §18.4);
    - `GateOutcome`, `ItemDef`, `ClueDef`, `ObjectiveDef`, `ChapterDef`, `ChapterBoot`, `BestiaryDef`, `GateDef`.
11. **`Photo`** gains `keep` (never auto-evicted) and `seq`. **`GameState`** gains `cleared`.
12. **`PuzzleDef.clockAfter: ''`** means the night rule: +40 min, capped at 03:40 (GDD §18.6).
13. **Events:** GDD §18.3 is kept verbatim, except that `phaseChanged` gains `instant`. §2.6 adds the new events.
14. **`zh.ts`** becomes a frozen barrel over per-owner section files (§1.4). `DLG` values are `[SpeakerId, text][]`, as in GDD §18.5.
15. **Consistency-review additions (2026-09-29), all applied in §2.5–§2.7:**
    - `Cond.lens` accepts `'plain'` (= not in the night viewfinder), for GDD §11 nodes marked 〔不在夜景〕.
    - `SpotDef` gains `stand` (the standing point for object spots, GDD §0.2) and `approachDist` (default 1.8 m; 3.0 for `sp_seawall_zhimei`).
    - `InteractDef` gains `priority` (picked before distance, §2.8.6) and `peek` (live only while that peek is active; interacts without `peek` are dead during any peek).
    - `ObjectiveDef` gains `hintFor` (GDD §13).
    - New content shapes that were referenced but never typed: `BeatHintDef`, `SignalZone`, `PaletteDef`, `LabelDef`, `PresetPhotoDef`, `ShowFallbackRow`, `BeatDef`. §2.8.16 lists every data export with its type.
    - `DebugState` gains `actors`, `faceState` and `uncanny`; `RenderApi` gains `uncanny()`; `LensApi.aim` has defined semantics (mean direction, GDD §19.3 notes).

### 2.5 `src/types.ts` (paste verbatim)
```ts
// src/types.ts — owner: S (scaffold). FROZEN in Phase 1.
// = GDD §18.2 + the amendments listed in ARCHITECTURE §2.4. Content id unions live in src/data/ids/*.
import type { Vector3 } from 'three';
import type { GameEvents } from './events';
import type { SpotId, WorldAnchorId } from './data/ids/spots';
import type { TargetId, LabelId } from './data/ids/lens';
import type { StoryFlagId, NodeId, WxId, ClueId, ObjectiveId, InteractId } from './data/ids/story';
import type { TutId } from './data/ids/ui';

export type { SpotId, WorldAnchorId, TargetId, LabelId, NodeId, WxId, ClueId, ObjectiveId, InteractId, TutId };

// ---------- GDD §18.2 enums (unchanged) ----------
export type Phase = 'day' | 'dusk' | 'night' | 'dawn';
export type PaletteKey = 'title' | 'morning' | 'day' | 'dusk' | 'night' | 'dawn';
export type ChapterId = 'prologue' | 'ch1' | 'ch2' | 'ch3' | 'finale';
export type SceneId = 'planet' | 'studio_int' | 'subway_int';
export type LocationId =
  | 'bus_stop' | 'footbridge' | 'store' | 'alley' | 'studio' | 'estate'
  | 'temple' | 'market' | 'site' | 'pier' | 'lighthouse';
export type NpcId =
  | 'xiaolin' | 'granny_wang' | 'old_chen' | 'xiaoliu' | 'tudi'
  | 'meiqiu' | 'zhimei' | 'chai' | 'attendant' | 'lao_zhou';
export type SpeakerId = NpcId | 'me' | 'system';
export type ReceiverId = NpcId | 'gate';
export type Verb =
  | 'move' | 'run' | 'look' | 'interact' | 'viewfinder' | 'shutter' | 'burst' | 'zoom'
  | 'scan' | 'flash' | 'torch' | 'show' | 'rephoto' | 'night' | 'detach' | 'signal' | 'phone' | 'hint';
export type Zoom = 1 | 3 | 10;
export type PuzzleId =
  | 'P1_rephoto_bridge' | 'P2_signal_locker' | 'P3_face_gate' | 'P4_tudi_face' | 'P5_rooftop_coop'
  | 'P6_lighthouse_1987' | 'P7_line_zero' | 'P8_chai_to_zhe' | 'P9_paper_eye';
export type BeatId =
  | 'S_wake' | 'S_studio' | 'S_mirror' | 'S_sunset' | 'S_zhe' | 'S_darkroom'
  | 'S_group_photo' | 'S_ending_A' | 'S_ending_B';
export type ItemId =
  | 'key_ring' | 'note_dad' | 'key_rooftop' | 'frame_1' | 'frame_2' | 'frame_3' | 'frame_4'
  | 'cinnabar_dot' | 'envelope_dad';
export type PresetPhotoId = 'ph_2006_group' | 'ph_temple_2011' | 'ph_2023_stitched' | 'ph_2026_group';
export type BestiaryId =
  | 'bst_second_shadow' | 'bst_manhole_eye' | 'bst_queue_shadows'
  | 'bst_lion_turns' | 'bst_tv_still_on' | 'bst_fish_watching';
export type FaceState = 'mosaic' | 'blank' | 'clear';
/** Story flags are listed in data/ids/story.ts (owner F, append-only). */
export type FlagId = StoryFlagId | BestiaryId | `seen:${string}`;
export type StrKey = string; // key into the zh barrel (src/data/zh.ts)

// ---------- ARCHITECTURE additions ----------
export type GateId =
  | 'gate_roadwork' | 'gate_tide' | 'gate_studio' | 'gate_estate' | 'gate_roof'
  | 'gate_hill' | 'gate_subway' | 'gate_gantry' | 'gate_lighthouse' | 'gate_darkroom';
/** Fixed first-person views. pk_* and tripod detach the head; lh_door is the lighthouse door look-up view. */
export type PeekId = 'pk_coop' | 'pk_psd' | 'tripod' | 'lh_door';
export type PromptVerb = 'talk' | 'inspect' | 'pickup' | 'use' | 'sit' | 'climb' | 'detach' | 'enter' | 'show';
export type InputKind = 'locker' | 'lighthouse' | 'namepicker' | 'milkbox';
export type CardKind = 'chapter' | 'liaozhai' | 'photo' | 'epilogue' | 'credits';
export type ModalKind = 'title' | 'phone' | 'input' | 'show' | 'pause' | 'settings' | 'card';
export type UncannyId =
  | 'M_wake_face' | 'M_zhimei_move' | 'M_mirror_face' | 'M_chai_wake' | 'M_subway' | 'M_lighthouse_off' | 'M_zhe';
export type SfxId =
  | 'sfx_shutter' | 'sfx_burst' | 'sfx_flash' | 'sfx_scan' | 'sfx_step' | 'sfx_waves' | 'sfx_ping'
  | 'sfx_type' | 'sfx_paper' | 'sfx_drone' | 'sfx_notice' | 'sfx_chime' | 'sfx_pigeons' | 'sfx_countdown'
  | 'sfx_horn' | 'sfx_keypad' | 'sfx_memo' | 'sfx_click' | 'sfx_stamp' | 'sfx_door' | 'sfx_fail';
export type GateVerdict = 'noface' | 'other' | 'one' | 'both_open' | 'both_closed' | 'pass';
export type ActorLayer = 'world' | 'ghost' | 'photo_only';
export interface Settings { sens: number; invertY: boolean; volume: number; textSpeed: 'fast' | 'mid' | 'slow' }

// ---------- positions ----------
export interface ChartPos { r: number; lon: number; h?: number }   // GDD §0.2 (planet north-pole chart)
export interface LocalPos { x: number; y: number; z: number }       // pocket interiors: x/z flat metres, y = height
export interface SpotDef {
  id: SpotId; scene: SceneId; pos: ChartPos | LocalPos;
  yaw?: number; pitch?: number; loc?: LocationId;
  /** goto() onto a spot an actor currently occupies: stand approachDist in 'front' (default, facing it) or 'behind' (looking where it looks). */
  approach?: 'front' | 'behind';
  approachDist?: number;               // default 1.8 m
  /** Object spots (GDD §0.2: yaw '—' or a prop's own position): goto() stands here, facing `pos`. Written by B. */
  stand?: ChartPos | LocalPos;
}
export interface LocationDef {
  id: LocationId; nameKey: StrKey; center: ChartPos; radius: number; openWhen?: Cond;
}

// ---------- rules ----------
export interface Cond {
  phase?: readonly Phase[]; all?: readonly FlagId[]; none?: readonly FlagId[]; any?: readonly FlagId[];
  items?: readonly ItemId[]; tags?: readonly string[];
  lens?: 'night' | 'plain';                  // 'plain' = NOT in the night viewfinder (GDD 〔不在夜景〕)
  scene?: SceneId;
}
export type Action =
  | { set: FlagId } | { give: ItemId } | { take: ItemId } | { verb: Verb } | { clue: ClueId }
  | { beat: BeatId } | { wx: WxId } | { objective: ObjectiveId | null } | { teleport: SpotId }
  | { chapter: ChapterId; phase: Phase; palette: PaletteKey; clock: string }
  | { photo: PresetPhotoId } | { memo: 1 | 2 | 3 } | { uncanny: UncannyId }
  | { ui: 'show' | 'keypad_locker' | 'keypad_lighthouse' | 'namepicker' | 'milkbox' | 'timer' | 'ending_choice' }
  | { node: NodeId } | { card: CardKind; id: string }
  // additions
  | { sfx: SfxId } | { wait: number } | { toast: StrKey } | { pose: 'sit' | 'stand' }
  | { detach: PeekId } | { setClock: string };

export interface NpcDef {
  id: NpcId; nameKey: StrKey; tag: 'npc' | 'spirit';
  layer: ActorLayer;
  schedule: Partial<Record<Phase, SpotId>>;
  overrides?: readonly { when: Cond; spot: SpotId }[];
  talkRange?: number;          // default 2.5; granny at the window: 12
  talkNeedsNight?: boolean;    // tudi only (GHOST). meiqiu/zhimei stay talkable by plain E (their `lens:'plain'` nodes) and speak via `lens:'night'` nodes (GDD §6.1)
}

export interface DialogueNode {
  id: NodeId; owner: SpeakerId | ReceiverId | InteractId; when: Cond; prio: number;
  once?: boolean; auto?: boolean;            // auto: plays by itself when `when` holds and the owner is in range
  noFixedOptions?: boolean;                  // suppress 「出示照片…」「再见」 (cutscene lines, auto nodes)
  choices?: readonly { key: StrKey; when?: Cond; then?: NodeId; actions?: readonly Action[] }[];
  effects?: readonly Action[];
}

export type ShotCond =
  | 'layer' | 'zoom' | 'dist' | 'size' | 'center' | 'whole' | 'facing' | 'dark'
  | 'occluded' | 'flash' | 'viewpoint' | 'overlay' | 'hidden' | 'contain' | 'still';
export const SHOT_ORDER: readonly ShotCond[] = [
  'layer', 'zoom', 'dist', 'size', 'center', 'whole', 'facing', 'dark',
  'occluded', 'flash', 'viewpoint', 'overlay', 'hidden', 'contain', 'still',
];

export interface PhotoTarget {
  id: TargetId;
  anchor: ChartPos | LocalPos | { npc: NpcId; bone: 'head' } | { world: WorldAnchorId };
  radius: number;
  kind?: 'photo' | 'qr' | 'rephoto' | 'landmark';
  scene?: SceneId;
  onlyFrom?: PeekId;                         // e.g. 'pk_coop', 'lh_door'
  layer?: 'world' | 'ghost';
  needsNight?: boolean;
  zoom?: readonly Zoom[];
  minDist?: number; maxDist?: number; minFrac?: number; frameArea?: number;
  whole?: readonly (ChartPos | LocalPos)[] | { world: WorldAnchorId };   // anchor form = use AnchorInfo.corners
  facing?: { maxAngle: number };
  needsLight?: boolean;
  flash?: 'required' | 'forbidden';
  viewpoint?: { spot: SpotId; posTol: number; yawTol?: number; pitchTol?: number; coneDeg?: number };
  mustBeHidden?: readonly SpotId[];
  mustContain?: readonly TargetId[];
  still?: boolean;
  refPhoto?: PresetPhotoId;
  phases?: readonly Phase[]; requires?: readonly FlagId[]; excludes?: readonly FlagId[];
  labels: readonly { zoom: Zoom; key: StrKey }[];
  okKey?: StrKey; okConfidence?: number; showConfidence?: boolean;
  failKeys?: Partial<Record<ShotCond, StrKey>>;
  onShot?: { tags: readonly string[]; actions?: readonly Action[] };
  special?: 'granny_blink' | 'chai_dual' | 'light_trail';
}
export interface ShotResult {
  frame: 'white' | 'yellow' | 'green';
  targetId: TargetId | null;
  label: string; confidence: number | null;
  failed: ShotCond | null; hint: string | null;
  tags: string[]; overlayScore?: number;
}

export interface PuzzleDef {
  id: PuzzleId; chapter: ChapterId; titleKey: StrKey;
  availableWhen: Cond;
  steps: readonly FlagId[];
  solvedFlag: FlagId;
  targets: readonly TargetId[];
  hints: readonly [StrKey, StrKey, StrKey];
  clockAfter: string;                        // '' = computed (night: +40 min, cap 03:40; GDD §18.6)
}
/** Answers + outcomes for the four input widgets (UI = E, data = F). */
export interface InputDef {
  kind: InputKind;
  answer: readonly string[];                 // one entry per stage; namepicker: ['周远'] (joined picks)
  grid?: readonly string[];                  // namepicker chars (12) · milkbox box ids (24)
  cells?: Readonly<Record<string, StrKey>>;  // milkbox: box id → text key (missing → 'mb.empty')
  failKeys?: readonly StrKey[];              // per stage
  hintAfter?: { stage: number; fails: number; key: StrKey };
  onOk: readonly Action[];
  onFail?: readonly Action[];
}

export interface StoryRule {
  flag: FlagId;
  when: Cond | { event: keyof GameEvents; match?: Readonly<Record<string, unknown>> };
  guard?: Cond;                              // must also hold (replaces GDD's implicit puzzle availableWhen)
  effects: readonly Action[];
}
export interface InteractDef {
  id: InteractId;
  spot: SpotId | ChartPos | LocalPos | { world: WorldAnchorId };
  scene?: SceneId; range?: number;
  prompt: PromptVerb; promptKey?: StrKey;
  when?: Cond;
  priority?: number;                         // default 0; compared before distance (§2.8.6), e.g. it_gantry 10
  peek?: PeekId;                             // live only during this peek; interacts without `peek` are dead during any peek
  node?: NodeId;                             // start this node
  talkAs?: SpeakerId;                        // or: open node selection for this owner (e.g. it_hoarding → 'chai')
  actions?: readonly Action[];               // or: run these (after node, if both)
}
export interface WxDef { id: WxId; sender: 'tudi' | 'studio'; keys: readonly StrKey[]; memo?: 1 | 2 | 3 }
export interface ShowReaction {
  receiver: ReceiverId; tags: readonly string[]; when?: Cond; node: NodeId; actions?: readonly Action[];
}
export interface GateOutcome { node: NodeId; actions?: readonly Action[] }

// ---------- shared content defs (owner of the data file in brackets) ----------
export interface ItemDef { id: ItemId; nameKey: StrKey; descKey: StrKey; icon: 'key' | 'note' | 'negative' | 'dot' | 'envelope' } // [F]
export interface ClueDef { id: ClueId; textKey: StrKey }                                                                      // [F]
export type SmokeRule = { when?: Cond } & ({ spot: SpotId } | { npc: NpcId } | { nearest: readonly SpotId[] });
export interface ObjectiveDef {                                                                                               // [F]
  id: ObjectiveId; textKey: StrKey; smoke: readonly SmokeRule[];   // smoke: first match wins
  hintFor?: PuzzleId | BeatId;                                     // GDD §13 rule 2
}
/** Hint target for the four beats that have hints (GDD §9: S_studio, S_mirror, S_darkroom, S_group_photo). [F] */
export interface BeatHintDef {
  id: BeatId; availableWhen: Cond; steps: readonly FlagId[]; doneFlag: FlagId; hints: readonly [StrKey, StrKey, StrKey];
}
/** Beat metadata [F]: `end` is the state a beat guarantees; quiet runs, skip() and save-recovery run only `end`. */
export interface BeatDef { id: BeatId; end: readonly Action[] }
/** GDD §3.10 signal zones [B]. Highest `prio` among matching zones wins; no match = 1 bar outdoors, 0 in interiors. */
export interface SignalZone {
  bars: 0 | 1 | 2 | 3 | 4; scene: SceneId; prio: number;
  circle?: { at: ChartPos; radius: number };
  ring?: { rMin: number; rMax: number; lonFrom: number; lonTo: number };   // lon range may wrap through 0
  minH?: number;
}
/** GDD §10.3 + ART §5.2 palette preset [A]. Colours are sRGB hex. */
export interface PaletteDef {
  key: PaletteKey; skyBase: string; skyCloud: string; cloudCut: number;
  speck: string | null; speckCut: number; moon: string | null; moonSize: number;
  grade: readonly [number, number, number]; night: boolean;
  ink: string; inkHalo: string | null;
  fog: { color: string; near: number; far: number; max: number } | null;
  lineFade: readonly [number, number, number]; grain: number;
}
/** GDD §8.3 scenery label [D]: 1× / 3× / 10× keys (null = fall back to the lower tier); confidence fixed or hashed 90–99. */
export interface LabelDef { id: LabelId; keys: readonly [StrKey, StrKey | null, StrKey | null]; confidence?: number }
/** GDD §7.2 preset photo metadata [F]; D renders it. */
export interface PresetPhotoDef {
  id: PresetPhotoId; titleKey: StrKey; from: SpotId | null; zoom: Zoom;
  past?: boolean; photoOnly?: boolean; sepia?: boolean; dateStamp?: string; tags: readonly string[];
}
/** GDD §12 fallback line per receiver; first row whose `when` holds wins (zhimei has a before/after-eye pair). [F] */
export interface ShowFallbackRow { receiver: ReceiverId; when?: Cond; node: NodeId }
export interface ChapterDef { id: ChapterId; cardId: string; phase: Phase; palette: PaletteKey; clock: string }               // [F]
export interface ChapterBoot {                                                                                                // [F] ?chapter= state
  flags: readonly FlagId[]; items: readonly ItemId[]; verbs: readonly Verb[]; clues: readonly ClueId[];
  presets: readonly PresetPhotoId[]; phase: Phase; palette: PaletteKey; clock: string; objective: ObjectiveId | null; spot: SpotId;
}
export interface BestiaryDef { id: BestiaryId; nameKey: StrKey; whereKey: StrKey; bodyKey: StrKey; target: TargetId }        // [D]
export interface GateDef { id: GateId; spot: SpotId; openWhen: Cond }                                                        // [B]

export interface Photo {
  id: string; preset?: PresetPhotoId; dataURL: string;
  tags: string[]; label: string; clock: string; zoom: Zoom; night: boolean; flash: boolean;
  keep: boolean;                             // preset or story-tagged: never auto-evicted (GDD §3.13)
  seq: number;                               // capture order
}
export interface GameState {
  version: 1; seed: number;
  chapter: ChapterId; phase: Phase; palette: PaletteKey; clock: string;
  flags: Partial<Record<FlagId, true>>;
  items: ItemId[]; verbs: Verb[]; clues: ClueId[]; bestiary: BestiaryId[];
  photos: Photo[];
  refPhotoId: string | null;
  objective: ObjectiveId | null;
  hint: { target: string | null; tier: 0 | 1 | 2 | 3; idleSince: number; lastSentAt: number };
  zhimeiSpot: 0 | 1 | 2 | 3;
  wxLog: { id: WxId; at: string }[];
  player: { scene: SceneId; spot?: SpotId; pos: [number, number, number]; heading: [number, number, number] };
  cleared: boolean;
}
export interface HasPos { pos: Vector3 }
```

### 2.6 `src/events.ts` (paste verbatim)
```ts
// src/events.ts — owner: S. FROZEN in Phase 1. GDD §18.3 + additions (ARCHITECTURE §2.4).
// A module may add PRIVATE events for itself via declaration merging in its own file:
//   declare module '../events' { interface GameEvents { 'world:debugChunk': { id: number } } }
import type {
  BeatId, BestiaryId, CardKind, ChapterId, ClueId, FaceState, FlagId, GateId, InputKind, ItemId, ModalKind,
  NodeId, ObjectiveId, PaletteKey, PeekId, Phase, Photo, PromptVerb, PuzzleId, ReceiverId, SceneId, Settings,
  ShotCond, ShotResult, SfxId, SpeakerId, SpotId, StrKey, TargetId, UncannyId, Verb, WxId, Zoom,
} from './types';

export interface GameEvents {
  // ---- GDD §18.3 ----
  shutter: { burst: boolean; night: boolean; flash: boolean; zoom: Zoom };
  photoTaken: { photo: Photo; result: ShotResult };
  show: { receiver: ReceiverId; photoIds: string[] };
  puzzleSolved: { id: PuzzleId };
  verbUnlocked: { verb: Verb };
  phaseChanged: { phase: Phase; palette: PaletteKey; chapter: ChapterId; instant: boolean };
  flagSet: { flag: FlagId };
  itemGained: { item: ItemId };
  objectiveChanged: { id: ObjectiveId | null };
  dialogueStart: { node: NodeId };
  dialogueEnd: { node: NodeId };
  wx: { id: WxId };
  hint: { target: string; tier: 1 | 2 | 3 };
  beatStart: { id: BeatId };
  beatEnd: { id: BeatId };
  uncanny: { id: UncannyId };
  enterZone: { spot: string };
  // ---- additions ----
  exitZone: { spot: string };
  itemLost: { item: ItemId };
  clueAdded: { id: ClueId };
  bestiaryAdded: { id: BestiaryId; count: number };
  photoRemoved: { id: string };
  refPhotoChanged: { id: string | null };
  clockChanged: { clock: string };
  stateLoaded: { reason: 'save' | 'chapter' | 'debug' | 'reset' };
  sceneChanged: { from: SceneId; to: SceneId };
  teleported: { scene: SceneId; spot: SpotId | null };
  interact: { id: string };
  promptChanged: { id: string | null; verb: PromptVerb | null; promptKey: StrKey | null };
  viewfinder: { on: boolean };
  lensChanged: { zoom: Zoom; night: boolean; flash: boolean; overlay: boolean; torch: boolean };
  lensHint: { cond: ShotCond | null; target: TargetId | null };
  scanned: { target: TargetId };
  peek: { id: PeekId | null };
  poseChanged: { pose: 'stand' | 'sit' };
  dialogueLine: { node: NodeId; index: number; speaker: SpeakerId; text: string };
  choiceMade: { node: NodeId; index: number };
  cardShown: { kind: CardKind; id: string };
  cardClosed: { kind: CardKind; id: string };
  modal: { kind: ModalKind | null };
  inputResult: { kind: InputKind; ok: boolean; value: string };
  showResult: { receiver: ReceiverId; node: NodeId | null };
  signalChanged: { bars: 0 | 1 | 2 | 3 | 4 };
  faceState: { state: FaceState; animate: boolean };
  gateChanged: { gate: GateId; open: boolean };
  sfx: { id: SfxId; at?: [number, number, number]; vol?: number };
  memo: { n: 1 | 2 | 3 };
  paused: { on: boolean };
  settings: Settings;
  gameStarted: { fromSave: boolean };
  title: { shown: boolean };
}

type Handler<T> = (e: T) => void;
export class Bus {
  private m = new Map<keyof GameEvents, Set<Handler<never>>>();
  on<K extends keyof GameEvents>(k: K, fn: Handler<GameEvents[K]>): () => void {
    const s = this.m.get(k) ?? new Set<Handler<never>>();
    s.add(fn as Handler<never>);
    this.m.set(k, s);
    return () => { s.delete(fn as Handler<never>); };
  }
  once<K extends keyof GameEvents>(k: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(k, (e) => { off(); fn(e); });
    return off;
  }
  emit<K extends keyof GameEvents>(k: K, e: GameEvents[K]): void {
    const s = this.m.get(k);
    if (!s) return;
    for (const fn of [...s]) (fn as Handler<GameEvents[K]>)(e);
  }
}
export const bus = new Bus();
```

### 2.7 `src/contracts.ts` (paste verbatim)
```ts
// src/contracts.ts — owner: S. FROZEN in Phase 1. Every cross-module runtime API lives here.
// A module implements its interface in src/<module>/index.ts:  export const createX: ModuleFactory<XApi> = (core) => {...}
import type {
  ColorRepresentation, MeshToonMaterial, Object3D, PerspectiveCamera, Scene, Side, Texture, Vector3, WebGLRenderer,
} from 'three';
import type { Bus } from './events';
import type {
  Action, ActorLayer, BeatId, BestiaryId, CardKind, ChapterId, ChartPos, ClueId, Cond, FaceState, FlagId,
  GameState, GateId, InputKind, InteractId, ItemId, LocalPos, ModalKind, NodeId, NpcId, ObjectiveId, PaletteKey,
  PeekId, Phase, Photo, PresetPhotoId, PromptVerb, PuzzleId, ReceiverId, SceneId, ShotResult, SfxId, SpeakerId,
  SpotDef, SpotId, StoryRule, StrKey, TargetId, Verb, WorldAnchorId, WxId, Zoom,
} from './types';

// ======================================================================= shared
export type Pos = ChartPos | LocalPos;
export type Vec3Tuple = [number, number, number];
export interface Handle { enabled: boolean; remove(): void }
export interface ModuleApi {
  /** Heavy construction. Runs after fonts are warm, in boot order (§2.1). Never throws for content problems: log.warn. */
  init(): Promise<void>;
  /** Optional dev tooling, called for ?dev=<module>[:arg]. */
  devHook?(arg: string): void;
}
export type ModuleFactory<T extends ModuleApi> = (core: Core) => T;

// ======================================================================= core
export interface UrlParams {
  test: boolean; seed: number; skipTitle: boolean; chapter: ChapterId | null; phase: Phase | null;
  at: SpotId | null; flags: readonly FlagId[]; mute: boolean; lowfx: boolean; dpr: number | null;
  save: boolean; fly: boolean; debug: boolean; dev: string | null;
}
export interface SimClock {
  readonly t: number;      // sim seconds; advances every tick (also while frozen)
  readonly animT: number;  // animation/puzzle-timer seconds; stops while frozen (GDD §19.2 freeze)
  readonly frame: number;
  frozen: boolean;
}
export interface Rng {
  next(): number; range(a: number, b: number): number; int(a: number, bInclusive: number): number;
  pick<T>(arr: readonly T[]): T; fork(label: string): Rng;
}
export interface Log { debug(...a: unknown[]): void; info(...a: unknown[]): void; warn(...a: unknown[]): void }

export type InputAction =
  | 'forward' | 'back' | 'left' | 'right' | 'run' | 'interact' | 'aimHold' | 'aimToggle' | 'shutter'
  | 'zoom1' | 'zoom3' | 'zoom10' | 'zoomIn' | 'zoomOut' | 'night' | 'flash' | 'overlay' | 'show'
  | 'phone' | 'memo' | 'hint' | 'escape' | 'advance' | 'choice1' | 'choice2' | 'choice3' | 'choice4';
export type InputContext = 'title' | 'gameplay' | 'viewfinder' | 'peek' | 'dialog' | 'modal' | 'cutscene';
export interface InputApi {
  move(): { x: number; y: number };               // x strafe right, y forward, |v| ≤ 1 (keys + injected)
  consumeLook(): { dx: number; dy: number };      // px since last call × sensitivity (invertY applied); resets
  pressed(a: InputAction): boolean;               // edge: went down during this tick
  released(a: InputAction): boolean;
  held(a: InputAction): boolean;
  heldFor(a: InputAction): number;                // seconds (sim time)
  context(): InputContext;                        // top of the context stack
  pushContext(c: InputContext, owner: string): () => void;
  inject(o: { move?: { x: number; y: number } | null; look?: { dx: number; dy: number }; press?: readonly InputAction[] }): void;
  requestPointerLock(): void;
}

export type SystemPhase = 'input' | 'logic' | 'player' | 'actors' | 'world' | 'lens' | 'camera' | 'ui' | 'late';
export interface LoopApi {
  addSystem(name: string, phase: SystemPhase, update: (dt: number) => void): () => void;
  /** ?test: run `frames` ticks of `dt`, then render once. Also usable in realtime mode. */
  step(frames: number, dt: number): void;
  /** Run ticks (1/60) covering `seconds` without rendering. Used by burst/night exposure/timers in test mode. */
  advance(seconds: number): void;
  setPaused(p: boolean): void;
  readonly paused: boolean;
}

export interface StoreApi {
  readonly state: Readonly<GameState>;
  has(f: FlagId): boolean;
  set(f: FlagId): boolean;                         // false if already set. Emits flagSet. Never unsets.
  give(i: ItemId): void;                           // also sets the same-named flag if it is a FlagId (GDD §18.2)
  take(i: ItemId): void;
  hasItem(i: ItemId): boolean;
  unlockVerb(v: Verb): void; hasVerb(v: Verb): boolean;
  addClue(c: ClueId): void; addBestiary(b: BestiaryId): void;
  addPhoto(p: Photo): { evicted: Photo | null };   // GDD §3.13 eviction (40 non-keep photos)
  removePhoto(id: string): void; photo(id: string): Photo | null;
  setRefPhoto(id: string | null): void;
  setObjective(id: ObjectiveId | null): void;
  setChapter(o: { chapter: ChapterId; phase: Phase; palette: PaletteKey; clock: string }, instant?: boolean): void;
  setPhase(phase: Phase, palette?: PaletteKey, instant?: boolean): void;
  setClock(clock: string): void;
  setZhimeiSpot(i: 0 | 1 | 2 | 3): void;
  logWx(id: WxId, at: string): void;
  setHint(h: GameState['hint']): void;
  markCleared(): void;
  /** Bulk replace (save load, ?chapter boot, debug). Emits stateLoaded — modules must re-sync visuals. */
  replace(s: GameState, reason: 'save' | 'chapter' | 'debug' | 'reset'): void;
  save(): boolean; load(): boolean; hasSave(): boolean; clearSave(): void;
}

export type ActionKind =
  | 'set' | 'give' | 'take' | 'verb' | 'clue' | 'beat' | 'wx' | 'objective' | 'teleport' | 'chapter'
  | 'photo' | 'memo' | 'uncanny' | 'ui' | 'node' | 'card' | 'sfx' | 'wait' | 'toast' | 'pose' | 'detach' | 'setClock';
export type ActionOf<K extends ActionKind> = Extract<Action, { [P in K]: unknown }>;
export interface ActionCtx { source: string; quiet: boolean }   // quiet: solve()/boot — no cards, beats, waits, typing
export type ActionHandler<K extends ActionKind> = (a: ActionOf<K>, ctx: ActionCtx) => void | Promise<void>;
export interface RulesApi {
  evalCond(c: Cond | undefined): boolean;
  run(actions: readonly Action[], source: string, o?: { quiet?: boolean }): Promise<void>;
  onAction<K extends ActionKind>(kind: K, h: ActionHandler<K>): void;   // one handler per kind (§2.8 table)
  loadStory(rules: readonly StoryRule[]): void;
  pending(): number;                                 // running run() calls (debug busy)
}

export interface SurfaceInfo { scene: SceneId; center: Vector3; radius: number; northRef: 'pole' | 'fixed' }
export interface ScenesApi {
  readonly active: SceneId;
  get(id: SceneId): Scene;                           // main-pass (MRT) scene; FX objects go to render.fxScene(id)
  surface(id: SceneId): SurfaceInfo;
  switchTo(id: SceneId): void;                       // instant; use player.goto for fade + teleport
  /** Planet horizon culling (ART §6.3). detail=true objects also hide when the camera is > 60 m above ground. */
  registerCullable(obj: Object3D, o: { radius: number; height: number; detail?: boolean }): () => void;
}

export interface ColliderDef {
  scene: SceneId;
  shape:
    | { kind: 'circle'; at: Pos; radius: number }
    | { kind: 'box'; at: Pos; headingDeg: number; halfW: number; halfD: number };
  hRange?: readonly [number, number];               // blocks only while player h ∈ range (default [-1, 60])
  tag?: string; enabled?: boolean;
}
export interface WalkSurfaceDef {
  id: string; scene: SceneId;
  /** Height above base ground at flat chart coords (x = r·sin lon, z = r·cos lon; interiors: local x/z), or null outside. */
  heightAt(x: number, z: number): number | null;
}
export interface ZoneDef { id: string; scene: SceneId; at: Pos | SpotId; radius: number; hRange?: readonly [number, number] }
export interface PhysicsApi {
  registerCollider(c: ColliderDef): Handle;
  registerWalkSurface(s: WalkSurfaceDef): Handle;
  registerZone(z: ZoneDef): Handle;                  // emits enterZone/exitZone { spot: z.id }
  heightAt(scene: SceneId, x: number, z: number, currentH: number): number;
  blocked(scene: SceneId, world: Vector3, radius: number): boolean;   // camera boom / debug
}

export type PlayerPose = 'stand' | 'sit';
export interface PlayerApi {
  readonly object: Object3D;          // feet origin, +Z = body facing, +Y = local up. C parents the hero here.
  readonly scene: SceneId;
  readonly pose: PlayerPose;
  pos(out?: Vector3): Vector3;        // feet world position
  up(out?: Vector3): Vector3;
  heading(out?: Vector3): Vector3;    // look/camera heading (tangent)
  facing(out?: Vector3): Vector3;     // body facing (tangent)
  flat(): { x: number; z: number; h: number };
  chart(): ChartPos | LocalPos;
  yawDeg(): number;                   // heading, clockwise from local north
  speed(): number;                    // current ground speed m/s (animation)
  goto(spot: SpotId, o?: { fade?: boolean }): Promise<void>;   // scene switch + actor-offset rule (§2.8)
  teleport(o: { scene?: SceneId; at: Pos; yawDeg?: number; pitchDeg?: number }): void;
  rotateHeading(dYawRad: number): void;
  setYaw(yawDeg: number): void;
  lock(owner: string, on: boolean): void;                 // any active lock → movement input ignored
  setSpeedCap(owner: string, mps: number | null): void;   // lowest active cap wins
  setStrafe(on: boolean): void;                           // facing follows heading (viewfinder)
  setPose(p: PlayerPose, spot?: SpotId): void;            // sit: locked on the spot, eye 1.7, counts as still
}

export type CameraOverride = (camera: PerspectiveCamera, dt: number) => void;
export interface CameraRigApi {
  readonly camera: PerspectiveCamera;
  pitchDeg: number;                                       // follow-mode orbit pitch (−30..+20)
  push(owner: string, fn: CameraOverride): () => void;    // top of stack drives the camera; empty = follow
  top(): string | null;
  setTitleMode(on: boolean): void;                        // ART §6.4 title orbit
  look(yawDeg: number, pitchDeg: number): void;           // absolute, local frame (debug/beats)
  fovTo(deg: number, seconds: number): void;
  snap(): void;                                           // skip damping once (after teleports/cuts)
}

export interface InteractableDef {
  id: string; scene: SceneId;
  at: Pos | (() => Vector3);
  radius?: number;                    // default 2.5
  prompt: PromptVerb; promptKey?: StrKey;
  enabled?: () => boolean;
  priority?: number;                  // tie-break after distance
  ignoreFacing?: boolean;             // skip the ±60° facing cone
  onInteract(): void | Promise<void>;
}
export interface InteractApi {
  registerInteractable(d: InteractableDef): Handle;
  current(): { id: string; prompt: PromptVerb; promptKey: StrKey | null; anchor: Vector3 } | null;
  trigger(): Promise<void>;           // same as pressing E in gameplay context
}

export interface ActorDef {
  id: string;                         // NpcId for NPCs; 'hero' for the protagonist
  scene: SceneId; root: Object3D; head: Object3D; layer: ActorLayer;
  talkRange?: number; talkNeedsNight?: boolean; spirit?: boolean;
  spot?: () => SpotId | null;         // current schedule spot (goto offset rule)
}
export interface ActorsApi {
  register(a: ActorDef): Handle;
  get(id: string): ActorDef | null;
  list(scene?: SceneId): readonly ActorDef[];
}

export interface Core {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;       // #ui overlay (pointer-events: none; children opt in)
  readonly params: UrlParams;
  readonly clock: SimClock;
  readonly rng: Rng;
  readonly log: Log;
  readonly bus: Bus;
  readonly input: InputApi;
  readonly loop: LoopApi;
  readonly store: StoreApi;
  readonly rules: RulesApi;
  readonly scenes: ScenesApi;
  readonly physics: PhysicsApi;
  readonly player: PlayerApi;
  readonly cameraRig: CameraRigApi;
  readonly interact: InteractApi;
  readonly actors: ActorsApi;
  fade(toBlack: boolean, seconds?: number): Promise<void>;   // DOM fade layer; instant in ?test
  readonly services: Services;       // filled before any init(); never call other services inside a factory
}
export interface Services {
  render: RenderApi; audio: AudioApi; world: WorldApi; chars: CharactersApi; lens: LensApi; ui: UiApi; story: StoryApi;
}

// ======================================================================= A · render + audio
export interface ToonOpts {
  color?: ColorRepresentation; vertexColors?: boolean; map?: Texture | null; surfaceId?: number;
  lineWeight?: number; unlit?: boolean; spiritImmune?: boolean; flecks?: boolean; rim?: boolean;
  side?: Side; alphaTest?: number;
}
export type MakeToonMaterial = (o?: ToonOpts) => MeshToonMaterial;
export interface CaptureOpts {
  camera: PerspectiveCamera;          // posed by the caller
  scene?: SceneId;                    // default: active
  width?: number; height?: number;    // default 480×270
  ghost?: boolean;                    // include layer GHOST
  past?: boolean;                     // layers WORLD+PAST, hide userData.hideInPast objects
  photoOnly?: boolean;                // include layer PHOTO_ONLY
  hideTransient?: boolean;            // hide userData.transient objects (night long exposure)
  flash?: { pos: Vector3; radius: number } | null;   // lit band inside radius, no cast shadows there (GDD §3.7)
  palette?: PaletteKey;               // grade override for this capture only
}
export interface LiveView {
  readonly texture: Texture;
  render(camera: PerspectiveCamera, o?: { scene?: SceneId; ghost?: boolean }): void;
  dispose(): void;
}
export interface LampHandle { setOn(on: boolean): void; remove(): void }
export interface RenderApi extends ModuleApi {
  frame(dt: number): void;                                          // shadow → MRT → composite → FX, to canvas
  capture(o: CaptureOpts): HTMLCanvasElement;                       // same pipeline, sRGB bytes, top-left origin
  createLiveView(size: number): LiveView;
  fxScene(id: SceneId): Scene;
  setPalette(key: PaletteKey, seconds?: number): void;             // also driven by phaseChanged
  setViewfinder(o: { on: boolean; night: boolean; negative?: boolean }): void;
  registerLamp(o: { scene: SceneId; pos: Vector3; radius: number; on?: boolean }): LampHandle;
  setSmoke(path: { from: Vector3; to: Vector3 } | null): void;     // 土地的烟 (GDD §3.12)
  compile(): Promise<void>;
  stats(): { calls: number; triangles: number; programs: number }; // last full frame
  uncanny(): number;                                               // current raw uUncanny (debug/state)
  timeRender(frames: number): number;                              // ms/frame incl. GPU flush
  snapshot(): string;                                              // PNG dataURL of a fresh frame
}
export interface AudioApi extends ModuleApi {
  unlock(): Promise<void>;
  play(id: SfxId, o?: { at?: Vector3; vol?: number }): void;
  setMuted(m: boolean): void;
  setVolume(v: number): void;
}

// ======================================================================= B · world
export interface AnchorInfo {
  scene: SceneId; pos: Vector3;
  normal?: Vector3; radius?: number; corners?: readonly Vector3[];
  object?: Object3D;                  // live object (e.g. fish7, tripod_head mount)
  canvas?: HTMLCanvasElement;         // trail_plane: the 「1987」 stroke canvas (same aspect as the plane)
}
export interface WorldApi extends ModuleApi {
  spot(id: SpotId): SpotDef;                                  // resolved; † spots are final after init()
  spotPos(id: SpotId, out?: Vector3): Vector3;                // world position incl. h
  anchor(id: WorldAnchorId): AnchorInfo;
  signalAt(scene: SceneId, pos: Vector3): 0 | 1 | 2 | 3 | 4;  // GDD §3.10
  occluders(scene: SceneId): readonly Object3D[];             // coarse proxies NOT in the scene graph (shot rays)
  pickables(scene: SceneId): readonly Object3D[];             // meshes carrying label tables (§2.3)
  gateOpen(g: GateId): boolean;
  setMirrorTexture(tex: Texture | null): void;               // convex mirror face (D's LiveView)
}

// ======================================================================= C · characters
export type HeroExpr = 'calm' | 'happy' | 'puzzled' | 'surprised' | 'scared' | 'thinking' | 'found';
export type HeroScreen = 'status' | 'rec' | 'typing' | 'show' | 'ridecode' | 'static';
export interface HeroApi {
  readonly root: Object3D;            // child of core.player.object
  readonly head: Object3D;            // phone-head group (reparented while detached)
  lensPos(out: Vector3): Vector3;     // world lens position (head height 1.72, +0.05 forward; follows detach)
  setFirstPerson(on: boolean): void;  // hide head meshes for the main camera (viewfinder)
  setExpression(e: HeroExpr): void;
  flashFace(kind: 'stranger' | 'self'): void;                  // 0.5 s signature face (M_wake_face / M_mirror_face)
  setScreen(mode: HeroScreen, o?: { text?: string; photoIds?: readonly string[]; seconds?: number }): void;
  detachHead(mount: Object3D | null): Promise<void>;           // 0.4 s; null = reattach
  setTorch(on: boolean): void;
  play(anim: 'wake' | 'sit' | 'stand' | 'turn_back' | 'idle'): Promise<void>;
}
export interface NpcHandle {
  readonly id: NpcId; readonly root: Object3D; readonly head: Object3D;
  setSpot(spot: SpotId | null): void;   // null = follow schedule again
  lookAt(target: Vector3 | null): void;
  startBlink(epoch: number): void;      // granny: closed while ((animT − epoch) mod 0.8) ≥ 0.48 (GDD P3)
  eyesClosed(): boolean;
  play(anim: string): Promise<void>;
}
export interface CharactersApi extends ModuleApi {
  readonly hero: HeroApi;
  npc(id: NpcId): NpcHandle | null;
  faceState(): FaceState;
  faceTexture(seed: number): Texture;   // old-photo face decal that follows faceState (portrait wall, 2006 crowd)
  readonly busZero: { readonly root: Object3D; arrive(seconds: number): Promise<void>; depart(seconds: number): Promise<void> };
}

// ======================================================================= D · lens
export interface LensState {
  active: boolean; zoom: Zoom; night: boolean; flash: boolean; overlay: boolean; torch: boolean;
  peek: PeekId | null; exposing: boolean; frame: 'white' | 'yellow' | 'green';
}
export interface LensApi extends ModuleApi {
  readonly state: Readonly<LensState>;
  setViewfinder(on: boolean): void;
  setZoom(z: Zoom): void;
  setLens(o: { night?: boolean; flash?: boolean; overlay?: boolean; torch?: boolean }): void;
  /** Opens the viewfinder if needed, then points the lens along the normalised mean of the unit directions to the
   *  anchor, every `whole` point and every `mustContain` anchor (never `mustBeHidden`); P8 fallback per GDD §19.3. */
  aim(target: TargetId): void;
  evalNow(): ShotResult;                          // the same evalShot the frame colour uses
  shoot(o?: { burst?: boolean }): ShotResult;     // synchronous; advances sim time for still/burst
  enterPeek(id: PeekId): Promise<void>;           // teleports to the peek spot first
  exitPeek(): Promise<void>;
  startTripodTimer(): void;
  renderPreset(id: PresetPhotoId): Promise<Photo>; // builds + stores (or refreshes) a preset photo
  darkroomReveal(): Promise<void>;                // resolves when the stitched positive has appeared (S_darkroom)
  lastPhotoId(): string | null;
  isNightView(): boolean;                         // Cond.lens === 'night'
}

// ======================================================================= E · ui
export interface UiApi extends ModuleApi {
  showTitle(): void;
  hideTitle(): void;
  talk(owner: SpeakerId | ReceiverId | InteractId): Promise<void>;   // pick the best node (GDD §11.0) and play it
  startNode(node: NodeId): Promise<void>;
  advance(n?: number): void;         // complete/next line; with only the fixed options left = 「再见」
  choose(i: number): void;
  currentLine(): { speaker: SpeakerId; text: string } | null;
  choiceCount(): number;             // visible node-specific choices (fixed options excluded)
  showCard(kind: CardKind, id: string): Promise<void>;
  skip(): boolean;                   // skip typewriter/card/photo card/credits; true if something was skipped
  pushWx(id: WxId, o?: { quiet?: boolean }): Promise<void>;
  openPhone(tab?: 'album' | 'wx' | 'memo'): void;
  closeAll(): void;
  openInput(kind: InputKind): Promise<void>;
  submitInput(kind: InputKind, value: string | readonly string[]): void;
  openShow(receiver: ReceiverId): Promise<void>;
  show(receiver: ReceiverId, photoIds: readonly string[]): Promise<void>;
  toast(key: StrKey, vars?: Readonly<Record<string, string | number>>): void;
  requestHint(): void;
  busy(): { dialogue: boolean; card: boolean; modal: ModalKind | null };
}

// ======================================================================= F · story
export interface StoryApi extends ModuleApi {
  startGame(o: { skipIntro: boolean }): Promise<void>;   // 「开机」 / ?skipTitle
  continueGame(): Promise<void>;                         // 「继续」
  playBeat(id: BeatId): Promise<void>;                   // FIFO; one beat at a time
  currentBeat(): BeatId | null;
  skip(): boolean;
  bootChapter(c: ChapterId): void;                       // ?chapter= / __game.setChapter (quiet, emits stateLoaded)
  solve(p: PuzzleId): void;                              // quiet: step flags + solved flag + story effects
  smokeTarget(): SpotId | null;                          // GDD §10.6 for the current objective
}

// ======================================================================= debug (window.__game)
export interface DebugState {
  chapter: ChapterId; phase: Phase; palette: PaletteKey; clock: string;
  flags: FlagId[]; items: ItemId[]; verbs: Verb[]; clues: ClueId[]; objective: ObjectiveId | null;
  scene: SceneId; pos: Vec3Tuple; chart: ChartPos | LocalPos; heading: Vec3Tuple; yaw: number;
  dialogue: { speaker: SpeakerId; text: string } | null; choices: number;
  prompt: { id: string; verb: PromptVerb } | null;
  busy: { any: boolean; dialogue: boolean; card: boolean; beat: BeatId | null; modal: ModalKind | null; actions: number };
  photos: { id: string; tags: string[]; label: string }[];
  lens: LensState;
  /** Every registered actor (hero excluded): lets smoke checks assert NPC placement (GDD §19.4 dawn_group). */
  actors: { id: string; scene: SceneId; pos: Vec3Tuple; spot: SpotId | null; layer: ActorLayer; visible: boolean }[];
  faceState: FaceState; uncanny: number;
  calls: number; triangles: number; programs: number; frame: number; t: number;
}
export interface GameDebug {
  ready: boolean;
  step(frames?: number, dt?: number, input?: { x: number; y: number } | null): DebugState;
  freeze(on?: boolean): void;
  pause(on?: boolean): void;
  goto(spot: SpotId): void;
  teleport(latOrPlace: number | string, lon?: number, headingDeg?: number): void;
  skip(): void;
  setPhase(p: Phase): void;
  setChapter(c: ChapterId): void;
  grant(id: string): void;
  setFlag(id: string): void;
  solve(p: PuzzleId): void;
  look(yawDeg: number, pitchDeg: number): void;
  aim(target: TargetId): void;
  viewfinder(on: boolean): void;
  setPhoneMode(on: boolean): void;
  zoom(z: Zoom): void;
  lens(o: { night?: boolean; flash?: boolean; overlay?: boolean }): void;
  setRef(photoId: string): void;
  shoot(o?: { burst?: boolean }): ShotResult;
  evalShot(): ShotResult;
  interact(): void;
  talk(npc: NpcId): void;
  advance(n?: number): void;
  choose(i: number): void;
  show(receiver: ReceiverId, photoIds: string[]): void;
  input(ui: InputKind, value: string | string[]): void;
  detach(peek: PeekId): void;
  reattach(): void;
  lastPhotoId(): string | null;
  freeCam(o: { at: Pos | Vec3Tuple; lookAt: Pos | Vec3Tuple } | null): void;
  state(): DebugState;
  getState(): DebugState;
  snapshot(): string;
  timeRender(n?: number): number;
}
```

### 2.8 Core files (S implements them fully, with vitest)

#### 2.8.1 `core/planet.ts` (paste verbatim; the only encoding of GDD §0.2)
```ts
// src/core/planet.ts — owner: S. FROZEN. The only place that encodes the coordinate conventions (GDD §0.2).
import { BufferAttribute, Matrix4, Quaternion, Vector3, type BufferGeometry, type Object3D } from 'three';
import type { SurfaceInfo } from '../contracts';
import type { ChartPos, LocalPos, SceneId } from '../types';

export const PLANET_R = 80;
export const PLANET_CENTER: Readonly<Vector3> = new Vector3(0, 0, 0);
export const INTERIOR_R = 5000;
export const INTERIOR_CENTER: Readonly<Vector3> = new Vector3(0, -INTERIOR_R, 0);
export const DEG = Math.PI / 180;
export const SURFACES: Readonly<Record<SceneId, SurfaceInfo>> = {
  planet: { scene: 'planet', center: PLANET_CENTER as Vector3, radius: PLANET_R, northRef: 'pole' },
  studio_int: { scene: 'studio_int', center: INTERIOR_CENTER as Vector3, radius: INTERIOR_R, northRef: 'fixed' },
  subway_int: { scene: 'subway_int', center: INTERIOR_CENTER as Vector3, radius: INTERIOR_R, northRef: 'fixed' },
};
const POLE = new Vector3(0, 1, 0), E1 = new Vector3(1, 0, 0), E2 = new Vector3(0, 0, 1), NEG_Z = new Vector3(0, 0, -1);
const _a = new Vector3(), _b = new Vector3(), _m = new Matrix4();

/** Flat chart coords: x = r·sin(lon), z = r·cos(lon) (planet); interiors: LocalPos x/z. h = height above base ground. */
export interface Flat { x: number; z: number; h: number }
export function isChart(p: ChartPos | LocalPos): p is ChartPos { return 'r' in p; }
export function chartToFlat(p: ChartPos): Flat {
  const l = p.lon * DEG;
  return { x: p.r * Math.sin(l), z: p.r * Math.cos(l), h: p.h ?? 0 };
}
export function flatToChart(f: Flat): ChartPos {
  const lon = ((Math.atan2(f.x, f.z) / DEG) + 360) % 360;
  return { r: Math.hypot(f.x, f.z), lon, h: f.h };
}
export function toFlat(p: ChartPos | LocalPos): Flat { return isChart(p) ? chartToFlat(p) : { x: p.x, z: p.z, h: p.y }; }

/** Exponential map at the surface's +Y pole (ART §6.2 chartToWorld with n=+Y, e1=+X, e2=+Z). */
export function flatToWorld(s: SurfaceInfo, f: Flat, out = new Vector3()): Vector3 {
  const r = Math.hypot(f.x, f.z), k = s.radius + f.h;
  if (r < 1e-9) return out.copy(POLE).multiplyScalar(k).add(s.center);
  const th = r / s.radius, sn = Math.sin(th) / r;
  return out.copy(POLE).multiplyScalar(Math.cos(th)).addScaledVector(E1, sn * f.x).addScaledVector(E2, sn * f.z)
    .multiplyScalar(k).add(s.center);
}
export function worldToFlat(s: SurfaceInfo, v: Vector3): Flat {
  const d = _a.copy(v).sub(s.center), len = d.length();
  d.divideScalar(len);
  const th = Math.acos(Math.min(1, Math.max(-1, d.y)));
  const t = Math.hypot(d.x, d.z);
  const r = th * s.radius;
  return t < 1e-12 ? { x: 0, z: 0, h: len - s.radius } : { x: (d.x / t) * r, z: (d.z / t) * r, h: len - s.radius };
}
export function chartToWorld(p: ChartPos, out = new Vector3()): Vector3 { return flatToWorld(SURFACES.planet, chartToFlat(p), out); }
export function posToWorld(scene: SceneId, p: ChartPos | LocalPos, out = new Vector3()): Vector3 {
  return flatToWorld(SURFACES[scene], toFlat(p), out);
}
/** lat 0 = equator, lat 90 = town pole (+Y); lon 0 = +Z, increasing toward +X (TECH dirFromLatLon). Degrees. */
export function latLonToDir(latDeg: number, lonDeg: number, out = new Vector3()): Vector3 {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return out.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}
export function latLonToWorld(latDeg: number, lonDeg: number, altitude = 0, out = new Vector3()): Vector3 {
  return latLonToDir(latDeg, lonDeg, out).multiplyScalar(PLANET_R + altitude).add(PLANET_CENTER);
}
export function worldToLatLon(v: Vector3): { lat: number; lon: number; alt: number } {
  const d = _a.copy(v).sub(PLANET_CENTER), len = d.length();
  return { lat: Math.asin(Math.min(1, Math.max(-1, d.y / len))) / DEG, lon: ((Math.atan2(d.x, d.z) / DEG) + 360) % 360, alt: len - PLANET_R };
}
/** GDD §0.2: lat = 90° − r·(180/π)/R  (= 90 − r·0.716197° at R = 80). */
export function chartToLatLon(p: ChartPos): { lat: number; lon: number } { return { lat: 90 - (p.r / PLANET_R) / DEG, lon: p.lon }; }

export interface SurfaceFrame { up: Vector3; north: Vector3; east: Vector3 }
/** north: planet → toward the +Y pole (toward the banyan; −Z at the pole itself); interiors → fixed −Z. east = north × up. */
export function frameAt(s: SurfaceInfo, pos: Vector3, out: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() }): SurfaceFrame {
  out.up.copy(pos).sub(s.center).normalize();
  const ref = s.northRef === 'pole' ? POLE : NEG_Z;
  out.north.copy(ref).addScaledVector(out.up, -ref.dot(out.up));
  if (out.north.lengthSq() < 1e-10) out.north.copy(NEG_Z).addScaledVector(out.up, -NEG_Z.dot(out.up));
  out.north.normalize();
  out.east.crossVectors(out.north, out.up).normalize();
  return out;
}
/** Heading/yaw: degrees clockwise from local north seen from outside (0 = uphill/north, 90 = east = lon increasing, 180 = seaward). */
export function headingToDir(f: SurfaceFrame, headingDeg: number, out = new Vector3()): Vector3 {
  const h = headingDeg * DEG;
  return out.copy(f.north).multiplyScalar(Math.cos(h)).addScaledVector(f.east, Math.sin(h));
}
export function dirToHeading(f: SurfaceFrame, dir: Vector3): number {
  return ((Math.atan2(dir.dot(f.east), dir.dot(f.north)) / DEG) + 360) % 360;
}
/** Model authored Y-up facing +Z → basis (right = up × fwd, up, fwd). */
export function orientationFromUpForward(up: Vector3, forward: Vector3, out = new Quaternion()): Quaternion {
  const f = _b.copy(forward).addScaledVector(up, -forward.dot(up)).normalize();
  const right = _a.crossVectors(up, f).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(right, up, f));
}
const _fr: SurfaceFrame = { up: new Vector3(), north: new Vector3(), east: new Vector3() };
const _dir = new Vector3();
export function placeMatrix(scene: SceneId, p: ChartPos | LocalPos, headingDeg = 0, out = new Matrix4(), scale = 1): Matrix4 {
  const pos = posToWorld(scene, p, new Vector3());
  frameAt(SURFACES[scene], pos, _fr);
  const q = orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir));
  return out.compose(pos, q, new Vector3(scale, scale, scale));
}
export function placeAt(obj: Object3D, scene: SceneId, p: ChartPos | LocalPos, headingDeg = 0): Object3D {
  posToWorld(scene, p, obj.position);
  frameAt(SURFACES[scene], obj.position, _fr);
  orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir), obj.quaternion);
  return obj;
}
/** Task-brief signature: planet only; altitude = height above ground. */
export function placeOnSphere(obj: Object3D, latDeg: number, lonDeg: number, headingDeg = 0, altitude = 0): Object3D {
  latLonToWorld(latDeg, lonDeg, altitude, obj.position);
  frameAt(SURFACES.planet, obj.position, _fr);
  orientationFromUpForward(_fr.up, headingToDir(_fr, headingDeg, _dir), obj.quaternion);
  return obj;
}
/** Heading of a flat-chart direction (dx, dz) at flat point (x, z) on the planet chart. */
export function flatDirToHeading(x: number, z: number, dx: number, dz: number): number {
  const r = Math.hypot(x, z);
  if (r < 1e-9) return ((Math.atan2(dx, -dz) / DEG) + 360) % 360;   // at the pole north = −Z, east = +X
  const nx = -x / r, nz = -z / r, ex = z / r, ez = -x / r;
  return ((Math.atan2(dx * ex + dz * ez, dx * nx + dz * nz) / DEG) + 360) % 360;
}
/** Wrap flat-authored geometry (x, y = height, z) onto the surface per vertex; normals rotated by the minimal rotation. */
export function wrapGeometry(geo: BufferGeometry, scene: SceneId = 'planet'): BufferGeometry {
  const s = SURFACES[scene], pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const q = new Quaternion(), v = new Vector3(), n = new Vector3(), up = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const f = { x: pos.getX(i), h: pos.getY(i), z: pos.getZ(i) };
    flatToWorld(s, f, v);
    up.copy(flatToWorld(s, { x: f.x, z: f.z, h: 0 }, up)).sub(s.center).normalize();
    pos.setXYZ(i, v.x, v.y, v.z);
    if (nor) { q.setFromUnitVectors(POLE, up); n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyQuaternion(q); nor.setXYZ(i, n.x, n.y, n.z); }
  }
  (pos as BufferAttribute).needsUpdate = true;
  if (nor) (nor as BufferAttribute).needsUpdate = true;
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
export function arcDistance(a: Vector3, b: Vector3, s: SurfaceInfo = SURFACES.planet): number {
  const da = _a.copy(a).sub(s.center).normalize(), db = _b.copy(b).sub(s.center).normalize();
  return Math.acos(Math.min(1, Math.max(-1, da.dot(db)))) * s.radius;
}
/** ART §6.3 horizon test. a = arc distance, b = bound radius, H = object height, hCam = camera height above ground. */
export function horizonVisible(arc: number, bound: number, height: number, hCam: number, R = PLANET_R): boolean {
  return arc - bound < Math.sqrt(2 * R * Math.max(0, hCam + 0.5)) + Math.sqrt(2 * R * Math.max(0, height)) + 5;
}
```
Tests must assert the facts in §2.3:
- `chartToLatLon({r:38.5, lon:0}).lat ≈ 62.43`;
- at lon 0, east = +X; at lon 90, east = −Z;
- a model placed with heading 90 faces heading 90;
- at the pole, north = −Z;
- in interiors, north = −Z;
- `latLonToWorld ∘ chartToLatLon` is the identity.

#### 2.8.2 `core/sphere.ts`
Port TECH §3 (walker, `logMap`/`expMap`, collision) and generalise it to `SurfaceInfo`: subtract the surface center and take the radius from the surface. Keep TECH's parallel transport. The player radius is 0.35 m. Tests: TECH's 12 cases, plus interior flatness and `hRange` filtering.

#### 2.8.3 `core/physics.ts`
- **Colliders:** circles and boxes, tested in the collider's log-map chart (TECH `resolveCollider`). Filter by scene, `enabled`, and `hRange` against the player's h. Run 2 iterations.
- **Walk surfaces:** `heightAt(scene, x, z, curH)` returns the maximum of `{base 0}` ∪ `{s.heightAt(x, z) ≤ curH + 0.45}`.
  - If the result is more than 0.05 m below `curH`, the player descends at 8 m/s. There is no jumping and no fall damage.
  - This supports multiple levels: the road under the bridge stays at h 0 while the stairs and deck rise continuously (GDD §5.6).
- **Zones:** enter/exit edge detection for the player on every tick. They emit `enterZone` / `exitZone` with `spot = id`. `at` may be a SpotId, resolved through `world.spot`.
- **`blocked()`** for the camera boom: a point-in-collider test.

#### 2.8.4 `core/player.ts`
The player module owns the `SphereWalker`, pose, locks and speed.
- **Speeds:** walk 3.2 m/s, run 5.5 m/s (Shift). `setSpeedCap` applies caps; D sets 1.2 m/s in the viewfinder.
- **Movement** is relative to `heading`. Facing turns toward the motion at 12/s, or follows the heading in strafe mode.
- Emits `teleported` and `sceneChanged`.

**`goto(spot)`:**
1. Resolve `world.spot(spot)` → scene, pos, yaw, pitch.
2. If the spot is in another scene: `fade(true, 0.25)` (skipped in test) → `scenes.switchTo` → teleport → `fade(false, 0.25)`. With `{fade:false}`, or in `?test`, all of `goto` completes **synchronously**: the returned promise is already resolved, so the next `step()` sees the new position.
3. **Actor rule:** if an actor's `spot()` equals the target spot, stand `approachDist` (default 1.8 m) away from that actor:
   - `approach 'front'` (the default): in front of the actor, facing it;
   - `approach 'behind'`: behind the actor, looking the way it looks. B sets this (with `approachDist: 3.0`) for `sp_seawall_zhimei` so that she, the sea and the lighthouse share one frame.
   - This makes the GDD §19.3 calls `goto('sp_store_front'); talk('granny_wang'); aim('T_granny_face')` work.
   - **Object rule:** otherwise, if the spot has `stand`, teleport to `stand` and face `pos` (GDD §0.2). Without this, `goto('sp_donation_box')` would put the player inside the box, and the QR would sit below the −60° viewfinder pitch limit.
4. While D's tripod peek is active, move the headless body instead of the camera.
5. Reset the pose to `stand`. Call `cameraRig.look(yaw, pitch ?? 0)` and `cameraRig.snap()`; the viewfinder, when opened next, starts from this yaw/pitch.
6. D listens to `teleported` and leaves the viewfinder and any peek, except for teleports D started itself.

**Safety clamp:** after collisions, the planet player is clamped to r ≤ 71 m (flat chart) and h ≥ 0; if it is still inside a collider after the 2 iterations, it snaps to the nearest registered spot on the same scene (logged with `log.warn`). §6 risk 12.

**`setPose('sit')`:** locks the player, sets the eye height to 1.7 and counts as fully still for D. Any movement input or Esc makes the player stand up. The bench uses `[{teleport:'sp_bench'}, {pose:'sit'}]`.

#### 2.8.5 `core/cameraRig.ts`
**Follow camera** (ART §6.4)
- vFOV 50°, 3.6 m behind, eye height 1.5 m, 0.5 m right shoulder.
- Looks at `+up·1.5 + fwd·6`. Set `camera.up` to the local up before every `lookAt`.
- Pitch −30..+20°. The boom lowers to 0.9 m when pitching up.
- Critically damped follow, ω ≈ 8/s. The boom pulls in when `physics.blocked`.
- Near 0.1, far 250.

**Override stack** (`push`): D uses it for the viewfinder and peeks, E for the dialogue camera, F for beats.

**Title mode:** the ART §6.4 title orbit: vFOV 30°, 460 m out, near 250, far 600, and φ += 0.05 rad per second of `animT`.

**`?fly`:** a free camera (WASD + mouse, Q/E for down/up), pushed as override `'fly'`.

#### 2.8.6 `core/interact.ts`
On every tick in the `gameplay` context:
1. Among enabled interactables within their `radius` and within ±60° of the body facing (TECH `pickInteractable`), pick the **highest `priority`** first, then the lowest `d·(2−cos)`. (Priority first is what lets `it_gantry` win over the attendant standing 1.5 m away; GDD P7.)
2. Emit `promptChanged` when the pick changes.
3. The `interact` action (E) calls `onInteract()` and emits the `interact` event.

Night-viewfinder E presses and peek E presses belong to D, not to this system. D's `lh_door` peek calls `interact.trigger()`; F's `enabled()` makes peek-bound interacts (`InteractDef.peek`) the only live ones during a peek, so the second E at the lighthouse hits `it_lh_switch`, not `it_lh_door` again.

#### 2.8.7 `core/actors.ts`, `core/scenes.ts`, `core/fade.ts`
- **`actors.ts`:** the actor registry (§2.7).
- **`scenes.ts`:** three Scenes.
  - Each tick, applies ART §6.3 horizon culling to planet cullables. `detail` objects are also hidden while the camera is more than 60 m above the ground, **and whenever they are more than 45 m of arc from the camera** (cheap LOD: from the roof or the bridge deck almost the whole town is above the horizon; §5.1).
  - While `scenes.active !== 'planet'`, the planet's heavy updates in B and C are skipped.
- **`fade.ts`:** the black `#fade` div. It resolves on sim time and is instant in `?test`.

#### 2.8.8 `core/input.ts`
Key map (GDD §4). One key can emit several actions; consumers decide by `input.context()`.

| Key | Actions emitted |
|---|---|
| W / A / S / D | forward / left / back / right |
| Shift | run |
| E | interact, advance |
| Space | shutter, advance |
| Left mouse | shutter, advance (requests pointer lock if not locked) |
| Right mouse | aimHold |
| F | aimToggle |
| Wheel up / down | zoomIn / zoomOut |
| 1 / 2 / 3 / 4 | zoom1 / zoom3 / zoom10 (1–3), plus choice1…choice4 |
| N / Q / R / G | night / flash / overlay / show |
| Tab / J / H | phone / memo / hint |
| Esc | escape |

| Context | Consumer |
|---|---|
| `gameplay` | core player + interact |
| `viewfinder`, `peek` | D |
| `dialog`, `modal`, `title` | E |
| `cutscene` | F (movement locked) |

- **Mouse look:** whoever drives the camera calls `consumeLook()`: the rig in follow mode, D in the viewfinder and peeks.
- Sensitivity and invert-Y come from the `settings` event.
- `inject()` feeds debug/test input for the tick(s) it is called for; `step(n, dt, input)` injects on every tick.
- Touch controls are optional (E) and inject through the same API.

#### 2.8.9 `core/state.ts`, `core/save.ts`, `core/rules.ts`
**Store**
- Holds the GDD §18.2 `GameState` with `version: 1`.
- `give(item)` also sets the same-named flag when one exists (`key_rooftop`, `frame_1..4`).
- `addPhoto` enforces GDD §3.13: at most 40 photos with `keep=false`. It evicts the non-keep photo with the lowest `seq` and emits `photoRemoved` (E then toasts `ui.toast.photoFull`).

**Save**
- Writes `localStorage['cmm.save.v1']` after flag changes (debounced by 1 s of sim time) and on `phaseChanged`. Wrap every access in try/catch.
- **Never saves mid-presentation:** a due save waits while `story.currentBeat() !== null`, `ui.busy().card`, or `rules.pending() > 0`, then writes once they clear. A save therefore always lands in a player-controlled state (no reload into half of `S_sunset` with `P5_done` set but `ch3_started` missing).
- `credits_done` replaces the save with a fresh state whose only meaningful field is `cleared: true`; `hasSave()` is false for such a state, so 「继续」 hides (GDD §10.2 #49).
- On a quota error: drop the oldest non-keep photos and retry, then save without photos (GDD §20.2 #9).
- `?test` uses in-memory storage unless `?save=1` is set.
- Settings live in `cmm.settings.v1` (owned by E).

**Rules engine**
- **`evalCond`** is an AND over every field:
  - `tags`: some album photo has one of the tags;
  - `lens:'night'`: `services.lens.isNightView()`;
  - `scene`: the active scene.
- **`loadStory(rules)`**: F calls it once.
  - **Event rules** subscribe to their event and fire when every `match` key equals the payload value.
  - **Condition rules** are re-evaluated after `flagSet`, `itemGained`, `phaseChanged`, `photoTaken`, `sceneChanged`, `bestiaryAdded` and `stateLoaded`. Evaluation walks the table in order and repeats until nothing changes (at most 64 passes).
  - A rule fires only once, and only while its flag is unset and its `guard` holds. Firing calls `store.set(flag)`, then `run(effects)`.
- **`run(actions, source, {quiet})`** executes the actions in order and awaits handlers that return promises. It runs **synchronously up to the first handler that returns a promise** (no leading `await`). State changes from `set`, `give` and the like are therefore visible as soon as `run()` (and so `shoot()` or `submitInput()`) returns.
  - Separate `run` calls may interleave. E and F each serialise their own cards, dialogues and beats (FIFO).
  - In quiet mode, handlers skip presentation (cards, beats, waits, typing, sfx) but still apply state.
- **When a handler's promise resolves:**
  - `card`, `node`, `beat`, `wait`, `memo`: when the presentation ends;
  - `ui`: when the modal closes;
  - `photo`: when the preset is stored;
  - `wx` and `toast`: immediately. E queues them, so they never block.

**Handler ownership** (one handler per kind, registered in `init()`)
| Kinds | Handler |
|---|---|
| `set` `give` `take` `verb` `clue` `objective` `setClock` `teleport` `chapter` `pose` `wait` | core |
| `sfx` `uncanny` | core, which re-emits them on the bus (A, B and C listen) |
| `ui` `card` `node` `wx` `memo` `toast` | E (`ui:'timer'` is delegated to `lens.startTripodTimer()`) |
| `photo` `detach` | D |
| `beat` | F |

#### 2.8.10 `core/geom.ts`, `core/layers.ts`
- `paint(geo, hex, surfaceId, labelId?)`: TECH §2.3, writing the attribute `aSurfaceId` (ART naming).
- `mergePainted(geos)`: normalises indexed and non-indexed inputs, drops `uv` unless every input has it, builds `triLabels` / `labelTable`, and returns one BufferGeometry.
- `labelOfHit(hit)`.
- `contactBand(geo, height = 0.3, k = 0.88)`: the baked darkening from ART §3.1.
- `layers.ts`: layer and surface-id constants, plus `setLayerDeep`.

#### 2.8.11 `core/fonts.ts`, `core/canvas.ts`
- **Font stacks** from ART §8.3: `FONT.display`, `.body`, `.hand`, `.brush`, `.hud`, `.sign`.
- **`warmFonts()`** races the loads below against `sleep(3000)`:
  - `document.fonts.load('26px "ZCOOL KuaiLe"', allText())`
  - `load('132px "ZCOOL QingKe HuangYou"', titleText)`
  - `load('64px "Ma Shan Zheng"', cardText)`
  - `load('16px Silkscreen', '0123456789:%×RECISOF.')`
- **`ensureFont(font, text)`.**
- **Canvas helpers:**
  - `makeCanvasTexture(w, h, draw)` (sRGB);
  - `inkStroke(ctx, pts, width, jitterPx)`: ART §4.5, 2–3 px strokes with ±0.5 px jitter;
  - `fitText`, `verticalText`;
  - `signTexture(opts)` (TECH §5).

#### 2.8.12 `core/params.ts`, `core/rng.ts`, `core/log.ts`, `core/services.ts`
- **`rng.ts`:** mulberry32, with `fork` keyed by a hash of the label.
- **`log.ts`:** `warn` → `console.warn`; `debug` prints only with `?debug`. There is **no `error`**: a `console.error` is a bug, and the smoke test fails on it.

#### 2.8.13 `src/data/zh.ts` barrel (paste verbatim)
```ts
// src/data/zh.ts — owner: S. FROZEN barrel. Section files are owned per §1.4; prefixes must not collide.
import { STR as UI } from './zh/ui';
import { STR as LENS } from './zh/lens';
import { STR as WORLD } from './zh/world';
import { STR as CHARS } from './zh/chars';
import { STR as STORY } from './zh/story';
import type { StrKey } from '../types';
export { DLG } from './zh/dlg';
export { WX_TEXT } from './zh/wx';
export { CARDS, EPILOGUE, CREDITS } from './zh/cards';

export const STR: Readonly<Record<string, string>> = { ...UI, ...LENS, ...WORLD, ...CHARS, ...STORY };
const missing = new Set<string>();
/** Resolve a key; `{name}`-style vars are substituted. Missing → '⟦key⟧' + one console.warn. */
export function t(key: StrKey, vars?: Readonly<Record<string, string | number>>): string {
  const raw = STR[key];
  if (raw === undefined) {
    if (!missing.has(key)) { missing.add(key); console.warn(`[zh] missing key ${key}`); }
    return `⟦${key}⟧`;
  }
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
export function has(key: StrKey): boolean { return STR[key] !== undefined; }
```
Section file shapes:
| File | Export |
|---|---|
| `zh/<section>.ts` | `STR: Readonly<Record<string, string>>`, using only the section's own key prefixes |
| `zh/dlg.ts` | `DLG: Readonly<Partial<Record<NodeId, ReadonlyArray<readonly [SpeakerId, string]>>>>` |
| `zh/wx.ts` | `WX_TEXT: Readonly<Partial<Record<WxId, readonly string[]>>>` |
| `zh/cards.ts` | `CARDS` (id → `{ title, subtitle?, body?, seal? }`), `EPILOGUE: Record<'A' \| 'B', readonly string[]>`, `CREDITS: readonly string[]` |

#### 2.8.14 Id seeds
S extracts **every** id from the GDD tables into the `ids/*.ts` files. S also writes `scripts/check-gdd-ids.mjs`, which greps the GDD for backticked ids and fails if any is missing from the id files. It covers:
- the prefixes `sp_ vp_ pk_ st_ dk_ sw_ T_ it_ wx_ obj_ clue_ tut_ bst_`, plus `g1–g9` and `zp1–zp4`;
- every §10.2 flag;
- every §11 node heading.

File format:
```ts
// src/data/ids/spots.ts — owner B (seeded by S from GDD §5.4). Append-only.
export const SPOT_IDS = ['sp_bus_bench', 'sp_slipway', 'vp_group_photo', /* …every §5.4 id incl. st_* dk_* sw_* pk_* g1..g9 zp1..zp4 */] as const;
export type SpotId = (typeof SPOT_IDS)[number];
export const WORLD_ANCHOR_IDS = [/* list below */] as const;
export type WorldAnchorId = (typeof WORLD_ANCHOR_IDS)[number];
```
World anchor seed list (B may append):
- **QR codes and fixtures:** `studio_qr bus_qr bike_qr temple_qr locker17 portrait_wall doorframe idol mirror`
- **Estate doors:** `door_201 door_202 door_203 door_204 door_301 door_302 door_303 door_304 door_401 door_402 door_403 door_404`
- **Puzzle points:** `coop_inside coop_door frame1_drop plaque trail_plane lh_lamp lh_switch pit chai net_dot lamp_p8 dot_ground sea_point`
- **Bestiary and darkroom props:** `lion_left_head roof_tv fish7 dk_line dk_tray_brown dk_tray_white dk_tray_blue tripod_head`
- **Landmarks:** `lm:banyan lm:footbridge lm:boat lm:crane lm:lighthouse lm:bus_stop lm:store lm:studio lm:hoarding`

F **must append** an `InteractId` for every interactive object in the GDD §9 tables that §11.13 does not list:
`it_st_wall it_st_doorframe it_st_cabinet it_st_poster it_st_backdrop it_dk_phone it_dk_bench it_dk_tray_brown it_dk_tray_white it_dk_tray_blue`, and any others the GDD names. (`it_frame1 it_dot it_roof_ladder it_st_exit it_sw_exit` are now GDD §11.13 rows and are seeded by S.)

The spot seed also includes the review additions `vp_estate_doors` and `sp_bus_door` (GDD §5.4 rows marked ‡).

#### 2.8.15 Data seeds written by S (the owners replace and extend them later)
- **`locations.ts`:** the complete GDD §5.4 SPOTS table. For interior spots, S picks plausible `LocalPos` values inside a 10×7 m studio and a 14×6 m subway hall, respecting these constraints (the golden path depends on them):
  - studio: the `dk_bench` stand point is ≤ 2 m from all three trays and has them within ±45° of its facing; `dk_line` is ≤ 3 m from that stand point; `st_entry` has `it_st_exit` within 2 m;
  - subway: the attendant's spot `sw_gantry` is 1.5 m beside the gantry (`it_gantry` anchor), so a player placed 1.8 m in front of the attendant is ≤ 2.5 m from the gantry and within its ±60° cone; `pk_psd` is on the platform past the gantry; `sw_entry` has `it_sw_exit` within 2 m.
  - Also the 11 LOCATIONS and the GATES.
- **`npcs.ts`:** schedules from GDD §6.1–§6.2.
- **`phases.ts`:** the GDD §10.3 table.
- **Minimal stubs:**
  - `dialogue.ts` and `zh/dlg.ts`: `xiaolin.first` from GDD §18.5;
  - `story.ts`: the `game_started` rule;
  - `photoTargets.ts`: `T_locker17`;
  - the `zh/*` keys the stubs use.

#### 2.8.16 Data export shapes (every `src/data/*` export, its type and its owner)
Several exports were referenced by consumers but never typed. This table is the contract; consumers import these names.

| File (owner) | Export | Type |
|---|---|---|
| `locations.ts` (B) | `LOCATIONS` · `SPOTS` · `GATES` · `SIGNAL_ZONES` | `readonly LocationDef[]` · `readonly SpotDef[]` · `readonly GateDef[]` · `readonly SignalZone[]` |
| `npcs.ts` (C) | `NPCS` | `readonly NpcDef[]` |
| `phases.ts` (A) | `PALETTES` | `Readonly<Record<PaletteKey, PaletteDef>>` (plus the `uncanny` overlay preset as `UNCANNY_SKY`) |
| `photoTargets.ts` (D) | `TARGETS` | `readonly PhotoTarget[]` |
| `labels.ts` (D) | `SCENERY_LABELS` · `LANDMARK_LABELS` | `readonly LabelDef[]` · `Readonly<Record<string, StrKey>>` keyed by `lm:*` tag |
| `bestiary.ts` (D) | `BESTIARY` | `readonly BestiaryDef[]` |
| `story.ts` (F) | `CHAPTERS` · `STORY_RULES` · `OBJECTIVES` · `ZONES` · `CHAPTER_BOOT` · `BEATS` | `readonly ChapterDef[]` · `readonly StoryRule[]` · `readonly ObjectiveDef[]` · `readonly ZoneDef[]` (type from `contracts.ts`) · `Readonly<Record<ChapterId, ChapterBoot>>` · `readonly BeatDef[]` |
| `dialogue.ts` (F) | `NODES` | `readonly DialogueNode[]` |
| `items.ts` (F) | `ITEMS` · `PRESET_PHOTOS` · `CLUES` | `readonly ItemDef[]` · `readonly PresetPhotoDef[]` · `readonly ClueDef[]` |
| `puzzles.ts` (F) | `PUZZLES` · `BEAT_HINTS` · `INPUTS` | `readonly PuzzleDef[]` · `readonly BeatHintDef[]` · `Readonly<Record<InputKind, InputDef>>` |
| `wx.ts` (F) | `WX` | `readonly WxDef[]` |
| `show.ts` (F) | `SHOW_REACTIONS` · `SHOW_FALLBACK` · `GATE_OUTCOMES` | `readonly ShowReaction[]` · `readonly ShowFallbackRow[]` · `Readonly<Record<GateVerdict, GateOutcome>>` |
| `interacts.ts` (F) | `INTERACTS` | `readonly InteractDef[]` |

### 2.9 `window.__game` (`src/debug.ts`; production builds too)
It implements `GameDebug` (§2.7) by delegation, with GDD §19.2 semantics plus the aliases from the task brief.

| Method | Implementation |
|---|---|
| `ready` | set by main (§2.1 step 9) |
| `step(frames = 1, dt = 1/60, input)` | `input.inject({ move: input })` on each tick → `loop.step` → returns `state()` |
| `freeze(on = true)` | `clock.frozen = on`: stops boil, chai spin, blinking, zhimei, the trail loop and clouds |
| `pause(on = true)` | freeze + `loop.setPaused(on)`; the screenshot-friendly pause for realtime mode |
| `goto(spot)` | `player.goto(spot, { fade: false })` |
| `teleport(x, lon?, heading?)` | a number is a planet latitude (degrees, with `lon`); a string is a SpotId, otherwise a LocationId center. `heading` sets the yaw |
| `skip()` | `ui.skip() \|\| story.skip()` |
| `setPhase(p)` | `store.setPhase(p, <default palette for p>, true)` |
| `setChapter(c)` | `story.bootChapter(c)` |
| `grant(id)`, `setFlag(id)` | classifies the id: FlagId → `store.set`; ItemId → `give`; Verb → `unlockVerb`; ClueId → `addClue`; PresetPhotoId → `lens.renderPreset`; BestiaryId → `addBestiary` |
| `solve(p)` | `story.solve(p)` |
| `look(yaw, pitch)` | `cameraRig.look` (D's lens pitch while in the viewfinder) |
| `aim`, `viewfinder`, `setPhoneMode`, `zoom`, `lens`, `shoot`, `evalShot`, `detach`, `reattach`, `lastPhotoId` | D (`lens(o)` → `setLens`; `detach` → `enterPeek`; `reattach` → `exitPeek`). `zoom`, `lens`, `aim` and `shoot` first open the viewfinder when it is closed (a `goto` closes it), so GDD §19.3 rows never shoot from third person |
| `setRef(id)` | `store.setRefPhoto(id)` |
| `interact()` | peek active → D (`pk_*`: reattach; `tripod`: start the timer; `lh_door`: `interact.trigger()`); night viewfinder → D's crosshair talk; otherwise `interact.trigger()` |
| `talk`, `advance`, `choose`, `show`, `input` | E (`talk` ignores range) |
| `freeCam(o)` | pushes or pops a `'debug'` camera override |
| `state()`, `getState()` | `DebugState`; `busy.any` = dialogue ∨ card ∨ beat ∨ modal ∨ pending actions; `actors` from `core.actors.list()` (+ each actor's `spot()`), `faceState` from `chars.faceState()`, `uncanny` from `render.uncanny()` |
| `snapshot()`, `timeRender(n = 8)` | A |

Every method must be safe to call at any time. Bad ids never throw: log a warning and do nothing.

### 2.10 URL parameters (`core/params.ts`)
GDD §19.1, plus these additions:
| Parameter | Effect |
|---|---|
| `?save=1` | allow storage in test mode |
| `?fly` | free camera |
| `?debug` | enable `log.debug` output |
| `?dev=<mod>[:arg]` | call that module's `devHook` |

`?test` also:
- adds `document.body.classList.add('test-mode')`, so E disables CSS animations and transitions;
- sets `uBoil = 0`, freezes cloud drift, and seeds grain by the frame index (A);
- mutes audio.

### 2.11 Stubs the scaffold must ship (every commit builds and runs)
Each `src/<mod>/index.ts` exports `create<Mod>: ModuleFactory<…Api>` with a working minimal implementation:

| Module | Stub behaviour |
|---|---|
| A render | `makeToonMaterial` = plain `MeshToonMaterial` + `userData.mrt`. `frame` = `renderer.render(scene, camera)` with a flat `#65c1bc` clear, then the FX scene. `capture` = the same into a `WebGLRenderTarget`, read back into a Y-flipped canvas. `stats` from `renderer.info`. Everything else is a no-op. The audio stub is all no-ops. |
| B world | Planet `IcosahedronGeometry(80, 4)` in `sea`; a ground disc (r ≤ 64) in `grass`; a ring-road ribbon at r = 34; one box with a collider per LOCATION center. `spot()` / `spotPos()` read `SPOTS`. `anchor()` returns the nearest spot's position. `signalAt` follows GDD §3.10 using `SIGNAL_ZONES`. Occluders and pickables are empty. Each interior is a floor plus 4 walls. |
| C chars | Hero = capsule body + orange-framed box head, parented to `player.object`. Each NPC = a coloured capsule on its schedule spot, registered as an actor with a head `Object3D`. `busZero` = a box. `faceTexture` = a 1×1 canvas. |
| D lens | The viewfinder toggles a first-person override (lens at 1.72 m) and shows `vf-frame` / `vf-recog` DOM with `data-state="white"`. `evalNow` returns a white result. `shoot` = capture + store an untagged Photo. `aim` looks at the anchor when it can resolve one. Everything else resolves immediately. |
| E ui | Title DOM with `[data-testid=title-start]` (text `t('ui.start')`). Dialog box DOM (`dialog-box`, `dialog-name`, `dialog-next`) that plays `DLG[node]` lines with instant text. `talk()` picks the first node whose owner matches. A prompt chip. `showCard` resolves after one tick. `busy()` is real. |
| F story | `startGame` sets `game_started` and `wx_tudi_added`, applies palette `morning` and goes to `sp_bus_bench`. `bootChapter` sets chapter, phase and palette and teleports to a default spot per chapter. Everything else resolves immediately. |

### 2.12 Scaffold self-test / Definition of Done
- `npm run typecheck` reports 0 errors.
- `npm test` is green and covers:
  - planet conventions (the numeric facts in §2.3);
  - walker lap, pole crossing and transport;
  - collisions, including `hRange`;
  - walk-surface layering (under the bridge vs on the deck);
  - zones;
  - the store: give → flag, eviction, and a save round trip including the quota fallback;
  - rules: condition and event rules, `guard`, fire-once, quiet mode;
  - input mapping (the pure keymap);
  - the zh barrel: `t` substitution and the missing-key marker;
  - `src/core/determinism.test.ts`: a source grep that fails on `Math.random`, `performance.now` or `Date.now` anywhere in `src/` except `src/render/**` `timeRender` (§6 risk 7).
- `node scripts/check-gdd-ids.mjs` passes.
- `node scripts/smoke.mjs --base http://127.0.0.1:5170` (suite `boot`) passes against the stubs.
- The orchestrator commits. After that, frozen files change only in Phase 2.

---

## 3. Parallel modules

**Rules common to all modules**
- Implement your `…Api` from §2.7 exactly: `export const createX: ModuleFactory<XApi>`.
- Rebuild your visual state from the store on `stateLoaded` and `phaseChanged`. Continue, `?chapter` and `?flags` depend on it.
- No per-frame allocation in hot paths. Respect the §5 budgets.
- Unit-test pure logic with vitest, and verify visually with `scripts/shot.mjs`.
- `init()` must never throw because of bad data.

### 3.A `render` — look & sound
**Files:** `src/render/**`, `src/audio/**`, `src/data/phases.ts`, `dev/render.html`, `dev/audio.html`.
**Public API:**
- `src/render/index.ts` → `createRender: ModuleFactory<RenderApi>`, `makeToonMaterial: MakeToonMaterial`;
- `src/audio/index.ts` → `createAudio: ModuleFactory<AudioApi>`.

**Consumes**
- core: `renderer`, `scenes`, `cameraRig.camera`, `player` (position, frame), `clock`, `store`, `params`;
- bus: `phaseChanged`, `flagSet`, `stateLoaded`, `uncanny`, `viewfinder`, `peek`, `sceneChanged`, `sfx`, `settings`, `paused`, `memo`.

**Suggested files**
| File | Contents |
|---|---|
| `materials.ts` | ART §3.3–3.4 verbatim (the night bands there are already the GDD §10.4 raised values). Shared uniforms `uPlanetCenter`, `uSunPole`, `uSunAtPole`, `uTime`, `uNight`, `uUncanny` (= shifted `uUncW`), `uLamps[8]`, `uFlash` (captures only), `tNoise` |
| `noise.ts` | 128² RGBA8, rank-equalized |
| `pipeline.ts` | MRT (count 2, RGBA8, Nearest) + `DepthTexture`; `frame`, `capture`, `LiveView` |
| `composite.ts` | ART §4.4 + §5.2, plus viewfinder barrel/vignette/grain, the night cold vignette and `negative` inversion. Writes `gl_FragDepth` with `depthTest:true, depthFunc:AlwaysDepth` |
| `sky.ts` | the ART §5.1 cloud bake |
| `grade.ts` | palette tweens (cloud cut in 3 steps), uncanny envelopes |
| `lights.ts` | the ART §3.1 sun via `frameAt` east/south; a ±22 m shadow box that follows the player, with texel snapping; the interior key light; a lamp registry that packs the 8 nearest lit lamps into `uLamps` |
| `fx.ts` | one FX scene per SceneId; the smoke ribbon; additive helpers; the 3–6 ink "V" birds circling above the player (ART §5.2; A owns them) |
| `title.ts` | the title preset: fog, shadows and line fade off; instanced far-side dressing at θ 0.8–2.4 rad (~60 trees, rocks and houses, plus 6–10 islands) using surface ids 190–199. The planet body and the town itself are B's; the orbit camera is core's `setTitleMode`; the lettering and buttons are E's (§4.1 "Title screen") |
| `lowfx.ts` | `?lowfx=1`: blob shadows (dark ellipses under every registered actor, **in the FX pass** with `depthWrite:false`, never in the main pass), `castShadow` off, DPR 0.75, shadow map updated every 2nd frame |

**Delivers**
1. **The ART pipeline, exactly:**
   - 2 bands with the HSV shade formula, mottling, and world-anchored line breaks;
   - ink `#2f3a3f`, and spirit ink for surface ids 240–254;
   - boil driven only by `uUncanny`;
   - a sky made of two flat tones;
   - no `scene.background` and no transparent main-pass materials;
   - in dev and test builds, one `console.error` per main-pass mesh whose `material.userData.mrt` is missing.
2. **`PALETTES` for every `PaletteKey`.**
   - For morning, dusk, night and dawn values, GDD §10.3 wins over ART.
   - Chapter changes tween over 3 s; `phaseChanged.instant` switches immediately.
   - GDD §10.4 night readability: lit-band luma ≥ 0.45, ambient floor 0.12, halo ink `#6d8fb0` on dark silhouettes, sky `#22365a`.
3. **Uncanny `uUncanny`:**
   | Situation | Value / envelope |
   |---|---|
   | night, before `P8_done` | baseline 0.15 |
   | in `subway_int` | 0.6 |
   | `M_chai_wake` | rises to 1 over 1.2 s; back to 0.15 after the next `dialogueEnd` |
   | `M_zhimei_move` | pulse to 0.3 for 0.6 s |
   | `M_lighthouse_off` | 0.5 for 4 s |
   | `M_zhe` | 1 → 0 over 2 s |

   Grading and sky use the shifted weight `uUncW = clamp((uUncanny − 0.15)/0.85, 0, 1)` (so the 0.15 night baseline leaves the palette and the `#22365a` sky untouched; GDD §19.4 checks the sky to ±6), and lines use `uBoil = uUncanny ≤ 0 ? 0 : mix(0.3, 1, smoothstep(0.15, 0.6, uUncanny))` (ART §2.3; always 0 in `?test`). Night palettes set `uHalo = 1` so the composite swaps in the `#6d8fb0` halo ink on dark silhouettes (ART §4.4).
4. **`capture()`** honours layers, `hideInPast` and `transient`, and applies flash through the shared `uFlash` uniform (ART §3.4): surfaces within `radius` are forced to the lit band with no shadow (at night they read as a lamp pool). It honours the palette override and returns an sRGB canvas (480×270 by default). **Captures skip the FX pass** (smoke, glow sprites and blob shadows never appear in photos, and built-in FX materials would be mis-encoded in an RT). `createLiveView(256)` serves the mirror.
   - **Colour storage is pinned:** RT0 is plain RGBA8 with `NoColorSpace`, the material does the manual OETF, and the composite does no conversion (ART §3.2 / §12). Do not set `SRGBColorSpace` on `textures[0]` (TECH's alternative route; the AGENTS.md lesson about sRGB colour targets applies to that route only).
5. **`setViewfinder`** visuals. **`setSmoke`**: an ash-coloured (`#8d8a86`) particle ribbon along the geodesic from `from` to `to`, drawn in the FX pass and animated on `animT`.
6. **Stats and utilities:**
   - `stats()` = whole-frame `renderer.info`, reset at frame start, including the shadow, composite and FX passes;
   - `timeRender(n)` flushes with a readPixels;
   - `snapshot()`;
   - `compile()` = `renderer.compileAsync` for every scene.
7. **Audio** (GDD §17, TECH §6):
   - one `AudioContext`, unlocked on the first pointer or key event; master gain → compressor;
   - every `SfxId` synthesized; the `sfx` bus event calls `play`;
   - ambience: waves (gain rises with the player's chart r, loudest at r ≥ 43), city hum, and `sfx_drone` with gain following `uUncanny`;
   - footsteps from `player.speed()` at 1.8 Hz (×1.4 when running);
   - `sfx_type` (emitted by E) rate-limited to 30/s; `memo` plays three low 嘟;
   - `?mute` and `settings.volume`.

**Self-test**
- vitest: noise equalization (area fractions within ±1%), palette table completeness and hex validity, tween stepping, lamp packing, uncanny envelopes.
- Visual: `dev/render.html?check` prints the ART Appendix A checks 1–7 and the GDD §19.4 `night_store` numbers for day at `sp_bus_bench`, night at `sp_store_front`, and the title.
- Audio: `dev/audio.html` renders every `SfxId` in an `OfflineAudioContext` and lists its RMS; every RMS must be > 0.0003.

**DoD:** stub replaced; `timeRender(8)` < 60 ms at `sp_bus_bench` with B's world; ≤ 16 shader programs; 0 console errors.

### 3.B `world` — 望潮里, the tiny-planet town
**Files:** `src/world/**`, `src/data/locations.ts`, `src/data/ids/spots.ts`, `src/data/zh/world.ts`, `dev/world.html`.
**Public API:** `createWorld: ModuleFactory<WorldApi>`.

**Consumes**
- `makeToonMaterial`;
- core: `physics`, `scenes` (+ cullables), `actors` (registers `chai`), `store`, `core/geom`, `core/canvas`, `core/planet`;
- bus: `phaseChanged`, `flagSet`, `stateLoaded`, `uncanny`;
- render: `render.registerLamp`, `render.fxScene` (lighthouse beam, glow sprites).

**Suggested files**
| File | Contents |
|---|---|
| `ground.ts` | planet body (icosphere R−0.05, detail 4) with grass / shallow / sea vertex bands; tessellated town disc (r ≤ 64); ring road (r 31–37) with paint, sidewalks at r 29–31 and 37–39; seawall at r 48 for lon 300°→60°; rocks at r 62 elsewhere; foam band |
| `kit/*` | buildings with eaves and trims and 0.15 m steps; façade canvas atlases at 64 px/m; windows as separate unlit pane meshes; cables (`TubeGeometry` r 0.02); trees (≤ 400 tris); instanced props with per-instance `aSurfaceId` |
| `chunks.ts` | merge per material per lon-sector × ring; register cullables |
| `locations/<id>.ts` × 11, `fill.ts` | the locations; 骑楼 fill bands and the park |
| `interiors/studio.ts`, `interiors/subway.ts` | ≤ 5k tris each, in `LocalPos` |
| `heights.ts` | walk surfaces: bridge stairs/deck (slope 0.55, 2.4 m wide, 10 m runs: north stairs along r 27 lon 30→51, south stairs along r 41 lon 30→16; deck h 5.5); pier ramp + deck (h 0.6) + lighthouse rock platform (h 1.5, 1.6 m steps from the pier end); hill slope inside the r 13 wall (h = 4·(13−r)/7 for r 6–13) and plateau (r ≤ 6, h 4); alley (h 0→1.2) |
| `colliders.ts`, `anchors.ts`, `occluders.ts` | colliders (incl. the GDD §5.6 boundary: r 48 seawall rail with the pier gap, r 62 wave wall, pier and rock-platform rails, the r 13 retaining wall with its lon 145° gap, the estate compound wall), anchors, occluder proxies |
| `signal.ts` | GDD §3.10; emits `signalChanged` whenever the player's bars change |
| `p8.ts` | the GDD §9 P8 construction |
| `trail.ts` | the P6 writing plane (8×3 m at h 13, facing the bench); the 「1987」 stroke canvas; the moving light dot on a 10 s `animT` loop |
| `phaseState.ts` | the GDD §5.7 table |
| `past.ts` | PAST-layer dressing for 2006 and 2011 |

**Delivers**
1. **Locations:** all 11 of GDD §5.3, plus the fill bands. Landmarks at the GDD heights: banyan 18 m, lighthouse 18 m, crane 32 m, bridge deck 5.5 m. Every interactable prop the GDD names. Signage text comes from `zh/world.ts` and is baked after fonts load.
2. **Final `SPOTS`:** ±2 m / ±3° adjustments are allowed. The † spots `sp_net_dot`, `sp_dot_ground` and `sp_lamp_p8` are computed by the glyph-subtraction rule:
   - draw 「拆」 and 「折」 on canvas in the same font and subtract them to find the dot;
   - road viewpoint `E0 = (34, 256, 1.6)`; the net plane is at r = 41;
   - `V` = the lens at `vp_subway_top`, h 1.72;
   - shade center `S = V + 0.8·(D − V)`, radius 0.28; its occluder sphere has radius 0.45;
   - the net is **not** an occluder.

   Unit test: the dot is hidden from V and overlays the glyph from E0.
3. **The `chai` actor** (GDD §6.1), surface ids 240–244:
   - a 3.6 m red-ring glyph on the hoarding;
   - at night: spins at 2°/s, stroke boil, and "breathes" while speaking;
   - after `P8_done`: 「折」, with every 拆 mark in town switching in a 1 s cascade on `uncanny: M_zhe`;
   - at dawn: a 1.2 m 「折」 sign on the bridge railing;
   - 拆 marks are distributed by phase (§5.7).
4. **Phase and world state:**
   - Gates: B1 (fence) and B2 (tide water lowering over 0.4 s). Colliders follow `GATES[].openWhen`; emit `gateChanged`.
   - Window lights at 0 / 20 / 40%. Street lamps through `registerLamp`, lit at dusk and night.
   - Lighthouse and crane lights (the crane light blinks red at 1 Hz).
   - `M_lighthouse_off`: 4 s of darkness while negative ③ falls.
   - The subway grille opens at night.
   - Props that appear with flags: frame ① on the roof after `pigeons_gone`; the cinnabar dot on the ground after `P8_done`; the tripod on the 周记 tile in the finale.
   - 2006/2011 PAST dressing (the old 「月亮湾小卖部」 sign, lanterns, the idol's face), and `hideInPast` on the crane, chai and new signs.
   - Bestiary props: the lion head turned seaward at night (`bst_lion_turns`); the roof TV playing in the GHOST layer (`bst_tv_still_on`); the fish tank with the 7th fish (anchor object `fish7`).
5. **The convex mirror:** orange pole at `(30, 92)`, center h 2.4, yaw 160, with `setMirrorTexture`.
6. **Queries:**
   - `anchor()` for every id in `WORLD_ANCHOR_IDS`;
   - `occluders()`: box proxies for buildings plus the P8 shade sphere, kept out of the scene graph;
   - `pickables()`: chunk meshes with `triLabels` built from `labels.ts` ids.
7. **Budget:** the planet stays within budget using horizon culling; each interior ≤ 5k tris; small props carry `userData.detail`. **All non-`detail` town geometry together ≤ 90k triangles**, because the title, the ending pull-back, the `S_sunset` roof orbit and the bridge deck see almost the whole town (§5.1). B sets `approach:'behind', approachDist: 3.0` on `sp_seawall_zhimei`.
8. **Review constraints (GDD §5 ‡ rows):**
   - `stand` points for every object spot (GDD §0.2), on walkable ground, facing the object.
   - 红旗新村: 1号楼 7 m wide on lon 160° with a 1.2 m open west gallery (see-through railing, thin slabs); 2号楼 on lon 120°; from `vp_estate_doors` all 12 door 福 anchors (h 4.5 / 7.5 / 10.5, 0.1 m outside the door face) are visible past the slab edges. Gallery slabs and railings are **not** occluder proxies; building proxies stop at the door wall.
   - Every façade-mounted anchor (QR codes, plaque, locker slot, doors) sits ≥ 0.1 m outside its building's occluder proxy, so evalShot's occlusion rays never hit their own wall.
   - B1 and B2 (with the neighbouring buildings and a site fence) cut the whole r 13–62 band; `?dev=world:walkcheck` also asserts that lon 200° is unreachable by day.
   - `vp_temple_2011` is computed by the GDD §5.4 rule (left lion head at NDC x ≈ −0.6 at 3×) and written with its exact yaw/pitch.
   - The frame ① drop point (anchor `frame1_drop`), the cinnabar dot (`dot_ground`) and the tripod mount (`tripod_head`) exist as anchors.

**Self-test**
- vitest: `signalAt` zones; walk-surface heights (0 under the bridge, 5.5 on the deck, monotonic stairs); the spot table matches the GDD within tolerance; the P8 construction geometry; anchor completeness.
- Visual: `dev/world.html` or `?dev=world` (fly camera + location hotkeys). Shoot every location by day and by night, plus the title; log `state().triangles` and `calls` for each shot.

**DoD:** no stub geometry remains. Every §5.4 spot is reachable on foot, except teleport-only roofs and interiors; `?dev=world:walkcheck` verifies this with a scripted walk. Budgets per §5.

### 3.C `chars` — the cast
**Files:** `src/chars/**`, `src/data/npcs.ts`, `src/data/zh/chars.ts`, `dev/chars.html`.
**Public API:** `createCharacters: ModuleFactory<CharactersApi>`.

**Consumes**
- `makeToonMaterial`;
- core: `player.object` / `speed` / `pose`, `actors`, `store`, `core/canvas`;
- world: `world.spot()`;
- bus: `phaseChanged`, `flagSet`, `stateLoaded`, `viewfinder`, `peek`, `dialogueLine`, `dialogueStart` / `dialogueEnd`, `show`, `signalChanged`, `clockChanged`, `uncanny`, `lensChanged`.

**Suggested files:** `kit.ts`, `anim.ts` (walk at 1.8 Hz, 3 cm bob, arm swing ±25°, idle breathing), `hero/{model,screen,lenses,detach,photoFace}.ts`, `npcs/<id>.ts`, `schedule.ts`, `faces.ts`, `crowd2006.ts`, `pedestrians.ts`, `spirits.ts`, `bus.ts`.

**Delivers**
1. **The hero** (ART §7.2 + GDD §2.1; ≤ 3.5k tris, ≤ 4 draw calls):
   - the phone head with its orange frame;
   - the camera-bump face: 2 lens eyes with aperture expressions and eyelid blinks, a mouth lens, the flash LED;
   - the 「周记照相馆」 sticker (canvas);
   - the back screen, a 128×256 `CanvasTexture` redrawn only on change:
     - status bar: signal (from `signalChanged`), clock, battery 1%;
     - expressions; `● REC` in the viewfinder;
     - static while a spirit actor is within 10 m;
     - typed text for `dialogueLine` when the speaker is `me`;
     - `show` alternating at 2 Hz; `ridecode`;
   - `flashFace`, the torch, the neck with its USB-C plug;
   - `detachHead` (0.4 s) and the headless body;
   - the PHOTO_ONLY face head (brows like 老周, hair `#3c4e54`);
   - `setFirstPerson`.
2. **NPCs** (GDD §6.1, ART §7.3–7.4; ≤ 1.8k tris and ≤ 2 draw calls each):
   - registered as actors with `spot()`;
   - schedules and overrides from `npcs.ts`, applied on phase and flag changes: tudi on the hero's left shoulder at night; granny at the window after `P8_done`; everyone on `g1–g9` at dawn;
   - `talkRange` and `talkNeedsNight`; GHOST-layer actors (tudi) move to WORLD at dawn; zhimei, meiqiu and the attendant are WORLD all along (GDD §6.1);
   - zhimei: paper-stepped at 6 fps; the `M_zhimei_move` hop `zp1→…→zp4` after more than 2 s out of view, which emits `uncanny` + `sfx_paper` and calls `store.setZhimeiSpot`; her second eye dot appears after `zhimei_eye`;
   - the attendant as a floating uniform; meiqiu with the notched left ear and red collar; granny with the cart merged in;
   - granny's blink via `startBlink` / `eyesClosed` (the GDD P3 formula on `animT`).
3. **`faces.ts`:**
   - FaceState derived from phase and flags: mosaic by day and dusk, blank at night, and clear after `P8_done` through a 1.5 s blank → mosaic → clear animation;
   - emits the `faceState` event;
   - `faceTexture(seed)` decals, used by B's portrait wall and by the 2006 crowd.
4. **Other figures:**
   - `crowd2006.ts`: 20 simplified neighbours on the south stairs, in the PAST layer;
   - PHOTO_ONLY: the `lao_zhou` ghost, and the six bestiary silhouettes once the bestiary reaches 6/6;
   - pedestrians: ≤ 6 instances, scheduled per §5.7, marked `transient` at night;
   - spirits: the ghostShadow decal (`bst_second_shadow`; 8 fps edge boil and no caster), the queue shadows (GHOST) and the manhole eye (GHOST);
   - `busZero` (≤ 1.5k tris, with the 「0 路 · 往：昨天」 sign).
5. Every NPC root and the hero carry `hideInPast`. Actor roots carry `actorId`.
6. **Review additions:**
   - Layers and talk rules exactly per the GDD §6.1 table (tudi GHOST with `talkNeedsNight`, WORLD at dawn; zhimei and meiqiu WORLD and talkable by plain E — their plain nodes answer 「喵」 / 「一个纸人……」 and the real lines are `lens:'night'` nodes; attendant WORLD).
   - Living NPCs register a 0.35 m circle collider; spirits never collide; **at dawn no NPC collides** (the headless body must pass the lineup on the south stairs, GDD §9 `S_group_photo`). Lineup `g1–g9` faces heading 180 (toward the tripod).
   - C listens to `uncanny`: `M_wake_face` → `hero.flashFace('stranger')`, `M_mirror_face` → `hero.flashFace('self')`; C itself emits `M_zhimei_move`.
   - Props owned by C: granny's framed family photo (uses `faceTexture`, shown in the `S_zhe` window cut), the attendant's post-`bus_arrived` seat in `busZero` (its `spot()` returns `sp_bus_door`).

**Self-test**
- vitest: schedule resolution for every phase × the key flags; FaceState derivation; the blink formula (a 3-shot burst 0.3 s apart always mixes open and closed eyes); triangle counts per character (geometry built in node, without canvas).
- Visual: `?dev=chars` lines every character up at `sp_bus_bench`, facing the camera, and cycles expressions. Also shoot the hero from behind (the screen must be legible), from the mirror side (sticker visible), and with the night rim.

**DoD:** every `NpcId` except `lao_zhou` stands on its schedule spot in each phase screenshot, and the hero still reads at 60 px tall.

### 3.D `lens` — camera mechanics and shot logic
**Files:** `src/lens/**`, `src/data/photoTargets.ts`, `src/data/labels.ts`, `src/data/bestiary.ts`, `src/data/ids/lens.ts`, `src/data/zh/lens.ts`, `dev/lens.html`.
**Public API:** `createLens: ModuleFactory<LensApi>`. `src/lens/evalShot.ts` exports the pure `evalShot(view, targets, ctx)`, used by the tests.

**Consumes**
- core: `input` (viewfinder and peek contexts), `cameraRig.push`, `player` (strafe, speed cap 1.2, pose), `store` (photos, reference), `rules.run` (`onShot` actions), `actors`;
- render: `capture`, `createLiveView`, `setViewfinder`, `setSmoke`;
- world: `anchor`, `spot`, `occluders`, `pickables`, `setMirrorTexture`;
- chars: `hero` (`lensPos`, `setFirstPerson`, `detachHead`, `setScreen`), `npc('granny_wang')` (blinking);
- story: `story.smokeTarget()`;
- ui: `ui.talk()` for E presses in the night viewfinder.

**Suggested files**
| File | Contents |
|---|---|
| `evalShot.ts` (+ test) | the pure GDD §3.4 judge |
| `view.ts` | builds the ShotView from the camera: NDC projection, distances, facing; ≤ 5 occlusion rays per candidate against `world.occluders`; hidden checks |
| `viewfinder.ts` | enter/exit (FOV 50→55° over 0.35 s; lens at 1.72 m, +0.05 m forward; pitch −60..+70°; starts from the rig's yaw/pitch); zoom 1/3/10 → vFOV 55/20/6.5°; GHOST layer while night is on; still detector (2 s / 1.5°; sitting counts as still); burst when held ≥ 0.3 s. `setLens({night:true})` implies `setViewfinder(true)`. Leaves (viewfinder, night, peek) on `teleported` unless D itself started the teleport. `contain` checks each `mustContain` anchor against `frameArea` (GDD §3.4) |
| `overlay.ts` | viewfinder DOM (see below) |
| `capture.ts` | creates Photos (see below) |
| `labels.ts` | zoom-tier label resolution; a 10 Hz scenery raycast against `pickables` within 60 m; `sky_day` / `sky_night` fallback |
| `rephoto.ts` | the reference image = `renderPreset` from the target's viewpoint (PAST capture + sepia, grain and white border); 50% overlay; the GDD §3.8 score |
| `presets.ts` | the four preset photos; re-renders `ph_2006_group` on `faceState` |
| `specials.ts` | `granny_blink`, `chai_dual`, `light_trail` (see below) |
| `scan.ts` | QR codes: 0.5 s dwell, centre 20% of the frame, ≤ 2.5 m → `scanned`, `sfx_scan`, then the `onShot` actions |
| `peek.ts` | pk_*, `lh_door` and tripod views (see below) |
| `mirror.ts` | a LiveView updated only while the viewfinder is on and the player is within 8 m; renders the hero with the head visible; feeds `world.setMirrorTexture` |
| `darkroom.ts` | `darkroomReveal()` (see below) |
| `smoke.ts` | (P3 wayfinding, now in `extras.ts`) 0.12 s into the viewfinder: `render.setSmoke({ from: lens + right·0.42 + fwd·1.1, via: story.smokeStep().route lifted 1.3 m, to: spot + 0.9 m })`; the route comes from `story/route.ts` (street graph verified against physics). The third-person twin is E's `ui/hud/wayfinder.ts` incense arrow (same `smokeStep`). |
| `talk.ts` | E in the night viewfinder: raycast (all layers) from the lens centre; the first registered actor hit (any layer: tudi, meiqiu, zhimei…) → `ui.talk(actorId)`. **Fallback:** nothing talkable under the crosshair at night while tudi follows the hero → `ui.talk('tudi')` (he sits on the left shoulder and cannot be framed; GDD §6.1) |

**Viewfinder overlay (`overlay.ts`, DOM)**
- corner brackets; `● REC`;
- the recognition bar `vf-recog`, the frame `vf-frame[data-state]`, `vf-overlay-score`;
- zoom, night and flash icons;
- the exposure ring 「曝光中 2…1…」 and the counter `{n}/40`;
- the shutter flash: white for 80 ms, then a 250 ms fade;
- the tripod countdown `tripod-count`.

**Photo creation (`capture.ts`)**
1. `render.capture` → JPEG dataURL at quality 0.8.
2. Tags = the green target's `onShot.tags`, plus automatic `npc:<id>` / `lm:<id>` tags for anything with a projected size ≥ 0.05 that is not occluded.
3. Record label, clock, zoom, night, flash and `keep`.
4. `store.addPhoto`; emit `photoTaken` and `shutter`.
5. `rules.run(onShot.actions)`.
6. Award bestiary entries through `store.addBestiary`.

**Special hooks (`specials.ts`)**
- `granny_blink`: call `startBlink(t0)` when granny first enters the frame within 6 m; at capture time, take the tag from `eyesClosed()`.
- `chai_dual`: GDD §18.4.
- `light_trail`: project `anchor('trail_plane').corners` and composite its `canvas` into night captures.

**Peeks (`peek.ts`)**
- `pk_coop`, `pk_psd`: teleport, `hero.detachHead(mount)`, then a fixed camera (yaw ±60°, pitch ±45°) with zoom, flash and shooting. The head reattaches automatically after a successful shot.
- `lh_door`: a look-up view without detaching; interactions stay live.
- `tripod`: the head goes on `anchor('tripod_head')` while the body keeps WASD control.
  - `startTripodTimer`: a 10 s Silkscreen countdown.
  - Success = the body is within 1.0 m of `sp_stairs_x`. Then: a PHOTO_ONLY capture of `ph_2026_group`, labelled 「周远 · 人 100%」, and `group_photo_done`.
  - Failure → node `xiaolin.group_retry`, and the body fades back.
- E / Esc: E reattaches in `pk_*`; E starts the timer in `tripod`; Esc always exits.

**Darkroom (`darkroom.ts`)**
`darkroomReveal()` runs when the viewfinder is on in `studio_int` within 4 m of `dk_line`:
1. `render.setViewfinder({ negative: true })`.
2. Stitch four captures: ① store sign → ② west stairs + banyan → ③ east stairs + chalk X → ④ bus sign + boat.
3. Add `ph_2023_stitched`, then resolve.

**Data**
- `photoTargets.ts`: every row of GDD §8.1, using `{world}` anchors wherever the position depends on geometry;
- `labels.ts`: GDD §8.2–8.3;
- `bestiary.ts`: GDD §14;
- texts in `zh/lens.ts`: `lbl.*`, `fail.*` (including the GDD §3.4 defaults and the per-target overrides), `vf.*`, `bst.*`, `tp.*`.

**Self-test**
- vitest: condition order and first-failure reporting; confidence formulas; candidate priority (active puzzle > centre > id); zoom-tier labels; `chai_dual`; the granny burst guarantee; the rephoto score formula; eviction through the store; data validation (every target key resolves in `zh/lens.ts`; every anchor and spot id exists).
- In-app: `?dev=lens:targets` walks every target (`goto` viewpoint → `aim` → `evalNow`) and prints a pass table. Also shoot the `day_viewfinder` and `night_chai` checkpoints.

**DoD:** the lens steps of GDD §19.3 pass against the real world: P1, P4, mirror, P5 pigeons, P6 trail, P7 pit, P8 chai, P9 `zhimei_sea`, and the group photo.

### 3.E `ui` — the DOM shell and its engines
**Files:** `src/ui/**`, `src/data/ids/ui.ts`, `src/data/zh/ui.ts`, `dev/ui.html`.
**Public API:** `createUi: ModuleFactory<UiApi>`.

**Consumes**
- core: `uiRoot`, `input`, `store`, `rules`, `interact` (`promptChanged`), `actors`, `cameraRig.push`;
- data: `DLG`, `WX_TEXT`, `CARDS`, `EPILOGUE`, `CREDITS`, `NODES`, `WX`, `SHOW_REACTIONS`, `SHOW_FALLBACK`, `GATE_OUTCOMES`, `INPUTS`, `PUZZLES`, `BEAT_HINTS`, `OBJECTIVES`, `ITEMS`, `CLUES`, `PRESET_PHOTOS`, `BESTIARY`, `NPCS` (for name tags) — shapes in §2.8.16;
- services: `lens` (state, `startTripodTimer`), `story` (`currentBeat`, `startGame`, `continueGame`), `audio` (`unlock`), plus `sfx` events.

**Suggested files:** `styles/{tokens,components}.css`, `dom.ts`, `title.ts`, `dialog/{engine,box,typewriter,choices,camera}.ts`, `hud/{objective,status,prompt,toast,tutorial}.ts`, `phone/{phone,album,wx,memo}.ts`, `wx.ts`, `hints.ts`, `show.ts`, `inputs/{keypad,namepicker,milkbox}.ts`, `cards/{chapter,liaozhai,photoCard,epilogue,credits}.ts`, `pause.ts`, `settings.ts`, and `touch.ts` (optional, built last).
- `tokens.css` / `components.css` implement ART §8.1–8.3: slabs, 3 px ink borders, a hard 4×5 shadow, tilt, and a 140 ms stamp-in.
- Test mode: `body.test-mode *{animation:none!important;transition:none!important}`.

**Delivers**
1. **Title** (GDD §1, ART §8.2): the 显影 / 望潮里志怪 lettering, plus these buttons:
   | Button | testid | Notes |
   |---|---|---|
   | yellow 「开机」 | `title-start` | |
   | 「继续」 | `title-continue` | only when a save exists |
   | 「设置」 | `title-settings` | |

   A click calls `audio.unlock()`, then `story.startGame` or `story.continueGame`.
2. **Dialogue engine** (GDD §11.0):
   - Registers one talk interactable per actor (`npc:<id>`), using the actor's `talkRange` and enabled while some node without a lens requirement is eligible.
   - Node selection: by owner, `when`, `prio`, and `once` (tracked as `seen:<id>`); `lens=night` through `rules.evalCond`; `auto` nodes play when the owner is in range.
   - `{name}` → 「？？？」 or 「周远」. Effects run through `rules.run`.
   - The fixed options 「出示照片…」 and 「再见」 are added unless `noFixedOptions` is set. Node choices support `when` / `then` / `actions`. `advance()` with only the fixed options left means 「再见」.
   - Typewriter on sim time: 25 ms per character; pauses of 120 / 250 / 400 ms; a speed setting. Emits `dialogueLine` and `sfx_type`.
   - Name-tag colours: me `#66bde6`, NPC `#f0d055`, spirit `#c8433a`, system grey.
   - The dialogue camera override (ART §6.4); it is not used for talks from inside the viewfinder.
3. **Cards** (GDD §10.5, §15; ART §8.2):
   - the chapter card, with its seal stamp;
   - 聊斋卡, fading in one character every 40 ms;
   - the photo card (tilted −2°, shown for 4 s);
   - the epilogue, one line every 1.6 s;
   - the credits, scrolling at 40 px/s (×4 while Space is held);
   - emits `cardShown` / `cardClosed`; `skip()`.
4. **Phone** (Tab / J; GDD §16.4):
   - **Album:** the grid (`album-item-<id>`); the detail view (label · time · zoom · 普通/夜景 · 闪光); 「设为对照」 (`album-setref`); 「删除」 (not for presets); a row of items. After `P1_done` the `ph_2006_group` detail shows its back text (`clue_photo_back`, GDD P1 success).
   - **微信:** the typing indicator 「土地正在输入…」 for 1.2 s, 0.8 s between messages, `wx-msg-<n>`, and 「求助（H）」.
   - **备忘录:** the objective, the three rules, frames ①②③④ with ✓, the clues, and 怪谈录 n/6 with thumbnails.
5. **HUD:** the objective chip (`objective-chip`), the phone status (signal, time, battery), the world-anchored prompt (`prompt`), toasts (`toast`: item, clue, wx, photoFull, bestiary), and tutorials (GDD §11.14; the zoom and flash tutorials trigger on `lensHint`).
6. **Hints engine** (GDD §13): current-target selection over `PUZZLES` + `BEAT_HINTS`, using `ObjectiveDef.hintFor` for rule 2; tiers at 90 / 180 / 300 s; H with at least 20 s between hints; paused during dialogue, beats and cards; hints arrive as wx text (E pushes the hint `StrKey`s itself; they are not `WxId`s). The pure core in `hints.ts` has tests.
7. **Show engine** (GDD §3.9, §12):
   - the picker (`show-picker`; two photos allowed only for `gate`);
   - reaction lookup: `SHOW_REACTIONS` in order, then `SHOW_FALLBACK`;
   - `gateShow`: a `GateVerdict` classification (the precedence list in GDD §9 P3: only `granny_face_*` tags count as her face) mapped through `GATE_OUTCOMES`;
   - calls `hero.setScreen('show')`; emits `show` / `showResult`.
8. **Inputs** (GDD §16.5), with answers and outcomes from `INPUTS` (F):
   | Widget | Behaviour | testids |
   |---|---|---|
   | locker | 2 stages; fail keys; the memo hint after 2 code failures | `kp-<key>` |
   | lighthouse | 4 digits | `kp-<key>` |
   | namepicker | 2×6 grid; 确认 / 清除 | `np-<char>` |
   | milkbox | 24 boxes with cell texts | `mb-<box>` |

   All inputs emit `inputResult`.
9. **Pause and settings:** Esc opens 继续 / 设置 / 回到标题 (with a confirm). Settings (sensitivity, invert Y, volume, text speed) persist in `cmm.settings.v1` and are emitted as `settings`.
10. **Test ids:** every GDD §19.2 testid that belongs to the UI: `title-start`, `dialog-box`, `dialog-name`, `dialog-next`, `choice-0..3`, `phone-tab-album|wx|memo`, `album-item-<id>`, `album-setref`, `wx-msg-<n>`, `objective-chip`, `kp-<key>`, `np-<char>`, `mb-<box>`, `chapter-card`, `liaozhai-card`, `photo-card`, `credits`.

**Self-test**
- vitest with fixture data: the node-selection matrix, `once` / `seen`, lens gating, fixed options and `advance()` semantics, typewriter timing, hint tiers and H spacing, the gate verdict table, input stage logic.
- Visual: the `dialog` checkpoint (the box's centre pixel is `#f8f8f6`; the NPC tag is yellow), the phone tabs, every input widget, every card and the title. `dev/ui.html` shows a gallery of every component in every state.

**DoD:** no Chinese literals in `src/ui`; every UI element is reachable by keyboard; nothing overflows at 1280×720 or at 960×540.

### 3.F `story` — narrative content and direction
**Files:** `src/story/**`, `src/data/{story,dialogue,items,puzzles,wx,show,interacts}.ts`, `src/data/ids/story.ts`, `src/data/zh/{story,dlg,wx,cards}.ts`, `dev/story.html`.
**Public API:** `createStory: ModuleFactory<StoryApi>`.

**Consumes**
- core: `rules.loadStory` / `run` / `onAction('beat')`, `interact.registerInteractable`, `physics.registerZone`, `store`, `player`, `cameraRig.push`, `fade`, `input.pushContext('cutscene')`;
- services:
  - `ui`: `talk`, `startNode`, `showCard`, `pushWx`;
  - `lens`: `darkroomReveal`;
  - `chars`: hero animations and expressions, NPC spots, `busZero`; F may toggle `visible` on public roots during cutscenes;
  - `world`: spots, anchors;
  - `render`: `setPalette` for the endings;
  - audio, through `sfx` events.

**Data it owns** (the GDD content, typed by §2.5)
- **`story.ts`:**
  - `CHAPTERS` (§10.1);
  - `STORY_RULES`: every row of §10.2 in order, each with the chapter `guard` GDD §10.2 now lists, plus the `me.*` node effects listed there, bestiary 3/6 → `wx_bst3` / `wx_bst6`, the `all_frames` logic, `frame4_registered → {node:'att.registered'}`, and the puzzle clocks via `setClock`;
  - `BEATS`: a `BeatDef` per `BeatId` whose `end` actions reproduce the beat's state effects (used by quiet runs, `skip()` and `solve()`);
  - `OBJECTIVES` (§10.6): text keys and `SmokeRule`s;
  - `ZONES`: e.g. `sp_locker` 6 m, `sp_estate_gate_inner` 1.5 m, `sp_chai` 15 m;
  - `CHAPTER_BOOT`: the `ChapterBoot` state per chapter, used by `?chapter` and `setChapter`.
- **`dialogue.ts`:** `NODES` for all of §11, including `memo_1..3`, the show-reaction nodes, the gate-outcome nodes, and the interact nodes for §11.13. Nodes that open a UI set `noFixedOptions`.
- **`zh/dlg.ts`:** the lines for those nodes.
- **`wx.ts`** + **`zh/wx.ts`:** §11.12.
- **`show.ts`:** `SHOW_REACTIONS`, `SHOW_FALLBACK`, `GATE_OUTCOMES` (§12).
- **`items.ts`:** `ITEMS`, `PRESET_PHOTOS` metadata, `CLUES` (§7).
- **`puzzles.ts`:** `PUZZLES` (§9: steps, hints, `clockAfter`), `BEAT_HINTS` (GDD §13) and `INPUTS` (answers per GDD §18.4, including the namepicker characters).
- **`interacts.ts`:** every §11.13 row, plus the extra ids from §2.8.14 (studio and darkroom objects, the frame ① and dot pickups, the tripod, the bus door, the three exits). Chapter guards in `when` (e.g. the locker needs `ch1_started`; the milkbox grid needs `P5_started`); `it_gantry` has `priority: 10` while `name_known && !gantry_open`; `it_lh_switch` has `peek: 'lh_door'`; `it_bus_door` needs `bus_arrived` and uses `talkAs: 'attendant'`.
- **`zh/story.ts`:** keys `txt.*`, `item.*`, `clue.*`, `obj.*`, `pz.*`, `hint.*`, `ch.*`, `sys.*`.
- **`zh/cards.ts`:** the chapter cards, 聊斋卡 (§10.5), the epilogues (§15) and the credits (§15.3).

**Code**
1. **`glue.ts`:**
   - Registers every `INTERACTS` entry:
     - `enabled` = `evalCond(when) && (def.peek ? lens.state.peek === def.peek : lens.state.peek === null)`; `priority` is passed through;
     - `node` → `ui.startNode`;
     - `talkAs`, or no node and no actions → `ui.talk`;
     - `actions` → `rules.run`.
   - Registers the `ZONES` and calls `rules.loadStory(STORY_RULES)`.
   - Handles `beat` actions.
   - Emits `puzzleSolved` when a `solvedFlag` is set.
   - When the viewfinder opens in `studio_int` with `dk_hung` set and `developed` unset: `await lens.darkroomReveal()`, then `playBeat('S_darkroom')`.
   - Special-case code is allowed only for the gantry (turn around + `hero.setScreen('ridecode')`).
2. **`director.ts`:** a small sequencer on sim time (`seq`, `par`, `wait(s)`, `camPath`, `say(node)`, `card`, `fade`). It holds `input.pushContext('cutscene')` while a beat runs. **A beat never waits for gameplay input.** Interactive stretches (darkroom trays, tripod timer, ending choice) are handled by interacts, rules and nodes. `skip()` jumps to the beat's end state, which is always a state where the player has control again.
3. **Beats** (GDD §9):
   | Beat | Contents |
   |---|---|
   | `S_wake` | epigraph, chapter card, sit-up, `me.wake`, friend request + `wx_tudi_added`, `M_wake_face` |
   | `S_mirror` | dialogue + `M_mirror_face` |
   | `S_sunset` | an 8 s roof orbit showing the lighthouse turning on, the crane light and the chai twitch → 卷二 → chapter 3 → land at `sp_fire_ladder` |
   | `S_zhe` | the dot drops, the glyph cascade, the faces restore, a 3 s cut to `sp_estate_window` with `granny.window_cut`, then `chai.after`, then `me.zhe`, then `wx_zhe` |
   | `S_darkroom` | only the scripted tail after the reveal: envelope, `me.developed`, 卷三, finale boot. The trays are interacts gated by appended flags (`dk_tray_1..3`, `dk_hung`) |
   | `S_group_photo` | only the intro: lineup + `xiaolin.group_start`. The tripod is D's gameplay; success → rules → dialogue → `chars.busZero.arrive` → `bus_arrived` |
   | `S_ending_A` / `S_ending_B` | §15: the bus departs or stays; the camera rises to the title framing (`cameraRig.setTitleMode(true)`, palette `dawn`, or `day` for B); white flash, photo card, epilogue, 终卷 card, credits (F keeps the title orbit + palette running behind E's credits column); `credits_done` → `store.markCleared()` → palette `title` → `ui.showTitle()` |
4. **`startGame`**, **`continueGame`**, **`bootChapter`**, **`solve`**, **`smokeTarget`**, per the contract.

**Self-test**
- vitest `story.golden.test.ts`: a node-only harness that uses the real core store and rules with fake services (lens shots return target tags directly; the UI resolves instantly). It runs the GDD §19.3 sequence at the logic level and asserts every flag in order.
- Consistency tests:
  - every `NodeId` in `NODES` has `DLG` lines, and vice versa;
  - every `WxId` has text; every `InteractId` has a def;
  - every referenced `SpotId`, `TargetId` and `StrKey` exists;
  - `CHAPTER_BOOT[c]` contains the flags that chapter c's first puzzle requires.
- Visual: beat keyframes through `shot.mjs` (for example `?chapter=ch2&flags=P5_done` shows `S_sunset` frames).

**DoD:** no Chinese literals in `src/story`. Once D and E are in, the golden-path suite passes in the app.

---

## 4. Integration

### 4.1 Interaction map (all integration points go through core registries or the bus)
| Flow | Mechanism |
|---|---|
| E key in gameplay | core `interact` → F's `InteractableDef.onInteract` → `ui.talk` / `ui.startNode` or `rules.run` |
| Talking to NPCs | E registers a talk interactable per actor (`npc:<id>`) from `core.actors` (C registers NPCs, B registers `chai`) |
| E on a spirit in the night viewfinder | D → `ui.talk(actorId)` |
| Photo → story | D runs `rules.run(onShot.actions)` and emits `photoTaken` → F's rules |
| Story → presentation | `rules.run` actions: `card` / `node` / `wx` / `ui` / `toast` / `memo` → E; `beat` → F; `photo` / `detach` → D; `uncanny` / `sfx` → bus (A, B and C listen); `chapter` → store → `phaseChanged` (A palette, B world state, C schedules, E HUD) |
| Signal | B `signalChanged` → C (hero screen), E (HUD), F (rule `sms_full`) |
| Zones | F registers them → core emits `enterZone` → F's rules (`locker_seen`, `ch2_started`, the chai wake node) |
| Faces | C `faceState` / `faceTexture` → B (portrait wall), D (re-renders `ph_2006_group`) |
| Mirror | D's LiveView → `world.setMirrorTexture` |
| Smoke | D (viewfinder open > 1 s) + `story.smokeTarget()` → `render.setSmoke` |
| Sound | any module emits `sfx` → A |
| Save / continue / chapter boot | `store.replace` → `stateLoaded` → every module re-syncs |
| **Title screen** (who builds what) | B: planet body + town (the same meshes as gameplay) · A: `title` palette, far-side dressing, sky specks, fog/shadows/line-fade off · core: `cameraRig.setTitleMode(true)` orbit (φ 0.05 rad/s; this is the GDD's "slowly rotating planet") · E: lettering, 「开机」/「继续」/「设置」 · main.ts: calls `ui.showTitle()` + `setTitleMode(true)` at boot · F: `startGame` / `continueGame` turn title mode off |
| **Endings and credits** | E's `att.bus` choice → `ending_A/B` rule → F beat: bus (C `busZero.depart`), camera pull-back (F director + core rig title mode), palette (A via `render.setPalette`), cards and credits DOM (E) → `credits_done` → core save reset → F `ui.showTitle()` |
| **Uncanny events** (`UncannyId`) | emitted by F rules/beats (`M_wake_face`, `M_mirror_face`, `M_chai_wake`, `M_lighthouse_off`, `M_zhe`) or by C (`M_zhimei_move`); `M_subway` is implied by `scene === 'subway_int'` (A). Listeners: A (envelopes, sky, boil, drone), B (chai spin/cascade, lighthouse dark), C (hero face flashes, screen static) |

### 4.2 Integration order (Phase 2, agent I)
1. **Freeze check:** frozen files are unchanged. Apply `docs/integration/requests-*.md`.
2. **Static checks:** `npm ci`, `npm run typecheck`, `npm test` (all modules), `node scripts/check-gdd-ids.mjs`, `crossref.test.ts`, `no-cjk.test.ts`.
3. **Look (A + B + C):** day, night and title shots; the ART Appendix A checks; fix slips in the material, surface-id and layer contracts.
4. **Lens (D against the real world):** every row of `?dev=lens:targets` passes; the P8 geometry holds.
5. **Story (E + F):** the dialog checkpoint, cards and phone; then `npm run e2e:golden`.
6. **Performance:** budgets per checkpoint (§5). If needed, cut in the GDD §21.2 order. Never cut anything in §21.3.
7. **Polish loop:** `--suite checkpoints` screenshots, compared by eye with the reference captures; iterate.

### 4.3 Final integration checklist
- [ ] `npm ci` is clean (no dependency drift) and `npm run build` passes. The bundle, excluding three, is ≤ 1 MB minified.
- [ ] typecheck reports 0 errors, and all of these pass:
  - vitest (all modules);
  - `check:ids`;
  - `crossref.test.ts`: every id and key referenced in data exists, and zh key prefixes are unique per section;
  - `no-cjk.test.ts`: no CJK outside `src/data/**` and test files.
- [ ] `npm run e2e` (boot suite) passes: 0 console errors and 0 page errors, and every shot is written.
- [ ] `npm run e2e:golden` reaches `credits_done`, with every per-step flag assertion passing.
- [ ] `--suite checkpoints`: all 14 GDD §19.4 checkpoints (incl. `roof_view`) and the automated ART Appendix A checks pass, and the PNGs have been reviewed by eye against the reference captures. `scripts/checkpoints.json` (pixel rects for the wall-luma and sky checks) is filled from the first reviewed baseline.
- [ ] **Manual-only checks** (the smoke test cannot verify them; record the result in AGENTS.md): line character and breaks look hand-drawn; the hero reads at 60 px tall; every `sfx_*` sounds right (headless AudioContext is always `running`); pointer lock and the 「点击画面开始」 prompt (unavailable headless); touch controls if built; Google fonts actually loaded (not the fallback) on a networked run; the `[目测]` items in GDD §19.4.
- [ ] Every checkpoint: triangles ≤ 150k, draw calls ≤ 120, `timeRender(8)` < 60 ms (SwiftShader, 1280×720), shader programs ≤ 20.
- [ ] Save round trip: play into ch2 via `__game`, then reload with `?save=1` and without `?test`. 「继续」 restores chapter, phase, flags, photos and position, and the world, NPC and lens state look consistent.
- [ ] Each `?chapter=` value boots to a playable state without errors, and all four `?phase=` values work.
- [ ] No `⟦` appears in the DOM text of any screenshot, and there is no tofu (fonts load, or the WenQuanYi fallback renders).
- [ ] Every testid from GDD §19.2 is present.
- [ ] Endings A and B are both reachable. The credits return to the title, and `cleared` is recorded.
- [ ] `?lowfx=1` works, `?mute` is silent, and Esc / pause / settings and the pointer-lock prompt work.
- [ ] Integration findings are added to AGENTS.md → Lessons.

### 4.4 Test tooling contract (owner S)

#### `scripts/lib/browser.mjs`
- `launch()` starts Chromium from `playwright` with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, viewport 1280×720, `deviceScaleFactor` 1.
- A 2-slot semaphore for the whole machine: `mkdir /tmp/cmm-browser-slot-{0,1}`. A slot is stale after 10 min and is released on exit.
- `attachErrorCollector(page)` collects:
  - `pageerror`;
  - `console` messages of type `error`, except those whose location URL is on `fonts.googleapis.com` or `fonts.gstatic.com`;
  - failed same-origin requests.

#### `scripts/smoke.mjs` (`npm run e2e`)
**Command line**
| Flag | Meaning |
|---|---|
| `--base <url>` | use a running server (required in Phase 1). Without it, the script builds with `vite build --outDir .smoke/dist --emptyOutDir` and serves `vite preview --outDir .smoke/dist --port 4174 --strictPort` |
| `--suite boot\|golden\|checkpoints\|all` | default `boot` |
| `--out <dir>` | default `test-results/smoke` |
| `--strict-perf` | make the `timeRender` warning a failure |

**Page loading and `settle()`**
- Every page: `goto(url)`, then `waitForFunction(() => window.__game?.ready === true, { timeout: 90_000 })`.
- `settle()` loops at most 300 times:
  1. `step(5)`.
  2. If `state().busy.card || busy.beat`: `skip()`.
  3. Otherwise, if `busy.dialogue && choices === 0`: `advance()`.
  4. Stop when `!busy.any` or `choices > 0`.

**`boot` suite** (every URL carries `test&seed=1&mute`)
| # | Page / calls | Asserts | Screenshot |
|---|---|---|---|
| 01 | `/?test…` | `[data-testid=title-start]` is visible | `01-title.png` |
| 02 | click `title-start` → `settle()` | flags include `game_started` | `02-wake.png` |
| 03 | `/?…&skipTitle&at=sp_bus_bench` → `step(2)` | stats within budget; `timeRender(8)` recorded | `03-day-start.png` |
| 04 | `step(90, 1/60, {x:0, y:1})` | moved ≥ 3 m along the surface; `\|pos\|` ∈ [80, 86] | `04-walk.png` |
| 05 | `viewfinder(true); step(30)` | `evalShot().frame` ∈ {white, yellow, green}; `vf-frame` visible | `05-viewfinder.png` |
| 06 | `/?…&chapter=ch1&at=sp_store_door` → `talk('xiaolin'); step(30)` | `dialog-box` visible; `dialog-name` and `state().dialogue.text` non-empty | `06-dialog.png` |
| 07–09 | `/?…&skipTitle&phase=dusk&at=vp_temple_2011` · `phase=night&at=sp_store_front` · `phase=dawn&at=sp_tripod` | budgets | `07-dusk.png` `08-night.png` `09-dawn.png` |
| 10 | `/?…&chapter=ch1&flags=P2_done&at=st_entry` | `state().scene === 'studio_int'` | `10-studio.png` |
| 11 | `/?…&chapter=ch3&at=sw_gantry` | `scene === 'subway_int'` | `11-subway.png` |
| 12 | from 03: keyboard `Tab`, `step(10)` | `[data-testid=phone-tab-album]` visible | `12-phone.png` |

Every page also asserts `!document.body.innerText.includes('⟦')`.

**`golden` suite:** exactly GDD §19.3, on one page (`/?test&seed=1&mute&skipTitle`). Run `settle()` after every row of calls, check that row's flag assertions, and save `golden-NN-<step>.png` after each step. Note that `settle()` never waits for gameplay timers (tripod countdown, night exposure); rows that need them advance time explicitly (`step(660)` in the group-photo row).

**`checkpoints` suite:** the 14 GDD §19.4 checkpoints, saved as `cp-<name>.png`. Per checkpoint: load the URL, run its calls, then `settle()` unless the row says 「截图前不 settle」, then capture. The pixel checks are computed in the page from `__game.snapshot()`: sky colours, ink ratio, luma, the dialog centre pixel, no `#000000`, crest height, the title bounding box. Region-based checks read their rectangles from `scripts/checkpoints.json` (owner S; values filled by I); a missing rect makes that check a warning, not a failure. State-based checks use `state()` (`actors`, `faceState`, `photos`, `lens`).

**Budgets per screenshot:** triangles ≤ 150 000 and draw calls ≤ 120, otherwise the run fails. `timeRender(8)` > 60 ms is a warning, or a failure with `--strict-perf`.

**Output:** the PNGs plus `report.json`:
`{ suite, base, shots: [{ name, file, calls, triangles, programs, ms?, checks }], errors: [{ page, kind, text }], failures: [...], passed }`.
The exit code is 1 on any failure or any collected console or page error.

#### `scripts/shot.mjs`
Arguments: `--base --url --do "<__game call>"` (repeatable) `--steps N --out file.png [--wait-ready 90]`. It prints the stats and any collected errors as JSON, and exits with 1 on errors.

#### `scripts/tsc-scope.mjs <paths…>`
Runs `tsc --noEmit -p .` and prints only diagnostics under the given paths. The exit code reflects only those diagnostics.

---

## 5. Performance budget, rules and conventions

### 5.1 Frame budget (headless Chromium + SwiftShader, 1280×720, DPR 1)
| Item | Hard cap (smoke fails) | Target |
|---|---|---|
| Triangles per frame (`renderer.info`, incl. shadow + FX + composite) | 150 000 | ≤ 110 000 |
| Draw calls per frame (same count) | 120 | ≤ 80 |
| `timeRender(8)` | 60 ms (warning) | ≤ 45 ms |
| Shader programs | 20 | ≤ 16 |
| Boot to `ready` (`?test`) | 60 s | ≤ 20 s |

**Per module** (planet exterior, at any spot, after horizon culling)
| Owner | Triangles | Draw calls | Notes |
|---|---|---|---|
| B world | ≤ 85k visible (≤ 350k built) | ≤ 45 | chunks merged per material per sector; ≤ 10 instanced prop types visible; windows are 1 call per chunk |
| B interiors | ≤ 5k each | ≤ 10 | |
| C characters | hero 3.5k (4 calls); NPC 1.8k (2 calls) each; ≤ 8 NPCs on screen; pedestrians in 1 instanced call | ≤ 22 | |
| A | composite 1 tri; FX ≤ 2k tris; title dressing ≤ 20k (instanced, `detail`) | ≤ 8 | |
| Shadow pass | casters only: buildings, big props, hero, and NPCs within ±22 m; **≤ 35k triangles** | ≤ 25 | small clutter sets `castShadow = false`. Sum of the exterior rows: 85k + ~19k + 2k + 35k ≈ 141k ≤ 150k |

**Wide views** (title orbit, ending pull-back, the `S_sunset` roof orbit, the bridge deck): horizon culling barely helps there, because from 460 m or from h ≈ 20 m almost the whole town is above the horizon. The budget holds only because of two rules: B's non-`detail` geometry is ≤ 90k triangles in total, and core hides `detail` objects beyond 45 m of arc or when the camera is > 60 m up (§2.8.7). Title: ≤ 90k town + 5k planet + ≤ 20k dressing, shadows off. The GDD §19.4 `roof_view` checkpoint measures the worst in-game case.

**Textures (GPU)**
| Texture | Limit |
|---|---|
| façade atlases | ≤ 4 × 2048×1024 |
| any other canvas | ≤ 1024²; signs ≤ 512×256; hero screen 128×256; face atlas 512² |
| cloud / noise | 1024×512 / 128² |
| MRT | RGBA8 ×2 + depth |
| shadow map | 1024² (test / low), 2048² (high) |
| captures / mirror | 480×270 (+ one reused RT) / 256² |
| **total** | ≤ 96 MB |

- Every colour canvas uses `SRGBColorSpace`; data textures use `NoColorSpace`.
- Ramps and noise-like textures use `NearestFilter`.
- No HalfFloat anywhere.

**CPU per tick ≤ 6 ms**
- `evalShot`: at most 3 candidates fully evaluated per frame, each with ≤ 5 occlusion rays against the coarse proxies, never against full chunk meshes.
- The scenery-label raycast runs at ≤ 10 Hz.
- The hero screen redraws only on change (≤ 4 Hz).
- The mirror LiveView updates only in the viewfinder, within 8 m.
- No per-frame `new Vector3` or closures in update paths.
- `matrixAutoUpdate = false` on static objects.
- Every planet chunk goes through horizon culling.

### 5.2 Rendering rules
1. Main-pass scenes contain only `makeToonMaterial` materials.
   - Transparent and additive objects go only in `render.fxScene(id)`.
   - Never use `scene.background`, `Sprite`, `LineBasicMaterial`, PBR materials, tone mapping, MSAA/FXAA, EffectComposer or Reflector.
2. Geometry:
   - Static geometry: `paint` + `mergePainted` per chunk.
   - Repeated props: `InstancedMesh`; call `computeBoundingSphere()` after `setMatrixAt`.
   - Author Y-up and facing +Z; place only through `core/planet`.
   - Ground, roads and long rails are wrapped per vertex, tessellated at ≤ 2 m.
3. Every render target uses `UnsignedByteType`. There is one post chain (the composite). Pixel ratio is 1 in tests.
4. Bake canvas text only after `warmFonts()`, and pass the exact text to `ensureFont`.
5. Timers come from `core.clock`; randomness from `core.rng`.

### 5.3 Coding conventions
- **TypeScript**
  - strict, per §1.3;
  - **no `any` in exported signatures**: use `unknown` and narrow; an internal `any` needs a one-line justification comment;
  - no `enum`, no `namespace`, no constructor parameter properties (`erasableSyntaxOnly`);
  - `import type` for type-only imports;
  - ESM only; relative imports without extensions.
- **Files:** ≤ 400 lines (hard limit 600), one concern per file. A module's `index.ts` is its only public entry.
- **Naming:** files `camelCase.ts`; types and classes `PascalCase`; functions and variables `camelCase`; constants `UPPER_SNAKE`; content ids `snake_case`, exactly as in the GDD.
- **Units:** metres; degrees in data (`lon`, `yaw`, `pitch`, headings); radians inside math; seconds of sim time.
- **Text:** no Chinese literals outside `src/data/**` (tests may contain Chinese); every player-facing string goes through `t()`.
- **DOM:**
  - all UI lives under `core.uiRoot`;
  - every element a test asserts on has a `data-testid`;
  - CSS classes carry a module prefix (`ui-`, `vf-`);
  - `pointer-events` only on interactive elements.
- **Errors:**
  - never `console.error` (reserved for real bugs; smoke fails on it);
  - use `core.log.warn` for recoverable content problems;
  - `init()` and updates never throw because of bad data: warn and continue.
- **Tests:** `src/**/<name>.test.ts` in the node environment. No DOM or WebGL in vitest: keep logic pure and put canvas-dependent code behind small interfaces.
- **Comments:** short, in English, citing GDD / ART / TECH sections (`// GDD §3.4`).

---

## 6. Risks & Mitigations

Ordered roughly by expected damage. "Detect" names the check that catches the problem; "Owner" is who fixes it (I = integrator in Phase 2).

| # | Risk | Mitigation | Detect | Owner |
|---|---|---|---|---|
| 1 | **SwiftShader frame time > 60 ms**, worst in wide views (title, roof orbit, bridge deck) where horizon culling barely helps | Non-`detail` town ≤ 90k tris; `detail` hidden beyond 45 m of arc or > 60 m up (§2.8.7); shadow casters ≤ 35k; RGBA8 only; one composite pass; then `?lowfx=1`; then the GDD §21.2 cut order (never §21.3) | `timeRender(8)` per shot; the `roof_view` and `title` checkpoints; `report.json` | B, A, I |
| 2 | **Shader-compile stalls** (no `KHR_parallel_shader_compile` on SwiftShader) and program explosion from per-material defines | One `makeToonMaterial` factory with a shared cache key; night/uncanny/flash are uniforms, not defines; `render.compile()` on the title; ≤ 16 programs target, 20 cap | `stats().programs`; boot-to-ready ≤ 60 s | A |
| 3 | **Phantom ink / garbage lines** from any main-pass material that doesn't write MRT location 1 (Sprite, LineBasicMaterial, `transparent`, `scene.background`, a raw `MeshBasicMaterial`) | Factory-only rule (§5.2); FX objects only in `render.fxScene`; the dev check `console.error`s offenders, and smoke fails on any console error | boot suite 0 errors | A (check), B/C/D (compliance) |
| 4 | **Six agents in one working tree**: a half-written file or a frozen-file edit breaks everyone's typecheck | Whole-file writes; `tsc-scope.mjs` per agent; frozen S files; change requests go to `docs/integration/requests-<id>.md`; no git writes; no dependency changes | `npm run typecheck` in Phase 2 step 1; frozen-file diff check | all; I applies requests |
| 5 | **Contract gaps found mid-phase** (a type or API someone needs is missing) | This review added the missing shapes (§2.4 item 15, §2.8.16); remaining gaps: local workaround + request file, never an edit to `types.ts`/`contracts.ts` | request files; `crossref.test.ts` | S up front, I later |
| 6 | **Id / key drift** between GDD, data files and code (renames, typos, zh prefix collisions) | Ids are append-only unions in `src/data/ids/*`; `check-gdd-ids.mjs`; `crossref.test.ts` fails on unknown ids, unknown `StrKey`s and duplicate keys across zh sections; `t()` shows `⟦key⟧` for misses | `npm run check:ids`, vitest, the `⟦` DOM check | S (tools), owners |
| 7 | **Nondeterministic screenshots** (Math.random, `performance.now`, CSS animations, cloud drift, boil) | `core.rng` / `core.clock` only; `?test` freezes clouds, zeroes boil, disables CSS animation; S adds a vitest grep that fails on `Math.random`, `performance.now` and `Date.now` in `src/` outside `render/timeRender` | two identical checkpoint runs must match within `maxDiffPixelRatio 0.002` | S (test), all |
| 8 | **Puzzle geometry is fragile** (P8 lamp shade vs dot, P4 lion framing, P5 gallery slabs, P9 three-way framing, P1 tile viewpoint) and silently breaks when B moves a building ±2 m | Viewpoints and occluders are **computed by construction rules at init**, not hard-coded (GDD §0.2, §5.4 †/‡); B unit-tests the P8 construction; `?dev=lens:targets` walks every target and prints pass/fail | the `lens:targets` table; golden suite; `night_chai` checkpoint | B, D |
| 9 | **Font dependency**: Google Fonts offline or slow → tofu, different baselines, and a different 拆−折 dot position | 3 s font race with the WenQuanYi fallback; canvas text only after `warmFonts()`; the P8 dot is derived from the glyphs actually drawn, so geometry follows the font; pick one font mode for baselines and document it in the smoke script | `document.fonts.check` in the `title` checkpoint; P8 unit test | S, B |
| 10 | **Occluder proxies disagree with what the photo shows** (evalShot says clear while a slab or railing hides the target, or a façade anchor is hidden by its own wall) | Anchors ≥ 0.1 m outside their proxy; galleries/railings/nets are not proxies; B keeps proxies coarse but faithful; the integrator eyeballs every `lens:targets` photo once | `lens:targets` photos reviewed by eye | B, D |
| 11 | **Soft-locks from save/load mid-beat** or from out-of-order play (e.g. doing P5 before `S_mirror`, reaching the site by walking round B1 on the beach) | No saves during beats/cards/pending actions; `BeatDef.end` for quiet/skip; rules re-evaluate on `stateLoaded`; chapter guards on every rule and interact; P5 milkbox gated by `P5_started`; B1/B2 cut r 13–62; closed boundary colliders; `walkcheck` | save round-trip test per chapter; `?dev=world:walkcheck`; golden suite | S, F, B |
| 12 | **Player leaves the playable surface** (walks onto the sea, clips into a building after a teleport, falls off the pier) | Boundary colliders (GDD §5.6); walk-surface step limit 0.45 m; `goto` uses `stand` points; core clamps the player to r ≤ 71 m and h ≥ 0 and, if still inside a collider after 2 iterations, snaps to the nearest registered spot | `?dev=world:walkcheck`; boot step 04 | S, B |
| 13 | **Hidden timing assumptions in tests** (`settle()` does not wait for gameplay timers; teleports close the viewfinder) | GDD §19.3 rows advance time explicitly (`step(660)`) and reopen the viewfinder after `goto`; debug `zoom/lens/aim/shoot` auto-open it | golden suite | S, D |
| 14 | **What headless tests cannot see**: pointer lock, audio unlock (context starts `running`), audio quality, touch, "hand-drawn" feel, font actually loaded | Explicit manual checklist in §4.3; OfflineAudioContext RMS page for every `SfxId` | manual sign-off in AGENTS.md | I |
| 15 | **localStorage quota** with 40 photos + presets | 480×270 JPEG q 0.8 (~30 KB), eviction of non-`keep` photos, quota fallback that saves without photos; presets are re-rendered, not stored | store vitest (quota fallback) | S |
| 16 | **CPU per tick** (evalShot occlusion rays, label raycasts, mirror LiveView) pushes SwiftShader over budget | ≤ 3 candidates × ≤ 5 rays against coarse proxies; labels at 10 Hz; mirror only in the viewfinder within 8 m; no per-frame allocation | `timeRender` with the viewfinder open (`day_viewfinder`, `mirror` checkpoints) | D |
| 17 | **Night readability regresses** (dark walls, invisible lines on silhouettes, uncanny baseline tinting the sky) | ART §2.2 raised night bands, ambient floor, halo ink, shifted `uUncW` weight | `night_store` checkpoint luma and sky checks | A |
| 18 | **Scope overrun** in one parallel pass (9 puzzles, 6 beats, 2 endings, 6 bestiary entries) | Logic-level golden test in F runs the whole story with fake services before visuals exist; S stubs keep every module runnable; GDD §21.2 cut order is pre-agreed | `story.golden.test.ts`; Phase 2 perf/feature review | F, I |
| 19 | **Browser-slot starvation** (two stale Chromium slots block every agent) | 2-slot semaphore with 10-minute staleness and release on exit; keep runs short; never more than 2 browser-heavy agents | `shot.mjs` wait messages | S |
| 20 | **Toolchain drift** (TS 7 as npm `latest`, r186 deprecation warnings, EffectComposer's HalfFloat default) | Exact pins in §1.2; `npm ci`; no EffectComposer; Basic shadow map; `Timer` instead of `Clock` | `npm ci` clean; console warning review in Phase 2 | S, A |

## Appendix — `scripts/owners.json`
```json
{
  "S": ["index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "playwright.config.ts", ".gitignore",
        "scripts/**", "e2e/**", "src/main.ts", "src/debug.ts", "src/types.ts", "src/events.ts", "src/contracts.ts",
        "src/core/**", "src/art/**", "src/data/zh.ts", "src/data/crossref.test.ts", "src/data/no-cjk.test.ts", "dev/core.html"],
  "A": ["src/render/**", "src/audio/**", "src/data/phases.ts", "dev/render.html", "dev/audio.html"],
  "B": ["src/world/**", "src/data/locations.ts", "src/data/ids/spots.ts", "src/data/zh/world.ts", "dev/world.html"],
  "C": ["src/chars/**", "src/data/npcs.ts", "src/data/zh/chars.ts", "dev/chars.html"],
  "D": ["src/lens/**", "src/data/photoTargets.ts", "src/data/labels.ts", "src/data/bestiary.ts", "src/data/ids/lens.ts",
        "src/data/zh/lens.ts", "dev/lens.html"],
  "E": ["src/ui/**", "src/data/ids/ui.ts", "src/data/zh/ui.ts", "dev/ui.html"],
  "F": ["src/story/**", "src/data/story.ts", "src/data/dialogue.ts", "src/data/items.ts", "src/data/puzzles.ts", "src/data/wx.ts",
        "src/data/show.ts", "src/data/interacts.ts", "src/data/ids/story.ts", "src/data/zh/story.ts", "src/data/zh/dlg.ts",
        "src/data/zh/wx.ts", "src/data/zh/cards.ts", "dev/story.html"],
  "shared-append-only": ["AGENTS.md"],
  "per-agent": ["docs/integration/requests-<id>.md"]
}
```
