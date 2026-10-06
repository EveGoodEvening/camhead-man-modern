// src/core/srcScan.ts — owner: S. FROZEN. Pure helpers for source-grep tests (determinism, no-CJK).
// Tests load sources with Vite's import.meta.glob('?raw'), so no node typings are needed.

// Source map keyed by '/src/...' path (vitest only; import.meta.glob is resolved by Vite).
export type SourceMap = Readonly<Record<string, string>>;

/** Replace comments with spaces (keeps offsets/lines); string and template literals are preserved. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i++]; } out += src[i++] ?? ''; }
      out += src[i++] ?? ''; continue;
    }
    out += c; i++;
  }
  return out;
}

/** [start, end) ranges of every `timeRender` function/method body (brace-matched). */
export function timeRenderBodies(src: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /timeRender\s*(?:\(|:|=)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, j = open;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    out.push([open, j + 1]);
  }
  return out;
}
