// src/world/darkroom.ts — P3r2 look L1 (world visuals). The darkroom's live props for S_darkroom (GDD §9): the safelight
// lens (dark until the bench's E switches it on), the print travelling brown → white → blue tray and developing in the
// first one, the four negatives on the drying line after the third tray, and the developed stitched positive hanging there
// once it exists (「拍照的人，不在照片里」 is said looking at it). The red room light itself is render's darkroom grade.
// Materials reuse the world's `win` / `interact` option sets, so no new shader program is compiled.
import { CanvasTexture, Group, Mesh, PlaneGeometry, SRGBColorSpace, type BufferAttribute, type Material } from 'three';
import type { Core } from '../contracts';
import { paint } from '../core/geom';
import { makeCanvas } from '../core/canvas';
import { posToWorld } from '../core/planet';
import { makeToonMaterial } from '../render/index';
import { STUDIO } from './interiors/plans';

/** Seconds the image takes to come up in the developer (brown) tray. */
export const PRINT_DEVELOP_S = 1.6;
export const LAMP = { on: '#ff6b5e', off: '#4a2a2c' } as const;
/** Drying-line print: 2 m wide (the stitched strip is ≈ 3.2 : 1), hung just under the line. */
export const LINE_PRINT = { w: 2.0, h: 0.62 } as const;

export type TrayId = 'brown' | 'white' | 'blue';
/** Pure: which tray holds the print for the darkroom flags (null = no print on the bench). */
export function printTray(has: (f: string) => boolean): TrayId | null {
  if (!has('dk_tray_1') || has('dk_hung')) return null;
  return has('dk_tray_3') ? 'blue' : has('dk_tray_2') ? 'white' : 'brown';
}

function tex(c: HTMLCanvasElement): CanvasTexture { const x = new CanvasTexture(c); x.colorSpace = SRGBColorSpace; x.anisotropy = 1; return x; }

/** The print's picture: four frames of the stairs (greys), `k` = 0 blank paper … 1 fully developed. */
function drawPrint(g: CanvasRenderingContext2D, W: number, H: number, k: number, cool: boolean): void {
  g.fillStyle = '#f3efe2'; g.fillRect(0, 0, W, H);
  if (k <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, k);
  const fw = (W - 10) / 4;
  for (let i = 0; i < 4; i++) {
    const x0 = 2 + i * (fw + 2), y0 = 6, h = H - 12;
    g.fillStyle = cool ? '#8fa3a8' : '#9d948a'; g.fillRect(x0, y0, fw, h);                    // sky
    g.fillStyle = cool ? '#43535a' : '#4f4640';
    g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0 + fw, y0 + h * (0.55 - i * 0.12)); g.lineTo(x0 + fw, y0 + h); g.fill();   // the stair run
    g.fillRect(x0 + fw * 0.2, y0 + h * 0.62, fw * 0.12, h * 0.38);                              // a pier
  }
  // the chalk X in the middle
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round';
  const cx = W / 2, cy = H * 0.52, s = 7;
  g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.stroke();
  g.restore();
}

/** The four negatives: orange-brown film base, frames with the light / dark swapped. */
function drawNegatives(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.fillStyle = '#3a2418'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#6b3f22';
  for (let x = 6; x < W - 8; x += 18) { g.fillRect(x, 5, 9, 8); g.fillRect(x, H - 13, 9, 8); }
  const fw = (W - 50) / 4;
  for (let i = 0; i < 4; i++) {
    const x0 = 10 + i * (fw + 10), y0 = 20, h = H - 40;
    g.fillStyle = '#5a3520'; g.fillRect(x0, y0, fw, h);                                          // dense sky
    g.fillStyle = '#c98a55';
    g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0 + fw, y0 + h * (0.55 - i * 0.12)); g.lineTo(x0 + fw, y0 + h); g.fill();
    g.fillRect(x0 + fw * 0.2, y0 + h * 0.62, fw * 0.12, h * 0.38);
  }
  g.strokeStyle = '#2a170e'; g.lineWidth = 6; g.lineCap = 'round';
  const cx = W / 2, cy = H * 0.52, s = 14;
  g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.stroke();
}

