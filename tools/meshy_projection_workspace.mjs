#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'projection_workspace', 'onehand_ready');

const SOURCE_BONES = ['ShoulderCenter', 'Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R', 'Arm.L', 'Forearm.L', 'Hand.L'];
const TARGET_BONES = ['Spine02', 'RightArm', 'RightForeArm', 'RightHand', 'WeaponGrip', 'LeftArm', 'LeftForeArm', 'LeftHand'];
const BONE_MAP = {
  ShoulderCenter: 'Spine02',
  'Arm.R': 'RightArm',
  'Forearm.R': 'RightForeArm',
  'Hand.R': 'RightHand',
  'Weapon.R': 'WeaponGrip',
  'Arm.L': 'LeftArm',
  'Forearm.L': 'LeftForeArm',
  'Hand.L': 'LeftHand',
};
const CHAINS = [
  { side: 'right', source: ['Arm.R', 'Forearm.R', 'Hand.R'], target: ['RightArm', 'RightForeArm', 'RightHand'] },
  { side: 'left', source: ['Arm.L', 'Forearm.L', 'Hand.L'], target: ['LeftArm', 'LeftForeArm', 'LeftHand'] },
];
const ALL_LAYERS = ['projected-pins', 'fk', 'ik', 'sword', 'basis', 'roll'];

function parseArgs(argv) {
  const args = { clip: 'OneHandReady', out: defaultOut, layers: new Set(ALL_LAYERS), maxRenderFrames: 7 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--clip') args.clip = argv[++i] || args.clip;
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--enable') args.layers = new Set(String(argv[++i] || '').split(',').filter(Boolean));
    else if (arg.startsWith('--enable=')) args.layers = new Set(arg.slice('--enable='.length).split(',').filter(Boolean));
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++i] || args.maxRenderFrames);
    else if (arg.startsWith('--max-render-frames=')) args.maxRenderFrames = Number(arg.slice('--max-render-frames='.length));
  }
  return args;
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS() {
      const listeners = new Map();
      return {
        style: {},
        width: 1,
        height: 1,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        set src(value) { this._src = value; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); },
        get src() { return this._src || ''; },
      };
    },
  };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}

function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js'))) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(threeDir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), threeDir]);
  }
  return threeDir;
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject));
}

function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function find(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function requireNode(root, name) {
  const node = find(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(vector) {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function worldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function worldDirection(THREE, node, axis = [0, 1, 0]) {
  return new THREE.Vector3(Number(axis[0] || 0), Number(axis[1] || 0), Number(axis[2] || 0)).normalize().applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function toFrameLocal(THREE, frame, pointWorld) {
  return pointWorld.clone().sub(worldPosition(THREE, frame)).applyQuaternion(worldQuaternion(THREE, frame).invert());
}

function fromFrameLocal(THREE, frame, local) {
  return local.clone().applyQuaternion(worldQuaternion(THREE, frame)).add(worldPosition(THREE, frame));
}

function distance(a, b) {
  return a.distanceTo(b);
}

function capturePose(root) {
  const pose = [];
  root.traverse((node) => {
    if (!node.isBone && !node.isObject3D) return;
    pose.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  });
  return pose;
}

function restorePose(root, pose) {
  for (const entry of pose) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
    entry.node.updateMatrix();
  }
  root.updateMatrixWorld(true);
}

function sampleQuaternionTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}

function applyClipPose(THREE, root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const node = find(root, track.name.replace(/\.quaternion$/, ''));
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
  }
  root.updateMatrixWorld(true);
}

function clipRestQuaternionMap(THREE, root, clip) {
  restorePose(root, capturePose(root));
  applyClipPose(THREE, root, clip, 0);
  const out = new Map();
  root.traverse((node) => {
    if (node.isBone) out.set(canon(node.name), node.quaternion.clone().normalize());
  });
  return out;
}

function bindRestLocalMap(THREE, root) {
  const worldByBone = new Map();
  const out = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones?.length) return;
    node.skeleton.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (bone && inverse && !worldByBone.has(bone)) worldByBone.set(bone, inverse.clone().invert());
    });
  });
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (const [bone, world] of worldByBone.entries()) {
    const parentWorld = bone.parent?.isBone ? worldByBone.get(bone.parent) : null;
    const local = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
    local.decompose(p, q, s);
    out.set(canon(bone.name), q.clone().normalize());
  }
  return out;
}

