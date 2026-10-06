// src/lens/overlay.ts — owner D. Viewfinder DOM (ART §8.2 "Viewfinder overlay", GDD §16.3 / §16.6):
// corner brackets, centre focus square `vf-frame[data-state]`, ● REC, recognition bar `vf-recog` (+ hint slab),
// zoom ladder, night / flash / battery icons, `vf-overlay-score`, exposure ring, counter, shutter flash, polaroid,
// rephoto overlay, tripod countdown, darkroom strip. Every animation is driven by sim time (clock), never by CSS
// timers, so ?test screenshots are deterministic. The DOM is written only when a value changes.
import type { Zoom } from '../types';
import { t } from '../data/zh';
import { FONT } from '../core/fonts';

const CSS = `
.vf-root{position:absolute;inset:0;pointer-events:none;display:none;--u:min(calc(100vw / 1280),calc(100vh / 720));
  font-family:${FONT.hud};color:#f8f8f6;user-select:none}
.vf-root.vf-on{display:block}
.vf-root.vf-talk .vf-bar{display:none}
.vf-root.vf-compact .vf-rec,.vf-root.vf-compact .vf-clock,.vf-root.vf-compact .vf-tr{display:none}
.vf-root *{box-sizing:border-box}
.vf-corner{position:absolute;width:calc(58 * var(--u));height:calc(58 * var(--u));overflow:visible}
.vf-corner path{fill:none;stroke-linecap:square}
.vf-corner .ink{stroke:#2f3a3f;stroke-width:6}.vf-corner .paper{stroke:#f8f8f6;stroke-width:3}
.vf-c-tl{left:calc(40 * var(--u));top:calc(40 * var(--u))}
.vf-c-tr{right:calc(40 * var(--u));top:calc(40 * var(--u));transform:scaleX(-1)}
.vf-c-bl{left:calc(40 * var(--u));bottom:calc(40 * var(--u));transform:scaleY(-1)}
.vf-c-br{right:calc(40 * var(--u));bottom:calc(40 * var(--u));transform:scale(-1,-1)}
.vf-frame{position:absolute;left:50%;top:50%;width:calc(60 * var(--u));height:calc(60 * var(--u));
  transform:translate(-50%,-50%);--c:#f8f8f6}
.vf-frame[data-state=yellow]{--c:#f0d055;width:calc(46 * var(--u));height:calc(46 * var(--u))}
.vf-frame[data-state=green]{--c:#62ac91;width:calc(46 * var(--u));height:calc(46 * var(--u))}
.vf-frame svg{width:100%;height:100%;overflow:visible}
.vf-frame path{fill:none;stroke-linecap:square}
.vf-frame .ink{stroke:#2f3a3f;stroke-width:6}.vf-frame .col{stroke:var(--c);stroke-width:3}
.vf-dot{position:absolute;left:50%;top:50%;width:calc(6 * var(--u));height:calc(6 * var(--u));transform:translate(-50%,-50%);
  background:#f8f8f6;border:1px solid #2f3a3f}
.vf-rec{position:absolute;left:calc(112 * var(--u));top:calc(52 * var(--u));font-size:calc(18 * var(--u));letter-spacing:1px;
  text-shadow:2px 2px 0 #2f3a3f}
.vf-rec b{color:#c8433a;font-weight:700}
.vf-rec b.off{visibility:hidden}
.vf-clock{position:absolute;left:calc(112 * var(--u));top:calc(80 * var(--u));font-size:calc(14 * var(--u));text-shadow:2px 2px 0 #2f3a3f}
.vf-tr{position:absolute;right:calc(112 * var(--u));top:calc(50 * var(--u));display:flex;gap:calc(10 * var(--u));align-items:center}
.vf-chip{background:#1f282d;border:2px solid #f8f8f6;box-shadow:3px 4px 0 #2f3a3f;padding:calc(3 * var(--u)) calc(8 * var(--u));
  font-size:calc(14 * var(--u));display:flex;align-items:center;gap:calc(6 * var(--u));white-space:nowrap}
.vf-chip.hide{display:none}
.vf-chip.cjk{font-family:${FONT.body};font-size:calc(17 * var(--u))}
.vf-chip.night{background:#34507a}.vf-chip.flash{background:#f0d055;color:#1f282d;border-color:#2f3a3f}
.vf-chip.torch{background:#d8944c;color:#1f282d;border-color:#2f3a3f}
.vf-bat{width:calc(26 * var(--u));height:calc(12 * var(--u));border:2px solid #f8f8f6;position:relative}
.vf-bat:after{content:"";position:absolute;right:calc(-5 * var(--u));top:25%;width:calc(3 * var(--u));height:50%;background:#f8f8f6}
.vf-bat i{position:absolute;left:1px;top:1px;bottom:1px;width:3px;background:#c8433a}
.vf-score{position:absolute;right:calc(112 * var(--u));top:calc(92 * var(--u));background:#f8f8f6;color:#1f282d;border:3px solid #2f3a3f;
  box-shadow:4px 5px 0 #405157;padding:calc(4 * var(--u)) calc(12 * var(--u));font:calc(20 * var(--u)) ${FONT.body};transform:rotate(0.8deg)}
.vf-score.ok{background:#62ac91;color:#f8f8f6}
.vf-score.hide{display:none}
.vf-zoom{position:absolute;left:calc(52 * var(--u));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:calc(8 * var(--u))}
.vf-zoom div{font-size:calc(15 * var(--u));padding:calc(3 * var(--u)) calc(7 * var(--u));border:2px solid transparent;text-align:center;
  text-shadow:2px 2px 0 #2f3a3f;opacity:.75}
.vf-zoom div.on{background:#f0d055;color:#1f282d;border-color:#2f3a3f;box-shadow:3px 4px 0 #2f3a3f;text-shadow:none;opacity:1}
.vf-bottom{position:absolute;left:calc(112 * var(--u));right:calc(112 * var(--u));bottom:calc(52 * var(--u));display:flex;
  justify-content:space-between;font-size:calc(14 * var(--u));text-shadow:2px 2px 0 #2f3a3f;white-space:pre}
.vf-bar{position:absolute;left:50%;bottom:calc(92 * var(--u));transform:translateX(-50%) rotate(-0.6deg);display:flex;flex-direction:column;
  align-items:center;gap:calc(8 * var(--u))}
.vf-hint{background:#f0d055;color:#1f282d;border:3px solid #2f3a3f;box-shadow:3px 4px 0 #405157;
  font:calc(19 * var(--u)) ${FONT.body};padding:calc(4 * var(--u)) calc(14 * var(--u));transform:rotate(1deg);white-space:nowrap}
.vf-hint.hide{display:none}
.vf-talktag{position:absolute;left:calc(50% + 44 * var(--u));top:calc(50% - 14 * var(--u));background:#f8f8f6;color:#1f282d;
  border:3px solid #2f3a3f;box-shadow:3px 4px 0 #405157;font:calc(18 * var(--u)) ${FONT.body};padding:calc(2 * var(--u)) calc(10 * var(--u));
  white-space:nowrap;transform:rotate(-1deg)}
.vf-talktag.hide{display:none}
.vf-recog{display:flex;align-items:stretch;background:#f8f8f6;color:#1f282d;border:3px solid #2f3a3f;box-shadow:4px 5px 0 #405157;
  font:calc(22 * var(--u)) ${FONT.body};white-space:nowrap;min-width:calc(260 * var(--u))}
.vf-recog i{display:block;width:calc(14 * var(--u));background:#d9d3bf;border-right:3px solid #2f3a3f}
.vf-recog[data-state=yellow] i{background:#f0d055}.vf-recog[data-state=green] i{background:#62ac91}
.vf-recog span{padding:calc(6 * var(--u)) calc(18 * var(--u)) calc(6 * var(--u)) calc(14 * var(--u))}
.vf-peek{position:absolute;left:50%;top:calc(46 * var(--u));transform:translateX(-50%) rotate(-0.8deg);background:#1f282d;
  border:3px solid #f8f8f6;box-shadow:4px 5px 0 #2f3a3f;font:calc(18 * var(--u)) ${FONT.body};padding:calc(4 * var(--u)) calc(14 * var(--u))}
.vf-peek.hide{display:none}
.vf-peek em{font-style:normal;color:#f0d055;margin-left:calc(12 * var(--u))}
.vf-expo{position:absolute;left:50%;top:50%;width:calc(120 * var(--u));height:calc(120 * var(--u));transform:translate(-50%,-50%)}
.vf-expo.hide,.vf-expo-t.hide{display:none}
.vf-expo circle{fill:none}
.vf-expo .bg{stroke:#2f3a3f;stroke-width:9;opacity:.55}.vf-expo .fg{stroke:#9fb8d8;stroke-width:5;stroke-linecap:round}
.vf-expo-t{position:absolute;left:50%;top:calc(50% + 72 * var(--u));transform:translateX(-50%);background:#1f282d;border:2px solid #9fb8d8;
  font:calc(19 * var(--u)) ${FONT.body};padding:calc(3 * var(--u)) calc(12 * var(--u));white-space:nowrap}
.vf-flash{position:absolute;inset:0;background:#f8f8f6;opacity:0}
.vf-ref{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;display:none}
.vf-ref2{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;display:none}
.vf-matte{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100vw,calc(100vh * 16 / 9));aspect-ratio:16/9;
  box-shadow:0 0 0 100vmax rgba(24,31,35,.62)}
/* P3r3: the tripod view is wider than its photo (pose.ts TRIPOD_WIDE = 1.3): the matte marks the photo frame lightly,
   so the stair foot the body walks round stays readable outside it */
.vf-root.vf-tp .vf-matte{width:calc(min(100vw,calc(100vh * 16 / 9)) / 1.3);box-shadow:0 0 0 100vmax rgba(24,31,35,.34);
  outline:calc(2 * var(--u)) solid rgba(248,248,246,.9);outline-offset:0}
.vf-pola{position:absolute;left:50%;top:50%;width:calc(300 * var(--u));background:#f8f8f6;border:3px solid #2f3a3f;box-shadow:4px 5px 0 #405157;
  padding:calc(8 * var(--u)) calc(8 * var(--u)) calc(30 * var(--u));display:none;transform-origin:50% 50%}
.vf-pola img{display:block;width:100%;border:2px solid #2f3a3f}
/* P3r2 G2: the tripod view is a fixed group shot — no focus square / recognition / zoom ladder over the lineup; the
   countdown sits off the lineup (idle hint under the peek chip, the running count at the right edge) and a chalk route
   to the X is drawn over the view (the X itself is on a tread above the 1.5 m lens, invisible from the tripod) */
.vf-root.vf-tp .vf-bar,.vf-root.vf-tp .vf-frame,.vf-root.vf-tp .vf-dot,.vf-root.vf-tp .vf-zoom{display:none}
.vf-guide{position:absolute;inset:0;width:100%;height:100%;overflow:visible;display:none}
.vf-guide path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.vf-guide .ink{stroke:#2f3a3f;stroke-width:7;stroke-dasharray:2 16;opacity:.85}
.vf-guide .chalk{stroke:#eef1e6;stroke-width:4;stroke-dasharray:2 16}
.vf-guide .x-ink{stroke:#2f3a3f;stroke-width:11}
.vf-guide .x-chalk{stroke:#eef1e6;stroke-width:6}
.vf-guide .ring{fill:none;stroke:#f0d055;stroke-width:4}
.vf-guide .ring-ink{fill:none;stroke:#2f3a3f;stroke-width:8}
.vf-guide.ok .x-chalk,.vf-guide.ok .ring{stroke:#62ac91}
.vf-guide .arrow{fill:#f0d055;stroke:#2f3a3f;stroke-width:3;stroke-linejoin:round}
.vf-guide.ok .arrow{fill:#62ac91}
.vf-guide .me circle{fill:#f8f8f6;stroke:#2f3a3f;stroke-width:3}
.vf-guide .me .tip{fill:#f0d055;stroke:#2f3a3f;stroke-width:3;stroke-linejoin:round}
.vf-guide .me .bd{fill:#2f3a3f}
.vf-tripod{position:absolute;text-align:center;display:none}
.vf-tripod.idle{left:50%;top:calc(98 * var(--u));transform:translateX(-50%)}
.vf-tripod.run{right:calc(128 * var(--u));top:calc(128 * var(--u))}
.vf-tripod.run .n{font-size:calc(120 * var(--u))}
.vf-tripod .n{position:relative;font:700 calc(150 * var(--u)) ${FONT.hud};color:#f8f8f6;line-height:1;
  -webkit-text-stroke-width:calc(8 * var(--u));-webkit-text-stroke-color:#2f3a3f;paint-order:stroke fill}
.vf-tripod .n::before{content:attr(data-text);position:absolute;left:0;right:0;top:calc(8 * var(--u));z-index:-1;color:#2f3a3f;
  -webkit-text-stroke-width:calc(8 * var(--u));-webkit-text-stroke-color:#2f3a3f}
.vf-tripod.idle .w{margin-top:0}
.vf-tripod .w{display:inline-block;margin-top:calc(12 * var(--u));white-space:nowrap;background:#f0d055;color:#1f282d;border:3px solid #2f3a3f;
  box-shadow:4px 5px 0 #405157;font:calc(24 * var(--u)) ${FONT.body};padding:calc(4 * var(--u)) calc(16 * var(--u));transform:rotate(-1deg)}
.vf-strip{position:absolute;left:50%;top:44%;width:78%;transform:translate(-50%,-50%) rotate(-0.6deg);background:#1f282d;
  border:3px solid #2f3a3f;box-shadow:4px 5px 0 #405157;padding:calc(14 * var(--u)) calc(10 * var(--u));display:none}
.vf-strip img{display:block;width:100%}
.vf-strip b{position:absolute;left:0;right:0;bottom:calc(-34 * var(--u));text-align:center;font:calc(20 * var(--u)) ${FONT.body};
  color:#f8f8f6;text-shadow:2px 2px 0 #2f3a3f;font-weight:400}
`;

