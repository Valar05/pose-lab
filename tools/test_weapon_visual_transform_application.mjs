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
  captureWeaponRuntimeLandmarks,
  weaponPlacementConfigSignature,
  weaponWorldQuaternion,
} from '../src/weapon-runtime-rules.mjs';
import { resolvePoseLabActorRuntimeConfig } from '../src/pose-lab-profile-resolver.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
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

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits));
}

function roundVec(vec, digits = 6) {
  return vec.toArray().map((value) => round(value, digits));
}

function distance(a, b) {
  return a && b ? a.distanceTo(b) : Infinity;
}

function localDeltaToWorldDelta(THREE, parent, delta) {
  parent.updateMatrixWorld(true);
  const origin = parent.localToWorld(new THREE.Vector3());
  const moved = parent.localToWorld(delta.clone());
  return moved.sub(origin);
}

function localPositionOf(THREE, parent, child) {
  parent.updateMatrixWorld(true);
  child.updateMatrixWorld(true);
  return parent.worldToLocal(child.getWorldPosition(new THREE.Vector3()));
}

function localQuaternionOf(THREE, parent, child) {
  parent.updateMatrixWorld(true);
  child.updateMatrixWorld(true);
  return parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(child.getWorldQuaternion(new THREE.Quaternion())).normalize();
}

