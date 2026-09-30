// src/story/dev.ts — owner F. dev/story.html: runs the GDD §19.3 golden path at the logic level in the browser (real
// core + story, fake E/D — the same harness as the vitest suite) and prints a row table: flags, chapter, clock,
// objective, cards, beats and wx per step. Lets I check story logic apart from lens/world geometry.
import { createHarness } from './testHarness';
import { GOLDEN_ROWS } from './goldenRows';

const root = document.getElementById('out') ?? document.body;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

async function main(): Promise<void> {
  const h = await createHarness({ start: 'skip' });
  await h.settle();
  const rows: string[] = [];
  let ok = 0;
  for (const row of GOLDEN_ROWS) {
    const cards = h.rec.cards.length, beats = h.rec.beats.length, wx = h.rec.wx.length;
    let err = '';
    try { await row.run(h); await h.settle(); } catch (e) { err = String(e); }
    const s = h.core.store.state;
    const missing = row.flags.filter((f) => !h.has(f));
    if (!missing.length && !err) ok++;
    rows.push(`<tr class="${missing.length || err ? 'bad' : 'ok'}"><td>${row.step}</td><td>${missing.length ? `missing ${missing.join(', ')}` : 'ok'}${err ? ` · ${esc(err)}` : ''}</td>`
      + `<td>${s.chapter} / ${s.phase}</td><td>${s.clock}</td><td>${s.objective ?? '—'}</td>`
      + `<td>${h.rec.cards.slice(cards).join(' ')}</td><td>${h.rec.beats.slice(beats).join(' ')}</td><td>${h.rec.wx.slice(wx).join(' ')}</td></tr>`);
  }
  root.innerHTML = `<h1 data-testid="story-dev-summary">story golden (logic): ${ok}/${GOLDEN_ROWS.length}</h1>`
    + '<table><tr><th>row</th><th>flags</th><th>chapter</th><th>clock</th><th>objective</th><th>cards</th><th>beats</th><th>wx</th></tr>'
    + `${rows.join('')}</table>`;
  // scripts/shot.mjs waits for __game.ready and calls step(): a minimal stand-in so the page can be screenshotted
  (window as unknown as { __game: unknown }).__game = {
    ready: true,
    step: () => ({ frame: 0, scene: 'planet', pos: [0, 0, 0], yaw: 0, calls: 0, triangles: 0, programs: 0 }),
  };
}

void main();
