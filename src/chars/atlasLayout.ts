// src/chars/atlasLayout.ts — owner C. Layout of the shared 512² character atlas (ARCH §5.1 "face atlas 512²"). Pure.
// Rows 0–4: 40 old-photo face cells (follow faceState). Row 5–7: live NPC faces, sticker, badge, bus sign, white.
export const ATLAS = 512;
export const CELL = 64;
export const PHOTO_CELLS = 40;          // faceTexture(seed) → cell seed mod 40

/** A rect in uv space (flipY = true → v measured from the canvas bottom) plus its canvas pixel rect. */
export interface CellRect { u0: number; v0: number; u1: number; v1: number; x: number; y: number; w: number; h: number }

export function rectPx(x: number, y: number, w: number, h: number): CellRect {
  return { x, y, w, h, u0: x / ATLAS, u1: (x + w) / ATLAS, v0: 1 - (y + h) / ATLAS, v1: 1 - y / ATLAS };
}
export function cellAt(col: number, row: number): CellRect { return rectPx(col * CELL, row * CELL, CELL, CELL); }
export function photoCell(seed: number): CellRect {
  const i = ((Math.floor(seed) % PHOTO_CELLS) + PHOTO_CELLS) % PHOTO_CELLS;
  return cellAt(i % 8, Math.floor(i / 8));
}

/** Live (non-photo) cells. `*_closed` sits exactly one cell to the right of its open face (uv blink = +1 cell in u). */
export const CELLS = {
  xiaolin: cellAt(0, 5), xiaolin_closed: cellAt(1, 5),
  granny: cellAt(2, 5), granny_closed: cellAt(3, 5),
  chen: cellAt(4, 5), chen_closed: cellAt(5, 5),
  liu: cellAt(6, 5), liu_closed: cellAt(7, 5),
  tudi: cellAt(0, 6), tudi_closed: cellAt(1, 6),
  zhimei1: cellAt(2, 6), zhimei2: cellAt(3, 6),
  meiqiu: cellAt(4, 6), meiqiu_closed: cellAt(5, 6),
  heroFace: cellAt(6, 6), laoZhou: cellAt(7, 6),
  busSign: rectPx(0, 7 * CELL, 4 * CELL, CELL),
  sticker: cellAt(4, 7), badge: cellAt(5, 7), walker: cellAt(6, 7),
  white: cellAt(7, 7),
} as const;
export const BLINK_DU = CELL / ATLAS;
/** Centre of the white cell: every untextured part samples this texel (vertex colour × 1). */
export const WHITE_UV: readonly [number, number] = [(CELLS.white.u0 + CELLS.white.u1) / 2, (CELLS.white.v0 + CELLS.white.v1) / 2];
/** Inner rect of a photo cell that holds the face oval (used when a photo face is projected onto a head). */
export const PHOTO_FACE_INNER: readonly [number, number, number, number] = [0.22, 0.18, 0.78, 0.86];
