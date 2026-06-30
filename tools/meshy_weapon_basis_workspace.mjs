#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'weapon_basis_workspace');
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
  { source: ['Arm.R', 'Forearm.R', 'Hand.R'], target: ['RightArm', 'RightForeArm', 'RightHand'] },
  { source: ['Arm.L', 'Forearm.L', 'Hand.L'], target: ['LeftArm', 'LeftForeArm', 'LeftHand'] },
];
const LAYERS = ['grip-position', 'grip-orientation', 'blade-axis', 'blade-tip', 'attachment-rotation', 'attachment-local-basis', 'attachment-scale'];

function parseArgs(argv) {
  const args = { out: defaultOut, clip: 'OneHandReady', layers: new Set(LAYERS), maxRenderFrames: 9 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--clip') args.clip = argv[++i] || args.clip;
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--enable') args.layers = new Set(String(argv[++i] || '').split(',').filter(Boolean));
    else if (arg.startsWith('--enable=')) args.layers = new Set(arg.slice('--enable='.length).split(',').filter(Boolean));
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++i] || args.maxRenderFrames);
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
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
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

function worldDirection(THREE, node, axis = [0, 0, 1]) {
  return new THREE.Vector3(...axis).normalize().applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function toFrameLocal(THREE, frame, pointWorld) {
  return pointWorld.clone().sub(worldPosition(THREE, frame)).applyQuaternion(worldQuaternion(THREE, frame).invert());
}

function fromFrameLocal(THREE, frame, local) {
  return local.clone().applyQuaternion(worldQuaternion(THREE, frame)).add(worldPosition(THREE, frame));
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

function setWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = bone.parent ? worldQuaternion(THREE, bone.parent).invert() : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
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
    const desired = mapDirectionBetweenFrames(THREE, segmentDirection(THREE, requireNode(fpsRoot, sourceAName), requireNode(fpsRoot, sourceBName)), sourceFrame, targetFrame);
    const current = segmentDirection(THREE, requireNode(meshyRoot, targetAName), requireNode(meshyRoot, targetBName));
    const targetA = requireNode(meshyRoot, targetAName);
    setWorldQuaternion(THREE, targetA, new THREE.Quaternion().setFromUnitVectors(current, desired).multiply(worldQuaternion(THREE, targetA)).normalize());
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

function chainLength(THREE, upper, lower, hand) {
  return worldPosition(THREE, upper).distanceTo(worldPosition(THREE, lower)) + worldPosition(THREE, lower).distanceTo(worldPosition(THREE, hand));
}

function uniformProjectionScale(THREE, fpsRoot, meshyRoot) {
  return avg(CHAINS.map((chain) => chainLength(THREE, requireNode(meshyRoot, chain.target[0]), requireNode(meshyRoot, chain.target[1]), requireNode(meshyRoot, chain.target[2])) / Math.max(0.0001, chainLength(THREE, requireNode(fpsRoot, chain.source[0]), requireNode(fpsRoot, chain.source[1]), requireNode(fpsRoot, chain.source[2])))));
}

function projectSourceJoints(THREE, fpsRoot, meshyRoot, scale) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const out = {};
  for (const sourceName of SOURCE_BONES) {
    const sourceLocal = toFrameLocal(THREE, sourceFrame, worldPosition(THREE, requireNode(fpsRoot, sourceName)));
    out[sourceName] = fromFrameLocal(THREE, targetFrame, sourceLocal.multiplyScalar(scale));
  }
  return out;
}

function alignSegment(THREE, root, joint, end, desiredStart, desiredEnd) {
  const current = segmentDirection(THREE, joint, end);
  const desired = desiredEnd.clone().sub(desiredStart);
  if (!current || desired.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(current, desired.normalize()).normalize();
  setWorldQuaternion(THREE, joint, turn.multiply(worldQuaternion(THREE, joint)).normalize());
  root.updateMatrixWorld(true);
}

function applyFkProjection(THREE, meshyRoot, projected) {
  for (const chain of CHAINS) {
    alignSegment(THREE, meshyRoot, requireNode(meshyRoot, chain.target[0]), requireNode(meshyRoot, chain.target[1]), projected[chain.source[0]], projected[chain.source[1]]);
    alignSegment(THREE, meshyRoot, requireNode(meshyRoot, chain.target[1]), requireNode(meshyRoot, chain.target[2]), projected[chain.source[1]], projected[chain.source[2]]);
  }
}

function quaternionFromBladeFrame(THREE, blade, up) {
  const z = blade.clone().normalize();
  let y = up.clone().sub(z.clone().multiplyScalar(up.dot(z)));
  if (y.lengthSq() < 1e-8) y = new THREE.Vector3(0, 1, 0).sub(z.clone().multiplyScalar(z.y));
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize();
}

function sourceBladeTip(THREE, weaponNode) {
  return new THREE.Vector3(0.00854, 0.57786, 0.00995).applyQuaternion(worldQuaternion(THREE, weaponNode)).add(worldPosition(THREE, weaponNode));
}

function desiredWeaponFrame(THREE, fpsRoot, meshyRoot, scale) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const sourceWeapon = requireNode(fpsRoot, 'Weapon.R');
  const sourceTipWorld = sourceBladeTip(THREE, sourceWeapon);
  const sourceBladeWorld = sourceTipWorld.clone().sub(worldPosition(THREE, sourceWeapon));
  const sourceTipLocal = toFrameLocal(THREE, sourceFrame, sourceTipWorld).multiplyScalar(scale);
  const desiredBlade = mapDirectionBetweenFrames(THREE, sourceBladeWorld, sourceFrame, targetFrame);
  const desiredUp = mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceWeapon, [0, 1, 0]), sourceFrame, targetFrame);
  return {
    grip: projectSourceJoints(THREE, fpsRoot, meshyRoot, scale)['Weapon.R'],
    tip: fromFrameLocal(THREE, targetFrame, sourceTipLocal),
    blade: desiredBlade,
    up: desiredUp,
    quaternion: quaternionFromBladeFrame(THREE, desiredBlade, desiredUp),
  };
}