function applyLocalRest(root, restMap) {
  root.traverse((node) => {
    const rest = restMap.get(canon(node.name));
    if (rest) node.quaternion.copy(rest).normalize();
  });
  root.updateMatrixWorld(true);
}

function segmentDirection(THREE, a, b) {
  const direction = worldPosition(THREE, b).sub(worldPosition(THREE, a));
  return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return sourceLocal.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function projectedAroundAxis(THREE, direction, axis) {
  const projected = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : null;
}

function signedAngleAroundAxis(THREE, from, to, axis) {
  const a = projectedAroundAxis(THREE, from, axis);
  const b = projectedAroundAxis(THREE, to, axis);
  if (!a || !b) return null;
  return THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(axis.clone().normalize()), a.dot(b)));
}

function setWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = bone.parent ? worldQuaternion(THREE, bone.parent).invert() : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}

function rotateJointToward(THREE, joint, end, targetWorld, strength = 1) {
  const jointPos = worldPosition(THREE, joint);
  const endDir = worldPosition(THREE, end).sub(jointPos);
  const targetDir = targetWorld.clone().sub(jointPos);
  if (endDir.lengthSq() < 1e-8 || targetDir.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(endDir.normalize(), targetDir.normalize());
  if (strength < 1) turn.slerp(new THREE.Quaternion(), 1 - strength).normalize();
  setWorldQuaternion(THREE, joint, turn.multiply(worldQuaternion(THREE, joint)).normalize());
}

function alignSegment(THREE, root, joint, end, desiredStart, desiredEnd) {
  const current = segmentDirection(THREE, joint, end);
  const desired = desiredEnd.clone().sub(desiredStart);
  if (!current || desired.lengthSq() < 1e-8) return null;
  desired.normalize();
  const before = THREE.MathUtils.radToDeg(current.angleTo(desired));
  const turn = new THREE.Quaternion().setFromUnitVectors(current, desired).normalize();
  setWorldQuaternion(THREE, joint, turn.multiply(worldQuaternion(THREE, joint)).normalize());
  root.updateMatrixWorld(true);
  const afterDir = segmentDirection(THREE, joint, end);
  return {
    beforeDeg: round(before, 3),
    afterDeg: afterDir ? round(THREE.MathUtils.radToDeg(afterDir.angleTo(desired)), 3) : null,
  };
}

function solveTwoBoneIk(THREE, root, upper, lower, hand, targetWorld, iterations = 8) {
  for (let i = 0; i < iterations; i += 1) {
    rotateJointToward(THREE, lower, hand, targetWorld, 0.95);
    root.updateMatrixWorld(true);
    rotateJointToward(THREE, upper, hand, targetWorld, 0.85);
    root.updateMatrixWorld(true);
  }
}

function chainLength(THREE, upper, lower, hand) {
  return worldPosition(THREE, upper).distanceTo(worldPosition(THREE, lower)) + worldPosition(THREE, lower).distanceTo(worldPosition(THREE, hand));
}

function clampToReach(THREE, shoulder, targetWorld, length, reachScale = 0.98) {
  const shoulderWorld = worldPosition(THREE, shoulder);
  const offset = targetWorld.clone().sub(shoulderWorld);
  const maxReach = Math.max(0.001, length * reachScale);
  if (offset.length() > maxReach) offset.setLength(maxReach);
  return shoulderWorld.add(offset);
}

function calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap) {
  applyLocalRest(fpsRoot, fpsRestMap);
  applyLocalRest(meshyRoot, meshyBindMap);
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const solved = new Map(meshyBindMap);
  for (const spec of [
    ['Arm.R', 'Forearm.R', 'RightArm', 'RightForeArm'],
    ['Forearm.R', 'Hand.R', 'RightForeArm', 'RightHand'],
    ['Arm.L', 'Forearm.L', 'LeftArm', 'LeftForeArm'],
    ['Forearm.L', 'Hand.L', 'LeftForeArm', 'LeftHand'],
  ]) {
    const [sourceAName, sourceBName, targetAName, targetBName] = spec;
    const sourceA = requireNode(fpsRoot, sourceAName);
    const sourceB = requireNode(fpsRoot, sourceBName);
    const targetA = requireNode(meshyRoot, targetAName);
    const targetB = requireNode(meshyRoot, targetBName);
    const desired = mapDirectionBetweenFrames(THREE, segmentDirection(THREE, sourceA, sourceB), sourceFrame, targetFrame);
    const current = segmentDirection(THREE, targetA, targetB);
    const turn = new THREE.Quaternion().setFromUnitVectors(current, desired).normalize();
    setWorldQuaternion(THREE, targetA, turn.multiply(worldQuaternion(THREE, targetA)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(targetA.name), targetA.quaternion.clone().normalize());
  }
  const forearm = requireNode(meshyRoot, 'RightForeArm');
  const hand = requireNode(meshyRoot, 'RightHand');
  const sourceHand = requireNode(fpsRoot, 'Hand.R');
  const axis = segmentDirection(THREE, forearm, hand);
  const desiredRoll = projectedAroundAxis(THREE, mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceHand, [0, 0, 1]), sourceFrame, targetFrame), axis);
  const currentRoll = projectedAroundAxis(THREE, worldDirection(THREE, hand, [0, -1, 0]), axis);
  if (desiredRoll && currentRoll) {
    const signed = Math.atan2(new THREE.Vector3().crossVectors(currentRoll, desiredRoll).dot(axis), currentRoll.dot(desiredRoll));
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, signed + THREE.MathUtils.degToRad(-120)).normalize();
    setWorldQuaternion(THREE, hand, turn.multiply(worldQuaternion(THREE, hand)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(hand.name), hand.quaternion.clone().normalize());
  }
  return solved;
}

