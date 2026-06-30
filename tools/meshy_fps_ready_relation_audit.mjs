#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceScaleOverride = (() => {
  const index = process.argv.indexOf('--source-scale');
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : null;
})();

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= { createElementNS() { const listeners = new Map(); return { style: {}, width: 1, height: 1, addEventListener(t, f) { listeners.set(t, f); }, removeEventListener(t) { listeners.delete(t); }, set src(v) { this._src = v; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); }, get src() { return this._src || ''; } }; } };
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

function arrayBuffer(file) { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function round(value, digits = 4) { const scale = 10 ** digits; return Math.round(Number(value || 0) * scale) / scale; }
function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function avg(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function max(values) { return values.length ? Math.max(...values) : 0; }

function find(root, name) {
  const wanted = canon(name);
  let out = null;
  root.traverse((node) => { if (!out && canon(node.name) === wanted) out = node; });
  return out;
}

function worldPosition(node) { const out = new THREE.Vector3(); node.getWorldPosition(out); return out; }
function worldQuaternion(node) { const out = new THREE.Quaternion(); node.getWorldQuaternion(out); return out.normalize(); }
function worldDirection(node, axis = [0, 0, 1]) {
  return new THREE.Vector3(Number(axis[0] || 0), Number(axis[1] || 0), Number(axis[2] ?? 1)).applyQuaternion(worldQuaternion(node)).normalize();
}
function localInFrame(frame, node) {
  const local = worldPosition(node);
  frame.worldToLocal(local);
  return local;
}
function segmentDirection(a, b) {
  const direction = worldPosition(b).sub(worldPosition(a));
  return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
}
function mapDirectionBetweenFrames(direction, sourceFrame, targetFrame) {
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(sourceFrame).invert()).normalize();
  return sourceLocal.applyQuaternion(worldQuaternion(targetFrame)).normalize();
}
function projectedAroundAxis(direction, axis) {
  const projected = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : null;
}
function setWorldQuaternion(bone, targetWorld) {
  const parentWorld = worldQuaternion(bone.parent).invert();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}
function rotateJointToward(joint, end, targetWorld, strength = 1) {
  const jointPos = worldPosition(joint);
  const endDir = worldPosition(end).sub(jointPos);
  const targetDir = targetWorld.clone().sub(jointPos);
  if (endDir.lengthSq() < 1e-8 || targetDir.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(endDir.normalize(), targetDir.normalize());
  if (strength < 1) turn.slerp(new THREE.Quaternion(), 1 - strength).normalize();
  setWorldQuaternion(joint, turn.multiply(worldQuaternion(joint)).normalize());
}
function solveTwoBoneIk(root, upper, lower, hand, targetWorld, iterations = 8) {
  for (let i = 0; i < iterations; i += 1) {
    rotateJointToward(lower, hand, targetWorld, 0.95);
    root.updateMatrixWorld(true);
    rotateJointToward(upper, hand, targetWorld, 0.85);
    root.updateMatrixWorld(true);
  }
}
function chainLength(upper, lower, hand) {
  return worldPosition(upper).distanceTo(worldPosition(lower)) + worldPosition(lower).distanceTo(worldPosition(hand));
}
function clampToReach(shoulder, targetWorld, length, reachScale = 0.98) {
  const shoulderWorld = worldPosition(shoulder);
  const offset = targetWorld.clone().sub(shoulderWorld);
  const maxReach = Math.max(0.001, length * reachScale);
  if (offset.length() > maxReach) offset.setLength(maxReach);
  return shoulderWorld.add(offset);
}
function sampleTrack(track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}
function applyClipPose(root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const node = find(root, track.name.replace(/\.quaternion$/, ''));
    if (node) node.quaternion.copy(sampleTrack(track, time));
  }
  root.updateMatrixWorld(true);
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
function bindRestLocalMap(root) {
  const worldByBone = new Map();
  const out = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones) return;
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
function calibratedMeshyRestMap(fpsRoot, meshyRoot, fpsRestMap, meshyRestMap) {
  applyLocalRest(fpsRoot, fpsRestMap);
  applyLocalRest(meshyRoot, meshyRestMap);
  const sourceFrame = find(fpsRoot, 'ShoulderCenter');
  const targetFrame = find(meshyRoot, 'Spine02');
  const solved = new Map(meshyRestMap);
  for (const spec of [
    ['Arm.R', 'Forearm.R', 'RightArm', 'RightForeArm'],
    ['Forearm.R', 'Hand.R', 'RightForeArm', 'RightHand'],
    ['Arm.L', 'Forearm.L', 'LeftArm', 'LeftForeArm'],
    ['Forearm.L', 'Hand.L', 'LeftForeArm', 'LeftHand'],
  ]) {
    const [sourceAName, sourceBName, targetAName, targetBName] = spec;
    const sourceA = find(fpsRoot, sourceAName);
    const sourceB = find(fpsRoot, sourceBName);
    const targetA = find(meshyRoot, targetAName);
    const targetB = find(meshyRoot, targetBName);
    const desired = mapDirectionBetweenFrames(segmentDirection(sourceA, sourceB), sourceFrame, targetFrame);
    const current = segmentDirection(targetA, targetB);
    const turn = new THREE.Quaternion().setFromUnitVectors(current, desired).normalize();
    setWorldQuaternion(targetA, turn.multiply(worldQuaternion(targetA)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(targetA.name), targetA.quaternion.clone().normalize());
  }
  const forearm = find(meshyRoot, 'RightForeArm');
  const hand = find(meshyRoot, 'RightHand');
  const sourceHand = find(fpsRoot, 'Hand.R');
  const axis = segmentDirection(forearm, hand);
  const desiredRoll = projectedAroundAxis(mapDirectionBetweenFrames(worldDirection(sourceHand, [0, 0, 1]), sourceFrame, targetFrame), axis);
  const currentRoll = projectedAroundAxis(worldDirection(hand, [0, -1, 0]), axis);
  const signed = Math.atan2(new THREE.Vector3().crossVectors(currentRoll, desiredRoll).dot(axis), currentRoll.dot(desiredRoll));
  const turn = new THREE.Quaternion().setFromAxisAngle(axis, signed + THREE.MathUtils.degToRad(-120)).normalize();
  setWorldQuaternion(hand, turn.multiply(worldQuaternion(hand)).normalize());
  meshyRoot.updateMatrixWorld(true);
  solved.set(canon(hand.name), hand.quaternion.clone().normalize());
  return solved;
}
async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject));
}
function keyTimes(clip, boneName) {
  const wanted = canon(boneName);
  const track = (clip.tracks || []).find((entry) => canon(entry.name.replace(/\.quaternion$/, '')) === wanted && entry.name.endsWith('.quaternion'));
  return [...(track?.times || [])];
}

