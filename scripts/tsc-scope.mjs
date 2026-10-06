#!/usr/bin/env node
// scripts/tsc-scope.mjs — owner: S. Runs `tsc --noEmit -p .` and prints only diagnostics under the given paths.
// Exit code reflects only those diagnostics (ARCHITECTURE §4.4). Paths may be relative or absolute. Diagnostics
// without a file (tsconfig / option errors) and a tsc crash always count: they break everyone's typecheck.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rel = (p) => path.relative(process.cwd(), path.resolve(p)).split(path.sep).join('/');
const scopes = process.argv.slice(2).map((p) => rel(p).replace(/\/$/, ''));
if (scopes.length === 0) { console.error('usage: node scripts/tsc-scope.mjs <path> [<path>…]'); process.exit(2); }
const tsc = path.join('node_modules', 'typescript', 'bin', 'tsc');
const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', '.', '--pretty', 'false'], { encoding: 'utf8' });
const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
// A diagnostic starts with "file(line,col): error TSxxxx" (or "error TSxxxx" without a file); continuation lines are indented.
const blocks = [];
for (const line of text.split('\n')) {
  if (/^\S.*\(\d+,\d+\): (error|warning) TS\d+/.test(line) || /^error TS\d+/.test(line)) blocks.push([line]);
  else if (blocks.length && line.trim()) blocks[blocks.length - 1].push(line);
}
const inScope = (file) => scopes.some((s) => s === '' || file === s || file.startsWith(`${s}/`));
const mine = blocks.filter((b) => {
  const m = /^(.*?)\(\d+,\d+\): /.exec(b[0]);
  // file-less and tsconfig diagnostics are global: always reported
  return m ? /(^|\/)tsconfig[^/]*\.json$/.test(m[1]) || inScope(rel(m[1])) : true;
});
for (const b of mine) console.log(b.join('\n'));
if (r.status !== 0 && blocks.length === 0) {       // tsc failed without parseable diagnostics (crash, missing deps)
  console.error(text.trim() || String(r.error ?? `tsc exited with ${r.status}`));
  console.error('[tsc-scope] tsc failed without diagnostics');
  process.exit(1);
}
const others = blocks.length - mine.length;
console.error(`[tsc-scope] ${mine.length} diagnostic(s) in scope${others ? `, ${others} elsewhere (ignored)` : ''}`);
process.exit(mine.length ? 1 : 0);
