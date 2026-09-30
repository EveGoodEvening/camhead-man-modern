// src/lens/devTargets.ts — owner D. ?dev=lens:targets (ARCHITECTURE §3.D self-test, §6 risk 8/10): walks every
// PhotoTarget (goto its viewpoint → set up lens/flags/phase → aim → evalNow), captures a thumbnail per row and prints a
// pass table (DOM panel + console + window.__lensTargets). Dev tool: it sets the rows' `requires` flags and phases.
import { Vector3 } from 'three';
import type { Core, LensApi } from '../contracts';
import type { ChartPos, FlagId, PeekId, Phase, PhotoTarget, ShotResult, SpotId, TargetId, Zoom } from '../types';
import { TARGETS } from '../data/photoTargets';
import { SURFACES, flatToChart, worldToFlat } from '../core/planet';
import type { LensCtx } from './ctx';

type From = { spot: SpotId } | { peek: PeekId } | { front: number } | { at: ChartPos };
interface Plan { from: From; phase?: Phase; flags?: readonly FlagId[]; zoom?: Zoom; sit?: boolean }

/** Where each row is judged from (GDD §19.3 viewpoints where the golden path defines one). */
export const PLANS: Readonly<Partial<Record<TargetId, Plan>>> = {
  T_rephoto_2006: { from: { spot: 'vp_group_photo' }, phase: 'day' },
  T_locker17: { from: { spot: 'sp_locker' }, zoom: 3 },
  T_studio_qr: { from: { front: 1.5 } },
  T_bus_qr: { from: { front: 1.5 } },
  T_bike_qr: { from: { front: 1.3 } },
  T_granny_face: { from: { spot: 'sp_store_front' }, phase: 'day' },
  T_portrait_wall: { from: { spot: 'st_wall' } },
  T_height_marks: { from: { spot: 'st_doorframe' } },
  T_temple_qr: { from: { spot: 'sp_donation_box' }, phase: 'dusk' },
  T_rephoto_2011: { from: { spot: 'vp_temple_2011' }, phase: 'dusk', zoom: 3 },
  T_tudi: { from: { spot: 'sp_donation_box' }, phase: 'dusk' },
  T_mirror_self: { from: { spot: 'sp_mirror_stand' }, phase: 'dusk' },
  T_pigeons: { from: { peek: 'pk_coop' }, phase: 'dusk' },
  T_meiqiu: { from: { spot: 'sp_roof' }, phase: 'dusk' },
  T_plaque: { from: { front: 3.2 }, phase: 'dusk', zoom: 3 },
  T_light_trail: { from: { spot: 'sp_bench' }, phase: 'night', sit: true },
  T_frame3_lamp: { from: { peek: 'lh_door' }, phase: 'night', zoom: 10 },
  T_frame4_pit: { from: { peek: 'pk_psd' }, phase: 'night' },
  T_chai: { from: { spot: 'vp_subway_top' }, phase: 'night' },
  T_zhimei: { from: { spot: 'sp_paper_shop' }, phase: 'dusk' },
  T_zhimei_sea: { from: { spot: 'sp_seawall_zhimei' }, phase: 'night', flags: ['zhimei_at_seawall', 'trail_1987'] },   // P6 precedes P9 (GDD §19.3)
  T_bst_second_shadow: { from: { at: { r: 34, lon: 26, h: 0 } } },
  T_bst_manhole_eye: { from: { spot: 'sp_manhole' }, phase: 'dusk' },
  T_bst_queue_shadows: { from: { at: { r: 40.5, lon: 5, h: 0 } }, phase: 'night' },
  T_bst_lion_turns: { from: { at: { r: 3.0, lon: 141, h: 4 } }, phase: 'night' },
  T_bst_tv_still_on: { from: { spot: 'sp_roof' }, phase: 'dusk' },
  T_bst_fish_watching: { from: { spot: 'sp_market_tank' }, phase: 'dusk', zoom: 10 },
};
const DOOR_PLAN: Plan = { from: { spot: 'vp_estate_doors' }, phase: 'dusk', zoom: 3 };

export interface WalkRow {
  id: TargetId; from: string; frame: ShotResult['frame']; target: TargetId | null; failed: string | null;
  hint: string | null; label: string; confidence: number | null; pass: boolean; thumb: string;
}

export function planFor(tg: PhotoTarget): Plan {
  return PLANS[tg.id] ?? (tg.id.startsWith('T_door_') ? DOOR_PLAN : { from: { front: 2 } });
}

export function runTargetWalk(core: Core, lens: LensApi, lc: LensCtx): void {
  const w = window as unknown as { __game?: { ready?: boolean }; __lensTargets?: WalkRow[] };
  const start = () => {
    if (!w.__game?.ready) { setTimeout(start, 100); return; }
    const rows = walk(core, lens, lc);
    w.__lensTargets = rows;
    const pass = rows.filter((r) => r.pass).length;
    core.log.info(`[lens] targets: ${pass}/${rows.length} green`, JSON.stringify(rows.map(({ thumb: _t, ...r }) => r)));
    render(rows);
  };
  setTimeout(start, 0);
}

