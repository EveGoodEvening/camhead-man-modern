// src/chars/atlas.ts — owner C. The shared 512² character atlas (browser only): live NPC faces, the 周记 sticker, the
// 零号线 badge, the 0-路 sign, and 40 old-photo portraits that follow FaceState (GDD §5.7: mosaic / blank / clear).
import { LinearFilter, SRGBColorSpace, type CanvasTexture, type Texture } from 'three';
import type { Rng } from '../contracts';
import { PAL } from '../art/palette';
import { FONT, ensureFont } from '../core/fonts';
import { makeCanvas, makeCanvasTexture } from '../core/canvas';
import { t } from '../data/zh';
import { ATLAS, CELL, CELLS, PHOTO_CELLS, photoCell, type CellRect } from './atlasLayout';

export type PhotoLook = 'clear' | 'blank' | { mosaic: number };

export interface Atlas {
  readonly texture: CanvasTexture;
  /** Portrait decal for `seed`: a clone sharing the atlas image, offset/repeat on the seed's cell. */
  faceTexture(seed: number): Texture;
  setPhotoLook(look: PhotoLook): void;
  /** Re-bake the text cells once their exact glyphs are loaded (TECH §5). */
  refreshText(): Promise<void>;
}

type Ctx = CanvasRenderingContext2D;
const INK: string = PAL.inkDeep;

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill?: string, stroke?: string, lw = 1.6): void {
  g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function line(g: Ctx, pts: readonly (readonly [number, number])[], lw: number, color = INK): void {
  g.save(); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
}
function arc(g: Ctx, x: number, y: number, r: number, a0: number, a1: number, lw: number, color = INK): void {
  g.save(); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); g.restore();
}

// ------------------------------------------------------------------------------------------------ live NPC faces
/** Generic cartoon face in a 64² cell, drawn on white (the head's vertex colour tints it). */
interface FaceOpts {
  eyes: 'dot' | 'closed' | 'sleepy' | 'wide' | 'smile'; eyeGap?: number; eyeY?: number; eyeR?: number;
  brows?: 'flat' | 'up' | 'worried' | 'thick' | 'grey' | null; mouth?: 'flat' | 'smile' | 'o' | 'frown' | 'tiny' | null;
  cheeks?: string | null; beard?: boolean; wrinkles?: boolean; glasses?: boolean; bg?: string;
}
function drawFace(g: Ctx, c: CellRect, o: FaceOpts): void {
  const x0 = c.x, y0 = c.y;
  g.fillStyle = o.bg ?? '#ffffff'; g.fillRect(x0, y0, CELL, CELL);
  const cx = x0 + 32, ey = y0 + (o.eyeY ?? 30), gap = o.eyeGap ?? 9, er = o.eyeR ?? 2.6;
  if (o.cheeks) { ellipse(g, cx - gap - 3, ey + 8, 4.2, 3, o.cheeks); ellipse(g, cx + gap + 3, ey + 8, 4.2, 3, o.cheeks); }
  for (const s of [-1, 1]) {
    const ex = cx + s * gap;
    if (o.eyes === 'dot') ellipse(g, ex, ey, er * 0.85, er * 1.15, INK);
    else if (o.eyes === 'wide') { ellipse(g, ex, ey, er * 1.4, er * 1.6, '#ffffff', INK, 1.4); ellipse(g, ex, ey + 0.5, er * 0.7, er * 0.8, INK); }
    else if (o.eyes === 'closed') line(g, [[ex - 3.5, ey + 0.5], [ex, ey + 1.8], [ex + 3.5, ey + 0.5]], 1.8);
    else if (o.eyes === 'sleepy') { line(g, [[ex - 3.5, ey - 0.5], [ex + 3.5, ey - 0.5]], 1.6); ellipse(g, ex, ey + 1.2, er * 0.75, er * 0.6, INK); }
    else if (o.eyes === 'smile') arc(g, ex, ey + 2, 3.4, Math.PI * 1.15, Math.PI * 1.85, 1.8);
    const by = ey - 6.5;
    if (o.brows === 'flat') line(g, [[ex - 4, by], [ex + 4, by]], 1.6);
    else if (o.brows === 'up') line(g, [[ex - 4 * s, by + 1], [ex + 4 * s, by - 1]], 1.6);
    else if (o.brows === 'worried') line(g, [[ex - 4 * s, by - 1], [ex + 4 * s, by + 1.2]], 1.6);
    else if (o.brows === 'thick') line(g, [[ex - 4.5 * s, by + 1], [ex + 4.5 * s, by - 1.4]], 2.8);
    else if (o.brows === 'grey') line(g, [[ex - 4.5 * s, by], [ex + 4.5 * s, by + 1.2]], 2.6, '#8d8a86');
  }
  if (o.glasses) { for (const s of [-1, 1]) ellipse(g, cx + s * gap, ey, 5.2, 4.4, undefined, INK, 1.1); line(g, [[cx - gap + 5, ey], [cx + gap - 5, ey]], 1.1); }
  if (o.wrinkles) { line(g, [[cx - gap - 6, ey + 3], [cx - gap - 4, ey + 5]], 1); line(g, [[cx + gap + 6, ey + 3], [cx + gap + 4, ey + 5]], 1); line(g, [[cx - 5, ey - 10], [cx + 5, ey - 10]], 0.9); }
  const my = ey + 12;
  if (o.mouth === 'flat') line(g, [[cx - 3, my], [cx + 3, my]], 1.5);
  else if (o.mouth === 'smile') arc(g, cx, my - 3, 4, Math.PI * 0.2, Math.PI * 0.8, 1.6);
  else if (o.mouth === 'o') ellipse(g, cx, my, 1.8, 2.2, INK);
  else if (o.mouth === 'frown') arc(g, cx, my + 3, 4, Math.PI * 1.2, Math.PI * 1.8, 1.5);
  else if (o.mouth === 'tiny') ellipse(g, cx, my, 1.4, 0.9, INK);
  if (o.beard) { g.fillStyle = 'rgba(60,78,84,0.35)'; for (let i = 0; i < 18; i++) g.fillRect(cx - 7 + (i * 5) % 14, my + 2 + (i % 3) * 2, 1, 1); }
}

