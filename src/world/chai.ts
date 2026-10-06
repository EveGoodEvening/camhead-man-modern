// src/world/chai.ts — owner B. The 拆 / 折 actor (GDD §6.1, §9 P8): a 3.6 m red spray ring + glyph on the hoarding
// (surface ids 240–244, spirit ink), the mis-sprayed dot hanging on the net at D, the dawn 1.2 m 「折」 board on the
// footbridge railing. Night: the ring spins 2°/s; it breathes while speaking; after P8 the dot drips to the ground.
import { CanvasTexture, CircleGeometry, Group, Mesh, PlaneGeometry, SRGBColorSpace, Vector3, type Material } from 'three';
import type { Core } from '../contracts';
import { PAL } from '../art/palette';
import { paint } from '../core/geom';
import { DEG, SURFACES, chartToWorld, frameAt, placeAt, posToWorld } from '../core/planet';
import { createRng } from '../core/rng';
import { makeCanvas } from '../core/canvas';
import { FONT } from '../core/fonts';
import { t } from '../data/zh';
import { makeToonMaterial } from '../render/index';
import { GLYPH, type P8Result } from './p8';
import { drawGlyph } from './glyphs';
import { SITE, BRIDGE } from './layout';
import { box } from './kit/prims';
import { setUv } from './kit/batch';

export interface ChaiHandle {
  readonly root: Group;
  setPhase(o: { phase: 'day' | 'dusk' | 'night' | 'dawn'; zhe: boolean; dotTaken: boolean; instant: boolean }): void;
  /** drop animation of the dot (P8 success) */
  dropDot(): void;
}


