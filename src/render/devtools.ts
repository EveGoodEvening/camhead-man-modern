// src/render/devtools.ts — owner A. `?dev=render:<args>` (args joined by '+'), loaded lazily:
//   scene  → add the dev street (devScene.ts) so the look can be judged before B's town exists;
//   check  → ART Appendix A checks 1–7 + the GDD §19.4 night_store numbers for day@sp_bus_bench, night@sp_store_front
//            and the title, printed to <pre data-testid="render-check"> and window.__renderCheck.
import type { Core, RenderApi } from '../contracts';
import { Vector3 } from 'three';
import type { NodeId, PaletteKey, Phase, SfxId, SpotId, UncannyId } from '../types';
import { PAL } from '../art/palette';
import { buildDevScene } from './devScene';
import { hexToRgb } from './grade';

declare global { interface Window { __renderCheck?: unknown } }

interface Px { d: Uint8ClampedArray; w: number; h: number }
async function pixels(dataUrl: string): Promise<Px> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('snapshot decode')); img.src = dataUrl; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d');
  g.drawImage(img, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
const b255 = (hex: string) => hexToRgb(hex).map((v) => Math.round(v * 255));
const near = (d: Uint8ClampedArray, i: number, c: number[], tol: number) =>
  Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;
const luma = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;

/** Palette hexes and their derived HSV shade (ART §3.1), for the ≥ 40 % exact-hex fidelity statistic. */
function paletteSet(): number[][] {
  const out: number[][] = [];
  const add = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    out.push([r, g, b].map((v) => Math.round(v * 255)));
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    let h = 0;
    if (dl > 0) h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    h = ((h / 6) % 1 + 1) % 1;
    const s = mx > 0 ? dl / mx : 0;
    const h2 = (h - 0.025 + 1) % 1, s2 = Math.min(1, s * 1.08), v2 = mx * 0.74;
    const f = (n: number) => { const k = (n + h2 * 6) % 6; return v2 - v2 * s2 * Math.max(0, Math.min(k, 4 - k, 1)); };
    out.push([f(5), f(3), f(1)].map((v) => Math.round(v * 255)));
  };
  for (const v of Object.values(PAL)) if (typeof v === 'string' && v.startsWith('#')) add(v);
  return out;
}

function stats(p: Px, sky: string[], skyTol: number) {
  const { d, w, h } = p;
  const skyC = sky.map(b255), ink = b255('#2f3a3f'), pal = paletteSet();
  let topBad = 0, topN = 0, inkN = 0, dark = 0, black = 0, white = 0, n = 0, nonSky = 0, lumaSum = 0, exact = 0;
  const lum: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      n++;
      const isSky = skyC.some((c) => near(d, i, c, skyTol));
      if (y < h * 0.1) { topN++; if (!isSky) topBad++; }
      if (near(d, i, ink, 10)) inkN++;
      const l = luma(d, i);
      if (l < 0.15) dark++;
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) black++;
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) white++;
      if (!isSky) { nonSky++; lumaSum += l; lum.push(l); if (pal.some((c) => near(d, i, c, 3))) exact++; }
    }
  }
  // road crest: the lowest sky row in the central 20 % of columns (ART §6.5, 60–74 % from the top)
  let crest = -1;
  for (let x = Math.floor(w * 0.4); x < w * 0.6; x += 4) {
    for (let y = h - 1; y >= 0; y--) { const i = (y * w + x) * 4; if (skyC.some((c) => near(d, i, c, skyTol))) { crest = Math.max(crest, y); break; } }
  }
  lum.sort((a, b) => a - b);
  const q = (f: number) => Number((lum[Math.floor(lum.length * f)] ?? 0).toFixed(3));
  return {
    topSkyBadFrac: Number((topBad / Math.max(1, topN)).toFixed(4)),
    inkFrac_2f3a3f: Number((inkN / n).toFixed(4)), darkFrac_luma015: Number((dark / n).toFixed(4)),
    black, white, nonSkyMeanLuma: Number((lumaSum / Math.max(1, nonSky)).toFixed(3)),
    lumaP50: q(0.5), lumaP90: q(0.9), paletteExactFrac: Number((exact / Math.max(1, nonSky)).toFixed(3)),
    crestFromTop: crest < 0 ? null : Number((crest / h).toFixed(3)), skyFrac: Number(((n - nonSky) / n).toFixed(3)),
  };
}

function bbox(p: Px, bg: string[]) {
  const { d, w, h } = p, cols = bg.map(b255);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y += 2) {
    let run = 0;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (cols.some((c) => near(d, i, c, 14))) { run = 0; continue; }
      if (++run < 4) continue;                                // ignore isolated specks
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { cx: Number(((x0 + x1) / 2 / w).toFixed(3)), cy: Number(((y0 + y1) / 2 / h).toFixed(3)), hFrac: Number(((y1 - y0) / h).toFixed(3)) };
}