function drawZhimei(g: Ctx, c: CellRect, twoEyes: boolean): void {
  g.fillStyle = '#ffffff'; g.fillRect(c.x, c.y, CELL, CELL);
  const cx = c.x + 32, ey = c.y + 29;
  ellipse(g, cx - 12, ey + 9, 5.5, 5.5, PAL.bannerRed);
  ellipse(g, cx + 12, ey + 9, 5.5, 5.5, PAL.bannerRed);
  // brushed eyes: the left eye (her left = viewer's right) is dotted; the right stays blank until 点睛
  line(g, [[cx + 5, ey], [cx + 13, ey - 1]], 2.2);
  ellipse(g, cx + 9, ey + 1.5, 2.4, 2.4, INK);
  line(g, [[cx - 13, ey - 1], [cx - 5, ey]], 2.2);
  if (twoEyes) ellipse(g, cx - 9, ey + 1.5, 2.6, 2.6, PAL.bannerRed);
  line(g, [[cx + 5, ey - 7], [cx + 12, ey - 8]], 1.4);
  line(g, [[cx - 12, ey - 8], [cx - 5, ey - 7]], 1.4);
  ellipse(g, cx, ey + 13, 2.2, 1.6, PAL.bannerRed);
}

function drawCat(g: Ctx, c: CellRect, closed: boolean): void {
  g.fillStyle = PAL.inkDeep; g.fillRect(c.x, c.y, CELL, CELL);
  const cx = c.x + 32, ey = c.y + 30;
  for (const s of [-1, 1]) {
    const ex = cx + s * 11;
    if (closed) line(g, [[ex - 5, ey], [ex, ey + 2], [ex + 5, ey]], 2, '#f7cf5e');
    else {
      g.beginPath(); g.moveTo(ex - 6, ey); g.quadraticCurveTo(ex, ey - 6, ex + 6, ey); g.quadraticCurveTo(ex, ey + 6, ex - 6, ey);
      g.fillStyle = '#e8d05a'; g.fill();
      ellipse(g, ex, ey, 1.2, 4.2, '#141b20');
      ellipse(g, ex - 2, ey - 2, 1, 1, '#f3f6ea');
    }
  }
  g.fillStyle = '#b97c7c'; g.beginPath(); g.moveTo(cx - 2.5, ey + 8); g.lineTo(cx + 2.5, ey + 8); g.lineTo(cx, ey + 11); g.fill();
  line(g, [[cx, ey + 11], [cx - 3, ey + 14]], 1, '#6d7478'); line(g, [[cx, ey + 11], [cx + 3, ey + 14]], 1, '#6d7478');
  for (const s of [-1, 1]) for (const k of [0, 1]) line(g, [[cx + s * 6, ey + 10 + k * 2], [cx + s * 17, ey + 8 + k * 4]], 0.8, '#9aa3a6');
}