function keyTimesForImportantBones(clip) {
  const wanted = new Set(SOURCE_BONES.map(canon));
  const times = new Set();
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const name = track.name.replace(/\.quaternion$/, '');
    if (!wanted.has(canon(name))) continue;
    for (const time of track.times || []) times.add(round(time, 6));
  }
  return [...times].sort((a, b) => a - b);
}

function uniformProjectionScale(THREE, fpsRoot, meshyRoot) {
  const values = [];
  for (const chain of CHAINS) {
    const sourceUpper = requireNode(fpsRoot, chain.source[0]);
    const sourceLower = requireNode(fpsRoot, chain.source[1]);
    const sourceHand = requireNode(fpsRoot, chain.source[2]);
    const targetUpper = requireNode(meshyRoot, chain.target[0]);
    const targetLower = requireNode(meshyRoot, chain.target[1]);
    const targetHand = requireNode(meshyRoot, chain.target[2]);
    values.push(chainLength(THREE, targetUpper, targetLower, targetHand) / Math.max(0.0001, chainLength(THREE, sourceUpper, sourceLower, sourceHand)));
  }
  return avg(values);
}

function projectSourceJoints(THREE, fpsRoot, meshyRoot, scale) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const out = {};
  for (const sourceName of SOURCE_BONES) {
    const sourceNode = requireNode(fpsRoot, sourceName);
    const targetName = BONE_MAP[sourceName];
    const sourceLocal = toFrameLocal(THREE, sourceFrame, worldPosition(THREE, sourceNode));
    const targetLocal = sourceLocal.clone().multiplyScalar(scale);
    const targetWorld = fromFrameLocal(THREE, targetFrame, targetLocal);
    out[sourceName] = {
      targetBone: targetName,
      sourceLocal: point(sourceLocal),
      projectedLocal: point(targetLocal),
      projectedWorld: point(targetWorld),
    };
  }
  return out;
}

