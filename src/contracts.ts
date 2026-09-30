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
  /** P3r3 G8: once released, how long the last hold of `a` lasted in WALL time (ms, the DOM events' own timestamps);
   *  null while held or for injected presses. Sim time cannot tell: a long frame (a capture stalling 1.5 s on
   *  SwiftShader) advances the sim only 1/20 s, so the mouseup lands "0.05 s" after the press. */
  holdWallMs?(a: InputAction): number | null;
  context(): InputContext;                        // top of the context stack
  /** Pushing releases every held source, except the actions in `keep` (Phase 2, I: D's hold-to-aim / burst). */
  pushContext(c: InputContext, owner: string, o?: { keep?: readonly InputAction[] }): () => void;
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
  /** P3r3 G9: the stored save is a cleared run's ending checkpoint (the bus at the stop, choice open). */
  saveCleared?(): boolean;
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
  /** P3r2 (camera): ease the NEXT camera change (a push, a pop) from the current pose over `seconds` of sim time
   *  (smoothstep on position / orientation / fov) instead of cutting. Optional so test doubles need not implement it. */
  blend?(seconds: number): void;
}

export interface InteractableDef {
  id: string; scene: SceneId;
  at: Pos | (() => Vector3);
  radius?: number;                    // default 2.5
  prompt: PromptVerb; promptKey?: StrKey;
  enabled?: () => boolean;
  priority?: number;                  // tie-break after distance
  ignoreFacing?: boolean;             // skip the ±60° facing cone
  /** P3r3 G1: the facing cone is skipped while the anchor is this close horizontally (default 0.3 m): a door the
   *  player stands against counts whichever way the body slid along it. */
  nearFree?: number;
  onInteract(): void | Promise<void>;
}
export interface InteractApi {
  registerInteractable(d: InteractableDef): Handle;
  current(): { id: string; prompt: PromptVerb; promptKey: StrKey | null; anchor: Vector3 } | null;
  trigger(): Promise<void>;           // same as pressing E in gameplay context
  /** Phase 2 (I): recompute the pick now (it otherwise updates once per tick in the gameplay/peek contexts). */
  repick(): void;
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
  /** P3r2 (camera): compile the see-through / fade (screen-door) block in: occluder candidates between the follow
   *  camera and the hero (rails, posts, benches, small props) and characters (`uFade`). Off = no discard at all. */
  seeThru?: boolean;
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
  setSmoke(path: { from: Vector3; to: Vector3; via?: readonly Vector3[] } | null): void;     // 土地的烟 (GDD §3.12); P3: via = route
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
  /** P3r2 look L2: scripted steps (the ending's boarding shot): the walk cycle runs at `mps` while a beat slides `root`
   *  along his facing; null hands the legs back to the player's real speed. Optional (test doubles). */
  scriptWalk?(mps: number | null): void;
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
  readonly busZero: {
    readonly root: Object3D; arrive(seconds: number): Promise<void>; depart(seconds: number): Promise<void>;
    /** P3r3 look L3 (ending A, optional for test doubles): the attendant floats back in from the doorway; the door shuts. */
    board?(seconds: number): Promise<void>; closeDoor?(seconds: number): Promise<void>;
  };
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
  /** P3 (G1): the one darkroom range test (feet in the darkroom, ≤ 4 m of dk_line) shared by story glue and the lens. */
  darkroomInRange?(): boolean;
  lastPhotoId(): string | null;
  isNightView(): boolean;                         // Cond.lens === 'night'
  /** Phase 2 (I): absolute look while the lens is active (viewfinder pitch −60..+70; peeks clamp around their base).
   *  `__game.look()` routes here instead of the follow rig (whose pitch is clamped −30..+20). */
  look?(yawDeg: number, pitchDeg: number): void;
  /** P3r3: the night-view crosshair talk right now, without the E gate (a real E is swallowed for TALK_GUARD s after a
   *  dialogue so mashing never reopens it; `__game.interact()` calls this). False when nobody answers. */
  nightTalk?(): boolean;
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
  /** P3 wayfinding: the current objective STEP (chip text, where the smoke / HUD arrow lead, the walkable route). */
  smokeStep?(o?: { textOnly?: boolean }): SmokeStep | null;
  // P3r2 look L7: `textOnly` (the HUD chip) never computes a route: it reuses the last cached one (may be stale / direct)
}
/** P3 wayfinding. `route` = flat chart points of `scene` at feet level (x = r·sin lon, z = r·cos lon; interiors local
 *  x/z; h above base ground), first = the player now, last = where to stand; `end` = the spot itself (a prop may sit
 *  above its stand point). `direct` = no walkable route was found (a straight line). */
export interface SmokeStep {
  textKey: StrKey; spot: SpotId | null; scene: SceneId;
  route: readonly { x: number; z: number; h: number }[]; end: { x: number; z: number; h: number }; direct: boolean;
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
  /** Phase 2 (I-play): where 土地's smoke leads (StoryApi.smokeTarget) and the world position of that spot, so
   *  real-input play-feel runs can follow the in-game wayfinding like a player. Optional: older callers ignore it. */
  smoke?: { spot: SpotId; pos: Vec3Tuple } | null;
  /** Phase 2 (I-gate): `GameState.cleared` (set when the credits finish, GDD §10.2 #49), so smoke can assert
   *  ARCHITECTURE §4.3 "cleared is recorded". Optional: older callers ignore it. */
  cleared?: boolean;
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
