// src/chars/hero/screen.ts — owner C. The back screen = in-world HUD (GDD §2.1, ART §7.2): a 128×256 canvas redrawn only
// when its content key changes (≤ 4 Hz). Glyphs are drawn line art (never font emoji).
import { LinearFilter, type CanvasTexture } from 'three';
import type { HeroExpr, HeroScreen } from '../../contracts';
import type { Rng } from '../../contracts';
import { PAL } from '../../art/palette';
import { FONT } from '../../core/fonts';
import { makeCanvasTexture } from '../../core/canvas';
import { t } from '../../data/zh';

export const SCREEN_W = 128, SCREEN_H = 256;
const GLYPH = PAL.char.screenGlyph, BG = PAL.char.screenBg, DIM = '#3c4e54', RED = PAL.neonRed;

export interface ScreenView {
  mode: HeroScreen | 'flash_stranger' | 'flash_self';
  expr: HeroExpr;
  blinkOn: boolean;          // 'found' 2 Hz blink / REC dot / caret
  bars: 0 | 1 | 2 | 3 | 4;
  clock: string;
  text: string;              // typing: the revealed part
  photo: HTMLImageElement | null;
  photoCount: number; photoIndex: number;
  noise: number;             // static frame index
}

/** Typing speed of his lines on the back screen (characters per second). */
export const TYPE_CPS = 24;
/** The part of `text` typed after `elapsed` seconds (GDD §2.1: his lines appear character by character). */
export function typed(text: string, elapsed: number): string {
  const n = Math.floor(Math.max(0, elapsed) * TYPE_CPS);
  const chars = [...text];
  return n >= chars.length ? text : chars.slice(0, n).join('');
}

export function viewKey(v: ScreenView): string {
  return [v.mode, v.expr, v.blinkOn ? 1 : 0, v.bars, v.clock, v.text, v.photo ? v.photo.src.length : 0, v.photoIndex, v.photoCount, v.noise].join('|');
}

type Ctx = CanvasRenderingContext2D;
function stroke(g: Ctx, w: number, color: string = GLYPH): void { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; }
function dot(g: Ctx, x: number, y: number, r: number, color: string = GLYPH): void { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function path(g: Ctx, pts: readonly (readonly [number, number])[]): void { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }

function statusBar(g: Ctx, v: ScreenView): void {
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i < v.bars ? GLYPH : DIM;
    const h = 4 + i * 3.5;
    g.fillRect(7 + i * 5, 18 - h, 3.5, h);
  }
  g.fillStyle = GLYPH; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `11px ${FONT.hud}`;
  g.fillText(v.clock, 55, 12);
  g.font = `8px ${FONT.hud}`;
  g.fillText(t('scr.battery'), 88, 12);
  stroke(g, 1.5); g.strokeRect(98, 7, 20, 10); g.fillStyle = GLYPH; g.fillRect(118.5, 10, 2.5, 4);
  g.fillStyle = RED; g.fillRect(100, 9, 2, 6);
}

