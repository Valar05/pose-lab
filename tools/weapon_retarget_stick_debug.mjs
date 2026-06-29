#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'weapon_retarget_debug', 'meshy_swing1');

const PRESETS = {
  ruinedAir: {
    source: 'assets/models/ruined_air/Scavenger_new.fbx',
    sourceFormat: 'fbx',
    target: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    clip: 'Armature|Swing1',
    out: defaultOut,
    pathMode: 'authored-diagonal-cut',
    pathScale: 2.0,
    sourceAnchor: 'RightShoulder',
    sourceGrip: 'RightHand',
    sourceTipBones: ['SwordR_end', 'SwordR'],
    sourceChest: 'Spine',
    sourceLabel: 'Ruined Air source',
  },
  fpsPlayer: {
    source: 'assets/models/FPSPlayer.glb',
    sourceFormat: 'glb',
    target: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    clip: 'OneHandAttack1',
    out: path.join(projectRoot, 'generated', 'weapon_retarget_debug', 'fps_onehand_attack1'),
    pathMode: 'source-derived',
    pathScale: 2.5,
    sourceAnchor: 'ShoulderCenter',
    sourceGrip: 'HandR',
    sourceSocket: 'WeaponR',
    sourceTipLocal: [0.00854, 0.57786, 0.00995],
    sourceChest: 'ShoulderCenter',
    sourceLabel: 'FPS Arms source',
  },
};

