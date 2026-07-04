#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findRuntimeNode, fitModelToHeight } from '../src/pose-runtime-rules.mjs';
import {
  applyWeaponAttachmentRuntimeRules,
  applyWeaponSocketRuntimeRules,
  captureWeaponPinningRuntimeState,
  captureWeaponRuntimeLandmarks,
  weaponPlacementConfigSignature,
} from '../src/weapon-runtime-rules.mjs';
import { RIG_PROFILES } from '../src/rig-profiles.js';
import { resolvePoseLabActorRuntimeConfig } from '../src/pose-lab-profile-resolver.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_HILT_ORACLE = [0.6535, -0.02302, -0.07317];
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sameVec(a, b, epsilon = 0.000001) {
  return Array.isArray(a)
    && Array.isArray(b)
    && a.length === b.length
    && a.every((value, index) => Math.abs(Number(value) - Number(b[index])) <= epsilon);
}

function distance(a, b) {
  return a && b ? a.distanceTo(b) : Infinity;
}

function roundVec(vec, digits = 6) {
  return vec ? vec.toArray().map((value) => Number(Number(value || 0).toFixed(digits))) : null;
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
  const dir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(dir, 'build', 'three.module.js')) || !fs.existsSync(path.join(dir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), dir]);
  }
  return dir;
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
}

