#!/usr/bin/env node
// scripts/shot.mjs — owner: S. One screenshot through the shared browser semaphore (ARCHITECTURE §4.4).
// node scripts/shot.mjs --base http://127.0.0.1:517X --url '/?test&skipTitle&at=sp_bus_bench' \
//   --do "viewfinder(true)" --do "aim('T_chai')" --steps 3 --out test-results/x.png [--wait-ready 90]
// Real (injected) input, run in order with the --do calls (I-play, Phase 2 play-feel checks):
//   --act key:KeyE              keydown + keyup (the edge is latched by the next tick)
//   --act hold:KeyW:90          keydown, __game.step(90) (the key is held for 90 ticks), keyup
//   --act down:KeyW / up:KeyW   raw keydown / keyup
//   --act mouse:2:down|up|click mouse button (0 left, 2 right) at the canvas centre
//   --act drag:2:dx:dy          move the mouse by (dx, dy) px with button 2 held (look while unlocked)
//   --act wheel:-100            wheel over the canvas (−: zoom in)
//   --act click:<testid>        Playwright click on [data-testid=<testid>]
//   --act type:<text>           keyboard.type into the focused element
//   --act step:<n>              __game.step(n)
//   --act settle                skip cards/beats, advance fixed dialogue (like smoke's settle)
//   --act shot:<file.png>       an extra screenshot at this point
//   --act probe                 returns a compact state (+ visible HUD texts) into calls[]
import fs from 'node:fs';
import path from 'node:path';
import { attachErrorCollector, closeBrowser, launch, openGame } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const opts = { base: '', url: '/?test', do: [], steps: 1, out: 'test-results/shot.png', waitReady: 90 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = argv[i + 1];
  if (a === '--base') { opts.base = v; i++; }
  else if (a === '--url') { opts.url = v; i++; }
  else if (a === '--do') { opts.do.push({ js: v }); i++; }
  else if (a === '--act') { opts.do.push({ act: v }); i++; }
  else if (a === '--steps') { opts.steps = Number(v); i++; }
  else if (a === '--out') { opts.out = v; i++; }
  else if (a === '--wait-ready') { opts.waitReady = Number(v); i++; }
  else { console.error(`unknown arg ${a}`); process.exit(2); }
}
if (!opts.base) { console.error('--base is required (e.g. http://127.0.0.1:5170)'); process.exit(2); }

const step = (page, n) => page.evaluate((k) => { window.__game.step(k); }, n);
async function centre(page) {
  const b = await page.locator('#game').boundingBox();
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 640, y: 360 };
}
/** One --act command (real input through Playwright; see the header). */
async function act(page, cmd) {
  const [op, ...args] = cmd.split(':');
  const c = await centre(page);
  switch (op) {
    case 'key': await page.keyboard.down(args[0]); await page.keyboard.up(args[0]); return;
    case 'down': await page.keyboard.down(args[0]); return;
    case 'up': await page.keyboard.up(args[0]); return;
    case 'hold': await page.keyboard.down(args[0]); await step(page, Number(args[1] ?? 30)); await page.keyboard.up(args[0]); return;
    case 'mouse': {
      const button = args[0] === '2' ? 'right' : args[0] === '1' ? 'middle' : 'left';
      await page.mouse.move(c.x, c.y);
      if (args[1] === 'down') await page.mouse.down({ button });
      else if (args[1] === 'up') await page.mouse.up({ button });
      else await page.mouse.click(c.x, c.y, { button });
      return;
    }
    case 'drag': {
      const button = args[0] === '2' ? 'right' : 'left';
      await page.mouse.move(c.x, c.y); await page.mouse.down({ button });
      await page.mouse.move(c.x + Number(args[1]), c.y + Number(args[2]), { steps: 4 });
      await step(page, 1);
      await page.mouse.up({ button });
      return;
    }
    case 'wheel': await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, Number(args[0])); return;
    case 'click': await page.locator(`[data-testid=${args.join(':')}]`).first().click(); return;
    case 'type': await page.keyboard.type(args.join(':')); return;
    case 'step': await step(page, Number(args[0] ?? 1)); return;
    case 'settle':
      return page.evaluate(async () => {
        const g = window.__game;
        const y = () => new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 300; i++) {
          await y(); g.step(5); await y();
          const s = g.state();
          if (s.busy.card || s.busy.beat) g.skip();
          else if (s.busy.dialogue && s.choices === 0) g.advance();
          const s2 = g.state();
          if (!s2.busy.any || s2.choices > 0) return i;
        }
        return 300;
      });
    case 'shot': {
      const f = args.join(':');
      await page.evaluate(() => window.__game.step(0));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      await page.screenshot({ path: f });
      return f;
    }
    case 'probe':
      return page.evaluate(() => {
        const s = window.__game.state();
        const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05;
        const texts = {};
        for (const el of document.querySelectorAll('[data-testid]')) {
          if (!vis(el)) continue;
          const t = el.innerText?.trim();
          if (t && t.length < 160) texts[el.dataset.testid] = t;
        }
        return {
          flags: s.flags.length, objective: s.objective, prompt: s.prompt, scene: s.scene, pos: s.pos.map((v) => +v.toFixed(2)),
          yaw: +s.yaw.toFixed(1), lens: { active: s.lens.active, zoom: s.lens.zoom, night: s.lens.night, peek: s.lens.peek, frame: s.lens.frame },
          busy: s.busy, dialogue: s.dialogue, clock: s.clock, phase: s.phase, texts,
        };
      });
    default: throw new Error(`unknown --act ${cmd}`);
  }
}

const { browser, context } = await launch();
let code = 0;
try {
  const page = await context.newPage();
  const errors = attachErrorCollector(page, opts.url);
  await openGame(page, new URL(opts.url, opts.base).toString(), opts.waitReady);
  const calls = [];
  for (const d of opts.do) {
    if (d.act) { calls.push({ act: d.act, result: (await act(page, d.act)) ?? null }); continue; }
    const r = await page.evaluate((src) => {
      const g = window.__game;
      // eslint-disable-next-line no-new-func
      return new Function('g', `with (g) { return (${src}); }`)(g);
    }, d.js);
    calls.push({ call: d.js, result: r ?? null });
  }
  const st = await page.evaluate((n) => window.__game.step(n), opts.steps);
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  await page.screenshot({ path: opts.out });
  const out = {
    out: opts.out, url: opts.url, calls, frame: st.frame, scene: st.scene, pos: st.pos, yaw: st.yaw,
    stats: { calls: st.calls, triangles: st.triangles, programs: st.programs }, errors,
  };
  console.log(JSON.stringify(out, null, 2));
  if (errors.length) code = 1;
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await closeBrowser(browser);
}
process.exit(code);