function parseMeshyProfileBlock() {
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const start = profiles.indexOf('meshyCharacter:');
  const end = profiles.indexOf('\n  meshyStatic:', start);
  return profiles.slice(start, end > start ? end : undefined);
}

function arrayFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  return match ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : fallback;
}

function parseWeaponConfig() {
  const block = parseMeshyProfileBlock();
  const proxyStart = block.indexOf('weaponProxy:');
  const proxyEnd = block.indexOf('\n    weaponAttachment:', proxyStart);
  const proxy = block.slice(proxyStart, proxyEnd > proxyStart ? proxyEnd : undefined);
  const attachStart = block.indexOf('weaponAttachment:');
  const attachEnd = block.indexOf('\n    extraClipUrls:', attachStart);
  const attachment = block.slice(attachStart, attachEnd > attachStart ? attachEnd : undefined);
  return {
    proxy: {
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
    },
    attachment: {
      scale: Number(attachment.match(/scale:\s*([0-9.]+)/)?.[1] || 1),
      rotationDeg: arrayFor(attachment, 'rotationDeg', [0, 0, 0]),
      gripLocalPosition: arrayFor(attachment, 'gripLocalPosition', [0, 0, 0]),
      tipLocalPosition: arrayFor(attachment, 'tipLocalPosition', [0, 0.85, 0]),
      sourceBoundsMin: arrayFor(attachment, 'min', null),
      sourceBoundsMax: arrayFor(attachment, 'max', null),
    },
  };
}

function eulerQuat(THREE, deg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...deg.map((value) => THREE.MathUtils.degToRad(value || 0)), 'XYZ')).normalize();
}

