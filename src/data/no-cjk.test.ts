// src/data/no-cjk.test.ts — owner: S. ARCHITECTURE §4.3 / §5.3: no Chinese literals outside src/data/** and tests.
// Comments are ignored (they are stripped before scanning); strings, templates and identifiers are checked.
import { describe, expect, it } from 'vitest';
import { stripComments } from '../core/srcScan';

const SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

describe('no CJK literals in code', () => {
  it('only src/data/** and *.test.ts may contain CJK', () => {
    const bad: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.startsWith('/src/data/') || path.endsWith('.test.ts')) continue;
      const lines = stripComments(text).split('\n');
      lines.forEach((l, i) => { if (CJK.test(l)) bad.push(`${path}:${i + 1}`); });
    }
    expect(bad).toEqual([]);
  });
});