function glyphCanvas(zhe: boolean): HTMLCanvasElement {
  const { canvas, ctx: g } = makeCanvas(GLYPH.size, GLYPH.size);
  const rng = createRng(zhe ? 0x2e : 0xc4a1);
  g.clearRect(0, 0, GLYPH.size, GLYPH.size);
  // spray: the glyph a few times with sub-stroke jitter, then drips from stroke bottoms (never over the dot area)
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(rng.range(-2.5, 2.5), rng.range(-2.5, 2.5));
    drawGlyph(g, 'sign.zhe', PAL.bannerRed);
    g.restore();
  }
  const img = g.getImageData(0, 0, GLYPH.size, GLYPH.size).data;
  const red = (x: number, y: number) => { const i = (y * GLYPH.size + x) * 4; return img[i] > 150 && img[i + 1] < 110; };
  g.strokeStyle = PAL.bannerRed; g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    const x = Math.floor(rng.range(110, 400));
    let y = GLYPH.size - 1;
    while (y > 0 && !red(x, y)) y--;
    if (y < 150) continue;
    g.lineWidth = rng.range(3, 6);
    g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + rng.range(-1, 1), y + rng.range(14, 46)); g.stroke();
  }
  return canvas;
}
function ringCanvas(): HTMLCanvasElement {
  const { canvas, ctx: g } = makeCanvas(512, 512);
  const rng = createRng(0x51a9);
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = PAL.bannerRed;
  for (let i = 0; i < 3; i++) {
    g.lineWidth = rng.range(20, 26);
    g.beginPath();
    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2, rr = 226 + rng.range(-3, 3);
      const x = 256 + Math.cos(th) * rr, y = 256 + Math.sin(th) * rr;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const th = rng.range(0.2, Math.PI - 0.2), x = 256 + Math.cos(th) * 226, y = 256 + Math.sin(th) * 226;
    g.lineWidth = rng.range(3, 6); g.beginPath(); g.moveTo(x, y); g.lineTo(x, Math.min(510, y + rng.range(10, 30))); g.stroke();
  }
  return canvas;
}
function boardCanvas(): HTMLCanvasElement {
  const { canvas, ctx: g } = makeCanvas(256, 256);
  g.fillStyle = PAL.spiritPaper; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = PAL.bannerRed; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = PAL.bannerRed; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 150px ${FONT.brush}`; g.fillText(t('sign.zhe'), 128, 136);
  return canvas;
}
function tex(c: HTMLCanvasElement): CanvasTexture { const x = new CanvasTexture(c); x.colorSpace = SRGBColorSpace; x.anisotropy = 1; return x; }
function mat(map: CanvasTexture, sid: number, unlit = false, cut = true): Material {
  // transparent canvas + alpha cut: only the cinnabar paint is drawn (immune to grading); the hoarding shows through
  return makeToonMaterial({ vertexColors: true, map, surfaceId: sid, spiritImmune: true, unlit, lineWeight: 1, alphaTest: cut ? 0.5 : 0 });
}
function painted<T extends CircleGeometry | PlaneGeometry>(g: T, sid: number, hex = '#ffffff'): T { paint(g, hex, sid); return g; }

export function createChai(core: Core, p8: P8Result): ChaiHandle {
  const scene = core.scenes.get('planet');
  const root = new Group();
  root.name = 'chai';
  root.userData.actorId = 'chai';
  root.userData.hideInPast = true;
  // hoarding discs: rotating ring behind, fixed glyph in front (both spirit ids)
  const discs = new Group();
  const ring = new Mesh(painted(new CircleGeometry(GLYPH.planeM / 2 * 1.03, 40), 240), mat(tex(ringCanvas()), 240));
  ring.position.z = 0.01;
  const gc = glyphCanvas(true);
  const glyphTex = tex(gc);
  if (typeof window !== 'undefined') window.__world = { ...(window.__world ?? {}), chaiCanvas: () => gc.toDataURL() };
  const glyphGeo = painted(new PlaneGeometry(GLYPH.planeM, GLYPH.planeM), 241);
  const glyphDisc = new Mesh(painted(new CircleGeometry(GLYPH.planeM / 2 * 0.86, 40), 240), mat(glyphTex, 240));
  // map the circle's uv so the glyph canvas (planeM square) lines up: CircleGeometry uv spans its own radius
  {
    const k = 0.86, uv = glyphDisc.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * k, 0.5 + (uv.getY(i) - 0.5) * k);
  }
  glyphGeo.dispose();
  glyphDisc.position.z = 0.03;
  discs.add(ring, glyphDisc);
  root.add(discs);
  // dawn board (1.2 m paper sign)
  const boardTex = tex(boardCanvas());
  const board = new Mesh(painted(new PlaneGeometry(1.2, 1.2), 242), mat(boardTex, 242, false, false));
  board.visible = false;
  root.add(board);
  placeAt(root, 'planet', { r: SITE.chai.r, lon: SITE.chai.lon, h: SITE.chai.h }, 0);
  scene.add(root);
  core.scenes.registerCullable(root, { radius: 2.5, height: 6 });
  core.actors.register({ id: 'chai', scene: 'planet', root, head: glyphDisc, layer: 'world', spirit: true, spot: () => null });

  // the dot on the net (faces E0 so it completes 拆 from the road), then on the ground after P8
  const dotGeo = painted(new CircleGeometry(0.5, 14), 243, PAL.bannerRed);
  dotGeo.scale(1, 1.35, 1);
  dotGeo.rotateZ(-0.6);
  setUv(dotGeo, null);
  const dot = new Mesh(dotGeo, makeToonMaterial({ vertexColors: true, surfaceId: 243, spiritImmune: true, lineWeight: 0.6 }));
  dot.name = 'chai_dot';
  dot.userData.hideInPast = true;
  const dotScale = p8.dotSize;
  dot.scale.setScalar(dotScale);
  dot.position.copy(p8.D);
  dot.lookAt(p8.E0);
  scene.add(dot);
  core.scenes.registerCullable(dot, { radius: 0.5, height: 3 });
  // a thin string holding the dot on the net
  const ground = posToWorld('planet', { ...p8.groundDot, h: 0.03 });
  const fr = frameAt(SURFACES.planet, ground);

  let phase: 'day' | 'dusk' | 'night' | 'dawn' = 'day';
  let zhe = false, dropping = -1, dropped = false, dotTaken = false, speaking = false;
  const dropFrom = p8.D.clone();
  const _v = new Vector3();
  core.bus.on('dialogueStart', (e) => { if (e.node.startsWith('chai.')) speaking = true; });
  core.bus.on('dialogueEnd', (e) => { if (e.node.startsWith('chai.')) speaking = false; });
  core.bus.on('uncanny', (e) => { if (e.id === 'M_zhe') api.dropDot(); });

  core.loop.addSystem('world:chai', 'world', (dt) => {
    const t0 = core.clock.animT;
    if (phase === 'night' && !zhe) ring.rotation.z -= 2 * DEG * dt;
    else if (phase === 'dusk' && !zhe) ring.rotation.z = Math.sin(t0 * 0.9) > 0.985 ? 0.06 : 0;   // 「动了一下」
    const s = speaking ? 1 + 0.03 * Math.sin(t0 * Math.PI * 2 * 1.1) : 1;
    discs.scale.set(s, s, 1);
    if (dropping >= 0) {
      dropping += dt;
      const k = Math.min(1, dropping / 0.8);
      dot.position.lerpVectors(dropFrom, ground, k * k);
      if (k >= 1) {
        dropping = -1; dropped = true;
        dot.position.copy(ground);
        dot.lookAt(_v.copy(ground).add(fr.up));
        dot.scale.setScalar(Math.max(0.18, dotScale));
      }
    }
  });

  const api: ChaiHandle = {
    root,
    setPhase(o) {
      const becameZhe = o.zhe && !zhe;
      phase = o.phase; zhe = o.zhe; dotTaken = o.dotTaken;
      const dawn = o.phase === 'dawn';
      discs.visible = !dawn;
      board.visible = dawn;
      if (dawn) {
        // hang the board on the south stair's sea-side edge, facing the tripod side (GDD §9 S_group_photo). Its top sits
        // at the tread line between g4 and g5 (I-gate): hung at h 3.6 it covered the chalk X (g5) and the hero's face in
        // the tripod view and in ph_2026_group (GDD §19.4 photo_card 「照片里主角有脸」).
        // P3-look L3: at lon 22.25 it was the largest, most central thing in ph_2026_group; at lon 19.5 it still filled the
        // photo's lower left (P3r2 look L3). It now hangs at the top of the stairs (lon 30.8), right of the tripod's
        // frame: seen from the street and the dawn intro, not in the group photo
        const lon = 30.8, tread = 0.393 * (Math.min(lon, BRIDGE.south.lonTop) - BRIDGE.south.lonBot);
        placeAt(root, 'planet', { r: BRIDGE.south.r + BRIDGE.south.halfW + 0.12, lon, h: tread - 0.1 - 0.6 }, 180);
        board.position.set(0, 0, 0.02);
      } else placeAt(root, 'planet', { r: SITE.chai.r, lon: SITE.chai.lon, h: SITE.chai.h }, 0);
      root.updateMatrixWorld(true);
      if (!zhe) { dot.visible = true; dropped = false; dot.position.copy(p8.D); dot.scale.setScalar(dotScale); dot.lookAt(p8.E0); }
      else if (dropping < 0) {
        dot.visible = !dotTaken && !dawn;
        // P8 success (S_zhe step 1): the dot drips off the net during the beat's first 0.9 s; loads snap it down
        if (!dropped && becameZhe && !o.instant && !dawn) api.dropDot();
        else if (!dropped) { dot.position.copy(ground); dot.lookAt(_v.copy(ground).add(fr.up)); dot.scale.setScalar(Math.max(0.18, dotScale)); dropped = true; }
      }
      if (dotTaken) dot.visible = false;
      if (!zhe) ring.rotation.z = 0;
    },
    dropDot() {
      if (dropped || dropping >= 0) return;
      dropFrom.copy(dot.position);
      dropping = 0;
    },
  };
  void chartToWorld; void box;
  return api;
}
