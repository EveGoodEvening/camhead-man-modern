// src/world/kit/tex.ts — owner B. Atlas artwork: signs (text from zh/world.ts via t()), posters, window/shop patterns,
// number plates, QR codes, 福 / 拆 / 折 marks (ART §9 façade textures: flat fills, ink strokes, no gradients).
import { PAL } from '../../art/palette';
import type { Rng } from '../../contracts';
import { FONT } from '../../core/fonts';
import { createRng } from '../../core/rng';
import { t } from '../../data/zh';
import { Atlas, INK, INK_DEEP, inkRect, qr, text, vtext, type UvRect } from '../atlas';

const PX_PER_M = 52;
/** P3-look (L6): story-relevant / close-up signs (the P2 store fascia, the P2 boat-bow clue, the arcade signs filmed in
 *  dialogue and in the §19.4 captures) are baked at 128 px/m — at 52 px/m 「修鞋配钥匙」 and 「闽望渔 0815」 smeared. */
const PX_PER_M_HI = 128;
export const HI_RES_SIGNS: ReadonlySet<string> = new Set([
  'sign.store', 'sign.boat', 'sign.shop_shoes', 'sign.shop_hardware', 'sign.shop_barber', 'sign.paper_shop',
  'sign.subway', 'sign.bridge', 'sign.site_gate',
]);
/** Atlas size (px) of a horizontal sign `wM × hM` m (pure; exported for tests). */
export function signPx(key: string, wM: number, hM: number): { w: number; h: number } {
  const hi = HI_RES_SIGNS.has(key);
  const k = hi ? PX_PER_M_HI : PX_PER_M;
  return { w: Math.min(hi ? 720 : 400, Math.max(64, wM * k)), h: Math.min(hi ? 128 : 96, Math.max(24, hM * k)) };
}
const WHITE = '#f3f6ea';

export class Tex {
  readonly A: Atlas;
  private rng: Rng;
  constructor(A: Atlas) { this.A = A; this.rng = createRng(0x7e7); }

