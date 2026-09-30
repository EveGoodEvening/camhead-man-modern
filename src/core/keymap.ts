// src/core/keymap.ts — owner: S. FROZEN. Pure key map (GDD §4, ARCHITECTURE §2.8.8). One key → several actions;
// consumers decide by input.context().
import type { InputAction } from '../contracts';

export const KEYMAP: Readonly<Record<string, readonly InputAction[]>> = {
  KeyW: ['forward'], KeyA: ['left'], KeyS: ['back'], KeyD: ['right'],
  ArrowUp: ['forward'], ArrowLeft: ['left'], ArrowDown: ['back'], ArrowRight: ['right'],
  ShiftLeft: ['run'], ShiftRight: ['run'],
  KeyE: ['interact', 'advance'],
  Space: ['shutter', 'advance'],
  KeyF: ['aimToggle'],
  Digit1: ['zoom1', 'choice1'], Digit2: ['zoom3', 'choice2'], Digit3: ['zoom10', 'choice3'], Digit4: ['choice4'],
  KeyN: ['night'], KeyQ: ['flash'], KeyR: ['overlay'], KeyG: ['show'],
  Tab: ['phone'], KeyJ: ['memo'], KeyH: ['hint'],
  Escape: ['escape'],
};

/** Mouse buttons: 0 = left (shutter/advance), 2 = right (aimHold). */
export const MOUSEMAP: Readonly<Record<number, readonly InputAction[]>> = {
  0: ['shutter', 'advance'],
  2: ['aimHold'],
};

const NONE: readonly InputAction[] = [];
export function actionsForKey(code: string): readonly InputAction[] { return KEYMAP[code] ?? NONE; }
export function actionsForMouse(button: number): readonly InputAction[] { return MOUSEMAP[button] ?? NONE; }
export function actionsForWheel(deltaY: number): readonly InputAction[] {
  return deltaY < 0 ? ['zoomIn'] : deltaY > 0 ? ['zoomOut'] : NONE;
}
/** Keys whose browser default must be suppressed while the game has focus. */
export function preventsDefault(code: string): boolean { return code === 'Tab' || code === 'Space' || code.startsWith('Arrow'); }

/** Movement vector from held actions: x strafe right, y forward, |v| ≤ 1. */
export function moveVector(held: (a: InputAction) => boolean): { x: number; y: number } {
  const x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  const y = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0);
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}