function makeProxy(THREE, actorRoot, sabreRoot, config) {
  const rightHand = findRuntimeNode(actorRoot, config.proxy.handBone);
  const leftHand = config.proxy.leftHandBone ? findRuntimeNode(actorRoot, config.proxy.leftHandBone) : null;
  if (!rightHand) throw new Error(`missing ${config.proxy.handBone}`);
  const root = new THREE.Bone();
  root.name = config.proxy.socketBone || 'WeaponGrip';
  rightHand.add(root);
  const displayRoot = new THREE.Group();
  displayRoot.name = root.name + '-display-root';
  root.add(displayRoot);
  const model = sabreRoot;
  model.name = config.attachment.name;
  displayRoot.add(model);
  const tipMarker = new THREE.Group();
  tipMarker.name = config.attachment.tipMarker;
  displayRoot.add(tipMarker);
  return {
    root,
    displayRoot,
    config: JSON.parse(JSON.stringify(config.proxy)),
    rightHand,
    leftHand,
    syntheticSourceSocket: null,
    model,
    tipMarker,
    attachmentConfig: JSON.parse(JSON.stringify(config.attachment)),
    fkPlacementSignature: '',
    fkLocalPosition: null,
    fkLocalQuaternion: null,
  };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));

  const profile = RIG_PROFILES.meshyCharacter;
  assert(sameVec(profile?.weaponAttachment?.gripLocalPosition, USER_HILT_ORACLE), `rig profile Meshy gripLocalPosition must equal user hilt oracle, got ${JSON.stringify(profile?.weaponAttachment?.gripLocalPosition)}`);

  const config = resolvePoseLabActorRuntimeConfig('meshyCharacter');
  assert(sameVec(config.attachment.gripLocalPosition, USER_HILT_ORACLE), `resolver must preserve user hilt oracle, got ${JSON.stringify(config.attachment.gripLocalPosition)}`);

  const actorGltf = await loadGlb(GLTFLoader, path.join(projectRoot, config.actor.url));
  fitModelToHeight(THREE, actorGltf.scene, config.actor.targetHeight);
  const sabreGltf = await loadGlb(GLTFLoader, path.join(projectRoot, config.attachment.url));
  const proxy = makeProxy(THREE, actorGltf.scene, sabreGltf.scene, config);

  assert(sameVec(proxy.attachmentConfig.gripLocalPosition, USER_HILT_ORACLE), `proxy.attachmentConfig must preserve user hilt oracle before runtime apply, got ${JSON.stringify(proxy.attachmentConfig.gripLocalPosition)}`);

  const socketResult = applyWeaponSocketRuntimeRules(THREE, {
    model: actorGltf.scene,
    proxy,
    force: true,
    placementSignature: weaponPlacementConfigSignature(THREE, proxy.config, {
      model: actorGltf.scene,
      parent: proxy.rightHand,
    }),
  });
  const attachmentResult = applyWeaponAttachmentRuntimeRules(THREE, {
    actorModel: actorGltf.scene,
    proxy,
    config: proxy.attachmentConfig,
  });

  actorGltf.scene.updateMatrixWorld(true);
  proxy.rightHand.updateMatrixWorld(true);
  proxy.root.updateMatrixWorld(true);
  proxy.displayRoot.updateMatrixWorld(true);
  proxy.model.updateMatrixWorld(true);
  proxy.tipMarker.updateMatrixWorld(true);

  const landmarks = captureWeaponRuntimeLandmarks(THREE, proxy);
  const pinning = captureWeaponPinningRuntimeState(THREE, proxy);
  const configuredLocalHiltWorld = proxy.model.localToWorld(new THREE.Vector3().fromArray(USER_HILT_ORACLE));
  const weaponGripWorld = proxy.root.getWorldPosition(new THREE.Vector3());
  const displayRootLocal = proxy.root.worldToLocal(proxy.displayRoot.getWorldPosition(new THREE.Vector3()));
  const sabreMeshLocal = proxy.displayRoot.worldToLocal(proxy.model.getWorldPosition(new THREE.Vector3()));

  assert(socketResult?.mode === 'hand-fk', `socket runtime must apply boring hand-fk placement, got ${JSON.stringify({ mode: socketResult?.mode, local: socketResult?.local, fkLocalPosition: socketResult?.fkLocalPosition })}`);
  assert(attachmentResult?.weaponRoot === proxy.model, 'attachment runtime must apply to the real sabre mesh root');
  assert(sameVec(proxy.attachmentConfig.gripLocalPosition, USER_HILT_ORACLE), `applyWeaponAttachmentRuntimeRules must not mutate the user hilt oracle, got ${JSON.stringify(proxy.attachmentConfig.gripLocalPosition)}`);
  assert(distance(configuredLocalHiltWorld, weaponGripWorld) <= 0.0005, `configured user hilt oracle point must pin to WeaponGrip, distance=${distance(configuredLocalHiltWorld, weaponGripWorld)}`);
  assert(distance(landmarks.appliedHilt, weaponGripWorld) <= 0.0005, `applied hilt must pin to WeaponGrip, distance=${distance(landmarks.appliedHilt, weaponGripWorld)}`);
  assert(distance(landmarks.visibleMeshHilt, weaponGripWorld) <= 0.05, `visible mesh hilt must stay pinned near WeaponGrip, distance=${distance(landmarks.visibleMeshHilt, weaponGripWorld)}`);
  assert(pinning.checks?.appliedHiltPinnedToSocket === true, `shared pinning state must prove applied hilt to WeaponGrip: ${JSON.stringify(pinning.distances)}`);

  const protectedSources = [
    'tools/socket_solver.mjs',
    'tools/semantic_landmark_calibration.mjs',
    'tools/pose_lab_offline_render.mjs',
    'tools/refresh_pose_lab_offline_visual_evidence.mjs',
  ];
  for (const relative of protectedSources) {
    const source = fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    assert(!/writeFileSync\([^)]*src[\\/]+rig-profiles\.js/.test(source), `${relative} must not overwrite rig profile oracle values`);
  }

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({
    checked: ['visible-mesh-hilt-oracle-profile-resolver-proxy-runtime-trace', 'generated-tools-do-not-overwrite-oracle'],
    visibleMeshHiltOracle: USER_HILT_ORACLE,
    socketMode: socketResult.mode,
    proxyAttachmentGripLocalPosition: proxy.attachmentConfig.gripLocalPosition,
    displayRootLocalUnderWeaponGrip: roundVec(displayRootLocal),
    sabreMeshLocalUnderDisplayRoot: roundVec(sabreMeshLocal),
    configuredHiltWorld: roundVec(configuredLocalHiltWorld),
    weaponGripWorld: roundVec(weaponGripWorld),
    appliedHiltWorld: roundVec(landmarks.appliedHilt),
    visibleMeshHiltWorld: roundVec(landmarks.visibleMeshHilt),
    distances: {
      configuredHiltToWeaponGrip: Number(distance(configuredLocalHiltWorld, weaponGripWorld).toFixed(6)),
      appliedHiltToWeaponGrip: Number(distance(landmarks.appliedHilt, weaponGripWorld).toFixed(6)),
      visibleMeshHiltToWeaponGrip: Number(distance(landmarks.visibleMeshHilt, weaponGripWorld).toFixed(6)),
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
