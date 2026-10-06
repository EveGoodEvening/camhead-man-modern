#!/usr/bin/env node
// scripts/smoke.mjs — owner: S. Smoke / golden / checkpoint suites (ARCHITECTURE §4.4).
//   node scripts/smoke.mjs [--base http://127.0.0.1:5170] [--suite boot|golden|checkpoints|chapters|save|ui|all] [--out dir]
//                          [--strict-perf] [--ending A|B]
// --ending B runs the golden path with the 【不上车】 choice (ending_B → credits_done); `chapters` boots every ?chapter= /
// ?phase= and checks it is playable; `save` is the ARCHITECTURE §4.3 round trip (I-play, Phase 2); `ui` covers the rest of
// §4.3 (I-gate): every GDD §19.2 testid, Esc / pause / settings, the pointer-lock prompt, ?lowfx=1, ?mute and fonts.
// Without --base: vite build → .smoke/dist, served by vite preview on 4174.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { attachErrorCollector, closeBrowser, launch, openGame, touchSlot } from './lib/browser.mjs';
import { CHAPTER_BOOTS, CHECKPOINTS, GOLDEN, PHASE_BOOTS, Q, SAVE_ROWS, checkpointRects, goldenRows, lineupSpots } from './lib/suites.mjs';
import { makeChecks } from './lib/checks.mjs';

const argv = process.argv.slice(2);
const opt = { base: '', suite: 'boot', out: 'test-results/smoke', strictPerf: false, ending: 'A', only: '' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base') opt.base = argv[++i];
  else if (a === '--suite') opt.suite = argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--strict-perf') opt.strictPerf = true;
  else if (a === '--ending') opt.ending = argv[++i];
  else if (a === '--only') opt.only = argv[++i];               // checkpoints: comma-separated names
  else { console.error(`unknown arg ${a}`); process.exit(2); }
}
if (!['boot', 'golden', 'checkpoints', 'chapters', 'save', 'ui', 'all'].includes(opt.suite)) { console.error(`bad --suite ${opt.suite}`); process.exit(2); }
if (!['A', 'B'].includes(opt.ending)) { console.error(`bad --ending ${opt.ending}`); process.exit(2); }
const BUDGET = { triangles: 150_000, calls: 120, programs: 20, ms: 60, bootMs: 60_000 };   // §5.1 hard caps

