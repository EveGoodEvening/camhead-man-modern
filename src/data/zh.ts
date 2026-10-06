// src/data/zh.ts — owner: S. FROZEN barrel. Section files are owned per §1.4; prefixes must not collide.
import { STR as UI } from './zh/ui';
import { STR as LENS } from './zh/lens';
import { STR as WORLD } from './zh/world';
import { STR as CHARS } from './zh/chars';
import { STR as STORY } from './zh/story';
import type { StrKey } from '../types';
export { DLG } from './zh/dlg';
export { WX_TEXT } from './zh/wx';
export { CARDS, EPILOGUE, CREDITS } from './zh/cards';

export const STR: Readonly<Record<string, string>> = { ...UI, ...LENS, ...WORLD, ...CHARS, ...STORY };
const missing = new Set<string>();
/** Resolve a key; `{name}`-style vars are substituted. Missing → '⟦key⟧' + one console.warn. */
export function t(key: StrKey, vars?: Readonly<Record<string, string | number>>): string {
  const raw = STR[key];
  if (raw === undefined) {
    if (!missing.has(key)) { missing.add(key); console.warn(`[zh] missing key ${key}`); }
    return `⟦${key}⟧`;
  }
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
export function has(key: StrKey): boolean { return STR[key] !== undefined; }