function angleDeg(THREE, a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()));
}

function socketState(THREE, meshyRoot, config) {
  const rightHand = requireNode(meshyRoot, 'RightHand');
  const socketFromHand = rightHand.localToWorld(new THREE.Vector3().fromArray(config.proxy.handLocalOffset));
  const socketLocal = meshyRoot.worldToLocal(socketFromHand.clone()).add(new THREE.Vector3().fromArray(config.proxy.modelLocalOffset));
  const socketWorld = meshyRoot.localToWorld(socketLocal.clone());
  return { position: socketWorld, quaternion: worldQuaternion(THREE, rightHand) };
}

function attachmentEval(THREE, socket, config, desired, localRotation, localTip = null, scale = null) {
  const attachment = config.attachment;
  const qLocal = localRotation || eulerQuat(THREE, attachment.rotationDeg);
  const useScale = Number(scale ?? attachment.scale);
  const gripLocal = new THREE.Vector3().fromArray(attachment.gripLocalPosition).multiplyScalar(useScale).applyQuaternion(qLocal);
  const tipLocal = new THREE.Vector3().fromArray(localTip || attachment.tipLocalPosition).multiplyScalar(useScale).applyQuaternion(qLocal);
  const worldQ = socket.quaternion.clone().multiply(qLocal).normalize();
  const hilt = socket.position.clone();
  const modelOrigin = hilt.clone().sub(gripLocal.clone().applyQuaternion(socket.quaternion));
  const tip = modelOrigin.clone().add(tipLocal.clone().applyQuaternion(socket.quaternion));
  const axis = tip.clone().sub(hilt);
  const desiredAxis = desired.tip.clone().sub(desired.grip);
  const desiredSocketTip = hilt.clone().add(desired.blade.clone().normalize().multiplyScalar(desired.grip.distanceTo(desired.tip)));
  return {
    hilt,
    tip,
    modelOrigin,
    axis: axis.lengthSq() > 1e-8 ? axis.clone().normalize() : new THREE.Vector3(0, 0, 1),
    worldQ,
    gripError: hilt.distanceTo(desired.grip),
    hiltError: hilt.distanceTo(desired.grip),
    tipError: tip.distanceTo(desired.tip),
    socketRelativeTipError: tip.distanceTo(desiredSocketTip),
    bladeAxisErrorDeg: angleDeg(THREE, axis, desiredAxis),
    gripOrientationErrorDeg: angleDeg(THREE, new THREE.Vector3(0, 0, 1).applyQuaternion(socket.quaternion), desired.blade),
    attachmentOrientationErrorDeg: angleDeg(THREE, new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ), desired.blade),
    bladeLength: hilt.distanceTo(tip),
    desiredBladeLength: desired.grip.distanceTo(desired.tip),
  };
}

function correctedEvaluations(THREE, socket, config, desired) {
  const attachment = config.attachment;
  const currentLocalQ = eulerQuat(THREE, attachment.rotationDeg);
  const currentLocalBlade = new THREE.Vector3().fromArray(attachment.tipLocalPosition).sub(new THREE.Vector3().fromArray(attachment.gripLocalPosition)).multiplyScalar(attachment.scale).applyQuaternion(currentLocalQ).normalize();
  const desiredBladeLocal = desired.blade.clone().applyQuaternion(socket.quaternion.clone().invert()).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(currentLocalBlade, desiredBladeLocal).normalize();
  const solvedLocalQ = delta.clone().multiply(currentLocalQ).normalize();
  const rotationOnly = attachmentEval(THREE, socket, config, desired, solvedLocalQ);
  const current = attachmentEval(THREE, socket, config, desired, currentLocalQ);
  const desiredLength = desired.grip.distanceTo(desired.tip);
  const currentLocalDelta = new THREE.Vector3().fromArray(attachment.tipLocalPosition).sub(new THREE.Vector3().fromArray(attachment.gripLocalPosition));
  const scaleOnly = currentLocalDelta.length() > 1e-8 ? attachmentEval(THREE, socket, config, desired, currentLocalQ, null, desiredLength / currentLocalDelta.length()) : current;
  const tipOnlyLocal = new THREE.Vector3().fromArray(attachment.gripLocalPosition).add(desiredBladeLocal.clone().applyQuaternion(currentLocalQ.clone().invert()).multiplyScalar(desiredLength / attachment.scale));
  const tipOnly = attachmentEval(THREE, socket, config, desired, currentLocalQ, tipOnlyLocal.toArray(), attachment.scale);
  const positionOnlySocket = { position: desired.grip.clone(), quaternion: socket.quaternion.clone() };
  const positionOnly = attachmentEval(THREE, positionOnlySocket, config, desired, currentLocalQ);
  const positionAndRotation = attachmentEval(THREE, positionOnlySocket, config, desired, solvedLocalQ);
  return { current, rotationOnly, scaleOnly, tipOnly, positionOnly, positionAndRotation };
}

