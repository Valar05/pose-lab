import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  applyWeaponAttachmentRuntimeRules,
  applyWeaponSocketRuntimeRules,
  captureWeaponRuntimeLandmarks,
  weaponPlacementConfigSignature,
} from '../src/weapon-runtime-rules.mjs';
import {
  findRuntimeNode,
  fitModelToHeight,
} from '../src/pose-runtime-rules.mjs';
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

function localPoint(THREE, driver, point) {
  return driver.worldToLocal(point.clone());
}

function distance(a, b) {
  return a.distanceTo(b);
}

function makeProxy(THREE, actorRoot, sabreRoot, config, parentMode) {
  const rightHand = findRuntimeNode(actorRoot, config.proxy.handBone);
  const leftHand = findRuntimeNode(actorRoot, config.proxy.leftHandBone);
  if (!rightHand) throw new Error(`missing ${config.proxy.handBone}`);
  const proxyConfig = { ...config.proxy, parentMode };
  const syntheticSourceSocket = parentMode === 'synthetic-source-socket' ? new THREE.Bone() : null;
  if (syntheticSourceSocket) {
    syntheticSourceSocket.name = proxyConfig.syntheticSourceSocketBone || 'WeaponR';
    syntheticSourceSocket.userData.syntheticWeaponBone = true;
    rightHand.add(syntheticSourceSocket);
  }
  const root = new THREE.Bone();
  root.name = proxyConfig.socketBone || 'WeaponGrip';
  root.userData.syntheticWeaponBone = true;
  if (syntheticSourceSocket) syntheticSourceSocket.add(root);
  else rightHand.add(root);
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
    config: proxyConfig,
    rightHand,
    leftHand,
    syntheticSourceSocket,
    model,
    tipMarker,
    attachmentConfig: config.attachment,
    fkPlacementSignature: '',
    fkLocalPosition: null,
    fkLocalQuaternion: null,
    syntheticFkSignature: '',
    syntheticFkLocalPosition: null,
    syntheticFkLocalQuaternion: null,
  };
}

function syncWeapon(THREE, actorRoot, proxy, attachmentConfig, options = {}) {
  const placementSignature = options.placementSignature || weaponPlacementConfigSignature(THREE, proxy.config, {
    model: actorRoot,
    parent: proxy.syntheticSourceSocket || proxy.rightHand || null,
  });
  applyWeaponSocketRuntimeRules(THREE, {
    model: actorRoot,
    proxy,
    animatedSocketRotation: Boolean(options.animatedSocketRotation),
    animatedSourceSocketRotation: Boolean(options.animatedSourceSocketRotation),
    force: Boolean(options.force),
    placementSignature,
  });
  applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actorRoot, proxy, config: attachmentConfig });
  actorRoot.updateMatrixWorld(true);
  proxy.root.updateMatrixWorld(true);
  proxy.displayRoot.updateMatrixWorld(true);
  proxy.model.updateMatrixWorld(true);
  proxy.tipMarker.updateMatrixWorld(true);
}

function assertRigidUnderDriver(THREE, actorRoot, proxy, attachmentConfig, driver, options = {}) {
  syncWeapon(THREE, actorRoot, proxy, attachmentConfig, { ...options, force: true, placementSignature: 'driver-invariant-initial' });
  const before = captureWeaponRuntimeLandmarks(THREE, proxy);
  const beforeHilt = localPoint(THREE, driver, before.appliedHilt);
  const beforeTip = localPoint(THREE, driver, before.tip);
  driver.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.37, -0.21, 0.29))).normalize();
  actorRoot.updateMatrixWorld(true);
  syncWeapon(THREE, actorRoot, proxy, attachmentConfig, { ...options, placementSignature: 'driver-invariant-next-clip' });
  const after = captureWeaponRuntimeLandmarks(THREE, proxy);
  const hiltDrift = distance(beforeHilt, localPoint(THREE, driver, after.appliedHilt));
  const tipDrift = distance(beforeTip, localPoint(THREE, driver, after.tip));
  return { hiltDrift, tipDrift };
}

