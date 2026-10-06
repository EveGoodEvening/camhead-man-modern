// src/render/devcheck.ts — owner A. ART §3.3 / ARCH §6 risk 3: in dev and test builds, one console.error per main-pass
// drawable whose material was not made by makeToonMaterial (it would leave garbage in the MRT info buffer = phantom ink).
import type { Material, Object3D, Scene } from 'three';

type Drawable = Object3D & { material?: Material | Material[]; isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean };

export class MrtCheck {
  private readonly reported = new Set<string>();
  /** Returns the offenders found in this pass (each reported once per object). */
  run(scene: Scene): string[] {
    const bad: string[] = [];
    if (scene.background && !this.reported.has(`${scene.uuid}:bg`)) {        // ART §3.3: never scene.background
      this.reported.add(`${scene.uuid}:bg`);
      const msg = `[render] scene "${scene.name}" has scene.background — the sky is drawn by the composite; remove it`;
      bad.push(msg);
      console.error(msg);
    }
    scene.traverse((o) => {
      const d = o as Drawable;
      if (!(d.isMesh || d.isLine || d.isPoints || d.isSprite) || this.reported.has(o.uuid)) return;
      const mats = Array.isArray(d.material) ? d.material : d.material ? [d.material] : [];
      const ok = !d.isSprite && !d.isLine && !d.isPoints && mats.length > 0 && mats.every((m) => m.userData?.mrt === true && !m.transparent);
      if (ok) return;
      this.reported.add(o.uuid);
      const why = d.isSprite || d.isLine || d.isPoints ? 'Sprite/Line/Points in the main pass'
        : mats.some((m) => m.transparent) ? 'transparent material in the main pass' : 'material not from makeToonMaterial';
      const msg = `[render] main-pass object "${o.name || o.type}" (${scene.name}): ${why} — use makeToonMaterial or render.fxScene()`;
      bad.push(msg);
      console.error(msg);
    });
    return bad;
  }
}