// ------------------------------------------------------------------ server
let preview = null;
async function ensureServer() {
  if (opt.base) return opt.base;
  const vite = path.join('node_modules', 'vite', 'bin', 'vite.js');
  const b = spawnSync(process.execPath, [vite, 'build', '--outDir', '.smoke/dist', '--emptyOutDir'], { stdio: 'inherit' });
  if (b.status !== 0) { console.error('build failed'); process.exit(1); }
  preview = spawn(process.execPath, [vite, 'preview', '--outDir', '.smoke/dist', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  const base = 'http://127.0.0.1:4174';
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base); if (r.ok) return base; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}
process.on('exit', () => { if (preview) preview.kill(); });

// ------------------------------------------------------------------ report
const report = { suite: opt.suite, base: '', shots: [], boot: [], errors: [], failures: [], warnings: [], passed: false };
const fail = (where, msg) => { report.failures.push({ where, msg }); console.log(`  ✗ ${where}: ${msg}`); };
const ok = (where, msg) => console.log(`  ✓ ${where}${msg ? `: ${msg}` : ''}`);
const warn = (where, msg) => { report.warnings.push({ where, msg }); console.log(`  ! ${where}: ${msg}`); };

// ------------------------------------------------------------------ page helpers
let context = null;
const pages = [];
async function openPage(url, label) {
  const page = await context.newPage();
  const errors = attachErrorCollector(page, label);
  pages.push({ page, errors });
  const t0 = Date.now();
  await openGame(page, new URL(url, report.base).toString());
  const bootMs = Date.now() - t0;
  if (bootMs > BUDGET.bootMs) fail(label, `boot to ready ${(bootMs / 1000).toFixed(1)} s > ${BUDGET.bootMs / 1000} s`);
  report.boot.push({ page: label, ms: bootMs });
  touchSlot();
  return page;
}
/** In-page call runner: `calls` is an async function body evaluated `with (__game)`; `await __settle()` is available. */
async function run(page, calls) {
  if (!calls) return null;
  return page.evaluate((src) => {
    const g = window.__game;
    // async on purpose: step() is synchronous, so promise continuations (rules.run chains, beats and dialogue awaiting
    // sim-time waits) only advance when the task yields. A synchronous loop would spin 300× without progress.
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const settle = async () => {
      for (let i = 0; i < 300; i++) {
        await yieldTask();
        g.step(5);
        await yieldTask();
        const s = g.state();
        if (s.busy.card || s.busy.beat) g.skip();
        else if (s.busy.dialogue && s.choices === 0) g.advance();
        const s2 = g.state();
        if (!s2.busy.any || s2.choices > 0) return i;
      }
      return 300;
    };
    // an async body, so a row can `await __settle()` before its next calls (a bare `__settle()` would run AFTER them:
    // it suspends at its first yield, and its skip() then aborted the very beat the row had just started)
    const AsyncFunction = (async () => {}).constructor;
    return new AsyncFunction('g', '__settle', `with (g) { ${src} }`)(g, settle);
  }, calls);
}
const settle = (page) => run(page, 'return __settle();');   // resolves after the in-page async settle finishes
const state = (page) => page.evaluate(() => window.__game.state());
async function visible(page, testid) {
  return page.locator(`[data-testid=${testid}]`).first().isVisible().catch(() => false);
}
async function noMissingKeys(page, where) {
  const bad = await page.evaluate(() => document.body.innerText.includes('⟦'));
  if (bad) fail(where, 'DOM contains a missing-key marker ⟦…⟧'); else ok(where, 'no ⟦ in DOM');
}
async function shot(page, name, extra = {}) {
  fs.mkdirSync(opt.out, { recursive: true });
  const file = path.join(opt.out, `${name}.png`);
  await page.evaluate(() => window.__game.step(0));
  await page.screenshot({ path: file });
  const s = await state(page);
  const entry = { name, file, calls: s.calls, triangles: s.triangles, programs: s.programs, ...extra };
  if (s.triangles > BUDGET.triangles) fail(name, `triangles ${s.triangles} > ${BUDGET.triangles}`);
  if (s.calls > BUDGET.calls) fail(name, `draw calls ${s.calls} > ${BUDGET.calls}`);
  if (s.programs > BUDGET.programs) fail(name, `shader programs ${s.programs} > ${BUDGET.programs}`);
  if (entry.ms !== undefined && entry.ms > BUDGET.ms) (opt.strictPerf ? fail : warn)(name, `timeRender(8) ${entry.ms.toFixed(1)} ms > ${BUDGET.ms}`);
  report.shots.push(entry);
  ok(name, `${file} (calls ${s.calls}, tris ${s.triangles}, programs ${s.programs}${entry.ms !== undefined ? `, ${entry.ms.toFixed(1)} ms` : ''})`);
  return s;
}
const timeRender = (page) => page.evaluate(() => window.__game.timeRender(8));
async function closeAll() { for (const p of pages.splice(0)) { report.errors.push(...p.errors); await p.page.close().catch(() => undefined); } }

// ------------------------------------------------------------------ suites
async function bootSuite() {
  console.log('[boot]');
  const u = (q) => `/?${Q}${q}`;
  let p = await openPage(u(''), '01');
  if (await visible(p, 'title-start')) ok('01', 'title-start visible'); else fail('01', 'title-start not visible');
  await noMissingKeys(p, '01');
  await shot(p, '01-title');
  await p.locator('[data-testid=title-start]').click();
  await settle(p);
  await p.evaluate(() => window.__game.step(30));   // a skipped S_wake stands him up over 0.3–0.4 s (hero tweens)
  const s2 = await state(p);
  if (s2.flags.includes('game_started')) ok('02', 'game_started'); else fail('02', `flags lack game_started: ${s2.flags.join(',')}`);
  await noMissingKeys(p, '02');
  await shot(p, '02-wake');
  await closeAll();

  p = await openPage(u('&skipTitle&at=sp_bus_bench'), '03');
  await p.evaluate(() => window.__game.step(2));
  const ms = await timeRender(p);
  await noMissingKeys(p, '03');
  const s3 = await shot(p, '03-day-start', { ms });
  const s4 = await p.evaluate(() => window.__game.step(90, 1 / 60, { x: 0, y: 1 }));
  const a = s3.pos, b = s4.pos;
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const moved = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))) * 80;
  if (moved >= 3) ok('04', `moved ${moved.toFixed(2)} m along the surface`); else fail('04', `moved only ${moved.toFixed(2)} m`);
  if (lb >= 80 - 1e-6 && lb <= 86) ok('04', `|pos| = ${lb.toFixed(3)}`); else fail('04', `|pos| = ${lb.toFixed(3)} outside [80, 86]`);
  await noMissingKeys(p, '04');
  await shot(p, '04-walk');
  const ev = await p.evaluate(() => { window.__game.viewfinder(true); window.__game.step(30); return window.__game.evalShot(); });
  if (['white', 'yellow', 'green'].includes(ev.frame)) ok('05', `evalShot().frame = ${ev.frame}`); else fail('05', `bad frame ${ev.frame}`);
  if (await visible(p, 'vf-frame')) ok('05', 'vf-frame visible'); else fail('05', 'vf-frame not visible');
  await noMissingKeys(p, '05');
  await shot(p, '05-viewfinder');
  await closeAll();

  p = await openPage(u('&chapter=ch1&at=sp_store_door'), '06');
  await p.evaluate(() => { window.__game.talk('xiaolin'); window.__game.step(60); });   // P3r2: past the 0.7 s dialogue ease-in
  const s6 = await state(p);
  if (await visible(p, 'dialog-box')) ok('06', 'dialog-box visible'); else fail('06', 'dialog-box not visible');
  const name = await p.locator('[data-testid=dialog-name]').first().innerText().catch(() => '');
  if (name.trim()) ok('06', `dialog-name "${name.trim()}"`); else fail('06', 'dialog-name empty');
  if (s6.dialogue?.text) ok('06', 'state().dialogue.text non-empty'); else fail('06', 'state().dialogue empty');
  await noMissingKeys(p, '06');
  await shot(p, '06-dialog');
  await closeAll();

  for (const [n, q] of [['07-dusk', '&skipTitle&phase=dusk&at=vp_temple_2011'], ['08-night', '&skipTitle&phase=night&at=sp_store_front'], ['09-dawn', '&skipTitle&phase=dawn&at=sp_tripod']]) {
    p = await openPage(u(q), n);
    await p.evaluate(() => window.__game.step(2));
    await noMissingKeys(p, n);
    await shot(p, n, { ms: await timeRender(p) });
    await closeAll();
  }
  for (const [n, q, scene] of [['10-studio', '&chapter=ch1&flags=P2_done&at=st_entry', 'studio_int'], ['11-subway', '&chapter=ch3&at=sw_gantry', 'subway_int']]) {
    p = await openPage(u(q), n);
    const s = await p.evaluate(() => window.__game.step(2));
    if (s.scene === scene) ok(n, `scene ${scene}`); else fail(n, `scene ${s.scene} ≠ ${scene}`);
    await noMissingKeys(p, n);
    await shot(p, n);
    await closeAll();
  }
  p = await openPage(u('&skipTitle&at=sp_bus_bench'), '12');
  await p.evaluate(() => window.__game.step(2));
  await p.keyboard.press('Tab');
  await p.evaluate(() => window.__game.step(10));
  if (await visible(p, 'phone-tab-album')) ok('12', 'phone-tab-album visible'); else fail('12', 'phone-tab-album not visible');
  await noMissingKeys(p, '12');
  await shot(p, '12-phone');
  await closeAll();
}

