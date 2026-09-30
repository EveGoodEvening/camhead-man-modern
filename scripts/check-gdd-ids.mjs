#!/usr/bin/env node
// scripts/check-gdd-ids.mjs — owner: S. Fails if any id the GDD defines is missing from the typed id files
// (ARCHITECTURE §2.8.14): backticked ids with the prefixes below, g1–g9, zp1–zp4, every §10.2 flag, every §11 node.
import fs from 'node:fs';
import path from 'node:path';

const GDD = fs.readFileSync('docs/GDD.md', 'utf8');
const lines = GDD.split('\n');
const PREFIX = /^(sp_|vp_|pk_|st_|dk_|sw_|T_|it_|wx_|obj_|clue_|tut_|bst_)/;

// Known ids: every string literal in src/data/ids/*.ts plus the id unions in src/types.ts.
const known = new Set();
const idFiles = fs.readdirSync('src/data/ids').filter((f) => f.endsWith('.ts')).map((f) => path.join('src/data/ids', f));
for (const f of [...idFiles, 'src/types.ts']) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
  for (const m of src.matchAll(/'([^'\n]+)'/g)) known.add(m[1]);
}

function section(startRe, endRe) {
  const s = lines.findIndex((l) => startRe.test(l));
  if (s < 0) throw new Error(`GDD section not found: ${startRe}`);
  let e = lines.findIndex((l, i) => i > s && endRe.test(l));
  if (e < 0) e = lines.length;
  return lines.slice(s, e);
}
const isWildcard = (id) => /[*…]/.test(id) || id.endsWith('_');

const want = new Map();                        // id → category
const add = (id, cat) => { if (!isWildcard(id) && !want.has(id)) want.set(id, cat); };

// 1. prefixed backticked ids anywhere in the GDD, plus g1–g9 / zp1–zp4
for (const m of GDD.matchAll(/`([A-Za-z0-9_.:*…-]+)`/g)) {
  const id = m[1];
  if (PREFIX.test(id)) add(id, id.split('_')[0] + '_');
  else if (/^g[1-9]$/.test(id) || /^zp[1-4]$/.test(id)) add(id, 'lineup/zp');
}
for (let i = 1; i <= 9; i++) add(`g${i}`, 'lineup/zp');
for (let i = 1; i <= 4; i++) add(`zp${i}`, 'lineup/zp');

// 2. §10.2 flags: the FlagId column plus every `set \`x\`` in the section
const s102 = section(/^### 10\.2 /, /^### 10\.3 /);
for (const l of s102) {
  const cols = l.split('|');
  if (cols.length > 3 && /^\s*\d+\s*$/.test(cols[1])) for (const m of cols[2].matchAll(/`([A-Za-z0-9_]+)`/g)) add(m[1], 'flag §10.2');
  for (const m of l.matchAll(/set\s+`([A-Za-z0-9_]+)`/g)) add(m[1], 'flag §10.2');
}

// 3. §11 node headings (**`node.id`** …) and the §11.11 voice memos
const s11 = section(/^## 11\. /, /^## 12\. /);
for (const l of s11) {
  const m = /^\s*(?:- )?\*\*`([a-z_0-9.]+)`\*\*/.exec(l);
  if (m) add(m[1], 'node §11');
}

const missing = [...want].filter(([id]) => !known.has(id));
const byCat = {};
for (const [, c] of want) byCat[c] = (byCat[c] ?? 0) + 1;
console.log(`[check-gdd-ids] ${want.size} GDD ids checked against ${known.size} known ids`);
console.log(Object.entries(byCat).map(([c, n]) => `  ${c.padEnd(12)} ${n}`).join('\n'));
if (missing.length) {
  console.error(`[check-gdd-ids] MISSING ${missing.length}:`);
  for (const [id, c] of missing) console.error(`  ${id}  (${c})`);
  process.exit(1);
}
console.log('[check-gdd-ids] OK: every GDD id exists in src/data/ids/* or src/types.ts');