function makeProxy(THREE, actorRoot, sabreRoot, config) {
  const rightHand = findRuntimeNode(actorRoot, config.proxy.handBone);
  const leftHand = config.proxy.leftHandBone ? findRuntimeNode(actorRoot, config.proxy.leftHandBone) : null;
  if (!rightHand) throw new Error(`missing ${config.proxy.handBone}`);
  const root = new THREE.Bone();
  root.name = config.proxy.socketBone || 'WeaponGrip';
  root.userData.syntheticWeaponBone = true;
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

function syncWeapon(THREE, actorRoot, proxy, { force = true } = {}) {
  const placementSignature = weaponPlacementConfigSignature(THREE, proxy.config, {
    model: actorRoot,
    parent: proxy.rightHand,
  });
  const socketResult = applyWeaponSocketRuntimeRules(THREE, {
    model: actorRoot,
    proxy,
    animatedSocketRotation: false,
    animatedSourceSocketRotation: false,
    force,
    placementSignature,
  });
  const attachmentResult = applyWeaponAttachmentRuntimeRules(THREE, {
    actorModel: actorRoot,
    proxy,
    config: proxy.attachmentConfig,
  });
  actorRoot.updateMatrixWorld(true);
  proxy.rightHand.updateMatrixWorld(true);
  proxy.root.updateMatrixWorld(true);
  proxy.displayRoot.updateMatrixWorld(true);
  proxy.model.updateMatrixWorld(true);
  proxy.tipMarker.updateMatrixWorld(true);
  return { socketResult, attachmentResult, landmarks: captureWeaponRuntimeLandmarks(THREE, proxy) };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));

  const config = resolvePoseLabActorRuntimeConfig('meshyCharacter');
  assert(config.proxy.parentMode === 'hand-fk', `Meshy must stay hand-fk for this contract, got ${config.proxy.parentMode}`);

  const actorGltf = await loadGlb(GLTFLoader, path.join(projectRoot, config.actor.url));
  fitModelToHeight(THREE, actorGltf.scene, config.actor.targetHeight);
  const sabreGltf = await loadGlb(GLTFLoader, path.join(projectRoot, config.attachment.url));
  const proxy = makeProxy(THREE, actorGltf.scene, sabreGltf.scene, config);

  const initial = syncWeapon(THREE, actorGltf.scene, proxy, { force: true });
  assert(initial.socketResult?.mode === 'hand-fk', `expected hand-fk socket application, got ${JSON.stringify(initial.socketResult)}`);
  assert(initial.attachmentResult?.weaponRoot === proxy.model, 'attachment rules must apply to the real sabre model');
  assert(initial.landmarks?.visibleMeshHilt, 'real visible mesh hilt landmark must be measurable');

  const startSocketLocal = proxy.root.position.clone();
  const startSocketWorld = proxy.root.getWorldPosition(new THREE.Vector3());
  const startDisplayWorld = proxy.displayRoot.getWorldPosition(new THREE.Vector3());
  const startModelWorld = proxy.model.getWorldPosition(new THREE.Vector3());
  const startHiltWorld = initial.landmarks.appliedHilt.clone();
  const startVisibleHiltWorld = initial.landmarks.visibleMeshHilt.clone();
  const startTipWorld = initial.landmarks.tip.clone();

  const localDelta = new THREE.Vector3(0.047, -0.026, 0.031);
  proxy.config.modelLocalOffset = proxy.config.modelLocalOffset.map((value, index) => round(Number(value || 0) + localDelta.getComponent(index), 5));
  const moved = syncWeapon(THREE, actorGltf.scene, proxy, { force: true });
  const movedSocketLocal = proxy.root.position.clone();
  const actualLocalDelta = movedSocketLocal.clone().sub(startSocketLocal);
  const expectedLocalDelta = localDelta;
  const expectedWorldMotion = localDeltaToWorldDelta(THREE, proxy.rightHand, expectedLocalDelta).length();
  const minWorldMotion = Math.max(0.000001, expectedWorldMotion * 0.45);

  assert(distance(actualLocalDelta, expectedLocalDelta) < 0.00002, `Move must update WeaponGrip local position by authored RightHand-local delta, expected ${roundVec(expectedLocalDelta)} got ${roundVec(actualLocalDelta)}`);
  assert(distance(proxy.root.getWorldPosition(new THREE.Vector3()), startSocketWorld) > minWorldMotion, `Move must change WeaponGrip world position by scaled rig delta, expected > ${minWorldMotion}`);
  assert(distance(proxy.displayRoot.getWorldPosition(new THREE.Vector3()), startDisplayWorld) > minWorldMotion, `Move must change displayRoot world position by scaled rig delta, expected > ${minWorldMotion}`);
  assert(distance(proxy.model.getWorldPosition(new THREE.Vector3()), startModelWorld) > minWorldMotion, `Move must change real sabre model world position by scaled rig delta, expected > ${minWorldMotion}`);
  assert(distance(moved.landmarks.appliedHilt, startHiltWorld) > minWorldMotion, `Move must change applied hilt world position by scaled rig delta, expected > ${minWorldMotion}`);
  assert(distance(moved.landmarks.visibleMeshHilt, startVisibleHiltWorld) > minWorldMotion, `Move must change visible mesh hilt world position by scaled rig delta, expected > ${minWorldMotion}`);
  assert(distance(moved.landmarks.tip, startTipWorld) > minWorldMotion, `Move must change visible tip world position by scaled rig delta, expected > ${minWorldMotion}`);

  const socketLocalAfterMove = proxy.root.position.clone();
  const socketQuatAfterMove = localQuaternionOf(THREE, proxy.rightHand, proxy.root);
  const modelLocalQuatBeforeRotate = localQuaternionOf(THREE, proxy.displayRoot, proxy.model);
  const modelWorldQuatBeforeRotate = weaponWorldQuaternion(THREE, proxy.model);
  const hiltBeforeRotate = moved.landmarks.appliedHilt.clone();
  proxy.attachmentConfig.rotationDeg = proxy.attachmentConfig.rotationDeg.map((value, index) => round(Number(value || 0) + [11, -17, 23][index], 3));
  const rotated = syncWeapon(THREE, actorGltf.scene, proxy, { force: true });
  const modelLocalQuatAfterRotate = localQuaternionOf(THREE, proxy.displayRoot, proxy.model);
  const modelWorldQuatAfterRotate = weaponWorldQuaternion(THREE, proxy.model);

  assert(distance(proxy.root.position, socketLocalAfterMove) < 0.000001, 'Rotate must not rewrite WeaponGrip local position');
  assert(socketQuatAfterMove.angleTo(localQuaternionOf(THREE, proxy.rightHand, proxy.root)) < 0.000001, 'Rotate must not rewrite WeaponGrip local quaternion');
  assert(modelLocalQuatBeforeRotate.angleTo(modelLocalQuatAfterRotate) > THREE.MathUtils.degToRad(5), 'Rotate must change the real sabre mesh local quaternion');
  assert(modelWorldQuatBeforeRotate.angleTo(modelWorldQuatAfterRotate) > THREE.MathUtils.degToRad(5), 'Rotate must change the real sabre mesh world quaternion');
  assert(distance(rotated.landmarks.appliedHilt, proxy.root.getWorldPosition(new THREE.Vector3())) < 0.0005, 'Rotate must keep the applied hilt pinned to WeaponGrip');
  assert(distance(rotated.landmarks.appliedHilt, hiltBeforeRotate) < 0.0005, 'Rotate must pivot around the applied hilt instead of moving it');

  const hiltBeforeScale = rotated.landmarks.appliedHilt.clone();
  const tipBeforeScale = rotated.landmarks.tip.clone();
  const visibleHiltBeforeScale = rotated.landmarks.visibleMeshHilt.clone();
  const bladeLengthBeforeScale = distance(hiltBeforeScale, tipBeforeScale);
  const modelWorldScaleBefore = proxy.model.getWorldScale(new THREE.Vector3());
  proxy.attachmentConfig.scale = round(Number(proxy.attachmentConfig.scale || 1) * 1.18, 5);
  const scaled = syncWeapon(THREE, actorGltf.scene, proxy, { force: true });
  const bladeLengthAfterScale = distance(scaled.landmarks.appliedHilt, scaled.landmarks.tip);
  const modelWorldScaleAfter = proxy.model.getWorldScale(new THREE.Vector3());

  assert(distance(scaled.landmarks.appliedHilt, hiltBeforeScale) < 0.0005, 'Scale must keep the applied hilt pinned to WeaponGrip');
  assert(distance(scaled.landmarks.visibleMeshHilt, scaled.landmarks.appliedHilt) < 0.05, 'Scale must keep the mesh-derived hilt landmark near the pinned applied hilt');
  assert(Math.abs(bladeLengthAfterScale - bladeLengthBeforeScale) > 0.01, `Scale must visibly change blade/tip distance, before=${bladeLengthBeforeScale} after=${bladeLengthAfterScale}`);
  assert(modelWorldScaleAfter.distanceTo(modelWorldScaleBefore) > 0.01, `Scale must change real sabre model world scale, before=${roundVec(modelWorldScaleBefore)} after=${roundVec(modelWorldScaleAfter)}`);

  const displayLocal = localPositionOf(THREE, proxy.root, proxy.displayRoot);
  const modelLocal = localPositionOf(THREE, proxy.displayRoot, proxy.model);
  const report = {
    checked: 'weapon-visual-transform-application',
    actor: config.actorKey,
    move: {
      expectedWeaponGripLocalDelta: roundVec(expectedLocalDelta),
      actualWeaponGripLocalDelta: roundVec(actualLocalDelta),
      expectedWorldMotion: round(expectedWorldMotion, 8),
      minAcceptedWorldMotion: round(minWorldMotion, 8),
      weaponGripWorldMotion: round(distance(moved.landmarks.socket, startSocketWorld), 8),
      modelWorldMotion: round(distance(moved.landmarks.model, startModelWorld), 8),
      visibleMeshHiltWorldMotion: round(distance(moved.landmarks.visibleMeshHilt, startVisibleHiltWorld), 5),
    },
    rotate: {
      weaponGripLocalStable: round(distance(proxy.root.position, socketLocalAfterMove), 8),
      sabreLocalQuaternionDeltaDeg: round(THREE.MathUtils.radToDeg(modelLocalQuatBeforeRotate.angleTo(modelLocalQuatAfterRotate)), 4),
      sabreWorldQuaternionDeltaDeg: round(THREE.MathUtils.radToDeg(modelWorldQuatBeforeRotate.angleTo(modelWorldQuatAfterRotate)), 4),
      hiltToWeaponGrip: round(distance(rotated.landmarks.appliedHilt, proxy.root.getWorldPosition(new THREE.Vector3())), 6),
    },
    scale: {
      beforeBladeLength: round(bladeLengthBeforeScale, 5),
      afterBladeLength: round(bladeLengthAfterScale, 5),
      hiltDrift: round(distance(scaled.landmarks.appliedHilt, hiltBeforeScale), 6),
      visibleHiltDrift: round(distance(scaled.landmarks.visibleMeshHilt, visibleHiltBeforeScale), 6),
      visibleHiltToAppliedHilt: round(distance(scaled.landmarks.visibleMeshHilt, scaled.landmarks.appliedHilt), 6),
    },
    finalChain: {
      displayRootLocal: roundVec(displayLocal),
      modelLocal: roundVec(modelLocal),
    },
  };

  if (failures.length) throw new Error(`${failures.join('\n')}\n${JSON.stringify(report, null, 2)}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