function drawSticker(g: Ctx, c: CellRect, text: string): void {
  g.fillStyle = '#ffffff'; g.fillRect(c.x, c.y, CELL, CELL);
  const cx = c.x + 32, cy = c.y + 32;
  ellipse(g, cx, cy, 30, 30, '#f3f1e6');
  ellipse(g, cx, cy, 26, 26, undefined, PAL.blue, 2.2);
  g.fillStyle = PAL.blue; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ch = [...text];
  g.font = `700 13px ${FONT.body}`;
  g.fillText(ch.slice(0, 2).join(''), cx, cy - 9);
  g.font = `700 11px ${FONT.body}`;
  g.fillText(ch.slice(2).join(''), cx, cy + 7);
  // worn edge: bites taken out of the rim
  g.fillStyle = '#ffffff';
  for (const [a, r] of [[0.6, 4], [2.2, 3], [4.1, 5], [5.3, 3]] as const) ellipse(g, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, r, r, '#ffffff');
}

function drawBadge(g: Ctx, c: CellRect, text: string): void {
  g.fillStyle = PAL.navy; g.fillRect(c.x, c.y, CELL, CELL);
  g.fillStyle = '#e6d9a8'; g.fillRect(c.x + 4, c.y + 20, 56, 24);
  g.strokeStyle = '#8c552b'; g.lineWidth = 1.5; g.strokeRect(c.x + 5, c.y + 21, 54, 22);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 15px ${FONT.sign}`;
  g.fillText(text, c.x + 32, c.y + 33);
}

function drawBusSign(g: Ctx, c: CellRect, text: string): void {
  g.fillStyle = '#1b2327'; g.fillRect(c.x, c.y, c.w, c.h);
  g.fillStyle = '#ffb347'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 36px ${FONT.body}`;
  const w = g.measureText(text).width;
  if (w > c.w - 16) g.font = `700 ${Math.floor((36 * (c.w - 16)) / w)}px ${FONT.body}`;
  g.fillText(text, c.x + c.w / 2, c.y + c.h / 2 + 2);
  // LED dot grid
  g.fillStyle = 'rgba(27,35,39,0.45)';
  for (let y = c.y; y < c.y + c.h; y += 3) g.fillRect(c.x, y, c.w, 1);
}

// ------------------------------------------------------------------------------------------------ old photos
const BACKDROPS = ['#8fb3b8', '#c9b99a', '#9fb0c9', '#d8c6b8', '#a9b8a0', '#b8a8a0'];
const CLOTHES = [PAL.navy, PAL.charcoal, PAL.sage, PAL.teal, PAL.rust, PAL.clothWhite, PAL.roofMauve, PAL.ochre];
const HAIRS = [PAL.hair, '#2b3c3e', PAL.char.hairBrown, PAL.char.hairGrey, '#4a4038'];
const SKINS = [PAL.skin, '#e2c2b2', '#f0d8cc', '#d9b8a8'];

export interface Portrait { bg: string; cloth: string; hair: string; skin: string; style: number; eyes: FaceOpts['eyes']; mouth: FaceOpts['mouth']; brows: FaceOpts['brows']; glasses: boolean; old: boolean; kid: boolean }
export function portraitFor(seed: number, rng: Rng): Portrait {
  const r = rng.fork(`chars:portrait:${seed}`);
  const old = r.next() < 0.35, kid = !old && r.next() < 0.18;
  return {
    bg: r.pick(BACKDROPS), cloth: r.pick(CLOTHES), hair: old ? (r.next() < 0.7 ? PAL.char.hairGrey : '#b9b6ae') : r.pick(HAIRS),
    skin: r.pick(SKINS), style: r.int(0, 4), eyes: r.pick(['dot', 'dot', 'smile', 'sleepy'] as const),
    mouth: r.pick(['smile', 'flat', 'smile', 'tiny'] as const), brows: r.pick(['flat', 'up', 'worried', null] as const),
    glasses: r.next() < 0.18, old, kid,
  };
}

/** Face oval of a portrait cell (px, relative to the cell). */
const FACE = { cx: 32, cy: 33, rx: 12, ry: 14.5 };
/** Square the photo mosaic covers (face + hairline). */
const MOSAIC = { x: 14, y: 12, w: 36, h: 40 };

