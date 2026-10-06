// src/story/director.ts — owner F. A tiny sequencer on sim time (ARCHITECTURE §3.F "director.ts"): wait / say / card /
// run / fade / camera overrides, all abortable. A beat never waits for gameplay input; skip() aborts the script and
// every pending step resolves at once, then the runner applies the beat's `end` (data/story.ts BEATS).
import type { PerspectiveCamera } from 'three';
import type { CameraOverride, Core } from '../contracts';
import type { Action, CardKind, NodeId } from '../types';

interface Wait { at: number; resolve: () => void }

export class Director {
  readonly core: Core;
  private waits: Wait[] = [];
  private abortResolve: (() => void) | null = null;
  private abortPromise: Promise<void> = Promise.resolve();
  private readonly cams = new Set<() => void>();
  private readonly tickers = new Set<(t: number) => void>();
  /** The director faded the screen to black and has not faded back yet (end() lifts it: a skip mid-fade must never
   *  leave the game black). */
  private black = false;
  aborted = false;
  /** Hard stop (chapter boot / new game): unlike skip(), the script's remaining side effects must not run at all. */
  stopped = false;
  label = 'beat';

  constructor(core: Core) {
    this.core = core;
  }

  /** Start a new script. */
  begin(label: string): void {
    this.label = label;
    this.aborted = false;
    this.stopped = false;
    this.abortPromise = new Promise<void>((r) => { this.abortResolve = r; });
  }

  /** skip(): resolve everything now; later steps become no-ops. `hard` (stopBeats): side effects stop too. */
  abort(hard = false): void {
    if (hard) this.stopped = true;
    if (this.aborted) return;
    this.aborted = true;
    this.abortResolve?.();
    this.abortResolve = null;
    const w = this.waits;
    this.waits = [];
    for (const x of w) x.resolve();
  }

  /** Loop hook ('logic' phase): resolves due waits and drives tickers. */
  poll(): void {
    const t = this.core.clock.t;
    for (const fn of this.tickers) fn(t);
    const ws = this.waits;
    let due = false;
    for (let i = 0; i < ws.length; i++) if (ws[i].at <= t) { due = true; break; }
    if (!due) return;                                   // the common case: no allocation per tick
    this.waits = ws.filter((w) => w.at > t);
    for (const w of ws) if (w.at <= t) w.resolve();
  }

  get t(): number { return this.core.clock.t; }

  /** Sim-time wait (resolves early on abort). */
  wait(seconds: number): Promise<void> {
    if (this.aborted || !(seconds > 0)) return Promise.resolve();
    return new Promise((resolve) => { this.waits.push({ at: this.core.clock.t + seconds - 1e-9, resolve }); });
  }

  /** Await another module's promise inside a beat (resolves early on abort). */
  hold(p: Promise<unknown> | void): Promise<void> { return this.aborted ? Promise.resolve() : this.race(p); }

  /** Race a presentation promise against abort. */
  private race(p: Promise<unknown> | void): Promise<void> {
    if (!p) return Promise.resolve();
    return Promise.race([p.then(() => undefined, () => undefined), this.abortPromise]);
  }

  say(node: NodeId): Promise<void> {
    if (this.aborted) return Promise.resolve();
    try { return this.race(this.core.services.ui.startNode(node)); } catch (e) { this.core.log.warn('[story] say failed', e); return Promise.resolve(); }
  }

  card(kind: CardKind, id: string): Promise<void> {
    if (this.aborted) return Promise.resolve();
    try { return this.race(this.core.services.ui.showCard(kind, id)); } catch (e) { this.core.log.warn('[story] card failed', e); return Promise.resolve(); }
  }

  /** Run story actions (loud) through the rules engine. */
  run(actions: readonly Action[]): Promise<void> {
    if (this.aborted) return Promise.resolve();
    return this.race(this.core.rules.run(actions, `${this.label}`));
  }

  fade(toBlack: boolean, seconds: number): Promise<void> {
    if (this.aborted) return Promise.resolve();
    this.black = toBlack;
    return this.race(this.core.fade(toBlack, seconds));
  }

  /** Push a camera override for the rest of the beat (or until the returned pop is called). */
  cam(fn: CameraOverride): () => void {
    if (this.stopped) return () => undefined;
    const pop = this.core.cameraRig.push('story', fn);
    let done = false;
    const off = () => { if (done) return; done = true; pop(); this.cams.delete(off); };
    this.cams.add(off);
    return off;
  }

  /** Per-tick callback for the rest of the beat (flash overlays, timed events). */
  tick(fn: (t: number) => void): () => void {
    this.tickers.add(fn);
    return () => { this.tickers.delete(fn); };
  }

  /** Beat over: pop every camera and ticker it pushed; lift a fade the beat left black. */
  end(): void {
    for (const off of [...this.cams]) off();
    this.tickers.clear();
    if (this.black) {
      this.black = false;
      this.core.fade(false, 0.3).catch(() => undefined);
    }
  }
}

/** Apply fov/near/far only when they change (updateProjectionMatrix is not free). */
export function setLens(cam: PerspectiveCamera, fov: number, near: number, far: number): void {
  if (cam.fov !== fov || cam.near !== near || cam.far !== far) {
    cam.fov = fov; cam.near = near; cam.far = far;
    cam.updateProjectionMatrix();
  }
}

export const smooth = (x: number): number => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