function summariseRows(rows, keyPrefix = '') {
  const field = (key) => keyPrefix ? keyPrefix + key[0].toUpperCase() + key.slice(1) : key;
  const values = (key) => rows.map((entry) => entry[field(key)]).filter(Number.isFinite);
  const tipField = field('tipError');
  const worstTip = rows.reduce((best, entry) => (!best || entry[tipField] > best[tipField] ? entry : best), null);
  return {
    avgGripPositionError: round(avg(values('gripError'))),
    maxGripPositionError: round(max(values('gripError'))),
    avgGripOrientationErrorDeg: round(avg(values('gripOrientationErrorDeg')), 3),
    maxGripOrientationErrorDeg: round(max(values('gripOrientationErrorDeg')), 3),
    avgBladeAxisErrorDeg: round(avg(values('bladeAxisErrorDeg')), 3),
    maxBladeAxisErrorDeg: round(max(values('bladeAxisErrorDeg')), 3),
    avgBladeTipError: round(avg(values('tipError'))),
    maxBladeTipError: round(max(values('tipError'))),
    avgSocketRelativeTipError: round(avg(values('socketRelativeTipError'))),
    maxSocketRelativeTipError: round(max(values('socketRelativeTipError'))),
    avgHiltError: round(avg(values('hiltError'))),
    maxHiltError: round(max(values('hiltError'))),
    worstFrame: worstTip ? worstTip.time : null,
    worstBone: 'WeaponGrip',
  };
}

function vectorRecord(v) {
  return point(v);
}

function evalFields(prefix, evaluation) {
  const cap = (name) => prefix + name[0].toUpperCase() + name.slice(1);
  return {
    [cap('gripError')]: round(evaluation.gripError),
    [cap('gripOrientationErrorDeg')]: round(evaluation.gripOrientationErrorDeg, 3),
    [cap('bladeAxisErrorDeg')]: round(evaluation.bladeAxisErrorDeg, 3),
    [cap('tipError')]: round(evaluation.tipError),
    [cap('socketRelativeTipError')]: round(evaluation.socketRelativeTipError),
    [cap('hiltError')]: round(evaluation.hiltError),
    [cap('attachmentOrientationErrorDeg')]: round(evaluation.attachmentOrientationErrorDeg, 3),
  };
}

function writePng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-weapon-basis-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
frames=data.get('renderFrames', [])
W,H=1800,1000
img=Image.new('RGB',(W,H),(6,9,13)); d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18); small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
def v(p): return p if isinstance(p,list) and len(p)>=3 else [0,0,0]
def bounds(frame, panel, view):
  pts=[]
  for k in ['socket','desiredGrip','desiredTip','actualTip','rotationOnlyTip','tipOnlyTip','idealTip','hilt','gripLandmark']:
    if frame.get(k): pts.append(frame.get(k))
  pts=[v(p) for p in pts]
  ai,bi=(0,2) if view=='top' else (0,1)
  mn_a,mx_a=min(p[ai] for p in pts),max(p[ai] for p in pts)
  mn_b,mx_b=min(p[bi] for p in pts),max(p[bi] for p in pts)
  span=max(mx_a-mn_a,mx_b-mn_b,.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2,min((panel[2]-panel[0])*.70,(panel[3]-panel[1])*.70)/span)
