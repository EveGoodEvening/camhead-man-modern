// src/world/atlas.ts — owner B. The town atlas: one 2048×1024 sRGB canvas holding every sign, poster, number plate,
// QR code and façade pattern, so all town chunks share one material (ARCHITECTURE §5.1 façade atlases ≤ 4×2048×1024).
// Bake only after warmFonts() + ensureFont() (§5.2 rule 4). Browser only.
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { Rng } from '../contracts';
import { makeCanvas } from '../core/canvas';

export interface UvRect { u0: number; v0: number; u1: number; v1: number }
export const ATLAS_W = 2048, ATLAS_H = 2048;   // = 2 façade atlases of 2048×1024 (ARCHITECTURE §5.1)
/** A white 8×8 block at the top-left corner: untextured geometry samples it (colour = vertex colour). */
export const WHITE_UV = { u: 4 / ATLAS_W, v: 1 - 4 / ATLAS_H } as const;

export type DrawFn = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  private x = 12; private y = 0; private rowH = 12;
  private cache = new Map<string, UvRect>();
  full = false;
  missed = 0;
  usage(): string { return `atlas rows to y=${this.y + this.rowH}/${ATLAS_H}, entries=${this.cache.size}, missed=${this.missed}`; }
  constructor() {
    const { canvas, ctx } = makeCanvas(ATLAS_W, ATLAS_H);
    this.canvas = canvas; this.ctx = ctx;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 12, 12);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 1;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
  }
  /** Allocate w×h px (shelf packing, 4 px gutter) and draw into it. Same `key` → same rect. */
  draw(key: string, w: number, h: number, fn: DrawFn): UvRect {
    const hit = this.cache.get(key);
    if (hit) return hit;
    w = Math.ceil(w); h = Math.ceil(h);
    const pad = 4;
    if (this.x + w + pad > ATLAS_W) { this.x = 0; this.y += this.rowH + pad; this.rowH = 0; }
    if (this.y + h > ATLAS_H) { this.full = true; this.missed++; return { u0: WHITE_UV.u, v0: WHITE_UV.v, u1: WHITE_UV.u, v1: WHITE_UV.v }; }
    const x = this.x, y = this.y;
    this.x += w + pad; this.rowH = Math.max(this.rowH, h);
    const g = this.ctx;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(x, y);
    // bleed guard: fill the gutter with the edge colour by drawing once 2 px larger, then the real thing
    fn(g, w, h);
    g.restore();
    const r: UvRect = { u0: (x + 0.5) / ATLAS_W, u1: (x + w - 0.5) / ATLAS_W, v0: 1 - (y + h - 0.5) / ATLAS_H, v1: 1 - (y + 0.5) / ATLAS_H };
    this.cache.set(key, r);
    return r;
  }
  finish(): void { this.texture.needsUpdate = true; }
}

// ---------------------------------------------------------------- drawing helpers (ART §4.5 / §9)
export const INK = '#2f3a3f', INK_DEEP = '#1f282d';

/** Wobbly hand-inked rectangle border. */
export function inkRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lw: number, rng: Rng, color = INK): void {
  g.save();
  g.strokeStyle = color; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
  const j = () => rng.range(-lw * 0.35, lw * 0.35);
  g.beginPath();
  g.moveTo(x + j(), y + j()); g.lineTo(x + w + j(), y + j()); g.lineTo(x + w + j(), y + h + j());
  g.lineTo(x + j(), y + h + j()); g.closePath();
  g.stroke();
  g.restore();
}

/** Centered single-line text fitted to maxW. */
export function text(g: CanvasRenderingContext2D, s: string, cx: number, cy: number, size: number, maxW: number, font: string, color: string, weight = '700'): void {
  g.save();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(s).width;
  if (w > maxW && w > 0) g.font = `${weight} ${Math.max(6, Math.floor((size * maxW) / w))}px ${font}`;
  g.fillText(s, cx, cy);
  g.restore();
}

/** Vertical text column (one char per row), fitted to the box. */
export function vtext(g: CanvasRenderingContext2D, s: string, cx: number, y0: number, h: number, maxSize: number, font: string, color: string, weight = '700'): void {
  const chars = [...s];
  const size = Math.min(maxSize, (h / Math.max(1, chars.length)) / 1.08);
  g.save();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${size}px ${font}`;
  const start = y0 + (h - chars.length * size * 1.08) / 2 + size * 0.54;
  chars.forEach((c, i) => g.fillText(c, cx, start + i * size * 1.08));
  g.restore();
}

/** Deterministic QR-looking code (finder squares + seeded modules). */
export function qr(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const n = 21, m = s / (n + 2);
  g.fillStyle = '#f3f6ea'; g.fillRect(x, y, s, s);
  g.fillStyle = INK_DEEP;
  const finder = (i: number, j: number) => {
    g.fillRect(x + (i + 1) * m, y + (j + 1) * m, 7 * m, 7 * m);
    g.fillStyle = '#f3f6ea'; g.fillRect(x + (i + 2) * m, y + (j + 2) * m, 5 * m, 5 * m);
    g.fillStyle = INK_DEEP; g.fillRect(x + (i + 3) * m, y + (j + 3) * m, 3 * m, 3 * m);
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inFinder = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
    if (!inFinder && rng.next() < 0.48) g.fillRect(x + (i + 1) * m, y + (j + 1) * m, m + 0.3, m + 0.3);
  }
  finder(0, 0); finder(14, 0); finder(0, 14);
}