function parseArgs(argv) {
  const explicit = new Set();
  const args = {
    preset: 'ruinedAir',
    targetFormat: 'glb',
    fps: 30,
    tipLift: 0,
    reachScale: 0.98,
    noPng: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const read = () => argv[++i];
    if (arg === '--preset') { args.preset = read(); explicit.add('preset'); }
    else if (arg === '--source') { args.source = read(); explicit.add('source'); }
    else if (arg === '--source-format') { args.sourceFormat = read(); explicit.add('sourceFormat'); }
    else if (arg === '--target') { args.target = read(); explicit.add('target'); }
    else if (arg === '--target-format') { args.targetFormat = read(); explicit.add('targetFormat'); }
    else if (arg === '--clip') { args.clip = read(); explicit.add('clip'); }
    else if (arg === '--out') { args.out = read(); explicit.add('out'); }
    else if (arg === '--fps') { args.fps = Number(read()); explicit.add('fps'); }
    else if (arg === '--path-scale') { args.pathScale = Number(read()); explicit.add('pathScale'); }
    else if (arg === '--tip-lift') { args.tipLift = Number(read()); explicit.add('tipLift'); }
    else if (arg === '--reach-scale') { args.reachScale = Number(read()); explicit.add('reachScale'); }
    else if (arg === '--path-mode') { args.pathMode = read(); explicit.add('pathMode'); }
    else if (arg === '--source-anchor') { args.sourceAnchor = read(); explicit.add('sourceAnchor'); }
    else if (arg === '--source-grip') { args.sourceGrip = read(); explicit.add('sourceGrip'); }
    else if (arg === '--source-socket') { args.sourceSocket = read(); explicit.add('sourceSocket'); }
    else if (arg === '--source-chest') { args.sourceChest = read(); explicit.add('sourceChest'); }
    else if (arg === '--source-tip-local') { args.sourceTipLocal = read().split(',').map(Number); explicit.add('sourceTipLocal'); }
    else if (arg === '--no-png') args.noPng = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/weapon_retarget_stick_debug.mjs [--preset ruinedAir|fpsPlayer] [--clip OneHandAttack1] [--out DIR] [--fps 30] [--path-mode source-derived|authored-diagonal-cut]');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  const preset = PRESETS[args.preset];
  if (!preset) throw new Error('unknown preset: ' + args.preset);
  const merged = { ...preset, ...args };
  for (const key of explicit) merged[key] = args[key];
  return merged;
}

function projectPath(value) {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS(ns, name) {
      const listeners = new Map();
      return {
        nodeName: name,
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
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples', 'jsm', 'loaders', 'FBXLoader.js')) || !fs.existsSync(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) {
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

function round(value, digits = 4) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const s = 10 ** digits;
  return Math.round(n * s) / s;
}

function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function deg(rad) { return rad * 180 / Math.PI; }

function findBone(root, name) {
  const wanted = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  let exact = null;
  root.traverse((node) => {
    if (exact || !node.isBone) return;
    if ((node.name || '') === name) exact = node;
  });
  if (exact) return exact;
  let found = null;
  root.traverse((node) => {
    if (found || !node.isBone) return;
    const candidate = String(node.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (candidate === wanted || candidate.endsWith(wanted) || wanted.endsWith(candidate)) found = node;
  });
  return found;
}

function findFirstBone(root, names) {
  for (const name of names || []) {
    const bone = findBone(root, name);
    if (bone) return bone;
  }
  return null;
}

function makeVirtualLocalPoint(THREE, parent, local, name = 'virtualPoint') {
  return {
    name,
    parent,
    getWorldPosition(out) {
      return out.copy(new THREE.Vector3(Number(local[0] || 0), Number(local[1] || 0), Number(local[2] || 0)).applyMatrix4(parent.matrixWorld));
    },
  };
}

function resolveSourceTip(THREE, source, args) {
  if (Array.isArray(args.sourceTipLocal) && args.sourceSocket) {
    const socket = findBone(source, args.sourceSocket);
    if (!socket) return null;
    return makeVirtualLocalPoint(THREE, socket, args.sourceTipLocal, args.sourceSocket + '_virtualTip');
  }
  return findFirstBone(source, args.sourceTipBones || ['SwordR_end', 'SwordR']);
}

function worldPosition(THREE, node) {
  const out = new THREE.Vector3();
  node.getWorldPosition(out);
  return out;
}

function worldQuaternion(THREE, node) {
  const out = new THREE.Quaternion();
  node.getWorldQuaternion(out);
  return out;
}

function setBoneWorldQuaternion(THREE, bone, worldQuat) {
  const parentQ = worldQuaternion(THREE, bone.parent).invert();
  bone.quaternion.copy(parentQ.multiply(worldQuat).normalize());
}

function rotateJointToward(THREE, root, joint, end, targetWorld, strength) {
  const jointPos = worldPosition(THREE, joint);
  const endDir = worldPosition(THREE, end).sub(jointPos);
  const targetDir = targetWorld.clone().sub(jointPos);
  if (endDir.lengthSq() < 1e-8 || targetDir.lengthSq() < 1e-8) return false;
  const turn = new THREE.Quaternion().setFromUnitVectors(endDir.normalize(), targetDir.normalize());
  if (strength < 1) turn.slerp(new THREE.Quaternion(), 1 - strength).normalize();
  setBoneWorldQuaternion(THREE, joint, turn.multiply(worldQuaternion(THREE, joint)).normalize());
  root.updateMatrixWorld(true);
  return true;
}

function solveTwoBoneIk(THREE, root, upper, lower, hand, targetWorld, iterations = 8) {
  for (let i = 0; i < iterations; i += 1) {
    rotateJointToward(THREE, root, lower, hand, targetWorld, 0.95);
    rotateJointToward(THREE, root, upper, hand, targetWorld, 0.85);
  }
}

function capturePose(root) {
  const pose = new Map();
  root.traverse((node) => {
    if (node.isBone) pose.set(node.uuid, { node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  });
  return pose;
}

function restorePose(root, pose) {
  for (const entry of pose.values()) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
  }
  root.updateMatrixWorld(true);
}

function localFromWorld(THREE, anchor, node) {
  const p = worldPosition(THREE, node);
  anchor.worldToLocal(p);
  return p;
}

function makeShoulderFrame(THREE, shoulder, hand, chest) {
  const origin = worldPosition(THREE, shoulder);
  const x = worldPosition(THREE, hand).sub(origin);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const upSeed = chest ? worldPosition(THREE, chest).sub(origin) : new THREE.Vector3(0, 1, 0);
  if (upSeed.lengthSq() < 1e-8) upSeed.set(0, 1, 0);
  let z = new THREE.Vector3().crossVectors(x, upSeed);
  if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 0, 1));
  if (z.lengthSq() < 1e-8) z = new THREE.Vector3(0, 0, 1);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return { origin, x, y, z };
}

function frameLocalPoint(THREE, frame, nodeOrPoint) {
  const p = nodeOrPoint?.isVector3 ? nodeOrPoint.clone() : worldPosition(THREE, nodeOrPoint);
  const v = p.sub(frame.origin);
  return new THREE.Vector3(v.dot(frame.x), v.dot(frame.y), v.dot(frame.z));
}

function frameWorldPoint(THREE, frame, local) {
  return frame.origin.clone()
    .add(frame.x.clone().multiplyScalar(local.x))
    .add(frame.y.clone().multiplyScalar(local.y))
    .add(frame.z.clone().multiplyScalar(local.z));
}

function makeBodyCutFrame(THREE, shoulder, oppositeShoulder, chest, hips) {
  const origin = worldPosition(THREE, shoulder);
  const other = oppositeShoulder ? worldPosition(THREE, oppositeShoulder) : origin.clone().add(new THREE.Vector3(1, 0, 0));
  let lateral = origin.clone().sub(other);
  if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
  lateral.normalize();
  const chestPos = chest ? worldPosition(THREE, chest) : origin.clone().add(new THREE.Vector3(0, 1, 0));
  const hipPos = hips ? worldPosition(THREE, hips) : origin.clone().add(new THREE.Vector3(0, -1, 0));
  let up = chestPos.clone().sub(hipPos);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  let forward = new THREE.Vector3().crossVectors(lateral, up);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  up = new THREE.Vector3().crossVectors(forward, lateral).normalize();
  return { origin, lateral, up, forward };
}

function bodyFrameWorldPoint(THREE, frame, local) {
  return frame.origin.clone()
    .add(frame.lateral.clone().multiplyScalar(local.x))
    .add(frame.up.clone().multiplyScalar(local.y))
    .add(frame.forward.clone().multiplyScalar(local.z));
}

function authoredSabrePoint(THREE, phase) {
  const keys = [
    { t: 0.0, p: [0.34, -0.42, 0.16] },
    { t: 0.18, p: [0.58, 0.18, 0.22] },
    { t: 0.34, p: [0.78, 0.54, 0.30] },
    { t: 0.48, p: [0.66, 0.42, 0.34] },
    { t: 0.64, p: [0.48, 0.10, 0.28] },
    { t: 0.82, p: [0.36, -0.30, 0.20] },
    { t: 1.0, p: [0.34, -0.42, 0.16] },
  ];
  const t = clamp(Number(phase) || 0, 0, 1);
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const u = clamp((t - a.t) / span, 0, 1);
  const eased = u * u * (3 - 2 * u);
  return new THREE.Vector3(
    a.p[0] + (b.p[0] - a.p[0]) * eased,
    a.p[1] + (b.p[1] - a.p[1]) * eased,
    a.p[2] + (b.p[2] - a.p[2]) * eased,
  );
}

function armLength(THREE, upper, lower, hand) {
  return worldPosition(THREE, upper).distanceTo(worldPosition(THREE, lower)) + worldPosition(THREE, lower).distanceTo(worldPosition(THREE, hand));
}

function bladeTipWorld(THREE, hand, tipOffset = [0, 0, 0.85]) {
  const offset = new THREE.Vector3(Number(tipOffset[0] || 0), Number(tipOffset[1] || 0), Number(tipOffset[2] ?? 0.85));
  return worldPosition(THREE, hand).add(offset.applyQuaternion(worldQuaternion(THREE, hand)));
}

function clampToReach(THREE, shoulder, targetWorld, chainLength, reachScale) {
  const shoulderWorld = worldPosition(THREE, shoulder);
  const offset = targetWorld.clone().sub(shoulderWorld);
  const maxReach = Math.max(0.001, chainLength * reachScale);
  if (offset.length() > maxReach) offset.setLength(maxReach);
  return shoulderWorld.add(offset);
}

function aimHandBladeAt(THREE, root, hand, targetTipWorld, tipOffset = [0, 0, 0.85]) {
  const handWorld = worldPosition(THREE, hand);
  const current = bladeTipWorld(THREE, hand, tipOffset).sub(handWorld);
  const desired = targetTipWorld.clone().sub(handWorld);
  if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return false;
  const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
  setBoneWorldQuaternion(THREE, hand, turn.multiply(worldQuaternion(THREE, hand)).normalize());
  root.updateMatrixWorld(true);
  return true;
}

function travel(points, THREE) {
  if (!points.length) return 0;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) { min.min(p); max.max(p); }
  return max.sub(min).length();
}

function angleSweep(points, pivot, THREE) {
  let maxAngle = 0;
  const dirs = points.map((p) => p.clone().sub(pivot)).filter((v) => v.lengthSq() > 1e-8).map((v) => v.normalize());
  for (let i = 0; i < dirs.length; i += 1) {
    for (let j = i + 1; j < dirs.length; j += 1) maxAngle = Math.max(maxAngle, deg(dirs[i].angleTo(dirs[j])));
  }
  return maxAngle;
}

function average(values = []) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function maxValue(values = []) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : 0;
}

function vectorAngleDeg(a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return deg(a.clone().normalize().angleTo(b.clone().normalize()));
}

function sampleTimes(duration, fps) {
  const fixed = [0, 0.18, 0.39, 0.53, 0.72, 1.0].map((t) => Math.min(duration, t));
  const count = Math.max(2, Math.ceil(duration * fps) + 1);
  const dense = [];
  for (let i = 0; i < count; i += 1) dense.push((duration * i) / (count - 1));
  return [...new Set([...fixed, ...dense].map((t) => round(t, 5)))].sort((a, b) => a - b);
}

async function loadModel(filePath, format, FBXLoader, GLTFLoader) {
  const ext = String(format || path.extname(filePath).slice(1)).toLowerCase();
  if (ext === 'fbx') return new FBXLoader().parse(arrayBuffer(filePath), path.dirname(filePath) + path.sep);
  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(arrayBuffer(filePath), path.dirname(filePath) + path.sep, resolve, reject);
    });
    const scene = gltf.scene;
    scene.animations = gltf.animations || [];
    return scene;
  }
  throw new Error('unsupported model format: ' + ext);
}