function applyFkProjection(THREE, meshyRoot, projected) {
  const operations = [];
  for (const chain of CHAINS) {
    const upper = requireNode(meshyRoot, chain.target[0]);
    const lower = requireNode(meshyRoot, chain.target[1]);
    const hand = requireNode(meshyRoot, chain.target[2]);
    const desiredUpper = new THREE.Vector3().fromArray(projected[chain.source[0]].projectedWorld);
    const desiredLower = new THREE.Vector3().fromArray(projected[chain.source[1]].projectedWorld);
    const desiredHand = new THREE.Vector3().fromArray(projected[chain.source[2]].projectedWorld);
    operations.push({ side: chain.side, bone: upper.name, result: alignSegment(THREE, meshyRoot, upper, lower, desiredUpper, desiredLower) });
    operations.push({ side: chain.side, bone: lower.name, result: alignSegment(THREE, meshyRoot, lower, hand, desiredLower, desiredHand) });
  }
  return operations;
}

function applyIkRefinement(THREE, meshyRoot, projected) {
  const operations = [];
  for (const chain of CHAINS) {
    const upper = requireNode(meshyRoot, chain.target[0]);
    const lower = requireNode(meshyRoot, chain.target[1]);
    const hand = requireNode(meshyRoot, chain.target[2]);
    const desiredHand = new THREE.Vector3().fromArray(projected[chain.source[2]].projectedWorld);
    const length = chainLength(THREE, upper, lower, hand);
    const clamped = clampToReach(THREE, upper, desiredHand, length, 0.98);
    const wasClamped = clamped.distanceTo(desiredHand) > 0.0001;
    solveTwoBoneIk(THREE, meshyRoot, upper, lower, hand, clamped, 8);
    operations.push({ side: chain.side, hand: hand.name, wasClamped, targetWorld: point(desiredHand), solvedWorld: point(worldPosition(THREE, hand)) });
  }
  return operations;
}

function jointErrors(THREE, meshyRoot, projected, phase) {
  const entries = [];
  for (const sourceName of SOURCE_BONES) {
    const targetName = BONE_MAP[sourceName];
    const node = find(meshyRoot, targetName);
    if (!node) continue;
    const desired = new THREE.Vector3().fromArray(projected[sourceName].projectedWorld);
    const actual = worldPosition(THREE, node);
    entries.push({ source: sourceName, target: targetName, phase, error: round(actual.distanceTo(desired)), actual: point(actual), desired: point(desired) });
  }
  return entries;
}

function sourceBladeTip(THREE, weaponNode) {
  return new THREE.Vector3(0.00854, 0.57786, 0.00995).applyQuaternion(worldQuaternion(THREE, weaponNode)).add(worldPosition(THREE, weaponNode));
}

function swordReport(THREE, fpsRoot, meshyRoot, scale, projected) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const sourceWeapon = requireNode(fpsRoot, 'Weapon.R');
  const weaponGrip = find(meshyRoot, 'WeaponGrip') || requireNode(meshyRoot, 'RightHand');
  const sourceTipLocal = toFrameLocal(THREE, sourceFrame, sourceBladeTip(THREE, sourceWeapon));
  const targetTipLocal = sourceTipLocal.clone().multiplyScalar(scale);
  const targetTipWorld = fromFrameLocal(THREE, targetFrame, targetTipLocal);
  const gripTarget = new THREE.Vector3().fromArray(projected['Weapon.R'].projectedWorld);
  const gripActual = worldPosition(THREE, weaponGrip);
  const actualTip = gripActual.clone().add(worldDirection(THREE, weaponGrip, [0, 0, 1]).multiplyScalar(0.85));
  return {
    policy: 'sword is projected as landmarks only; it does not solve arm joints',
    weaponGripTargetWorld: point(gripTarget),
    weaponGripActualWorld: point(gripActual),
    weaponGripError: round(gripActual.distanceTo(gripTarget)),
    bladeTipTargetWorld: point(targetTipWorld),
    bladeTipActualApproxWorld: point(actualTip),
    bladeTipError: round(actualTip.distanceTo(targetTipWorld)),
  };
}

function firstBoneChild(node) {
  return node?.children?.find((child) => child.isBone) || null;
}

