// src/world/index.ts — owner B. 望潮里 on the tiny planet (ARCHITECTURE §3.B): builds the town, interiors, colliders,
// walk surfaces, zones, signal, anchors, occluders and pickables; drives phase world state, gates, chai and the mirror.
import { Vector3, type Material, type Object3D, type Texture } from 'three';
import type { AnchorInfo, Core, Handle, ModuleFactory, WorldApi } from '../contracts';
import type { GateId, SceneId, SpotDef, SpotId } from '../types';
import { GATES, LOCATIONS, SPOTS } from '../data/locations';
import { SURFACES, posToWorld, worldToFlat } from '../core/planet';
import { installOcclusionCull } from './occlCull';
import { FONT, ensureFont } from '../core/fonts';
import { STR } from '../data/zh';
import { makeToonMaterial } from '../render/index';
import { Atlas } from './atlas';
import { Batch, type BuiltChunk, type LayerKind } from './kit/batch';
import { Tex } from './kit/tex';
import { buildBuilding, type BuildCtx } from './kit/building';
import { buildGround, buildPlanetBody } from './build/ground';
import { buildStreets } from './build/streets';
import { buildPlaces } from './build/places';
import { buildLandmarks } from './build/landmarks';
import { buildInteriors } from './interiors/build';
import { planetColliders } from './colliders';
import { planetSurfaces } from './heights';
import { signalFor, type Bars } from './signal';
import { plan } from './layout';
import { createRng } from '../core/rng';
import { WinLights } from './lights';
import { Mutables } from './kit/mutables';
import { gateAnims, marksController } from './dynamics';
import { createState, type WorldState } from './phaseState';
import { resolveAnchors, type AnchorTable } from './anchorsRuntime';
import { buildOccluders } from './occluders';
import { createChai, type ChaiHandle } from './chai';
import { constructP8, type P8Result } from './p8';
import { measureGlyphDot } from './glyphs';
import { computeVpTemple } from './vp';
import { worldDevHook } from './dev';
import { buildPast } from './past';
import { subwayColliders, studioColliders } from './interiors/plans';
import { createDarkroom } from './darkroom';

export interface WorldInternals {
  core: Core; chunks: BuiltChunk[]; lights: WinLights; gateHandles: Map<GateId, Handle[]>;
  p8: P8Result; anchors: AnchorTable; state: WorldState | null; chai: ChaiHandle | null; tris: number;
  mirror: { setTexture(t: Texture | null): void } | null;
}

