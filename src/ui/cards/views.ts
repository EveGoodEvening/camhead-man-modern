// src/ui/cards/views.ts — owner E. Card views on sim time (GDD §10.1/§10.5/§15, ART §8.2): chapter card with seal stamp,
// 聊斋卡 (one character every 40 ms), photo card (white flash, −2°, 4 s), epilogue (a line every 1.6 s), credits
// (40 px/s, ×4 while Space is held), and the item note popup.
import type { Core } from '../../contracts';
import type { CardKind } from '../../types';
import { CHAPTERS } from '../../data/story';
import { PRESET_PHOTOS } from '../../data/items';
import { CARDS, CREDITS, EPILOGUE, has, t } from '../../data/zh';
import { h, photoImg } from '../dom';
import { touchCapable } from '../touch';

export interface CardView {
  readonly el: HTMLElement;
  /** Advance on sim time; `fast` = Space held (credits). */
  update(t: number, dt: number, fast: boolean): void;
  /** A player key press: finish the reveal first, then close (cards.ts gates it: CARD_GRACE / CARD_READ). */
  key(): void;
  readonly done: boolean;
  /** The whole text is on screen (the next accepted key closes the card). */
  readonly revealed: boolean;
}
type CardText = { title: string; subtitle?: string; body?: string; seal?: string };

function cardText(id: string, prefixes: readonly string[]): CardText | null {
  for (const p of ['', ...prefixes]) { const c = CARDS[`${p}${id}`]; if (c) return c; }
  return null;
}
const PAIKE = '\u62CD\u5BA2\u66F0';
const QUOTE = '\u300C';

function seal(text: string): HTMLElement {
  return h('div', `ui-seal${[...text].length > 1 ? ' ui-two' : ''}`, { text });
}
function ground(): HTMLElement { return h('div', 'ui-card-ground'); }
/** P3r2 U2: touch players have no key to press: 「点击继续」 (a tap anywhere on a card = key()). */
export function continueKey(touch = touchCapable()): 'ui.card.continue' | 'ui.card.continueTouch' {
  return touch ? 'ui.card.continueTouch' : 'ui.card.continue';
}
function cont(): HTMLElement { return h('div', 'ui-cont', { text: t(continueKey()) }); }
/** Full-width punctuation that needs its vertical (top-right) position in the 聊斋卡's vertical-rl column. */
export const LZ_PUNCT = /[\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F]/;   // ，。、；：！？
/** Kinsoku for the 聊斋卡 (P3r3 T2): closing marks never head a column, opening brackets never end one. */
const LZ_CLOSE = /[\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F\u300D\u300F\uFF09\u300B\u2026\u2014]/;   // ，。、；：！？」』）》…—
const LZ_OPEN = /[\u300C\u300E\uFF08\u300A]/;                                                       // 「『（《
/** Split a paragraph into unbreakable runs: each closing mark joins the run before it, each opening bracket the run
 *  after it (pure; unit-tested). The card wraps every run of 2+ characters in a no-wrap span, because the per-glyph
 *  spans (and the inline-block .ui-punct) are break opportunities that `line-break: strict` alone does not remove. */
export function lzRuns(p: string): string[] {
  const out: string[] = [];
  let open = '';
  for (const ch of p) {
    if (LZ_OPEN.test(ch)) { open += ch; continue; }
    if (LZ_CLOSE.test(ch) && !open && out.length) { out[out.length - 1] += ch; continue; }
    out.push(open + ch); open = '';
  }
  if (open) out.push(open);
  return out;
}