function triad(THREE, root, name, localUpAxis, desiredUp = null) {
  const node = find(root, name);
  if (!node) return { name, missing: true };
  const head = worldPosition(THREE, node);
  const child = firstBoneChild(node);
  const tail = child ? worldPosition(THREE, child) : head.clone().add(worldDirection(THREE, node, [0, 0, 1]).multiplyScalar(0.15));
  const forward = tail.clone().sub(head);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  const actualUp = projectedAroundAxis(THREE, worldDirection(THREE, node, localUpAxis), forward) || new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(forward, actualUp).normalize();
  const desired = desiredUp ? projectedAroundAxis(THREE, desiredUp, forward) : null;
  return {
    name,
    head: point(head),
    tail: point(tail),
    forward: point(forward),
    actualUp: point(actualUp),
    side: point(side),
    desiredUp: desired ? point(desired) : null,
    rollErrorDeg: desired ? round(signedAngleAroundAxis(THREE, actualUp, desired, forward), 3) : null,
  };
}

function desiredUpForTarget(THREE, fpsRoot, meshyRoot, sourceName, targetForward) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const source = find(fpsRoot, sourceName);
  if (!source) return null;
  const sourceUpAxis = sourceName === 'Weapon.R' ? [0, 1, 0] : [0, 0, 1];
  return projectedAroundAxis(THREE, mapDirectionBetweenFrames(THREE, worldDirection(THREE, source, sourceUpAxis), sourceFrame, targetFrame), targetForward);
}

function rollErrors(THREE, fpsRoot, meshyRoot) {
  const out = [];
  for (const [sourceName, targetName] of Object.entries(BONE_MAP)) {
    const target = find(meshyRoot, targetName);
    if (!target) continue;
    const child = firstBoneChild(target);
    const head = worldPosition(THREE, target);
    const tail = child ? worldPosition(THREE, child) : head.clone().add(worldDirection(THREE, target, [0, 0, 1]).multiplyScalar(0.15));
    const forward = tail.clone().sub(head);
    if (forward.lengthSq() < 1e-8) continue;
    forward.normalize();
    const actualUp = projectedAroundAxis(THREE, worldDirection(THREE, target, targetName === 'WeaponGrip' ? [0, 1, 0] : [0, -1, 0]), forward);
    const desiredUp = desiredUpForTarget(THREE, fpsRoot, meshyRoot, sourceName, forward);
    if (!actualUp || !desiredUp) continue;
    out.push({ source: sourceName, target: targetName, errorDeg: round(signedAngleAroundAxis(THREE, actualUp, desiredUp, forward), 3), forward: point(forward), actualUp: point(actualUp), desiredUp: point(desiredUp) });
  }
  return out;
}

function sampleMeshPoints(THREE, root, maxPerMesh = 160) {
  const samples = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    const attr = node.geometry?.attributes?.position;
    if (!attr) return;
    const step = Math.max(1, Math.ceil(attr.count / maxPerMesh));
    const local = new THREE.Vector3();
    const world = new THREE.Vector3();
    for (let i = 0; i < attr.count; i += step) {
      if (node.isSkinnedMesh && typeof node.boneTransform === 'function') {
        node.boneTransform(i, world);
        world.applyMatrix4(node.matrixWorld);
      } else {
        local.fromBufferAttribute(attr, i);
        world.copy(local).applyMatrix4(node.matrixWorld);
      }
      samples.push(point(world));
    }
  });
  return samples;
}

function renderProjectionSheet(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-projection-workspace-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

data = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
frames = data.get('renderFrames', [])
W, H = 1900, 1180
img = Image.new('RGB', (W, H), (6, 9, 13))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 18)
    small = ImageFont.truetype('DejaVuSans.ttf', 12)
except Exception:
    font = small = None

def v(p): return p if isinstance(p, list) and len(p) >= 3 else [0,0,0]
def project(p, panel, view, bounds):
    x0,y0,x1,y1 = panel
    ai,bi = (0,2) if view == 'top' else (0,1)
    cx,cy,scale = bounds
    p = v(p)
    return ((x0+x1)/2 + (p[ai]-cx)*scale, (y0+y1)/2 - (p[bi]-cy)*scale)