const L_PATH = 'M3 50 L3 3 L50 3';
const SQ = 'M0 14 L0 0 L14 0 M46 0 L60 0 L60 14 M60 46 L60 60 L46 60 M14 60 L0 60 L0 46';

export interface OverlayModel {
  on: boolean;
  state: 'white' | 'yellow' | 'green';
  recog: string;
  hint: string | null;
  /** P3r2 look L4: 「按 E 交谈」 beside the crosshair while a talkable actor is framed in the night view. */
  talkTag?: string | null;
  zoom: Zoom; night: boolean; flash: boolean; torch: boolean;
  score: number | null;             // rephoto overlay score (null = hidden)
  counter: number;                  // non-keep photos
  clock: string;
  recBlink: boolean;
  exposure: { left: number; k: number } | null;
  peek: string | null;              // peek label (null = hidden)
  peekExit: string;
  /** The lh_door view keeps the gameplay HUD (its prompt is live): drop our REC / clock / battery corner chips. */
  compact: boolean;
  /** A dialogue box / card is up: the recognition bar would sit under it. */
  talk: boolean;
  /** The tripod peek (G2): a fixed group shot, no focus square / recognition bar / zoom ladder. */
  tripodView: boolean;
}
/** Screen-space chalk route to the tripod X (overlay px), or null to hide it. */
export interface TripodGuide {
  pts: readonly (readonly [number, number])[]; x: readonly [number, number] | null; ok: boolean; bob: number; scale: number;
  /** The headless body when it is out of frame: the edge point and the direction (deg, screen, 0 = right) toward it. */
  body: { x: number; y: number; deg: number } | null;
}