async function loadAssets(THREE, FBXLoader, GLTFLoader, args) {
  const sourcePath = projectPath(args.source);
  const targetPath = projectPath(args.target);
  const source = await loadModel(sourcePath, args.sourceFormat, FBXLoader, GLTFLoader);
  const target = await loadModel(targetPath, args.targetFormat || 'glb', FBXLoader, GLTFLoader);
  return { source, target, sourcePath, targetPath };
}

function metricVerdict(metrics) {
  if (metrics.bladeSweepDeg < 35 || metrics.targetSourceGripTravelRatio < 0.3) return 'covert-wave';
  if (metrics.bladeSweepDeg < 60 || metrics.targetSourceGripTravelRatio < 0.55) return 'under-travel';
  return metrics.hitHandAboveShoulder < -0.1 ? 'readable-low-sabre' : 'source-like';
}

function buildDiagnostic(THREE, source, target, clipName, args) {
  const clip = source.animations.find((entry) => entry.name === clipName);
  if (!clip) throw new Error('clip not found: ' + clipName);
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const sourcePose = capturePose(source);
  const targetPose = capturePose(target);
  const sourceMixer = new THREE.AnimationMixer(source);
  const action = sourceMixer.clipAction(clip);
  action.play();

  const sourceAnchor = findBone(source, args.sourceAnchor || 'RightShoulder');
  const sourceGrip = findBone(source, args.sourceGrip || 'RightHand');
  const sourceTip = resolveSourceTip(THREE, source, args);
  const sourceChest = findBone(source, args.sourceChest || 'Spine') || sourceAnchor;
  const targetAnchor = findBone(target, 'RightShoulder');
  const targetLeftShoulder = findBone(target, 'LeftShoulder');
  const upper = findBone(target, 'RightArm');
  const lower = findBone(target, 'RightForeArm');
  const hand = findBone(target, 'RightHand');
  const targetChest = findBone(target, 'Spine') || targetAnchor;
  const leftHand = findBone(target, 'LeftHand');
  const targetHead = findBone(target, 'Head');
  const targetHips = findBone(target, 'Hips') || findBone(target, 'Root');
  const missing = Object.entries({ sourceAnchor, sourceGrip, sourceTip, targetAnchor, upper, lower, hand }).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error('missing bones: ' + missing.join(', '));

  const targetRestTipWorld = bladeTipWorld(THREE, hand);
  const sourceRestFrame = makeShoulderFrame(THREE, sourceAnchor, sourceGrip, sourceChest);
  const targetRestFrame = makeShoulderFrame(THREE, targetAnchor, hand, targetChest);
  const sourceRestGripLocal = frameLocalPoint(THREE, sourceRestFrame, sourceGrip);
  const targetRestGripLocal = frameLocalPoint(THREE, targetRestFrame, hand);
  const sourceRestTipLocal = frameLocalPoint(THREE, sourceRestFrame, sourceTip);
  const targetArmLength = armLength(THREE, upper, lower, hand);
  const sourceArmLength = Math.max(0.0001, worldPosition(THREE, sourceAnchor).distanceTo(worldPosition(THREE, sourceGrip)));
  const targetBladeLength = Math.max(0.05, targetRestTipWorld.distanceTo(worldPosition(THREE, hand)));
  const chainLength = armLength(THREE, upper, lower, hand);
  const times = sampleTimes(clip.duration, args.fps);

  const sourceGripPoints = [];
  const sourceTipPoints = [];
  const targetGripPoints = [];
  const targetTipPoints = [];
  const bladeDirErrors = [];
  const gripLocalErrors = [];
  const frames = [];
  let reachClampSamples = 0;
  let maxReachClampRatio = 0;

  for (const time of times) {
    restorePose(source, sourcePose);
    restorePose(target, targetPose);
    sourceMixer.setTime(time);
    source.updateMatrixWorld(true);
    target.updateMatrixWorld(true);

    let desiredTipWorld;
    let desiredGripWorld;
    if (args.pathMode === 'authored-diagonal-cut') {
      const bodyFrame = makeBodyCutFrame(THREE, targetAnchor, targetLeftShoulder, targetChest, targetHips);
      const phase = clamp(time / Math.max(0.001, clip.duration), 0, 1);
      const gripLocal = authoredSabrePoint(THREE, phase).multiplyScalar(targetArmLength);
      const nextGripLocal = authoredSabrePoint(THREE, Math.min(1, phase + 0.035)).multiplyScalar(targetArmLength);
      const cutDirection = nextGripLocal.clone().sub(gripLocal);
      if (cutDirection.lengthSq() < 1e-8) cutDirection.set(-1, -0.7, -0.35);
      cutDirection.normalize();
      desiredGripWorld = bodyFrameWorldPoint(THREE, bodyFrame, gripLocal);
      desiredTipWorld = desiredGripWorld.clone()
        .add(bodyFrame.lateral.clone().multiplyScalar(cutDirection.x * targetBladeLength))
        .add(bodyFrame.up.clone().multiplyScalar(cutDirection.y * targetBladeLength))
        .add(bodyFrame.forward.clone().multiplyScalar((Math.abs(cutDirection.z) > 0.001 ? cutDirection.z : -0.18) * targetBladeLength))
        .add(bodyFrame.up.clone().multiplyScalar(targetBladeLength * 0.18));
    } else {
      const sourceFrame = makeShoulderFrame(THREE, sourceAnchor, sourceGrip, sourceChest);
      const targetFrame = makeShoulderFrame(THREE, targetAnchor, hand, targetChest);
      const sourceGripLocal = frameLocalPoint(THREE, sourceFrame, sourceGrip);
      const sourceTipLocal = frameLocalPoint(THREE, sourceFrame, sourceTip);
      const sourceGripDelta = sourceGripLocal.clone().sub(sourceRestGripLocal).multiplyScalar((targetArmLength / sourceArmLength) * args.pathScale);
      const sourceBladeLocalDir = sourceTipLocal.clone().sub(sourceGripLocal).normalize();
      const targetGripLocal = targetRestGripLocal.clone().add(sourceGripDelta);
      const swingPulse = Math.sin(Math.PI * clamp(time / Math.max(0.001, clip.duration), 0, 1));
      const liftAmount = targetArmLength * Number(args.tipLift || 0) * swingPulse;
      targetGripLocal.y += liftAmount * 0.55;
      const targetTipLocal = targetGripLocal.clone().add(sourceBladeLocalDir.multiplyScalar(targetBladeLength));
      targetTipLocal.y += liftAmount;
      desiredGripWorld = frameWorldPoint(THREE, targetFrame, targetGripLocal);
      desiredTipWorld = frameWorldPoint(THREE, targetFrame, targetTipLocal);
    }
    const shoulderWorld = worldPosition(THREE, upper);
    const rawReach = shoulderWorld.distanceTo(desiredGripWorld);
    const maxReach = chainLength * args.reachScale;
    const clampRatio = rawReach / Math.max(0.001, maxReach);
    if (clampRatio > 1) reachClampSamples += 1;
    maxReachClampRatio = Math.max(maxReachClampRatio, clampRatio);
    const clampedGrip = clampToReach(THREE, upper, desiredGripWorld, chainLength, args.reachScale);
    solveTwoBoneIk(THREE, target, upper, lower, hand, clampedGrip, 9);
    aimHandBladeAt(THREE, target, hand, desiredTipWorld);

    const sourceGripWorld = worldPosition(THREE, sourceGrip);
    const sourceTipWorld = worldPosition(THREE, sourceTip);
    const targetGripWorld = worldPosition(THREE, hand);
    const targetTipWorld = bladeTipWorld(THREE, hand);
    const compareSourceFrame = makeShoulderFrame(THREE, sourceAnchor, sourceGrip, sourceChest);
    const compareTargetFrame = makeShoulderFrame(THREE, targetAnchor, hand, targetChest);
    const sourceBladeLocal = frameLocalPoint(THREE, compareSourceFrame, sourceTipWorld).sub(frameLocalPoint(THREE, compareSourceFrame, sourceGripWorld));
    const targetBladeLocal = frameLocalPoint(THREE, compareTargetFrame, targetTipWorld).sub(frameLocalPoint(THREE, compareTargetFrame, targetGripWorld));
    bladeDirErrors.push(vectorAngleDeg(sourceBladeLocal, targetBladeLocal));
    const sourceGripLocalNow = frameLocalPoint(THREE, compareSourceFrame, sourceGripWorld).sub(sourceRestGripLocal).multiplyScalar(targetArmLength / Math.max(0.0001, sourceArmLength));
    const targetGripLocalNow = frameLocalPoint(THREE, compareTargetFrame, targetGripWorld).sub(targetRestGripLocal);
    gripLocalErrors.push(sourceGripLocalNow.distanceTo(targetGripLocalNow));
    sourceGripPoints.push(sourceGripWorld.clone());
    sourceTipPoints.push(sourceTipWorld.clone());
    targetGripPoints.push(targetGripWorld.clone());
    targetTipPoints.push(targetTipWorld.clone());
    frames.push({
      time: round(time, 4),
      source: collectFramePoints(THREE, source, {
        hips: findBone(source, 'Hips') || findBone(source, 'Root'),
        chest: sourceChest,
        rightShoulder: sourceAnchor,
        rightArm: findBone(source, 'RightArm'),
        rightForeArm: findBone(source, 'RightForeArm'),
        rightHand: sourceGrip,
        bladeTip: sourceTip,
      }),
      target: collectFramePoints(THREE, target, {
        hips: targetHips,
        chest: targetChest,
        head: targetHead,
        leftHand,
        rightShoulder: targetAnchor,
        rightArm: upper,
        rightForeArm: lower,
        rightHand: hand,
        bladeTip: { getWorldPosition(out) { return out.copy(targetTipWorld); } },
      }),
    });
  }

  const sourceTipTravel = travel(sourceTipPoints, THREE);
  const targetTipTravel = travel(targetTipPoints, THREE);
  const sourceGripTravel = travel(sourceGripPoints, THREE);
  const targetGripTravel = travel(targetGripPoints, THREE);
  const axisTravel = (points, axis) => points.length ? Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis])) : 0;
  const targetGripXTravel = axisTravel(targetGripPoints, 'x');
  const targetGripYTravel = axisTravel(targetGripPoints, 'y');
  const targetGripZTravel = axisTravel(targetGripPoints, 'z');
  const targetTipZTravel = axisTravel(targetTipPoints, 'z');
  const targetGripMinX = targetGripPoints.length ? Math.min(...targetGripPoints.map((p) => p.x)) : 0;
  const targetBladeLeverLength = targetTipPoints.length ? targetTipPoints.reduce((sum, point, index) => sum + point.distanceTo(targetGripPoints[index]), 0) / targetTipPoints.length : 0;
  const sourceScale = targetArmLength / Math.max(0.0001, sourceArmLength);
  const shoulderPivot = worldPosition(THREE, targetAnchor);
  const hitIndex = frames.reduce((best, frame, index) => Math.abs(frame.time - 0.53) < Math.abs(frames[best].time - 0.53) ? index : best, 0);
  const hitHand = targetGripPoints[hitIndex];
  const hitShoulder = shoulderPivot;
  const metrics = {
    clipName,
    duration: round(clip.duration, 4),
    sampleCount: times.length,
    sourceGripTravel: round(sourceGripTravel),
    sourceTipTravel: round(sourceTipTravel),
    targetGripTravel: round(targetGripTravel),
    targetTipTravel: round(targetTipTravel),
    targetSourceGripTravelRatio: round(targetGripTravel / Math.max(0.0001, sourceGripTravel * sourceScale)),
    targetGripXTravel: round(targetGripXTravel),
    targetGripYTravel: round(targetGripYTravel),
    targetGripZTravel: round(targetGripZTravel),
    targetTipZTravel: round(targetTipZTravel),
    targetGripMinX: round(targetGripMinX),
    targetBladeLeverLength: round(targetBladeLeverLength),
    targetSourceTipTravelRatio: round(targetTipTravel / Math.max(0.0001, sourceTipTravel * sourceScale)),
    bladeSweepDeg: round(angleSweep(targetTipPoints, shoulderPivot, THREE), 2),
    sourceBladeSweepDeg: round(angleSweep(sourceTipPoints, worldPosition(THREE, sourceAnchor), THREE), 2),
    avgBladeDirErrorDeg: round(average(bladeDirErrors), 2),
    maxBladeDirErrorDeg: round(maxValue(bladeDirErrors), 2),
    avgGripLocalError: round(average(gripLocalErrors)),
    maxGripLocalError: round(maxValue(gripLocalErrors)),
    hitHandAboveShoulder: round(hitHand.y - hitShoulder.y),
    hitHandDistanceFromShoulder: round(hitHand.distanceTo(hitShoulder)),
    maxReachClampRatio: round(maxReachClampRatio),
    reachClampSamples,
    pathMode: args.pathMode,
    preset: args.preset,
    sourceFormat: args.sourceFormat || path.extname(args.source).slice(1).toLowerCase(),
    pathScale: args.pathScale,
    tipLift: args.tipLift,
  };
  metrics.verdict = metricVerdict(metrics);
  return { metrics, frames };
}