def bounds_for(frame, view, panel):
    pts = []
    for key in ['fpsMesh','meshyMesh']:
        pts += frame.get(key, [])
    for p in frame.get('projectedPins', {}).values():
        pts.append(p.get('projectedWorld'))
    for group in ['fkActual','ikActual']:
        for p in frame.get(group, {}).values():
            pts.append(p)
    if frame.get('sword'):
        pts.append(frame['sword'].get('weaponGripTargetWorld')); pts.append(frame['sword'].get('bladeTipTargetWorld'))
    for t in frame.get('triads', []):
        pts.append(t.get('head')); pts.append(t.get('tail'))
    pts = [v(p) for p in pts if isinstance(p, list)]
    if not pts: return (0,0,1)
    ai,bi = (0,2) if view == 'top' else (0,1)
    mn_a,mx_a = min(p[ai] for p in pts), max(p[ai] for p in pts)
    mn_b,mx_b = min(p[bi] for p in pts), max(p[bi] for p in pts)
    span = max(mx_a-mn_a, mx_b-mn_b, .001)
    scale = min((panel[2]-panel[0])*.72, (panel[3]-panel[1])*.72) / span
    return ((mn_a+mx_a)/2, (mn_b+mx_b)/2, scale)
def dot(p,panel,view,bounds,color,r=4):
    x,y = project(p,panel,view,bounds)
    d.ellipse([x-r,y-r,x+r,y+r], fill=color)
def line(a,b,panel,view,bounds,color,w=2):
    d.line([project(a,panel,view,bounds), project(b,panel,view,bounds)], fill=color, width=w)
def cloud(points,panel,view,bounds,color):
    for p in points:
        x,y = project(p,panel,view,bounds)
        d.point((x,y), fill=color)
def draw_chain(points, names, panel, view, bounds, color, w=4):
    prev = None
    for name in names:
        p = points.get(name)
        if not p: continue
        if prev: line(prev, p, panel, view, bounds, color, w)
        dot(p, panel, view, bounds, color, 4)
        prev = p
def add(a,b): return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]
def mul(a,s): return [a[0]*s,a[1]*s,a[2]*s]

