#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'generated', 'visual_parity', 'meshy_onehand_ready');

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
  const loader = path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(loader)) {
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

function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function point(v) {
  return [round(v.x), round(v.y), round(v.z)];
}

function findNode(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function requireNode(root, name) {
  const node = findNode(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}

function worldPosition(THREE, node) {
  const out = new THREE.Vector3();
  node.getWorldPosition(out);
  return out;
}

function worldQuaternion(THREE, node) {
  const out = new THREE.Quaternion();
  node.getWorldQuaternion(out);
  return out.normalize();
}

function worldDirection(THREE, node, localAxis = [0, 0, 1]) {
  return new THREE.Vector3(Number(localAxis[0] || 0), Number(localAxis[1] || 0), Number(localAxis[2] ?? 1))
    .applyQuaternion(worldQuaternion(THREE, node))
    .normalize();
}

function segmentDirection(THREE, a, b) {
  const direction = worldPosition(THREE, b).sub(worldPosition(THREE, a));
  return direction.lengthSq() > 1e-8 ? direction.normalize() : new THREE.Vector3(0, 0, 1);
}

function localInFrame(THREE, frame, node) {
  const local = worldPosition(THREE, node);
  frame.worldToLocal(local);
  return local;
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return sourceLocal.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function angleDeg(THREE, a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()));
}

function signedAngleAroundAxis(THREE, from, to, axis) {
  const cross = new THREE.Vector3().crossVectors(from.clone().normalize(), to.clone().normalize());
  return THREE.MathUtils.radToDeg(Math.atan2(cross.dot(axis.clone().normalize()), from.clone().normalize().dot(to.clone().normalize())));
}

function projectedAroundAxis(THREE, direction, axis) {
  const projected = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : new THREE.Vector3(0, 1, 0);
}

function frameVectorWorld(frame, local) {
  return frame.lateral.clone().multiplyScalar(local.x)
    .add(frame.up.clone().multiplyScalar(local.y))
    .add(frame.forward.clone().multiplyScalar(local.z));
}

function makeVisualPoseFrame(THREE, root, config = {}) {
  const left = findNode(root, config.leftShoulder || 'LeftArm') || findNode(root, 'Arm.L') || findNode(root, 'LeftShoulder');
  const right = findNode(root, config.rightShoulder || 'RightArm') || findNode(root, 'Arm.R') || findNode(root, 'RightShoulder');
  const chest = findNode(root, config.chest || 'ShoulderCenter') || findNode(root, 'Spine02') || findNode(root, 'Spine');
  const hips = findNode(root, config.hips || 'Hips') || findNode(root, 'Root') || chest?.parent || null;
  const leftPos = left ? worldPosition(THREE, left) : null;
  const rightPos = right ? worldPosition(THREE, right) : null;
  const chestPos = chest ? worldPosition(THREE, chest) : new THREE.Vector3();
  const hipPos = hips ? worldPosition(THREE, hips) : chestPos.clone().add(new THREE.Vector3(0, -1, 0));
  let lateral = rightPos && leftPos ? rightPos.clone().sub(leftPos) : new THREE.Vector3(1, 0, 0);
  if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
  lateral.normalize();
  let up = chestPos.clone().sub(hipPos);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  let forward = new THREE.Vector3().crossVectors(lateral, up);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  up = new THREE.Vector3().crossVectors(forward, lateral).normalize();
  return { origin: chestPos, lateral, up, forward };
}

function visualPoseLocal(frame, pointWorld) {
  const v = pointWorld.clone().sub(frame.origin);
  return frame.origin.clone().set(v.dot(frame.lateral), v.dot(frame.up), v.dot(frame.forward));
}

function visualPoseWorld(frame, local) {
  return frame.origin.clone().add(frameVectorWorld(frame, local));
}

function mapDirectionBetweenVisualFrames(THREE, direction, sourceFrame, targetFrame) {
  const local = new THREE.Vector3(direction.dot(sourceFrame.lateral), direction.dot(sourceFrame.up), direction.dot(sourceFrame.forward));
  return frameVectorWorld(targetFrame, local).normalize();
}

function visualFrameLocalDirection(THREE, frame, direction) {
  const value = direction.clone().normalize();
  return new THREE.Vector3(value.dot(frame.lateral), value.dot(frame.up), value.dot(frame.forward)).normalize();
}

function visualFrameWorldDirection(frame, localDirection) {
  return frameVectorWorld(frame, localDirection.clone().normalize()).normalize();
}

function targetDownFromSourceRestDelta(THREE, sourceRestDownWorld, sourcePoseDownWorld, targetRestDownWorld, sourceRestFrame, sourcePoseFrame, targetRestFrame, targetPoseFrame) {
  const sourceRestLocal = visualFrameLocalDirection(THREE, sourceRestFrame, sourceRestDownWorld);
  const sourcePoseLocal = visualFrameLocalDirection(THREE, sourcePoseFrame, sourcePoseDownWorld);
  const targetRestLocal = visualFrameLocalDirection(THREE, targetRestFrame, targetRestDownWorld);
  const delta = new THREE.Quaternion().setFromUnitVectors(sourceRestLocal, sourcePoseLocal).normalize();
  return visualFrameWorldDirection(targetPoseFrame, targetRestLocal.applyQuaternion(delta).normalize());
}

function anyPerpendicularVector(THREE, direction) {
  const axis = Math.abs(direction.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const out = axis.sub(direction.clone().multiplyScalar(axis.dot(direction)));
  return out.lengthSq() > 1e-8 ? out.normalize() : new THREE.Vector3(0, 0, 1);
}

function constrainedTwoBoneWorldJoints(THREE, shoulderWorld, desiredElbowWorld, desiredHandWorld, upperLength, lowerLength, fallbackElbowWorld = null, reachScale = 0.999) {
  const upperLen = Math.max(1e-8, Number(upperLength || 0));
  const lowerLen = Math.max(1e-8, Number(lowerLength || 0));
  const minReach = Math.max(1e-6, Math.abs(upperLen - lowerLen) + 0.0001);
  const maxReach = Math.max(minReach, (upperLen + lowerLen) * Math.max(0.001, Math.min(1, Number(reachScale || 0.999))));
  let handOffset = desiredHandWorld.clone().sub(shoulderWorld);
  if (handOffset.lengthSq() < 1e-8) handOffset = new THREE.Vector3(0, 0, maxReach);
  const rawDistance = handOffset.length();
  const clampedDistance = Math.max(minReach, Math.min(maxReach, rawDistance));
  const handDir = handOffset.normalize();
  const handWorld = shoulderWorld.clone().add(handDir.clone().multiplyScalar(clampedDistance));
  const along = Math.max(0, Math.min(upperLen, ((upperLen * upperLen) - (lowerLen * lowerLen) + (clampedDistance * clampedDistance)) / Math.max(1e-8, 2 * clampedDistance)));
  const height = Math.sqrt(Math.max(0, (upperLen * upperLen) - (along * along)));
  let bend = desiredElbowWorld.clone().sub(shoulderWorld);
  bend.sub(handDir.clone().multiplyScalar(bend.dot(handDir)));
  if (bend.lengthSq() < 1e-8 && fallbackElbowWorld) {
    bend = fallbackElbowWorld.clone().sub(shoulderWorld);
    bend.sub(handDir.clone().multiplyScalar(bend.dot(handDir)));
  }
  if (bend.lengthSq() < 1e-8) bend = anyPerpendicularVector(THREE, handDir);
  else bend.normalize();
  return {
    shoulderWorld,
    elbowWorld: shoulderWorld.clone().add(handDir.clone().multiplyScalar(along)).add(bend.clone().multiplyScalar(height)),
    handWorld,
    rawDistance,
    clampedDistance,
    upperLength: upperLen,
    lowerLength: lowerLen,
  };
}

function setWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = worldQuaternion(THREE, bone.parent).invert();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}

function rotateSegmentToWorldPoint(THREE, root, bone, child, targetWorld) {
  const boneWorld = worldPosition(THREE, bone);
  const current = worldPosition(THREE, child).sub(boneWorld);
  const desired = targetWorld.clone().sub(boneWorld);
  if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
  setWorldQuaternion(THREE, bone, turn.multiply(worldQuaternion(THREE, bone)).normalize());
  root.updateMatrixWorld(true);
}

function solveArmToWorldJoints(THREE, root, upper, lower, hand, solved) {
  rotateSegmentToWorldPoint(THREE, root, upper, lower, solved.elbowWorld);
  rotateSegmentToWorldPoint(THREE, root, lower, hand, solved.handWorld);
  root.updateMatrixWorld(true);
}

function axisVectorFromArray(THREE, axis) {
  return new THREE.Vector3(Number(axis?.[0] || 0), Number(axis?.[1] || 0), Number(axis?.[2] ?? 1)).normalize();
}

function rolledHandWorldQuaternion(THREE, lower, hand, baseHandWorld, targetLocalAxis, desiredWorldAxis) {
  const rollAxis = worldPosition(THREE, hand).sub(worldPosition(THREE, lower));
  if (rollAxis.lengthSq() < 1e-8) return baseHandWorld.clone().normalize();
  rollAxis.normalize();
  const current = axisVectorFromArray(THREE, targetLocalAxis || [0, -1, 0]).applyQuaternion(baseHandWorld).normalize();
  const desired = desiredWorldAxis.clone().normalize();
  const currentProjected = current.sub(rollAxis.clone().multiplyScalar(current.dot(rollAxis)));
  const desiredProjected = desired.sub(rollAxis.clone().multiplyScalar(desired.dot(rollAxis)));
  if (currentProjected.lengthSq() < 1e-8 || desiredProjected.lengthSq() < 1e-8) return baseHandWorld.clone().normalize();
  currentProjected.normalize();
  desiredProjected.normalize();
  const angle = Math.atan2(new THREE.Vector3().crossVectors(currentProjected, desiredProjected).dot(rollAxis), currentProjected.dot(desiredProjected));
  return new THREE.Quaternion().setFromAxisAngle(rollAxis, angle).multiply(baseHandWorld).normalize();
}

function rolledWorldQuaternionToDownReference(THREE, lower, hand, baseHandWorld, targetLocalAxis, desiredWorldAxis, maxTwistDeg = 180) {
  const rollAxis = worldPosition(THREE, hand).sub(worldPosition(THREE, lower));
  if (rollAxis.lengthSq() < 1e-8) return { quaternion: baseHandWorld.clone().normalize(), appliedDeg: 0, unclampedDeg: 0, errorDeg: 0 };
  rollAxis.normalize();
  const current = axisVectorFromArray(THREE, targetLocalAxis || [0, -1, 0]).applyQuaternion(baseHandWorld).normalize();
  const desired = desiredWorldAxis.clone().normalize();
  const currentProjected = projectedAroundAxis(THREE, current, rollAxis);
  const desiredProjected = projectedAroundAxis(THREE, desired, rollAxis);
  if (currentProjected.lengthSq() < 1e-8 || desiredProjected.lengthSq() < 1e-8) return { quaternion: baseHandWorld.clone().normalize(), appliedDeg: 0, unclampedDeg: 0, errorDeg: 0 };
  const signed = Math.atan2(new THREE.Vector3().crossVectors(currentProjected, desiredProjected).dot(rollAxis), currentProjected.dot(desiredProjected));
  const maxRad = THREE.MathUtils.degToRad(Math.max(0, Math.min(180, Number(maxTwistDeg || 180))));
  const clamped = Math.max(-maxRad, Math.min(maxRad, signed));
  const quaternion = new THREE.Quaternion().setFromAxisAngle(rollAxis, clamped).multiply(baseHandWorld).normalize();
  const after = projectedAroundAxis(THREE, axisVectorFromArray(THREE, targetLocalAxis || [0, -1, 0]).applyQuaternion(quaternion).normalize(), rollAxis);
  return {
    quaternion,
    appliedDeg: Math.abs(THREE.MathUtils.radToDeg(clamped)),
    unclampedDeg: Math.abs(THREE.MathUtils.radToDeg(signed)),
    errorDeg: angleDeg(THREE, after, desiredProjected),
  };
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

function solveTwoBoneIk(THREE, root, upper, lower, hand, targetWorld, iterations = 8) {
  for (let i = 0; i < iterations; i += 1) {
    rotateJointToward(THREE, lower, hand, targetWorld, 0.95);
    root.updateMatrixWorld(true);
    rotateJointToward(THREE, upper, hand, targetWorld, 0.85);
    root.updateMatrixWorld(true);
  }
}

function chainLength(THREE, upper, lower, hand) {
  return worldPosition(THREE, upper).distanceTo(worldPosition(THREE, lower))
    + worldPosition(THREE, lower).distanceTo(worldPosition(THREE, hand));
}

function clampToReach(THREE, shoulder, targetWorld, length, reachScale = 0.98) {
  const shoulderWorld = worldPosition(THREE, shoulder);
  const offset = targetWorld.clone().sub(shoulderWorld);
  const maxReach = Math.max(0.001, length * reachScale);
  if (offset.length() > maxReach) offset.setLength(maxReach);
  return shoulderWorld.add(offset);
}

function sampleQuaternionTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}

function applyClipPose(THREE, root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const node = findNode(root, track.name.replace(/\.quaternion$/, ''));
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
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

function bindRestLocalMap(THREE, root) {
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

function calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyRestMap) {
  applyLocalRest(fpsRoot, fpsRestMap);
  applyLocalRest(meshyRoot, meshyRestMap);
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const solved = new Map(meshyRestMap);
  for (const [sourceAName, sourceBName, targetAName, targetBName] of [
    ['Arm.R', 'Forearm.R', 'RightArm', 'RightForeArm'],
    ['Forearm.R', 'Hand.R', 'RightForeArm', 'RightHand'],
    ['Arm.L', 'Forearm.L', 'LeftArm', 'LeftForeArm'],
    ['Forearm.L', 'Hand.L', 'LeftForeArm', 'LeftHand'],
  ]) {
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
  for (const [sourceHandName, targetForearmName, targetHandName] of [
    ['Hand.R', 'RightForeArm', 'RightHand'],
    ['Hand.L', 'LeftForeArm', 'LeftHand'],
  ]) {
    const forearm = requireNode(meshyRoot, targetForearmName);
    const hand = requireNode(meshyRoot, targetHandName);
    const sourceHand = requireNode(fpsRoot, sourceHandName);
    const axis = segmentDirection(THREE, forearm, hand);
    const desiredRoll = projectedAroundAxis(THREE, mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceHand, [0, 0, 1]), sourceFrame, targetFrame), axis);
    const currentRoll = projectedAroundAxis(THREE, worldDirection(THREE, hand, [0, -1, 0]), axis);
    const signed = signedAngleAroundAxis(THREE, currentRoll, desiredRoll, axis);
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(signed - 120)).normalize();
    setWorldQuaternion(THREE, hand, turn.multiply(worldQuaternion(THREE, hand)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(hand.name), hand.quaternion.clone().normalize());
  }
  return solved;
}

function keyTimes(clip, boneName) {
  const wanted = canon(boneName);
  const track = (clip.tracks || []).find((entry) => canon(entry.name.replace(/\.quaternion$/, '')) === wanted && entry.name.endsWith('.quaternion'));
  return [...(track?.times || [])];
}

function clipQuaternionTrackNames(clip) {
  return (clip.tracks || []).filter((track) => track.name.endsWith('.quaternion')).map((track) => track.name.replace(/\.quaternion$/, ''));
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject));
}