async function main() {
  const poseLabSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  const profilesSource = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  assert(!poseLabSource.includes('clipKey: context.clipKey'), 'weapon placement signature must not include active clip key');
  assert(!poseLabSource.includes('restPose: context.restPose'), 'weapon placement signature must not include current rest pose');
  assert(poseLabSource.includes('if (!force) return;'), 'runtime weapon sync must not rewrite boneRest every frame');
  const restBlockStart = profilesSource.indexOf("clipTag: 'FPS-REST-ARMS-CAL'");
  const restBlockEnd = profilesSource.indexOf('directRotationPairs: MESHY_FPS_REST_DIRECT_PAIRS', restBlockStart);
  const restBlock = restBlockStart >= 0 && restBlockEnd > restBlockStart ? profilesSource.slice(restBlockStart, restBlockEnd) : '';
  assert(restBlock && restBlock.includes('weaponKeyConvert') && restBlock.includes("targetWeapon: 'WeaponR'") && restBlock.includes('applyToHand: false'), 'T-pose rest bridge must key the generic FPS-authored WeaponR socket without forcing the hand');
  assert(restBlock && !restBlock.includes("targetWeapon: 'WeaponGrip'") && !restBlock.includes('applyToHand: true'), 'T-pose rest bridge must not animate WeaponGrip or solve the hand from the socket');

  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const config = resolvePoseLabActorRuntimeConfig('meshyCharacter');
  const actorPath = path.join(projectRoot, config.actor.url);
  const weaponPath = path.join(projectRoot, config.attachment.url);

  const syntheticActor = await loadGlb(GLTFLoader, actorPath);
  fitModelToHeight(THREE, syntheticActor.scene, config.actor.targetHeight);
  const syntheticWeapon = await loadGlb(GLTFLoader, weaponPath);
  const syntheticProxy = makeProxy(THREE, syntheticActor.scene, syntheticWeapon.scene, config, 'synthetic-source-socket');
  syncWeapon(THREE, syntheticActor.scene, syntheticProxy, config.attachment, { force: true });
  const weaponRDrift = assertRigidUnderDriver(THREE, syntheticActor.scene, syntheticProxy, config.attachment, syntheticProxy.syntheticSourceSocket, { animatedSourceSocketRotation: true });

  const handActor = await loadGlb(GLTFLoader, actorPath);
  fitModelToHeight(THREE, handActor.scene, config.actor.targetHeight);
  const handWeapon = await loadGlb(GLTFLoader, weaponPath);
  const handProxy = makeProxy(THREE, handActor.scene, handWeapon.scene, config, 'hand-fk');
  syncWeapon(THREE, handActor.scene, handProxy, config.attachment, { force: true, placementSignature: 'clip-a' });
  const initialLocal = handProxy.root.position.clone();
  const clipLabels = [
    'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
    '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
    'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]',
  ];
  const clipLocalDrifts = [];
  for (const label of clipLabels) {
    syncWeapon(THREE, handActor.scene, handProxy, config.attachment, { placementSignature: label });
    clipLocalDrifts.push({ label, drift: initialLocal.distanceTo(handProxy.root.position) });
  }
  handProxy.rightHand.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, -0.18, 0.27))).normalize();
  handActor.scene.updateMatrixWorld(true);
  syncWeapon(THREE, handActor.scene, handProxy, config.attachment, { placementSignature: 'clip-b' });
  const handFkLocalDrift = initialLocal.distanceTo(handProxy.root.position);
  const handFkRigidDrift = assertRigidUnderDriver(THREE, handActor.scene, handProxy, config.attachment, handProxy.rightHand);

  const tolerance = 0.00001;
  assert(weaponRDrift.hiltDrift <= tolerance && weaponRDrift.tipDrift <= tolerance, `WeaponR FK driver did not preserve hilt/tip local space: ${JSON.stringify(weaponRDrift)}`);
  assert(handFkLocalDrift <= tolerance, `hand-fk socket local transform changed when only the clip signature changed: ${handFkLocalDrift}`);
  assert(clipLocalDrifts.every((entry) => entry.drift <= tolerance), `FK placement changed for a clip label: ${JSON.stringify(clipLocalDrifts)}`);
  assert(handFkRigidDrift.hiltDrift <= tolerance && handFkRigidDrift.tipDrift <= tolerance, `RightHand FK driver did not preserve hilt/tip local space: ${JSON.stringify(handFkRigidDrift)}`);

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({
    checked: 'weapon-fk-driver-invariant',
    weaponRDrift,
    clipLocalDrifts,
    handFkLocalDrift,
    handFkRigidDrift,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
