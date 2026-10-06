// src/lens/photoFx.ts — owner D. 2D canvas treatments for photos (browser only):
// sepia + grain + white border + date stamp for preset photos (GDD §3.8, §7.2), the light-trail composite (GDD §9 P6,
// §18.4 light_trail), the four-frame stitched positive (GDD §7.2 ph_2023_stitched) and the "white" flash-into-mirror
// photo (GDD §3.7). Randomness from core.rng forks only.
import type { Vector3 } from 'three';
import type { Rng } from '../contracts';
import { FONT } from '../core/fonts';
import { makeCanvas } from '../core/canvas';

export const JPEG_Q = 0.8;
export const toJpeg = (c: HTMLCanvasElement): string => c.toDataURL('image/jpeg', JPEG_Q);

/** Sepia tone + film grain in place (preset "old photo" look). */
export function sepia(c: HTMLCanvasElement, rng: Rng, amount = 1, grain = 10): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
    const n = (rng.next() - 0.5) * grain;
    d[i] = Math.min(255, r + (sr * 0.92 - r) * amount + n);
    d[i + 1] = Math.min(255, g + (sg * 0.9 - g) * amount + n);
    d[i + 2] = Math.min(255, b + (sb * 0.86 - b) * amount + n);
  }
  ctx.putImageData(img, 0, 0);
}

/** White border (inside the frame, so the overlay still aligns), plus an optional stamp. */
export function border(c: HTMLCanvasElement, px = 7, color = '#f3f6ea'): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, px); ctx.fillRect(0, c.height - px, c.width, px);
  ctx.fillRect(0, 0, px, c.height); ctx.fillRect(c.width - px, 0, px, c.height);
  ctx.restore();
}

/** Orange date stamp (bottom-right) / "3×" watermark (bottom-left). */
export function stamp(c: HTMLCanvasElement, text: string, where: 'br' | 'bl', color = '#e69869'): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.font = `700 ${Math.round(c.height * 0.075)}px ${FONT.hud}`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = where === 'br' ? 'right' : 'left';
  const x = where === 'br' ? c.width - 18 : 18, y = c.height - 14;
  ctx.fillStyle = 'rgba(31,40,45,0.35)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** GDD §3.7: the flash bounced off the mirror — a nearly white frame with a faint ghost of the scene. */
