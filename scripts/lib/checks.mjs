// scripts/lib/checks.mjs — owner: S. Checkpoint checks (GDD §19.4, ART Appendix A). Pixel statistics are computed
// in the page from __game.snapshot(); rect checks read scripts/checkpoints.json (missing rect → warning).

/** Runs `fn(pixels, w, h, arg)` in the page on the decoded snapshot; returns its result. */
async function onPixels(page, fnSrc, arg) {
  return page.evaluate(async ({ fnSrc, arg }) => {
    const url = window.__game.snapshot();
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const luma = (r, gg, b) => (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    const near = (r, gg, b, col, tol) => Math.abs(r - col[0]) <= tol && Math.abs(gg - col[1]) <= tol && Math.abs(b - col[2]) <= tol;
    return new Function('d', 'w', 'h', 'arg', 'hex', 'luma', 'near', fnSrc)(d, c.width, c.height, arg, hex, luma, near);
  }, { fnSrc, arg });
}

export function makeChecks(page, { rects, lineup, name }) {
  const rect = (key) => rects?.[name]?.[key] ?? null;
  return {
    async planetCentred() {
      const r = await onPixels(page, `
        // sky specks (3 px, ART §5.2) are not planet: a run needs >= 4 consecutive non-background samples (requests-A #1)
        const bg = hex('#65c1bc'); let x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let y = 0; y < h; y += 2) { let run = 0;
          for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4; if (near(d[i], d[i+1], d[i+2], bg, 14)) { run = 0; continue; }
            if (++run < 4) continue;
            const xs = x - 6;   // the run started 3 samples earlier
            if (xs < x0) x0 = xs; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        return x1 < 0 ? null : { cx: (x0 + x1) / 2 / w, cy: (y0 + y1) / 2 / h, hFrac: (y1 - y0) / h };`, null);
      const good = r && Math.abs(r.cx - 0.5) < 0.1 && Math.abs(r.cy - 0.5) < 0.15;
      return { name: 'planet bbox centred', ok: !!good, value: r };
    },
    async fontsLoaded() {
      const okF = await page.evaluate(() => document.fonts.check('26px "ZCOOL QingKe HuangYou"', '显影望潮里志怪开机'));
      return okF ? { name: 'title font loaded', ok: true } : { name: 'title font loaded', ok: false, warn: 'fallback font in use' };
    },
    async skyRowsOnly(colours, tol) {
      const r = await onPixels(page, `
        const cols = arg.colours.map(hex); let bad = 0, n = 0;
        for (let y = 0; y < Math.floor(h * 0.1); y++) for (let x = 0; x < w; x += 4) {
          const i = (y * w + x) * 4; n++; if (!cols.some((c) => near(d[i], d[i+1], d[i+2], c, arg.tol))) bad++; }
        return { bad, n };`, { colours, tol });
      return { name: `top 10% rows only ${colours.join('/')}`, ok: r.bad / r.n < 0.001, value: r };
    },
    async rectColours(cp, key, colours, tol) {
      const rc = rect(key);
      if (!rc) return { name: `${key} rect colours`, ok: false, warn: `no ${cp}.${key} rect in scripts/checkpoints.json` };
      const r = await onPixels(page, `
        const cols = arg.colours.map(hex); let bad = 0, n = 0; const [x0, y0, x1, y1] = arg.rc;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; n++;
          if (!cols.some((c) => near(d[i], d[i+1], d[i+2], c, arg.tol))) bad++; }
        return { bad, n };`, { colours, tol, rc });
      return { name: `${key} rect colours`, ok: r.bad / Math.max(1, r.n) < 0.001, value: r };
    },
    async rectMedianLuma(cp, key, min) {
      const rc = rect(key);
      if (!rc) return { name: `${key} median luma`, ok: false, warn: `no ${cp}.${key} rect in scripts/checkpoints.json` };
      const v = await onPixels(page, `
        const [x0, y0, x1, y1] = arg.rc; const l = [];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; l.push(luma(d[i], d[i+1], d[i+2])); }
        l.sort((a, b) => a - b); return l[Math.floor(l.length / 2)] ?? 0;`, { rc });
      return { name: `${key} median luma ≥ ${min}`, ok: v >= min, value: v };
    },
    async nonSkyLuma(min, skyCols) {
      const v = await onPixels(page, `
        const cols = arg.skyCols.map(hex); let s = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) { if (cols.some((c) => near(d[i], d[i+1], d[i+2], c, 6))) continue; s += luma(d[i], d[i+1], d[i+2]); n++; }
        return n ? s / n : 0;`, { skyCols });
      return { name: `non-sky mean luma ≥ ${min}`, ok: v >= min, value: Number(v.toFixed(3)) };
    },
    async inkRatio(min) {
      const v = await onPixels(page, `let k = 0, n = 0; for (let i = 0; i < d.length; i += 8) { n++; if (luma(d[i], d[i+1], d[i+2]) < 0.15) k++; } return k / n;`, null);
      return { name: `ink pixel ratio ≥ ${min}`, ok: v >= min, value: Number(v.toFixed(4)) };
    },
    async noPureBlack() {
      const v = await onPixels(page, `let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0 && d[i+1] === 0 && d[i+2] === 0) k++; return k;`, null);
      return { name: 'no #000000 pixels', ok: v === 0, value: v };
    },
    async centrePixel(testid, colour, tol) {
      const box = await page.locator(`[data-testid=${testid}]`).first().boundingBox().catch(() => null);
      if (!box) return { name: `${testid} centre pixel`, ok: false, value: 'not visible' };
      const buf = await page.screenshot({ clip: { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), width: 1, height: 1 } });
      const px = await page.evaluate(async (b64) => {
        const img = new Image(); await new Promise((r) => { img.onload = r; img.src = `data:image/png;base64,${b64}`; });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      }, buf.toString('base64'));
      const want = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
      return { name: `${testid} centre pixel ${colour}`, ok: px.every((v, i) => Math.abs(v - want[i]) <= tol), value: px };
    },
    async bgColor(testid, colour) {
      const bg = await page.locator(`[data-testid=${testid}]`).first().evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => null);
      const want = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
      const got = (bg ?? '').match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
      return { name: `${testid} background ${colour}`, ok: got.length === 3 && got.every((v, i) => Math.abs(v - want[i]) <= 2), value: bg };
    },
    async text(testid, expected) {
      const t = (await page.locator(`[data-testid=${testid}]`).first().innerText().catch(() => '')).trim();
      return { name: `${testid} text`, ok: t === expected, value: t };
    },
    async evalShot(want) {
      const r = await page.evaluate(() => window.__game.evalShot());
      const good = Object.entries(want).every(([k, v]) => r[k] === v);
      return { name: `evalShot ${JSON.stringify(want)}`, ok: good, value: { frame: r.frame, targetId: r.targetId, failed: r.failed } };
    },
    async stateIs(key, v) {
      const s = await page.evaluate(() => window.__game.state());
      return { name: `state().${key} === ${v}`, ok: s[key] === v, value: s[key] };
    },
    async timeRenderBelow(ms) {
      const v = await page.evaluate(() => window.__game.timeRender(8));
      return { name: `timeRender(8) < ${ms}`, ok: v < ms, value: Number(v.toFixed(1)) };
    },
    async hasPhoto(pred, label) {
      const s = await page.evaluate(() => window.__game.state());
      return { name: `album has ${label}`, ok: s.photos.some(pred), value: s.photos.map((p) => p.id) };
    },
    async lineup() {
      const want = { xiaolin: 'g1', zhimei: 'g3', granny_wang: 'g4', tudi: 'g6', attendant: 'g7', old_chen: 'g8', xiaoliu: 'g9' };
      const s = await page.evaluate(() => window.__game.state());
      const bad = [];
      for (const [id, g] of Object.entries(want)) {
        const a = s.actors.find((x) => x.id === id), p = lineup[g];
        const d = a && p ? Math.hypot(a.pos[0] - p[0], a.pos[1] - p[1], a.pos[2] - p[2]) : Infinity;
        if (!(d <= 1)) bad.push(`${id}@${g}:${Number.isFinite(d) ? d.toFixed(2) : 'missing'}`);
      }
      return { name: 'dawn lineup within 1 m of g*', ok: bad.length === 0, value: bad };
    },
  };
}