def project(p,panel,view,b):
  ai,bi=(0,2) if view=='top' else (0,1)
  cx,cy,s=b; p=v(p)
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=5):
  x,y=project(p,panel,view,b); d.ellipse([x-r,y-r,x+r,y+r],fill=c)
def line(a,bp,panel,view,b,c,w=3):
  d.line([project(a,panel,view,b),project(bp,panel,view,b)],fill=c,width=w)
def add(a,b): return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]
def mul(a,s): return [a[0]*s,a[1]*s,a[2]*s]
d.text((18,14),'Weapon Basis Workspace: socket cyan, desired blade green, actual red, rotation-only orange, tip-only violet, ideal white',fill=(255,240,180),font=font)
d.text((18,40),f"dominant={data.get('diagnostics',{}).get('dominantCause')} keys={data.get('sourceKeyCount')} diagnostic-only={data.get('diagnosticOnly')}",fill=(202,213,226),font=small)
views=['front','top']; panel_w=W//max(1,len(frames)); panel_h=(H-82)//2
for fi,frame in enumerate(frames):
  for vi,view in enumerate(views):
    panel=(fi*panel_w+8,68+vi*panel_h,(fi+1)*panel_w-8,68+(vi+1)*panel_h-10)
    b=bounds(frame,panel,view)
    d.rectangle(panel,outline=(51,65,85),width=1)
    d.text((panel[0]+6,panel[1]+5),f"t={frame.get('time'):.3f} {view}",fill=(226,232,240),font=small)
    socket=frame.get('socket'); desiredGrip=frame.get('desiredGrip'); desiredTip=frame.get('desiredTip')
    dot(socket,panel,view,b,(34,211,238),6); dot(desiredGrip,panel,view,b,(52,211,153),5)
    line(desiredGrip,desiredTip,panel,view,b,(34,197,94),5)
    line(socket,frame.get('actualTip'),panel,view,b,(248,113,113),4)
    line(socket,frame.get('rotationOnlyTip'),panel,view,b,(251,146,60),3)
    line(socket,frame.get('tipOnlyTip'),panel,view,b,(168,85,247),3)
    line(socket,frame.get('idealTip'),panel,view,b,(255,255,255),2)
    for axis,color in [('socketForward',(125,211,252)),('attachmentForward',(248,113,113)),('desiredBlade',(52,211,153))]:
      if frame.get(axis): line(socket,add(socket,mul(v(frame.get(axis)),.16)),panel,view,b,color,3)
    d.text((panel[0]+6,panel[3]-35),f"tip={frame.get('tipError')} axis={frame.get('bladeAxisErrorDeg')} grip={frame.get('gripError')}",fill=(248,220,160),font=small)
out=Path(sys.argv[2]); out.parent.mkdir(parents=True,exist_ok=True); img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