async function runChecks(core: Core, render: RenderApi): Promise<void> {
  while (!(window.__game?.ready)) await new Promise((r) => setTimeout(r, 100));
  const res: Record<string, unknown> = {};
  const shot = async (phase: Phase, spot: SpotId) => {
    core.store.setPhase(phase, undefined, true);
    await core.player.goto(spot, { fade: false });
    core.loop.step(3, 1 / 60);
    return pixels(render.snapshot());
  };
  const day = await shot('day', 'sp_bus_bench');
  res.day = { ...stats(day, ['#65c1bc', '#9ae4d5'], 3), render: render.stats(), ms: Number(render.timeRender(8).toFixed(1)) };
  const night = await shot('night', 'sp_store_front');
  res.night_store = { ...stats(night, ['#22365a', '#34507a'], 6), render: render.stats(), ms: Number(render.timeRender(8).toFixed(1)) };
  core.cameraRig.setTitleMode(true);
  render.setPalette('title', 0);
  core.loop.step(2, 1 / 60);
  const title = await pixels(render.snapshot());
  res.title = { bbox: bbox(title, ['#65c1bc', '#6dcac0', '#7fd3c8']), render: render.stats(), ms: Number(render.timeRender(8).toFixed(1)) };
  core.cameraRig.setTitleMode(false);
  render.setPalette(core.store.state.palette, 0);
  window.__renderCheck = res;
  const pre = document.createElement('pre');
  pre.dataset.testid = 'render-check';
  pre.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:8px;background:#f8f8f6;color:#1f282d;font:12px monospace;z-index:9;max-height:90vh;overflow:auto';
  pre.textContent = JSON.stringify(res, null, 1);
  document.body.appendChild(pre);
  core.log.info('[render] check', res);
}

/** Dev handles for shot.mjs --do calls (?dev=render:tools). */
function installTools(core: Core, render: RenderApi): void {
  const w = window as unknown as { __render: unknown };
  w.__render = {
    capture(o: { ghost?: boolean; past?: boolean; flash?: number; palette?: PaletteKey; w?: number; h?: number } = {}) {
      const cam = core.cameraRig.camera;
      const c = render.capture({
        camera: cam, ghost: o.ghost, past: o.past, palette: o.palette, width: o.w, height: o.h,
        flash: o.flash ? { pos: cam.position.clone(), radius: o.flash } : null,
      });
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.style.cssText = 'position:fixed;right:12px;bottom:12px;border:3px solid #2f3a3f;z-index:9;background:#fff';
      img.dataset.testid = 'render-capture';
      document.body.appendChild(img);
      return [c.width, c.height];
    },
    smoke(spot: SpotId | null) {
      if (!spot) { render.setSmoke(null); return; }
      const cam = core.cameraRig.camera, from = new Vector3(), dir = new Vector3();
      cam.getWorldDirection(dir);
      from.copy(cam.position).addScaledVector(dir, 2);
      render.setSmoke({ from, to: core.services.world.spotPos(spot) });
    },
    uncanny(id: UncannyId) { core.bus.emit('uncanny', { id }); },
    dialogueEnd() { core.bus.emit('dialogueEnd', { node: 'xiaolin.first' as NodeId }); },
    palette(key: PaletteKey, sec = 0) { render.setPalette(key, sec); },
    vf(on: boolean, night = false, negative = false) { render.setViewfinder({ on, night, negative }); },
    stats() { return render.stats(); },
    /** Unlock audio (as a gesture would) and play an sfx: proves the live WebAudio graph builds without errors. */
    async audio(id: SfxId = 'sfx_shutter') {
      const a = core.services.audio;
      a.setMuted(false);
      await a.unlock();
      a.play(id);
      return 'ok';
    },
  };
}

import { setToonLamps } from './materials';

export interface RenderInternals { profile(n: number, time: (fn: () => void) => number): Record<string, number>; composite(): unknown }
declare global { interface Window { __renderProfile?: () => Record<string, number> } }

export function runDevHook(core: Core, render: RenderApi, arg: string, internals: RenderInternals): void {
  const args = new Set(arg.split(/[+ ,]/).filter(Boolean));
  if (args.has('scene')) buildDevScene(core, render);
  if (args.has('check')) void runChecks(core, render);
  if (args.has('tools')) installTools(core, render);
  if (args.has('prof')) {
    (window as unknown as { __core: Core }).__core = core;   // dev probes (scripts in the scratchpad) reach the live core
    (window as unknown as { __toonLamps: typeof setToonLamps }).__toonLamps = setToonLamps;
    (window as unknown as { __comp: unknown }).__comp = internals.composite();
    window.__renderProfile = () => {
      const gl = core.renderer.getContext(), px = new Uint8Array(4);
      const flush = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      flush();
      return internals.profile(8, (fn) => {
        // dev-only wall clock via performance marks (performance.now is reserved for timeRender, ARCH §2.12)
        const a = performance.mark('render-prof-a');
        fn(); flush();
        return performance.mark('render-prof-b').startTime - a.startTime;
      });
    };
  }
}
