// ARCHITECTURE §2.12 / §6 risk 7: no Math.random, performance.now or Date.now anywhere in src/ (outside tests),
// except performance.now inside a `timeRender` body under src/render/**.
import { describe, expect, it } from 'vitest';
import { stripComments, timeRenderBodies } from './srcScan';

const SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const BANNED = /\b(Math\.random|performance\.now|Date\.now)\b/g;

describe('determinism source grep', () => {
  it('finds no banned clock/randomness calls', () => {
    const bad: string[] = [];
    expect(Object.keys(SOURCES).length).toBeGreaterThan(30);
    for (const [path, text] of Object.entries(SOURCES)) {
      const r = path.slice(1);
      if (r.endsWith('.test.ts')) continue;
      const code = stripComments(text);
      const allowed = r.startsWith('src/render/') ? timeRenderBodies(code) : [];
      let m: RegExpExecArray | null;
      BANNED.lastIndex = 0;
      while ((m = BANNED.exec(code))) {
        const at = m.index;
        const ok = m[1] === 'performance.now' && allowed.some(([a, b]) => at > a && at < b);
        if (!ok) bad.push(`${r}:${code.slice(0, at).split('\n').length} ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('the scanner itself catches violations and honours the timeRender exception', () => {
    const code = stripComments('const a = Math.random(); // Date.now()\nfunction timeRender(n) { return performance.now(); }\nconst b = performance.now();');
    const hits = [...code.matchAll(BANNED)].map((m) => m[1]);
    expect(hits).toEqual(['Math.random', 'performance.now', 'performance.now']);
    const bodies = timeRenderBodies(code);
    const inside = [...code.matchAll(BANNED)].filter((m) => bodies.some(([a, b]) => m.index! > a && m.index! < b));
    expect(inside.length).toBe(1);
  });
});