function collectFramePoints(THREE, root, bones) {
  const out = {};
  for (const [name, bone] of Object.entries(bones)) {
    if (!bone) continue;
    const p = new THREE.Vector3();
    bone.getWorldPosition(p);
    out[name] = point(p);
  }
  return out;
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
}

function renderPng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-weapon-stick-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

data = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
frames = data['frames']
W, H = 1500, 1160
img = Image.new('RGB', (W, H), (8, 12, 16))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 18)
    small = ImageFont.truetype('DejaVuSans.ttf', 14)
except Exception:
    font = small = None

def project(points, box, panel, view):
    x0, y0, x1, y1 = panel
    vals = [p for p in points.values() if isinstance(p, list)]
    if not vals:
        return {}
    if view == 'front':
        ai, bi = 0, 1
    else:
        ai, bi = 0, 2
    min_a, max_a = min(p[ai] for p in vals), max(p[ai] for p in vals)
    min_b, max_b = min(p[bi] for p in vals), max(p[bi] for p in vals)
    span = max(max_a-min_a, max_b-min_b, 0.001)
    cx, cy = (min_a+max_a)/2, (min_b+max_b)/2
    scale = min((x1-x0)*0.72, (y1-y0)*0.72) / span
    out = {}
    for key, p in points.items():
        a, b = p[ai], p[bi]
        out[key] = ((x0+x1)/2 + (a-cx)*scale, (y0+y1)/2 - (b-cy)*scale)
    return out

