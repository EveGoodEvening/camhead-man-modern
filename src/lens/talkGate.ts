// src/lens/talkGate.ts — owner D (P3r3 open-play b). When may an E in the night viewfinder open a night talk?
// Mashing E through a talk used to reopen it as soon as one press came ≥ 0.6 s after the box closed (a reader's
// cadence). Now: the E that closed the box is consumed (the key must be seen up first), and the lens must have been
// quiet for TALK_GUARD seconds — every E pressed inside that window is swallowed and restarts it, so a player who keeps
// pressing through the end of a talk never reopens it, at any cadence below TALK_GUARD. Pure, sim time.

/** Seconds of no E (and no dialogue/card) before an E opens a night talk again. */
export const TALK_GUARD = 1.0;

export class TalkGate {
  private quietUntil = -Infinity;
  private armed = true;
  private readonly guard: number;
  constructor(guard = TALK_GUARD) { this.guard = guard; }
  /** A dialogue or card is on screen at sim time t (called every tick while it is). */
  busy(t: number): void { this.quietUntil = t + this.guard; this.armed = false; }
  /** Every tick: is the interact key held right now? Seeing it up re-arms the gate. */
  tick(held: boolean): void { if (!held) this.armed = true; }
  /** An E went down at sim time t: true = open the talk; false = swallowed (and the quiet window restarts). */
  press(t: number): boolean {
    if (this.armed && t >= this.quietUntil) return true;
    this.quietUntil = Math.max(this.quietUntil, t + this.guard);
    return false;
  }
}
