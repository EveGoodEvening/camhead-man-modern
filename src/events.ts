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
