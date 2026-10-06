// src/ui/hud/promptPos.ts — owner E (I-play, Phase 2). Screen placement of the world-anchored interaction prompt.
// A picked interactable whose anchor is behind the camera or far outside the frame (the 「拉下总闸」 switch while the
// lh_door view looks straight up the tower) used to hide the prompt, so the player never learnt the next step: dock it
// at the lower centre instead.

/** Where the prompt docks when its anchor is not on screen (fraction of the viewport height). */
export const PROMPT_DOCK_Y = 0.74;

/** `ndc` = the anchor after `Vector3.project(camera)`. Returns the prompt's anchor point in CSS px. */
export function promptScreenPos(ndc: { x: number; y: number; z: number }, w: number, h: number): { x: number; y: number; docked: boolean } {
  const behind = ndc.z > 1 || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y);
  const off = Math.abs(ndc.x) > 1.15 || Math.abs(ndc.y) > 1.15;
  if (behind || off) return { x: Math.round(w / 2), y: Math.round(h * PROMPT_DOCK_Y), docked: true };
  const x = Math.round((ndc.x * 0.5 + 0.5) * w), y = Math.round((-ndc.y * 0.5 + 0.5) * h);
  return { x: Math.min(w - 80, Math.max(80, x)), y: Math.min(h - 40, Math.max(60, y)), docked: false };
}