export function chapterCard(id: string, sfx: () => void): CardView {
  const c = cardText(id, ['chapter.', 'ch_', 'chapter_']);
  const ch = CHAPTERS.find((x) => x.id === id || x.cardId === id);
  const title = c?.title ?? (has(`ch.${ch?.id ?? id}`) ? t(`ch.${ch?.id ?? id}`) : id);
  const sub = c?.subtitle ?? ch?.clock ?? '';
  const sealText = c?.seal ?? (has(`ui.seal.${ch?.id ?? id}`) ? t(`ui.seal.${ch?.id ?? id}`) : '');   // the epigraph has none
  const el = h('div', 'ui-card', { testid: 'chapter-card' });
  const box = h('div', 'ui-chap');
  const st = seal(sealText);
  box.append(h('div', 'ui-chap-title', { text: title }), h('div', 'ui-chap-sub', { text: sub }));
  if (sealText) box.append(st);
  el.append(ground(), h('div', 'ui-card-body', {}, [box]));
  const STAMP = 1.1, HOLD = 3.6;
  let now = 0, stamped = false, done = false;
  const doStamp = () => { if (stamped) return; stamped = true; st.classList.add('ui-stamped'); el.classList.add('ui-shake'); sfx(); };
  return {
    el,
    get done() { return done; },
    get revealed() { return stamped; },
    update(t) {
      now = t;
      if (!el.classList.contains('ui-shown')) el.classList.add('ui-shown');
      if (now >= STAMP) doStamp();
      if (now >= HOLD) done = true;
    },
    key() { if (!stamped) doStamp(); else done = true; },
  };
}

