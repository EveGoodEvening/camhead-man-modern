// src/chars/rig.ts — owner C. Bone hierarchies for procedural animation (ART §7.1: Object3D rig, rigid skin weights).
import { Bone, Skeleton, SkinnedMesh, Sphere, Vector3, type BufferGeometry, type Material } from 'three';

export interface BoneDef { name: string; parent: string | null; at: readonly [number, number, number] }

/** Humanoid proportions (metres, bind pose; +Y up, +Z forward, +X = the character's left). */
export interface BodySpec {
  hipY: number; legX: number; thigh: number; shin: number;
  chestY: number; shoulderY: number; shoulderX: number; upperArm: number; foreArm: number;
  neckY: number; headY: number;
}

export const HUMAN_BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
  'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR',
] as const;
export type HumanBone = (typeof HUMAN_BONES)[number];

export function humanBones(s: BodySpec): BoneDef[] {
  const sh = s.shoulderY, ax = s.shoulderX;
  return [
    { name: 'root', parent: null, at: [0, 0, 0] },
    { name: 'hips', parent: 'root', at: [0, s.hipY, 0] },
    { name: 'spine', parent: 'hips', at: [0, s.hipY + 0.08, 0] },
    { name: 'chest', parent: 'spine', at: [0, s.chestY, 0] },
    { name: 'neck', parent: 'chest', at: [0, s.neckY, 0] },
    { name: 'head', parent: 'neck', at: [0, s.headY, 0] },
    { name: 'armL', parent: 'chest', at: [ax, sh, 0] },
    { name: 'foreL', parent: 'armL', at: [ax, sh - s.upperArm, 0] },
    { name: 'handL', parent: 'foreL', at: [ax, sh - s.upperArm - s.foreArm, 0] },
    { name: 'armR', parent: 'chest', at: [-ax, sh, 0] },
    { name: 'foreR', parent: 'armR', at: [-ax, sh - s.upperArm, 0] },
    { name: 'handR', parent: 'foreR', at: [-ax, sh - s.upperArm - s.foreArm, 0] },
    { name: 'legL', parent: 'hips', at: [s.legX, s.hipY, 0] },
    { name: 'shinL', parent: 'legL', at: [s.legX, s.hipY - s.thigh, 0] },
    { name: 'footL', parent: 'shinL', at: [s.legX, s.hipY - s.thigh - s.shin, 0] },
    { name: 'legR', parent: 'hips', at: [-s.legX, s.hipY, 0] },
    { name: 'shinR', parent: 'legR', at: [-s.legX, s.hipY - s.thigh, 0] },
    { name: 'footR', parent: 'shinR', at: [-s.legX, s.hipY - s.thigh - s.shin, 0] },
  ];
}

/** Index lookup for a bone list (used by builders to assign skin indices). */
export function boneIndex(defs: readonly BoneDef[]): (name: string) => number {
  const m = new Map(defs.map((d, i) => [d.name, i]));
  return (name) => {
    const i = m.get(name);
    if (i === undefined) throw new Error(`unknown bone ${name}`);
    return i;
  };
}

export interface Rig {
  readonly mesh: SkinnedMesh;
  readonly bones: readonly Bone[];
  readonly b: Readonly<Record<string, Bone>>;
  /** Bind-pose local positions (for resetting offsets each frame). */
  readonly rest: Readonly<Record<string, Vector3>>;
}

/** Build a SkinnedMesh + skeleton from bone defs. The mesh must still be at the identity transform. */
export function makeRig(defs: readonly BoneDef[], geo: BufferGeometry, mat: Material, bound: { center: readonly [number, number, number]; radius: number }): Rig {
  const bones: Bone[] = [];
  const b: Record<string, Bone> = {};
  const rest: Record<string, Vector3> = {};
  const abs = new Map<string, readonly [number, number, number]>();
  for (const d of defs) {
    const bone = new Bone();
    bone.name = d.name;
    const pa = d.parent ? abs.get(d.parent) : undefined;
    bone.position.set(d.at[0] - (pa ? pa[0] : 0), d.at[1] - (pa ? pa[1] : 0), d.at[2] - (pa ? pa[2] : 0));
    rest[d.name] = bone.position.clone();
    abs.set(d.name, d.at);
    if (d.parent) b[d.parent].add(bone);
    bones.push(bone);
    b[d.name] = bone;
  }
  const mesh = new SkinnedMesh(geo, mat);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  mesh.boundingSphere = new Sphere(new Vector3(...bound.center), bound.radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, bones, b, rest };
}

/** A one-bone rigid SkinnedMesh (keeps every character mesh on the same shader program). */
export function rigidMesh(geo: BufferGeometry, mat: Material, bound: { center: readonly [number, number, number]; radius: number }): Rig {
  return makeRig([{ name: 'root', parent: null, at: [0, 0, 0] }], geo, mat, bound);
}
