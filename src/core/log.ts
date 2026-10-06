// src/core/log.ts — owner: S. FROZEN. No `error`: a console.error is a bug and fails the smoke test (§2.8.12).
import type { Log } from '../contracts';

export function createLog(debug: boolean): Log {
  return {
    debug: (...a: unknown[]) => { if (debug) console.log('[debug]', ...a); },
    info: (...a: unknown[]) => { console.info(...a); },
    warn: (...a: unknown[]) => { console.warn(...a); },
  };
}
