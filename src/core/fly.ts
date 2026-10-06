// src/core/fly.ts — owner: S. FROZEN. ?fly free camera: WASD + mouse, Q/E down/up (ARCHITECTURE §2.8.5).
import { Vector3 } from 'three';
import type { Core } from '../contracts';

export function enableFly(core: Core): () => void {
  const pos = new Vector3(), fwd = new Vector3(), right = new Vector3(), up = new Vector3(0, 1, 0);
  let yaw = 0, pitch = -0.3, init = false;
  core.player.lock('fly', true);
  const pop = core.cameraRig.push('fly', (cam, dt) => {
    if (!init) { pos.copy(cam.position); init = true; }
    const l = core.input.consumeLook();
    yaw -= l.dx * 0.0025; pitch = Math.max(-1.5, Math.min(1.5, pitch - l.dy * 0.0025));
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.crossVectors(fwd, up).normalize();
    const sp = (core.input.held('run') ? 30 : 10) * dt;
    const i = core.input;
    pos.addScaledVector(fwd, ((i.held('forward') ? 1 : 0) - (i.held('back') ? 1 : 0)) * sp);
    pos.addScaledVector(right, ((i.held('right') ? 1 : 0) - (i.held('left') ? 1 : 0)) * sp);
    pos.addScaledVector(up, ((i.held('interact') ? 1 : 0) - (i.held('flash') ? 1 : 0)) * sp);
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(fwd.clone().add(pos));
  });
  return () => { pop(); core.player.lock('fly', false); };
}
