// src/render/pipeline.ts — owner A. ART §4.2 pass structure: [shadow] → MRT (count 2, RGBA8, Nearest, DepthTexture)
// → single composite → FX forward pass. RT0 is plain RGBA8 NoColorSpace holding sRGB bytes written by the material's
// manual OETF; the composite does no conversion (ARCH §3.A item 4). Same pipeline for captures and LiveViews.
import {
  DepthTexture, LinearFilter, NearestFilter, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType, UnsignedIntType, Vector2,
  WebGLRenderTarget, type Camera, type PerspectiveCamera, type Scene, type WebGLRenderer,
} from 'three';
import type { Composite } from './composite';

export function makeMrt(w: number, h: number): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, {
    count: 2, type: UnsignedByteType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter,
    depthBuffer: true, samples: 0, generateMipmaps: false,
  });
  for (const t of rt.textures) t.colorSpace = NoColorSpace;
  rt.depthTexture = new DepthTexture(w, h, UnsignedIntType);
  return rt;
}

/** Composite output target (captures: NoColorSpace sRGB bytes; LiveView: SRGB8_ALPHA8 fed linear by the composite). */
export function makeColorRt(w: number, h: number, srgbTexture: boolean): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, {
    type: UnsignedByteType, format: RGBAFormat, minFilter: srgbTexture ? LinearFilter : NearestFilter,
    magFilter: srgbTexture ? LinearFilter : NearestFilter, depthBuffer: true, generateMipmaps: false,
  });
  rt.texture.colorSpace = srgbTexture ? SRGBColorSpace : NoColorSpace;
  return rt;
}

export class Pipeline {
  readonly renderer: WebGLRenderer;
  readonly comp: Composite;
  private main: WebGLRenderTarget | null = null;
  private readonly pool = new Map<string, WebGLRenderTarget>();
  private readonly size = new Vector2();
  constructor(renderer: WebGLRenderer, comp: Composite) { this.renderer = renderer; this.comp = comp; }

  /** MRT for a size (main target follows the drawing buffer; others are pooled per size). */
  mrtFor(w: number, h: number, main: boolean): WebGLRenderTarget {
    if (main) {
      if (!this.main) this.main = makeMrt(w, h);
      else if (this.main.width !== w || this.main.height !== h) { this.main.setSize(w, h); }
      return this.main;
    }
    const k = `${w}x${h}`;
    let rt = this.pool.get(k);
    if (!rt) { rt = makeMrt(w, h); this.pool.set(k, rt); }
    return rt;
  }

  drawingSize(): Vector2 { return this.renderer.getDrawingBufferSize(this.size); }

  /** Main pass into `mrt`: clear to (0,0,0,0) — sky pixels = depth 1, id 0, weight 0 (ART §4.2). */
  geometry(mrt: WebGLRenderTarget, scene: Scene, camera: Camera): void {
    const r = this.renderer;
    r.setRenderTarget(mrt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);
  }

  /** Composite `mrt` (seen through `camera`) into `out` (null = canvas). */
  composite(mrt: WebGLRenderTarget, camera: PerspectiveCamera, out: WebGLRenderTarget | null, linearOut: boolean): void {
    const u = this.comp.u, r = this.renderer;
    u.tColor.value = mrt.textures[0];
    u.tInfo.value = mrt.textures[1];
    u.tDepth.value = mrt.depthTexture;
    u.uTexel.value.set(1 / mrt.width, 1 / mrt.height);
    u.uIzA.value = 1 / camera.near;                                   // 1/viewZ is linear in the depth value
    u.uIzB.value = (camera.far - camera.near) / (camera.near * camera.far);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uLinePx.value = Math.min(2, Math.max(0.75, mrt.height / 720));
    u.uLinearOut.value = linearOut ? 1 : 0;
    this.comp.mesh.material = u.uViewfinder.value > 0 ? this.comp.materialVf : this.comp.material;
    r.setRenderTarget(out);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.comp.scene, this.comp.camera);
  }

  /** FX forward pass over the composite's colour + depth (no clear). */
  fx(scene: Scene, camera: Camera): void {
    if (scene.children.length === 0) return;
    const r = this.renderer, ac = r.autoClear;
    r.autoClear = false;
    r.render(scene, camera);
    r.autoClear = ac;
  }

  /** Read an RGBA8 target back into a top-left-origin canvas. */
  readCanvas(rt: WebGLRenderTarget, w: number, h: number): HTMLCanvasElement {
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
    }
    return canvas;
  }
}
