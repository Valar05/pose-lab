#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js'))) {
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
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function find(root, name) {
  const wanted = canon(name);
  let out = null;
  root.traverse((node) => { if (!out && canon(node.name) === wanted) out = node; });
  return out;
}
function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}
function vec(v) { return [round(v.x), round(v.y), round(v.z)]; }
function deg(rad) { return rad * 180 / Math.PI; }
function axisVector(THREE, axis) {
  return new THREE.Vector3(Number(axis[0] || 0), Number(axis[1] || 0), Number(axis[2] || 0));
}
function axisLabel(axis) {
  const labels = ['X', 'Y', 'Z'];
  const index = axis.findIndex((value) => Math.abs(value) > 0.5);
  return `${axis[index] < 0 ? '-' : '+'}${labels[index] || '?'}`;
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
function setBoneWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = worldQuaternion(THREE, bone.parent).invert();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}
function sampleTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}
function applyClipPose(THREE, root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const node = find(root, track.name.replace(/\.quaternion$/, ''));
    if (node) node.quaternion.copy(sampleTrack(THREE, track, time));
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
async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject));
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
  if (!tpose) throw new Error('FPS 0T-Pose clip not found');
  applyClipPose(THREE, fpsRoot, tpose, 0);
  applyLocalRest(meshyRoot, bindRestLocalMap(THREE, meshyRoot));

  const sourceFrame = find(fpsRoot, 'ShoulderCenter');
  const targetFrame = find(meshyRoot, 'Spine02');
  const specs = [
    { side: 'right', label: 'upper', sourceA: 'Arm.R', sourceB: 'Forearm.R', targetA: 'RightArm', targetB: 'RightForeArm' },
    { side: 'right', label: 'lower', sourceA: 'Forearm.R', sourceB: 'Hand.R', targetA: 'RightForeArm', targetB: 'RightHand' },
    { side: 'left', label: 'upper', sourceA: 'Arm.L', sourceB: 'Forearm.L', targetA: 'LeftArm', targetB: 'LeftForeArm' },
    { side: 'left', label: 'lower', sourceA: 'Forearm.L', sourceB: 'Hand.L', targetA: 'LeftForeArm', targetB: 'LeftHand' },
  ];
  const segments = [];
  for (const spec of specs) {
    const sourceA = find(fpsRoot, spec.sourceA);
    const sourceB = find(fpsRoot, spec.sourceB);
    const targetA = find(meshyRoot, spec.targetA);
    const targetB = find(meshyRoot, spec.targetB);
    const desired = mapDirectionBetweenFrames(THREE, segmentDirection(THREE, sourceA, sourceB), sourceFrame, targetFrame);
    const before = segmentDirection(THREE, targetA, targetB);
    const beforeDeg = deg(before.angleTo(desired));
    const turn = new THREE.Quaternion().setFromUnitVectors(before, desired).normalize();
    setBoneWorldQuaternion(THREE, targetA, turn.multiply(worldQuaternion(THREE, targetA)).normalize());
    meshyRoot.updateMatrixWorld(true);
    const after = segmentDirection(THREE, targetA, targetB);
    const afterDeg = deg(after.angleTo(desired));
    segments.push({
      ...spec,
      desired: vec(desired),
      before: vec(before),
      after: vec(after),
      beforeDeg: round(beforeDeg),
      afterDeg: round(afterDeg),
      localQuaternionAfter: [targetA.quaternion.x, targetA.quaternion.y, targetA.quaternion.z, targetA.quaternion.w].map((value) => round(value, 5)),
    });
  }
  const rightForearm = find(meshyRoot, 'RightForeArm');
  const rightHand = find(meshyRoot, 'RightHand');
  const sourceRightHand = find(fpsRoot, 'Hand.R');
  const rightAxis = segmentDirection(THREE, rightForearm, rightHand);
  const candidateAxes = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const handRollCandidates = [];
  for (const sourceLocalAxis of candidateAxes) {
    const sourceWorld = axisVector(THREE, sourceLocalAxis).applyQuaternion(worldQuaternion(THREE, sourceRightHand)).normalize();
    const desired = mapDirectionBetweenFrames(THREE, sourceWorld, sourceFrame, targetFrame);
    const desiredProjected = projectedAroundAxis(THREE, desired, rightAxis);
    if (!desiredProjected) continue;
    for (const targetLocalAxis of candidateAxes) {
      const current = projectedAroundAxis(THREE, axisVector(THREE, targetLocalAxis).applyQuaternion(worldQuaternion(THREE, rightHand)).normalize(), rightAxis);
      if (!current) continue;
      const signed = Math.atan2(new THREE.Vector3().crossVectors(current, desiredProjected).dot(rightAxis), current.dot(desiredProjected));
      handRollCandidates.push({
        sourceLocalAxis: axisLabel(sourceLocalAxis),
        targetLocalAxis: axisLabel(targetLocalAxis),
        signedDeg: round(deg(signed)),
        absDeg: round(Math.abs(deg(signed))),
        desired: vec(desiredProjected),
        current: vec(current),
      });
    }
  }
  handRollCandidates.sort((a, b) => a.absDeg - b.absDeg);
  const sourceRightHandPlusZ = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion(THREE, sourceRightHand)).normalize();
  const rightDesiredRoll = projectedAroundAxis(THREE, mapDirectionBetweenFrames(THREE, sourceRightHandPlusZ, sourceFrame, targetFrame), rightAxis);
  const rightCurrentRoll = projectedAroundAxis(
    THREE,
    new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuaternion(THREE, rightHand)).normalize(),
    rightAxis
  );
  const rightRollBeforeDeg = deg(rightCurrentRoll.angleTo(rightDesiredRoll));
  const signedRightRoll = Math.atan2(new THREE.Vector3().crossVectors(rightCurrentRoll, rightDesiredRoll).dot(rightAxis), rightCurrentRoll.dot(rightDesiredRoll));
  const rightRollStrength = 1.0;
  const acceptedRollOffsetDeg = 0;
  const appliedRightRoll = (signedRightRoll * rightRollStrength) + THREE.MathUtils.degToRad(acceptedRollOffsetDeg);
  const rightTurn = new THREE.Quaternion().setFromAxisAngle(rightAxis, appliedRightRoll).normalize();
  setBoneWorldQuaternion(THREE, rightHand, rightTurn.multiply(worldQuaternion(THREE, rightHand)).normalize());
  meshyRoot.updateMatrixWorld(true);
  const rightRollAfter = projectedAroundAxis(
    THREE,
    new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuaternion(THREE, rightHand)).normalize(),
    rightAxis
  );
  const rightRollAfterDeg = deg(rightRollAfter.angleTo(rightDesiredRoll));
  const handRolls = [
    {
      side: 'right',
      targetForearm: 'RightForeArm',
      targetHand: 'RightHand',
      sourceHand: 'Hand.R',
      sourceLocalAxis: [0, 0, 1],
      targetLocalAxis: [0, -1, 0],
      strength: rightRollStrength,
      rollOffsetDeg: acceptedRollOffsetDeg,
      beforeDeg: round(rightRollBeforeDeg),
      afterDeg: round(rightRollAfterDeg),
      appliedDeg: round(Math.abs(deg(appliedRightRoll))),
      localQuaternionAfter: [rightHand.quaternion.x, rightHand.quaternion.y, rightHand.quaternion.z, rightHand.quaternion.w].map((value) => round(value, 5)),
    },
  ];
  const metrics = {
    maxBeforeDeg: round(Math.max(...segments.map((entry) => entry.beforeDeg))),
    maxAfterDeg: round(Math.max(...segments.map((entry) => entry.afterDeg))),
    maxHandDownBeforeDeg: round(Math.max(...handRolls.map((entry) => entry.beforeDeg))),
    maxHandRollAfterDeg: round(Math.max(...handRolls.map((entry) => entry.afterDeg))),
    maxHandRollAppliedDeg: round(Math.max(...handRolls.map((entry) => entry.appliedDeg))),
  };
  const payload = {
    schema: 'pose-lab-meshy-fps-rest-segment-audit-v1',
    sourceRest: 'FPSPlayer.glb 0T-Pose',
    targetRest: 'Meshy animated GLB skin-bind',
    method: 'world bone segment directions mapped from ShoulderCenter to Spine02',
    segments,
    handRollCandidates: handRollCandidates.slice(0, 18),
    handRolls,
    metrics,
  };
  const out = path.join(projectRoot, 'generated/core_transform_audit/meshy_fps_rest_segment_audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, path: path.relative(projectRoot, out), metrics }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