d.text((18,16), 'Meshy Projection Workspace: projected pins=magenta, FK=cyan, IK=blue, triad up green/red', fill=(255,240,180), font=font)
d.text((18,42), f"clip={data.get('clip')} keys={data.get('sourceKeyCount')} diagnostic-only={data.get('productionBehaviorModified') == False}", fill=(202,213,226), font=small)
views = ['front','top']
panel_w = W // max(1, len(frames))
panel_h = (H-92) // len(views)
for fi, frame in enumerate(frames):
    for vi, view in enumerate(views):
        panel = (fi*panel_w+8, 72+vi*panel_h, (fi+1)*panel_w-8, 72+(vi+1)*panel_h-10)
        bounds = bounds_for(frame, view, panel)
        d.rectangle(panel, outline=(51,65,85), width=1)
        d.text((panel[0]+8,panel[1]+6), f"t={frame.get('time'):.3f} {view}", fill=(226,232,240), font=small)
        cloud(frame.get('fpsMesh', []), panel, view, bounds, (74,64,44))
        cloud(frame.get('meshyMesh', []), panel, view, bounds, (35,60,78))
        projected = {k: v.get('projectedWorld') for k,v in frame.get('projectedPins', {}).items()}
        draw_chain(projected, ['Arm.R','Forearm.R','Hand.R'], panel, view, bounds, (244,114,182), 5)
        draw_chain(projected, ['Arm.L','Forearm.L','Hand.L'], panel, view, bounds, (244,114,182), 5)
        draw_chain(frame.get('fkActual', {}), ['RightArm','RightForeArm','RightHand'], panel, view, bounds, (34,211,238), 4)
        draw_chain(frame.get('fkActual', {}), ['LeftArm','LeftForeArm','LeftHand'], panel, view, bounds, (34,211,238), 4)
        draw_chain(frame.get('ikActual', {}), ['RightArm','RightForeArm','RightHand'], panel, view, bounds, (96,165,250), 2)
        draw_chain(frame.get('ikActual', {}), ['LeftArm','LeftForeArm','LeftHand'], panel, view, bounds, (96,165,250), 2)
        if frame.get('sword'):
            s = frame['sword']
            line(s.get('weaponGripTargetWorld'), s.get('bladeTipTargetWorld'), panel, view, bounds, (250,204,21), 5)
            dot(s.get('weaponGripTargetWorld'), panel, view, bounds, (255,255,255), 5)
        for t in frame.get('triads', []):
            h = v(t.get('head'))
            line(h, t.get('tail'), panel, view, bounds, (180,180,190), 1)
            line(h, add(h, mul(v(t.get('actualUp')), .13)), panel, view, bounds, (52,211,153), 3)
            if t.get('desiredUp'): line(h, add(h, mul(v(t.get('desiredUp')), .15)), panel, view, bounds, (248,113,113), 3)
        sword = frame.get('sword') or {}
        d.text((panel[0]+8,panel[3]-22), f"fkAvg={frame.get('fkAvgError')} swordTip={sword.get('bladeTipError')} rollMax={frame.get('rollMaxAbsErrorDeg')}", fill=(248,220,160), font=small)
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const readyClip = fps.animations.find((clip) => clip.name === args.clip);
  const tposeClip = fps.animations.find((clip) => clip.name === '0T-Pose');
  if (!readyClip || !tposeClip) throw new Error('missing FPS OneHandReady or 0T-Pose');
  const fpsLoadPose = capturePose(fpsRoot);
  const meshyLoadPose = capturePose(meshyRoot);
  const fpsRestMap = clipRestQuaternionMap(THREE, fpsRoot, tposeClip);
  restorePose(fpsRoot, fpsLoadPose);
  restorePose(meshyRoot, meshyLoadPose);
  const meshyBindMap = bindRestLocalMap(THREE, meshyRoot);
  const calibratedRestMap = calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap);
  restorePose(fpsRoot, fpsLoadPose);
  restorePose(meshyRoot, meshyLoadPose);
  applyLocalRest(fpsRoot, fpsRestMap);
  applyLocalRest(meshyRoot, calibratedRestMap);
  const projectionScale = uniformProjectionScale(THREE, fpsRoot, meshyRoot);
  const sourceTimes = keyTimesForImportantBones(readyClip);
  const frames = [];
  const report = {
    projectedJointReport: [],
    fkErrorReport: [],
    ikRefinementReport: [],
    swordTipError: [],
    rollError: [],
  };
  const renderEvery = Math.max(1, Math.floor(sourceTimes.length / Math.max(1, Number(args.maxRenderFrames || 7))));
  for (let index = 0; index < sourceTimes.length; index += 1) {
    const time = sourceTimes[index];
    restorePose(fpsRoot, fpsLoadPose);
    restorePose(meshyRoot, meshyLoadPose);
    applyLocalRest(meshyRoot, calibratedRestMap);
    applyClipPose(THREE, fpsRoot, readyClip, time);
    const projected = projectSourceJoints(THREE, fpsRoot, meshyRoot, projectionScale);
    for (const [source, entry] of Object.entries(projected)) report.projectedJointReport.push({ time, source, ...entry });
    let fkActual = {};
    if (args.layers.has('fk')) {
      const fkOps = applyFkProjection(THREE, meshyRoot, projected);
      const fkErrors = jointErrors(THREE, meshyRoot, projected, 'fk');
      report.fkErrorReport.push({ time, operations: fkOps, errors: fkErrors, avgError: round(avg(fkErrors.map((entry) => entry.error))), maxError: round(max(fkErrors.map((entry) => entry.error))) });
      fkActual = Object.fromEntries(TARGET_BONES.map((name) => [name, point(worldPosition(THREE, find(meshyRoot, name) || requireNode(meshyRoot, 'Spine02')))]));
    }
    let ikActual = {};
    if (args.layers.has('ik')) {
      const ikOps = applyIkRefinement(THREE, meshyRoot, projected);
      const ikErrors = jointErrors(THREE, meshyRoot, projected, 'ik');
      report.ikRefinementReport.push({ time, operations: ikOps, errors: ikErrors, avgError: round(avg(ikErrors.map((entry) => entry.error))), maxError: round(max(ikErrors.map((entry) => entry.error))) });
      ikActual = Object.fromEntries(TARGET_BONES.map((name) => [name, point(worldPosition(THREE, find(meshyRoot, name) || requireNode(meshyRoot, 'Spine02')))]));
    }
    const sword = args.layers.has('sword') ? swordReport(THREE, fpsRoot, meshyRoot, projectionScale, projected) : null;
    if (sword) report.swordTipError.push({ time, weaponGripError: sword.weaponGripError, bladeTipError: sword.bladeTipError, policy: sword.policy });
    const rolls = args.layers.has('roll') ? rollErrors(THREE, fpsRoot, meshyRoot) : [];
    if (rolls.length) report.rollError.push({ time, errors: rolls, maxAbsErrorDeg: round(max(rolls.map((entry) => Math.abs(entry.errorDeg)))) });
    if (index % renderEvery === 0 || index === sourceTimes.length - 1) {
      const triads = args.layers.has('basis') ? TARGET_BONES.map((targetName) => {
        const sourceName = Object.entries(BONE_MAP).find(([, target]) => target === targetName)?.[0] || '';
        const basic = triad(THREE, meshyRoot, targetName, targetName === 'WeaponGrip' ? [0, 1, 0] : [0, -1, 0]);
        const desired = sourceName ? desiredUpForTarget(THREE, fpsRoot, meshyRoot, sourceName, new THREE.Vector3().fromArray(basic.forward || [0, 0, 1])) : null;
        return triad(THREE, meshyRoot, targetName, targetName === 'WeaponGrip' ? [0, 1, 0] : [0, -1, 0], desired);
      }) : [];
      frames.push({
        time,
        fpsMesh: sampleMeshPoints(THREE, fpsRoot),
        meshyMesh: sampleMeshPoints(THREE, meshyRoot),
        projectedPins: args.layers.has('projected-pins') ? projected : {},
        fkActual,
        ikActual,
        sword,
        triads,
        fkAvgError: report.fkErrorReport.at(-1)?.avgError ?? null,
        rollMaxAbsErrorDeg: report.rollError.at(-1)?.maxAbsErrorDeg ?? null,
      });
    }
  }
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'projection_workspace.json');
  const pngPath = path.join(args.out, 'projection_workspace.png');
  const summary = {
    fkAvgError: round(avg(report.fkErrorReport.map((entry) => entry.avgError))),
    fkMaxError: round(max(report.fkErrorReport.map((entry) => entry.maxError))),
    swordTipAvgError: round(avg(report.swordTipError.map((entry) => entry.bladeTipError))),
    swordTipMaxError: round(max(report.swordTipError.map((entry) => entry.bladeTipError))),
    rollMaxAbsErrorDeg: round(max(report.rollError.flatMap((entry) => entry.errors.map((roll) => Math.abs(roll.errorDeg))))),
  };
  const payload = {
    schema: 'pose-lab-meshy-projection-workspace-v1',
    generatedAt: new Date().toISOString(),
    clip: readyClip.name,
    sourceKeyCount: sourceTimes.length,
    sourceKeyTimes: sourceTimes,
    productionBehaviorModified: false,
    diagnosticOnly: true,
    coordinateBridge: {
      sourceRest: 'FPSPlayer.glb 0T-Pose',
      targetRest: 'Meshy accepted FPS-REST-ARMS-CAL--120 calibration',
      targetBaseline: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
      projectionScale: round(projectionScale, 6),
      rule: 'project joint positions through calibrated T-pose frames; do not transfer quaternions or solve roll before FK',
    },
    toggles: Object.fromEntries(ALL_LAYERS.map((layer) => [layer, args.layers.has(layer)])),
    reports: report,
    summary,
    renderFrames: frames,
  };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  renderProjectionSheet(dataPath, pngPath);
  console.log(JSON.stringify({ ok: true, data: path.relative(projectRoot, dataPath), png: path.relative(projectRoot, pngPath), sourceKeyCount: sourceTimes.length, summary }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