export function createDarkroom(core: Core): void {
  const scene = core.scenes.get('studio_int');
  const S = STUDIO, B0 = S.bench;
  const root = new Group();
  root.name = 'world:darkroom';
  root.position.copy(posToWorld('studio_int', { x: 0, y: 0, z: 0 }));
  scene.add(root);
  const white = makeCanvas(4, 4);
  white.ctx.fillStyle = '#ffffff'; white.ctx.fillRect(0, 0, 4, 4);
  const whiteTex = tex(white.canvas);

  // ---- the safelight lens (the housing stays in the static batch)
  const lampGeo = paint(new PlaneGeometry(0.52, 0.26), LAMP.off, 240);
  const lamp = new Mesh(lampGeo, makeToonMaterial({ vertexColors: true, map: whiteTex, unlit: true, lineWeight: 0.7 }));
  lamp.position.set(B0.x, 2.33, S.z0 + 0.235);
  lamp.name = 'dk:safelight';
  root.add(lamp);
  const setLamp = (hex: string) => {
    const c = lampGeo.getAttribute('color') as BufferAttribute;
    const r = parseInt(hex.slice(1, 3), 16) / 255, gg = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, r, gg, b);
    c.needsUpdate = true;
  };

  // ---- the print in the lit tray
  const pc = makeCanvas(128, 72);
  const printTex = tex(pc.canvas);
  const printMat: Material = makeToonMaterial({ vertexColors: true, map: printTex, lineWeight: 1.4 });
  const print = new Mesh(paint(new PlaneGeometry(0.44, 0.3), '#ffffff', 188).rotateX(-Math.PI / 2), printMat);
  print.name = 'dk:print';
  print.visible = false;
  root.add(print);

  // ---- the drying line: negatives, then the developed positive (two faces, the room is walked round)
  const lc = makeCanvas(512, 160);
  const lineTex = tex(lc.canvas);
  const lineMat: Material = makeToonMaterial({ vertexColors: true, map: lineTex, lineWeight: 1.4 });
  const strip = new Group();
  strip.name = 'dk:line_print';
  const front = new Mesh(paint(new PlaneGeometry(LINE_PRINT.w, LINE_PRINT.h), '#ffffff', 189), lineMat);
  const back = new Mesh(paint(new PlaneGeometry(LINE_PRINT.w, LINE_PRINT.h), '#ffffff', 189).rotateY(Math.PI), lineMat);
  back.position.z = -0.004;
  strip.add(front, back);
  strip.position.set((S.line.x0 + S.line.x1) / 2, S.line.y - 0.06 - LINE_PRINT.h / 2, S.line.z + 0.01);
  strip.visible = false;
  root.add(strip);

  const has = (f: string) => core.store.has(f as never);
  const trayAt: Record<TrayId, { x: number; z: number }> = S.trays;
  let tray: TrayId | null = null, trayT0 = -1e9, drawnK = -1, drawnCool = false;
  let lineMode: 'none' | 'neg' | 'pos' = 'none', posUrl = '', loading = '';
  let lampOn: boolean | null = null;

  const developedUrl = (): string => {
    try { return (core.store.photo('ph_2023_stitched') as { dataURL?: string } | null)?.dataURL ?? ''; } catch { return ''; }
  };
  const showPositive = (url: string) => {
    if (!url || url === posUrl || url === loading || typeof Image === 'undefined') return;
    loading = url;
    const img = new Image();
    img.onload = () => {
      if (loading !== url) return;
      const g = lc.ctx;
      g.fillStyle = '#1f282d'; g.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
      g.drawImage(img, 0, 0, lc.canvas.width, lc.canvas.height);
      lineTex.needsUpdate = true;
      posUrl = url; loading = '';
      lineMode = 'pos';
    };
    img.src = url;
  };

  const sync = (instant: boolean) => {
    const lit = has('dk_lit');
    if (lit !== lampOn) { lampOn = lit; setLamp(lit ? LAMP.on : LAMP.off); }
    const tr = printTray(has);
    if (tr !== tray) {
      if (tr === 'brown' && tray === null) trayT0 = instant ? -1e9 : core.clock.t;
      tray = tr;
      if (tr) { const p = trayAt[tr]; print.position.set(p.x, B0.h + 0.075, p.z); }
    }
    print.visible = tray !== null;
    const hung = has('dk_hung');
    const url = developedUrl();
    if (hung && url) showPositive(url);
    if (hung && lineMode === 'none') { drawNegatives(lc.ctx, lc.canvas.width, lc.canvas.height); lineTex.needsUpdate = true; lineMode = 'neg'; }
    if (!hung && lineMode !== 'none') { lineMode = 'none'; posUrl = ''; }
    strip.visible = hung;
  };
  core.bus.on('flagSet', () => sync(false));
  core.bus.on('stateLoaded', () => sync(true));
  sync(true);

  core.loop.addSystem('world:darkroom', 'world', () => {
    if (core.player.scene !== 'studio_int') return;
    if (lineMode !== 'pos' && has('dk_hung')) { const u = developedUrl(); if (u) showPositive(u); }
    if (!tray) return;
    const k = tray === 'brown' ? Math.min(1, (core.clock.t - trayT0) / PRINT_DEVELOP_S) : 1;
    const cool = tray === 'blue';
    const q = Math.round(k * 12) / 12;
    if (q !== drawnK || cool !== drawnCool) {
      drawnK = q; drawnCool = cool;
      drawPrint(pc.ctx, pc.canvas.width, pc.canvas.height, q, cool);
      printTex.needsUpdate = true;
    }
  });
}