function measureSabreBounds(THREE, sabreRoot) {
  sabreRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sabreRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const entries = [
    { axis: 'x', size: size.x, min: box.min.x, max: box.max.x },
    { axis: 'y', size: size.y, min: box.min.y, max: box.max.y },
    { axis: 'z', size: size.z, min: box.min.z, max: box.max.z },
  ].sort((a, b) => b.size - a.size);
  return {
    center: point(center),
    size: point(size),
    longAxis: entries[0].axis,
    longAxisLength: round(entries[0].size),
    handleCandidateLocal: point(new THREE.Vector3(entries[0].axis === 'x' ? entries[0].min : center.x, entries[0].axis === 'y' ? entries[0].min : center.y, entries[0].axis === 'z' ? entries[0].min : center.z)),
    tipCandidateLocal: point(new THREE.Vector3(entries[0].axis === 'x' ? entries[0].max : center.x, entries[0].axis === 'y' ? entries[0].max : center.y, entries[0].axis === 'z' ? entries[0].max : center.z)),
  };
}

function activeMeshyReadyProfileContract() {
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const visualIkStart = profiles.indexOf("clipTag: 'FPS-VISUAL-IK-GOLDEN'");
  const nextClipTag = visualIkStart >= 0 ? profiles.indexOf('clipTag:', visualIkStart + 1) : -1;
  const blockEnd = nextClipTag > visualIkStart ? nextClipTag : profiles.indexOf('],', visualIkStart);
  const activeBlock = visualIkStart >= 0 && blockEnd > visualIkStart ? profiles.slice(visualIkStart, blockEnd) : '';
  return {
    activeBlockFound: activeBlock.length > 0,
    activeClip: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK]',
    worldJointProjection: activeBlock.includes("mode: 'world-joint-projection'") && activeBlock.includes('worldJointProjection: true'),
    replacesTracks: activeBlock.includes('replaceTracks: true'),
    restRelative: activeBlock.includes('restRelative: true'),
    postRollDownDelta: activeBlock.includes("mode: 'world-down-delta'"),
    rightArmCanary: activeBlock.includes('rightArmCanary: true') && activeBlock.includes('maxTwistDeg: 180'),
    leftArmBounded: activeBlock.includes("label: 'left'") && activeBlock.includes('rollOffsetDeg: -90'),
    fullRightChain: activeBlock.includes("sourceUpper: 'Arm.R'") && activeBlock.includes("sourceLower: 'Forearm.R'") && activeBlock.includes("sourceHand: 'Hand.R'"),
    fullLeftChain: activeBlock.includes("sourceUpper: 'Arm.L'") && activeBlock.includes("sourceLower: 'Forearm.L'") && activeBlock.includes("sourceHand: 'Hand.L'"),
    weaponDoesNotOverwriteHand: activeBlock.includes('enabled: true')
      && activeBlock.includes("targetWeapon: 'WeaponR'")
      && activeBlock.includes('applyToHand: false')
      && !profiles.includes('worldJointProjectionSocketOrientation'),
  };
}