def draw_chain(draw, pts, names, color, width=4):
    coords = [pts.get(n) for n in names if pts.get(n)]
    for a, b in zip(coords, coords[1:]):
        draw.line([a, b], fill=color, width=width)
    for c in coords:
        r = 4
        draw.ellipse([c[0]-r, c[1]-r, c[0]+r, c[1]+r], fill=color)

def draw_pose(frame, panel, view):
    src = project(frame['source'], None, panel, view)
    tgt = project(frame['target'], None, panel, view)
    sx0, sy0, sx1, sy1 = panel
    d.rectangle(panel, outline=(58,73,86), width=1)
    d.text((sx0+8, sy0+6), f"t={frame['time']:.3f} {view}", fill=(230,236,220), font=small)
    draw_chain(d, src, ['hips','chest','rightShoulder','rightArm','rightForeArm','rightHand','bladeTip'], (234,198,65), 3)
    draw_chain(d, tgt, ['hips','chest','rightShoulder','rightArm','rightForeArm','rightHand','bladeTip'], (66,233,255), 4)
    if 'leftHand' in tgt and 'chest' in tgt:
        draw_chain(d, tgt, ['leftHand','chest'], (180,180,180), 2)
    for pts, color in [(src, (234,198,65)), (tgt, (66,233,255))]:
        if pts.get('rightHand') and pts.get('bladeTip'):
            d.line([pts['rightHand'], pts['bladeTip']], fill=color, width=5)