async function goldenSuite() {
  console.log(`[golden] ending ${opt.ending}`);
  const p = await openPage(`/?${Q}&skipTitle`, 'golden');
  await settle(p);
  let n = 0;
  for (const row of goldenRows(opt.ending)) {
    n++;
    try { await run(p, row.calls); await settle(p); } catch (e) { fail(`golden ${row.step}`, `calls threw: ${e.message}`); }
    const s = await state(p);
    const missing = row.flags.filter((f) => !s.flags.includes(f));
    if (missing.length) fail(`golden ${row.step}`, `missing flags ${missing.join(', ')}`); else ok(`golden ${row.step}`, row.flags.join(', '));
    await shot(p, `golden-${String(n).padStart(2, '0')}-${row.step}`);
  }
  // ARCHITECTURE §4.3: the credits return to the title (the cleared save itself is covered by core save tests)
  if (await visible(p, 'title-start')) ok('golden', `ending ${opt.ending}: back on the title`); else fail('golden', `ending ${opt.ending}: title-start not visible after the credits`);
  { const s = await state(p); if (s.cleared === true) ok('golden', `ending ${opt.ending}: cleared recorded`); else fail('golden', `ending ${opt.ending}: state().cleared is ${s.cleared}`); }
  await noMissingKeys(p, 'golden');
  await closeAll();
}