function walk(core: Core, lens: LensApi, lc: LensCtx): WalkRow[] {
  const rows: WalkRow[] = [];
  const tmp = new Vector3();
  for (const tg of TARGETS) {
    if (tg.kind === 'landmark') continue;
    const plan = planFor(tg);
    let fromText = '';
    try {
      if (lens.state.peek) void lens.exitPeek();
      if (lens.state.active) lens.setViewfinder(false);
      const phase = plan.phase ?? tg.phases?.[0];
      if (phase && core.store.state.phase !== phase) core.store.setPhase(phase, undefined, true);
      for (const f of [...(tg.requires ?? []), ...(plan.flags ?? [])]) core.store.set(f);
      const f = plan.from;
      if ('spot' in f) { fromText = f.spot; core.player.goto(f.spot, { fade: false }); }
      else if ('peek' in f) { fromText = f.peek; void lens.enterPeek(f.peek); }
      else if ('at' in f) { fromText = `(${f.at.r}, ${f.at.lon})`; core.player.teleport({ scene: tg.scene ?? 'planet', at: f.at }); }
      else {
        // stand `front` m in front of the anchor along its normal (QRs, plaque)
        const a = lc.anchors.targetPos(tg, tmp);
        const nrm = 'world' in tg.anchor ? lc.anchors.world(tg.anchor.world)?.normal : null;
        if (a && nrm) {
          const s = SURFACES[tg.scene ?? 'planet'];
          const at = a.clone().addScaledVector(nrm, f.front);
          const fl = worldToFlat(s, at);
          const pos = (tg.scene ?? 'planet') === 'planet' ? flatToChart({ x: fl.x, z: fl.z, h: 0 }) : { x: fl.x, y: 0, z: fl.z };
          core.player.teleport({ scene: tg.scene ?? 'planet', at: pos, yawDeg: 0 });
          fromText = `front ${f.front} m`;
        } else fromText = 'here';
      }
      if (plan.sit) core.player.setPose('sit');
      if (!lens.state.active) lens.setViewfinder(true);
      const zs = tg.zoom ?? [1, 3, 10];
      lens.setZoom(plan.zoom ?? (zs.includes(1) ? 1 : zs[0]));
      lens.setLens({
        night: tg.layer === 'ghost' || !!tg.needsNight,
        flash: tg.flash === 'required' || !!tg.needsLight,
        overlay: tg.kind === 'rephoto',
      });
      if (tg.refPhoto) { void lens.renderPreset(tg.refPhoto); core.store.setRefPhoto(tg.refPhoto); }
      lens.aim(tg.id);
      const r = lens.evalNow();
      let thumb = '';
      try {
        const c = core.services.render.capture({ camera: lc.pose.cam, scene: lc.pose.pose.scene, ghost: lens.state.night, width: 192, height: 108 });
        thumb = c.toDataURL('image/jpeg', 0.7);
      } catch { thumb = ''; }
      rows.push({
        id: tg.id, from: fromText, frame: r.frame, target: r.targetId, failed: r.failed, hint: r.hint, label: r.label,
        confidence: r.confidence, pass: r.frame === 'green' && r.targetId === tg.id, thumb,
      });
    } catch (e) {
      rows.push({ id: tg.id, from: fromText, frame: 'white', target: null, failed: 'error', hint: String(e), label: '', confidence: null, pass: false, thumb: '' });
    }
  }
  if (lens.state.peek) void lens.exitPeek();
  if (lens.state.active) lens.setViewfinder(false);
  core.player.setPose('stand');
  return rows;
}

function render(rows: readonly WalkRow[]): void {
  const panel = document.createElement('div');
  panel.dataset.testid = 'lens-targets';
  panel.style.cssText = 'position:fixed;inset:12px;overflow:auto;z-index:50;background:#f8f8f6;color:#1f282d;border:3px solid #2f3a3f;'
    + 'box-shadow:4px 5px 0 #405157;font:13px "WenQuanYi Zen Hei",sans-serif;padding:10px;pointer-events:auto';
  const pass = rows.filter((r) => r.pass).length;
  const h = document.createElement('div');
  h.style.cssText = 'font:700 16px Silkscreen,monospace;margin-bottom:6px';
  h.textContent = `lens:targets  ${pass}/${rows.length} green`;
  panel.appendChild(h);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px';
  for (const r of rows) {
    const cell = document.createElement('div');
    const col = r.pass ? '#62ac91' : r.frame === 'yellow' ? '#f0d055' : '#d9d3bf';
    cell.style.cssText = `border:2px solid #2f3a3f;background:${col};padding:4px`;
    if (r.thumb) { const img = document.createElement('img'); img.src = r.thumb; img.style.cssText = 'width:100%;display:block;border:1px solid #2f3a3f'; cell.appendChild(img); }
    const tx = document.createElement('div');
    tx.style.cssText = 'font-size:11px;line-height:1.3;margin-top:3px';
    tx.textContent = `${r.pass ? 'PASS' : 'FAIL'} ${r.id} @ ${r.from} · ${r.frame}${r.failed ? ` · ${r.failed}` : ''} · ${r.label}${r.confidence !== null ? ` ${r.confidence}%` : ''}${r.hint ? ` · ${r.hint}` : ''}`;
    cell.appendChild(tx);
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
  document.body.appendChild(panel);
}