export function createOverlay(root: HTMLElement) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'vf-root';
  el.dataset.testid = 'vf-root';
  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement = el): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.className = cls;
    parent.appendChild(e);
    return e;
  };
  // P3 G10: photos are 16:9 whatever the window; the matte shades what the photo will not contain (the lens widens
  // the displayed FOV on narrow windows so the whole frame fits, lens/pose.ts displayFov)
  mk('div', 'vf-matte');
  const ref = mk('img', 'vf-ref'); ref.alt = '';
  const ref2 = mk('img', 'vf-ref2'); ref2.alt = '';
  for (const c of ['tl', 'tr', 'bl', 'br']) {
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('class', `vf-corner vf-c-${c}`);
    s.setAttribute('viewBox', '0 0 58 58');
    s.innerHTML = `<path class="ink" d="${L_PATH}"/><path class="paper" d="${L_PATH}"/>`;
    el.appendChild(s);
  }
  const frame = mk('div', 'vf-frame');
  frame.dataset.testid = 'vf-frame';
  frame.dataset.state = 'white';
  frame.innerHTML = `<svg viewBox="0 0 60 60" preserveAspectRatio="none"><path class="ink" d="${SQ}"/><path class="col" d="${SQ}"/></svg>`;
  mk('div', 'vf-dot');
  const rec = mk('div', 'vf-rec');
  const recDot = document.createElement('b');
  recDot.textContent = '●';
  rec.append(recDot, document.createTextNode(` ${t('vf.rec').replace(/^●\s*/, '')}`));
  const clockEl = mk('div', 'vf-clock');
  const tr = mk('div', 'vf-tr');
  const nightChip = mk('div', 'vf-chip cjk night hide', tr); nightChip.textContent = t('vf.night');
  const flashChip = mk('div', 'vf-chip cjk flash hide', tr);
  flashChip.innerHTML = `<svg width="12" height="16" viewBox="0 0 12 16"><path d="M7 0 L0 9 L5 9 L4 16 L12 6 L7 6 Z" fill="#1f282d"/></svg>`;
  flashChip.append(document.createTextNode(t('vf.flash')));
  const torchChip = mk('div', 'vf-chip cjk torch hide', tr); torchChip.textContent = t('vf.torch');
  const batChip = mk('div', 'vf-chip', tr);
  batChip.innerHTML = '<span class="vf-bat"><i></i></span>';
  batChip.append(document.createTextNode(t('vf.battery')));
  const score = mk('div', 'vf-score hide'); score.dataset.testid = 'vf-overlay-score';
  const zoomEl = mk('div', 'vf-zoom');
  const zoomDivs = new Map<Zoom, HTMLDivElement>();
  for (const z of [10, 3, 1] as const) { const d = mk('div', '', zoomEl); d.textContent = t('vf.zoom', { z }); zoomDivs.set(z, d); }
  const peekEl = mk('div', 'vf-peek hide');
  const peekText = document.createElement('span'), peekExit = document.createElement('em');
  peekEl.append(peekText, peekExit);
  const bar = mk('div', 'vf-bar');
  const hint = mk('div', 'vf-hint hide', bar);
  const talkTagEl = mk('div', 'vf-talktag hide'); talkTagEl.dataset.testid = 'vf-talktag';
  const recog = mk('div', 'vf-recog', bar);
  recog.dataset.testid = 'vf-recog';
  recog.dataset.state = 'white';
  recog.appendChild(document.createElement('i'));
  const recogText = document.createElement('span');
  recog.appendChild(recogText);
  const bottom = mk('div', 'vf-bottom');
  const iso = document.createElement('span'); iso.textContent = t('vf.bottomBar');
  const counter = document.createElement('span');
  bottom.append(iso, counter);
  const expo = document.createElementNS(svgNS, 'svg');
  expo.setAttribute('class', 'vf-expo hide');
  expo.setAttribute('viewBox', '0 0 120 120');
  expo.innerHTML = '<circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" cx="60" cy="60" r="50" transform="rotate(-90 60 60)" stroke-dasharray="314.16" stroke-dashoffset="0"/>';
  el.appendChild(expo);
  const expoFg = expo.querySelector('.fg') as SVGCircleElement;
  const expoT = mk('div', 'vf-expo-t hide');
  const strip = mk('div', 'vf-strip');
  const stripImg = mk('img', '', strip); stripImg.alt = '';
  const stripText = mk('b', '', strip);
  const guide = document.createElementNS(svgNS, 'svg');
  guide.setAttribute('class', 'vf-guide');
  guide.dataset.testid = 'tripod-guide';
  guide.innerHTML = '<path class="ink"/><path class="chalk"/><g class="xm"><circle class="ring-ink" r="26"/><circle class="ring" r="26"/>'
    + '<path class="x-ink" d="M-12 -9 L12 9 M12 -10 L-11 9"/><path class="x-chalk" d="M-12 -9 L12 9 M12 -10 L-11 9"/>'
    + '<path class="arrow" d="M-13 -62 L13 -62 L13 -48 L24 -48 L0 -32 L-24 -48 L-13 -48 Z"/></g>'
    // off-frame body marker: a headless figure in a disc, with a tip pointing toward where the body is
    + '<g class="me"><g class="rot"><path class="tip" d="M22 -9 L36 0 L22 9 Z"/></g><circle r="21"/>'
    + '<path class="bd" d="M-8 -9 L8 -9 L7 5 L3 5 L3 14 L0.8 14 L0.8 6 L-0.8 6 L-0.8 14 L-3 14 L-3 5 L-7 5 Z M-3 -12 L3 -12 L3 -9 L-3 -9 Z"/></g>';
  el.appendChild(guide);
  const guideInk = guide.querySelector('.ink') as SVGPathElement, guideChalk = guide.querySelector('.chalk') as SVGPathElement;
  const guideX = guide.querySelector('.xm') as SVGGElement, guideArrow = guide.querySelector('.arrow') as SVGPathElement;
  const guideMe = guide.querySelector('.me') as SVGGElement, guideMeRot = guide.querySelector('.me .rot') as SVGGElement;
  const tripod = mk('div', 'vf-tripod');
  tripod.dataset.testid = 'tripod-count';
  const tripodN = mk('div', 'n', tripod), tripodW = mk('div', 'w', tripod);
  const pola = mk('div', 'vf-pola');
  const polaImg = mk('img', '', pola); polaImg.alt = '';
  const flash = mk('div', 'vf-flash');
  root.appendChild(el);

  const last: Record<string, unknown> = {};
  const changed = (k: string, v: unknown) => { if (last[k] === v) return false; last[k] = v; return true; };
  const toggle = (e: Element, cls: string, on: boolean, key: string) => { if (changed(key, on)) e.classList.toggle(cls, on); };

  return {
    el,
    update(m: OverlayModel) {
      toggle(el, 'vf-on', m.on, 'on');
      if (!m.on) return;
      toggle(el, 'vf-compact', m.compact, 'compact');
      toggle(el, 'vf-talk', m.talk, 'talk');
      toggle(el, 'vf-tp', m.tripodView, 'tp');
      if (changed('state', m.state)) { frame.dataset.state = m.state; recog.dataset.state = m.state; }
      if (changed('recog', m.recog)) recogText.textContent = m.recog;
      toggle(hint, 'hide', !m.hint, 'hintHide');
      if (m.hint && changed('hint', m.hint)) hint.textContent = m.hint;
      toggle(talkTagEl, 'hide', !m.talkTag, 'talkTagHide');
      if (m.talkTag && changed('talkTag', m.talkTag)) talkTagEl.textContent = m.talkTag;
      if (changed('zoom', m.zoom)) for (const [z, d] of zoomDivs) d.classList.toggle('on', z === m.zoom);
      toggle(nightChip, 'hide', !m.night, 'night');
      toggle(flashChip, 'hide', !m.flash, 'flash');
      toggle(torchChip, 'hide', !m.torch, 'torch');
      toggle(score, 'hide', m.score === null, 'scoreHide');
      if (m.score !== null && changed('score', m.score)) {
        score.textContent = t('vf.overlay', { n: m.score });
        score.classList.toggle('ok', m.score >= 90);
      }
      if (changed('counter', m.counter)) counter.textContent = t('vf.counter', { n: m.counter });
      if (changed('clock', m.clock)) clockEl.textContent = m.clock;
      toggle(recDot, 'off', !m.recBlink, 'blink');
      toggle(expo, 'hide', !m.exposure, 'expoHide');
      toggle(expoT, 'hide', !m.exposure, 'expoTHide');
      if (m.exposure) {
        const off = (314.16 * m.exposure.k).toFixed(1);
        if (changed('expoK', off)) expoFg.setAttribute('stroke-dashoffset', off);
        if (changed('expoN', m.exposure.left)) expoT.textContent = t('vf.exposing', { n: m.exposure.left });
      }
      toggle(peekEl, 'hide', !m.peek, 'peekHide');
      if (m.peek && changed('peek', m.peek)) peekText.textContent = m.peek;
      if (changed('peekExit', m.peekExit)) peekExit.textContent = m.peekExit;
    },
    /** Shutter flash: 80 ms full, then a 250 ms fade (ART §8.2); `strength` < 1 for non-flash shots. */
    flash(age: number, strength: number) {
      const o = age < 0 ? 0 : age < 0.08 ? strength : Math.max(0, strength * (1 - (age - 0.08) / 0.25));
      const s = o.toFixed(3);
      if (changed('flashO', s)) flash.style.opacity = s;
    },
    /** Polaroid: pops at the centre then slides to the top-right (phone) over 0.5 s. */
    polaroid(src: string | null, age: number) {
      const vis = !!src && age >= 0 && age < 0.9;
      if (changed('polaVis', vis)) pola.style.display = vis ? 'block' : 'none';
      if (!vis || !src) return;
      if (changed('polaSrc', src)) polaImg.src = src;
      const k = Math.min(1, Math.max(0, (age - 0.35) / 0.5));
      const e = k * k * (3 - 2 * k);
      const x = -50 + e * 170, y = -50 - e * 160, sc = 0.9 - e * 0.65, rot = -4 + e * 10;
      const tf = `translate(${x}%,${y}%) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
      if (changed('polaTf', tf)) pola.style.transform = tf;
    },
    /** Rephoto reference overlay (50%); `color` crossfades to the colour version (GDD §3.8 success). */
    reference(src: string | null, opacity: number, color: { src: string; k: number } | null) {
      const vis = !!src && opacity > 0;
      if (changed('refVis', vis)) ref.style.display = vis ? 'block' : 'none';
      if (vis && src && changed('refSrc', src)) ref.src = src;
      const o = (vis ? opacity * (1 - (color?.k ?? 0)) : 0).toFixed(3);
      if (changed('refO', o)) ref.style.opacity = o;
      const cvis = !!color && opacity > 0;
      if (changed('ref2Vis', cvis)) ref2.style.display = cvis ? 'block' : 'none';
      if (cvis && color) {
        if (changed('ref2Src', color.src)) ref2.src = color.src;
        const o2 = (opacity * color.k).toFixed(3);
        if (changed('ref2O', o2)) ref2.style.opacity = o2;
      }
    },
    tripod(n: number | null, text: string) {
      const vis = n !== null || text !== '';
      if (changed('tpVis', vis)) tripod.style.display = vis ? 'block' : 'none';
      if (!vis) return;
      const cls = n === null ? 'vf-tripod idle' : 'vf-tripod run';
      if (changed('tpCls', cls)) tripod.className = cls;
      const ns = n === null ? '' : String(n);
      if (changed('tpN', ns)) { tripodN.textContent = ns; tripodN.dataset.text = ns; tripodN.style.display = ns ? 'block' : 'none'; }
      if (changed('tpW', text)) { tripodW.textContent = text; tripodW.style.display = text ? 'inline-block' : 'none'; }
    },
    /** G2: the chalk route (dashed) and the X marker (ring + arrow; green once the body stands on it). */
    tripodGuide(g: TripodGuide | null) {
      const vis = !!g && (g.pts.length > 1 || !!g.x);
      if (changed('tgVis', vis)) guide.style.display = vis ? 'block' : 'none';
      if (!vis || !g) return;
      const d = g.pts.length > 1 ? g.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') : '';
      if (changed('tgD', d)) { guideInk.setAttribute('d', d); guideChalk.setAttribute('d', d); }
      const xt = g.x ? `translate(${g.x[0].toFixed(1)} ${g.x[1].toFixed(1)}) scale(${g.scale.toFixed(3)})` : '';
      if (changed('tgX', xt)) { guideX.setAttribute('transform', xt); guideX.style.display = g.x ? '' : 'none'; }
      const at = `translate(0 ${g.bob.toFixed(1)})`;
      if (changed('tgBob', at)) guideArrow.setAttribute('transform', at);
      toggle(guide, 'ok', g.ok, 'tgOk');
      const me = g.body ? `translate(${g.body.x.toFixed(1)} ${g.body.y.toFixed(1)}) scale(${g.scale.toFixed(3)})` : '';
      if (changed('tgMe', me)) { guideMe.style.display = g.body ? '' : 'none'; if (g.body) guideMe.setAttribute('transform', me); }
      const rot = g.body ? `rotate(${g.body.deg.toFixed(0)})` : '';
      if (rot && changed('tgMeRot', rot)) guideMeRot.setAttribute('transform', rot);
    },
    strip(src: string | null, opacity: number, text: string) {
      const vis = !!src && opacity > 0;
      if (changed('stripVis', vis)) strip.style.display = vis ? 'block' : 'none';
      if (!vis || !src) return;
      if (changed('stripSrc', src)) stripImg.src = src;
      const o = opacity.toFixed(3);
      if (changed('stripO', o)) stripImg.style.opacity = o;
      if (changed('stripT', text)) stripText.textContent = text;
    },
  };
}
export type Overlay = ReturnType<typeof createOverlay>;