async function checkpointsSuite() {
  console.log('[checkpoints]');
  const rects = checkpointRects();
  const lineup = lineupSpots();
  for (const cp of CHECKPOINTS.filter((c) => !opt.only || opt.only.split(',').includes(c.name))) {
    const p = await openPage(cp.url, `cp-${cp.name}`);
    try { await run(p, cp.calls); } catch (e) { fail(cp.name, `calls threw: ${e.message}`); }
    if (cp.until) {
      let i = 0;
      for (; i < 40 && !(await p.locator(cp.until).first().isVisible().catch(() => false)); i++) await p.evaluate(() => window.__game.step(30));
      if (await p.locator(cp.until).first().isVisible().catch(() => false)) ok(`cp ${cp.name}`, `${cp.until} visible after ${i}× step(30)`);
      else fail(`cp ${cp.name}`, `${cp.until} never became visible (${i}× step(30))`);
      if (cp.afterUntil) await run(p, cp.afterUntil);
    } else if (cp.settle !== false) await settle(p);
    const c = makeChecks(p, { rects, lineup, name: cp.name });
    const checks = [...(await cp.checks(c)), await c.noPureBlack()];
    for (const ch of checks) {
      if (ch.ok) ok(`cp ${cp.name}`, `${ch.name}${ch.value !== undefined ? ` = ${JSON.stringify(ch.value)}` : ''}`);
      else if (ch.warn) warn(`cp ${cp.name}`, `${ch.name}: ${ch.warn}`);
      else fail(`cp ${cp.name}`, `${ch.name}${ch.value !== undefined ? ` = ${JSON.stringify(ch.value)}` : ''}`);
    }
    await noMissingKeys(p, cp.name);
    await shot(p, `cp-${cp.name}`, { ms: await timeRender(p), checks });
    await closeAll();
  }
}

/** Moves forward for 1 s from where the page stands; returns metres moved along the surface. */
async function walkTest(page) {
  let best = 0;
  for (const mv of [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }]) {   // a start spot may face a wall (sp_fire_ladder)
    const a = (await state(page)).pos;
    const b = (await page.evaluate((m) => window.__game.step(60, 1 / 60, m), mv)).pos;
    best = Math.max(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));   // 1 s of walking: chord ≈ arc
    if (best >= 1.5) break;
  }
  return best;
}

/** Every ?chapter= and ?phase= boots to a playable state (ARCHITECTURE §4.3): no card/beat/dialogue left up after
 *  settle, an objective, the gameplay input context (the player walks), the chapter's phase + clock, 0 errors. */
async function chaptersSuite() {
  console.log('[chapters]');
  for (const b of [...CHAPTER_BOOTS, ...PHASE_BOOTS]) {
    const p = await openPage(`/?${Q}${b.q}`, b.name);
    await settle(p);
    const s = await state(p);
    const where = b.name;
    if (s.busy.any) fail(where, `still busy after settle: ${JSON.stringify(s.busy)}`); else ok(where, 'not busy');
    if (b.chapter && s.chapter !== b.chapter) fail(where, `chapter ${s.chapter} ≠ ${b.chapter}`);
    if (s.phase !== b.phase) fail(where, `phase ${s.phase} ≠ ${b.phase}`); else ok(where, `phase ${s.phase}`);
    if (s.clock !== b.clock) fail(where, `clock ${s.clock} ≠ ${b.clock}`); else ok(where, `clock ${s.clock}`);
    if (!s.objective) fail(where, 'no objective'); else ok(where, `objective ${s.objective}`);
    const hud = await p.locator('[data-testid=hud-time]').first().innerText().catch(() => '');
    if (hud.trim() !== b.clock) fail(where, `HUD clock "${hud.trim()}" ≠ ${b.clock}`); else ok(where, `HUD clock ${hud.trim()}`);
    await noMissingKeys(p, where);
    await shot(p, `chapter-${where}`);
    const m = await walkTest(p);
    if (m >= 1.5) ok(where, `walked ${m.toFixed(2)} m in 1 s`); else fail(where, `walked only ${m.toFixed(2)} m in 1 s (not playable?)`);
    await closeAll();
  }
}

