// src/core/canvas.ts — owner: S. FROZEN. Canvas texture helpers (TECH §5, ART §4.5 / §8.3). Browser only.
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Rng } from '../contracts';
import { FONT } from './fonts';

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

/** A colour CanvasTexture (sRGB). `draw` paints once; call tex.needsUpdate = true after later redraws. */
export function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx, w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** ART §4.5 hand-inked stroke: 2–3 px polyline with ±jitter px per vertex (seeded, never Math.random). */
export function inkStroke(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], width: number, jitterPx: number, rng: Rng, color = '#2f3a3f'): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = rng.range(-jitterPx, jitterPx), jy = rng.range(-jitterPx, jitterPx);
    if (i === 0) ctx.moveTo(x + jx, y + jy); else ctx.lineTo(x + jx, y + jy);
  });
  ctx.stroke();
  ctx.restore();
}

/** Largest font size ≤ startSize whose single-line width fits maxW. Sets ctx.font and returns the size. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string, startSize: number, weight = ''): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${font}`.trim();
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) { size = Math.max(6, Math.floor((size * maxW) / w)); ctx.font = `${weight} ${size}px ${font}`.trim(); }
  return size;
}

/** Vertical signage: one character per row (spread keeps surrogate pairs intact), centred on x. */
export function verticalText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, lineH = 1.1): void {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [...text].forEach((ch, i) => ctx.fillText(ch, x, y + i * size * lineH));
  ctx.restore();
}

export interface SignOpts {
  text: string; w?: number; h?: number; bg?: string; ink?: string; font?: string; weight?: string;
  vertical?: boolean; border?: boolean;
}
/** TECH §5 sign texture. Bake only after warmFonts() and ensureFont(font, text). */
export function signTexture(o: SignOpts): CanvasTexture {
  const w = o.w ?? 512, h = o.h ?? 256;
  return makeCanvasTexture(w, h, (g) => {
    g.fillStyle = o.bg ?? '#e8a33c'; g.fillRect(0, 0, w, h);
    const ink = o.ink ?? '#1f282d';
    if (o.border !== false) { g.strokeStyle = ink; g.lineWidth = Math.max(4, w / 90); g.strokeRect(8, 8, w - 16, h - 16); }
    g.fillStyle = ink;
    const font = o.font ?? FONT.sign, weight = o.weight ?? '700';
    if (o.vertical) {
      const n = [...o.text].length || 1;
      const size = Math.min(w * 0.7, (h * 0.85) / (n * 1.1));
      g.font = `${weight} ${size}px ${font}`;
      verticalText(g, o.text, w / 2, (h - n * size * 1.1) / 2, size);
    } else {
      fitText(g, o.text, w * 0.85, font, h * 0.55, weight);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(o.text, w / 2, h / 2);
    }
  });
}
