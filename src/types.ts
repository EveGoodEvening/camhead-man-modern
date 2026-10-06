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
export type SpeakerId = NpcId | 'me' | 'system' | 'narr';   // narr = untagged narration (P3r2 text)
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
// P3r3 look L5: 'occluded' runs right after 'zoom' (was after 'dark'): a target hidden behind a pillar reported the
// face / distance hint of a subject the player cannot see (「人 · 老年女性 63%」 + 要正脸 through a stall).
export const SHOT_ORDER: readonly ShotCond[] = [
  'layer', 'zoom', 'occluded', 'dist', 'size', 'center', 'whole', 'facing', 'dark',
  'flash', 'viewpoint', 'overlay', 'hidden', 'contain', 'still',
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
  /** P3r2 G5: what the live recognition bar reads while this target is framed green (no %); the photo keeps `okKey`.
   *  For answers that only the photo may reveal (the P6 light trail's 「1987」). */
  liveKey?: StrKey;
  failKeys?: Partial<Record<ShotCond, StrKey>>;
  onShot?: { tags: readonly string[]; actions?: readonly Action[] };
  special?: 'granny_blink' | 'chai_dual' | 'light_trail';
  /** P3r3 G6: not a candidate while this other target is available (the generic 纸妹 portrait yields to
   *  T_zhimei_sea during P9's last step, so the frame says 「还缺：灯塔」 instead of turning green on the wrong photo). */
  yieldsTo?: TargetId;
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
  /** P3r3 G5: once this step flag is set, hints start at this tier (the T1 of a step already done is never sent). */
  hintFloor?: Partial<Record<FlagId, 2 | 3>>;
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
  /** P3r3 G1: for a STAND spot (a SpotId with a yaw and no `stand`), the object sits this many metres along the spot's
   *  yaw: the anchor (reach, facing cone, prompt label) goes there at `lift` m (default 1.0) above the spot instead of on
   *  the hero's feet. Negative = behind the stand point (a bench seat). */
  ahead?: number; lift?: number;
}
export interface WxDef { id: WxId; sender: 'tudi' | 'studio'; keys: readonly StrKey[]; memo?: 1 | 2 | 3 }
export interface ShowReaction {
  receiver: ReceiverId; tags: readonly string[]; when?: Cond; node: NodeId; actions?: readonly Action[];
}
export interface GateOutcome { node: NodeId; actions?: readonly Action[] }

// ---------- shared content defs (owner of the data file in brackets) ----------
export interface ItemDef { id: ItemId; nameKey: StrKey; descKey: StrKey; icon: 'key' | 'note' | 'negative' | 'dot' | 'envelope' } // [F]
export interface ClueDef { id: ClueId; textKey: StrKey }                                                                      // [F]
/** P3 wayfinding: `text` = the objective chip for this step (defaults to the objective's textKey; `nearest` rules read
 *  SMOKE_STEP_TEXT per chosen spot), so the chip always says what the smoke / HUD arrow lead to. */
export type SmokeRule = { when?: Cond; text?: StrKey } & ({ spot: SpotId } | { npc: NpcId } | { nearest: readonly SpotId[] });
export interface ObjectiveDef {                                                                                               // [F]
  id: ObjectiveId; textKey: StrKey; smoke: readonly SmokeRule[];   // smoke: first match wins
  hintFor?: PuzzleId | BeatId;                                     // GDD §13 rule 2
}
/** Hint target for the four beats that have hints (GDD §9: S_studio, S_mirror, S_darkroom, S_group_photo). [F] */
export interface BeatHintDef {
  id: BeatId; availableWhen: Cond; steps: readonly FlagId[]; doneFlag: FlagId; hints: readonly [StrKey, StrKey, StrKey];
  hintFloor?: Partial<Record<FlagId, 2 | 3>>;   // as PuzzleDef.hintFor (P3r3 G5)
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