let THREE;
async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const tpose = fps.animations.find((clip) => clip.name === '0T-Pose');
  const ready = fps.animations.find((clip) => clip.name === 'OneHandReady');
  if (!tpose || !ready) throw new Error('missing FPS 0T-Pose or OneHandReady');

  const fpsPose = capturePose(fpsRoot);
  const meshyPose = capturePose(meshyRoot);
  applyClipPose(fpsRoot, tpose, 0);
  const fpsRestMap = new Map();
  fpsRoot.traverse((node) => { if (node.isBone) fpsRestMap.set(canon(node.name), node.quaternion.clone().normalize()); });
  const meshyBindMap = bindRestLocalMap(meshyRoot);
  const calibratedRest = calibratedMeshyRestMap(fpsRoot, meshyRoot, fpsRestMap, meshyBindMap);
  const times = keyTimes(ready, 'Hand.R');
  const samples = [];
  const errors = [];
  const sideSampleCounts = {};
  let clamped = 0;
  for (const side of [
    { label: 'right', sourceUpper: 'Arm.R', sourceLower: 'Forearm.R', sourceHand: 'Hand.R', targetUpper: 'RightArm', targetLower: 'RightForeArm', targetHand: 'RightHand' },
    { label: 'left', sourceUpper: 'Arm.L', sourceLower: 'Forearm.L', sourceHand: 'Hand.L', targetUpper: 'LeftArm', targetLower: 'LeftForeArm', targetHand: 'LeftHand' },
  ]) {
    restorePose(fpsRoot, fpsPose);
    restorePose(meshyRoot, meshyPose);
    applyLocalRest(fpsRoot, fpsRestMap);
    applyLocalRest(meshyRoot, calibratedRest);
    const sourceFrame = find(fpsRoot, 'ShoulderCenter');
    const targetFrame = find(meshyRoot, 'Spine02');
    const sourceHand = find(fpsRoot, side.sourceHand);
    const sourceUpper = find(fpsRoot, side.sourceUpper);
    const sourceLower = find(fpsRoot, side.sourceLower);
    const targetUpper = find(meshyRoot, side.targetUpper);
    const targetLower = find(meshyRoot, side.targetLower);
    const targetHand = find(meshyRoot, side.targetHand);
    const sourceRestLocal = localInFrame(sourceFrame, sourceHand);
    const targetRestLocal = localInFrame(targetFrame, targetHand);
    const measuredScale = chainLength(targetUpper, targetLower, targetHand) / Math.max(0.0001, chainLength(sourceUpper, sourceLower, sourceHand));
    const scale = sourceScaleOverride ?? measuredScale;
    for (const time of times) {
      restorePose(fpsRoot, fpsPose);
      restorePose(meshyRoot, meshyPose);
      applyLocalRest(meshyRoot, calibratedRest);
      applyClipPose(fpsRoot, ready, time);
      const sourceReadyLocal = localInFrame(sourceFrame, sourceHand);
      const sourceDeltaLocal = sourceReadyLocal.sub(sourceRestLocal);
      const desiredLocal = targetRestLocal.clone().add(sourceDeltaLocal.multiplyScalar(scale));
      const desiredWorld = targetFrame.localToWorld(desiredLocal.clone());
      const rawDistance = worldPosition(targetUpper).distanceTo(desiredWorld);
      const maxReach = chainLength(targetUpper, targetLower, targetHand) * 0.98;
      if (rawDistance > maxReach) clamped += 1;
      solveTwoBoneIk(meshyRoot, targetUpper, targetLower, targetHand, clampToReach(targetUpper, desiredWorld, chainLength(targetUpper, targetLower, targetHand), 0.98), 8);
      const solvedLocal = localInFrame(targetFrame, targetHand);
      const error = solvedLocal.distanceTo(desiredLocal);
      errors.push(error);
      sideSampleCounts[side.label] = (sideSampleCounts[side.label] || 0) + 1;
      if (samples.filter((entry) => entry.side === side.label).length < 6) samples.push({
        side: side.label,
        time: round(time, 4),
        sourceRestLocal: point(sourceRestLocal),
        sourceReadyLocal: point(sourceReadyLocal),
        targetRestLocal: point(targetRestLocal),
        desiredReadyLocal: point(desiredLocal),
        solvedReadyLocal: point(solvedLocal),
        localError: round(error),
      });
    }
  }
  const payload = {
    schema: 'pose-lab-meshy-fps-ready-relation-audit-v1',
    sourceClip: 'OneHandReady',
    sourceRest: 'FPSPlayer.glb 0T-Pose',
    targetRest: 'Meshy calibrated FPS-REST-ARMS-CAL--120',
    method: 'source 0T-to-ready hand local delta scaled by arm length and applied to calibrated Meshy rest hand local',
    sourceScaleOverride,
    metrics: {
      sampleCount: errors.length,
      sideSampleCounts,
      avgReadyLocalError: round(avg(errors)),
      maxReadyLocalError: round(max(errors)),
      reachClampSamples: clamped,
    },
    samples,
  };
  const out = path.join(projectRoot, 'generated/core_transform_audit/meshy_fps_ready_relation_audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, path: path.relative(projectRoot, out), metrics: payload.metrics }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
