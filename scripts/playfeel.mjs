#!/usr/bin/env node
// scripts/playfeel.mjs — owner: I-play (Phase 2). Plays the prologue + P1 + P2 with REAL injected input (keyboard,
// mouse buttons, drags, wheel; no __game gameplay shortcuts), following only what the game shows a first-time player:
// the tutorial bubbles, the objective chip and 土地's smoke (DebugState.smoke). __game is used only to advance sim time
// (step) and to READ state for the autopilot and the report.
//   node scripts/playfeel.mjs --base http://127.0.0.1:5178 [--out dir] [--until P1|P2]
import fs from 'node:fs';
import path from 'node:path';
import { attachErrorCollector, closeBrowser, launch, openGame, touchSlot } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = { base: '', out: 'test-results/playfeel', until: 'P2' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base') opt.base = argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--until') opt.until = argv[++i];
  else { console.error(`unknown arg ${a}`); process.exit(2); }
}
if (!opt.base) { console.error('--base is required'); process.exit(2); }
fs.mkdirSync(opt.out, { recursive: true });

const R = 80;
/** Chart (r, lon°, h) → world (planet centred at the origin, town on +Y). */
function chartToWorld(r, lonDeg, h = 0) {
  const lon = (lonDeg * Math.PI) / 180, th = r / R, k = R + h;
  if (r < 1e-6) return [0, k, 0];
  const x = r * Math.sin(lon), z = r * Math.cos(lon), sn = Math.sin(th) / r;
  return [sn * x * k, Math.cos(th) * k, sn * z * k];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Heading (deg, clockwise from local north = toward the pole) of `target` seen from `pos` on the planet. */
function bearing(pos, target) {
  const up = norm(pos);
  const n0 = sub([0, 1, 0], up.map((u) => u * up[1]));
  const north = len(n0) < 1e-6 ? [0, 0, -1] : norm(n0);
  const east = cross(north, up);
  const d = sub(target, pos);
  return (Math.atan2(dot(d, east), dot(d, north)) * 180) / Math.PI;
}
/** Surface distance ignoring height. */
const flatDist = (a, b) => { const ua = norm(a), ub = norm(b); return Math.acos(Math.max(-1, Math.min(1, dot(ua, ub)))) * R; };

const log = [];
const note = (kind, msg, extra) => { log.push({ kind, msg, ...(extra ?? {}) }); console.log(`  ${kind === 'fail' ? '✗' : kind === 'warn' ? '!' : kind === 'ok' ? '✓' : '·'} ${msg}`); };

const { browser, context } = await launch();
let page, errors;
let shots = 0;
try {
  page = await context.newPage();
  errors = attachErrorCollector(page, 'playfeel');
  await openGame(page, new URL('/?test&seed=1&mute', opt.base).toString());
  const st = () => page.evaluate(() => window.__game.state());
  const step = (n) => page.evaluate((k) => { window.__game.step(k); }, n);
  const yieldSteps = async (n, chunk = 10) => { for (let i = 0; i < n; i += chunk) { await step(Math.min(chunk, n - i)); } };
  const key = async (code, frames = 2) => { await page.keyboard.down(code); await page.keyboard.up(code); await step(frames); };
  const centre = { x: 640, y: 360 };
  const texts = () => page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[data-testid]')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || el.classList.contains('ui-hidden')) continue;
      const t = el.innerText?.trim();
      if (t && t.length < 120) out[el.dataset.testid] = t.replace(/\s+/g, ' ');
    }
    return out;
  });
  const shot = async (name) => {
    await step(0);
    const f = path.join(opt.out, `${String(++shots).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    const t = await texts();
    note('shot', `${f}  hud: ${JSON.stringify({ objective: t['objective-chip'], tutorial: t.tutorial, prompt: t.prompt, toast: t.toast, recog: t['vf-recog'], score: t['vf-overlay-score'] })}`);
    touchSlot();
    return t;
  };
  /** Look by dragging with the middle button (no action bound: pure look while the pointer is unlocked). */
  const drag = async (dx, dy = 0, button = 'middle') => {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button });
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 200));
    for (let i = 1; i <= n; i++) await page.mouse.move(centre.x + (dx * i) / n, centre.y + (dy * i) / n);
    await step(1);
    await page.mouse.up({ button });
    await step(1);
  };
  /** Like a player: while a card / dialogue / beat is up, wait a little and press Space (skip-free). */
  const playThrough = async (maxPress = 60) => {
    for (let i = 0; i < maxPress; i++) {
      const s = await st();
      if (!s.busy.any || s.busy.modal) return i;
      if (s.choices > 0) { await key('Digit1', 5); continue; }
      await yieldSteps(20);
      const s2 = await st();
      if (s2.busy.card || s2.busy.dialogue) await key('Space', 5);
    }
    return maxPress;
  };

  // ---- calibrate: degrees of heading per dragged px
  // (done after the wake, in gameplay)

  // ---------------------------------------------------------------- 1. title → S_wake
  console.log('[prologue]');
  await shot('title');
  await page.locator('[data-testid=title-start]').click();
  await step(5);
  const tutSeen = new Set();
  for (let i = 0; i < 80; i++) {
    const s = await st();
    const t = await texts();
    if (t.tutorial) tutSeen.add(t.tutorial);
    if (!s.busy.any && s.flags.includes('wx_tudi_added')) break;
    if (i === 12) await shot('wake-mid');
    await yieldSteps(20);
    const s2 = await st();
    if (s2.busy.card || s2.busy.dialogue) await key('Space', 5);
  }
  await yieldSteps(60);
  let t = await shot('wake-end');
  if (t.tutorial) tutSeen.add(t.tutorial);
  let s = await st();
  note(s.flags.includes('wx_tudi_added') && !s.busy.any ? 'ok' : 'fail', `S_wake played by pressing Space only; objective ${s.objective}, smoke → ${s.smoke?.spot}`);
  if (!t['objective-chip']) note('fail', 'no objective chip after S_wake');
  if (!t.tutorial) note('warn', 'no tutorial bubble after S_wake');

  // calibrate the look drag
  const y0 = (await st()).yaw;
  await drag(200, 0);
  const y1 = (await st()).yaw;
  const degPerPx = wrap(y1 - y0) / 200;
  note(Math.abs(degPerPx) > 0.01 ? 'ok' : 'fail', `middle-drag looks: ${degPerPx.toFixed(4)}°/px`);
  await drag(-200, 0);

  // ---------------------------------------------------------------- 2. Tab → album → set as reference
  await key('Tab', 10);
  t = await shot('phone');
  const albumOpen = await page.locator('[data-testid=phone-tab-album]').first().isVisible().catch(() => false);
  note(albumOpen ? 'ok' : 'fail', 'Tab opens the phone');
  if (t.tutorial) tutSeen.add(t.tutorial);
  const item = page.locator('[data-testid^=album-item-]').first();
  if (await item.isVisible().catch(() => false)) { await item.click(); await step(5); } else note('fail', 'no album item to select');
  t = await shot('album-selected');
  if (t.tutorial) tutSeen.add(t.tutorial);
  const setref = page.locator('[data-testid=album-setref]').first();
  if (await setref.isVisible().catch(() => false)) { await setref.click(); await step(5); note('ok', 'album-setref clicked'); } else note('fail', 'album-setref not visible');
  await key('Tab', 10);
  s = await st();
  if (s.busy.modal) { await key('Escape', 10); s = await st(); }
  note(!s.busy.modal ? 'ok' : 'fail', `phone closed (modal ${s.busy.modal})`);
  t = await shot('after-setref');
  if (t.tutorial) tutSeen.add(t.tutorial);

  // ---------------------------------------------------------------- walking autopilot (W + middle-drag steering)
  const walkTo = async (label, getTarget, tol = 1.0, maxIter = 90) => {
    let stuckN = 0, lastPos = null, iters = 0;
    for (; iters < maxIter; iters++) {
      const s0 = await st();
      if (s0.busy.any) { await playThrough(10); continue; }
      const tgt = await getTarget(s0);
      if (!tgt) return { ok: false, why: 'no target', iters };
      const d = flatDist(s0.pos, tgt);
      if (d < tol) return { ok: true, iters, stuck: stuckN };
      const turn = wrap(bearing(s0.pos, tgt) - s0.yaw);
      if (Math.abs(turn) > 4) await drag(turn / degPerPx, 0);
      const frames = Math.max(6, Math.min(40, Math.round((d / 3.2) * 60)));
      await page.keyboard.down('KeyW');
      await yieldSteps(frames);
      await page.keyboard.up('KeyW');
      const s1 = await st();
      if (lastPos && flatDist(lastPos, s1.pos) < 0.25 && flatDist(s1.pos, tgt) > tol) {
        stuckN++;
        // side-step like a player sliding along the obstacle
        await page.keyboard.down(stuckN % 2 ? 'KeyD' : 'KeyA'); await yieldSteps(30); await page.keyboard.up(stuckN % 2 ? 'KeyD' : 'KeyA');
      }
      lastPos = s1.pos;
    }
    return { ok: false, why: 'max iterations', iters, stuck: stuckN };
  };
  const followSmoke = (untilFlag) => async (s0) => (s0.flags.includes(untilFlag) ? null : s0.smoke?.pos ?? null);
  const via = async (label, chartPts, tol = 1.0) => {
    for (const [r, lon, h] of chartPts) {
      const w = chartToWorld(r, lon, h ?? 0);
      const res = await walkTo(label, async () => w, tol);
      if (!res.ok) { note('fail', `${label}: stuck on the way to (${r}, ${lon}) after ${res.iters} steps (${res.why})`, { pos: (await st()).chart }); return false; }
    }
    return true;
  };

  // ---------------------------------------------------------------- 3. P1: walk to the smoke (vp_group_photo)
  console.log('[P1]');
  s = await st();
  const p1spot = s.smoke;
  note(p1spot?.spot === 'vp_group_photo' ? 'ok' : 'fail', `smoke leads to ${p1spot?.spot}`);
  const w1 = await walkTo('P1', async (s0) => s0.smoke?.pos ?? null, 0.8);
  s = await st();
  note(w1.ok ? 'ok' : 'fail', `walked to the smoke (vp_group_photo): ${w1.iters} steering steps, ${w1.stuck ?? 0} stuck, at ${JSON.stringify(s.chart)}`);
  await shot('at-bridge-foot');
  // face the old photo's direction (yaw 0 = toward the bridge) like a player comparing with the reference
  await drag(wrap(0 - s.yaw) / degPerPx, 0);
  // hold the right mouse button: the viewfinder
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down({ button: 'right' });
  await step(12);
  s = await st();
  note(s.lens.active ? 'ok' : 'fail', `hold RMB opens the viewfinder (active ${s.lens.active})`);
  t = await shot('viewfinder');
  if (t.tutorial) tutSeen.add(t.tutorial);
  await key('KeyR', 6);
  s = await st();
  note(s.lens.overlay ? 'ok' : 'fail', `R toggles the reference overlay (overlay ${s.lens.overlay})`);
  t = await shot('overlay');
  const scoreOf = async () => { const tt = await texts(); const m = /(\d+)\s*%/.exec(tt['vf-overlay-score'] ?? ''); return m ? Number(m[1]) : null; };
  let best = await scoreOf();
  // nudge the aim with the right button still held (drag = look in the viewfinder), keep the best
  for (const [dx, dy] of [[40, 0], [-80, 0], [40, -40], [0, 80], [0, -40]]) {
    if (best !== null && best >= 90) break;
    await page.mouse.move(centre.x + dx, centre.y + dy);
    await step(2);
    const sc = await scoreOf();
    if (sc !== null && (best === null || sc > best)) best = sc; else { await page.mouse.move(centre.x, centre.y); await step(2); }
  }
  note(best !== null ? 'ok' : 'warn', `重合度 read from the HUD: ${best}%`);
  const ev = await page.evaluate(() => window.__game.evalShot());
  note('info', `evalShot before the shutter: ${ev.frame} ${ev.targetId} ${ev.label} ${ev.failed ?? ''} ${ev.hint ?? ''}`);
  await key('Space', 10);
  await page.mouse.up({ button: 'right' });
  await step(5);
  s = await st();
  note(s.flags.includes('P1_done') ? 'ok' : 'fail', `Space takes the photo → P1_done ${s.flags.includes('P1_done')}`);
  await shot('p1-shot');
  const pressed = await playThrough(40);
  s = await st();
  note('info', `after P1 (${pressed} presses): chapter ${s.chapter}, objective ${s.objective}, smoke → ${s.smoke?.spot}`);
  t = await shot('ch1-start');
  note('info', `tutorial bubbles seen: ${[...tutSeen].join(' | ')}`);

  if (opt.until !== 'P1') {
    // ---------------------------------------------------------------- 4. P2: studio door → locker → bridge → locker
    console.log('[P2]');
    s = await st();
    const w2 = await walkTo('studio', followSmoke('studio_locked_seen'), 1.2, 120);
    s = await st();
    note(s.flags.includes('studio_locked_seen') || w2.ok ? 'ok' : 'fail', `followed the smoke to the studio: ${w2.iters} steps, ${w2.stuck ?? 0} stuck, objective ${s.objective}, smoke → ${s.smoke?.spot} (${w2.why ?? 'arrived'})`);
    await shot('studio-door');
    if (s.prompt) { await key('KeyE', 10); await playThrough(20); }
    s = await st();
    note('info', `objective ${s.objective}, smoke → ${s.smoke?.spot}, flags studio_locked_seen ${s.flags.includes('studio_locked_seen')}`);
    const w3 = await walkTo('locker', followSmoke('locker_seen'), 1.2, 140);
    s = await st();
    note(s.flags.includes('locker_seen') ? 'ok' : 'fail', `walked to the locker: locker_seen ${s.flags.includes('locker_seen')} (${w3.iters} steps, ${w3.stuck ?? 0} stuck, ${w3.why ?? 'arrived'})`);
    await playThrough(20);
    await shot('locker-sms');
    // solution A: up the south stair to the middle of the deck for full signal
    s = await st();
    note('info', `smoke → ${s.smoke?.spot} (expect sp_bridge_deck)`);
    const up = await via('bridge', [[27.2, 53], [27, 44], [27, 31], [29.5, 30, 5.5], [34, 30, 5.5]], 1.0);
    for (let i = 0; i < 4; i++) await yieldSteps(20);
    s = await st();
    note(s.flags.includes('sms_full') ? 'ok' : (up ? 'fail' : 'warn'), `on the deck: sms_full ${s.flags.includes('sms_full')} at ${JSON.stringify(s.chart)}`);
    await playThrough(20);
    await shot('bridge-deck');
    const down = await via('back', [[29.5, 30, 5.5], [27, 31], [27, 44], [27.2, 53]], 1.0);
    const w4 = await walkTo('locker2', async (s0) => s0.smoke?.pos ?? null, 1.0, 60);
    s = await st();
    note(down && (w4.ok || s.prompt) ? 'ok' : 'warn', `back at the locker (${w4.iters} steps, ${w4.stuck ?? 0} stuck) at ${JSON.stringify(s.chart)}, smoke ${s.smoke?.spot}, prompt ${JSON.stringify(s.prompt)}`);
    // face the locker (look around until the E prompt shows) and press E
    // (picking uses the BODY facing, so like a player: turn the view, then nudge W so he turns toward it)
    for (let k = 0; k < 8 && !(await st()).prompt; k++) {
      await drag(45 / degPerPx, 0);
      await page.keyboard.down('KeyW'); await step(4); await page.keyboard.up('KeyW'); await step(2);
    }
    s = await st();
    note(s.prompt ? 'ok' : 'fail', `E prompt at the locker: ${JSON.stringify(s.prompt)} (yaw ${s.yaw.toFixed(0)})`);
    await shot('locker-prompt');
    await key('KeyE', 10);
    await playThrough(10);                    // it.locker line, then the keypad
    s = await st();
    t = await shot('locker-ui');
    note(s.busy.modal ? 'ok' : 'fail', `E opens the locker keypad (modal ${s.busy.modal})`);
    // type the compartment and the code on the keypad with real clicks (kp-<key>), like a mouse player
    const clickKey = async (k) => { const b = page.locator(`[data-testid=kp-${k}]`).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await step(3); return true; } return false; };
    const typeStage = async (digits) => {
      let okAll = true;
      for (const ch of digits) okAll = (await clickKey(ch)) && okAll;
      if (!(await clickKey('ok')) && !(await clickKey('enter'))) { await key('Enter', 3); }
      await yieldSteps(30);
      return okAll;
    };
    const k1 = await typeStage('17');
    await shot('locker-17');
    const k2 = await typeStage('0815');
    await playThrough(30);
    s = await st();
    note(s.flags.includes('P2_done') ? 'ok' : 'fail', `keypad 17 / 0815 (${k1 && k2 ? 'clicked' : 'some keys missing'}) → P2_done ${s.flags.includes('P2_done')}, objective ${s.objective}`);
    await shot('p2-done');
  }

  // ---------------------------------------------------------------- 5. H hint, J memo, Esc pause
  console.log('[keys]');
  // F toggles the viewfinder; wheel / 1 2 3 zoom; left click = shutter; Esc backs out one layer
  await key('KeyF', 8);
  s = await st();
  note(s.lens.active ? 'ok' : 'fail', `F opens the viewfinder (active ${s.lens.active})`);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -120);
  await step(6);
  const z1 = (await st()).lens.zoom;
  await key('Digit3', 6);
  const z2 = (await st()).lens.zoom;
  await key('Digit1', 6);
  const z3 = (await st()).lens.zoom;
  note(z1 === 3 && z2 === 10 && z3 === 1 ? 'ok' : 'fail', `wheel up → ${z1}×, 3 → ${z2}×, 1 → ${z3}×`);
  const nPhotos = (await st()).photos.length;
  await page.mouse.click(centre.x, centre.y, { button: 'left' });
  await yieldSteps(30);
  await playThrough(10);
  const nAfter = (await st()).photos.length;
  note(nAfter === nPhotos + 1 ? 'ok' : 'fail', `left click takes a photo (${nPhotos} → ${nAfter})`);
  await shot('vf-click');
  await key('Escape', 8);
  s = await st();
  note(!s.lens.active && s.busy.modal !== 'pause' ? 'ok' : 'fail', `Esc closes the viewfinder without pausing (active ${s.lens.active}, modal ${s.busy.modal})`);
  // J opens the memo tab
  await key('KeyJ', 8);
  const memo = await page.locator('[data-testid=phone-tab-memo]').first().isVisible().catch(() => false);
  note(memo ? 'ok' : 'fail', 'J opens the phone on the memo tab');
  await shot('memo-J');
  await key('Escape', 8);
  const toastBefore = (await texts()).toast ?? null;
  await key('KeyH', 10);
  let hintText = null;
  for (let i = 0; i < 20 && !hintText; i++) {
    await yieldSteps(20);
    const tt = await texts();
    if (tt.toast && tt.toast !== toastBefore) hintText = tt.toast;
  }
  t = await shot('hint-H');
  note(hintText ? 'ok' : 'warn', `H → 土地 answers within ${hintText ? '≤ 7' : '> 7'} s: ${JSON.stringify(hintText)}`);
  await playThrough(10);
  await key('Escape', 10);
  s = await st();
  note(s.busy.modal === 'pause' ? 'ok' : 'warn', `Esc opens pause (modal ${s.busy.modal})`);
  await shot('pause');
  await key('Escape', 10);
} catch (e) {
  note('fail', `script error: ${e.stack ?? e}`);
} finally {
  await closeBrowser(browser);
}
for (const e of errors ?? []) note('fail', `${e.kind}: ${e.text.split('\n')[0]}`);
const fails = log.filter((l) => l.kind === 'fail').length;
fs.writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify({ log, errors }, null, 2));
console.log(`\n${fails ? 'FAILED' : 'PASSED'}: ${fails} failures, ${log.filter((l) => l.kind === 'warn').length} warnings → ${path.join(opt.out, 'report.json')}`);
process.exit(fails ? 1 : 0);