/** ARCHITECTURE §4.3 save round trip: play into ch2 via __game on a ?test&save=1 page (real localStorage), then
 *  reload WITHOUT ?test, press 「继续」 and compare chapter / phase / flags / photos / position; world, NPC and lens
 *  state must be consistent (phase palette, NPCs on their ch2 spots, viewfinder closed). */
async function saveSuite() {
  console.log('[save]');
  let p = await openPage(`/?${Q}&save=1&skipTitle`, 'save-play');
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await settle(p);
  for (const row of SAVE_ROWS) {
    try { await run(p, row.calls); await settle(p); } catch (e) { fail(`save ${row.step}`, `calls threw: ${e.message}`); }
    const s = await state(p);
    const missing = row.flags.filter((f) => !s.flags.includes(f));
    if (missing.length) fail(`save ${row.step}`, `missing flags ${missing.join(', ')}`); else ok(`save ${row.step}`, row.flags.join(', '));
  }
  // walk a few metres off the spot so the position check is not just "the chapter's start spot", then let it save
  await p.evaluate(() => { window.__game.step(40, 1 / 60, { x: 0.3, y: 1 }); window.__game.step(100); });
  const before = await state(p);
  const saved = await p.evaluate(() => { try { return localStorage.getItem('cmm.save.v1'); } catch { return null; } });
  if (!saved) fail('save', 'no cmm.save.v1 in localStorage after 100 ticks');
  else ok('save', `save written (${(saved.length / 1024).toFixed(0)} kB)`);
  const savedPos = saved ? JSON.parse(saved).player?.pos : null;
  await shot(p, 'save-1-before');
  await closeAll();

  p = await openPage('/?save=1&mute', 'save-continue');           // realtime, no ?test
  if (await visible(p, 'title-continue')) ok('save', '「继续」 visible'); else fail('save', 'title-continue not visible');
  await p.locator('[data-testid=title-continue]').click();
  await p.waitForTimeout(1500);
  for (let i = 0; i < 20 && (await state(p)).busy.any; i++) await p.waitForTimeout(500);
  const after = await state(p);
  const eq = (k, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok('continue', `${k} = ${JSON.stringify(a)}`) : fail('continue', `${k}: ${JSON.stringify(b)} ≠ saved ${JSON.stringify(a)}`));
  eq('chapter', before.chapter, after.chapter);
  eq('phase', before.phase, after.phase);
  eq('palette', before.palette, after.palette);
  eq('clock', before.clock, after.clock);
  eq('objective', before.objective, after.objective);
  eq('scene', before.scene, after.scene);
  const fb = [...before.flags].sort(), fa = [...after.flags].sort();
  const lost = fb.filter((f) => !fa.includes(f)), extra = fa.filter((f) => !fb.includes(f) && !f.startsWith('seen:'));
  if (lost.length || extra.length) fail('continue', `flags differ: lost ${lost.join(',') || '-'}, extra ${extra.join(',') || '-'}`); else ok('continue', `${fa.length} flags restored`);
  eq('items', [...before.items].sort(), [...after.items].sort());
  eq('photos', before.photos.map((x) => x.id), after.photos.map((x) => x.id));
  const ref = savedPos ?? before.pos;
  const d = Math.hypot(after.pos[0] - ref[0], after.pos[1] - ref[1], after.pos[2] - ref[2]);
  if (d < 0.6) ok('continue', `position within ${d.toFixed(2)} m of the saved one`); else fail('continue', `position ${d.toFixed(2)} m from the saved one`);
  if (after.lens.active || after.lens.peek) fail('continue', `lens not idle: ${JSON.stringify(after.lens)}`); else ok('continue', 'lens idle');
  const npcsB = Object.fromEntries(before.actors.map((a) => [a.id, a]));
  const vis = after.actors.filter((a) => npcsB[a.id] && (a.visible !== npcsB[a.id].visible || a.layer !== npcsB[a.id].layer));
  if (vis.length) fail('continue', `actor visibility/layer differs: ${vis.map((a) => a.id).join(',')}`); else ok('continue', 'actor visibility + layers match');
  const moved = after.actors.filter((a) => npcsB[a.id] && a.scene === npcsB[a.id].scene && a.spot !== npcsB[a.id].spot);
  if (moved.length) fail('continue', `NPC spots differ: ${moved.map((a) => `${a.id} ${npcsB[a.id].spot}→${a.spot}`).join(', ')}`); else ok('continue', `${after.actors.length} actors on the same spots`);
  const wx = await p.evaluate(() => window.__game.state().busy);
  if (wx.any) warn('continue', `still busy after continue: ${JSON.stringify(wx)}`);
  await noMissingKeys(p, 'continue');
  await shot(p, 'save-2-after');
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await closeAll();
}

