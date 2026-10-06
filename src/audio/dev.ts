// src/audio/dev.ts — owner A. dev/audio.html: renders every SfxId in an OfflineAudioContext and lists its RMS
// (ARCHITECTURE §3.A self-test: every RMS must be > 0.0003). Results also land in window.__audioRms.
import { SFX, SFX_IDS, makeNoise } from './synth';

declare global { interface Window { __audioRms?: { rms: Record<string, number>; ok: boolean } } }

async function rmsOf(id: keyof typeof SFX): Promise<number> {
  const rate = 22050, ctx = new OfflineAudioContext(1, rate * 3, rate);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  SFX[id]({ ctx, out, noise: makeNoise(ctx) }, 0.02, { vol: 1, pitch: 880 });
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

async function main(): Promise<void> {
  const rms: Record<string, number> = {};
  for (const id of SFX_IDS) rms[id] = await rmsOf(id);
  const ok = Object.values(rms).every((v) => v > 0.0003);
  window.__audioRms = { rms, ok };
  // minimal __game shim so scripts/shot.mjs (which waits for __game.ready and calls step) can drive this page
  const shim = { ready: true, step: () => ({ frame: 0, scene: 'dev', pos: [0, 0, 0], yaw: 0, calls: 0, triangles: 0, programs: 0 }) };
  (window as unknown as { __game: unknown }).__game = shim;
  const el = document.getElementById('out');
  if (!el) return;
  const rows = SFX_IDS.map((id) => `<tr class="${rms[id] > 0.0003 ? '' : 'bad'}"><td>${id}</td><td>${rms[id].toFixed(5)}</td></tr>`).join('');
  el.innerHTML = `<p data-testid="audio-ok">${ok ? 'ALL OK' : 'FAIL'} (${SFX_IDS.length} sfx)</p><table>${rows}</table>`;
}
void main();
