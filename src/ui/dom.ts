// src/ui/dom.ts — owner E. Small DOM helpers shared by every UI component (ART §8.1). Browser only.
import type { ItemDef } from '../types';

export interface HOpts { testid?: string; text?: string; attrs?: Readonly<Record<string, string>>; title?: string }

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', o: HOpts = {}, kids: readonly (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (o.testid) e.dataset.testid = o.testid;
  if (o.text !== undefined) e.textContent = o.text;
  if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) e.setAttribute(k, v);
  if (o.title) e.title = o.title;
  for (const k of kids) e.append(k);
  if (tag === 'button') (e as HTMLButtonElement).type = 'button';
  return e;
}

export function showEl(el: HTMLElement, on: boolean): void { el.classList.toggle('ui-hidden', !on); }
export function isShown(el: HTMLElement): boolean { return !el.classList.contains('ui-hidden'); }

/** Restart the 140 ms stamp-in (ART §8.1). */
export function stamp(el: HTMLElement): void {
  el.classList.remove('ui-stamp', 'ui-out');
  void el.offsetWidth;
  el.classList.add('ui-stamp');
}

/** Fixed per-element tilt in −1.5..+1° from a string (ART §8.1: fixed per element, never random). */
export function tiltOf(seed: string, lo = -1.5, hi = 1): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 16777619); }
  return lo + ((x >>> 0) % 1000) / 1000 * (hi - lo);
}

/** Render text with ASCII key tokens (Tab, E, 1…, Esc) as key caps. */
export function withKeycaps(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  // mouse / space words (left / right button, space, wheel) are caps too
  const re = /(^|[^A-Za-z])(Tab|Esc|Shift|\u5DE6\u952E|\u53F3\u952E|\u7A7A\u683C|\u6EDA\u8F6E|[A-Z]|[0-9](?![0-9%]))(?![A-Za-z0-9%])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    // a lone digit is a key only inside a key run like 「1 2 3」 (not 「静止 2 秒」)
    if (/^[0-9]$/.test(m[2]) && !/[0-9] $/.test(text.slice(Math.max(0, start - 2), start)) && !/^ [0-9]/.test(text.slice(start + 1, start + 3))) continue;
    if (start > last) f.append(text.slice(last, start));
    f.append(h('span', 'ui-key', { text: m[2] }));
    last = start + m[2].length;
  }
  if (last < text.length) f.append(text.slice(last));
  return f;
}

/** Keep --u = min(vw/1280, vh/720) (ART §8.1 sizing). */
export function trackScale(root: HTMLElement): void {
  const apply = () => root.style.setProperty('--u', String(Math.max(0.4, Math.min(innerWidth / 1280, innerHeight / 720))));
  apply();
  addEventListener('resize', apply);
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(view: string, body: string): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', view);
  s.innerHTML = body;
  return s;
}
const INK = '#2f3a3f';
/** Hand-drawn item and toast icons (ART §11: no font emoji). */
export function icon(kind: ItemDef['icon'] | 'clue' | 'photo' | 'bst' | 'wx' | 'next'): SVGSVGElement {
  const st = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
  switch (kind) {
    case 'key': return svg('0 0 32 32', `<circle cx="10" cy="16" r="6" fill="#f0d055" ${st}/><path d="M16 16h13v5M24 16v4" fill="none" ${st}/><circle cx="10" cy="16" r="2" fill="${INK}"/>`);
    case 'note': return svg('0 0 32 32', `<path d="M7 4h14l5 5v19H7z" fill="#f3efe2" ${st}/><path d="M11 13h11M11 18h11M11 23h7" fill="none" ${st}/>`);
    case 'negative': return svg('0 0 32 32', `<rect x="5" y="7" width="22" height="18" fill="#3a2f28" ${st}/><rect x="9" y="11" width="14" height="10" fill="#d8944c" stroke="${INK}" stroke-width="1.5"/><path d="M5 9h22M5 23h22" stroke="#f3efe2" stroke-width="1.5" stroke-dasharray="2 2"/>`);
    case 'dot': return svg('0 0 32 32', `<path d="M16 5c5 8 8 12 8 16a8 8 0 0 1-16 0c0-4 3-8 8-16z" fill="#c8433a" ${st}/>`);
    case 'envelope': return svg('0 0 32 32', `<rect x="4" y="8" width="24" height="17" fill="#efe9d8" ${st}/><path d="M4 8l12 10 12-10" fill="none" ${st}/>`);
    case 'clue': return svg('0 0 32 32', `<rect x="7" y="4" width="18" height="24" fill="#f3efe2" ${st}/><path d="M11 11h10M11 16h10M11 21h6" fill="none" ${st}/><path d="M21 21l5 5" ${st}/>`);
    case 'photo': return svg('0 0 32 32', `<rect x="5" y="6" width="22" height="20" fill="#f8f8f6" ${st}/><rect x="8" y="9" width="16" height="11" fill="#65c1bc" stroke="${INK}" stroke-width="1.5"/>`);
    case 'bst': return svg('0 0 32 32', `<path d="M16 4c-7 0-10 6-10 12v12l4-3 3 3 3-3 3 3 3-3 4 3V16c0-6-3-12-10-12z" fill="#efe9d8" ${st}/><circle cx="12" cy="15" r="2" fill="#c8433a"/><circle cx="20" cy="15" r="2" fill="${INK}"/>`);
    case 'wx': return svg('0 0 32 32', `<path d="M4 8h24v14H14l-6 5v-5H4z" fill="#a9dc8e" ${st}/><circle cx="12" cy="15" r="1.6" fill="${INK}"/><circle cx="20" cy="15" r="1.6" fill="${INK}"/>`);
    case 'next': return svg('0 0 24 30', `<path d="M3 3l18 12L3 27z" fill="#66bde6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`);
  }
}

/** A photo thumbnail: the dataURL, or an ink-on-paper placeholder while a preset is still developing. */
export function photoImg(dataURL: string, cls: string, alt: string, placeholder: string): HTMLElement {
  if (dataURL && dataURL.startsWith('data:image') && dataURL.length > 64) {
    const img = h('img', cls, { attrs: { alt, draggable: 'false' } });
    img.src = dataURL;
    return img;
  }
  return h('div', 'ui-thumb-ph', { text: placeholder });
}