/** GDD §19.2 testids. A string is an exact testid; a RegExp must match at least one testid seen anywhere. */
const REQUIRED_TESTIDS = [
  'title-start', 'dialog-box', 'dialog-name', 'dialog-next', 'choice-0', 'choice-1', 'vf-recog', 'vf-frame', 'vf-overlay-score',
  'phone-tab-album', 'phone-tab-wx', 'phone-tab-memo', /^album-item-/, 'album-setref', /^wx-msg-\d+$/, 'objective-chip',
  ...'0123456789'.split('').map((k) => `kp-${k}`), /^np-.$/u, /^mb-/, 'chapter-card', 'liaozhai-card', 'photo-card', 'credits',
];
const collectTestids = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.dataset.testid));

/** ARCHITECTURE §4.3 remainder (I-gate): §19.2 testids, Esc / pause / settings, lock prompt, ?lowfx=1, ?mute, fonts. */
async function uiSuite() {
  console.log('[ui]');
  const seen = new Set();
  const add = (ids) => ids.forEach((id) => seen.add(id));
  // 1. every UI component through E's dev states (real data), plus the viewfinder with a reference overlay
  const states = ['title', 'dialog', 'phone', 'album-detail', 'phone-wx', 'phone-memo', 'keypad', 'lighthouse', 'namepicker', 'milkbox',
    'show', 'chapter', 'liaozhai', 'photo', 'epilogue', 'credits', 'pause', 'settings', 'toasts', 'tutorial', 'note'];
  for (const st of states) {
    const p = await openPage(`/?${Q}&chapter=ch1${st === 'title' ? '' : '&skipTitle'}&dev=ui:${st}`, `ui-${st}`);
    await p.evaluate(() => window.__game.step(40));
    const ids = await collectTestids(p);
    add(ids);
    await noMissingKeys(p, `ui-${st}`);
    if (['keypad', 'namepicker', 'milkbox', 'credits', 'settings', 'pause', 'phone'].includes(st)) await shot(p, `ui-${st}`);
    await closeAll();
  }
  let p = await openPage(`/?${Q}&chapter=ch1&at=sp_tripod`, 'ui-vf');
  await settle(p);
  const vf = await p.evaluate(() => {
    const g = window.__game; g.viewfinder(true); g.setRef(g.state().photos[0].id); g.lens({ overlay: true }); g.step(5);
    return { ids: [...document.querySelectorAll('[data-testid]')].map((e) => e.dataset.testid), frameState: document.querySelector('[data-testid=vf-frame]')?.dataset.state ?? null };
  });
  add(vf.ids);
  if (['white', 'yellow', 'green'].includes(vf.frameState)) ok('ui vf', `vf-frame data-state=${vf.frameState}`); else fail('ui vf', `vf-frame data-state=${vf.frameState}`);
  await shot(p, 'ui-vf-overlay');
  await closeAll();
  // node choices (choice-0/1): the ending question (att.bus has the most choices of any node: 2)
  p = await openPage(`/?${Q}&chapter=finale&flags=group_photo_done&skipTitle`, 'ui-choices');
  await settle(p);
  const nCh = await p.evaluate(() => { const g = window.__game; g.goto('sp_bus_bench'); g.talk('attendant'); g.advance(9); g.step(60); return g.state().choices; });   // P3r2: past the dialogue ease-in
  add(await collectTestids(p));
  if (nCh >= 2 && (await visible(p, 'choice-0')) && (await visible(p, 'choice-1'))) ok('ui choices', `${nCh} choices visible`); else fail('ui choices', `${nCh} choices`);
  await shot(p, 'ui-choices');
  await closeAll();
  const all = [...seen];
  const missing = REQUIRED_TESTIDS.filter((r) => (typeof r === 'string' ? !seen.has(r) : !all.some((id) => r.test(id))));
  if (missing.length) fail('ui testids', `missing ${missing.map(String).join(', ')}`); else ok('ui testids', `all ${REQUIRED_TESTIDS.length} GDD §19.2 testids/patterns present (${seen.size} distinct seen)`);

  // 2. Esc → pause → settings → back → resume; Esc in the viewfinder closes it (no pause); pause → back to title
  p = await openPage(`/?${Q}&skipTitle&at=sp_bus_bench`, 'ui-pause');
  await settle(p);
  const tick = (n = 3) => p.evaluate((k) => window.__game.step(k), n);
  await p.keyboard.press('Escape'); await tick();
  if (await visible(p, 'pause-menu')) ok('ui pause', 'Esc opens pause-menu'); else fail('ui pause', 'Esc did not open pause-menu');
  const paused = await state(p);
  if (paused.busy.modal === 'pause') ok('ui pause', 'busy.modal = pause'); else fail('ui pause', `busy.modal = ${paused.busy.modal}`);
  const f0 = paused.pos; await p.evaluate(() => window.__game.step(30, 1 / 60, { x: 0, y: 1 }));
  const f1 = (await state(p)).pos;
  if (Math.hypot(f1[0] - f0[0], f1[1] - f0[1], f1[2] - f0[2]) < 0.05) ok('ui pause', 'the hero does not move while paused'); else fail('ui pause', 'hero moved while paused');
  await p.locator('[data-testid=pause-settings]').click(); await tick();
  if (await visible(p, 'settings')) ok('ui settings', 'settings opens from pause'); else fail('ui settings', 'settings not visible');
  await p.locator('[data-testid=set-invert-on]').click(); await tick();
  const inv = await p.locator('[data-testid=set-invert-on]').getAttribute('class');
  if (/ui-on/.test(inv ?? '')) ok('ui settings', 'invert-Y toggles'); else fail('ui settings', 'invert-Y button did not toggle');
  await p.locator('[data-testid=set-invert-off]').click();
  await shot(p, 'ui-settings-from-pause');
  await p.keyboard.press('Escape'); await tick();
  if (!(await visible(p, 'settings')) && (await visible(p, 'pause-menu'))) ok('ui settings', 'Esc closes settings back to pause'); else fail('ui settings', 'Esc from settings did not return to pause');
  await p.locator('[data-testid=pause-resume]').click(); await tick();
  const res = await state(p);
  if (!(await visible(p, 'pause-menu')) && res.busy.modal === null) ok('ui pause', 'resume closes the menu'); else fail('ui pause', `after resume modal=${res.busy.modal}`);
  const m = await walkTest(p);
  if (m >= 1.5) ok('ui pause', `walks ${m.toFixed(2)} m in 1 s after resume`); else fail('ui pause', `walks only ${m.toFixed(2)} m after resume`);
  await p.evaluate(() => { window.__game.viewfinder(true); window.__game.step(5); });
  await p.keyboard.press('Escape'); await tick(5);
  const vfClosed = await state(p);
  if (!vfClosed.lens.active && !(await visible(p, 'pause-menu'))) ok('ui esc', 'Esc closes the viewfinder without pausing'); else fail('ui esc', `viewfinder active=${vfClosed.lens.active}, pause=${await visible(p, 'pause-menu')}`);
  await p.keyboard.press('Escape'); await tick();
  await p.locator('[data-testid=pause-title]').click(); await tick();
  if (await visible(p, 'pause-confirm-yes')) { await p.locator('[data-testid=pause-confirm-yes]').click(); await tick(10); }
  if (await visible(p, 'title-start')) ok('ui pause', '「回到标题」 returns to the title'); else fail('ui pause', 'pause → title did not show title-start');
  await noMissingKeys(p, 'ui-pause');
  await closeAll();

  // 3. realtime (no ?test): the mouse-capture recovery prompt shows while desktop play is waiting for a click
  p = await openPage('/?seed=1&mute&skipTitle&at=sp_bus_bench', 'ui-lock');
  await p.waitForTimeout(1500);
  const lock = await p.evaluate(() => { const e = document.querySelector('[data-testid=lock-hint]'); return e ? { text: e.innerText.trim(), shown: e.offsetParent !== null && !e.classList.contains('ui-hidden') } : null; });
  if (lock?.shown) ok('ui lock', `lock-hint shown: 「${lock.text}」`); else fail('ui lock', `lock-hint not shown (${JSON.stringify(lock)})`);
  await shot(p, 'ui-lock-hint');
  await closeAll();

  // 4. ?lowfx=1: boots, blob-shadow path, budgets, playable
  p = await openPage(`/?${Q}&lowfx=1&skipTitle&at=sp_bus_bench`, 'ui-lowfx');
  await settle(p);
  const lm = await walkTest(p);
  if (lm >= 1.5) ok('ui lowfx', `walks ${lm.toFixed(2)} m in 1 s`); else fail('ui lowfx', `walks only ${lm.toFixed(2)} m`);
  await p.evaluate(() => { window.__game.goto('sp_bus_bench'); window.__game.step(5); });
  await shot(p, 'ui-lowfx', { ms: await timeRender(p) });
  await p.evaluate(() => { window.__game.setPhase('night'); window.__game.step(5); });
  await shot(p, 'ui-lowfx-night', { ms: await timeRender(p) });
  await closeAll();

  // 5. ?mute (realtime, no ?test, which mutes on its own): no AudioContext is ever created, even after gestures;
  //    without ?mute the same gestures create one (sanity check of the probe)
  for (const mute of [true, false]) {
    const label = mute ? 'ui-mute' : 'ui-sound';
    const page = await context.newPage();
    const errors = attachErrorCollector(page, label);
    pages.push({ page, errors });
    await page.addInitScript(() => {
      window.__acCount = 0;
      for (const k of ['AudioContext', 'webkitAudioContext']) {
        const O = window[k]; if (!O) continue;
        window[k] = class extends O { constructor(...a) { super(...a); window.__acCount++; } };
      }
    });
    await openGame(page, new URL(`/?seed=1${mute ? '&mute' : ''}`, report.base).toString());
    await page.locator('[data-testid=title-start]').click();
    await page.waitForTimeout(800);
    await page.mouse.click(640, 360); await page.keyboard.press('KeyW'); await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    const n = await page.evaluate(() => window.__acCount);
    if (mute) { if (n === 0) ok('ui mute', '?mute: no AudioContext created after gestures'); else fail('ui mute', `?mute created ${n} AudioContext(s)`); }
    else if (n > 0) ok('ui sound', `without ?mute: ${n} AudioContext created after the first gesture`); else fail('ui sound', 'no AudioContext without ?mute (probe broken?)');
    await closeAll();
  }

  // 6. fonts: which webfonts actually loaded (a networked run should list the Google fonts; else the fallback renders)
  p = await openPage(`/?${Q}`, 'ui-fonts');
  const fonts = await p.evaluate(async () => { await document.fonts.ready; return [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))]; });
  if (fonts.length) ok('ui fonts', `loaded: ${fonts.join(', ')}`); else warn('ui fonts', 'no webfont loaded (offline?): the WenQuanYi fallback renders; check on a networked run');
  await closeAll();
}

