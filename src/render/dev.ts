// src/render/dev.ts — owner A. dev/render.html: boots the real game with A's dev hook.
//   dev/render.html?check          → ART Appendix A checks 1–7 + night_store numbers (day@sp_bus_bench, night@sp_store_front,
//                                    title), printed to <pre data-testid="render-check"> / window.__renderCheck
//   dev/render.html?scene&check    → the same over A's dev street (useful until B's town lands)
// Defaults to ?test&seed=1&mute&skipTitle&at=sp_bus_bench so the run is deterministic.
const q = new URLSearchParams(location.search);
const args = ['tools', q.has('check') ? 'check' : '', q.has('scene') ? 'scene' : '', q.has('prof') ? 'prof' : ''].filter(Boolean);
for (const [k, v] of [['test', ''], ['seed', '1'], ['mute', ''], ['skipTitle', ''], ['at', 'sp_bus_bench']] as const) if (!q.has(k)) q.set(k, v);
q.set('dev', `render:${args.join(',')}`);
history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
void import('../main');