  /** Horizontal shop sign: bg slab + ink border + fitted text (w, h in metres → 64 px/m, ≤ 512×128). */
  sign(key: string, wM: number, hM: number, bg: string, ink: string, font: string = FONT.display, sub?: string): UvRect {
    const { w, h } = signPx(key, wM, hM);
    return this.A.draw(`sign:${key}:${bg}:${ink}:${w | 0}x${h | 0}:${sub ?? ''}`, w, h, (g) => {
      const r = this.rng.fork(key);
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      inkRect(g, 3, 3, w - 6, h - 6, Math.max(2, h * 0.05), r, ink === WHITE || ink === PAL.clothWhite ? 'rgba(243,246,234,0.85)' : INK);
      if (sub) {
        text(g, t(key), w / 2, h * 0.4, h * 0.5, w * 0.86, font, ink);
        text(g, t(sub), w / 2, h * 0.8, h * 0.2, w * 0.8, FONT.sign, ink, '400');
      } else text(g, t(key), w / 2, h * 0.53, h * 0.64, w * 0.88, font, ink);
    });
  }
  /** Vertical sign (one char per row). */
  vsign(key: string, wM: number, hM: number, bg: string, ink: string, font: string = FONT.display): UvRect {
    const w = Math.min(64, Math.max(24, wM * PX_PER_M)), h = Math.min(256, Math.max(64, hM * PX_PER_M));
    return this.A.draw(`vsign:${key}:${bg}:${w | 0}x${h | 0}`, w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      inkRect(g, 3, 3, w - 6, h - 6, 2.5, this.rng.fork(key), INK);
      vtext(g, t(key), w / 2, 6, h - 12, w * 0.72, font, ink);
    });
  }
  /** Window pane pattern (multiplied by the pane's vertex colour): 0 cross, 1 security grille, 2 curtain, 3 louver. */
  pane(kind: number): UvRect {
    return this.A.draw(`pane:${kind}`, 48, 56, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = kind === 2 ? '#d8d2bc' : '#ffffff';
      if (kind === 2) { g.fillRect(4, 4, w * 0.45, h - 8); g.fillRect(w * 0.62, 4, w * 0.34, h * 0.55); }
      g.strokeStyle = INK_DEEP; g.lineWidth = 3;
      g.strokeRect(2, 2, w - 4, h - 4);
      g.beginPath(); g.moveTo(w / 2, 2); g.lineTo(w / 2, h - 2);
      if (kind !== 3) { g.moveTo(2, h * 0.38); g.lineTo(w - 2, h * 0.38); }
      g.stroke();
      if (kind === 1) {
        g.lineWidth = 1.6;
        g.beginPath();
        for (let x = 7; x < w; x += 7) { g.moveTo(x, 2); g.lineTo(x, h - 2); }
        g.moveTo(2, h * 0.7); g.lineTo(w - 2, h * 0.7);
        g.stroke();
      }
      if (kind === 3) { g.lineWidth = 1.5; g.beginPath(); for (let y = 8; y < h; y += 6) { g.moveTo(3, y); g.lineTo(w - 3, y); } g.stroke(); }
    });
  }
  /** Shop glazing (win layer): mullions, a door, a few goods silhouettes. */
  shopGlass(v: number): UvRect {
    return this.A.draw(`shopglass:${v}`, 96, 72, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9c4b0';
      const r = this.rng.fork(`sg${v}`);
      for (let i = 0; i < 5; i++) g.fillRect(r.range(4, w - 20), h * r.range(0.45, 0.7), r.range(6, 16), h * r.range(0.15, 0.3));
      g.strokeStyle = INK_DEEP; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
      g.beginPath();
      g.moveTo(w * 0.33, 2); g.lineTo(w * 0.33, h); g.moveTo(w * 0.66, 2); g.lineTo(w * 0.66, h); g.moveTo(2, h * 0.22); g.lineTo(w - 2, h * 0.22);
      g.stroke();
      g.lineWidth = 2; g.strokeRect(w * 0.36, h * 0.3, w * 0.27, h * 0.68);
    });
  }
  /** Rolling steel shutter (solid layer), optionally half raised, with a stuck-on poster. */
  shutter(v: number): UvRect {
    return this.A.draw(`shutter:${v}`, 96, 80, (g, w, h) => {
      const r = this.rng.fork(`sh${v}`);
      const half = v % 3 === 1;
      g.fillStyle = PAL.metalRail; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8f948a'; g.lineWidth = 1.4;
      g.beginPath(); for (let y = 5; y < h; y += 5) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
      g.fillStyle = PAL.signSlate; g.fillRect(0, 0, w, 7);
      if (half) { g.fillStyle = PAL.glassDark; g.fillRect(0, h * 0.62, w, h * 0.38); }
      if (v % 2 === 0) {
        g.fillStyle = PAL.paintWhite; const px = r.range(8, w - 34), py = r.range(12, 26);
        g.fillRect(px, py, 24, 30); g.fillStyle = PAL.bannerRed; g.fillRect(px + 3, py + 3, 18, 6);
        g.fillStyle = INK; for (let i = 0; i < 4; i++) g.fillRect(px + 3, py + 13 + i * 4, r.range(10, 18), 1.5);
      }
      g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
  }
  ac(): UvRect {
    return this.A.draw('ac', 56, 40, (g, w, h) => {
      g.fillStyle = PAL.metalRail; g.fillRect(0, 0, w, h);
      g.strokeStyle = INK; g.lineWidth = 2.2; g.strokeRect(2, 2, w - 4, h - 4);
      g.beginPath(); g.arc(w * 0.62, h / 2, h * 0.34, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1.2; g.beginPath();
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + 0.4; g.moveTo(w * 0.62, h / 2); g.lineTo(w * 0.62 + Math.cos(a) * h * 0.3, h / 2 + Math.sin(a) * h * 0.3); }
      for (let y = 8; y < h - 6; y += 4) { g.moveTo(5, y); g.lineTo(w * 0.34, y); }
      g.stroke();
    });
  }
  stripes(a: string, b: string, n = 6): UvRect {
    return this.A.draw(`stripes:${a}${b}${n}`, 64, 24, (g, w, h) => {
      for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); }
      g.fillStyle = a; g.fillRect(0, h - 5, w, 5);
    });
  }
  poster(key: string, bg: string = WHITE): UvRect {
    return this.A.draw(`poster:${key}:${bg}`, 40, 56, (g, w, h) => {
      const r = this.rng.fork(key);
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      text(g, t(key), w / 2, 10, 10, w - 6, FONT.sign, key.includes('demolish') || key.includes('missing') ? PAL.bannerRed : INK_DEEP);
      g.fillStyle = INK;
      for (let i = 0; i < 6; i++) g.fillRect(5, 20 + i * 5, r.range(18, w - 10), 1.6);
      if (key.includes('missing') || key.includes('cat')) { g.fillStyle = '#b9b3a2'; g.fillRect(w / 2 - 7, 20, 14, 12); }
      g.fillStyle = PAL.bannerRed; g.beginPath(); g.arc(w - 10, h - 9, 5, 0, Math.PI * 2); g.fill();
      inkRect(g, 1, 1, w - 2, h - 2, 1.5, r, INK);
    });
  }
  /** 福 on a red diamond: state 0 upright, 1 rotated 90°, 2 upside down, 3 half torn. */
  fu(state: number): UvRect {
    return this.A.draw(`fu:${state}`, 64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      g.fillStyle = PAL.bannerRed; g.fillRect(-21, -21, 42, 42);
      g.restore();
      g.save(); g.translate(w / 2, h / 2);
      g.rotate(state === 1 ? Math.PI / 2 : state === 2 ? Math.PI : 0);
      text(g, t('sign.fu'), 0, 2, 34, 40, FONT.brush, '#1f282d', '400');
      g.restore();
      if (state === 3) {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.62, h * 0.8); g.lineTo(w * 0.48, h * 0.55); g.lineTo(w * 0.58, h * 0.3); g.closePath(); g.fill();
      }
    });
  }
  plate(n: string, bg = PAL.blue): UvRect {
    return this.A.draw(`plate:${n}:${bg}`, 40, 20, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      text(g, n, w / 2, h / 2 + 1, 15, w - 4, FONT.hud, WHITE, '400');
    });
  }
  qrCode(seed: string): UvRect { return this.A.draw(`qr:${seed}`, 48, 48, (g, w) => qr(g, 0, 0, w, this.rng.fork(seed))); }
  /** Red spray circle with 拆 (or 折) — the town-wide marks (GDD §5.7). */
  mark(zhe: boolean): UvRect {
    return this.A.draw(`mark:${zhe}`, 64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);                        // spray paint straight on the wall (alpha-cut 'sign' material)
      g.strokeStyle = PAL.bannerRed; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2); g.stroke();
      text(g, t(zhe ? 'sign.zhe' : 'sign.chai'), w / 2, h / 2 + 2, 36, 44, FONT.sign, PAL.bannerRed, '700');
    });
  }
  /** Locker wall (GDD P2): 4 columns × 5 rows, column-major 01–20 (17 = column 4, row 2), header + screen. */
  locker(): UvRect {
    return this.A.draw('locker', 160, 176, (g, w, h) => {
      g.fillStyle = '#e4e7dc'; g.fillRect(0, 0, w, h);
      g.fillStyle = PAL.steelGreen; g.fillRect(0, 0, w, 26);
      text(g, t('sign.locker'), w * 0.42, 14, 18, w * 0.7, FONT.display, WHITE);
      const cw = 30, ch = 28, x0 = 4, y0 = 30;
      g.strokeStyle = INK; g.lineWidth = 2;
      for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) {
        const n = c * 5 + r + 1;
        g.strokeRect(x0 + c * cw, y0 + r * ch, cw - 2, ch - 2);
        text(g, String(n).padStart(2, '0'), x0 + c * cw + 9, y0 + r * ch + 8, 9, 14, FONT.hud, INK, '400');
        g.fillStyle = INK; g.fillRect(x0 + c * cw + cw - 8, y0 + r * ch + ch / 2 - 3, 3, 6);
      }
      g.fillStyle = PAL.glassDark; g.fillRect(x0 + 4 * cw + 2, y0 + 8, 30, 36);
      g.fillStyle = PAL.neonTeal; g.fillRect(x0 + 4 * cw + 6, y0 + 12, 22, 4);
      g.strokeRect(1, 1, w - 2, h - 2);
    });
  }
  /** Milk-box wall (GDD P5): 4 columns × 6 rows, 101–604 (floor rows top = 6). */
  milkbox(): UvRect {
    return this.A.draw('milkbox', 128, 176, (g, w, h) => {
      g.fillStyle = '#b8beb2'; g.fillRect(0, 0, w, h);
      const cw = w / 4, ch = (h - 16) / 6;
      text(g, t('sign.milkbox'), w / 2, 8, 12, w * 0.6, FONT.sign, INK_DEEP);
      g.strokeStyle = INK; g.lineWidth = 2;
      for (let fl = 6; fl >= 1; fl--) for (let u = 1; u <= 4; u++) {
        const x = (u - 1) * cw, y = 16 + (6 - fl) * ch;
        g.fillStyle = (fl * 4 + u) % 3 === 0 ? '#a8ae9f' : '#c4c9bd';
        g.fillRect(x + 2, y + 2, cw - 4, ch - 4); g.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
        text(g, `${fl}0${u}`, x + cw / 2, y + 8, 9, cw - 6, FONT.hud, INK_DEEP, '400');
        g.fillStyle = INK; g.fillRect(x + cw / 2 - 4, y + ch - 9, 8, 2);
      }
    });
  }
  /** Generic flat colour swatch with an ink border (doors, panels). */
  panel(key: string, bg: string, detail: 'door' | 'plain' | 'vent' | 'grid' = 'plain'): UvRect {
    return this.A.draw(`panel:${key}:${bg}:${detail}`, 48, 64, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = INK; g.lineWidth = 2.5; g.strokeRect(2, 2, w - 4, h - 4);
      if (detail === 'door') { g.strokeRect(8, 8, w - 16, h * 0.4); g.strokeRect(8, h * 0.55, w - 16, h * 0.38); g.fillStyle = INK; g.fillRect(w - 12, h * 0.5, 4, 4); }
      if (detail === 'vent') { g.lineWidth = 1.5; g.beginPath(); for (let y = 8; y < h - 4; y += 5) { g.moveTo(6, y); g.lineTo(w - 6, y); } g.stroke(); }
      if (detail === 'grid') { g.lineWidth = 1.2; g.beginPath(); for (let x = 8; x < w; x += 8) { g.moveTo(x, 2); g.lineTo(x, h - 2); } for (let y = 8; y < h; y += 8) { g.moveTo(2, y); g.lineTo(w - 2, y); } g.stroke(); }
    });
  }
  /** A block of free-form artwork. */
  art(key: string, w: number, h: number, fn: (g: CanvasRenderingContext2D, w: number, h: number, r: Rng) => void): UvRect {
    return this.A.draw(`art:${key}`, w, h, (g, ww, hh) => fn(g, ww, hh, this.rng.fork(key)));
  }
}
export { WHITE };