export function whiteOut(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = 'rgba(248,248,246,0.93)';
  ctx.fillRect(0, 0, c.width, c.height);
  const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 4, c.width / 2, c.height / 2, c.height * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(248,248,246,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

/** The hand-written 「1987」 light trail (cyan-white #cfe8dc, 2 px ink edge), used when B gives no canvas. */
export function drawTrail(w: number, h: number, rng: Rng): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  // strokes in a 0..1 box per digit: 1, 9, 8, 7 (GDD §9 P6)
  const digits: [number, number][][][] = [
    [[[0.35, 0.22], [0.55, 0.08], [0.55, 0.92]], [[0.35, 0.92], [0.75, 0.92]]],
    [[[0.72, 0.36], [0.62, 0.12], [0.36, 0.1], [0.24, 0.3], [0.34, 0.5], [0.6, 0.52], [0.74, 0.36], [0.72, 0.62], [0.58, 0.9], [0.3, 0.9]]],
    [[[0.5, 0.48], [0.28, 0.34], [0.34, 0.1], [0.66, 0.1], [0.72, 0.32], [0.5, 0.48], [0.24, 0.66], [0.32, 0.9], [0.68, 0.9], [0.76, 0.66], [0.5, 0.48]]],
    [[[0.24, 0.12], [0.76, 0.1], [0.5, 0.52], [0.4, 0.92]]],
  ];
  const cell = w / 4;
  const paths = digits.map((strokes, i) => strokes.map((s) => s.map(([x, y]) => [
    i * cell + x * cell * 0.9 + cell * 0.05 + (rng.next() - 0.5) * 3, y * h * 0.84 + h * 0.08 + (rng.next() - 0.5) * 3,
  ] as [number, number])));
  const pass = (style: string, width: number) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const d of paths) for (const s of d) {
      ctx.beginPath();
      s.forEach(([x, y], k) => { if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    }
  };
  pass('rgba(207,232,220,0.25)', h * 0.13);   // soft glow of a long exposure
  pass('#2f3a3f', h * 0.065 + 4);             // 2 px ink edge each side
  pass('#cfe8dc', h * 0.065);
  pass('rgba(255,255,255,0.8)', h * 0.02);    // hot core
  return canvas;
}

/**
 * Draw `src` onto `dst` mapped onto a projected quad (corners in dst pixels: TL, TR, BR, BL) with two affine
 * triangles — exact enough for an 8 × 3 m plane seen from 16 m.
 */
export function drawQuad(dst: HTMLCanvasElement, src: HTMLCanvasElement, q: readonly [number, number][]): void {
  const ctx = dst.getContext('2d');
  if (!ctx || q.length !== 4) return;
  const w = src.width, h = src.height;
  const tri = (s: [number, number][], d: [number, number][]) => {
    const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
    const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(den) < 1e-6) return;
    const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
    const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
    const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
    const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
    const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
    const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); ctx.lineTo(u2, v2); ctx.closePath(); ctx.clip();
    ctx.setTransform(a, b, c, dd, e, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  ctx.save();
  tri([[0, 0], [w, 0], [w, h]], [q[0], q[1], q[2]]);
  tri([[0, 0], [w, h], [0, h]], [q[0], q[2], q[3]]);
  ctx.restore();
}

/** World points → capture pixel coords (the camera must have updated matrices). */
export function toPixels(points: readonly Vector3[], project: (p: Vector3) => { x: number; y: number }, w: number, h: number): [number, number][] {
  return points.map((p) => { const n = project(p); return [(n.x * 0.5 + 0.5) * w, (0.5 - n.y * 0.5) * h] as [number, number]; });
}

/** GDD §7.2 ph_2023_stitched: four panels left→right with film rebates and frame numbers. */
export function stitch(panels: readonly HTMLCanvasElement[], labels: readonly string[]): HTMLCanvasElement {
  const pw = panels[0]?.width ?? 240, ph = panels[0]?.height ?? 270;
  const pad = 10, rebate = 22;
  const { canvas, ctx } = makeCanvas(panels.length * pw + (panels.length + 1) * pad, ph + 2 * rebate);
  ctx.fillStyle = '#1f282d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // sprocket holes
  ctx.fillStyle = '#e9dca6';
  for (let x = 6; x < canvas.width - 8; x += 18) { ctx.fillRect(x, 6, 9, 9); ctx.fillRect(x, canvas.height - 15, 9, 9); }
  panels.forEach((p, i) => {
    const x = pad + i * (pw + pad);
    ctx.drawImage(p, x, rebate);
    ctx.fillStyle = '#e69869';
    ctx.font = `700 14px ${FONT.hud}`;
    ctx.textBaseline = 'top';
    ctx.fillText(labels[i] ?? '', x + 4, rebate + 4);
  });
  return canvas;
}

/** P3r2 look L1: a bold hand-chalked X (two doubled, slightly wobbly strokes with an ink shadow) `size` px across,
 *  centred on (cx, cy) — dad's mark on the stair tread in ph_2023_stitched. */
export function chalkX(c: HTMLCanvasElement, cx: number, cy: number, size: number, rng: { range(a: number, b: number): number }): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const h = size / 2;
  const stroke = (ax: number, ay: number, bx: number, by: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + ax + rng.range(-1.5, 1.5), cy + ay + rng.range(-1.5, 1.5));
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      ctx.lineTo(cx + ax + (bx - ax) * k + rng.range(-1.2, 1.2), cy + ay + (by - ay) * k + rng.range(-1.2, 1.2));
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, w, off] of [['rgba(31,40,45,0.75)', size * 0.2, 2.5], ['#f3efe2', size * 0.13, 0], ['#ffffff', size * 0.05, -0.5]] as const) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.translate(off, off);
    stroke(-h, -h * 0.8, h, h * 0.85);
    stroke(h * 0.95, -h * 0.85, -h * 0.9, h * 0.8);
    ctx.translate(-off, -off);
  }
  ctx.restore();
}

/** Crop the centre `w` columns of a capture (portrait panel for the stitch). */
export function cropCenter(c: HTMLCanvasElement, w: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, c.height);
  ctx.drawImage(c, (c.width - w) / 2, 0, w, c.height, 0, 0, w, c.height);
  return canvas;
}