function face(g: Ctx, expr: HeroExpr, blinkOn: boolean): void {
  const cx = 64, ey = 112;
  stroke(g, 6);
  switch (expr) {
    case 'happy':
      for (const x of [40, 88]) path(g, [[x - 12, ey + 6], [x, ey - 8], [x + 12, ey + 6]]);
      g.beginPath(); g.arc(cx, ey + 22, 16, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      break;
    case 'puzzled':
      g.beginPath(); g.arc(40, ey - 6, 11, Math.PI * 1.05, Math.PI * 2.25); g.stroke();
      path(g, [[46, ey + 8], [40, ey + 14], [40, ey + 20]]); dot(g, 40, ey + 32, 4);
      dot(g, 88, ey + 4, 6);
      path(g, [[54, ey + 44], [74, ey + 40]]);
      break;
    case 'surprised':
      for (const x of [40, 88]) { g.beginPath(); g.arc(x, ey, 13, 0, Math.PI * 2); g.stroke(); }
      g.beginPath(); g.arc(cx, ey + 40, 7, 0, Math.PI * 2); g.stroke();
      break;
    case 'scared':
      path(g, [[28, ey - 12], [48, ey], [28, ey + 12]]); path(g, [[100, ey - 12], [80, ey], [100, ey + 12]]);
      path(g, [[44, ey + 42], [52, ey + 36], [60, ey + 42], [68, ey + 36], [76, ey + 42], [84, ey + 36]]);
      break;
    case 'thinking':
      for (const x of [40, 64, 88]) dot(g, x, ey + 10, 6);
      break;
    case 'found':
      if (blinkOn) { path(g, [[cx, ey - 40], [cx, ey + 12]]); dot(g, cx, ey + 34, 6); }
      else { dot(g, 40, ey, 7); dot(g, 88, ey, 7); }
      break;
    default:
      dot(g, 40, ey, 7); dot(g, 88, ey, 7);
      g.beginPath(); g.arc(cx, ey + 18, 12, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
}

function wrap(g: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function strangerFace(g: Ctx): void {
  stroke(g, 3.5, '#cfe8dc');
  g.beginPath(); g.ellipse(64, 124, 44, 58, 0, 0, Math.PI * 2); g.stroke();
  for (const x of [46, 82]) { g.beginPath(); g.arc(x, 110, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.beginPath(); g.arc(64, 128, 30, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(38, 136); g.lineTo(90, 136); g.stroke();
  for (let x = 44; x <= 84; x += 8) path(g, [[x, 136], [x, 146 + 4 * Math.sin(x)]]);
  path(g, [[64, 112], [60, 126], [66, 126]]);
}
function selfFace(g: Ctx): void {
  stroke(g, 3.5, '#cfe8dc');
  g.beginPath(); g.ellipse(64, 128, 38, 50, 0, 0, Math.PI * 2); g.stroke();
  path(g, [[28, 108], [34, 84], [52, 74], [80, 74], [96, 86], [100, 110]]);
  path(g, [[40, 106], [56, 101]]); path(g, [[72, 101], [88, 106]]);
  g.lineWidth = 5; path(g, [[40, 104], [56, 99]]); path(g, [[72, 99], [88, 104]]);
  dot(g, 48, 116, 4, '#cfe8dc'); dot(g, 80, 116, 4, '#cfe8dc');
  g.lineWidth = 3; path(g, [[64, 118], [60, 134], [67, 135]]);
  path(g, [[52, 152], [76, 152]]);
  g.beginPath(); g.arc(24, 126, 7, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.arc(104, 126, 7, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
}

/** I-look: the lit screen glows. Content is drawn on a transparent layer, then composited over a faint teal backlight
 *  as a blurred halo + the crisp glyphs, so the back screen reads as a lit phone (not a black slab) at 60 px. */
const BACKLIT = '#27393d', GLOW_BLUR = 'blur(5px)';

export class ScreenCanvas {
  readonly texture: CanvasTexture;
  private g: Ctx;                        // the content layer while drawing
  private readonly out: Ctx;             // the texture's canvas
  private readonly layer: Ctx | null;    // transparent content layer (null in headless tests without canvas)
  private readonly rng: Rng;
  private qr: boolean[] = [];

  constructor(rng: Rng) {
    this.rng = rng.fork('chars:screen');
    this.texture = makeCanvasTexture(SCREEN_W, SCREEN_H, (g) => { g.fillStyle = BG; g.fillRect(0, 0, SCREEN_W, SCREEN_H); });
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.out = (this.texture.image as HTMLCanvasElement).getContext('2d') as Ctx;
    let layer: Ctx | null = null;
    try {
      const c = document.createElement('canvas');
      c.width = SCREEN_W; c.height = SCREEN_H;
      layer = c.getContext('2d');
    } catch { layer = null; }
    this.layer = layer;
    this.g = layer ?? this.out;
    const q = this.rng.fork('qr');
    for (let i = 0; i < 25 * 25; i++) this.qr.push(q.next() < 0.48);
  }

  draw(v: ScreenView): void {
    const out = this.out, L = this.layer;
    const g = this.g = L ?? out;
    if (L) L.clearRect(0, 0, SCREEN_W, SCREEN_H);
    g.save();
    if (!L) { g.fillStyle = BG; g.fillRect(0, 0, SCREEN_W, SCREEN_H); }
    switch (v.mode) {
      case 'flash_stranger': strangerFace(g); break;
      case 'flash_self': selfFace(g); break;
      case 'rec': this.rec(v); break;
      case 'typing': this.typing(v); break;
      case 'show': this.show(v); break;
      case 'ridecode': this.ridecode(v); break;
      case 'static': this.noise(v); break;
      default: statusBar(g, v); face(g, v.expr, v.blinkOn);
    }
    g.restore();
    if (L) {
      // backlight: ink.deep edges, a faint teal glow in the middle (the panel is lit), then halo + crisp content
      const grd = out.createRadialGradient(SCREEN_W / 2, SCREEN_H * 0.45, 8, SCREEN_W / 2, SCREEN_H * 0.45, SCREEN_H * 0.62);
      grd.addColorStop(0, BACKLIT); grd.addColorStop(1, BG);
      out.save();
      out.fillStyle = grd; out.fillRect(0, 0, SCREEN_W, SCREEN_H);
      out.filter = GLOW_BLUR; out.globalAlpha = 0.9;
      out.drawImage(L.canvas, 0, 0);
      out.drawImage(L.canvas, 0, 0);
      out.filter = 'none'; out.globalAlpha = 1;
      out.drawImage(L.canvas, 0, 0);
      out.restore();
    }
    this.texture.needsUpdate = true;
  }

  private rec(v: ScreenView): void {
    const g = this.g;
    statusBar(g, v);
    stroke(g, 3);
    for (const [x, y, dx, dy] of [[14, 40, 1, 1], [114, 40, -1, 1], [14, 236, 1, -1], [114, 236, -1, -1]] as const) path(g, [[x, y + 16 * dy], [x, y], [x + 16 * dx, y]]);
    if (v.blinkOn) dot(g, 34, 128, 9, RED);
    g.fillStyle = GLYPH; g.font = `20px ${FONT.hud}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(t('scr.rec'), 50, 129);
  }

  private typing(v: ScreenView): void {
    const g = this.g;
    statusBar(g, v);
    g.font = `17px ${FONT.body}`; g.fillStyle = '#cfe8dc'; g.textAlign = 'left'; g.textBaseline = 'top';
    const lines = wrap(g, v.text, SCREEN_W - 20).slice(-9);
    lines.forEach((l, i) => g.fillText(l, 10, 40 + i * 22));
    if (v.blinkOn) {
      const last = lines[lines.length - 1] ?? '';
      const w = g.measureText(last).width;
      g.fillStyle = GLYPH; g.fillRect(12 + w, 40 + Math.max(0, lines.length - 1) * 22 + 2, 8, 16);
    }
  }

  private show(v: ScreenView): void {
    const g = this.g;
    statusBar(g, v);
    g.fillStyle = '#f3f6ea'; g.fillRect(6, 44, 116, 170);
    if (v.photo && v.photo.complete && v.photo.naturalWidth > 0) {
      const iw = v.photo.naturalWidth, ih = v.photo.naturalHeight;
      const s = Math.max(108 / iw, 162 / ih), w = iw * s, h = ih * s;
      g.save(); g.beginPath(); g.rect(10, 48, 108, 162); g.clip();
      g.drawImage(v.photo, 64 - w / 2, 129 - h / 2, w, h);
      g.restore();
    }
    g.fillStyle = GLYPH; g.font = `16px ${FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(v.photoCount > 1 ? `${t('scr.show')} ${v.photoIndex + 1}/${v.photoCount}` : t('scr.show'), 64, 234);
  }

  private ridecode(v: ScreenView): void {
    const g = this.g;
    statusBar(g, v);
    g.fillStyle = GLYPH; g.font = `18px ${FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t('scr.ridecode'), 64, 44);
    g.fillStyle = '#f3f6ea'; g.fillRect(9, 62, 110, 110);
    const m = 4, ox = 14, oy = 67;
    g.fillStyle = PAL.inkDeep;
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if (this.qr[y * 25 + x]) g.fillRect(ox + x * m, oy + y * m, m, m);
    for (const [fx, fy] of [[0, 0], [18, 0], [0, 18]] as const) {
      g.fillStyle = '#f3f6ea'; g.fillRect(ox + fx * m - 2, oy + fy * m - 2, 7 * m + 4, 7 * m + 4);
      g.fillStyle = PAL.inkDeep; g.fillRect(ox + fx * m, oy + fy * m, 7 * m, 7 * m);
      g.fillStyle = '#f3f6ea'; g.fillRect(ox + fx * m + m, oy + fy * m + m, 5 * m, 5 * m);
      g.fillStyle = PAL.inkDeep; g.fillRect(ox + fx * m + 2 * m, oy + fy * m + 2 * m, 3 * m, 3 * m);
    }
    g.fillStyle = GLYPH; g.font = `13px ${FONT.body}`;
    g.fillText(t('scr.ridecode.line'), 64, 192);
    g.font = `17px ${FONT.body}`;
    g.fillText(t('scr.ridecode.name'), 64, 216);
  }

  private noise(v: ScreenView): void {
    const g = this.g;
    const r = this.rng.fork(`static:${v.noise % 8}`);
    for (let y = 0; y < SCREEN_H; y += 4) {
      const tear = r.next() < 0.08 ? r.int(-10, 10) : 0;
      for (let x = 0; x < SCREEN_W; x += 4) {
        const k = r.next();
        g.fillStyle = k < 0.45 ? BG : k < 0.75 ? DIM : k < 0.93 ? '#6d8f96' : GLYPH;
        g.fillRect(x + tear, y, 4, 4);
      }
    }
    g.fillStyle = BG; g.fillRect(8, 116, 112, 28);
    g.fillStyle = GLYPH; g.font = `17px ${FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t('scr.static'), 64, 131);
  }
}
