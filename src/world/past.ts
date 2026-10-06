// src/world/past.ts — owner B. PAST-layer dressing (layer 3, only in render.capture({ past: true })) for the preset
// photos (GDD §7.2): 2006 — the old 「月亮湾小卖部」 sign; 2011 — the temple fair lanterns and the idol with its face.
// Present-day things that must vanish in the past carry userData.hideInPast (crane, chai, store sign, metro signage).
import { CanvasTexture, Mesh, PlaneGeometry, SRGBColorSpace, type BufferGeometry } from 'three';
import { PAL } from '../art/palette';
import type { Core } from '../contracts';
import { mergePainted, paint } from '../core/geom';
import { makeCanvas } from '../core/canvas';
import { LAYER, setLayerDeep } from '../core/layers';
import { placeAt, placeMatrix } from '../core/planet';
import { FONT } from '../core/fonts';
import { createRng } from '../core/rng';
import { t } from '../data/zh';
import { makeToonMaterial } from '../render/index';
import { ch, fl } from './geo';
import { TEMPLE } from './layout';
import { storeRect } from './colliders';
import { blob, box } from './kit/prims';
import { setUv } from './kit/batch';

function tex(c: HTMLCanvasElement): CanvasTexture { const x = new CanvasTexture(c); x.colorSpace = SRGBColorSpace; return x; }

export function buildPast(core: Core): void {
  const scene = core.scenes.get('planet');
  // 2006: the old corner-shop sign over the convenience store sign
  {
    const { canvas, ctx: g } = makeCanvas(384, 64);
    g.fillStyle = PAL.bannerRed; g.fillRect(0, 0, 384, 64);
    g.strokeStyle = PAL.yellow; g.lineWidth = 4; g.strokeRect(4, 4, 376, 56);
    g.fillStyle = PAL.yellow; g.font = `700 40px ${FONT.brush}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t('sign.store_old'), 192, 34);
    const geo = paint(new PlaneGeometry(4.9, 0.95), '#ffffff', 90);
    const m = new Mesh(geo, makeToonMaterial({ vertexColors: true, map: tex(canvas) }));
    const rc = storeRect();
    placeAt(m, 'planet', { ...ch(rc.c), h: 0 }, rc.hdg);
    m.translateX(-0.4); m.translateY(3.6); m.translateZ(rc.hd + 0.2);
    m.name = 'past:old_store_sign';
    setLayerDeep(m, LAYER.PAST);
    scene.add(m);
  }
  // 2011: lantern strings + a banner around the temple, the idol's face
  {
    const rng = createRng(0x2011);
    const parts: BufferGeometry[] = [];
    for (const [r, a0, a1, h] of [[5.8, 110, 180, 6.4], [3.9, 120, 170, 6.8], [6.5, 190, 250, 6.0]] as const) {
      for (let i = 0; i <= 8; i++) {
        const lon = a0 + ((a1 - a0) * i) / 8;
        const M = placeMatrix('planet', { r, lon, h: h - Math.sin((i / 8) * Math.PI) * 0.35 }, 0);
        const g = blob(0.2, 0, 0, 0, rng, 0.04, 1, 1.2); paint(g, PAL.bannerRed, 240); setUv(g, null); g.applyMatrix4(M); parts.push(g);
        const cap = box(0.24, 0.05, 0.24, 0, 0.24, 0); paint(cap, PAL.yellow, 176); setUv(cap, null); cap.applyMatrix4(M); parts.push(cap);
      }
    }
    const M = placeMatrix('planet', { r: 6.2, lon: 145, h: 4 }, 180);
    for (const s of [-1, 1]) {
      const pole = box(0.08, 3.2, 0.08, s * 1.6, 0, 0); paint(pole, PAL.trunk, 136); setUv(pole, null); pole.applyMatrix4(M); parts.push(pole);
    }
    const ban = box(3.2, 0.5, 0.04, 0, 2.6, 0); paint(ban, PAL.bannerRed, 150); setUv(ban, null); ban.applyMatrix4(M); parts.push(ban);
    const m = new Mesh(mergePainted(parts), makeToonMaterial({ vertexColors: true }));
    m.name = 'past:temple_fair';
    setLayerDeep(m, LAYER.PAST);
    scene.add(m);
    // the idol's face as it was (in front of the smoked one)
    const { canvas, ctx: g } = makeCanvas(64, 64);
    g.fillStyle = PAL.skin; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = PAL.inkDeep; g.lineWidth = 3;
    g.beginPath(); g.moveTo(18, 27); g.quadraticCurveTo(24, 22, 29, 27); g.moveTo(35, 27); g.quadraticCurveTo(40, 22, 46, 27); g.stroke();
    g.beginPath(); g.moveTo(22, 44); g.quadraticCurveTo(32, 52, 42, 44); g.stroke();
    g.fillStyle = PAL.clothWhite; g.beginPath(); g.moveTo(16, 48); g.quadraticCurveTo(32, 76, 48, 48); g.quadraticCurveTo(32, 58, 16, 48); g.fill();
    const face = new Mesh(paint(new PlaneGeometry(0.34, 0.36), '#ffffff', 167), makeToonMaterial({ vertexColors: true, map: tex(canvas) }));
    placeAt(face, 'planet', { r: TEMPLE.idol.r, lon: TEMPLE.idol.lon, h: 4 + 1.62 }, 180);
    face.translateZ(0.135);
    face.name = 'past:idol_face';
    setLayerDeep(face, LAYER.PAST);
    scene.add(face);
  }
  void fl;
}