// ------------------------------------------------------------------ main
report.base = await ensureServer();
const { browser, context: ctx } = await launch();
context = ctx;
try {
  if (opt.suite === 'boot' || opt.suite === 'all') await bootSuite();
  if (opt.suite === 'golden' || opt.suite === 'all') await goldenSuite();
  if (opt.suite === 'checkpoints' || opt.suite === 'all') await checkpointsSuite();
  if (opt.suite === 'chapters' || opt.suite === 'all') await chaptersSuite();
  if (opt.suite === 'save' || opt.suite === 'all') await saveSuite();
  if (opt.suite === 'ui' || opt.suite === 'all') await uiSuite();
} catch (e) {
  fail('suite', e.stack ?? String(e));
  await closeAll();
} finally {
  await closeBrowser(browser);
}
for (const e of report.errors) console.log(`  ✗ ${e.page} ${e.kind}: ${e.text.split('\n')[0]}`);
report.passed = report.failures.length === 0 && report.errors.length === 0;
fs.mkdirSync(opt.out, { recursive: true });
fs.writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.passed ? 'PASSED' : 'FAILED'}: ${report.shots.length} shots, ${report.failures.length} failures, ${report.errors.length} console/page errors, ${report.warnings.length} warnings → ${path.join(opt.out, 'report.json')}`);
process.exit(report.passed ? 0 : 1);