export const createWorld: ModuleFactory<WorldApi> = (core) => {
  const spotMap = new Map<string, SpotDef>(SPOTS.map((s) => [s.id, s]));
  let bars: Bars | -1 = -1;
  let internals: WorldInternals | null = null;
  const occ: Record<SceneId, Object3D[]> = { planet: [], studio_int: [], subway_int: [] };
  const picks: Record<SceneId, Object3D[]> = { planet: [], studio_int: [], subway_int: [] };

  const api: WorldApi = {
    async init() {
      // 1. fonts for signage (§5.2 rule 4): exact texts in the display / brush fonts
      const allSign = Object.entries(STR).filter(([k]) => k.startsWith('sign.')).map(([, v]) => v).join('');
      await Promise.all([ensureFont(`48px ${FONT.display}`, allSign, 2500), ensureFont(`48px ${FONT.brush}`, allSign, 2500)]);
      // 2. P8 construction from the actual glyphs, vp_temple_2011 by its rule (GDD §5.4 †)
      const dot = measureGlyphDot();
      const p8 = constructP8(dot ?? undefined);
      if (typeof window !== 'undefined') window.__world = { ...(window.__world ?? {}), p8: { dot, netDot: p8.netDot, lampFoot: p8.lampFoot, dotSize: p8.dotSize } };
      applyConstructedSpots(spotMap, p8);
      // 3. build the town
      const atlas = new Atlas();
      const T = new Tex(atlas);
      const B = new Batch('planet');
      const ctx: BuildCtx = { B, T, rng: createRng(0xb0_1d) };
      buildPlanetBody(B);
      buildGround(ctx);
      for (const b of plan().bldgs) buildBuilding(b, ctx);
      const lamps = buildStreets(ctx);
      const placeOut = buildPlaces(ctx, core, p8);
      const lmOut = buildLandmarks(ctx, core);
      const interiorB = buildInteriors(core, T);
      buildPast(core);
      atlas.finish();
      core.log.info(`[world] ${atlas.usage()}`);
      if (typeof window !== 'undefined') {
        window.__world = {
          ...(window.__world ?? {}), atlas: atlas.usage(),
          /** debug: show/hide world chunks by layer (perf bisection) */
          layers: (names: string, on: boolean) => { for (const ch of chunks) if (names.split(',').includes(ch.layer)) ch.mesh.layers.set(on ? 0 : 31); },
          keys: (names: string, on: boolean) => { for (const ch of chunks) if (names.split(',').includes(`${ch.layer}:${ch.key}`)) ch.mesh.layers.set(on ? 0 : 31); },
          shadows: (on: boolean) => { for (const ch of chunks) if (ch.layer === 'solid' || ch.layer === 'thin' || ch.layer === 'foliage' || ch.layer === 'interact') ch.mesh.castShadow = on; },
          filt: (mode: string) => {
            const tx = tex as unknown as { minFilter: number; magFilter: number; generateMipmaps: boolean; needsUpdate: boolean };
            tx.minFilter = mode === 'nearest' ? 1003 : mode === 'linear' ? 1006 : mode === 'nmn' ? 1004 : 1008;
            tx.magFilter = mode === 'nearest' ? 1003 : 1006;
            tx.generateMipmaps = mode === 'nmn' || mode === 'trilinear';
            tx.needsUpdate = true;
          },
          order: (layer: string, n: number) => { for (const ch of chunks) if (ch.layer === layer) ch.mesh.renderOrder = n; },
          nomap: () => { for (const k of ['solid', 'win', 'foliage'] as const) { (mats[k] as unknown as { map: unknown }).map = null; mats[k].needsUpdate = true; } },
          list: () => chunks.map((ch) => `${ch.layer}:${ch.key}:${(ch.mesh.geometry.getAttribute('position').count / 3) | 0}`).join(' '),
        };
      }
      const tex = atlas.texture;
      const mats = makeMaterials(tex);
      const chunks = B.build(core, mats);
      for (const ib of interiorB) chunks.push(...ib.build(core, mats, { detail: () => false }));
      createDarkroom(core);                          // P3r2 look L1: safelight, tray print, drying-line print
      const lights = new WinLights(chunks);
      const mut = new Mutables(chunks);
      // 4. physics: colliders (gate-controlled ones kept), walk surfaces, location zones
      const gateHandles = new Map<GateId, Handle[]>();
      for (const c of planetColliders()) {
        const h = core.physics.registerCollider(c);
        if (c.gate) { const l = gateHandles.get(c.gate) ?? []; l.push(h); gateHandles.set(c.gate, l); }
      }
      // the P8 lamp is placed by construction (not in layout props): its pole needs its own collider
      core.physics.registerCollider({ scene: 'planet', shape: { kind: 'circle', at: { r: p8.lampFoot.r, lon: p8.lampFoot.lon, h: 0 }, radius: 0.14 }, tag: 'lamp_p8' });
      for (const c of studioColliders()) core.physics.registerCollider(c);
      const sw = subwayColliders();
      for (const c of sw.walls) core.physics.registerCollider(c);
      gateHandles.set('gate_gantry', sw.gantry.map((c) => core.physics.registerCollider(c)));
      for (const s of planetSurfaces()) core.physics.registerWalkSurface(s);
      for (const l of LOCATIONS) core.physics.registerZone({ id: `loc:${l.id}`, scene: 'planet', at: l.center, radius: l.radius });
      // 5. queries: occluders (coarse proxies, not in the scene graph), pickables (label-carrying chunks)
      const o = buildOccluders(p8);
      for (const k of Object.keys(o) as SceneId[]) occ[k] = o[k];
      for (const ch of chunks) {
        const sc = ch.mesh.parent?.name as SceneId | undefined;
        const scene: SceneId = sc === 'studio_int' || sc === 'subway_int' ? sc : 'planet';
        if (ch.layer !== 'cable' && ch.key !== 'planet') picks[scene].push(ch.mesh);
      }
      const anchors = resolveAnchors(core, p8, {
        objects: { ...placeOut.anchorObjects, ...lmOut.anchorObjects }, canvases: placeOut.canvases, faceHdg: placeOut.faceHdg,
      });
      internals = {
        core, chunks, lights, gateHandles, p8, anchors, state: null, chai: null, tris: B.tris, mirror: placeOut.mirror,
      };
      // 6. the chai actor (GDD §6.1) and phase world state (GDD §5.7)
      internals.chai = createChai(core, p8);
      internals.state = createState(core, internals, {
        lamps: [...lamps, ...placeOut.lamps],
        dyn: {
          ...placeOut.dyn, objects: { ...placeOut.dyn.objects, ...lmOut.objects }, beacons: lmOut.beacons,
          tags: mut, marks: marksController(mut, T), gateAnim: gateAnims(core, mut),
        },
      });
      // street-level occlusion (back-fill rows, sectors behind the hill); after core:cull in the late phase
      const occl = installOcclusionCull(core, chunks);
      if (typeof window !== 'undefined') {
        window.__world = { ...(window.__world ?? {}), occl: (on: boolean, far?: boolean, limit?: number) => occl.setEnabled(on, far, limit), occlHidden: () => occl.hiddenCount };
      }
      // 7. signal (GDD §3.10)
      core.loop.addSystem('world:signal', 'world', () => {
        const f = core.player.flat();
        const b = signalFor(core.player.scene, f.x, f.z, f.h);
        if (b !== bars) { bars = b; core.bus.emit('signalChanged', { bars: b }); }
      });
      core.log.info(`[world] built ${internals.tris} tris in ${chunks.length} chunks, ${lights.count()} lights`);
    },
    spot(id) {
      const s = spotMap.get(id);
      if (!s) { core.log.warn(`[world] unknown spot ${id}`); return SPOTS[0]; }
      return s;
    },
    spotPos(id, out = new Vector3()) {
      const s = api.spot(id);
      return posToWorld(s.scene, s.pos, out);
    },
    anchor(id): AnchorInfo {
      if (internals) { const a = internals.anchors.get(id); if (a) return a; }
      const s = api.spot('sp_bus_bench');
      return { scene: s.scene, pos: spotWorld(s) };
    },
    signalAt(scene, pos) { const f = worldToFlat(SURFACES[scene], pos); return signalFor(scene, f.x, f.z, f.h); },
    occluders: (scene) => occ[scene],
    pickables: (scene) => picks[scene],
    gateOpen(g) { const d = GATES.find((x) => x.id === g); return d ? core.rules.evalCond(d.openWhen) : false; },
    setMirrorTexture(tex) { internals?.mirror?.setTexture(tex); },
    devHook(arg) { if (internals) worldDevHook(internals, arg); },
  };
  return api;

  function makeMaterials(tex: Texture): Record<LayerKind, Material> {
    // map-less program for the big untextured areas; the atlas only where something is printed (signs, panes)
    const solid = makeToonMaterial({ vertexColors: true, lineWeight: 1 });
    // P3r2 (camera): see-through variant only where the follow camera looks through things (ONE extra program)
    const thin = makeToonMaterial({ vertexColors: true, lineWeight: 1, seeThru: true });
    return {
      ground: solid, solid, thin, detail: thin, far: solid,
      sign: makeToonMaterial({ vertexColors: true, map: tex, lineWeight: 1, alphaTest: 0.5 }),
      win: makeToonMaterial({ vertexColors: true, map: tex, unlit: true, lineWeight: 0.7 }),
      foliage: makeToonMaterial({ vertexColors: true, flecks: true, lineWeight: 1 }),
      interact: makeToonMaterial({ vertexColors: true, map: tex, lineWeight: 1.4 }),
      cable: makeToonMaterial({ vertexColors: true, lineWeight: 0 }),
      net: makeToonMaterial({ vertexColors: true, map: tex, lineWeight: 0, alphaTest: 0.5 }),   // back faces: kit/batch backFaces
    };
  }
};

function spotWorld(s: SpotDef): Vector3 { return posToWorld(s.scene, s.pos); }

/** † spots by construction (GDD §9 P8) and vp_temple_2011 (GDD §5.4). */
function applyConstructedSpots(map: Map<string, SpotDef>, p8: P8Result): void {
  const upd = (id: SpotId, f: (s: SpotDef) => SpotDef) => { const s = map.get(id); if (s) map.set(id, f(s)); };
  upd('sp_net_dot', (s) => ({ ...s, pos: p8.netDot, stand: { r: p8.netDot.r - 2.5, lon: p8.netDot.lon, h: 0 } }));
  upd('sp_dot_ground', (s) => ({ ...s, pos: p8.groundDot }));
  upd('sp_lamp_p8', (s) => ({ ...s, pos: p8.lampFoot, stand: { r: p8.lampFoot.r - 1.8, lon: p8.lampFoot.lon, h: 0 } }));
  const vp = computeVpTemple();
  upd('vp_temple_2011', (s) => ({ ...s, pos: vp.pos, yaw: vp.yaw, pitch: vp.pitch }));
}