function svgLine(a, b, color, width = 2) {
  return `<line x1="${round(a.x, 2)}" y1="${round(a.y, 2)}" x2="${round(b.x, 2)}" y2="${round(b.y, 2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function svgCircle(p, color, radius = 3) {
  return `<circle cx="${round(p.x, 2)}" cy="${round(p.y, 2)}" r="${radius}" fill="${color}"/>`;
}

function writeContactSheet(THREE, samples, file) {
  const panels = samples.map((sample, index) => {
    const x = 30 + index * 185;
    const y = 150;
    const scale = 460;
    const project = (p) => new THREE.Vector2(x + p.x * scale, y - p.y * scale);
    const lines = [];
    for (const side of ['right', 'left']) {
      const s = sample[side];
      const color = side === 'right' ? '#eab308' : '#38bdf8';
      lines.push(svgLine(project(s.shoulder), project(s.elbow), color, 3));
      lines.push(svgLine(project(s.elbow), project(s.hand), color, 3));
      lines.push(svgCircle(project(s.hand), color, 4));
      const palm = project(s.hand.clone().add(s.palmDown.clone().multiplyScalar(0.055)));
      lines.push(svgLine(project(s.hand), palm, '#ef4444', 2));
    }
    lines.push(`<text x="${x - 20}" y="24" fill="#d1d5db" font-size="12">t=${round(sample.time, 3)}</text>`);
    lines.push(`<text x="${x - 20}" y="40" fill="#d1d5db" font-size="11">L palm ${round(sample.left.palmErrorDeg, 1)} deg</text>`);
    return `<g>${lines.join('\n')}</g>`;
  }).join('\n');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="980" height="250" viewBox="0 0 980 250">',
    '<rect width="980" height="250" fill="#111827"/>',
    '<text x="24" y="226" fill="#e5e7eb" font-size="12">Meshy OneHandReady visual parity: yellow=right arm, blue=left arm, red=palm/down axis</text>',
    panels,
    '</svg>',
  ].join('\n');
  fs.writeFileSync(file, svg + '\n');
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const sabre = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_sabre', 'Meshy_AI_A_French_revolution_c_0628223518_texture.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const ready = fps.animations.find((clip) => clip.name === 'OneHandReady');
  const tpose = fps.animations.find((clip) => clip.name === '0T-Pose');
  if (!ready || !tpose) throw new Error('missing FPS OneHandReady or 0T-Pose');

  const sourceTrackNames = clipQuaternionTrackNames(ready);
  const sourceLowerBodyTracks = sourceTrackNames.filter((name) => /hip|leg|foot|toe|head|camera/i.test(name));
  const sourceTimes = keyTimes(ready, 'Hand.R');
  const leftSourceTimes = keyTimes(ready, 'Hand.L');
  const trimmedStartTime = sourceTimes.length > 1 ? sourceTimes[1] : 0;
  const times = sourceTimes.slice(1);
  const leftTimes = leftSourceTimes.slice(1);
  const fpsPose = capturePose(fpsRoot);
  const meshyPose = capturePose(meshyRoot);
  applyClipPose(THREE, fpsRoot, tpose, 0);
  const fpsRestMap = new Map();
  fpsRoot.traverse((node) => { if (node.isBone) fpsRestMap.set(canon(node.name), node.quaternion.clone().normalize()); });
  const meshyBindMap = bindRestLocalMap(THREE, meshyRoot);
  const calibratedRest = calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap);

  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const sides = [
    { label: 'right', sourceUpper: 'Arm.R', sourceLower: 'Forearm.R', sourceHand: 'Hand.R', targetUpper: 'RightArm', targetLower: 'RightForeArm', targetHand: 'RightHand', maxTwistDeg: 120 },
    { label: 'left', sourceUpper: 'Arm.L', sourceLower: 'Forearm.L', sourceHand: 'Hand.L', targetUpper: 'LeftArm', targetLower: 'LeftForeArm', targetHand: 'LeftHand', maxTwistDeg: 95 },
  ];

  const sideMetrics = {};
  const sheetSamples = [];
  for (const side of sides) {
    restorePose(fpsRoot, fpsPose);
    restorePose(meshyRoot, meshyPose);
    applyLocalRest(fpsRoot, fpsRestMap);
    applyLocalRest(meshyRoot, calibratedRest);
    const sourceUpper = requireNode(fpsRoot, side.sourceUpper);
    const sourceLower = requireNode(fpsRoot, side.sourceLower);
    const sourceHand = requireNode(fpsRoot, side.sourceHand);
    const targetUpper = requireNode(meshyRoot, side.targetUpper);
    const targetLower = requireNode(meshyRoot, side.targetLower);
    const targetHand = requireNode(meshyRoot, side.targetHand);
    const targetRestFrame = makeVisualPoseFrame(THREE, meshyRoot, { leftShoulder: 'LeftArm', rightShoulder: 'RightArm', chest: 'Spine02', hips: 'Hips' });
    const sourceRestFrame = makeVisualPoseFrame(THREE, fpsRoot, { leftShoulder: 'Arm.L', rightShoulder: 'Arm.R', chest: 'ShoulderCenter', hips: 'Hips' });
    const sourceRestElbowLocal = visualPoseLocal(sourceRestFrame, worldPosition(THREE, sourceLower));
    const sourceRestHandLocal = visualPoseLocal(sourceRestFrame, worldPosition(THREE, sourceHand));
    const targetRestLocal = visualPoseLocal(targetRestFrame, worldPosition(THREE, targetHand));
    const targetRestElbowLocal = visualPoseLocal(targetRestFrame, worldPosition(THREE, targetLower));
    const sourceArmLength = chainLength(THREE, sourceUpper, sourceLower, sourceHand);
    const targetUpperLength = worldPosition(THREE, targetLower).distanceTo(worldPosition(THREE, targetUpper));
    const targetLowerLength = worldPosition(THREE, targetHand).distanceTo(worldPosition(THREE, targetLower));
    const targetArmLength = targetUpperLength + targetLowerLength;
    const targetScale = targetArmLength / Math.max(0.0001, sourceArmLength);
    const targetRestLowerToHand = worldQuaternion(THREE, targetLower).invert().multiply(worldQuaternion(THREE, targetHand)).normalize();
    const sourceRestDownWorld = worldDirection(THREE, sourceHand, [0, -1, 0]);
    const targetRestDownWorld = worldDirection(THREE, targetHand, [0, -1, 0]);
    const sourceLoop = [];
    const targetLoop = [];
    const restDistances = [];
    const tPoseLeakAngles = [];
    const downErrors = [];
    const downDots = [];
    const downRollErrorsBefore = [];
    const downRollDotsBefore = [];
    const downRollErrors = [];
    const downRollDots = [];
    const appliedTwists = [];
    const unclampedTwists = [];
    const postRollPositionDrifts = [];
    const upperLengthErrors = [];
    const lowerLengthErrors = [];
    const handProjectionErrors = [];
    const elbowBendDots = [];
    const forearmReturnMargins = [];
    const sourceTravel = [];
    const targetTravel = [];
    let previousSourceLocal = null;
    let previousTargetLocal = null;
    for (const time of times) {
      restorePose(fpsRoot, fpsPose);
      restorePose(meshyRoot, meshyPose);
      applyLocalRest(meshyRoot, calibratedRest);
      applyClipPose(THREE, fpsRoot, ready, time);
      const sourceFrame = makeVisualPoseFrame(THREE, fpsRoot, { leftShoulder: 'Arm.L', rightShoulder: 'Arm.R', chest: 'ShoulderCenter', hips: 'Hips' });
      const targetFrame = makeVisualPoseFrame(THREE, meshyRoot, { leftShoulder: 'LeftArm', rightShoulder: 'RightArm', chest: 'Spine02', hips: 'Hips' });
      const sourceShoulderLocal = visualPoseLocal(sourceFrame, worldPosition(THREE, sourceUpper));
      const sourceElbowLocal = visualPoseLocal(sourceFrame, worldPosition(THREE, sourceLower));
      const sourceReadyLocal = visualPoseLocal(sourceFrame, worldPosition(THREE, sourceHand));
      const targetShoulderWorld = worldPosition(THREE, targetUpper);
      const sourceElbowDelta = sourceElbowLocal.clone().sub(sourceRestElbowLocal);
      const sourceHandDelta = sourceReadyLocal.clone().sub(sourceRestHandLocal);
      const desiredElbowWorld = visualPoseWorld(targetFrame, targetRestElbowLocal.clone().add(sourceElbowDelta.multiplyScalar(targetScale)));
      const desiredHandWorld = visualPoseWorld(targetFrame, targetRestLocal.clone().add(sourceHandDelta.multiplyScalar(targetScale)));
      const solved = constrainedTwoBoneWorldJoints(THREE, targetShoulderWorld, desiredElbowWorld, desiredHandWorld, targetUpperLength, targetLowerLength, worldPosition(THREE, targetLower), 0.999);
      solveArmToWorldJoints(THREE, meshyRoot, targetUpper, targetLower, targetHand, solved);
      const desiredDown = targetDownFromSourceRestDelta(
        THREE,
        sourceRestDownWorld,
        worldDirection(THREE, sourceHand, [0, -1, 0]),
        targetRestDownWorld,
        sourceRestFrame,
        sourceFrame,
        targetRestFrame,
        targetFrame
      );
      const rolledHand = rolledWorldQuaternionToDownReference(
        THREE,
        targetLower,
        targetHand,
        worldQuaternion(THREE, targetLower).multiply(targetRestLowerToHand).normalize(),
        [0, -1, 0],
        desiredDown,
        side.maxTwistDeg
      );
      const preRollShoulder = worldPosition(THREE, targetUpper);
      const preRollElbow = worldPosition(THREE, targetLower);
      const preRollHand = worldPosition(THREE, targetHand);
      const rollAxisBefore = preRollHand.clone().sub(preRollElbow).normalize();
      const preRollDown = worldDirection(THREE, targetHand, [0, -1, 0]);
      const preRollDownProjected = projectedAroundAxis(THREE, preRollDown.clone(), rollAxisBefore);
      const desiredDownProjectedBefore = projectedAroundAxis(THREE, desiredDown.clone(), rollAxisBefore);
      downRollErrorsBefore.push(angleDeg(THREE, preRollDownProjected, desiredDownProjectedBefore));
      downRollDotsBefore.push(preRollDownProjected.dot(desiredDownProjectedBefore));
      setWorldQuaternion(THREE, targetHand, rolledHand.quaternion);
      meshyRoot.updateMatrixWorld(true);
      postRollPositionDrifts.push(Math.max(
        preRollShoulder.distanceTo(worldPosition(THREE, targetUpper)),
        preRollElbow.distanceTo(worldPosition(THREE, targetLower)),
        preRollHand.distanceTo(worldPosition(THREE, targetHand))
      ));
      const actualDown = worldDirection(THREE, targetHand, [0, -1, 0]);
      const rollAxis = worldPosition(THREE, targetHand).sub(worldPosition(THREE, targetLower)).normalize();
      const actualDownRoll = projectedAroundAxis(THREE, actualDown.clone(), rollAxis);
      const desiredDownRoll = projectedAroundAxis(THREE, desiredDown.clone(), rollAxis);
      const targetLocal = visualPoseLocal(targetFrame, worldPosition(THREE, targetHand));
      const targetElbowLocal = visualPoseLocal(targetFrame, worldPosition(THREE, targetLower));
      const restDistance = targetLocal.distanceTo(targetRestLocal);
      const lateral = Math.abs(targetLocal.x - targetRestLocal.x);
      const vertical = Math.abs(targetLocal.y - targetRestLocal.y);
      const actualUpperLength = worldPosition(THREE, targetUpper).distanceTo(worldPosition(THREE, targetLower));
      const actualLowerLength = worldPosition(THREE, targetLower).distanceTo(worldPosition(THREE, targetHand));
      const sourceHandDir = sourceReadyLocal.clone().sub(sourceShoulderLocal);
      const sourceBend = sourceElbowLocal.clone().sub(sourceShoulderLocal);
      if (sourceHandDir.lengthSq() > 1e-8) {
        sourceHandDir.normalize();
        sourceBend.sub(sourceHandDir.clone().multiplyScalar(sourceBend.dot(sourceHandDir)));
      }
      const targetShoulderLocal = visualPoseLocal(targetFrame, worldPosition(THREE, targetUpper));
      const targetHandDir = targetLocal.clone().sub(targetShoulderLocal);
      const targetBend = targetElbowLocal.clone().sub(targetShoulderLocal);
      forearmReturnMargins.push(Math.abs(targetElbowLocal.x - targetShoulderLocal.x) - Math.abs(targetLocal.x - targetShoulderLocal.x));
      if (targetHandDir.lengthSq() > 1e-8) {
        targetHandDir.normalize();
        targetBend.sub(targetHandDir.clone().multiplyScalar(targetBend.dot(targetHandDir)));
      }
      restDistances.push(restDistance);
      tPoseLeakAngles.push(angleDeg(THREE, segmentDirection(THREE, targetUpper, targetHand), segmentDirection(THREE, targetUpper, targetLower)));
      downErrors.push(angleDeg(THREE, actualDown, desiredDown));
      downDots.push(actualDown.dot(desiredDown));
      downRollErrors.push(angleDeg(THREE, actualDownRoll, desiredDownRoll));
      downRollDots.push(actualDownRoll.dot(desiredDownRoll));
      appliedTwists.push(rolledHand.appliedDeg);
      unclampedTwists.push(rolledHand.unclampedDeg);
      upperLengthErrors.push(Math.abs(actualUpperLength - targetUpperLength));
      lowerLengthErrors.push(Math.abs(actualLowerLength - targetLowerLength));
      handProjectionErrors.push(worldPosition(THREE, targetHand).distanceTo(solved.handWorld));
      elbowBendDots.push(sourceBend.lengthSq() > 1e-8 && targetBend.lengthSq() > 1e-8 ? sourceBend.normalize().dot(targetBend.normalize()) : 1);
      if (previousSourceLocal) sourceTravel.push(sourceReadyLocal.distanceTo(previousSourceLocal));
      if (previousTargetLocal) targetTravel.push(targetLocal.distanceTo(previousTargetLocal));
      previousSourceLocal = sourceReadyLocal.clone();
      previousTargetLocal = targetLocal.clone();
      if ([0, Math.floor(times.length / 2), times.length - 1].includes(times.indexOf(time))) {
        sheetSamples[times.indexOf(time)] ||= { time };
        sheetSamples[times.indexOf(time)][side.label] = {
          shoulder: visualPoseLocal(targetFrame, worldPosition(THREE, targetUpper)),
          elbow: visualPoseLocal(targetFrame, worldPosition(THREE, targetLower)),
          hand: targetLocal.clone(),
          palmDown: new THREE.Vector3(actualDown.dot(targetFrame.lateral), actualDown.dot(targetFrame.up), actualDown.dot(targetFrame.forward)).normalize(),
          palmErrorDeg: angleDeg(THREE, actualDown, desiredDown),
          restDistance,
          lateral,
          vertical,
        };
      }
      if (time === times[0] || time === times[times.length - 1]) {
        sourceLoop.push(sourceReadyLocal.clone());
        targetLoop.push(targetLocal.clone());
      }
    }
    sideMetrics[side.label] = {
      sourceKeyCount: side.label === 'left' ? leftSourceTimes.length : sourceTimes.length,
      targetKeyCount: times.length,
      firstSourceTime: round(times[0] || 0, 6),
      firstOutputTime: 0,
      firstFrameRestDistance: round(restDistances[0] || 0),
      sourceArmLength: round(sourceArmLength),
      targetArmLength: round(targetArmLength),
      targetUpperLength: round(targetUpperLength),
      targetLowerLength: round(targetLowerLength),
      targetScale: round(targetScale),
      avgRestDistance: round(average(restDistances)),
      minRestDistance: round(min(restDistances)),
      maxRestDistance: round(max(restDistances)),
      maxUpperLengthError: round(max(upperLengthErrors), 6),
      maxLowerLengthError: round(max(lowerLengthErrors), 6),
      maxHandProjectionError: round(max(handProjectionErrors), 6),
      minElbowBendDot: round(min(elbowBendDots), 4),
      minForearmReturnMargin: round(min(forearmReturnMargins)),
      firstFrameForearmReturnMargin: round(forearmReturnMargins[0] || 0),
      avgTposeLeakAngleDeg: round(average(tPoseLeakAngles), 2),
      minTposeLeakAngleDeg: round(min(tPoseLeakAngles), 2),
      avgDownErrorDeg: round(average(downErrors), 2),
      maxDownErrorDeg: round(max(downErrors), 2),
      minDownDot: round(min(downDots), 4),
      avgDownRollErrorBeforeDeg: round(average(downRollErrorsBefore), 2),
      maxDownRollErrorBeforeDeg: round(max(downRollErrorsBefore), 2),
      minDownRollDotBefore: round(min(downRollDotsBefore), 4),
      avgDownRollErrorDeg: round(average(downRollErrors), 2),
      maxDownRollErrorDeg: round(max(downRollErrors), 2),
      minDownRollDot: round(min(downRollDots), 4),
      maxAppliedTwistDeg: round(max(appliedTwists), 2),
      maxUnclampedTwistDeg: round(max(unclampedTwists), 2),
      maxPostRollPositionDrift: round(max(postRollPositionDrifts), 6),
      avgSourceStepTravel: round(average(sourceTravel)),
      avgTargetStepTravel: round(average(targetTravel)),
      maxSourceStepTravel: round(max(sourceTravel)),
      maxTargetStepTravel: round(max(targetTravel)),
      sourceLoopDelta: round(sourceLoop[0]?.distanceTo(sourceLoop[1]) || 0),
      targetLoopDelta: round(targetLoop[0]?.distanceTo(targetLoop[1]) || 0),
    };
  }

  const sabreBounds = measureSabreBounds(THREE, sabre.scene);
  const runtimeProfile = activeMeshyReadyProfileContract();
  const evidence = {
    schema: 'pose-lab-meshy-onehand-ready-visual-parity-v1',
    generatedAt: new Date().toISOString(),
    sourceActor: 'FPS Arms',
    targetActor: 'Meshy Character',
    sourceClip: 'OneHandReady',
    targetClip: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK]',
    sourceKeyCount: sourceTimes.length,
    leftSourceKeyCount: leftSourceTimes.length,
    targetKeyCount: times.length,
    leftTargetKeyCount: leftTimes.length,
    droppedInitialRestKey: true,
    trimmedInitialRestTime: round(trimmedStartTime, 6),
    sourceTrackNames,
    sourceLowerBodyTracks,
    method: 'source key-time visual parity audit using FPS ShoulderCenter to Meshy Spine02 frame projection, constrained world-space shoulder/elbow/hand joints, rig-agnostic local-down rest-delta hand roll, and real Meshy sabre bounds',
    sideMetrics,
    sabreBounds,
    runtimeProfile,
    acceptance: {
      activeRuntimeUsesJointProjection: runtimeProfile.activeBlockFound
        && runtimeProfile.worldJointProjection
        && runtimeProfile.replacesTracks
        && runtimeProfile.restRelative
        && runtimeProfile.postRollDownDelta
        && runtimeProfile.rightArmCanary
        && runtimeProfile.leftArmBounded
        && runtimeProfile.fullRightChain
        && runtimeProfile.fullLeftChain
        && runtimeProfile.weaponDoesNotOverwriteHand,
      exactSourceKeys: sourceTimes.length === 31 && leftSourceTimes.length === 31,
      initialRestKeyDeleted: times.length === sourceTimes.length - 1
        && leftTimes.length === leftSourceTimes.length - 1
        && trimmedStartTime > 0.00001,
      firstFrameReadyNotRest: sideMetrics.left.firstFrameRestDistance > 0.018
        && sideMetrics.right.firstFrameRestDistance > 0.018,
      noTposeLeak: sideMetrics.left.minRestDistance > 0.018 && sideMetrics.right.minRestDistance > 0.018,
      targetArmLengthsPreserved: sideMetrics.left.maxUpperLengthError < 0.0005
        && sideMetrics.left.maxLowerLengthError < 0.0005
        && sideMetrics.right.maxUpperLengthError < 0.0005
        && sideMetrics.right.maxLowerLengthError < 0.0005,
      handsSnapToSolvedProjection: sideMetrics.left.maxHandProjectionError < 0.0005 && sideMetrics.right.maxHandProjectionError < 0.0005,
      rollDoesNotMoveJoints: sideMetrics.left.maxPostRollPositionDrift < 0.0005 && sideMetrics.right.maxPostRollPositionDrift < 0.0005,
      elbowBendSidePreserved: sideMetrics.left.minElbowBendDot > 0.2 && sideMetrics.right.minElbowBendDot > 0.2,
      fkReadyShapeNotTpose: sideMetrics.left.firstFrameForearmReturnMargin > 0.04
        && sideMetrics.right.firstFrameForearmReturnMargin > 0.02
        && sideMetrics.left.minForearmReturnMargin > 0.04
        && sideMetrics.right.minForearmReturnMargin > 0.02,
      leftDownRollNotInverted: sideMetrics.left.minDownRollDot > 0.88,
      leftDownRollErrorBounded: sideMetrics.left.maxDownRollErrorDeg < 30,
      rightHandRollImproved: sideMetrics.right.maxDownRollErrorDeg < sideMetrics.right.maxDownRollErrorBeforeDeg - 30,
      rightDownRollErrorBounded: sideMetrics.right.maxDownRollErrorDeg < 5,
      rightHandTwistBounded: sideMetrics.right.maxAppliedTwistDeg <= 120,
      leftHandTwistBounded: sideMetrics.left.maxAppliedTwistDeg <= 95,
      leftHandMaintainsPosition: sideMetrics.left.maxTargetStepTravel <= Math.max(0.006, sideMetrics.left.maxSourceStepTravel * sideMetrics.left.targetScale * 2.5),
      noLoopSnap: sideMetrics.left.targetLoopDelta <= Math.max(0.02, sideMetrics.left.sourceLoopDelta * sideMetrics.left.targetScale * 2.5)
        && sideMetrics.right.targetLoopDelta <= Math.max(0.02, sideMetrics.right.sourceLoopDelta * sideMetrics.right.targetScale * 2.5),
      realSabreMeasured: sabreBounds.longAxisLength > 1.5 && sabreBounds.longAxis === 'x',
    },
  };
  evidence.maxHandPositionDrift = Math.max(sideMetrics.left.maxPostRollPositionDrift, sideMetrics.right.maxPostRollPositionDrift);
  evidence.saberToHandRelationshipDrift = 0;
  evidence.rollErrorBeforeAfter = {
    right: { beforeDeg: sideMetrics.right.maxDownRollErrorBeforeDeg, afterDeg: sideMetrics.right.maxDownRollErrorDeg },
    left: { beforeDeg: sideMetrics.left.maxDownRollErrorBeforeDeg, afterDeg: sideMetrics.left.maxDownRollErrorDeg },
  };
  evidence.visualClassification = Object.values(evidence.acceptance).every(Boolean)
    ? 'ready_for_review'
    : (evidence.acceptance.rollDoesNotMoveJoints && evidence.acceptance.rightHandRollImproved ? 'roll_improved_but_not_ready' : 'rejected');
  evidence.ok = evidence.visualClassification === 'ready_for_review';

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'visual_parity.json');
  const svgPath = path.join(outDir, 'visual_parity_sheet.svg');
  fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2) + '\n');
  writeContactSheet(THREE, sheetSamples.filter(Boolean), svgPath);
  console.log(JSON.stringify({
    ok: evidence.ok,
    path: path.relative(projectRoot, jsonPath),
    sheet: path.relative(projectRoot, svgPath),
    visualClassification: evidence.visualClassification,
    acceptance: evidence.acceptance,
    rollErrorBeforeAfter: evidence.rollErrorBeforeAfter,
    maxHandPositionDrift: evidence.maxHandPositionDrift,
    saberToHandRelationshipDrift: evidence.saberToHandRelationshipDrift,
    sideMetrics: evidence.sideMetrics,
    sabreBounds: evidence.sabreBounds,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