function drawPortrait(g: Ctx, c: CellRect, p: Portrait, blank: boolean): void {
  const x0 = c.x, y0 = c.y, cx = x0 + FACE.cx, cy = y0 + FACE.cy;
  const ry = p.kid ? FACE.ry - 2 : FACE.ry, rx = p.kid ? FACE.rx - 0.5 : FACE.rx;
  g.fillStyle = p.bg; g.fillRect(x0, y0, CELL, CELL);
  // shoulders + collar
  g.fillStyle = p.cloth;
  g.beginPath(); g.moveTo(x0 + 6, y0 + 64); g.quadraticCurveTo(x0 + 10, y0 + 47, cx, y0 + 47); g.quadraticCurveTo(x0 + 54, y0 + 47, x0 + 58, y0 + 64); g.fill();
  g.fillStyle = p.skin; g.fillRect(cx - 4, cy + ry - 4, 8, 7);
  g.fillStyle = PAL.clothWhite; g.beginPath(); g.moveTo(cx - 7, y0 + 48); g.lineTo(cx, y0 + 55); g.lineTo(cx + 7, y0 + 48); g.fill();
  // hair behind (bun / long)
  g.fillStyle = p.hair;
  if (p.style === 1 && !p.kid) ellipse(g, cx, cy - ry + 1, 7, 5.5, p.hair);
  if (p.style === 3) { g.fillRect(cx - rx - 2.5, cy - 4, 5, 16); g.fillRect(cx + rx - 2.5, cy - 4, 5, 16); }
  ellipse(g, cx, cy, rx, ry, p.skin, INK, 1.3);
  // hair cap
  g.fillStyle = p.hair;
  g.beginPath(); g.ellipse(cx, cy - 3, rx + 1.2, ry - 1, 0, Math.PI, Math.PI * 2);
  if (p.style === 2 || p.old && p.style === 4) g.ellipse(cx, cy - ry + 3, rx - 2, 3.5, 0, Math.PI, Math.PI * 2);
  g.fill();
  if (p.style === 0 || p.kid) { g.fillRect(cx - rx, cy - 5, rx * 2, 3.5); }
  if (blank) return;
  drawFaceFeatures(g, cx, cy + 1, p);
}
function drawFaceFeatures(g: Ctx, cx: number, cy: number, p: Portrait): void {
  const gap = 5.5, ey = cy - 1;
  for (const s of [-1, 1]) {
    const ex = cx + s * gap;
    if (p.eyes === 'smile') arc(g, ex, ey + 1.5, 2.2, Math.PI * 1.15, Math.PI * 1.85, 1.3);
    else if (p.eyes === 'sleepy') line(g, [[ex - 2, ey], [ex + 2, ey]], 1.4);
    else ellipse(g, ex, ey, 1.3, 1.6, INK);
    if (p.brows) line(g, [[ex - 2.5 * s, ey - 4 + (p.brows === 'up' ? 1 : 0)], [ex + 2.5 * s, ey - 4 - (p.brows === 'up' ? 0.8 : p.brows === 'worried' ? -0.8 : 0)]], 1.2);
  }
  if (p.glasses) for (const s of [-1, 1]) ellipse(g, cx + s * gap, ey, 3.3, 2.8, undefined, INK, 0.9);
  line(g, [[cx, ey + 2], [cx - 1, ey + 5], [cx + 0.8, ey + 5.4]], 0.9);
  const my = ey + 8.5;
  if (p.mouth === 'smile') arc(g, cx, my - 2, 3, Math.PI * 0.2, Math.PI * 0.8, 1.3);
  else if (p.mouth === 'tiny') ellipse(g, cx, my, 1.2, 0.8, INK);
  else line(g, [[cx - 2.2, my], [cx + 2.2, my]], 1.2);
  if (p.old) { line(g, [[cx - gap - 4, ey + 2], [cx - gap - 3, ey + 4]], 0.8); line(g, [[cx + gap + 4, ey + 2], [cx + gap + 3, ey + 4]], 0.8); }
}

