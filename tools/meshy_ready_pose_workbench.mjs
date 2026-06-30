#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'generated', 'ready_pose_workbench');
const outArtifact = path.join(outDir, 'onehand_ready_authored_fpsref_artifact.json');
const outCandidate = path.join(outDir, 'onehand_ready_authored_fpsref_candidate.json');

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
        set src(value) {
          this._src = value;
          setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0);
        },
        get src() { return this._src || ''; },
      };
    },
  };
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

function distancePoint(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
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

function frameLocal(THREE, frame, node) {
  return worldPosition(THREE, node).sub(worldPosition(THREE, frame)).applyQuaternion(worldQuaternion(THREE, frame).invert());
}

function capturePose(root) {
  const pose = [];
  root.traverse((node) => {
    if (!node.isBone) return;
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

function applyClipRotationPose(THREE, root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const nodeName = track.name.replace(/\.quaternion$/, '');
    const node = find(root, nodeName);
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
  }
  root.updateMatrixWorld(true);
}

function keyTimesFor(clip, boneName) {
  const track = (clip.tracks || []).find((entry) => canon(entry.name.replace(/\.quaternion$/, '')) === canon(boneName));
  return Array.from(track?.times || []);
}

function bindRestLocalMap(THREE, root) {
  const worldByBone = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones) return;
    node.skeleton.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (bone && inverse && !worldByBone.has(bone)) worldByBone.set(bone, inverse.clone().invert());
    });
  });
  const out = new Map();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const [bone, world] of worldByBone.entries()) {
    const parentWorld = bone.parent?.isBone ? worldByBone.get(bone.parent) : null;
    const local = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
    local.decompose(position, quaternion, scale);
    out.set(canon(bone.name), quaternion.clone().normalize());
  }
  return out;
}

function applyBindRest(root, restMap) {
  root.traverse((node) => {
    const q = restMap.get(canon(node.name));
    if (q) node.quaternion.copy(q);
  });
  root.updateMatrixWorld(true);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject));
}

function samplePose(THREE, fpsRoot, fpsPose, readyClip, time) {
  restorePose(fpsRoot, fpsPose);
  applyClipRotationPose(THREE, fpsRoot, readyClip, time);
  const frame = requireNode(fpsRoot, 'ShoulderCenter');
  return {
    time: round(time, 6),
    source: {
      rightElbow: point(frameLocal(THREE, frame, requireNode(fpsRoot, 'Forearm.R'))),
      rightHand: point(frameLocal(THREE, frame, requireNode(fpsRoot, 'Hand.R'))),
      leftElbow: point(frameLocal(THREE, frame, requireNode(fpsRoot, 'Forearm.L'))),
      leftHand: point(frameLocal(THREE, frame, requireNode(fpsRoot, 'Hand.L'))),
    },
  };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));

  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const readyClip = fps.animations.find((clip) => clip.name === 'OneHandReady');
  const tposeClip = fps.animations.find((clip) => clip.name === '0T-Pose');
  if (!readyClip || !tposeClip) throw new Error('missing FPS OneHandReady or 0T-Pose');

  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  fpsRoot.updateMatrixWorld(true);
  meshyRoot.updateMatrixWorld(true);
  const fpsPose = capturePose(fpsRoot);
  const meshyPose = capturePose(meshyRoot);
  const meshyRestMap = bindRestLocalMap(THREE, meshyRoot);

  restorePose(meshyRoot, meshyPose);
  applyBindRest(meshyRoot, meshyRestMap);
  const meshyFrame = requireNode(meshyRoot, 'Spine02');
  const targetRest = {
    rightElbow: point(frameLocal(THREE, meshyFrame, requireNode(meshyRoot, 'RightForeArm'))),
    rightHand: point(frameLocal(THREE, meshyFrame, requireNode(meshyRoot, 'RightHand'))),
    leftElbow: point(frameLocal(THREE, meshyFrame, requireNode(meshyRoot, 'LeftForeArm'))),
    leftHand: point(frameLocal(THREE, meshyFrame, requireNode(meshyRoot, 'LeftHand'))),
  };

  const sourceTimes = keyTimesFor(readyClip, 'Hand.R');
  const usable = sourceTimes.filter((time) => time > 0.00001);
  const sampleIndices = [0, Math.floor(usable.length * 0.25), Math.floor(usable.length * 0.5), Math.floor(usable.length * 0.75), usable.length - 1]
    .filter((index, i, list) => index >= 0 && list.indexOf(index) === i);
  const samples = sampleIndices.map((index) => samplePose(THREE, fpsRoot, fpsPose, readyClip, usable[index]));

  const candidateFrames = samples.map((sample) => {
    const source = sample.source;
    const metrics = {
      rightHandHeightFromRest: round(source.rightHand[1] - targetRest.rightHand[1]),
      leftHandHeightFromRest: round(source.leftHand[1] - targetRest.leftHand[1]),
      rightOutwardFromRest: round(Math.abs(source.rightHand[0]) - Math.abs(targetRest.rightHand[0])),
      leftOutwardFromRest: round(Math.abs(source.leftHand[0]) - Math.abs(targetRest.leftHand[0])),
    };
    return {
      time: sample.time,
      pose: {
        rightElbow: source.rightElbow,
        rightHand: source.rightHand,
        leftElbow: source.leftElbow,
        leftHand: source.leftHand,
      },
      metrics,
    };
  });

  const artifact = {
    schema: 'pose-lab-meshy-ready-workbench-v1',
    generatedAt: new Date().toISOString(),
    status: 'candidate-only',
    promotable: false,
    sourceActor: 'FPS Arms',
    sourceClip: 'OneHandReady',
    sourceAsset: 'assets/models/FPSPlayer.glb',
    targetActor: 'Meshy Character',
    targetRestClip: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
    targetAsset: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    method: 'upper-body authored overlay workbench; source reference only, not an accepted runtime clip',
    excluded: ['hips', 'root', 'legs', 'feet', 'toes', 'head', 'weapon orientation', 'locomotion'],
    sourceKeyCount: sourceTimes.length,
    sampleCount: samples.length,
    targetRestPose: targetRest,
    samples,
    acceptance: {
      requiresFreshVisualEvidence: true,
      requiresMetricImprovement: true,
      swordIgnored: true,
      mayPromoteToStartup: false,
    },
    outputs: {
      candidate: path.relative(projectRoot, outCandidate),
    },
  };

  const candidate = {
    schema: 'pose-lab-upper-body-ready-overlay-plan-v1',
    name: 'OneHandReady -> meshyCharacter [READY-AUTHORED-FPSREF]',
    status: 'candidate-only',
    sourceClip: 'OneHandReady',
    targetRestClip: artifact.targetRestClip,
    upperBodyOnly: true,
    excluded: artifact.excluded,
    frames: candidateFrames,
    note: 'This is an authoring plan, not a runtime clip. Convert these chest-local targets into keyed Meshy arm rotations only after passing visual review.',
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outArtifact, JSON.stringify(artifact, null, 2) + '\n');
  fs.writeFileSync(outCandidate, JSON.stringify(candidate, null, 2) + '\n');
  console.log(JSON.stringify({
    ok: true,
    artifact: path.relative(projectRoot, outArtifact),
    candidate: path.relative(projectRoot, outCandidate),
    samples: samples.length,
    promotable: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