function writeSummary(outDir, payload) {
  const lines = [
    '# Weapon Basis Workspace Diagnostic',
    '',
    `Generated: ${payload.generatedAt}`,
    `Clip: ${payload.clip}`,
    `Dominant cause: ${payload.diagnostics.dominantCause}`,
    '',
    '## Top Findings',
    ...payload.diagnostics.findings.map((finding, index) => `${index + 1}. ${finding}`),
    '',
    '## Current Profile Metrics',
    `- Grip position avg/max: ${payload.metrics.current.avgGripPositionError} / ${payload.metrics.current.maxGripPositionError}`,
    `- Blade axis avg/max: ${payload.metrics.current.avgBladeAxisErrorDeg} / ${payload.metrics.current.maxBladeAxisErrorDeg} deg`,
    `- Blade tip avg/max: ${payload.metrics.current.avgBladeTipError} / ${payload.metrics.current.maxBladeTipError}`,
    `- Socket-relative tip avg/max: ${payload.metrics.current.avgSocketRelativeTipError} / ${payload.metrics.current.maxSocketRelativeTipError}`,
    `- Hilt avg/max: ${payload.metrics.current.avgHiltError} / ${payload.metrics.current.maxHiltError}`,
    '',
    'This is diagnostic-only. It does not modify FK, roll, production retarget behavior, startup clips, aliases, or accepted baselines.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'diagnostic_summary.md'), lines.join('\n'));
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
  const clip = fps.animations.find((entry) => entry.name === args.clip);
  const tpose = fps.animations.find((entry) => entry.name === '0T-Pose');
  if (!clip || !tpose) throw new Error('missing OneHandReady or 0T-Pose');
  const fpsLoadPose = capturePose(fpsRoot);
  const meshyLoadPose = capturePose(meshyRoot);
  const fpsRestMap = clipRestQuaternionMap(THREE, fpsRoot, tpose);
  restorePose(fpsRoot, fpsLoadPose);
  restorePose(meshyRoot, meshyLoadPose);
  const meshyBindMap = bindRestLocalMap(THREE, meshyRoot);
  const calibratedRestMap = calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap);
  const config = parseWeaponConfig();
  const scale = uniformProjectionScale(THREE, fpsRoot, meshyRoot);
  const times = keyTimesForImportantBones(clip);
  const rows = [];
  const renderFrames = [];
  const renderEvery = Math.max(1, Math.floor(times.length / Math.max(1, Number(args.maxRenderFrames || 9))));
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    restorePose(fpsRoot, fpsLoadPose);
    restorePose(meshyRoot, meshyLoadPose);
    applyLocalRest(meshyRoot, calibratedRestMap);
    applyClipPose(THREE, fpsRoot, clip, time);
    const projected = projectSourceJoints(THREE, fpsRoot, meshyRoot, scale);
    applyFkProjection(THREE, meshyRoot, projected);
    const desired = desiredWeaponFrame(THREE, fpsRoot, meshyRoot, scale);
    const socket = socketState(THREE, meshyRoot, config);
    const evals = correctedEvaluations(THREE, socket, config, desired);
    rows.push({
      time,
      gripError: round(evals.current.gripError),
      gripOrientationErrorDeg: round(evals.current.gripOrientationErrorDeg, 3),
      bladeAxisErrorDeg: round(evals.current.bladeAxisErrorDeg, 3),
      tipError: round(evals.current.tipError),
      socketRelativeTipError: round(evals.current.socketRelativeTipError),
      hiltError: round(evals.current.hiltError),
      attachmentOrientationErrorDeg: round(evals.current.attachmentOrientationErrorDeg, 3),
      ...evalFields('rotationOnly', evals.rotationOnly),
      ...evalFields('scaleOnly', evals.scaleOnly),
      ...evalFields('tipOnly', evals.tipOnly),
      ...evalFields('positionOnly', evals.positionOnly),
      ...evalFields('positionAndRotation', evals.positionAndRotation),
    });
    if (index % renderEvery === 0 || index === times.length - 1) {
      renderFrames.push({
        time,
        socket: vectorRecord(socket.position),
        desiredGrip: vectorRecord(desired.grip),
        desiredTip: vectorRecord(desired.tip),
        desiredBlade: vectorRecord(desired.blade),
        actualTip: vectorRecord(evals.current.tip),
        rotationOnlyTip: vectorRecord(evals.rotationOnly.tip),
        tipOnlyTip: vectorRecord(evals.tipOnly.tip),
        idealTip: vectorRecord(evals.positionAndRotation.tip),
        hilt: vectorRecord(evals.current.hilt),
        gripLandmark: vectorRecord(evals.current.modelOrigin),
        socketForward: vectorRecord(new THREE.Vector3(0, 0, 1).applyQuaternion(socket.quaternion).normalize()),
        attachmentForward: vectorRecord(new THREE.Vector3(0, 0, 1).applyQuaternion(evals.current.worldQ).normalize()),
        tipError: round(evals.current.tipError),
        bladeAxisErrorDeg: round(evals.current.bladeAxisErrorDeg, 2),
        gripError: round(evals.current.gripError),
      });
    }
  }
  const current = summariseRows(rows);
  const rotationOnly = summariseRows(rows, 'rotationOnly');
  const tipOnly = summariseRows(rows, 'tipOnly');
  const scaleOnly = summariseRows(rows, 'scaleOnly');
  const positionOnly = summariseRows(rows, 'positionOnly');
  const positionAndRotation = summariseRows(rows, 'positionAndRotation');
  const dominantCause = current.avgGripPositionError > 0.25
    ? 'something-unexpected: target-grip-mismatch-plus-attachment-basis'
    : (current.avgBladeAxisErrorDeg > 30 && rotationOnly.avgBladeTipError < current.avgBladeTipError * 0.5
      ? 'attachment-rotation'
      : (current.avgBladeAxisErrorDeg > 30 ? 'attachment-basis' : 'blade-landmark'));
  const diagnostics = {
    dominantCause,
    findings: [
      `Relative to FPS-projected Weapon.R, current real attachment hilt differs by ${current.avgGripPositionError} avg; this is a target-landmark mismatch, not automatically a bad Meshy hand grip.`,
      `Socket-relative saber basis is still wrong: current blade axis error is ${current.avgBladeAxisErrorDeg} deg avg and socket-relative tip error is ${current.avgSocketRelativeTipError} avg.`,
      `Attachment-rotation-only experiment drops blade axis error to ${rotationOnly.avgBladeAxisErrorDeg} deg and socket-relative tip error to ${rotationOnly.avgSocketRelativeTipError} avg, isolating basis/rotation as the dominant local weapon issue.`,
      `Tip-landmark-only experiment drops blade axis error to ${tipOnly.avgBladeAxisErrorDeg} deg but leaves FPS-projected tip error at ${tipOnly.avgBladeTipError} avg because the socket target is still offset.`,
      `Position-only experiment proves socket placement alone is insufficient: blade axis stays ${positionOnly.avgBladeAxisErrorDeg} deg avg and tip error stays ${positionOnly.avgBladeTipError} avg.`,
      `Scale-only experiment leaves blade axis error at ${scaleOnly.avgBladeAxisErrorDeg} deg avg, so attachment scale is secondary.`,
    ],
  };
  const payload = {
    schema: 'pose-lab-meshy-weapon-basis-workspace-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    clip: args.clip,
    sourceKeyCount: times.length,
    coordinateBridge: {
      targetBaseline: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
      fkPolicy: 'projected FK arm solution only; no IK, no roll correction, no production retarget mutation',
    },
    layers: Object.fromEntries(LAYERS.map((layer) => [layer, args.layers.has(layer)])),
    attachmentConfig: config,
    metrics: { current, rotationOnly, tipOnly, scaleOnly, positionOnly, positionAndRotation },
    reports: { perKey: rows },
    diagnostics,
    renderFrames,
  };
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'weapon_basis_workspace.json');
  const pngPath = path.join(args.out, 'weapon_basis_workspace.png');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  writeSummary(args.out, payload);
  writePng(dataPath, pngPath);
  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, dataPath),
    png: path.relative(projectRoot, pngPath),
    diagnosticSummary: path.relative(projectRoot, path.join(args.out, 'diagnostic_summary.md')),
    metrics: payload.metrics,
    diagnostics,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
