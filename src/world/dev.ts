// src/world/dev.ts — owner B. `?dev=world[:arg]` (ARCHITECTURE §3.B self-test): fly camera + location hotkeys,
// `walkcheck` (BFS reachability with the live physics and gates), `stats` (chunk / triangle report).
import { AdditiveBlending, Color, MeshBasicMaterial, Vector3, WebGLRenderTarget, type Mesh } from 'three';
import type { Core } from '../contracts';
import { LOCATIONS, SPOTS } from '../data/locations';
import { enableFly } from '../core/fly';
import { chartToFlat, isChart } from '../core/planet';
import { bfs, standOf, TELEPORT_ONLY } from './walkcheck';
import { fl } from './geo';
import type { BuiltChunk } from './kit/batch';

interface DevCtx { core: Core; chunks: BuiltChunk[]; tris: number }

declare global { interface Window { __world?: Record<string, unknown> } }

export function worldDevHook(w: DevCtx, arg: string): void {
  const { core } = w;
  if (arg === 'walkcheck') { runWalkcheck(core); return; }
  if (arg === 'stats') { report(w); return; }
  if (arg === 'overdraw') { installOverdraw(w); return; }
  // default: fly camera + hotkeys 1–9/0/- → the 11 locations (teleport the player there)
  report(w);
  enableFly(core);
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      const i = '1234567890-'.indexOf(e.key);
      if (i < 0 || !LOCATIONS[i]) return;
      core.player.lock('fly', false);
      core.player.teleport({ scene: 'planet', at: LOCATIONS[i].center });
      core.player.lock('fly', true);
    });
  }
}

function report(w: DevCtx): void {
  const by: Record<string, number> = {};
  for (const c of w.chunks) by[c.layer] = (by[c.layer] ?? 0) + ((c.mesh.geometry.getAttribute('position').count / 3) | 0);
  const detail = w.chunks.filter((c) => c.mesh.userData.detail).reduce((a, c) => a + ((c.mesh.geometry.getAttribute('position').count / 3) | 0), 0);
  const out = { chunks: w.chunks.length, total: w.tris, detail, nonDetail: w.tris - detail, byLayer: by };
  w.core.log.info('[world] stats', JSON.stringify(out));
  if (typeof window !== 'undefined') window.__world = { ...(window.__world ?? {}), stats: out };
}

/** BFS from the player's position with the physics as it is now (gates as per the current state). */
export function runWalkcheck(core: Core): { ok: boolean; missing: string[]; lon200: boolean } {
  const start = core.player.chart();
  const ph = { blocked: (s: 'planet', v: Vector3, r: number) => core.physics.blocked(s, v, r) };
  const reach = bfs(ph, (x, z, h) => core.physics.heightAt('planet', x, z, h), isChart(start) ? start : { r: 38.5, lon: 0 });
  const missing: string[] = [];
  for (const s of SPOTS) {
    if (s.scene !== 'planet' || TELEPORT_ONLY.has(s.id)) continue;
    const st = standOf(s);
    if (st && !reach.near(st.x, st.z, 1.0, st.h, 0.6)) missing.push(s.id);
  }
  const p200 = fl(34, 200);
  const lon200 = reach.near(p200.x, p200.z, 0.6);
  const res = { ok: true, missing, lon200, reached: reach.count };
  if (core.store.state.phase === 'day' && lon200) { res.ok = false; core.log.warn('[world:walkcheck] lon 200 reachable by day!'); }
  core.log.info('[world:walkcheck]', JSON.stringify(res));
  if (typeof window !== 'undefined') window.__world = { ...(window.__world ?? {}), walkcheck: res };
  void chartToFlat;
  return res;
}

/** Dev-only depth complexity probe: `window.__world.overdraw()` renders the planet scene from the gameplay camera with
 *  an additive, depth-test-free override (1/255 per fragment) and returns the mean fragments per pixel, per world
 *  layer and for everything else (characters, props of other modules). */
function installOverdraw(w: DevCtx): void {
  if (typeof window === 'undefined') return;
  const { core } = w;
  const rt = new WebGLRenderTarget(320, 180);
  const mat = new MeshBasicMaterial({ color: new Color(1 / 255, 1 / 255, 1 / 255), blending: AdditiveBlending, depthTest: false, depthWrite: false });
  const px = new Uint8Array(320 * 180 * 4);
  const measure = (only: ((m: Mesh) => boolean) | null): number => {
    const scene = core.scenes.get('planet');
    const hidden: { m: Mesh; v: boolean }[] = [];
    if (only) scene.traverse((o) => { const m = o as Mesh; if (m.isMesh && !only(m)) { hidden.push({ m, v: m.visible }); m.visible = false; } });
    const r = core.renderer, prevRt = r.getRenderTarget(), prevOv = scene.overrideMaterial, prevBg = scene.background;
    scene.overrideMaterial = mat; scene.background = null;
    const prevCc = r.getClearColor(new Color()), prevCa = r.getClearAlpha();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear();
    r.render(scene, core.cameraRig.camera);
    r.readRenderTargetPixels(rt, 0, 0, 320, 180, px);
    r.setRenderTarget(prevRt); r.setClearColor(prevCc, prevCa); scene.overrideMaterial = prevOv; scene.background = prevBg;
    for (const h of hidden) h.m.visible = h.v;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i];
    return sum / (320 * 180);
  };
  window.__world = {
    ...(window.__world ?? {}),
    overdraw: () => {
      const out: Record<string, number> = { all: measure(null) };
      for (const layer of new Set(w.chunks.map((c) => c.layer))) {
        const set = new Set(w.chunks.filter((c) => c.layer === layer).map((c) => c.mesh));
        out[layer] = measure((m) => set.has(m));
      }
      const mine = new Set(w.chunks.map((c) => c.mesh));
      out.others = measure((m) => !mine.has(m));
      const per: Record<string, number> = {};
      for (const c of w.chunks) { if (c.mesh.visible && c.mesh.layers.isEnabled(0)) { const v = measure((m) => m === c.mesh); if (v > 0.05) per[c.mesh.name] = +v.toFixed(2); } }
      return { ...out, per };
    },
  };
}