cols = 3
rows = min(6, math.ceil(len(frames[:6]) / cols))
panel_w = W // cols
panel_h = 250

# Pick representative frames across the full swing instead of the first dense startup samples.
if len(frames) >= 6:
    picks = [0, round((len(frames)-1)*0.12), round((len(frames)-1)*0.32), round((len(frames)-1)*0.52), round((len(frames)-1)*0.76), len(frames)-1]
    draw_frames = [frames[int(i)] for i in picks]
else:
    draw_frames = frames
for i, frame in enumerate(draw_frames):
    col = i % cols
    row = i // cols
    draw_pose(frame, (col*panel_w+8, 58+row*panel_h, (col+1)*panel_w-8, 58+(row+1)*panel_h-8), 'front')
    draw_pose(frame, (col*panel_w+8, 58+(row+2)*panel_h, (col+1)*panel_w-8, 58+(row+3)*panel_h-8), 'top')

m = data['metrics']
title = f"{m['clipName']} | verdict={m['verdict']} | gripRatio={m['targetSourceGripTravelRatio']} bladeErr={m.get('avgBladeDirErrorDeg',0)}/{m.get('maxBladeDirErrorDeg',0)}deg lever={m.get('targetBladeLeverLength',0)} sweep={m['bladeSweepDeg']}deg clamp={m['reachClampSamples']}"
d.text((18, 18), title, fill=(255,240,180), font=font)
d.text((18, H-32), f"yellow={data.get('sourceLabel','source')}, cyan=Meshy target ({m.get('pathMode','source-derived')})", fill=(200,220,230), font=small)
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
  const { FBXLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/FBXLoader.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const { source, target, sourcePath, targetPath } = await loadAssets(THREE, FBXLoader, GLTFLoader, args);
  const diagnostic = buildDiagnostic(THREE, source, target, args.clip, args);
  const outDir = projectPath(args.out);
  const dataPath = path.join(outDir, 'weapon_retarget_debug.json');
  const pngPath = path.join(outDir, 'weapon_retarget_stick_sheet.png');
  const manifest = {
    schema: 'pose-lab-weapon-retarget-stick-debug-v1',
    generatedAt: new Date().toISOString(),
    preset: args.preset,
    sourceLabel: args.sourceLabel || 'source',
    source: path.relative(projectRoot, sourcePath),
    target: path.relative(projectRoot, targetPath),
    clip: args.clip,
    metrics: diagnostic.metrics,
    frames: diagnostic.frames,
    outputs: { json: path.relative(projectRoot, dataPath), png: args.noPng ? '' : path.relative(projectRoot, pngPath) },
  };
  writeJson(dataPath, manifest);
  if (!args.noPng) renderPng(dataPath, pngPath);
  console.log(JSON.stringify({ ok: true, manifest: path.relative(projectRoot, dataPath), png: args.noPng ? '' : path.relative(projectRoot, pngPath), metrics: diagnostic.metrics }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
