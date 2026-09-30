// src/world/signal.ts — owner B. GDD §3.10 signal bars from SIGNAL_ZONES (highest prio wins; default 1 outdoors, 0 inside).
import type { SignalZone } from '../types';
import type { SceneId } from '../types';
import { SIGNAL_ZONES } from '../data/locations';
import { DEG, PLANET_R } from '../core/planet';
import { inLon } from './geo';

export type Bars = 0 | 1 | 2 | 3 | 4;

/** Great-circle distance (m) between two chart points on the planet. */
export function chartArc(r1: number, lon1: number, r2: number, lon2: number): number {
  const t1 = r1 / PLANET_R, t2 = r2 / PLANET_R;
  const a = [Math.sin(t1) * Math.sin(lon1 * DEG), Math.cos(t1), Math.sin(t1) * Math.cos(lon1 * DEG)];
  const b = [Math.sin(t2) * Math.sin(lon2 * DEG), Math.cos(t2), Math.sin(t2) * Math.cos(lon2 * DEG)];
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d) * PLANET_R;
}

export function zoneContains(zn: SignalZone, r: number, lon: number, h: number): boolean {
  if (zn.minH !== undefined && h < zn.minH) return false;
  if (zn.circle) return chartArc(zn.circle.at.r, zn.circle.at.lon, r, lon) <= zn.circle.radius;
  if (zn.ring) return r >= zn.ring.rMin && r <= zn.ring.rMax && inLon(lon, zn.ring.lonFrom, zn.ring.lonTo);
  return false;
}

/** Pure GDD §3.10 lookup on flat chart coords (x = r·sin lon, z = r·cos lon). */
export function signalFor(scene: SceneId, x: number, z: number, h: number, zones: readonly SignalZone[] = SIGNAL_ZONES): Bars {
  if (scene !== 'planet') return 0;
  const r = Math.hypot(x, z), lon = ((Math.atan2(x, z) / DEG) + 360) % 360;
  let best: { bars: Bars; prio: number } | null = null;
  for (const zn of zones) {
    if (zn.scene !== scene || !zoneContains(zn, r, lon, h)) continue;
    if (!best || zn.prio > best.prio) best = { bars: zn.bars, prio: zn.prio };
  }
  return best ? best.bars : 1;
}