// ------------------------------------------------------------------------------------------------ atlas
/** Synchronous so faceTexture() works before chars.init (B's portrait wall builds first); text cells are re-baked later. */
export function createAtlas(rng: Rng): Atlas {
  const sticker = t('scr.sticker'), badge = t('scr.badge'), sign = t('scr.bus.sign');
  const portraits = Array.from({ length: PHOTO_CELLS }, (_, i) => portraitFor(i, rng));
  const photoH = Math.ceil(PHOTO_CELLS / 8) * CELL;
  const clear = makeCanvas(ATLAS, photoH), blank = makeCanvas(ATLAS, photoH);
  portraits.forEach((p, i) => { const c = photoCell(i); drawPortrait(clear.ctx, c, p, false); drawPortrait(blank.ctx, c, p, true); });
  const small = makeCanvas(24, 24);

  const tex = makeCanvasTexture(ATLAS, ATLAS, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS, ATLAS);
    g.drawImage(clear.canvas, 0, 0);
    drawFace(g, CELLS.xiaolin, { eyes: 'sleepy', brows: 'flat', mouth: 'flat' });
    drawFace(g, CELLS.xiaolin_closed, { eyes: 'closed', brows: 'flat', mouth: 'flat' });
    drawFace(g, CELLS.granny, { eyes: 'dot', brows: 'grey', mouth: 'smile', cheeks: '#f1c4b8', wrinkles: true, eyeGap: 10 });
    drawFace(g, CELLS.granny_closed, { eyes: 'closed', brows: 'grey', mouth: 'smile', cheeks: '#f1c4b8', wrinkles: true, eyeGap: 10 });
    drawFace(g, CELLS.chen, { eyes: 'dot', brows: 'thick', mouth: 'flat', wrinkles: true, beard: true });
    drawFace(g, CELLS.chen_closed, { eyes: 'closed', brows: 'thick', mouth: 'flat', wrinkles: true, beard: true });
    drawFace(g, CELLS.liu, { eyes: 'dot', brows: 'worried', mouth: 'tiny', glasses: true });
    drawFace(g, CELLS.liu_closed, { eyes: 'closed', brows: 'worried', mouth: 'tiny', glasses: true });
    drawFace(g, CELLS.tudi, { eyes: 'smile', brows: 'grey', mouth: null, cheeks: '#f0c0b0', eyeGap: 8, eyeY: 28 });
    drawFace(g, CELLS.tudi_closed, { eyes: 'closed', brows: 'grey', mouth: null, cheeks: '#f0c0b0', eyeGap: 8, eyeY: 28 });
    drawZhimei(g, CELLS.zhimei1, false);
    drawZhimei(g, CELLS.zhimei2, true);
    drawCat(g, CELLS.meiqiu, false);
    drawCat(g, CELLS.meiqiu_closed, true);
    drawFace(g, CELLS.heroFace, { eyes: 'dot', brows: 'thick', mouth: 'smile', eyeGap: 9.5 });
    drawFace(g, CELLS.laoZhou, { eyes: 'smile', brows: 'grey', mouth: 'smile', wrinkles: true, glasses: true, bg: '#ffffff' });
    drawFace(g, CELLS.walker, { eyes: 'dot', brows: null, mouth: null });
    drawSticker(g, CELLS.sticker, sticker);
    drawBadge(g, CELLS.badge, badge);
    drawBusSign(g, CELLS.busSign, sign);
    g.fillStyle = '#ffffff'; g.fillRect(CELLS.white.x, CELLS.white.y, CELL, CELL);
  });
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  const ctx = (tex.image as HTMLCanvasElement).getContext('2d') as Ctx;
  const clones: Texture[] = [];

  const setPhotoLook = (look: PhotoLook) => {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(look === 'blank' ? blank.canvas : clear.canvas, 0, 0);
    if (typeof look === 'object') {
      const n = Math.max(2, Math.floor(look.mosaic));
      small.canvas.width = n; small.canvas.height = n;
      for (let i = 0; i < PHOTO_CELLS; i++) {
        const c = photoCell(i);
        small.ctx.imageSmoothingEnabled = true;
        small.ctx.clearRect(0, 0, n, n);
        small.ctx.drawImage(clear.canvas, c.x + MOSAIC.x, c.y + MOSAIC.y, MOSAIC.w, MOSAIC.h, 0, 0, n, n);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small.canvas, 0, 0, n, n, c.x + MOSAIC.x, c.y + MOSAIC.y, MOSAIC.w, MOSAIC.h);
      }
      ctx.imageSmoothingEnabled = true;
    }
    tex.needsUpdate = true;
    for (const c of clones) c.needsUpdate = true;
  };

  return {
    texture: tex,
    faceTexture(seed) {
      const c = photoCell(seed);
      const k = tex.clone();
      k.offset.set(c.u0, c.v0);
      k.repeat.set(c.u1 - c.u0, c.v1 - c.v0);
      k.userData = { atlas: tex, cell: { u0: c.u0, v0: c.v0, u1: c.u1, v1: c.v1 } };
      k.needsUpdate = true;
      clones.push(k);
      return k;
    },
    setPhotoLook,
    async refreshText() {
      await ensureFont(`700 13px ${FONT.body}`, sticker + sign);
      await ensureFont(`700 15px ${FONT.sign}`, badge);
      drawSticker(ctx, CELLS.sticker, sticker);
      drawBadge(ctx, CELLS.badge, badge);
      drawBusSign(ctx, CELLS.busSign, sign);
      tex.needsUpdate = true;
      for (const c of clones) c.needsUpdate = true;
    },
  };
}