export function liaozhaiCard(id: string): CardView {
  const c = cardText(id, ['liaozhai.', 'lz_', 'lz.']);
  const el = h('div', 'ui-card', { testid: 'liaozhai-card' });
  const lz = h('div', 'ui-lz');
  const text = h('div', 'ui-lz-text');
  const spans: HTMLElement[] = [];
  const paras = (c?.body ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  paras.forEach((p, i) => {
    const para = h('span', p.startsWith(PAIKE) ? 'ui-paike' : '');
    // P3r2 U5: the brush font has no vertical punctuation forms (「，」 sat low-left, glued to the next column):
    // .ui-punct turns the font's `vert` off and moves the glyph to the top-right of its cell, the same on every font
    for (const run of lzRuns(p)) {
      const box = [...run].length > 1 ? h('span', 'ui-lz-nb') : para;
      for (const ch of run) { const s = h('span', LZ_PUNCT.test(ch) ? 'ui-ch ui-punct' : 'ui-ch', { text: ch }); spans.push(s); box.append(s); }
      if (box !== para) para.append(box);
    }
    text.append(para);
    if (i < paras.length - 1) text.append('\n');
  });
  lz.append(h('div', 'ui-lz-title', { text: c?.title ?? '' }), text, seal(c?.seal ?? t('ui.seal.liaozhai')));
  el.append(ground(), h('div', 'ui-card-body', {}, [lz]), cont());
  const START = 0.6, PER = 0.04;
  let shown = 0, all = false, done = false;
  const reveal = (n: number) => {
    for (let i = shown; i < Math.min(n, spans.length); i++) spans[i].classList.add('ui-on');
    shown = Math.max(shown, Math.min(n, spans.length));
    if (shown >= spans.length && !all) { all = true; el.classList.add('ui-full'); lz.querySelector('.ui-seal')?.classList.add('ui-stamped'); }
  };
  return {
    el,
    get done() { return done; },
    get revealed() { return all; },
    update(t) {
      if (!el.classList.contains('ui-shown')) el.classList.add('ui-shown');
      if (t >= START) reveal(Math.floor((t - START) / PER) + 1);
    },
    key() { if (!all) reveal(spans.length); else done = true; },
  };
}

export function photoCard(core: Core, id: string): CardView {
  const p = core.store.state.photos.find((x) => x.preset === id || x.id === id) ?? null;
  const c = cardText(id, ['photo.']);
  const pre = PRESET_PHOTOS.find((x) => x.id === id);
  const caption = c?.title ?? (pre && has(pre.titleKey) ? t(pre.titleKey) : p?.label ?? '');
  const el = h('div', 'ui-card', { testid: 'photo-card' });
  const pc = h('div', 'ui-pc');
  pc.append(photoImg(p?.dataURL ?? '', '', caption, caption), h('div', 'ui-cap', { text: caption }));
  if (p?.label && p.label !== caption) pc.append(h('div', 'ui-label', { text: p.label }));
  const flash = h('div', 'ui-flash');
  el.append(h('div', 'ui-card-body', {}, [pc]), flash);
  const FLASH = 0.3, FADE = 1.2, HOLD = 4;
  let done = false, t0 = 0;
  return {
    el,
    get done() { return done; },
    get revealed() { return t0 >= FLASH; },
    update(t) {
      t0 = t;
      flash.style.opacity = String(t < FLASH ? 1 : Math.max(0, 1 - (t - FLASH) / FADE));
      if (t >= FLASH + FADE + HOLD) done = true;
    },
    key() { done = true; },
  };
}

export function epilogueCard(id: string): CardView {
  const which: 'A' | 'B' = /B$/.test(id) ? 'B' : 'A';
  const lines = EPILOGUE[which] ?? [];
  const el = h('div', 'ui-card', { testid: 'epilogue-card' });
  const box = h('div', 'ui-epi');
  const ps = lines.map((l) => { const p = h('p', l.startsWith(QUOTE) ? 'ui-quote' : '', { text: l }); box.append(p); return p; });
  el.append(ground(), h('div', 'ui-card-body', {}, [box]), cont());
  // P3r3 U4: no auto-close (it used to go 3 s after the last line, under 「按任意键继续」): the card waits for a key
  const START = 0.6, EVERY = 1.6;
  let n = 0, done = false;
  // P3r2 U2: on a short screen (phone landscape) the 13 lines of ending A do not fit: the column is capped by CSS and
  // rolls up so the newest line (the last one is the ending's key image) is always in view; earlier lines fade out
  // under the top edge
  const follow = () => {
    const last = ps[n - 1];
    if (!last) return;
    const want = Math.max(0, last.offsetTop + last.offsetHeight - box.clientHeight);
    if (want <= box.scrollTop + 0.5) return;
    box.classList.add('ui-rolled');
    const instant = document.body.classList.contains('test-mode');
    try { box.scrollTo({ top: want, behavior: instant ? 'auto' : 'smooth' }); } catch { box.scrollTop = want; }
  };
  const reveal = (k: number) => {
    const n0 = n;
    for (; n < Math.min(k, ps.length); n++) ps[n].classList.add('ui-on');
    if (n >= ps.length) el.classList.add('ui-full');
    if (n !== n0) follow();
  };
  return {
    el,
    get done() { return done; },
    get revealed() { return n >= ps.length; },
    update(t) {
      if (!el.classList.contains('ui-shown')) el.classList.add('ui-shown');
      if (t >= START) reveal(Math.floor((t - START) / EVERY) + 1);
    },
    key() { if (n < ps.length) reveal(ps.length); else done = true; },
  };
}

export function creditsCard(core: Core): CardView {
  const n = core.store.state.bestiary.length;
  const src = [...(CREDITS.length ? CREDITS : [t('ui.title'), t('ui.subtitle')])];
  // the roll stops on 「显影」 (GDD §15.3): a trailing title line in the data becomes the stop line
  while (src.length && !src[src.length - 1].trim()) src.pop();
  if (src.length > 2 && src[src.length - 1] === t('ui.title')) src.pop();
  const full = has('sys.credits.full') ? t('sys.credits.full') : t('ui.credits.bst6');
  const lines: { text: string; cls: string }[] = [];
  src.forEach((raw, i) => {
    const text = raw.replace(/\{n\}/g, String(n));
    const cls = i === 0 ? 'ui-h1' : i === 1 ? 'ui-h2' : text.trim() === '\u2014' ? 'ui-sep' : /^[\x20-\x7e]+$/.test(text) && text.trim() ? 'ui-latin' : '';
    lines.push({ text, cls });
    if (raw.includes('{n}') && n >= 6) lines.push({ text: full, cls: '' });
  });
  const el = h('div', 'ui-card ui-card-credits');
  const col = h('div', 'ui-credits', { testid: 'credits' });
  const roll = h('div', 'ui-credits-roll');
  for (const l of lines) roll.append(h('p', l.cls, { text: l.text || '\u00A0', attrs: l.cls === 'ui-h1' ? { 'data-text': l.text } : undefined }));
  for (let i = 0; i < 6; i++) roll.append(h('p', '', { text: '\u00A0' }));
  const last = h('p', 'ui-h1', { text: t('ui.title'), testid: 'credits-end', attrs: { 'data-text': t('ui.title') } });
  roll.append(last);
  col.append(roll);
  el.append(col);
  const SPEED = 40, HOLD = 3;
  let y = NaN, stopAt = NaN, done = false, heldSince = -1, u = 1;
  return {
    el,
    get done() { return done; },
    revealed: true,
    update(t, dt, fast) {
      if (Number.isNaN(y)) {
        const H = col.clientHeight || innerHeight;
        y = H;
        stopAt = H / 2 - (last.offsetTop + last.offsetHeight / 2);
        // 40 px/s at 1280×720, scaled like every other UI metric (--u lives on .ui-root; read once, not per frame)
        u = Number(getComputedStyle(col).getPropertyValue('--u')) || Math.min(innerWidth / 1280, innerHeight / 720) || 1;
      }
      if (y > stopAt) y = Math.max(stopAt, y - dt * SPEED * u * (fast ? 4 : 1));
      else if (heldSince < 0) heldSince = t;
      roll.style.transform = `translateY(${y.toFixed(1)}px)`;
      if (heldSince >= 0 && t - heldSince >= HOLD) done = true;
    },
    key() { /* credits only skip via skip() / Esc */ },
  };
}

/** P3r3 U3: an item text is 「the letter itself」 + an optional narration after the closing bracket (「…——爸 2023.9」称呼
 *  那一格被水渍洇掉了。). Pure: the letter keeps its brackets; the narration is set apart in the UI font. */
export function splitNote(body: string): { letter: string; caption: string } {
  const open = body.indexOf('\u300C'), close = body.lastIndexOf('\u300D');
  if (open === 0 && close > 0 && close < body.length - 1) return { letter: body.slice(0, close + 1), caption: body.slice(close + 1).trim() };
  return { letter: body, caption: '' };
}
/** The smudged character of the letter (drawn as an ink blot: the brush font made 阿\u25A2 read as a real name). */
export const NOTE_SMUDGE = '\u25A2';

export function noteCard(title: string, body: string): CardView {
  const el = h('div', 'ui-note-wrap', { testid: 'note-card' });
  const n = h('div', 'ui-note ui-stamp');
  const { letter, caption } = splitNote(body);
  // P3r2 look L1: the signature (「——爸」, 「——爸 2023.9」) never breaks: 爸 used to sit alone on the last line
  const sig = letter.lastIndexOf('\u2014\u2014');
  const text = h('div', 'ui-note-letter');
  const put = (host: HTMLElement, s: string) => {
    s.split(NOTE_SMUDGE).forEach((part, i) => {
      if (i > 0) host.append(h('span', 'ui-blot', { text: NOTE_SMUDGE, attrs: { 'aria-hidden': 'true' } }));
      if (part) host.append(document.createTextNode(part));
    });
  };
  if (sig > 0) { put(text, letter.slice(0, sig)); text.append(h('span', 'ui-nowrap', { text: letter.slice(sig) })); }
  else put(text, letter);
  n.append(h('h3', '', { text: title }), text);
  if (caption) n.append(h('div', 'ui-note-cap', { text: caption }));
  n.append(h('div', 'ui-cont', { text: t(continueKey()) }));
  el.append(n);
  let done = false;
  return { el, get done() { return done; }, revealed: true, update() { /* static */ }, key() { done = true; } };
}

export function makeCard(core: Core, kind: CardKind, id: string, sfxStamp: () => void): CardView {
  switch (kind) {
    case 'chapter': return chapterCard(id, sfxStamp);
    case 'liaozhai': return liaozhaiCard(id);
    case 'photo': return photoCard(core, id);
    case 'epilogue': return epilogueCard(id);
    case 'credits': return creditsCard(core);
  }
}
