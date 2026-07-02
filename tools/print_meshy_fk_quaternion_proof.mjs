#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  applyClipPoseAtTime,
  findRuntimeNode,
  fitModelToHeight,
} from '../src/pose-runtime-rules.mjs';
import {
  applyWeaponAttachmentRuntimeRules,
  applyWeaponSocketRuntimeRules,
  weaponPlacementConfigSignature,
} from '../src/weapon-runtime-rules.mjs';
import { buildMeshyFpsVisualIkReadyClip } from '../src/meshy-ready-runtime.mjs';
import { resolvePoseLabActorRuntimeConfig } from '../src/pose-lab-profile-resolver.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clips = [
  {
    key: 'T-pose',
    label: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
    buildOptions: {
      sourceClipName: '0T-Pose',
      sourceRestClip: '0T-Pose',
      timeSourceBone: 'Hand.R',
      dropInitialRestKey: false,
    },
  },
  {
    key: 'Ready',
    label: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
    buildOptions: {},
  },
];

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
  const leftHand = findRuntimeNode(actorRoot, config.proxy.leftHandBone);
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
    config: config.proxy,
    rightHand,
    leftHand,
    syntheticSourceSocket: null,
    model,
    tipMarker,
    attachmentConfig: config.attachment,
    fkPlacementSignature: '',
    fkLocalPosition: null,
    fkLocalQuaternion: null,
  };
}

function findClip(animations, requested) {
  const clean = String(requested || '').replace(/^own:/, '');
  return animations.find((clip) => clip.name === clean)
    || animations.find((clip) => clean.includes(clip.name))
    || animations[0]
    || null;
}

function quatArray(q, digits = 8) {
  const round = (value) => Number(Number(value || 0).toFixed(digits));
  return [round(q.x), round(q.y), round(q.z), round(q.w)];
}

function worldQuat(THREE, object) {
  return object.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function quatAngleDeg(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.dot(b))));
  return Number(((2 * Math.acos(dot) * 180) / Math.PI).toFixed(8));
}

async function sampleClip({ THREE, GLTFLoader, cloneSkinnedObject, config, clipSpec }) {
  const actor = await loadGlb(GLTFLoader, path.join(projectRoot, config.actor.url));
  const weapon = await loadGlb(GLTFLoader, path.join(projectRoot, config.attachment.url));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  fitModelToHeight(THREE, actor.scene, config.actor.targetHeight);

  const proxy = makeProxy(THREE, actor.scene, weapon.scene, config);
  const generated = buildMeshyFpsVisualIkReadyClip(
    THREE,
    cloneSkinnedObject,
    fps.scene,
    actor.scene,
    fps.animations || [],
    {
      clipName: clipSpec.label,
      weaponAttachment: config.attachment,
      ...clipSpec.buildOptions,
    }
  );
  const clip = generated.clip || findClip(actor.animations || [], clipSpec.label);
  const time = 0;

  applyClipPoseAtTime(THREE, actor.scene, clip, time);
  applyWeaponSocketRuntimeRules(THREE, {
    model: actor.scene,
    proxy,
    placementSignature: weaponPlacementConfigSignature(THREE, proxy.config, {
      model: actor.scene,
      parent: proxy.rightHand,
    }),
    force: true,
  });
  applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actor.scene, proxy, config: config.attachment });
  actor.scene.updateMatrixWorld(true);
  proxy.root.updateMatrixWorld(true);
  proxy.displayRoot.updateMatrixWorld(true);
  proxy.model.updateMatrixWorld(true);

  return {
    clip: clipSpec.label,
    generatedClipResolved: Boolean(generated.generatedClipResolved && clip?.name === clipSpec.label),
    rightHandWorldQuaternion: worldQuat(THREE, proxy.rightHand),
    weaponGripLocalQuaternion: proxy.root.quaternion.clone().normalize(),
    sabreMeshLocalQuaternion: proxy.model.quaternion.clone().normalize(),
    sabreWorldQuaternion: worldQuat(THREE, proxy.model),
  };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { clone: cloneSkinnedObject } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'utils', 'SkeletonUtils.js')));
  const config = resolvePoseLabActorRuntimeConfig('meshyCharacter');

  const samples = {};
  for (const clipSpec of clips) {
    samples[clipSpec.key] = await sampleClip({ THREE, GLTFLoader, cloneSkinnedObject, config, clipSpec });
  }

  const rows = {
    'RightHand world quaternion T-pose': quatArray(samples['T-pose'].rightHandWorldQuaternion),
    'RightHand world quaternion Ready': quatArray(samples.Ready.rightHandWorldQuaternion),
    'WeaponGrip socket local quaternion T-pose (weaponProxy.rotationDeg layer)': quatArray(samples['T-pose'].weaponGripLocalQuaternion),
    'WeaponGrip socket local quaternion Ready (weaponProxy.rotationDeg layer)': quatArray(samples.Ready.weaponGripLocalQuaternion),
    'Sabre mesh local quaternion T-pose (weaponAttachment.rotationDeg layer)': quatArray(samples['T-pose'].sabreMeshLocalQuaternion),
    'Sabre mesh local quaternion Ready (weaponAttachment.rotationDeg layer)': quatArray(samples.Ready.sabreMeshLocalQuaternion),
    'Sabre world quaternion T-pose': quatArray(samples['T-pose'].sabreWorldQuaternion),
    'Sabre world quaternion Ready': quatArray(samples.Ready.sabreWorldQuaternion),
  };

  console.log(JSON.stringify({
    checked: 'meshy-fk-quaternion-proof',
    rotationLayerContract: {
      socketLayer: 'weaponProxy.rotationDeg applies to WeaponGrip local quaternion',
      attachmentLayer: 'weaponAttachment.rotationDeg applies to sabre mesh local quaternion under displayRoot',
      weaponProxyRotationDeg: config.proxy.rotationDeg,
      weaponAttachmentRotationDeg: config.attachment.rotationDeg,
    },
    clips: {
      'T-pose': {
        clip: samples['T-pose'].clip,
        generatedClipResolved: samples['T-pose'].generatedClipResolved,
      },
      Ready: {
        clip: samples.Ready.clip,
        generatedClipResolved: samples.Ready.generatedClipResolved,
      },
    },
    rows,
    deltasDeg: {
      rightHandWorld: quatAngleDeg(samples['T-pose'].rightHandWorldQuaternion, samples.Ready.rightHandWorldQuaternion),
      weaponGripLocal: quatAngleDeg(samples['T-pose'].weaponGripLocalQuaternion, samples.Ready.weaponGripLocalQuaternion),
      sabreMeshLocal: quatAngleDeg(samples['T-pose'].sabreMeshLocalQuaternion, samples.Ready.sabreMeshLocalQuaternion),
      sabreWorld: quatAngleDeg(samples['T-pose'].sabreWorldQuaternion, samples.Ready.sabreWorldQuaternion),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
