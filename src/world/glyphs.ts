// src/world/glyphs.ts — owner B. Browser half of the GDD §9 P8 rule: draw 拆 and 折 in the same font and size on a
// canvas and subtract them (the diff is "the dot"). The chai textures use the very same drawGlyph().
import { FONT } from '../core/fonts';
import { t } from '../data/zh';
import { GLYPH, glyphDiff, type DotPx } from './p8';

export const GLYPH_FONT = FONT.sign;

/** Draw one glyph exactly as the measurement does (black on transparent unless a colour is given). */
export function drawGlyph(g: CanvasRenderingContext2D, key: 'sign.chai' | 'sign.zhe', color = '#000'): void {
  g.save();
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${GLYPH.fontPx}px ${GLYPH_FONT}`;
  g.fillText(t(key), GLYPH.cx, GLYPH.cy);
  g.restore();
}

function mask(key: 'sign.chai' | 'sign.zhe'): Uint8Array | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = GLYPH.size; c.height = GLYPH.size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  drawGlyph(g, key);
  const d = g.getImageData(0, 0, GLYPH.size, GLYPH.size).data;
  const m = new Uint8Array(GLYPH.size * GLYPH.size);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/** The dot of 拆 in canvas pixels, or null (no canvas / degenerate glyphs → the caller uses DEFAULT_DOT). */
export function measureGlyphDot(): DotPx | null {
  try {
    const a = mask('sign.chai'), b = mask('sign.zhe');
    if (!a || !b) return null;
    const d = glyphDiff(a, b, GLYPH.size, GLYPH.size);
    return d && d.count > 40 ? d : null;
  } catch { return null; }
}
