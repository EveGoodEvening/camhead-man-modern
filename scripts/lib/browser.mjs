// scripts/lib/browser.mjs — owner: S. Headless Chromium (SwiftShader WebGL) behind a machine-wide 2-slot semaphore
// (ARCHITECTURE §4.4). Slots are directories /tmp/cmm-browser-slot-{0,1}; stale after 10 min or when the owner died.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const VIEWPORT = { width: 1280, height: 720 };
const SLOTS = 2;
const STALE_MS = 10 * 60 * 1000;
const slotDir = (i) => `/tmp/cmm-browser-slot-${i}`;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function isStale(dir) {
  try {
    const st = fs.statSync(dir);
    if (Date.now() - st.mtimeMs > STALE_MS) return true;
    const owner = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
    return typeof owner.pid === 'number' && !alive(owner.pid);
  } catch { return false; }        // owner.json not yet written: treat as live (just created)
}

let held = null;
const ownerPid = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')).pid; } catch { return null; } };
function release() {
  if (held === null) return;
  const dir = slotDir(held);
  // only remove the slot if it is still ours (it may have been reclaimed as stale and re-taken by another process)
  try { if (ownerPid(dir) === process.pid) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  held = null;
}
/** Atomically take a stale slot out of the way: rename it (only one waiter can win), re-check, then delete. */
function reclaim(dir) {
  const grave = `${dir}.stale-${process.pid}-${Date.now()}`;
  try { fs.renameSync(dir, grave); } catch { return; }            // another waiter already moved it
  if (!isStale(grave)) {                                           // it was re-taken between our check and the rename
    try { fs.renameSync(grave, dir); return; } catch { /* slot re-created meanwhile: drop the moved copy */ }
  }
  try { fs.rmSync(grave, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.on('exit', release);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { release(); process.exit(130); });

/** Acquire one of the 2 machine-wide slots (waits, printing a message every 30 s). */
export async function acquireSlot(label = path.basename(process.argv[1] ?? 'script')) {
  const t0 = Date.now();
  let lastMsg = 0;
  for (;;) {
    for (let i = 0; i < SLOTS; i++) {
      const dir = slotDir(i);
      for (let attempt = 0; attempt < 2; attempt++) {              // second attempt right after reclaiming a stale slot
        try {
          fs.mkdirSync(dir);
          fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }));
          held = i;
          return i;
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          if (!isStale(dir)) break;
          reclaim(dir);
        }
      }
    }
    if (Date.now() - lastMsg > 30_000) {
      lastMsg = Date.now();
      console.error(`[browser] waiting for a browser slot (${Math.round((Date.now() - t0) / 1000)} s)…`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
/** Keep the slot fresh during long runs. */
export function touchSlot() {
  if (held === null) return;
  const now = new Date();
  try { fs.utimesSync(slotDir(held), now, now); } catch { /* ignore */ }
}
export { release as releaseSlot };

/** Acquire a slot, then launch Chromium with the SwiftShader flags. Close with `closeBrowser`. */
export async function launch() {
  await acquireSlot();
  const browser = await chromium.launch({ args: GL_ARGS, headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const timer = setInterval(touchSlot, 60_000);
  timer.unref();
  return { browser, context };
}
export async function closeBrowser(browser) {
  try { await browser.close(); } finally { release(); }
}

/** Collects pageerror, console errors (except Google Fonts), and failed same-origin requests. */
export function attachErrorCollector(page, label = 'page') {
  const errors = [];
  const origin = () => { try { return new URL(page.url()).origin; } catch { return ''; } };
  page.on('pageerror', (e) => errors.push({ page: label, kind: 'pageerror', text: String(e?.stack ?? e) }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    errors.push({ page: label, kind: 'console', text: m.text() });
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (origin() && u.startsWith(origin())) errors.push({ page: label, kind: 'requestfailed', text: `${u} ${r.failure()?.errorText ?? ''}` });
  });
  page.on('response', (r) => {
    const u = r.url();
    if (origin() && u.startsWith(origin()) && r.status() >= 400) errors.push({ page: label, kind: 'http', text: `${r.status()} ${u}` });
  });
  return errors;
}

/** Navigate and wait for window.__game.ready. */
export async function openGame(page, url, waitSeconds = 90) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: waitSeconds * 1000 });
}
